/**
 * Operations OS — transactional email send.
 *
 * Reuses the SMTP env vars already configured for AccessAlertService:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 *
 * If SMTP_USER/PASS aren't set (e.g. local dev), sendEmail() logs and returns
 * silently — calling code shouldn't break.
 *
 * All ops_os emails share a single visual template (header + body + CTA) so
 * recipients can recognize the system at a glance.
 */

import nodemailer from 'nodemailer';
import type { PoolClient } from 'pg';

let _transporter: nodemailer.Transporter | null = null;
let _transporterChecked = false;

function getTransporter(): nodemailer.Transporter | null {
    if (_transporterChecked) return _transporter;
    _transporterChecked = true;

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
        console.warn('[OPS_OS_EMAIL] SMTP_USER / SMTP_PASS not set — emails will be skipped');
        return null;
    }

    _transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        // Strip whitespace — a Gmail app password pasted as "xxxx xxxx xxxx xxxx"
        // (with spaces) is rejected by SMTP auth.
        auth: { user: user.trim(), pass: pass.replace(/\s+/g, '') },
        tls: { rejectUnauthorized: false },
    });
    return _transporter;
}

export interface OpsOsEmailArgs {
    to: string;
    subject: string;
    intro: string;
    bodyHtml: string;
    ctaLabel?: string;
    ctaUrl?: string;
    tone?: 'info' | 'success' | 'warn' | 'alert';
    /**
     * When false, `bodyHtml` is treated as a COMPLETE, self-contained email
     * body and sent as-is (only wrapped in a minimal doctype/html/body). Use
     * this for rich, full-width layouts (e.g. the fee-collection snapshot) that
     * must NOT be squeezed into the 560px Operations-OS card — doing so clips
     * the layout so half of it is invisible. Defaults to true (the decorative
     * card wrapper + header/footer/CTA).
     */
    wrap?: boolean;
}

/** Minimal standalone wrapper for pre-rendered, full-width email bodies. */
function wrapRaw(body: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;">${body}</body></html>`;
}

function appBaseUrl(): string {
    return process.env.APP_BASE_URL || 'https://uniconnect-app.up.railway.app';
}

function toneColor(tone: OpsOsEmailArgs['tone']): string {
    switch (tone) {
        case 'success': return '#10b981';
        case 'warn':    return '#f59e0b';
        case 'alert':   return '#dc2626';
        default:        return '#3b82f6';
    }
}

function renderHtml(args: OpsOsEmailArgs): string {
    const accent = toneColor(args.tone);
    const cta = args.ctaUrl
        ? `<div style="margin: 24px 0;">
             <a href="${appBaseUrl()}${args.ctaUrl}"
                style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
               ${args.ctaLabel ?? 'Open'}
             </a>
           </div>`
        : '';

    return `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:14px;border:1px solid #e4e4e7;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f4f4f5;">
        <div style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;font-weight:700;">UniConnect · NIAT Operations OS</div>
        <div style="font-size:18px;font-weight:600;color:#18181b;margin-top:4px;">${args.intro}</div>
      </div>
      <div style="padding:18px 20px;font-size:14px;line-height:1.55;color:#27272a;">
        ${args.bodyHtml}
        ${cta}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #f4f4f5;background:#fafafa;font-size:11px;color:#71717a;">
        This is an automated message from UniConnect Operations OS. If you weren't expecting this, ignore it.
      </div>
    </div>
  </div>
</body></html>`.trim();
}

/**
 * Send a transactional email. Never throws — failures are logged so they
 * don't break the calling transition.
 */
export async function sendEmail(args: OpsOsEmailArgs): Promise<{ sent: boolean; reason?: string }> {
    if (!args.to || !args.to.includes('@')) {
        return { sent: false, reason: 'invalid_recipient' };
    }
    const t = getTransporter();
    if (!t) return { sent: false, reason: 'smtp_not_configured' };

    try {
        await t.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: args.to,
            subject: args.subject,
            html: args.wrap === false ? wrapRaw(args.bodyHtml) : renderHtml(args),
        });
        return { sent: true };
    } catch (e) {
        console.error('[OPS_OS_EMAIL] sendMail failed', { to: args.to, subject: args.subject, error: (e as Error).message });
        return { sent: false, reason: 'smtp_send_failed' };
    }
}

/**
 * Look up a user's email by id. Returns null if user is inactive or has no
 * email on file.
 */
export async function getUserEmail(user_id: string, client: PoolClient): Promise<{ email: string; name: string } | null> {
    const r = await client.query<{ email: string; name: string }>(
        `SELECT email, COALESCE(name, email) AS name FROM public.users
          WHERE id = $1 AND (is_active IS NULL OR is_active = true)
            AND email IS NOT NULL AND email <> ''
          LIMIT 1`,
        [user_id],
    );
    return r.rows[0] ?? null;
}

export async function getUserEmails(user_ids: string[], client: PoolClient): Promise<Array<{ id: string; email: string; name: string }>> {
    if (user_ids.length === 0) return [];
    const r = await client.query<{ id: string; email: string; name: string }>(
        `SELECT id, email, COALESCE(name, email) AS name FROM public.users
          WHERE id = ANY($1::uuid[])
            AND (is_active IS NULL OR is_active = true)
            AND email IS NOT NULL AND email <> ''`,
        [user_ids],
    );
    return r.rows;
}
