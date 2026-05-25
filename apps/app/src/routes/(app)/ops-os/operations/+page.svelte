<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props<{
    data: {
      campuses: Array<{ campus_id: string; code: string; display_name: string }>;
      today: string;
      role: string;
    };
  }>();

  type Row = {
    campus_id: string;
    campus_code: string;
    campus_name: string;
    submission_id: string | null;
    status: string;
    submitted_at: string | null;
    signed_off_at: string | null;
    locked_at: string | null;
    is_late_submission: boolean;
    is_late_sign_off: boolean;
    sent_back_count: number;
    pm_remark_preview: string | null;
    pm_remark_truncated: boolean;
    incident_count: number;
    has_infra_issue: boolean;
  };

  // Filter state
  let selectedDate = $state(data.today);
  let selectedCampusId = $state<string>(''); // '' = all
  let statusFilter = $state<string>(''); // '' = all
  let lateOnly = $state(false);
  let incidentOnly = $state(false);

  // Data state
  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

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

  function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function loadRows() {
    loading = true;
    loadError = null;
    try {
      const params = new URLSearchParams();
      params.set('date', selectedDate);
      if (selectedCampusId) params.set('campuses', selectedCampusId);
      if (statusFilter) params.set('status', statusFilter);
      if (lateOnly) params.set('late_only', 'true');
      if (incidentOnly) params.set('incident_only', 'true');

      const res = await fetch(`/api/ops-os/operations/daily?${params.toString()}`);
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
    selectedDate; selectedCampusId; statusFilter; lateOnly; incidentOnly;
    loadRows();
  });

  // Summary counts at top
  let summary = $derived.by(() => {
    const total = rows.length;
    const signedOff = rows.filter(r => r.status === 'SIGNED_OFF' || r.status === 'LOCKED').length;
    const inFlight = rows.filter(r => ['SUBMITTED', 'PM_REVIEW', 'SENT_BACK', 'DRAFT', 'NEW'].includes(r.status)).length;
    const noSub = rows.filter(r => r.status === 'NO_SUBMISSION').length;
    const late = rows.filter(r => r.is_late_submission || r.is_late_sign_off).length;
    const incidents = rows.reduce((s, r) => s + r.incident_count, 0);
    const infraIssue = rows.filter(r => r.has_infra_issue).length;
    return { total, signedOff, inFlight, noSub, late, incidents, infraIssue };
  });
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
  <div class="mx-auto max-w-7xl px-4 py-6">
    <!-- Header -->
    <div class="mb-6 flex items-end justify-between">
      <div>
        <div class="text-xs uppercase tracking-wider text-gray-500">Operations</div>
        <h1 class="mt-1 text-xl font-semibold">Daily campus overview</h1>
      </div>
      <button class="text-xs text-gray-400 hover:text-gray-200" onclick={loadRows}>Refresh</button>
    </div>

    <!-- Summary tiles -->
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">Campuses</div>
        <div class="mt-1 text-lg font-semibold">{summary.total}</div>
      </div>
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">Signed off / Locked</div>
        <div class="mt-1 text-lg font-semibold text-emerald-300">{summary.signedOff}</div>
      </div>
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">In flight</div>
        <div class="mt-1 text-lg font-semibold text-blue-300">{summary.inFlight}</div>
      </div>
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">No submission</div>
        <div class="mt-1 text-lg font-semibold text-gray-400">{summary.noSub}</div>
      </div>
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">Late</div>
        <div class="mt-1 text-lg font-semibold text-amber-300">{summary.late}</div>
      </div>
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">Incidents</div>
        <div class="mt-1 text-lg font-semibold text-rose-300">{summary.incidents}</div>
      </div>
      <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-gray-500">Infra issue</div>
        <div class="mt-1 text-lg font-semibold text-amber-300">{summary.infraIssue}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="block text-xs uppercase tracking-wider text-gray-500" for="date-filter">Date</label>
        <input
          id="date-filter"
          type="date"
          class="mt-1 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-600 focus:outline-none"
          bind:value={selectedDate}
        />
      </div>
      <div>
        <label class="block text-xs uppercase tracking-wider text-gray-500" for="campus-filter">Campus</label>
        <select
          id="campus-filter"
          class="mt-1 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          bind:value={selectedCampusId}
        >
          <option value="">All campuses</option>
          {#each data.campuses as c (c.campus_id)}
            <option value={c.campus_id}>{c.display_name}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="block text-xs uppercase tracking-wider text-gray-500" for="status-filter">Status</label>
        <select
          id="status-filter"
          class="mt-1 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          bind:value={statusFilter}
        >
          <option value="">All</option>
          <option value="NO_SUBMISSION">No submission</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="SENT_BACK">Sent back</option>
          <option value="SIGNED_OFF">Signed off</option>
          <option value="LOCKED">Locked</option>
        </select>
      </div>
      <label class="inline-flex items-center gap-2 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm">
        <input type="checkbox" bind:checked={lateOnly} class="accent-amber-500" />
        Late only
      </label>
      <label class="inline-flex items-center gap-2 rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm">
        <input type="checkbox" bind:checked={incidentOnly} class="accent-rose-500" />
        Incidents only
      </label>
    </div>

    <!-- Table -->
    {#if loading}
      <div class="py-12 text-center text-sm text-gray-500">Loading…</div>
    {:else if loadError}
      <div class="rounded border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</div>
    {:else if rows.length === 0}
      <div class="rounded border border-gray-800 bg-gray-900 p-12 text-center text-sm text-gray-500">
        No campuses match the current filters.
      </div>
    {:else}
      <div class="overflow-hidden rounded border border-gray-800 bg-gray-900">
        <table class="w-full text-sm">
          <thead class="bg-gray-900/60 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th class="px-3 py-2 text-left font-medium">Campus</th>
              <th class="px-3 py-2 text-left font-medium">Status</th>
              <th class="px-3 py-2 text-left font-medium">Submitted</th>
              <th class="px-3 py-2 text-left font-medium">Signed off</th>
              <th class="px-3 py-2 text-right font-medium">Inc.</th>
              <th class="px-3 py-2 text-center font-medium">Infra</th>
              <th class="px-3 py-2 text-right font-medium">SB</th>
              <th class="px-3 py-2 text-left font-medium">PM remark</th>
              <th class="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            {#each rows as r (r.campus_id)}
              <tr class="hover:bg-gray-800/50">
                <td class="px-3 py-2">
                  <div class="font-medium">{r.campus_name}</div>
                  <div class="text-[10px] text-gray-500">{r.campus_code}</div>
                </td>
                <td class="px-3 py-2">
                  <span
                    class="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    class:bg-gray-800={r.status === 'NO_SUBMISSION' || r.status === 'DRAFT' || r.status === 'NEW'}
                    class:text-gray-400={r.status === 'NO_SUBMISSION' || r.status === 'DRAFT' || r.status === 'NEW'}
                    class:bg-blue-900={r.status === 'SUBMITTED' || r.status === 'PM_REVIEW'}
                    class:text-blue-200={r.status === 'SUBMITTED' || r.status === 'PM_REVIEW'}
                    class:bg-amber-900={r.status === 'SENT_BACK'}
                    class:text-amber-200={r.status === 'SENT_BACK'}
                    class:bg-emerald-900={r.status === 'SIGNED_OFF'}
                    class:text-emerald-200={r.status === 'SIGNED_OFF'}
                    class:bg-violet-900={r.status === 'LOCKED'}
                    class:text-violet-200={r.status === 'LOCKED'}
                  >{r.status === 'NO_SUBMISSION' ? 'NO SUB' : r.status}</span>
                  {#if r.is_late_submission || r.is_late_sign_off}
                    <span class="ml-1 rounded bg-red-900 px-1 py-0.5 text-[9px] uppercase text-red-200">late</span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-gray-400" title={r.submitted_at ?? ''}>
                  {fmtTime(r.submitted_at)}
                  {#if r.submitted_at}<span class="ml-1 text-[10px] text-gray-500">· {fmtRelative(r.submitted_at)}</span>{/if}
                </td>
                <td class="px-3 py-2 text-gray-400" title={r.signed_off_at ?? ''}>
                  {fmtTime(r.signed_off_at)}
                  {#if r.signed_off_at}<span class="ml-1 text-[10px] text-gray-500">· {fmtRelative(r.signed_off_at)}</span>{/if}
                </td>
                <td class="px-3 py-2 text-right">
                  {#if r.incident_count > 0}
                    <span class="rounded bg-rose-900 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">{r.incident_count}</span>
                  {:else}
                    <span class="text-gray-600">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-center">
                  {#if r.has_infra_issue}
                    <span class="text-amber-400" title="Infrastructure issue reported">●</span>
                  {:else}
                    <span class="text-gray-600">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-right text-gray-400">{r.sent_back_count}</td>
                <td class="px-3 py-2 text-gray-400">
                  {#if r.pm_remark_preview}
                    <span title={r.pm_remark_truncated ? r.pm_remark_preview + '…' : r.pm_remark_preview}>
                      {r.pm_remark_preview}{r.pm_remark_truncated ? '…' : ''}
                    </span>
                  {:else}
                    <span class="text-gray-600">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-right">
                  {#if r.submission_id}
                    <a
                      href={`/ops-os/operations/${r.submission_id}`}
                      class="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700"
                    >Open</a>
                  {:else}
                    <span class="text-[10px] text-gray-600">—</span>
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
