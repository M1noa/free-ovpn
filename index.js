const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config();

const app = express();
const PORT = 3000;
const GITHUB_REPO = 'M1noa/free-ovpn';
const GITHUB_BRANCH = 'vpn-list-api';
const GITHUB_FILE_PATH = 'ipspeed.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let requestCount = 0;
let vpnData = [];

// Function to fetch VPN data from the website
const fetchVPNData = async () => {
    try {
        console.log('Requesting HTML from the VPN site...');
        const response = await axios.get('https://ipspeed.info/freevpn_openvpn.php?language=en');
        console.log('HTML response received.');

        const html = response.data;
        console.log('HTML Content:', html); // Log the raw HTML content for debugging

        const $ = cheerio.load(html);
        const newData = [];
        
        // Parsing logic
        const rows = $('.area .list').parent().children('.list'); // Get all the list items
        for (let i = 0; i < rows.length; i += 4) { // Each entry has 4 elements
            const location = $(rows[i]).text().trim();
            const ovpnLinks = $(rows[i + 1]).find('a'); // Find all <a> elements for OVPN links
            const ovpnLink = ovpnLinks.length > 0 ? `https://ipspeed.info${$(ovpnLinks[0]).attr('href')}` : null; // Get first link
            const uptime = $(rows[i + 2]).text().trim();
            const ping = $(rows[i + 3]).text().trim();

            if (location && ovpnLink) { // Only add if location and link exist
                newData.push({
                    country: location,
                    ovpnProfile: ovpnLink.split('/').pop(),
                    ovpnLink,
                    uptime,
                    ping,
                });
            }
        }

        console.log(`Parsed VPN data: ${JSON.stringify(newData, null, 2)}`);
        return newData;
    } catch (error) {
        console.error('Error fetching VPN data:', error);
        return [];
    }
};

// Function to update GitHub file with the VPN data
const updateGitHubFile = async (data) => {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    try {
        console.log('Updating GitHub file...');
        const response = await octokit.repos.getContent({
            owner: 'M1noa',
            repo: 'free-ovpn',
            path: GITHUB_FILE_PATH,
            ref: GITHUB_BRANCH,
        });

        const sha = response.data.sha;

        await octokit.repos.createOrUpdateFileContents({
            owner: 'M1noa',
            repo: 'free-ovpn',
            path: GITHUB_FILE_PATH,
            message: 'Update VPN list',
            content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
            sha,
            branch: GITHUB_BRANCH,
        });

        console.log('VPN data updated successfully on GitHub!');
    } catch (error) {
        console.error('Error updating GitHub file:', error);
    }
};

// Function to initialize the VPN data on startup
const initializeVPNData = async () => {
    console.log('Fetching initial VPN data...');
    vpnData = await fetchVPNData();
    await updateGitHubFile(vpnData);
};

// Express endpoint to serve the JSON data
app.get('/ipspeed.json', async (req, res) => {
    requestCount++;

    console.log(`Received request #${requestCount} for /ipspeed.json`);

    // Check if we need to fetch new VPN data and update GitHub
    if (requestCount % 30 === 0) {
        console.log('Fetching new VPN data due to request count.');
        vpnData = await fetchVPNData();
        await updateGitHubFile(vpnData);
    }

    // Serve the current VPN data
    res.json(vpnData);
});

// Start the Express server
app.listen(PORT, async () => {
    await initializeVPNData(); // Fetch and update VPN data on startup
    console.log(`Server is running on http://localhost:${PORT}`);
});
