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
    let expandedSessionRow = $state<string | null>(null);
    let dateRange = $state('today');
    let allUniversities = $state<string[]>([]);
    let isDownloading = $state(false);
    let isSendingReport = $state(false);
    let sendReportMsg = $state('');
    let bulkDates = $state<string[]>([]);
    let showBulkPicker = $state(false);

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
        { id: 'daily-form', label: 'Daily Form', icon: 'edit' },
        { id: 'form-compliance', label: 'Form Status', icon: 'check' },
        // Phase 3: Enhanced Analytics
        { id: 'task-patterns', label: 'Task Patterns', icon: 'search' },
        { id: 'peer-comparison', label: 'Peer Compare', icon: 'users' },
        { id: 'university-rankings', label: 'Rankings', icon: 'trophy' },
        // Phase 4: Advanced AI
        { id: 'event-intelligence', label: 'Event Intel', icon: 'zap' },
        { id: 'ask-ai', label: 'Ask AI', icon: 'message' },
    ];

    const viewGroups: Record<string, string[]> = {
        'VIEWS': ['overview', 'sessions', 'attendance', 'at-risk', 'instructors', 'events', 'exams', 'post-exam', 'per-university'],
        'TEAM & COMPLIANCE': ['team-activity', 'daily-reports', 'compliance'],
        'DAILY REPORTING': ['daily-form', 'form-compliance'],
        'ANALYTICS': ['task-patterns', 'peer-comparison', 'university-rankings'],
        'AI & INTELLIGENCE': ['event-intelligence', 'ask-ai'],
    };

    // ─── Daily Form State ───────────────────────────────────────────
    let dailyFormUniversities = $state<any[]>([]);
    let dailyFormSelectedUniv = $state('');
    let dailyFormDate = $state(new Date().toISOString().split('T')[0]);
    let dailyFormSubmitting = $state(false);
    let dailyFormSuccess = $state('');
    let dailyFormError = $state('');
    // ─── NLQ (Ask AI) State ───────────────────────────────────────────
    let nlqQuestion = $state('');
    let nlqAnswer = $state('');
    let nlqQuery = $state('');
    let nlqData = $state<any[]>([]);
    let nlqLoading = $state(false);
    let nlqShowQuery = $state(false);

    // ─── Event Intelligence State ───────────────────────────────────
    let eventIntelAI = $state('');
    let eventIntelAILoading = $state(false);

    async function askAI() {
        if (!nlqQuestion.trim() || nlqLoading) return;
        nlqLoading = true;
        nlqAnswer = '';
        nlqQuery = '';
        nlqData = [];
        try {
            const res = await fetch('/api/ops/nlq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: nlqQuestion })
            });
            const result = await res.json();
            nlqAnswer = result.answer || 'No answer available.';
            nlqQuery = result.query || '';
            nlqData = result.data || [];
        } catch (e: any) {
            nlqAnswer = `Error: ${e.message}`;
        } finally {
            nlqLoading = false;
        }
    }

    async function loadEventIntelAI() {
        if (!viewData || eventIntelAILoading) return;
        eventIntelAILoading = true;
        eventIntelAI = '';
        try {
            const res = await fetch('/api/ops/ai-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'event-budget', data: viewData })
            });
            const result = await res.json();
            eventIntelAI = result.insights || 'No insights available.';
        } catch { eventIntelAI = 'Failed to load AI insights.'; }
        finally { eventIntelAILoading = false; }
    }

    let dailyFormData = $state({
        sessions_planned: 0,
        sessions_completed: 0,
        sessions_cancelled: 0,
        cancellation_reason: '',
        enrolled: 0,
        attended: 0,
        at_risk_total: 0,
        at_risk_informed: 0,
        acknowledgments: 0,
        remarks: ''
    });
    let complianceData = $state<any[]>([]);
    let complianceDate = $state(new Date().toISOString().split('T')[0]);
    let loadingCompliance = $state(false);

    async function loadUniversitiesForForm() {
        try {
            const res = await fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get-universities' }) });
            const data = await res.json();
            if (data.success) dailyFormUniversities = data.universities;
        } catch (e) { console.error('Failed to load universities:', e); }
    }

    async function submitDailyForm() {
        if (!dailyFormSelectedUniv) { dailyFormError = 'Please select a university'; return; }
        const univ = dailyFormUniversities.find((u: any) => u.id === dailyFormSelectedUniv);
        if (!univ) return;

        dailyFormSubmitting = true;
        dailyFormError = '';
        dailyFormSuccess = '';
        try {
            const res = await fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'submit-daily-form',
                    university_id: univ.id,
                    university_name: univ.short_name || univ.name,
                    date: dailyFormDate,
                    ...dailyFormData
                })
            });
            const result = await res.json();
            if (result.success) {
                dailyFormSuccess = result.message;
                dailyFormData = { sessions_planned: 0, sessions_completed: 0, sessions_cancelled: 0, cancellation_reason: '', enrolled: 0, attended: 0, at_risk_total: 0, at_risk_informed: 0, acknowledgments: 0, remarks: '' };
            } else {
                dailyFormError = result.error || 'Failed to submit';
            }
        } catch (e: any) {
            dailyFormError = e.message;
        } finally {
            dailyFormSubmitting = false;
        }
    }

    async function loadComplianceStatus() {
        loadingCompliance = true;
        try {
            const res = await fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get-compliance', date: complianceDate }) });
            const data = await res.json();
            if (data.success) complianceData = data.compliance;
        } catch (e) { console.error(e); }
        finally { loadingCompliance = false; }
    }

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


    async function bulkSyncByDates() {
        if (!sheetUrl || !bulkDates.length) { syncError = 'Select at least one date'; return; }
        isSyncing = true;
        syncError = '';
        syncSuccess = '';
        let totalRows = 0;
        const processed: string[] = [];
        const errors: string[] = [];

        // Extract sheet ID from URL
        const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        if (!sheetIdMatch) {
            syncError = 'Could not extract Google Sheet ID from URL';
            isSyncing = false;
            return;
        }
        const sheetId = sheetIdMatch[1];

        // First discover tab GIDs from the sheet
        let tabs: { name: string; gid: string }[] = [];
        try {
            const discoverRes = await fetch('/api/ops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'discover-tabs', sheetUrl })
            });
            const discoverResult = await discoverRes.json();
            if (discoverResult.tabs) tabs = discoverResult.tabs;
        } catch {}

        for (const dateStr of bulkDates) {
            try {
                // Try to find the tab for this date — match by tab name
                const d = new Date(dateStr);
                const day = d.getDate();
                const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const monthShort = monthNames[d.getMonth()].slice(0, 3);
                const monthFull = monthNames[d.getMonth()];
                const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd', 21: 'st', 22: 'nd', 23: 'rd', 31: 'st' };
                const suffix = suffixes[day] || 'th';

                // Generate possible tab name formats
                const possibleNames = [
                    `${day}${suffix} ${monthFull}`,     // "31st March"
                    `${day}${suffix} ${monthShort}`,     // "31st Mar"
                    `${day} ${monthFull}`,               // "31 March"
                    `${day} ${monthShort}`,               // "31 Mar"
                    dateStr,                              // "2026-03-31"
                    `${String(day).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`, // "31-03-2026"
                    `${String(day).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`, // "31/03/2026"
                ];

                // Find matching tab
                let tabGid: string | null = null;
                if (tabs.length > 0) {
                    for (const pn of possibleNames) {
                        const match = tabs.find(t => t.name.trim().toLowerCase() === pn.toLowerCase());
                        if (match) { tabGid = match.gid; break; }
                    }
                }

                // Build CSV URL — if we have a GID use it, otherwise try the date as tab name via export
                let csvUrl: string;
                if (tabGid) {
                    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tabGid}`;
                } else {
                    // Try fetching with each possible name as a sheet query parameter
                    // Fallback: use the direct single-date sync
                    const payload: any = { action: 'sync-sheet', sheetUrl, syncDate: dateStr };
                    const res = await fetch('/api/ops', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const result = await res.json();
                    if (result.success) {
                        totalRows += result.rowsProcessed || 0;
                        processed.push(dateStr);
                    } else {
                        errors.push(`${dateStr}: ${result.error || 'Failed'}`);
                    }
                    continue;
                }

                // Fetch CSV from discovered tab
                const csvResp = await fetch('/api/ops', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'sync-sheet', sheetUrl: csvUrl, syncDate: dateStr })
                });
                const csvResult = await csvResp.json();
                if (csvResult.success) {
                    totalRows += csvResult.rowsProcessed || 0;
                    processed.push(dateStr);
                } else {
                    errors.push(`${dateStr}: ${csvResult.error || 'Failed'}`);
                }
            } catch (e: any) {
                errors.push(`${dateStr}: ${e.message}`);
            }
        }

        if (processed.length > 0) {
            syncSuccess = `Loaded ${totalRows} rows for ${processed.length} date(s): ${processed.join(', ')}`;
            await loadViewData();
        }
        if (errors.length > 0) {
            syncError = errors.join('; ');
        }
        isSyncing = false;
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

            // Fetch AI insights in parallel (non-blocking — report downloads even if AI fails)
            let aiInsights = '';
            try {
                const aiRes = await fetch('/api/ops/ai-insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ report, type })
                });
                if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    aiInsights = aiData.insights || '';
                }
            } catch { /* AI is optional */ }

            const content = generateReportHTML(report, type, aiInsights);
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

    async function sendReportEmail() {
        isSendingReport = true;
        sendReportMsg = '';
        try {
            const res = await fetch('/api/ops/send-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: selectedDate })
            });
            const data = await res.json();
            if (data.success) {
                sendReportMsg = `Report email sent to ${data.recipients?.length || 0} admin(s)`;
                setTimeout(() => { sendReportMsg = ''; }, 5000);
            } else {
                sendReportMsg = `Failed: ${data.error || 'Unknown error'}`;
            }
        } catch (e: any) {
            sendReportMsg = `Error: ${e.message}`;
        } finally {
            isSendingReport = false;
        }
    }

    function generateReportHTML(report: any, type: string, aiInsights: string = '') {
        const title = type === 'daily' ? `Daily Operations Report — ${report.date}` :
            type === 'weekly' ? `Weekly Operations Report — ${report.weekStart} to ${report.weekEnd}` :
            `Monthly Operations Report — ${report.year}-${String(report.month).padStart(2, '0')}`;
        const s = report.summary || {};
        const byUniv = report.byUniversity || [];
        const daily = report.dailyBreakdown || [];
        const compliance = report.compliance || [];
        const teamActivity = report.teamActivity || [];

        const n = (v: any) => parseInt(v) || 0;
        const f = (v: any) => parseFloat(v) || 0;
        const attRate = n(s.enrolled) > 0 ? Math.round((n(s.attended) / n(s.enrolled)) * 100) : 0;
        const sessRate = n(s.sessions_planned) > 0 ? Math.round((n(s.sessions_completed) / n(s.sessions_planned)) * 100) : 0;
        const coachRate = n(s.enrolled) - n(s.attended) > 0 ? Math.round((n(s.coach_calls) / (n(s.enrolled) - n(s.attended))) * 100) : 0;
        const parentRate = n(s.enrolled) - n(s.attended) > 0 ? Math.round((n(s.parent_calls) / (n(s.enrolled) - n(s.attended))) * 100) : 0;
        const eventExecRate = n(s.events_planned) > 0 ? Math.round((n(s.events_executed) / n(s.events_planned)) * 100) : 0;
        const examRate = n(s.exams_planned) > 0 ? Math.round((n(s.exams_completed) / n(s.exams_planned)) * 100) : 0;
        const atRiskInformedRate = n(s.at_risk_total) > 0 ? Math.round((n(s.at_risk_informed) / n(s.at_risk_total)) * 100) : 0;
        const rateColor = (v: number) => v >= 80 ? '#16a34a' : v >= 50 ? '#ca8a04' : '#dc2626';
        const statusBadge = (status: string) => {
            const colors: Record<string, string> = { 'Filed': '#16a34a', 'Submitted': '#16a34a', 'Missing': '#dc2626', 'Late': '#ca8a04', 'On time': '#16a34a', 'Complete': '#16a34a', 'Partial': '#ca8a04' };
            const bg: Record<string, string> = { 'Filed': '#f0fdf4', 'Submitted': '#f0fdf4', 'Missing': '#fef2f2', 'Late': '#fefce8', 'On time': '#f0fdf4', 'Complete': '#f0fdf4', 'Partial': '#fefce8' };
            return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${colors[status] || '#64748b'};background:${bg[status] || '#f1f5f9'}">${status}</span>`;
        };

        // ── University Breakdown Table (comprehensive) ──
        const univRows = byUniv.map((r: any) => {
            const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
            const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
            const uAbsent = n(r.enrolled) - n(r.attended);
            const uCoachRate = uAbsent > 0 ? Math.round((n(r.coach_calls) / uAbsent) * 100) : 0;
            return `<tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.university_name}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.sessions_planned)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${rateColor(uSess)}">${n(r.sessions_completed)} <span style="font-size:10px;color:#999">(${uSess}%)</span></td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626">${n(r.sessions_cancelled)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.enrolled)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${rateColor(uAtt)}">${n(r.attended)} <span style="font-size:10px;color:#999">(${uAtt}%)</span></td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#64748b">${uAbsent}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${rateColor(uCoachRate)}">${n(r.coach_calls)} <span style="font-size:10px;color:#999">(${uCoachRate}%)</span></td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.parent_calls)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${n(r.at_risk_total) > 0 ? '#dc2626' : '#16a34a'};font-weight:600">${n(r.at_risk_total)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.at_risk_informed)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.instructors_total)} <span style="font-size:10px;color:#dc2626">(${n(r.instructors_on_leave)} leave)</span></td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.events_executed)}/${n(r.events_planned)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.exams_completed)}/${n(r.exams_planned)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.post_exam_comms_sent)}</td>
            </tr>`;
        }).join('');

        const totalRow = byUniv.length > 1 ? `<tr style="background:#f0f4ff;font-weight:700">
            <td style="padding:10px 12px;border-top:2px solid #6366f1">TOTAL (${byUniv.length} universities)</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.sessions_planned)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:${rateColor(sessRate)}">${n(s.sessions_completed)} (${sessRate}%)</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:#dc2626">${n(s.sessions_cancelled)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.enrolled)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:${rateColor(attRate)}">${n(s.attended)} (${attRate}%)</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.enrolled) - n(s.attended)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.coach_calls)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.parent_calls)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:#dc2626">${n(s.at_risk_total)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.at_risk_informed)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.instructors_total)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.events_executed)}/${n(s.events_planned)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.exams_completed)}/${n(s.exams_planned)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.post_exam_comms_sent)}</td>
        </tr>` : '';

        // ── Team Activity Section ──
        let teamSection = '';
        if (teamActivity.length > 0) {
            const totalInstructorsActive = teamActivity.reduce((s: number, r: any) => s + n(r.instructors_active), 0);
            const totalCoachesActive = teamActivity.reduce((s: number, r: any) => s + n(r.coaches_active), 0);
            const totalOpsActive = teamActivity.reduce((s: number, r: any) => s + n(r.program_ops_active), 0);
            const totalCalls = teamActivity.reduce((s: number, r: any) => s + n(r.total_calls_made), 0);
            const totalTickets = teamActivity.reduce((s: number, r: any) => s + n(r.tickets_resolved), 0);
            const totalClicks = teamActivity.reduce((s: number, r: any) => s + n(r.clicks_shares_sent), 0);
            const avgInstrHrs = teamActivity.length > 0 ? (teamActivity.reduce((s: number, r: any) => s + f(r.avg_hours_instructors), 0) / teamActivity.length).toFixed(1) : '0';
            const avgCoachHrs = teamActivity.length > 0 ? (teamActivity.reduce((s: number, r: any) => s + f(r.avg_hours_coaches), 0) / teamActivity.length).toFixed(1) : '0';
            const avgOpsHrs = teamActivity.length > 0 ? (teamActivity.reduce((s: number, r: any) => s + f(r.avg_hours_program_ops), 0) / teamActivity.length).toFixed(1) : '0';

            teamSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Team Activity &amp; Productivity</h2>
            <div class="kpi-grid" style="grid-template-columns:repeat(6,1fr);margin-top:16px">
                <div class="kpi"><div class="label">Instructors Active</div><div class="value blue">${totalInstructorsActive}</div><div class="sub">Avg ${avgInstrHrs}h/day</div></div>
                <div class="kpi"><div class="label">Coaches Active</div><div class="value purple">${totalCoachesActive}</div><div class="sub">Avg ${avgCoachHrs}h/day</div></div>
                <div class="kpi"><div class="label">Program Ops Active</div><div class="value" style="color:#0891b2">${totalOpsActive}</div><div class="sub">Avg ${avgOpsHrs}h/day</div></div>
                <div class="kpi"><div class="label">Total Calls Made</div><div class="value">${totalCalls}</div></div>
                <div class="kpi"><div class="label">Tickets Resolved</div><div class="value green">${totalTickets}</div></div>
                <div class="kpi"><div class="label">Clicks/Shares Sent</div><div class="value">${totalClicks}</div></div>
            </div>
            <table>
                <thead><tr>
                    <th style="text-align:left">University</th>
                    <th>Instructors</th><th>Coaches</th><th>Prog. Ops</th>
                    <th>Calls Made</th><th>Tickets</th><th>Clicks/Shares</th>
                    <th>Instr. Hrs</th><th>Coach Hrs</th><th>Ops Hrs</th>
                </tr></thead><tbody>` +
            teamActivity.map((r: any) => `<tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.university_name}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.instructors_active)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.coaches_active)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.program_ops_active)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${n(r.total_calls_made)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;font-weight:600">${n(r.tickets_resolved)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.clicks_shares_sent)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${f(r.avg_hours_instructors).toFixed(1)}h</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${f(r.avg_hours_coaches).toFixed(1)}h</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${f(r.avg_hours_program_ops).toFixed(1)}h</td>
            </tr>`).join('') +
            `</tbody></table>`;
        }

        // ── Compliance Section ──
        let complianceSection = '';
        if (compliance.length > 0) {
            const totalReports = compliance.length;
            const completeReports = compliance.filter((r: any) => {
                const filed = [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length;
                return filed === 3;
            }).length;
            const partialReports = compliance.filter((r: any) => {
                const filed = [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length;
                return filed > 0 && filed < 3;
            }).length;
            const missingReports = totalReports - completeReports - partialReports;
            const complianceRate = totalReports > 0 ? Math.round((completeReports / totalReports) * 100) : 0;

            complianceSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Report Compliance</h2>
            <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-top:16px">
                <div class="kpi kpi-highlight"><div class="label">Compliance Rate</div><div class="value" style="color:${rateColor(complianceRate)}">${complianceRate}%</div><div class="sub">${completeReports} of ${totalReports} complete</div></div>
                <div class="kpi"><div class="label">Complete Reports</div><div class="value green">${completeReports}</div></div>
                <div class="kpi"><div class="label">Partial Reports</div><div class="value amber">${partialReports}</div></div>
                <div class="kpi"><div class="label">Missing Reports</div><div class="value red">${missingReports}</div></div>
            </div>
            <table>
                <thead><tr>
                    <th style="text-align:left">Date</th>
                    <th style="text-align:left">University</th>
                    <th>Instructor Report</th><th>Coach Report</th><th>Ops Report</th>
                    <th>Submitted By</th><th>Submitted At</th><th>Status</th>
                </tr></thead><tbody>` +
            compliance.map((r: any) => {
                const filed = [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length;
                const overallStatus = filed === 3 ? 'Complete' : filed > 0 ? 'Partial' : 'Missing';
                return `<tr>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#64748b">${r.date}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:500">${r.university_name}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${statusBadge(r.instructor_report || 'Missing')}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${statusBadge(r.coach_report || 'Missing')}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${statusBadge(r.ops_report || 'Missing')}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${r.report_submitted_by || '—'}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:12px">${r.report_submitted_at || '—'}</td>
                    <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${statusBadge(overallStatus)}</td>
                </tr>`;
            }).join('') +
            `</tbody></table>`;
        }

        // ── Daily Breakdown (for weekly/monthly reports) ──
        let dailySection = '';
        if (daily.length && type !== 'daily') {
            dailySection = `<h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Daily Breakdown</h2>
            <table>
            <thead><tr>
                <th style="text-align:left">Date</th>
                <th style="text-align:left">University</th>
                <th>Sessions</th><th>Enrolled</th><th>Attended</th><th>Att. Rate</th>
                <th>Coach Calls</th><th>Parent Calls</th><th>At-Risk</th>
                <th>Events</th><th>Exams</th>
            </tr></thead><tbody>` +
            daily.map((r: any) => {
                const dAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
                return `<tr>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${r.date}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;font-weight:500">${r.university_name}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${n(r.sessions_completed)}/${n(r.sessions_planned)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${n(r.enrolled)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:500">${n(r.attended)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:${rateColor(dAtt)}">${dAtt}%</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${n(r.coach_calls)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${n(r.parent_calls)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${n(r.at_risk_total) > 0 ? '#dc2626' : '#16a34a'}">${n(r.at_risk_total)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${n(r.events_executed)}/${n(r.events_planned)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${n(r.exams_completed)}/${n(r.exams_planned)}</td>
                </tr>`;
            }).join('') +
            `</tbody></table>`;
        }

        // ── Cancellation Reasons ──
        let cancellationSection = '';
        const cancellations = byUniv.filter((r: any) => r.cancellation_reason && n(r.sessions_cancelled) > 0);
        if (cancellations.length > 0) {
            cancellationSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Session Cancellation Details</h2>
            <table><thead><tr>
                <th style="text-align:left">University</th><th style="text-align:center">Cancelled</th><th style="text-align:left">Reason</th>
            </tr></thead><tbody>` +
            cancellations.map((r: any) => `<tr>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:500">${r.university_name}</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#dc2626;font-weight:600">${n(r.sessions_cancelled)}</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px">${r.cancellation_reason}</td>
            </tr>`).join('') +
            `</tbody></table>`;
        }

        // ── AI Insights Section ──
        let aiSection = '';
        if (aiInsights) {
            const formattedInsights = aiInsights.replace(/\n/g, '<br>');
            aiSection = `
            <div style="margin-top:32px;background:linear-gradient(135deg,#f0f4ff,#faf5ff);border:1px solid #c7d2fe;border-radius:12px;padding:24px">
                <h2 style="color:#4338ca;font-size:18px;margin:0 0 16px 0;border:none;padding:0">AI-Generated Executive Summary</h2>
                <div style="color:#1e293b;font-size:13px;line-height:1.8">${formattedInsights}</div>
                <p style="color:#94a3b8;font-size:10px;margin-top:16px;font-style:italic">Generated by Gemini AI based on operational data</p>
            </div>`;
        }

        // ── Key Observations (auto-generated from data) ──
        const observations: string[] = [];
        if (sessRate < 80) observations.push(`Session completion rate is ${sessRate}% — below the 80% target. ${n(s.sessions_cancelled)} sessions were cancelled.`);
        if (attRate < 70) observations.push(`Attendance rate is critically low at ${attRate}%. ${n(s.enrolled) - n(s.attended)} students absent out of ${n(s.enrolled)} enrolled.`);
        else if (attRate >= 90) observations.push(`Excellent attendance rate of ${attRate}% across all campuses.`);
        if (coachRate < 50) observations.push(`Coach call coverage is only ${coachRate}% — many absent students are not being followed up.`);
        if (n(s.at_risk_total) > 0 && atRiskInformedRate < 80) observations.push(`Only ${atRiskInformedRate}% of at-risk students (${n(s.at_risk_informed)}/${n(s.at_risk_total)}) have been informed. Immediate action needed.`);
        if (n(s.events_cancelled) > 0) observations.push(`${n(s.events_cancelled)} event(s) cancelled out of ${n(s.events_planned)} planned.`);

        // Find best and worst performing universities
        if (byUniv.length > 1) {
            const univWithAtt = byUniv.filter((r: any) => n(r.enrolled) > 0).map((r: any) => ({ name: r.university_name, rate: Math.round((n(r.attended) / n(r.enrolled)) * 100) }));
            if (univWithAtt.length > 1) {
                const best = univWithAtt.reduce((a: any, b: any) => a.rate > b.rate ? a : b);
                const worst = univWithAtt.reduce((a: any, b: any) => a.rate < b.rate ? a : b);
                if (best.rate !== worst.rate) {
                    observations.push(`Best attendance: ${best.name} (${best.rate}%). Needs attention: ${worst.name} (${worst.rate}%).`);
                }
            }
        }

        let observationsSection = '';
        if (observations.length > 0) {
            observationsSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Key Observations</h2>
            <div style="margin-top:12px;display:grid;gap:8px">` +
            observations.map((obs, i) => `<div style="padding:12px 16px;background:${i % 2 === 0 ? '#fefce8' : '#fff7ed'};border-left:4px solid ${i % 2 === 0 ? '#ca8a04' : '#ea580c'};border-radius:0 8px 8px 0;font-size:13px;color:#1e293b">${obs}</div>`).join('') +
            `</div>`;
        }

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>UniOps — ${title}</title>
        <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 32px; color: #1e293b; background: #fff; }
        h1 { font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
        h2 { font-size: 18px; font-weight: 700; color: #1e293b; margin-top: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin: 24px 0; }
        .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; }
        .kpi .label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }
        .kpi .value { font-size: 36px; font-weight: 800; margin-top: 8px; line-height: 1; }
        .kpi .sub { font-size: 11px; color: #94a3b8; margin-top: 6px; }
        .kpi-highlight { background: linear-gradient(135deg, #f0f4ff, #e0e7ff); border-color: #c7d2fe; }
        .green { color: #16a34a; } .red { color: #dc2626; } .blue { color: #2563eb; } .amber { color: #d97706; } .purple { color: #7c3aed; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
        thead tr { background: #f1f5f9; }
        th { padding: 10px 8px; text-align: center; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; }
        th:first-child { text-align: left; }
        td { padding: 10px 8px; text-align: center; border-bottom: 1px solid #e5e7eb; }
        td:first-child { text-align: left; }
        .divider { border: none; border-top: 2px solid #e2e8f0; margin: 32px 0; }
        .footer { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        @media print { body { padding: 16px; } .kpi { break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
        </style></head><body>
        <h1>UniOps — ${title}</h1>
        <p class="subtitle">Generated on ${new Date().toLocaleString('en-IN')} | UniConnect Operations Dashboard${selectedUniversity ? ` | ${selectedUniversity}` : ''} | ${byUniv.length} universit${byUniv.length === 1 ? 'y' : 'ies'}</p>

        <h2 style="margin-top:24px">Performance Overview</h2>
        <div class="kpi-grid">
            <div class="kpi kpi-highlight">
                <div class="label">Session Completion</div>
                <div class="value" style="color:${rateColor(sessRate)}">${sessRate}%</div>
                <div class="sub">${n(s.sessions_completed)} of ${n(s.sessions_planned)} sessions · ${n(s.sessions_cancelled)} cancelled</div>
            </div>
            <div class="kpi kpi-highlight">
                <div class="label">Attendance Rate</div>
                <div class="value" style="color:${rateColor(attRate)}">${attRate}%</div>
                <div class="sub">${n(s.attended)} of ${n(s.enrolled)} students</div>
            </div>
            <div class="kpi">
                <div class="label">Coach Call Coverage</div>
                <div class="value" style="color:${rateColor(coachRate)}">${coachRate}%</div>
                <div class="sub">${n(s.coach_calls)} calls for ${n(s.enrolled) - n(s.attended)} absent</div>
            </div>
            <div class="kpi">
                <div class="label">Parent Call Coverage</div>
                <div class="value" style="color:${rateColor(parentRate)}">${parentRate}%</div>
                <div class="sub">${n(s.parent_calls)} parent calls</div>
            </div>
            <div class="kpi">
                <div class="label">At-Risk Students</div>
                <div class="value ${n(s.at_risk_total) > 0 ? 'red' : 'green'}">${n(s.at_risk_total)}</div>
                <div class="sub">${n(s.at_risk_informed)} informed (${atRiskInformedRate}%) · ${n(s.acknowledgments)} ack'd</div>
            </div>
        </div>

        <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)">
            <div class="kpi">
                <div class="label">Event Execution</div>
                <div class="value" style="color:${rateColor(eventExecRate)}">${eventExecRate}%</div>
                <div class="sub">${n(s.events_executed)} of ${n(s.events_planned)} · ${n(s.events_cancelled)} cancelled</div>
            </div>
            <div class="kpi">
                <div class="label">Exam Completion</div>
                <div class="value" style="color:${rateColor(examRate)}">${examRate}%</div>
                <div class="sub">${n(s.exams_completed)} of ${n(s.exams_planned)} exams</div>
            </div>
            <div class="kpi">
                <div class="label">Post-Exam Comms</div>
                <div class="value purple">${n(s.post_exam_comms_sent)}</div>
            </div>
            <div class="kpi">
                <div class="label">Total Instructors</div>
                <div class="value blue">${n(s.instructors_total)}</div>
                <div class="sub">${n(s.instructors_on_leave)} on leave</div>
            </div>
            <div class="kpi">
                <div class="label">Universities</div>
                <div class="value">${n(s.university_count) || byUniv.length}</div>
                <div class="sub">reporting ${type === 'daily' ? 'today' : 'this period'}</div>
            </div>
        </div>

        ${observationsSection}

        <h2>University-wise Comprehensive Breakdown</h2>
        <div style="overflow-x:auto">
        <table>
            <thead><tr>
                <th style="text-align:left">University</th>
                <th>Planned</th><th>Done</th><th>Canc.</th>
                <th>Enrolled</th><th>Attended</th><th>Absent</th>
                <th>Coach Calls</th><th>Parent Calls</th>
                <th>At-Risk</th><th>Informed</th>
                <th>Instructors</th>
                <th>Events</th><th>Exams</th><th>Post-Exam</th>
            </tr></thead>
            <tbody>${univRows}${totalRow}</tbody>
        </table>
        </div>

        ${cancellationSection}
        ${teamSection}
        ${complianceSection}
        ${dailySection}

        ${aiSection}

        <div class="footer">Auto-generated by UniConnect Ops Dashboard | ${new Date().toLocaleString('en-IN')} | Comprehensive Operations Report</div>
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
                        {:else if v.icon === 'edit'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        {:else if v.icon === 'check'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        {:else if v.icon === 'search'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        {:else if v.icon === 'trophy'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 22V8a6 6 0 0 0-6-6h16a6 6 0 0 0-6 6v14"/></svg>
                        {:else if v.icon === 'zap'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        {:else if v.icon === 'message'}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
                    onclick={() => showBulkPicker = !showBulkPicker}
                    disabled={isSyncing || !sheetUrl}
                    class="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors"
                    title="Load data for multiple dates at once"
                >
                    Multi-date Load
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
            {#if showBulkPicker}
                <div class="mt-3 p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <p class="text-xs text-gray-400 mb-2">Select dates to load (each date loads from the corresponding tab in your Google Sheet):</p>
                    <div class="flex flex-wrap gap-2 items-center">
                        <input type="date" id="bulk-date-input"
                            class="bg-gray-700 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                            onkeydown={(e) => { if (e.key === 'Enter') { const inp = e.currentTarget as HTMLInputElement; if (inp.value && !bulkDates.includes(inp.value)) { bulkDates = [...bulkDates, inp.value]; inp.value = ''; } }}}
                        />
                        <button onclick={() => { const inp = document.getElementById('bulk-date-input') as HTMLInputElement; if (inp?.value && !bulkDates.includes(inp.value)) { bulkDates = [...bulkDates, inp.value]; inp.value = ''; } }}
                            class="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded">Add Date</button>
                        <button onclick={() => {
                            // Quick add: last 7 days
                            const dates: string[] = [];
                            for (let i = 0; i < 7; i++) {
                                const d = new Date(); d.setDate(d.getDate() - i);
                                dates.push(d.toISOString().split('T')[0]);
                            }
                            bulkDates = [...new Set([...bulkDates, ...dates])].sort();
                        }} class="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded">Last 7 days</button>
                        <button onclick={() => {
                            const dates: string[] = [];
                            for (let i = 0; i < 30; i++) {
                                const d = new Date(); d.setDate(d.getDate() - i);
                                dates.push(d.toISOString().split('T')[0]);
                            }
                            bulkDates = [...new Set([...bulkDates, ...dates])].sort();
                        }} class="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded">Last 30 days</button>
                        <button onclick={() => bulkDates = []} class="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs rounded">Clear</button>
                    </div>
                    {#if bulkDates.length > 0}
                        <div class="flex flex-wrap gap-1 mt-2">
                            {#each bulkDates.sort() as d}
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-900/50 text-purple-300 text-xs rounded-full border border-purple-700">
                                    {d}
                                    <button onclick={() => bulkDates = bulkDates.filter(x => x !== d)} class="text-purple-400 hover:text-white ml-0.5">&times;</button>
                                </span>
                            {/each}
                        </div>
                        <button onclick={bulkSyncByDates} disabled={isSyncing}
                            class="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded transition-colors">
                            {isSyncing ? 'Loading...' : `Load ${bulkDates.length} date(s)`}
                        </button>
                    {/if}
                </div>
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
                    <span class="mx-1 text-gray-600">|</span>
                    <button onclick={sendReportEmail} disabled={isSendingReport} class="px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs rounded transition-colors flex items-center gap-1" title="Email daily report to all admins">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        {isSendingReport ? 'Sending...' : 'Email Report'}
                    </button>
                    {#if sendReportMsg}
                        <span class="text-xs {sendReportMsg.startsWith('Report') ? 'text-green-400' : 'text-red-400'} ml-1">{sendReportMsg}</span>
                    {/if}
                </div>
            </div>
        </div>

        {#if isLoading && !['ask-ai', 'daily-form', 'form-compliance', 'sheet-setup'].includes(activeView)}
            <div class="flex items-center justify-center py-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span class="ml-3 text-gray-400">Loading data...</span>
            </div>
        {:else if !viewData && !['ask-ai', 'daily-form', 'form-compliance', 'sheet-setup', 'task-patterns', 'peer-comparison', 'university-rankings', 'event-intelligence'].includes(activeView)}
            <div class="text-center py-20 text-gray-500">
                <p class="text-lg mb-2">No data loaded</p>
                <p class="text-sm">Paste a Google Sheet URL and click "Load data" for a single tab, or "Bulk Load (Multi-tab)" for sheets with date-named tabs (e.g. "28th March", "1st April", "2026-03-28"). Sheet must be shared as "Anyone with the link".</p>
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
                    </tr></thead>
                    <tbody>
                        {#each (viewData.todayByUniversity || []) as row}
                            {@const devPct = parseInt(row.sessions_planned) ? Math.round(((parseInt(row.sessions_planned) - parseInt(row.sessions_completed)) / parseInt(row.sessions_planned)) * 100) : 0}
                            {@const isExpanded = expandedSessionRow === row.university_name}
                            <tr
                                class="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer {isExpanded ? 'bg-gray-800/40' : ''}"
                                onclick={() => expandedSessionRow = isExpanded ? null : row.university_name}
                            >
                                <td class="px-4 py-3 text-white flex items-center gap-2">
                                    <span class="text-gray-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
                                    {row.university_name}
                                </td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.sessions_planned}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.sessions_completed}</td>
                                <td class="px-4 py-3 text-center text-red-400">{row.sessions_cancelled}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{devPct}%</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="text-xs px-2 py-0.5 rounded {devPct > 10 ? 'bg-orange-600/20 text-orange-400' : 'bg-green-600/20 text-green-400'}">{statusBadge(devPct)}</span>
                                </td>
                            </tr>
                            {#if isExpanded}
                                <tr class="bg-gray-800/20">
                                    <td colspan="6" class="px-6 py-4">
                                        <div class="text-xs text-gray-500 font-semibold tracking-wider mb-1">CANCELLATION REASON</div>
                                        <div class="text-sm text-gray-300">{row.cancellation_reason || 'No reason provided'}</div>
                                    </td>
                                </tr>
                            {/if}
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

        <!-- ─── DAILY FORM ──────────────────────────────────────────── -->
        {:else if activeView === 'daily-form'}
            <div class="max-w-2xl">
                <h2 class="text-xl font-bold text-white mb-2">Daily Operations Report</h2>
                <p class="text-sm text-gray-400 mb-6">Submit your university's daily report. Events, tasks, communication data, instructor count, and exams are auto-calculated from UniConnect activity.</p>

                {#if dailyFormSuccess}
                    <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                        <p class="text-green-400 text-sm font-medium">{dailyFormSuccess}</p>
                    </div>
                {/if}
                {#if dailyFormError}
                    <div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                        <p class="text-red-400 text-sm font-medium">{dailyFormError}</p>
                    </div>
                {/if}

                <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-6">
                    <!-- University & Date -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-400 mb-1">University *</label>
                            <select bind:value={dailyFormSelectedUniv} onfocus={() => { if (!dailyFormUniversities.length) loadUniversitiesForForm(); }}
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                                <option value="">Select university...</option>
                                {#each dailyFormUniversities as univ}
                                    <option value={univ.id}>{univ.short_name || univ.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-400 mb-1">Date *</label>
                            <input type="date" bind:value={dailyFormDate}
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                        </div>
                    </div>

                    <!-- Sessions (Manual — from external app) -->
                    <div>
                        <h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            Sessions <span class="text-xs font-normal text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">Manual Input</span>
                        </h3>
                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Planned</label>
                                <input type="number" bind:value={dailyFormData.sessions_planned} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Completed</label>
                                <input type="number" bind:value={dailyFormData.sessions_completed} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Cancelled</label>
                                <input type="number" bind:value={dailyFormData.sessions_cancelled} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                        </div>
                        {#if dailyFormData.sessions_cancelled > 0}
                            <div class="mt-2">
                                <label class="block text-xs text-gray-500 mb-1">Cancellation Reason</label>
                                <input type="text" bind:value={dailyFormData.cancellation_reason} placeholder="e.g., Instructor leave, power outage..."
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                        {/if}
                    </div>

                    <!-- Attendance (Manual — from external app) -->
                    <div>
                        <h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            Attendance <span class="text-xs font-normal text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">Manual Input</span>
                        </h3>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Students Enrolled</label>
                                <input type="number" bind:value={dailyFormData.enrolled} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Students Attended</label>
                                <input type="number" bind:value={dailyFormData.attended} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                        </div>
                        {#if dailyFormData.enrolled > 0}
                            <p class="text-xs text-gray-500 mt-1">Attendance rate: <span class="text-white font-medium">{Math.round((dailyFormData.attended / dailyFormData.enrolled) * 100)}%</span></p>
                        {/if}
                    </div>

                    <!-- At-Risk Students (Manual — requires judgment) -->
                    <div>
                        <h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            At-Risk Students <span class="text-xs font-normal text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">Manual Input</span>
                        </h3>
                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Total At-Risk</label>
                                <input type="number" bind:value={dailyFormData.at_risk_total} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Informed</label>
                                <input type="number" bind:value={dailyFormData.at_risk_informed} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                                <label class="block text-xs text-gray-500 mb-1">Parent Acks</label>
                                <input type="number" bind:value={dailyFormData.acknowledgments} min="0"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                            </div>
                        </div>
                    </div>

                    <!-- Auto-Calculated Info -->
                    <div class="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
                        <h3 class="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            Auto-Calculated <span class="text-xs font-normal text-green-400 bg-green-400/10 px-2 py-0.5 rounded">From UniConnect</span>
                        </h3>
                        <p class="text-xs text-gray-400">These fields are automatically pulled from UniConnect activity when you submit:</p>
                        <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-500">
                            <span>Events (planned / executed / cancelled)</span>
                            <span>Instructor count & leave</span>
                            <span>Coach & parent calls completed</span>
                            <span>Exams scheduled</span>
                            <span>Tasks completed by team</span>
                            <span>Team activity metrics</span>
                        </div>
                    </div>

                    <!-- Remarks -->
                    <div>
                        <label class="block text-xs font-medium text-gray-400 mb-1">Remarks / Observations</label>
                        <textarea bind:value={dailyFormData.remarks} rows="3" placeholder="Any additional notes about today's operations..."
                            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"></textarea>
                    </div>

                    <!-- Submit -->
                    <button onclick={submitDailyForm} disabled={dailyFormSubmitting || !dailyFormSelectedUniv}
                        class="w-full py-3 rounded-lg font-semibold text-sm transition-all {dailyFormSubmitting || !dailyFormSelectedUniv ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}">
                        {#if dailyFormSubmitting}
                            Submitting...
                        {:else}
                            Submit Daily Report
                        {/if}
                    </button>
                </div>
            </div>

        <!-- ─── FORM COMPLIANCE STATUS ───────────────────────────────── -->
        {:else if activeView === 'form-compliance'}
            <div class="max-w-3xl">
                <h2 class="text-xl font-bold text-white mb-2">Daily Form Submission Status</h2>
                <p class="text-sm text-gray-400 mb-4">Track which universities have submitted their daily operations report.</p>

                <div class="flex items-center gap-3 mb-6">
                    <input type="date" bind:value={complianceDate}
                        class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
                    <button onclick={loadComplianceStatus}
                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">
                        {loadingCompliance ? 'Loading...' : 'Check Status'}
                    </button>
                </div>

                {#if complianceData.length > 0}
                    {@const submitted = complianceData.filter((c: any) => c.submitted)}
                    {@const missing = complianceData.filter((c: any) => !c.submitted)}
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-white">{complianceData.length}</div>
                            <div class="text-xs text-gray-500">Total Universities</div>
                        </div>
                        <div class="bg-gray-900 border border-green-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-400">{submitted.length}</div>
                            <div class="text-xs text-gray-500">Submitted</div>
                        </div>
                        <div class="bg-gray-900 border border-red-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-red-400">{missing.length}</div>
                            <div class="text-xs text-gray-500">Missing</div>
                        </div>
                    </div>

                    <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-gray-800">
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">University</th>
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Submitted By</th>
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each complianceData as row}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td class="px-4 py-3 text-white font-medium">{row.university_name}</td>
                                        <td class="px-4 py-3">
                                            {#if row.submitted}
                                                <span class="inline-flex items-center gap-1 text-green-400 text-xs font-medium bg-green-400/10 px-2 py-1 rounded-full">Submitted</span>
                                            {:else}
                                                <span class="inline-flex items-center gap-1 text-red-400 text-xs font-medium bg-red-400/10 px-2 py-1 rounded-full">Missing</span>
                                            {/if}
                                        </td>
                                        <td class="px-4 py-3 text-gray-400">{row.submitted_by_name || '—'}</td>
                                        <td class="px-4 py-3 text-gray-400">{row.submitted_at ? new Date(row.submitted_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {:else if !loadingCompliance}
                    <div class="text-center py-12 text-gray-500">
                        <p>Click "Check Status" to see submission data for the selected date.</p>
                    </div>
                {/if}
            </div>

        <!-- ─── TASK PATTERNS (Phase 3) ──────────────────────────── -->
        {:else if activeView === 'task-patterns'}
            <div>
                <h2 class="text-xl font-bold text-white mb-1">Task Pattern Analysis</h2>
                <p class="text-sm text-gray-400 mb-6">Recurring tasks, frequency, and completion metrics across teams.</p>

                {#if viewData?.patterns?.length}
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-white">{viewData.patterns.length}</div>
                            <div class="text-xs text-gray-500">Unique Task Types</div>
                        </div>
                        <div class="bg-gray-900 border border-green-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-400">{viewData.patterns.reduce((s: number, p: any) => s + (p.completed_count || 0), 0)}</div>
                            <div class="text-xs text-gray-500">Total Completed</div>
                        </div>
                        <div class="bg-gray-900 border border-red-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-red-400">{viewData.patterns.reduce((s: number, p: any) => s + (p.overdue_count || 0), 0)}</div>
                            <div class="text-xs text-gray-500">Overdue</div>
                        </div>
                    </div>

                    <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                        <table class="w-full text-sm">
                            <thead><tr class="border-b border-gray-800">
                                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Task</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Freq</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Done</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Overdue</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Avg Hours</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Assignees</th>
                                <th class="px-3 py-3 text-xs font-medium text-gray-500 uppercase">Frequency</th>
                            </tr></thead>
                            <tbody>
                                {#each viewData.patterns as p}
                                    {@const maxFreq = Math.max(...viewData.patterns.map((x: any) => x.frequency))}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td class="px-4 py-3 text-white font-medium max-w-[200px] truncate" title={p.title}>{p.title}</td>
                                        <td class="text-center px-3 py-3 text-blue-400 font-bold">{p.frequency}</td>
                                        <td class="text-center px-3 py-3 text-green-400">{p.completed_count}</td>
                                        <td class="text-center px-3 py-3 {p.overdue_count > 0 ? 'text-red-400' : 'text-gray-600'}">{p.overdue_count}</td>
                                        <td class="text-center px-3 py-3 text-gray-300">{p.avg_completion_hours ? `${p.avg_completion_hours}h` : '—'}</td>
                                        <td class="text-center px-3 py-3 text-gray-400">{p.assignee_count}</td>
                                        <td class="px-3 py-3">
                                            <div class="w-full bg-gray-800 rounded-full h-2">
                                                <div class="bg-blue-500 h-2 rounded-full" style="width: {Math.round((p.frequency / maxFreq) * 100)}%"></div>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    {#if viewData.byTeam?.length}
                        <h3 class="text-lg font-bold text-white mt-8 mb-4">Task Volume by University / Week</h3>
                        <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                            <table class="w-full text-sm">
                                <thead><tr class="border-b border-gray-800">
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">University</th>
                                    <th class="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">Week</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Tasks</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Done</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Overdue</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Avg Hours</th>
                                </tr></thead>
                                <tbody>
                                    {#each viewData.byTeam as row}
                                        <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            <td class="px-4 py-3 text-white">{row.university_name || '—'}</td>
                                            <td class="px-3 py-3 text-gray-400 text-xs">{row.week_start}</td>
                                            <td class="text-center px-3 py-3 text-blue-400">{row.task_count}</td>
                                            <td class="text-center px-3 py-3 text-green-400">{row.completed}</td>
                                            <td class="text-center px-3 py-3 {row.overdue > 0 ? 'text-red-400' : 'text-gray-600'}">{row.overdue}</td>
                                            <td class="text-center px-3 py-3 text-gray-300">{row.avg_hours ? `${row.avg_hours}h` : '—'}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {/if}
                {:else}
                    <div class="text-center py-16 text-gray-500">
                        <p class="text-lg mb-2">No task data found</p>
                        <p class="text-sm">Tasks created this month will appear here with pattern analysis.</p>
                    </div>
                {/if}
            </div>

        <!-- ─── PEER COMPARISON (Phase 3) ────────────────────────── -->
        {:else if activeView === 'peer-comparison'}
            <div>
                <h2 class="text-xl font-bold text-white mb-1">Peer Comparison</h2>
                <p class="text-sm text-gray-400 mb-6">Compare task completion metrics across team members.</p>

                {#if viewData?.users?.length}
                    <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mb-8">
                        <div class="px-4 py-3 border-b border-gray-800">
                            <h3 class="text-sm font-semibold text-white">Leaderboard — Task Completion</h3>
                        </div>
                        <table class="w-full text-sm">
                            <thead><tr class="border-b border-gray-800">
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase w-12">#</th>
                                <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th class="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">University</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Tasks</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Done</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">On-time</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Overdue</th>
                                <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Avg Hours</th>
                                <th class="px-3 py-3 text-xs font-medium text-gray-500 uppercase">Completion</th>
                            </tr></thead>
                            <tbody>
                                {#each viewData.users as user, i}
                                    {@const rate = user.total_tasks > 0 ? Math.round((user.completed / user.total_tasks) * 100) : 0}
                                    <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                        <td class="text-center px-3 py-3 {i < 3 ? 'text-yellow-400 font-bold' : 'text-gray-500'}">{i + 1}</td>
                                        <td class="px-4 py-3 text-white font-medium">{user.user_name}</td>
                                        <td class="px-3 py-3 text-gray-400 text-xs">{user.university_name || '—'}</td>
                                        <td class="text-center px-3 py-3 text-blue-400">{user.total_tasks}</td>
                                        <td class="text-center px-3 py-3 text-green-400 font-bold">{user.completed}</td>
                                        <td class="text-center px-3 py-3 text-emerald-400">{user.on_time_count}</td>
                                        <td class="text-center px-3 py-3 {user.overdue > 0 ? 'text-red-400' : 'text-gray-600'}">{user.overdue}</td>
                                        <td class="text-center px-3 py-3 text-gray-300">{user.avg_hours ? `${user.avg_hours}h` : '—'}</td>
                                        <td class="px-3 py-3">
                                            <div class="flex items-center gap-2">
                                                <div class="flex-1 bg-gray-800 rounded-full h-2">
                                                    <div class="h-2 rounded-full {rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}" style="width: {rate}%"></div>
                                                </div>
                                                <span class="text-xs text-gray-400 w-8">{rate}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    {#if viewData.sameTaskComparisons?.length}
                        <h3 class="text-lg font-bold text-white mb-4">Same-Task Speed Comparison</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {#each viewData.sameTaskComparisons.slice(0, 10) as comp}
                                {@const maxHrs = Math.max(...comp.completions.map((c: any) => c.avg_hours || 1))}
                                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
                                    <h4 class="text-sm font-semibold text-white mb-3 truncate" title={comp.taskTitle}>{comp.taskTitle}</h4>
                                    {#each comp.completions as c}
                                        <div class="flex items-center gap-2 mb-2">
                                            <span class="text-xs text-gray-400 w-24 truncate" title={c.user_name}>{c.user_name}</span>
                                            <div class="flex-1 bg-gray-800 rounded-full h-3">
                                                <div class="bg-blue-500 h-3 rounded-full flex items-center justify-end pr-1" style="width: {Math.max(Math.round((c.avg_hours / maxHrs) * 100), 10)}%">
                                                    <span class="text-[9px] text-white font-bold">{c.avg_hours}h</span>
                                                </div>
                                            </div>
                                            <span class="text-[10px] text-gray-500 w-8">{c.times_done}x</span>
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                        </div>
                    {/if}
                {:else}
                    <div class="text-center py-16 text-gray-500">
                        <p class="text-lg mb-2">No comparison data</p>
                        <p class="text-sm">Task data for this month will appear here.</p>
                    </div>
                {/if}
            </div>

        <!-- ─── UNIVERSITY RANKINGS (Phase 3) ────────────────────── -->
        {:else if activeView === 'university-rankings'}
            <div>
                <h2 class="text-xl font-bold text-white mb-1">University Rankings</h2>
                <p class="text-sm text-gray-400 mb-6">Composite efficiency scores: Sessions 25%, Attendance 25%, Coach Coverage 15%, At-Risk Follow-up 10%, Compliance 15%, Events 10%.</p>

                {#if viewData?.rankings?.length}
                    <div class="space-y-3">
                        {#each viewData.rankings as uni, i}
                            <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
                                <div class="flex items-center gap-4">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black {i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-amber-700/20 text-amber-500' : 'bg-gray-800 text-gray-500'}">
                                        {i + 1}
                                    </div>
                                    <div class="flex-1">
                                        <div class="flex items-center gap-3 mb-1">
                                            <h3 class="text-white font-bold">{uni.university_name}</h3>
                                            <span class="text-2xl font-black {uni.score >= 80 ? 'text-green-400' : uni.score >= 60 ? 'text-yellow-400' : 'text-red-400'}">{uni.score}</span>
                                            <span class="text-xs text-gray-500">/100</span>
                                            {#if uni.trend_delta != null}
                                                <span class="text-xs font-bold px-2 py-0.5 rounded {uni.trend_delta > 0 ? 'bg-green-500/10 text-green-400' : uni.trend_delta < 0 ? 'bg-red-500/10 text-red-400' : 'bg-gray-800 text-gray-500'}">
                                                    {uni.trend_delta > 0 ? '+' : ''}{uni.trend_delta} vs prev
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="flex gap-3 text-xs">
                                            <span class="text-gray-500">Sessions <span class="{uni.sessRate >= 80 ? 'text-green-400' : uni.sessRate >= 60 ? 'text-yellow-400' : 'text-red-400'} font-bold">{uni.sessRate}%</span></span>
                                            <span class="text-gray-500">Attendance <span class="{uni.attRate >= 80 ? 'text-green-400' : uni.attRate >= 60 ? 'text-yellow-400' : 'text-red-400'} font-bold">{uni.attRate}%</span></span>
                                            <span class="text-gray-500">Coach <span class="{uni.coachRate >= 80 ? 'text-green-400' : uni.coachRate >= 60 ? 'text-yellow-400' : 'text-red-400'} font-bold">{uni.coachRate}%</span></span>
                                            <span class="text-gray-500">Risk F/U <span class="{uni.riskRate >= 80 ? 'text-green-400' : 'text-yellow-400'} font-bold">{uni.riskRate}%</span></span>
                                            <span class="text-gray-500">Compliance <span class="{uni.complianceRate >= 80 ? 'text-green-400' : uni.complianceRate >= 50 ? 'text-yellow-400' : 'text-red-400'} font-bold">{uni.complianceRate}%</span></span>
                                            <span class="text-gray-500">Events <span class="text-blue-400 font-bold">{uni.eventRate}%</span></span>
                                        </div>
                                    </div>
                                    <!-- Score bar -->
                                    <div class="w-32">
                                        <div class="w-full bg-gray-800 rounded-full h-3">
                                            <div class="h-3 rounded-full {uni.score >= 80 ? 'bg-green-500' : uni.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}" style="width: {uni.score}%"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="text-center py-16 text-gray-500">
                        <p class="text-lg mb-2">No ranking data</p>
                        <p class="text-sm">Ops daily data for this month is needed to generate rankings.</p>
                    </div>
                {/if}
            </div>

        <!-- ─── EVENT INTELLIGENCE (Phase 4) ─────────────────────── -->
        {:else if activeView === 'event-intelligence'}
            <div>
                <h2 class="text-xl font-bold text-white mb-1">Event & Budget Intelligence</h2>
                <p class="text-sm text-gray-400 mb-6">ROI analysis, budget efficiency, and attendance accuracy for events.</p>

                {#if viewData?.aggregates}
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-white">{viewData.aggregates.totalEvents}</div>
                            <div class="text-xs text-gray-500">Total Events</div>
                        </div>
                        <div class="bg-gray-900 border border-blue-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-blue-400">{viewData.aggregates.eventsWithReports}</div>
                            <div class="text-xs text-gray-500">With Reports</div>
                        </div>
                        <div class="bg-gray-900 border border-green-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-green-400">{viewData.aggregates.avgBudgetUtilization}%</div>
                            <div class="text-xs text-gray-500">Avg Budget Util.</div>
                        </div>
                        <div class="bg-gray-900 border border-purple-500/30 rounded-lg p-4 text-center">
                            <div class="text-2xl font-bold text-purple-400">{viewData.aggregates.avgAttendanceAccuracy}%</div>
                            <div class="text-xs text-gray-500">Attendance Accuracy</div>
                        </div>
                        <div class="bg-gray-900 border border-amber-500/30 rounded-lg p-4 text-center">
                            <div class="text-xl font-bold text-amber-400">{viewData.aggregates.avgCostPerParticipant > 0 ? `₹${viewData.aggregates.avgCostPerParticipant}` : '—'}</div>
                            <div class="text-xs text-gray-500">Avg Cost/Person</div>
                        </div>
                    </div>

                    <!-- AI Analysis Button -->
                    <div class="mb-6">
                        <button onclick={loadEventIntelAI} disabled={eventIntelAILoading}
                            class="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            {eventIntelAILoading ? 'Analyzing...' : 'AI Analysis'}
                        </button>
                        {#if eventIntelAI}
                            <div class="mt-4 bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
                                <h4 class="text-sm font-semibold text-purple-400 mb-2">AI Budget & Event Insights</h4>
                                <div class="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{eventIntelAI}</div>
                            </div>
                        {/if}
                    </div>

                    <!-- Problem Patterns -->
                    {#if viewData.problemPatterns?.length}
                        <div class="mb-6">
                            <h3 class="text-sm font-semibold text-red-400 mb-3">Problem Patterns</h3>
                            <div class="space-y-2">
                                {#each viewData.problemPatterns as problem}
                                    <div class="bg-red-500/5 border border-red-500/20 rounded-lg p-3 flex items-start gap-3">
                                        <span class="text-xs font-bold px-2 py-0.5 rounded {problem.type === 'budget_overrun' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}">
                                            {problem.type === 'budget_overrun' ? 'OVER BUDGET' : 'LOW ATTENDANCE'}
                                        </span>
                                        <div class="flex-1">
                                            <span class="text-sm text-white font-medium">{problem.event}</span>
                                            <span class="text-xs text-gray-500 ml-2">@ {problem.university}</span>
                                            <span class="text-xs text-red-400 ml-2 font-bold">{problem.value}</span>
                                            {#if problem.detail}<p class="text-xs text-gray-400 mt-1">{problem.detail}</p>{/if}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- By Event Type -->
                    {#if viewData.byType?.length}
                        <h3 class="text-sm font-semibold text-white mb-3">By Event Type</h3>
                        <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mb-6">
                            <table class="w-full text-sm">
                                <thead><tr class="border-b border-gray-800">
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Events</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Done</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Avg Budget</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Avg Attend.</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Cost/Person</th>
                                </tr></thead>
                                <tbody>
                                    {#each viewData.byType as t}
                                        <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            <td class="px-4 py-3 text-white font-medium">{t.event_type || '—'}</td>
                                            <td class="text-center px-3 py-3 text-blue-400">{t.total_events}</td>
                                            <td class="text-center px-3 py-3 text-green-400">{t.completed}</td>
                                            <td class="text-center px-3 py-3 text-gray-300">{t.avg_budget ? `₹${Math.round(t.avg_budget)}` : '—'}</td>
                                            <td class="text-center px-3 py-3 text-gray-300">{t.avg_attendance || '—'}</td>
                                            <td class="text-center px-3 py-3 text-amber-400">{t.avg_cost_pp ? `₹${Math.round(t.avg_cost_pp)}` : '—'}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {/if}

                    <!-- Events Table -->
                    {#if viewData.events?.length}
                        <h3 class="text-sm font-semibold text-white mb-3">All Events ({viewData.events.length})</h3>
                        <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden overflow-x-auto">
                            <table class="w-full text-sm min-w-[800px]">
                                <thead><tr class="border-b border-gray-800">
                                    <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                                    <th class="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase">University</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Budget Est.</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Util %</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Exp. Att.</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Actual Att.</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Cost/PP</th>
                                    <th class="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr></thead>
                                <tbody>
                                    {#each viewData.events.slice(0, 50) as ev}
                                        <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            <td class="px-4 py-3 text-white font-medium max-w-[180px] truncate" title={ev.title}>{ev.title}</td>
                                            <td class="px-3 py-3 text-gray-400 text-xs">{ev.university_name || '—'}</td>
                                            <td class="text-center px-3 py-3 text-gray-300">{ev.estimated_total_budget ? `₹${Math.round(ev.estimated_total_budget)}` : '—'}</td>
                                            <td class="text-center px-3 py-3 text-gray-300">{ev.actual_budget_used ? `₹${Math.round(ev.actual_budget_used)}` : '—'}</td>
                                            <td class="text-center px-3 py-3 {ev.budget_utilization && parseFloat(ev.budget_utilization) > 130 ? 'text-red-400 font-bold' : 'text-gray-300'}">{ev.budget_utilization ? `${ev.budget_utilization}%` : '—'}</td>
                                            <td class="text-center px-3 py-3 text-gray-400">{ev.expected_attendance || '—'}</td>
                                            <td class="text-center px-3 py-3 text-gray-300">{ev.actual_attendance || '—'}</td>
                                            <td class="text-center px-3 py-3 text-amber-400">{ev.cost_per_participant ? `₹${ev.cost_per_participant}` : '—'}</td>
                                            <td class="text-center px-3 py-3">
                                                <span class="text-xs px-2 py-0.5 rounded-full {ev.status === 'CLOSED' || ev.status === 'REPORT_SUBMITTED' ? 'bg-green-500/10 text-green-400' : ev.status === 'APPROVED' || ev.status === 'EVENT_COMPLETED' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-800 text-gray-400'}">{ev.status}</span>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {/if}
                {:else}
                    <div class="text-center py-16 text-gray-500">
                        <p class="text-lg mb-2">No event data</p>
                        <p class="text-sm">Budget proposals and event reports for this month will be analyzed here.</p>
                    </div>
                {/if}
            </div>

        <!-- ─── ASK AI / NLQ (Phase 4) ───────────────────────────── -->
        {:else if activeView === 'ask-ai'}
            <div class="max-w-4xl">
                <h2 class="text-xl font-bold text-white mb-1">Ask AI</h2>
                <p class="text-sm text-gray-400 mb-6">Ask questions about your operations data in natural language. Powered by Gemini AI.</p>

                <div class="flex gap-3 mb-4">
                    <input
                        type="text"
                        bind:value={nlqQuestion}
                        placeholder="Ask anything about operations..."
                        class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        onkeydown={(e) => { if (e.key === 'Enter') askAI(); }}
                    />
                    <button onclick={askAI} disabled={nlqLoading || !nlqQuestion.trim()}
                        class="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        {nlqLoading ? 'Thinking...' : 'Ask'}
                    </button>
                </div>

                <!-- Suggested questions -->
                <div class="flex flex-wrap gap-2 mb-6">
                    {#each ['How did each university perform last week?', 'Which universities have the highest attendance?', 'Show me overdue tasks', 'Compare session rates across universities this month', 'Which university has the most at-risk students?', 'Show instructor leave trends'] as suggestion}
                        <button
                            onclick={() => { nlqQuestion = suggestion; askAI(); }}
                            class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-400 rounded-full transition-colors"
                        >{suggestion}</button>
                    {/each}
                </div>

                {#if nlqLoading}
                    <div class="flex items-center gap-3 py-8 justify-center">
                        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                        <span class="text-gray-400">Analyzing your question...</span>
                    </div>
                {/if}

                {#if nlqAnswer}
                    <div class="bg-purple-500/5 border border-purple-500/20 rounded-lg p-5 mb-4">
                        <h4 class="text-sm font-semibold text-purple-400 mb-2 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            AI Answer
                        </h4>
                        <div class="text-sm text-gray-300 whitespace-pre-line leading-relaxed">{nlqAnswer}</div>
                    </div>

                    {#if nlqQuery}
                        <button onclick={() => nlqShowQuery = !nlqShowQuery} class="text-xs text-gray-500 hover:text-gray-400 mb-2 flex items-center gap-1">
                            <svg class="w-3 h-3 transition-transform {nlqShowQuery ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                            {nlqShowQuery ? 'Hide' : 'Show'} generated SQL
                        </button>
                        {#if nlqShowQuery}
                            <pre class="bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-400 font-mono overflow-x-auto mb-4">{nlqQuery}</pre>
                        {/if}
                    {/if}

                    {#if nlqData?.length}
                        <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead><tr class="border-b border-gray-800">
                                    {#each Object.keys(nlqData[0]) as col}
                                        <th class="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
                                    {/each}
                                </tr></thead>
                                <tbody>
                                    {#each nlqData.slice(0, 50) as row}
                                        <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            {#each Object.values(row) as val}
                                                <td class="px-4 py-3 text-gray-300 whitespace-nowrap">{val != null ? val : '—'}</td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                        {#if nlqData.length > 50}
                            <p class="text-xs text-gray-500 mt-2">Showing 50 of {nlqData.length} rows</p>
                        {/if}
                    {/if}
                {/if}
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
