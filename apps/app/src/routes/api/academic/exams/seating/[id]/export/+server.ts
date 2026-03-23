import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

const SECTION_COLORS = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
    '#84cc16', '#d946ef', '#0ea5e9', '#ef4444', '#eab308',
];

function esc(value: any): string {
    const str = String(value ?? '');
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getSectionColor(sectionId: string, map: Map<string, number>): string {
    if (!map.has(sectionId)) {
        map.set(sectionId, map.size % SECTION_COLORS.length);
    }
    return SECTION_COLORS[map.get(sectionId)!];
}

function contrastText(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const classroomId = url.searchParams.get('classroomId') || undefined;

    try {
        const plans = await ExamService.getSeatingPlan(params.id, classroomId);
        const planList = Array.isArray(plans) ? plans : [plans];

        const sectionColorMap = new Map<string, number>();

        // Pre-scan all sections for color assignment
        for (const plan of planList) {
            if (!plan?.seating_data_json) continue;
            const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
            for (const a of data.assignments || []) {
                getSectionColor(a.section_id, sectionColorMap);
            }
        }

        let classroomPages = '';

        for (const plan of planList) {
            if (!plan?.seating_data_json) continue;
            const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
            const assignments: any[] = data.assignments || [];
            const rows = plan.bench_rows || 5;
            const cols = plan.bench_columns || 6;
            const seatsPerBench = plan.seats_per_bench || 2;
            const totalBenches = plan.total_benches || (rows * cols);

            // Build assignment lookup
            const lookup = new Map<string, any>();
            for (const a of assignments) {
                lookup.set(`${a.bench_row}-${a.bench_col}-${a.seat}`, a);
            }

            // Build grid HTML
            let gridHtml = '';
            // Column header row
            gridHtml += '<tr><th class="row-label"></th>';
            for (let c = 0; c < cols; c++) {
                gridHtml += `<th class="col-label" colspan="1">${c + 1}</th>`;
            }
            gridHtml += '</tr>';

            for (let r = 0; r < rows; r++) {
                const rowLabel = String.fromCharCode(65 + r);
                gridHtml += `<tr><td class="row-label">${rowLabel}</td>`;
                for (let c = 0; c < cols; c++) {
                    const benchNum = r * cols + c;
                    const isActive = benchNum < totalBenches;
                    if (!isActive) {
                        gridHtml += '<td class="bench inactive"><div class="bench-box inactive-box"></div></td>';
                        continue;
                    }
                    let seatsHtml = '';
                    for (let s = 0; s < seatsPerBench; s++) {
                        const a = lookup.get(`${r}-${c}-${s}`);
                        const seatLabel = `${rowLabel}${c + 1}-S${s + 1}`;
                        if (a) {
                            const color = getSectionColor(a.section_id, sectionColorMap);
                            const textColor = contrastText(color);
                            seatsHtml += `<div class="seat occupied" style="background:${color};color:${textColor};">
                                <span class="seat-pos">${seatLabel}</span>
                                <span class="roll">${esc(a.enrollment_no || '?')}</span>
                                <span class="section">${esc(a.section_name)}</span>
                            </div>`;
                        } else {
                            seatsHtml += `<div class="seat empty"><span class="seat-pos">${seatLabel}</span><span class="empty-label">Empty</span></div>`;
                        }
                    }
                    gridHtml += `<td class="bench"><div class="bench-box">${seatsHtml}</div></td>`;
                }
                gridHtml += '</tr>';
            }

            // Build summary table
            const sorted = [...assignments].sort((a, b) => {
                if (a.section_name !== b.section_name) return a.section_name.localeCompare(b.section_name);
                return (a.enrollment_no || '').localeCompare(b.enrollment_no || '');
            });

            let summaryRows = '';
            for (let i = 0; i < sorted.length; i++) {
                const a = sorted[i];
                const seatLabel = `${String.fromCharCode(65 + a.bench_row)}${a.bench_col + 1}-S${a.seat + 1}`;
                const color = getSectionColor(a.section_id, sectionColorMap);
                summaryRows += `<tr>
                    <td>${i + 1}</td>
                    <td class="bold">${esc(a.enrollment_no)}</td>
                    <td>${esc(a.student_name)}</td>
                    <td><span class="section-badge" style="background:${color};color:${contrastText(color)}">${esc(a.section_name)}</span></td>
                    <td>${esc(a.program_name || '')}</td>
                    <td class="bold">${seatLabel}</td>
                </tr>`;
            }

            // Section legend
            const sectionsInPlan = new Map<string, string>();
            for (const a of assignments) {
                if (!sectionsInPlan.has(a.section_id)) {
                    sectionsInPlan.set(a.section_id, a.section_name);
                }
            }
            let legendHtml = '';
            for (const [secId, secName] of sectionsInPlan) {
                const color = getSectionColor(secId, sectionColorMap);
                legendHtml += `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${esc(secName)}</span>`;
            }

            classroomPages += `
            <div class="classroom-page">
                <div class="header">
                    <h1>Seating Plan</h1>
                    <h2>${esc(plan.classroom_name)}</h2>
                    <p class="meta">${data.total_seated || 0} students seated &bull; ${rows} rows &times; ${cols} columns &bull; ${seatsPerBench} seats per bench</p>
                    <div class="legend">${legendHtml}</div>
                </div>

                <div class="grid-container">
                    <div class="board-indicator">BOARD / INVIGILATOR</div>
                    <table class="seating-grid">
                        ${gridHtml}
                    </table>
                </div>

                <h3 class="summary-title">Student List &mdash; ${esc(plan.classroom_name)}</h3>
                <table class="summary-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Roll No</th>
                            <th>Name</th>
                            <th>Section</th>
                            <th>Program</th>
                            <th>Seat</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summaryRows}
                    </tbody>
                </table>
            </div>`;
        }

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Seating Plan</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #fff; }

    .classroom-page { padding: 24px 32px; }

    .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; }
    .header h1 { font-size: 28px; font-weight: 900; color: #4f46e5; letter-spacing: 1px; text-transform: uppercase; }
    .header h2 { font-size: 20px; font-weight: 700; color: #1e293b; margin-top: 4px; }
    .header .meta { font-size: 12px; color: #64748b; margin-top: 6px; }

    .legend { display: flex; gap: 16px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
    .legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #475569; }
    .legend-swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }

    .grid-container { margin: 0 auto 28px; text-align: center; }
    .board-indicator { text-align: center; font-size: 10px; font-weight: 800; color: #94a3b8; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 12px; padding: 4px 0; border-bottom: 2px solid #e2e8f0; width: 50%; margin-left: auto; margin-right: auto; }

    .seating-grid { border-collapse: collapse; margin: 0 auto; }
    .seating-grid th, .seating-grid td { padding: 3px; }
    .row-label { font-size: 11px; font-weight: 800; color: #94a3b8; text-align: center; width: 24px; }
    .col-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-align: center; padding-bottom: 6px; }

    .bench-box { display: flex; gap: 2px; padding: 3px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .bench-box.inactive-box { opacity: 0.15; background: #e5e7eb; min-height: 52px; min-width: 60px; }

    .seat { width: 72px; height: 62px; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; }
    .seat.occupied { }
    .seat.empty { background: #f1f5f9; border: 1px dashed #cbd5e1; }
    .seat .seat-pos { font-size: 6px; font-weight: 600; opacity: 0.7; line-height: 1; }
    .seat .roll { font-size: 9px; font-weight: 900; line-height: 1.1; margin-top: 1px; }
    .seat .section { font-size: 7px; font-weight: 600; opacity: 0.85; line-height: 1.1; margin-top: 1px; }
    .seat .empty-label { font-size: 7px; color: #94a3b8; font-weight: 600; margin-top: 2px; }

    .summary-title { font-size: 14px; font-weight: 800; color: #1e293b; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }

    .summary-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
    .summary-table th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    .summary-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
    .summary-table tr:hover td { background: #f8fafc; }
    .summary-table .bold { font-weight: 700; }

    .section-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }

    @media print {
        .classroom-page { page-break-after: always; padding: 12px 16px; }
        .classroom-page:last-child { page-break-after: auto; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }

    @page {
        size: A4 landscape;
        margin: 10mm;
    }
</style>
</head>
<body>
${classroomPages}
</body>
</html>`;

        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `inline; filename="seating-plan-${params.id}.html"`
            }
        });
    } catch (e: any) {
        throw error(500, e.message);
    }
};
