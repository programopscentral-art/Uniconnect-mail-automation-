import crypto from 'crypto';
import { db } from '../db/client';

export class SecurityPinService {
    /**
     * Set or update a user's 6-digit security PIN.
     * Hashed with scrypt before storage.
     */
    static async setPin(userId: string, pin: string): Promise<void> {
        if (!/^\d{6}$/.test(pin)) {
            throw new Error('PIN must be exactly 6 digits');
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
        const pinHash = `${salt}:${hash}`;

        await db.query(
            'UPDATE users SET security_pin_hash = $1, pin_set_at = NOW() WHERE id = $2',
            [pinHash, userId]
        );
    }

    /**
     * Verify a user's PIN.
     */
    static async verifyPin(userId: string, pin: string): Promise<boolean> {
        const result = await db.query(
            'SELECT security_pin_hash FROM users WHERE id = $1',
            [userId]
        );

        const stored = result.rows[0]?.security_pin_hash;
        if (!stored) return false;

        const [salt, hash] = stored.split(':');
        const computedHash = crypto.scryptSync(pin, salt, 64).toString('hex');

        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
    }

    /**
     * Check if a user has a PIN set.
     */
    static async hasPin(userId: string): Promise<boolean> {
        const result = await db.query(
            'SELECT security_pin_hash FROM users WHERE id = $1',
            [userId]
        );
        return !!result.rows[0]?.security_pin_hash;
    }

    /**
     * Generate a signed cookie value for PIN verification.
     * Valid for ttlSeconds (default 300 = 5 minutes).
     */
    static generateVerificationToken(sessionToken: string, ttlSeconds: number = 300): string {
        const keyBase64 = process.env.ENCRYPTION_KEY_BASE64;
        if (!keyBase64) throw new Error('ENCRYPTION_KEY_BASE64 is not set');

        const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
        const payload = `${sessionToken}:${expiresAt}`;
        const key = Buffer.from(keyBase64, 'base64');
        const hmac = crypto.createHmac('sha256', key).update(`pin-verify:${payload}`).digest('hex');

        return Buffer.from(`${expiresAt}:${hmac}`).toString('base64url');
    }

    /**
     * Verify a PIN verification cookie value.
     */
    static verifyVerificationToken(cookieValue: string, sessionToken: string): boolean {
        try {
            const keyBase64 = process.env.ENCRYPTION_KEY_BASE64;
            if (!keyBase64) return false;

            const decoded = Buffer.from(cookieValue, 'base64url').toString('utf8');
            const [expiresAtStr, providedHmac] = decoded.split(':');
            const expiresAt = parseInt(expiresAtStr, 10);

            if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return false;

            const payload = `${sessionToken}:${expiresAtStr}`;
            const key = Buffer.from(keyBase64, 'base64');
            const expectedHmac = crypto.createHmac('sha256', key).update(`pin-verify:${payload}`).digest('hex');

            return crypto.timingSafeEqual(
                Buffer.from(providedHmac, 'hex'),
                Buffer.from(expectedHmac, 'hex')
            );
        } catch {
            return false;
        }
    }
}
