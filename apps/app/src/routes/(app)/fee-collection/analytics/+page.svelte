<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { Wallet, TrendingUp, AlertCircle, Building2, ArrowLeft, Loader2, Download, Printer } from 'lucide-svelte';

    let { data } = $props();
    let activePeriodId = $state(data.activePeriod?.id || data.periods[0]?.id || '');
    let analytics = $state<any>(null);
    let loading = $state(true);

    async function load() {
        if (!activePeriodId) return;
        loading = true;
        try {
            const res = await fetch(`/api/fees/analytics?period_id=${activePeriodId}`);
            if (res.ok) analytics = await res.json();
        } catch (e) { console.error(e); }
        finally { loading = false; }
    }

    $effect(() => { if (activePeriodId) load(); });

    function fmtInr(n: any): string {
        const num = Number(n) || 0;
        if (num >= 1e7) return '₹' + (num / 1e7).toFixed(2) + ' Cr';
        if (num >= 1e5) return '₹' + (num / 1e5).toFixed(2) + ' L';
        if (num >= 1e3) return '₹' + (num / 1e3).toFixed(1) + 'K';
        return '₹' + Math.round(num).toLocaleString('en-IN');
    }
    const n = (v: any) => Number(v) || 0;
    function pct(a: number, b: number): number { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; }

    function donutDash(p: number, r: number): string {
        const c = 2 * Math.PI * r;
        return `${(p / 100) * c} ${c}`;
    }

    // Derived data
    let s = $derived(analytics?.summary || {});
    let byUniv = $derived(analytics?.byUniv || []);
    let tagCounts = $derived(analytics?.tagCounts || []);
    let totalStudents = $derived(n(s.fully_paid) + n(s.partial_paid) + n(s.not_paid));
    let fullyPct = $derived(totalStudents > 0 ? Math.round((n(s.fully_paid) / totalStudents) * 100) : 0);
    let eff = $derived(Number(s.avg_efficiency || 0));
    let sortedByEff = $derived([...byUniv].sort((a: any, b: any) => Number(b.collection_efficiency) - Number(a.collection_efficiency)));
    let top5 = $derived(sortedByEff.slice(0, 5));
    let bottom5 = $derived([...sortedByEff].reverse().slice(0, 5));
    let maxPending = $derived(Math.max(1, ...byUniv.map((u: any) => n(u.pending))));
    let maxStrength = $derived(Math.max(1, ...byUniv.map((u: any) => n(u.fully_paid) + n(u.partial_paid) + n(u.not_paid))));
    let maxTag = $derived(Math.max(1, ...tagCounts.map((t: any) => t.count)));

    const TAG_META: Record<string, { label: string; color: string }> = {
        loan: { label: 'Loan Case', color: 'from-blue-500 to-cyan-500' },
        dropout: { label: 'Dropout', color: 'from-rose-500 to-red-600' },
        waiver: { label: 'Fee Waiver', color: 'from-amber-500 to-yellow-500' },
        scholar: { label: 'Scholarship', color: 'from-emerald-500 to-teal-500' },
        defer: { label: 'Deferral', color: 'from-violet-500 to-purple-600' },
        will_pay: { label: 'Will Pay', color: 'from-orange-500 to-pink-500' },
        other: { label: 'Other', color: 'from-slate-500 to-gray-500' },
    };

    onMount(() => { load(); });
</script>

<svelte:head><title>Fee Analytics · UniConnect</title></svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        <!-- Header -->
        <div class="glass rounded-[2rem] p-6 flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
                <a href="/fee-collection" class="w-10 h-10 rounded-2xl bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                    <ArrowLeft size={18} class="text-slate-600 dark:text-slate-300" />
                </a>
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center shadow-xl shadow-rose-500/30 overflow-hidden">
                    <img src="/niat-logo.jpg" alt="NIAT" class="w-full h-full object-cover" />
                </div>
                <div>
                    <div class="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-[0.25em]">Office of Fee Collection</div>
                    <h1 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Fee Collection Analytics</h1>
                    {#if analytics?.period}
                        <div class="text-xs text-slate-500 mt-0.5">{analytics.period.name} · {totalStudents.toLocaleString()} students · {s.universities || 0} universities</div>
                    {/if}
                </div>
            </div>
            <div class="flex items-center gap-2">
                <select bind:value={activePeriodId} class="px-3 py-2 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-white/20 text-sm font-bold">
                    {#each data.periods as p}<option value={p.id}>{p.name}</option>{/each}
                </select>
                <button onclick={() => window.print()} class="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-purple-500/30">
                    <Printer size={14} /> Print / Save PDF
                </button>
            </div>
        </div>

        {#if loading}
            <div class="flex items-center justify-center py-32">
                <Loader2 class="animate-spin text-indigo-500" size={32} />
            </div>
        {:else if !analytics || totalStudents === 0}
            <div class="glass rounded-[2rem] p-16 text-center">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mx-auto flex items-center justify-center text-2xl">📥</div>
                <h2 class="mt-4 text-xl font-black text-slate-900 dark:text-white">No data yet</h2>
                <p class="text-sm text-slate-500 mt-2">Import data from the Fee Collection page to see analytics.</p>
                <a href="/fee-collection" class="inline-block mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold">Open Fee Collection →</a>
            </div>
        {:else}

        <!-- KPI Cards row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" transition:fade={{ duration: 200 }}>
            <div class="glass rounded-[2rem] p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-400 to-slate-600"></div>
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Payable</div>
                <div class="text-3xl font-black text-slate-900 dark:text-white mt-2">{fmtInr(s.total_payable)}</div>
                <div class="text-[11px] text-slate-500 mt-1">{totalStudents.toLocaleString()} students</div>
            </div>
            <div class="glass rounded-[2rem] p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Paid</div>
                <div class="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{fmtInr(s.total_paid)}</div>
                <div class="text-[11px] text-slate-500 mt-1">{fullyPct}% fully paid</div>
            </div>
            <div class="glass rounded-[2rem] p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600"></div>
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pending</div>
                <div class="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">{fmtInr(s.total_pending)}</div>
                <div class="text-[11px] text-slate-500 mt-1">{n(s.not_paid)} unpaid · {n(s.partial_paid)} partial</div>
            </div>
            <div class="glass rounded-[2rem] p-5 relative overflow-hidden">
                <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Collection Efficiency</div>
                <div class="text-3xl font-black {eff >= 95 ? 'text-emerald-600 dark:text-emerald-400' : eff >= 85 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'} mt-2">{eff.toFixed(1)}%</div>
                <div class="text-[11px] text-slate-500 mt-1">across {s.universities || 0} universities</div>
            </div>
        </div>

        <!-- Performance Rings -->
        <div class="glass rounded-[2rem] p-6">
            <div class="flex items-center justify-between mb-5">
                <h2 class="text-lg font-black text-slate-900 dark:text-white">Performance Rings</h2>
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live snapshot</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <!-- Collection Efficiency -->
                <div class="flex flex-col items-center text-center">
                    <svg viewBox="0 0 120 120" class="w-40 h-40 -rotate-90">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="12" class="text-slate-100 dark:text-slate-800" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke="url(#gradEff)" stroke-width="12" stroke-linecap="round" stroke-dasharray={donutDash(eff, 50)} />
                        <defs>
                            <linearGradient id="gradEff" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#A52D2D" />
                                <stop offset="100%" stop-color="#dc2626" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div class="mt-3">
                        <div class="text-4xl font-black bg-gradient-to-br from-rose-600 to-red-700 bg-clip-text text-transparent">{eff.toFixed(0)}%</div>
                        <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mt-1">Collection Efficiency</div>
                        <div class="text-[11px] text-slate-500 mt-1">Of total payable, collected</div>
                    </div>
                </div>
                <!-- Fully Paid -->
                <div class="flex flex-col items-center text-center">
                    <svg viewBox="0 0 120 120" class="w-40 h-40 -rotate-90">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="12" class="text-slate-100 dark:text-slate-800" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke="url(#gradFull)" stroke-width="12" stroke-linecap="round" stroke-dasharray={donutDash(fullyPct, 50)} />
                        <defs>
                            <linearGradient id="gradFull" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#10b981" />
                                <stop offset="100%" stop-color="#0d9488" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div class="mt-3">
                        <div class="text-4xl font-black bg-gradient-to-br from-emerald-500 to-teal-600 bg-clip-text text-transparent">{fullyPct}%</div>
                        <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mt-1">Fully Paid</div>
                        <div class="text-[11px] text-slate-500 mt-1">{n(s.fully_paid).toLocaleString()} students with zero pending</div>
                    </div>
                </div>
                <!-- Open Cases -->
                <div class="flex flex-col items-center text-center">
                    <svg viewBox="0 0 120 120" class="w-40 h-40 -rotate-90">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="12" class="text-slate-100 dark:text-slate-800" />
                        <circle cx="60" cy="60" r="50" fill="none" stroke="url(#gradOpen)" stroke-width="12" stroke-linecap="round" stroke-dasharray={donutDash(100 - fullyPct, 50)} />
                        <defs>
                            <linearGradient id="gradOpen" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#f59e0b" />
                                <stop offset="100%" stop-color="#ea580c" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div class="mt-3">
                        <div class="text-4xl font-black bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-transparent">{(100 - fullyPct)}%</div>
                        <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mt-1">Open Cases</div>
                        <div class="text-[11px] text-slate-500 mt-1">{(n(s.partial_paid) + n(s.not_paid)).toLocaleString()} need follow-up</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Per-university horizontal stacked bars -->
        <div class="glass rounded-[2rem] p-6">
            <div class="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div>
                    <h2 class="text-lg font-black text-slate-900 dark:text-white">Payment Status — Per University</h2>
                    <p class="text-xs text-slate-500 mt-0.5">Each bar is 100%. Easy to compare proportions across universities of any size.</p>
                </div>
                <div class="flex items-center gap-3 text-[10px] font-bold">
                    <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-gradient-to-br from-emerald-500 to-teal-600"></span>Fully Paid</span>
                    <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-yellow-500"></span>Partial</span>
                    <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-gradient-to-br from-rose-500 to-red-600"></span>Not Paid</span>
                </div>
            </div>
            <div class="space-y-2.5">
                {#each [...byUniv].sort((a, b) => (n(b.fully_paid) / Math.max(1, n(b.fully_paid) + n(b.partial_paid) + n(b.not_paid))) - (n(a.fully_paid) / Math.max(1, n(a.fully_paid) + n(a.partial_paid) + n(a.not_paid)))) as u}
                    {@const total = n(u.fully_paid) + n(u.partial_paid) + n(u.not_paid)}
                    {@const fullPct = total > 0 ? (n(u.fully_paid) / total) * 100 : 0}
                    {@const partPct = total > 0 ? (n(u.partial_paid) / total) * 100 : 0}
                    {@const nullPct = total > 0 ? (n(u.not_paid) / total) * 100 : 0}
                    <div class="flex items-center gap-3 group">
                        <div class="w-36 text-xs font-bold text-slate-700 dark:text-slate-200 text-right truncate">{u.university_name}</div>
                        <div class="flex-1 flex h-8 rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
                            {#if fullPct > 0}
                                <div class="bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-black"
                                     style="width:{fullPct}%"
                                     title="Fully Paid: {u.fully_paid} ({fullPct.toFixed(1)}%)">
                                    {#if fullPct > 8}{u.fully_paid}{/if}
                                </div>
                            {/if}
                            {#if partPct > 0}
                                <div class="bg-gradient-to-r from-amber-400 to-yellow-500 flex items-center justify-center text-white text-[10px] font-black"
                                     style="width:{partPct}%"
                                     title="Partial: {u.partial_paid} ({partPct.toFixed(1)}%)">
                                    {#if partPct > 8}{u.partial_paid}{/if}
                                </div>
                            {/if}
                            {#if nullPct > 0}
                                <div class="bg-gradient-to-r from-rose-500 to-red-600 flex items-center justify-center text-white text-[10px] font-black"
                                     style="width:{nullPct}%"
                                     title="Not Paid: {u.not_paid} ({nullPct.toFixed(1)}%)">
                                    {#if nullPct > 8}{u.not_paid}{/if}
                                </div>
                            {/if}
                        </div>
                        <div class="w-20 text-right">
                            <div class="text-xs font-black text-slate-700 dark:text-slate-200">{total.toLocaleString()}</div>
                            <div class="text-[9px] font-bold text-emerald-500">{fullPct.toFixed(0)}% full</div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Pending amount per university -->
        <div class="glass rounded-[2rem] p-6">
            <div class="flex items-center justify-between mb-5">
                <div>
                    <h2 class="text-lg font-black text-slate-900 dark:text-white">Pending Amount — Per University</h2>
                    <p class="text-xs text-slate-500 mt-0.5">Outstanding fees still to be collected</p>
                </div>
            </div>
            <div class="space-y-2.5">
                {#each [...byUniv].sort((a: any, b: any) => n(b.pending) - n(a.pending)) as u}
                    {@const barPct = (n(u.pending) / maxPending) * 100}
                    {@const color = n(u.pending) > 5000000 ? 'from-rose-500 to-red-600' : n(u.pending) > 1000000 ? 'from-amber-400 to-orange-500' : 'from-emerald-500 to-teal-600'}
                    <div class="flex items-center gap-3 group">
                        <div class="w-32 text-xs font-bold text-slate-700 dark:text-slate-300 text-right truncate">{u.university_name}</div>
                        <div class="flex-1 h-7 bg-slate-100 dark:bg-slate-800/50 rounded-lg overflow-hidden relative">
                            <div class="h-full bg-gradient-to-r {color} rounded-lg transition-all duration-700 group-hover:opacity-90" style="width:{Math.max(barPct, 1)}%"></div>
                            <div class="absolute inset-0 flex items-center px-3 text-[10px] font-black text-white">
                                {fmtInr(u.pending)}
                            </div>
                        </div>
                        <div class="w-16 text-[10px] font-bold text-slate-500 text-right">{n(u.not_paid)} unpaid</div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Top + Bottom 5 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Top 5 -->
            <div class="glass rounded-[2rem] p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-lg">🏆</div>
                    <div>
                        <h2 class="text-base font-black text-slate-900 dark:text-white">Top 5 Performers</h2>
                        <p class="text-[10px] text-slate-500">Highest collection efficiency</p>
                    </div>
                </div>
                <div class="space-y-2.5">
                    {#each top5 as u, i}
                        <div class="flex items-center gap-3 p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors">
                            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-sm shadow-md">{i + 1}</div>
                            <div class="flex-1">
                                <div class="text-sm font-black text-slate-900 dark:text-white">{u.university_name}</div>
                                <div class="text-[10px] text-slate-500">{fmtInr(u.paid)} paid</div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-black text-emerald-600 dark:text-emerald-400">{Number(u.collection_efficiency).toFixed(1)}%</div>
                                <div class="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Eff</div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
            <!-- Bottom 5 -->
            <div class="glass rounded-[2rem] p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white text-lg">⚠️</div>
                    <div>
                        <h2 class="text-base font-black text-slate-900 dark:text-white">Need Attention</h2>
                        <p class="text-[10px] text-slate-500">Lowest collection efficiency</p>
                    </div>
                </div>
                <div class="space-y-2.5">
                    {#each bottom5 as u, i}
                        <div class="flex items-center gap-3 p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors">
                            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white font-black text-sm shadow-md">{i + 1}</div>
                            <div class="flex-1">
                                <div class="text-sm font-black text-slate-900 dark:text-white">{u.university_name}</div>
                                <div class="text-[10px] text-rose-500 font-bold">{fmtInr(u.pending)} pending</div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-black text-rose-600 dark:text-rose-400">{Number(u.collection_efficiency).toFixed(1)}%</div>
                                <div class="text-[9px] font-bold text-rose-500 uppercase tracking-widest">Eff</div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <!-- Case tags -->
        {#if tagCounts.length > 0}
            <div class="glass rounded-[2rem] p-6">
                <div class="flex items-center justify-between mb-5">
                    <div>
                        <h2 class="text-lg font-black text-slate-900 dark:text-white">Case Tags Distribution</h2>
                        <p class="text-xs text-slate-500 mt-0.5">Students by tagged case type</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {#each tagCounts as t}
                        {@const meta = TAG_META[t.tag] || { label: t.tag, color: 'from-slate-500 to-gray-500' }}
                        <div class="rounded-2xl bg-white/40 dark:bg-slate-800/40 p-4 relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-20 h-20 rounded-full bg-gradient-to-br {meta.color} opacity-10 blur-2xl"></div>
                            <div class="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{meta.label}</div>
                            <div class="text-3xl font-black bg-gradient-to-br {meta.color} bg-clip-text text-transparent mt-2">{t.count}</div>
                            <div class="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div class="h-full bg-gradient-to-r {meta.color} rounded-full" style="width:{(t.count / maxTag) * 100}%"></div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- All universities detail table -->
        <div class="glass rounded-[2rem] overflow-hidden">
            <div class="p-5 border-b border-white/10">
                <h2 class="text-lg font-black text-slate-900 dark:text-white">All Universities · Detailed Breakdown</h2>
                <p class="text-xs text-slate-500 mt-0.5">Complete per-university metrics</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-slate-50/50 dark:bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <th class="py-3 px-4 text-left">University</th>
                            <th class="py-3 px-2 text-right">Strength</th>
                            <th class="py-3 px-2 text-right">Full</th>
                            <th class="py-3 px-2 text-right">Partial</th>
                            <th class="py-3 px-2 text-right">Not Paid</th>
                            <th class="py-3 px-2 text-right">Payable</th>
                            <th class="py-3 px-2 text-right">Paid</th>
                            <th class="py-3 px-2 text-right">Pending</th>
                            <th class="py-3 px-2 text-right">Eff %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each sortedByEff as u}
                            {@const e = Number(u.collection_efficiency)}
                            <tr class="border-t border-white/5 hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors">
                                <td class="py-3 px-4 font-black text-slate-900 dark:text-white">{u.university_name}</td>
                                <td class="py-3 px-2 text-right font-bold">{n(u.strength)}</td>
                                <td class="py-3 px-2 text-right text-emerald-600 dark:text-emerald-400 font-black">{n(u.fully_paid)}</td>
                                <td class="py-3 px-2 text-right text-amber-600 dark:text-amber-400 font-bold">{n(u.partial_paid)}</td>
                                <td class="py-3 px-2 text-right text-rose-600 dark:text-rose-400 font-bold">{n(u.not_paid)}</td>
                                <td class="py-3 px-2 text-right text-slate-600 dark:text-slate-300">{fmtInr(u.payable)}</td>
                                <td class="py-3 px-2 text-right text-emerald-600 dark:text-emerald-400 font-bold">{fmtInr(u.paid)}</td>
                                <td class="py-3 px-2 text-right text-rose-600 dark:text-rose-400 font-bold">{fmtInr(u.pending)}</td>
                                <td class="py-3 px-2 text-right">
                                    <span class="inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-black {e >= 95 ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : e >= 85 ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' : 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'}">{e.toFixed(1)}%</span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Footer -->
        <div class="text-center text-xs text-slate-400 py-4">
            Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · NxtWave Institute of Advanced Technologies · UniConnect Fee Collection
        </div>

        {/if}
    </div>
</div>

<style>
    @media print {
        :global(aside), :global(nav) { display: none !important; }
        :global(.no-print) { display: none !important; }
    }
</style>
