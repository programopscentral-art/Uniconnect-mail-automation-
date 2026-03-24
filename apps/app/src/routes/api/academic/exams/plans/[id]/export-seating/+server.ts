import { ExamService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

const SECTION_COLORS = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
    '#84cc16', '#d946ef', '#0ea5e9', '#ef4444', '#eab308',
];

function esc(v: any): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function getSectionColor(id: string, map: Map<string, number>): string {
    if (!map.has(id)) map.set(id, map.size % SECTION_COLORS.length);
    return SECTION_COLORS[map.get(id)!];
}
function contrastText(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff';
}
function fmtDate(d: string) {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(d: string) {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    try {
        const exams = await ExamService.getExamSchedule(params.id);
        if (!exams || exams.length === 0) throw error(404, 'No exams found in this plan');

        const planName = exams[0]?.exam_plan_name || 'Exam Plan';
        const sectionColorMap = new Map<string, number>();

        // Group exams by slot (date + time)
        const slotMap = new Map<string, { date: string; slot_start: string; slot_end: string; exams: any[] }>();
        for (const exam of exams) {
            const date = exam.exam_date instanceof Date ? exam.exam_date.toISOString().split('T')[0] : String(exam.exam_date).split('T')[0];
            const key = `${date}|${exam.slot_start}|${exam.slot_end}`;
            if (!slotMap.has(key)) slotMap.set(key, { date, slot_start: exam.slot_start, slot_end: exam.slot_end, exams: [] });
            slotMap.get(key)!.exams.push(exam);
        }
        const slots = [...slotMap.values()].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot_start < b.slot_start ? -1 : 1);

        // Build structured data: slot tabs -> classroom sub-tabs -> page content
        interface SlotTab {
            id: string;
            label: string;
            dateLabel: string;
            classrooms: { id: string; name: string; pageHtml: string }[];
        }
        const slotTabs: SlotTab[] = [];

        for (let si = 0; si < slots.length; si++) {
            const slot = slots[si];
            const subjects = [...new Set(slot.exams.map(e => e.subject_name))].sort();
            const subjectLine = subjects.join(', ');
            const dateLine = `${fmtDate(slot.date)} &bull; ${fmtTime(slot.slot_start)} — ${fmtTime(slot.slot_end)}`;
            const slotId = `slot-${si}`;
            const slotLabel = `${fmtDateShort(slot.date)} ${fmtTime(slot.slot_start)}`;

            const firstExamId = slot.exams[0].id;
            const plans = await ExamService.getSeatingPlan(firstExamId);
            const planList = Array.isArray(plans) ? plans : plans ? [plans] : [];

            // Pre-scan colors
            for (const plan of planList) {
                if (!plan?.seating_data_json) continue;
                const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
                for (const a of data.assignments || []) getSectionColor(a.section_id, sectionColorMap);
            }

            const classrooms: SlotTab['classrooms'] = [];

            for (let ci = 0; ci < planList.length; ci++) {
                const plan = planList[ci];
                if (!plan?.seating_data_json) continue;
                const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
                const assignments: any[] = data.assignments || [];
                const rows = plan.bench_rows || 5;
                const cols = plan.bench_columns || 6;
                const seatsPerBench = plan.seats_per_bench || 2;
                const totalBenches = plan.total_benches || (rows * cols);

                const lookup = new Map<string, any>();
                for (const a of assignments) lookup.set(`${a.bench_row}-${a.bench_col}-${a.seat}`, a);

                let gridHtml = '<tr><th class="row-label"></th>';
                for (let c = 0; c < cols; c++) gridHtml += `<th class="col-label">${c + 1}</th>`;
                gridHtml += '</tr>';

                for (let r = 0; r < rows; r++) {
                    const rl = String.fromCharCode(65 + r);
                    gridHtml += `<tr><td class="row-label">${rl}</td>`;
                    for (let c = 0; c < cols; c++) {
                        if (r * cols + c >= totalBenches) {
                            gridHtml += '<td class="bench"><div class="bench-box inactive-box"></div></td>';
                            continue;
                        }
                        let seatsHtml = '';
                        for (let s = 0; s < seatsPerBench; s++) {
                            const a = lookup.get(`${r}-${c}-${s}`);
                            const sl = `${rl}${c + 1}-S${s + 1}`;
                            if (a) {
                                const color = getSectionColor(a.section_id, sectionColorMap);
                                seatsHtml += `<div class="seat occupied" style="background:${color};color:${contrastText(color)};"><span class="seat-pos">${sl}</span><span class="roll">${esc(a.enrollment_no || '?')}</span><span class="section">${esc(a.section_name)}</span></div>`;
                            } else {
                                seatsHtml += `<div class="seat empty"><span class="seat-pos">${sl}</span><span class="empty-label">Empty</span></div>`;
                            }
                        }
                        gridHtml += `<td class="bench"><div class="bench-box">${seatsHtml}</div></td>`;
                    }
                    gridHtml += '</tr>';
                }

                const sorted = [...assignments].sort((a, b) => a.section_name !== b.section_name ? a.section_name.localeCompare(b.section_name) : (a.enrollment_no || '').localeCompare(b.enrollment_no || ''));
                let summaryRows = '';
                for (let i = 0; i < sorted.length; i++) {
                    const a = sorted[i];
                    const sl = `${String.fromCharCode(65 + a.bench_row)}${a.bench_col + 1}-S${a.seat + 1}`;
                    const color = getSectionColor(a.section_id, sectionColorMap);
                    summaryRows += `<tr><td>${i + 1}</td><td class="bold">${esc(a.enrollment_no)}</td><td>${esc(a.student_name)}</td><td><span class="section-badge" style="background:${color};color:${contrastText(color)}">${esc(a.section_name)}</span></td><td>${esc(a.program_name || '')}</td><td class="bold">${sl}</td></tr>`;
                }

                let legendHtml = '';
                const secs = new Map<string, string>();
                for (const a of assignments) if (!secs.has(a.section_id)) secs.set(a.section_id, a.section_name);
                for (const [secId, secName] of secs) {
                    const color = getSectionColor(secId, sectionColorMap);
                    legendHtml += `<span class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${esc(secName)}</span>`;
                }

                const classroomId = `${slotId}-room-${ci}`;
                const pageHtml = `
                <div class="classroom-page" id="${classroomId}">
                    <div class="header">
                        <h1>SEATING PLAN</h1>
                        <p class="plan-name">${esc(planName)}</p>
                        <div class="subject-info">
                            <p class="subject-line">${esc(subjectLine)}</p>
                            <p class="date-line">${dateLine}</p>
                        </div>
                        <h2>${esc(plan.classroom_name)}</h2>
                        <p class="meta">${data.total_seated || 0} students &bull; ${rows}&times;${cols} grid &bull; ${seatsPerBench} seats/bench</p>
                        <div class="legend">${legendHtml}</div>
                    </div>
                    <div class="grid-container">
                        <div class="board-indicator">BOARD / INVIGILATOR</div>
                        <table class="seating-grid">${gridHtml}</table>
                    </div>
                    <h3 class="summary-title">Student List &mdash; ${esc(plan.classroom_name)}</h3>
                    <table class="summary-table"><thead><tr><th>#</th><th>Roll No</th><th>Name</th><th>Section</th><th>Program</th><th>Seat</th></tr></thead><tbody>${summaryRows}</tbody></table>
                </div>`;

                classrooms.push({ id: classroomId, name: plan.classroom_name || `Room ${ci + 1}`, pageHtml });
            }

            slotTabs.push({ id: slotId, label: slotLabel, dateLabel: dateLine, classrooms });
        }

        // Build tab navigation HTML
        let slotTabsHtml = '';
        for (let i = 0; i < slotTabs.length; i++) {
            const tab = slotTabs[i];
            slotTabsHtml += `<button class="slot-tab${i === 0 ? ' active' : ''}" data-slot="${tab.id}" data-action="switch-slot">${esc(tab.label)}</button>`;
        }

        // Build classroom sub-tabs and pages per slot
        let contentHtml = '';
        for (let i = 0; i < slotTabs.length; i++) {
            const tab = slotTabs[i];
            let roomTabsHtml = '';
            for (let j = 0; j < tab.classrooms.length; j++) {
                const room = tab.classrooms[j];
                roomTabsHtml += `<button class="room-tab${j === 0 ? ' active' : ''}" data-slot="${tab.id}" data-room="${room.id}" data-action="switch-room">${esc(room.name)}</button>`;
            }

            let roomPagesHtml = '';
            for (let j = 0; j < tab.classrooms.length; j++) {
                roomPagesHtml += tab.classrooms[j].pageHtml;
            }

            contentHtml += `
            <div class="slot-content" id="content-${tab.id}" style="${i === 0 ? '' : 'display:none'}">
                <div class="room-tabs" id="roomtabs-${tab.id}">${roomTabsHtml}</div>
                <div class="room-pages" id="roompages-${tab.id}">${roomPagesHtml}</div>
            </div>`;
        }

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Seating Plan — ${esc(planName)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fff}

/* Toolbar */
.toolbar{position:sticky;top:0;z-index:100;background:#1e293b;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.toolbar-left{display:flex;align-items:center;gap:12px}
.toolbar-title{color:#fff;font-size:14px;font-weight:800;letter-spacing:.5px}
.toolbar-subtitle{color:#94a3b8;font-size:11px;font-weight:600}
.toolbar-right{display:flex;gap:8px}
.toolbar-btn{padding:8px 16px;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
.btn-print{background:#4f46e5;color:#fff}.btn-print:hover{background:#4338ca}
.btn-download{background:#059669;color:#fff}.btn-download:hover{background:#047857}
.btn-print-all{background:#7c3aed;color:#fff}.btn-print-all:hover{background:#6d28d9}

/* Slot tabs */
.slot-tabs{display:flex;gap:4px;padding:12px 24px 0;background:#f8fafc;border-bottom:2px solid #e2e8f0;overflow-x:auto;flex-wrap:wrap}
.slot-tab{padding:8px 16px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;border-bottom:3px solid transparent;border-radius:6px 6px 0 0;transition:all .15s;white-space:nowrap}
.slot-tab:hover{color:#4f46e5;background:#ede9fe}
.slot-tab.active{color:#4f46e5;background:#fff;border-bottom-color:#4f46e5;box-shadow:0 -2px 4px rgba(79,70,229,.1)}

/* Room sub-tabs */
.room-tabs{display:flex;gap:4px;padding:8px 24px;background:#fff;border-bottom:1px solid #e2e8f0;overflow-x:auto;flex-wrap:wrap}
.room-tab{padding:6px 14px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:11px;font-weight:700;cursor:pointer;border-radius:6px;transition:all .15s;white-space:nowrap}
.room-tab:hover{border-color:#4f46e5;color:#4f46e5;background:#ede9fe}
.room-tab.active{background:#4f46e5;color:#fff;border-color:#4f46e5}

/* Content */
.classroom-page{padding:24px 32px;display:none}
.classroom-page.active{display:block}
.header{text-align:center;margin-bottom:24px;border-bottom:2px solid #e5e7eb;padding-bottom:16px}
.header h1{font-size:28px;font-weight:900;color:#4f46e5;letter-spacing:1px;text-transform:uppercase}
.header .plan-name{font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-top:2px}
.header .subject-info{margin:10px auto;padding:10px 20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;display:inline-block}
.header .subject-line{font-size:16px;font-weight:800;color:#0369a1}
.header .date-line{font-size:12px;font-weight:600;color:#0284c7;margin-top:2px}
.header h2{font-size:20px;font-weight:700;color:#1e293b;margin-top:10px}
.header .meta{font-size:12px;color:#64748b;margin-top:6px}
.legend{display:flex;gap:16px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.legend-item{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#475569}
.legend-swatch{width:14px;height:14px;border-radius:3px;display:inline-block}
.grid-container{margin:0 auto 28px;text-align:center}
.board-indicator{text-align:center;font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;padding:4px 0;border-bottom:2px solid #e2e8f0;width:50%;margin-left:auto;margin-right:auto}
.seating-grid{border-collapse:collapse;margin:0 auto}
.seating-grid th,.seating-grid td{padding:3px}
.row-label{font-size:11px;font-weight:800;color:#94a3b8;text-align:center;width:24px}
.col-label{font-size:10px;font-weight:800;color:#94a3b8;text-align:center;padding-bottom:6px}
.bench-box{display:flex;gap:2px;padding:3px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px}
.bench-box.inactive-box{opacity:.15;background:#e5e7eb;min-height:52px;min-width:60px}
.seat{width:72px;height:62px;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px}
.seat.empty{background:#f1f5f9;border:1px dashed #cbd5e1}
.seat .seat-pos{font-size:6px;font-weight:600;opacity:.7;line-height:1}
.seat .roll{font-size:9px;font-weight:900;line-height:1.1;margin-top:1px}
.seat .section{font-size:7px;font-weight:600;opacity:.85;line-height:1.1;margin-top:1px}
.seat .empty-label{font-size:7px;color:#94a3b8;font-weight:600;margin-top:2px}
.summary-title{font-size:14px;font-weight:800;color:#1e293b;margin-bottom:10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;padding-left:32px}
.summary-table{width:calc(100% - 64px);margin:0 32px 20px;border-collapse:collapse;font-size:11px}
.summary-table th{background:#f1f5f9;text-align:left;padding:8px 10px;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:2px solid #e2e8f0}
.summary-table td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
.summary-table .bold{font-weight:700}
.section-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}

/* Mobile responsive */
@media (max-width:768px){
    .toolbar{flex-direction:column;gap:8px;padding:10px 12px}
    .toolbar-left{width:100%}
    .toolbar-right{width:100%;justify-content:stretch;flex-wrap:wrap}
    .toolbar-btn{flex:1;justify-content:center;padding:10px 8px;font-size:11px;min-height:44px}
    .slot-tabs{padding:8px 12px 0;gap:4px}
    .slot-tab{padding:8px 10px;font-size:11px;min-height:40px}
    .room-tabs{padding:6px 12px;gap:4px}
    .room-tab{padding:6px 10px;font-size:10px;min-height:36px}
    .classroom-page{padding:12px}
    .header h1{font-size:18px}
    .header h2{font-size:15px}
    .header .subject-line{font-size:13px}
    .grid-container{overflow-x:auto;-webkit-overflow-scrolling:touch}
    .seat{width:52px;height:48px}
    .seat .roll{font-size:7px}
    .seat .section{font-size:6px}
    .seat .seat-pos{font-size:5px}
    .board-indicator{width:80%}
    .summary-table{width:100%;margin:0 0 20px;font-size:10px}
    .summary-table th,.summary-table td{padding:4px 6px}
    .summary-title{padding-left:12px;font-size:12px}
    .legend{gap:8px}
    .legend-item{font-size:9px}
}

/* Print styles */
@media print{
    .toolbar,.slot-tabs,.room-tabs{display:none!important}
    .slot-content{display:block!important}
    .classroom-page{display:block!important;page-break-after:always;padding:12px 16px}
    .classroom-page:last-child{page-break-after:auto}
    .summary-table{width:100%;margin:0 0 20px}
    .summary-title{padding-left:0}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@media print and (prefers-color-scheme:light){body{background:#fff}}
@page{size:A4 landscape;margin:10mm}

/* Print current only */
body.print-current .slot-content{display:none!important}
body.print-current .slot-content.print-target{display:block!important}
body.print-current .slot-content.print-target .classroom-page{display:none!important}
body.print-current .slot-content.print-target .classroom-page.print-target-room{display:block!important}
</style></head><body>

<div class="toolbar">
    <div class="toolbar-left">
        <div>
            <div class="toolbar-title">SEATING PLAN — ${esc(planName)}</div>
            <div class="toolbar-subtitle">${slots.length} slots &bull; ${slotTabs.reduce((sum, s) => sum + s.classrooms.length, 0)} classrooms</div>
        </div>
    </div>
    <div class="toolbar-right">
        <button class="toolbar-btn btn-print" data-action="print-current" title="Print current classroom">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Print This Room
        </button>
        <button class="toolbar-btn btn-print-all" data-action="print-all" title="Print all classrooms">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Print All
        </button>
        <button class="toolbar-btn btn-download" data-action="download" title="Download as HTML file">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download
        </button>
    </div>
</div>

<div class="slot-tabs">${slotTabsHtml}</div>
${contentHtml}

<script>
(function() {
    var currentSlot = '${slotTabs[0]?.id || ''}';
    var currentRooms = {};
    ${slotTabs.map(s => `currentRooms['${s.id}'] = '${s.classrooms[0]?.id || ''}';`).join('\n    ')}

    function switchSlot(slotId) {
        currentSlot = slotId;
        document.querySelectorAll('.slot-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.slot === slotId); });
        document.querySelectorAll('.slot-content').forEach(function(c) { c.style.display = c.id === 'content-' + slotId ? '' : 'none'; });
        showRoom(slotId, currentRooms[slotId]);
    }

    function showRoom(slotId, roomId) {
        currentRooms[slotId] = roomId;
        var container = document.getElementById('roompages-' + slotId);
        if (!container) return;
        container.querySelectorAll('.classroom-page').forEach(function(p) { p.classList.toggle('active', p.id === roomId); });
        var tabContainer = document.getElementById('roomtabs-' + slotId);
        if (tabContainer) tabContainer.querySelectorAll('.room-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.room === roomId); });
    }

    function printCurrent() {
        var slotContent = document.getElementById('content-' + currentSlot);
        var roomPage = document.getElementById(currentRooms[currentSlot]);
        if (!slotContent || !roomPage) { window.print(); return; }
        document.body.classList.add('print-current');
        slotContent.classList.add('print-target');
        roomPage.classList.add('print-target-room');
        window.print();
        document.body.classList.remove('print-current');
        slotContent.classList.remove('print-target');
        roomPage.classList.remove('print-target-room');
    }

    function doDownload() {
        try {
            var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
            if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
                var file = new File([blob], 'seating-plan.html', { type: 'text/html' });
                navigator.share({ files: [file], title: 'Seating Plan' }).catch(function() { dlFallback(blob); });
            } else { dlFallback(blob); }
        } catch(e) { alert('Download failed. Try Save Page from browser menu.'); }
    }
    function dlFallback(blob) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'seating-plan.html';
        document.body.appendChild(a); a.click();
        setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
    }

    // Event delegation — works in local files, mobile, everywhere
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        if (action === 'switch-slot') switchSlot(btn.getAttribute('data-slot'));
        else if (action === 'switch-room') showRoom(btn.getAttribute('data-slot'), btn.getAttribute('data-room'));
        else if (action === 'print-current') printCurrent();
        else if (action === 'print-all') window.print();
        else if (action === 'download') doDownload();
    });

    // Initialize first room visibility
    ${slotTabs.map(s => s.classrooms.length > 0 ? `showRoom('${s.id}', '${s.classrooms[0].id}');` : '').join('\n    ')}
})();
</script>
</body></html>`;

        return new Response(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `inline; filename="seating-plan-all-${params.id}.html"`
            }
        });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};
