const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const express = require('express');
const NodeCache = require('node-cache');

dotenv.config();

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Function to fetch VPN data from ipspeed.info
const fetchVPNData = async () => {
    const maxRetries = 6;
    const baseDelay = 30;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.get('https://ipspeed.info/freevpn_openvpn.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0',
                    'Cookie': 'IPSpeed_lang=en'
                },
                timeout: 10000,
                maxRedirects: 10,
                validateStatus: status => status >= 200 && status < 400
            });

            const $ = cheerio.load(response.data);
            const newData = [];

            $('div.list').each(function(index) {
                if ($(this).attr('style')?.includes('width: 263px') && !$(this).find('a').length) {
                    const location = $(this).text().trim();
                    const linksDiv = $(this).next('div.list');
                    const links = linksDiv.find('a').map((_, link) => {
                        const href = $(link).attr('href');
                        return href ? href : null;
                    }).get().filter(Boolean);

                    const uptime = linksDiv.next('div.list').text().trim();
                    const ping = linksDiv.next('div.list').next('div.list').text().trim();

                    if (location && links.length > 0) {
                        newData.push({ country: location, ovpnLinks: links, uptime, ping });
                    }
                }
            });

            return newData;
        } catch (error) {
            if (attempt === maxRetries - 1) return [];
            await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
        }
    }
    return [];
};

/* github
// Function to fetch OVPN file names from GitHub
const fetchGitHubVPNFiles = async () => {
    try {
        const response = await axios.get('https://api.github.com/repos/M1noa/free-ovpn/contents/conf?ref=vpn-list-api');
        const files = response.data;
        return files.map(file => ({
            country: 'USA',
            ovpnLinks: [`https://github.com/M1noa/free-ovpn/raw/vpn-list-api/conf/${file.name}`],
            uptime: 'Unknown',
            ping: 'Github Upload'
        }));
    } catch (error) {
        return [];
    }
};
*/

// Function to fetch VPN data from freeopenvpn.org
const fetchFreeOpenVPNData = async () => {
    try {
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

        $('a[href*=".ovpn"]').each(function() {
            const href = $(this).attr('href');
            if (href) ovpnLinks.push('https://www.freeopenvpn.org' + href);
        });

        return ovpnLinks.length > 0 ? [{
            country: 'USA',
            ovpnLinks,
            uptime: 'Updated Daily',
            ping: 'freeopenvpn.org'
        }] : [];
    } catch (error) {
        return [];
    }
};

// Function to fetch and parse VPNGate data
const fetchVPNGateData = async () => {
    try {
        const response = await axios.get('http://www.vpngate.net/api/iphone/');
        const csvData = response.data.split('\n').slice(2, -2); // Remove header and footer
        
        return csvData.map(line => {
            const fields = line.split(',');
            if (fields.length < 9) return null; // Skip invalid entries
            
            const [
                hostName,
                ip,
                score,
                ping,
                speed,
                countryLong,
                countryShort,
                numVpnSessions,
                uptime,
                totalUsers,
                totalTraffic,
                logType,
                operator,
                message,
                base64Config
            ] = fields;

            return {
                country: countryLong || 'Unknown',
                ovpnLinks: [`https://vpn.minoa.cat/vpngate/${ip}.ovpn`],
                uptime: `${Math.round(parseInt(uptime) / (60 * 60 * 24))} days`,
                ping: `${ping} ms`
            };
        }).filter(Boolean); // Remove null entries
    } catch (error) {
        console.error('Error fetching VPNGate data:', error);
        return [];
    }
};

// VPNGate OVPN config endpoint
app.get('/vpngate/:ip.ovpn', async (req, res) => {
    const { ip } = req.params;
    const cacheKey = `vpngate_${ip}`;
    
    let config = cache.get(cacheKey);
    if (!config) {
        try {
            const response = await axios.get('http://www.vpngate.net/api/iphone/');
            const csvData = response.data.split('\n').slice(2, -2);
            const vpnData = csvData.find(line => {
                const fields = line.split(',');
                return fields.length >= 4 && fields[1] === ip;
            });
            
            if (!vpnData) {
                return res.status(404).send('VPN configuration not found');
            }
            
            const fields = vpnData.split(',');
            if (fields.length < 15 || !fields[14]) {
                return res.status(404).send('Invalid VPN configuration data');
            }
            
            config = Buffer.from(fields[14], 'base64').toString();
            cache.set(cacheKey, config, 900); // Cache for 15 minutes
        } catch (error) {
            console.error('Error fetching VPN configuration:', error);
            return res.status(500).send('Error fetching VPN configuration');
        }
    }
    
    res.setHeader('Content-Type', 'application/x-openvpn-profile');
    res.setHeader('Content-Disposition', `attachment; filename=${ip}.ovpn`);
    res.send(config);
});

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Express endpoint to serve the JSON data
app.get('/list.json', async (req, res) => {
    const cacheKey = 'vpn_list_json';
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
        return res.json(cachedData);
    }
    
    const [fetchedVPNData, freeOpenVPNData, vpnGateData] = await Promise.all([
        fetchVPNData(),
        fetchFreeOpenVPNData(),
        fetchVPNGateData()
    ]);

    const combinedVPNData = [...fetchedVPNData, ...freeOpenVPNData, ...vpnGateData];
    cache.set(cacheKey, combinedVPNData, 900); // Cache for 15 minutes
    res.json(combinedVPNData);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {});
