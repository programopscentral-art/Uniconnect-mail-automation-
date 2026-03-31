<script lang="ts">
    let { data } = $props();

    // ─── State ───────────────────────────────────────────────────
    let activeView = $state('overview');
    let sheetUrl = $state('');
    let syncDate = $state('');
    let isLoading = $state(true);
    let isSyncing = $state(false);
    let syncError = $state('');
    let syncSuccess = $state('');
    let viewData = $state<any>(null);
    let selectedDate = $state(new Date().toISOString().split('T')[0]);
    let selectedUniversity = $state('');
    let selectedRole = $state('All roles');
    let dateRange = $state('today');
    let allUniversities = $state<string[]>([]);
    let isDownloading = $state(false);

    const views = [
        { id: 'overview', label: 'Overview', icon: 'grid' },
        { id: 'sessions', label: 'Sessions', icon: 'list' },
        { id: 'attendance', label: 'Attendance', icon: 'users' },
        { id: 'at-risk', label: 'At-risk', icon: 'alert' },
        { id: 'instructors', label: 'Instructors', icon: 'chart' },
        { id: 'events', label: 'Events', icon: 'calendar' },
        { id: 'exams', label: 'Exams', icon: 'file' },
        { id: 'post-exam', label: 'Post-exam comms', icon: 'mail' },
        { id: 'per-university', label: 'Per university', icon: 'globe' },
        { id: 'team-activity', label: 'Team activity', icon: 'activity' },
        { id: 'daily-reports', label: 'Daily reports', icon: 'clipboard' },
        { id: 'compliance', label: 'Report compliance', icon: 'star' },
    ];

    const viewGroups: Record<string, string[]> = {
        'VIEWS': ['overview', 'sessions', 'attendance', 'at-risk', 'instructors', 'events', 'exams', 'post-exam', 'per-university'],
        'TEAM & COMPLIANCE': ['team-activity', 'daily-reports', 'compliance']
    };

    // ─── Data Fetching ───────────────────────────────────────────
    async function loadViewData() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                view: activeView,
                date: selectedDate,
                dateRange
            });
            if (selectedUniversity) params.set('university', selectedUniversity);
            if (selectedRole && selectedRole !== 'All roles') params.set('role', selectedRole);
            const res = await fetch(`/api/ops?${params}`);
            if (res.ok) {
                viewData = await res.json();
                // Keep a global list of universities
                if (viewData?.universities?.length) {
                    allUniversities = viewData.universities;
                }
            }
        } catch (e) {
            console.error('Failed to load ops data:', e);
        } finally {
            isLoading = false;
        }
    }

    async function syncSheet() {
        if (!sheetUrl) return;
        isSyncing = true;
        syncError = '';
        syncSuccess = '';
        try {
            const payload: any = { action: 'sync-sheet', sheetUrl };
            if (syncDate) payload.syncDate = syncDate;
            const res = await fetch('/api/ops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                syncError = '';
                const dateInfo = result.dates?.length ? ` → date(s): ${result.dates.join(', ')}` : '';
                syncSuccess = `Synced ${result.rowsProcessed} rows (${result.universityCount} universities)${dateInfo}`;
                // If synced with a specific date, switch to view that date
                if (syncDate) selectedDate = syncDate;
                await loadViewData();
            } else {
                syncError = result.error || 'Failed to sync sheet';
            }
        } catch (e: any) {
            syncError = e.message || 'Network error during sync';
            console.error('Sync failed:', e);
        } finally {
            isSyncing = false;
        }
    }


    async function bulkSyncSheet() {
        if (!sheetUrl) return;
        isSyncing = true;
        syncError = '';
        syncSuccess = '';
        try {
            const res = await fetch('/api/ops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync-sheet-tabs', sheetUrl })
            });
            const result = await res.json();
            if (result.success) {
                syncError = '';
                syncSuccess = result.message || `Bulk synced ${result.rowsProcessed} rows across ${result.dates?.length || 0} date(s)`;
                if (result.errors?.length) {
                    syncError = `Warnings: ${result.errors.join('; ')}`;
                }
                await loadViewData();
            } else {
                syncError = result.error || 'Failed to bulk sync';
            }
        } catch (e: any) {
            syncError = e.message || 'Network error during bulk sync';
            console.error('Bulk sync failed:', e);
        } finally {
            isSyncing = false;
        }
    }

    function navigateTo(view: string) {
        activeView = view;
    }

    async function clearData(dateOnly?: boolean) {
        const confirmMsg = dateOnly
            ? `Clear all data for ${selectedDate}?`
            : 'Clear ALL ops data? This cannot be undone.';
        if (!confirm(confirmMsg)) return;
        isSyncing = true;
        syncError = '';
        syncSuccess = '';
        try {
            const payload: any = { action: 'clear-data' };
            if (dateOnly) payload.date = selectedDate;
            const res = await fetch('/api/ops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.success) {
                syncSuccess = result.message;
                viewData = null;
                await loadViewData();
            } else {
                syncError = result.error || 'Failed to clear data';
            }
        } catch (e: any) {
            syncError = e.message || 'Network error';
        } finally {
            isSyncing = false;
        }
    }

    $effect(() => {
        const _v = activeView;
        const _d = selectedDate;
        const _u = selectedUniversity;
        const _r = selectedRole;
        const _dr = dateRange;
        loadViewData();
    });

    // ─── Helpers ─────────────────────────────────────────────────
    function fmt(n: any) {
        const num = parseInt(n) || 0;
        return num.toLocaleString();
    }
    function pct(a: any, b: any) {
        const num = parseInt(a) || 0;
        const den = parseInt(b) || 0;
        if (!den) return '0%';
        return Math.round((num / den) * 100) + '%';
    }
    function pctNum(a: any, b: any) {
        const num = parseInt(a) || 0;
        const den = parseInt(b) || 0;
        if (!den) return 0;
        return Math.round((num / den) * 100);
    }
    function deviation(planned: any, completed: any) {
        const p = parseInt(planned) || 0;
        const c = parseInt(completed) || 0;
        if (!p) return '0%';
        return Math.round(((p - c) / p) * 100) + '%';
    }
    function devNum(planned: any, completed: any) {
        const p = parseInt(planned) || 0;
        const c = parseInt(completed) || 0;
        if (!p) return 0;
        return Math.round(((p - c) / p) * 100);
    }
    function statusBadge(deviationPct: number) {
        return deviationPct > 10 ? 'Attention' : 'On track';
    }
    function reportStatus(val: string) {
        if (val === 'Filed' || val === 'Submitted') return 'bg-green-600 text-white';
        if (val === 'Late') return 'bg-yellow-600 text-white';
        return 'bg-red-600/80 text-white';
    }
    function formatDate(dateStr: string) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    function shortDate(dateStr: string) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
    }
    function getComplianceStatus(row: any) {
        if (!row.report_submitted_at) return 'Missing';
        const hour = parseInt(row.report_submitted_at.split(':')[0]);
        return hour < 19 ? 'On time' : 'Late';
    }
    function getOverallReportStatus(row: any) {
        const reports = [row.instructor_report, row.coach_report, row.ops_report];
        const filed = reports.filter((r: string) => r === 'Filed' || r === 'Submitted').length;
        if (filed === 3) return 'Complete';
        if (filed > 0) return 'Partial';
        return 'Missing';
    }

    // ─── Download Report ─────────────────────────────────────────
    async function downloadReport(type: 'daily' | 'weekly' | 'monthly') {
        isDownloading = true;
        try {
            const params = new URLSearchParams({ view: 'report', type, date: selectedDate });
            const res = await fetch(`/api/ops?${params}`);
            if (!res.ok) return;
            const report = await res.json();
            const content = generateReportHTML(report, type);
            const blob = new Blob([content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `UniOps_${type}_report_${selectedDate}.html`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Download failed:', e);
        } finally {
            isDownloading = false;
        }
    }

    function generateReportHTML(report: any, type: string) {
        const title = type === 'daily' ? `Daily Report — ${report.date}` :
            type === 'weekly' ? `Weekly Report — ${report.weekStart} to ${report.weekEnd}` :
            `Monthly Report — ${report.year}-${String(report.month).padStart(2, '0')}`;
        const s = report.summary || {};
        const byUniv = report.byUniversity || [];
        const daily = report.dailyBreakdown || [];

        let univRows = byUniv.map((r: any) => `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${r.university_name}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.sessions_planned || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.sessions_completed || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.enrolled || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.attended || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.coach_calls || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.at_risk_total || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.events_planned || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.events_executed || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.exams_planned || 0}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${r.exams_completed || 0}</td>
        </tr>`).join('');

        let dailyRows = '';
        if (daily.length && type !== 'daily') {
            dailyRows = `<h2 style="margin-top:24px;color:#333">Daily Breakdown</h2>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f5f5f5">
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd">Date</th>
                <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd">University</th>
                <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Sessions</th>
                <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Attended</th>
                <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Enrolled</th>
                <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Coach Calls</th>
            </tr></thead><tbody>` +
            daily.map((r: any) => `<tr>
                <td style="padding:6px;border-bottom:1px solid #eee">${r.date}</td>
                <td style="padding:6px;border-bottom:1px solid #eee">${r.university_name}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${r.sessions_completed}/${r.sessions_planned}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${r.attended}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${r.enrolled}</td>
                <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${r.coach_calls}</td>
            </tr>`).join('') +
            `</tbody></table>`;
        }

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
        <style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px;color:#333}
        h1{color:#1a1a2e;border-bottom:3px solid #1a1a2e;padding-bottom:8px}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
        .card{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:16px;text-align:center}
        .card .label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px}
        .card .value{font-size:28px;font-weight:bold;margin-top:4px}
        .green{color:#16a34a}.red{color:#dc2626}.blue{color:#2563eb}.yellow{color:#ca8a04}
        table{width:100%;border-collapse:collapse}th{text-align:left;background:#f5f5f5}
        @media print{body{padding:0}.card{break-inside:avoid}}</style></head><body>
        <h1>UniOps — ${title}</h1>
        <p style="color:#666">Generated on ${new Date().toLocaleString('en-IN')} | UniConnect Operations Dashboard</p>
        <div class="summary-grid">
            <div class="card"><div class="label">Sessions Planned</div><div class="value">${s.sessions_planned || 0}</div></div>
            <div class="card"><div class="label">Sessions Completed</div><div class="value green">${s.sessions_completed || 0}</div></div>
            <div class="card"><div class="label">Students Enrolled</div><div class="value blue">${s.enrolled || 0}</div></div>
            <div class="card"><div class="label">Students Attended</div><div class="value green">${s.attended || 0}</div></div>
            <div class="card"><div class="label">Attendance Rate</div><div class="value">${parseInt(s.enrolled) ? Math.round((parseInt(s.attended) / parseInt(s.enrolled)) * 100) : 0}%</div></div>
            <div class="card"><div class="label">Coach Calls</div><div class="value yellow">${s.coach_calls || 0}</div></div>
            <div class="card"><div class="label">At-Risk Students</div><div class="value red">${s.at_risk_total || 0}</div></div>
            <div class="card"><div class="label">Events Executed</div><div class="value">${s.events_executed || 0} / ${s.events_planned || 0}</div></div>
            <div class="card"><div class="label">Exams Completed</div><div class="value">${s.exams_completed || 0} / ${s.exams_planned || 0}</div></div>
            <div class="card"><div class="label">Post-Exam Comms</div><div class="value">${s.post_exam_comms_sent || 0}</div></div>
        </div>
        <h2 style="margin-top:24px;color:#333">By University</h2>
        <table style="font-size:13px"><thead><tr style="background:#f5f5f5">
            <th style="padding:8px;border-bottom:2px solid #ddd">University</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Sessions Planned</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Completed</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Enrolled</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Attended</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Coach Calls</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">At-Risk</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Events Planned</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Events Done</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Exams Planned</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #ddd">Exams Done</th>
        </tr></thead><tbody>${univRows}</tbody></table>
        ${dailyRows}
        <hr style="margin-top:32px"><p style="color:#999;font-size:12px;text-align:center">This report was auto-generated by UniConnect Ops Dashboard</p>
        </body></html>`;
    }
</script>

<div class="flex h-[calc(100vh-64px)]">
    <!-- Sidebar -->
    <aside class="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto">
        <div class="p-4 border-b border-gray-800">
            <h2 class="text-lg font-bold text-white">UniOps</h2>
            <p class="text-xs text-gray-500 font-mono">Operations Dashboard</p>
        </div>
        {#each Object.entries(viewGroups) as [group, viewIds]}
            <div class="px-3 pt-4 pb-1">
                <p class="text-[10px] font-semibold text-gray-500 tracking-wider">{group}</p>
            </div>
            {#each viewIds as vid}
                {@const v = views.find(x => x.id === vid)}
                {#if v}
                    <button
                        class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors {activeView === v.id ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white border-l-2 border-transparent'}"
                        onclick={() => activeView = v.id}
                    >
                        {#if v.icon === 'grid'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        {:else if v.icon === 'list'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        {:else if v.icon === 'users'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        {:else if v.icon === 'alert'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {:else if v.icon === 'chart'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        {:else if v.icon === 'calendar'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        {:else if v.icon === 'file'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        {:else if v.icon === 'mail'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        {:else if v.icon === 'globe'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        {:else if v.icon === 'activity'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                        {:else if v.icon === 'clipboard'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                        {:else if v.icon === 'star'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        {/if}
                        {v.label}
                    </button>
                {/if}
            {/each}
        {/each}
        <div class="p-3 mt-4 border-t border-gray-800">
            <button
                class="w-full text-left px-4 py-2 text-sm flex items-center gap-2 text-gray-400 hover:bg-gray-800 hover:text-white"
                onclick={() => activeView = 'sheet-setup'}
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Sheet setup
            </button>
        </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto bg-gray-950 p-6">
        <!-- Top Bar: Sheet URL + controls -->
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <div class="flex items-center gap-3 flex-wrap">
                <input
                    type="text"
                    bind:value={sheetUrl}
                    placeholder="Paste published Google Sheet CSV URL..."
                    class="flex-1 min-w-[250px] bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <div class="flex items-center gap-2">
                    <label class="text-xs text-gray-500">Data date:</label>
                    <input
                        type="date"
                        bind:value={syncDate}
                        class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-2 py-2 focus:outline-none focus:border-blue-500"
                    />
                </div>
                <button
                    onclick={syncSheet}
                    disabled={isSyncing || !sheetUrl}
                    class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                >
                    {isSyncing ? 'Syncing...' : 'Load data'}
                </button>
                <button
                    onclick={bulkSyncSheet}
                    disabled={isSyncing || !sheetUrl}
                    class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                    title="Bulk load from multi-tab sheet — each tab name should be a date (YYYY-MM-DD)"
                >
                    {isSyncing ? 'Syncing...' : 'Bulk Load (Multi-tab)'}
                </button>
                <div class="flex items-center gap-1 ml-2">
                    <button
                        onclick={() => clearData(true)}
                        disabled={isSyncing}
                        class="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
                        title="Clear data for the selected sync date only"
                    >
                        Clear date
                    </button>
                    <button
                        onclick={() => clearData(false)}
                        disabled={isSyncing}
                        class="px-3 py-2 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
                        title="Clear ALL ops data"
                    >
                        Clear all
                    </button>
                </div>
            </div>
            {#if syncError}
                <p class="text-sm font-mono text-red-400 mt-2">{syncError}</p>
            {/if}
            {#if syncSuccess}
                <p class="text-sm font-mono text-green-400 mt-2">{syncSuccess}</p>
            {/if}
        </div>

        <!-- View Header with Date Picker + University filter + Download -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
                <h1 class="text-2xl font-bold text-white font-mono">
                    {views.find(v => v.id === activeView)?.label || 'Operations overview'}
                </h1>
                <p class="text-sm text-gray-500 font-mono">{formatDate(selectedDate)}</p>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center gap-2">
                    <label class="text-xs text-gray-500">View date:</label>
                    <input
                        type="date"
                        bind:value={selectedDate}
                        class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                    />
                </div>
                {#if allUniversities.length > 0 && ['overview', 'sessions', 'attendance', 'at-risk', 'instructors', 'events', 'exams', 'post-exam', 'team-activity', 'daily-reports'].includes(activeView)}
                    <select
                        bind:value={selectedUniversity}
                        class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                    >
                        <option value="">All universities</option>
                        {#each allUniversities as univ}
                            <option value={univ}>{univ}</option>
                        {/each}
                    </select>
                {/if}
                {#if allUniversities.length}
                    <span class="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">{allUniversities.length} universities</span>
                {/if}
                <!-- Download buttons -->
                <div class="flex items-center gap-1">
                    <button onclick={() => downloadReport('daily')} disabled={isDownloading} class="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors" title="Download daily report">
                        Daily
                    </button>
                    <button onclick={() => downloadReport('weekly')} disabled={isDownloading} class="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors" title="Download weekly report">
                        Weekly
                    </button>
                    <button onclick={() => downloadReport('monthly')} disabled={isDownloading} class="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors" title="Download monthly report">
                        Monthly
                    </button>
                    <svg class="w-4 h-4 text-gray-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
            </div>
        </div>

        {#if isLoading}
            <div class="flex items-center justify-center py-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span class="ml-3 text-gray-400">Loading data...</span>
            </div>
        {:else if !viewData}
            <div class="text-center py-20 text-gray-500">
                <p class="text-lg mb-2">No data loaded</p>
                <p class="text-sm">Paste a Google Sheet CSV URL and click "Load data" for a single sheet, or "Bulk Load (Multi-tab)" for sheets with date-named tabs (YYYY-MM-DD).</p>
            </div>

        <!-- ─── OVERVIEW ──────────────────────────────────────────── -->
        {:else if activeView === 'overview'}
            {@const t = viewData.today || {}}
            {@const m = viewData.month || {}}
            <div class="mb-4">
                <p class="text-xs font-semibold text-gray-500 tracking-wider mb-3">TODAY'S PULSE — {formatDate(selectedDate)}</p>
                <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <button onclick={() => navigateTo('sessions')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-blue-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">SESSIONS PLANNED</p>
                        <p class="text-3xl font-bold text-white mt-1">{fmt(t.sessions_planned)}</p>
                        <p class="text-[10px] text-blue-400 mt-1">View details →</p>
                    </button>
                    <button onclick={() => navigateTo('sessions')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-green-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">SESSIONS COMPLETED</p>
                        <p class="text-3xl font-bold text-green-400 mt-1">{fmt(t.sessions_completed)}</p>
                        <p class="text-xs text-gray-500">{pct(t.sessions_completed, t.sessions_planned)} completion</p>
                    </button>
                    <button onclick={() => navigateTo('sessions')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-red-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">SESSIONS CANCELLED</p>
                        <p class="text-3xl font-bold text-red-400 mt-1">{fmt(t.sessions_cancelled)}</p>
                        <p class="text-xs text-gray-500">{deviation(t.sessions_planned, t.sessions_completed)} deviation</p>
                    </button>
                    <button onclick={() => navigateTo('attendance')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-blue-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">STUDENTS ATTENDED</p>
                        <p class="text-3xl font-bold text-blue-400 mt-1">{fmt(t.attended)}</p>
                        <p class="text-xs text-gray-500">of {fmt(t.enrolled)} enrolled</p>
                    </button>
                    <button onclick={() => navigateTo('attendance')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-teal-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ATTENDANCE RATE</p>
                        <p class="text-3xl font-bold text-teal-400 mt-1">{pct(t.attended, t.enrolled)}</p>
                        <p class="text-[10px] text-blue-400 mt-1">View details →</p>
                    </button>
                    <button onclick={() => navigateTo('attendance')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-yellow-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COACH CALLS TODAY</p>
                        <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(t.coach_calls)}</p>
                        <p class="text-xs text-gray-500">of {fmt((parseInt(t.enrolled) || 0) - (parseInt(t.attended) || 0))} absent students</p>
                    </button>
                    <button onclick={() => navigateTo('at-risk')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-red-500/50 transition-colors cursor-pointer">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">AT-RISK STUDENTS</p>
                        <p class="text-3xl font-bold text-red-400 mt-1">{fmt(t.at_risk_total)}</p>
                        <p class="text-[10px] text-blue-400 mt-1">View details →</p>
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <button onclick={() => navigateTo('at-risk')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-blue-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">PARENT CALLS TODAY</p>
                    <p class="text-3xl font-bold text-blue-400 mt-1">{fmt(t.parent_calls)}</p>
                    <p class="text-xs text-gray-500">of {fmt(t.at_risk_total)} at-risk students</p>
                </button>
                <button onclick={() => navigateTo('at-risk')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-green-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ACKNOWLEDGMENTS</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(t.acknowledgments)}</p>
                    <p class="text-xs text-gray-500">of {fmt(t.at_risk_total)} at-risk · {pct(t.acknowledgments, t.at_risk_total)} ack rate</p>
                </button>
                <button onclick={() => navigateTo('instructors')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-orange-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">INSTRUCTORS ON LEAVE</p>
                    <p class="text-3xl font-bold text-orange-400 mt-1">{fmt(t.instructors_on_leave)}</p>
                    <p class="text-[10px] text-blue-400 mt-1">View details →</p>
                </button>
            </div>

            <!-- Overview charts: Session completion donut + Attendance bar -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Session completion</h4>
                    {#if true}
                        {@const completed = parseInt(t.sessions_completed) || 0}
                        {@const cancelled = parseInt(t.sessions_cancelled) || 0}
                        {@const planned = parseInt(t.sessions_planned) || 1}
                        {@const compPct = (completed / planned) * 360}
                        {@const cancPct = (cancelled / planned) * 360}
                        {@const r = 70}
                        {@const circ = 2 * Math.PI * r}
                        <div class="flex items-center justify-center">
                            <svg viewBox="0 0 200 200" class="w-44 h-44">
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#374151" stroke-width="28" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#22C55E" stroke-width="28"
                                    stroke-dasharray="{(compPct / 360) * circ} {circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#EF4444" stroke-width="28"
                                    stroke-dasharray="{(cancPct / 360) * circ} {circ}"
                                    stroke-dashoffset="-{(compPct / 360) * circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r="56" fill="#111827" />
                                <text x="100" y="95" text-anchor="middle" fill="white" font-size="24" font-weight="bold">{pct(t.sessions_completed, t.sessions_planned)}</text>
                                <text x="100" y="115" text-anchor="middle" fill="#9CA3AF" font-size="11">completed</text>
                            </svg>
                        </div>
                    {/if}
                    <div class="flex items-center justify-center gap-4 mt-2">
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span> Completed ({fmt(t.sessions_completed)})</span>
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-red-500 inline-block"></span> Cancelled ({fmt(t.sessions_cancelled)})</span>
                    </div>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Attendance rate</h4>
                    {#if true}
                        {@const attRate = pctNum(t.attended, t.enrolled)}
                        {@const r = 70}
                        {@const circ = 2 * Math.PI * r}
                        <div class="flex items-center justify-center">
                            <svg viewBox="0 0 200 200" class="w-44 h-44">
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#374151" stroke-width="28" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#14B8A6" stroke-width="28"
                                    stroke-dasharray="{(attRate / 100) * circ} {circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r="56" fill="#111827" />
                                <text x="100" y="95" text-anchor="middle" fill="white" font-size="24" font-weight="bold">{attRate}%</text>
                                <text x="100" y="115" text-anchor="middle" fill="#9CA3AF" font-size="11">attendance</text>
                            </svg>
                        </div>
                    {/if}
                    <div class="flex items-center justify-center gap-4 mt-2">
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-teal-500 inline-block"></span> Attended ({fmt(t.attended)})</span>
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-gray-600 inline-block"></span> Absent ({fmt((parseInt(t.enrolled) || 0) - (parseInt(t.attended) || 0))})</span>
                    </div>
                </div>
            </div>

            <p class="text-xs font-semibold text-gray-500 tracking-wider mb-3">THIS MONTH</p>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
                <button onclick={() => navigateTo('events')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-blue-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EVENTS PLANNED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(m.events_planned)}</p>
                    <p class="text-[10px] text-blue-400 mt-1">View details →</p>
                </button>
                <button onclick={() => navigateTo('events')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-green-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EVENTS EXECUTED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(m.events_executed)}</p>
                    <p class="text-xs text-gray-500">{parseInt(m.events_planned || 0) - parseInt(m.events_executed || 0)} pending</p>
                </button>
                <button onclick={() => navigateTo('events')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-red-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EVENTS CANCELLED</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(m.events_cancelled)}</p>
                </button>
                <button onclick={() => navigateTo('daily-reports')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-red-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">REPORT COMPLIANCE</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{pct(m.sessions_completed, m.sessions_planned)}</p>
                    <p class="text-[10px] text-blue-400 mt-1">View reports →</p>
                </button>
                <button onclick={() => navigateTo('exams')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-blue-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EXAMS PLANNED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(m.exams_planned)}</p>
                    <p class="text-[10px] text-blue-400 mt-1">View details →</p>
                </button>
                <button onclick={() => navigateTo('exams')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-green-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EXAMS COMPLETED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(m.exams_completed)}</p>
                    <p class="text-xs text-gray-500">{parseInt(m.exams_planned || 0) - parseInt(m.exams_completed || 0)} pending</p>
                </button>
                <button onclick={() => navigateTo('post-exam')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-purple-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">POST-EXAM COMMS SENT</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{fmt(m.post_exam_comms_sent)}</p>
                    <p class="text-xs text-gray-500">of {fmt(m.exams_completed)} done exams</p>
                </button>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <button onclick={() => navigateTo('at-risk')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-orange-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">AT-RISK INFORMED (MONTH)</p>
                    <p class="text-3xl font-bold text-orange-400 mt-1">{fmt(m.at_risk_informed)}</p>
                    <p class="text-xs text-gray-500">{parseInt(m.at_risk_total || 0) - parseInt(m.at_risk_informed || 0)} not yet</p>
                </button>
                <button onclick={() => navigateTo('team-activity')} class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left hover:border-blue-500/50 transition-colors cursor-pointer">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TEAM ACTIVITY</p>
                    <p class="text-3xl font-bold text-blue-400 mt-1">{fmt(t.coach_calls)}</p>
                    <p class="text-xs text-gray-500">coach calls today · click to view team</p>
                </button>
            </div>

        <!-- ─── SESSIONS ──────────────────────────────────────────── -->
        {:else if activeView === 'sessions'}
            {@const ts = viewData.todaySummary || {}}
            {@const ws = viewData.weekSummary || {}}
            <p class="text-sm text-gray-500 mb-4 font-mono">Planned · completed · cancelled · deviation</p>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TODAY — PLANNED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(ts.sessions_planned)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TODAY — COMPLETED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(ts.sessions_completed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TODAY — CANCELLED</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(ts.sessions_cancelled)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TODAY DEVIATION</p>
                    <p class="text-3xl font-bold text-orange-400 mt-1">{deviation(ts.sessions_planned, ts.sessions_completed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">WEEK — PLANNED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(ws.sessions_planned)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">WEEK — COMPLETED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(ws.sessions_completed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">WEEK — CANCELLED</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(ws.sessions_cancelled)}</p>
                </div>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-3">
                <p class="text-[10px] text-gray-500 font-semibold tracking-wider mb-1">WEEK DEVIATION</p>
                <p class="text-3xl font-bold text-orange-400">{deviation(ws.sessions_planned, ws.sessions_completed)}</p>
            </div>

            <h3 class="text-lg font-semibold text-white mb-3 mt-6">By university — today</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">PLANNED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COMPLETED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">CANCELLED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">DEVIATION</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">STATUS</th>
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">REASON</th>
                    </tr></thead>
                    <tbody>
                        {#each (viewData.todayByUniversity || []) as row}
                            {@const devPct = parseInt(row.sessions_planned) ? Math.round(((parseInt(row.sessions_planned) - parseInt(row.sessions_completed)) / parseInt(row.sessions_planned)) * 100) : 0}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.sessions_planned}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.sessions_completed}</td>
                                <td class="px-4 py-3 text-center text-red-400">{row.sessions_cancelled}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{devPct}%</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="text-xs px-2 py-0.5 rounded {devPct > 10 ? 'bg-orange-600/20 text-orange-400' : 'bg-green-600/20 text-green-400'}">{statusBadge(devPct)}</span>
                                </td>
                                <td class="px-4 py-3 text-gray-400 text-xs max-w-[200px]">{row.cancellation_reason || '—'}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── ATTENDANCE ────────────────────────────────────────── -->
        {:else if activeView === 'attendance'}
            {@const ts = viewData.todaySummary || {}}
            {@const ws = viewData.weekSummary || {}}
            <p class="text-sm text-gray-500 mb-4 font-mono">Student attendance · success coach calls</p>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TOTAL ENROLLED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(ts.enrolled)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ATTENDED TODAY</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(ts.attended)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ABSENT TODAY</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(parseInt(ts.enrolled || 0) - parseInt(ts.attended || 0))}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ATTENDANCE RATE</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{pct(ts.attended, ts.enrolled)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COACH CALLS TODAY</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(ts.coach_calls)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COACH CALLS THIS WEEK</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(ws.coach_calls)}</p>
                </div>
            </div>

            <h3 class="text-lg font-semibold text-white mb-3">By university — today</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ENROLLED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ATTENDED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ABSENT</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ATT %</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COACH CALLS</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">STATUS</th>
                    </tr></thead>
                    <tbody>
                        {#each (viewData.todayByUniversity || []) as row}
                            {@const absent = parseInt(row.enrolled || 0) - parseInt(row.attended || 0)}
                            {@const attPct = parseInt(row.enrolled) ? Math.round((parseInt(row.attended) / parseInt(row.enrolled)) * 100) : 0}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.enrolled}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.attended}</td>
                                <td class="px-4 py-3 text-center text-red-400">{absent}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{attPct}%</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.coach_calls}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="text-xs px-2 py-0.5 rounded {attPct < 88 ? 'bg-orange-600/20 text-orange-400' : 'bg-green-600/20 text-green-400'}">{attPct < 88 ? 'Attention' : 'On track'}</span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── AT-RISK ───────────────────────────────────────────── -->
        {:else if activeView === 'at-risk'}
            {@const todayData = viewData.todayByUniversity || []}
            {@const totalAtRisk = todayData.reduce((s: number, r: any) => s + (parseInt(r.at_risk_total) || 0), 0)}
            {@const totalInformed = todayData.reduce((s: number, r: any) => s + (parseInt(r.at_risk_informed) || 0), 0)}
            {@const totalAcks = todayData.reduce((s: number, r: any) => s + (parseInt(r.acknowledgments) || 0), 0)}
            {@const totalParentCalls = todayData.reduce((s: number, r: any) => s + (parseInt(r.parent_calls) || 0), 0)}
            <p class="text-sm text-gray-500 mb-4 font-mono">At-risk student tracking · parent notifications · acknowledgments</p>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TOTAL AT-RISK</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(totalAtRisk)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">INFORMED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(totalInformed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">NOT YET INFORMED</p>
                    <p class="text-3xl font-bold text-orange-400 mt-1">{fmt(totalAtRisk - totalInformed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">INFORM RATE</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{pct(totalInformed, totalAtRisk)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">PARENT CALLS</p>
                    <p class="text-3xl font-bold text-blue-400 mt-1">{fmt(totalParentCalls)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ACKNOWLEDGMENTS</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{fmt(totalAcks)}</p>
                </div>
            </div>

            {#if totalAtRisk === 0 && todayData.length > 0}
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6 text-center">
                    <p class="text-green-400 text-lg font-semibold">No at-risk students reported for this date</p>
                    <p class="text-gray-500 text-sm mt-1">If your sheet has at-risk data, ensure the <code class="bg-gray-800 px-1 rounded">at_risk</code> and <code class="bg-gray-800 px-1 rounded">risk_informed</code> columns have values.</p>
                </div>
            {/if}

            <!-- At-risk donut chart -->
            {#if totalAtRisk > 0}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h4 class="text-sm font-semibold text-white mb-4">Informed vs pending</h4>
                        {#if true}
                            {@const informedPct = totalAtRisk ? (totalInformed / totalAtRisk) * 360 : 0}
                            {@const r = 70}
                            {@const circ = 2 * Math.PI * r}
                            <div class="flex items-center justify-center">
                                <svg viewBox="0 0 200 200" class="w-44 h-44">
                                    <circle cx="100" cy="100" r={r} fill="none" stroke="#374151" stroke-width="28" />
                                    <circle cx="100" cy="100" r={r} fill="none" stroke="#22C55E" stroke-width="28"
                                        stroke-dasharray="{(informedPct / 360) * circ} {circ}"
                                        transform="rotate(-90 100 100)" />
                                    <circle cx="100" cy="100" r="56" fill="#111827" />
                                    <text x="100" y="95" text-anchor="middle" fill="white" font-size="24" font-weight="bold">{pct(totalInformed, totalAtRisk)}</text>
                                    <text x="100" y="115" text-anchor="middle" fill="#9CA3AF" font-size="11">informed</text>
                                </svg>
                            </div>
                        {/if}
                        <div class="flex items-center justify-center gap-4 mt-2">
                            <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span> Informed ({totalInformed})</span>
                            <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-gray-600 inline-block"></span> Pending ({totalAtRisk - totalInformed})</span>
                        </div>
                    </div>
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                        <h4 class="text-sm font-semibold text-white mb-4">At-risk by university</h4>
                        <div class="space-y-2">
                            {#each todayData.filter((r: any) => parseInt(r.at_risk_total) > 0) as row}
                                {@const rowPct = pctNum(row.at_risk_informed, row.at_risk_total)}
                                <div class="flex items-center gap-2">
                                    <span class="text-[10px] text-gray-400 w-28 truncate text-right">{row.university_name}</span>
                                    <div class="flex-1 bg-gray-800 rounded h-4 overflow-hidden">
                                        <div class="h-full rounded bg-green-500" style="width: {rowPct}%"></div>
                                    </div>
                                    <span class="text-[10px] text-gray-400 w-16">{row.at_risk_informed}/{row.at_risk_total}</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}

            <h3 class="text-lg font-semibold text-white mb-3">By university</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">AT-RISK</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">INFORMED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">PENDING</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">PARENT CALLS</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ACKS</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">RATE</th>
                    </tr></thead>
                    <tbody>
                        {#each todayData as row}
                            {@const pending = (parseInt(row.at_risk_total) || 0) - (parseInt(row.at_risk_informed) || 0)}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-red-400">{row.at_risk_total || 0}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.at_risk_informed || 0}</td>
                                <td class="px-4 py-3 text-center text-orange-400">{pending}</td>
                                <td class="px-4 py-3 text-center text-blue-400">{row.parent_calls || 0}</td>
                                <td class="px-4 py-3 text-center text-purple-400">{row.acknowledgments || 0}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{pct(row.at_risk_informed, row.at_risk_total)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── INSTRUCTORS ───────────────────────────────────────── -->
        {:else if activeView === 'instructors'}
            {@const ts = viewData.todaySummary || {}}
            {@const weekData = viewData.weekByUniversity || []}
            {@const weekLeave = weekData.reduce((s: number, r: any) => s + (parseInt(r.instructors_on_leave) || 0), 0)}
            <p class="text-sm text-gray-500 mb-4 font-mono">Daily · weekly · monthly leave tracking</p>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TOTAL INSTRUCTORS</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(ts.instructors_total)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ON LEAVE TODAY</p>
                    <p class="text-3xl font-bold text-orange-400 mt-1">{fmt(ts.instructors_on_leave)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ON LEAVE THIS WEEK</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(weekLeave)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">LEAVE % TODAY</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{pct(ts.instructors_on_leave, ts.instructors_total)}</p>
                </div>
            </div>

            <h3 class="text-lg font-semibold text-white mb-3">By university</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-orange-400 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">TOTAL INSTRUCTORS</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ON LEAVE TODAY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">THIS WEEK</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">LEAVE %</th>
                    </tr></thead>
                    <tbody>
                        {#each (viewData.todayByUniversity || []) as row}
                            {@const weekRow = weekData.find((w: any) => w.university_name === row.university_name)}
                            {@const leavePct = parseInt(row.instructors_total) ? Math.round((parseInt(row.instructors_on_leave) / parseInt(row.instructors_total)) * 100) : 0}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.instructors_total}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.instructors_on_leave}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{weekRow?.instructors_on_leave || 0}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="text-xs px-2 py-0.5 rounded {leavePct > 5 ? 'bg-red-600/20 text-red-400' : 'bg-green-600/20 text-green-400'}">{leavePct}%</span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── EVENTS ────────────────────────────────────────────── -->
        {:else if activeView === 'events'}
            {@const ms = viewData.monthSummary || {}}
            <p class="text-sm text-gray-500 mb-2 font-mono">Monthly event tracking</p>
            <div class="bg-blue-900/30 border border-blue-700/40 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
                <span class="text-blue-400 text-xs">ℹ</span>
                <span class="text-xs text-blue-300">Showing data from <strong>{viewData.monthStart || '—'}</strong> to <strong>{viewData.monthEnd || '—'}</strong> (full month range)</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EVENTS PLANNED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(ms.events_planned)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EVENTS EXECUTED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(ms.events_executed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EVENTS CANCELLED</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(ms.events_cancelled)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EXECUTION RATE</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{pct(ms.events_executed, ms.events_planned)}</p>
                </div>
            </div>
            <h3 class="text-lg font-semibold text-white mb-3">By university — this month</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">PLANNED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">EXECUTED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">CANCELLED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">RATE</th>
                    </tr></thead>
                    <tbody>
                        {#each (viewData.byUniversity || []) as row}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.events_planned}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.events_executed}</td>
                                <td class="px-4 py-3 text-center text-red-400">{row.events_cancelled}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{pct(row.events_executed, row.events_planned)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── EXAMS ─────────────────────────────────────────────── -->
        {:else if activeView === 'exams'}
            {@const ms = viewData.monthSummary || {}}
            <p class="text-sm text-gray-500 mb-2 font-mono">Monthly exam tracking</p>
            <div class="bg-blue-900/30 border border-blue-700/40 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
                <span class="text-blue-400 text-xs">ℹ</span>
                <span class="text-xs text-blue-300">Showing data from <strong>{viewData.monthStart || '—'}</strong> to <strong>{viewData.monthEnd || '—'}</strong> (full month range)</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EXAMS PLANNED</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(ms.exams_planned)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EXAMS COMPLETED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(ms.exams_completed)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">PENDING</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(parseInt(ms.exams_planned || 0) - parseInt(ms.exams_completed || 0))}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COMPLETION RATE</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{pct(ms.exams_completed, ms.exams_planned)}</p>
                </div>
            </div>
            <h3 class="text-lg font-semibold text-white mb-3">By university — this month</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">PLANNED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COMPLETED</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">POST-EXAM COMMS</th>
                    </tr></thead>
                    <tbody>
                        {#each (viewData.byUniversity || []) as row}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.exams_planned}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.exams_completed}</td>
                                <td class="px-4 py-3 text-center text-purple-400">{row.post_exam_comms_sent}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── POST-EXAM COMMS ───────────────────────────────────── -->
        {:else if activeView === 'post-exam'}
            {@const byUniv = viewData.byUniversity || []}
            {@const totalExams = byUniv.reduce((s: number, r: any) => s + (parseInt(r.exams_completed) || 0), 0)}
            {@const totalComms = byUniv.reduce((s: number, r: any) => s + (parseInt(r.post_exam_comms_sent) || 0), 0)}
            <p class="text-sm text-gray-500 mb-2 font-mono">Post-exam communication tracking</p>
            <div class="bg-blue-900/30 border border-blue-700/40 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
                <span class="text-blue-400 text-xs">ℹ</span>
                <span class="text-xs text-blue-300">Showing data from <strong>{viewData.monthStart || '—'}</strong> to <strong>{viewData.monthEnd || '—'}</strong> (full month range)</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">EXAMS DONE</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(totalExams)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COMMS SENT</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{fmt(totalComms)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COVERAGE</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{pct(totalComms, totalExams)}</p>
                </div>
            </div>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">EXAMS DONE</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COMMS SENT</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COVERAGE</th>
                    </tr></thead>
                    <tbody>
                        {#each byUniv as row}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.exams_completed}</td>
                                <td class="px-4 py-3 text-center text-purple-400">{row.post_exam_comms_sent}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{pct(row.post_exam_comms_sent, row.exams_completed)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── PER UNIVERSITY ────────────────────────────────────── -->
        {:else if activeView === 'per-university'}
            <div class="mb-4">
                <select
                    bind:value={selectedUniversity}
                    class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                    <option value="">Select university...</option>
                    {#each (viewData.universities || allUniversities) as univ}
                        <option value={univ}>{univ}</option>
                    {/each}
                </select>
            </div>
            {#if viewData.today}
                {@const t = viewData.today}
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">SESSIONS TODAY</p>
                        <p class="text-3xl font-bold text-white mt-1">{t.sessions_planned}</p>
                        <p class="text-xs text-gray-500">{t.sessions_completed} completed</p>
                    </div>
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ATTENDANCE</p>
                        <p class="text-3xl font-bold text-green-400 mt-1">{t.attended}</p>
                        <p class="text-xs text-gray-500">of {t.enrolled} enrolled</p>
                    </div>
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">COACH CALLS</p>
                        <p class="text-3xl font-bold text-yellow-400 mt-1">{t.coach_calls}</p>
                    </div>
                    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                        <p class="text-[10px] text-gray-500 font-semibold tracking-wider">AT-RISK</p>
                        <p class="text-3xl font-bold text-red-400 mt-1">{t.at_risk_total}</p>
                        <p class="text-xs text-gray-500">{t.at_risk_informed} informed</p>
                    </div>
                </div>
                {#if viewData.weekData?.length}
                    <h3 class="text-lg font-semibold text-white mb-3">This week — daily breakdown</h3>
                    <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                        <table class="w-full text-sm">
                            <thead><tr class="border-b border-gray-800">
                                <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">DATE</th>
                                <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">SESSIONS</th>
                                <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ATTENDED</th>
                                <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COACH CALLS</th>
                                <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">AT-RISK</th>
                            </tr></thead>
                            <tbody>
                                {#each viewData.weekData as day}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td class="px-4 py-3 text-white">{shortDate(day.date)}</td>
                                        <td class="px-4 py-3 text-center text-gray-300">{day.sessions_completed}/{day.sessions_planned}</td>
                                        <td class="px-4 py-3 text-center text-green-400">{day.attended}/{day.enrolled}</td>
                                        <td class="px-4 py-3 text-center text-yellow-400">{day.coach_calls}</td>
                                        <td class="px-4 py-3 text-center text-red-400">{day.at_risk_total}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            {:else if selectedUniversity}
                <p class="text-gray-500 text-center py-10">No data for {selectedUniversity} on {selectedDate}</p>
            {:else}
                <p class="text-gray-500 text-center py-10">Select a university above to view detailed data</p>
            {/if}

        <!-- ─── TEAM ACTIVITY ─────────────────────────────────────── -->
        {:else if activeView === 'team-activity'}
            {@const teams = viewData.teamData || []}
            {@const instructors = viewData.instructorData || []}
            {@const totInstActive = teams.reduce((s: number, r: any) => s + (parseInt(r.instructors_active) || 0), 0)}
            {@const totCoachActive = teams.reduce((s: number, r: any) => s + (parseInt(r.coaches_active) || 0), 0)}
            {@const totPOActive = teams.reduce((s: number, r: any) => s + (parseInt(r.program_ops_active) || 0), 0)}
            {@const totCalls = teams.reduce((s: number, r: any) => s + (parseInt(r.total_calls_made) || 0), 0)}
            {@const totTickets = teams.reduce((s: number, r: any) => s + (parseInt(r.tickets_resolved) || 0), 0)}
            {@const totClicks = teams.reduce((s: number, r: any) => s + (parseInt(r.clicks_shares_sent) || 0), 0)}

            <div class="flex items-center gap-3 mb-4">
                <p class="text-sm text-gray-500 font-mono flex-1">8-hour day breakdown · instructors · success coaches · program ops</p>
                <select
                    bind:value={selectedUniversity}
                    class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2"
                >
                    <option value="">All universities</option>
                    {#each allUniversities.length ? allUniversities : (viewData.teamData || []).map((r: any) => r.university_name) as univ}
                        <option value={univ}>{univ}</option>
                    {/each}
                </select>
                <select
                    bind:value={selectedRole}
                    class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2"
                >
                    <option value="All roles">All roles</option>
                    <option value="Instructor">Instructor</option>
                    <option value="Success coach">Success coach</option>
                    <option value="Program ops">Program ops</option>
                </select>
            </div>

            {#if teams.length === 0}
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6 text-center">
                    <p class="text-gray-400 text-lg">No team activity data for {formatDate(selectedDate)}</p>
                    <p class="text-gray-500 text-sm mt-1">Try selecting a different date or load data first.</p>
                </div>
            {/if}

            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">INSTRUCTORS ACTIVE TODAY</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(totInstActive)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">SUCCESS COACHES ACTIVE</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(totCoachActive)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">PROGRAM OPS ACTIVE</p>
                    <p class="text-3xl font-bold text-blue-400 mt-1">{fmt(totPOActive)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TOTAL CALLS MADE</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(totCalls)}</p>
                    <p class="text-xs text-gray-500">coaches · student + parent</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TICKETS RESOLVED</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{fmt(totTickets)}</p>
                    <p class="text-xs text-gray-500">by ops team</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">CLICK & SHARES SENT</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{fmt(totClicks)}</p>
                    <p class="text-xs text-gray-500">by ops team</p>
                </div>
            </div>

            <!-- Time utilisation bar chart -->
            {#if true}
            {@const avgInst = teams.length ? (teams.reduce((s: number, r: any) => s + (parseFloat(r.avg_hours_instructors) || 0), 0) / teams.length).toFixed(1) : '0'}
            {@const avgCoach = teams.length ? (teams.reduce((s: number, r: any) => s + (parseFloat(r.avg_hours_coaches) || 0), 0) / teams.length).toFixed(1) : '0'}
            {@const avgPO = teams.length ? (teams.reduce((s: number, r: any) => s + (parseFloat(r.avg_hours_program_ops) || 0), 0) / teams.length).toFixed(1) : '0'}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Time utilisation by role — today</h4>
                    <div class="space-y-4">
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400 w-28 text-right">Instructors</span>
                            <div class="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                                <div class="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2" style="width: {Math.min(100, (parseFloat(avgInst as string) / 8) * 100)}%">
                                    <span class="text-[10px] text-white font-mono">{avgInst}h</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400 w-28 text-right">Success coaches</span>
                            <div class="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                                <div class="h-full bg-teal-500 rounded-full flex items-center justify-end pr-2" style="width: {Math.min(100, (parseFloat(avgCoach as string) / 8) * 100)}%">
                                    <span class="text-[10px] text-white font-mono">{avgCoach}h</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-gray-400 w-28 text-right">Program ops</span>
                            <div class="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                                <div class="h-full bg-orange-500 rounded-full flex items-center justify-end pr-2" style="width: {Math.min(100, (parseFloat(avgPO as string) / 8) * 100)}%">
                                    <span class="text-[10px] text-white font-mono">{avgPO}h</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-4 mt-3 text-[10px] text-gray-500">
                        {#each ['0h', '1h', '2h', '3h', '4h', '5h', '6h', '7h', '8h'] as label}
                            <span>{label}</span>
                        {/each}
                    </div>
                </div>

                <!-- Activity completion donut -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Activity completion rate by role</h4>
                    {#if true}
                        {@const instPct = parseFloat(avgInst as string) / 8}
                        {@const coachPct = parseFloat(avgCoach as string) / 8}
                        {@const poPct = parseFloat(avgPO as string) / 8}
                        {@const total = instPct + coachPct + poPct}
                        {@const instArc = total ? (instPct / total) * 360 : 120}
                        {@const coachArc = total ? (coachPct / total) * 360 : 120}
                        {@const coachEnd = instArc + coachArc}
                        {@const r = 70}
                        {@const circ = 2 * Math.PI * r}
                        <div class="flex items-center justify-center">
                            <svg viewBox="0 0 200 200" class="w-48 h-48">
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#3B82F6" stroke-width="30"
                                    stroke-dasharray="{(instArc / 360) * circ} {circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#14B8A6" stroke-width="30"
                                    stroke-dasharray="{(coachArc / 360) * circ} {circ}"
                                    stroke-dashoffset="-{(instArc / 360) * circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#F97316" stroke-width="30"
                                    stroke-dasharray="{((360 - instArc - coachArc) / 360) * circ} {circ}"
                                    stroke-dashoffset="-{(coachEnd / 360) * circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r="55" fill="#111827" />
                            </svg>
                        </div>
                    {/if}
                    <div class="flex items-center justify-center gap-4 mt-2">
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-blue-500 inline-block"></span> Instructors</span>
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-teal-500 inline-block"></span> Success coaches</span>
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-orange-500 inline-block"></span> Program ops</span>
                    </div>
                </div>
            </div>
            {/if}

            {#if instructors.length}
                <h4 class="text-sm font-semibold text-gray-500 tracking-wider mb-3">INSTRUCTORS — DAILY ACTIVITY LOG</h4>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-3">
                    <h4 class="text-sm font-semibold text-white mb-3">Teach sessions & practice sessions</h4>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead><tr class="border-b border-gray-800">
                                <th class="text-left px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">NAME</th>
                                <th class="text-left px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                                <th class="text-center px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">TEACH SESSIONS PLANNED</th>
                                <th class="text-center px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">TEACH SESSIONS DONE</th>
                                <th class="text-center px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">PRACTICE SESSIONS PLANNED</th>
                                <th class="text-center px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">PRACTICE SESSIONS DONE</th>
                                <th class="text-center px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">HOURS LOGGED</th>
                                <th class="text-center px-3 py-2 text-[10px] text-gray-500 font-semibold tracking-wider">STATUS</th>
                            </tr></thead>
                            <tbody>
                                {#each instructors as row}
                                    {@const allDone = parseInt(row.teach_sessions_done) >= parseInt(row.teach_sessions_planned) && parseInt(row.practice_sessions_done) >= parseInt(row.practice_sessions_planned)}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td class="px-3 py-2 text-white">{row.instructor_name}</td>
                                        <td class="px-3 py-2 text-gray-400">{row.university_name}</td>
                                        <td class="px-3 py-2 text-center text-gray-300">{row.teach_sessions_planned}</td>
                                        <td class="px-3 py-2 text-center text-green-400">{row.teach_sessions_done}</td>
                                        <td class="px-3 py-2 text-center text-gray-300">{row.practice_sessions_planned}</td>
                                        <td class="px-3 py-2 text-center {parseInt(row.practice_sessions_done) < parseInt(row.practice_sessions_planned) ? 'text-red-400' : 'text-green-400'}">{row.practice_sessions_done}</td>
                                        <td class="px-3 py-2 text-center text-gray-300 font-mono">{row.hours_logged}h</td>
                                        <td class="px-3 py-2 text-center">
                                            <span class="text-xs px-2 py-0.5 rounded {allDone ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}">{allDone ? 'Complete' : 'Partial'}</span>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            {/if}

        <!-- ─── DAILY REPORTS ─────────────────────────────────────── -->
        {:else if activeView === 'daily-reports'}
            {@const ts = viewData.todaySummary || {}}
            {@const reports = viewData.reportData || []}
            {@const weekComp = viewData.weekCompliance || []}
            {@const dueToday = reports.length}
            {@const filedToday = reports.filter((r: any) => r.report_submitted_at).length}
            {@const onTime = reports.filter((r: any) => { if (!r.report_submitted_at) return false; const h = parseInt(r.report_submitted_at.split(':')[0]); return h < 19; }).length}
            {@const lateToday = filedToday - onTime}
            {@const missingToday = dueToday - filedToday}
            {@const weekFiled = weekComp.filter((r: any) => r.report_submitted_at).length}
            {@const weekTotal = weekComp.length}
            <p class="text-sm text-gray-500 mb-4 font-mono">End-of-day report submissions · quality · timeliness</p>
            <div class="flex items-center justify-end mb-4">
                <select bind:value={dateRange} class="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-2">
                    <option value="today">Today</option>
                    <option value="week">This week</option>
                    <option value="month">This month</option>
                </select>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">REPORTS DUE TODAY</p>
                    <p class="text-3xl font-bold text-white mt-1">{dueToday}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">FILED TODAY</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{filedToday}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ON TIME</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{onTime}</p>
                    <p class="text-xs text-gray-500">before 7:00 PM</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">LATE SUBMISSIONS</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{lateToday}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">MISSING TODAY</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{missingToday}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">WEEK COMPLIANCE</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{weekTotal ? Math.round((weekFiled / weekTotal) * 100) : 0}%</p>
                </div>
            </div>

            <!-- Submission rate chart (last 7 days) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Submission rate — last 7 days</h4>
                    {#if true}
                    {@const days = [...new Set(weekComp.map((r: any) => r.date))].sort()}
                    <div class="flex items-end gap-2 h-40">
                        {#each days as day}
                            {@const dayRows = weekComp.filter((r: any) => r.date === day)}
                            {@const dayFiled = dayRows.filter((r: any) => r.report_submitted_at).length}
                            {@const dayTotal = dayRows.length}
                            {@const dayPct = dayTotal ? Math.round((dayFiled / dayTotal) * 100) : 0}
                            <div class="flex-1 flex flex-col items-center gap-1">
                                <div class="w-full bg-gray-800 rounded-t relative" style="height: {dayPct * 1.4}px">
                                    <div class="absolute inset-0 bg-blue-500/30 rounded-t"></div>
                                </div>
                                <span class="text-[9px] text-gray-500">{shortDate(day)}</span>
                            </div>
                        {/each}
                    </div>
                    {/if}
                </div>

                <!-- On-time vs late vs missing donut -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">On-time vs late vs missing</h4>
                    {#if true}
                        {@const total = onTime + lateToday + missingToday || 1}
                        {@const onTimeArc = (onTime / total) * 360}
                        {@const lateArc = (lateToday / total) * 360}
                        {@const r = 70}
                        {@const circ = 2 * Math.PI * r}
                        <div class="flex items-center justify-center">
                            <svg viewBox="0 0 200 200" class="w-44 h-44">
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#14B8A6" stroke-width="30"
                                    stroke-dasharray="{(onTimeArc / 360) * circ} {circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#F59E0B" stroke-width="30"
                                    stroke-dasharray="{(lateArc / 360) * circ} {circ}"
                                    stroke-dashoffset="-{(onTimeArc / 360) * circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r={r} fill="none" stroke="#F472B6" stroke-width="30"
                                    stroke-dasharray="{((360 - onTimeArc - lateArc) / 360) * circ} {circ}"
                                    stroke-dashoffset="-{((onTimeArc + lateArc) / 360) * circ}"
                                    transform="rotate(-90 100 100)" />
                                <circle cx="100" cy="100" r="55" fill="#111827" />
                            </svg>
                        </div>
                    {/if}
                    <div class="flex items-center justify-center gap-4 mt-2">
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-teal-500 inline-block"></span> On time ({onTime})</span>
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-yellow-500 inline-block"></span> Late ({lateToday})</span>
                        <span class="flex items-center gap-1 text-xs text-gray-400"><span class="w-3 h-3 rounded bg-pink-400 inline-block"></span> Missing ({missingToday})</span>
                    </div>
                </div>
            </div>

            <h3 class="text-lg font-semibold text-white mb-3">Daily report status — by university</h3>
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead><tr class="border-b border-gray-800">
                        <th class="text-left px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">UNIVERSITY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">REPORT DUE</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">SUBMITTED BY</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">SUBMITTED AT</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">ON TIME</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">INSTRUCTOR REPORT</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">COACH REPORT</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">OPS REPORT</th>
                        <th class="text-center px-4 py-3 text-[10px] text-gray-500 font-semibold tracking-wider">OVERALL STATUS</th>
                    </tr></thead>
                    <tbody>
                        {#each reports as row}
                            {@const status = getComplianceStatus(row)}
                            {@const overall = getOverallReportStatus(row)}
                            <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td class="px-4 py-3 text-white">{row.university_name}</td>
                                <td class="px-4 py-3 text-center text-gray-400">{row.date}</td>
                                <td class="px-4 py-3 text-center text-gray-400">{row.report_submitted_by || '—'}</td>
                                <td class="px-4 py-3 text-center text-gray-400 font-mono">{row.report_submitted_at || '—'}</td>
                                <td class="px-4 py-3 text-center"><span class="text-xs px-2 py-0.5 rounded {reportStatus(status)}">{status}</span></td>
                                <td class="px-4 py-3 text-center"><span class="text-xs px-2 py-0.5 rounded {reportStatus(row.instructor_report)}">{row.instructor_report}</span></td>
                                <td class="px-4 py-3 text-center"><span class="text-xs px-2 py-0.5 rounded {reportStatus(row.coach_report)}">{row.coach_report}</span></td>
                                <td class="px-4 py-3 text-center"><span class="text-xs px-2 py-0.5 rounded {reportStatus(row.ops_report)}">{row.ops_report}</span></td>
                                <td class="px-4 py-3 text-center"><span class="text-xs px-2 py-0.5 rounded {overall === 'Complete' ? 'bg-green-600 text-white' : overall === 'Partial' ? 'bg-yellow-600 text-white' : 'bg-red-600/80 text-white'}">{overall}</span></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

        <!-- ─── REPORT COMPLIANCE ─────────────────────────────────── -->
        {:else if activeView === 'compliance'}
            {@const comp = viewData.compliance || []}
            {@const universities = viewData.universities || []}
            {@const totalDue = comp.length}
            {@const totalFiled = comp.filter((r: any) => r.report_submitted_at).length}
            {@const onTime = comp.filter((r: any) => { if (!r.report_submitted_at) return false; const h = parseInt(r.report_submitted_at.split(':')[0]); return h < 19; }).length}
            {@const late = totalFiled - onTime}
            {@const missing = totalDue - totalFiled}
            <p class="text-sm text-gray-500 mb-2 font-mono">Daily report filing compliance · streaks · gaps</p>
            <div class="bg-blue-900/30 border border-blue-700/40 rounded-lg px-4 py-2 mb-4 flex items-center gap-2">
                <span class="text-blue-400 text-xs">ℹ</span>
                <span class="text-xs text-blue-300">Showing data from <strong>{viewData.startDate || '—'}</strong> to <strong>{viewData.endDate || '—'}</strong> (last 30 days)</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">TOTAL REPORTS DUE (30D)</p>
                    <p class="text-3xl font-bold text-white mt-1">{fmt(totalDue)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">REPORTS FILED</p>
                    <p class="text-3xl font-bold text-green-400 mt-1">{fmt(totalFiled)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">ON TIME</p>
                    <p class="text-3xl font-bold text-teal-400 mt-1">{fmt(onTime)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">LATE</p>
                    <p class="text-3xl font-bold text-yellow-400 mt-1">{fmt(late)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">MISSING</p>
                    <p class="text-3xl font-bold text-red-400 mt-1">{fmt(missing)}</p>
                </div>
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <p class="text-[10px] text-gray-500 font-semibold tracking-wider">OVERALL COMPLIANCE</p>
                    <p class="text-3xl font-bold text-purple-400 mt-1">{totalDue ? Math.round((totalFiled / totalDue) * 100) : 0}%</p>
                </div>
            </div>

            <!-- Heatmap -->
            <div class="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6">
                <h4 class="text-sm font-semibold text-white mb-4">Compliance heatmap — last 30 days (all universities)</h4>
                {#if true}
                {@const dates = [...new Set(comp.map((r: any) => r.date))].sort()}
                <div class="overflow-x-auto">
                    <div class="flex gap-1 mb-2 ml-36">
                        {#each dates as d}
                            {@const day = new Date(d + 'T00:00:00')}
                            <span class="text-[8px] text-gray-500 w-5 text-center">{day.getDate()}</span>
                        {/each}
                    </div>
                    {#each universities as univ}
                        <div class="flex items-center gap-1 mb-1">
                            <span class="text-[10px] text-gray-400 w-36 truncate text-right pr-2">{univ}</span>
                            {#each dates as d}
                                {@const row = comp.find((r: any) => r.university_name === univ && r.date === d)}
                                {@const cellStatus = !row ? 'none' : !row.report_submitted_at ? 'missing' : parseInt(row.report_submitted_at.split(':')[0]) < 19 ? 'ontime' : 'late'}
                                <div class="w-5 h-5 rounded-sm {cellStatus === 'ontime' ? 'bg-green-500' : cellStatus === 'late' ? 'bg-orange-500' : cellStatus === 'missing' ? 'bg-red-500' : 'bg-gray-800'}" title="{univ} - {d}: {cellStatus}"></div>
                            {/each}
                        </div>
                    {/each}
                </div>
                <div class="flex gap-4 mt-3 ml-36">
                    <span class="flex items-center gap-1 text-[10px] text-gray-400"><span class="w-3 h-3 rounded-sm bg-green-500 inline-block"></span> On time</span>
                    <span class="flex items-center gap-1 text-[10px] text-gray-400"><span class="w-3 h-3 rounded-sm bg-orange-500 inline-block"></span> Late</span>
                    <span class="flex items-center gap-1 text-[10px] text-gray-400"><span class="w-3 h-3 rounded-sm bg-red-500 inline-block"></span> Missing</span>
                    <span class="flex items-center gap-1 text-[10px] text-gray-400"><span class="w-3 h-3 rounded-sm bg-gray-800 inline-block"></span> No data</span>
                </div>
                {/if}
            </div>

            <!-- Compliance rate by university bar chart -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Compliance rate by university</h4>
                    <div class="space-y-2">
                        {#each universities as univ}
                            {@const univRows = comp.filter((r: any) => r.university_name === univ)}
                            {@const univFiled = univRows.filter((r: any) => r.report_submitted_at).length}
                            {@const univPct = univRows.length ? Math.round((univFiled / univRows.length) * 100) : 0}
                            <div class="flex items-center gap-2">
                                <span class="text-[10px] text-gray-400 w-28 truncate text-right">{univ}</span>
                                <div class="flex-1 bg-gray-800 rounded h-4 overflow-hidden">
                                    <div class="h-full rounded {univPct >= 70 ? 'bg-green-500' : univPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}" style="width: {univPct}%"></div>
                                </div>
                                <span class="text-[10px] text-gray-500 w-8">{univPct}%</span>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Compliance by role donut -->
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
                    <h4 class="text-sm font-semibold text-white mb-4">Compliance by role — this month</h4>
                    {#if true}
                    {@const instFiled = comp.filter((r: any) => r.instructor_report === 'Filed').length}
                    {@const coachFiled = comp.filter((r: any) => r.coach_report === 'Filed').length}
                    {@const opsFiled = comp.filter((r: any) => r.ops_report === 'Filed').length}
                    {@const maxRole = totalDue || 1}
                    <div class="space-y-3 mt-4">
                        <div>
                            <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Instructor reports</span><span>{totalDue ? Math.round((instFiled / totalDue) * 100) : 0}%</span></div>
                            <div class="w-full bg-gray-800 rounded h-3"><div class="h-full rounded bg-blue-500" style="width: {totalDue ? (instFiled / totalDue) * 100 : 0}%"></div></div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Coach reports</span><span>{totalDue ? Math.round((coachFiled / totalDue) * 100) : 0}%</span></div>
                            <div class="w-full bg-gray-800 rounded h-3"><div class="h-full rounded bg-teal-500" style="width: {totalDue ? (coachFiled / totalDue) * 100 : 0}%"></div></div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs text-gray-400 mb-1"><span>Ops reports</span><span>{totalDue ? Math.round((opsFiled / totalDue) * 100) : 0}%</span></div>
                            <div class="w-full bg-gray-800 rounded h-3"><div class="h-full rounded bg-orange-500" style="width: {totalDue ? (opsFiled / totalDue) * 100 : 0}%"></div></div>
                        </div>
                    </div>
                    {/if}
                </div>
            </div>

        <!-- ─── SHEET SETUP ───────────────────────────────────────── -->
        {:else if activeView === 'sheet-setup'}
            <div class="max-w-2xl">
                <h2 class="text-xl font-bold text-white mb-4">Sheet Setup</h2>
                <p class="text-sm text-gray-400 mb-6">Connect a Google Sheet to automatically sync operational data. The sheet should be published as CSV.</p>

                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
                    <h3 class="text-sm font-semibold text-white mb-3">How to set up</h3>
                    <ol class="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                        <li>Open your Google Sheet with operational data</li>
                        <li>Go to File → Share → Publish to web</li>
                        <li>Select the sheet tab and choose "Comma-separated values (.csv)"</li>
                        <li>Click "Publish" and copy the URL</li>
                        <li>Paste the URL above and click "Load data"</li>
                    </ol>
                </div>

                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
                    <h3 class="text-sm font-semibold text-white mb-3">Supported CSV columns</h3>
                    <p class="text-xs text-gray-500 mb-3">Your sheet should have <strong>university_name</strong> as the first column. The system auto-maps these column names:</p>
                    <div class="font-mono text-xs text-gray-400 bg-gray-800 p-3 rounded overflow-x-auto">
                        university_name, sessions_planned, sessions_completed, sessions_cancelled, enrolled, attended, coach_calls, parent_calls, at_risk, acks, risk_informed, instructors_total, leave_today, events_planned, events_executed, events_cancelled, exams_planned, exams_executed, email_sent, wa_sent, reports_uploaded
                    </div>
                    <p class="text-xs text-gray-500 mt-3">One row per university. Use the "Data date" field above to set which date this data belongs to. If your CSV has a <code class="bg-gray-700 px-1 rounded">date</code> column, it will be used instead.</p>
                </div>
            </div>
        {/if}
    </main>
</div>
