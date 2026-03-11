<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";

  let sessions = $state<any[]>([]);
  let loading = $state(true);
  let viewMode = $state<'daily' | 'weekly'>('daily');
  let selectedDate = $state(new Date().toISOString().split('T')[0]);

  $effect(() => {
    loadSchedule();
  });

  async function loadSchedule() {
    loading = true;
    try {
      const params = viewMode === 'weekly'
        ? `?date=${selectedDate}&view=week`
        : `?date=${selectedDate}`;
      const res = await fetch(`/api/faculty/schedule${params}`);
      if (res.ok) sessions = await res.json();
    } catch {}
    loading = false;
  }

  function changeDate(days: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    selectedDate = d.toISOString().split('T')[0];
  }

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    return `${h12}:${m} ${ampm}`;
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-500 text-white';
      case 'MISSED': return 'bg-rose-500 text-white';
      case 'CANCELLED': return 'bg-gray-400 text-white';
      default: return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600';
    }
  }

  function getDeliveryBadge(mode: string) {
    return mode === 'ONLINE' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : 'bg-gray-50 dark:bg-gray-500/10 text-gray-500';
  }

  async function markConducted(sessionId: string) {
    try {
      await fetch(`/api/academic/scheduling/sessions/${sessionId}/mark-conducted`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      loadSchedule();
    } catch {}
  }

  // Group sessions by date for weekly view
  const sessionsByDate = $derived(() => {
    const map = new Map<string, any[]>();
    for (const s of sessions) {
      const date = typeof s.session_date === 'string' ? s.session_date.split('T')[0] : s.session_date;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(s);
    }
    // Sort each day's sessions by start time
    for (const [, arr] of map) arr.sort((a: any, b: any) => (a.slot_start || '').localeCompare(b.slot_start || ''));
    return map;
  });

  const today = new Date().toISOString().split('T')[0];
</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight">My <span class="text-indigo-600">Timetable</span></h1>
      <p class="text-sm text-gray-500 mt-1">Your scheduled sessions and classes</p>
    </div>
    <div class="flex items-center gap-3">
      <!-- View Toggle -->
      <div class="p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl flex gap-1">
        <button onclick={() => viewMode = 'daily'} class="px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {viewMode === 'daily' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-gray-500'}">Daily</button>
        <button onclick={() => viewMode = 'weekly'} class="px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {viewMode === 'weekly' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-gray-500'}">Weekly</button>
      </div>

      <!-- Date Nav -->
      <button onclick={() => changeDate(viewMode === 'weekly' ? -7 : -1)} class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
      </button>
      <input type="date" bind:value={selectedDate} class="px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-black" />
      <button onclick={() => changeDate(viewMode === 'weekly' ? 7 : 1)} class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
      </button>
      <button onclick={() => { selectedDate = today; }} class="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-100 transition-all">Today</button>
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  {:else if sessions.length === 0}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] text-center">
      <svg class="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      <p class="text-gray-400 font-bold text-sm">No sessions scheduled {viewMode === 'weekly' ? 'this week' : 'for this date'}</p>
    </div>
  {:else}

    {#if viewMode === 'daily'}
      <!-- Daily View -->
      <div class="space-y-4">
        {#each sessions as session, i}
          <div class="flex gap-4 p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] hover:shadow-md transition-all" in:fly={{ y: 10, delay: i * 40 }}>
            <!-- Time -->
            <div class="w-24 shrink-0 text-right pt-1">
              <p class="text-lg font-black text-gray-900 dark:text-white leading-none">{formatTime(session.slot_start)}</p>
              <p class="text-[10px] text-gray-400 font-bold mt-1">{formatTime(session.slot_end)}</p>
            </div>

            <div class="w-1 rounded-full bg-indigo-600 shrink-0"></div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <h3 class="text-base font-black text-gray-900 dark:text-white">{session.subject_name}</h3>
                {#if session.subject_code}
                  <span class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded text-[9px] font-black">{session.subject_code}</span>
                {/if}
                <span class="px-2 py-0.5 rounded text-[9px] font-black {getDeliveryBadge(session.delivery_mode)}">{session.delivery_mode}</span>
              </div>
              <p class="text-xs text-gray-500 font-bold">
                {session.section_name} · {session.room_name}{session.building ? `, ${session.building}` : ''}
              </p>
              {#if session.planned_topic}
                <p class="text-xs text-gray-400 mt-2 leading-relaxed">{session.planned_topic}</p>
              {/if}
            </div>

            <!-- Status + Actions -->
            <div class="flex flex-col items-end gap-2 shrink-0">
              <span class="px-3 py-1 rounded-xl text-[9px] font-black uppercase {getStatusColor(session.session_status)}">{session.session_status}</span>
              {#if session.session_status === 'SCHEDULED'}
                <button onclick={() => markConducted(session.id)} class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-xl text-[9px] font-black uppercase hover:bg-emerald-100 transition-all">
                  Mark Done
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

    {:else}
      <!-- Weekly View -->
      <div class="space-y-6">
        {#each [...sessionsByDate().entries()] as [date, daySessions], i}
          <div in:fly={{ y: 10, delay: i * 50 }}>
            <div class="flex items-center gap-3 mb-3">
              <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{formatDate(date)}</h3>
              {#if date === today}
                <span class="px-2 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-black">TODAY</span>
              {/if}
              <div class="flex-1 h-px bg-gray-100 dark:bg-slate-800"></div>
              <span class="text-[10px] text-gray-400 font-bold">{daySessions.length} session{daySessions.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {#each daySessions as session}
                <div class="p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-md transition-all">
                  <div class="flex items-center justify-between mb-2">
                    <p class="text-xs font-black text-gray-900 dark:text-white">{formatTime(session.slot_start)} - {formatTime(session.slot_end)}</p>
                    <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase {getStatusColor(session.session_status)}">{session.session_status}</span>
                  </div>
                  <p class="text-sm font-black text-indigo-600 truncate">{session.subject_name}</p>
                  <p class="text-[10px] text-gray-400 font-bold mt-1">{session.section_name} · {session.room_name || 'TBD'}</p>
                  {#if session.planned_topic}
                    <p class="text-[10px] text-gray-400 mt-1 truncate">{session.planned_topic}</p>
                  {/if}
                  {#if session.session_status === 'SCHEDULED'}
                    <button onclick={() => markConducted(session.id)} class="mt-2 w-full py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-xl text-[9px] font-black uppercase hover:bg-emerald-100 transition-all text-center">
                      Mark Done
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
