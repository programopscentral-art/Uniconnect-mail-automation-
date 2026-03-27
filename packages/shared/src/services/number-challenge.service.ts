import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { db } from '../db/client';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
    if (_transporter) return _transporter;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return null;

    _transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
    return _transporter;
}

export class NumberChallengeService {
    /**
     * Create a number challenge for a user.
     * Returns the correct number to display on screen + sends email with options.
     */
    static async createChallenge(userId: string, userEmail: string, userName: string): Promise<{
        challengeId: string;
        correctNumber: number;
        expiresAt: number;
    }> {
        const challengeId = crypto.randomUUID();
        const correctNumber = Math.floor(Math.random() * 90) + 10; // 10-99
        const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes

        // Generate 2 decoy numbers different from correct
        const decoys = new Set<number>();
        while (decoys.size < 2) {
            const n = Math.floor(Math.random() * 90) + 10;
            if (n !== correctNumber) decoys.add(n);
        }

        // Shuffle all 3 numbers
        const options = [correctNumber, ...decoys].sort(() => Math.random() - 0.5);

        // Sign the challenge so we can verify it
        const keyBase64 = process.env.ENCRYPTION_KEY_BASE64;
        if (!keyBase64) throw new Error('ENCRYPTION_KEY_BASE64 is not set');
        const key = Buffer.from(keyBase64, 'base64');
        const hmac = crypto.createHmac('sha256', key)
            .update(`challenge:${challengeId}:${userId}:${correctNumber}:${expiresAt}`)
            .digest('hex');

        // Store challenge in DB
        await db.query(
            `INSERT INTO number_challenges (id, user_id, correct_number, hmac, expires_at, verified)
             VALUES ($1, $2, $3, $4, to_timestamp($5), false)`,
            [challengeId, userId, correctNumber, hmac, expiresAt]
        );

        // Send email with number options
        const baseUrl = process.env.PUBLIC_BASE_URL || process.env.ORIGIN || 'https://uniconnect-app.up.railway.app';
        const transporter = getTransporter();
        if (transporter) {
            const buttonHtml = options.map(num => {
                const token = Buffer.from(JSON.stringify({
                    c: challengeId,
                    n: num,
                    h: crypto.createHmac('sha256', key)
                        .update(`verify:${challengeId}:${num}`)
                        .digest('hex')
                })).toString('base64url');

                return `
                    <a href="${baseUrl}/api/auth/verify-challenge?t=${token}"
                       style="display: inline-block; width: 80px; height: 80px; line-height: 80px;
                              text-align: center; font-size: 32px; font-weight: bold;
                              background: #1e293b; color: white; text-decoration: none;
                              border-radius: 12px; margin: 0 12px;">
                        ${num}
                    </a>`;
            }).join('');

            transporter.sendMail({
                from: `"UniConnect Security" <${process.env.SMTP_USER}>`,
                to: userEmail,
                subject: 'UniConnect — Verify your identity',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; text-align: center;">
                        <div style="background: #0f172a; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                            <h2 style="margin: 0;">Identity Verification</h2>
                        </div>
                        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
                            <p style="color: #6b7280; margin-bottom: 8px;">Hi ${userName},</p>
                            <p style="font-size: 16px; color: #1f2937;">
                                Someone is trying to access sensitive data on your account.
                                <strong>Tap the number shown on your screen</strong> to verify it's you.
                            </p>
                            <div style="margin: 32px 0;">
                                ${buttonHtml}
                            </div>
                            <p style="color: #9ca3af; font-size: 13px;">
                                This challenge expires in 5 minutes.<br>
                                If you didn't request this, ignore this email.
                            </p>
                        </div>
                    </div>
                `
            }).catch(err => {
                console.error('[NUMBER_CHALLENGE] Email send failed:', err);
            });
        }

        return { challengeId, correctNumber, expiresAt };
    }

    /**
     * Verify a challenge response from the email link click.
     */
    static async verifyChallenge(token: string): Promise<{
        valid: boolean;
        userId?: string;
        challengeId?: string;
    }> {
        try {
            const keyBase64 = process.env.ENCRYPTION_KEY_BASE64;
            if (!keyBase64) return { valid: false };
            const key = Buffer.from(keyBase64, 'base64');

            const data = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
            const { c: challengeId, n: number, h: providedHmac } = data;

            // Verify token HMAC
            const expectedHmac = crypto.createHmac('sha256', key)
                .update(`verify:${challengeId}:${number}`)
                .digest('hex');

            if (!crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
                return { valid: false };
            }

            // Look up challenge
            const result = await db.query(
                `SELECT user_id, correct_number, verified, expires_at FROM number_challenges
                 WHERE id = $1 AND expires_at > NOW() AND verified = false`,
                [challengeId]
            );

            if (!result.rows[0]) return { valid: false };
            const challenge = result.rows[0];

            if (challenge.correct_number !== number) {
                return { valid: false };
            }

            // Mark as verified
            await db.query(
                'UPDATE number_challenges SET verified = true, verified_at = NOW() WHERE id = $1',
                [challengeId]
            );

            return { valid: true, userId: challenge.user_id, challengeId };
        } catch {
            return { valid: false };
        }
    }

    /**
     * Check if user has a valid (unexpired, verified) challenge within the last 5 minutes.
     */
    static async hasValidVerification(userId: string): Promise<boolean> {
        const result = await db.query(
            `SELECT id FROM number_challenges
             WHERE user_id = $1 AND verified = true AND verified_at > NOW() - INTERVAL '5 minutes'
             LIMIT 1`,
            [userId]
        );
        return result.rows.length > 0;
    }
}
