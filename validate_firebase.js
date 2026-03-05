
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const b64 = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
if (!b64) {
    console.log('No b64 found');
    process.exit(0);
}

try {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    console.log('Decoded length:', decoded.length);
    console.log('First 50 chars:', decoded.substring(0, 50));
    console.log('Last 50 chars:', decoded.substring(decoded.length - 50));
    JSON.parse(decoded);
    console.log('Valid JSON!');
} catch (err) {
    console.error('Invalid JSON/Base64:', err);
    // Try to find the position
    if (err instanceof SyntaxError) {
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        const match = err.message.match(/at position (\d+)/);
        if (match) {
            const pos = parseInt(match[1]);
            console.log('Error context:', decoded.substring(Math.max(0, pos - 20), Math.min(decoded.length, pos + 20)));
        }
    }
}
