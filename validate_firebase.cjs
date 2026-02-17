
const fs = require('fs');
const content = fs.readFileSync('.env', 'utf8');
const lines = content.split('\n');
const line = lines.find(l => l.startsWith('FIREBASE_SERVICE_ACCOUNT='));
if (!line) {
    console.log('No FIREBASE_SERVICE_ACCOUNT line');
    process.exit(0);
}
let b64 = line.split('=')[1].trim();
if (b64.startsWith('"') && b64.endsWith('"')) b64 = b64.substring(1, b64.length - 1);

try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    console.log('Decoded length:', decoded.length);
    JSON.parse(decoded);
    console.log('Valid JSON!');
} catch (err) {
    console.error('Invalid JSON/Base64:', err.message);
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    const m = err.message.match(/at position (\d+)/);
    if (m) {
        const pos = parseInt(m[1]);
        console.log('Error context:', decoded.substring(Math.max(0, pos - 20), Math.min(decoded.length, pos + 20)));
    }
}
