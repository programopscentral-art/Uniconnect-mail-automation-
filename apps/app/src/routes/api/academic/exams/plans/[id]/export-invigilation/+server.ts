import { ExamService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

function esc(v: any): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

interface ClassroomRow {
    classroomName: string;
    invigilators: string[];
    subjects: string[];
    subjectCodes: string[];
}
interface SlotGroup {
    examDate: string;
    slotStart: string;
    slotEnd: string;
    classrooms: ClassroomRow[];
}

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    try {
        const assignments = await ExamService.getInvigilationAssignments(params.id);
        if (!assignments || assignments.length === 0) throw error(404, 'No invigilation assignments found');

        const planRes = await db.query('SELECT exam_name FROM exam_plans WHERE id = $1', [params.id]);
        const planName = planRes.rows[0]?.exam_name || 'Exam Plan';

        // Group by slot → classroom (same logic as frontend)
        const slotMap = new Map<string, { examDate: string; slotStart: string; slotEnd: string; classroomMap: Map<string, ClassroomRow> }>();
        for (const a of assignments) {
            const slotKey = `${a.exam_date}_${a.slot_start}`;
            if (!slotMap.has(slotKey)) {
                slotMap.set(slotKey, { examDate: a.exam_date, slotStart: a.slot_start, slotEnd: a.slot_end, classroomMap: new Map() });
            }
            const slot = slotMap.get(slotKey)!;
            const cId = a.classroom_id || 'unknown';
            const cName = a.classroom_name || '—';
            if (!slot.classroomMap.has(cId)) {
                slot.classroomMap.set(cId, { classroomName: cName, invigilators: [], subjects: [], subjectCodes: [] });
            }
            const room = slot.classroomMap.get(cId)!;
            const fName = a.faculty_name || 'Unknown';
            if (!room.invigilators.includes(fName)) room.invigilators.push(fName);
            if (a.all_subjects) {
                for (const s of a.all_subjects.split(', ')) {
                    if (s && !room.subjects.includes(s)) room.subjects.push(s);
                }
            }
            if (a.all_subject_codes) {
                for (const c of a.all_subject_codes.split(', ')) {
                    if (c && !room.subjectCodes.includes(c)) room.subjectCodes.push(c);
                }
            }
        }

        const slots: SlotGroup[] = [...slotMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, val]) => ({
                examDate: val.examDate,
                slotStart: val.slotStart,
                slotEnd: val.slotEnd,
                classrooms: [...val.classroomMap.values()].sort((a, b) => a.classroomName.localeCompare(b.classroomName))
            }));

        const totalClassrooms = new Set(assignments.map((a: any) => a.classroom_id).filter(Boolean)).size;
        const totalFaculty = new Set(assignments.map((a: any) => a.faculty_profile_id)).size;

        let tablesHtml = '';
        for (const slot of slots) {
            tablesHtml += `
            <div class="slot-section">
                <div class="slot-header">
                    <span class="date-badge">${fmtDate(slot.examDate)}</span>
                    <span class="time-badge">${fmtTime(slot.slotStart)} — ${fmtTime(slot.slotEnd)}</span>
                    <span class="count-badge">${slot.classrooms.length} classrooms</span>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-room">Classroom</th>
                            <th class="col-inv">Invigilators</th>
                            <th class="col-sub">Subjects</th>
                        </tr>
                    </thead>
                    <tbody>`;
            for (let i = 0; i < slot.classrooms.length; i++) {
                const room = slot.classrooms[i];
                tablesHtml += `
                        <tr>
                            <td class="col-num">${i + 1}</td>
                            <td class="col-room"><strong>${esc(room.classroomName)}</strong></td>
                            <td class="col-inv">${room.invigilators.map(n => `<span class="inv-badge">${esc(n)}</span>`).join(' ')}</td>
                            <td class="col-sub">${room.subjects.map((s, si) => `<span class="sub-badge">${esc(s)}${room.subjectCodes[si] ? ` <small>(${esc(room.subjectCodes[si])})</small>` : ''}</span>`).join(' ')}</td>
                        </tr>`;
            }
            tablesHtml += `
                    </tbody>
                </table>
            </div>`;
        }

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Invigilation Duty — ${esc(planName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fff}

.toolbar{position:sticky;top:0;z-index:100;background:#1e293b;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.toolbar-left{display:flex;align-items:center;gap:12px}
.toolbar-title{color:#fff;font-size:14px;font-weight:800;letter-spacing:.5px}
.toolbar-subtitle{color:#94a3b8;font-size:11px;font-weight:600}
.toolbar-right{display:flex;gap:8px}
.toolbar-btn{padding:8px 16px;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
.btn-print{background:#4f46e5;color:#fff}.btn-print:hover{background:#4338ca}
.btn-download{background:#059669;color:#fff}.btn-download:hover{background:#047857}

.content{padding:24px 32px}
.page-header{text-align:center;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #e5e7eb}
.page-header h1{font-size:26px;font-weight:900;color:#0d9488;letter-spacing:1px;text-transform:uppercase}
.page-header .plan-name{font-size:15px;font-weight:700;color:#1e293b;margin-top:4px}
.page-header .meta{font-size:12px;color:#64748b;margin-top:4px}

.slot-section{margin-bottom:28px}
.slot-header{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.date-badge{display:inline-block;padding:5px 14px;background:#4f46e5;color:#fff;border-radius:6px;font-size:12px;font-weight:800}
.time-badge{font-size:12px;font-weight:700;color:#475569}
.count-badge{font-size:11px;font-weight:600;color:#94a3b8}

table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
thead th{background:#f1f5f9;text-align:left;padding:10px 12px;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:2px solid #e2e8f0}
tbody td{padding:10px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tbody tr:hover td{background:#f8fafc}
.col-num{width:36px;text-align:center;color:#94a3b8;font-weight:700}
.col-room{width:160px}
.col-room strong{font-size:13px;color:#1e293b}
.col-inv{min-width:200px}
.col-sub{min-width:200px}

.inv-badge{display:inline-block;padding:3px 10px;background:#ccfbf1;color:#0f766e;border:1px solid #99f6e4;border-radius:6px;font-size:11px;font-weight:700;margin:2px 3px 2px 0}
.sub-badge{display:inline-block;padding:3px 10px;background:#e0e7ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:6px;font-size:11px;font-weight:700;margin:2px 3px 2px 0}
.sub-badge small{font-weight:600;color:#6366f1;font-size:9px}

/* Mobile responsive */
@media (max-width:768px){
    .toolbar{flex-direction:column;gap:8px;padding:10px 12px}
    .toolbar-left{width:100%}
    .toolbar-right{width:100%;justify-content:stretch}
    .toolbar-btn{flex:1;justify-content:center;padding:10px 8px;font-size:11px;min-height:44px}
    .content{padding:12px 8px}
    .page-header h1{font-size:18px}
    .page-header .plan-name{font-size:13px}
    .slot-header{gap:6px}
    .date-badge{font-size:10px;padding:4px 10px}
    .time-badge{font-size:10px}
    table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;font-size:11px}
    thead th{padding:8px 6px;font-size:9px}
    tbody td{padding:8px 6px}
    .col-room{min-width:100px}
    .col-inv{min-width:140px}
    .col-sub{min-width:140px}
    .inv-badge,.sub-badge{font-size:10px;padding:3px 6px;margin:1px 2px 1px 0}
    .col-room strong{font-size:11px}
}

@media print{
    .toolbar{display:none!important}
    .content{padding:12px 16px}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .slot-section{page-break-inside:avoid}
}
@page{size:A4 landscape;margin:10mm}
</style></head><body>

<div class="toolbar">
    <div class="toolbar-left">
        <div>
            <div class="toolbar-title">INVIGILATION DUTY — ${esc(planName)}</div>
            <div class="toolbar-subtitle">${slots.length} slots &bull; ${totalClassrooms} classrooms &bull; ${totalFaculty} faculty</div>
        </div>
    </div>
    <div class="toolbar-right">
        <button class="toolbar-btn btn-print" onclick="window.print()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Print
        </button>
        <button class="toolbar-btn btn-download" onclick="downloadHTML()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download
        </button>
    </div>
</div>

<div class="content">
    <div class="page-header">
        <h1>Invigilation Duty Chart</h1>
        <p class="plan-name">${esc(planName)}</p>
        <p class="meta">${slots.length} exam slots &bull; ${totalClassrooms} classrooms &bull; ${totalFaculty} faculty assigned</p>
    </div>
    ${tablesHtml}
</div>

<script>
function downloadHTML() {
    try {
        var content = document.documentElement.outerHTML;
        var blob = new Blob([content], { type: 'text/html' });
        if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
            var file = new File([blob], 'invigilation-duty.html', { type: 'text/html' });
            navigator.share({ files: [file], title: 'Invigilation Duty' }).catch(function() { fallbackDL(blob); });
        } else { fallbackDL(blob); }
    } catch(e) { alert('Download failed. Try Save Page from browser menu.'); }
}
function fallbackDL(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invigilation-duty.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
}
</script>
</body></html>`;

        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `inline; filename="invigilation-${params.id}.html"`
            }
        });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};
