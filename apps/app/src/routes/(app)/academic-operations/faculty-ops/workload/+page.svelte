<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { page } from "$app/stores";

  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let allFaculty = $state<any[]>([]);
  let loading = $state(true);
  let selectedProgram = $state('');
  let selectedTerm = $state('');

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  $effect(() => { if (universityId) init(); });
  $effect(() => {
    if (selectedProgram) loadTerms();
    else { terms = []; selectedTerm = ''; }
  });

  async function init() {
    loading = true;
    try {
      const [progRes, facRes] = await Promise.all([
        fetch(`/api/academic/programs?universityId=${universityId}`),
        fetch(`/api/academic/faculty/subjects?universityId=${universityId}`)
      ]);
      if (progRes.ok) programs = await progRes.json();
      if (facRes.ok) allFaculty = await facRes.json();
    } finally { loading = false; }
  }

  async function loadTerms() {
    selectedTerm = '';
    const res = await fetch(`/api/academic/terms?programId=${selectedProgram}`);
    if (res.ok) terms = await res.json();
  }

  // Filter faculty based on selected program/term
  const facultyWithSubjects = $derived(() => {
    return allFaculty
      .map(f => {
        let subs = f.subjects || [];
        if (selectedProgram) subs = subs.filter((s: any) => s.program_id === selectedProgram);
        if (selectedTerm) subs = subs.filter((s: any) => s.term_id === selectedTerm);
        return { ...f, filteredSubjects: subs };
      })
      .filter(f => f.filteredSubjects.length > 0)
      .sort((a, b) => b.filteredSubjects.length - a.filteredSubjects.length);
  });

  const totalSubjects = $derived(facultyWithSubjects().reduce((acc, f) => acc + f.filteredSubjects.length, 0));
  const avgPerFaculty = $derived(facultyWithSubjects().length > 0 ? (totalSubjects / facultyWithSubjects().length).toFixed(1) : '0');

  function getInitials(name: string) {
    return (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function getWorkloadColor(count: number) {
    if (count === 0) return 'text-gray-400';
    if (count <= 2) return 'text-emerald-600';
    if (count <= 4) return 'text-indigo-600';
    return 'text-amber-600';
  }
</script>

<div class="space-y-6" in:fade>
  <div>
    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Workload <span class="text-indigo-600">View</span></h2>
    <p class="text-xs font-medium text-gray-400 mt-1">Faculty subject assignments across all programs and semesters</p>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap gap-3 p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Program / Branch</label>
      <select bind:value={selectedProgram} class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 min-w-[180px]">
        <option value="">All Programs</option>
        {#each programs as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
    {#if terms.length > 0}
      <div class="flex flex-col gap-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Semester</label>
        <select bind:value={selectedTerm} class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 min-w-[180px]">
          <option value="">All Semesters</option>
          {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </div>
    {/if}
    <div class="flex-1"></div>
    <div class="flex items-end">
      <span class="text-xs font-bold text-gray-400">{facultyWithSubjects().length} faculty · {totalSubjects} assignments</span>
    </div>
  </div>

  {#if loading}
    <div class="space-y-4">
      {#each Array(3) as _}
        <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl animate-pulse">
          <div class="flex gap-4 mb-4"><div class="w-11 h-11 rounded-2xl bg-gray-200 dark:bg-slate-700"></div><div class="flex-1 space-y-2"><div class="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3"></div><div class="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/4"></div></div></div>
        </div>
      {/each}
    </div>
  {:else if facultyWithSubjects().length === 0}
    <div class="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-gray-500 font-bold text-sm">No faculty have subjects assigned{selectedProgram || selectedTerm ? ' for these filters' : ''}</p>
      <p class="text-gray-400 text-xs mt-1">Use the Profiles tab to assign subjects to faculty</p>
    </div>
  {:else}
    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
        <p class="text-3xl font-black text-indigo-600">{facultyWithSubjects().length}</p>
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Faculty Teaching</p>
      </div>
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
        <p class="text-3xl font-black text-emerald-600">{totalSubjects}</p>
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Subject Assignments</p>
      </div>
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
        <p class="text-3xl font-black text-amber-600">{avgPerFaculty}</p>
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Avg / Faculty</p>
      </div>
    </div>

    <!-- Workload list -->
    <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div class="divide-y divide-gray-100 dark:divide-slate-800">
        {#each facultyWithSubjects() as f, i}
          <div class="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors" in:fly={{ x: -10, delay: Math.min(i * 30, 200) }}>
            <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black text-xs flex-shrink-0">{getInitials(f.name)}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-2 flex-wrap">
                <h4 class="font-black text-gray-900 dark:text-white text-sm">{f.name}</h4>
                {#if f.designation}<span class="text-[9px] font-bold text-gray-400">{f.designation}</span>{/if}
                {#if f.department}<span class="text-[9px] font-bold text-gray-400">· {f.department}</span>{/if}
              </div>
              <div class="flex flex-wrap gap-1.5">
                {#each f.filteredSubjects as sub}
                  <div class="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                    <span class="text-[8px] font-black uppercase tracking-wider text-indigo-600">{sub.subject_code}</span>
                    <span class="text-[10px] font-bold text-gray-700 dark:text-gray-300">{sub.subject_name}</span>
                    <span class="text-[8px] text-gray-400">({sub.program_name})</span>
                  </div>
                {/each}
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-xl font-black {getWorkloadColor(f.filteredSubjects.length)}">{f.filteredSubjects.length}</p>
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">subjects</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
