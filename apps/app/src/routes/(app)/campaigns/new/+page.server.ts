/**
 * Campaign creation — server load.
 *
 * Builds the "Recipient Email Column" dropdown by scanning EVERY student's
 * metadata for any key whose name contains "email" or "mail" (case-insensitive).
 * Previously we only scanned the first 100 students which silently hid parent
 * email columns when a university had more students or the parent columns
 * weren't populated in those rows.
 *
 * The JSONB query uses jsonb_object_keys + DISTINCT to deduplicate at the DB
 * level, so even a 50k-student table returns just the unique key set.
 */
import { db, getTemplates, getMailboxes } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    let universityId = url.searchParams.get('universityId');
    if (locals.user.role === 'UNIVERSITY_OPERATOR') {
        universityId = locals.user.university_id;
    }

    if (!universityId) throw error(400, 'University ID required');

    const [templates, mailboxes, keyRows] = await Promise.all([
        getTemplates(universityId),
        getMailboxes(universityId),
        db.query<{ k: string }>(
            `SELECT DISTINCT jsonb_object_keys(metadata) AS k
               FROM students
              WHERE university_id = $1
                AND metadata IS NOT NULL
                AND jsonb_typeof(metadata) = 'object'`,
            [universityId],
        ),
    ]);

    // Filter for email-like keys (Father Email, Mother Mail ID, Personal Email, etc.)
    const emailMetadataKeys = keyRows.rows
        .map(r => r.k)
        .filter(k => {
            const low = k.toLowerCase();
            return low.includes('email') || low.includes('mail');
        })
        .sort();

    return {
        templates,
        mailboxes,
        universityId,
        emailMetadataKeys,
    };
};
