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
        const isCloudflareProtected = profile.ovpnLinks[0].includes('ipspeed');
        serverItem.innerHTML = `
            <div class="server-name">${profile.country}</div>
            <div class="server-info">
                <div>Uptime: ${profile.uptime}</div>
                <div>Ping: ${profile.ping}</div>
                <div>${profile.ovpnLinks[0].split('/').pop()}</div>
                ${isCloudflareProtected ? '<div class="warning">⚠️ This server is Cloudflare-protected and may fail to download</div>' : ''}
            </div>
        `;

        serverItem.addEventListener('click', () => {
            if (isConnected) {
                if (!confirm('You are currently connected to a VPN. Do you want to switch to a different server?')) {
                    return;
                }
                // Disconnect first before switching
                fetch('/disconnect', { method: 'POST' })
                    .then(() => {
                        selectServer(serverItem, profile);
                    })
                    .catch(error => {
                        console.error('Error disconnecting:', error);
                        logContent.textContent += `Error: Could not disconnect from current VPN - ${error.message}\n`;
                    });
            } else {
                selectServer(serverItem, profile);
            }
        });

        serverList.appendChild(serverItem);
    });
}

function selectServer(serverItem, profile) {
    document.querySelectorAll('.server-item').forEach(item => {
        item.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    serverItem.style.background = 'rgba(255, 255, 255, 0.15)';
    selectedServer = profile.ovpnLinks[0];
    const isCloudflareProtected = profile.ovpnLinks[0].includes('ipspeed');
    updateStatus('ready', isCloudflareProtected);
}

// Update UI status
function updateStatus(state, isCloudflareProtected = false) {
    switch (state) {
        case 'connected':
            statusIcon.innerHTML = '🔒';
            statusTitle.textContent = 'Connected';
            statusText.textContent = `VPN connection is active\n\nServer: ${selectedServer.split('/').pop()}`;
            connectBtn.textContent = 'Disconnect';
            connectBtn.disabled = false;
            isConnected = true;
            break;
        case 'disconnected':
            statusIcon.innerHTML = '🔓';
            statusTitle.textContent = 'Not Connected';
            statusText.textContent = 'Select a server to connect';
            connectBtn.textContent = 'Connect';
            connectBtn.disabled = !selectedServer;
            isConnected = false;
            break;
        case 'ready':
            statusIcon.innerHTML = '⚡';
            statusTitle.textContent = 'Ready to Connect';
            statusText.textContent = `Selected Server: ${selectedServer.split('/').pop()}\nDownload URL: ${selectedServer}${isCloudflareProtected ? '\n\n⚠️ Note: This server is Cloudflare-protected and may fail to download' : ''}`;
            connectBtn.textContent = 'Connect';
            connectBtn.disabled = false;
            isConnected = false;
            break;
        case 'connecting':
            statusIcon.innerHTML = '🔄';
            statusTitle.textContent = 'Connecting...';
            statusText.textContent = `Attempting to connect to:\n${selectedServer}`;
            connectBtn.disabled = true;
            break;
        case 'error':
            statusIcon.innerHTML = '❌';
            statusTitle.textContent = 'Connection Error';
            statusText.textContent = `Failed to connect to:\n${selectedServer}\n\nPlease try another server or check your connection.`;
            connectBtn.textContent = 'Retry';
            connectBtn.disabled = false;
            isConnected = false;
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
            updateStatus('connecting');
            const response = await fetch('/disconnect', { method: 'POST' });
            if (response.ok) {
                updateStatus('disconnected');
                logContent.textContent += 'Successfully disconnected from VPN\n';
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            logContent.textContent += `Error: Could not disconnect from VPN - ${error.message}\n`;
            updateStatus('error');
        }
    } else {
        try {
            updateStatus('connecting');
            const profileName = selectedServer.split('/').pop();
            logContent.textContent += `\nAttempting to connect to profile: ${profileName}\n`;
            
            const response = await fetch('/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: selectedServer })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                updateStatus('connected');
                logContent.textContent += `Successfully connected to ${profileName}\n`;
            } else {
                if (data.error === 'OpenVPN not installed' && data.instructions) {
                    logContent.textContent += `Error: OpenVPN is not installed\n${data.instructions.message}\nInstallation command: ${data.instructions.link}\n`;
                    updateStatus('error');
                } else {
                    logContent.textContent += `Failed to connect: ${data.error || 'Unknown error'}\nProfile: ${profileName}\nURL: ${selectedServer}\n`;
                    updateStatus('error');
                }
            }
        } catch (error) {
            console.error('Error connecting:', error);
            logContent.textContent += `Error: Could not connect to VPN\nProfile: ${selectedServer.split('/').pop()}\nError details: ${error.message}\n`;
            updateStatus('error');
        }
    }
}

// Socket.IO event handlers for real-time logs
socket.on('log', (message) => {
    // Preserve whitespace and line breaks
    const formattedMessage = message.replace(/\n/g, '<br>');
    logContent.innerHTML += `<span class="log-entry">${formattedMessage}</span>`;
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