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

  let selectedDate = $state(data.today);
  let selectedCampusId = $state<string>('');
  let statusFilter = $state<string>('');
  let lateOnly = $state(false);
  let incidentOnly = $state(false);

  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

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
  function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function loadRows() {
    loading = true; loadError = null;
    try {
      const params = new URLSearchParams();
      params.set('date', selectedDate);
      if (selectedCampusId) params.set('campuses', selectedCampusId);
      if (statusFilter) params.set('status', statusFilter);
      if (lateOnly) params.set('late_only', 'true');
      if (incidentOnly) params.set('incident_only', 'true');
      const res = await fetch(`/api/ops-os/operations/daily?${params.toString()}`);
      if (!res.ok) { loadError = (await res.text()) || `HTTP ${res.status}`; return; }
      rows = (await res.json()).rows ?? [];
    } catch (e) { loadError = (e as Error).message; }
    finally { loading = false; }
  }

  onMount(loadRows);
  $effect(() => {
    selectedDate; selectedCampusId; statusFilter; lateOnly; incidentOnly;
    loadRows();
  });

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

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'NO_SUBMISSION':
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
  function statusDisplay(status: string): string {
    return status === 'NO_SUBMISSION' ? 'NO SUB' : status;
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-7xl px-4 py-6">

    <!-- Header card -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Operations</div>
          <div class="mt-1 text-base font-semibold">Daily campus overview</div>
          <div class="mt-0.5 text-xs text-zinc-400">{selectedDate}</div>
        </div>
        <button
          class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={loadRows}
        >Refresh</button>
      </div>
    </div>

    <!-- Summary tiles -->
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Campuses</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums">{summary.total}</div>
      </div>
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-500">Signed off</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-300">{summary.signedOff}</div>
      </div>
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-blue-500">In flight</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums text-blue-300">{summary.inFlight}</div>
      </div>
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">No submission</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums text-zinc-400">{summary.noSub}</div>
      </div>
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-amber-500">Late</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-300">{summary.late}</div>
      </div>
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-rose-500">Incidents</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums text-rose-300">{summary.incidents}</div>
      </div>
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-amber-500">Infra issue</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-300">{summary.infraIssue}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="date-filter">Date</label>
        <input
          id="date-filter" type="date"
          class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
          bind:value={selectedDate}
        />
      </div>
      <div>
        <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="campus-filter">Campus</label>
        <select
          id="campus-filter"
          class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          bind:value={selectedCampusId}
        >
          <option value="">All campuses</option>
          {#each data.campuses as c (c.campus_id)}
            <option value={c.campus_id}>{c.display_name}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="status-filter">Status</label>
        <select
          id="status-filter"
          class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
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
      <label class="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800">
        <input type="checkbox" bind:checked={lateOnly} class="accent-amber-500" />
        Late only
      </label>
      <label class="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800">
        <input type="checkbox" bind:checked={incidentOnly} class="accent-rose-500" />
        Incidents only
      </label>
    </div>

    <!-- Table -->
    {#if loading}
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 py-12 text-center text-sm text-zinc-500">Loading…</div>
    {:else if loadError}
      <div class="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</div>
    {:else if rows.length === 0}
      <div class="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center text-sm text-zinc-500">
        No campuses match the current filters.
      </div>
    {:else}
      <div class="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="px-3 py-2.5 text-left font-medium">Campus</th>
              <th class="px-3 py-2.5 text-left font-medium">Status</th>
              <th class="px-3 py-2.5 text-left font-medium">Submitted</th>
              <th class="px-3 py-2.5 text-left font-medium">Signed off</th>
              <th class="px-3 py-2.5 text-right font-medium">Inc.</th>
              <th class="px-3 py-2.5 text-center font-medium">Infra</th>
              <th class="px-3 py-2.5 text-right font-medium">SB</th>
              <th class="px-3 py-2.5 text-left font-medium">PM remark</th>
              <th class="px-3 py-2.5 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each rows as r (r.campus_id)}
              <tr class="hover:bg-zinc-800/40 transition-colors">
                <td class="px-3 py-2.5">
                  <div class="font-medium">{r.campus_name}</div>
                  <div class="text-[10px] uppercase tracking-wider text-zinc-500">{r.campus_code}</div>
                </td>
                <td class="px-3 py-2.5">
                  <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusBadgeClass(r.status)}">
                    {statusDisplay(r.status)}
                  </span>
                  {#if r.is_late_submission || r.is_late_sign_off}
                    <span class="ml-1 rounded-md bg-red-900 px-1.5 py-0.5 text-[9px] uppercase font-semibold text-red-200">late</span>
                  {/if}
                </td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums" title={r.submitted_at ?? ''}>
                  {#if r.submitted_at}
                    <div>{fmtTime(r.submitted_at)}</div>
                    <div class="text-[10px] text-zinc-500">{fmtRelative(r.submitted_at)}</div>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-2.5 text-zinc-400 tabular-nums" title={r.signed_off_at ?? ''}>
                  {#if r.signed_off_at}
                    <div>{fmtTime(r.signed_off_at)}</div>
                    <div class="text-[10px] text-zinc-500">{fmtRelative(r.signed_off_at)}</div>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-2.5 text-right">
                  {#if r.incident_count > 0}
                    <span class="rounded-md bg-rose-900/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-200">{r.incident_count}</span>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {#if r.has_infra_issue}
                    <span class="text-amber-400" title="Infrastructure issue reported">●</span>
                  {:else}<span class="text-zinc-700">—</span>{/if}
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums {r.sent_back_count > 0 ? 'text-amber-300' : 'text-zinc-500'}">{r.sent_back_count}</td>
                <td class="px-3 py-2.5 text-zinc-400 max-w-xs">
                  {#if r.pm_remark_preview}
                    <span title={r.pm_remark_truncated ? r.pm_remark_preview + '…' : r.pm_remark_preview} class="block truncate">
                      {r.pm_remark_preview}{r.pm_remark_truncated ? '…' : ''}
                    </span>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-2.5 text-right">
                  {#if r.submission_id}
                    <a
                      href={`/ops-os/operations/${r.submission_id}`}
                      class="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >Open</a>
                  {:else}<span class="text-[10px] text-zinc-600">—</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
