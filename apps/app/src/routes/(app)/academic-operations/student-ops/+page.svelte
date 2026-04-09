<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { getContext } from "svelte";

  let { data } = $props();

  // Sync with parent ops university selector
  const parentUniCtx = getContext<{ get: () => string }>('opsUniversityId');

  let universityId = $state(data.filters.universityId);
  let search = $state(data.filters.search);
  let programId = $state(data.filters.programId);
  let termId = $state(data.filters.termId);
  let batchId = $state(data.filters.batchId);
  let searchTimeout: ReturnType<typeof setTimeout>;

  // When parent university selector changes, apply the filter
  $effect(() => {
    const parentId = parentUniCtx?.get();
    if (parentId && parentId !== universityId) {
      universityId = parentId;
      programId = '';
      termId = '';
      batchId = '';
      applyFilters();
    }
  });

  function applyFilters(pg = 1) {
    const params = new URLSearchParams();
    if (universityId) params.set('universityId', universityId);
    if (programId) params.set('programId', programId);
    if (termId) params.set('termId', termId);
    if (batchId) params.set('batchId', batchId);
    if (search) params.set('search', search);
    if (pg > 1) params.set('page', String(pg));
    goto(`?${params.toString()}`, { keepFocus: true });
  }

  function gotoPage(pg: number) { applyFilters(pg); }

  $effect(() => {
    // Derived pagination values
    totalPages = Math.max(1, Math.ceil(data.total / (data.pageSize || 50)));
    currentPage = data.page || 1;
  });

  let totalPages = $state(1);
  let currentPage = $state(1);

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
    batchId = '';
    applyFilters();
  }

  const statusColor: Record<string, string> = {
    ENROLLED:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    GRADUATED:  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    SUSPENDED:  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    ON_LEAVE:   'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  };

  // ─── Bulk Import ───
  let showImportModal = $state(false);
  let importing = $state(false);
  let importResult = $state<any>(null);
  let importTermName = $state('');

  // ─── Bulk Document Upload ───
  let showDocUploadModal = $state(false);
  let uploadingDocs = $state(false);
  let docUploadResult = $state<any>(null);

  async function downloadTemplate() {
    window.open('/api/academic/students/bulk-import', '_blank');
  }

  async function handleBulkImport(e: Event) {
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    formData.set('university_id', universityId);
    formData.set('term_name', importTermName);
    if (batchId) formData.set('batch_id', batchId);

    importing = true;
    importResult = null;
    try {
      const res = await fetch('/api/academic/students/bulk-import', {
        method: 'POST',
        body: formData
      });
      importResult = await res.json();
      if (importResult.success) {
        setTimeout(() => { showImportModal = false; applyFilters(); }, 2000);
      }
    } catch {
      importResult = { success: false, summary: 'Upload failed — check file format' };
    } finally { importing = false; }
  }

  async function handleBulkDocUpload(e: Event) {
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    formData.set('university_id', universityId);

    uploadingDocs = true;
    docUploadResult = null;
    try {
      const res = await fetch('/api/academic/students/bulk-documents', {
        method: 'POST',
        body: formData
      });
      docUploadResult = await res.json();
    } catch {
      docUploadResult = { success: false, summary: 'Upload failed — check ZIP format' };
    } finally { uploadingDocs = false; }
  }

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
    <div class="flex items-center gap-2">
      <button onclick={() => showDocUploadModal = true}
        class="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Bulk Documents
      </button>
      <button onclick={() => showImportModal = true}
        class="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
        Bulk Import
      </button>
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

    <!-- Batch filter -->
    {#if data.batches?.length > 0}
    <div class="relative">
      <select
        bind:value={batchId}
        onchange={applyFilters}
        class="pl-4 pr-10 py-3 bg-amber-500 text-white border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-amber-400 outline-none appearance-none cursor-pointer"
      >
        <option value="">All Batches</option>
        {#each data.batches as b}
          <option value={b.id}>{b.name}</option>
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
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Program</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Term</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Section</th>
              <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
            {#each data.students as student, i (student.id)}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer" onclick={() => goto(`/academic-operations/student-ops/${student.id}`)} in:fly={{ y: 8, delay: Math.min(i * 20, 200) }}>
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
                  {#if student.batch_name}
                    <span class="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-lg">{student.batch_name}</span>
                  {:else}
                    <span class="text-xs text-gray-400">—</span>
                  {/if}
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
      {#if totalPages > 1}
        <div class="px-6 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <p class="text-xs text-gray-400 font-medium">
            Showing {(currentPage - 1) * (data.pageSize || 50) + 1}–{Math.min(currentPage * (data.pageSize || 50), data.total)} of {data.total}
          </p>
          <div class="flex items-center gap-1">
            <button onclick={() => gotoPage(currentPage - 1)} disabled={currentPage <= 1}
              class="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
              Prev
            </button>
            {#each Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
              if (totalPages <= 7) return i + 1;
              if (currentPage <= 4) return i + 1;
              if (currentPage >= totalPages - 3) return totalPages - 6 + i;
              return currentPage - 3 + i;
            }) as pg}
              <button onclick={() => gotoPage(pg)}
                class="w-8 h-8 text-xs font-bold rounded-lg transition-colors {pg === currentPage ? 'bg-indigo-600 text-white' : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500'}">
                {pg}
              </button>
            {/each}
            <button onclick={() => gotoPage(currentPage + 1)} disabled={currentPage >= totalPages}
              class="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors">
              Next
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Bulk Import Modal -->
{#if showImportModal}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" transition:fade>
  <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 mx-4" in:fly={{ y: 20 }}>
    <div class="flex items-center justify-between mb-5">
      <div>
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Bulk Import Students</h3>
        <p class="text-[10px] text-gray-400 font-medium mt-1">Upload an Excel file with all student details. PII will be encrypted.</p>
      </div>
      <button onclick={() => showImportModal = false} aria-label="Close import modal"
        class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- Download template -->
    <button onclick={downloadTemplate}
      class="w-full flex items-center gap-3 p-4 mb-4 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-500/5 hover:bg-indigo-50 transition-colors group">
      <div class="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      </div>
      <div class="text-left">
        <p class="text-sm font-black text-indigo-700 dark:text-indigo-400 group-hover:underline">Download Template</p>
        <p class="text-[10px] text-gray-400">Excel file with all columns and instructions</p>
      </div>
    </button>

    <!-- Security notice -->
    <div class="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
      <div class="flex items-start gap-2">
        <svg class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        <div>
          <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Top-Grade Security</p>
          <p class="text-[9px] text-emerald-600/80 mt-0.5">Phone, Aadhaar, and parent contacts are individually encrypted with AES-256-GCM. All access is audit-logged.</p>
        </div>
      </div>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleBulkImport(e); }}>
      <div class="space-y-4">
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Term Name</label>
          <input type="text" bind:value={importTermName} required placeholder="e.g. Semester 2 - 2026"
            class="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500" />
          <p class="text-[9px] text-gray-400 mt-1">Must match an existing term name exactly</p>
        </div>
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Excel File</label>
          <input type="file" name="file" required accept=".xlsx,.xls"
            class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" />
          <p class="text-[9px] text-gray-400 mt-1">Each sheet tab = one program code. Required columns: Student Name, NIAT ID</p>
        </div>
      </div>

      {#if importResult}
        <div class="mt-4 p-3 rounded-xl border {importResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}">
          <p class="text-xs font-bold">{importResult.summary}</p>
          {#if importResult.errors?.length > 0}
            <div class="mt-2 max-h-32 overflow-y-auto">
              {#each importResult.errors.slice(0, 10) as err}
                <p class="text-[9px] mt-1">
                  <span class="font-bold">{err.sheet}</span>{err.row ? ` row ${err.row}` : ''}: {err.reason}
                </p>
              {/each}
              {#if importResult.errors.length > 10}
                <p class="text-[9px] mt-1 font-bold">...and {importResult.errors.length - 10} more errors</p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <div class="flex gap-3 mt-5">
        <button type="submit" disabled={importing || !importTermName}
          class="flex-1 px-4 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {#if importing}
            <span class="inline-flex items-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Importing & Encrypting...
            </span>
          {:else}
            Import Students
          {/if}
        </button>
        <button type="button" onclick={() => { showImportModal = false; importResult = null; }}
          class="px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  </div>
</div>
{/if}

<!-- Bulk Document Upload Modal -->
{#if showDocUploadModal}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" transition:fade>
  <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto" in:fly={{ y: 20 }}>
    <div class="flex items-center justify-between mb-5">
      <div>
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Bulk Document Upload</h3>
        <p class="text-[10px] text-gray-400 font-medium mt-1">Upload a ZIP file with all student documents. Every file will be encrypted with AES-256-GCM.</p>
      </div>
      <button onclick={() => { showDocUploadModal = false; docUploadResult = null; }} aria-label="Close document upload modal"
        class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>

    <!-- How to structure the ZIP -->
    <div class="p-4 mb-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
      <h4 class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest mb-3">How to prepare the ZIP file</h4>

      <div class="space-y-3">
        <div class="flex gap-3">
          <div class="w-7 h-7 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
            <span class="text-xs font-black text-indigo-600">1</span>
          </div>
          <div>
            <p class="text-xs font-bold text-gray-700 dark:text-gray-300">Create a folder for each student using their <span class="text-indigo-600 font-black">NIAT ID</span> as the folder name</p>
            <p class="text-[10px] text-gray-400 mt-0.5">Example: <code class="bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">N25H02A0004/</code></p>
          </div>
        </div>

        <div class="flex gap-3">
          <div class="w-7 h-7 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
            <span class="text-xs font-black text-indigo-600">2</span>
          </div>
          <div>
            <p class="text-xs font-bold text-gray-700 dark:text-gray-300">Name each file using the <span class="text-indigo-600 font-black">document type code</span> (see table below)</p>
            <p class="text-[10px] text-gray-400 mt-0.5">Example: <code class="bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono">CERTIFICATE_10TH.pdf</code></p>
          </div>
        </div>

        <div class="flex gap-3">
          <div class="w-7 h-7 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
            <span class="text-xs font-black text-indigo-600">3</span>
          </div>
          <div>
            <p class="text-xs font-bold text-gray-700 dark:text-gray-300">ZIP all the folders together and upload</p>
            <p class="text-[10px] text-gray-400 mt-0.5">Select all student folders > Right-click > Compress / Send to ZIP</p>
          </div>
        </div>
      </div>

      <!-- Example structure -->
      <div class="mt-4 p-3 bg-gray-900 dark:bg-black rounded-xl">
        <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Example ZIP structure</p>
        <pre class="text-[11px] font-mono text-emerald-400 leading-relaxed">documents.zip
  N25H02A0004/
    CERTIFICATE_10TH.pdf
    MARKSHEET_10TH.pdf
    ID_PROOF_AADHAAR.jpg
    PASSPORT_PHOTO.jpg
  N25H02A0006/
    CERTIFICATE_10TH.pdf
    CERTIFICATE_12TH.pdf
    PAYMENT_RECEIPT.pdf</pre>
      </div>
    </div>

    <!-- Document Type Codes Reference -->
    <details class="mb-4">
      <summary class="cursor-pointer px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-black text-gray-600 dark:text-gray-300 hover:bg-gray-100 transition-colors">
        Document Type Codes (click to expand)
      </summary>
      <div class="mt-2 grid grid-cols-2 gap-1.5 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
        {#each [
          ['CERTIFICATE_10TH', '10th Certificate', true],
          ['MARKSHEET_10TH', '10th Marksheet', true],
          ['CERTIFICATE_11TH', '11th Certificate', false],
          ['MARKSHEET_11TH', '11th Marksheet', false],
          ['CERTIFICATE_12TH', '12th Certificate', true],
          ['MARKSHEET_12TH', '12th Marksheet', true],
          ['DEGREE_CERTIFICATE', 'Degree Certificate', false],
          ['TRANSFER_CERTIFICATE', 'Transfer Certificate', false],
          ['MIGRATION_CERTIFICATE', 'Migration Certificate', false],
          ['ID_PROOF_AADHAAR', 'Aadhaar Card', true],
          ['PASSPORT_PHOTO', 'Passport Photo', true],
          ['SIGNATURE', 'Signature', true],
          ['PAYMENT_RECEIPT', 'Payment Receipt', true],
          ['ADMISSION_RECEIPT', 'Admission Receipt', true],
          ['FEE_RECEIPT', 'Fee Receipt', false],
          ['HOSTEL_RECEIPT', 'Hostel Fee Receipt', false],
          ['INCOME_CERTIFICATE', 'Income Certificate', false],
          ['CASTE_CERTIFICATE', 'Caste Certificate', false],
          ['SCHOLARSHIP_LETTER', 'Scholarship Letter', false],
          ['OTHER', 'Other Document', false],
        ] as [code, label, required]}
          <div class="flex items-center justify-between px-2 py-1.5 rounded-lg {required ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}">
            <code class="text-[10px] font-mono font-bold text-gray-700 dark:text-gray-300">{code}</code>
            {#if required}
              <span class="text-[8px] font-black text-red-500 uppercase">Req</span>
            {/if}
          </div>
        {/each}
      </div>
    </details>

    <!-- Security notice -->
    <div class="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
      <div class="flex items-start gap-2">
        <svg class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        <div>
          <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">End-to-End Encryption</p>
          <p class="text-[9px] text-emerald-600/80 mt-0.5">Every file is encrypted with AES-256-GCM + SHA-256 integrity hash. No plaintext files are stored on disk — documents exist only as encrypted blobs in the database. Every upload is audit-logged.</p>
        </div>
      </div>
    </div>

    <form onsubmit={(e) => { e.preventDefault(); handleBulkDocUpload(e); }}>
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">ZIP File</label>
        <input type="file" name="file" required accept=".zip"
          class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-emerald-50 file:text-emerald-600 hover:file:bg-emerald-100" />
        <p class="text-[9px] text-gray-400 mt-1">Max 500MB. Allowed file types inside: PDF, JPG, PNG, WebP (max 10MB each)</p>
      </div>

      {#if docUploadResult}
        <div class="mt-4 p-4 rounded-xl border {docUploadResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}">
          <p class="text-xs font-bold {docUploadResult.success ? 'text-emerald-700' : 'text-amber-700'}">{docUploadResult.summary}</p>

          {#if docUploadResult.students_not_found?.length > 0}
            <div class="mt-2">
              <p class="text-[10px] font-black text-red-600 uppercase">Students not found:</p>
              <p class="text-[10px] text-red-500 mt-1">{docUploadResult.students_not_found.join(', ')}</p>
            </div>
          {/if}

          {#if docUploadResult.errors?.length > 0}
            <div class="mt-2 max-h-40 overflow-y-auto">
              <p class="text-[10px] font-black text-red-600 uppercase mb-1">Errors:</p>
              {#each docUploadResult.errors.slice(0, 15) as err}
                <p class="text-[9px] text-red-600 mt-0.5">
                  <span class="font-bold font-mono">{err.niatId}/{err.file}</span>: {err.reason}
                </p>
              {/each}
              {#if docUploadResult.errors.length > 15}
                <p class="text-[9px] text-red-600 mt-1 font-bold">...and {docUploadResult.errors.length - 15} more</p>
              {/if}
            </div>
          {/if}

          {#if docUploadResult.documents_uploaded > 0}
            <div class="mt-3 grid grid-cols-3 gap-2">
              <div class="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-center">
                <p class="text-lg font-black text-emerald-700">{docUploadResult.documents_uploaded}</p>
                <p class="text-[8px] font-bold text-emerald-600 uppercase">Encrypted</p>
              </div>
              <div class="p-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-center">
                <p class="text-lg font-black text-gray-600">{docUploadResult.documents_skipped}</p>
                <p class="text-[8px] font-bold text-gray-500 uppercase">Skipped</p>
              </div>
              <div class="p-2 rounded-lg bg-red-100 dark:bg-red-500/20 text-center">
                <p class="text-lg font-black text-red-600">{docUploadResult.documents_failed}</p>
                <p class="text-[8px] font-bold text-red-500 uppercase">Failed</p>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <div class="flex gap-3 mt-5">
        <button type="submit" disabled={uploadingDocs}
          class="flex-1 px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {#if uploadingDocs}
            <span class="inline-flex items-center gap-2">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Encrypting & Uploading...
            </span>
          {:else}
            Upload & Encrypt All
          {/if}
        </button>
        <button type="button" onclick={() => { showDocUploadModal = false; docUploadResult = null; }}
          class="px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  </div>
</div>
{/if}
