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
function shutdownMachine(ip, username, keyPath) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      conn.exec('shutdown /s /t 0', (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        
        stream.on('close', () => {
          conn.end();
          resolve();
        });
        
        stream.stderr.on('data', (data) => {
          console.error('ssh stderr:', data.toString());
        });
      });
    });
    
    conn.on('error', (err) => {
      reject(err);
    });
    
    conn.connect({
      host: ip,
      username: username,
      privateKey: require('fs').readFileSync(keyPath)
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
    const { name, mac, ip, sshUser, sshKeyPath } = req.body;
    
    if (!name || !mac || !ip || !sshUser || !sshKeyPath) {
      return res.status(400).json({ error: 'missing required fields' });
    }
    
    const machines = await loadMachines();
    const newMachine = {
      id: uuidv4(),
      name,
      mac,
      ip,
      sshUser,
      sshKeyPath
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
    const machines = await loadMachines();
    const machine = machines.find(m => m.id === id);
    
    if (!machine) {
      return res.status(404).json({ error: 'machine not found' });
    }
    
    await shutdownMachine(machine.ip, machine.sshUser, machine.sshKeyPath);
    res.json({ success: true });
  } catch (error) {
    console.error('error shutting down machine:', error);
    res.status(500).json({ error: 'failed to shutdown machine' });
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

