import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const classroomId = url.searchParams.get('classroomId') || undefined;

    try {
        const plans = await ExamService.getSeatingPlan(params.id, classroomId);
        const planList = Array.isArray(plans) ? plans : [plans];

        // Build CSV
        let csv = 'Classroom,Bench Row,Bench Col,Seat,Enrollment No,Student Name,Section,Program\n';
        for (const plan of planList) {
            if (!plan?.seating_data_json) continue;
            const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
            for (const a of data.assignments || []) {
                csv += `"${plan.classroom_name || ''}",${a.bench_row + 1},${a.bench_col + 1},${a.seat + 1},"${a.enrollment_no}","${a.student_name}","${a.section_name}","${a.program_name}"\n`;
            }
        }

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="seating-plan-${params.id}.csv"`
            }
        });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
