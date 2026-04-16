<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Calendar, ChevronLeft, ChevronRight, RefreshCw, Sparkles, Download, Mail,
        PlayCircle, Users, PhoneCall, UserCheck, GraduationCap,
        AlertTriangle, Megaphone, Wallet, Ticket, StickyNote, TrendingUp, Activity, ArrowLeft, FileText
    } from 'lucide-svelte';

    import Card from '$lib/components/ops/Card.svelte';
    import DeltaChip from '$lib/components/ops/DeltaChip.svelte';
    import RingKPI from '$lib/components/ops/RingKPI.svelte';
    import Donut from '$lib/components/ops/Donut.svelte';
    import BarRow from '$lib/components/ops/BarRow.svelte';
    import Sparkline from '$lib/components/ops/Sparkline.svelte';
    import TrendLine from '$lib/components/ops/TrendLine.svelte';
    import GroupedBars from '$lib/components/ops/GroupedBars.svelte';
    import AIInsightCard from '$lib/components/ops/AIInsightCard.svelte';
    import StatTile from '$lib/components/ops/StatTile.svelte';

    let { data } = $props();

    type Mode = 'daily' | 'weekly' | 'monthly';
    let mode = $state<Mode>('daily');
    let selectedDate = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(true);
    let loadError = $state('');

    let overview = $state<any>(null); // today, week, month, universities
    let rangeRows = $state<any[]>([]); // day-by-day rows for trend
    let universityRows = $state<any[]>([]); // per-university aggregated rows for current period
    let prevPeriod = $state<any>(null); // prev period summary for deltas
    let eventIntel = $state<any>(null); // for financials
    let taskPatterns = $state<any>(null); // for tickets
    let refreshing = $state(false);

    // ─── Helpers ──────────────────────────────────────────────────

    const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
    const num = (v: any) => (v === null || v === undefined ? 0 : Number(v) || 0);
    const delta = (cur: number, prev: number) => {
        if (prev === 0) return cur > 0 ? 100 : 0;
        return ((cur - prev) / prev) * 100;
    };

    function getWeekRange(dateStr: string) {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const start = new Date(d);
        start.setDate(diff);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return {
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        };
    }

    function getMonthRange(dateStr: string) {
        const d = new Date(dateStr);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        return { start, end };
    }

    function shiftDate(dateStr: string, days: number) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    function formatDateLabel(dateStr: string, m: Mode) {
        const d = new Date(dateStr);
        if (m === 'daily') {
            return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
        if (m === 'weekly') {
            const w = getWeekRange(dateStr);
            const s = new Date(w.start);
            const e = new Date(w.end);
            return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }

    // ─── Active summary & previous period ─────────────────────────

    const summary = $derived.by(() => {
        if (!overview) return null;
        if (mode === 'weekly') return overview.week;
        if (mode === 'monthly') return overview.month;
        return overview.today;
    });

    const kpis = $derived.by(() => {
        if (!summary) return { attendance: 0, completion: 0, engagement: 0 };
        const att = pct(num(summary.attended), num(summary.enrolled));
        const comp = pct(num(summary.sessions_completed), num(summary.sessions_planned));
        const callsTotal = num(summary.coach_calls) + num(summary.parent_calls);
        const target = Math.max(num(summary.enrolled) * 0.3, 10); // ~30% outreach target
        const eng = pct(callsTotal, target);
        return { attendance: att, completion: comp, engagement: eng };
    });

    const deltas = $derived.by(() => {
        if (!summary || !prevPeriod) return { attendance: null, completion: null, engagement: null };
        const a = pct(num(summary.attended), num(summary.enrolled));
        const pa = pct(num(prevPeriod.attended), num(prevPeriod.enrolled));
        const c = pct(num(summary.sessions_completed), num(summary.sessions_planned));
        const pc = pct(num(prevPeriod.sessions_completed), num(prevPeriod.sessions_planned));
        return {
            attendance: a - pa,
            completion: c - pc,
            engagement: delta(
                num(summary.coach_calls) + num(summary.parent_calls),
                num(prevPeriod.coach_calls) + num(prevPeriod.parent_calls)
            )
        };
    });

    const trendData = $derived.by(() => {
        if (!rangeRows || rangeRows.length === 0) return { labels: [], att: [], comp: [], cancelledByReason: [] };
        const byDate: Record<string, any> = {};
        for (const r of rangeRows) {
            const d = r.date;
            if (!byDate[d]) {
                byDate[d] = { enrolled: 0, attended: 0, planned: 0, completed: 0, cancelled: 0 };
            }
            byDate[d].enrolled += num(r.enrolled);
            byDate[d].attended += num(r.attended);
            byDate[d].planned += num(r.sessions_planned);
            byDate[d].completed += num(r.sessions_completed);
            byDate[d].cancelled += num(r.sessions_cancelled);
        }
        const dates = Object.keys(byDate).sort();
        const labels = dates.map((d) => {
            const dd = new Date(d);
            return mode === 'weekly'
                ? dd.toLocaleDateString('en-IN', { weekday: 'short' })
                : dd.toLocaleDateString('en-IN', { day: 'numeric' });
        });
        const att = dates.map((d) => Math.round(pct(byDate[d].attended, byDate[d].enrolled)));
        const comp = dates.map((d) => Math.round(pct(byDate[d].completed, byDate[d].planned)));
        return { labels, att, comp, dates };
    });

    const sessionSegments = $derived.by(() => {
        if (!summary) return [];
        return [
            { label: 'Completed', value: num(summary.sessions_completed), color: '#10b981' },
            { label: 'Cancelled', value: num(summary.sessions_cancelled), color: '#f43f5e' },
            { label: 'Remaining', value: Math.max(0, num(summary.sessions_planned) - num(summary.sessions_completed) - num(summary.sessions_cancelled)), color: '#a1a1aa' }
        ];
    });

    const attendanceTone = $derived.by(() => {
        const v = kpis.attendance;
        if (v >= 85) return 'good';
        if (v >= 75) return 'warn';
        return 'bad';
    });

    const riskPct = $derived.by(() => {
        if (!summary || !summary.enrolled) return 0;
        return pct(num(summary.at_risk_total), num(summary.enrolled));
    });

    // ─── Loaders ──────────────────────────────────────────────────

    async function fetchOverview(forDate: string) {
        const res = await fetch(`/api/ops?view=overview&date=${forDate}`);
        if (!res.ok) throw new Error(`Overview fetch failed: ${res.status}`);
        return res.json();
    }

    async function fetchRange(start: string, end: string) {
        const res = await fetch(`/api/ops?view=daily-reports&dateRange=${mode === 'monthly' ? 'month' : 'week'}&date=${selectedDate}`);
        if (!res.ok) return [];
        const j = await res.json();
        return j.reportData || [];
    }

    // Fetch per-university data WITH real metrics (enrolled/attended/at_risk/etc.)
    // Daily → uses /api/ops?view=sessions&date=X (today's per-univ rows from ops_daily_data)
    // Weekly/Monthly → view=sessions returns weekByUniversity aggregated fields
    async function fetchUniversityRows() {
        try {
            if (mode === 'daily') {
                // getOpsDailyByDate returns full rows with all stats — fetch via daily-reports
                const res = await fetch(`/api/ops?view=daily-reports&dateRange=today&date=${selectedDate}`);
                if (!res.ok) return [];
                const j = await res.json();
                return j.reportData || [];
            }
            const url = mode === 'weekly'
                ? `/api/ops?view=sessions&date=${selectedDate}`
                : `/api/ops?view=sessions&date=${selectedDate}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const j = await res.json();
            // weekByUniversity has aggregated enrolled/attended/at_risk_total
            if (mode === 'monthly') {
                // aggregate the full-month range into per-university totals
                const rangeRes = await fetch(`/api/ops?view=daily-reports&dateRange=month&date=${selectedDate}`);
                if (rangeRes.ok) {
                    const rd = (await rangeRes.json()).reportData || [];
                    const byUniv: Record<string, any> = {};
                    for (const r of rd) {
                        const key = r.university_name;
                        if (!byUniv[key]) {
                            byUniv[key] = {
                                university_name: key,
                                enrolled: 0, attended: 0,
                                sessions_planned: 0, sessions_completed: 0, sessions_cancelled: 0,
                                coach_calls: 0, parent_calls: 0,
                                at_risk_total: 0, at_risk_informed: 0,
                                events_planned: 0, events_executed: 0,
                                exams_planned: 0, exams_completed: 0,
                                remarks: r.remarks || r.cancellation_reason || ''
                            };
                        }
                        const b = byUniv[key];
                        b.enrolled += num(r.enrolled);
                        b.attended += num(r.attended);
                        b.sessions_planned += num(r.sessions_planned);
                        b.sessions_completed += num(r.sessions_completed);
                        b.sessions_cancelled += num(r.sessions_cancelled);
                        b.coach_calls += num(r.coach_calls);
                        b.parent_calls += num(r.parent_calls);
                        b.at_risk_total = Math.max(b.at_risk_total, num(r.at_risk_total));
                        b.at_risk_informed = Math.max(b.at_risk_informed, num(r.at_risk_informed));
                        b.events_planned += num(r.events_planned);
                        b.events_executed += num(r.events_executed);
                        b.exams_planned += num(r.exams_planned);
                        b.exams_completed += num(r.exams_completed);
                    }
                    return Object.values(byUniv);
                }
            }
            return j.weekByUniversity || j.todayByUniversity || [];
        } catch {
            return [];
        }
    }

    async function fetchPrev() {
        try {
            if (mode === 'daily') {
                const prev = shiftDate(selectedDate, -1);
                const r = await fetch(`/api/ops?view=overview&date=${prev}`);
                if (r.ok) {
                    const j = await r.json();
                    return j.today;
                }
            } else if (mode === 'weekly') {
                const prev = shiftDate(selectedDate, -7);
                const r = await fetch(`/api/ops?view=overview&date=${prev}`);
                if (r.ok) {
                    const j = await r.json();
                    return j.week;
                }
            } else {
                const d = new Date(selectedDate);
                d.setMonth(d.getMonth() - 1);
                const prev = d.toISOString().split('T')[0];
                const r = await fetch(`/api/ops?view=overview&date=${prev}`);
                if (r.ok) {
                    const j = await r.json();
                    return j.month;
                }
            }
        } catch {}
        return null;
    }

    async function fetchAux() {
        try {
            // event-intelligence + task-patterns both use the month containing `date`
            // on the server. For daily/weekly modes we still surface month-level aggregates,
            // which is fine for "budget efficiency" and "ticket SLA" cards.
            const [ei, tp] = await Promise.all([
                fetch(`/api/ops?view=event-intelligence&date=${selectedDate}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
                fetch(`/api/ops?view=task-patterns&date=${selectedDate}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
            ]);
            eventIntel = ei;
            taskPatterns = tp;
        } catch {}
    }

    async function load() {
        loading = true;
        loadError = '';
        try {
            const [ov, prev, univRows] = await Promise.all([
                fetchOverview(selectedDate),
                fetchPrev(),
                fetchUniversityRows()
            ]);
            overview = ov;
            prevPeriod = prev;
            universityRows = univRows;

            let start = selectedDate, end = selectedDate;
            if (mode === 'weekly') {
                const w = getWeekRange(selectedDate);
                start = w.start; end = w.end;
            } else if (mode === 'monthly') {
                const m = getMonthRange(selectedDate);
                start = m.start; end = m.end;
            }
            // Always fetch daily rows so remarks show up in every mode.
            rangeRows = mode === 'daily' ? univRows : await fetchRange(start, end);

            // aux (financials, tickets) — fire and forget
            fetchAux();
        } catch (e: any) {
            loadError = e?.message || 'Failed to load dashboard';
        } finally {
            loading = false;
        }
    }

    async function refresh() {
        refreshing = true;
        await load();
        refreshing = false;
    }

    onMount(() => { load(); });

    $effect(() => {
        mode; selectedDate;
        load();
    });

    // ─── Quick date navigation ──────────────────────────────────

    function stepDate(dir: 1 | -1) {
        if (mode === 'daily') {
            selectedDate = shiftDate(selectedDate, dir);
        } else if (mode === 'weekly') {
            selectedDate = shiftDate(selectedDate, 7 * dir);
        } else {
            const d = new Date(selectedDate);
            d.setMonth(d.getMonth() + dir);
            selectedDate = d.toISOString().split('T')[0];
        }
    }

    function today() { selectedDate = new Date().toISOString().split('T')[0]; }

    // ─── Universities: top performers for context ─────────────

    const topUniversities = $derived.by(() => {
        if (!universityRows || universityRows.length === 0) return [];
        // sort by attendance desc, limit 10
        return [...universityRows]
            .map((u: any) => ({
                ...u,
                _att: pct(num(u.attended), num(u.enrolled))
            }))
            .sort((a: any, b: any) => (b._att - a._att) || (num(b.enrolled) - num(a.enrolled)))
            .slice(0, 10);
    });

    // ─── Cancellation segments (from range if available, else summary) ─

    const cancelCount = $derived(num(summary?.sessions_cancelled));
    const instructorActivePct = $derived.by(() => {
        const t = num(summary?.instructors_total);
        const l = num(summary?.instructors_on_leave);
        return t > 0 ? ((t - l) / t) * 100 : 0;
    });

    // ─── Event intel derived ────────────────────────────────────

    const financials = $derived.by(() => {
        const a = eventIntel?.aggregates;
        if (!a) return null;
        return {
            events: a.totalEvents || 0,
            avgCost: a.avgCostPerParticipant || 0,
            utilization: a.avgBudgetUtilization || 0,
            attendanceAccuracy: a.avgAttendanceAccuracy || 0
        };
    });

    const ticketsData = $derived.by(() => {
        // getOpsTaskPatterns returns { patterns: [...], byTeam: [...] }. Roll up totals.
        const patterns = taskPatterns?.patterns as any[] | undefined;
        if (!patterns || patterns.length === 0) return null;
        let total = 0, completed = 0, overdue = 0;
        for (const p of patterns) {
            total += num(p.frequency);
            completed += num(p.completed_count);
            overdue += num(p.overdue_count);
        }
        const onTime = Math.max(0, completed - overdue);
        return { total, completed, onTime, late: overdue };
    });

    function openReportsHub() {
        let url = `/api/ops/view-report?type=${mode}`;
        if (mode === 'daily') {
            url += `&date=${selectedDate}`;
        } else if (mode === 'weekly') {
            const w = getWeekRange(selectedDate);
            url += `&weekStart=${w.start}&weekEnd=${w.end}`;
        } else {
            const d = new Date(selectedDate);
            url += `&year=${d.getFullYear()}&month=${d.getMonth() + 1}`;
        }
        window.open(url, '_blank');
    }
</script>

<svelte:head>
    <title>Ops Dashboard · v2</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-zinc-950">
    <!-- App bar -->
    <header class="sticky top-0 z-30 backdrop-blur-md bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/70 dark:border-zinc-800">
        <div class="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white">
                    <Activity size={14} />
                </div>
                <div class="min-w-0 hidden sm:block">
                    <h1 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate">UniConnect</h1>
                    <p class="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Ops</p>
                </div>
            </div>

            <!-- Primary tabs: Dashboard | Reports -->
            <div class="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 shadow-sm ml-2">
                <a
                    href="/ops-dashboard"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-all"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    <span>Dashboard</span>
                </a>
                <button
                    type="button"
                    class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-sm"
                    aria-current="page"
                >
                    <FileText size={13} />
                    <span>Reports</span>
                </button>
            </div>

            <div class="flex-1"></div>

            <!-- Mode pills -->
            <div class="inline-flex bg-zinc-100 dark:bg-zinc-900 rounded-xl p-0.5 text-xs font-medium border border-zinc-200 dark:border-zinc-800">
                {#each ['daily', 'weekly', 'monthly'] as m}
                    <button
                        onclick={() => (mode = m as Mode)}
                        class="px-3 py-1.5 rounded-lg transition-all capitalize
                               {mode === m
                                   ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                   : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}"
                    >
                        {m}
                    </button>
                {/each}
            </div>

            <!-- Date nav -->
            <div class="inline-flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-1 py-1">
                <button
                    onclick={() => stepDate(-1)}
                    class="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300"
                    aria-label="Previous"
                >
                    <ChevronLeft size={14} />
                </button>
                <div class="flex items-center gap-1.5 px-2">
                    <Calendar size={12} class="text-zinc-400" />
                    <input
                        type="date"
                        bind:value={selectedDate}
                        class="bg-transparent text-xs text-zinc-800 dark:text-zinc-100 border-0 focus:outline-none focus:ring-0 p-0 min-w-[120px]"
                    />
                </div>
                <button
                    onclick={() => stepDate(1)}
                    class="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300"
                    aria-label="Next"
                >
                    <ChevronRight size={14} />
                </button>
                <button
                    onclick={today}
                    class="text-[11px] font-medium px-2 py-1 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                >
                    Today
                </button>
            </div>

            <button
                onclick={refresh}
                disabled={refreshing}
                class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-xl
                       bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                       border border-zinc-200 dark:border-zinc-800
                       text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
                aria-label="Refresh"
            >
                <RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} />
                <span class="hidden md:inline">Refresh</span>
            </button>

            <button
                onclick={openReportsHub}
                class="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl
                       bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white
                       text-white dark:text-zinc-900 transition-colors capitalize"
            >
                <FileText size={13} />
                <span class="hidden md:inline">{mode} Report</span>
            </button>
        </div>

        <!-- Sub-header context bar -->
        <div class="max-w-[1440px] mx-auto px-4 md:px-8 pb-3 flex items-center gap-3 flex-wrap">
            <p class="text-sm text-zinc-600 dark:text-zinc-400">{formatDateLabel(selectedDate, mode)}</p>
            {#if overview?.universities?.length}
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {overview.universities.length} universities
                </span>
            {/if}
            {#if summary?.university_count}
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                    {summary.university_count} reporting
                </span>
            {/if}
        </div>
    </header>

    <main class="max-w-[1440px] mx-auto px-4 md:px-8 py-6">
        {#if loadError}
            <div class="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 px-4 py-3 text-sm mb-4">
                {loadError}
            </div>
        {/if}

        {#if loading && !summary}
            <div class="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                {#each Array(8) as _}
                    <div class="md:col-span-6 lg:col-span-4 h-48 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 animate-pulse"></div>
                {/each}
            </div>
        {:else if !summary}
            <div class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 p-10 text-center">
                <p class="text-zinc-500 dark:text-zinc-400 text-sm">No data available for this period.</p>
            </div>
        {:else}
            <!-- ── Reports quick-access ──────────────────────── -->
            <div class="mb-5 md:mb-6">
                <div class="flex items-center justify-between mb-2.5">
                    <div class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                        <FileText size={11} />
                        <span>Open full HTML report</span>
                    </div>
                    <span class="text-[11px] text-zinc-500 dark:text-zinc-400">Opens in new tab</span>
                </div>
                <div class="grid grid-cols-3 gap-2 md:gap-3">
                    {#each [
                        { m: 'daily', label: 'Daily', from: '#0ea5e9', to: '#6366f1', hint: 'Single-day snapshot' },
                        { m: 'weekly', label: 'Weekly', from: '#8b5cf6', to: '#ec4899', hint: '7-day trend' },
                        { m: 'monthly', label: 'Monthly', from: '#10b981', to: '#0ea5e9', hint: 'Strategic overview' }
                    ] as r}
                        {@const href = r.m === 'daily'
                            ? `/api/ops/view-report?type=daily&date=${selectedDate}`
                            : r.m === 'weekly'
                                ? (() => { const w = getWeekRange(selectedDate); return `/api/ops/view-report?type=weekly&weekStart=${w.start}&weekEnd=${w.end}`; })()
                                : (() => { const d = new Date(selectedDate); return `/api/ops/view-report?type=monthly&year=${d.getFullYear()}&month=${d.getMonth() + 1}`; })()}
                        <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            class="group relative overflow-hidden rounded-2xl p-4 md:p-5 text-white flex flex-col justify-between min-h-[88px] transition-all hover:scale-[1.01] hover:shadow-lg"
                            style="background: linear-gradient(135deg, {r.from}, {r.to});"
                        >
                            <div class="flex items-center justify-between">
                                <span class="text-[10px] md:text-[11px] uppercase tracking-wider font-bold opacity-90">{r.label}</span>
                                <FileText size={14} class="opacity-80" />
                            </div>
                            <div class="flex items-end justify-between mt-2">
                                <div>
                                    <div class="text-sm md:text-base font-bold leading-tight">Open {r.label} Report</div>
                                    <div class="text-[10px] md:text-[11px] opacity-80">{r.hint}</div>
                                </div>
                                <ChevronRight size={16} class="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                        </a>
                    {/each}
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                <!-- ── HERO RING KPI ─────────────────────────────── -->
                <Card className="md:col-span-12 lg:col-span-8">
                    {#snippet children()}
                        <div class="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
                            <div class="shrink-0 flex items-center justify-center">
                                <RingKPI
                                    size={240}
                                    rings={[
                                        { label: 'Attendance', value: kpis.attendance, color: '#10b981' },
                                        { label: 'Completion', value: kpis.completion, color: '#0ea5e9' },
                                        { label: 'Engagement', value: Math.min(100, kpis.engagement), color: '#8b5cf6' }
                                    ]}
                                    centerLabel="Attendance"
                                    centerValue={kpis.attendance.toFixed(1)}
                                />
                            </div>

                            <div class="flex-1 w-full flex flex-col gap-5">
                                <div class="flex items-center gap-3 flex-wrap">
                                    <span class="text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400">
                                        {mode === 'daily' ? 'Today' : mode === 'weekly' ? 'This week' : 'This month'}
                                    </span>
                                    {#if deltas.attendance !== null}
                                        <DeltaChip value={deltas.attendance} />
                                    {/if}
                                </div>
                                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <StatTile
                                        label="Enrolled"
                                        value={num(summary.enrolled)}
                                        hint={`${num(summary.attended)} attended`}
                                    />
                                    <StatTile
                                        label="Sessions"
                                        value={num(summary.sessions_completed)}
                                        suffix={`/${num(summary.sessions_planned)}`}
                                        delta={deltas.completion}
                                        hint={`${kpis.completion.toFixed(0)}% complete`}
                                    />
                                    <StatTile
                                        label="At-risk"
                                        value={num(summary.at_risk_total)}
                                        hint={`${num(summary.at_risk_informed)} informed`}
                                        tone={num(summary.at_risk_total) > 0 ? 'warn' : 'good'}
                                    />
                                </div>

                                <!-- Legend -->
                                <div class="flex flex-wrap gap-x-4 gap-y-2 text-[11px] pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                    <div class="flex items-center gap-1.5">
                                        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                        <span class="text-zinc-600 dark:text-zinc-400">Attendance {kpis.attendance.toFixed(1)}%</span>
                                    </div>
                                    <div class="flex items-center gap-1.5">
                                        <span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                                        <span class="text-zinc-600 dark:text-zinc-400">Completion {kpis.completion.toFixed(1)}%</span>
                                    </div>
                                    <div class="flex items-center gap-1.5">
                                        <span class="w-2.5 h-2.5 rounded-full bg-violet-500"></span>
                                        <span class="text-zinc-600 dark:text-zinc-400">Engagement {Math.min(100, kpis.engagement).toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/snippet}
                </Card>

                <!-- ── AI Copilot ─────────────────────────────── -->
                <div class="md:col-span-12 lg:col-span-4">
                    <AIInsightCard {mode} {summary} date={selectedDate} />
                </div>

                <!-- ── RISK ALERTS (FEATURED) ─────────────────── -->
                <div class="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <Card accent="rose">
                        {#snippet children()}
                            <div class="flex items-start gap-4">
                                <div class="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                                    <AlertTriangle size={20} />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <h3 class="text-sm font-semibold text-rose-900 dark:text-rose-200">Attendance risk</h3>
                                        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-medium">
                                            {riskPct.toFixed(0)}% of cohort
                                        </span>
                                    </div>
                                    <div class="text-3xl md:text-4xl font-bold text-rose-700 dark:text-rose-300 tabular-nums mt-1">
                                        {num(summary.at_risk_total)}
                                    </div>
                                    <p class="text-xs text-rose-700/80 dark:text-rose-300/80 mt-0.5">
                                        Students below 75% attendance this {mode === 'daily' ? 'day' : mode === 'weekly' ? 'week' : 'month'}
                                    </p>
                                    {#if num(summary.at_risk_total) > 0}
                                        <div class="mt-3">
                                            <BarRow
                                                bars={[
                                                    {
                                                        label: 'Informed',
                                                        value: num(summary.at_risk_informed),
                                                        color: '#f43f5e',
                                                        hint: `of ${num(summary.at_risk_total)}`
                                                    },
                                                    {
                                                        label: 'Acknowledged',
                                                        value: num(summary.acknowledgments),
                                                        color: '#fb923c',
                                                        hint: `of ${num(summary.at_risk_total)}`
                                                    }
                                                ]}
                                                max={num(summary.at_risk_total)}
                                            />
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/snippet}
                    </Card>

                    <Card accent="amber">
                        {#snippet children()}
                            <div class="flex items-start gap-4">
                                <div class="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                                    <GraduationCap size={20} />
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-sm font-semibold text-amber-900 dark:text-amber-200">Cancellations & gaps</h3>
                                    <div class="text-3xl md:text-4xl font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-1">
                                        {cancelCount}
                                    </div>
                                    <p class="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                                        Sessions cancelled · {num(summary.events_cancelled || 0)} events cancelled
                                    </p>
                                    <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-900/40">
                                        <div>
                                            <div class="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-300/70 font-medium">Instructors on leave</div>
                                            <div class="text-lg font-bold text-amber-800 dark:text-amber-200 tabular-nums">
                                                {num(summary.instructors_on_leave)}<span class="text-amber-600 dark:text-amber-400 text-xs ml-1 font-medium">of {num(summary.instructors_total)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div class="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-300/70 font-medium">Active %</div>
                                            <div class="text-lg font-bold text-amber-800 dark:text-amber-200 tabular-nums">
                                                {instructorActivePct.toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/snippet}
                    </Card>
                </div>

                <!-- ── TREND LINE (weekly/monthly) ─────────────── -->
                {#if mode !== 'daily' && trendData.labels.length > 0}
                    <Card title="Attendance & completion trend" subtitle={mode === 'weekly' ? 'Day-by-day this week' : 'Day-by-day this month'} className="md:col-span-12">
                        {#snippet icon()}
                            <TrendingUp size={14} />
                        {/snippet}
                        {#snippet children()}
                            <TrendLine
                                series={[
                                    { name: 'Attendance %', points: trendData.att, color: '#10b981' },
                                    { name: 'Completion %', points: trendData.comp, color: '#0ea5e9' }
                                ]}
                                labels={trendData.labels}
                                height={200}
                            />
                        {/snippet}
                    </Card>
                {/if}

                <!-- ── SESSIONS ─────────────────────────────── -->
                <Card title="Sessions" subtitle="Planned · Completed · Cancelled" className="md:col-span-6 lg:col-span-4">
                    {#snippet icon()}
                        <PlayCircle size={14} />
                    {/snippet}
                    {#snippet children()}
                        <Donut
                            segments={sessionSegments}
                            centerValue={num(summary.sessions_planned)}
                            centerLabel="Planned"
                        />
                        {#if cancelCount > 0 && summary.cancellation_reason}
                            <div class="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                <div class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium mb-1">Top cancellation reason</div>
                                <p class="text-xs text-zinc-700 dark:text-zinc-200">{summary.cancellation_reason}</p>
                            </div>
                        {/if}
                    {/snippet}
                </Card>

                <!-- ── STUDENTS ─────────────────────────────── -->
                <Card title="Student metrics" subtitle="Enrolled vs attended" className="md:col-span-6 lg:col-span-4">
                    {#snippet icon()}
                        <Users size={14} />
                    {/snippet}
                    {#snippet children()}
                        <BarRow
                            bars={[
                                { label: 'Enrolled', value: num(summary.enrolled), color: '#6366f1' },
                                { label: 'Attended', value: num(summary.attended), color: '#10b981', hint: `${kpis.attendance.toFixed(1)}%` },
                                { label: 'Absent', value: Math.max(0, num(summary.enrolled) - num(summary.attended)), color: '#f43f5e' }
                            ]}
                        />
                        {#if mode !== 'daily' && trendData.att.length > 0}
                            <div class="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">Attendance trend</span>
                                    <DeltaChip value={deltas.attendance} size="xs" />
                                </div>
                                <Sparkline points={trendData.att} color="#10b981" width={260} height={40} />
                            </div>
                        {/if}
                    {/snippet}
                </Card>

                <!-- ── ENGAGEMENT (coach calls) ────────────────── -->
                <Card title="Success coach engagement" subtitle="Student & parent outreach" className="md:col-span-6 lg:col-span-4">
                    {#snippet icon()}
                        <PhoneCall size={14} />
                    {/snippet}
                    {#snippet children()}
                        <GroupedBars
                            groups={['Calls']}
                            series={[
                                { name: 'Student', values: [num(summary.coach_calls)], color: '#0ea5e9' },
                                { name: 'Parent', values: [num(summary.parent_calls)], color: '#8b5cf6' }
                            ]}
                        />
                        <div class="grid grid-cols-2 gap-3 text-center pt-2">
                            <div>
                                <div class="text-2xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">{num(summary.coach_calls)}</div>
                                <div class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">Student calls</div>
                            </div>
                            <div>
                                <div class="text-2xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">{num(summary.parent_calls)}</div>
                                <div class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">Parent calls</div>
                            </div>
                        </div>
                    {/snippet}
                </Card>

                <!-- ── INSTRUCTORS ─────────────────────────────── -->
                <Card title="Instructors" subtitle="Workforce availability" className="md:col-span-6 lg:col-span-3">
                    {#snippet icon()}
                        <UserCheck size={14} />
                    {/snippet}
                    {#snippet children()}
                        <div class="grid grid-cols-3 gap-3">
                            <StatTile label="Total" value={num(summary.instructors_total)} />
                            <StatTile label="On leave" value={num(summary.instructors_on_leave)} tone={num(summary.instructors_on_leave) > 0 ? 'warn' : 'default'} />
                            <StatTile
                                label="Active"
                                value={Math.max(0, num(summary.instructors_total) - num(summary.instructors_on_leave))}
                                tone="good"
                            />
                        </div>
                        <div class="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            <BarRow
                                bars={[
                                    { label: 'Availability', value: Math.round(instructorActivePct), color: '#10b981', hint: '%' }
                                ]}
                                max={100}
                            />
                        </div>
                    {/snippet}
                </Card>

                <!-- ── EVENTS & EXAMS ─────────────────────────── -->
                <Card title="Events & Exams" subtitle="Planned vs completed" className="md:col-span-6 lg:col-span-5">
                    {#snippet icon()}
                        <Calendar size={14} />
                    {/snippet}
                    {#snippet children()}
                        <GroupedBars
                            groups={['Events', 'Exams']}
                            series={[
                                {
                                    name: 'Planned',
                                    values: [num(summary.events_planned), num(summary.exams_planned)],
                                    color: '#94a3b8'
                                },
                                {
                                    name: 'Completed',
                                    values: [num(summary.events_executed), num(summary.exams_completed)],
                                    color: '#10b981'
                                },
                                {
                                    name: 'Cancelled',
                                    values: [num(summary.events_cancelled), 0],
                                    color: '#f43f5e'
                                }
                            ]}
                        />
                        <div class="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div>
                                <div class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">Post-exam comms</div>
                                <div class="text-xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">
                                    {num(summary.post_exam_comms_sent)}
                                </div>
                            </div>
                            <div>
                                <div class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-medium">Completion rate</div>
                                <div class="text-xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">
                                    {num(summary.exams_planned) > 0 ? Math.round(pct(num(summary.exams_completed), num(summary.exams_planned))) : 0}%
                                </div>
                            </div>
                        </div>
                    {/snippet}
                </Card>

                <!-- ── ACTIONS TAKEN ─────────────────────────── -->
                <Card title="Actions taken" subtitle="Follow-through on risk" className="md:col-span-6 lg:col-span-4">
                    {#snippet icon()}
                        <Megaphone size={14} />
                    {/snippet}
                    {#snippet children()}
                        <BarRow
                            bars={[
                                {
                                    label: 'Students informed',
                                    value: num(summary.at_risk_informed),
                                    color: '#0ea5e9',
                                    hint: num(summary.at_risk_total) > 0 ? `${Math.round(pct(num(summary.at_risk_informed), num(summary.at_risk_total)))}%` : ''
                                },
                                {
                                    label: 'Parents contacted',
                                    value: num(summary.parent_calls),
                                    color: '#8b5cf6'
                                },
                                {
                                    label: 'Acknowledgments',
                                    value: num(summary.acknowledgments),
                                    color: '#10b981'
                                }
                            ]}
                        />
                    {/snippet}
                </Card>

                <!-- ── FINANCIALS (weekly/monthly only) ───────── -->
                {#if mode !== 'daily'}
                    <Card title="Financials" subtitle="Event budget efficiency" className="md:col-span-6 lg:col-span-6">
                        {#snippet icon()}
                            <Wallet size={14} />
                        {/snippet}
                        {#snippet children()}
                            {#if financials}
                                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatTile label="Events" value={financials.events} />
                                    <StatTile label="Avg cost / person" value={`₹${financials.avgCost}`} />
                                    <StatTile
                                        label="Budget used"
                                        value={`${financials.utilization}%`}
                                        tone={financials.utilization > 100 ? 'bad' : financials.utilization > 85 ? 'warn' : 'good'}
                                    />
                                    <StatTile
                                        label="Attendance acc."
                                        value={`${financials.attendanceAccuracy}%`}
                                        tone={financials.attendanceAccuracy >= 85 ? 'good' : financials.attendanceAccuracy >= 70 ? 'warn' : 'bad'}
                                    />
                                </div>
                                <div class="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                    <BarRow
                                        bars={[
                                            { label: 'Budget utilization', value: financials.utilization, color: financials.utilization > 100 ? '#f43f5e' : '#0ea5e9', hint: '%' },
                                            { label: 'Attendance accuracy', value: financials.attendanceAccuracy, color: '#10b981', hint: '%' }
                                        ]}
                                        max={Math.max(100, financials.utilization)}
                                    />
                                </div>
                            {:else}
                                <p class="text-xs text-zinc-500 dark:text-zinc-400">No event budget data for this period.</p>
                            {/if}
                        {/snippet}
                    </Card>
                {/if}

                <!-- ── TICKETS / OPS TASKS ───────────────────── -->
                <Card title="Tickets & operations" subtitle="Task SLA & delivery" className="md:col-span-6 lg:col-span-6">
                    {#snippet icon()}
                        <Ticket size={14} />
                    {/snippet}
                    {#snippet children()}
                        {#if ticketsData}
                            <div class="grid grid-cols-4 gap-3">
                                <StatTile label="Total" value={ticketsData.total} />
                                <StatTile label="Completed" value={ticketsData.completed} tone="good" />
                                <StatTile label="On-time" value={ticketsData.onTime} tone="good" />
                                <StatTile label="Late" value={ticketsData.late} tone={ticketsData.late > 0 ? 'bad' : 'default'} />
                            </div>
                            {#if ticketsData.total > 0}
                                <div class="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                    <BarRow
                                        bars={[
                                            { label: 'SLA met', value: Math.round(pct(ticketsData.onTime, ticketsData.total)), color: '#10b981', hint: '%' },
                                            { label: 'Completion', value: Math.round(pct(ticketsData.completed, ticketsData.total)), color: '#0ea5e9', hint: '%' }
                                        ]}
                                        max={100}
                                    />
                                </div>
                            {/if}
                        {:else}
                            <p class="text-xs text-zinc-500 dark:text-zinc-400">No task data available.</p>
                        {/if}
                    {/snippet}
                </Card>

                <!-- ── REMARKS ───────────────────────────────── -->
                <Card title="Remarks" subtitle="Qualitative notes from the field" className="md:col-span-12">
                    {#snippet icon()}
                        <StickyNote size={14} />
                    {/snippet}
                    {#snippet children()}
                        {@const remarkRows = (rangeRows || [])
                            .map((r: any) => ({ ...r, _note: r.remarks || r.cancellation_reason || '' }))
                            .filter((r: any) => r._note && String(r._note).trim().length > 0)}
                        {#if remarkRows.length > 0}
                            <ul class="flex flex-col gap-3">
                                {#each remarkRows.slice(0, 8) as row}
                                    <li class="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                                        <div class="w-9 h-9 rounded-lg bg-white dark:bg-zinc-900 text-xs font-semibold flex items-center justify-center text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 shrink-0">
                                            {row.date ? new Date(row.date).getDate() : '—'}
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <span class="text-xs font-medium text-zinc-900 dark:text-zinc-100">{row.university_name || '—'}</span>
                                                {#if row.date}
                                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                                                        {new Date(row.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                {/if}
                                                {#if row.cancellation_reason && !row.remarks}
                                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium">Cancellation reason</span>
                                                {/if}
                                            </div>
                                            <p class="text-sm text-zinc-700 dark:text-zinc-300 mt-1">{row._note}</p>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        {:else if summary?.remarks}
                            <p class="text-sm text-zinc-700 dark:text-zinc-300">{summary.remarks}</p>
                        {:else}
                            <p class="text-xs text-zinc-500 dark:text-zinc-400 italic">No remarks logged for this period.</p>
                        {/if}
                    {/snippet}
                </Card>

                <!-- ── UNIVERSITIES RANKING (monthly emphasis) ─ -->
                {#if topUniversities.length > 0}
                    <Card title="Universities" subtitle="Top contributors this period" className="md:col-span-12">
                        {#snippet icon()}
                            <GraduationCap size={14} />
                        {/snippet}
                        {#snippet children()}
                            <div class="overflow-x-auto -mx-2 px-2">
                                <table class="w-full text-sm">
                                    <thead>
                                        <tr class="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                                            <th class="text-left py-2 font-semibold">University</th>
                                            <th class="text-right py-2 font-semibold">Sessions</th>
                                            <th class="text-right py-2 font-semibold hidden md:table-cell">Enrolled</th>
                                            <th class="text-right py-2 font-semibold hidden md:table-cell">Attended</th>
                                            <th class="text-right py-2 font-semibold">Attendance</th>
                                            <th class="text-right py-2 font-semibold">At-risk</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each topUniversities as u}
                                            {@const uEnrolled = num(u.enrolled)}
                                            {@const uAttended = num(u.attended)}
                                            {@const uAtt = pct(uAttended, uEnrolled)}
                                            {@const uSessComp = pct(num(u.sessions_completed), num(u.sessions_planned))}
                                            {@const uTone = uAtt >= 85 ? 'text-emerald-600 dark:text-emerald-400' : uAtt >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}
                                            <tr class="border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <td class="py-2.5 text-zinc-900 dark:text-zinc-100 font-medium">{u.university_name || '—'}</td>
                                                <td class="py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                                                    {num(u.sessions_completed)}<span class="text-zinc-400">/{num(u.sessions_planned)}</span>
                                                </td>
                                                <td class="py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400 hidden md:table-cell">{uEnrolled}</td>
                                                <td class="py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400 hidden md:table-cell">{uAttended}</td>
                                                <td class="py-2.5 text-right tabular-nums font-semibold {uTone}">
                                                    {uEnrolled > 0 ? uAtt.toFixed(1) + '%' : '—'}
                                                </td>
                                                <td class="py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400 font-semibold">{num(u.at_risk_total) || '—'}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {/snippet}
                    </Card>
                {/if}
            </div>

            <!-- Footer -->
            <footer class="mt-8 pt-4 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap gap-2">
                <div class="flex items-center gap-1.5">
                    <Sparkles size={11} />
                    <span>Ops Dashboard v2 · showing {mode} view</span>
                </div>
                <div>
                    Data refreshed · {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </footer>
        {/if}
    </main>
</div>

<style>
    :global(input[type='date']::-webkit-calendar-picker-indicator) {
        filter: invert(0.5);
        cursor: pointer;
    }
    :global(.dark input[type='date']::-webkit-calendar-picker-indicator) {
        filter: invert(0.7);
    }
</style>
