<script lang="ts">
    import { Sparkles, AlertTriangle, Lightbulb, TrendingUp, RefreshCw, Loader2 } from 'lucide-svelte';

    let {
        mode = 'daily',
        summary = null,
        date = ''
    }: {
        mode?: 'daily' | 'weekly' | 'monthly';
        summary?: any;
        date?: string;
    } = $props();

    type Insight = { type: 'observation' | 'risk' | 'recommendation'; text: string };

    let loading = $state(false);
    let error = $state('');
    let insights = $state<Insight[]>([]);
    let rawText = $state('');

    function deriveFallbackInsights(s: any): Insight[] {
        if (!s) return [];
        const out: Insight[] = [];
        const enrolled = Number(s.enrolled || 0);
        const attended = Number(s.attended || 0);
        const att = enrolled > 0 ? (attended / enrolled) * 100 : 0;
        const planned = Number(s.sessions_planned || 0);
        const completed = Number(s.sessions_completed || 0);
        const cancelled = Number(s.sessions_cancelled || 0);
        const comp = planned > 0 ? (completed / planned) * 100 : 0;
        const risk = Number(s.at_risk_total || 0);
        const informed = Number(s.at_risk_informed || 0);

        if (att > 0) {
            out.push({
                type: 'observation',
                text: `Attendance is ${att.toFixed(1)}% (${attended}/${enrolled}). Session completion ${comp.toFixed(0)}% (${completed}/${planned}).`
            });
        }
        if (att > 0 && att < 75) {
            out.push({ type: 'risk', text: `Attendance below 75% threshold — ${(enrolled - attended)} students absent.` });
        }
        if (cancelled > 0) {
            out.push({ type: 'risk', text: `${cancelled} session${cancelled > 1 ? 's' : ''} cancelled — review root causes.` });
        }
        if (risk > 0) {
            const unreached = risk - informed;
            if (unreached > 0) {
                out.push({
                    type: 'recommendation',
                    text: `${unreached} at-risk student${unreached > 1 ? 's' : ''} not yet contacted. Schedule outreach today.`
                });
            } else {
                out.push({ type: 'observation', text: `All ${risk} at-risk students informed — great follow-through.` });
            }
        }
        if (comp >= 95 && att >= 85 && !out.some((i) => i.type === 'risk')) {
            out.push({ type: 'recommendation', text: 'Strong week — keep cadence steady and document what worked.' });
        }
        return out.slice(0, 4);
    }

    function parseAIText(txt: string): Insight[] {
        if (!txt) return [];
        const lines = txt
            .split(/\n+/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.match(/^[#=\-*]+$/));
        const out: Insight[] = [];
        for (const line of lines) {
            const low = line.toLowerCase();
            let type: Insight['type'] = 'observation';
            if (low.includes('risk') || low.includes('alert') || low.includes('below') || low.includes('concern') || low.includes('drop')) type = 'risk';
            else if (low.includes('recommend') || low.includes('should') || low.includes('action') || low.includes('suggest') || low.includes('consider')) type = 'recommendation';
            const cleaned = line.replace(/^[\d\.\-\*\s]+/, '').replace(/^[A-Z ]+:\s*/, '');
            if (cleaned.length > 12 && cleaned.length < 260) out.push({ type, text: cleaned });
            if (out.length >= 5) break;
        }
        return out;
    }

    async function loadInsights() {
        if (!summary) return;
        loading = true;
        error = '';
        try {
            const res = await fetch('/api/ops/ai-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: mode === 'weekly' ? 'weekly-analytics' : mode === 'monthly' ? 'monthly-analytics' : 'daily-snapshot',
                    report: { summary, date }
                })
            });
            if (res.ok) {
                const j = await res.json();
                rawText = j.insights || '';
                const parsed = parseAIText(rawText);
                insights = parsed.length ? parsed : deriveFallbackInsights(summary);
            } else {
                insights = deriveFallbackInsights(summary);
            }
        } catch (e: any) {
            error = e?.message || 'Failed to load insights';
            insights = deriveFallbackInsights(summary);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (summary) {
            insights = deriveFallbackInsights(summary);
        }
    });

    const typeMeta: Record<Insight['type'], { label: string; cls: string; iconName: string }> = {
        observation: { label: 'Observation', cls: 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/40', iconName: 'trend' },
        risk: { label: 'Risk', cls: 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40', iconName: 'alert' },
        recommendation: { label: 'Recommendation', cls: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40', iconName: 'bulb' }
    };
</script>

<div
    class="relative rounded-2xl p-[1px] bg-gradient-to-br from-sky-400/40 via-violet-400/40 to-fuchsia-400/40
           shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)]"
>
    <div class="rounded-[calc(1rem-1px)] bg-white dark:bg-zinc-900 p-5 md:p-6 flex flex-col gap-4 h-full">
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-white shadow-sm">
                    <Sparkles size={16} />
                </div>
                <div>
                    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ops Copilot</h3>
                    <p class="text-[11px] text-zinc-500 dark:text-zinc-400">AI insights · {mode}</p>
                </div>
            </div>
            <button
                onclick={loadInsights}
                disabled={loading || !summary}
                class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg
                       bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700
                       text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {#if loading}
                    <Loader2 size={12} class="animate-spin" />
                    Thinking
                {:else}
                    <RefreshCw size={12} />
                    Refresh
                {/if}
            </button>
        </div>

        {#if !summary}
            <div class="text-xs text-zinc-500 dark:text-zinc-400">Select a date to generate insights.</div>
        {:else if insights.length === 0 && !loading}
            <div class="text-xs text-zinc-500 dark:text-zinc-400">No significant signals yet.</div>
        {:else}
            <ul class="flex flex-col gap-2.5">
                {#each insights as ins}
                    {@const meta = typeMeta[ins.type]}
                    <li class="flex gap-3">
                        <span class="inline-flex items-center justify-center w-6 h-6 rounded-lg shrink-0 {meta.cls}">
                            {#if ins.type === 'risk'}
                                <AlertTriangle size={12} />
                            {:else if ins.type === 'recommendation'}
                                <Lightbulb size={12} />
                            {:else}
                                <TrendingUp size={12} />
                            {/if}
                        </span>
                        <div class="flex-1 min-w-0">
                            <div class="text-[10px] uppercase tracking-wide font-semibold {meta.cls.split(' ').filter((c) => c.startsWith('text-')).join(' ')}">
                                {meta.label}
                            </div>
                            <p class="text-[13px] text-zinc-700 dark:text-zinc-200 leading-snug mt-0.5">{ins.text}</p>
                        </div>
                    </li>
                {/each}
            </ul>
        {/if}

        {#if error}
            <p class="text-[11px] text-rose-500">{error}</p>
        {/if}
    </div>
</div>
