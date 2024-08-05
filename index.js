const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config();

const app = express();

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
            const uptime = $(rows[i + 2]).text().trim();
            const ping = $(rows[i + 3]).text().trim();

            // Extracting all OVPN links for the current location
            const links = [];
            ovpnLinks.each((index, link) => {
                const ovpnLink = `https://ipspeed.info${$(link).attr('href')}`; // Complete link
                links.push(ovpnLink);
            });

            if (location && links.length > 0) { // Only add if location and links exist
                newData.push({
                    country: location,
                    ovpnLinks: links, // List of all OVPN links
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

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Express endpoint to serve the JSON data
app.get('/ipspeed.json', async (req, res) => {
    console.log('Received request for /ipspeed.json');

    // Fetch new VPN data for every request
    vpnData = await fetchVPNData();

    // Serve the current VPN data
    res.json(vpnData);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
});
