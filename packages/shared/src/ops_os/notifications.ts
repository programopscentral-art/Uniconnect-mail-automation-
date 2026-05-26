/**
 * Operations OS — handoff notifications.
 *
 * Maps submission lifecycle events to in-app notifications via the existing
 * `notifications` table + bell UI in (app)/+layout.svelte.
 *
 * Recipient resolution:
 *   - BOA submit  → assigned PMs for the campus (+ ADMIN/PROGRAM_OPS opt-in)
 *   - PM send-back → the BOA who submitted (submitted_by)
 *   - PM sign-off  → the BOA who submitted (success ack)
 *   - BOA retract  → assigned PMs (so they stop expecting it)
 *   - Incident flag (PoSH/PoCSO/anti-ragging/safety/parent/CEO) →
 *     COS for the campus cluster + all ADMIN/PROGRAM_OPS users
 *
 * source_id dedupe key prevents double-sends on idempotent replays:
 *   OPSOS_SUBMIT_<sub_id>, OPSOS_SIGNOFF_<sub_id>, OPSOS_SENDBACK_<sub_id>_<count>,
 *   OPSOS_RETRACT_<sub_id>, OPSOS_INCIDENT_<sub_id>
 *
 * All helpers take a PoolClient so they run inside the same transaction as
 * the state transition that fires them. If the transition rolls back, no
 * spurious notifications appear.
 */

import type { PoolClient } from 'pg';
import type { Submission } from './types';
import { sendEmail, getUserEmails } from './email';

// ── Recipient resolvers ──────────────────────────────────────────────────

async function resolveAssignedPMs(campus_id: string, client: PoolClient): Promise<string[]> {
    const r = await client.query<{ user_id: string }>(
        `SELECT DISTINCT uca.user_id
           FROM ops_os.user_campus_assignment uca
          WHERE uca.campus_id = $1
            AND uca.role = 'PM'
            AND uca.revoked_at IS NULL`,
        [campus_id],
    );
    return r.rows.map(r => r.user_id);
}

async function resolveCampusCOS(campus_id: string, client: PoolClient): Promise<string[]> {
    const r = await client.query<{ cos_user_id: string }>(
        `SELECT DISTINCT cl.cos_user_id
           FROM ops_os.cluster_dim cl
           JOIN ops_os.campus_dim cd ON cd.cluster_id = cl.cluster_id
          WHERE cd.campus_id = $1
            AND cl.cos_user_id IS NOT NULL`,
        [campus_id],
    );
    return r.rows.map(r => r.cos_user_id);
}

async function resolveAdmins(client: PoolClient): Promise<string[]> {
    const r = await client.query<{ id: string }>(
        `SELECT id FROM public.users
          WHERE role IN ('ADMIN', 'PROGRAM_OPS')
            AND (is_active IS NULL OR is_active = true)`,
    );
    return r.rows.map(r => r.id);
}

// ── Insert helper (runs inside the caller's transaction) ─────────────────

interface InsertNotificationArgs {
    user_id: string;
    title: string;
    message: string;
    link: string;
    source_id: string;
}

async function insertNotification(args: InsertNotificationArgs, client: PoolClient): Promise<void> {
    await client.query(
        `INSERT INTO public.notifications (user_id, title, message, type, link, source_id)
         VALUES ($1, $2, $3, 'SYSTEM', $4, $5)
         ON CONFLICT (user_id, source_id) WHERE source_id IS NOT NULL DO NOTHING`,
        [args.user_id, args.title, args.message, args.link, args.source_id],
    );
}

async function fanout(user_ids: string[], buildArgs: (uid: string) => InsertNotificationArgs, client: PoolClient): Promise<void> {
    const unique = Array.from(new Set(user_ids));
    for (const uid of unique) {
        await insertNotification(buildArgs(uid), client);
    }
}

// ── Email fanout ─────────────────────────────────────────────────────────

interface EmailFanoutArgs {
    user_ids: string[];
    subject: string;
    intro: string;
    bodyHtml: string;
    ctaLabel: string;
    ctaUrl: string;
    tone?: 'info' | 'success' | 'warn' | 'alert';
}

async function emailFanout(args: EmailFanoutArgs, client: PoolClient): Promise<void> {
    const unique = Array.from(new Set(args.user_ids));
    if (unique.length === 0) return;
    const recipients = await getUserEmails(unique, client);
    // Fire-and-forget: don't block the transition on SMTP latency
    for (const r of recipients) {
        sendEmail({
            to: r.email,
            subject: args.subject,
            intro: args.intro,
            bodyHtml: args.bodyHtml,
            ctaLabel: args.ctaLabel,
            ctaUrl: args.ctaUrl,
            tone: args.tone,
        }).catch(() => { /* sendEmail already logs */ });
    }
}

// ── Public notify functions ──────────────────────────────────────────────

export async function notifyPmsOnSubmission(
    submission: Submission,
    campus: { display_name: string; code: string } | null,
    client: PoolClient,
): Promise<void> {
    const pms = await resolveAssignedPMs(submission.campus_id, client);
    if (pms.length === 0) return;
    const campusLabel = campus?.display_name ?? 'campus';
    await fanout(
        pms,
        (uid) => ({
            user_id: uid,
            title: `New submission ready for review · ${campusLabel}`,
            message: `${submission.cadence} report for ${submission.period_start} is awaiting your decision.`,
            link: `/ops-os/review/${submission.submission_id}`,
            source_id: `OPSOS_SUBMIT_${submission.submission_id}_${submission.revision}`,
        }),
        client,
    );
    await emailFanout({
        user_ids: pms,
        subject: `[NIAT Ops] Review pending · ${campusLabel} · ${submission.period_start}`,
        intro: `Submission awaiting your decision`,
        bodyHtml: `
            <p>The BOA at <strong>${campusLabel}</strong> submitted the ${submission.cadence.toLowerCase()} report for <strong>${submission.period_start}</strong>.</p>
            <p>Please review and either sign off or send back. The PM sign-off deadline is <strong>6:30 PM IST</strong>; after that the system auto-completes the submission and logs a non-response.</p>
        `,
        ctaLabel: 'Open review',
        ctaUrl: `/ops-os/review/${submission.submission_id}`,
        tone: 'info',
    }, client);
}

export async function notifyBoaOnSendBack(
    submission: Submission,
    campus: { display_name: string; code: string } | null,
    reason_code: string,
    reason_text: string | null,
    client: PoolClient,
): Promise<void> {
    if (!submission.submitted_by) return;
    const campusLabel = campus?.display_name ?? 'your campus';
    const reasonSummary = reason_text ? `${reason_code} — ${reason_text}` : reason_code;
    await insertNotification(
        {
            user_id: submission.submitted_by,
            title: `Submission sent back · ${campusLabel}`,
            message: `PM returned the ${submission.period_start} report. Reason: ${reasonSummary}. Please fix and re-submit.`,
            link: `/ops-os/report?campus=${submission.campus_id}`,
            source_id: `OPSOS_SENDBACK_${submission.submission_id}_${submission.sent_back_count}`,
        },
        client,
    );
    await emailFanout({
        user_ids: [submission.submitted_by],
        subject: `[NIAT Ops] Report sent back · ${campusLabel} · ${submission.period_start}`,
        intro: `PM returned the report — action required`,
        bodyHtml: `
            <p>Your ${submission.cadence.toLowerCase()} report for <strong>${campusLabel}</strong> on <strong>${submission.period_start}</strong> was sent back by the PM.</p>
            <p><strong>Reason:</strong> ${reasonSummary}</p>
            <p>Please fix the flagged items and re-submit.</p>
        `,
        ctaLabel: 'Open report',
        ctaUrl: `/ops-os/report?campus=${submission.campus_id}`,
        tone: 'warn',
    }, client);
}

export async function notifyBoaOnSignOff(
    submission: Submission,
    campus: { display_name: string; code: string } | null,
    client: PoolClient,
): Promise<void> {
    if (!submission.submitted_by) return;
    const campusLabel = campus?.display_name ?? 'your campus';
    await insertNotification(
        {
            user_id: submission.submitted_by,
            title: `Signed off · ${campusLabel}`,
            message: `PM signed off your ${submission.period_start} report. No further action required.`,
            link: `/ops-os/report?campus=${submission.campus_id}`,
            source_id: `OPSOS_SIGNOFF_${submission.submission_id}`,
        },
        client,
    );
    await emailFanout({
        user_ids: [submission.submitted_by],
        subject: `[NIAT Ops] Report signed off · ${campusLabel} · ${submission.period_start}`,
        intro: `Your report is approved`,
        bodyHtml: `
            <p>The PM signed off your ${submission.cadence.toLowerCase()} report for <strong>${campusLabel}</strong> on <strong>${submission.period_start}</strong>.</p>
            <p>No further action is needed. Thanks for closing the loop on time.</p>
        `,
        ctaLabel: 'View report',
        ctaUrl: `/ops-os/report?campus=${submission.campus_id}`,
        tone: 'success',
    }, client);
}

export async function notifyPmsOnRetract(
    submission: Submission,
    campus: { display_name: string; code: string } | null,
    client: PoolClient,
): Promise<void> {
    const pms = await resolveAssignedPMs(submission.campus_id, client);
    if (pms.length === 0) return;
    const campusLabel = campus?.display_name ?? 'campus';
    await fanout(
        pms,
        (uid) => ({
            user_id: uid,
            title: `Submission retracted · ${campusLabel}`,
            message: `BOA pulled back the ${submission.period_start} report. They will re-submit shortly.`,
            link: `/ops-os/review`,
            source_id: `OPSOS_RETRACT_${submission.submission_id}_${submission.revision}`,
        }),
        client,
    );
}

/**
 * High-priority alert when any incident flag (PoSH, anti-ragging, safety,
 * parent complaint, CEO-visible) is set to Yes on submission. Routed to COS
 * for the campus cluster + all admins.
 */
export async function notifyOnIncidents(
    submission: Submission,
    campus: { display_name: string; code: string } | null,
    incidentFlags: { metric_id: string; label: string }[],
    client: PoolClient,
): Promise<void> {
    if (incidentFlags.length === 0) return;
    const [cosUsers, adminUsers] = await Promise.all([
        resolveCampusCOS(submission.campus_id, client),
        resolveAdmins(client),
    ]);
    const recipients = [...cosUsers, ...adminUsers];
    if (recipients.length === 0) return;

    const campusLabel = campus?.display_name ?? 'campus';
    const flagLabels = incidentFlags.map(f => f.label).join(', ');

    await fanout(
        recipients,
        (uid) => ({
            user_id: uid,
            title: `⚠ Incidents flagged · ${campusLabel}`,
            message: `${flagLabels}. Check the submission for context.`,
            link: `/ops-os/operations/${submission.submission_id}`,
            source_id: `OPSOS_INCIDENT_${submission.submission_id}`,
        }),
        client,
    );
    await emailFanout({
        user_ids: recipients,
        subject: `[NIAT Ops] ⚠ Incident flagged · ${campusLabel} · ${submission.period_start}`,
        intro: `Incidents flagged on today's report`,
        bodyHtml: `
            <p><strong>${campusLabel}</strong> has flagged the following on the ${submission.period_start} report:</p>
            <ul style="margin:8px 0 12px 18px;padding:0;">
              ${incidentFlags.map(f => `<li>${f.label}</li>`).join('')}
            </ul>
            <p>Open the submission for full context. Names of involved parties are intentionally not stored in the form — follow up via standard incident channels.</p>
        `,
        ctaLabel: 'Open submission',
        ctaUrl: `/ops-os/operations/${submission.submission_id}`,
        tone: 'alert',
    }, client);
}

/**
 * Notify everyone affected when the system auto-signs-off a submission
 * because PM didn't act by deadline. Recipients:
 *   - The BOA (info — your report is closed)
 *   - The assigned PM(s) (warn — recorded as non-response)
 *   - Cluster COS + ADMINs (alert)
 */
export async function notifyOnAutoSignOff(
    submission: Submission,
    campus: { display_name: string; code: string } | null,
    client: PoolClient,
): Promise<void> {
    const campusLabel = campus?.display_name ?? 'campus';

    const pms = await resolveAssignedPMs(submission.campus_id, client);
    const [cosUsers, adminUsers] = await Promise.all([
        resolveCampusCOS(submission.campus_id, client),
        resolveAdmins(client),
    ]);
    const cosAndAdmins = [...cosUsers, ...adminUsers];

    // BOA in-app + email
    if (submission.submitted_by) {
        await insertNotification(
            {
                user_id: submission.submitted_by,
                title: `Auto-signed-off · ${campusLabel}`,
                message: `PM did not respond by 6:30 PM. The ${submission.period_start} report was auto-closed by the system.`,
                link: `/ops-os/report?campus=${submission.campus_id}`,
                source_id: `OPSOS_AUTOSIGNOFF_BOA_${submission.submission_id}`,
            },
            client,
        );
        await emailFanout({
            user_ids: [submission.submitted_by],
            subject: `[NIAT Ops] Report auto-closed · ${campusLabel} · ${submission.period_start}`,
            intro: `Report auto-signed-off`,
            bodyHtml: `
                <p>Your ${submission.cadence.toLowerCase()} report for <strong>${campusLabel}</strong> on <strong>${submission.period_start}</strong> was auto-signed-off by the system because the PM did not respond by 6:30 PM IST.</p>
                <p>This has been logged. No further action required from you.</p>
            `,
            ctaLabel: 'View report',
            ctaUrl: `/ops-os/report?campus=${submission.campus_id}`,
            tone: 'warn',
        }, client);
    }

    // PMs — warn that this counts against them
    if (pms.length > 0) {
        await fanout(
            pms,
            (uid) => ({
                user_id: uid,
                title: `Non-response logged · ${campusLabel}`,
                message: `You did not sign off the ${submission.period_start} report by 6:30 PM. The system auto-completed it. This has been counted against your assignment.`,
                link: `/ops-os/operations/${submission.submission_id}`,
                source_id: `OPSOS_AUTOSIGNOFF_PM_${submission.submission_id}_${uid}`,
            }),
            client,
        );
        await emailFanout({
            user_ids: pms,
            subject: `[NIAT Ops] Non-response logged · ${campusLabel} · ${submission.period_start}`,
            intro: `PM non-response recorded`,
            bodyHtml: `
                <p>You did not sign off the ${submission.period_start} report for <strong>${campusLabel}</strong> by the 6:30 PM IST deadline.</p>
                <p>The system has auto-signed-off the submission and incremented the non-response counter on your assignment. Repeated non-responses are surfaced to leadership.</p>
            `,
            ctaLabel: 'View submission',
            ctaUrl: `/ops-os/operations/${submission.submission_id}`,
            tone: 'warn',
        }, client);
    }

    // COS + admins — alert
    if (cosAndAdmins.length > 0) {
        await fanout(
            cosAndAdmins,
            (uid) => ({
                user_id: uid,
                title: `⚠ Auto-sign-off · ${campusLabel}`,
                message: `PM did not respond by deadline for the ${submission.period_start} report. System auto-closed it.`,
                link: `/ops-os/operations/${submission.submission_id}`,
                source_id: `OPSOS_AUTOSIGNOFF_COS_${submission.submission_id}_${uid}`,
            }),
            client,
        );
        await emailFanout({
            user_ids: cosAndAdmins,
            subject: `[NIAT Ops] ⚠ Auto-sign-off · ${campusLabel} · ${submission.period_start}`,
            intro: `PM did not respond — system auto-closed`,
            bodyHtml: `
                <p>The ${submission.cadence.toLowerCase()} report for <strong>${campusLabel}</strong> on <strong>${submission.period_start}</strong> was auto-signed-off because no PM action was taken by 6:30 PM IST.</p>
                <p>The assigned PM's non-response counter has been incremented. Review the submission and consider follow-up if this becomes a pattern.</p>
            `,
            ctaLabel: 'Open submission',
            ctaUrl: `/ops-os/operations/${submission.submission_id}`,
            tone: 'alert',
        }, client);
    }
}

// ── Convenience: detect which incident flags are set on the submission ───

const INCIDENT_FLAG_FIELDS: Array<{ metric_id: string; label: string }> = [
    { metric_id: 'daily.incidents.posh_pocso',       label: 'PoSH / PoCSO concern' },
    { metric_id: 'daily.incidents.anti_ragging',     label: 'Anti-ragging / bullying' },
    { metric_id: 'daily.incidents.safety_on_campus', label: 'Safety incident on campus' },
    { metric_id: 'daily.incidents.parent_complaint', label: 'Parent complaint escalated' },
    { metric_id: 'daily.incidents.ceo_visible',      label: 'CEO-visible incident' },
];

export async function detectSetIncidentFlags(
    submission_id: string,
    client: PoolClient,
): Promise<Array<{ metric_id: string; label: string }>> {
    const metricIds = INCIDENT_FLAG_FIELDS.map(f => f.metric_id);
    const r = await client.query<{ metric_id: string }>(
        `SELECT metric_id FROM ops_os.submission_value
          WHERE submission_id = $1
            AND value_boolean = true
            AND metric_id = ANY($2::text[])`,
        [submission_id, metricIds],
    );
    const setIds = new Set(r.rows.map(r => r.metric_id));
    return INCIDENT_FLAG_FIELDS.filter(f => setIds.has(f.metric_id));
}
