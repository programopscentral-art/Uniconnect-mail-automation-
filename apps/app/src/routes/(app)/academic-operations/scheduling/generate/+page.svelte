<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // Form state
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let apdPlans = $state<any[]>([]);
  let selectedProgramId = $state('');
  let selectedTermId = $state('');
  let selectedApdPlanId = $state('');
  let weekStart = $state('');
  let weekEnd = $state('');

  // Generation state
  let generating = $state(false);
  let genResult = $state<any>(null);
  let errorMsg = $state('');
  let saving = $state(false);
  let savedVersion = $state<any>(null);

  // View mode
  let viewMode = $state<'grid' | 'list'>('grid');
  let filterSection = $state('');

  $effect(() => { if (universityId) { loadPrograms(); loadApdPlans(); } });
  $effect(() => { if (universityId && selectedProgramId) loadTerms(); });

  // Auto-set week to current Monday-Sunday
  $effect(() => {
    if (!weekStart) {
      const today = new Date();
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((day + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      weekStart = monday.toISOString().split('T')[0];
      weekEnd = sunday.toISOString().split('T')[0];
    }
  });

  async function loadPrograms() {
    try {
      const res = await fetch(`/api/academic/programs?universityId=${universityId}`);
      if (res.ok) programs = await res.json();
    } catch {}
  }

  async function loadTerms() {
    try {
      const res = await fetch(`/api/academic/terms?universityId=${universityId}&programId=${selectedProgramId}`);
      if (res.ok) terms = await res.json();
    } catch {}
  }

  async function loadApdPlans() {
    try {
      const res = await fetch(`/api/academic/scheduling/apd/plans?universityId=${universityId}`);
      if (res.ok) apdPlans = await res.json();
    } catch {}
  }

  function setWeekOffset(offset: number) {
    const current = new Date(weekStart || new Date());
    current.setDate(current.getDate() + offset * 7);
    const day = current.getDay();
    const monday = new Date(current);
    monday.setDate(current.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    weekStart = monday.toISOString().split('T')[0];
    weekEnd = sunday.toISOString().split('T')[0];
  }

  async function generateTimetable(saveDraft = false) {
    generating = true;
    errorMsg = '';
    genResult = null;
    savedVersion = null;

    try {
      const res = await fetch('/api/academic/scheduling/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityId,
          programId: selectedProgramId || undefined,
          termId: selectedTermId || undefined,
          apdPlanId: selectedApdPlanId || undefined,
          weekStart,
          weekEnd,
          saveDraft
        })
      });
      const data = await res.json();
      if (data.success) {
        genResult = data;
        if (data.savedVersion) savedVersion = data.savedVersion;
      } else {
        errorMsg = data.message || 'Generation failed';
      }
    } catch (e: any) {
      errorMsg = e.message || 'Generation failed';
    } finally { generating = false; }
  }

  async function saveDraft() {
    saving = true;
    try {
      const res = await fetch('/api/academic/scheduling/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityId,
          programId: selectedProgramId || undefined,
          termId: selectedTermId || undefined,
          apdPlanId: selectedApdPlanId || undefined,
          weekStart, weekEnd,
          saveDraft: true
        })
      });
      const data = await res.json();
      if (data.success && data.savedVersion) {
        savedVersion = data.savedVersion;
        genResult = data;
      }
    } catch {} finally { saving = false; }
  }

  // Derived data for grid view
  const uniqueDates = $derived(
    genResult?.sessions
      ? [...new Set(genResult.sessions.map((s: any) => s.session_date))].sort()
      : []
  );

  const uniqueSlots = $derived(
    genResult?.sessions
      ? [...new Map(genResult.sessions.map((s: any) => [`${s.slot_start}-${s.slot_end}`, { start: s.slot_start, end: s.slot_end }])).values()]
          .sort((a: any, b: any) => a.start.localeCompare(b.start))
      : []
  );

  const uniqueSections = $derived(
    genResult?.sessions
      ? [...new Map(genResult.sessions.map((s: any) => [s.section_id, { id: s.section_id, name: s.section_name }])).values()]
      : []
  );

  function getSessionForSlot(date: string, slotStart: string, sectionId: string) {
    if (!genResult?.sessions) return null;
    return genResult.sessions.find((s: any) =>
      s.session_date === date && s.slot_start === slotStart && s.section_id === sectionId
    );
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(t: string) {
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Generate Timetable</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Auto-generate weekly timetable from APD constraints with faculty allocation</p>
    </div>
  </div>

  <!-- Configuration Panel -->
  <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6">
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Program</label>
        <select bind:value={selectedProgramId} class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
          <option value="">All Programs</option>
          {#each programs as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </div>
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Term</label>
        <select bind:value={selectedTermId} class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
          <option value="">All Terms</option>
          {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </div>
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">APD Plan</label>
        <select bind:value={selectedApdPlanId} class="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
          <option value="">None (use defaults)</option>
          {#each apdPlans as p}
            <option value={p.id}>{p.program_name || 'All'} — {p.term_name || 'All'} ({p.plan_status})</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Week Start</label>
        <div class="flex gap-1">
          <button onclick={() => setWeekOffset(-1)} class="px-2 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs">&lt;</button>
          <input type="date" bind:value={weekStart} class="flex-1 px-2 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
          <button onclick={() => setWeekOffset(1)} class="px-2 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs">&gt;</button>
        </div>
      </div>
      <div class="flex items-end">
        <button
          onclick={() => generateTimetable(false)}
          disabled={generating || !universityId}
          class="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {generating ? 'Generating...' : 'Generate Preview'}
        </button>
      </div>
    </div>

    {#if weekStart && weekEnd}
      <p class="text-xs text-gray-400 mt-3">Week: {formatDate(weekStart)} — {formatDate(weekEnd)}</p>
    {/if}
  </div>

  {#if errorMsg}
    <div class="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{errorMsg}</div>
  {/if}

  <!-- Generation Result -->
  {#if genResult}
    <div in:fly={{ y: 10, duration: 200 }}>
      <!-- Stats Bar -->
      <div class="flex items-center gap-4 mb-4 flex-wrap">
        <div class="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
          <span class="text-xs text-indigo-500 dark:text-indigo-400 font-medium">Total</span>
          <span class="ml-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">{genResult.stats.totalGenerated}</span>
        </div>
        <div class="px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
          <span class="text-xs text-emerald-500 dark:text-emerald-400 font-medium">Assigned</span>
          <span class="ml-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">{genResult.stats.totalAssigned}</span>
        </div>
        <div class="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/20">
          <span class="text-xs text-red-500 dark:text-red-400 font-medium">Unassigned</span>
          <span class="ml-2 text-sm font-bold text-red-700 dark:text-red-300">{genResult.stats.totalUnassigned}</span>
        </div>

        <div class="ml-auto flex gap-2">
          <button onclick={() => viewMode = 'grid'} class="px-3 py-1.5 text-xs rounded-lg {viewMode === 'grid' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">Grid</button>
          <button onclick={() => viewMode = 'list'} class="px-3 py-1.5 text-xs rounded-lg {viewMode === 'list' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">List</button>

          {#if !savedVersion}
            <button onclick={saveDraft} disabled={saving}
              class="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>
          {:else}
            <span class="px-4 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
              Saved! v{savedVersion.versionNumber} ({savedVersion.sessionsCreated} sessions)
            </span>
          {/if}
        </div>
      </div>

      <!-- Warnings -->
      {#if genResult.warnings?.length > 0}
        <div class="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">
          {#each genResult.warnings as w}
            <p class="text-xs">- {w}</p>
          {/each}
        </div>
      {/if}

      <!-- Subject Allocation Summary -->
      {#if Object.keys(genResult.stats.subjectSlotCounts || {}).length > 0}
        <div class="mb-4 flex gap-2 flex-wrap">
          {#each Object.entries(genResult.stats.subjectSlotCounts) as [code, counts]}
            {@const c = counts as any}
            <div class="px-3 py-1.5 rounded-lg text-xs font-medium border
              {c.generated >= c.required
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400'
                : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400'}">
              {code}: {c.generated}/{c.required}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Section filter -->
      {#if uniqueSections.length > 1}
        <div class="mb-4 flex gap-2 flex-wrap">
          <button onclick={() => filterSection = ''} class="px-3 py-1 text-xs rounded-lg {!filterSection ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">All Sections</button>
          {#each uniqueSections as sec}
            <button onclick={() => filterSection = sec.id} class="px-3 py-1 text-xs rounded-lg {filterSection === sec.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}">{sec.name}</button>
          {/each}
        </div>
      {/if}

      <!-- Grid View -->
      {#if viewMode === 'grid'}
        {#each (filterSection ? uniqueSections.filter(s => s.id === filterSection) : uniqueSections) as section}
          <div class="mb-6">
            <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{section.name}</h4>
            <div class="overflow-x-auto">
              <table class="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th class="p-2 text-left border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 font-medium text-gray-500 w-20">Slot</th>
                    {#each uniqueDates as date}
                      <th class="p-2 text-center border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 font-medium text-gray-500 min-w-[120px]">
                        {formatDate(date)}
                      </th>
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
                        <td class="p-1.5 border border-gray-200 dark:border-slate-700 {session ? (session.faculty_profile_id ? 'bg-indigo-50 dark:bg-indigo-900/10' : 'bg-red-50 dark:bg-red-900/10') : ''}">
                          {#if session}
                            <div class="text-center">
                              <p class="font-bold text-indigo-700 dark:text-indigo-400">{session.subject_code}</p>
                              <p class="text-gray-500 dark:text-gray-400 truncate" title={session.faculty_name || session.assignment_reason}>
                                {session.faculty_name || 'Unassigned'}
                              </p>
                              {#if !session.faculty_profile_id}
                                <p class="text-red-400 text-[9px] truncate" title={session.assignment_reason}>{session.assignment_reason}</p>
                              {/if}
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

      <!-- List View -->
      {:else}
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80">
                <th class="p-3 text-left">Date</th>
                <th class="p-3 text-left">Time</th>
                <th class="p-3 text-left">Section</th>
                <th class="p-3 text-left">Subject</th>
                <th class="p-3 text-left">Faculty</th>
                <th class="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {#each (genResult.sessions || []).filter((s: any) => !filterSection || s.section_id === filterSection) as session}
                <tr class="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                  <td class="p-3 text-gray-700 dark:text-gray-300">{formatDate(session.session_date)}</td>
                  <td class="p-3 text-gray-500 dark:text-gray-400">{formatTime(session.slot_start)} - {formatTime(session.slot_end)}</td>
                  <td class="p-3 text-gray-700 dark:text-gray-300">{session.section_name}</td>
                  <td class="p-3">
                    <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{session.subject_code}</span>
                    <span class="text-gray-500 ml-1">{session.subject_name}</span>
                  </td>
                  <td class="p-3">
                    {#if session.faculty_name}
                      <span class="text-gray-700 dark:text-gray-300">{session.faculty_name}</span>
                    {:else}
                      <span class="text-red-500 text-xs">{session.assignment_reason}</span>
                    {/if}
                  </td>
                  <td class="p-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium
                      {session.faculty_profile_id ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}">
                      {session.assignment_source}
                    </span>
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
