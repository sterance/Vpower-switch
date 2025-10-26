require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { Client } = require('ssh2');
const wol = require('wake_on_lan');
const ping = require('ping');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;
const MACHINES_FILE = path.join(__dirname, 'machines.json');
const SSH_PRIVATE_KEY_PATH = process.env.SSH_KEY_PATH;

// validate ssh configuration at startup
function validateSSHConfig() {
  if (!SSH_PRIVATE_KEY_PATH) {
    console.warn('[startup] SSH_KEY_PATH not configured - shutdown will not work');
    return;
  }
  
  try {
    const fs = require('fs');
    const stats = fs.statSync(SSH_PRIVATE_KEY_PATH);
    console.log(`[startup] SSH key found: ${SSH_PRIVATE_KEY_PATH} (${stats.size} bytes)`);
    
    // check file permissions (should be 600)
    const mode = stats.mode & parseInt('777', 8);
    if (mode !== parseInt('600', 8)) {
      console.warn(`[startup] SSH key permissions are ${mode.toString(8)} (should be 600)`);
    }
    
    // try to read the key to validate format
    const keyContent = fs.readFileSync(SSH_PRIVATE_KEY_PATH, 'utf8');
    if (!keyContent.includes('BEGIN') || !keyContent.includes('PRIVATE KEY')) {
      console.warn('[startup] SSH key format may be invalid - missing PEM headers');
    } else {
      console.log('[startup] SSH key format appears valid');
    }
  } catch (error) {
    console.error(`[startup] SSH key validation failed: ${error.message}`);
  }
}

// validate ssh config on startup
validateSSHConfig();

// middleware
app.use(express.json());

// static assets
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientDist));
} else {
  app.use(express.static('public'));
}

// load machines from file
async function loadMachines() {
  try {
    const data = await fs.readFile(MACHINES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// save machines to file
async function saveMachines(machines) {
  await fs.writeFile(MACHINES_FILE, JSON.stringify(machines, null, 2));
}

// check if machine is online (ping + port check)
async function checkMachineStatus(ip) {
  try {
    // try ping first
    const pingResult = await ping.promise.probe(ip, {
      timeout: 3,
      extra: ['-c', '1']
    });
    
    if (pingResult.alive) {
      return { online: true, method: 'ping' };
    }
  } catch (error) {
    // ping failed, try port check
  }

  // try tcp port 445 (smb)
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 3000;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve({ online: true, method: 'tcp' });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ online: false, method: 'timeout' });
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve({ online: false, method: 'error' });
    });
    
    socket.connect(445, ip);
  });
}

// send wake on lan packet
function wakeMachine(mac) {
  return new Promise((resolve, reject) => {
    wol.wake(mac, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// shutdown machine via ssh
function shutdownMachine(ip, username, os) {
  return new Promise((resolve, reject) => {
    // determine shutdown command based on os
    let shutdownCmd;
    switch (os) {
      case 'windows':
        shutdownCmd = 'shutdown /s /t 0';
        break;
      case 'linux':
        shutdownCmd = 'sudo shutdown -h now';
        break;
      default:
        reject(new Error(`unsupported os type: ${os}. supported types: windows, linux`));
        return;
    }
    
    const conn = new Client();
    const keyPath = SSH_PRIVATE_KEY_PATH;
    console.log(`[poweroff] initiating ssh to ${ip} as ${username} using key at ${keyPath || 'N/A'}`);
    
    conn.on('ready', () => {
      console.log(`[poweroff] ssh ready for ${ip}, executing shutdown command: ${shutdownCmd}`);
      conn.exec(shutdownCmd, (err, stream) => {
        if (err) {
          console.error(`[poweroff] exec error for ${ip}:`, err);
          conn.end();
          reject(err);
          return;
        }
        
        stream.on('close', () => {
          console.log(`[poweroff] ssh stream closed for ${ip}`);
          conn.end();
          resolve();
        });
        
        stream.stderr.on('data', (data) => {
          console.error(`[poweroff] ssh stderr from ${ip}:`, data.toString());
        });

        stream.on('data', (data) => {
          const out = data?.toString?.() ?? String(data);
          if (out && out.trim()) console.log(`[poweroff] ssh stdout from ${ip}:`, out.trim());
        });

        stream.on('exit', (code, signal) => {
          console.log(`[poweroff] ssh command exit for ${ip}: code=${code} signal=${signal || 'none'}`);
        });
      });
    });
    
    conn.on('error', (err) => {
      console.error(`[poweroff] ssh connection error for ${ip}:`, err);
      
      if (err.message.includes('All configured authentication methods failed')) {
        console.error(`[poweroff] Authentication failed for ${ip}. Possible causes:`);
        console.error(`[poweroff] - SSH key not authorized on target machine`);
        console.error(`[poweroff] - Wrong username (trying: ${username})`);
        console.error(`[poweroff] - SSH server not running or not configured`);
        console.error(`[poweroff] - Key format incompatible with target SSH server`);
      } else if (err.message.includes('ECONNREFUSED')) {
        console.error(`[poweroff] Connection refused to ${ip}:22 - SSH server may not be running`);
      } else if (err.message.includes('ETIMEDOUT')) {
        console.error(`[poweroff] Connection timeout to ${ip}:22 - network or firewall issue`);
      }
      
      reject(err);
    });
    
    if (!SSH_PRIVATE_KEY_PATH) {
      console.error('[poweroff] missing SSH_KEY_PATH env; cannot authenticate');
      reject(new Error('ssh private key path not configured. set SSH_KEY_PATH in .env'));
      return;
    }

    console.log(`[poweroff] connecting via ssh to ${ip}...`);
    
    let privateKey;
    try {
      // first try reading as utf8 (most common)
      privateKey = require('fs').readFileSync(SSH_PRIVATE_KEY_PATH, 'utf8');
      console.log(`[poweroff] read SSH key as UTF8 for ${ip}`);
    } catch (error) {
      try {
        // fallback to binary reading
        privateKey = require('fs').readFileSync(SSH_PRIVATE_KEY_PATH);
        console.log(`[poweroff] read SSH key as binary for ${ip}`);
      } catch (fallbackError) {
        console.error(`[poweroff] failed to read SSH key for ${ip}:`, fallbackError.message);
        reject(new Error(`cannot read SSH key: ${fallbackError.message}`));
        return;
      }
    }
    
    // add debug logging and connection options for better compatibility
    const connectionOptions = {
      host: ip,
      username: username,
      privateKey: privateKey,
      debug: (info) => console.log(`[poweroff] ssh debug for ${ip}:`, info),
      algorithms: {
        serverHostKey: ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256'],
        kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr']
      },
      readyTimeout: 20000,
      keepaliveInterval: 10000
    };
    
    conn.connect(connectionOptions);
  });
}

// scan local network for machines
async function scanNetwork() {
  try {
    console.log('[scan] starting network scan...');
    const results = [];
    
    // get arp table
    const { stdout: arpOutput } = await execAsync('arp -a');
    console.log('[scan] arp table retrieved');
    
    // parse arp table to get ip/mac mappings
    const arpLines = arpOutput.split('\n');
    const devices = [];
    
    for (const line of arpLines) {
      // match ip and mac address patterns
      const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
      const macMatch = line.match(/([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})/);
      
      if (ipMatch && macMatch) {
        const ip = ipMatch[1];
        const mac = macMatch[0].toUpperCase().replace(/-/g, ':');
        
        // skip localhost and broadcast
        if (ip === '127.0.0.1' || ip.endsWith('.255') || mac === '00:00:00:00:00:00') {
          continue;
        }
        
        devices.push({ ip, mac });
      }
    }
    
    console.log(`[scan] found ${devices.length} devices in arp table`);
    
    // check each device for os type
    for (const device of devices) {
      try {
        console.log(`[scan] Checking device ${device.ip} (${device.mac})`);
        const os = await detectOS(device.ip);
        console.log(`[scan] Device ${device.ip} detected as: ${os}`);
        
        if (os !== 'unknown') {
          // try to get hostname
          let hostname = null;
          try {
            const { stdout } = await execAsync(`ping -c 1 -W 1 ${device.ip}`);
            const hostnameMatch = stdout.match(/from\s+([^\s(]+)/);
            if (hostnameMatch && hostnameMatch[1] !== device.ip) {
              hostname = hostnameMatch[1];
            }
          } catch (e) {
            // hostname resolution failed
          }
          
          console.log(`[scan] Adding device ${device.ip} to results: ${os} (hostname: ${hostname || 'unknown'})`);
          results.push({
            ip: device.ip,
            mac: device.mac,
            hostname: hostname,
            os: os
          });
        } else {
          console.log(`[scan] Skipping device ${device.ip} - OS detection failed`);
        }
      } catch (e) {
        console.log(`[scan] Error checking device ${device.ip}:`, e.message);
        // device check failed, skip
      }
    }
    
    console.log(`[scan] found ${results.length} machines (windows/linux)`);
    return results;
  } catch (error) {
    console.error('[scan] network scan error:', error);
    throw error;
  }
}

// detect operating system by checking multiple ports and services
async function detectOS(ip) {
  console.log(`[detectOS] Starting OS detection for ${ip}`);
  
  // check multiple ports to better distinguish between OS types
  const portChecks = await Promise.all([
    checkPort(ip, 22, 2000),   // SSH (Linux/Unix)
    checkPort(ip, 445, 2000),  // SMB (Windows/Linux with Samba)
    checkPort(ip, 135, 2000),  // RPC (Windows)
    checkPort(ip, 139, 2000),  // NetBIOS (Windows)
    checkPort(ip, 3389, 2000), // RDP (Windows)
    checkPort(ip, 80, 2000),   // HTTP (both, but helps with detection)
    checkPort(ip, 443, 2000)   // HTTPS (both, but helps with detection)
  ]);
  
  const [ssh, smb, rpc, netbios, rdp, http, https] = portChecks;
  
  console.log(`[detectOS] Port scan results for ${ip}: SSH:${ssh}, SMB:${smb}, RPC:${rpc}, NetBIOS:${netbios}, RDP:${rdp}, HTTP:${http}, HTTPS:${https}`);
  
  // decision logic (prioritized):
  // 1. SSH + no RPC = almost certainly Linux (SSH is rare on Windows)
  // 2. RPC present = definitely Windows (MSRPC port 135 is Windows-specific)
  // 3. RDP + no SSH = Windows
  // 4. Only SMB/NetBIOS + no SSH = might be Windows or NAS
  // 5. SMB + SSH = Linux with Samba
  
  if (ssh && !rpc) {
    // SSH without Windows RPC is a strong Linux indicator
    console.log(`[detectOS] Detected Linux for ${ip} (SSH present, no Windows RPC)`);
    return 'linux';
  } else if (rpc) {
    // RPC port 135 is definitively Windows
    console.log(`[detectOS] Detected Windows for ${ip} (Windows RPC port 135 detected)`);
    return 'windows';
  } else if (rdp && !ssh) {
    // RDP without SSH is Windows
    console.log(`[detectOS] Detected Windows for ${ip} (RDP present, no SSH)`);
    return 'windows';
  } else if (smb || netbios) {
    // SMB or NetBIOS without SSH could be Windows or NAS, assume Windows
    console.log(`[detectOS] Detected Windows for ${ip} (SMB/NetBIOS present, no SSH)`);
    return 'windows';
  }
  
  console.log(`[detectOS] Could not detect OS for ${ip} (no recognizable service ports)`);
  return 'unknown';
}

// check if specific port is open on host
function checkPort(ip, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

// api routes
app.get('/api/machines', async (req, res) => {
  try {
    const machines = await loadMachines();
    res.json(machines);
  } catch (error) {
    console.error('error loading machines:', error);
    res.status(500).json({ error: 'failed to load machines' });
  }
});

app.post('/api/machines', async (req, res) => {
  try {
    console.log(`[api] POST /api/machines - Received request body:`, JSON.stringify(req.body, null, 2));
    const { name, mac, ip, sshUser } = req.body;

    const nameT = (name ?? '').trim();
    const macT = (mac ?? '').trim();
    const ipT = (ip ?? '').trim();
    const sshUserT = (sshUser ?? '').trim();

    const missing = [];
    if (!nameT) missing.push('name');
    if (!macT) missing.push('mac');
    if (!ipT) missing.push('ip');
    if (!sshUserT) missing.push('sshUser');

    if (missing.length > 0) {
      console.error(`[api] POST /api/machines - Validation failed: missing required fields. Missing: [${missing.join(', ')}]`);
      return res.status(400).json({ error: 'missing required fields', missing });
    }
    
    // detect os by checking ports
    console.log(`[api] POST /api/machines - Detecting OS for IP: ${ipT}`);
    const detectedOS = await detectOS(ipT);
    
    if (detectedOS === 'unknown') {
      console.error(`[api] POST /api/machines - OS detection failed for ${ipT}`);
      return res.status(400).json({ 
        error: 'failed to detect supported OS', 
        details: 'machine not found or not running Windows (port 445) or Linux (port 22)',
        ip: ipT
      });
    }
    
    console.log(`[api] POST /api/machines - Detected OS: ${detectedOS} for IP: ${ipT}`);
    
    const machines = await loadMachines();
    const newMachine = {
      id: uuidv4(),
      name: nameT,
      mac: macT,
      ip: ipT,
      sshUser: sshUserT,
      os: detectedOS
    };
    
    machines.push(newMachine);
    await saveMachines(machines);
    
    console.log(`[api] POST /api/machines - Successfully added new machine: ${newMachine.name} (ID: ${newMachine.id}) with OS: ${detectedOS}`);
    res.json(newMachine);
  } catch (error) {
    console.error('[api] POST /api/machines - Internal server error:', error);
    res.status(500).json({ error: 'failed to add machine', details: error?.message || String(error) });
  }
});

app.delete('/api/machines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const machines = await loadMachines();
    const filteredMachines = machines.filter(m => m.id !== id);
    
    if (filteredMachines.length === machines.length) {
      return res.status(404).json({ error: 'machine not found' });
    }
    
    await saveMachines(filteredMachines);
    res.json({ success: true });
  } catch (error) {
    console.error('error deleting machine:', error);
    res.status(500).json({ error: 'failed to delete machine' });
  }
});

app.get('/api/machines/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const machines = await loadMachines();
    const machine = machines.find(m => m.id === id);
    
    if (!machine) {
      return res.status(404).json({ error: 'machine not found' });
    }
    
    const status = await checkMachineStatus(machine.ip);
    res.json(status);
  } catch (error) {
    console.error('error checking machine status:', error);
    res.status(500).json({ error: 'failed to check machine status' });
  }
});

app.post('/api/machines/:id/poweron', async (req, res) => {
  try {
    const { id } = req.params;
    const machines = await loadMachines();
    const machine = machines.find(m => m.id === id);
    
    if (!machine) {
      return res.status(404).json({ error: 'machine not found' });
    }
    
    await wakeMachine(machine.mac);
    res.json({ success: true });
  } catch (error) {
    console.error('error waking machine:', error);
    res.status(500).json({ error: 'failed to wake machine' });
  }
});

app.post('/api/machines/:id/poweroff', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[api] POST /api/machines/${id}/poweroff`);
    const machines = await loadMachines();
    const machine = machines.find(m => m.id === id);
    
    if (!machine) {
      console.warn(`[api] poweroff failed: machine ${id} not found`);
      return res.status(404).json({ error: 'machine not found' });
    }
    
    console.log(`[api] attempting poweroff: name=${machine.name} ip=${machine.ip} user=${machine.sshUser} os=${machine.os}`);
    await shutdownMachine(machine.ip, machine.sshUser, machine.os);
    console.log(`[api] poweroff success for ${machine.ip}`);
    res.json({ success: true });
  } catch (error) {
    console.error('error shutting down machine:', error);
    res.status(500).json({ error: 'failed to shutdown machine', details: error?.message || String(error) });
  }
});

app.get('/api/scan', async (req, res) => {
  try {
    console.log('[api] GET /api/scan - starting network scan');
    const devices = await scanNetwork();
    res.json(devices);
  } catch (error) {
    console.error('error scanning network:', error);
    res.status(500).json({ error: 'failed to scan network', details: error?.message || String(error) });
  }
});

// serve frontend (spa fallback in production)
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client', 'dist');
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});

