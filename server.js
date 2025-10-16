require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { Client } = require('ssh2');
const wol = require('wake_on_lan');
const ping = require('ping');
const net = require('net');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const MACHINES_FILE = path.join(__dirname, 'machines.json');
const SSH_PRIVATE_KEY_PATH = process.env.SSH_KEY_PATH;

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
function shutdownMachine(ip, username) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const keyPath = SSH_PRIVATE_KEY_PATH;
    console.log(`[poweroff] initiating ssh to ${ip} as ${username} using key at ${keyPath || 'N/A'}`);
    
    conn.on('ready', () => {
      console.log(`[poweroff] ssh ready for ${ip}, executing shutdown command`);
      conn.exec('shutdown /s /t 0', (err, stream) => {
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
      reject(err);
    });
    
    if (!SSH_PRIVATE_KEY_PATH) {
      console.error('[poweroff] missing SSH_KEY_PATH env; cannot authenticate');
      reject(new Error('ssh private key path not configured. set SSH_KEY_PATH in .env'));
      return;
    }

    console.log(`[poweroff] connecting via ssh to ${ip}...`);
    conn.connect({
      host: ip,
      username: username,
      privateKey: require('fs').readFileSync(SSH_PRIVATE_KEY_PATH)
    });
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
      return res.status(400).json({ error: 'missing required fields', missing });
    }
    
    const machines = await loadMachines();
    const newMachine = {
      id: uuidv4(),
      name: nameT,
      mac: macT,
      ip: ipT,
      sshUser: sshUserT
    };
    
    machines.push(newMachine);
    await saveMachines(machines);
    
    res.json(newMachine);
  } catch (error) {
    console.error('error adding machine:', error);
    res.status(500).json({ error: 'failed to add machine' });
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
    
    console.log(`[api] attempting poweroff: name=${machine.name} ip=${machine.ip} user=${machine.sshUser}`);
    await shutdownMachine(machine.ip, machine.sshUser);
    console.log(`[api] poweroff success for ${machine.ip}`);
    res.json({ success: true });
  } catch (error) {
    console.error('error shutting down machine:', error);
    res.status(500).json({ error: 'failed to shutdown machine', details: error?.message || String(error) });
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

