<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { page } from '$app/stores';

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  let requests = $state<any[]>([]);
  let loading  = $state(true);
  let filter   = $state<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  let acting   = $state<string | null>(null);
  let toast    = $state('');

  // Substitute assignment panel
  let showSubPanel = $state(false);
  let subPanelReq  = $state<any>(null);
  let substitutes  = $state<any[]>([]);
  let subLoading   = $state(false);
  let selectedSub  = $state('');

  async function fetchRequests() {
    loading = true;
    try {
      const p = new URLSearchParams();
      if (filter !== 'ALL') p.set('status', filter);
      if (universityId) p.set('universityId', universityId);
      const res = await fetch(`/api/academic/faculty/leave-requests${p.toString() ? '?' + p : ''}`);
      if (res.ok) requests = await res.json();
    } catch { } finally { loading = false; }
  }

  async function openApprove(req: any) {
    // Central approval (3+ days) → show substitute panel
    if (req.approval_level === 'CENTRAL') {
      subPanelReq = req;
      selectedSub = '';
      showSubPanel = true;
      subLoading = true;
      try {
        const res = await fetch(`/api/academic/faculty/leave-requests/${req.id}/substitutes`);
        if (res.ok) substitutes = await res.json();
        else substitutes = [];
      } catch { substitutes = []; }
      finally { subLoading = false; }
    } else {
      await decide(req.id, 'APPROVED', null);
    }
  }

  async function decide(id: string, approval_status: 'APPROVED' | 'REJECTED', substitute_faculty_profile_id: string | null) {
    acting = id;
    showSubPanel = false;
    try {
      const res = await fetch(`/api/academic/faculty/leave-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status, substitute_faculty_profile_id })
      });
      if (res.ok) {
        requests = requests.map(r => r.id === id ? { ...r, approval_status, substitute_faculty_profile_id } : r);
        const subName = substitutes.find(s => s.id === substitute_faculty_profile_id)?.name;
        toast = `${approval_status === 'APPROVED' ? 'Approved' : 'Rejected'}${subName ? ` — ${subName} assigned as substitute` : ''}.`;
        setTimeout(() => toast = '', 4000);
        if (filter !== 'ALL') await fetchRequests();
      }
    } catch { } finally { acting = null; }
  }

  $effect(() => { filter; universityId; fetchRequests(); });
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

  function levelBadge(level: string) {
    if (level === 'CENTRAL') return 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700/30';
    return 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700/30';
  }

  function levelLabel(level: string) {
    return level === 'CENTRAL' ? 'Central Approval' : 'CO Approval';
  }

  const pendingCount = $derived(requests.filter(r => r.approval_status === 'PENDING').length);
  const centralPending = $derived(requests.filter(r => r.approval_status === 'PENDING' && r.approval_level === 'CENTRAL').length);
</script>

<div class="space-y-6" in:fade>

  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Leave <span class="text-indigo-600">Management</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Review and approve faculty leave requests</p>
    </div>
    <div class="flex gap-3 flex-wrap">
      {#if centralPending > 0}
        <div class="flex items-center gap-2 px-5 py-3 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-2xl">
          <span class="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
          <span class="text-xs font-black text-purple-700 dark:text-purple-400 uppercase tracking-widest">{centralPending} Central</span>
        </div>
      {/if}
      {#if pendingCount > 0}
        <div class="flex items-center gap-2 px-5 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl">
          <span class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
          <span class="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">{pendingCount} Pending</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Approval Level Legend -->
  <div class="flex gap-4 flex-wrap text-xs">
    <div class="flex items-center gap-2 px-3 py-2 bg-sky-50 dark:bg-sky-900/10 rounded-xl border border-sky-100 dark:border-sky-800/30">
      <span class="text-[9px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">CO Approval</span>
      <span class="text-sky-500 font-medium">= 1–2 days, department-level</span>
    </div>
    <div class="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/30">
      <span class="text-[9px] font-black uppercase tracking-widest text-purple-700 dark:text-purple-300">Central Approval</span>
      <span class="text-purple-500 font-medium">= 3+ days, requires substitute assignment</span>
    </div>
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
          class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] shadow-sm hover:shadow-md transition-all"
          in:fly={{ y: 15, delay: i * 40 }}
        >
          <div class="flex flex-col sm:flex-row sm:items-center gap-5">
            <!-- Faculty Info -->
            <div class="flex items-center gap-4 flex-1 min-w-0">
              <div class="w-11 h-11 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-base shrink-0">
                {req.faculty_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '??'}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-sm font-black text-gray-900 dark:text-white truncate">{req.faculty_name ?? 'Unknown'}</p>
                  {#if req.approval_level}
                    <span class="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg {levelBadge(req.approval_level)}">{levelLabel(req.approval_level)}</span>
                  {/if}
                </div>
                <p class="text-[10px] text-gray-400 font-medium mt-0.5">{req.department ?? ''} · {req.employee_code ?? ''}</p>
              </div>
            </div>

            <!-- Leave Details -->
            <div class="flex items-center gap-3 flex-wrap">
              <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {leaveTypeColor(req.leave_type)}">{req.leave_type}</span>
              <div>
                <p class="text-xs font-black text-gray-900 dark:text-white">
                  {new Date(req.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {#if req.leave_end_date && req.leave_end_date !== req.leave_date}
                    <span class="text-gray-400 font-medium"> – {new Date(req.leave_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  {/if}
                </p>
                {#if req.total_days > 1}
                  <p class="text-[9px] font-black text-amber-600 mt-0.5">{req.total_days} days</p>
                {/if}
              </div>
              {#if req.reason}
                <p class="text-xs text-gray-500 font-medium max-w-[180px] truncate" title={req.reason}>{req.reason}</p>
              {/if}
            </div>

            <!-- Status + Actions -->
            <div class="flex items-center gap-3 shrink-0 flex-wrap">
              <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {statusStyle(req.approval_status)}">{req.approval_status}</span>

              {#if req.approval_status === 'PENDING'}
                <button
                  onclick={() => openApprove(req)}
                  disabled={acting === req.id}
                  class="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                >
                  {acting === req.id ? '...' : req.approval_level === 'CENTRAL' ? 'Approve + Assign' : 'Approve'}
                </button>
                <button
                  onclick={() => decide(req.id, 'REJECTED', null)}
                  disabled={acting === req.id}
                  class="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-all disabled:opacity-50"
                >
                  Reject
                </button>
              {/if}
            </div>
          </div>

          <!-- Substitute assigned -->
          {#if req.substitute_name}
            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
              <p class="text-[10px] font-bold text-gray-500">Substitute: <span class="text-emerald-600 font-black">{req.substitute_name}</span></p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Substitute Assignment Panel (Central approval only) -->
{#if showSubPanel && subPanelReq}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" transition:fade={{ duration: 150 }} onclick={() => showSubPanel = false}></div>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-6" transition:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg p-8" transition:fly={{ y: 20, duration: 250 }}>
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-xl font-black text-gray-900 dark:text-white">Approve & Assign Substitute</h3>
          <p class="text-xs font-medium text-gray-400 mt-1">{subPanelReq.faculty_name} · {subPanelReq.total_days} days</p>
        </div>
        <button onclick={() => showSubPanel = false} class="w-8 h-8 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="mb-6">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
          Substitute Faculty
          <span class="normal-case font-medium text-gray-400 ml-1">(optional — can assign later)</span>
        </p>
        {#if subLoading}
          <div class="flex justify-center py-8"><div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full"></div></div>
        {:else if substitutes.length === 0}
          <div class="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-800/30">
            <p class="text-xs font-bold text-amber-700 dark:text-amber-400">No faculty with substitute eligibility found for this faculty's subjects.</p>
            <p class="text-[10px] text-amber-600/70 mt-1">Set "Can Substitute" on faculty subject assignments in Profiles to enable this.</p>
          </div>
        {:else}
          <div class="space-y-2 max-h-56 overflow-y-auto">
            <label class="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
              <input type="radio" bind:group={selectedSub} value="" class="accent-indigo-600" />
              <span class="text-xs font-bold text-gray-500 italic">No substitute (assign later)</span>
            </label>
            {#each substitutes as sub}
              <label class="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-slate-800 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors {selectedSub === sub.id ? 'ring-2 ring-indigo-500' : ''}">
                <input type="radio" bind:group={selectedSub} value={sub.id} class="accent-indigo-600" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-black text-gray-900 dark:text-white">{sub.name}</p>
                  <p class="text-[9px] font-bold text-gray-400">{sub.department || '—'} · {sub.employee_code || ''}</p>
                </div>
                <div class="text-right">
                  <p class="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Can teach</p>
                  <p class="text-[9px] text-gray-500">{(sub.shared_subjects || []).slice(0, 2).join(', ')}</p>
                </div>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="flex gap-3">
        <button
          onclick={() => decide(subPanelReq.id, 'APPROVED', selectedSub || null)}
          class="flex-1 py-3.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
        >
          Confirm Approval
        </button>
        <button
          onclick={() => showSubPanel = false}
          class="px-6 py-3.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-gray-200 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast -->
{#if toast}
  <div class="fixed bottom-8 right-8 z-50 px-6 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl shadow-2xl text-sm font-black" transition:fly={{ y: 20 }}>
    {toast}
  </div>
{/if}
