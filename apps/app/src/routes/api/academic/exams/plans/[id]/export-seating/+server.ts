import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

function escapeCSV(value: any): string {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    try {
        const exams = await ExamService.getExamSchedule(params.id);
        if (!exams || exams.length === 0) throw error(404, 'No exams found in this plan');

        let csv = 'Exam Date,Time Slot,Subject,Classroom,Bench Row,Bench Col,Seat,Student Name,Enrollment No,Section\n';

        for (const exam of exams) {
            const plans = await ExamService.getSeatingPlan(exam.id);
            const planList = Array.isArray(plans) ? plans : plans ? [plans] : [];

            const date = exam.exam_date instanceof Date
                ? exam.exam_date.toISOString().split('T')[0]
                : String(exam.exam_date).split('T')[0];
            const timeSlot = `${exam.slot_start}-${exam.slot_end}`;
            const subject = `${exam.subject_code} - ${exam.subject_name}`;

            for (const plan of planList) {
                if (!plan?.seating_data_json) continue;
                const data = typeof plan.seating_data_json === 'string'
                    ? JSON.parse(plan.seating_data_json)
                    : plan.seating_data_json;

                for (const a of data.assignments || []) {
                    csv += [
                        escapeCSV(date),
                        escapeCSV(timeSlot),
                        escapeCSV(subject),
                        escapeCSV(plan.classroom_name),
                        a.bench_row + 1,
                        a.bench_col + 1,
                        a.seat + 1,
                        escapeCSV(a.student_name),
                        escapeCSV(a.enrollment_no),
                        escapeCSV(a.section_name)
                    ].join(',') + '\n';
                }
            }
        }

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="seating-all-${params.id}.csv"`
            }
        });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};
