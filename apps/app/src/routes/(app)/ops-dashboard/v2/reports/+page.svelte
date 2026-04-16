<script lang="ts">
    import { onMount } from 'svelte';
    import {
        ArrowLeft, Calendar, ChevronLeft, ChevronRight, Download, Mail,
        ExternalLink, FileText, Loader2, RefreshCw, Printer
    } from 'lucide-svelte';

    let { data } = $props();

    type Mode = 'daily' | 'weekly' | 'monthly';

    let mode = $state<Mode>('daily');
    let selectedDate = $state(new Date().toISOString().split('T')[0]);
    let iframeLoading = $state(true);
    let sending = $state(false);
    let sendMsg = $state('');

    // ─── Date helpers ──────────────────────────────────────

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

    function shiftDate(dateStr: string, days: number) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    function formatContext(m: Mode, dateStr: string) {
        const d = new Date(dateStr);
        if (m === 'daily') {
            return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
        if (m === 'weekly') {
            const w = getWeekRange(dateStr);
            const s = new Date(w.start);
            const e = new Date(w.end);
            return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }

    // ─── Report URL builder ───────────────────────────────

    const reportUrl = $derived.by(() => {
        let u = `/api/ops/view-report?type=${mode}`;
        if (mode === 'daily') {
            u += `&date=${selectedDate}`;
        } else if (mode === 'weekly') {
            const w = getWeekRange(selectedDate);
            u += `&weekStart=${w.start}&weekEnd=${w.end}`;
        } else {
            const d = new Date(selectedDate);
            u += `&year=${d.getFullYear()}&month=${d.getMonth() + 1}`;
        }
        return u;
    });

    // ─── Navigation ────────────────────────────────────────

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

    function today() {
        selectedDate = new Date().toISOString().split('T')[0];
    }

    function setMode(m: Mode) {
        mode = m;
        iframeLoading = true;
        sendMsg = '';
    }

    // ─── Actions ───────────────────────────────────────────

    function openInNewTab() {
        window.open(reportUrl, '_blank');
    }

    function printReport() {
        const iframe = document.getElementById('report-frame') as HTMLIFrameElement | null;
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        }
    }

    async function sendEmail() {
        sending = true;
        sendMsg = '';
        try {
            let body: any = { type: mode };
            if (mode === 'daily') {
                body.date = selectedDate;
            } else if (mode === 'weekly') {
                const w = getWeekRange(selectedDate);
                body.weekStart = w.start;
                body.weekEnd = w.end;
            } else {
                const d = new Date(selectedDate);
                body.year = d.getFullYear();
                body.month = d.getMonth() + 1;
            }
            const res = await fetch('/api/ops/send-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const j = await res.json().catch(() => ({}));
            if (res.ok) {
                sendMsg = `✓ Sent to ${j.adminCount || 'admins'}`;
                setTimeout(() => (sendMsg = ''), 4000);
            } else {
                sendMsg = `Failed: ${j.error || res.statusText}`;
            }
        } catch (e: any) {
            sendMsg = `Error: ${e?.message || 'Failed to send'}`;
        } finally {
            sending = false;
        }
    }

    onMount(() => {
        // Re-read ?type and ?date from URL if provided
        const params = new URLSearchParams(window.location.search);
        const t = params.get('type') as Mode | null;
        const d = params.get('date');
        if (t && ['daily', 'weekly', 'monthly'].includes(t)) mode = t;
        if (d) selectedDate = d;
    });

    // Sync URL (so deep-links work)
    $effect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams();
            params.set('type', mode);
            params.set('date', selectedDate);
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState(null, '', newUrl);
        }
    });

    const modeAccent: Record<Mode, { from: string; to: string; name: string; desc: string }> = {
        daily: { from: '#0ea5e9', to: '#6366f1', name: 'Daily Report', desc: 'Snapshot of today' },
        weekly: { from: '#8b5cf6', to: '#ec4899', name: 'Weekly Report', desc: 'Trends across 7 days' },
        monthly: { from: '#10b981', to: '#0ea5e9', name: 'Monthly Report', desc: 'Strategic view' }
    };
</script>

<svelte:head>
    <title>Ops Reports · {modeAccent[mode].name}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
    <!-- App bar -->
    <header class="sticky top-0 z-30 backdrop-blur-md bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/70 dark:border-zinc-800">
        <div class="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex items-center gap-3 flex-wrap">
            <a
                href="/ops-dashboard/v2"
                class="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
                <ArrowLeft size={14} />
                <span class="hidden sm:inline">Dashboard</span>
            </a>
            <div class="h-5 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
            <div class="flex items-center gap-2 min-w-0">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm"
                     style="background: linear-gradient(135deg, {modeAccent[mode].from}, {modeAccent[mode].to});">
                    <FileText size={14} />
                </div>
                <div class="min-w-0">
                    <h1 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate">Ops Reports</h1>
                    <p class="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{modeAccent[mode].desc}</p>
                </div>
            </div>

            <div class="flex-1"></div>

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
                        oninput={() => (iframeLoading = true)}
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
                onclick={printReport}
                class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-xl
                       bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                       border border-zinc-200 dark:border-zinc-800
                       text-zinc-700 dark:text-zinc-300 transition-colors"
            >
                <Printer size={13} />
                <span class="hidden md:inline">Print</span>
            </button>

            <button
                onclick={sendEmail}
                disabled={sending}
                class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-xl
                       bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                       border border-zinc-200 dark:border-zinc-800
                       text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
            >
                {#if sending}
                    <Loader2 size={13} class="animate-spin" />
                {:else}
                    <Mail size={13} />
                {/if}
                <span class="hidden md:inline">Email</span>
            </button>

            <button
                onclick={openInNewTab}
                class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-xl
                       bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white
                       text-white dark:text-zinc-900 transition-colors"
            >
                <ExternalLink size={13} />
                <span class="hidden md:inline">Open</span>
            </button>
        </div>
    </header>

    <!-- Mode selector (BIG, visible tabs that actually open reports) -->
    <div class="max-w-[1440px] mx-auto w-full px-4 md:px-8 pt-6">
        <div class="grid grid-cols-3 gap-2 md:gap-3 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 shadow-sm">
            {#each ['daily', 'weekly', 'monthly'] as m}
                {@const active = mode === m}
                {@const meta = modeAccent[m as Mode]}
                <button
                    onclick={() => setMode(m as Mode)}
                    class="relative flex items-center justify-center gap-2 md:gap-3 px-3 md:px-5 py-3.5 rounded-xl font-semibold text-xs md:text-sm transition-all
                           {active
                               ? 'text-white shadow-md'
                               : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}"
                    style={active ? `background: linear-gradient(135deg, ${meta.from}, ${meta.to});` : ''}
                    aria-pressed={active}
                >
                    <FileText size={14} />
                    <span class="capitalize">{m}</span>
                    {#if active}
                        <span class="hidden md:inline text-[10px] font-medium opacity-80 ml-1">· {formatContext(m as Mode, selectedDate)}</span>
                    {/if}
                </button>
            {/each}
        </div>

        <!-- Context bar -->
        <div class="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <div class="min-w-0">
                <h2 class="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50 truncate">
                    {modeAccent[mode].name}
                </h2>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">
                    {formatContext(mode, selectedDate)}
                </p>
            </div>

            {#if sendMsg}
                <div class="text-xs font-medium px-3 py-1.5 rounded-full
                    {sendMsg.startsWith('✓')
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'}">
                    {sendMsg}
                </div>
            {/if}
        </div>
    </div>

    <!-- Report iframe -->
    <main class="max-w-[1440px] mx-auto w-full px-4 md:px-8 py-6 flex-1">
        <div class="relative rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)]" style="min-height: 80vh;">
            {#if iframeLoading}
                <div class="absolute inset-0 flex flex-col items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm z-10 pointer-events-none">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white mb-3 shadow-lg"
                         style="background: linear-gradient(135deg, {modeAccent[mode].from}, {modeAccent[mode].to});">
                        <Loader2 size={22} class="animate-spin" />
                    </div>
                    <p class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Loading {mode} report…</p>
                    <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{formatContext(mode, selectedDate)}</p>
                </div>
            {/if}

            <iframe
                id="report-frame"
                src={reportUrl}
                onload={() => (iframeLoading = false)}
                title="{mode} report"
                class="w-full bg-slate-50 dark:bg-zinc-950"
                style="min-height: 80vh; border: 0;"
            ></iframe>
        </div>

        <!-- Deep-link row -->
        <div class="mt-4 flex items-center justify-between gap-3 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
            <div class="font-mono truncate">{reportUrl}</div>
            <a
                href={reportUrl}
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
            >
                <ExternalLink size={11} />
                Open raw HTML
            </a>
        </div>
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
