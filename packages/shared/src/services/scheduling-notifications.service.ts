import { db } from '../db/client';
import { NotificationService } from './notification.service';

/**
 * Scheduling-specific notification helpers.
 * Sends alerts when timetables are published or sessions are changed.
 */
export class SchedulingNotificationService {

    /**
     * Notify all faculty in a published version that the timetable is live.
     */
    static async notifyTimetablePublished(universityId: string, versionId: string) {
        try {
            // Get version info
            const vRes = await db.query(
                `SELECT tv.*, p.name as program_name, t.name as term_name
                 FROM timetable_versions tv
                 LEFT JOIN programs p ON tv.program_id = p.id
                 LEFT JOIN terms t ON tv.term_id = t.id
                 WHERE tv.id = $1`,
                [versionId]
            );
            const version = vRes.rows[0];
            if (!version) return;

            // Get all unique faculty in this version
            const facultyRes = await db.query(
                `SELECT DISTINCT fp.id as faculty_profile_id, fp.user_id, u.email, u.name
                 FROM timetable_sessions ts
                 JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                 JOIN users u ON fp.user_id = u.id
                 WHERE ts.timetable_version_id = $1 AND ts.session_status != 'CANCELLED'
                   AND ts.faculty_profile_id IS NOT NULL`,
                [versionId]
            );

            const title = `Timetable Published: v${version.version_number}`;
            const scope = [version.program_name, version.term_name].filter(Boolean).join(' — ') || 'All';
            const body = `A new timetable (version ${version.version_number}) has been published for ${scope}. Please check your schedule.`;
            const link = '/academic-operations/scheduling/sessions';

            // Notify each faculty
            for (const f of facultyRes.rows) {
                await NotificationService.send({
                    university_id: universityId,
                    recipient_id: f.user_id,
                    recipient_email: f.email,
                    title,
                    body,
                    link,
                    channels: ['IN_APP', 'EMAIL']
                });
            }

            // Also notify PROGRAM_OPS role
            await NotificationService.notifyBulk(
                universityId,
                'PROGRAM_OPS',
                title,
                `Timetable v${version.version_number} for ${scope} is now published.`,
                link
            );

            return { notifiedFaculty: facultyRes.rows.length };
        } catch (e) {
            console.error('[SchedulingNotificationService.notifyTimetablePublished]', e);
            return { notifiedFaculty: 0 };
        }
    }

    /**
     * Notify a faculty member when their session is changed.
     */
    static async notifySessionChange(sessionId: string, changeType: string, fieldName: string, oldValue: string | null, newValue: string | null) {
        try {
            const sesRes = await db.query(
                `SELECT ts.*, s.code as subject_code, s.name as subject_name,
                        sec.name as section_name,
                        fp.user_id, u.email, u.name as faculty_name
                 FROM timetable_sessions ts
                 LEFT JOIN subjects s ON ts.subject_id = s.id
                 LEFT JOIN sections sec ON ts.section_id = sec.id
                 LEFT JOIN faculty_profiles fp ON ts.faculty_profile_id = fp.id
                 LEFT JOIN users u ON fp.user_id = u.id
                 WHERE ts.id = $1`,
                [sessionId]
            );
            const session = sesRes.rows[0];
            if (!session || !session.user_id) return;

            const dateStr = session.session_date?.toISOString?.()?.split('T')[0] || session.session_date;
            let title = 'Schedule Update';
            let body = '';

            if (changeType === 'CANCEL') {
                title = 'Session Cancelled';
                body = `Your ${session.subject_code} session on ${dateStr} (${session.section_name}) has been cancelled.`;
            } else if (changeType === 'SWAP_FACULTY') {
                title = 'Faculty Swap';
                body = `Faculty assignment changed for ${session.subject_code} on ${dateStr}: ${oldValue} → ${newValue}.`;
            } else if (fieldName === 'faculty_profile_id') {
                title = 'Session Reassigned';
                body = `You have been ${newValue === 'none' ? 'removed from' : 'assigned to'} ${session.subject_code} on ${dateStr} (${session.section_name}).`;
            } else {
                body = `${session.subject_code} session on ${dateStr}: ${fieldName} changed from "${oldValue}" to "${newValue}".`;
            }

            await NotificationService.send({
                university_id: session.university_id,
                recipient_id: session.user_id,
                recipient_email: session.email,
                title,
                body,
                link: '/academic-operations/scheduling/sessions',
                channels: ['IN_APP']
            });

            // If faculty was swapped, also notify the old faculty
            if (changeType === 'SWAP_FACULTY' && oldValue && oldValue !== 'none') {
                // oldValue might be a name or ID; try to find by name
                const oldFacRes = await db.query(
                    `SELECT fp.user_id, u.email FROM faculty_profiles fp
                     JOIN users u ON fp.user_id = u.id
                     WHERE u.name = $1 OR fp.id::text = $1
                     LIMIT 1`,
                    [oldValue]
                );
                if (oldFacRes.rows[0]) {
                    await NotificationService.send({
                        university_id: session.university_id,
                        recipient_id: oldFacRes.rows[0].user_id,
                        recipient_email: oldFacRes.rows[0].email,
                        title: 'Session Reassigned',
                        body: `You have been unassigned from ${session.subject_code} on ${dateStr} (${session.section_name}).`,
                        link: '/academic-operations/scheduling/sessions',
                        channels: ['IN_APP']
                    });
                }
            }
        } catch (e) {
            console.error('[SchedulingNotificationService.notifySessionChange]', e);
        }
    }
}
