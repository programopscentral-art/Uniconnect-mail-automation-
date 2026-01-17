<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
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
            alert(result.message || `Successfully imported ${result.count} students.`);
            showUploadModal = false;
            resetPreview();
            invalidateAll();
        } catch (e) {
            alert('Upload failed');
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
      <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Secure management of student identities and institutional communication vectors.</p>
    </div>
    <div class="flex flex-wrap items-center gap-4 w-full lg:w-auto animate-premium-slide" style="animation-delay: 100ms;">
        {#if data.students.length > 0}
            <button 
                onclick={deleteAllStudents}
                class="flex-1 lg:flex-none px-6 py-3 border border-red-200 dark:border-red-900/30 text-[11px] font-black uppercase tracking-widest rounded-2xl text-red-600 dark:text-red-400 bg-white/50 dark:bg-red-950/20 hover:bg-red-600 hover:text-white transition-all active:scale-95"
            >
                Purge All
            </button>
        {/if}
        <button 
            onclick={() => showUploadModal = true}
            class="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 relative overflow-visible"
        >
            <svg class="h-4 w-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            Ingest Data
            <span class="absolute -top-2 -right-1 bg-green-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse tracking-tighter">ULTRA</span>
        </button>
    </div>
  </div>

  {#if data.universities.length > 1}
    <div class="glass p-6 rounded-[2.5rem] flex items-center gap-6 animate-premium-slide" style="animation-delay: 200ms;">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Source Node:</label>
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
                        <p class="text-[10px] font-black uppercase tracking-[0.2em]">{selectedUniversityId ? 'No identities registered in this node.' : 'Select source node to initialize matrix.'}</p>
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
                Displaying <span class="text-indigo-600 dark:text-indigo-400">{(data.currentPage - 1) * data.limit + 1} - {Math.min(data.currentPage * data.limit, data.totalCount)}</span> <span class="mx-1">/</span> Total {data.totalCount} Identities
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
        <h3 class="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-6" id="modal-title">Data Ingestion Engine</h3>
        
        {#if data.universities.length > 1 && !selectedUniversityId}
            <div class="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-5 rounded-2xl mb-6 text-[11px] font-black uppercase tracking-widest border border-red-100 dark:border-red-800/50">
                Warning: Institutional node must be defined before ingestion.
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
                             <span class="text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter italic">Count: {totalPreviewRows} Entities</span>
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
          {isUploading ? 'Executing...' : `Confirm Matrix Ingestion`}
        </button>
        <button 
            type="button" 
            onclick={() => { showUploadModal = false; resetPreview(); }}
            class="mt-3 w-full inline-flex justify-center rounded-2xl border border-gray-100 dark:border-slate-800 px-6 py-3 bg-white dark:bg-slate-900 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all sm:mt-0 sm:w-auto active:scale-95 shadow-sm"
        >
          Abort Protocol
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
        <span class="text-[12px] text-white font-black uppercase tracking-[0.3em] animate-pulse">Ingesting Source Data...</span>
        <span class="mt-4 text-[9px] text-gray-400 font-bold uppercase tracking-widest italic animate-premium-slide" style="animation-delay: 1000ms;">Synchronizing institutional nodes</span>
    </div>
{/if}
 <!-- Closes root space-y-6 -->

{#if showUploadModal}
<div class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
    <div 
      class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
      onclick={() => showUploadModal = false}
      onkeydown={(e) => e.key === 'Escape' && (showUploadModal = false)}
      role="button"
      tabindex="-1"
      aria-label="Close Modal"
    ></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg leading-6 font-bold text-gray-900 mb-4" id="modal-title">Import Students</h3>
        
        {#if data.universities.length > 1 && !selectedUniversityId}
            <div class="bg-red-50 text-red-700 p-4 rounded-lg mb-4 text-sm">Please select a university on the main page first.</div>
        {:else}
            <div class="space-y-6">
                <!-- File Input -->
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors bg-gray-50">
                    <input 
                        type="file" 
                        accept=".csv,.xlsx,.xls"
                        bind:files={uploadFiles}
                        class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />
                    <p class="text-xs text-gray-400 mt-2">Supports .CSV and .XLSX files. First row must be headers.</p>
                </div>

                <!-- Sheet Selection -->
                {#if detectedSheets.length > 1}
                    <div class="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <label for="sheet-select" class="block text-sm font-bold text-blue-900 mb-2">Select Sheet to Import:</label>
                        <select 
                            id="sheet-select" 
                            bind:value={selectedSheet}
                            class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        >
                            {#each detectedSheets as sheet}
                                <option value={sheet}>{sheet}</option>
                            {/each}
                        </select>
                    </div>
                {/if}

                <!-- Preview Table -->
                {#if previewHeaders.length > 0}
                    <div>
                        <div class="flex justify-between items-center mb-2">
                             <h4 class="text-sm font-bold text-gray-700">Data Preview</h4>
                             <span class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">Total Rows: {totalPreviewRows} (Showing first 10)</span>
                        </div>
                        <div class="border border-gray-200 rounded-lg overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        {#each previewHeaders as header}
                                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{header}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    {#each previewRows as row}
                                        <tr>
                                            {#each previewHeaders as header}
                                                <td class="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                                                    {Array.isArray(row) ? row[previewHeaders.indexOf(header)] : row[header] || '-'}
                                                </td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
      </div>
      <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-200">
        <button 
            type="button" 
            onclick={uploadCsv}
            disabled={isUploading || !uploadFiles || (data.universities.length > 1 && !selectedUniversityId)}
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Importing...' : `Import ${totalPreviewRows > 0 ? totalPreviewRows + ' Rows' : ''}`}
        </button>
        <button 
            type="button" 
            onclick={() => showUploadModal = false}
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</div>
{/if}

{#if isUploading}
    <!-- Loading Overlay -->
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 z-[60] flex items-center justify-center">
        <div class="bg-white p-6 rounded-lg shadow-xl flex items-center space-x-4">
            <svg class="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-gray-700 font-medium">Importing students... please wait.</span>
        </div>
    </div>
{/if}
