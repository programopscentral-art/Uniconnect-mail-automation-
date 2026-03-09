<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let schedules = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let activeView = $state<'today' | 'pending'>('today');
  let markingId = $state<string | null>(null);
  let reportingId = $state<string | null>(null);

  async function fetchMySchedule() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/faculty/schedule');
      if (!res.ok) throw new Error('Failed to load schedule');
      schedules = await res.json();
    } catch (e: any) {
      error = e.message ?? 'Could not load schedule';
      schedules = [];
    } finally {
      loading = false;
    }
  }

  async function markConducted(sessionId: string) {
    markingId = sessionId;
    try {
      const res = await fetch(`/api/academic/scheduling/sessions/${sessionId}/mark-conducted`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      if (res.ok) {
        schedules = schedules.map(s =>
          s.id === sessionId ? { ...s, status: 'COMPLETED' } : s
        );
      }
    } catch {
      // Silently fail — will retry on next load
    } finally {
      markingId = null;
    }
  }

  onMount(fetchMySchedule);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  function statusBadge(status: string) {
    switch (status?.toUpperCase()) {
      case 'COMPLETED': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'IN_PROGRESS': return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'CANCELLED': return 'bg-gray-100 dark:bg-gray-700 text-gray-500';
      default: return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
    }
  }
</script>

<div class="space-y-8" in:fade>
  <!-- Header Banner -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-600/20 overflow-hidden relative gap-4">
    <div class="absolute -right-20 -top-20 w-60 h-60 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="relative z-10">
      <p class="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Faculty Portal</p>
      <h2 class="text-2xl sm:text-3xl font-black tracking-tight">
        Academic <span class="bg-white text-indigo-600 px-3 py-1 rounded-2xl ml-1">Workspace</span>
      </h2>
      <p class="text-indigo-200 text-xs font-medium mt-2">{today}</p>
    </div>
    <div class="flex gap-3 relative z-10 shrink-0">
      <button
        onclick={() => activeView = 'today'}
        class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
               {activeView === 'today' ? 'bg-white text-indigo-600 shadow-lg' : 'text-indigo-100 hover:text-white hover:bg-white/10'}"
      >
        My Sessions
      </button>
      <button
        onclick={() => activeView = 'pending'}
        class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
               {activeView === 'pending' ? 'bg-white text-indigo-600 shadow-lg' : 'text-indigo-100 hover:text-white hover:bg-white/10'}"
      >
        Pending Tasks
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Session Timeline -->
    <div class="lg:col-span-2 space-y-6">
      <h3 class="text-xl font-black text-gray-900 dark:text-white px-1">
        {#if activeView === 'today'}
          Today's <span class="text-indigo-600">Sessions</span>
        {:else}
          Pending <span class="text-amber-500">Action Items</span>
        {/if}
      </h3>

      {#if activeView === 'today'}
        {#if loading}
          <div class="p-20 flex flex-col items-center justify-center">
            <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading schedule...</p>
          </div>
        {:else if error}
          <div class="p-12 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-[3rem] flex flex-col items-center text-center">
            <div class="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-4">
              <svg class="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white">Could not load schedule</p>
            <p class="text-xs text-gray-400 mt-1">{error}</p>
            <button
              onclick={fetchMySchedule}
              class="mt-4 px-5 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all"
            >
              Retry
            </button>
          </div>
        {:else if schedules.length === 0}
          <div class="p-20 bg-white dark:bg-slate-900 rounded-[3rem] border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-full mb-6 flex items-center justify-center">
              <svg class="w-9 h-9 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <p class="text-sm font-black text-gray-900 dark:text-white">No Sessions Today</p>
            <p class="text-[10px] uppercase tracking-widest text-gray-400 mt-2">Your schedule is clear for today</p>
          </div>
        {:else}
          <div class="space-y-4">
            {#each schedules as session, i}
              <div
                class="p-6 sm:p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:shadow-xl hover:shadow-indigo-600/5 transition-all"
                in:fly={{ y: 20, delay: i * 60 }}
              >
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
                  <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {statusBadge(session.status)}">
                    {session.status === 'COMPLETED' ? 'Conducted' : session.status === 'IN_PROGRESS' ? 'Ongoing' : 'Upcoming'}
                  </span>

                  {#if session.status !== 'COMPLETED' && session.status !== 'CANCELLED'}
                    <button
                      onclick={() => markConducted(session.id)}
                      disabled={markingId === session.id}
                      class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                      {markingId === session.id ? '...' : 'Mark Conducted'}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <!-- Pending Tasks View -->
        <div class="space-y-4">
          <div class="p-6 bg-white dark:bg-slate-900 border border-orange-100 dark:border-orange-500/20 rounded-[2.5rem] shadow-sm flex items-center justify-between group transition-all hover:shadow-md">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
                <span class="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse"></span>
              </div>
              <div>
                <p class="text-sm font-black text-gray-900 dark:text-white">Upload Marks</p>
                <p class="text-[10px] text-gray-400 font-medium mt-0.5">Pending marks submission for your courses</p>
              </div>
            </div>
            <a
              href="/assessments"
              class="px-4 py-2 bg-orange-50 dark:bg-orange-500/10 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 hover:text-white transition-all"
            >
              Go to Exams
            </a>
          </div>

          <div class="p-12 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-700 rounded-[2.5rem] flex flex-col items-center text-center opacity-50">
            <p class="text-xs font-black text-gray-500 uppercase tracking-widest">More action items will appear here</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Right Sidebar -->
    <div class="space-y-6">
      <!-- Summary Card -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-6">
          Today's <span class="text-indigo-600">Summary</span>
        </h3>
        <div class="space-y-4">
          <div class="flex items-center justify-between py-3 border-b border-gray-50 dark:border-slate-800">
            <span class="text-xs font-bold text-gray-500">Total Sessions</span>
            <span class="text-sm font-black text-gray-900 dark:text-white">{loading ? '—' : schedules.length}</span>
          </div>
          <div class="flex items-center justify-between py-3 border-b border-gray-50 dark:border-slate-800">
            <span class="text-xs font-bold text-gray-500">Conducted</span>
            <span class="text-sm font-black text-emerald-600">{loading ? '—' : schedules.filter(s => s.status === 'COMPLETED').length}</span>
          </div>
          <div class="flex items-center justify-between py-3">
            <span class="text-xs font-bold text-gray-500">Remaining</span>
            <span class="text-sm font-black text-amber-600">{loading ? '—' : schedules.filter(s => s.status !== 'COMPLETED' && s.status !== 'CANCELLED').length}</span>
          </div>
        </div>
      </div>

      <!-- Leave Request CTA -->
      <a
        href="/academic-operations/faculty-ops"
        class="w-full p-8 bg-indigo-50/50 dark:bg-indigo-500/5 border-2 border-dashed border-indigo-200 dark:border-indigo-500/20 rounded-[3rem] flex flex-col items-center justify-center gap-3 group hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all"
      >
        <div class="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl shadow-lg flex items-center justify-center group-hover:scale-110 transition-all">
          <svg class="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Submit Leave Request</span>
      </a>
    </div>
  </div>
</div>
