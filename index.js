const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = 3297;

// Create HTTP server and attach Socket.IO to it
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/vpn-profiles', async (req, res) => {
    try {
        const response = await axios.get('https://vpn.minoa.cat/list.json');
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching VPN profiles:', error);
        res.status(500).send('Error fetching VPN profiles');
    }
});

let openvpnProcess;

// Helper function to get OpenVPN installation instructions based on OS
function getOpenVPNInstallInstructions() {
    const platform = process.platform;
    switch (platform) {
        case 'win32':
            return {
                message: 'OpenVPN is not installed. Please download and install OpenVPN from:',
                link: 'https://openvpn.net/community-downloads/'
            };
        case 'darwin':
            return {
                message: 'OpenVPN is not installed. You can install it using Homebrew:',
                link: 'brew install openvpn'
            };
        case 'linux':
            return {
                message: 'OpenVPN is not installed. You can install it using your package manager:',
                link: 'sudo apt-get install openvpn  # For Ubuntu/Debian\nsudo dnf install openvpn  # For Fedora\nsudo pacman -S openvpn  # For Arch Linux'
            };
        default:
            return {
                message: 'OpenVPN is not installed. Please visit:',
                link: 'https://openvpn.net/community-downloads/'
            };
    }
}

app.post('/connect', async (req, res) => {
    const { profile } = req.body;

    try {
        // Create a temporary file to store the VPN profile
        const tempFile = tmp.fileSync({ postfix: '.ovpn' });
        const response = await axios.get(profile, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempFile.name, response.data);

        // Get platform-specific OpenVPN executable path
        const openvpnPath = process.platform === 'win32' 
            ? path.join(__dirname, 'openvpn.exe')
            : 'openvpn';

        // Connect to the VPN using OpenVPN CLI
        openvpnProcess = spawn(openvpnPath, ['--config', tempFile.name]);

        let hasResponded = false;

        openvpnProcess.on('error', (error) => {
            if (hasResponded) return;
            hasResponded = true;

            if (error.code === 'ENOENT') {
                const instructions = getOpenVPNInstallInstructions();
                io.emit('log', `Error: ${instructions.message}\n${instructions.link}\n`);
                res.status(500).json({
                    error: 'OpenVPN not installed',
                    instructions
                });
            } else {
                io.emit('log', `Error: ${error.message}\nCommand: openvpn\nArguments: --config ${tempFile.name}\n`);
                res.status(500).json({ error: error.message });
            }
        });

        openvpnProcess.stdout.on('data', (data) => {
            const logEntry = data.toString().trim();
            console.log(`[OpenVPN] ${logEntry}`);
            io.emit('log', `${logEntry}\n`);
        });

        openvpnProcess.stderr.on('data', (data) => {
            const errorEntry = data.toString().trim();
            console.error(`[OpenVPN] ${errorEntry}`);
            io.emit('log', `${errorEntry}\n`);
        });

        openvpnProcess.on('exit', (code) => {
            console.log(`VPN disconnected with exit code: ${code}`);
            fs.unlinkSync(tempFile.name);
            openvpnProcess = null;
            io.emit('log', `VPN process exited with code ${code}\n`);
        });

        if (!hasResponded) {
            hasResponded = true;
            res.json({ status: 'connecting', message: `Connecting to ${profile}` });
        }
    } catch (error) {
        console.error(`Error processing VPN profile: ${error.message}`);
        const errorDetails = {
            message: 'Error processing VPN profile',
            profile: profile,
            statusCode: error.response?.status,
            statusText: error.response?.statusText,
            error: error.message
        };
        io.emit('log', `Error: ${errorDetails.message}\nProfile: ${errorDetails.profile}\nStatus: ${errorDetails.statusCode} ${errorDetails.statusText}\nDetails: ${errorDetails.error}\n`);
        res.status(500).json(errorDetails);
    }
});

app.post('/disconnect', (req, res) => {
    if (openvpnProcess) {
        openvpnProcess.kill();
        openvpnProcess = null; // Reset the process variable
        res.json({ status: 'success', message: 'VPN disconnected' });
    } else {
        res.status(400).json({ status: 'error', message: 'No VPN is currently connected' });
    }
});

app.get('/check-connection', (req, res) => {
    res.json({ status: openvpnProcess ? 'connected' : 'disconnected' });
});

server.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
