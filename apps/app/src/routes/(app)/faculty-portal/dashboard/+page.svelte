<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let schedules = $state<any[]>([]);
  let loading = $state(true);
  let fetchError = $state<string | null>(null);
  let activeView = $state<'today' | 'pending'>('today');
  let markingId = $state<string | null>(null);

  // Leave request
  let showLeavePanel = $state(false);
  let leaveHistory = $state<any[]>([]);
  let leaveHistoryLoading = $state(false);
  let leaveForm = $state({ leave_type: 'CASUAL', leave_date: '', reason: '' });
  let leaveSubmitting = $state(false);
  let leaveError = $state('');
  let leaveSuccess = $state('');

  const leaveTypes = [
    { key: 'CASUAL', label: 'Casual' },
    { key: 'SICK',   label: 'Sick' },
    { key: 'EARNED', label: 'Earned' },
    { key: 'DUTY',   label: 'On Duty' },
  ];

  function leaveLabel(type: string) {
    return leaveTypes.find(t => t.key === type)?.label ?? type;
  }

  function statusStyle(s: string) {
    if (s === 'APPROVED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    if (s === 'REJECTED') return 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400';
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }

  function sessionBadge(status: string) {
    if (status === 'COMPLETED')   return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    if (status === 'IN_PROGRESS') return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400';
    if (status === 'CANCELLED')   return 'bg-gray-100 dark:bg-gray-700 text-gray-500';
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }

  const conducted = $derived(schedules.filter(s => s.status === 'COMPLETED').length);
  const remaining = $derived(schedules.filter(s => s.status !== 'COMPLETED' && s.status !== 'CANCELLED').length);
  const todayStr  = new Date().toISOString().split('T')[0];
  const today     = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function fetchMySchedule() {
    loading = true; fetchError = null;
    try {
      const res = await fetch('/api/faculty/schedule');
      if (!res.ok) throw new Error('Failed to load schedule');
      schedules = await res.json();
    } catch (e: any) {
      fetchError = e.message ?? 'Could not load schedule';
      schedules = [];
    } finally { loading = false; }
  }

  async function fetchLeaveHistory() {
    leaveHistoryLoading = true;
    try {
      const res = await fetch('/api/academic/faculty/leave-requests');
      if (res.ok) leaveHistory = await res.json();
    } catch { } finally { leaveHistoryLoading = false; }
  }

  async function markConducted(sessionId: string) {
    markingId = sessionId;
    try {
      const res = await fetch(`/api/academic/scheduling/sessions/${sessionId}/mark-conducted`, { method: 'PATCH' });
      if (res.ok) schedules = schedules.map(s => s.id === sessionId ? { ...s, status: 'COMPLETED' } : s);
    } catch { } finally { markingId = null; }
  }

  async function submitLeaveRequest() {
    leaveError = ''; leaveSuccess = '';
    if (!leaveForm.leave_date) { leaveError = 'Please select a date.'; return; }
    leaveSubmitting = true;
    try {
      const res = await fetch('/api/academic/faculty/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveForm)
      });
      const data = await res.json();
      if (res.ok) {
        leaveSuccess = 'Request submitted — pending approval.';
        leaveForm = { leave_type: 'CASUAL', leave_date: '', reason: '' };
        leaveHistory = [data, ...leaveHistory];
      } else {
        leaveError = data?.message || 'Submission failed.';
      }
    } catch { leaveError = 'Network error. Please try again.'; }
    finally { leaveSubmitting = false; }
  }

  function openLeavePanel() {
    showLeavePanel = true; leaveError = ''; leaveSuccess = '';
    fetchLeaveHistory();
  }

  onMount(fetchMySchedule);
</script>

<div class="space-y-8" in:fade>

  <!-- Header Banner -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-600/20 overflow-hidden relative gap-4">
    <div class="absolute -right-20 -top-20 w-60 h-60 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="relative z-10">
      <p class="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Faculty Portal</p>
      <h2 class="text-2xl sm:text-3xl font-black tracking-tight">Academic <span class="bg-white text-indigo-600 px-3 py-1 rounded-2xl ml-1">Workspace</span></h2>
      <p class="text-indigo-200 text-xs font-medium mt-2">{today}</p>
    </div>
    <div class="flex gap-3 relative z-10 shrink-0">
      <button onclick={() => activeView = 'today'}   class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {activeView === 'today'   ? 'bg-white text-indigo-600 shadow-lg' : 'text-indigo-100 hover:bg-white/10'}">My Sessions</button>
      <button onclick={() => activeView = 'pending'} class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {activeView === 'pending' ? 'bg-white text-indigo-600 shadow-lg' : 'text-indigo-100 hover:bg-white/10'}">Pending Tasks</button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

    <!-- Session Timeline -->
    <div class="lg:col-span-2 space-y-6">
      <h3 class="text-xl font-black text-gray-900 dark:text-white px-1">
        {#if activeView === 'today'}Today's <span class="text-indigo-600">Sessions</span>
        {:else}Pending <span class="text-amber-500">Action Items</span>{/if}
      </h3>

      {#if activeView === 'today'}
        {#if loading}
          <div class="p-20 flex flex-col items-center justify-center">
            <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading schedule...</p>
          </div>
        {:else if fetchError}
          <div class="p-12 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-[3rem] flex flex-col items-center text-center">
            <p class="text-sm font-black text-gray-900 dark:text-white">Could not load schedule</p>
            <p class="text-xs text-gray-400 mt-1">{fetchError}</p>
            <button onclick={fetchMySchedule} class="mt-4 px-5 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all">Retry</button>
          </div>
        {:else if schedules.length === 0}
          <div class="p-20 bg-white dark:bg-slate-900 rounded-[3rem] border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-full mb-6 flex items-center justify-center">
              <svg class="w-9 h-9 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white">No Sessions Today</p>
            <p class="text-[10px] uppercase tracking-widest text-gray-400 mt-2">Your schedule is clear for today</p>
          </div>
        {:else}
          <div class="space-y-4">
            {#each schedules as session, i}
              <div class="p-6 sm:p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:shadow-xl hover:shadow-indigo-600/5 transition-all" in:fly={{ y: 20, delay: i * 60 }}>
                <div class="flex items-center gap-6 flex-1 min-w-0">
                  <div class="flex flex-col items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl min-w-[90px] shrink-0">
                    <p class="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{session.start_time}</p>
                    <div class="w-4 h-0.5 bg-indigo-200 dark:bg-indigo-500/30 rounded-full my-1"></div>
                    <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{session.end_time}</p>
                  </div>
                  <div class="min-w-0">
                    <h4 class="text-base font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-all uppercase tracking-tight truncate">{session.subject_name}</h4>
                    <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{session.section_name}</span>
                      <span class="w-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></span>
                      <span class="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{session.room_code}</span>
                      {#if session.session_type && session.session_type !== 'LECTURE'}
                        <span class="text-[9px] font-black text-violet-500 uppercase tracking-widest px-2 py-0.5 bg-violet-50 dark:bg-violet-500/10 rounded-full">{session.session_type}</span>
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {sessionBadge(session.status)}">
                    {session.status === 'COMPLETED' ? 'Conducted' : session.status === 'IN_PROGRESS' ? 'Ongoing' : 'Upcoming'}
                  </span>
                  {#if session.status !== 'COMPLETED' && session.status !== 'CANCELLED'}
                    <button onclick={() => markConducted(session.id)} disabled={markingId === session.id} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-wait">
                      {markingId === session.id ? '...' : 'Mark Conducted'}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

      {:else}
        <div class="space-y-4">
          <div class="p-6 bg-white dark:bg-slate-900 border border-orange-100 dark:border-orange-500/20 rounded-[2.5rem] shadow-sm flex items-center justify-between hover:shadow-md transition-all">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
                <span class="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse"></span>
              </div>
              <div>
                <p class="text-sm font-black text-gray-900 dark:text-white">Upload Marks</p>
                <p class="text-[10px] text-gray-400 font-medium mt-0.5">Pending marks submission for your courses</p>
              </div>
            </div>
            <a href="/assessments" class="px-4 py-2 bg-orange-50 dark:bg-orange-500/10 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 hover:text-white transition-all">Go to Exams</a>
          </div>
          <div class="p-12 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-700 rounded-[2.5rem] flex flex-col items-center text-center opacity-50">
            <p class="text-xs font-black text-gray-500 uppercase tracking-widest">More action items will appear here</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Right Sidebar -->
    <div class="space-y-5">

      <!-- Today's Summary -->
      <div class="p-7 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5">Today's Summary</p>
        <div class="space-y-3">
          <div class="flex items-center justify-between py-3 border-b border-gray-50 dark:border-slate-800">
            <span class="text-xs font-bold text-gray-500">Total Sessions</span>
            <span class="text-sm font-black text-gray-900 dark:text-white">{loading ? '—' : schedules.length}</span>
          </div>
          <div class="flex items-center justify-between py-3 border-b border-gray-50 dark:border-slate-800">
            <span class="text-xs font-bold text-gray-500">Conducted</span>
            <span class="text-sm font-black text-emerald-600">{loading ? '—' : conducted}</span>
          </div>
          <div class="flex items-center justify-between py-3">
            <span class="text-xs font-bold text-gray-500">Remaining</span>
            <span class="text-sm font-black text-amber-600">{loading ? '—' : remaining}</span>
          </div>
        </div>
      </div>

      <!-- Leave Request CTA -->
      <button onclick={openLeavePanel} class="w-full p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm flex items-center gap-4 group hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-600/5 transition-all text-left">
        <div class="w-11 h-11 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-all shrink-0">
          <svg class="w-5 h-5 text-indigo-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">Leave Requests</p>
          <p class="text-[10px] text-gray-400 font-medium mt-0.5">Apply & track your leave history</p>
        </div>
        <svg class="w-4 h-4 text-gray-300 dark:text-slate-600 shrink-0 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
      </button>

      <!-- Quick Links -->
      <div class="p-7 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Quick Access</p>
        <div class="space-y-1">
          {#each [
            { href: '/assessments', label: 'Examinations',  color: 'violet', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
            { href: '/students',    label: 'My Students',   color: 'emerald', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
            { href: '/tasks',       label: 'My Tasks',      color: 'amber',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
          ] as link}
            <a href={link.href} class="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-all group">
              <div class="w-8 h-8 bg-{link.color}-50 dark:bg-{link.color}-500/10 rounded-xl flex items-center justify-center">
                <svg class="w-4 h-4 text-{link.color}-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={link.icon}/></svg>
              </div>
              <span class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest group-hover:text-{link.color}-600 transition-colors">{link.label}</span>
            </a>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════ Leave Request Slide-in Panel ═══════ -->
{#if showLeavePanel}
  <div class="fixed inset-0 z-50 flex" transition:fade={{ duration: 150 }}>
    <button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => showLeavePanel = false} aria-label="Close"></button>

    <div class="relative ml-auto w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden" transition:fly={{ x: 440, duration: 300 }}>

      <!-- Panel Header -->
      <div class="flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-slate-800 shrink-0">
        <div>
          <h2 class="text-lg font-black text-gray-900 dark:text-white">Leave Request</h2>
          <p class="text-xs text-gray-400 font-medium mt-0.5">Submitted for department approval</p>
        </div>
        <button onclick={() => showLeavePanel = false} class="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">

        <!-- New Request Form -->
        <div class="px-8 py-6 border-b border-gray-100 dark:border-slate-800">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5">Apply for Leave</p>

          <!-- Leave Type -->
          <div class="mb-5">
            <label class="text-xs font-black text-gray-500 uppercase tracking-widest block mb-3">Leave Type</label>
            <div class="grid grid-cols-2 gap-2">
              {#each leaveTypes as t}
                <button
                  onclick={() => leaveForm.leave_type = t.key}
                  class="py-3 px-4 rounded-2xl border-2 text-xs font-black uppercase tracking-widest transition-all
                    {leaveForm.leave_type === t.key
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600'
                      : 'border-gray-100 dark:border-slate-700 text-gray-500 hover:border-gray-300 dark:hover:border-slate-600'}"
                >{t.label}</button>
              {/each}
            </div>
          </div>

          <!-- Date -->
          <div class="mb-5">
            <label class="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Date</label>
            <input type="date" bind:value={leaveForm.leave_date} min={todayStr}
              class="w-full px-5 py-3.5 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all" />
          </div>

          <!-- Reason -->
          <div class="mb-5">
            <label class="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Reason <span class="normal-case font-medium text-gray-400">(optional)</span></label>
            <textarea bind:value={leaveForm.reason} rows="3" placeholder="Brief reason for leave..."
              class="w-full px-5 py-3.5 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 transition-all resize-none"></textarea>
          </div>

          {#if leaveError}
            <div class="mb-4 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
              <p class="text-xs font-bold text-rose-600 dark:text-rose-400">{leaveError}</p>
            </div>
          {/if}
          {#if leaveSuccess}
            <div class="mb-4 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3">
              <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
              <p class="text-xs font-bold text-emerald-700 dark:text-emerald-400">{leaveSuccess}</p>
            </div>
          {/if}

          <button onclick={submitLeaveRequest} disabled={leaveSubmitting}
            class="w-full py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait shadow-lg shadow-indigo-600/20">
            {leaveSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>

        <!-- Leave History -->
        <div class="px-8 py-6">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Recent History</p>
          {#if leaveHistoryLoading}
            <div class="flex justify-center py-8">
              <svg class="w-5 h-5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            </div>
          {:else if leaveHistory.length === 0}
            <p class="text-xs text-gray-400 font-medium text-center py-8">No leave requests yet</p>
          {:else}
            <div class="space-y-3">
              {#each leaveHistory as req, i}
                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-between gap-3" in:fly={{ y: 10, delay: i * 40 }}>
                  <div class="min-w-0">
                    <p class="text-xs font-black text-gray-900 dark:text-white">{leaveLabel(req.leave_type)} Leave</p>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">{new Date(req.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 {statusStyle(req.approval_status)}">{req.approval_status}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  input[type="date"]::-webkit-calendar-picker-indicator { filter: opacity(0.4); cursor: pointer; }
</style>
