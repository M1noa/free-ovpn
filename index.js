const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config();

const app = express();

let vpnData = [];

// Function to fetch VPN data from the website
const fetchVPNData = async () => {
    const maxRetries = 10;
    const baseDelay = 15;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt + 1} of ${maxRetries}`);
            const response = await axios.get('https://ipspeed.info/freevpn_openvpn.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'Cookie': 'IPSpeed_lang=en'
                },
                timeout: 10000,
                maxRedirects: 10,
                followRedirect: true,
                validateStatus: function (status) {
                    return status >= 200 && status < 400;
                }
            });
            console.log(`Response received with status: ${response.status}`);
            if (response.request?.res?.responseUrl) {
                console.log(`Final URL after redirects: ${response.request.res.responseUrl}`);
            }
            console.log('HTML response received.');

            const html = response.data;
            if (!html || typeof html !== 'string' || html.trim().length === 0) {
                throw new Error('Empty or invalid HTML response');
            }

            console.log('Starting HTML parsing...');
            const $ = cheerio.load(html);
            const newData = [];

            const totalDivs = $('div.list').length;
            console.log(`Total div.list elements found: ${totalDivs}`);

            if (totalDivs === 0) {
                throw new Error('No VPN data elements found in the response');
            }

            $('div.list').each(function(index) {
                if ($(this).attr('style')?.includes('width: 263px') && !$(this).find('a').length) {
                    const location = $(this).text().trim();
                    console.log(`Found location: ${location}`);

                    const linksDiv = $(this).next('div.list');
                    const links = linksDiv.find('a').map((_, link) => {
                        const href = $(link).attr('href');
                        return href ? href : null;
                    }).get().filter(Boolean);

                    const uptime = linksDiv.next('div.list').text().trim();
                    const ping = linksDiv.next('div.list').next('div.list').text().trim();

                    if (location && links.length > 0) {
                        newData.push({
                            country: location,
                            ovpnLinks: links,
                            uptime,
                            ping
                        });
                    }
                }
            });

            if (newData.length === 0) {
                throw new Error('No VPN data could be parsed from the response');
            }

            console.log(`Parsed VPN data: ${JSON.stringify(newData, null, 2)}`);
            return newData;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error.message);
            if (attempt === maxRetries - 1) {
                console.error('All retry attempts failed');
                return [];
            }
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Waiting ${delay}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return [];
};

// Function to fetch OVPN file names from the GitHub repository
const fetchGitHubVPNFiles = async () => {
    try {
        console.log('Requesting OVPN files from GitHub...');
        const response = await axios.get('https://api.github.com/repos/M1noa/free-ovpn/contents/conf?ref=vpn-list-api');
        console.log('GitHub response received.');

        const files = response.data;
        const fileNames = files.map(file => file.name);

        // Creating a format similar to the fetched VPN data
        const gitHubVPNData = fileNames.map(fileName => ({
            country: 'USA',
            ovpnLinks: [`https://github.com/M1noa/free-ovpn/raw/vpn-list-api/conf/${fileName}`], // Direct link to the OVPN file
            uptime: 'Unknown',
            ping: 'Github Upload'
        }));

        console.log(`GitHub OVPN files: ${JSON.stringify(gitHubVPNData, null, 2)}`);
        return gitHubVPNData;
    } catch (error) {
        console.error('Error fetching OVPN files from GitHub:', error);
        return [];
    }
};

// Function to fetch VPN data from freeopenvpn.org
const fetchFreeOpenVPNData = async () => {
    try {
        console.log('Fetching VPN data from freeopenvpn.org...');
        const response = await axios.get('https://www.freeopenvpn.org/private.php?cntid=USA', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const ovpnLinks = [];

        // Extract OVPN profile links
        $('a[href*=".ovpn"]').each(function() {
            const href = $(this).attr('href');
            if (href) {
                ovpnLinks.push('https://www.freeopenvpn.org' + href);
            }
        });

        if (ovpnLinks.length === 0) {
            throw new Error('No OVPN links found on freeopenvpn.org');
        }

        // Format data to match existing structure
        return [{
            country: 'USA',
            ovpnLinks: ovpnLinks,
            uptime: 'Updated Daily',
            ping: 'freeopenvpn.org'
        }];
    } catch (error) {
        console.error('Error fetching from freeopenvpn.org:', error);
        return [];
    }
};

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Express endpoint to serve the JSON data
app.get('/list.json', async (req, res) => {
    console.log('Received request for /list.json');

    // Fetch VPN data from all sources
    const [fetchedVPNData, gitHubVPNData, freeOpenVPNData] = await Promise.all([
        fetchVPNData(),
        fetchGitHubVPNFiles(),
        fetchFreeOpenVPNData()
    ]);

    // Combine all VPN data
    const combinedVPNData = [...gitHubVPNData, ...fetchedVPNData, ...freeOpenVPNData];

    // Serve the combined VPN data
    res.json(combinedVPNData);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
});
