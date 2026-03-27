import crypto from 'crypto';

const TOKEN_VERSION = 'v1';

function getDerivedKey(): Buffer {
    const keyBase64 = process.env.ENCRYPTION_KEY_BASE64;
    if (!keyBase64) throw new Error('ENCRYPTION_KEY_BASE64 is not set');
    const masterKey = Buffer.from(keyBase64, 'base64');
    // Derive a separate key for document tokens using HMAC (simple KDF)
    return crypto.createHmac('sha256', masterKey).update('uniconnect-doc-token-v1').digest();
}

export class DocumentTokenService {
    /**
     * Generate a time-limited signed token for document access.
     * Token format: base64url(version:docId:userId:expiresAt:hmac)
     */
    static generateToken(docId: string, userId: string, ttlMinutes: number = 15): { token: string; expiresAt: number } {
        const expiresAt = Math.floor(Date.now() / 1000) + (ttlMinutes * 60);
        const payload = `${TOKEN_VERSION}:${docId}:${userId}:${expiresAt}`;
        const key = getDerivedKey();
        const hmac = crypto.createHmac('sha256', key).update(payload).digest('hex');
        const token = Buffer.from(`${payload}:${hmac}`).toString('base64url');
        return { token, expiresAt };
    }

    /**
     * Verify a document token. Returns parsed data or null if invalid/expired.
     */
    static verifyToken(token: string): { docId: string; userId: string; expiresAt: number } | null {
        try {
            const decoded = Buffer.from(token, 'base64url').toString('utf8');
            const parts = decoded.split(':');
            if (parts.length !== 5) return null;

            const [version, docId, userId, expiresAtStr, providedHmac] = parts;
            if (version !== TOKEN_VERSION) return null;

            const expiresAt = parseInt(expiresAtStr, 10);
            if (isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) return null;

            // Verify HMAC
            const payload = `${version}:${docId}:${userId}:${expiresAtStr}`;
            const key = getDerivedKey();
            const expectedHmac = crypto.createHmac('sha256', key).update(payload).digest('hex');

            if (!crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
                return null;
            }

            return { docId, userId, expiresAt };
        } catch {
            return null;
        }
    }
}
