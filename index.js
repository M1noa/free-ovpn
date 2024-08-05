const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.post('/connect', async (req, res) => {
    const { profile } = req.body;

    try {
        // Create a temporary file to store the VPN profile
        const tempFile = tmp.fileSync({ postfix: '.ovpn' });
        const response = await axios.get(profile, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempFile.name, response.data);

        // Connect to the VPN using OpenVPN CLI
        openvpnProcess = spawn('openvpn', ['--config', tempFile.name]);

        openvpnProcess.stdout.on('data', (data) => {
            const logEntry = data.toString();
            console.log(`[OpenVPN STDOUT] ${new Date().toISOString()}: ${logEntry}`);
            io.emit('log', logEntry); // Emit log to the client
        });

        openvpnProcess.stderr.on('data', (data) => {
            const errorEntry = data.toString();
            console.error(`[OpenVPN STDERR] ${new Date().toISOString()}: ${errorEntry}`);
            io.emit('log', errorEntry); // Emit error to the client
        });

        openvpnProcess.on('exit', (code) => {
            console.log(`VPN disconnected with exit code: ${code}`);
            fs.unlinkSync(tempFile.name);
            openvpnProcess = null; // Reset the process variable
            io.emit('log', 'VPN disconnected\n'); // Notify client
        });

        res.send(`Connecting to ${profile} :P`);
    } catch (error) {
        console.error(`Error processing VPN profile: ${error.message}`);
        res.status(500).send('Error processing VPN profile');
    }
});

app.post('/disconnect', (req, res) => {
    if (openvpnProcess) {
        openvpnProcess.kill();
        openvpnProcess = null; // Reset the process variable
        res.send('VPN disconnected');
    } else {
        res.status(400).send('No VPN is currently connected');
    }
});

app.get('/check-connection', (req, res) => {
    res.send(openvpnProcess ? 'connected' : 'disconnected');
});

// Start the HTTP server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
