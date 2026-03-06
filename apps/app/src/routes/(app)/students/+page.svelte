<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import { fade, fly, slide } from 'svelte/transition';
  import type { PageData } from './$types';
  
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state('');

  $effect.pre(() => {
    selectedUniversityId = data.selectedUniversityId || '';
  });
  let showUploadModal = $state(false);
  let isUploading = $state(false);
  
  // File & Preview State
  let uploadFiles: FileList | null = $state(null);
  let detectedSheets = $state<string[]>([]);
  let selectedSheet = $state('');
  let previewHeaders = $state<string[]>([]);
  let previewRows = $state<any[]>([]);
  let totalPreviewRows = $state(0);
  let masterWorkbook: any = $state(null);
  let importResult = $state<{ count: number, skipped: number, message?: string } | null>(null);

  // Parse file when selected
  $effect(() => {
    if (uploadFiles && uploadFiles.length > 0) {
        const file = uploadFiles[0];
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
            loadWorkbook(file);
        }
    } else {
        resetPreview();
    }
  });

  // Re-parse when sheet changes
  $effect(() => {
    if (masterWorkbook && selectedSheet) {
        parseSheetData(masterWorkbook, selectedSheet);
    }
  });

  async function loadWorkbook(file: File) {
    try {
        const XLSX = await import('xlsx');
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            masterWorkbook = workbook;
            detectedSheets = workbook.SheetNames;
            
            if (detectedSheets.length > 0) {
                // Default to first sheet
                selectedSheet = detectedSheets[0]; 
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (e) {
        console.error('Error reading file:', e);
        alert('Failed to read file. Please ensure it is a valid Excel or CSV file.');
    }
  }

  function parseSheetData(workbook: any, sheetName: string) {
      if (!workbook) return;
     
      import('xlsx').then(XLSX => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return;

          // Parse JSON with headers
          const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
          
          // Filter empty rows
          const jsonData = rawData.filter(row => row && row.length > 0 && row.some((cell: any) => cell !== null && cell !== ''));

          if (jsonData.length > 0) {
              previewHeaders = (jsonData[0] as string[]) || [];
              const rows = jsonData.slice(1);
              totalPreviewRows = rows.length;
              previewRows = rows.slice(0, 10); // Preview first 10
          } else {
              previewHeaders = [];
              previewRows = [];
              totalPreviewRows = 0;
          }
      });
  }

  function resetPreview() {
      masterWorkbook = null;
      detectedSheets = [];
      selectedSheet = '';
      previewHeaders = [];
      previewRows = [];
      totalPreviewRows = 0;
  }

  function onUnivChange() {
    const url = new URL(window.location.href);
    if (selectedUniversityId) {
        url.searchParams.set('universityId', selectedUniversityId);
        url.searchParams.set('page', '1');
    } else {
        url.searchParams.delete('universityId');
    }
    goto(url.toString());
  }

  function changePage(p: number) {
      const url = new URL(window.location.href);
      url.searchParams.set('page', p.toString());
      goto(url.toString());
  }

  function changeLimit(l: string) {
      const url = new URL(window.location.href);
      url.searchParams.set('limit', l);
      url.searchParams.set('page', '1');
      goto(url.toString());
  }

  let totalPages = $derived(Math.ceil(data.totalCount / data.limit));
  
  // Extract dynamic headers from metadata (for main table)
  let dynamicHeaders = $derived.by(() => {
    const keys = new Set<string>();
    data.students.forEach((s: any) => {
      Object.keys(s.metadata || {}).forEach(k => keys.add(k));
    });
    const internal = ['sort_order', 'id', 'university_id', 'created_at', 'updated_at'];
    internal.forEach(k => keys.delete(k));
    return Array.from(keys);
  });

  function formatHeader(key: string) {
    if (key.includes(' ') && key[0] === key[0].toUpperCase()) return key;
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

    async function uploadCsv() {
        if (!uploadFiles || uploadFiles.length === 0) return;
        if (!selectedUniversityId && data.universities.length > 1) {
            alert('Select a university first');
            return;
        }

        isUploading = true;
        const formData = new FormData();
        formData.append('file', uploadFiles[0]);
        formData.append('universityId', selectedUniversityId || data.userUniversityId!);
        if (selectedSheet) {
            formData.append('sheetName', selectedSheet);
        }

        try {
            const res = await fetch('/api/students/upload-csv', {
                method: 'POST',
                body: formData
            });
            
            if (!res.ok) {
                const err = await res.json();
                alert(err.message || 'Upload failed');
                return;
            }

            const result = await res.json();
            importResult = result;
            
            // Auto-close modal after 3 seconds if successful
            setTimeout(() => {
                if (importResult) {
                    showUploadModal = false;
                    resetPreview();
                    importResult = null;
                    invalidateAll();
                }
            }, 3000);

        } catch (e) {
            console.error('Upload Error:', e);
            alert('Upload failed. Please check the file format.');
        } finally {
            isUploading = false;
        }
    }

    async function deleteAllStudents() {
        if (!selectedUniversityId && data.universities.length > 1) {
            alert('Select a university first');
            return;
        }
        if (!confirm('Are you sure you want to delete ALL students for this university? This cannot be undone.')) return;

        try {
            const univId = selectedUniversityId || data.userUniversityId;
            const res = await fetch(`/api/students/delete-all?universityId=${univId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                invalidateAll();
            } else {
                alert('Failed to delete students');
            }
        } catch (e) {
            alert('Error deleting students');
        }
    }

    async function deleteOneStudent(id: string) {
        if (!confirm('Delete this student?')) return;
        try {
            const univId = selectedUniversityId || data.userUniversityId;
            const res = await fetch(`/api/students/delete?id=${id}&universityId=${univId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                invalidateAll();
            } else {
                alert('Failed to delete student');
            }
        } catch (e) {
            alert('Error deleting student');
        }
    }
</script>

<div class="space-y-8 animate-premium-fade w-full max-w-full overflow-hidden">
  <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
    <div class="animate-premium-slide">
      <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Contact List <span class="text-[10px] font-normal text-gray-400 dark:text-gray-600 opacity-50 ml-3 italic">v5.0.0-PRO</span></h1>
      <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Secure management of student records and contact details.</p>
    </div>
    <div class="flex flex-wrap items-center gap-4 w-full lg:w-auto animate-premium-slide" style="animation-delay: 100ms;">
        {#if data.students.length > 0}
            <button 
                onclick={deleteAllStudents}
                class="flex-1 lg:flex-none px-6 py-3 border border-red-200 dark:border-red-900/30 text-[11px] font-black uppercase tracking-widest rounded-2xl text-red-600 dark:text-red-400 bg-white/50 dark:bg-red-950/20 hover:bg-red-600 hover:text-white transition-all active:scale-95"
            >
                Clear All
            </button>
        {/if}
        <button 
            onclick={() => showUploadModal = true}
            class="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 relative overflow-visible"
        >
            <svg class="h-4 w-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            Import Students
            <span class="absolute -top-2 -right-1 bg-green-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse tracking-tighter">ULTRA</span>
        </button>
    </div>
  </div>

  {#if data.universities.length > 1}
    <div class="glass p-6 rounded-[2.5rem] flex items-center gap-6 animate-premium-slide" style="animation-delay: 200ms;">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">University:</label>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={onUnivChange}
            class="flex-1 max-w-md bg-white/50 dark:bg-slate-800/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all text-gray-900 dark:text-white"
        >
            <option value="">Global Hierarchy</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="glass overflow-hidden rounded-[2.5rem] animate-premium-slide" style="animation-delay: 300ms;">
    <div class="overflow-x-auto w-full">
      <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
        <thead class="bg-gray-50/50 dark:bg-slate-800/50">
          <tr>
            {#each dynamicHeaders as header}
              <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">{formatHeader(header)}</th>
            {/each}
            <th class="px-8 py-5 text-right text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Protocol</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
          {#each data.students as student}
            <tr class="group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              {#each dynamicHeaders as header}
                  <td class="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {student.metadata?.[header] || '---'}
                  </td>
              {/each}
              <td class="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                  <a 
                    href="/plagiarism"
                    class="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all active:scale-95 shadow-sm"
                  >
                    Scan Analysis
                  </a>
                  <button 
                    onclick={() => deleteOneStudent(student.id)}
                    class="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95 shadow-sm"
                  >
                    Delete Entry
                  </button>
                </div>
              </td>
            </tr>
          {/each}
          {#if data.students.length === 0}
              <tr>
                  <td colspan={1 + dynamicHeaders.length} class="px-8 py-24 text-center">
                    <div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 space-y-4">
                        <div class="w-16 h-16 rounded-3xl bg-gray-50 dark:bg-slate-800/50 flex items-center justify-center">
                          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        </div>
                        <p class="text-[10px] font-black uppercase tracking-[0.2em]">
                          {selectedUniversityId 
                            ? `No records found in ${data.universities.find(u => u.id === selectedUniversityId)?.name || 'this university'}.` 
                            : data.userUniversityId 
                                ? `No records found. Try re-importing for your assigned university.` 
                                : 'Select a university from the menu to view student records.'}
                        </p>
                    </div>
                  </td>
              </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    {#if data.totalCount > 0}
      <div class="bg-gray-50/50 dark:bg-slate-800/50 px-8 py-6 flex items-center justify-between border-t border-gray-100 dark:border-slate-800">
        <div class="flex-1 flex justify-between sm:hidden">
            <button onclick={() => changePage(data.currentPage - 1)} disabled={data.currentPage === 1} class="px-5 py-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-all shadow-sm active:scale-95 cursor-pointer">Previous</button>
            <button onclick={() => changePage(data.currentPage + 1)} disabled={data.currentPage === totalPages} class="px-5 py-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-all shadow-sm active:scale-95 cursor-pointer">Next</button>
        </div>
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div class="text-[10px] text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest">
                Displaying <span class="text-indigo-600 dark:text-indigo-400">{(data.currentPage - 1) * data.limit + 1} - {Math.min(data.currentPage * data.limit, data.totalCount)}</span> <span class="mx-1">/</span> Total {data.totalCount} Records
            </div>
            <div class="flex items-center space-x-4">
                <nav class="relative z-0 inline-flex shadow-sm -space-x-px rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden" aria-label="Pagination">
                    {#each Array(totalPages) as _, i}
                        {#if totalPages <= 7 || (i + 1 >= data.currentPage - 2 && i + 1 <= data.currentPage + 2) || i === 0 || i === totalPages - 1}
                            <button 
                              onclick={() => changePage(i + 1)} 
                              class="relative inline-flex items-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all
                              {data.currentPage === i + 1 ? 'z-10 bg-indigo-600 text-white shadow-inner' : 'bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}"
                            >
                              {i + 1}
                            </button>
                        {:else if (i + 1 === data.currentPage - 3) || (i + 1 === data.currentPage + 3)}
                            <span class="relative inline-flex items-center px-4 py-2.5 bg-white dark:bg-slate-900 text-[10px] font-black text-gray-400 dark:text-gray-600 italic">...</span>
                        {/if}
                    {/each}
                </nav>
            </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showUploadModal}
<div class="fixed z-[60] inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
    <div 
      class="fixed inset-0 bg-gray-950/80 backdrop-blur-sm transition-opacity animate-premium-fade" 
      onclick={() => showUploadModal = false}
      onkeydown={(e) => e.key === 'Escape' && (showUploadModal = false)}
      role="button"
      tabindex="-1"
      aria-label="Close Modal"
    ></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom glass dark:bg-slate-900/95 border-gray-100 dark:border-slate-800 rounded-[3rem] text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full animate-premium-scale">
      <div class="px-8 pt-8 pb-6 sm:p-10 max-h-[85vh] overflow-y-auto">
        <h3 class="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-6" id="modal-title">Import Students</h3>
        
        {#if importResult}
            <div class="mb-10 animate-premium-scale" in:fade>
                <div class="bg-indigo-600 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-500/40">
                    <div class="absolute top-0 right-0 p-4 opacity-10">
                        <svg class="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    </div>
                    <div class="relative z-10 flex flex-col items-center text-center">
                        <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-md">
                            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h4 class="text-xl font-black uppercase tracking-widest mb-2">Import Successful</h4>
                        <div class="flex gap-4 mt-2">
                            <div class="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm">
                                <span class="block text-[10px] uppercase font-black opacity-60">Imported</span>
                                <span class="text-2xl font-black tracking-tighter">{importResult.count}</span>
                            </div>
                            {#if importResult.skipped > 0}
                                <div class="bg-red-500/20 px-4 py-2 rounded-xl backdrop-blur-sm">
                                    <span class="block text-[10px] uppercase font-black opacity-60">Skipped</span>
                                    <span class="text-2xl font-black tracking-tighter">{importResult.skipped}</span>
                                </div>
                            {/if}
                        </div>
                        <p class="mt-6 text-[10px] font-black uppercase tracking-[0.2em] opacity-80 animate-pulse">Closing session...</p>
                    </div>
                </div>
            </div>
        {/if}

        {#if data.universities.length > 1 && !selectedUniversityId}
            <div class="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-5 rounded-2xl mb-6 text-[11px] font-black uppercase tracking-widest border border-red-100 dark:border-red-800/50">
                Warning: A university must be selected before importing.
            </div>
        {:else}
            <div class="space-y-10">
                <!-- File Input -->
                <div class="border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-[2.5rem] p-10 text-center hover:border-indigo-500 dark:hover:border-indigo-400 transition-all bg-gray-50/50 dark:bg-slate-800/30 group">
                    <input 
                        type="file" 
                        id="file-upload"
                        accept=".csv,.xlsx,.xls"
                        bind:files={uploadFiles}
                        class="hidden"
                    />
                    <label for="file-upload" class="cursor-pointer block">
                      <div class="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl shadow-sm mx-auto mb-6 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg class="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      </div>
                      <p class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Select Source File</p>
                      <p class="text-[10px] text-gray-400 dark:text-slate-400 mt-2 uppercase tracking-widest italic">Standard CSV / XLSX Protocol Supported</p>
                      {#if uploadFiles && uploadFiles.length > 0}
                        <div class="mt-4 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl inline-block shadow-lg animate-premium-slide">
                          LOADED: {uploadFiles[0].name}
                        </div>
                      {/if}
                    </label>
                </div>

                <!-- Sheet Selection -->
                {#if detectedSheets.length > 1}
                    <div class="bg-indigo-50/50 dark:bg-indigo-900/20 p-6 rounded-[2rem] border border-indigo-100/50 dark:border-indigo-800/30">
                        <label for="sheet-select" class="block text-[10px] font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest mb-3">Target Matrix:</label>
                        <select 
                            id="sheet-select" 
                            bind:value={selectedSheet}
                            class="block w-full bg-white dark:bg-slate-950 border border-indigo-100 dark:border-indigo-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 text-sm font-bold rounded-2xl px-5 py-3 text-gray-900 dark:text-white transition-all shadow-sm"
                        >
                            {#each detectedSheets as sheet}
                                <option value={sheet}>{sheet}</option>
                            {/each}
                        </select>
                    </div>
                {/if}

                <!-- Preview Table -->
                {#if previewHeaders.length > 0}
                    <div class="animate-premium-fade">
                        <div class="flex justify-between items-center mb-4">
                             <h4 class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Data Stream Preview</h4>
                             <span class="text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter italic">Count: {totalPreviewRows} Records</span>
                        </div>
                        <div class="border border-gray-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
                          <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                <thead class="bg-gray-50/50 dark:bg-slate-800/50">
                                    <tr>
                                        {#each previewHeaders as header}
                                            <th class="px-6 py-3 text-left text-[9px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-widest whitespace-nowrap">{header}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody class="bg-white/50 dark:bg-slate-900/50 divide-y divide-gray-50 dark:divide-gray-800/50">
                                    {#each previewRows as row}
                                        <tr>
                                            {#each previewHeaders as header}
                                                <td class="px-6 py-3 whitespace-nowrap text-[11px] font-bold text-gray-600 dark:text-gray-400">
                                                    {Array.isArray(row) ? row[previewHeaders.indexOf(header)] : row[header] || '---'}
                                                </td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                          </div>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
      </div>
      <div class="bg-gray-50/80 dark:bg-slate-800/50 backdrop-blur-md px-8 py-6 sm:px-10 sm:flex sm:flex-row-reverse border-t border-gray-100 dark:border-slate-800 rounded-b-[3rem]">
        <button 
            type="button" 
            onclick={uploadCsv}
            disabled={isUploading || !uploadFiles || (data.universities.length > 1 && !selectedUniversityId)}
            class="w-full inline-flex justify-center rounded-2xl border border-transparent shadow-lg px-6 py-3 bg-indigo-600 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-indigo-700 transition-all sm:ml-4 sm:w-auto active:scale-95 disabled:opacity-30 disabled:grayscale"
        >
          {isUploading ? 'Importing...' : `Confirm Import`}
        </button>
        <button 
            type="button" 
            onclick={() => { showUploadModal = false; resetPreview(); }}
            class="mt-3 w-full inline-flex justify-center rounded-2xl border border-gray-100 dark:border-slate-800 px-6 py-3 bg-white dark:bg-slate-900 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all sm:mt-0 sm:w-auto active:scale-95 shadow-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</div>
{/if}

{#if isUploading}
    <!-- Full Screen Loading Overlay with Micro-interactions -->
    <div class="fixed inset-0 bg-gray-950/90 backdrop-blur-xl z-[70] flex flex-col items-center justify-center animate-premium-fade">
        <div class="relative w-24 h-24 mb-8">
            <div class="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
            <div class="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <div class="absolute inset-4 border-4 border-blue-400/20 rounded-full animate-pulse"></div>
        </div>
        <span class="text-[12px] text-white font-black uppercase tracking-[0.3em] animate-pulse">Importing student data...</span>
        <span class="mt-4 text-[9px] text-gray-400 font-bold uppercase tracking-widest italic animate-premium-slide" style="animation-delay: 1000ms;">Synchronizing university data</span>
    </div>
{/if}
 <!-- Closes root space-y-6 -->


