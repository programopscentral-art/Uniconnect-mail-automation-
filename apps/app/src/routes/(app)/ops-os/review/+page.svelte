<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props<{
    data: { campuses: Array<{ campus_id: string; code: string; display_name: string }>; role: string };
  }>();

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

  let statusFilter = $state<'awaiting' | 'all'>('awaiting');
  let campusFilter = $state<string>('');
  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  const campusName = (id: string) =>
    data.campuses.find(c => c.campus_id === id)?.display_name ?? id.slice(0, 8);

  function fmtRelative(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  async function loadRows() {
    loading = true;
    loadError = null;
    try {
      const params = new URLSearchParams();
      params.set('cadence', 'DAILY');
      params.set('limit', '100');
      if (statusFilter === 'awaiting') {
        params.set('statuses', 'SUBMITTED,PM_REVIEW,SENT_BACK');
      }
      if (campusFilter) params.set('campus_id', campusFilter);
      const res = await fetch(`/api/ops-os/submissions/list?${params.toString()}`);
      if (!res.ok) {
        loadError = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      const j = await res.json();
      rows = j.rows ?? [];
    } catch (e) {
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(loadRows);
  $effect(() => {
    statusFilter;
    campusFilter;
    loadRows();
  });
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
  <div class="mx-auto max-w-5xl px-4 py-6">
    <div class="mb-6 flex items-end justify-between">
      <div>
        <div class="text-xs uppercase tracking-wider text-gray-500">PM review</div>
        <h1 class="mt-1 text-xl font-semibold">Submissions awaiting decision</h1>
      </div>
      <button
        class="text-xs text-gray-400 hover:text-gray-200"
        onclick={loadRows}
      >Refresh</button>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div>
        <label class="block text-xs uppercase tracking-wider text-gray-500" for="status-filter">Status</label>
        <select
          id="status-filter"
          class="mt-1 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          bind:value={statusFilter}
        >
          <option value="awaiting">Awaiting me (SUBMITTED / PM_REVIEW / SENT_BACK)</option>
          <option value="all">All</option>
        </select>
      </div>
      {#if data.campuses.length > 1}
        <div>
          <label class="block text-xs uppercase tracking-wider text-gray-500" for="campus-filter">Campus</label>
          <select
            id="campus-filter"
            class="mt-1 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            bind:value={campusFilter}
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
    {#if loading}
      <div class="py-12 text-center text-sm text-gray-500">Loading queue…</div>
    {:else if loadError}
      <div class="rounded border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</div>
    {:else if rows.length === 0}
      <div class="rounded border border-gray-800 bg-gray-900 p-12 text-center text-sm text-gray-500">
        {statusFilter === 'awaiting' ? 'Queue clear. No submissions awaiting your decision.' : 'No submissions match the current filters.'}
      </div>
    {:else}
      <div class="overflow-hidden rounded border border-gray-800 bg-gray-900">
        <table class="w-full text-sm">
          <thead class="bg-gray-900/60 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th class="px-3 py-2 text-left font-medium">Status</th>
              <th class="px-3 py-2 text-left font-medium">Campus</th>
              <th class="px-3 py-2 text-left font-medium">Period</th>
              <th class="px-3 py-2 text-left font-medium">Submitted</th>
              <th class="px-3 py-2 text-right font-medium">Sent back</th>
              <th class="px-3 py-2 text-right font-medium">Rev</th>
              <th class="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            {#each rows as r (r.submission_id)}
              <tr class="hover:bg-gray-800/50">
                <td class="px-3 py-2">
                  <span
                    class="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    class:bg-blue-900={r.status === 'SUBMITTED' || r.status === 'PM_REVIEW'}
                    class:text-blue-200={r.status === 'SUBMITTED' || r.status === 'PM_REVIEW'}
                    class:bg-amber-900={r.status === 'SENT_BACK'}
                    class:text-amber-200={r.status === 'SENT_BACK'}
                    class:bg-emerald-900={r.status === 'SIGNED_OFF'}
                    class:text-emerald-200={r.status === 'SIGNED_OFF'}
                    class:bg-gray-800={r.status === 'LOCKED' || r.status === 'DRAFT' || r.status === 'NEW'}
                    class:text-gray-400={r.status === 'LOCKED' || r.status === 'DRAFT' || r.status === 'NEW'}
                  >{r.status}</span>
                  {#if r.is_late_submission}
                    <span class="ml-1 rounded bg-red-900 px-1 py-0.5 text-[9px] uppercase text-red-200">late</span>
                  {/if}
                </td>
                <td class="px-3 py-2">{campusName(r.campus_id)}</td>
                <td class="px-3 py-2 text-gray-400">{r.period_start}</td>
                <td class="px-3 py-2 text-gray-400" title={r.submitted_at ?? ''}>{fmtRelative(r.submitted_at)}</td>
                <td class="px-3 py-2 text-right text-gray-400">{r.sent_back_count}</td>
                <td class="px-3 py-2 text-right text-gray-400">{r.revision}</td>
                <td class="px-3 py-2 text-right">
                  <a
                    href={`/ops-os/review/${r.submission_id}`}
                    class="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700"
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
