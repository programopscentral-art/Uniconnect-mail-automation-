const https = require('https');
const fs = require('fs');
const path = require('path');

// Try to find the API key in the root .env
const envPath = path.resolve(__dirname, '../.env');
let apiKey = '';

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/GEMINI_API_KEY=["']?([^"'\n\r]+)["']?/);
    if (match && match[1]) {
        apiKey = match[1].replace(/["']$/g, '');
        console.log(`Using Key: ${apiKey.slice(0, 5)}...`);
    }
}

if (!apiKey) {
    console.error('ERROR: No GEMINI_API_KEY found');
    process.exit(1);
}

const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models?key=${apiKey}`,
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log('Listing available models...');

const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let responseBody = '';
    res.on('data', (d) => responseBody += d);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode === 200) {
                console.log('Available Models:');
                parsed.models?.forEach(m => console.log(` - ${m.name} (${m.displayName})`));
            } else {
                console.error('Error:', JSON.stringify(parsed, null, 2));
            }
        } catch (e) {
            console.error('Failed to parse response');
        }
    });
});

req.on('error', (e) => console.error('Network Error:', e));
req.end();
