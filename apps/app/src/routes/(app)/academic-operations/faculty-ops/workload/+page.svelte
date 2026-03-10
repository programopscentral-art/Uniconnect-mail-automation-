<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { page } from "$app/stores";

  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let facultyWithSubjects = $state<any[]>([]);
  let loading = $state(false);
  let selectedProgram = $state('');
  let selectedTerm = $state('');

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  $effect(() => { if (universityId) loadPrograms(); });
  $effect(() => {
    if (selectedProgram) loadTerms();
    else { terms = []; selectedTerm = ''; }
  });
  $effect(() => {
    if (selectedTerm && universityId) loadWorkload();
    else facultyWithSubjects = [];
  });

  async function loadPrograms() {
    const res = await fetch(`/api/academic/programs?universityId=${universityId}`);
    if (res.ok) programs = await res.json();
  }

  async function loadTerms() {
    selectedTerm = '';
    const res = await fetch(`/api/academic/terms?programId=${selectedProgram}`);
    if (res.ok) terms = await res.json();
  }

  async function loadWorkload() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/faculty/subjects?universityId=${universityId}&termId=${selectedTerm}&programId=${selectedProgram}`);
      if (res.ok) {
        const data = await res.json();
        // Only show faculty who have subjects in this term
        facultyWithSubjects = data.filter((f: any) =>
          (f.subjects || []).some((s: any) => s.term_id === selectedTerm)
        ).map((f: any) => ({
          ...f,
          termSubjects: (f.subjects || []).filter((s: any) => s.term_id === selectedTerm)
        }));
      }
    } finally {
      loading = false;
    }
  }

  const selectedTermObj = $derived(terms.find(t => t.id === selectedTerm));
  const selectedProgramObj = $derived(programs.find(p => p.id === selectedProgram));

  // Stats
  const totalSubjects = $derived(facultyWithSubjects.reduce((acc, f) => acc + f.termSubjects.length, 0));
  const avgSubjectsPerFaculty = $derived(facultyWithSubjects.length > 0 ? (totalSubjects / facultyWithSubjects.length).toFixed(1) : '0');
  const unassignedFaculty = $derived(facultyWithSubjects.filter(f => f.termSubjects.length === 0).length);

  function getInitials(name: string) {
    return (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function getWorkloadColor(count: number) {
    if (count === 0) return 'text-gray-400';
    if (count <= 2) return 'text-emerald-600';
    if (count <= 4) return 'text-indigo-600';
    return 'text-amber-600';
  }

  function getWorkloadBg(count: number) {
    if (count === 0) return 'bg-gray-100 dark:bg-slate-800';
    if (count <= 2) return 'bg-emerald-50 dark:bg-emerald-900/10';
    if (count <= 4) return 'bg-indigo-50 dark:bg-indigo-900/10';
    return 'bg-amber-50 dark:bg-amber-900/10';
  }
</script>

<div class="space-y-8" in:fade>
  <!-- Header -->
  <div class="flex flex-wrap items-end gap-4">
    <div class="flex-1">
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Workload <span class="text-indigo-600">View</span></h2>
      <p class="text-xs font-medium text-gray-400 mt-1">Select a program and semester to see who is teaching what</p>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap gap-3 p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem]">
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Program / Branch</label>
      <select bind:value={selectedProgram} class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 min-w-[200px]">
        <option value="">Select Program</option>
        {#each programs as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
    {#if terms.length > 0}
      <div class="flex flex-col gap-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Semester / Term</label>
        <select bind:value={selectedTerm} class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 min-w-[200px]">
          <option value="">Select Semester</option>
          {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </div>
    {/if}
  </div>

  {#if !selectedProgram || !selectedTerm}
    <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem]">
      <div class="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
      </div>
      <p class="text-gray-500 font-bold text-sm">Select a program and semester to view workload</p>
    </div>
  {:else if loading}
    <div class="space-y-4">
      {#each Array(3) as _}
        <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl animate-pulse">
          <div class="flex gap-4 mb-4"><div class="w-11 h-11 rounded-2xl bg-gray-200 dark:bg-slate-700"></div><div class="flex-1 space-y-2"><div class="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3"></div><div class="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/4"></div></div></div>
          <div class="flex gap-2"><div class="h-8 bg-gray-100 dark:bg-slate-800 rounded-xl w-24"></div><div class="h-8 bg-gray-100 dark:bg-slate-800 rounded-xl w-32"></div></div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Summary stats for this term -->
    {#if facultyWithSubjects.length > 0}
      <div class="grid grid-cols-3 gap-4" in:fly={{ y: 10 }}>
        <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] text-center">
          <p class="text-3xl font-black text-indigo-600">{facultyWithSubjects.length}</p>
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Faculty Teaching</p>
        </div>
        <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] text-center">
          <p class="text-3xl font-black text-emerald-600">{totalSubjects}</p>
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Total Subjects</p>
        </div>
        <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] text-center">
          <p class="text-3xl font-black text-amber-600">{avgSubjectsPerFaculty}</p>
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Avg / Faculty</p>
        </div>
      </div>
    {/if}

    <!-- Term badge -->
    <div class="flex items-center gap-3">
      <span class="px-4 py-2 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black uppercase tracking-widest">
        {selectedProgramObj?.name}
      </span>
      <span class="text-gray-400">→</span>
      <span class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest">
        {selectedTermObj?.name}
      </span>
      {#if selectedTermObj}
        <span class="text-xs font-medium text-gray-400">
          {new Date(selectedTermObj.start_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          — {new Date(selectedTermObj.end_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
        </span>
      {/if}
    </div>

    {#if facultyWithSubjects.length === 0}
      <div class="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem]">
        <p class="text-gray-500 font-bold text-sm">No faculty have been assigned subjects for this semester yet</p>
        <p class="text-gray-400 text-xs mt-1">Use the Profiles tab to assign subjects to faculty</p>
      </div>
    {:else}
      <!-- Workload table -->
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] overflow-hidden" in:fly={{ y: 15 }}>
        <div class="px-8 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h3 class="font-black text-gray-900 dark:text-white">
            {selectedTermObj?.name} — Workload Distribution
          </h3>
          <span class="text-xs font-black text-gray-400">{facultyWithSubjects.length} faculty</span>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-slate-800">
          {#each facultyWithSubjects as f, i}
            <div class="px-8 py-5 flex items-start gap-6 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors" in:fly={{ x: -10, delay: i * 30 }}>
              <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black text-xs flex-shrink-0">{getInitials(f.name)}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 mb-2 flex-wrap">
                  <h4 class="font-black text-gray-900 dark:text-white text-sm">{f.name}</h4>
                  {#if f.designation}
                    <span class="text-[9px] font-bold text-gray-400">{f.designation}</span>
                  {/if}
                  {#if f.department}
                    <span class="text-[9px] font-bold text-gray-400">• {f.department}</span>
                  {/if}
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each f.termSubjects as sub}
                    <div class="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                      <span class="text-[9px] font-black uppercase tracking-wider text-indigo-600">{sub.subject_code}</span>
                      <span class="text-xs font-bold text-gray-700 dark:text-gray-300">{sub.subject_name}</span>
                      {#if sub.total_sessions}
                        <span class="text-[9px] text-gray-400">{sub.total_sessions} sessions</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-2xl font-black {getWorkloadColor(f.termSubjects.length)}">{f.termSubjects.length}</p>
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">subjects</p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
