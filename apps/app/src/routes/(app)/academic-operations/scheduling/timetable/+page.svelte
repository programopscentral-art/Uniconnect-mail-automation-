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
  let weekStart = $state(getMonday(new Date()));
  let slots = $state<any[]>([]);

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function getMonday(d: Date): string {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().split('T')[0];
  }

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function changeWeek(delta: number) {
    weekStart = addDays(weekStart, delta * 7);
  }

  const weekEnd = $derived(addDays(weekStart, 5));
  const weekDates = $derived(DAYS.map((_, i) => addDays(weekStart, i)));

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    return `${h12}:${m} ${ampm}`;
  }

  $effect(() => {
    if (universityId) loadSections();
  });

  $effect(() => {
    if (universityId) loadSessions();
  });

  async function loadSections() {
    try {
      const res = await fetch(`/api/academic/sections?universityId=${universityId}`);
      if (res.ok) {
        sections = await res.json();
        if (sections.length > 0 && !selectedSection) selectedSection = sections[0].id;
      }
    } catch {}
  }

  async function loadSessions() {
    loading = true;
    try {
      const params = new URLSearchParams({
        universityId,
        startDate: weekStart,
        endDate: weekEnd
      });
      if (selectedSection) params.set('sectionId', selectedSection);
      const res = await fetch(`/api/academic/scheduling/sessions?${params}`);
      if (res.ok) sessions = await res.json();
    } catch {}
    loading = false;
  }

  // Build the timetable grid: slot -> day -> session
  const uniqueSlots = $derived(() => {
    const slotSet = new Map<string, { start: string; end: string }>();
    for (const s of sessions) {
      const key = `${s.slot_start}-${s.slot_end}`;
      if (!slotSet.has(key)) slotSet.set(key, { start: s.slot_start, end: s.slot_end });
    }
    return [...slotSet.values()].sort((a, b) => a.start.localeCompare(b.start));
  });

  function getSession(date: string, slotStart: string, slotEnd: string) {
    return sessions.find(s => s.date === date && s.slot_start === slotStart && s.slot_end === slotEnd);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30';
      case 'IN_PROGRESS': return 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30 animate-pulse';
      case 'MISSED': return 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30';
      case 'CANCELLED': return 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50';
      default: return 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700';
    }
  }

  function getStatusDot(status: string) {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-500';
      case 'IN_PROGRESS': return 'bg-indigo-600 animate-pulse';
      case 'MISSED': return 'bg-rose-500';
      case 'CANCELLED': return 'bg-gray-400';
      default: return 'bg-blue-400';
    }
  }

  const sectionName = $derived(sections.find(s => s.id === selectedSection)?.name || 'All');
</script>

<div class="space-y-6" in:fade>
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Weekly <span class="text-indigo-600">Timetable</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">School-style weekly schedule view{selectedSection ? ` — ${sectionName}` : ''}</p>
    </div>
    <div class="flex items-center gap-3">
      <!-- Section Filter -->
      <select bind:value={selectedSection} onchange={() => loadSessions()}
        class="px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold min-w-[180px] shadow-sm">
        <option value="">All Sections</option>
        {#each sections as sec}<option value={sec.id}>{sec.name}</option>{/each}
      </select>

      <!-- Week Navigation -->
      <div class="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-1 shadow-sm">
        <button onclick={() => changeWeek(-1)} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div class="px-3 text-center min-w-[160px]">
          <p class="text-xs font-black text-gray-900 dark:text-white">{formatDate(weekStart)} — {formatDate(weekEnd)}</p>
          <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Week View</p>
        </div>
        <button onclick={() => changeWeek(1)} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>

      <!-- Today button -->
      <button onclick={() => { weekStart = getMonday(new Date()); }}
        class="px-4 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-sm">
        Today
      </button>
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-xs text-gray-400 font-bold mt-4">Loading timetable...</p>
    </div>
  {:else if sessions.length === 0}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] text-center">
      <svg class="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <p class="text-gray-400 font-bold text-sm">No sessions found for this week</p>
      <p class="text-gray-300 text-xs mt-1">Try selecting a different section or importing a timetable</p>
      <a href="/academic-operations/scheduling/upload" class="inline-block mt-4 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all">
        Import Timetable
      </a>
    </div>
  {:else}
    <!-- Timetable Grid -->
    <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse min-w-[900px]">
          <!-- Day Headers -->
          <thead>
            <tr>
              <th class="w-24 p-3 bg-gray-50 dark:bg-slate-800/80 border-b border-r border-gray-100 dark:border-slate-700">
                <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Time</span>
              </th>
              {#each weekDates as date, i}
                {@const isToday = date === new Date().toISOString().split('T')[0]}
                <th class="p-3 border-b border-r last:border-r-0 border-gray-100 dark:border-slate-700
                  {isToday ? 'bg-indigo-50 dark:bg-indigo-500/5' : 'bg-gray-50 dark:bg-slate-800/80'}">
                  <p class="text-[10px] font-black uppercase tracking-widest {isToday ? 'text-indigo-600' : 'text-gray-500'}">{DAYS[i]}</p>
                  <p class="text-xs font-bold {isToday ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'} mt-0.5">{formatDate(date)}</p>
                  {#if isToday}
                    <div class="w-1.5 h-1.5 rounded-full bg-indigo-600 mx-auto mt-1"></div>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each uniqueSlots() as slot, slotIdx}
              <tr class="group">
                <!-- Time Slot Label -->
                <td class="p-3 border-r border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/30 align-top">
                  <div class="text-center">
                    <p class="text-xs font-black text-gray-800 dark:text-gray-200">{formatTime(slot.start)}</p>
                    <div class="w-px h-2 bg-gray-200 dark:bg-slate-700 mx-auto my-0.5"></div>
                    <p class="text-[10px] font-bold text-gray-400">{formatTime(slot.end)}</p>
                  </div>
                </td>
                <!-- Day Cells -->
                {#each weekDates as date, dayIdx}
                  {@const session = getSession(date, slot.start, slot.end)}
                  {@const isToday = date === new Date().toISOString().split('T')[0]}
                  <td class="p-1.5 border-r border-b last:border-r-0 border-gray-100 dark:border-slate-700 align-top
                    {isToday ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}"
                    in:fly={{ y: 5, delay: slotIdx * 40 + dayIdx * 20 }}>
                    {#if session}
                      <div class="p-3 rounded-xl border {getStatusColor(session.session_status)} h-full min-h-[90px] relative overflow-hidden transition-all hover:shadow-md hover:scale-[1.02] cursor-default group/cell">
                        <!-- Status dot -->
                        <div class="absolute top-2 right-2 w-2 h-2 rounded-full {getStatusDot(session.session_status)}"></div>

                        <!-- Subject -->
                        <div class="flex items-start gap-1.5 mb-1.5">
                          {#if session.subject_code}
                            <span class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded text-[8px] font-black shrink-0">{session.subject_code}</span>
                          {/if}
                          {#if session.delivery_mode === 'LAB' || session.delivery_mode === 'PRACTICAL'}
                            <span class="px-1.5 py-0.5 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded text-[8px] font-black shrink-0">LAB</span>
                          {/if}
                        </div>
                        <p class="text-[11px] font-black text-gray-900 dark:text-white leading-tight line-clamp-2">{session.subject_name || 'Unnamed'}</p>

                        <!-- Faculty -->
                        <div class="flex items-center gap-1 mt-2">
                          <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                          <p class="text-[9px] font-bold text-gray-500 dark:text-gray-400 truncate">{session.faculty_name || '—'}</p>
                        </div>

                        <!-- Room -->
                        {#if session.room_name}
                          <div class="flex items-center gap-1 mt-0.5">
                            <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                            <p class="text-[9px] font-bold text-gray-400 truncate">{session.room_name}</p>
                          </div>
                        {/if}

                        <!-- Topic -->
                        {#if session.planned_topic}
                          <div class="mt-2 pt-1.5 border-t border-gray-100 dark:border-slate-700">
                            <p class="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold leading-tight line-clamp-2">
                              {session.planned_topic}
                            </p>
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <div class="h-full min-h-[90px] rounded-xl border border-dashed border-gray-100 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/20"></div>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap gap-6 p-5 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
        <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Completed</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></div>
        <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">In Progress</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-blue-400"></div>
        <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scheduled</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-rose-500"></div>
        <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Missed</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-gray-400"></div>
        <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cancelled</span>
      </div>
    </div>
  {/if}
</div>
