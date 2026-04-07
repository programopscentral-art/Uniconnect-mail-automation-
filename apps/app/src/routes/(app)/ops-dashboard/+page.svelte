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
    let showReportPicker = $state<'weekly' | 'monthly' | null>(null);

    // Generate week options for a given month — proper calendar weeks
    function getWeekOptions() {
        const now = new Date();
        const options: { label: string; start: string; end: string }[] = [];
        // Go back 3 months for enough week options
        for (let m = -3; m <= 0; m++) {
            const refDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
            const year = refDate.getFullYear();
            const month = refDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            // Find first Monday on or before the 1st
            const first = new Date(year, month, 1);
            let startDay = new Date(first);
            const dow = startDay.getDay();
            // Align to Monday: if 1st is not Monday, go back to previous Monday
            if (dow !== 1) {
                const diff = dow === 0 ? 6 : dow - 1;
                startDay.setDate(startDay.getDate() - diff);
            }
            // Generate weeks that overlap this month
            while (startDay.getMonth() <= month || (startDay.getMonth() === 11 && month === 0)) {
                const endDay = new Date(startDay);
                endDay.setDate(endDay.getDate() + 5); // Mon-Sat (6 working days)
                // Only include if the week overlaps with this month
                if (endDay >= first && startDay.getDate() <= daysInMonth + 7) {
                    const s = startDay.toISOString().split('T')[0];
                    const e = endDay.toISOString().split('T')[0];
                    // Avoid duplicates
                    if (!options.find(o => o.start === s)) {
                        const ordinal = (n: number) => {
                            const s = ['th', 'st', 'nd', 'rd'];
                            const v = n % 100;
                            return n + (s[(v - 20) % 10] || s[v] || s[0]);
                        };
                        const sLabel = `${ordinal(startDay.getDate())} ${startDay.toLocaleDateString('en-IN', { month: 'short' })}`;
                        const eLabel = `${ordinal(endDay.getDate())} ${endDay.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
                        options.push({ label: `${sLabel} — ${eLabel}`, start: s, end: e });
                    }
                }
                startDay.setDate(startDay.getDate() + 7);
                if (startDay.getMonth() > month && startDay.getFullYear() >= year && m < 0) break;
                if (startDay > now && m === 0) break;
            }
        }
        // Deduplicate and sort by start date descending (most recent first)
        const seen = new Set<string>();
        return options.filter(o => {
            if (seen.has(o.start)) return false;
            seen.add(o.start);
            return true;
        }).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 16);
    }

    function getMonthOptions() {
        const now = new Date();
        const options: { label: string; year: number; month: number }[] = [];
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            options.push({
                label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
                year: d.getFullYear(),
                month: d.getMonth() + 1
            });
        }
        return options;
    }

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
    ];

    const viewGroups: Record<string, string[]> = {
        'VIEWS': ['overview', 'sessions', 'attendance', 'at-risk', 'instructors', 'events', 'exams', 'post-exam', 'per-university'],
        'TEAM & COMPLIANCE': ['team-activity', 'daily-reports', 'compliance'],
        'DAILY REPORTING': ['daily-form', 'form-compliance'],
    };

    // ─── Daily Form State ───────────────────────────────────────────
    let dailyFormUniversities = $state<any[]>([]);
    let dailyFormSelectedUniv = $state('');
    let dailyFormDate = $state(new Date().toISOString().split('T')[0]);
    let dailyFormSubmitting = $state(false);
    let dailyFormSuccess = $state('');
    let dailyFormError = $state('');
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
    async function downloadReport(type: 'daily' | 'weekly' | 'monthly', opts?: { weekStart?: string; weekEnd?: string; year?: number; month?: number }) {
        isDownloading = true;
        showReportPicker = null;
        try {
            const params = new URLSearchParams({ view: 'report', type, date: selectedDate });
            if (type === 'weekly' && opts?.weekStart && opts?.weekEnd) {
                params.set('weekStart', opts.weekStart);
                params.set('weekEnd', opts.weekEnd);
            }
            if (type === 'monthly' && opts?.year && opts?.month) {
                params.set('year', String(opts.year));
                params.set('month', String(opts.month));
            }
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
            const fileName = type === 'weekly' && opts?.weekStart
                ? `UniOps_weekly_report_${opts.weekStart}_to_${opts.weekEnd}.html`
                : type === 'monthly' && opts?.year
                    ? `UniOps_monthly_report_${opts.year}-${String(opts.month).padStart(2, '0')}.html`
                    : `UniOps_${type}_report_${selectedDate}.html`;
            a.download = fileName;
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
        const periodLabel = type === 'daily' ? report.date :
            type === 'weekly' ? `${report.weekStart} to ${report.weekEnd}` :
            `${new Date(report.year, (report.month || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
        const title = type === 'daily' ? `Daily Operations Report — ${formatReportDate(report.date)}` :
            type === 'weekly' ? `Weekly Operations Report — ${formatReportDate(report.weekStart)} to ${formatReportDate(report.weekEnd)}` :
            `Monthly Operations Report — ${new Date(report.year, (report.month || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

        function formatReportDate(d: string) {
            try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
        }
        function formatShortDate(d: string) {
            try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); } catch { return d; }
        }

        const s = report.summary || {};
        const rawByUniv = report.byUniversity || [];
        const rawDaily = report.dailyBreakdown || [];
        const rawCompliance = report.compliance || [];
        const rawTeamActivity = report.teamActivity || [];

        const n = (v: any) => parseInt(v) || 0;
        const f = (v: any) => parseFloat(v) || 0;

        // ── DEDUPLICATE universities by normalizing names ──
        // Handles typos, casing, reversed word order: "CHALAPATHI"/"Chalapathy", "CIET/CITY"/"CITY/CIET"
        const UNIV_ALIASES: Record<string, string> = {
            'chalapathy': 'chalapathi', 'chalapathi': 'chalapathi',
            'cresent': 'crescent', 'crescent': 'crescent',
            'cietcity': 'cietcity', 'cityciet': 'cietcity',
            'yenapoya': 'yenapoya',
        };
        function normalizeUnivName(name: string) {
            const lower = (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (UNIV_ALIASES[lower]) return UNIV_ALIASES[lower];
            // Sort /-separated parts so "CIET/CITY" and "CITY/CIET" match
            const sorted = (name || '').trim().toLowerCase().split(/[\/\-\s]+/).filter(Boolean).sort().join('');
            return sorted || lower;
        }
        function mergeUnivRows(rows: any[]) {
            const merged = new Map<string, any>();
            for (const r of rows) {
                const key = normalizeUnivName(r.university_name);
                if (!key) continue;
                if (merged.has(key)) {
                    const existing = merged.get(key)!;
                    for (const k of Object.keys(r)) {
                        if (k === 'university_name') continue;
                        const val = typeof r[k] === 'number' || (typeof r[k] === 'string' && /^\d+$/.test(r[k])) ? n(r[k]) : 0;
                        const exVal = typeof existing[k] === 'number' || (typeof existing[k] === 'string' && /^\d+$/.test(existing[k])) ? n(existing[k]) : 0;
                        if (val || exVal) existing[k] = exVal + val;
                    }
                } else {
                    merged.set(key, { ...r });
                }
            }
            return Array.from(merged.values()).sort((a, b) => (a.university_name || '').localeCompare(b.university_name || ''));
        }
        const byUniv = mergeUnivRows(rawByUniv);
        const teamActivity = mergeUnivRows(rawTeamActivity);

        // Recalculate summary totals from deduplicated data
        const totalSessionsPlanned = byUniv.reduce((s: number, r: any) => s + n(r.sessions_planned), 0);
        const totalSessionsCompleted = byUniv.reduce((s: number, r: any) => s + n(r.sessions_completed), 0);
        const totalSessionsCancelled = byUniv.reduce((s: number, r: any) => s + n(r.sessions_cancelled), 0);
        const totalEnrolled = byUniv.reduce((s: number, r: any) => s + n(r.enrolled), 0);
        const totalAttended = byUniv.reduce((s: number, r: any) => s + n(r.attended), 0);
        const totalAbsent = totalEnrolled - totalAttended;
        const totalCoachCalls = byUniv.reduce((s: number, r: any) => s + n(r.coach_calls), 0);
        const totalParentCalls = byUniv.reduce((s: number, r: any) => s + n(r.parent_calls), 0);
        const totalAtRisk = byUniv.reduce((s: number, r: any) => s + n(r.at_risk_total), 0);
        const totalAtRiskInformed = byUniv.reduce((s: number, r: any) => s + n(r.at_risk_informed), 0);
        const totalEventsPlanned = byUniv.reduce((s: number, r: any) => s + n(r.events_planned), 0);
        const totalEventsExecuted = byUniv.reduce((s: number, r: any) => s + n(r.events_executed), 0);
        const totalEventsCancelled = byUniv.reduce((s: number, r: any) => s + n(r.events_cancelled), 0);
        const totalExamsPlanned = byUniv.reduce((s: number, r: any) => s + n(r.exams_planned), 0);
        const totalExamsCompleted = Math.min(byUniv.reduce((s: number, r: any) => s + n(r.exams_completed), 0), totalExamsPlanned);

        const sessRate = totalSessionsPlanned > 0 ? Math.round((totalSessionsCompleted / totalSessionsPlanned) * 100) : 0;
        const attRate = totalEnrolled > 0 ? Math.round((totalAttended / totalEnrolled) * 100) : 0;
        const coachRate = totalAbsent > 0 ? Math.min(Math.round((totalCoachCalls / totalAbsent) * 100), 100) : 0;
        const parentRate = totalAbsent > 0 ? Math.min(Math.round((totalParentCalls / totalAbsent) * 100), 100) : 0;
        const eventExecRate = totalEventsPlanned > 0 ? Math.round((totalEventsExecuted / totalEventsPlanned) * 100) : 0;
        const examRate = totalExamsPlanned > 0 ? Math.min(Math.round((totalExamsCompleted / totalExamsPlanned) * 100), 100) : 0;
        const atRiskInformedRate = totalAtRisk > 0 ? Math.round((totalAtRiskInformed / totalAtRisk) * 100) : 0;

        const rateColor = (v: number) => v >= 80 ? '#16a34a' : v >= 50 ? '#ca8a04' : '#dc2626';
        const rateColorBg = (v: number) => v >= 80 ? '#f0fdf4' : v >= 50 ? '#fefce8' : '#fef2f2';
        const statusBadge = (status: string) => {
            const colors: Record<string, string> = { 'Filed': '#16a34a', 'Submitted': '#16a34a', 'Missing': '#dc2626', 'Late': '#ca8a04', 'On time': '#16a34a', 'Complete': '#16a34a', 'Partial': '#ca8a04' };
            const bg: Record<string, string> = { 'Filed': '#f0fdf4', 'Submitted': '#f0fdf4', 'Missing': '#fef2f2', 'Late': '#fefce8', 'On time': '#f0fdf4', 'Complete': '#f0fdf4', 'Partial': '#fefce8' };
            return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;color:${colors[status] || '#64748b'};background:${bg[status] || '#f1f5f9'}">${status}</span>`;
        };

        // ── SVG Chart Helpers ──
        function svgDonut(percent: number, label: string, color: string, size = 100) {
            const r = size * 0.38; const cx = size / 2; const cy = size / 2;
            const circ = 2 * Math.PI * r;
            const p = Math.min(Math.max(percent, 0), 100);
            return `<svg width="${size}" height="${size + 20}" viewBox="0 0 ${size} ${size + 20}">
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="8"/>
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${circ * p / 100} ${circ * (100 - p) / 100}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
                <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="16" font-weight="800" fill="${color}">${p}%</text>
                <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="8" fill="#94a3b8">${label}</text>
            </svg>`;
        }
        function svgBar(bars: {label: string; value: number; color: string}[], height = 120) {
            if (!bars.length) return '';
            const w = 400; const barW = Math.min(40, (w - 40) / bars.length - 8);
            const maxVal = Math.max(...bars.map(b => b.value), 1);
            const barsHtml = bars.map((b, i) => {
                const bh = Math.max(2, (b.value / maxVal) * (height - 30));
                const x = 20 + i * ((w - 40) / bars.length) + ((w - 40) / bars.length - barW) / 2;
                return `<rect x="${x}" y="${height - 20 - bh}" width="${barW}" height="${bh}" rx="3" fill="${b.color}" opacity="0.85"/>
                    <text x="${x + barW / 2}" y="${height - 24 - bh}" text-anchor="middle" font-size="9" fill="#374151" font-weight="600">${b.value}</text>
                    <text x="${x + barW / 2}" y="${height - 4}" text-anchor="middle" font-size="8" fill="#94a3b8">${b.label}</text>`;
            }).join('');
            return `<svg width="100%" viewBox="0 0 ${w} ${height}">${barsHtml}</svg>`;
        }
        function svgHBar(items: {label: string; value: number; max: number; color: string}[]) {
            if (!items.length) return '';
            const h = items.length * 28 + 10;
            const maxVal = Math.max(...items.map(i => i.max), 1);
            const rows = items.map((item, i) => {
                const y = 8 + i * 28; const bw = Math.max(2, (item.value / maxVal) * 240);
                return `<text x="0" y="${y + 14}" font-size="10" fill="#374151" font-weight="500">${item.label}</text>
                    <rect x="130" y="${y + 2}" width="${bw}" height="16" rx="3" fill="${item.color}" opacity="0.8"/>
                    <text x="${132 + bw + 4}" y="${y + 14}" font-size="9" fill="#64748b" font-weight="600">${item.value}/${item.max}</text>`;
            }).join('');
            return `<svg width="100%" viewBox="0 0 420 ${h}">${rows}</svg>`;
        }

        // ── University Breakdown Table ──
        const univRows = byUniv.map((r: any) => {
            const uAtt = n(r.enrolled) > 0 ? Math.round((n(r.attended) / n(r.enrolled)) * 100) : 0;
            const uSess = n(r.sessions_planned) > 0 ? Math.round((n(r.sessions_completed) / n(r.sessions_planned)) * 100) : 0;
            const uAbsent = n(r.enrolled) - n(r.attended);
            const uCoachRate = uAbsent > 0 ? Math.min(Math.round((n(r.coach_calls) / uAbsent) * 100), 100) : 0;
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
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${Math.min(n(r.exams_completed), n(r.exams_planned))}/${n(r.exams_planned)}</td>
                <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${n(r.post_exam_comms_sent)}</td>
            </tr>`;
        }).join('');

        const totalRow = byUniv.length > 1 ? `<tr style="background:#f0f4ff;font-weight:700">
            <td style="padding:10px 12px;border-top:2px solid #6366f1">TOTAL (${byUniv.length} universities)</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalSessionsPlanned}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:${rateColor(sessRate)}">${totalSessionsCompleted} (${sessRate}%)</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:#dc2626">${totalSessionsCancelled}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalEnrolled}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:${rateColor(attRate)}">${totalAttended} (${attRate}%)</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalAbsent}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalCoachCalls}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalParentCalls}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center;color:#dc2626">${totalAtRisk}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalAtRiskInformed}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.instructors_total)}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalEventsExecuted}/${totalEventsPlanned}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${totalExamsCompleted}/${totalExamsPlanned}</td>
            <td style="padding:10px 8px;border-top:2px solid #6366f1;text-align:center">${n(s.post_exam_comms_sent)}</td>
        </tr>` : '';

        // ── Team Activity Section ──
        let teamSection = '';
        if (teamActivity.length > 0 && teamActivity.some((r: any) => n(r.instructors_active) + n(r.coaches_active) + n(r.program_ops_active) + n(r.total_calls_made) > 0)) {
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
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Staff Activity &amp; Productivity</h2>
            <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Number of active staff members and their work output per university. Calls = student/parent outreach calls made. Tickets = tasks completed.</p>
            <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-top:16px">
                <div class="kpi"><div class="label">Instructors</div><div class="value blue">${totalInstructorsActive}</div><div class="sub">Avg ${avgInstrHrs}h/day</div></div>
                <div class="kpi"><div class="label">Coaches (CMAs)</div><div class="value purple">${totalCoachesActive}</div><div class="sub">Avg ${avgCoachHrs}h/day</div></div>
                <div class="kpi"><div class="label">Program Ops</div><div class="value" style="color:#0891b2">${totalOpsActive}</div><div class="sub">Avg ${avgOpsHrs}h/day</div></div>
            </div>
            <table>
                <thead><tr>
                    <th style="text-align:left">University</th>
                    <th>Instructors</th><th>Coaches</th><th>Prog. Ops</th>
                    <th>Outreach Calls</th><th>Tasks Done</th><th>Clicks/Shares</th>
                    <th>Instr. Hrs</th><th>Coach Hrs</th><th>Ops Hrs</th>
                </tr></thead><tbody>` +
            teamActivity.filter((r: any) => n(r.instructors_active) + n(r.coaches_active) + n(r.program_ops_active) > 0).map((r: any) => `<tr>
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
        if (rawCompliance.length > 0) {
            const totalReports = rawCompliance.length;
            const completeReports = rawCompliance.filter((r: any) => {
                const filed = [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length;
                return filed === 3;
            }).length;
            const partialReports = rawCompliance.filter((r: any) => {
                const filed = [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length;
                return filed > 0 && filed < 3;
            }).length;
            const missingReports = totalReports - completeReports - partialReports;
            const complianceRate = totalReports > 0 ? Math.round((completeReports / totalReports) * 100) : 0;

            complianceSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Daily Report Submission Compliance</h2>
            <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Each university must submit 3 daily reports: <strong>Instructor Report</strong> (session & teaching data), <strong>Coach Report</strong> (student outreach & calls), and <strong>Ops Report</strong> (events, admin tasks). "Missing" = not submitted for that date.</p>
            <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-top:16px">
                <div class="kpi kpi-highlight"><div class="label">Compliance Rate</div><div class="value" style="color:${rateColor(complianceRate)}">${complianceRate}%</div><div class="sub">${completeReports} of ${totalReports} fully submitted</div></div>
                <div class="kpi"><div class="label">All 3 Reports Filed</div><div class="value green">${completeReports}</div></div>
                <div class="kpi"><div class="label">Partially Filed</div><div class="value amber">${partialReports}</div><div class="sub">1 or 2 of 3 reports</div></div>
                <div class="kpi"><div class="label">No Reports Filed</div><div class="value red">${missingReports}</div><div class="sub">0 of 3 reports</div></div>
            </div>` +
            // Group compliance by university for cleaner view
            (() => {
                const univGroups = new Map<string, any[]>();
                for (const r of rawCompliance) {
                    const key = normalizeUnivName(r.university_name);
                    if (!univGroups.has(key)) univGroups.set(key, []);
                    univGroups.get(key)!.push(r);
                }
                return `<table>
                <thead><tr>
                    <th style="text-align:left">University</th>
                    <th style="text-align:left">Date</th>
                    <th>Instructor</th><th>Coach</th><th>Ops</th>
                    <th>Submitted By</th><th>Status</th>
                </tr></thead><tbody>` +
                Array.from(univGroups.entries()).map(([, rows]) =>
                    rows.map((r: any, i: number) => {
                        const filed = [r.instructor_report, r.coach_report, r.ops_report].filter((x: string) => x === 'Filed' || x === 'Submitted').length;
                        const overallStatus = filed === 3 ? 'Complete' : filed > 0 ? 'Partial' : 'Missing';
                        const dateStr = String(r.date).split('T')[0];
                        return `<tr${i === 0 ? ' style="border-top:2px solid #e2e8f0"' : ''}>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;font-weight:${i === 0 ? '600' : '400'}">${i === 0 ? r.university_name : ''}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;font-size:12px">${formatShortDate(dateStr)}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${statusBadge(r.instructor_report || 'Missing')}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${statusBadge(r.coach_report || 'Missing')}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${statusBadge(r.ops_report || 'Missing')}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:12px">${r.report_submitted_by || '—'}</td>
                            <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${statusBadge(overallStatus)}</td>
                        </tr>`;
                    }).join('')
                ).join('') +
                `</tbody></table>`;
            })();
        }

        // ── Daily Breakdown (aggregated by date for weekly/monthly) ──
        let dailySection = '';
        if (type !== 'daily') {
            // Aggregate daily data by date (across all universities)
            const dailyByDate = new Map<string, any>();
            for (const row of rawDaily) {
                const d = String(row.date).split('T')[0];
                if (!dailyByDate.has(d)) {
                    dailyByDate.set(d, { sessions_planned: 0, sessions_completed: 0, sessions_cancelled: 0, enrolled: 0, attended: 0, coach_calls: 0, parent_calls: 0, at_risk_total: 0, events_planned: 0, events_executed: 0, exams_planned: 0, exams_completed: 0, instructors_on_leave: 0, univCount: 0 });
                }
                const agg = dailyByDate.get(d)!;
                agg.sessions_planned += n(row.sessions_planned);
                agg.sessions_completed += n(row.sessions_completed);
                agg.sessions_cancelled += n(row.sessions_cancelled);
                agg.enrolled += n(row.enrolled);
                agg.attended += n(row.attended);
                agg.coach_calls += n(row.coach_calls);
                agg.parent_calls += n(row.parent_calls);
                agg.at_risk_total += n(row.at_risk_total);
                agg.events_planned += n(row.events_planned);
                agg.events_executed += n(row.events_executed);
                agg.exams_planned += n(row.exams_planned);
                agg.exams_completed += n(row.exams_completed);
                agg.instructors_on_leave += n(row.instructors_on_leave);
                agg.univCount++;
            }

            // Generate ALL dates in range (even if no data — shows as "No Data / Holiday")
            const rangeStart = type === 'weekly' ? report.weekStart : report.startDate;
            const rangeEnd = type === 'weekly' ? report.weekEnd : report.endDate;
            const allDates: string[] = [];
            if (rangeStart && rangeEnd) {
                const cur = new Date(rangeStart + 'T00:00:00');
                const end = new Date(rangeEnd + 'T00:00:00');
                while (cur <= end) {
                    allDates.push(cur.toISOString().split('T')[0]);
                    cur.setDate(cur.getDate() + 1);
                }
            } else {
                allDates.push(...Array.from(dailyByDate.keys()).sort());
            }

            // Calculate leave totals for the period
            const totalLeaveInPeriod = Array.from(dailyByDate.values()).reduce((s, d) => s + d.instructors_on_leave, 0);

            dailySection = `<h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Day-by-Day Summary</h2>
            <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Aggregated totals across all universities for each day. Days with no data may indicate a holiday or weekend. Instructors on leave this ${type === 'weekly' ? 'week' : 'month'}: <strong>${totalLeaveInPeriod}</strong> (total leave-days across all universities).</p>
            <table>
            <thead><tr>
                <th style="text-align:left">Date</th>
                <th>Sessions Done/Planned</th><th>Sess %</th>
                <th>Attended/Enrolled</th><th>Att %</th>
                <th>Coach Calls</th><th>Parent Calls</th><th>At-Risk</th>
                <th>On Leave</th>
                <th>Events</th><th>Exams</th>
            </tr></thead><tbody>` +
            allDates.map((date) => {
                const d = dailyByDate.get(date);
                const dayOfWeek = new Date(date + 'T00:00:00').getDay();
                const isSunday = dayOfWeek === 0;
                if (!d) {
                    return `<tr style="background:${isSunday ? '#fef2f2' : '#fefce8'}">
                        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${formatShortDate(date)}</td>
                        <td colspan="10" style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:#94a3b8;font-style:italic">${isSunday ? 'Sunday — No Operations' : 'No Data Reported (Holiday / Off Day)'}</td>
                    </tr>`;
                }
                const dSess = d.sessions_planned > 0 ? Math.round((d.sessions_completed / d.sessions_planned) * 100) : 0;
                const dAtt = d.enrolled > 0 ? Math.round((d.attended / d.enrolled) * 100) : 0;
                return `<tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${formatShortDate(date)}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:500">${d.sessions_completed}/${d.sessions_planned}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:${rateColor(dSess)}">${dSess}%</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:500">${d.attended}/${d.enrolled}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;color:${rateColor(dAtt)}">${dAtt}%</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${d.coach_calls}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${d.parent_calls}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${d.at_risk_total > 0 ? '#dc2626' : '#16a34a'}">${d.at_risk_total}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;color:${d.instructors_on_leave > 0 ? '#ca8a04' : '#16a34a'}">${d.instructors_on_leave}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${d.events_executed}/${d.events_planned}</td>
                    <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center">${Math.min(d.exams_completed, d.exams_planned)}/${d.exams_planned}</td>
                </tr>`;
            }).join('') +
            `</tbody></table>`;
        }

        // ── Cancellation Reasons ──
        let cancellationSection = '';
        const cancellations = byUniv.filter((r: any) => r.cancellation_reason && n(r.sessions_cancelled) > 0);
        if (cancellations.length > 0) {
            cancellationSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Session Cancellation Reasons</h2>
            <p style="color:#64748b;font-size:12px;margin:8px 0 12px">Universities that cancelled sessions and the reasons provided.</p>
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
                <h2 style="color:#4338ca;font-size:18px;margin:0 0 16px 0;border:none;padding:0">AI Executive Summary</h2>
                <div style="color:#1e293b;font-size:13px;line-height:1.8">${formattedInsights}</div>
                <p style="color:#94a3b8;font-size:10px;margin-top:16px;font-style:italic">Generated by Gemini AI based on operational data</p>
            </div>`;
        }

        // ── Key Observations (auto-generated) ──
        const observations: string[] = [];
        if (sessRate < 80) observations.push(`Session completion is at ${sessRate}% (target: 80%). ${totalSessionsCancelled} sessions were cancelled across ${byUniv.length} universities.`);
        else if (sessRate >= 95) observations.push(`Excellent session completion rate of ${sessRate}% — ${totalSessionsCompleted} of ${totalSessionsPlanned} sessions delivered.`);
        if (attRate < 70) observations.push(`Attendance is critically low at ${attRate}%. ${totalAbsent} students were absent out of ${totalEnrolled} enrolled.`);
        else if (attRate >= 90) observations.push(`Strong attendance rate of ${attRate}% across all campuses.`);
        if (coachRate < 50 && totalAbsent > 0) observations.push(`Coach call coverage is ${coachRate}% — only ${totalCoachCalls} calls made for ${totalAbsent} absent students. Many students are not being followed up.`);
        if (totalAtRisk > 0 && atRiskInformedRate < 80) observations.push(`${totalAtRisk} at-risk students identified but only ${totalAtRiskInformed} (${atRiskInformedRate}%) have been informed. Immediate intervention needed.`);
        if (totalEventsCancelled > 0) observations.push(`${totalEventsCancelled} event(s) cancelled out of ${totalEventsPlanned} planned.`);
        if (byUniv.length > 1) {
            const univWithAtt = byUniv.filter((r: any) => n(r.enrolled) > 0).map((r: any) => ({ name: r.university_name, rate: Math.round((n(r.attended) / n(r.enrolled)) * 100) }));
            if (univWithAtt.length > 1) {
                const best = univWithAtt.reduce((a: any, b: any) => a.rate > b.rate ? a : b);
                const worst = univWithAtt.reduce((a: any, b: any) => a.rate < b.rate ? a : b);
                if (best.rate !== worst.rate) observations.push(`Highest attendance: ${best.name} (${best.rate}%). Needs attention: ${worst.name} (${worst.rate}%).`);
            }
        }

        let observationsSection = '';
        if (observations.length > 0) {
            observationsSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Key Observations</h2>
            <p style="color:#64748b;font-size:12px;margin:8px 0 12px">Auto-generated insights based on the data. Items in yellow/orange need attention.</p>
            <div style="margin-top:12px;display:grid;gap:8px">` +
            observations.map((obs, i) => `<div style="padding:12px 16px;background:${i % 2 === 0 ? '#fefce8' : '#fff7ed'};border-left:4px solid ${i % 2 === 0 ? '#ca8a04' : '#ea580c'};border-radius:0 8px 8px 0;font-size:13px;color:#1e293b">${obs}</div>`).join('') +
            `</div>`;
        }

        // ── Charts Section ──
        let chartsSection = '';
        if (type !== 'daily' && rawDaily.length > 0) {
            const dailyByDate = new Map<string, any>();
            for (const row of rawDaily) {
                const d = String(row.date).split('T')[0];
                if (!dailyByDate.has(d)) dailyByDate.set(d, { sessions_completed: 0, attended: 0, enrolled: 0 });
                const agg = dailyByDate.get(d)!;
                agg.sessions_completed += n(row.sessions_completed);
                agg.attended += n(row.attended);
                agg.enrolled += n(row.enrolled);
            }
            const sortedDays = Array.from(dailyByDate.entries()).sort(([a], [b]) => a.localeCompare(b));
            const sessionBars = sortedDays.map(([date, d]) => ({
                label: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
                value: d.sessions_completed, color: '#7c3aed'
            }));
            const attBars = sortedDays.map(([date, d]) => ({
                label: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
                value: d.attended, color: '#3b82f6'
            }));
            const univSessionBars = byUniv.filter((r: any) => n(r.sessions_planned) > 0).slice(0, 12).map((r: any) => ({
                label: (r.university_name || '').length > 16 ? r.university_name.substring(0, 16) + '..' : r.university_name,
                value: n(r.sessions_completed), max: n(r.sessions_planned), color: '#6366f1'
            }));

            chartsSection = `
            <h2 style="margin-top:32px;color:#1e293b;font-size:18px;border-bottom:2px solid #e2e8f0;padding-bottom:8px">Visual Summary</h2>
            <p style="color:#64748b;font-size:12px;margin:8px 0 16px">Charts showing key metrics at a glance.</p>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center;margin-bottom:24px">
                ${svgDonut(sessRate, 'Sessions', rateColor(sessRate), 100)}
                ${svgDonut(attRate, 'Attendance', rateColor(attRate), 100)}
                ${svgDonut(coachRate, 'Coach Calls', rateColor(coachRate), 100)}
                ${svgDonut(eventExecRate, 'Events', rateColor(eventExecRate), 100)}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px">
                <div>
                    <p style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px">Sessions Completed per Day</p>
                    ${svgBar(sessionBars, 130)}
                </div>
                <div>
                    <p style="font-size:12px;font-weight:700;color:#3b82f6;margin-bottom:8px">Students Attended per Day</p>
                    ${svgBar(attBars, 130)}
                </div>
            </div>
            ${univSessionBars.length > 0 ? `<div style="margin-top:24px">
                <p style="font-size:12px;font-weight:700;color:#6366f1;margin-bottom:8px">Sessions by University (Completed / Planned)</p>
                ${svgHBar(univSessionBars)}
            </div>` : ''}`;
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
        .section-desc { color: #64748b; font-size: 12px; margin: 8px 0 16px; line-height: 1.5; }
        .footer { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
        @media print { body { padding: 16px; } .kpi { break-inside: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
        </style></head><body>
        <h1>UniOps — ${title}</h1>
        <p class="subtitle">Generated on ${new Date().toLocaleString('en-IN')} | UniConnect Operations Dashboard${selectedUniversity ? ` | ${selectedUniversity}` : ''} | ${byUniv.length} universit${byUniv.length === 1 ? 'y' : 'ies'}</p>

        <h2 style="margin-top:24px">Performance Overview</h2>
        <p class="section-desc">Key performance indicators for the ${type === 'daily' ? 'day' : type === 'weekly' ? 'week' : 'month'}. Green = good (80%+), Yellow = needs improvement (50-79%), Red = critical (&lt;50%).</p>
        <div class="kpi-grid">
            <div class="kpi kpi-highlight">
                <div class="label">Session Completion</div>
                <div class="value" style="color:${rateColor(sessRate)}">${sessRate}%</div>
                <div class="sub">${totalSessionsCompleted} of ${totalSessionsPlanned} sessions · ${totalSessionsCancelled} cancelled</div>
            </div>
            <div class="kpi kpi-highlight">
                <div class="label">Attendance Rate</div>
                <div class="value" style="color:${rateColor(attRate)}">${attRate}%</div>
                <div class="sub">${totalAttended} of ${totalEnrolled} students</div>
            </div>
            <div class="kpi">
                <div class="label">Coach Call Coverage</div>
                <div class="value" style="color:${rateColor(coachRate)}">${coachRate}%</div>
                <div class="sub">${totalCoachCalls} calls for ${totalAbsent} absent</div>
            </div>
            <div class="kpi">
                <div class="label">Parent Call Coverage</div>
                <div class="value" style="color:${rateColor(parentRate)}">${parentRate}%</div>
                <div class="sub">${totalParentCalls} parent calls</div>
            </div>
            <div class="kpi">
                <div class="label">At-Risk Students</div>
                <div class="value ${totalAtRisk > 0 ? 'red' : 'green'}">${totalAtRisk}</div>
                <div class="sub">${totalAtRiskInformed} informed (${atRiskInformedRate}%)</div>
            </div>
        </div>

        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
            <div class="kpi">
                <div class="label">Event Execution</div>
                <div class="value" style="color:${rateColor(eventExecRate)}">${eventExecRate}%</div>
                <div class="sub">${totalEventsExecuted} of ${totalEventsPlanned}${totalEventsCancelled > 0 ? ` · ${totalEventsCancelled} cancelled` : ''}${(totalEventsPlanned - totalEventsExecuted - totalEventsCancelled) > 0 ? ` · ${totalEventsPlanned - totalEventsExecuted - totalEventsCancelled} pending` : ''}</div>
            </div>
            <div class="kpi">
                <div class="label">Exam Completion</div>
                <div class="value" style="color:${rateColor(examRate)}">${examRate}%</div>
                <div class="sub">${totalExamsCompleted} of ${totalExamsPlanned} exams</div>
            </div>
            <div class="kpi">
                <div class="label">Total Instructors</div>
                <div class="value blue">${n(s.instructors_total)}</div>
                <div class="sub">${n(s.instructors_on_leave)} on leave</div>
            </div>
            <div class="kpi">
                <div class="label">Universities</div>
                <div class="value">${byUniv.length}</div>
                <div class="sub">reporting ${type === 'daily' ? 'today' : 'this period'}</div>
            </div>
        </div>

        ${chartsSection}

        ${observationsSection}

        ${aiSection}

        <h2 style="margin-top:32px">University-wise Breakdown</h2>
        <p class="section-desc">Detailed numbers for each university. "Done" = sessions completed. "Coach Calls" = calls made to absent students (% of absent). "Events" and "Exams" show executed/planned.</p>
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
        ${dailySection}
        ${complianceSection}

        <div class="footer">Auto-generated by UniConnect Ops Dashboard | ${new Date().toLocaleString('en-IN')} | ${type.charAt(0).toUpperCase() + type.slice(1)} Operations Report</div>
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
                <div class="flex items-center gap-1 relative">
                    <button onclick={() => downloadReport('daily')} disabled={isDownloading} class="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded transition-colors" title="Download daily report">
                        Daily
                    </button>
                    <button onclick={() => { showReportPicker = showReportPicker === 'weekly' ? null : 'weekly'; }} disabled={isDownloading} class="px-2 py-1.5 {showReportPicker === 'weekly' ? 'bg-blue-800 ring-1 ring-blue-400' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 text-white text-xs rounded transition-colors" title="Pick week for report">
                        Weekly
                    </button>
                    <button onclick={() => { showReportPicker = showReportPicker === 'monthly' ? null : 'monthly'; }} disabled={isDownloading} class="px-2 py-1.5 {showReportPicker === 'monthly' ? 'bg-blue-800 ring-1 ring-blue-400' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 text-white text-xs rounded transition-colors" title="Pick month for report">
                        Monthly
                    </button>
                    <svg class="w-4 h-4 text-gray-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <!-- Week picker dropdown -->
                    {#if showReportPicker === 'weekly'}
                        <div class="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-64 max-h-72 overflow-y-auto">
                            <div class="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-semibold">Select Week</div>
                            {#each getWeekOptions() as w}
                                <button onclick={() => downloadReport('weekly', { weekStart: w.start, weekEnd: w.end })} class="w-full text-left px-3 py-2 text-sm text-white hover:bg-blue-600/30 transition-colors border-b border-gray-700/50">
                                    {w.label}
                                </button>
                            {/each}
                        </div>
                    {/if}
                    <!-- Month picker dropdown -->
                    {#if showReportPicker === 'monthly'}
                        <div class="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 w-56 max-h-72 overflow-y-auto">
                            <div class="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-semibold">Select Month</div>
                            {#each getMonthOptions() as m}
                                <button onclick={() => downloadReport('monthly', { year: m.year, month: m.month })} class="w-full text-left px-3 py-2 text-sm text-white hover:bg-blue-600/30 transition-colors border-b border-gray-700/50">
                                    {m.label}
                                </button>
                            {/each}
                        </div>
                    {/if}
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

        {#if isLoading && !['daily-form', 'form-compliance', 'sheet-setup'].includes(activeView)}
            <div class="flex items-center justify-center py-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span class="ml-3 text-gray-400">Loading data...</span>
            </div>
        {:else if !viewData && !['daily-form', 'form-compliance', 'sheet-setup'].includes(activeView)}
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
                                    {#if row.cancellation_reason && /holiday/i.test(row.cancellation_reason)}
                                        <span class="text-[10px] px-2 py-0.5 rounded bg-amber-600/20 text-amber-400 font-bold">HOLIDAY</span>
                                    {/if}
                                </td>
                                <td class="px-4 py-3 text-center text-gray-300">{row.sessions_planned}</td>
                                <td class="px-4 py-3 text-center text-green-400">{row.sessions_completed}</td>
                                <td class="px-4 py-3 text-center text-red-400">{row.sessions_cancelled}</td>
                                <td class="px-4 py-3 text-center text-gray-300">{devPct}%</td>
                                <td class="px-4 py-3 text-center">
                                    {#if row.cancellation_reason && /holiday/i.test(row.cancellation_reason)}
                                        <span class="text-xs px-2 py-0.5 rounded bg-amber-600/20 text-amber-400">Holiday</span>
                                    {:else}
                                        <span class="text-xs px-2 py-0.5 rounded {devPct > 10 ? 'bg-orange-600/20 text-orange-400' : 'bg-green-600/20 text-green-400'}">{statusBadge(devPct)}</span>
                                    {/if}
                                </td>
                            </tr>
                            {#if isExpanded}
                                <tr class="bg-gray-800/20">
                                    <td colspan="6" class="px-6 py-4">
                                        <div class="text-xs text-gray-500 font-semibold tracking-wider mb-1">{row.cancellation_reason && /holiday/i.test(row.cancellation_reason) ? 'STATUS' : 'REMARKS'}</div>
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
