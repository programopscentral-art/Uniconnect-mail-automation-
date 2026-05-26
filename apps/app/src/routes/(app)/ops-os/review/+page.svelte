<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';

  type Row = {
    submission_id: string;
    campus_id: string;
    cadence: string;
    period_start: string;
    period_end: string;
    status: string;
    submitted_at: string | null;
    sent_back_count: number;
    is_late_submission: boolean;
    revision: number;
  };

  let { data } = $props<{
    data: {
      campuses: Array<{ campus_id: string; code: string; display_name: string }>;
      role: string;
      rows: Row[];
      statusFilter: 'awaiting' | 'all';
      campusFilter: string;
    };
  }>();

  const campusName = (id: string) =>
    data.campuses.find(c => c.campus_id === id)?.display_name ?? id.slice(0, 8);
  const campusCode = (id: string) =>
    data.campuses.find(c => c.campus_id === id)?.code ?? '';

  function fmtRelative(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  async function updateFilter(name: 'status' | 'campus', value: string) {
    const url = new URL($page.url);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }

  // ── Derived summary ───────────────────────────────────────────────────
  let summary = $derived.by(() => {
    const total = data.rows.length;
    const actionable = data.rows.filter(r => r.status === 'SUBMITTED' || r.status === 'PM_REVIEW').length;
    const waitingOnBoa = data.rows.filter(r => r.status === 'SENT_BACK').length;
    const late = data.rows.filter(r => r.is_late_submission).length;
    return { total, actionable, waitingOnBoa, late };
  });

  function isActionable(status: string): boolean {
    return status === 'SUBMITTED' || status === 'PM_REVIEW';
  }

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
      case 'NEW':         return 'bg-zinc-800 text-zinc-300';
      case 'SUBMITTED':
      case 'PM_REVIEW':   return 'bg-blue-900 text-blue-200';
      case 'SENT_BACK':   return 'bg-amber-900 text-amber-200';
      case 'SIGNED_OFF':  return 'bg-emerald-900 text-emerald-200';
      case 'LOCKED':      return 'bg-violet-900 text-violet-200';
      default:            return 'bg-zinc-800 text-zinc-400';
    }
  }
  function statusLabel(status: string): string {
    if (status === 'PM_REVIEW') return 'IN REVIEW';
    if (status === 'SENT_BACK') return 'SENT BACK';
    if (status === 'SIGNED_OFF') return 'SIGNED OFF';
    return status;
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-6xl px-4 py-6">

    <!-- ── Header card ────────────────────────────────────────────────── -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">PM Review</div>
          <div class="mt-1 text-lg font-semibold">Submissions awaiting decision</div>
          <div class="mt-0.5 text-xs text-zinc-400">Click any actionable row to sign off or send back.</div>
        </div>
        <button
          class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => invalidateAll()}
        >↻ Refresh</button>
      </div>

      <!-- Summary tiles -->
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">In view</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums">{summary.total}</div>
        </div>
        <div class="rounded-xl border border-blue-800 bg-blue-950/30 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">Awaiting you</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-blue-200">{summary.actionable}</div>
        </div>
        <div class="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Sent back · waiting on BOA</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-200">{summary.waitingOnBoa}</div>
        </div>
        <div class="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-red-400">Late submissions</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-red-200">{summary.late}</div>
        </div>
      </div>
    </div>

    <!-- ── Filters ────────────────────────────────────────────────────── -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="status-filter">View</label>
        <select
          id="status-filter"
          class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          value={data.statusFilter}
          onchange={(e) => updateFilter('status', (e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="awaiting">Awaiting me (SUBMITTED / IN REVIEW / SENT BACK)</option>
          <option value="all">All submissions</option>
        </select>
      </div>
      {#if data.campuses.length > 1}
        <div>
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="campus-filter">Campus</label>
          <select
            id="campus-filter"
            class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            value={data.campusFilter}
            onchange={(e) => updateFilter('campus', (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">All campuses</option>
            {#each data.campuses as c (c.campus_id)}
              <option value={c.campus_id}>{c.display_name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- ── Queue ──────────────────────────────────────────────────────── -->
    {#if data.rows.length === 0}
      <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-16 text-center">
        <div class="text-3xl">🎉</div>
        <div class="mt-3 text-base font-semibold text-zinc-200">
          {data.statusFilter === 'awaiting' ? 'Queue is clear' : 'No submissions match the current filters'}
        </div>
        <div class="mt-1 text-xs text-zinc-500">
          {data.statusFilter === 'awaiting' ? 'No submissions are awaiting your decision right now.' : 'Try changing the filters above.'}
        </div>
      </div>
    {:else}
      <div class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="px-4 py-3 text-left font-medium">Campus</th>
              <th class="px-3 py-3 text-left font-medium">Status</th>
              <th class="px-3 py-3 text-left font-medium">Period</th>
              <th class="px-3 py-3 text-left font-medium">Submitted</th>
              <th class="px-3 py-3 text-right font-medium">Send-backs</th>
              <th class="px-3 py-3 text-right font-medium">Rev</th>
              <th class="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each data.rows as r (r.submission_id)}
              {@const actionable = isActionable(r.status)}
              <tr
                class="transition-colors {actionable ? 'cursor-pointer hover:bg-zinc-800' : 'hover:bg-zinc-800/40'}"
                onclick={actionable ? () => goto(`/ops-os/review/${r.submission_id}`) : undefined}
              >
                <td class="px-4 py-3">
                  <div class="font-medium">{campusName(r.campus_id)}</div>
                  <div class="text-[10px] uppercase tracking-wider text-zinc-500">{campusCode(r.campus_id)}</div>
                </td>
                <td class="px-3 py-3">
                  <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusBadgeClass(r.status)}">{statusLabel(r.status)}</span>
                  {#if r.is_late_submission}
                    <span class="ml-1 rounded-md bg-red-900 px-1.5 py-0.5 text-[9px] uppercase font-semibold text-red-200">late</span>
                  {/if}
                </td>
                <td class="px-3 py-3 text-zinc-400 tabular-nums">{r.period_start}</td>
                <td class="px-3 py-3 text-zinc-400 tabular-nums" title={r.submitted_at ?? ''}>{fmtRelative(r.submitted_at)}</td>
                <td class="px-3 py-3 text-right tabular-nums {r.sent_back_count > 0 ? 'text-amber-300 font-medium' : 'text-zinc-500'}">{r.sent_back_count}</td>
                <td class="px-3 py-3 text-right text-zinc-400 tabular-nums">v{r.revision}</td>
                <td class="px-4 py-3 text-right">
                  {#if actionable}
                    <a
                      href={`/ops-os/review/${r.submission_id}`}
                      class="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                      onclick={(e) => e.stopPropagation()}
                    >Review →</a>
                  {:else}
                    <a
                      href={`/ops-os/review/${r.submission_id}`}
                      class="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                      onclick={(e) => e.stopPropagation()}
                    >View</a>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
