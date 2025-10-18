Vpower-switch Installation Guide

Vpower-switch is a self-hosted web app to control Windows machines via Wake-on-LAN (WoL) and SSH [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/package.json, sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/server.js]. This guide covers setting up the server and configuring a new Windows 11 PC as a target.

Prerequisites

A server (e.g., a Linux-based machine or Raspberry Pi) to run the Node.js application.

One or more Windows 11 PCs to control.

git and npm (Node.js) installed on your server.

Part 1: Server Setup

These steps are for the machine that will host the web application.

Clone the repository:

git clone [https://github.com/sterance/vpower-switch.git](https://github.com/sterance/vpower-switch.git)
cd vpower-switch


Install all dependencies:
This installs dependencies for both the server and the client [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/package.json].

npm install


Generate a dedicated SSH key:
This key will be used to securely connect to your Windows PCs.

# Press Enter for all prompts to create a key with no passphrase
ssh-keygen -t ed25519 -f ~/.ssh/vpower_key


This creates a private key (vpower_key) and a public key (vpower_key.pub).

Configure the server environment:
Create a .env file in the root of the project. You will need the absolute path to your new private key.

# Get the full path to the private key
readlink -f ~/.ssh/vpower_key


Now, create the .env file and add the path. You can also set custom ports if needed.

# Create the file using a text editor like nano
nano .env


Add the following lines, pasting the path you just copied. The ports are optional and will default to 3000 (backend) and 5173 (dev frontend) [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/server.js, sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/client/vite.config.js].

# .env file content
SSH_KEY_PATH=/home/your_user/.ssh/vpower_key

# Optional:
# BACKEND_PORT=3001
# FRONTEND_PORT=8080


Copy your public key:
Run the command below and copy the entire output (starting with ssh-ed25519...). You will paste this into the Windows PC in the next section.

echo "--- Copy your public key below ---"
cat ~/.ssh/vpower_key.pub
echo "----------------------------------"


Part 2: Target PC Setup (Windows 11)

These steps must be run on each Windows 11 PC you want to control. You must run all PowerShell commands in an Administrator terminal.

1. Network Configuration

Get Network Info:
Identify your primary wired network adapter (e.g., "Ethernet"). Note its Name and MacAddress.

Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Format-List -Property Name, MacAddress


Set Static IP:
This is required for the app to find your PC.

Recommended: Log in to your router and set a DHCP Reservation for the MacAddress you just found.

Alternative (PowerShell): Manually assign a static IP.

# Get your current config first to find the ifIndex and Gateway
Get-NetIPConfiguration

# Example command (replace values):
New-NetIPAddress -InterfaceIndex <ifIndex> -IPAddress <CHOOSE_STATIC_IP> -PrefixLength 24 -DefaultGateway <YOUR_Gateway>
Set-DnsClientServerAddress -InterfaceIndex <ifIndex> -ServerAddresses ("1.1.1.1", "8.8.8.8")


2. Configure Power On (Wake-on-LAN)

Enable WoL in BIOS/UEFI (Manual):

Restart the PC and enter the BIOS/UEFI setup (usually Del or F2).

Find and Enable the "Wake on LAN" or "Power on by PCIe/LAN" setting.

Save and exit.

Enable WoL in Windows (PowerShell):
Replace "Your-Adapter-Name" with your adapter's name from Step 1.

Set-NetAdapterPowerManagement -Name "Your-Adapter-Name" -AllowDeviceToWakeComputer $true
Set-NetAdapterPowerManagement -Name "Your-Adapter-Name" -OnlyAllowMagicPacketToWake $true
Set-NetAdapterAdvancedProperty -Name "Your-Adapter-Name" -DisplayName "Wake on Magic Packet" -RegistryValue "1"


3. Configure Power Off (SSH Server)

Install & Start OpenSSH (PowerShell):

Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service -Name sshd
Set-Service -Name sshd -StartupType 'Automatic'


Authorize your Server's SSH Key (PowerShell):
This grants your server administrator access to run the shutdown command [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/server.js].

$AuthKeysFile = "$env:PROGRAMDATA\ssh\administrators_authorized_keys"

if (-not (Test-Path $AuthKeysFile)) {
  New-Item -ItemType File -Path $AuthKeysFile
}

# Paste the public key you copied from Part 1 inside the quotes
$PublicKey = "PASTE_YOUR_ssh-ed25519_PUBLIC_KEY_HERE"

Add-Content -Path $AuthKeysFile -Value $PublicKey

# Restart the SSH service to apply the new key
Restart-Service -Name sshd


4. Configure Status Check (Firewall)

This allows the server to ping the PC to see if it's online [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/server.js].

Enable-NetFirewallRule -DisplayName "File and Printer Sharing (Echo Request - ICMPv4-In)"


Part 3: Run the Application

Return to your server machine to build and run the app.

Build the Client:
This bundles the React front-end for production [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/package.json].

npm run build:client


Run the Server:
This serves the client and starts the API [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/package.json, sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/server.js].

# Run in production mode
npm run serve:prod


Part 4: Add Your Machine

Open your browser and navigate to your server (e.g., http://<your_server_ip>:3000).

Click the large Add icon in the toolbar [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/client/src/App.jsx].

Fill in the details for your target PC [cite: sterance/vpower-switch/Vpower-switch-e52fa28c3b356dbfe52859f3031bc415b218ecab/client/src/components/AddMachineDialog.jsx]:

Custom Name: Any name (e.g., "Gaming PC").

MAC Address: The MacAddress from Part 2 (e.g., AA-BB-CC-DD-EE-FF).

IP Address: The static IP from Part 2 (e.g., 192.168.1.100).

SSH Username: Your Windows administrator username.

Click add.

Your new machine card will appear and should now be fully controllable.