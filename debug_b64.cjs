
const fs = require('fs');
const content = fs.readFileSync('.env', 'utf8');
const lines = content.split('\n');
const line = lines.find(l => l.startsWith('FIREBASE_SERVICE_ACCOUNT='));
let b64 = line.split('=')[1].trim();
if (b64.startsWith('"') && b64.endsWith('"')) b64 = b64.substring(1, b64.length - 1);

console.log('Original b64 length:', b64.length);
// Check for non-base64 chars
const nonB64 = b64.replace(/[A-Za-z0-9+/=]/g, '');
if (nonB64.length > 0) {
    console.log('Non-base64 chars found:', nonB64);
}

const decoded = Buffer.from(b64, 'base64').toString('utf-8');
const m = decoded.match(/\\g/);
if (m) {
    const pos = decoded.indexOf('\\g');
    console.log('Found \\g at decoded pos:', pos);
    console.log('Context:', decoded.substring(pos - 20, pos + 20));
}
