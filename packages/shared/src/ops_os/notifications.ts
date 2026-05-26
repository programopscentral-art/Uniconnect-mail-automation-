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
