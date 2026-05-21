<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Wallet, TrendingUp, AlertCircle, Building2, ArrowLeft, Loader2,
        Download, BarChart3, RefreshCw, ChevronRight, Users, Filter, Calendar
    } from 'lucide-svelte';

    let { data } = $props();

    // ─── Filter state ─────────────────────────────────────────────
    let activePeriodId = $state(data.activePeriod?.id || data.periods[0]?.id || '');
    let selectedUni = $state<string>('');
    let range = $state<'7d' | '30d' | '90d' | 'all'>('30d');
    let granularity = $state<'day' | 'month'>('day');

    // ─── Data ─────────────────────────────────────────────────────
    let analytics = $state<any>(null);
    let loading = $state(true);

    async function load() {
        if (!activePeriodId) return;
        loading = true;
        try {
            const q = new URLSearchParams({ period_id: activePeriodId, range });
            if (selectedUni) q.set('university_id', selectedUni);
            const res = await fetch(`/api/fees/analytics?${q}`);
            if (res.ok) analytics = await res.json();
        } catch (e) { console.error(e); }
        finally { loading = false; }
    }

    $effect(() => { if (activePeriodId) { range; selectedUni; load(); } });

    // ─── Helpers ──────────────────────────────────────────────────
    const TODAY = new Date().toISOString().slice(0, 10);
    function fmtInr(n: any): string {
        const num = Number(n) || 0;
        if (num >= 1e7) return '₹' + (num / 1e7).toFixed(2) + ' Cr';
        if (num >= 1e5) return '₹' + (num / 1e5).toFixed(2) + ' L';
        if (num >= 1e3) return '₹' + (num / 1e3).toFixed(1) + 'K';
        return '₹' + Math.round(num).toLocaleString('en-IN');
    }
    const num = (v: any) => Number(v) || 0;
    function fmtDate(d: any): string {
        if (!d) return '';
        try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
        catch { return String(d); }
    }
    function fmtDow(d: any): string {
        if (!d) return '';
        try { return new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }); }
        catch { return ''; }
    }
    function donutDash(p: number, r: number): string {
        const c = 2 * Math.PI * r;
        return `${(p / 100) * c} ${c}`;
    }
    // Efficiency cap — collection efficiency >100% is mathematically possible
    // (over-payment) but visually confusing. Always display capped at 100%.
    const eff100 = (v: any) => Math.min(100, num(v));

    // ─── Derived ──────────────────────────────────────────────────
    let s = $derived(analytics?.summary || {});
    let byUniv = $derived(analytics?.byUniv || []);
    let tagCounts = $derived(analytics?.tagCounts || []);
    let dailyTrend = $derived(analytics?.dailyTrend || []);
    let monthlyTrend = $derived(analytics?.monthlyTrend || []);
    let statusMix = $derived(analytics?.statusMix || []);
    let periodInfo = $derived(analytics?.period || {});

    let totalStudents = $derived(num(s.fully_paid) + num(s.partial_paid) + num(s.not_paid));
    let fullyPct = $derived(totalStudents > 0 ? Math.round((num(s.fully_paid) / totalStudents) * 100) : 0);
    let partialPct = $derived(totalStudents > 0 ? Math.round((num(s.partial_paid) / totalStudents) * 100) : 0);
    let notPaidPct = $derived(totalStudents > 0 ? Math.round((num(s.not_paid) / totalStudents) * 100) : 0);
    let avgEff = $derived(eff100(s.avg_efficiency));

    // Trend data
    let trendSeries = $derived(granularity === 'month'
        ? monthlyTrend.map((r: any) => ({ label: r.month, value: num(r.amount), count: num(r.students) }))
        : dailyTrend.map((r: any) => ({ label: r.date, value: num(r.amount), count: num(r.students) }))
    );
    let trendTotal = $derived(trendSeries.reduce((a: number, p: any) => a + p.value, 0));
    let trendStudents = $derived(trendSeries.reduce((a: number, p: any) => a + p.count, 0));
    let trendAvg = $derived(trendTotal / Math.max(1, trendSeries.length));
    let trendPeak = $derived(trendSeries.length ? trendSeries.reduce((a: any, b: any) => b.value > a.value ? b : a, trendSeries[0]) : null);
    let trendMaxV = $derived(Math.max(1, ...trendSeries.map((p: any) => p.value)));

    // Smooth bezier path
    function smoothPath(points: { x: number; y: number }[]): string {
        if (!points.length) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = i === 0 ? points[0] : points[i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i === points.length - 2 ? p2 : points[i + 2];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        }
        return d;
    }

    let trendPoints = $derived.by(() => {
        if (!trendSeries.length) return [] as Array<{ x: number; y: number }>;
        const n = trendSeries.length;
        return trendSeries.map((p: any, i: number) => ({
            x: (i + 0.5) * (100 / n),
            y: 100 - (p.value / trendMaxV) * 90,
        }));
    });
    let trendSmoothD = $derived(smoothPath(trendPoints));

    // Hover state for trend chart
    let hoverIdx = $state<number | null>(null);
    function onTrendMouseMove(e: MouseEvent) {
        if (!trendSeries.length) return;
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        hoverIdx = Math.min(trendSeries.length - 1, Math.max(0, Math.floor(pct * trendSeries.length)));
    }
    function onTrendMouseLeave() { hoverIdx = null; }

    // Today marker position
    let todayMarkerX = $derived.by(() => {
        if (granularity !== 'day' || !trendSeries.length) return null;
        const idx = trendSeries.findIndex((p: any) => p.label === TODAY);
        if (idx === -1) return null;
        return (idx + 0.5) * (100 / trendSeries.length);
    });

    // Status mix counts (donut)
    let statusByName = $derived.by(() => {
        const m: Record<string, number> = { 'Fully Paid': 0, 'Partially Paid': 0, 'Yet To Pay': 0 };
        for (const r of statusMix) m[r.status] = num(r.count);
        return m;
    });
    let statusTotal = $derived(statusByName['Fully Paid'] + statusByName['Partially Paid'] + statusByName['Yet To Pay']);
    let fullyDonutPct = $derived(statusTotal > 0 ? statusByName['Fully Paid'] / statusTotal * 100 : 0);
    let partialDonutPct = $derived(statusTotal > 0 ? statusByName['Partially Paid'] / statusTotal * 100 : 0);
    let fullyDashStart = $derived(donutDash(fullyDonutPct, 75).split(' ')[0]);

    // Sorted university table (default: by pending desc)
    let sortKey = $state<'pending' | 'paid' | 'efficiency' | 'strength' | 'name'>('pending');
    let sortDir = $state<'asc' | 'desc'>('desc');
    function toggleSort(k: typeof sortKey) {
        if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = 'desc'; }
    }
    let rangeIsWindow = $derived(range !== 'all');
    let sortedUniversities = $derived.by(() => {
        const arr = [...byUniv];
        const getter: Record<string, (u: any) => any> = {
            pending: u => num(u.pending),
            paid: u => rangeIsWindow ? num(u.paid_in_window) : num(u.paid),
            efficiency: u => eff100(u.collection_efficiency),
            strength: u => num(u.strength),
            name: u => String(u.university_name || '').toLowerCase(),
        };
        const g = getter[sortKey];
        arr.sort((a, b) => {
            const av = g(a), bv = g(b);
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return arr;
    });

    // Top movers (always sorted independently of table)
    let top5Efficient = $derived([...byUniv].sort((a: any, b: any) => eff100(b.collection_efficiency) - eff100(a.collection_efficiency)).slice(0, 5));
    let top5Pending = $derived([...byUniv].sort((a: any, b: any) => num(b.pending) - num(a.pending)).slice(0, 5));

    // Tags
    const TAG_COLORS: Record<string, string> = {
        loan: '#3b82f6', dropout: '#ef4444', waiver: '#f59e0b', scholar: '#10b981',
        defer: '#a78bfa', will_pay: '#fb923c', want_to_drop: '#ef4444',
        pending_payment: '#f59e0b', day_wise_followup: '#fb923c',
        applied_for_loan: '#3b82f6', other: '#94a3b8',
    };
    const TAG_LABELS: Record<string, string> = {
        loan: 'Loan Case', dropout: 'Dropout', waiver: 'Fee Waiver',
        scholar: 'Scholarship', defer: 'Deferral', will_pay: 'Will Pay',
        want_to_drop: 'Want to Drop', pending_payment: 'Pending Payment',
        day_wise_followup: 'Day-wise Follow-up', applied_for_loan: 'Applied for Loan',
        other: 'Other',
    };
    let tagTotal = $derived(tagCounts.reduce((a: number, t: any) => a + num(t.count), 0));

    onMount(() => { load(); });

    function exportCSV() {
        const head = 'University,Strength,Paid,Pending,Payable,Eff %,Fully,Partial,Not Paid\n';
        const rows = byUniv.map((u: any) =>
            `"${u.university_name}",${u.strength},${u.paid},${u.pending},${u.payable},${eff100(u.collection_efficiency).toFixed(1)},${u.fully_paid},${u.partial_paid},${u.not_paid}`
        ).join('\n');
        const blob = new Blob(['﻿' + head + rows], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `fee_analytics_${periodInfo.name?.replace(/\s+/g, '_') || 'period'}.csv`;
        a.click();
    }
</script>

<svelte:head><title>Fee Analytics · UniConnect</title></svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">

        <!-- ═══════ HEADER ═══════ -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
                <a href="/fee-collection" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors">
                    <ArrowLeft size={16} class="text-slate-600 dark:text-slate-300" />
                </a>
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <BarChart3 size={22} class="text-white" />
                </div>
                <div>
                    <h1 class="text-xl font-extrabold text-slate-900 dark:text-white">Fee Analytics</h1>
                    <div class="text-xs text-slate-500 mt-0.5">
                        {periodInfo.name || 'Loading…'}
                        {#if periodInfo.batch_start_year}· Batch {periodInfo.batch_start_year}-{String(periodInfo.batch_end_year).slice(-2)}{/if}
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                <button onclick={load} class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5">
                    <RefreshCw size={12} class={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button onclick={exportCSV} class="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/30">
                    <Download size={12} /> Export CSV
                </button>
            </div>
        </div>

        <!-- ═══════ FILTER BAR ═══════ -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-2">
                <Filter size={14} class="text-slate-400" />
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Filters</span>
            </div>

            <select bind:value={activePeriodId} onchange={load} class="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                {#each data.periods as p}
                    <option value={p.id}>{p.name}</option>
                {/each}
            </select>

            <select bind:value={selectedUni} class="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold max-w-[220px]">
                <option value="">All Universities</option>
                {#each byUniv as u}
                    <option value={u.university_id}>{u.university_name}</option>
                {/each}
            </select>

            <div class="flex items-center gap-0 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                {#each ['7d', '30d', '90d', 'all'] as r}
                    <button onclick={() => range = r as any}
                        class="px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors
                               {range === r ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}">
                        {r === 'all' ? 'All time' : r === '7d' ? 'Last 7d' : r === '30d' ? 'Last 30d' : 'Last 90d'}
                    </button>
                {/each}
            </div>

            <div class="flex-1"></div>
            {#if loading}<Loader2 size={14} class="animate-spin text-slate-400" />{/if}
        </div>

        <!-- ═══════ KPI STRIP ═══════ -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400"></div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Paid</div>
                <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">{fmtInr(s.total_paid)}</div>
                <div class="text-[10px] text-slate-400 mt-1">of {fmtInr(s.total_payable)}</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-orange-400"></div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pending</div>
                <div class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">{fmtInr(s.total_pending)}</div>
                <div class="text-[10px] text-slate-400 mt-1">to collect</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-400"></div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avg Efficiency</div>
                <div class="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">{avgEff.toFixed(1)}%</div>
                <div class="text-[10px] text-slate-400 mt-1">collection</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Universities</div>
                <div class="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-2">{s.universities || 0}</div>
                <div class="text-[10px] text-slate-400 mt-1">tracked</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fully Paid</div>
                <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">{(s.fully_paid || 0).toLocaleString()}</div>
                <div class="text-[10px] text-slate-400 mt-1">{fullyPct}% of {totalStudents.toLocaleString()}</div>
            </div>
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-pink-400"></div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Not Paid</div>
                <div class="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">{(s.not_paid || 0).toLocaleString()}</div>
                <div class="text-[10px] text-slate-400 mt-1">{(s.partial_paid || 0).toLocaleString()} partial</div>
            </div>
        </div>

        {#if loading && !analytics}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-20 text-center">
                <Loader2 size={32} class="inline animate-spin text-indigo-500" />
                <div class="text-sm text-slate-500 mt-3">Loading analytics…</div>
            </div>
        {:else}

        <!-- ═══════ COLLECTION TREND ═══════ -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div class="flex items-center justify-between flex-wrap gap-3 mb-1">
                <div>
                    <div class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar size={16} class="text-indigo-500" /> Collection Trend
                    </div>
                    <div class="text-xs text-slate-500 mt-1">
                        Total ₹ collected per {granularity === 'day' ? 'day' : 'month'}
                        {#if selectedUni}{@const sel = byUniv.find((u: any) => u.university_id === selectedUni)}{#if sel} · {sel.university_name} only{/if}{:else} · all universities{/if}
                        {#if range !== 'all'} · {range === '7d' ? 'last 7 days' : range === '30d' ? 'last 30 days' : 'last 90 days'}{:else} · all time{/if}
                    </div>
                </div>
                <div class="flex items-center gap-0 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                    {#each ['day', 'month'] as g}
                        <button onclick={() => granularity = g as any}
                            class="px-3 py-1 rounded-md text-[11px] font-bold transition-colors
                                   {granularity === g ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}">
                            {g === 'day' ? 'Daily' : 'Monthly'}
                        </button>
                    {/each}
                </div>
            </div>

            {#if !trendSeries.length}
                <div class="text-center py-16">
                    <Calendar size={32} class="inline text-slate-300 dark:text-slate-700" />
                    <div class="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No collection data in this window</div>
                    <div class="text-xs text-slate-500 mt-1">Try a wider range or run Sync Now from /fee-collection.</div>
                </div>
            {:else}
                <!-- Stats row above chart -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-4">
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total in window</div>
                        <div class="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{fmtInr(trendTotal)}</div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">{granularity === 'day' ? 'Daily' : 'Monthly'} average</div>
                        <div class="text-lg font-extrabold text-slate-900 dark:text-white mt-1">{fmtInr(trendAvg)}</div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Peak {granularity === 'day' ? 'day' : 'month'}</div>
                        <div class="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-1">{fmtInr(trendPeak?.value || 0)}</div>
                        <div class="text-[9px] text-slate-400 mt-0.5">{trendPeak ? (granularity === 'month' ? trendPeak.label : fmtDate(trendPeak.label)) : ''}</div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Students paid</div>
                        <div class="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-1">{trendStudents.toLocaleString()}</div>
                    </div>
                </div>

                <!-- Chart -->
                <div class="relative h-80 select-none"
                     onmousemove={onTrendMouseMove}
                     onmouseleave={onTrendMouseLeave}
                     role="presentation">
                    <!-- Y-axis grid + labels -->
                    <div class="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-400 pointer-events-none">
                        {#each [0, 0.25, 0.5, 0.75, 1] as p}
                            <div class="flex items-center gap-2">
                                <span class="w-14 text-right flex-shrink-0 font-mono">{fmtInr(trendMaxV * (1 - p))}</span>
                                <div class="flex-1 border-t border-dashed border-slate-200/60 dark:border-slate-700/60"></div>
                            </div>
                        {/each}
                    </div>
                    <!-- SVG chart -->
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 ml-16 w-[calc(100%-4rem)] h-full overflow-visible pointer-events-none">
                        <defs>
                            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#6366f1" stop-opacity="0.45" />
                                <stop offset="60%" stop-color="#a855f7" stop-opacity="0.15" />
                                <stop offset="100%" stop-color="#a855f7" stop-opacity="0" />
                            </linearGradient>
                            <linearGradient id="trendStroke" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stop-color="#6366f1" />
                                <stop offset="100%" stop-color="#a855f7" />
                            </linearGradient>
                        </defs>
                        {#if trendPoints.length}
                            <path d={`${trendSmoothD} L ${trendPoints[trendPoints.length - 1].x} 100 L ${trendPoints[0].x} 100 Z`} fill="url(#trendGrad)" />
                            <path d={trendSmoothD} fill="none" stroke="url(#trendStroke)" stroke-width="0.7" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
                            {#if todayMarkerX !== null}
                                <line x1={todayMarkerX} y1="0" x2={todayMarkerX} y2="100" stroke="#10b981" stroke-width="0.4" stroke-dasharray="2 1" vector-effect="non-scaling-stroke" />
                            {/if}
                            {#if hoverIdx !== null && trendPoints[hoverIdx]}
                                <line x1={trendPoints[hoverIdx].x} y1="0" x2={trendPoints[hoverIdx].x} y2="100" stroke="#6366f1" stroke-width="0.3" stroke-dasharray="1 1" vector-effect="non-scaling-stroke" />
                                <circle cx={trendPoints[hoverIdx].x} cy={trendPoints[hoverIdx].y} r="1.4" fill="#fff" stroke="#6366f1" stroke-width="0.7" vector-effect="non-scaling-stroke" />
                            {/if}
                        {/if}
                    </svg>
                    <!-- Hover tooltip -->
                    {#if hoverIdx !== null && trendSeries[hoverIdx]}
                        {@const hovered = trendSeries[hoverIdx]}
                        {@const leftPct = ((hoverIdx + 0.5) / trendSeries.length) * 100}
                        <div class="pointer-events-none absolute top-2 z-10"
                             style:left={`calc(4rem + ${leftPct}% * (100% - 4rem) / 100% - 90px)`}>
                            <div class="bg-slate-900 dark:bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-2xl min-w-[180px]">
                                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{granularity === 'month' ? hovered.label : fmtDate(hovered.label) + ' · ' + fmtDow(hovered.label)}</div>
                                <div class="text-lg font-extrabold text-emerald-400 mt-0.5">{fmtInr(hovered.value)}</div>
                                <div class="text-[10px] text-slate-300 mt-0.5">{hovered.count.toLocaleString()} student{hovered.count === 1 ? '' : 's'} paid</div>
                            </div>
                        </div>
                    {/if}
                </div>
                <!-- X-axis labels -->
                <div class="relative ml-16 h-4 mt-1 text-[10px] text-slate-400 font-mono">
                    {#each [0, 0.25, 0.5, 0.75, 1] as t}
                        {@const idx = Math.min(trendSeries.length - 1, Math.floor(t * (trendSeries.length - 1)))}
                        {#if trendSeries[idx]}
                            <span class="absolute" style:left={`${t * 100}%`} style:transform={t === 1 ? 'translateX(-100%)' : t === 0 ? '' : 'translateX(-50%)'}>
                                {granularity === 'month' ? trendSeries[idx].label : fmtDate(trendSeries[idx].label)}
                            </span>
                        {/if}
                    {/each}
                </div>
                {#if todayMarkerX !== null}
                    <div class="text-[10px] text-emerald-600 dark:text-emerald-400 mt-2 ml-16 flex items-center gap-1">
                        <span class="w-3 h-px bg-emerald-500"></span> Green dashed line marks today ({fmtDate(TODAY)})
                    </div>
                {/if}
                <div class="text-[10px] text-slate-400 mt-1 ml-16">💡 Hover the chart to see the exact amount and student count for any date.</div>
            {/if}
        </div>

        <!-- ═══════ STATUS DONUT + TOP MOVERS ═══════ -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <!-- Donut -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="text-sm font-extrabold text-slate-900 dark:text-white mb-1">Payment Status</div>
                <div class="text-xs text-slate-500 mb-4">Current state · {statusTotal.toLocaleString()} students</div>
                <div class="relative w-56 h-56 mx-auto mb-4">
                    <svg viewBox="0 0 200 200" class="w-full h-full -rotate-90">
                        <defs>
                            <linearGradient id="grFull" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stop-color="#10b981" /><stop offset="100%" stop-color="#14b8a6" />
                            </linearGradient>
                            <linearGradient id="grPartial" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stop-color="#f59e0b" /><stop offset="100%" stop-color="#f97316" />
                            </linearGradient>
                        </defs>
                        <circle cx="100" cy="100" r="75" fill="none" stroke="#e2e8f0" stroke-width="22" class="dark:stroke-slate-800" />
                        <circle cx="100" cy="100" r="75" fill="none" stroke="url(#grFull)" stroke-width="22"
                                stroke-dasharray={donutDash(fullyDonutPct, 75)} stroke-linecap="round" />
                        <circle cx="100" cy="100" r="75" fill="none" stroke="url(#grPartial)" stroke-width="22"
                                stroke-dasharray={donutDash(partialDonutPct, 75)}
                                stroke-dashoffset={-Number(fullyDashStart)} stroke-linecap="round" />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div class="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">{fullyPct}%</div>
                        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">fully paid</div>
                    </div>
                </div>
                <div class="space-y-2 text-xs">
                    <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500"></span>Fully Paid</span><span class="font-extrabold">{statusByName['Fully Paid'].toLocaleString()}</span></div>
                    <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-gradient-to-br from-amber-500 to-orange-500"></span>Partially Paid</span><span class="font-extrabold">{statusByName['Partially Paid'].toLocaleString()}</span></div>
                    <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></span>Yet to Pay</span><span class="font-extrabold">{statusByName['Yet To Pay'].toLocaleString()}</span></div>
                </div>
            </div>

            <!-- Top by efficiency -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="text-sm font-extrabold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <span class="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">↑</span>
                    Top Performers
                </div>
                <div class="text-xs text-slate-500 mb-4">Highest collection efficiency</div>
                <div class="space-y-3">
                    {#each top5Efficient as u, i}
                        {@const e = eff100(u.collection_efficiency)}
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-bold text-slate-900 dark:text-white truncate">{u.university_name}</div>
                                <div class="text-[10px] text-slate-400">{fmtInr(u.paid)} of {fmtInr(u.payable)}</div>
                            </div>
                            <div class="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{e.toFixed(1)}%</div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Needs attention -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="text-sm font-extrabold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <span class="w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs">!</span>
                    Needs Attention
                </div>
                <div class="text-xs text-slate-500 mb-4">Highest pending amounts</div>
                <div class="space-y-3">
                    {#each top5Pending as u, i}
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded-lg bg-rose-600 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                            <div class="flex-1 min-w-0">
                                <div class="text-xs font-bold text-slate-900 dark:text-white truncate">{u.university_name}</div>
                                <div class="text-[10px] text-slate-400">{u.not_paid} not paid · {u.partial_paid} partial</div>
                            </div>
                            <div class="text-sm font-extrabold text-rose-600 dark:text-rose-400">{fmtInr(u.pending)}</div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <!-- ═══════ UNIVERSITY TABLE ═══════ -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                    <div class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <Building2 size={16} class="text-blue-500" /> University Performance
                    </div>
                    <div class="text-xs text-slate-500 mt-1">All {byUniv.length} universities · click column headers to sort</div>
                </div>
                <div class="text-[10px] text-slate-400">Stacked bar: <span class="text-emerald-600 font-bold">paid</span> + <span class="text-rose-600 font-bold">pending</span> = total payable</div>
            </div>

            <!-- Header row -->
            <div class="grid grid-cols-12 gap-3 px-3 pb-2 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <button onclick={() => toggleSort('name')} class="col-span-3 text-left hover:text-indigo-600 dark:hover:text-indigo-400">
                    University {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button onclick={() => toggleSort('strength')} class="col-span-1 text-right hover:text-indigo-600 dark:hover:text-indigo-400">
                    Students {sortKey === 'strength' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <div class="col-span-5">Paid vs Pending</div>
                <button onclick={() => toggleSort('efficiency')} class="col-span-1 text-right hover:text-indigo-600 dark:hover:text-indigo-400">
                    Eff % {sortKey === 'efficiency' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button onclick={() => toggleSort('pending')} class="col-span-2 text-right hover:text-indigo-600 dark:hover:text-indigo-400">
                    Pending {sortKey === 'pending' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
            </div>

            <div class="divide-y divide-slate-100 dark:divide-slate-800">
                {#each sortedUniversities as u, i}
                    {@const e = eff100(u.collection_efficiency)}
                    {@const paidVal = rangeIsWindow ? num(u.paid_in_window) : num(u.paid)}
                    {@const pendingVal = num(u.pending)}
                    {@const totalVal = paidVal + pendingVal}
                    {@const paidPctOfTotal = totalVal > 0 ? (paidVal / totalVal) * 100 : 0}
                    {@const pendingPctOfTotal = totalVal > 0 ? (pendingVal / totalVal) * 100 : 0}
                    {@const effColor = e >= 95 ? 'text-emerald-600 dark:text-emerald-400' : e >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}
                    <div class="grid grid-cols-12 gap-3 px-3 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <div class="col-span-3 flex items-center gap-2 min-w-0">
                            <span class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <div class="min-w-0">
                                <div class="text-sm font-bold text-slate-900 dark:text-white truncate">{u.university_name}</div>
                                <div class="text-[10px] text-slate-400 truncate">{fmtInr(totalVal)} total</div>
                            </div>
                        </div>
                        <div class="col-span-1 text-right">
                            <div class="text-sm font-bold text-slate-900 dark:text-white">{num(u.strength).toLocaleString()}</div>
                            <div class="text-[10px] text-slate-400">{num(u.fully_paid)} ✓</div>
                        </div>
                        <div class="col-span-5">
                            <div class="flex items-center h-5 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800">
                                <div title={`Paid: ${fmtInr(paidVal)}`}
                                     class="h-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-end pr-1.5"
                                     style:width={`${paidPctOfTotal}%`}>
                                    {#if paidPctOfTotal > 25}<span class="text-[10px] font-extrabold text-white whitespace-nowrap">{fmtInr(paidVal)}</span>{/if}
                                </div>
                                <div title={`Pending: ${fmtInr(pendingVal)}`}
                                     class="h-full bg-gradient-to-r from-rose-500 to-pink-500 flex items-center justify-start pl-1.5"
                                     style:width={`${pendingPctOfTotal}%`}>
                                    {#if pendingPctOfTotal > 20}<span class="text-[10px] font-extrabold text-white whitespace-nowrap">{fmtInr(pendingVal)}</span>{/if}
                                </div>
                            </div>
                            <div class="flex justify-between text-[9px] text-slate-400 mt-1">
                                <span class="text-emerald-600 dark:text-emerald-400 font-bold">{paidPctOfTotal.toFixed(0)}% paid</span>
                                <span class="text-rose-600 dark:text-rose-400 font-bold">{pendingPctOfTotal.toFixed(0)}% pending</span>
                            </div>
                        </div>
                        <div class="col-span-1 text-right">
                            <div class={`text-sm font-extrabold ${effColor}`}>{e.toFixed(1)}%</div>
                            <div class="h-1 mt-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div class={`h-full rounded-full ${e >= 95 ? 'bg-emerald-500' : e >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`} style:width={`${e}%`}></div>
                            </div>
                        </div>
                        <div class="col-span-2 text-right">
                            <div class={`text-sm font-extrabold ${pendingVal > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmtInr(pendingVal)}</div>
                            <div class="text-[10px] text-slate-400">{num(u.not_paid) + num(u.partial_paid)} owe</div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- ═══════ CASE TAGS ═══════ -->
        {#if tagCounts.length}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <AlertCircle size={16} class="text-amber-500" /> Case Tags
                </div>
                <div class="text-xs text-slate-500 mt-1 mb-4">{tagTotal.toLocaleString()} tagged students · click a tag to filter the students table</div>
                <div class="space-y-3">
                    {#each tagCounts as t}
                        {@const tagPct = tagTotal > 0 ? (num(t.count) / tagTotal) * 100 : 0}
                        <a href={`/fee-collection?tag=${t.tag}`} class="block group">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="font-bold text-slate-900 dark:text-white flex items-center gap-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                    <span class="w-3 h-3 rounded-full" style:background={TAG_COLORS[t.tag] || '#94a3b8'}></span>
                                    {TAG_LABELS[t.tag] || t.tag}
                                    <ChevronRight size={10} class="text-slate-400" />
                                </span>
                                <span class="font-bold text-slate-600 dark:text-slate-300">{t.count} <span class="text-slate-400">({tagPct.toFixed(1)}%)</span></span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div class="h-full rounded-full" style:width={`${tagPct}%`} style:background={TAG_COLORS[t.tag] || '#94a3b8'}></div>
                            </div>
                        </a>
                    {/each}
                </div>
            </div>
        {/if}

        {/if}

        <!-- Footer -->
        <div class="text-center text-xs text-slate-400 py-4">
            Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · NxtWave Innovation in Advanced Technologies · UniConnect Fee Collection
        </div>
    </div>
</div>
