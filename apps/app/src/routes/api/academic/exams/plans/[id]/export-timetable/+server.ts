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

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const format = url.searchParams.get('format') || 'datewise';

    try {
        const exams = await ExamService.getExamSchedule(params.id);
        if (!exams || exams.length === 0) throw error(404, 'No exams found in this plan');

        let csv: string;

        if (format === 'branchwise') {
            csv = buildBranchwiseCSV(exams);
        } else {
            csv = buildDatewiseCSV(exams);
        }

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="timetable-${params.id}-${format}.csv"`
            }
        });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};

function buildDatewiseCSV(exams: any[]): string {
    let csv = 'Date,Time Slot,Subject Code,Subject Name,Section,Classroom\n';
    for (const exam of exams) {
        const date = exam.exam_date instanceof Date
            ? exam.exam_date.toISOString().split('T')[0]
            : String(exam.exam_date).split('T')[0];
        const timeSlot = `${exam.slot_start}-${exam.slot_end}`;
        csv += [
            escapeCSV(date),
            escapeCSV(timeSlot),
            escapeCSV(exam.subject_code),
            escapeCSV(exam.subject_name),
            escapeCSV(exam.section_name),
            escapeCSV(exam.classroom_name)
        ].join(',') + '\n';
    }
    return csv;
}

function buildBranchwiseCSV(exams: any[]): string {
    // Rows = branches (programs), Columns = dates with time slot sub-columns
    const branches = [...new Set(exams.map((e: any) => e.program_name || e.section_name))].sort();

    // Collect unique dates and time slots
    const dates: string[] = [];
    const dateSet = new Set<string>();
    const slotLabels: string[] = [];
    const slotSet = new Set<string>();

    for (const exam of exams) {
        const date = exam.exam_date instanceof Date
            ? exam.exam_date.toISOString().split('T')[0]
            : String(exam.exam_date).split('T')[0];
        if (!dateSet.has(date)) { dateSet.add(date); dates.push(date); }
        const slot = `${exam.slot_start}-${exam.slot_end}`;
        if (!slotSet.has(slot)) { slotSet.add(slot); slotLabels.push(slot); }
    }
    dates.sort();

    // Build date+slot column keys
    const columns: Array<{ date: string; slot: string; label: string }> = [];
    for (const date of dates) {
        for (const slot of slotLabels) {
            const fmtDate = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            columns.push({ date, slot, label: `${fmtDate} (${slot})` });
        }
    }

    // Build lookup: branch -> "date|slot" -> subject info
    const lookup = new Map<string, Map<string, string>>();
    for (const exam of exams) {
        const branch = exam.program_name || exam.section_name;
        const date = exam.exam_date instanceof Date
            ? exam.exam_date.toISOString().split('T')[0]
            : String(exam.exam_date).split('T')[0];
        const slot = `${exam.slot_start}-${exam.slot_end}`;
        const key = `${date}|${slot}`;

        if (!lookup.has(branch)) lookup.set(branch, new Map());
        const cell = exam.subject_code || exam.subject_name;
        const existing = lookup.get(branch)!.get(key);
        lookup.get(branch)!.set(key, existing ? `${existing}; ${cell}` : cell);
    }

    // Header row
    let csv = escapeCSV('Branch');
    for (const col of columns) {
        csv += ',' + escapeCSV(col.label);
    }
    csv += '\n';

    // Data rows: one per branch
    for (const branch of branches) {
        const row = [escapeCSV(branch)];
        for (const col of columns) {
            const key = `${col.date}|${col.slot}`;
            row.push(escapeCSV(lookup.get(branch)?.get(key) || ''));
        }
        csv += row.join(',') + '\n';
    }

    return csv;
}
