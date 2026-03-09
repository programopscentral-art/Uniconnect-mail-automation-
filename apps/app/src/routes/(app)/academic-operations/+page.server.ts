import { db } from '@uniconnect/shared';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Safe wrappers — return defaults if table is empty or schema differs
async function safeCount(sql: string, params: any[]): Promise<number> {
    try {
        const r = await db.query(sql, params);
        return parseInt(r.rows[0]?.count ?? '0', 10);
    } catch {
        return 0;
    }
}

async function safeRows<T = any>(sql: string, params: any[]): Promise<T[]> {
    try {
        const r = await db.query(sql, params);
        return r.rows as T[];
    } catch {
        return [];
    }
}

function timeAgo(date: string | Date): string {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw error(401);

    const uid = locals.user.university_id;
    const today = new Date().toISOString().split('T')[0];

    const [
        todaysSessionCount,
        staffOnLeaveCount,
        openConflictsCount,
        syllabusRows,
        todaysSessions,
        recentConflicts,
        pendingLeave
    ] = await Promise.all([

        // Today's sessions — uses academic_sessions which has university_id + start_time
        safeCount(
            uid
                ? `SELECT COUNT(*) as count FROM academic_sessions WHERE university_id = $1 AND DATE(start_time) = $2`
                : `SELECT COUNT(*) as count FROM academic_sessions WHERE DATE(start_time) = $1`,
            uid ? [uid, today] : [today]
        ),

        // Staff approved on leave today
        safeCount(
            uid
                ? `SELECT COUNT(DISTINCT flr.faculty_profile_id) as count
                   FROM faculty_leave_requests flr
                   JOIN faculty_profiles fp ON flr.faculty_profile_id = fp.id
                   JOIN users u ON fp.user_id = u.id
                   WHERE flr.leave_date = $1 AND flr.approval_status = 'APPROVED'
                   AND u.university_id = $2`
                : `SELECT COUNT(DISTINCT faculty_profile_id) as count
                   FROM faculty_leave_requests
                   WHERE leave_date = $1 AND approval_status = 'APPROVED'`,
            uid ? [today, uid] : [today]
        ),

        // Open scheduling conflicts (global — no direct university_id on this table)
        safeCount(
            `SELECT COUNT(*) as count FROM scheduling_conflicts WHERE status = 'OPEN'`,
            []
        ),

        // Average syllabus completion %
        safeRows<{ avg_pct: string }>(
            uid
                ? `SELECT ROUND(AVG(CASE WHEN total_sessions_required > 0
                   THEN (total_sessions_completed::float / total_sessions_required::float) * 100
                   ELSE 0 END)::numeric, 1) as avg_pct
                   FROM syllabus_tracking WHERE university_id = $1`
                : `SELECT ROUND(AVG(CASE WHEN total_sessions_required > 0
                   THEN (total_sessions_completed::float / total_sessions_required::float) * 100
                   ELSE 0 END)::numeric, 1) as avg_pct
                   FROM syllabus_tracking`,
            uid ? [uid] : []
        ),

        // Today's session list enriched
        safeRows<any>(
            uid
                ? `SELECT s.id, s.start_time, s.end_time, s.status,
                          sub.name as subject_name, sub.code as subject_code,
                          sec.name as section_name,
                          cr.name as room_name,
                          u.name as faculty_name
                   FROM academic_sessions s
                   LEFT JOIN subjects sub ON s.subject_id = sub.id
                   LEFT JOIN sections sec ON s.section_id = sec.id
                   LEFT JOIN classrooms cr ON s.classroom_id = cr.id
                   LEFT JOIN faculty_profiles fp ON s.faculty_id = fp.id
                   LEFT JOIN users u ON fp.user_id = u.id
                   WHERE s.university_id = $1 AND DATE(s.start_time) = $2
                   ORDER BY s.start_time ASC LIMIT 10`
                : `SELECT s.id, s.start_time, s.end_time, s.status,
                          sub.name as subject_name, sub.code as subject_code,
                          sec.name as section_name,
                          cr.name as room_name,
                          u.name as faculty_name
                   FROM academic_sessions s
                   LEFT JOIN subjects sub ON s.subject_id = sub.id
                   LEFT JOIN sections sec ON s.section_id = sec.id
                   LEFT JOIN classrooms cr ON s.classroom_id = cr.id
                   LEFT JOIN faculty_profiles fp ON s.faculty_id = fp.id
                   LEFT JOIN users u ON fp.user_id = u.id
                   WHERE DATE(s.start_time) = $1
                   ORDER BY s.start_time ASC LIMIT 10`,
            uid ? [uid, today] : [today]
        ),

        // Recent open conflicts
        safeRows<any>(
            `SELECT conflict_type, conflict_severity as severity, created_at, description
             FROM scheduling_conflicts
             WHERE status = 'OPEN'
             ORDER BY created_at DESC LIMIT 3`,
            []
        ),

        // Pending leave requests
        safeRows<any>(
            uid
                ? `SELECT flr.leave_date, flr.leave_type, flr.created_at, u.name as faculty_name
                   FROM faculty_leave_requests flr
                   JOIN faculty_profiles fp ON flr.faculty_profile_id = fp.id
                   JOIN users u ON fp.user_id = u.id
                   WHERE flr.approval_status = 'PENDING' AND u.university_id = $1
                   ORDER BY flr.created_at DESC LIMIT 3`
                : `SELECT flr.leave_date, flr.leave_type, flr.created_at, u.name as faculty_name
                   FROM faculty_leave_requests flr
                   JOIN faculty_profiles fp ON flr.faculty_profile_id = fp.id
                   JOIN users u ON fp.user_id = u.id
                   WHERE flr.approval_status = 'PENDING'
                   ORDER BY flr.created_at DESC LIMIT 3`,
            uid ? [uid] : []
        )
    ]);

    const syllabusPercent = Math.round(parseFloat(syllabusRows[0]?.avg_pct ?? '0'));

    // Merge real alerts — conflicts first, then leave requests
    const alerts = [
        ...recentConflicts.map((c: any) => ({
            title: (c.conflict_type ?? 'CONFLICT').replace(/_/g, ' '),
            message: c.description ?? `${c.conflict_type} detected in schedule`,
            time: timeAgo(c.created_at),
            type: c.severity === 'CRITICAL' ? 'error' : 'warning'
        })),
        ...pendingLeave.map((l: any) => ({
            title: 'Leave Request',
            message: `${l.faculty_name ?? 'Faculty'} requested ${(l.leave_type ?? 'leave').toLowerCase()} for ${new Date(l.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
            time: timeAgo(l.created_at),
            type: 'warning'
        }))
    ].slice(0, 5);

    // Format sessions for UI
    const formattedSessions = todaysSessions.map((s: any) => ({
        id: s.id,
        subject_name: s.subject_name ?? 'Unknown Subject',
        subject_code: s.subject_code ?? '',
        section_name: s.section_name ?? '—',
        room_name: s.room_name ?? 'TBD',
        faculty_name: s.faculty_name ?? '—',
        start_time: s.start_time
            ? new Date(s.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
            : '—',
        end_time: s.end_time
            ? new Date(s.end_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
            : '—',
        status: s.status ?? 'SCHEDULED'
    }));

    return {
        stats: {
            todaysSessions: todaysSessionCount,
            staffOnLeave: staffOnLeaveCount,
            openConflicts: openConflictsCount,
            syllabusPercent
        },
        todaysSessions: formattedSessions,
        alerts,
        userRole: locals.user.role
    };
};
