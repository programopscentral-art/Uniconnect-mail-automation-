/**
 * Faculty Attendance API
 * GET  — fetch attendance/workload data
 * POST — mark attendance, log workload, manage faculty profiles
 *
 * Permission: FACULTY_ATTENDANCE_MANAGE (checked via user.permissions)
 * Also accessible by ADMIN and PROGRAM_OPS roles.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
    getInstructorsByUniversity, getInstructorProfile,
    createInstructorProfile, updateInstructorProfile, deactivateInstructor,
    getAttendanceForDate, markAttendance, markBulkAttendance, clearAttendance,
    getWorkloadForDate, upsertWorkloadLog,
    getAttendanceSummary, getAttendanceByDate, getMonthlyInstructorReport,
    ensureInstructorTables,
    getCoachesByUniversity, createCoachProfile, updateCoachProfile, deactivateCoach,
    getCoachLogsForDate, upsertCoachDailyLog, getMonthlyCoachReport,
} from '@uniconnect/shared';

function checkAccess(locals: any) {
    if (!locals.user) throw error(401);
    const role = locals.user.role;
    const perms: string[] = locals.user.permissions || [];
    if (role === 'ADMIN' || role === 'PROGRAM_OPS') return;
    if (perms.includes('faculty-attendance')) return;
    throw error(403, 'You do not have access to Faculty Attendance. Ask your admin to enable it.');
}

export const GET: RequestHandler = async ({ url, locals }) => {
    checkAccess(locals);
    await ensureInstructorTables();

    const view = url.searchParams.get('view') || 'attendance';
    const universityId = url.searchParams.get('universityId') || locals.user?.university_id;
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!universityId) throw error(400, 'universityId required');

    switch (view) {
        case 'faculty': {
            const instructors = await getInstructorsByUniversity(universityId);
            return json({ instructors });
        }

        case 'attendance': {
            const rows = await getAttendanceForDate(universityId, date);
            return json({ attendance: rows, date });
        }

        case 'workload': {
            const logs = await getWorkloadForDate(universityId, date);
            return json({ workload: logs, date });
        }

        case 'summary': {
            const startDate = url.searchParams.get('startDate') || date;
            const endDate = url.searchParams.get('endDate') || date;
            const summary = await getAttendanceSummary(universityId, startDate, endDate);
            const daily = await getAttendanceByDate(universityId, startDate, endDate);
            return json({ summary, daily, startDate, endDate });
        }

        case 'monthly-report': {
            const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
            const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1));
            const report = await getMonthlyInstructorReport(universityId, year, month);
            return json({ report, year, month });
        }

        // ── Success Coaches ───────────────────────────
        case 'coaches': {
            const coaches = await getCoachesByUniversity(universityId);
            return json({ coaches });
        }
        case 'coach-logs': {
            const logs = await getCoachLogsForDate(universityId, date);
            return json({ logs, date });
        }
        case 'monthly-coach-report': {
            const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()));
            const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1));
            const report = await getMonthlyCoachReport(universityId, year, month);
            return json({ report, year, month });
        }

        default:
            throw error(400, `Invalid view: ${view}`);
    }
};

export const POST: RequestHandler = async ({ request, locals }) => {
    checkAccess(locals);
    await ensureInstructorTables();

    const body = await request.json();
    const action = body.action;
    const userId = locals.user!.id;

    switch (action) {
        // ─── Faculty profiles ─────────────────────────────
        case 'add-faculty': {
            const { university_id, name, email, phone, designation, department, subjects } = body;
            if (!university_id || !name) throw error(400, 'university_id and name required');
            const profile = await createInstructorProfile({
                university_id, name, email, phone, designation, department,
                subjects: subjects || [], created_by: userId
            });
            return json({ success: true, profile });
        }

        case 'update-faculty': {
            const { id, ...updates } = body;
            if (!id) throw error(400, 'id required');
            const profile = await updateInstructorProfile(id, updates);
            return json({ success: true, profile });
        }

        case 'remove-faculty': {
            const { id } = body;
            if (!id) throw error(400, 'id required');
            const profile = await deactivateInstructor(id);
            return json({ success: true, profile });
        }

        // ─── Attendance marking ───────────────────────────
        case 'mark-attendance': {
            const { instructor_id, university_id, date: d, status, notes } = body;
            if (!instructor_id || !university_id || !d || !status) {
                throw error(400, 'instructor_id, university_id, date, status required');
            }
            const result = await markAttendance({
                instructor_id, university_id, date: d, status, notes, marked_by: userId
            });
            return json({ success: true, attendance: result });
        }

        case 'mark-bulk-attendance': {
            const { entries } = body;
            if (!entries || !Array.isArray(entries) || entries.length === 0) {
                throw error(400, 'entries array required');
            }
            const results = await markBulkAttendance(
                entries.map((e: any) => ({ ...e, marked_by: userId }))
            );
            return json({ success: true, count: results.length });
        }

        case 'clear-attendance': {
            const { instructor_id, date: d } = body;
            if (!instructor_id || !d) throw error(400, 'instructor_id and date required');
            await clearAttendance(instructor_id, d);
            return json({ success: true });
        }

        // ─── Workload logging ─────────────────────────────
        case 'log-workload': {
            const { instructor_id, university_id, date: d, sessions_taken, subjects_taught, topics_covered, workload_notes } = body;
            if (!instructor_id || !university_id || !d) {
                throw error(400, 'instructor_id, university_id, date required');
            }
            const log = await upsertWorkloadLog({
                instructor_id, university_id, date: d,
                sessions_taken: sessions_taken || 0,
                subjects_taught: subjects_taught || [],
                topics_covered, workload_notes, logged_by: userId
            });
            return json({ success: true, log });
        }

        // ── Success Coaches ───────────────────────────
        case 'add-coach': {
            const { university_id, name, email, phone, daily_call_target } = body;
            if (!university_id || !name) throw error(400, 'university_id and name required');
            const coach = await createCoachProfile({
                university_id, name, email, phone,
                daily_call_target: daily_call_target || 15, created_by: userId
            });
            return json({ success: true, coach });
        }
        case 'update-coach': {
            const { id, ...updates } = body;
            if (!id) throw error(400, 'id required');
            const coach = await updateCoachProfile(id, updates);
            return json({ success: true, coach });
        }
        case 'remove-coach': {
            const { id } = body;
            if (!id) throw error(400, 'id required');
            const coach = await deactivateCoach(id);
            return json({ success: true, coach });
        }
        case 'log-coach-calls': {
            const { coach_id, university_id, date: d, student_calls_made, parent_calls_made, daily_target, notes: n } = body;
            if (!coach_id || !university_id || !d) throw error(400, 'coach_id, university_id, date required');
            const log = await upsertCoachDailyLog({
                coach_id, university_id, date: d,
                student_calls_made: student_calls_made || 0,
                parent_calls_made: parent_calls_made || 0,
                daily_target: daily_target || 15,
                notes: n, logged_by: userId
            });
            return json({ success: true, log });
        }

        default:
            throw error(400, `Unknown action: ${action}`);
    }
};
