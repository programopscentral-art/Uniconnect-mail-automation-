<script lang="ts">
  import { invalidateAll, goto } from '$app/navigation';
  import type { PageData } from './$types';
  
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state(data.selectedUniversityId || '');
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
        if (!selectedUniversityId && data.userRole === 'ADMIN') {
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
        if (!selectedUniversityId && data.userRole === 'ADMIN') {
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

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Contact List</h1>
      <p class="mt-1 text-sm text-gray-500">Manage your student recipients and data imports.</p>
    </div>
    <div class="flex space-x-3">
        {#if data.students.length > 0}
            <button 
                onclick={deleteAllStudents}
                class="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none"
            >
                Delete All
            </button>
        {/if}
        <button 
            onclick={() => showUploadModal = true}
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none relative"
        >
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            Import CSV/Excel
            <span class="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">NEW</span>
        </button>
    </div>
  </div>

  {#if data.userRole === 'ADMIN'}
    <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating flex items-center gap-6">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Filter by University:</label>
            <select 
                id="univ-select" 
                bind:value={selectedUniversityId} 
                onchange={onUnivChange}
                class="flex-1 max-w-md bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all focus:bg-white"
            >
                <option value="">All Universities</option>
                {#each data.universities as univ}
                    <option value={univ.id}>{univ.name}</option>
                {/each}
            </select>
    </div>
  {/if}

  <div class="bg-white shadow-floating overflow-auto rounded-[32px] border border-gray-100 relative">
    <table class="min-w-full divide-y divide-gray-100">
      <thead class="bg-gray-50">
        <tr>
          {#each dynamicHeaders as header}
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{formatHeader(header)}</th>
          {/each}
          <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {#each data.students as student}
          <tr>
            {#each dynamicHeaders as header}
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.metadata?.[header] || '-'}
                </td>
            {/each}
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
              <a 
                href="/plagiarism"
                class="text-indigo-600 hover:text-indigo-900 font-bold"
              >
                Scan
              </a>
              <button 
                onclick={() => deleteOneStudent(student.id)}
                class="text-red-600 hover:text-red-900"
              >
                Delete
              </button>
            </td>
          </tr>
        {/each}
        {#if data.students.length === 0}
            <tr>
                <td colspan={1 + dynamicHeaders.length} class="px-6 py-4 text-center text-sm text-gray-500">
                    {selectedUniversityId ? 'No students found.' : 'Select a university to view students.'}
                </td>
            </tr>
        {/if}
      </tbody>
    </table>

    <!-- Pagination Controls -->
    {#if data.totalCount > 0}
      <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
        <div class="flex-1 flex justify-between sm:hidden">
            <button onclick={() => changePage(data.currentPage - 1)} disabled={data.currentPage === 1} class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Previous</button>
            <button onclick={() => changePage(data.currentPage + 1)} disabled={data.currentPage === totalPages} class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Next</button>
        </div>
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
                <p class="text-sm text-gray-700">
                    Showing <span class="font-medium">{(data.currentPage - 1) * data.limit + 1}</span> to <span class="font-medium">{Math.min(data.currentPage * data.limit, data.totalCount)}</span> of <span class="font-medium">{data.totalCount}</span> results
                </p>
            </div>
            <div class="flex items-center space-x-4">
                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    {#each Array(totalPages) as _, i}
                        {#if totalPages <= 7 || (i + 1 >= data.currentPage - 2 && i + 1 <= data.currentPage + 2) || i === 0 || i === totalPages - 1}
                            <button onclick={() => changePage(i + 1)} class="relative inline-flex items-center px-4 py-2 border text-sm font-medium {data.currentPage === i + 1 ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}">{i + 1}</button>
                        {:else if (i + 1 === data.currentPage - 3) || (i + 1 === data.currentPage + 3)}
                            <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">...</span>
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
<div class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick={() => showUploadModal = false}></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg leading-6 font-bold text-gray-900 mb-4" id="modal-title">Import Students</h3>
        
        {#if data.userRole === 'ADMIN' && !selectedUniversityId}
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
            disabled={isUploading || !uploadFiles || (data.userRole === 'ADMIN' && !selectedUniversityId)}
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
