<script lang="ts">
  import { page } from "$app/stores";
  import { getContext, onMount } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let sessions = $state<any[]>([]);
  let loading = $state(true);
  let sections = $state<any[]>([]);
  let selectedSection = $state('');
  let selectedDate = $state(new Date().toISOString().split('T')[0]);
  let viewMode = $state<'timeline' | 'list'>('list');

  $effect(() => {
    if (universityId) loadSections();
  });

  $effect(() => {
    if (universityId && selectedSection) loadSessions();
    else if (universityId && !selectedSection) loadAllSessions();
  });

  async function loadSections() {
    try {
      const res = await fetch(`/api/academic/sections?universityId=${universityId}`);
      if (res.ok) sections = await res.json();
    } catch {}
  }

  async function loadSessions() {
    loading = true;
    try {
      const res = await fetch(
        `/api/academic/scheduling/sessions?sectionId=${selectedSection}&startDate=${selectedDate}&endDate=${selectedDate}`
      );
      if (res.ok) sessions = await res.json();
    } catch {}
    loading = false;
  }

  async function loadAllSessions() {
    loading = true;
    try {
      // When no section selected, load overview from today's sessions
      const res = await fetch(`/api/academic/scheduling/overview?universityId=${universityId}`);
      if (res.ok) {
        const data = await res.json();
        sessions = data.todaySessions || [];
      }
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

  function getStatusStyle(status: string) {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-500 text-white shadow-emerald-500/20';
      case 'IN_PROGRESS': return 'bg-indigo-600 text-white shadow-indigo-600/30 animate-pulse';
      case 'MISSED': return 'bg-rose-500 text-white shadow-rose-500/20';
      case 'CANCELLED': return 'bg-gray-400 text-white';
      default: return 'bg-white dark:bg-slate-800 text-gray-500 border border-gray-200 dark:border-slate-700';
    }
  }

  async function markConducted(sessionId: string) {
    try {
      await fetch(`/api/academic/scheduling/sessions/${sessionId}/mark-conducted`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      // Refresh
      if (selectedSection) loadSessions();
      else loadAllSessions();
    } catch {}
  }
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Live <span class="text-violet-600">Sessions</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Real-time view of all scheduled academic sessions.</p>
    </div>
    <div class="flex items-center gap-3">
      <!-- Date Navigation -->
      <button onclick={() => changeDate(-1)} aria-label="Previous day" class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
      </button>
      <input type="date" bind:value={selectedDate} class="px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-black" />
      <button onclick={() => changeDate(1)} aria-label="Next day" class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
      </button>

      <!-- Section Filter -->
      <select bind:value={selectedSection} class="px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold min-w-[150px]">
        <option value="">All Sections</option>
        {#each sections as sec}<option value={sec.id}>{sec.name}</option>{/each}
      </select>

      <!-- View Toggle -->
      <div class="p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl flex gap-1">
        <button onclick={() => viewMode = 'list'} class="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-gray-500'}">List</button>
        <button onclick={() => viewMode = 'timeline'} class="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {viewMode === 'timeline' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-gray-500'}">Grid</button>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-xs text-gray-400 font-bold mt-4">Loading sessions...</p>
    </div>
  {:else if sessions.length === 0}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] text-center">
      <svg class="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      <p class="text-gray-400 font-bold text-sm">No sessions found for this date{selectedSection ? ' and section' : ''}</p>
      <a href="/academic-operations/scheduling/upload" class="text-indigo-600 text-xs font-bold mt-2 inline-block hover:underline">Import a timetable</a>
    </div>
  {:else}

    {#if viewMode === 'list'}
      <!-- List View -->
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] overflow-hidden">
        <div class="divide-y divide-gray-50 dark:divide-slate-800">
          {#each sessions as session, i}
            <div class="flex items-center gap-4 p-5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all" in:fly={{ y: 10, delay: i * 30 }}>
              <div class="w-24 text-right shrink-0">
                <p class="text-sm font-black text-gray-900 dark:text-white">{formatTime(session.slot_start)}</p>
                <p class="text-[10px] text-gray-400">{formatTime(session.slot_end)}</p>
              </div>
              <div class="w-px h-12 bg-gray-200 dark:bg-slate-700"></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <p class="text-sm font-black text-gray-900 dark:text-white truncate">{session.subject_name || 'Unnamed'}</p>
                  {#if session.subject_code}
                    <span class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded text-[9px] font-black shrink-0">{session.subject_code}</span>
                  {/if}
                  {#if session.delivery_mode === 'ONLINE'}
                    <span class="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded text-[9px] font-black shrink-0">ONLINE</span>
                  {/if}
                </div>
                <p class="text-[10px] text-gray-400 font-bold">
                  {session.section_name || '—'} · {session.faculty_name || '—'} · {session.room_name || 'No Room'}
                </p>
                {#if session.planned_topic}
                  <p class="text-[10px] text-gray-500 mt-1 truncate">{session.planned_topic}</p>
                {/if}
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-sm {getStatusStyle(session.session_status)}">{session.session_status}</span>
                {#if session.session_status === 'SCHEDULED'}
                  <button onclick={() => markConducted(session.id)} class="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-xl text-[9px] font-black uppercase hover:bg-emerald-100 transition-all">
                    Mark Done
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <!-- Grid/Timeline View -->
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-6 overflow-x-auto">
        <div class="grid grid-cols-[auto_repeat(8,1fr)] gap-2 min-w-[900px]">
          <!-- Header -->
          <div class="p-2"></div>
          {#each [...new Set(sessions.map(s => `${s.slot_start}-${s.slot_end}`))] as slot}
            {@const [start, end] = slot.split('-')}
            <div class="p-2 text-center">
              <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{formatTime(start)}</p>
              <p class="text-[8px] text-gray-300">{formatTime(end)}</p>
            </div>
          {/each}

          <!-- Rows by section -->
          {#each [...new Set(sessions.map(s => s.section_name || 'Unknown'))] as sectionName}
            <div class="p-2 flex items-center">
              <span class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tighter">{sectionName}</span>
            </div>
            {#each [...new Set(sessions.map(s => `${s.slot_start}-${s.slot_end}`))] as slot}
              {@const [start, end] = slot.split('-')}
              {@const session = sessions.find(s => s.section_name === sectionName && s.slot_start === start && s.slot_end === end)}
              <div class="p-2">
                {#if session}
                  <div class="p-3 rounded-2xl {getStatusStyle(session.session_status)} shadow-sm h-full flex flex-col justify-center">
                    <p class="text-[9px] font-black uppercase tracking-tighter opacity-80">{session.subject_code || ''}</p>
                    <p class="text-[10px] font-black leading-tight mt-0.5 truncate">{session.subject_name || ''}</p>
                    <p class="text-[8px] font-bold mt-0.5 opacity-70 truncate">{session.faculty_name || ''}</p>
                  </div>
                {:else}
                  <div class="h-full min-h-[60px] rounded-2xl border border-dashed border-gray-100 dark:border-slate-800"></div>
                {/if}
              </div>
            {/each}
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Legend -->
  <div class="flex gap-8 p-6 bg-gray-50 dark:bg-slate-800/50 rounded-[2rem] border border-gray-100 dark:border-slate-800">
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
      <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Completed</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></div>
      <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">In Progress</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full bg-white border-2 border-gray-300"></div>
      <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scheduled</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full bg-rose-500"></div>
      <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Missed</span>
    </div>
  </div>
</div>
