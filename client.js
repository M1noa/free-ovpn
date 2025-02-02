// Socket.IO instance for real-time logs
const socket = io();

// UI Elements
const serverList = document.querySelector('.server-list');
const statusIcon = document.querySelector('.status-icon');
const statusTitle = document.querySelector('.status-info h2');
const statusText = document.querySelector('.status-info p');
const connectBtn = document.querySelector('.connect-btn');
const logContent = document.querySelector('.log-content');

// State
let selectedServer = null;
let isConnected = false;

// Global variable to store all profiles
let allProfiles = [];

// Fetch VPN profiles
async function fetchVPNProfiles() {
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.classList.add('active');
    
    try {
        const response = await fetch('/vpn-profiles');
        allProfiles = await response.json();
        displayProfiles(allProfiles);
    } catch (error) {
        console.error('Error fetching VPN profiles:', error);
        logContent.textContent += `Error: Could not fetch VPN profiles\n`;
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

// Display profiles in the sidebar
function displayProfiles(profiles) {
    serverList.innerHTML = '';
    profiles.forEach((profile, index) => {
        const serverItem = document.createElement('div');
        serverItem.className = 'server-item';
        serverItem.innerHTML = `
            <div class="server-name">${profile.country}</div>
            <div class="server-info">
                <div>Uptime: ${profile.uptime}</div>
                <div>Ping: ${profile.ping}</div>
                <div>IP: ${profile.ip || 'N/A'}</div>
                <div>Profile: ${profile.ovpnLinks[0].split('/').pop()}</div>
            </div>
        `;

        serverItem.addEventListener('click', () => {
            document.querySelectorAll('.server-item').forEach(item => {
                item.style.background = 'rgba(255, 255, 255, 0.05)';
            });
            serverItem.style.background = 'rgba(255, 255, 255, 0.15)';
            selectedServer = profile.ovpnLinks[0];
            updateStatus('ready');
        });

        serverList.appendChild(serverItem);
    });
}

// Update UI status
function updateStatus(state) {
    switch (state) {
        case 'connected':
            statusIcon.innerHTML = '🔒';
            statusTitle.textContent = 'Connected';
            statusText.textContent = 'VPN connection is active';
            connectBtn.textContent = 'Disconnect';
            isConnected = true;
            break;
        case 'disconnected':
            statusIcon.innerHTML = '🔓';
            statusTitle.textContent = 'Not Connected';
            statusText.textContent = 'Select a server to connect';
            connectBtn.textContent = 'Connect';
            isConnected = false;
            break;
        case 'ready':
            statusIcon.innerHTML = '🔓';
            statusTitle.textContent = 'Ready';
            statusText.textContent = 'Click Connect to start VPN';
            connectBtn.textContent = 'Connect';
            isConnected = false;
            break;
        case 'connecting':
            statusIcon.innerHTML = '⏳';
            statusTitle.textContent = 'Connecting...';
            statusText.textContent = 'Please wait';
            connectBtn.disabled = true;
            break;
    }
}

// Handle connection/disconnection
async function toggleConnection() {
    if (!selectedServer && !isConnected) {
        alert('Please select a server first');
        return;
    }

    if (isConnected) {
        try {
            const response = await fetch('/disconnect', { method: 'POST' });
            if (response.ok) {
                updateStatus('disconnected');
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            logContent.textContent += `Error: Could not disconnect from VPN - ${error.message}\n`;
        }
    } else {
        try {
            updateStatus('connecting');
            const profileName = selectedServer.split('/').pop();
            logContent.textContent += `Connecting to profile: ${profileName}\n`;
            
            const response = await fetch('/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: selectedServer })
            });
            
            if (response.ok) {
                updateStatus('connected');
            } else {
                const error = await response.json();
                if (error.instructions) {
                    logContent.textContent += `${error.instructions.message}\n${error.instructions.link}\n`;
                } else {
                    logContent.textContent += `Failed to connect: ${error.error}\nProfile: ${profileName}\nURL: ${selectedServer}\n`;
                }
                updateStatus('disconnected');
            }
        } catch (error) {
            console.error('Error connecting:', error);
            logContent.textContent += `Error: Could not connect to VPN\nProfile: ${selectedServer.split('/').pop()}\nError details: ${error.message}\n`;
            updateStatus('disconnected');
        }
        connectBtn.disabled = false;
    }
}

// Socket.IO event handlers for real-time logs
socket.on('log', (message) => {
    logContent.textContent += message;
    logContent.scrollTop = logContent.scrollHeight;
});

// Search functionality
const searchInput = document.querySelector('.search-input');
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProfiles = allProfiles.filter(profile => 
        profile.country.toLowerCase().includes(searchTerm) ||
        profile.uptime.toLowerCase().includes(searchTerm) ||
        profile.ping.toLowerCase().includes(searchTerm)
    );
    displayProfiles(filteredProfiles);
});

// Event listeners
connectBtn.addEventListener('click', toggleConnection);

// Check initial connection status
fetch('/check-connection')
    .then(response => response.text())
    .then(status => {
        updateStatus(status === 'connected' ? 'connected' : 'disconnected');
    });

// Initial load
fetchVPNProfiles();