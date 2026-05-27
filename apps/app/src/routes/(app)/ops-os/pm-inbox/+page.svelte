<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';

  type WaitingItem = {
    submission_id: string;
    campus_id: string;
    campus_name: string;
    campus_code: string;
    period_start: string;
    status: string;
    submitted_at: string | null;
    waiting_minutes: number;
  };
  type SentBackItem = {
    submission_id: string;
    campus_id: string;
    campus_name: string;
    period_start: string;
    sent_back_reason_code: string | null;
    sent_back_count: number;
    waiting_minutes: number;
  };
  type MissingItem = {
    campus_id: string;
    campus_name: string;
    campus_code: string;
    status: 'NO_SUBMISSION' | 'DRAFT' | 'NEW';
  };

  let { data } = $props<{ data: {
    role: string;
    today: string;
    campuses: Array<{ campus_id: string; code: string; display_name: string }>;
    waiting: WaitingItem[];
    sentBack: SentBackItem[];
    missingToday: MissingItem[];
    avgReviewMinutes: number | null;
    nonResponseCount: number;
    signedOffByYouThisWeek: number;
    remindersToYouToday: number;
  } }>();

  function fmtAgo(mins: number): string {
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours < 24) return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
  function fmtAvg(mins: number | null): string {
    if (mins === null) return '—';
    if (mins < 60) return `${mins}m`;
    return `${(mins / 60).toFixed(1)}h`;
  }
  function ageColor(mins: number): string {
    if (mins >= 240) return 'text-red-300';   // 4h+
    if (mins >= 120) return 'text-amber-300'; // 2h+
    return 'text-zinc-400';
  }

  let totalActionable = $derived(data.waiting.length);
  let oldestWaitingMin = $derived(
    data.waiting.length === 0 ? 0 : Math.max(...data.waiting.map(w => w.waiting_minutes))
  );
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-6xl px-4 py-6">

    <!-- ── Header card ────────────────────────────────────────────────── -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">PM Inbox</div>
          <div class="mt-1 text-lg font-semibold">What needs your attention</div>
          <div class="mt-0.5 text-xs text-zinc-400">Across {data.campuses.length} campus{data.campuses.length === 1 ? '' : 'es'} you cover · {data.today}</div>
        </div>
        <button class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => invalidateAll()}>↻ Refresh</button>
      </div>

      <!-- Summary tiles -->
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div class="rounded-xl border border-blue-900 bg-blue-950/40 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-blue-300">Awaiting your decision</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-blue-100">{totalActionable}</div>
          {#if totalActionable > 0}
            <div class="mt-0.5 text-[11px] text-blue-300/80">Oldest: {fmtAgo(oldestWaitingMin)}</div>
          {/if}
        </div>
        <div class="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Sent back · waiting on BOA</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-200">{data.sentBack.length}</div>
        </div>
        <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Missing today</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-zinc-300">{data.missingToday.length}</div>
          <div class="mt-0.5 text-[11px] text-zinc-500">campuses without a SUBMITTED report</div>
        </div>
        <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Signed off this week</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">{data.signedOffByYouThisWeek}</div>
          <div class="mt-0.5 text-[11px] text-emerald-300/80">Avg review: {fmtAvg(data.avgReviewMinutes)}</div>
        </div>
        <div class="rounded-xl border {data.nonResponseCount > 0 ? 'border-red-900 bg-red-950/30' : 'border-zinc-800 bg-zinc-950'} px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] {data.nonResponseCount > 0 ? 'text-red-400' : 'text-zinc-500'}">Non-responses · this month</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums {data.nonResponseCount > 0 ? 'text-red-200' : 'text-zinc-300'}">{data.nonResponseCount}</div>
          <div class="mt-0.5 text-[11px] {data.nonResponseCount > 0 ? 'text-red-300/80' : 'text-zinc-500'}">Auto-sign-offs against you</div>
        </div>
      </div>

      {#if data.remindersToYouToday > 0}
        <div class="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
          You received <strong class="text-zinc-200">{data.remindersToYouToday}</strong> reminder{data.remindersToYouToday === 1 ? '' : 's'} today.
        </div>
      {/if}
    </div>

    <!-- ── Awaiting your decision ─────────────────────────────────────── -->
    <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <header class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">Awaiting your decision</div>
          <div class="text-sm font-semibold">Sign off or send back — oldest first</div>
        </div>
        <a href="/ops-os/review" class="text-xs text-blue-300 hover:text-blue-200">Go to full queue →</a>
      </header>
      {#if data.waiting.length === 0}
        <div class="px-4 py-10 text-center text-sm text-zinc-500">
          🎉 Nothing waiting on you right now.
        </div>
      {:else}
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="px-4 py-2.5 text-left font-medium">Campus</th>
              <th class="px-3 py-2.5 text-left font-medium">Period</th>
              <th class="px-3 py-2.5 text-left font-medium">Submitted</th>
              <th class="px-3 py-2.5 text-right font-medium">Waiting</th>
              <th class="px-4 py-2.5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each data.waiting as w (w.submission_id)}
              <tr class="cursor-pointer hover:bg-zinc-800/60 transition-colors" onclick={() => goto(`/ops-os/review/${w.submission_id}`)}>
                <td class="px-4 py-2.5">
                  <div class="font-medium">{w.campus_name}</div>
                  <div class="text-[10px] uppercase tracking-wider text-zinc-500">{w.campus_code}</div>
                </td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums">{w.period_start}</td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums" title={w.submitted_at ?? ''}>
                  {#if w.submitted_at}{new Date(w.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{:else}—{/if}
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums font-medium {ageColor(w.waiting_minutes)}">{fmtAgo(w.waiting_minutes)} ago</td>
                <td class="px-4 py-2.5 text-right">
                  <a
                    href={`/ops-os/review/${w.submission_id}`}
                    class="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                    onclick={(e) => e.stopPropagation()}
                  >Review →</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <!-- ── Missing today ──────────────────────────────────────────────── -->
    <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <header class="border-b border-zinc-800 px-4 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Missing today</div>
        <div class="text-sm font-semibold">Campuses without a submitted report for {data.today}</div>
      </header>
      {#if data.missingToday.length === 0}
        <div class="px-4 py-10 text-center text-sm text-zinc-500">
          ✓ Every campus you cover has a submitted (or signed-off) report today.
        </div>
      {:else}
        <div class="divide-y divide-zinc-800">
          {#each data.missingToday as m (m.campus_id)}
            <div class="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <div class="font-medium">{m.campus_name}</div>
                <div class="text-[10px] uppercase tracking-wider text-zinc-500">{m.campus_code}</div>
              </div>
              <div class="flex items-center gap-3">
                <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider
                  {m.status === 'NO_SUBMISSION' ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-800 text-zinc-300'}">
                  {m.status === 'NO_SUBMISSION' ? 'No submission' : m.status}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ── Sent back, waiting on BOA ──────────────────────────────────── -->
    {#if data.sentBack.length > 0}
      <section class="mb-4 overflow-hidden rounded-2xl border border-amber-900/60 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Sent back · waiting on BOA</div>
          <div class="text-sm font-semibold">You returned these — BOA hasn't re-submitted yet</div>
        </header>
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="px-4 py-2.5 text-left font-medium">Campus</th>
              <th class="px-3 py-2.5 text-left font-medium">Period</th>
              <th class="px-3 py-2.5 text-left font-medium">Reason</th>
              <th class="px-3 py-2.5 text-right font-medium">Send-backs</th>
              <th class="px-3 py-2.5 text-right font-medium">Sent back</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each data.sentBack as s (s.submission_id)}
              <tr class="cursor-pointer hover:bg-zinc-800/60" onclick={() => goto(`/ops-os/review/${s.submission_id}`)}>
                <td class="px-4 py-2.5 font-medium">{s.campus_name}</td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums">{s.period_start}</td>
                <td class="px-3 py-2.5 text-zinc-400">{s.sent_back_reason_code ?? '—'}</td>
                <td class="px-3 py-2.5 text-right tabular-nums text-amber-300">{s.sent_back_count}</td>
                <td class="px-3 py-2.5 text-right tabular-nums {ageColor(s.waiting_minutes)}">{fmtAgo(s.waiting_minutes)} ago</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>
</div>
