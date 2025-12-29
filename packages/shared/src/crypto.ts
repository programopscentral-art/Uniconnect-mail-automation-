import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    let keyBase64 = process.env.ENCRYPTION_KEY_BASE64;

    if (!keyBase64) {
        // Try to load from root .env if not present
        dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
        dotenv.config({ path: path.resolve(process.cwd(), '.env') });
        keyBase64 = process.env.ENCRYPTION_KEY_BASE64;
    }

    if (!keyBase64) {
        console.error('--- CRITICAL: ENCRYPTION_KEY_BASE64 is missing in process.env ---');
        console.error('CWD:', process.cwd());
        throw new Error('ENCRYPTION_KEY_BASE64 is not set in environment.');
    }

    try {
        const key = Buffer.from(keyBase64, 'base64');
        if (key.length !== 32) {
            throw new Error(`Invalid Key Length: Expected 32 bytes, got ${key.length}`);
        }
        return key;
    } catch (e: any) {
        throw new Error(`Failed to decode ENCRYPTION_KEY_BASE64: ${e.message}`);
    }
}

export function encryptString(text: string): string {
    if (!text) return '';
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptString(text: string): string {
    if (!text) return '';
    const key = getEncryptionKey();
    const parts = text.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted string format');

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
