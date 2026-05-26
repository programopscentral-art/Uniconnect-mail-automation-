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

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
      case 'NEW':         return 'bg-zinc-800 text-zinc-400';
      case 'SUBMITTED':
      case 'PM_REVIEW':   return 'bg-blue-900 text-blue-200';
      case 'SENT_BACK':   return 'bg-amber-900 text-amber-200';
      case 'SIGNED_OFF':  return 'bg-emerald-900 text-emerald-200';
      case 'LOCKED':      return 'bg-violet-900 text-violet-200';
      default:            return 'bg-zinc-800 text-zinc-400';
    }
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-5xl px-4 py-6">

    <!-- Header card -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">PM Review</div>
          <div class="mt-1 text-base font-semibold">Submissions awaiting decision</div>
          <div class="mt-0.5 text-xs text-zinc-400">{data.rows.length} in current view</div>
        </div>
        <button
          class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => invalidateAll()}
        >Refresh</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="status-filter">Status</label>
        <select
          id="status-filter"
          class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          value={data.statusFilter}
          onchange={(e) => updateFilter('status', (e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="awaiting">Awaiting me (SUBMITTED / PM_REVIEW / SENT_BACK)</option>
          <option value="all">All</option>
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

    <!-- Queue -->
    {#if data.rows.length === 0}
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center text-sm text-zinc-500">
        {data.statusFilter === 'awaiting' ? 'Queue clear. No submissions awaiting your decision.' : 'No submissions match the current filters.'}
      </div>
    {:else}
      <div class="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="px-3 py-2.5 text-left font-medium">Status</th>
              <th class="px-3 py-2.5 text-left font-medium">Campus</th>
              <th class="px-3 py-2.5 text-left font-medium">Period</th>
              <th class="px-3 py-2.5 text-left font-medium">Submitted</th>
              <th class="px-3 py-2.5 text-right font-medium">Sent back</th>
              <th class="px-3 py-2.5 text-right font-medium">Rev</th>
              <th class="px-3 py-2.5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each data.rows as r (r.submission_id)}
              <tr class="hover:bg-zinc-800/40 transition-colors">
                <td class="px-3 py-2.5">
                  <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusBadgeClass(r.status)}">{r.status}</span>
                  {#if r.is_late_submission}
                    <span class="ml-1 rounded-md bg-red-900 px-1.5 py-0.5 text-[9px] uppercase font-semibold text-red-200">late</span>
                  {/if}
                </td>
                <td class="px-3 py-2.5 font-medium">{campusName(r.campus_id)}</td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums">{r.period_start}</td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums" title={r.submitted_at ?? ''}>{fmtRelative(r.submitted_at)}</td>
                <td class="px-3 py-2.5 text-right tabular-nums {r.sent_back_count > 0 ? 'text-amber-300' : 'text-zinc-500'}">{r.sent_back_count}</td>
                <td class="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{r.revision}</td>
                <td class="px-3 py-2.5 text-right">
                  <a
                    href={`/ops-os/review/${r.submission_id}`}
                    class="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                  >Open</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
