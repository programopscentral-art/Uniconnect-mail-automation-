<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import {
        Wallet, TrendingUp, AlertCircle, Building2, ArrowLeft, Loader2,
        Download, BarChart3, PieChart as PieIcon, LineChart, GitCompare,
        Calendar, Filter, RefreshCw, ChevronRight, Users
    } from 'lucide-svelte';

    let { data } = $props();

    // ─── Filter state ─────────────────────────────────────────────
    let activePeriodId = $state(data.activePeriod?.id || data.periods[0]?.id || '');
    let selectedUni = $state<string>('');               // '' = all
    let range = $state<'7d' | '30d' | '90d' | 'all'>('30d');
    type View = 'overview' | 'trend' | 'comparison' | 'distribution' | 'cases';
    let view = $state<View>('overview');
    let granularity = $state<'day' | 'month'>('day');
    let rankMetric = $state<'pending' | 'paid' | 'efficiency' | 'strength'>('pending');

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

    $effect(() => {
        if (activePeriodId) { range; selectedUni; load(); }
    });

    // ─── Helpers ──────────────────────────────────────────────────
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
    function donutDash(p: number, r: number): string {
        const c = 2 * Math.PI * r;
        return `${(p / 100) * c} ${c}`;
    }

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
    let eff = $derived(Number(s.avg_efficiency || 0));

    let sortedByEff = $derived([...byUniv].sort((a: any, b: any) => num(b.collection_efficiency) - num(a.collection_efficiency)));
    let top5 = $derived(sortedByEff.slice(0, 5));
    let bottom5 = $derived([...sortedByEff].reverse().slice(0, 5));
    let bottomByPend = $derived([...byUniv].sort((a: any, b: any) => num(b.pending) - num(a.pending)).slice(0, 8));
    let maxPending = $derived(Math.max(1, ...bottomByPend.map((u: any) => num(u.pending))));

    // Trend view stats
    let trendAvg = $derived(trendTotal / Math.max(1, trendSeries.length));
    let trendPeak = $derived(trendSeries.length ? trendSeries.reduce((a: any, b: any) => b.value > a.value ? b : a, trendSeries[0]) : null);
    let trendMaxV = $derived(Math.max(1, ...trendSeries.map((p: any) => p.value)));

    // Comparison view
    let isPct = $derived(rankMetric === 'efficiency');
    let metricValOf = (u: any) => rankMetric === 'pending' ? num(u.pending) :
                                  rankMetric === 'paid' ? num(u.paid) :
                                  rankMetric === 'efficiency' ? num(u.collection_efficiency) :
                                  num(u.strength);
    let maxBar = $derived(Math.max(1, ...rankedByMetric.map((u: any) => metricValOf(u))));
    const COLOR_BY_METRIC: Record<string, string> = {
        pending: 'from-rose-500 to-pink-600',
        paid: 'from-emerald-500 to-teal-600',
        efficiency: 'from-indigo-500 to-purple-600',
        strength: 'from-blue-500 to-cyan-600',
    };

    // Distribution donut percentages
    let fullyDonutPct = $derived(statusTotal > 0 ? statusByName['Fully Paid'] / statusTotal * 100 : 0);
    let partialDonutPct = $derived(statusTotal > 0 ? statusByName['Partially Paid'] / statusTotal * 100 : 0);
    let fullyDonutOffset = $derived(donutDash(fullyDonutPct, 75).split(' ')[0]);

    // Trend data series
    let trendSeries = $derived(granularity === 'month'
        ? monthlyTrend.map((r: any) => ({ label: r.month, value: num(r.amount), count: num(r.students) }))
        : dailyTrend.map((r: any) => ({ label: r.date, value: num(r.amount), count: num(r.students) }))
    );
    let trendTotal = $derived(trendSeries.reduce((acc: number, p: any) => acc + p.value, 0));
    let trendStudents = $derived(trendSeries.reduce((acc: number, p: any) => acc + p.count, 0));

    // Ranking for Comparison view
    let rankedByMetric = $derived.by(() => {
        const arr = [...byUniv];
        const getter: Record<string, (u: any) => number> = {
            pending: u => num(u.pending),
            paid: u => num(u.paid),
            efficiency: u => num(u.collection_efficiency),
            strength: u => num(u.strength),
        };
        arr.sort((a, b) => getter[rankMetric](b) - getter[rankMetric](a));
        return arr;
    });

    // Status mix counts (for distribution donut)
    let statusByName = $derived.by(() => {
        const m: Record<string, number> = { 'Fully Paid': 0, 'Partially Paid': 0, 'Yet To Pay': 0 };
        for (const r of statusMix) m[r.status] = num(r.count);
        return m;
    });
    let statusTotal = $derived(statusByName['Fully Paid'] + statusByName['Partially Paid'] + statusByName['Yet To Pay']);

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
            `"${u.university_name}",${u.strength},${u.paid},${u.pending},${u.payable},${u.collection_efficiency},${u.fully_paid},${u.partial_paid},${u.not_paid}`
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

            <select bind:value={selectedUni} class="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold max-w-[200px]">
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
                        {r === 'all' ? 'All time' : r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'Last 90 days'}
                    </button>
                {/each}
            </div>

            {#if selectedUni}
                {@const sel = byUniv.find((u: any) => u.university_id === selectedUni)}
                {#if sel}
                    <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                        <Building2 size={11} /> {sel.university_name}
                        <button onclick={() => selectedUni = ''} class="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100">✕</button>
                    </div>
                {/if}
            {/if}

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
                <div class="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">{eff.toFixed(1)}%</div>
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

        <!-- ═══════ VIEW TABS ═══════ -->
        <div class="flex gap-1 p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-x-auto">
            {#each [
                { id: 'overview', label: 'Overview', icon: TrendingUp },
                { id: 'trend', label: 'Trend', icon: LineChart },
                { id: 'comparison', label: 'Comparison', icon: GitCompare },
                { id: 'distribution', label: 'Distribution', icon: PieIcon },
                { id: 'cases', label: 'Cases', icon: AlertCircle },
            ] as v}
                {@const Icon = v.icon}
                <button onclick={() => view = v.id as View}
                    class="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all
                           {view === v.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                    <Icon size={14} /> {v.label}
                </button>
            {/each}
        </div>

        <!-- ═══════ CONTENT ═══════ -->
        {#if loading && !analytics}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl py-20 text-center">
                <Loader2 size={32} class="inline animate-spin text-indigo-500" />
                <div class="text-sm text-slate-500 mt-3">Loading analytics…</div>
            </div>

        <!-- OVERVIEW -->
        {:else if view === 'overview'}
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <!-- Left: trend chart -->
                <div class="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <div class="text-sm font-bold text-slate-900 dark:text-white">Collection Trend</div>
                            <div class="text-xs text-slate-500 mt-0.5">{trendSeries.length} {granularity === 'month' ? 'months' : 'days'} · {trendStudents.toLocaleString()} students</div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{fmtInr(trendTotal)}</div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-wider">in window</div>
                        </div>
                    </div>
                    {#if !trendSeries.length}
                        <div class="text-center py-12">
                            <div class="text-sm font-bold text-slate-700 dark:text-slate-300">No transaction data in this window</div>
                            <div class="text-xs text-slate-500 mt-1">Try widening the range or run a sync of the day-wise sheet.</div>
                        </div>
                    {:else}
                        {@const maxV = Math.max(1, ...trendSeries.map((p: any) => p.value))}
                        {@const w = 100 / Math.max(trendSeries.length, 1)}
                        <div class="relative h-56">
                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-full">
                                <defs>
                                    <linearGradient id="ovGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.5" />
                                        <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
                                    </linearGradient>
                                </defs>
                                <path d={`M 0 100 ${trendSeries.map((p: any, i: number) => `L ${i * w + w/2} ${100 - (p.value / maxV) * 90}`).join(' ')} L 100 100 Z`} fill="url(#ovGrad)" />
                                <polyline points={trendSeries.map((p: any, i: number) => `${i * w + w/2},${100 - (p.value / maxV) * 90}`).join(' ')} fill="none" stroke="#6366f1" stroke-width="0.8" vector-effect="non-scaling-stroke" />
                            </svg>
                        </div>
                        <div class="flex justify-between text-[10px] text-slate-400 mt-2">
                            <span>{trendSeries[0]?.label}</span>
                            <span>{trendSeries[trendSeries.length - 1]?.label}</span>
                        </div>
                    {/if}
                </div>

                <!-- Right: payment status mini-donut -->
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="text-sm font-bold text-slate-900 dark:text-white mb-4">Payment Status</div>
                    <div class="flex items-center justify-center mb-4">
                        <svg viewBox="0 0 120 120" class="w-40 h-40 -rotate-90">
                            <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" stroke-width="14" class="dark:stroke-slate-800" />
                            <!-- Fully -->
                            <circle cx="60" cy="60" r="45" fill="none" stroke="#10b981" stroke-width="14"
                                    stroke-dasharray={donutDash(fullyPct, 45)} stroke-dashoffset="0" stroke-linecap="round" />
                            <!-- Partial -->
                            <circle cx="60" cy="60" r="45" fill="none" stroke="#f59e0b" stroke-width="14"
                                    stroke-dasharray={donutDash(partialPct, 45)} stroke-dashoffset={-donutDash(fullyPct, 45).split(' ')[0]} stroke-linecap="round" />
                        </svg>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="flex justify-between"><span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-500"></span>Fully Paid</span><span class="font-bold">{(s.fully_paid || 0).toLocaleString()} ({fullyPct}%)</span></div>
                        <div class="flex justify-between"><span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span>Partial</span><span class="font-bold">{(s.partial_paid || 0).toLocaleString()} ({partialPct}%)</span></div>
                        <div class="flex justify-between"><span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></span>Yet to Pay</span><span class="font-bold">{(s.not_paid || 0).toLocaleString()} ({notPaidPct}%)</span></div>
                    </div>
                </div>

                <!-- Top movers -->
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs">↑</span>
                        Top 5 by Efficiency
                    </div>
                    <div class="space-y-2">
                        {#each top5 as u, i}
                            <button onclick={() => { selectedUni = u.university_id; view = 'trend'; }} class="w-full flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg p-1 transition-colors">
                                <div class="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-bold text-slate-900 dark:text-white truncate">{u.university_name}</div>
                                    <div class="text-[10px] text-slate-500">{fmtInr(u.paid)} paid · {u.strength} students</div>
                                </div>
                                <div class="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{Number(u.collection_efficiency).toFixed(1)}%</div>
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <span class="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs">!</span>
                        Universities Needing Attention <span class="text-[10px] font-normal text-slate-400">(highest pending)</span>
                    </div>
                    <div class="space-y-2">
                        {#each bottomByPend as u}
                            <button onclick={() => { selectedUni = u.university_id; view = 'trend'; }} class="w-full text-left group">
                                <div class="flex items-center justify-between text-xs mb-1">
                                    <span class="font-bold text-slate-900 dark:text-white truncate group-hover:text-rose-600">{u.university_name}</span>
                                    <span class="font-extrabold text-rose-600 dark:text-rose-400">{fmtInr(u.pending)}</span>
                                </div>
                                <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div class="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full" style:width={`${(num(u.pending) / maxPending) * 100}%`}></div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

        <!-- TREND -->
        {:else if view === 'trend'}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="flex items-center justify-between flex-wrap gap-3 mb-5">
                    <div>
                        <div class="text-sm font-bold text-slate-900 dark:text-white">Collection Over Time</div>
                        <div class="text-xs text-slate-500 mt-0.5">
                            {trendSeries.length} data points · {trendStudents.toLocaleString()} students · {fmtInr(trendTotal)} total
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
                        <div class="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No transactions in this window</div>
                        <div class="text-xs text-slate-500 mt-1">Try a wider date range or import day-wise data.</div>
                    </div>
                {:else}
                    <div class="relative h-80 mb-3">
                        <!-- Grid lines -->
                        <div class="absolute inset-0 flex flex-col justify-between text-[9px] text-slate-400">
                            {#each [0, 0.25, 0.5, 0.75, 1] as p}
                                <div class="flex items-center gap-2">
                                    <span class="w-12 text-right flex-shrink-0">{fmtInr(trendMaxV * (1 - p))}</span>
                                    <div class="flex-1 border-t border-slate-100 dark:border-slate-800"></div>
                                </div>
                            {/each}
                        </div>
                        <!-- Chart -->
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 ml-14 w-[calc(100%-3.5rem)] h-full">
                            <defs>
                                <linearGradient id="trendBigGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="#6366f1" stop-opacity="0.5" />
                                    <stop offset="100%" stop-color="#a855f7" stop-opacity="0" />
                                </linearGradient>
                            </defs>
                            <path d={`M 0 100 ${trendSeries.map((p: any, i: number) => `L ${(i + 0.5) * (100 / trendSeries.length)} ${100 - (p.value / trendMaxV) * 95}`).join(' ')} L 100 100 Z`} fill="url(#trendBigGrad)" />
                            <polyline points={trendSeries.map((p: any, i: number) => `${(i + 0.5) * (100 / trendSeries.length)},${100 - (p.value / trendMaxV) * 95}`).join(' ')} fill="none" stroke="#6366f1" stroke-width="0.6" vector-effect="non-scaling-stroke" />
                            {#each trendSeries as p, i}
                                <circle cx={(i + 0.5) * (100 / trendSeries.length)} cy={100 - (p.value / trendMaxV) * 95} r="0.6" fill="#6366f1" vector-effect="non-scaling-stroke">
                                    <title>{p.label}: {fmtInr(p.value)} ({p.count} students)</title>
                                </circle>
                            {/each}
                        </svg>
                    </div>
                    <div class="flex justify-between text-[10px] text-slate-400 ml-14">
                        {#each [0, Math.floor(trendSeries.length / 4), Math.floor(trendSeries.length / 2), Math.floor(3 * trendSeries.length / 4), trendSeries.length - 1] as idx}
                            {#if trendSeries[idx]}<span>{granularity === 'month' ? trendSeries[idx].label : fmtDate(trendSeries[idx].label)}</span>{/if}
                        {/each}
                    </div>

                    <!-- Stats row -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Daily Average</div>
                            <div class="text-lg font-extrabold text-slate-900 dark:text-white mt-1">{fmtInr(trendAvg)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Peak {granularity === 'month' ? 'Month' : 'Day'}</div>
                            <div class="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{fmtInr(trendPeak?.value || 0)}</div>
                            <div class="text-[10px] text-slate-400">{granularity === 'month' ? trendPeak?.label : fmtDate(trendPeak?.label)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Students</div>
                            <div class="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-1">{trendStudents.toLocaleString()}</div>
                        </div>
                        <div>
                            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Avg per Student</div>
                            <div class="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-1">{fmtInr(trendTotal / Math.max(1, trendStudents))}</div>
                        </div>
                    </div>
                {/if}
            </div>

        <!-- COMPARISON -->
        {:else if view === 'comparison'}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="flex items-center justify-between flex-wrap gap-3 mb-5">
                    <div>
                        <div class="text-sm font-bold text-slate-900 dark:text-white">University Comparison</div>
                        <div class="text-xs text-slate-500 mt-0.5">Ranked by {rankMetric.replace('_', ' ')}</div>
                    </div>
                    <div class="flex items-center gap-0 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                        {#each [
                            { id: 'pending', label: 'Pending' },
                            { id: 'paid', label: 'Paid' },
                            { id: 'efficiency', label: 'Efficiency' },
                            { id: 'strength', label: 'Strength' },
                        ] as m}
                            <button onclick={() => rankMetric = m.id as any}
                                class="px-3 py-1 rounded-md text-[11px] font-bold transition-colors
                                       {rankMetric === m.id ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'}">
                                {m.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="space-y-2">
                    {#each rankedByMetric as u, i}
                        {@const val = metricValOf(u)}
                        {@const pctW = (val / maxBar) * 100}
                        <button onclick={() => { selectedUni = u.university_id; view = 'trend'; }} class="w-full text-left group">
                            <div class="flex items-center gap-3 mb-1">
                                <div class="w-7 text-right text-xs font-bold text-slate-400">{i + 1}</div>
                                <div class="flex-1 text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600">{u.university_name}</div>
                                <div class="text-sm font-extrabold text-slate-900 dark:text-white">
                                    {isPct ? `${val.toFixed(1)}%` : (rankMetric === 'strength' ? val.toLocaleString() : fmtInr(val))}
                                </div>
                            </div>
                            <div class="ml-10 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div class={`h-full bg-gradient-to-r ${COLOR_BY_METRIC[rankMetric]} rounded-full transition-all`} style:width={`${pctW}%`}></div>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>

        <!-- DISTRIBUTION -->
        {:else if view === 'distribution'}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="text-sm font-bold text-slate-900 dark:text-white mb-1">Payment Status Mix</div>
                    <div class="text-xs text-slate-500 mb-5">{statusTotal.toLocaleString()} students</div>
                    <div class="flex items-center justify-center mb-5">
                        <svg viewBox="0 0 200 200" class="w-56 h-56 -rotate-90">
                            <circle cx="100" cy="100" r="75" fill="none" stroke="#e2e8f0" stroke-width="24" class="dark:stroke-slate-800" />
                            <circle cx="100" cy="100" r="75" fill="none" stroke="#10b981" stroke-width="24"
                                    stroke-dasharray={donutDash(fullyDonutPct, 75)} stroke-linecap="round" />
                            <circle cx="100" cy="100" r="75" fill="none" stroke="#f59e0b" stroke-width="24"
                                    stroke-dasharray={donutDash(partialDonutPct, 75)} stroke-dashoffset={-Number(fullyDonutOffset)} stroke-linecap="round" />
                        </svg>
                    </div>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-emerald-500"></span>Fully Paid</span><span class="font-extrabold">{statusByName['Fully Paid'].toLocaleString()} <span class="text-xs text-slate-400">({fullyPct}%)</span></span></div>
                        <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500"></span>Partially Paid</span><span class="font-extrabold">{statusByName['Partially Paid'].toLocaleString()} <span class="text-xs text-slate-400">({partialPct}%)</span></span></div>
                        <div class="flex justify-between items-center"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></span>Yet to Pay</span><span class="font-extrabold">{statusByName['Yet To Pay'].toLocaleString()} <span class="text-xs text-slate-400">({notPaidPct}%)</span></span></div>
                    </div>
                </div>

                <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <div class="text-sm font-bold text-slate-900 dark:text-white mb-1">Case Tag Distribution</div>
                    <div class="text-xs text-slate-500 mb-5">{tagTotal.toLocaleString()} tagged students</div>
                    {#if !tagCounts.length}
                        <div class="text-center py-16">
                            <div class="text-sm text-slate-500">No tagged cases yet</div>
                        </div>
                    {:else}
                        <div class="space-y-3">
                            {#each tagCounts as t}
                                {@const tagPct = tagTotal > 0 ? (num(t.count) / tagTotal) * 100 : 0}
                                <div>
                                    <div class="flex justify-between text-xs mb-1">
                                        <span class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span class="w-3 h-3 rounded-full" style:background={TAG_COLORS[t.tag] || '#94a3b8'}></span>
                                            {TAG_LABELS[t.tag] || t.tag}
                                        </span>
                                        <span class="font-bold text-slate-600 dark:text-slate-300">{t.count} <span class="text-slate-400">({tagPct.toFixed(1)}%)</span></span>
                                    </div>
                                    <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                        <div class="h-full rounded-full" style:width={`${tagPct}%`} style:background={TAG_COLORS[t.tag] || '#94a3b8'}></div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

        <!-- CASES -->
        {:else if view === 'cases'}
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div class="text-sm font-bold text-slate-900 dark:text-white mb-1">Tagged Cases Across All Universities</div>
                <div class="text-xs text-slate-500 mb-5">{tagTotal.toLocaleString()} total tagged students. Click a tag to view those students.</div>
                {#if !tagCounts.length}
                    <div class="text-center py-16">
                        <AlertCircle size={32} class="inline text-slate-300 dark:text-slate-700" />
                        <div class="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No tagged cases yet</div>
                        <div class="text-xs text-slate-500 mt-1">Tag students in the Students Data tab to track case workflows.</div>
                    </div>
                {:else}
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {#each tagCounts as t}
                            <a href={`/fee-collection?tag=${t.tag}`}
                               class="block bg-slate-50 dark:bg-slate-800 rounded-xl p-4 hover:shadow-md transition-shadow border border-slate-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2">
                                        <span class="w-3 h-3 rounded-full" style:background={TAG_COLORS[t.tag] || '#94a3b8'}></span>
                                        <span class="text-sm font-bold text-slate-900 dark:text-white">{TAG_LABELS[t.tag] || t.tag}</span>
                                    </div>
                                    <ChevronRight size={14} class="text-slate-400" />
                                </div>
                                <div class="mt-3 flex items-end justify-between">
                                    <div class="text-3xl font-extrabold text-slate-900 dark:text-white">{t.count}</div>
                                    <div class="text-[10px] text-slate-500">{((num(t.count) / Math.max(1, tagTotal)) * 100).toFixed(1)}% of cases</div>
                                </div>
                            </a>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Footer -->
        <div class="text-center text-xs text-slate-400 py-4">
            Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · NxtWave Innovation in Advanced Technologies · UniConnect Fee Collection
        </div>
    </div>
</div>
