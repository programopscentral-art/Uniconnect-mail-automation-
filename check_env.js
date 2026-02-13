const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

console.log('--- Firebase Env Check ---');
const b64 = process.env.FIREBASE_SERVICE_ACCOUNT;
if (b64) {
    console.log('Length:', b64.length);
    console.log('Start:', b64.substring(0, 20));
    try {
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        console.log('Decoded Start:', decoded.substring(0, 50));
        const parsed = JSON.parse(decoded);
        console.log('✅ Success! Project ID:', parsed.project_id);
    } catch (e) {
        console.log('❌ Failed:', e.message);
    }
} else {
    console.log('❌ Not found');
}
