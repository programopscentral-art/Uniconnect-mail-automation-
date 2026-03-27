<script lang="ts">
  import { fade, fly } from 'svelte/transition';

  let { data } = $props();
  const user = data.user;

  let logs = $state<any[]>([]);
  let total = $state(0);
  let currentPage = $state(1);
  let totalPages = $state(0);
  let loading = $state(false);

  // Filters
  let filterAccessType = $state('');
  let filterStartDate = $state('');
  let filterEndDate = $state('');
  let filterSearch = $state('');

  const accessTypeColors: Record<string, string> = {
    UPLOAD: 'bg-blue-100 text-blue-700',
    DOWNLOAD: 'bg-indigo-100 text-indigo-700',
    DELETE: 'bg-red-100 text-red-700',
    PII_ACCESS: 'bg-amber-100 text-amber-700',
    INTEGRITY_FAILURE: 'bg-red-200 text-red-800',
    VIEW: 'bg-gray-100 text-gray-700',
  };

  const isAdmin = ['ADMIN', 'PROGRAM_OPS'].includes(user?.role);

  $effect(() => {
    if (isAdmin) loadLogs();
  });

  async function loadLogs(page = 1) {
    loading = true;
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filterAccessType) params.set('accessType', filterAccessType);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        logs = data.logs;
        total = data.total;
        totalPages = data.totalPages;
        currentPage = data.page;
      }
    } catch {} finally { loading = false; }
  }

  function applyFilters() { loadLogs(1); }

  function fmtDate(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  let filteredLogs = $derived.by(() => {
    if (!filterSearch) return logs;
    const s = filterSearch.toLowerCase();
    return logs.filter(l =>
      (l.accessor_name || '').toLowerCase().includes(s) ||
      (l.student_name || '').toLowerCase().includes(s) ||
      (l.document_name || '').toLowerCase().includes(s) ||
      (l.accessor_email || '').toLowerCase().includes(s)
    );
  });

  async function exportCsv() {
    const headers = ['Timestamp', 'Accessor', 'Email', 'Role', 'Access Type', 'Student', 'Document', 'IP Address'];
    const rows = filteredLogs.map(l => [
      l.created_at ? new Date(l.created_at).toISOString() : '',
      `"${(l.accessor_name || '').replace(/"/g, '""')}"`,
      l.accessor_email || '',
      l.accessor_role || '',
      l.access_type || '',
      `"${(l.student_name || '').replace(/"/g, '""')}"`,
      `"${(l.document_name || l.ip_address || '').replace(/"/g, '""')}"`,
      l.ip_address || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

{#if !isAdmin}
  <div class="flex flex-col items-center justify-center py-24">
    <p class="text-lg font-black text-red-500">Access Denied</p>
    <p class="text-sm text-gray-500 mt-2">Only administrators can view audit logs.</p>
  </div>
{:else}
<div class="space-y-6" in:fade>
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white">Security Audit Logs</h2>
      <p class="text-sm text-gray-500 mt-1">{total} total events tracked</p>
    </div>
    <button onclick={exportCsv}
      class="px-4 py-2 text-xs font-bold bg-white border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 shadow-sm">
      Export CSV
    </button>
  </div>

  <!-- Filters -->
  <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
    <div class="flex flex-wrap items-end gap-3">
      <div>
        <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Access Type</label>
        <select bind:value={filterAccessType}
          class="px-3 py-2 text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
          <option value="">All Types</option>
          {#each ['UPLOAD', 'DOWNLOAD', 'DELETE', 'PII_ACCESS', 'INTEGRITY_FAILURE'] as t}
            <option value={t}>{t}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">From</label>
        <input type="date" bind:value={filterStartDate}
          class="px-3 py-2 text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      </div>
      <div>
        <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">To</label>
        <input type="date" bind:value={filterEndDate}
          class="px-3 py-2 text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      </div>
      <div class="flex-1 min-w-[200px]">
        <label class="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Search</label>
        <input type="text" bind:value={filterSearch} placeholder="Search by name, email, student..."
          class="w-full px-3 py-2 text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl" />
      </div>
      <button onclick={applyFilters}
        class="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">
        Apply
      </button>
    </div>
  </div>

  <!-- Log Table -->
  <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
    {#if loading}
      <div class="p-8 text-center">
        <div class="animate-spin w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto"></div>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100 dark:border-slate-800">
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Timestamp</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Accessor</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Student</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Document/Details</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
            {#each filteredLogs as log}
              <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                <td class="px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">{fmtDate(log.created_at)}</td>
                <td class="px-4 py-3">
                  <p class="text-xs font-bold text-gray-900 dark:text-white">{log.accessor_name || '—'}</p>
                  <p class="text-[10px] text-gray-400">{log.accessor_email || ''}</p>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-1 text-[10px] font-black rounded-lg {accessTypeColors[log.access_type] || 'bg-gray-100 text-gray-600'}">
                    {log.access_type}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <p class="text-xs font-bold text-gray-700 dark:text-gray-300">{log.student_name || '—'}</p>
                  {#if log.enrollment_number}
                    <p class="text-[10px] text-gray-400 font-mono">{log.enrollment_number}</p>
                  {/if}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                  {log.document_name || log.ip_address || '—'}
                  {#if log.document_type}
                    <span class="text-[10px] text-gray-400"> ({log.document_type})</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-[10px] text-gray-400 font-mono">{log.ip_address || '—'}</td>
              </tr>
            {/each}
            {#if filteredLogs.length === 0}
              <tr>
                <td colspan="6" class="p-8 text-center text-sm text-gray-400">No audit logs found matching your filters.</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-slate-800">
          <p class="text-xs text-gray-500">Page {currentPage} of {totalPages}</p>
          <div class="flex gap-2">
            <button onclick={() => loadLogs(currentPage - 1)} disabled={currentPage <= 1}
              class="px-3 py-1.5 text-xs font-bold bg-gray-100 rounded-lg disabled:opacity-50">Prev</button>
            <button onclick={() => loadLogs(currentPage + 1)} disabled={currentPage >= totalPages}
              class="px-3 py-1.5 text-xs font-bold bg-gray-100 rounded-lg disabled:opacity-50">Next</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
{/if}
