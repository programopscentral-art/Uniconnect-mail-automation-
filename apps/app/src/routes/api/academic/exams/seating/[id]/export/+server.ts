import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

function escapeCSV(value: any): string {
    const str = String(value ?? '');
    // Escape quotes by doubling them, wrap in quotes if contains comma, quote, or newline
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const classroomId = url.searchParams.get('classroomId') || undefined;

    try {
        const plans = await ExamService.getSeatingPlan(params.id, classroomId);
        const planList = Array.isArray(plans) ? plans : [plans];

        // Build CSV with proper escaping
        let csv = 'Classroom,Bench Row,Bench Col,Seat,Seat Label,Enrollment No,Student Name,Section,Program\n';
        for (const plan of planList) {
            if (!plan?.seating_data_json) continue;
            const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
            for (const a of data.assignments || []) {
                const seatLabel = `${String.fromCharCode(65 + a.bench_row)}${a.bench_col + 1}-S${a.seat + 1}`;
                csv += [
                    escapeCSV(plan.classroom_name),
                    a.bench_row + 1,
                    a.bench_col + 1,
                    a.seat + 1,
                    escapeCSV(seatLabel),
                    escapeCSV(a.enrollment_no),
                    escapeCSV(a.student_name),
                    escapeCSV(a.section_name),
                    escapeCSV(a.program_name)
                ].join(',') + '\n';
            }
        }

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="seating-plan-${params.id}.csv"`
            }
        });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
