<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // State
  let weeks = $state<any[]>([]);
  let loading = $state(false);
  let selectedWeek = $state<any>(null);
  let weekSessions = $state<any[]>([]);
  let loadingSessions = $state(false);

  // Clone modal
  let showCloneModal = $state(false);
  let cloneTarget = $state('');
  let cloning = $state(false);
  let cloneResult = $state<any>(null);

  // Edit session modal
  let editingSession = $state<any>(null);
  let editFacultyId = $state('');
  let editDeliveryMode = $state('');
  let editTopic = $state('');
  let savingEdit = $state(false);

  // Faculty list for dropdowns
  let facultyList = $state<any[]>([]);

  // View
  let viewMode = $state<'grid' | 'list'>('grid');
  let filterSection = $state('');

  $effect(() => { if (universityId) { loadWeeks(); loadFaculty(); } });

  async function loadWeeks() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/scheduling/weeks?universityId=${universityId}`);
      if (res.ok) weeks = await res.json();
    } catch {} finally { loading = false; }
  }

  async function loadFaculty() {
    try {
      const res = await fetch(`/api/academic/faculty?universityId=${universityId}`);
      if (res.ok) {
        const data = await res.json();
        facultyList = Array.isArray(data) ? data : data.faculty || [];
      }
    } catch {}
  }

  async function selectWeek(week: any) {
    selectedWeek = week;
    loadingSessions = true;
    filterSection = '';
    try {
      const res = await fetch(`/api/academic/scheduling/sessions?universityId=${universityId}&startDate=${week.week_start}&endDate=${week.week_end}`);
      if (res.ok) weekSessions = await res.json();
      else weekSessions = [];
    } catch { weekSessions = []; }
    finally { loadingSessions = false; }
  }

  function openCloneModal() {
    if (!selectedWeek) return;
    // Default target = next week
    const start = new Date(selectedWeek.week_start);
    start.setDate(start.getDate() + 7);
    cloneTarget = start.toISOString().split('T')[0];
    cloneResult = null;
    showCloneModal = true;
  }

  async function doClone() {
    if (!selectedWeek || !cloneTarget) return;
    cloning = true;
    cloneResult = null;
    const tgtStart = new Date(cloneTarget);
    const day = tgtStart.getDay();
    const monday = new Date(tgtStart);
    monday.setDate(tgtStart.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    try {
      const res = await fetch('/api/academic/scheduling/weeks/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityId,
          sourceWeekStart: selectedWeek.week_start,
          sourceWeekEnd: selectedWeek.week_end,
          targetWeekStart: monday.toISOString().split('T')[0],
          targetWeekEnd: sunday.toISOString().split('T')[0]
        })
      });
      cloneResult = await res.json();
      if (cloneResult.success) loadWeeks();
    } catch (e: any) {
      cloneResult = { success: false, message: e.message };
    } finally { cloning = false; }
  }

  function openEditSession(session: any) {
    editingSession = session;
    editFacultyId = session.faculty_profile_id || '';
    editDeliveryMode = session.delivery_mode || 'PHYSICAL';
    editTopic = session.planned_topic || '';
  }

  async function saveSessionEdit() {
    if (!editingSession) return;
    savingEdit = true;
    try {
      const res = await fetch(`/api/academic/scheduling/sessions/${editingSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty_profile_id: editFacultyId || null,
          delivery_mode: editDeliveryMode,
          planned_topic: editTopic || null
        })
      });
      const data = await res.json();
      if (data.success) {
        // Update in local list
        weekSessions = weekSessions.map(s =>
          s.id === editingSession.id ? { ...s, ...data.session, faculty_name: facultyList.find(f => f.id === editFacultyId)?.name || s.faculty_name } : s
        );
        editingSession = null;
      }
    } catch {} finally { savingEdit = false; }
  }

  async function cancelSession(sessionId: string) {
    if (!confirm('Cancel this session?')) return;
    try {
      const res = await fetch(`/api/academic/scheduling/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        weekSessions = weekSessions.filter(s => s.id !== sessionId);
      }
    } catch {}
  }

  // Derived
  const uniqueDates = $derived(
    [...new Set(weekSessions.map(s => {
      const d = s.session_date;
      return typeof d === 'string' ? d.split('T')[0] : d;
    }))].sort()
  );

  const uniqueSlots = $derived(
    [...new Map(weekSessions.map(s => [`${s.slot_start}-${s.slot_end}`, { start: s.slot_start, end: s.slot_end }])).values()]
      .sort((a, b) => a.start.localeCompare(b.start))
  );

  const uniqueSections = $derived(
    [...new Map(weekSessions.map(s => [s.section_id, { id: s.section_id, name: s.section_name }])).values()]
      .filter(s => s.id)
  );

  function getSessionForSlot(date: string, slotStart: string, sectionId: string) {
    return weekSessions.find(s => {
      const d = typeof s.session_date === 'string' ? s.session_date.split('T')[0] : s.session_date;
      return d === date && s.slot_start === slotStart && s.section_id === sectionId;
    });
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }

  function formatWeekRange(w: any) {
    return `${formatDate(w.week_start)} — ${formatDate(w.week_end)}`;
  }
</script>

<div class="space-y-6" in:fade>
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Week-Wise Operations</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage timetable week by week — view, edit sessions, clone weeks</p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <!-- Weeks List -->
    <div class="lg:col-span-1">
      <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-slate-700">
          <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">Weeks</h3>
        </div>
        {#if loading}
          <div class="p-8 text-center text-gray-400 text-sm">Loading...</div>
        {:else if weeks.length === 0}
          <div class="p-8 text-center text-gray-400 text-sm">No weeks found. Generate a timetable first.</div>
        {:else}
          <div class="divide-y divide-gray-100 dark:divide-slate-700 max-h-[60vh] overflow-y-auto">
            {#each weeks as week}
              <button
                onclick={() => selectWeek(week)}
                class="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors
                  {selectedWeek?.id === week.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500' : ''}"
              >
                <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Week {week.week_number}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatWeekRange(week)}</p>
                <div class="flex items-center gap-2 mt-1.5">
                  <span class="text-xs px-2 py-0.5 rounded-full
                    {week.version_status === 'PUBLISHED' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                     week.version_status === 'DRAFT' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                     'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'}">
                    {week.version_status || 'No version'}
                  </span>
                  <span class="text-xs text-gray-400">{week.session_count} sessions</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Week Detail -->
    <div class="lg:col-span-3">
      {#if !selectedWeek}
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center text-gray-400">
          Select a week to view and edit sessions
        </div>
      {:else}
        <div in:fly={{ x: 10, duration: 200 }}>
          <!-- Week Header -->
          <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 mb-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-200">Week {selectedWeek.week_number}: {formatWeekRange(selectedWeek)}</h3>
                <p class="text-xs text-gray-400 mt-0.5">
                  {selectedWeek.generation_source} &middot; {weekSessions.length} sessions
                </p>
              </div>
              <div class="flex gap-2">
                <button onclick={() => viewMode = 'grid'} class="px-3 py-1.5 text-xs rounded-lg {viewMode === 'grid' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">Grid</button>
                <button onclick={() => viewMode = 'list'} class="px-3 py-1.5 text-xs rounded-lg {viewMode === 'list' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">List</button>
                <button onclick={openCloneModal}
                  class="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                  Clone to Next Week
                </button>
              </div>
            </div>

            <!-- Section filter -->
            {#if uniqueSections.length > 1}
              <div class="mt-3 flex gap-2 flex-wrap">
                <button onclick={() => filterSection = ''} class="px-3 py-1 text-xs rounded-lg {!filterSection ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">All</button>
                {#each uniqueSections as sec}
                  <button onclick={() => filterSection = sec.id} class="px-3 py-1 text-xs rounded-lg {filterSection === sec.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">{sec.name}</button>
                {/each}
              </div>
            {/if}
          </div>

          {#if loadingSessions}
            <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center text-gray-400 text-sm">Loading sessions...</div>
          {:else if weekSessions.length === 0}
            <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center text-gray-400 text-sm">No sessions in this week</div>
          {:else if viewMode === 'grid'}
            <!-- Grid View -->
            {#each (filterSection ? uniqueSections.filter(s => s.id === filterSection) : uniqueSections) as section}
              <div class="mb-6">
                <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{section.name}</h4>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th class="p-2 text-left border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 font-medium text-gray-500 w-20">Slot</th>
                        {#each uniqueDates as date}
                          <th class="p-2 text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 font-medium text-gray-500 min-w-[130px]">{formatDate(date)}</th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each uniqueSlots as slot}
                        <tr>
                          <td class="p-2 border border-gray-200 dark:border-slate-700 text-gray-500 whitespace-nowrap">
                            {formatTime(slot.start)}<br/>{formatTime(slot.end)}
                          </td>
                          {#each uniqueDates as date}
                            {@const session = getSessionForSlot(date, slot.start, section.id)}
                            <td class="p-1.5 border border-gray-200 dark:border-slate-700 {session ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''} cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/30"
                                onclick={() => session && openEditSession(session)}>
                              {#if session}
                                <div class="text-center">
                                  <p class="font-bold text-indigo-700 dark:text-indigo-400">{session.subject_code || session.subject_name}</p>
                                  <p class="text-gray-500 dark:text-gray-400 truncate text-[10px]">{session.faculty_name || 'No faculty'}</p>
                                </div>
                              {/if}
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/each}
          {:else}
            <!-- List View -->
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80">
                    <th class="p-3 text-left">Date</th>
                    <th class="p-3 text-left">Time</th>
                    <th class="p-3 text-left">Section</th>
                    <th class="p-3 text-left">Subject</th>
                    <th class="p-3 text-left">Faculty</th>
                    <th class="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each weekSessions.filter(s => !filterSection || s.section_id === filterSection) as session}
                    <tr class="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                      <td class="p-3 text-gray-700 dark:text-gray-300 text-xs">{formatDate(typeof session.session_date === 'string' ? session.session_date.split('T')[0] : session.session_date)}</td>
                      <td class="p-3 text-gray-500 dark:text-gray-400 text-xs">{formatTime(session.slot_start)} - {formatTime(session.slot_end)}</td>
                      <td class="p-3 text-gray-700 dark:text-gray-300 text-xs">{session.section_name}</td>
                      <td class="p-3">
                        <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">{session.subject_code}</span>
                      </td>
                      <td class="p-3 text-gray-700 dark:text-gray-300 text-xs">{session.faculty_name || '—'}</td>
                      <td class="p-3">
                        <div class="flex gap-1">
                          <button onclick={() => openEditSession(session)} class="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600">Edit</button>
                          <button onclick={() => cancelSession(session.id)} class="px-2 py-1 text-xs rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Clone Modal -->
{#if showCloneModal}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onclick={() => showCloneModal = false}>
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-4">Clone Week</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Clone all sessions from <strong>{formatWeekRange(selectedWeek)}</strong> to a new week.
      </p>
      <div class="mb-4">
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Target week start date</label>
        <input type="date" bind:value={cloneTarget} class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
      </div>
      {#if cloneResult}
        <div class="mb-4 p-3 rounded-xl text-sm {cloneResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}">
          {cloneResult.message}
        </div>
      {/if}
      <div class="flex gap-2 justify-end">
        <button onclick={() => showCloneModal = false} class="px-4 py-2 text-sm rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
        <button onclick={doClone} disabled={cloning || !cloneTarget}
          class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {cloning ? 'Cloning...' : 'Clone'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Session Modal -->
{#if editingSession}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onclick={() => editingSession = null}>
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-1">Edit Session</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {editingSession.subject_code} — {editingSession.section_name} — {formatTime(editingSession.slot_start)}
      </p>

      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Faculty</label>
          <select bind:value={editFacultyId} class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="">Unassigned</option>
            {#each facultyList as f}
              <option value={f.id}>{f.name || f.employee_code}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Delivery Mode</label>
          <select bind:value={editDeliveryMode} class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="PHYSICAL">Physical</option>
            <option value="ONLINE">Online</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Planned Topic</label>
          <input type="text" bind:value={editTopic} placeholder="Optional topic" class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
      </div>

      <div class="flex gap-2 justify-end mt-5">
        <button onclick={() => editingSession = null} class="px-4 py-2 text-sm rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
        <button onclick={saveSessionEdit} disabled={savingEdit}
          class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {savingEdit ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}
