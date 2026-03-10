<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let requests = $state<any[]>([]);
  let loading  = $state(true);
  let filter   = $state<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  let acting   = $state<string | null>(null);
  let toast    = $state('');

  async function fetchRequests() {
    loading = true;
    try {
      const params = filter !== 'ALL' ? `?status=${filter}` : '';
      const res = await fetch(`/api/academic/faculty/leave-requests${params}`);
      if (res.ok) requests = await res.json();
    } catch { } finally { loading = false; }
  }

  async function decide(id: string, approval_status: 'APPROVED' | 'REJECTED') {
    acting = id;
    try {
      const res = await fetch(`/api/academic/faculty/leave-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status })
      });
      if (res.ok) {
        requests = requests.map(r => r.id === id ? { ...r, approval_status } : r);
        toast = `Request ${approval_status.toLowerCase()}.`;
        setTimeout(() => toast = '', 3000);
        if (filter !== 'ALL') await fetchRequests();
      }
    } catch { } finally { acting = null; }
  }

  $effect(() => { filter; fetchRequests(); });
  onMount(fetchRequests);

  function leaveTypeColor(type: string) {
    if (type === 'SICK')   return 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400';
    if (type === 'EARNED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    if (type === 'DUTY')   return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
    return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
  }

  function statusStyle(s: string) {
    if (s === 'APPROVED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20';
    if (s === 'REJECTED') return 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20';
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20';
  }

  const pendingCount = $derived(requests.filter(r => r.approval_status === 'PENDING').length);
</script>

<div class="space-y-6" in:fade>

  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Leave <span class="text-indigo-600">Management</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Review and approve faculty leave requests</p>
    </div>
    {#if pendingCount > 0}
      <div class="flex items-center gap-2 px-5 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl">
        <span class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
        <span class="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">{pendingCount} Pending</span>
      </div>
    {/if}
  </div>

  <!-- Filter Tabs -->
  <div class="flex gap-1.5 p-1.5 bg-gray-100/50 dark:bg-slate-800/50 rounded-2xl w-fit">
    {#each (['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const) as tab}
      <button
        onclick={() => filter = tab}
        class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
          {filter === tab ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
      >{tab}</button>
    {/each}
  </div>

  <!-- Content -->
  {#if loading}
    <div class="flex flex-col items-center justify-center py-24">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
      <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading requests...</p>
    </div>
  {:else if requests.length === 0}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] flex flex-col items-center justify-center text-center">
      <div class="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-full mb-6 flex items-center justify-center">
        <svg class="w-9 h-9 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      </div>
      <p class="text-sm font-black text-gray-900 dark:text-white">No {filter !== 'ALL' ? filter.toLowerCase() : ''} requests</p>
      <p class="text-[10px] uppercase tracking-widest text-gray-400 mt-2">All caught up</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each requests as req, i}
        <div
          class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] shadow-sm flex flex-col sm:flex-row sm:items-center gap-5 hover:shadow-md transition-all"
          in:fly={{ y: 15, delay: i * 40 }}
        >
          <!-- Faculty Info -->
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <div class="w-11 h-11 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-base shrink-0">
              {req.faculty_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '??'}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-black text-gray-900 dark:text-white truncate">{req.faculty_name ?? 'Unknown'}</p>
              <p class="text-[10px] text-gray-400 font-medium mt-0.5">{req.department ?? ''} · {req.employee_code ?? ''}</p>
            </div>
          </div>

          <!-- Leave Details -->
          <div class="flex items-center gap-3 flex-wrap">
            <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {leaveTypeColor(req.leave_type)}">{req.leave_type}</span>
            <div class="text-center">
              <p class="text-xs font-black text-gray-900 dark:text-white">
                {new Date(req.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            {#if req.reason}
              <p class="text-xs text-gray-500 font-medium max-w-[200px] truncate" title={req.reason}>{req.reason}</p>
            {/if}
          </div>

          <!-- Status + Actions -->
          <div class="flex items-center gap-3 shrink-0">
            <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {statusStyle(req.approval_status)}">{req.approval_status}</span>

            {#if req.approval_status === 'PENDING'}
              <button
                onclick={() => decide(req.id, 'APPROVED')}
                disabled={acting === req.id}
                class="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-600/20"
              >
                {acting === req.id ? '...' : 'Approve'}
              </button>
              <button
                onclick={() => decide(req.id, 'REJECTED')}
                disabled={acting === req.id}
                class="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-all disabled:opacity-50"
              >
                Reject
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Toast -->
{#if toast}
  <div class="fixed bottom-8 right-8 z-50 px-6 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl shadow-2xl text-sm font-black" transition:fly={{ y: 20 }}>
    {toast}
  </div>
{/if}
