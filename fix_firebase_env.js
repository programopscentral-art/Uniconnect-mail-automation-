const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env');
let env = fs.readFileSync(envPath, 'utf8');

// Find the line
const match = env.match(/FIREBASE_SERVICE_ACCOUNT=(.*)/);
if (!match) {
    console.error('FIREBASE_SERVICE_ACCOUNT not found in .env');
    process.exit(1);
}

const raw = match[1].trim().replace(/^['\"]|['\"]$/g, '');

// Reconstruct the JSON
// We know it starts with eyJ0...
// We also see literal \n and -----BEGIN...
// Let's try to just TREAT the whole string as LITERAL if it doesn't decode to something valid.
// OR, more likely, it's a JSON where someone ALREADY put base64 into the private_key field?

// Let's try to decode the WHOLE thing but skipping non-base64 characters
const decoded = Buffer.from(raw, 'base64').toString('utf-8');

try {
    const json = JSON.parse(decoded);
    console.log('Successfully parsed JSON from existing mangled string.');

    // HEAL the private_key if it is broken
    // If it starts with -----BEGIN... but ends in w==, it's missing the footer
    if (json.private_key && json.private_key.startsWith('-----BEGIN') && !json.private_key.includes('-----END')) {
        console.log('Healing private_key footer...');
        json.private_key = json.private_key.trim() + '\n-----END PRIVATE KEY-----\n';
    }

    // Now RE-ENCODE the WHOLE JSON properly as Base64
    const fixedB64 = Buffer.from(JSON.stringify(json)).toString('base64');

    // Update .env
    const newEnv = env.replace(/FIREBASE_SERVICE_ACCOUNT=.*/, `FIREBASE_SERVICE_ACCOUNT=${fixedB64}`);
    fs.writeFileSync(envPath, newEnv);
    console.log('✅ Updated .env with correctly encoded service account.');
} catch (e) {
    console.error('Failed to parse decoded JSON:', e.message);
    // If it's not JSON, maybe it WAS literal JSON already?
    try {
        const json = JSON.parse(raw);
        console.log('Found literal JSON in env. Encoding it.');
        const fixedB64 = Buffer.from(JSON.stringify(json)).toString('base64');
        const newEnv = env.replace(/FIREBASE_SERVICE_ACCOUNT=.*/, `FIREBASE_SERVICE_ACCOUNT=${fixedB64}`);
        fs.writeFileSync(envPath, newEnv);
    } catch (e2) {
        console.error('Could not recover JSON from env.');
    }
}
