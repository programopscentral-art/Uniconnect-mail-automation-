<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import {
        Wallet, Building2, TrendingUp, CheckCircle2, AlertCircle,
        Banknote, UserMinus, MessageSquare, Search, Filter,
        ChevronLeft, ChevronRight, Download, X, Loader2, Plus,
        Lock, ShieldCheck, FileText, Paperclip, Trash2, Upload, RefreshCw
    } from 'lucide-svelte';

    let { data } = $props();

    type Tab = 'collection' | 'students' | 'cases' | 'daily' | 'universities' | 'docs' | 'overview';
    let activeTab = $state<Tab>('collection');
    let activePeriodId = $state<string>(data.activePeriod?.id || data.periods[0]?.id || '');

    // Local reactive copy of periods so Sync Now can refresh sync metadata
    // (last_synced_at, last_sync_error, last_sync_summary) without a page reload.
    // Mutating data.periods directly doesn't trigger reactivity because data comes
    // from $props().
    let periods = $state<any[]>([...data.periods]);

    // ─── Data state ───────────────────────────────────────────────────
    let summary = $state<any>(null);
    let uniRollup = $state<any[]>([]);
    let students = $state<any[]>([]);
    let studentsTotal = $state(0);
    let stuPage = $state(1);
    const STU_PER_PAGE = 50;
    let casesList = $state<any[]>([]);
    let dailyLog = $state<any[]>([]);
    let allRemarks = $state<any[]>([]);
    let loading = $state(false);
    let successMsg = $state('');
    let errorMsg = $state('');

    // ─── Filters ──────────────────────────────────────────────────────
    let collSearch = $state('');
    let collSort = $state('');
    let stuSearch = $state('');
    let stuFilterUni = $state('');
    let stuFilterStatus = $state('');
    let stuFilterTag = $state('');
    let caseFilterTag = $state('');
    let caseSearch = $state('');
    let dailyFilterUni = $state('');
    let dailyFilterMonth = $state<number | ''>('');

    // ─── Drawer state ─────────────────────────────────────────────────
    let drawerOpen = $state(false);
    let drawerStudent = $state<any>(null);
    let drawerRemarks = $state<any[]>([]);
    let drawerLoading = $state(false);
    let remarkAuthor = $state(data.userName || '');
    let remarkRole = $state(data.userRole === 'COS' ? 'COS' : data.userRole === 'PM' ? 'PM' : data.userRole === 'PMA' ? 'PMA' : 'PM');
    let remarkCaseType = $state('');
    let remarkText = $state('');
    let savingRemark = $state(false);
    let stagedFiles = $state<File[]>([]);

    // ─── Daily entry form ─────────────────────────────────────────────
    let showDailyForm = $state(false);
    let dailyForm = $state({ university_id: '', date: new Date().toISOString().split('T')[0], amount: 0, students_count: 0, notes: '' });
    let savingDaily = $state(false);

    // ─── Daily Report filter state ───────────────────────────────────
    let dailyRange = $state<'today' | 'week' | 'month' | 'all'>('all');
    let dailyHideFuture = $state(false);

    const todayStr = () => new Date().toISOString().split('T')[0];
    function daysAgoStr(n: number) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.toISOString().split('T')[0];
    }
    function startOfMonthStr() {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    }
    function isFutureDate(iso: string): boolean { return iso > todayStr(); }
    function isToday(iso: string): boolean { return iso === todayStr(); }

    let filteredDaily = $derived.by(() => {
        const today = todayStr();
        const monthStart = startOfMonthStr();
        const weekStart = daysAgoStr(6);
        return dailyLog.filter((e: any) => {
            const d = (e.date || '').split('T')[0];
            if (!d) return false;
            if (dailyHideFuture && d > today) return false;
            if (dailyRange === 'today' && d !== today) return false;
            if (dailyRange === 'week' && (d < weekStart || d > today)) return false;
            if (dailyRange === 'month' && (d < monthStart || d > today)) return false;
            return true;
        });
    });

    let dailyKpis = $derived.by(() => {
        const today = todayStr();
        const monthStart = startOfMonthStr();
        const weekStart = daysAgoStr(6);
        let todaySum = 0, weekSum = 0, monthSum = 0, allSum = 0, futureSum = 0;
        for (const e of dailyLog) {
            const d = (e.date || '').split('T')[0];
            const amt = Number(e.amount) || 0;
            allSum += amt;
            if (d > today) { futureSum += amt; continue; }
            if (d === today) todaySum += amt;
            if (d >= weekStart && d <= today) weekSum += amt;
            if (d >= monthStart && d <= today) monthSum += amt;
        }
        return { today: todaySum, week: weekSum, month: monthSum, all: allSum, future: futureSum };
    });

    // Group filtered entries by YYYY-MM, sorted descending
    let dailyByMonth = $derived.by(() => {
        const map = new Map<string, any[]>();
        for (const e of filteredDaily) {
            const d = (e.date || '').split('T')[0];
            const key = d.slice(0, 7); // YYYY-MM
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(e);
        }
        const groups = Array.from(map.entries())
            .map(([month, entries]) => ({
                month,
                entries: entries.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
                total: entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
                students: entries.reduce((s, e) => s + (Number(e.students_count) || 0), 0),
            }))
            .sort((a, b) => b.month.localeCompare(a.month));
        return groups;
    });
    function fmtMonth(yyyymm: string): string {
        try {
            const [y, m] = yyyymm.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        } catch { return yyyymm; }
    }
    function fmtDow(iso: string): string {
        try { return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short' }); }
        catch { return ''; }
    }

    // ─── Doc Request state ────────────────────────────────────────────
    let docMissingStudents = $state<any[]>([]);
    let docRequests = $state<any[]>([]);
    let docStats = $state<any>({ total_sent: 0, opened: 0, acknowledged: 0, uploaded: 0 });
    let docFilterUni = $state('');
    let docOnlyUnpaid = $state(true);
    let selectedForDocRequest = $state<Set<string>>(new Set());
    let showSendDocModal = $state(false);
    let docMessage = $state('Dear Student,\n\nWe noticed your billing receipts or fee proofs have not been uploaded yet. Please upload the required documents using the form linked below and acknowledge this notice.\n\nThank you,\nNxtWave Operations');
    let docEmailSubject = $state('Action Required: Submit Your Fee Receipts');
    let docFormUrl = $state('');
    let docSending = $state(false);

    async function loadDocMissing() {
        if (!activePeriodId) return;
        try {
            const q = new URLSearchParams({ period_id: activePeriodId, view: 'missing' });
            if (docFilterUni) q.set('university_id', docFilterUni);
            if (docOnlyUnpaid) q.set('only_unpaid', 'true');
            const res = await fetch(`/api/fees/doc-requests?${q}`);
            if (res.ok) docMissingStudents = await res.json();
        } catch {}
    }
    async function loadDocRequests() {
        if (!activePeriodId) return;
        try {
            const [r1, r2] = await Promise.all([
                fetch(`/api/fees/doc-requests?period_id=${activePeriodId}`),
                fetch(`/api/fees/doc-requests?period_id=${activePeriodId}&view=stats`),
            ]);
            if (r1.ok) docRequests = await r1.json();
            if (r2.ok) docStats = await r2.json();
        } catch {}
    }
    async function sendDocRequests() {
        if (!selectedForDocRequest.size) { flash('Select at least one student', true); return; }
        if (!docMessage.trim() || !docEmailSubject.trim()) { flash('Subject and message required', true); return; }
        docSending = true;
        try {
            const res = await fetch('/api/fees/doc-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    period_id: activePeriodId,
                    student_payment_ids: Array.from(selectedForDocRequest),
                    doc_type: 'billing_receipt',
                    message: docMessage,
                    upload_form_url: docFormUrl || undefined,
                    email_subject: docEmailSubject,
                })
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.message || `Send failed (${res.status})`);
            }
            const j = await res.json();
            flash(`Sent ${j.requests.length} email(s). Batch ID: ${j.batch_id.slice(0, 8)}`);
            showSendDocModal = false;
            selectedForDocRequest = new Set();
            await Promise.all([loadDocMissing(), loadDocRequests()]);
        } catch (e: any) {
            flash(e?.message || 'Send failed', true);
        } finally {
            docSending = false;
        }
    }
    function toggleDocSelection(id: string) {
        if (selectedForDocRequest.has(id)) selectedForDocRequest.delete(id);
        else selectedForDocRequest.add(id);
        selectedForDocRequest = new Set(selectedForDocRequest);
    }
    function selectAllMissing() {
        selectedForDocRequest = new Set(docMissingStudents.map(s => s.id));
    }
    function clearDocSelection() {
        selectedForDocRequest = new Set();
    }

    // ─── Batch / Period management ───────────────────────────────────
    let showBatchModal = $state(false);
    let batchForm = $state({
        id: '' as string,
        name: '',
        program: 'NIAT',
        term: 2,
        batch_start_year: 2022,
        batch_end_year: 2026,
        sheet_id: '',
        userwise_tab: 'Userwise Data',
        daywise_tab: 'Day_Wise_Payments',
        summary_tab: 'Sheet1',
        multi_tabs: '',
        auto_sync_enabled: false,
        auto_sync_interval_minutes: 30,
    });
    let savingBatch = $state(false);
    let syncingPeriodId = $state<string | null>(null);
    let syncResult = $state<any>(null);

    let activePeriod = $derived(periods.find((p: any) => p.id === activePeriodId) || periods[0]);

    function openNewBatch() {
        batchForm = {
            id: '',
            name: 'NIAT · Batch 2023-27 · Term 1',
            program: 'NIAT',
            term: 1,
            batch_start_year: 2023,
            batch_end_year: 2027,
            sheet_id: '',
            userwise_tab: 'Userwise Data',
            daywise_tab: 'Day_Wise_Payments',
            summary_tab: 'Sheet1',
            multi_tabs: '',
            auto_sync_enabled: false,
            auto_sync_interval_minutes: 30,
        };
        showBatchModal = true;
    }

    function openEditBatch(p: any) {
        const cfg = p.sheet_tabs_config || {};
        batchForm = {
            id: p.id,
            name: p.name,
            program: p.program || 'NIAT',
            term: p.term || 1,
            batch_start_year: p.batch_start_year || new Date().getFullYear(),
            batch_end_year: p.batch_end_year || new Date().getFullYear() + 4,
            sheet_id: p.sheet_id || '',
            userwise_tab: cfg.userwise_tab || 'Userwise Data',
            daywise_tab: cfg.daywise_tab || 'Day_Wise_Payments',
            summary_tab: cfg.summary_tab || 'Sheet1',
            multi_tabs: (cfg.multi_tabs || []).join('\n'),
            auto_sync_enabled: !!p.auto_sync_enabled,
            auto_sync_interval_minutes: p.auto_sync_interval_minutes || 30,
        };
        showBatchModal = true;
    }

    async function saveBatch() {
        if (!batchForm.name || !batchForm.term) { flash('Name and term required', true); return; }
        savingBatch = true;
        try {
            const sheet_tabs_config = {
                userwise_tab: batchForm.userwise_tab || undefined,
                daywise_tab: batchForm.daywise_tab || undefined,
                summary_tab: batchForm.summary_tab || undefined,
                multi_tabs: batchForm.multi_tabs.split('\n').map(t => t.trim()).filter(Boolean),
            };
            const payload = {
                ...(batchForm.id ? { id: batchForm.id } : {}),
                name: batchForm.name,
                program: batchForm.program,
                term: Number(batchForm.term),
                batch_start_year: Number(batchForm.batch_start_year),
                batch_end_year: Number(batchForm.batch_end_year),
                academic_year: `${batchForm.batch_start_year}-${String(batchForm.batch_end_year).slice(-2)}`,
                sheet_id: batchForm.sheet_id || null,
                sheet_tabs_config,
                auto_sync_enabled: batchForm.auto_sync_enabled,
                auto_sync_interval_minutes: Number(batchForm.auto_sync_interval_minutes),
            };
            const method = batchForm.id ? 'PATCH' : 'POST';
            const res = await fetch('/api/fees/periods', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `Failed (${res.status})`); }
            flash(batchForm.id ? 'Batch updated' : 'Batch created');
            showBatchModal = false;
            await refreshActivePeriod();
            // If we just created a new batch, switch to it
            if (!batchForm.id) {
                const fresh = await fetch('/api/fees/periods').then(r => r.json()).catch(() => []);
                const newOne = fresh[0];
                if (newOne) activePeriodId = newOne.id;
            }
        } catch (e: any) {
            flash(e?.message || 'Save failed', true);
        } finally {
            savingBatch = false;
        }
    }

    async function syncNow(periodId: string) {
        syncingPeriodId = periodId;
        syncResult = null;
        try {
            const res = await fetch(`/api/fees/periods/${periodId}/sync`, { method: 'POST' });
            const j = await res.json();
            if (!res.ok) throw new Error(j.message || 'Sync failed');
            syncResult = j;
            flash(`Synced ${j.totalImported} rows in ${(j.elapsed_ms / 1000).toFixed(1)}s`);
            await Promise.all([loadRollup(), refreshActivePeriod()]);
        } catch (e: any) {
            flash(e?.message || 'Sync failed', true);
        } finally {
            syncingPeriodId = null;
        }
    }

    // Refresh the active period's sync metadata (last_synced_at, last_sync_error, last_sync_summary)
    // so the status strip + error banner reflect the latest state without a page reload.
    async function refreshActivePeriod() {
        try {
            const res = await fetch('/api/fees/periods');
            if (!res.ok) return;
            const fresh = await res.json();
            periods = fresh;
        } catch {}
    }

    function fmtTimeAgo(iso: string | null): string {
        if (!iso) return 'never';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    // ─── Import modal ─────────────────────────────────────────────────
    let showImportModal = $state(false);
    let importMode = $state<'sheet' | 'csv'>('sheet');
    let importSheetId = $state('1TAhrH4303o81dqps1j-ZNYt1QjWHhfmY5gjwnz_2GBM');
    let importTabName = $state('Userwise Data');
    let importDataset = $state<'userwise' | 'daywise' | 'summary' | 'multi-tab'>('userwise');
    let importFile = $state<File | null>(null);
    let importRemarks = $state(false);
    let importing = $state(false);
    let importResult = $state<any>(null);

    // Multi-tab state
    let multiTabList = $state('Aurora University\nCrescent University\nMalla Reddy\nTakshasila University\nSGU_Import\nMRV\namet term 2 & 3 userwise data');

    // Default tab names per dataset — auto-fills when user picks a radio
    const DATASET_DEFAULT_TAB: Record<string, string> = {
        userwise: 'Userwise Data',
        daywise: 'Day_Wise_Payments',
        summary: 'Sheet1',
        'multi-tab': '',
    };
    // When dataset changes, override the tab name to match (unless user has typed a custom one)
    let lastDatasetForTab = $state<string>('userwise');
    $effect(() => {
        // Track changes to importDataset
        const ds = importDataset;
        if (ds !== lastDatasetForTab) {
            importTabName = DATASET_DEFAULT_TAB[ds] || importTabName;
            lastDatasetForTab = ds;
            importResult = null; // clear stale result
        }
    });

    // ─── Helpers ──────────────────────────────────────────────────────
    const TAG_META: Record<string, { label: string; cls: string }> = {
        loan:             { label: 'Loan Case',         cls: 'tag-loan' },
        dropout:          { label: 'Dropout',           cls: 'tag-dropout' },
        waiver:           { label: 'Fee Waiver',        cls: 'tag-waiver' },
        scholar:          { label: 'Scholarship',       cls: 'tag-scholar' },
        defer:            { label: 'Deferral',          cls: 'tag-defer' },
        will_pay:         { label: 'Will Pay',          cls: 'tag-other' },
        want_to_drop:     { label: 'Want to Drop',      cls: 'tag-dropout' },
        pending_payment:  { label: 'Pending Payment',   cls: 'tag-waiver' },
        day_wise_followup:{ label: 'Day-wise Follow-up',cls: 'tag-other' },
        applied_for_loan: { label: 'Applied for Loan',  cls: 'tag-loan' },
        other:            { label: 'Other',             cls: 'tag-other' },
    };

    function weeklyStart(): string {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
        d.setDate(diff);
        return d.toISOString().split('T')[0];
    }
    function weeklyEnd(): string {
        const d = new Date(weeklyStart());
        d.setDate(d.getDate() + 6);
        return d.toISOString().split('T')[0];
    }

    function fmtInr(n: any): string {
        const num = Number(n) || 0;
        if (num >= 1e7) return '₹' + (num / 1e7).toFixed(2) + ' Cr';
        if (num >= 1e5) return '₹' + (num / 1e5).toFixed(2) + ' L';
        if (num >= 1e3) return '₹' + (num / 1e3).toFixed(1) + 'K';
        return '₹' + Math.round(num).toLocaleString('en-IN');
    }
    function fmtFull(n: any): string { return '₹' + (Number(n) || 0).toLocaleString('en-IN'); }
    function fmtDate(d: any): string {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
        catch { return String(d); }
    }
    function fmtDateTime(d: any): string {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
        catch { return String(d); }
    }
    function pct(a: number, b: number): number { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; }
    function pctColor(v: number): string { return v >= 85 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444'; }
    function statusColor(s: string): string {
        return s === 'Fully Paid' ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
             : s === 'Partially Paid' ? 'text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
             : 'text-rose-700 bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300';
    }
    function flash(msg: string, isErr = false) {
        if (isErr) { errorMsg = msg; setTimeout(() => errorMsg = '', 4000); }
        else { successMsg = msg; setTimeout(() => successMsg = '', 3000); }
    }

    // ─── Loaders ──────────────────────────────────────────────────────
    async function loadRollup() {
        if (!activePeriodId) return;
        try {
            const res = await fetch(`/api/fees/universities?period_id=${activePeriodId}`);
            if (res.ok) {
                const j = await res.json();
                uniRollup = j.universities || [];
                summary = j.summary || {};
            }
        } catch (e: any) { flash(e?.message || 'Failed to load rollup', true); }
    }
    async function loadStudents(page = 1) {
        if (!activePeriodId) return;
        stuPage = page;
        loading = true;
        try {
            const q = new URLSearchParams({ period_id: activePeriodId });
            if (stuSearch) q.set('search', stuSearch);
            if (stuFilterUni) q.set('university_id', stuFilterUni);
            if (stuFilterStatus) q.set('status', stuFilterStatus);
            if (stuFilterTag) q.set('tag', stuFilterTag);
            q.set('limit', String(STU_PER_PAGE));
            q.set('offset', String((page - 1) * STU_PER_PAGE));
            const res = await fetch(`/api/fees/students?${q}`);
            if (res.ok) {
                const j = await res.json();
                students = j.rows || [];
                studentsTotal = j.total || 0;
            }
        } catch (e: any) { flash(e?.message || 'Failed to load students', true); }
        finally { loading = false; }
    }
    async function loadCases() {
        if (!activePeriodId) return;
        try {
            const q = new URLSearchParams({ period_id: activePeriodId });
            if (caseFilterTag) q.set('tag', caseFilterTag);
            if (caseSearch) q.set('search', caseSearch);
            const res = await fetch(`/api/fees/cases?${q}`);
            if (res.ok) casesList = await res.json();
        } catch {}
    }
    async function loadDaily() {
        if (!activePeriodId) return;
        try {
            const q = new URLSearchParams({ period_id: activePeriodId });
            if (dailyFilterUni) q.set('university_id', dailyFilterUni);
            if (dailyFilterMonth) {
                q.set('month', String(dailyFilterMonth));
                q.set('year', String(new Date().getFullYear()));
            }
            const res = await fetch(`/api/fees/daily-log?${q}`);
            if (res.ok) dailyLog = await res.json();
        } catch {}
    }
    async function loadAllRemarks() {
        if (!activePeriodId) return;
        try {
            const res = await fetch(`/api/fees/remarks?period_id=${activePeriodId}`);
            if (res.ok) allRemarks = await res.json();
        } catch {}
    }

    $effect(() => {
        if (activePeriodId) {
            loadRollup();
            if (activeTab === 'students') loadStudents(1);
            else if (activeTab === 'cases') loadCases();
            else if (activeTab === 'daily') loadDaily();
        }
    });

    function switchTab(t: Tab) {
        activeTab = t;
        if (t === 'students') loadStudents(1);
        else if (t === 'cases') loadCases();
        else if (t === 'daily') loadDaily();
        else if (t === 'docs') { loadDocMissing(); loadDocRequests(); }
        else if (t === 'overview') loadOverview();
    }

    // ─── Overview tab data ──────────────────────────────────────────
    let overviewDaily = $state<any[]>([]);
    let overviewLoading = $state(false);
    async function loadOverview() {
        if (!activePeriodId) return;
        overviewLoading = true;
        try {
            const res = await fetch(`/api/fees/daily-log?period_id=${activePeriodId}`);
            if (res.ok) overviewDaily = await res.json();
            // Doc requests for "recent activity"
            if (!docRequests.length) await loadDocRequests();
        } catch {} finally { overviewLoading = false; }
    }

    // Aggregate daily-log by date for the trend chart (last 30 days)
    let trendData = $derived.by(() => {
        const byDate = new Map<string, { date: string; amount: number; count: number }>();
        for (const r of overviewDaily) {
            const d = r.date?.split('T')[0] || r.date;
            if (!d) continue;
            const cur = byDate.get(d) || { date: d, amount: 0, count: 0 };
            cur.amount += Number(r.amount) || 0;
            cur.count += Number(r.students_count) || 0;
            byDate.set(d, cur);
        }
        return Array.from(byDate.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-30);
    });

    let topEfficient = $derived(
        [...uniRollup].sort((a, b) => +b.collection_efficiency - +a.collection_efficiency).slice(0, 5)
    );
    let topPending = $derived(
        [...uniRollup].sort((a, b) => +b.pending - +a.pending).slice(0, 5)
    );
    let recentDocs = $derived([...docRequests].slice(0, 8));

    // KPI summary derived values
    let s = $derived(summary || {});
    let totalStr = $derived((s.fully_paid || 0) + (s.partial_paid || 0) + (s.not_paid || 0));

    // ─── Sorted/filtered collection ──────────────────────────────────
    let sortedRollup = $derived.by(() => {
        let arr = [...uniRollup];
        if (collSearch) {
            const q = collSearch.toLowerCase();
            arr = arr.filter(u => u.university_name.toLowerCase().includes(q));
        }
        if (collSort === 'eff-desc') arr.sort((a, b) => +b.collection_efficiency - +a.collection_efficiency);
        else if (collSort === 'eff-asc') arr.sort((a, b) => +a.collection_efficiency - +b.collection_efficiency);
        else if (collSort === 'paid-desc') arr.sort((a, b) => +b.paid - +a.paid);
        else if (collSort === 'pending-desc') arr.sort((a, b) => +b.pending - +a.pending);
        return arr;
    });

    // ─── Drawer actions ───────────────────────────────────────────────
    async function openDrawer(stu: any) {
        drawerStudent = stu;
        drawerOpen = true;
        drawerLoading = true;
        try {
            const res = await fetch(`/api/fees/students/${stu.id}/remarks`);
            if (res.ok) drawerRemarks = await res.json();
        } catch {}
        finally { drawerLoading = false; }
        document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
        drawerOpen = false;
        drawerStudent = null;
        drawerRemarks = [];
        stagedFiles = [];
        remarkText = '';
        remarkCaseType = '';
        document.body.style.overflow = '';
    }

    async function toggleTag(tag: string) {
        if (!drawerStudent || !data.access.canEditRemarks) return;
        try {
            const res = await fetch(`/api/fees/students/${drawerStudent.id}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag })
            });
            if (res.ok) {
                const j = await res.json();
                const tags: string[] = Array.isArray(drawerStudent.tags) ? [...drawerStudent.tags] : [];
                if (j.added) tags.push(tag); else tags.splice(tags.indexOf(tag), 1);
                drawerStudent.tags = tags;
                drawerStudent = { ...drawerStudent };
                // refresh students list to reflect tag changes
                if (activeTab === 'students') loadStudents(stuPage);
                else if (activeTab === 'cases') loadCases();
            }
        } catch (e: any) { flash(e?.message || 'Failed to toggle tag', true); }
    }

    function stageFiles(evt: Event) {
        const files = (evt.target as HTMLInputElement).files;
        if (!files) return;
        const arr: File[] = [];
        const MAX = 5 * 1024 * 1024;
        for (let i = 0; i < files.length && stagedFiles.length + arr.length < 5; i++) {
            const f = files[i];
            if (f.size > MAX) { flash(`${f.name} exceeds 5 MB`, true); continue; }
            arr.push(f);
        }
        stagedFiles = [...stagedFiles, ...arr];
        (evt.target as HTMLInputElement).value = '';
    }

    async function saveRemark() {
        if (!drawerStudent || !remarkAuthor || !remarkText) {
            flash('Enter your name and remark', true);
            return;
        }
        savingRemark = true;
        try {
            const res = await fetch(`/api/fees/students/${drawerStudent.id}/remarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    author_name: remarkAuthor,
                    role: remarkRole,
                    case_type: remarkCaseType || undefined,
                    text: remarkText
                })
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.message || `Save failed (${res.status})`);
            }
            const newRemark = await res.json();

            // Upload staged proof files
            for (const f of stagedFiles) {
                const fd = new FormData();
                fd.append('file', f);
                await fetch(`/api/fees/remarks/${newRemark.id}/attachments`, { method: 'POST', body: fd });
            }

            // Refresh
            const r2 = await fetch(`/api/fees/students/${drawerStudent.id}/remarks`);
            if (r2.ok) drawerRemarks = await r2.json();
            // Auto-tag was set on server if case_type selected — reflect in UI
            if (remarkCaseType && !(drawerStudent.tags || []).includes(remarkCaseType)) {
                drawerStudent.tags = [...(drawerStudent.tags || []), remarkCaseType];
            }
            remarkText = ''; remarkCaseType = ''; stagedFiles = [];
            if (activeTab === 'students') loadStudents(stuPage);
            flash('Remark saved');
        } catch (e: any) { flash(e?.message || 'Save failed', true); }
        finally { savingRemark = false; }
    }

    async function deleteRemark(rmkId: string) {
        if (!confirm('Delete this remark?')) return;
        try {
            const res = await fetch(`/api/fees/students/${drawerStudent.id}/remarks?remark_id=${rmkId}`, { method: 'DELETE' });
            if (res.ok) {
                drawerRemarks = drawerRemarks.filter(r => r.id !== rmkId);
                if (activeTab === 'students') loadStudents(stuPage);
                flash('Remark deleted');
            }
        } catch (e: any) { flash(e?.message || 'Delete failed', true); }
    }

    // ─── Daily entry ──────────────────────────────────────────────────
    async function saveDailyEntry() {
        if (!dailyForm.university_id || !dailyForm.date || !dailyForm.amount) {
            flash('Fill university, date and amount', true);
            return;
        }
        savingDaily = true;
        try {
            const res = await fetch('/api/fees/daily-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    period_id: activePeriodId,
                    university_id: dailyForm.university_id,
                    date: dailyForm.date,
                    amount: dailyForm.amount,
                    students_count: dailyForm.students_count,
                    notes: dailyForm.notes,
                })
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.message || `Save failed (${res.status})`);
            }
            await loadDaily();
            showDailyForm = false;
            dailyForm = { university_id: '', date: new Date().toISOString().split('T')[0], amount: 0, students_count: 0, notes: '' };
            flash('Daily entry saved');
        } catch (e: any) { flash(e?.message || 'Save failed', true); }
        finally { savingDaily = false; }
    }

    async function deleteDailyEntry(id: string) {
        if (!confirm('Delete this entry?')) return;
        try {
            const res = await fetch(`/api/fees/daily-log?id=${id}`, { method: 'DELETE' });
            if (res.ok) { await loadDaily(); flash('Entry deleted'); }
            else { const j = await res.json().catch(() => ({})); flash(j.message || 'Delete failed', true); }
        } catch (e: any) { flash(e?.message || 'Delete failed', true); }
    }

    // ─── Import ───────────────────────────────────────────────────────
    async function runImport() {
        if (!activePeriodId) { flash('No active period', true); return; }
        importing = true;
        importResult = null;
        try {
            let res: Response;
            if (importMode === 'sheet' && importDataset === 'multi-tab') {
                const tabs = multiTabList.split('\n').map(t => t.trim()).filter(Boolean);
                if (!tabs.length) { flash('Add at least one tab name', true); importing = false; return; }
                res = await fetch('/api/fees/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        period_id: activePeriodId,
                        mode: 'multi-tab',
                        sheet_id: importSheetId,
                        tabs: tabs.map(t => ({ name: t, university_name: t.replace(/\s*University\s*$/i, '').replace(/_Import$/i, '').replace(/\s+userwise data$/i, '').trim() })),
                        import_remarks: importRemarks,
                    })
                });
            } else if (importMode === 'sheet') {
                if (!importSheetId || !importTabName) { flash('Sheet ID and tab name required', true); importing = false; return; }
                res = await fetch('/api/fees/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        period_id: activePeriodId,
                        mode: 'sheet',
                        sheet_id: importSheetId,
                        tab_name: importTabName,
                        dataset: importDataset,
                        import_remarks: importRemarks,
                    })
                });
            } else {
                if (!importFile) { flash('Choose a CSV file', true); importing = false; return; }
                const fd = new FormData();
                fd.append('file', importFile);
                fd.append('period_id', activePeriodId);
                fd.append('dataset', importDataset);
                fd.append('import_remarks', String(importRemarks));
                res = await fetch('/api/fees/import', { method: 'POST', body: fd });
            }
            const j = await res.json();
            if (!res.ok) throw new Error(j.message || 'Import failed');
            importResult = j;
            flash(`Imported ${j.ok || 0} rows · ${j.skipped || 0} skipped · ${j.remarksImported || 0} remarks · ${j.tagged || 0} auto-tagged`);
            // Refresh data after import
            await loadRollup();
            if (activeTab === 'students') await loadStudents(1);
        } catch (e: any) {
            flash(e?.message || 'Import failed', true);
        } finally {
            importing = false;
        }
    }

    // ─── Export CSV ───────────────────────────────────────────────────
    function exportCollectionCSV() {
        const head = 'University,Strength,Fully Paid,Partial,Not Paid,Payable,Paid,Pending,Eff %,Fully %,Not Paid %\n';
        const rows = sortedRollup.map(u => `"${u.university_name}",${u.strength},${u.fully_paid},${u.partial_paid},${u.not_paid},${u.payable},${u.paid},${u.pending},${u.collection_efficiency},${u.fully_paid_pct},${u.not_paid_pct}`).join('\n');
        const blob = new Blob(['﻿' + head + rows], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `fee_collection_${data.activePeriod?.name?.replace(/\s+/g, '_') || 'period'}.csv`;
        a.click();
    }

    onMount(() => {
        loadRollup();
        // Honor ?tag= and ?university_id= deep-links (e.g. from analytics Cases tab)
        try {
            const qs = new URLSearchParams(window.location.search);
            const tag = qs.get('tag');
            const uni = qs.get('university_id');
            if (tag || uni) {
                if (tag) stuFilterTag = tag;
                if (uni) stuFilterUni = uni;
                activeTab = 'students';
                loadStudents(1);
            }
        } catch {}
    });
</script>

<svelte:head><title>Fee Collection · UniConnect</title></svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">

        <!-- Header -->
        <div class="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <Wallet size={20} class="text-white" />
                    </div>
                    <div>
                        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Fee Collection</h1>
                        <p class="text-xs text-slate-500 dark:text-slate-400">Track student payments, manage remarks, monitor cases</p>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <select bind:value={activePeriodId} class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium">
                    {#each periods as p}
                        <option value={p.id}>{p.name}</option>
                    {/each}
                </select>
                {#if data.access.canAdmin}
                    <button onclick={openNewBatch} class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800" title="Create a new batch with Google Sheet auto-sync">
                        <Plus size={14} /> New Batch
                    </button>
                    {#if activePeriod}
                        <button onclick={() => openEditBatch(activePeriod)} class="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800" title="Edit batch settings (sheet ID, auto-sync)">
                            ⚙ Settings
                        </button>
                    {/if}
                    {#if activePeriod?.sheet_id}
                        <button onclick={() => syncNow(activePeriod.id)} disabled={!!syncingPeriodId} class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold flex items-center gap-2 shadow-md shadow-emerald-500/30" title="Sync now from Google Sheet">
                            {#if syncingPeriodId === activePeriod.id}
                                <Loader2 size={14} class="animate-spin" /> Syncing…
                            {:else}
                                <RefreshCw size={14} /> Sync Now
                            {/if}
                        </button>
                    {/if}
                    <button onclick={() => { showImportModal = true; importResult = null; }} class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-2 shadow-md shadow-indigo-500/30">
                        <Upload size={14} /> Import Data
                    </button>
                {/if}
                <a href="/fee-collection/analytics" class="px-3 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-500/30 hover:shadow-rose-500/50 transition-shadow" title="Full fee analytics page with charts">
                    📊 Fee Analytics
                </a>
                <a href="/api/fees/preview-email" target="_blank" class="px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center gap-1.5 border border-purple-200 dark:border-purple-800" title="Preview the doc-request email">
                    👁 Email Preview
                </a>
                <div class="relative group">
                    <button class="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center gap-1.5 border border-blue-200 dark:border-blue-800">
                        👁 Report Preview ▾
                    </button>
                    <div class="hidden group-hover:block absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-1 z-30 min-w-[200px]">
                        <a href="/api/ops/view-report?type=daily" target="_blank" class="block px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">📅 Daily Report</a>
                        <a href={`/api/ops/view-report?type=weekly&weekStart=${weeklyStart()}&weekEnd=${weeklyEnd()}`} target="_blank" class="block px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">📊 Weekly Report</a>
                        <a href={`/api/ops/view-report?type=monthly&year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`} target="_blank" class="block px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">📈 Monthly Report</a>
                    </div>
                </div>
                {#if data.access.canEditRemarks}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                        <ShieldCheck size={12} /> {data.access.canAdmin ? 'Admin' : 'Editor'}
                    </span>
                {:else}
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">
                        <FileText size={12} /> View only
                    </span>
                {/if}
            </div>
        </div>

        <!-- Sync status strip (active period only) -->
        {#if activePeriod?.sheet_id}
            <div class="mb-4 flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <div class="flex items-center gap-3 text-xs">
                    <span class="inline-flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                        <RefreshCw size={12} class="text-emerald-500" />
                        Last synced <span class="text-slate-900 dark:text-white">{fmtTimeAgo(activePeriod.last_synced_at)}</span>
                    </span>
                    {#if activePeriod.auto_sync_enabled}
                        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                            ● Auto-sync every {activePeriod.auto_sync_interval_minutes || 30} min
                        </span>
                    {:else}
                        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                            ○ Auto-sync off
                        </span>
                    {/if}
                    {#if activePeriod.last_sync_summary}
                        <span class="text-slate-400">
                            · Last run: {activePeriod.last_sync_summary.totalImported || 0} imported
                        </span>
                    {/if}
                </div>
                <a href={`https://docs.google.com/spreadsheets/d/${activePeriod.sheet_id}/edit`} target="_blank" rel="noopener" class="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Open Sheet →
                </a>
            </div>
            {#if activePeriod.last_sync_error}
                <div class="mb-4 px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-start gap-3">
                    <AlertCircle size={16} class="text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <div class="flex-1 text-xs">
                        <div class="font-bold text-rose-700 dark:text-rose-300">Last auto-sync failed</div>
                        <div class="text-rose-600 dark:text-rose-400 mt-1 break-words">{activePeriod.last_sync_error}</div>
                    </div>
                    {#if data.access.canAdmin}
                        <button onclick={() => syncNow(activePeriod.id)} class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex-shrink-0">
                            Retry
                        </button>
                    {/if}
                </div>
            {/if}
        {/if}

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400"></div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Paid</div>
                <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">{fmtInr(s.total_paid)}</div>
                <div class="text-[10px] text-slate-400 mt-1">of {fmtInr(s.total_payable)}</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-orange-400"></div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending</div>
                <div class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">{fmtInr(s.total_pending)}</div>
                <div class="text-[10px] text-slate-400 mt-1">to collect</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Universities</div>
                <div class="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-2">{s.universities || 0}</div>
                <div class="text-[10px] text-slate-400 mt-1">tracked</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-400"></div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Avg Efficiency</div>
                <div class="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">{Number(s.avg_efficiency || 0).toFixed(1)}%</div>
                <div class="text-[10px] text-slate-400 mt-1">collection</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fully Paid</div>
                <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">{(s.fully_paid || 0).toLocaleString()}</div>
                <div class="text-[10px] text-slate-400 mt-1">of {totalStr.toLocaleString()} students</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-pink-400"></div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Not Paid</div>
                <div class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">{(s.not_paid || 0).toLocaleString()}</div>
                <div class="text-[10px] text-slate-400 mt-1">{(s.partial_paid || 0).toLocaleString()} partial</div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 p-1 mb-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-x-auto">
            {#each [
                { id: 'collection', label: 'Collection Overview', icon: TrendingUp },
                { id: 'students',   label: 'Students Data',       icon: Building2 },
                { id: 'cases',      label: 'Tag Cases',           icon: AlertCircle },
                { id: 'daily',      label: 'Daily Report',        icon: Banknote },
                { id: 'docs',       label: 'Doc Requests',        icon: MessageSquare },
                { id: 'universities', label: 'Universities',      icon: Building2 },
                { id: 'overview',   label: 'Overview',            icon: TrendingUp },
            ] as t}
                {@const Icon = t.icon}
                <button onclick={() => switchTab(t.id as Tab)}
                    class="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all
                           {activeTab === t.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                    <Icon size={14} /> {t.label}
                </button>
            {/each}
        </div>

        <!-- ═══════ COLLECTION OVERVIEW ═══════ -->
        {#if activeTab === 'collection'}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-200">University-wise Collection</div>
                    <div class="flex gap-2 flex-wrap">
                        <div class="relative">
                            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input bind:value={collSearch} placeholder="Search university..." class="pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm w-56" />
                        </div>
                        <select bind:value={collSort} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                            <option value="">Sort by...</option>
                            <option value="eff-desc">Efficiency ↓</option>
                            <option value="eff-asc">Efficiency ↑</option>
                            <option value="paid-desc">Paid ↓</option>
                            <option value="pending-desc">Pending ↓</option>
                        </select>
                        <button onclick={exportCollectionCSV} class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2">
                            <Download size={14} /> Export
                        </button>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <th class="py-3 px-4 text-left">University</th>
                                <th class="py-3 px-2 text-right">Strength</th>
                                <th class="py-3 px-2 text-right">Paid</th>
                                <th class="py-3 px-2 text-right">Pending</th>
                                <th class="py-3 px-2">Progress</th>
                                <th class="py-3 px-2 text-right">Full</th>
                                <th class="py-3 px-2 text-right">Partial</th>
                                <th class="py-3 px-2 text-right">Null</th>
                                <th class="py-3 px-2 text-right">Eff %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if !sortedRollup.length}
                                <tr><td colspan="9" class="text-center py-16 text-slate-400">No data yet. Import data from CSV or Google Sheets to get started.</td></tr>
                            {/if}
                            {#each sortedRollup as u, i}
                                {@const p = pct(+u.paid, +u.payable)}
                                <tr class="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td class="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">{i + 1}. {u.university_name}</td>
                                    <td class="py-3 px-2 text-right font-medium">{u.strength || 0}</td>
                                    <td class="py-3 px-2 text-right text-emerald-600 dark:text-emerald-400 font-semibold">{fmtInr(u.paid)}</td>
                                    <td class="py-3 px-2 text-right text-rose-600 dark:text-rose-400 font-semibold">{fmtInr(u.pending)}</td>
                                    <td class="py-3 px-2 min-w-[140px]">
                                        <div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div class="h-full rounded-full transition-all duration-500" style="width: {Math.min(100, p)}%; background: {pctColor(p)};"></div>
                                        </div>
                                        <div class="text-[10px] text-slate-500 mt-1">{p.toFixed(1)}%</div>
                                    </td>
                                    <td class="py-3 px-2 text-right text-emerald-600 font-bold">{u.fully_paid}</td>
                                    <td class="py-3 px-2 text-right text-amber-600 font-bold">{u.partial_paid}</td>
                                    <td class="py-3 px-2 text-right text-rose-600 font-bold">{u.not_paid}</td>
                                    <td class="py-3 px-2 text-right">
                                        <span class="inline-block px-2 py-0.5 rounded-md text-xs font-bold" style="color: {pctColor(+u.collection_efficiency)}; background: {pctColor(+u.collection_efficiency)}15;">
                                            {Number(u.collection_efficiency).toFixed(1)}%
                                        </span>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

        <!-- ═══════ STUDENTS DATA ═══════ -->
        {:else if activeTab === 'students'}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-200">Student-wise Payments</div>
                    <div class="flex gap-2 flex-wrap">
                        <div class="relative">
                            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input bind:value={stuSearch} oninput={() => loadStudents(1)} placeholder="Search name / Zoho ID..." class="pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm w-52" />
                        </div>
                        <select bind:value={stuFilterUni} onchange={() => loadStudents(1)} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                            <option value="">All Universities</option>
                            {#each data.universities as u}<option value={u.id}>{u.short_name || u.name}</option>{/each}
                        </select>
                        <select bind:value={stuFilterStatus} onchange={() => loadStudents(1)} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                            <option value="">All Status</option>
                            <option value="Fully Paid">Fully Paid</option>
                            <option value="Partially Paid">Partial</option>
                            <option value="Yet To Pay">Not Paid</option>
                        </select>
                        <select bind:value={stuFilterTag} onchange={() => loadStudents(1)} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                            <option value="">All Tags</option>
                            {#each Object.entries(TAG_META) as [k, v]}<option value={k}>{v.label}</option>{/each}
                        </select>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                <th class="py-3 px-3 text-left">#</th>
                                <th class="py-3 px-3 text-left">Student</th>
                                <th class="py-3 px-3 text-left">University</th>
                                <th class="py-3 px-2 text-right">Payable</th>
                                <th class="py-3 px-2 text-right">Paid</th>
                                <th class="py-3 px-2 text-right">Pending</th>
                                <th class="py-3 px-2">Status</th>
                                <th class="py-3 px-2">Tags</th>
                                <th class="py-3 px-2">Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if loading}
                                <tr><td colspan="9" class="text-center py-12"><Loader2 class="animate-spin inline" /> Loading...</td></tr>
                            {:else if !students.length}
                                <tr><td colspan="9" class="text-center py-16 text-slate-400">No students. Import data from Google Sheets or CSV.</td></tr>
                            {/if}
                            {#each students as stu, i}
                                <tr class="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                    <td class="py-3 px-3 text-slate-400">{(stuPage - 1) * STU_PER_PAGE + i + 1}</td>
                                    <td class="py-3 px-3">
                                        <div class="font-bold text-slate-900 dark:text-slate-100">{stu.student_name || '(no name)'}</div>
                                        <div class="text-[10px] text-slate-400 font-mono">{stu.zoho_user_id?.slice(0, 8)}...</div>
                                    </td>
                                    <td class="py-3 px-3 font-medium">{stu.university_name}</td>
                                    <td class="py-3 px-2 text-right">{fmtInr(stu.payable)}</td>
                                    <td class="py-3 px-2 text-right text-emerald-600 font-semibold">{fmtInr(stu.paid)}</td>
                                    <td class="py-3 px-2 text-right text-rose-600 font-semibold">{fmtInr(stu.pending)}</td>
                                    <td class="py-3 px-2"><span class="px-2 py-0.5 rounded-md text-[10px] font-bold {statusColor(stu.status)}">{stu.status}</span></td>
                                    <td class="py-3 px-2">
                                        <div class="flex flex-wrap gap-1">
                                            {#each (stu.tags || []) as t}
                                                <span class="px-1.5 py-0.5 rounded-full text-[9px] font-bold {TAG_META[t]?.cls || 'tag-other'}">{TAG_META[t]?.label || t}</span>
                                            {/each}
                                        </div>
                                    </td>
                                    <td class="py-3 px-2">
                                        <button onclick={() => openDrawer(stu)} class="px-2.5 py-1 rounded-lg text-[10px] font-bold {stu.remarks_count > 0 ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                                            💬 {stu.remarks_count > 0 ? `${stu.remarks_count}` : 'Add'}
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
                {#if studentsTotal > STU_PER_PAGE}
                    {@const pages = Math.ceil(studentsTotal / STU_PER_PAGE)}
                    <div class="flex items-center justify-between p-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <span class="text-slate-500">Showing {(stuPage - 1) * STU_PER_PAGE + 1}–{Math.min(stuPage * STU_PER_PAGE, studentsTotal)} of {studentsTotal.toLocaleString()}</span>
                        <div class="flex gap-1">
                            <button disabled={stuPage <= 1} onclick={() => loadStudents(stuPage - 1)} class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 font-bold">← Prev</button>
                            <span class="px-3 py-1.5 font-bold">{stuPage} / {pages}</span>
                            <button disabled={stuPage >= pages} onclick={() => loadStudents(stuPage + 1)} class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 font-bold">Next →</button>
                        </div>
                    </div>
                {/if}
            </div>

        <!-- ═══════ TAG CASES ═══════ -->
        {:else if activeTab === 'cases'}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-200">Tagged Cases — Loan / Dropout / Specific</div>
                    <div class="flex gap-2 flex-wrap">
                        <select bind:value={caseFilterTag} onchange={loadCases} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                            <option value="">All Tags</option>
                            {#each Object.entries(TAG_META) as [k, v]}<option value={k}>{v.label}</option>{/each}
                        </select>
                        <div class="relative">
                            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input bind:value={caseSearch} oninput={loadCases} placeholder="Search student..." class="pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm w-52" />
                        </div>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-slate-500">
                            <tr><th class="py-3 px-3 text-left">#</th><th class="py-3 px-3 text-left">Student</th><th class="py-3 px-3 text-left">University</th><th class="py-3 px-2 text-right">Pending</th><th class="py-3 px-2">Tags</th><th class="py-3 px-2">Remarks</th><th class="py-3 px-2">Action</th></tr>
                        </thead>
                        <tbody>
                            {#if !casesList.length}
                                <tr><td colspan="7" class="text-center py-16 text-slate-400">No tagged cases yet. Tag students from the Students tab.</td></tr>
                            {/if}
                            {#each casesList as c, i}
                                <tr class="border-t border-slate-100 dark:border-slate-800">
                                    <td class="py-3 px-3 text-slate-400">{i + 1}</td>
                                    <td class="py-3 px-3 font-bold">{c.student_name || c.zoho_user_id?.slice(0, 8)}</td>
                                    <td class="py-3 px-3">{c.university_name}</td>
                                    <td class="py-3 px-2 text-right text-rose-600 font-semibold">{fmtInr(c.pending)}</td>
                                    <td class="py-3 px-2"><div class="flex flex-wrap gap-1">{#each (c.tags || []) as t}<span class="px-1.5 py-0.5 rounded-full text-[9px] font-bold {TAG_META[t]?.cls || 'tag-other'}">{TAG_META[t]?.label || t}</span>{/each}</div></td>
                                    <td class="py-3 px-2 text-purple-600 font-semibold">{c.remarks_count > 0 ? `${c.remarks_count} remark${c.remarks_count > 1 ? 's' : ''}` : '—'}</td>
                                    <td class="py-3 px-2"><button onclick={() => openDrawer(c)} class="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline">Open →</button></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

        <!-- ═══════ DAILY REPORT ═══════ -->
        {:else if activeTab === 'daily'}
            <div class="space-y-4">
                <!-- KPI strip -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Today</div>
                        <div class="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{fmtInr(dailyKpis.today)}</div>
                        <div class="text-[10px] text-slate-400 mt-1">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    </div>
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last 7 Days</div>
                        <div class="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-2">{fmtInr(dailyKpis.week)}</div>
                        <div class="text-[10px] text-slate-400 mt-1">rolling week</div>
                    </div>
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">This Month</div>
                        <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">{fmtInr(dailyKpis.month)}</div>
                        <div class="text-[10px] text-slate-400 mt-1">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
                    </div>
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scheduled (Future)</div>
                        <div class="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-2">{fmtInr(dailyKpis.future)}</div>
                        <div class="text-[10px] text-slate-400 mt-1">after {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    </div>
                </div>

                <!-- Filter bar -->
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center gap-3 flex-wrap">
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <Banknote size={14} class="text-emerald-500" /> Daily Collection Log
                        <span title="Manual entries lock after 8 PM IST. Auto-aggregated rows from sync are always editable." class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold"><Lock size={10} /> Locks 8 PM IST</span>
                    </div>
                    <div class="flex-1"></div>
                    <div class="flex items-center gap-0 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                        {#each [
                            { id: 'today', label: 'Today' },
                            { id: 'week', label: '7d' },
                            { id: 'month', label: 'This month' },
                            { id: 'all', label: 'All' },
                        ] as r}
                            <button onclick={() => dailyRange = r.id as any}
                                class="px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors
                                       {dailyRange === r.id ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}">
                                {r.label}
                            </button>
                        {/each}
                    </div>
                    <label class="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" bind:checked={dailyHideFuture} class="w-3.5 h-3.5 rounded accent-indigo-600" />
                        Hide future
                    </label>
                    <select bind:value={dailyFilterUni} onchange={loadDaily} class="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                        <option value="">All Universities</option>
                        {#each data.universities as u}<option value={u.id}>{u.short_name || u.name}</option>{/each}
                    </select>
                    {#if data.access.canEditRemarks}
                        <button onclick={() => showDailyForm = !showDailyForm} class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5">
                            <Plus size={12} /> Add Entry
                        </button>
                    {/if}
                </div>

                {#if showDailyForm}
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                        <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">New Manual Entry</div>
                        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                            <select bind:value={dailyForm.university_id} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                                <option value="">University…</option>
                                {#each data.universities as u}<option value={u.id}>{u.short_name || u.name}</option>{/each}
                            </select>
                            <input type="date" bind:value={dailyForm.date} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                            <input type="number" bind:value={dailyForm.amount} placeholder="Amount ₹" class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                            <input type="number" bind:value={dailyForm.students_count} placeholder="# Students" class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                            <input bind:value={dailyForm.notes} placeholder="Notes…" class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                        </div>
                        <div class="mt-3 flex gap-2">
                            <button disabled={savingDaily} onclick={saveDailyEntry} class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">{savingDaily ? 'Saving…' : 'Save Entry'}</button>
                            <button onclick={() => showDailyForm = false} class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">Cancel</button>
                        </div>
                    </div>
                {/if}

                <!-- Grouped by month -->
                {#if !filteredDaily.length}
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-16 text-center">
                        <Banknote size={28} class="inline text-slate-300 dark:text-slate-700" />
                        <div class="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No entries in this range</div>
                        <div class="text-xs text-slate-500 mt-1">Try a wider range or uncheck "Hide future".</div>
                    </div>
                {/if}
                {#each dailyByMonth as group (group.month)}
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                        <!-- Month header -->
                        <div class="px-4 py-3 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-extrabold shadow-md">
                                    {new Date(group.month + '-01').toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}
                                </div>
                                <div>
                                    <div class="text-sm font-extrabold text-slate-900 dark:text-white">{fmtMonth(group.month)}</div>
                                    <div class="text-[10px] text-slate-500">{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'} · {group.students.toLocaleString()} students</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{fmtInr(group.total)}</div>
                                <div class="text-[10px] text-slate-400 uppercase tracking-wider">collected</div>
                            </div>
                        </div>
                        <!-- Rows -->
                        <div class="divide-y divide-slate-100 dark:divide-slate-800">
                            {#each group.entries as e}
                                {@const dStr = (e.date || '').split('T')[0]}
                                {@const isFuture = isFutureDate(dStr)}
                                {@const isTodayRow = isToday(dStr)}
                                {@const isLocked = e.locked_at != null}
                                {@const isAuto = e.notes === 'auto: aggregated from transactions'}
                                <div class="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                    <!-- Date column -->
                                    <div class="flex-shrink-0 w-20 text-center">
                                        <div class="text-2xl font-extrabold {isTodayRow ? 'text-indigo-600 dark:text-indigo-400' : isFuture ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'} leading-none">
                                            {new Date(dStr).getDate()}
                                        </div>
                                        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{fmtDow(dStr)}</div>
                                    </div>
                                    <!-- Vertical separator -->
                                    <div class="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>
                                    <!-- University + badges -->
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2 flex-wrap">
                                            <span class="text-sm font-bold text-slate-900 dark:text-white">{e.university_name}</span>
                                            {#if isTodayRow}<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">TODAY</span>{/if}
                                            {#if isFuture}<span title="This date is after today — likely a scheduled / projected payment from your sheet" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">SCHEDULED</span>{/if}
                                            {#if isAuto}<span title="Aggregated from synced transactions — re-runs on each sync" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500"><RefreshCw size={8} /> AUTO</span>
                                            {:else}<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">MANUAL</span>{/if}
                                        </div>
                                        <div class="text-[10px] text-slate-400 mt-0.5">
                                            {e.students_count} student{e.students_count === 1 ? '' : 's'}
                                            {#if !isAuto && e.notes}· {e.notes}{/if}
                                        </div>
                                    </div>
                                    <!-- Amount -->
                                    <div class="text-right flex-shrink-0">
                                        <div class="text-lg font-extrabold {isFuture ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">{fmtInr(e.amount)}</div>
                                        {#if isLocked}<div class="text-[9px] text-rose-500 font-bold uppercase tracking-wider mt-0.5 flex items-center gap-0.5 justify-end"><Lock size={8} /> Locked</div>{/if}
                                    </div>
                                    <!-- Delete (manual only) -->
                                    <div class="flex-shrink-0 w-7 flex justify-center">
                                        {#if !isAuto && !isLocked && data.access.canEditRemarks}
                                            <button onclick={() => deleteDailyEntry(e.id)} title="Delete this manual entry" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 size={14} /></button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

        <!-- ═══════ DOC REQUESTS TAB ═══════ -->
        {:else if activeTab === 'docs'}
            <!-- Stats cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Sent</div>
                    <div class="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{docStats.total_sent || 0}</div>
                </div>
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Opened</div>
                    <div class="text-2xl font-extrabold text-blue-600 mt-1">{docStats.opened || 0}</div>
                </div>
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Acknowledged</div>
                    <div class="text-2xl font-extrabold text-emerald-600 mt-1">{docStats.acknowledged || 0}</div>
                </div>
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Uploaded</div>
                    <div class="text-2xl font-extrabold text-purple-600 mt-1">{docStats.uploaded || 0}</div>
                </div>
            </div>

            <!-- Students missing docs -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden mb-4">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div class="text-sm font-bold text-slate-700 dark:text-slate-200">Students Missing Documents</div>
                        <div class="text-xs text-slate-500 mt-0.5">No billing receipts or fee proofs uploaded — {docMissingStudents.length} students</div>
                    </div>
                    <div class="flex gap-2 flex-wrap items-center">
                        <select bind:value={docFilterUni} onchange={loadDocMissing} class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                            <option value="">All Universities</option>
                            {#each data.universities as u}<option value={u.id}>{u.short_name || u.name}</option>{/each}
                        </select>
                        <label class="flex items-center gap-2 text-xs font-bold">
                            <input type="checkbox" bind:checked={docOnlyUnpaid} onchange={loadDocMissing} class="rounded" />
                            Only unpaid/partial
                        </label>
                        {#if data.access.canEditRemarks}
                            <button onclick={selectAllMissing} class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Select all</button>
                            <button onclick={clearDocSelection} class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Clear</button>
                            <button disabled={!selectedForDocRequest.size} onclick={() => showSendDocModal = true} class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
                                <MessageSquare size={12} /> Send to {selectedForDocRequest.size || 0} students
                            </button>
                        {/if}
                    </div>
                </div>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                            <tr><th class="py-3 px-3 w-8"></th><th class="py-3 px-3 text-left">Student</th><th class="py-3 px-3 text-left">University</th><th class="py-3 px-2 text-right">Pending</th><th class="py-3 px-2">Status</th></tr>
                        </thead>
                        <tbody>
                            {#if !docMissingStudents.length}<tr><td colspan="5" class="text-center py-12 text-slate-400">All students have uploaded documents 🎉</td></tr>{/if}
                            {#each docMissingStudents as s}
                                <tr class="border-t border-slate-100 dark:border-slate-800">
                                    <td class="py-2 px-3"><input type="checkbox" checked={selectedForDocRequest.has(s.id)} onchange={() => toggleDocSelection(s.id)} class="rounded" /></td>
                                    <td class="py-2 px-3 font-medium">{s.student_name || s.zoho_user_id?.slice(0, 8)}</td>
                                    <td class="py-2 px-3">{s.university_name}</td>
                                    <td class="py-2 px-2 text-right text-rose-600 font-bold">{fmtInr(s.pending)}</td>
                                    <td class="py-2 px-2"><span class="text-[10px] px-2 py-0.5 rounded {statusColor(s.status)}">{s.status}</span></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Sent requests history -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div class="p-4 border-b border-slate-100 dark:border-slate-800">
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-200">Sent Requests · Acknowledgment Status</div>
                </div>
                <div class="overflow-x-auto max-h-96">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold uppercase text-slate-500 sticky top-0">
                            <tr><th class="py-3 px-3 text-left">Student</th><th class="py-3 px-3 text-left">University</th><th class="py-3 px-3 text-left">Sent</th><th class="py-3 px-3 text-left">Opened</th><th class="py-3 px-3 text-left">Acknowledged</th><th class="py-3 px-2">Status</th></tr>
                        </thead>
                        <tbody>
                            {#if !docRequests.length}<tr><td colspan="6" class="text-center py-12 text-slate-400">No requests sent yet.</td></tr>{/if}
                            {#each docRequests as r}
                                <tr class="border-t border-slate-100 dark:border-slate-800">
                                    <td class="py-2 px-3 font-medium">{r.student_name || r.zoho_user_id?.slice(0, 8)}</td>
                                    <td class="py-2 px-3">{r.university_name}</td>
                                    <td class="py-2 px-3 text-xs text-slate-500">{fmtDateTime(r.sent_at)}</td>
                                    <td class="py-2 px-3 text-xs">{r.opened_at ? fmtDateTime(r.opened_at) : '—'}</td>
                                    <td class="py-2 px-3 text-xs">{r.acknowledged_at ? fmtDateTime(r.acknowledged_at) : '—'}</td>
                                    <td class="py-2 px-2">
                                        <span class="text-[10px] px-2 py-0.5 rounded {r.status === 'acknowledged' ? 'bg-emerald-100 text-emerald-700' : r.status === 'opened' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}">
                                            {r.status}
                                        </span>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

        <!-- ═══════ UNIVERSITIES TAB ═══════ -->
        {:else if activeTab === 'universities'}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each sortedRollup as u}
                    {@const p = pct(+u.paid, +u.payable)}
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                        <div class="flex items-center justify-between mb-3">
                            <div class="font-bold text-slate-900 dark:text-slate-100">{u.university_name}</div>
                            <span class="text-lg font-extrabold" style="color: {pctColor(p)};">{p.toFixed(1)}%</span>
                        </div>
                        <div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
                            <div class="h-full rounded-full" style="width: {Math.min(100, p)}%; background: {pctColor(p)};"></div>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-center text-xs">
                            <div><div class="font-bold text-emerald-600">{u.fully_paid}</div><div class="text-[9px] text-slate-400">Full</div></div>
                            <div><div class="font-bold text-amber-600">{u.partial_paid}</div><div class="text-[9px] text-slate-400">Partial</div></div>
                            <div><div class="font-bold text-rose-600">{u.not_paid}</div><div class="text-[9px] text-slate-400">Null</div></div>
                        </div>
                        <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs">
                            <span class="text-slate-500">Paid: <span class="font-bold text-emerald-600">{fmtInr(u.paid)}</span></span>
                            <span class="text-slate-500">Pending: <span class="font-bold text-rose-600">{fmtInr(u.pending)}</span></span>
                        </div>
                    </div>
                {/each}
            </div>

        <!-- ═══════ OVERVIEW ═══════ -->
        {:else if activeTab === 'overview'}
            <div class="space-y-5">
                <!-- 30-day collection trend -->
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <div class="text-sm font-bold text-slate-900 dark:text-white">Collection Trend</div>
                            <div class="text-xs text-slate-500 mt-0.5">Last 30 days, aggregated across all universities</div>
                        </div>
                        {#if trendData.length}
                            <div class="text-right">
                                <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{fmtInr(trendData.reduce((s, d) => s + d.amount, 0))}</div>
                                <div class="text-[10px] text-slate-400 uppercase tracking-wider">total in window</div>
                            </div>
                        {/if}
                    </div>
                    {#if overviewLoading}
                        <div class="text-center py-12 text-sm text-slate-500"><Loader2 class="inline animate-spin" size={16} /> Loading…</div>
                    {:else if !trendData.length}
                        <div class="text-center py-12">
                            <div class="text-sm font-bold text-slate-700 dark:text-slate-300">No daily activity yet</div>
                            <div class="text-xs text-slate-500 mt-1">Run a sync — the day-wise sheet feeds this chart automatically.</div>
                        </div>
                    {:else}
                        {@const maxA = Math.max(1, ...trendData.map(d => d.amount))}
                        {@const w = 100 / Math.max(trendData.length, 1)}
                        <div class="relative h-48">
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-full">
                                <defs>
                                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.4" />
                                        <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
                                    </linearGradient>
                                </defs>
                                <!-- Area fill -->
                                <path d={`M 0 100 ${trendData.map((d, i) => `L ${i * w + w/2} ${100 - (d.amount / maxA) * 90}`).join(' ')} L 100 100 Z`} fill="url(#trendGrad)" />
                                <!-- Line -->
                                <polyline points={trendData.map((d, i) => `${i * w + w/2},${100 - (d.amount / maxA) * 90}`).join(' ')} fill="none" stroke="#6366f1" stroke-width="0.7" vector-effect="non-scaling-stroke" />
                                <!-- Points -->
                                {#each trendData as d, i}
                                    <circle cx={i * w + w/2} cy={100 - (d.amount / maxA) * 90} r="0.8" fill="#6366f1" vector-effect="non-scaling-stroke" />
                                {/each}
                            </svg>
                        </div>
                        <div class="flex justify-between text-[10px] text-slate-400 mt-2">
                            <span>{fmtDate(trendData[0]?.date)}</span>
                            <span>{trendData.length} day{trendData.length === 1 ? '' : 's'}</span>
                            <span>{fmtDate(trendData[trendData.length - 1]?.date)}</span>
                        </div>
                    {/if}
                </div>

                <!-- Top movers grid -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <div class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <span class="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">↑</span>
                            Top 5 by Efficiency
                        </div>
                        {#if !topEfficient.length}
                            <div class="text-xs text-slate-500 py-4">No universities yet.</div>
                        {:else}
                            <div class="space-y-2">
                                {#each topEfficient as u, i}
                                    <div class="flex items-center gap-3">
                                        <div class="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-sm font-bold text-slate-900 dark:text-white truncate">{u.university_name}</div>
                                            <div class="text-[10px] text-slate-500">{fmtInr(u.paid)} paid · {u.strength} students</div>
                                        </div>
                                        <div class="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 flex-shrink-0">{Number(u.collection_efficiency).toFixed(1)}%</div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <div class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <span class="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs">!</span>
                            Top 5 by Pending Amount
                        </div>
                        {#if !topPending.length}
                            <div class="text-xs text-slate-500 py-4">No universities yet.</div>
                        {:else}
                            <div class="space-y-2">
                                {#each topPending as u, i}
                                    <div class="flex items-center gap-3">
                                        <div class="w-6 h-6 rounded-lg bg-rose-600 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-sm font-bold text-slate-900 dark:text-white truncate">{u.university_name}</div>
                                            <div class="text-[10px] text-slate-500">{u.not_paid} not paid · {u.partial_paid} partial</div>
                                        </div>
                                        <div class="text-sm font-extrabold text-rose-600 dark:text-rose-400 flex-shrink-0">{fmtInr(u.pending)}</div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Last sync + recent doc requests -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <div class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <RefreshCw size={14} class="text-indigo-500" /> Last Sync
                        </div>
                        {#if activePeriod?.last_synced_at}
                            <div class="space-y-3 text-sm">
                                <div class="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span class="text-slate-500">When</span>
                                    <span class="font-bold text-slate-900 dark:text-white">{fmtTimeAgo(activePeriod.last_synced_at)} ({fmtDateTime(activePeriod.last_synced_at)})</span>
                                </div>
                                {#if activePeriod.last_sync_summary}
                                    {@const sum = activePeriod.last_sync_summary}
                                    <div class="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <span class="text-slate-500">Rows imported</span>
                                        <span class="font-bold text-emerald-600 dark:text-emerald-400">{sum.totalImported?.toLocaleString() || 0}</span>
                                    </div>
                                    <div class="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <span class="text-slate-500">Skipped</span>
                                        <span class="font-bold text-amber-600 dark:text-amber-400">{sum.totalSkipped?.toLocaleString() || 0}</span>
                                    </div>
                                    <div class="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <span class="text-slate-500">Duration</span>
                                        <span class="font-bold text-slate-900 dark:text-white">{((sum.elapsed_ms || 0) / 1000).toFixed(1)}s</span>
                                    </div>
                                    {#if sum.perStep?.length}
                                        <div class="pt-1">
                                            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Per-step breakdown</div>
                                            <div class="space-y-1 max-h-40 overflow-y-auto">
                                                {#each sum.perStep as st}
                                                    <div class="flex justify-between items-center text-xs gap-2">
                                                        <span class="text-slate-600 dark:text-slate-400 truncate" title={st.tab || st.step}>
                                                            <span class="font-mono text-[10px] text-slate-400 mr-1">{st.step}</span>
                                                            {st.tab || ''}
                                                        </span>
                                                        <span class="font-bold {st.ok > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} flex-shrink-0">{st.ok}</span>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        {:else}
                            <div class="text-xs text-slate-500 py-4">Never synced.</div>
                        {/if}
                    </div>

                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <div class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <MessageSquare size={14} class="text-purple-500" /> Recent Doc Requests
                        </div>
                        {#if !recentDocs.length}
                            <div class="text-xs text-slate-500 py-4">No requests sent yet.</div>
                        {:else}
                            <div class="space-y-2 max-h-72 overflow-y-auto">
                                {#each recentDocs as r}
                                    <div class="flex items-center gap-3 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                        <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 {r.status === 'acknowledged' || r.status === 'uploaded' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600' : r.status === 'opened' ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
                                            {#if r.status === 'acknowledged' || r.status === 'uploaded'}✓{:else if r.status === 'opened'}👁{:else}✉{/if}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="text-sm font-bold text-slate-900 dark:text-white truncate">{r.student_name || '—'}</div>
                                            <div class="text-[10px] text-slate-500">{r.university_name || '—'} · {fmtTimeAgo(r.sent_at)}</div>
                                        </div>
                                        <span class="text-[10px] font-bold uppercase tracking-wider {r.status === 'acknowledged' || r.status === 'uploaded' ? 'text-emerald-600' : r.status === 'opened' ? 'text-blue-600' : 'text-slate-400'}">{r.status}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

    </div>
</div>

<!-- ═══════ REMARKS DRAWER ═══════ -->
{#if drawerOpen && drawerStudent}
    <div transition:fade={{ duration: 150 }} class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onclick={closeDrawer} role="presentation"></div>
    <div transition:fly={{ x: 500, duration: 250 }} class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 z-50 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col">
        <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between">
            <div>
                <div class="font-extrabold text-lg text-slate-900 dark:text-white">{drawerStudent.student_name || '(no name)'}</div>
                <div class="text-xs text-slate-500 font-mono mt-1">{drawerStudent.university_name} · {drawerStudent.zoho_user_id?.slice(0, 16)}…</div>
            </div>
            <button onclick={closeDrawer} class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X size={16}/></button>
        </div>
        <div class="grid grid-cols-3 border-b border-slate-200 dark:border-slate-700">
            <div class="p-3 border-r border-slate-200 dark:border-slate-700">
                <div class="text-[9px] font-bold uppercase text-slate-400">Payable</div>
                <div class="text-lg font-extrabold text-amber-600">{fmtInr(drawerStudent.payable)}</div>
            </div>
            <div class="p-3 border-r border-slate-200 dark:border-slate-700">
                <div class="text-[9px] font-bold uppercase text-slate-400">Paid</div>
                <div class="text-lg font-extrabold text-emerald-600">{fmtInr(drawerStudent.paid)}</div>
            </div>
            <div class="p-3">
                <div class="text-[9px] font-bold uppercase text-slate-400">Pending</div>
                <div class="text-lg font-extrabold text-rose-600">{fmtInr(drawerStudent.pending)}</div>
            </div>
        </div>
        <div class="flex-1 overflow-y-auto">
            <!-- Tags editor -->
            <div class="p-4 border-b border-slate-100 dark:border-slate-800">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Case Tags</div>
                <div class="flex flex-wrap gap-1.5">
                    {#each Object.entries(TAG_META) as [k, v]}
                        {@const active = (drawerStudent.tags || []).includes(k)}
                        <button disabled={!data.access.canEditRemarks} onclick={() => toggleTag(k)}
                            class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all {active ? `${v.cls} opacity-100` : 'border-slate-200 dark:border-slate-700 text-slate-500 opacity-50 hover:opacity-100'} disabled:cursor-not-allowed">
                            {v.label}
                        </button>
                    {/each}
                </div>
            </div>
            <!-- Remarks list -->
            <div class="p-4">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Remarks ({drawerRemarks.length})</div>
                {#if drawerLoading}<div class="text-center text-slate-400 py-6"><Loader2 class="animate-spin inline" /> Loading...</div>{/if}
                {#if !drawerLoading && !drawerRemarks.length}<div class="text-center text-slate-400 py-6 text-sm">No remarks yet. Add one below.</div>{/if}
                {#each drawerRemarks as r}
                    <div class="bg-slate-50 dark:bg-slate-800/50 border-l-2 border-purple-500 rounded-lg p-3 mb-3">
                        <div class="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-sm text-purple-700 dark:text-purple-300">{r.author_name}</span>
                                <span class="text-[9px] font-bold bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">{r.role}</span>
                                {#if r.case_type}<span class="text-[9px] font-bold {TAG_META[r.case_type]?.cls} px-1.5 py-0.5 rounded">{TAG_META[r.case_type]?.label}</span>{/if}
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="text-[10px] text-slate-400">{fmtDateTime(r.created_at)}</span>
                                {#if data.access.canEditRemarks}<button onclick={() => deleteRemark(r.id)} class="text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>{/if}
                            </div>
                        </div>
                        <div class="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">{r.text}</div>
                        {#if r.attachments && r.attachments.length}
                            <div class="mt-2 flex flex-wrap gap-1.5">
                                {#each r.attachments as a}
                                    <a href={a.file_url} target="_blank" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] hover:border-indigo-400">
                                        <Paperclip size={10} /> {a.file_name}
                                        <span class="text-slate-400">{(a.size_bytes / 1024 / 1024).toFixed(2)}MB</span>
                                    </a>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
        <!-- Add remark form -->
        {#if data.access.canEditRemarks}
            <div class="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <input bind:value={remarkAuthor} placeholder="Your name" class="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm" />
                    <select bind:value={remarkRole} class="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                        <option value="PM">PM</option><option value="COS">COS</option><option value="PMA">PMA</option><option value="CMA">CMA</option><option value="BOA">BOA</option><option value="Finance">Finance</option><option value="Counselor">Counselor</option><option value="Other">Other</option>
                    </select>
                </div>
                <select bind:value={remarkCaseType} class="w-full px-3 py-2 mb-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                    <option value="">General remark (no case type)</option>
                    {#each Object.entries(TAG_META) as [k, v]}<option value={k}>{v.label}</option>{/each}
                </select>
                <textarea bind:value={remarkText} placeholder="Enter remark…" rows="3" class="w-full px-3 py-2 mb-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm resize-y"></textarea>
                <div class="flex items-center gap-2 mb-2">
                    <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer hover:border-indigo-400">
                        <Paperclip size={12} /> Attach Proofs
                        <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onchange={stageFiles} class="hidden" />
                    </label>
                    <span class="text-[10px] text-slate-500">{stagedFiles.length}/5 staged · 5MB each max</span>
                </div>
                {#if stagedFiles.length}
                    <div class="flex flex-wrap gap-1 mb-2">
                        {#each stagedFiles as f, i}
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-100 dark:bg-purple-950/40 text-purple-700 text-[10px] font-bold">
                                {f.name.length > 20 ? f.name.slice(0, 20) + '…' : f.name}
                                <button onclick={() => stagedFiles = stagedFiles.filter((_, j) => j !== i)}>×</button>
                            </span>
                        {/each}
                    </div>
                {/if}
                <button disabled={savingRemark} onclick={saveRemark} class="w-full px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                    {#if savingRemark}<Loader2 class="animate-spin" size={14} />{:else}<MessageSquare size={14} />{/if}
                    Save Remark
                </button>
            </div>
        {/if}
    </div>
{/if}

<!-- ═══════ IMPORT MODAL ═══════ -->
{#if showImportModal}
    <div transition:fade={{ duration: 150 }} class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick={() => showImportModal = false} role="presentation">
        <div transition:fly={{ y: 30 }} class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()} role="presentation">
            <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                    <div class="font-extrabold text-lg text-slate-900 dark:text-white">Import Fee Data</div>
                    <div class="text-xs text-slate-500 mt-0.5">From Google Sheets or CSV file</div>
                </div>
                <button onclick={() => showImportModal = false} class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X size={16} /></button>
            </div>

            <div class="p-5 space-y-4">
                <!-- Mode toggle -->
                <div class="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <button onclick={() => importMode = 'sheet'} class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all {importMode === 'sheet' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow' : 'text-slate-500'}">
                        Google Sheets
                    </button>
                    <button onclick={() => importMode = 'csv'} class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all {importMode === 'csv' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow' : 'text-slate-500'}">
                        CSV Upload
                    </button>
                </div>

                <!-- Dataset type with clear descriptions -->
                <div>
                    <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">What are you importing?</label>
                    <div class="space-y-2">
                        <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {importDataset === 'userwise' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}">
                            <input type="radio" bind:group={importDataset} value="userwise" class="mt-1" />
                            <div class="flex-1">
                                <div class="font-bold text-sm">📋 Main Student Data <span class="text-[10px] font-normal text-emerald-600 ml-1">← Start here</span></div>
                                <div class="text-[11px] text-slate-500 mt-0.5">Per-student fee status (payable, paid, pending, status). From the <code class="bg-slate-100 dark:bg-slate-800 px-1 rounded">Userwise Data</code> tab. ~600 rows.</div>
                            </div>
                        </label>
                        <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {importDataset === 'daywise' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}">
                            <input type="radio" bind:group={importDataset} value="daywise" class="mt-1" />
                            <div class="flex-1">
                                <div class="font-bold text-sm">💸 Daily Payment Transactions</div>
                                <div class="text-[11px] text-slate-500 mt-0.5">When each payment was made. From <code class="bg-slate-100 dark:bg-slate-800 px-1 rounded">Day_Wise_Payments</code> tab. ~1,500 rows.</div>
                            </div>
                        </label>
                        <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {importDataset === 'summary' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}">
                            <input type="radio" bind:group={importDataset} value="summary" class="mt-1" />
                            <div class="flex-1">
                                <div class="font-bold text-sm">📊 University-level Counts Only</div>
                                <div class="text-[11px] text-slate-500 mt-0.5">Just Fully/Partial/Null counts per university. From <code class="bg-slate-100 dark:bg-slate-800 px-1 rounded">Sheet1</code>. ~20 rows.</div>
                            </div>
                        </label>
                        <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all {importDataset === 'multi-tab' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}">
                            <input type="radio" bind:group={importDataset} value="multi-tab" class="mt-1" />
                            <div class="flex-1">
                                <div class="font-bold text-sm">🌐 All Universities (multi-tab) <span class="text-[10px] font-normal text-emerald-600 ml-1">← For sheets with one tab per university</span></div>
                                <div class="text-[11px] text-slate-500 mt-0.5">Imports student data from multiple per-university tabs at once. University name auto-derived from the tab name.</div>
                            </div>
                        </label>
                    </div>
                </div>

                {#if importDataset === 'userwise'}
                    <label class="flex items-center gap-2 text-xs">
                        <input type="checkbox" bind:checked={importRemarks} class="rounded" />
                        <span><strong>Also import legacy remarks</strong> (slower, ~2 min). Migrates the "Remarks", "Dropout", "loan" columns into per-student remarks + tags. Skip this if you just want the fee data fast.</span>
                    </label>
                {/if}

                {#if importDataset === 'multi-tab' && importMode === 'sheet'}
                    <div>
                        <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Tab names — one per line</label>
                        <textarea bind:value={multiTabList} rows="8" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono"></textarea>
                        <div class="text-[10px] text-slate-400 mt-1">University name is auto-derived from each tab name (e.g. "Aurora University" → "Aurora"). Universities not in your system will be auto-created.</div>
                    </div>
                {/if}

                {#if importMode === 'sheet'}
                    <div>
                        <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Google Sheet ID</label>
                        <input bind:value={importSheetId} placeholder="From the URL between /d/ and /edit" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono" />
                        <div class="text-[10px] text-slate-400 mt-1">Make sure the sheet is shared with "Anyone with the link → Viewer".</div>
                    </div>
                    {#if importDataset !== 'multi-tab'}
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Tab Name</label>
                            <input bind:value={importTabName} placeholder="e.g. Userwise Data" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono" />
                            {#if importTabName !== DATASET_DEFAULT_TAB[importDataset]}
                                <div class="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-300">
                                    ⚠️ Tab name doesn't match your dataset choice. Expected: <button onclick={() => importTabName = DATASET_DEFAULT_TAB[importDataset]} class="font-bold font-mono underline">{DATASET_DEFAULT_TAB[importDataset]}</button>
                                </div>
                            {/if}
                            <div class="text-[10px] text-slate-400 mt-1">
                                Quick-pick: <button onclick={() => { importDataset = 'userwise'; importTabName = 'Userwise Data'; }} class="text-indigo-500 hover:underline font-mono">Userwise Data</button> ·
                                <button onclick={() => { importDataset = 'daywise'; importTabName = 'Day_Wise_Payments'; }} class="text-indigo-500 hover:underline font-mono">Day_Wise_Payments</button> ·
                                <button onclick={() => { importDataset = 'summary'; importTabName = 'Sheet1'; }} class="text-indigo-500 hover:underline font-mono">Sheet1</button>
                            </div>
                        </div>
                    {/if}
                {:else}
                    <div>
                        <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">CSV File</label>
                        <input type="file" accept=".csv" onchange={(e) => importFile = (e.target as HTMLInputElement).files?.[0] || null} class="w-full text-sm" />
                        <div class="text-[10px] text-slate-400 mt-1">Expected columns: User ID, University, Payable, Paid, Status, etc.</div>
                    </div>
                {/if}

                {#if importResult}
                    {@const success = (importResult.ok || 0) > 0}
                    <div class="p-4 rounded-xl {success ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'} text-sm">
                        <div class="font-bold {success ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'} mb-2">
                            {success ? '✅ Import Complete' : '⚠️ Import Completed With Issues'}
                        </div>
                        <div class="text-xs space-y-1">
                            <div>• <strong>{importResult.ok || 0}</strong> rows imported</div>
                            <div>• <strong>{importResult.skipped || 0}</strong> rows skipped</div>
                            {#if importResult.remarksImported}<div>• <strong>{importResult.remarksImported}</strong> legacy remarks migrated</div>{/if}
                            {#if importResult.tagged}<div>• <strong>{importResult.tagged}</strong> students auto-tagged</div>{/if}
                            {#if importResult.createdUniversities && importResult.createdUniversities.length}
                                <div class="text-emerald-600 dark:text-emerald-400">• <strong>{importResult.createdUniversities.length}</strong> universities auto-created: {importResult.createdUniversities.join(', ')}</div>
                            {/if}
                            {#if importResult.elapsed_ms}<div class="opacity-70">• Completed in {(importResult.elapsed_ms / 1000).toFixed(1)}s</div>{/if}

                            {#if importResult.perTab && importResult.perTab.length}
                                <details class="mt-3" open>
                                    <summary class="cursor-pointer font-bold text-slate-700 dark:text-slate-300 mb-2">📊 Per-tab breakdown ({importResult.perTab.length} tabs)</summary>
                                    <div class="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                                        <table class="w-full text-[11px]">
                                            <thead class="bg-slate-100 dark:bg-slate-800">
                                                <tr><th class="px-2 py-1.5 text-left">Tab → University</th><th class="px-2 py-1.5 text-right">Rows in tab</th><th class="px-2 py-1.5 text-right">Imported</th><th class="px-2 py-1.5 text-right">Skipped</th><th class="px-2 py-1.5">Status</th></tr>
                                            </thead>
                                            <tbody>
                                                {#each importResult.perTab as t}
                                                    <tr class="border-t border-slate-100 dark:border-slate-800">
                                                        <td class="px-2 py-1.5"><div class="font-mono">{t.tab}</div><div class="text-[10px] text-slate-500">→ {t.university}</div></td>
                                                        <td class="px-2 py-1.5 text-right text-slate-500">{t.rows ?? '—'}</td>
                                                        <td class="px-2 py-1.5 text-right font-bold {t.ok > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}">{t.ok || 0}</td>
                                                        <td class="px-2 py-1.5 text-right text-slate-500">{t.skipped || 0}</td>
                                                        <td class="px-2 py-1.5">{#if t.error}<span class="text-rose-600 text-[10px]">❌ Failed</span>{:else if t.ok > 0}<span class="text-emerald-600 text-[10px]">✓ OK</span>{:else}<span class="text-amber-600 text-[10px]">⚠ 0 imported</span>{/if}</td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            {/if}
                            {#if importResult.errors && importResult.errors.length}
                                {@const hasRealErrors = importResult.errors.some((e: string) => !e.includes('duplicate') && !e.includes('Total'))}
                                <details class="mt-3" open={hasRealErrors}>
                                    <summary class="cursor-pointer font-bold {hasRealErrors ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'} mb-2">
                                        {hasRealErrors ? '⚠️' : 'ℹ️'} {importResult.errors.length} note{importResult.errors.length === 1 ? '' : 's'} — click to see details
                                    </summary>
                                    <ul class="mt-1 ml-4 text-[11px] {hasRealErrors ? 'text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-800/50' : 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'} space-y-0.5 font-mono p-2 rounded-lg border">
                                        {#each importResult.errors.slice(0, 10) as err}<li>• {err}</li>{/each}
                                    </ul>
                                    {#if importResult.errors.some((e: string) => e.includes('Unknown university')) && hasRealErrors}
                                        <div class="mt-2 text-[11px] text-amber-700 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                                            💡 <strong>Fix:</strong> These universities will now be auto-created on next import. Just re-run.
                                        </div>
                                    {/if}
                                </details>
                            {/if}
                        </div>
                    </div>
                {/if}

                <div class="flex gap-2 pt-2">
                    <button disabled={importing} onclick={runImport} class="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        {#if importing}<Loader2 class="animate-spin" size={16} /> Importing...{:else}<RefreshCw size={16} /> Run Import{/if}
                    </button>
                    <button onclick={() => showImportModal = false} class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">Close</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- ═══════ SEND DOC REQUEST MODAL ═══════ -->
{#if showSendDocModal}
    <div transition:fade={{ duration: 150 }} class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick={() => showSendDocModal = false} role="presentation">
        <div transition:fly={{ y: 30 }} class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()} role="presentation">
            <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                    <div class="font-extrabold text-lg">Send Document Request</div>
                    <div class="text-xs text-slate-500 mt-0.5">To {selectedForDocRequest.size} students via email</div>
                </div>
                <button onclick={() => showSendDocModal = false} class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div class="p-5 space-y-3">
                <div>
                    <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Email Subject</label>
                    <input bind:value={docEmailSubject} class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                </div>
                <div>
                    <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Message</label>
                    <textarea bind:value={docMessage} rows="6" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm resize-y"></textarea>
                </div>
                <div>
                    <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Google Form URL (optional, for document uploads)</label>
                    <input bind:value={docFormUrl} placeholder="https://forms.google.com/..." class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono" />
                    <div class="text-[10px] text-slate-500 mt-1">Each student gets an Acknowledge button + this upload link in their email.</div>
                </div>
                <div class="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
                    ⚠️ Note: students must have an email on file (linked via Zoho UUID to the students table). Students without email addresses will be silently skipped from sending.
                </div>
                <div class="flex gap-2 pt-2">
                    <button disabled={docSending} onclick={sendDocRequests} class="flex-1 px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        {#if docSending}<Loader2 class="animate-spin" size={16} /> Sending...{:else}<MessageSquare size={16} /> Send to {selectedForDocRequest.size} students{/if}
                    </button>
                    <button onclick={() => showSendDocModal = false} class="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">Cancel</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- ═══════ BATCH WIZARD MODAL ═══════ -->
{#if showBatchModal}
    <div transition:fade={{ duration: 150 }} class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick={() => showBatchModal = false} role="presentation">
        <div transition:fly={{ y: 30 }} class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[92vh] overflow-y-auto" onclick={(e) => e.stopPropagation()} role="presentation">
            <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
                <div>
                    <div class="font-extrabold text-lg flex items-center gap-2">
                        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <Wallet size={16} class="text-white" />
                        </div>
                        {batchForm.id ? 'Edit Batch Settings' : 'Create New Batch'}
                    </div>
                    <div class="text-xs text-slate-500 mt-1">Link a Google Sheet and enable auto-sync to keep fee data fresh.</div>
                </div>
                <button onclick={() => showBatchModal = false} class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X size={16} /></button>
            </div>

            <div class="p-5 space-y-5">
                <!-- Basics -->
                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Batch Details</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div class="md:col-span-2">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Batch Name</label>
                            <input bind:value={batchForm.name} placeholder="e.g. NIAT · Batch 2023-27 · Term 1" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Program</label>
                            <select bind:value={batchForm.program} class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                                <option value="NIAT">NIAT</option>
                                <option value="CCBP">CCBP</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Term</label>
                            <select bind:value={batchForm.term} class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm">
                                <option value={1}>Term 1</option>
                                <option value={2}>Term 2</option>
                                <option value={3}>Term 3</option>
                                <option value={4}>Term 4</option>
                                <option value={5}>Term 5</option>
                                <option value={6}>Term 6</option>
                                <option value={7}>Term 7</option>
                                <option value={8}>Term 8</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Batch Start Year</label>
                            <input type="number" bind:value={batchForm.batch_start_year} class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Batch End Year</label>
                            <input type="number" bind:value={batchForm.batch_end_year} class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                        </div>
                    </div>
                </div>

                <!-- Sheet config -->
                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Google Sheet Connection</div>
                    <div class="space-y-3">
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Sheet ID</label>
                            <input bind:value={batchForm.sheet_id} placeholder="1TAhrH4303o81dqps1j-ZNYt1QjWHhfmY5gjwnz_2GBM" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono" />
                            <div class="text-[10px] text-slate-500 mt-1">
                                Paste from the URL: docs.google.com/spreadsheets/d/<span class="text-indigo-600 dark:text-indigo-400 font-bold">SHEET_ID</span>/edit · Sheet must be "Anyone with link can view".
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Userwise tab</label>
                                <input bind:value={batchForm.userwise_tab} placeholder="Userwise Data" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                            </div>
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Day-wise tab</label>
                                <input bind:value={batchForm.daywise_tab} placeholder="Day_Wise_Payments" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                            </div>
                            <div>
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Summary tab</label>
                                <input bind:value={batchForm.summary_tab} placeholder="Sheet1" class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm" />
                            </div>
                        </div>
                        <div>
                            <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Per-university tabs (one per line, optional)</label>
                            <textarea bind:value={batchForm.multi_tabs} rows="5" placeholder={'Aurora University\nCrescent University\nMalla Reddy\nTakshasila University\nSGU_Import\nMRV\namet term 2 & 3 userwise data'} class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono resize-y"></textarea>
                            <div class="text-[10px] text-slate-500 mt-1">If your sheet has one tab per university, list them here. The sync will import each and auto-create universities as needed.</div>
                        </div>
                    </div>
                </div>

                <!-- Auto-sync -->
                <div>
                    <div class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Auto-sync</div>
                    <div class="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                        <label class="flex items-start gap-3 cursor-pointer">
                            <input type="checkbox" bind:checked={batchForm.auto_sync_enabled} class="mt-1 w-4 h-4 rounded accent-indigo-600" />
                            <div class="flex-1">
                                <div class="text-sm font-bold text-slate-900 dark:text-white">Keep data in sync automatically</div>
                                <div class="text-xs text-slate-500 mt-0.5">A background worker will pull fresh data from the sheet on a fixed interval. Failures show a red banner here.</div>
                            </div>
                        </label>
                        {#if batchForm.auto_sync_enabled}
                            <div class="mt-3 pl-7">
                                <label class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Sync every</label>
                                <select bind:value={batchForm.auto_sync_interval_minutes} class="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm">
                                    <option value={5}>5 minutes</option>
                                    <option value={15}>15 minutes</option>
                                    <option value={30}>30 minutes (recommended)</option>
                                    <option value={60}>1 hour</option>
                                    <option value={180}>3 hours</option>
                                    <option value={360}>6 hours</option>
                                    <option value={1440}>Daily</option>
                                </select>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-800 dark:text-blue-300">
                    ℹ️ After saving, use the <strong>Sync Now</strong> button on the dashboard to run the first import. Then auto-sync (if enabled) takes over.
                </div>

                <div class="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-900 pb-1">
                    <button disabled={savingBatch} onclick={saveBatch} class="flex-1 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-md shadow-indigo-500/30">
                        {#if savingBatch}<Loader2 class="animate-spin" size={16} /> Saving…{:else}<CheckCircle2 size={16} /> {batchForm.id ? 'Save Changes' : 'Create Batch'}{/if}
                    </button>
                    <button onclick={() => showBatchModal = false} class="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">Cancel</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Toast -->
{#if successMsg}<div transition:fly={{ y: 20 }} class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-2xl">{successMsg}</div>{/if}
{#if errorMsg}<div transition:fly={{ y: 20 }} class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-rose-600 text-white text-sm font-bold shadow-2xl">{errorMsg}</div>{/if}

<style>
    :global(.tag-loan) { background: rgba(59,130,246,.15); color: #3b82f6; border-color: rgba(59,130,246,.3); }
    :global(.tag-dropout) { background: rgba(239,68,68,.15); color: #ef4444; border-color: rgba(239,68,68,.3); }
    :global(.tag-waiver) { background: rgba(245,158,11,.15); color: #f59e0b; border-color: rgba(245,158,11,.3); }
    :global(.tag-scholar) { background: rgba(16,185,129,.15); color: #10b981; border-color: rgba(16,185,129,.3); }
    :global(.tag-defer) { background: rgba(167,139,250,.15); color: #a78bfa; border-color: rgba(167,139,250,.3); }
    :global(.tag-other) { background: rgba(251,146,60,.15); color: #fb923c; border-color: rgba(251,146,60,.3); }
</style>
