import { ExamService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

function esc(v: any): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(d: string) {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const format = url.searchParams.get('format') || 'branchwise';

    try {
        const exams = await ExamService.getExamSchedule(params.id);
        if (!exams || exams.length === 0) throw error(404, 'No exams found in this plan');

        // Get plan name
        const planRes = await db.query('SELECT exam_name FROM exam_plans WHERE id = $1', [params.id]);
        const planName = planRes.rows[0]?.exam_name || 'Exam Timetable';

        const branchwiseHtml = buildBranchwiseHTML(exams);
        const datewiseHtml = buildDatewiseHTML(exams);

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(planName)} — Timetable</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fff}

/* Toolbar */
.toolbar{position:sticky;top:0;z-index:100;background:#1e293b;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.toolbar-left{display:flex;align-items:center;gap:16px}
.toolbar-title{color:#fff;font-size:14px;font-weight:800;letter-spacing:.5px}
.toolbar-subtitle{color:#94a3b8;font-size:11px;font-weight:600}
.toolbar-right{display:flex;gap:8px;align-items:center}
.toolbar-btn{padding:8px 16px;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
.btn-print{background:#4f46e5;color:#fff}.btn-print:hover{background:#4338ca}
.btn-download{background:#059669;color:#fff}.btn-download:hover{background:#047857}

/* View toggle */
.view-toggle{display:flex;background:#334155;border-radius:6px;overflow:hidden}
.view-btn{padding:7px 14px;border:none;background:transparent;color:#94a3b8;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s}
.view-btn.active{background:#4f46e5;color:#fff}
.view-btn:hover:not(.active){color:#e2e8f0}

.content-area{padding:24px 32px}
.page-header{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb}
.page-header h1{font-size:28px;font-weight:900;color:#4f46e5;letter-spacing:1px;text-transform:uppercase}
.page-header .plan-name{font-size:16px;font-weight:700;color:#1e293b;margin-top:4px}
.page-header .meta{font-size:12px;color:#64748b;margin-top:4px}
table.timetable{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px}
table.timetable th{background:#4f46e5;color:#fff;text-align:center;padding:10px 8px;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border:1px solid #4338ca}
table.timetable th.branch-header{background:#1e293b;text-align:left;min-width:120px}
table.timetable th.slot-header{background:#6366f1;font-size:9px}
table.timetable td{padding:8px 6px;border:1px solid #e2e8f0;text-align:center;vertical-align:middle}
table.timetable td.branch-cell{text-align:left;font-weight:800;color:#1e293b;background:#f8fafc;white-space:nowrap}
table.timetable td.subject-cell{font-weight:700;color:#475569;font-size:10px;line-height:1.3}
.sub-name{font-size:10px;font-weight:800;color:#4f46e5}
.sub-code{font-size:9px;font-weight:600;color:#475569}
table.timetable td.subject-cell:not(:empty){background:#f0f9ff}
table.timetable tr:nth-child(even) td{background:#fafbfc}
table.timetable tr:nth-child(even) td.subject-cell:not(:empty){background:#eff6ff}
table.timetable tr:hover td{background:#f1f5f9}
.date-group{margin-top:24px;margin-bottom:8px}
.date-badge{display:inline-block;padding:4px 12px;background:#4f46e5;color:#fff;border-radius:6px;font-size:12px;font-weight:800}
.slot-badge{display:inline-block;margin-left:8px;font-size:11px;font-weight:600;color:#64748b}
table.datewise{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
table.datewise th{background:#f1f5f9;text-align:left;padding:8px 10px;font-weight:800;font-size:10px;text-transform:uppercase;color:#475569;border-bottom:2px solid #e2e8f0}
table.datewise td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
table.datewise tr:hover td{background:#f8fafc}
.bold{font-weight:700}

@media print{
    .toolbar{display:none!important}
    .content-area{padding:12px 16px}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@page{size:A4 landscape;margin:10mm}
</style></head><body>

<div class="toolbar">
    <div class="toolbar-left">
        <div>
            <div class="toolbar-title">EXAM TIMETABLE — ${esc(planName)}</div>
            <div class="toolbar-subtitle">${exams.length} exams &bull; ${new Set(exams.map((e: any) => e.program_name)).size} branches</div>
        </div>
        <div class="view-toggle">
            <button class="view-btn${format === 'branchwise' ? ' active' : ''}" id="btn-branchwise" onclick="switchView('branchwise')">Branch-wise</button>
            <button class="view-btn${format === 'datewise' ? ' active' : ''}" id="btn-datewise" onclick="switchView('datewise')">Date-wise</button>
        </div>
    </div>
    <div class="toolbar-right">
        <button class="toolbar-btn btn-print" onclick="window.print()" title="Print timetable">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Print
        </button>
        <button class="toolbar-btn btn-download" onclick="downloadHTML()" title="Download as HTML file">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download
        </button>
    </div>
</div>

<div class="content-area">
    <div class="page-header">
        <h1>EXAM TIMETABLE</h1>
        <p class="plan-name">${esc(planName)}</p>
        <p class="meta">${exams.length} exams &bull; ${new Set(exams.map((e: any) => e.program_name)).size} branches</p>
    </div>
    <div id="view-branchwise" style="${format === 'datewise' ? 'display:none' : ''}">${branchwiseHtml}</div>
    <div id="view-datewise" style="${format === 'branchwise' ? 'display:none' : ''}">${datewiseHtml}</div>
</div>

<script>
function switchView(view) {
    document.getElementById('view-branchwise').style.display = view === 'branchwise' ? '' : 'none';
    document.getElementById('view-datewise').style.display = view === 'datewise' ? '' : 'none';
    document.getElementById('btn-branchwise').classList.toggle('active', view === 'branchwise');
    document.getElementById('btn-datewise').classList.toggle('active', view === 'datewise');
}

function downloadHTML() {
    var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable-${params.id}.html';
    a.click();
    URL.revokeObjectURL(a.href);
}
</script>
</body></html>`;

        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `inline; filename="timetable-${params.id}-${format}.html"`
            }
        });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};

function buildDatewiseHTML(exams: any[]): string {
    // Group by date+slot
    const groups = new Map<string, any[]>();
    for (const exam of exams) {
        const date = exam.exam_date instanceof Date ? exam.exam_date.toISOString().split('T')[0] : String(exam.exam_date).split('T')[0];
        const key = `${date}|${exam.slot_start}|${exam.slot_end}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ ...exam, _date: date });
    }
    const sortedKeys = [...groups.keys()].sort();

    let html = '';
    for (const key of sortedKeys) {
        const items = groups.get(key)!;
        const first = items[0];
        html += `<div class="date-group">
            <span class="date-badge">${fmtDate(first._date)}</span>
            <span class="slot-badge">${fmtTime(first.slot_start)} — ${fmtTime(first.slot_end)}</span>
        </div>`;
        html += `<table class="datewise"><thead><tr><th>Subject Code</th><th>Subject</th><th>Section</th><th>Branch</th><th>Classroom</th></tr></thead><tbody>`;
        for (const e of items) {
            html += `<tr><td class="bold">${esc(e.subject_code)}</td><td>${esc(e.subject_name)}</td><td>${esc(e.section_name)}</td><td>${esc(e.program_name)}</td><td>${esc(e.classroom_name || '—')}</td></tr>`;
        }
        html += '</tbody></table>';
    }
    return html;
}

function buildBranchwiseHTML(exams: any[]): string {
    const branchMap = new Map<string, string>();
    for (const e of exams) {
        const bid = e.program_id || e.section_id;
        const bname = e.program_name || e.section_name || 'Unknown';
        if (bid && !branchMap.has(bid)) {
            branchMap.set(bid, bname);
        }
    }
    const branches = [...branchMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    const colSet = new Map<string, { date: string; slot_start: string; slot_end: string }>();
    for (const exam of exams) {
        const date = exam.exam_date instanceof Date ? exam.exam_date.toISOString().split('T')[0] : String(exam.exam_date).split('T')[0];
        const key = `${date}|${exam.slot_start}|${exam.slot_end}`;
        if (!colSet.has(key)) colSet.set(key, { date, slot_start: exam.slot_start, slot_end: exam.slot_end });
    }
    const columns = [...colSet.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const lookup = new Map<string, Map<string, string[]>>();
    for (const exam of exams) {
        const pid = exam.program_id || exam.section_id;
        if (!pid) continue;
        const date = exam.exam_date instanceof Date ? exam.exam_date.toISOString().split('T')[0] : String(exam.exam_date).split('T')[0];
        const key = `${date}|${exam.slot_start}|${exam.slot_end}`;
        if (!lookup.has(pid)) lookup.set(pid, new Map());
        const cellMap = lookup.get(pid)!;
        if (!cellMap.has(key)) cellMap.set(key, []);
        const subDisplay = exam.subject_code && exam.subject_name
            ? `${exam.subject_name}\n${exam.subject_code}`
            : (exam.subject_name || exam.subject_code || '—');
        if (!cellMap.get(key)!.includes(subDisplay)) cellMap.get(key)!.push(subDisplay);
    }

    let html = '<table class="timetable"><thead>';
    html += '<tr><th class="branch-header" rowspan="2">Branch</th>';
    const dateGroups = new Map<string, number>();
    for (const [, col] of columns) {
        if (!dateGroups.has(col.date)) dateGroups.set(col.date, 0);
        dateGroups.set(col.date, dateGroups.get(col.date)! + 1);
    }
    for (const [date, count] of dateGroups) {
        html += `<th colspan="${count}">${fmtDate(date)}</th>`;
    }
    html += '</tr>';
    html += '<tr>';
    for (const [, col] of columns) {
        html += `<th class="slot-header">${fmtTime(col.slot_start)}-${fmtTime(col.slot_end)}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const [pid, pname] of branches) {
        html += `<tr><td class="branch-cell">${esc(pname)}</td>`;
        for (const [key] of columns) {
            const subjects = lookup.get(pid)?.get(key) || [];
            html += `<td class="subject-cell">${subjects.map(s => {
                const lines = s.split('\n');
                if (lines.length === 2) {
                    return `<span class="sub-name">${esc(lines[0])}</span><br><span class="sub-code">${esc(lines[1])}</span>`;
                }
                return esc(s);
            }).join('<hr style="margin:4px 0;border-color:#e2e8f0">')}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    return html;
}
