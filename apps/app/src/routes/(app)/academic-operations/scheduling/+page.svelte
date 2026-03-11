<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fly, fade } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let metrics = $state({ totalSessions: 0, completedSessions: 0, openConflicts: 0, todaySessions: [] as any[] });
  let loading = $state(true);
  let versions = $state<any[]>([]);

  $effect(() => {
    if (universityId) {
      loadMetrics();
      loadVersions();
    }
  });

  async function loadMetrics() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/scheduling/overview?universityId=${universityId}`);
      if (res.ok) metrics = await res.json();
    } catch {}
    loading = false;
  }

  async function loadVersions() {
    try {
      const res = await fetch(`/api/academic/scheduling/versions?universityId=${universityId}`);
      if (res.ok) versions = await res.json();
    } catch {}
  }

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    return `${h12}:${m} ${ampm}`;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-500 text-white';
      case 'MISSED': return 'bg-rose-500 text-white';
      case 'CANCELLED': return 'bg-gray-400 text-white';
      default: return 'bg-white dark:bg-slate-800 text-gray-600 border border-gray-200 dark:border-slate-700';
    }
  }

  const metricCards = $derived([
    { label: "Total Sessions", value: loading ? '...' : metrics.totalSessions.toLocaleString(), color: 'text-gray-900 dark:text-white' },
    { label: "Completed", value: loading ? '...' : metrics.completedSessions.toLocaleString(), color: 'text-emerald-600' },
    { label: "Open Conflicts", value: loading ? '...' : metrics.openConflicts.toLocaleString(), color: metrics.openConflicts > 0 ? 'text-rose-600' : 'text-emerald-600' },
    { label: "Today's Sessions", value: loading ? '...' : metrics.todaySessions.length.toLocaleString(), color: 'text-indigo-600' }
  ]);
</script>

<div class="space-y-8" in:fade>
  {#if !universityId}
    <div class="p-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl text-center">
      <p class="text-gray-500 font-bold text-sm">Please select a university first.</p>
    </div>
  {:else}

  <!-- Metrics -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each metricCards as metric, i}
      <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl" in:fly={{ y: 10, delay: i * 50 }}>
        <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{metric.label}</p>
        <h3 class="text-3xl font-black {metric.color} leading-none mt-2">{metric.value}</h3>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    <!-- Today's Schedule -->
    <div class="xl:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-tight">Today's <span class="text-indigo-600">Schedule</span></h2>
      </div>

      {#if metrics.todaySessions.length === 0}
        <div class="h-[300px] flex items-center justify-center border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-[2rem]">
          <div class="text-center">
            <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <p class="text-gray-400 font-bold text-xs uppercase tracking-widest">No sessions today</p>
            <a href="/academic-operations/scheduling/upload" class="text-indigo-600 text-[10px] font-black uppercase tracking-widest mt-2 inline-block hover:underline">Import a timetable</a>
          </div>
        </div>
      {:else}
        <div class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {#each metrics.todaySessions as session}
            <div class="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all">
              <div class="w-20 text-right shrink-0">
                <p class="text-xs font-black text-gray-900 dark:text-white">{formatTime(session.slot_start)}</p>
                <p class="text-[10px] text-gray-400">{formatTime(session.slot_end)}</p>
              </div>
              <div class="w-px h-10 bg-gray-200 dark:bg-slate-700"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-black text-gray-900 dark:text-white truncate">{session.subject_name || session.subject_code || 'Unnamed'}</p>
                <p class="text-[10px] text-gray-400 font-bold truncate">
                  {session.section_name || '—'} · {session.faculty_name || '—'} · {session.room_name || 'No Room'}
                </p>
              </div>
              <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase shrink-0 {getStatusColor(session.session_status)}">{session.session_status}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Right Panel -->
    <div class="space-y-6">
      <div class="p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-xl shadow-indigo-500/20">
        <h2 class="text-xl font-black tracking-tight mb-2">Quick Actions</h2>
        <p class="text-indigo-100 text-xs font-medium mb-6">Manage sessions and timetables.</p>
        <div class="space-y-3">
          <a href="/academic-operations/scheduling/upload" class="flex items-center gap-3 p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            <span class="text-xs font-black uppercase tracking-widest">Import Timetable</span>
          </a>
          <a href="/academic-operations/scheduling/conflicts" class="flex items-center gap-3 p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <span class="text-xs font-black uppercase tracking-widest">Conflict Center</span>
          </a>
          <a href="/academic-operations/scheduling/sessions" class="flex items-center gap-3 p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            <span class="text-xs font-black uppercase tracking-widest">Live Sessions</span>
          </a>
        </div>
      </div>

      {#if versions.length > 0}
        <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem]">
          <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight mb-4">Timetable Versions</h3>
          <div class="space-y-3">
            {#each versions.slice(0, 5) as v}
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <p class="text-xs font-black text-gray-900 dark:text-white">v{v.version_number}</p>
                  <p class="text-[9px] text-gray-400">{v.session_count} sessions</p>
                </div>
                <span class="px-2 py-1 rounded-lg text-[9px] font-black uppercase
                  {v.version_status === 'PUBLISHED' ? 'bg-green-100 text-green-600 dark:bg-green-500/10' :
                   v.version_status === 'DRAFT' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10' :
                   'bg-gray-100 text-gray-500 dark:bg-slate-700'}">
                  {v.version_status}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
  {/if}
</div>
