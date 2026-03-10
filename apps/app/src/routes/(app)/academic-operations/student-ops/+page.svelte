<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  let { data } = $props();

  let universityId = $state(data.filters.universityId);
  let search = $state(data.filters.search);
  let programId = $state(data.filters.programId);
  let termId = $state(data.filters.termId);
  let searchTimeout: ReturnType<typeof setTimeout>;

  function applyFilters() {
    const params = new URLSearchParams();
    if (universityId) params.set('universityId', universityId);
    if (programId) params.set('programId', programId);
    if (termId) params.set('termId', termId);
    if (search) params.set('search', search);
    goto(`?${params.toString()}`, { keepFocus: true });
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 400);
  }

  function onFilterChange() {
    if (programId !== data.filters.programId) termId = '';
    applyFilters();
  }

  function onUniversityChange() {
    programId = '';
    termId = '';
    applyFilters();
  }

  const statusColor: Record<string, string> = {
    ENROLLED:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    GRADUATED:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    SUSPENDED:  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    ON_LEAVE:   'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  };

  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Header -->
  <div class="flex items-start justify-between">
    <div>
      <h1 class="text-2xl font-black text-gray-900 dark:text-white">Student <span class="text-indigo-600">Roster</span></h1>
      <p class="text-xs text-gray-400 font-medium mt-1">{data.total} students enrolled</p>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap gap-3">
    <!-- University selector (admin only) -->
    {#if data.universities?.length > 0}
    <div class="relative">
      <select
        bind:value={universityId}
        onchange={onUniversityChange}
        class="pl-4 pr-10 py-3 bg-indigo-600 text-white border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-400 outline-none appearance-none cursor-pointer"
      >
        {#each data.universities as u}
          <option value={u.id}>{u.name}</option>
        {/each}
      </select>
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/70">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>
    {/if}

    <!-- Search -->
    <div class="relative flex-1 min-w-[200px]">
      <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
      </svg>
      <input
        type="text"
        bind:value={search}
        oninput={onSearchInput}
        placeholder="Search by name, ID or email..."
        class="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
      />
    </div>

    <!-- Program filter -->
    <div class="relative">
      <select
        bind:value={programId}
        onchange={onFilterChange}
        class="pl-4 pr-10 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
      >
        <option value="">All Programs</option>
        {#each data.programs as p}
          <option value={p.id}>{p.code} — {p.name}</option>
        {/each}
      </select>
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>

    <!-- Term filter -->
    {#if data.terms.length > 0}
    <div class="relative">
      <select
        bind:value={termId}
        onchange={onFilterChange}
        class="pl-4 pr-10 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
      >
        <option value="">All Terms</option>
        {#each data.terms as t}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
      <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
      </div>
    </div>
    {/if}
  </div>

  <!-- Table -->
  <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
    {#if data.students.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-center">
        <div class="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
          </svg>
        </div>
        <p class="text-sm font-black text-gray-400 uppercase tracking-widest">No students found</p>
        <p class="text-xs text-gray-400 font-medium mt-1">Import students from Setup & Config to get started</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-100 dark:border-slate-800">
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Student</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">NIAT ID</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Program</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Term</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Section</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
            {#each data.students as student, i (student.id)}
              <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors" in:fly={{ y: 8, delay: Math.min(i * 20, 200) }}>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[10px] font-black shrink-0">
                      {initials(student.name)}
                    </div>
                    <div>
                      <p class="text-sm font-black text-gray-900 dark:text-white">{student.name}</p>
                      {#if student.email}
                        <p class="text-[10px] text-gray-400 font-medium">{student.email}</p>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="text-sm font-mono font-bold text-gray-700 dark:text-gray-300">{student.enrollment_number || '—'}</span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg">{student.program_code || '—'}</span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400">{student.term_name || '—'}</span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-xs font-medium text-gray-600 dark:text-gray-400">{student.section_name || '—'}</span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg {statusColor[student.student_status] ?? 'bg-gray-100 text-gray-600'}">
                    {student.student_status || 'ENROLLED'}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if data.total > 500}
        <div class="px-6 py-4 border-t border-gray-100 dark:border-slate-800 text-center">
          <p class="text-xs text-gray-400 font-medium">Showing 500 of {data.total} students — use filters to narrow down</p>
        </div>
      {/if}
    {/if}
  </div>
</div>
