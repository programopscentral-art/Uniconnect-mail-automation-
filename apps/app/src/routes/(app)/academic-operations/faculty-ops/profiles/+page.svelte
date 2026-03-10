<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { page } from "$app/stores";

  let faculty = $state<any[]>([]);
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let allSubjects = $state<any[]>([]);
  let loading = $state(true);
  let selectedProgram = $state('');
  let selectedTerm = $state('');
  let searchQuery = $state('');

  // Profile detail panel
  let selectedFaculty = $state<any>(null);
  let panelOpen = $state(false);
  let assigningSubject = $state(false);
  let subjectSearchQuery = $state('');
  let savingMsg = $state('');

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  $effect(() => { if (universityId) init(); });
  $effect(() => { if (universityId) loadFaculty(); });

  async function init() {
    // Load all semesters university-wide — no program selection needed first
    const [progRes, termsRes] = await Promise.all([
      fetch(`/api/academic/programs?universityId=${universityId}`),
      fetch(`/api/academic/terms?universityId=${universityId}`)
    ]);
    if (progRes.ok) programs = await progRes.json();
    if (termsRes.ok) terms = await termsRes.json();
  }

  async function loadFaculty() {
    loading = true;
    try {
      const params = new URLSearchParams({ universityId });
      if (selectedTerm) params.set('termId', selectedTerm);
      if (selectedProgram) params.set('programId', selectedProgram);
      const [facultyRes, subjectsRes] = await Promise.all([
        fetch(`/api/academic/faculty/subjects?${params}`),
        selectedTerm ? fetch(`/api/academic/subjects?termId=${selectedTerm}`) : Promise.resolve(null)
      ]);
      if (facultyRes.ok) faculty = await facultyRes.json();
      if (subjectsRes?.ok) allSubjects = await subjectsRes.json();
      else if (!selectedTerm) allSubjects = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => { selectedProgram; selectedTerm; if (universityId) loadFaculty(); });

  const filtered = $derived(
    faculty.filter(f =>
      !searchQuery ||
      f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function openProfile(f: any) {
    selectedFaculty = f;
    panelOpen = true;
    subjectSearchQuery = '';
  }

  async function removeSubject(mappingId: string) {
    await fetch(`/api/academic/faculty/subjects?mappingId=${mappingId}`, { method: 'DELETE' });
    await loadFaculty();
    // Refresh selected faculty
    if (selectedFaculty) {
      selectedFaculty = faculty.find(f => f.id === selectedFaculty.id) || selectedFaculty;
    }
  }

  async function assignSubject(subjectId: string) {
    if (!selectedFaculty) return;
    assigningSubject = true;
    savingMsg = '';
    try {
      const res = await fetch('/api/academic/faculty/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faculty_profile_id: selectedFaculty.id, subject_id: subjectId })
      });
      if (res.ok) {
        savingMsg = 'Assigned!';
        await loadFaculty();
        selectedFaculty = faculty.find(f => f.id === selectedFaculty.id) || selectedFaculty;
        setTimeout(() => savingMsg = '', 2000);
      }
    } finally {
      assigningSubject = false;
    }
  }

  const availableToAssign = $derived(
    allSubjects.filter(s =>
      !(selectedFaculty?.subjects || []).some((assigned: any) => assigned.subject_id === s.id) &&
      (!subjectSearchQuery || s.name?.toLowerCase().includes(subjectSearchQuery.toLowerCase()) || s.code?.toLowerCase().includes(subjectSearchQuery.toLowerCase()))
    )
  );

  function getInitials(name: string) {
    return (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function getDesignationColor(d: string) {
    if (!d) return 'bg-gray-100 text-gray-500';
    const dl = d.toLowerCase();
    if (dl.includes('professor') && !dl.includes('assistant') && !dl.includes('associate')) return 'bg-purple-100 text-purple-700';
    if (dl.includes('associate')) return 'bg-blue-100 text-blue-700';
    if (dl.includes('assistant')) return 'bg-indigo-100 text-indigo-700';
    if (dl.includes('guest') || dl.includes('visiting')) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Filters — semester first, program optional -->
  <div class="flex flex-wrap items-center gap-3">
    <!-- Semester (primary filter) -->
    <select bind:value={selectedTerm} onchange={() => loadFaculty()} class="px-4 py-2.5 bg-indigo-600 text-white border-none rounded-xl text-xs font-bold focus:ring-2 ring-indigo-400 appearance-none cursor-pointer">
      <option value="">All Semesters</option>
      {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
    </select>
    <!-- Program (secondary filter) -->
    <select bind:value={selectedProgram} onchange={() => loadFaculty()} class="px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 appearance-none cursor-pointer">
      <option value="">All Programs</option>
      {#each programs as p}<option value={p.id}>{p.code} — {p.name}</option>{/each}
    </select>
    <input type="text" placeholder="Search by name, dept, code..." bind:value={searchQuery}
      class="px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-medium w-64 focus:ring-2 ring-indigo-500" />
    <span class="ml-auto text-xs font-bold text-gray-500">{filtered.length} faculty</span>
  </div>

  <!-- Faculty Grid -->
  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {#each Array(6) as _}
        <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl animate-pulse">
          <div class="flex gap-4 mb-4"><div class="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-slate-700"></div><div class="flex-1 space-y-2"><div class="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div><div class="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/2"></div></div></div>
          <div class="h-16 bg-gray-50 dark:bg-slate-800 rounded-2xl"></div>
        </div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem]">
      <div class="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
      </div>
      <p class="text-gray-500 font-bold text-sm mb-1">No faculty found</p>
      <p class="text-gray-400 text-xs">Try adjusting filters or import faculty data first</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {#each filtered as f, i}
        <button
          class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300 group text-left"
          in:fly={{ y: 15, delay: i * 40 }}
          onclick={() => openProfile(f)}
        >
          <div class="flex items-start justify-between mb-4">
            <div class="flex gap-3">
              <div class="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black text-sm flex-shrink-0">{getInitials(f.name)}</div>
              <div class="min-w-0">
                <h4 class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors text-sm truncate">{f.name}</h4>
                <p class="text-[10px] font-bold text-gray-400 mt-0.5">{f.department || '—'}</p>
              </div>
            </div>
            {#if f.designation}
              <span class="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0 ml-1 {getDesignationColor(f.designation)}">{f.designation}</span>
            {/if}
          </div>

          <!-- Subject tags -->
          <div class="flex flex-wrap gap-1.5 mb-4 min-h-[28px]">
            {#each (f.subjects || []).slice(0, 3) as sub}
              <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg">{sub.subject_code}</span>
            {/each}
            {#if (f.subjects || []).length > 3}
              <span class="text-[9px] font-bold px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded-lg">+{(f.subjects || []).length - 3} more</span>
            {/if}
            {#if (f.subjects || []).length === 0}
              <span class="text-[9px] font-bold text-gray-400 italic">No subjects assigned</span>
            {/if}
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
            <div>
              <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Emp. Code</p>
              <p class="text-xs font-black text-gray-600 dark:text-gray-300 font-mono mt-0.5">{f.employee_code || '—'}</p>
            </div>
            <div class="text-right">
              <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subjects</p>
              <p class="text-sm font-black text-indigo-600 mt-0.5">{(f.subjects || []).length}</p>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<!-- Profile detail panel -->
{#if panelOpen && selectedFaculty}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" transition:fade={{ duration: 200 }} onclick={() => panelOpen = false}></div>
  <div class="fixed right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col overflow-hidden" transition:fly={{ x: 400, duration: 300 }}>
    <!-- Header -->
    <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black">{getInitials(selectedFaculty.name)}</div>
        <div>
          <h3 class="font-black text-gray-900 dark:text-white text-lg">{selectedFaculty.name}</h3>
          <p class="text-xs font-bold text-gray-400">{selectedFaculty.designation || 'Faculty'} • {selectedFaculty.department || '—'}</p>
        </div>
      </div>
      <button onclick={() => panelOpen = false} class="w-8 h-8 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center hover:bg-gray-200 transition-colors">
        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      <!-- Info grid -->
      <div class="grid grid-cols-2 gap-3">
        {#each [
          { label: 'Employee Code', value: selectedFaculty.employee_code },
          { label: 'Email', value: selectedFaculty.email },
          { label: 'Department', value: selectedFaculty.department },
          { label: 'Specialization', value: selectedFaculty.specialization }
        ] as info}
          <div class="p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl">
            <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{info.label}</p>
            <p class="text-xs font-bold text-gray-800 dark:text-gray-200 mt-1 truncate">{info.value || '—'}</p>
          </div>
        {/each}
      </div>

      <!-- Assigned subjects -->
      <div>
        <h4 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest mb-3">
          Assigned Subjects
          <span class="ml-2 text-indigo-600">{(selectedFaculty.subjects || []).length}</span>
        </h4>
        {#if (selectedFaculty.subjects || []).length === 0}
          <p class="text-xs text-gray-400 font-medium italic py-4 text-center bg-gray-50 dark:bg-slate-800 rounded-2xl">No subjects assigned yet</p>
        {:else}
          <div class="space-y-2">
            {#each selectedFaculty.subjects as sub}
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl group">
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg flex-shrink-0">{sub.subject_code}</span>
                  <div class="min-w-0">
                    <p class="text-xs font-black text-gray-800 dark:text-gray-200 truncate">{sub.subject_name}</p>
                    <p class="text-[9px] font-bold text-gray-400">{sub.term_name} • {sub.program_name}</p>
                  </div>
                </div>
                <button onclick={() => removeSubject(sub.mapping_id)} class="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Assign new subject -->
      {#if selectedTerm && allSubjects.length > 0}
        <div>
          <h4 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest mb-3">
            Assign from {terms.find(t => t.id === selectedTerm)?.name || 'Current Term'}
          </h4>
          <input type="text" placeholder="Search subjects..." bind:value={subjectSearchQuery}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-medium mb-3 focus:ring-2 ring-indigo-500" />
          {#if savingMsg}
            <p class="text-xs font-black text-emerald-600 mb-2">{savingMsg}</p>
          {/if}
          {#if availableToAssign.length === 0}
            <p class="text-xs text-gray-400 text-center py-3">All subjects in this term are already assigned</p>
          {:else}
            <div class="space-y-1.5 max-h-48 overflow-y-auto">
              {#each availableToAssign as sub}
                <button
                  onclick={() => assignSubject(sub.id)}
                  disabled={assigningSubject}
                  class="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors text-left group"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-[9px] font-black uppercase px-2 py-0.5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded">{sub.code}</span>
                    <span class="text-xs font-bold text-gray-700 dark:text-gray-300">{sub.name}</span>
                  </div>
                  <span class="text-[9px] font-black text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">+ Assign</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if !selectedTerm}
        <div class="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200 dark:border-amber-800/30">
          <p class="text-xs font-bold text-amber-700 dark:text-amber-400">Select a semester filter above to assign subjects to this faculty member.</p>
        </div>
      {/if}
    </div>
  </div>
{/if}
