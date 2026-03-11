<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import { onMount, getContext } from "svelte";

  let { data } = $props();
  const { universities } = data;

  // Sync with parent ops university selector
  const parentUniCtx = getContext<{ get: () => string }>('opsUniversityId');

  let selectedUniversityId = $state(universities[0]?.id || "");

  // When parent university selector changes, sync this page's selector
  $effect(() => {
    const parentId = parentUniCtx?.get();
    if (parentId && parentId !== selectedUniversityId) {
      selectedUniversityId = parentId;
    }
  });
  let activeTab = $state("structure"); // structure, terms, batches

  let campuses = $state<any[]>([]);
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let sections = $state<any[]>([]);
  let subjects = $state<any[]>([]);
  let faculty = $state<any[]>([]);
  let loading = $state(false);

  let sectionTargetTermId = $state("");
  let newSection = $state({ name: "", batch_code: "", strength: 60 });
  let newSubject = $state({ name: "", code: "", credit_value: 4, total_sessions: 30 });

  // Form states
  let newCampus = $state({ name: "", code: "", address: "" });
  let newProgram = $state({ name: "", code: "", degree_type: "B.Tech", semester_count: 8 });
  let newTerm = $state({ name: "", program_id: "", start_date: "", end_date: "" });
  
  let processing = $state(false);
  let showForm = $state<string | null>(null);
  let editingItem = $state<any>(null);

  // --- Bulk Import State ---
  let showImportPanel = $state(false);
  let importTab = $state<'upload' | 'guidelines'>('upload');
  let importProcessing = $state(false);
  let importResult = $state<any>(null);
  let importError = $state('');

  async function downloadExcelTemplate() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    function ws(data: any[][], widths: number[]) {
      const sheet = XLSX.utils.aoa_to_sheet(data);
      sheet['!cols'] = widths.map(w => ({ wch: w }));
      return sheet;
    }

    XLSX.utils.book_append_sheet(wb, ws([
      ['Name', 'Code', 'Address (optional)'],
      ['Main Campus', 'MC', 'Hyderabad, Telangana'],
      ['North Campus', 'NC', 'Secundarabad, Telangana']
    ], [32, 12, 36]), 'Campuses');

    XLSX.utils.book_append_sheet(wb, ws([
      ['Name', 'Code', 'Degree Type', 'Semester Count', 'Campus Code (optional)'],
      ['B.Tech Computer Science & Engineering', 'BTCS', 'B.Tech', 8, 'MC'],
      ['B.Tech Electronics & Communication', 'BTEC', 'B.Tech', 8, 'MC']
    ], [42, 12, 14, 15, 22]), 'Programs');

    XLSX.utils.book_append_sheet(wb, ws([
      ['Program Code', 'Term Name', 'Start Date (YYYY-MM-DD)', 'End Date (YYYY-MM-DD)'],
      ['BTCS', 'Semester 1 - 2025-26', '2025-08-01', '2026-01-31'],
      ['BTCS', 'Semester 2 - 2025-26', '2026-02-01', '2026-06-30'],
      ['BTEC', 'Semester 1 - 2025-26', '2025-08-01', '2026-01-31']
    ], [14, 28, 22, 22]), 'Terms');

    XLSX.utils.book_append_sheet(wb, ws([
      ['Program Code', 'Term Name', 'Section Name', 'Batch Code', 'Strength (optional)'],
      ['BTCS', 'Semester 1 - 2025-26', 'Section A', 'BTCS-2025-A', 60],
      ['BTCS', 'Semester 1 - 2025-26', 'Section B', 'BTCS-2025-B', 60],
      ['BTCS', 'Semester 2 - 2025-26', 'Section A', 'BTCS-2025B-A', 60]
    ], [14, 28, 14, 18, 18]), 'Sections');

    XLSX.utils.book_append_sheet(wb, ws([
      ['Program Code', 'Term Name', 'Subject Name', 'Code', 'Credit Value (optional)', 'Total Sessions (optional)'],
      ['BTCS', 'Semester 1 - 2025-26', 'Data Structures & Algorithms', 'CS201', 4, 45],
      ['BTCS', 'Semester 1 - 2025-26', 'Engineering Mathematics I', 'MA101', 4, 45],
      ['BTCS', 'Semester 1 - 2025-26', 'Physics for Engineers', 'PH101', 3, 30]
    ], [14, 28, 36, 10, 22, 24]), 'Subjects');

    XLSX.writeFile(wb, 'uniconnect-academic-setup.xlsx');
  }

  async function runExcelImport(file: File) {
    importError = '';
    importResult = null;
    importProcessing = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('university_id', selectedUniversityId);
      const res = await fetch('/api/academic/setup/import-excel', {
        method: 'POST',
        body: formData
      });
      importResult = await res.json();
      if (res.ok) {
        await refreshData();
        await fetchFaculty();
      } else {
        importError = importResult?.message || 'Import failed.';
        importResult = null;
      }
    } catch {
      importError = 'Network error. Please try again.';
    } finally {
      importProcessing = false;
    }
  }

  function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    runExcelImport(file);
    input.value = '';
  }

  // Selection state for terms tab
  let termTargetProgramId = $state("");

  async function refreshData() {
    if (!selectedUniversityId) return;
    sectionTargetTermId = "";
    loading = true;
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/academic/campuses?universityId=${selectedUniversityId}`),
        fetch(`/api/academic/programs?universityId=${selectedUniversityId}`)
      ]);
      campuses = await cRes.json();
      programs = await pRes.json();
      
      // Reset term selection when university changes
      if (programs.length > 0) {
        termTargetProgramId = programs[0].id;
        await fetchTerms();
      } else {
        termTargetProgramId = "";
        terms = [];
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchTerms() {
    if (!termTargetProgramId) return;
    loading = true;
    try {
      const res = await fetch(`/api/academic/terms?programId=${termTargetProgramId}`);
      terms = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }
  async function fetchSections() {
    if (!sectionTargetTermId) return;
    loading = true;
    try {
      const res = await fetch(`/api/academic/sections?termId=${sectionTargetTermId}`);
      sections = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchSubjects() {
    if (!sectionTargetTermId) return;
    loading = true;
    try {
      const res = await fetch(`/api/academic/subjects?termId=${sectionTargetTermId}`);
      subjects = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchFaculty() {
    if (!selectedUniversityId) return;
    loading = true;
    try {
      const res = await fetch(`/api/academic/faculty?universityId=${selectedUniversityId}`);
      faculty = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(refreshData);
  $effect(() => { if (selectedUniversityId) { refreshData(); fetchFaculty(); } });
  $effect(() => { if (termTargetProgramId) fetchTerms(); });
  $effect(() => { 
    if (sectionTargetTermId) {
      fetchSections(); 
      fetchSubjects();
    } else {
      sections = [];
      subjects = [];
    }
  });

  async function handleAction(endpoint: string, method: string, body: any) {
    processing = true;
    try {
      const res = await fetch(endpoint, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
      const resData = await res.json();
      if (!res.ok) {
        alert(`Error: ${resData.message || 'Operation failed'}`);
        return;
      }
      if (activeTab === 'terms') {
        await fetchTerms();
      } else if (activeTab === 'batches') {
        await Promise.all([fetchSections(), fetchSubjects()]);
      } else if (activeTab === 'faculty') {
        await fetchFaculty();
      } else {
        await refreshData();
      }
      showForm = null;
    } catch (e) {
      alert("Network error occurred.");
    } finally {
      processing = false;
    }
  }

  function createCampus() {
    handleAction("/api/academic/campuses", "POST", { ...newCampus, university_id: selectedUniversityId });
    newCampus = { name: "", code: "", address: "" };
  }

  function createProgram() {
    handleAction("/api/academic/programs", "POST", { ...newProgram, university_id: selectedUniversityId });
    newProgram = { name: "", code: "", degree_type: "B.Tech", semester_count: 8 };
  }

  function startEditTerm(term: any) {
    editingItem = term;
    newTerm = { name: term.name, program_id: term.program_id, start_date: term.start_date?.split('T')[0] || '', end_date: term.end_date?.split('T')[0] || '' };
    showForm = 'term';
  }

  function createTerm() {
    if (editingItem) {
      handleAction("/api/academic/terms", "PATCH", { 
        id: editingItem.id,
        ...newTerm
      });
    } else {
      handleAction("/api/academic/terms", "POST", { 
        ...newTerm, 
        university_id: selectedUniversityId, 
        program_id: termTargetProgramId 
      });
    }
    newTerm = { name: "", program_id: "", start_date: "", end_date: "" };
    editingItem = null;
  }
  function createSection() {
    handleAction("/api/academic/sections", "POST", { 
      ...newSection, 
      university_id: selectedUniversityId, 
      program_id: termTargetProgramId,
      term_id: sectionTargetTermId
    });
    newSection = { name: "", batch_code: "", strength: 60 };
  }

  function createSubject() {
    handleAction("/api/academic/subjects", "POST", { 
      ...newSubject, 
      university_id: selectedUniversityId, 
      program_id: termTargetProgramId,
      term_id: sectionTargetTermId
    });
    newSubject = { name: "", code: "", credit_value: 4, total_sessions: 30 };
  }

  async function importStudents(sectionId: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event: any) => {
            try {
                let students = [];
                if (file.name.endsWith('.json')) {
                    students = JSON.parse(event.target.result);
                } else {
                    // Simple CSV Parse (Email, Name, Enrollment)
                    const lines = event.target.result.split('\n');
                    students = lines.slice(1).map((line: string) => {
                        const [email, name, enrollment_number] = line.split(',');
                        return { email: email.trim(), name: name.trim(), enrollment_number: enrollment_number.trim() };
                    }).filter((s: any) => s.email && s.enrollment_number);
                }
                
                if (students.length === 0) {
                    alert("No valid students found in file.");
                    return;
                }

                processing = true;
                const res = await fetch('/api/academic/students/import', {
                    method: 'POST',
                    body: JSON.stringify({
                        university_id: selectedUniversityId,
                        program_id: termTargetProgramId,
                        term_id: sectionTargetTermId,
                        section_id: sectionId,
                        students
                    })
                });
                const result = await res.json();
                alert(`Import complete! Success: ${result.success}, Failed: ${result.failed}`);
                await fetchSections();
                if (result.errors.length > 0) console.log(result.errors);
            } catch (err) {
                alert("Failed to parse file.");
            } finally {
                processing = false;
            }
        };
        reader.readAsText(file);
    };
    input.click();
  }

  // --- Students Excel Import ---
  let showStudentsImportPanel = $state(false);
  let studentsImportTermName = $state('');
  let studentsImportTermNames = $state<string[]>([]);
  let studentsImportProcessing = $state(false);
  let studentsImportResult = $state<any>(null);
  let studentsImportError = $state('');

  async function openStudentsImportPanel() {
    showStudentsImportPanel = true;
    studentsImportResult = null;
    studentsImportError = '';
    studentsImportTermName = '';
    if (selectedUniversityId) {
      const res = await fetch(`/api/academic/terms?universityId=${selectedUniversityId}`);
      if (res.ok) studentsImportTermNames = await res.json();
    }
  }

  async function downloadStudentsTemplate() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    // One sheet per program (use loaded programs, or a sample if none loaded)
    const progs = programs.length > 0 ? programs : [{ code: 'BTCS', name: 'B.Tech CSE' }, { code: 'BTAI', name: 'B.Tech AI' }];
    for (const p of progs) {
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Student Name', 'NIAT ID', 'Student Personal Mail ID'],
        ['John Doe', `${p.code}2025001`, 'john.doe@gmail.com'],
        ['Jane Smith', `${p.code}2025002`, 'jane.smith@gmail.com'],
      ]);
      sheet['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, sheet, p.code);
    }
    XLSX.writeFile(wb, 'uniconnect-students-import.xlsx');
  }

  async function runStudentsExcelImport(file: File) {
    studentsImportError = '';
    studentsImportResult = null;
    if (!studentsImportTermName) {
      studentsImportError = 'Please select a Term before uploading.';
      return;
    }
    studentsImportProcessing = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('university_id', selectedUniversityId);
      fd.append('term_name', studentsImportTermName.trim());
      const res = await fetch('/api/academic/setup/import-students-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        studentsImportResult = data;
      } else {
        studentsImportError = data?.message || 'Import failed.';
      }
    } catch {
      studentsImportError = 'Network error. Please try again.';
    } finally {
      studentsImportProcessing = false;
    }
  }

  // --- Faculty Excel Import ---
  let showFacultyImportPanel = $state(false);
  let facultyImportProcessing = $state(false);
  let facultyImportResult = $state<any>(null);
  let facultyImportError = $state('');

  async function downloadFacultyTemplate() {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Faculty List', 'ID', 'faculty Mail id', 'faculty number', 'Subject List'],
      ['Dr. Ramesh Kumar', 'FAC001', 'ramesh.kumar@college.edu', '9876543210', 'DS, DBMS, WAD'],
      ['Prof. Anita Sharma', 'FAC002', 'anita.sharma@college.edu', '9123456780', 'MA101, PH101'],
    ]);
    sheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, sheet, 'Faculty');
    XLSX.writeFile(wb, 'uniconnect-faculty-import.xlsx');
  }

  async function runFacultyExcelImport(file: File) {
    facultyImportError = '';
    facultyImportResult = null;
    facultyImportProcessing = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('university_id', selectedUniversityId);
      const res = await fetch('/api/academic/setup/import-faculty-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        facultyImportResult = data;
        await fetchFaculty();
      } else {
        facultyImportError = data?.message || 'Import failed.';
      }
    } catch {
      facultyImportError = 'Network error. Please try again.';
    } finally {
      facultyImportProcessing = false;
    }
  }

  async function importFaculty() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event: any) => {
            try {
                let faculty_list = [];
                if (file.name.endsWith('.json')) {
                    faculty_list = JSON.parse(event.target.result);
                } else {
                    const lines = event.target.result.split('\n');
                    faculty_list = lines.slice(1).map((line: string) => {
                        const [email, name, employee_code, department] = line.split(',');
                        return { email: email.trim(), name: name.trim(), employee_code: employee_code.trim(), department: department?.trim() };
                    }).filter((f: any) => f.employee_code && f.name);
                }
                
                if (faculty_list.length === 0) {
                    alert("No valid faculty found in file.");
                    return;
                }

                processing = true;
                const res = await fetch('/api/academic/faculty/import', {
                    method: 'POST',
                    body: JSON.stringify({
                        university_id: selectedUniversityId,
                        faculty_list
                    })
                });
                const result = await res.json();
                alert(`Import complete! Success: ${result.success}, Failed: ${result.failed}`);
                await fetchFaculty();
            } catch (err) {
                alert("Failed to parse file.");
            } finally {
                processing = false;
            }
        };
        reader.readAsText(file);
    };
    input.click();
  }
</script>

<div class="space-y-8 pb-20" in:fade>
  <!-- University Selector -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div class="flex-1">
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Academic <span class="text-indigo-600">Setup</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Configure the core organizational structure for your institution.</p>
    </div>
    <div class="flex items-center gap-3">
      <div class="w-full md:w-64 relative">
        <select
          bind:value={selectedUniversityId}
          class="w-full pl-6 pr-12 py-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none transition-all cursor-pointer shadow-inner"
        >
          {#each universities as univ}
            <option value={univ.id}>{univ.name}</option>
          {/each}
        </select>
        <div class="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </div>
      <button
        onclick={openStudentsImportPanel}
        class="flex items-center gap-2 px-5 py-4 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-600/20 shrink-0"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
        Import Students
      </button>
      <button
        onclick={() => { showFacultyImportPanel = true; facultyImportResult = null; facultyImportError = ''; }}
        class="flex items-center gap-2 px-5 py-4 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-violet-700 transition-all active:scale-95 shadow-lg shadow-violet-600/20 shrink-0"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
        Import Faculty
      </button>
      <button
        onclick={() => { showImportPanel = true; importResult = null; importError = ''; }}
        class="flex items-center gap-2.5 px-6 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-600/20 shrink-0"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
        </svg>
        Academic Setup
      </button>
    </div>
  </div>

  <!-- Bulk Import Panel Overlay -->
  {#if showImportPanel}
    <div class="fixed inset-0 z-50 flex" transition:fade>
      <!-- Backdrop -->
      <button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => showImportPanel = false} aria-label="Close"></button>

      <!-- Panel -->
      <div class="relative ml-auto w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden" transition:fly={{ x: 500, duration: 300 }}>
        <!-- Header -->
        <div class="flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 class="text-xl font-black text-gray-900 dark:text-white">Bulk Academic Setup Import</h2>
            <p class="text-xs text-gray-400 font-medium mt-0.5">Upload an Excel spreadsheet to set up your entire academic structure at once</p>
          </div>
          <button onclick={() => showImportPanel = false} class="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mx-8 mt-6 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-fit shrink-0">
          <button onclick={() => importTab = 'upload'} class="px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {importTab === 'upload' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500'}">Upload File</button>
          <button onclick={() => importTab = 'guidelines'} class="px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {importTab === 'guidelines' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500'}">Format Guide</button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-8 py-6">
          {#if importTab === 'upload'}
            <div class="space-y-6">
              <!-- Download Template -->
              <div class="p-5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-between">
                <div>
                  <p class="text-sm font-black text-indigo-900 dark:text-indigo-100">Download the Excel template</p>
                  <p class="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">5 pre-filled tabs — fill in your data, then upload</p>
                </div>
                <button onclick={downloadExcelTemplate} class="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shrink-0">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Download Template
                </button>
              </div>

              <!-- File Upload Drop Zone -->
              <label class="block cursor-pointer group">
                <div class="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl p-12 text-center group-hover:border-indigo-400 group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-500/5 transition-all">
                  <div class="w-14 h-14 mx-auto mb-4 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-all">
                    <svg class="w-7 h-7 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <p class="text-sm font-black text-gray-700 dark:text-gray-300">Drop your Excel file here</p>
                  <p class="text-xs text-gray-400 font-medium mt-1">or click to browse — .xlsx / .xls files</p>
                  {#if importProcessing}
                    <div class="mt-4 flex items-center justify-center gap-2 text-indigo-600">
                      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      <span class="text-xs font-black uppercase tracking-widest">Importing...</span>
                    </div>
                  {/if}
                </div>
                <input type="file" accept=".xlsx,.xls" class="sr-only" onchange={handleImportFile} disabled={importProcessing} />
              </label>

              <!-- Error -->
              {#if importError}
                <div class="p-5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
                  <p class="text-sm font-black text-rose-700 dark:text-rose-400">Import Failed</p>
                  <p class="text-xs text-rose-600 dark:text-rose-300 font-medium mt-1">{importError}</p>
                </div>
              {/if}

              <!-- Results -->
              {#if importResult}
                <div class="p-6 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl space-y-4">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center">
                      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <p class="font-black text-emerald-800 dark:text-emerald-300">{importResult.summary}</p>
                  </div>

                  <div class="grid grid-cols-3 gap-3">
                    {#each Object.entries(importResult.created) as [entity, count]}
                      <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-center">
                        <p class="text-lg font-black text-emerald-600">{count}</p>
                        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{entity}</p>
                      </div>
                    {/each}
                  </div>

                  {#if importResult.errors?.length > 0}
                    <div class="mt-4 space-y-2">
                      <p class="text-[10px] font-black text-rose-600 uppercase tracking-widest">{importResult.errors.length} Error{importResult.errors.length !== 1 ? 's' : ''}</p>
                      {#each importResult.errors as err}
                        <div class="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl">
                          <p class="text-xs font-bold text-rose-700 dark:text-rose-400"><span class="uppercase">{err.entity}</span> · {err.item}</p>
                          <p class="text-[10px] text-rose-500 mt-0.5">{err.reason}</p>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

          {:else}
            <!-- Format Guidelines Tab -->
            <div class="space-y-5 text-sm">
              <div class="p-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl">
                <p class="font-black text-amber-800 dark:text-amber-300 text-xs uppercase tracking-widest mb-2">How it works</p>
                <p class="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">The Excel file has <strong>5 tabs</strong> — one for each entity type. Fill each tab row by row, then upload. Items are created in order: <strong>Campuses → Programs → Terms → Sections → Subjects</strong>. Already-existing items are automatically skipped — safe to re-run.</p>
              </div>

              {#each [
                {
                  tab: 'Campuses', cols: [
                    { name: 'Name', req: true, eg: 'Main Campus', desc: 'Full campus name' },
                    { name: 'Code', req: true, eg: 'MC', desc: 'Short unique code — used to link programs' },
                    { name: 'Address', req: false, eg: 'Hyderabad, TS', desc: 'Physical address' }
                  ]
                },
                {
                  tab: 'Programs', cols: [
                    { name: 'Name', req: true, eg: 'B.Tech CSE', desc: 'Full program name' },
                    { name: 'Code', req: true, eg: 'BTCS', desc: 'Unique code — referenced by all other sheets' },
                    { name: 'Degree Type', req: false, eg: 'B.Tech', desc: 'B.Tech / M.Tech / MBA / B.Sc / PhD' },
                    { name: 'Semester Count', req: false, eg: '8', desc: 'Defaults to 8' },
                    { name: 'Campus Code', req: false, eg: 'MC', desc: 'Links to a campus by its Code column' }
                  ]
                },
                {
                  tab: 'Terms', cols: [
                    { name: 'Program Code', req: true, eg: 'BTCS', desc: 'Must match a Code in the Programs tab' },
                    { name: 'Term Name', req: true, eg: 'Semester 1 - 2025-26', desc: 'Unique within the program — referenced by Sections & Subjects' },
                    { name: 'Start Date', req: true, eg: '2025-08-01', desc: 'Format: YYYY-MM-DD' },
                    { name: 'End Date', req: true, eg: '2026-01-31', desc: 'Format: YYYY-MM-DD' }
                  ]
                },
                {
                  tab: 'Sections', cols: [
                    { name: 'Program Code', req: true, eg: 'BTCS', desc: 'Must match Programs tab' },
                    { name: 'Term Name', req: true, eg: 'Semester 1 - 2025-26', desc: 'Must exactly match Terms tab' },
                    { name: 'Section Name', req: true, eg: 'Section A', desc: 'Display name' },
                    { name: 'Batch Code', req: true, eg: 'BTCS-2025-A', desc: 'Unique batch identifier' },
                    { name: 'Strength', req: false, eg: '60', desc: 'Student capacity (default: 60)' }
                  ]
                },
                {
                  tab: 'Subjects', cols: [
                    { name: 'Program Code', req: true, eg: 'BTCS', desc: 'Must match Programs tab' },
                    { name: 'Term Name', req: true, eg: 'Semester 1 - 2025-26', desc: 'Must exactly match Terms tab' },
                    { name: 'Subject Name', req: true, eg: 'Data Structures', desc: 'Full subject name' },
                    { name: 'Code', req: true, eg: 'CS201', desc: 'Unique subject code within the term' },
                    { name: 'Credit Value', req: false, eg: '4', desc: 'Number of credits (default: 4)' },
                    { name: 'Total Sessions', req: false, eg: '45', desc: 'Sessions planned (default: 30)' }
                  ]
                }
              ] as sheet}
                <div class="rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
                  <div class="px-5 py-3 bg-gray-50 dark:bg-slate-800">
                    <p class="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">Tab: {sheet.tab}</p>
                  </div>
                  <div class="divide-y divide-gray-50 dark:divide-slate-800/60">
                    {#each sheet.cols as col, i}
                      <div class="px-5 py-3 flex items-start gap-4">
                        <div class="w-8 shrink-0 text-[10px] font-black text-gray-300 dark:text-slate-600 pt-0.5">Col {i + 1}</div>
                        <div class="w-36 shrink-0">
                          <span class="text-xs font-black text-gray-800 dark:text-gray-200">{col.name}</span>
                          {#if col.req}
                            <span class="ml-1.5 text-[8px] font-black text-rose-500 uppercase">required</span>
                          {:else}
                            <span class="ml-1.5 text-[8px] font-bold text-gray-400 uppercase">optional</span>
                          {/if}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-xs text-gray-500 font-medium">{col.desc}</p>
                          <code class="text-[10px] text-indigo-400 font-bold mt-0.5 block">e.g. {col.eg}</code>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}

              <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl space-y-2">
                <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">Tips</p>
                <ul class="text-xs text-gray-500 font-medium space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>Row 1 is the header — don't delete it. Your data starts from Row 2.</li>
                  <li>Campuses and programs matched by <strong>Code</strong> — existing ones are skipped.</li>
                  <li>Terms matched by <strong>Term Name</strong> within a program.</li>
                  <li>Sections matched by <strong>Batch Code</strong>, subjects by <strong>Code</strong>.</li>
                  <li>You can safely upload the same file again — duplicates are skipped.</li>
                  <li>Dates must be in <strong>YYYY-MM-DD</strong> format (e.g. 2025-08-01).</li>
                </ul>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Students Excel Import Panel -->
  {#if showStudentsImportPanel}
    <div class="fixed inset-0 z-50 flex" transition:fade>
      <button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => showStudentsImportPanel = false} aria-label="Close"></button>
      <div class="relative ml-auto w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden" transition:fly={{ x: 500, duration: 300 }}>
        <div class="flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 class="text-xl font-black text-gray-900 dark:text-white">Import Students</h2>
            <p class="text-xs text-gray-400 font-medium mt-0.5">Upload an Excel file — one sheet per branch (sheet name = program code)</p>
          </div>
          <button onclick={() => showStudentsImportPanel = false} class="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <!-- Template Download -->
          <div class="p-5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-between">
            <div>
              <p class="text-sm font-black text-emerald-900 dark:text-emerald-100">Download Student Template</p>
              <p class="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">One sheet per program (named by program code)</p>
            </div>
            <button onclick={downloadStudentsTemplate} class="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-all shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download Template
            </button>
          </div>

          <!-- Format info -->
          <div class="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl space-y-2">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">Excel Format</p>
            <ul class="text-xs text-gray-500 font-medium space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Each sheet = one branch. <strong>Sheet name must be the Program Code</strong> (e.g. BTAI, BTCS)</li>
              <li>Column A: <strong>Student Name</strong> | Column B: <strong>NIAT ID</strong> | Column C: <strong>Student Personal Mail ID</strong></li>
              <li>Students are assigned to the <strong>first available section</strong> of the selected term</li>
            </ul>
          </div>

          <!-- Term Name dropdown -->
          <div>
            <label class="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Select Term <span class="text-rose-500">*</span></label>
            {#if studentsImportTermNames.length > 0}
              <div class="relative">
                <select
                  bind:value={studentsImportTermName}
                  class="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">— Choose a term —</option>
                  {#each studentsImportTermNames as tname}
                    <option value={tname}>{tname}</option>
                  {/each}
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
                </div>
              </div>
            {:else}
              <p class="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3">No terms found. Please create Academic Terms first in the structure setup.</p>
            {/if}
          </div>

          <!-- File Upload -->
          <label class="block cursor-pointer group">
            <div class="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl p-10 text-center group-hover:border-emerald-400 group-hover:bg-emerald-50/30 dark:group-hover:bg-emerald-500/5 transition-all">
              <div class="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 transition-all">
                <svg class="w-6 h-6 text-gray-400 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
              </div>
              <p class="text-sm font-black text-gray-700 dark:text-gray-300">Drop your Students Excel file here</p>
              <p class="text-xs text-gray-400 font-medium mt-1">or click to browse — .xlsx / .xls files</p>
              {#if studentsImportProcessing}
                <div class="mt-3 flex items-center justify-center gap-2 text-emerald-600">
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  <span class="text-xs font-black uppercase tracking-widest">Importing...</span>
                </div>
              {/if}
            </div>
            <input type="file" accept=".xlsx,.xls" class="sr-only" disabled={studentsImportProcessing} onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { runStudentsExcelImport(f); (e.target as HTMLInputElement).value = ''; } }} />
          </label>

          {#if studentsImportError}
            <div class="p-5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
              <p class="text-sm font-black text-rose-700 dark:text-rose-400">Import Failed</p>
              <p class="text-xs text-rose-600 dark:text-rose-300 font-medium mt-1">{studentsImportError}</p>
            </div>
          {/if}

          {#if studentsImportResult}
            <div class="p-6 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                </div>
                <p class="font-black text-emerald-800 dark:text-emerald-300">{studentsImportResult.summary}</p>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-center">
                  <p class="text-lg font-black text-emerald-600">{studentsImportResult.created}</p>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Imported</p>
                </div>
                <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-center">
                  <p class="text-lg font-black text-gray-500">{studentsImportResult.sheets_processed}</p>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Programs</p>
                </div>
                <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-center">
                  <p class="text-lg font-black text-rose-500">{studentsImportResult.failed}</p>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Failed</p>
                </div>
              </div>
              {#if studentsImportResult.errors?.length > 0}
                <div class="space-y-2">
                  <p class="text-[10px] font-black text-rose-600 uppercase tracking-widest">{studentsImportResult.errors.length} Issue{studentsImportResult.errors.length !== 1 ? 's' : ''}</p>
                  {#each studentsImportResult.errors as err}
                    <div class="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl">
                      <p class="text-xs font-bold text-rose-700 dark:text-rose-400">{err.sheet}</p>
                      <p class="text-[10px] text-rose-500 mt-0.5">{err.reason}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Faculty Excel Import Panel -->
  {#if showFacultyImportPanel}
    <div class="fixed inset-0 z-50 flex" transition:fade>
      <button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => showFacultyImportPanel = false} aria-label="Close"></button>
      <div class="relative ml-auto w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden" transition:fly={{ x: 500, duration: 300 }}>
        <div class="flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 class="text-xl font-black text-gray-900 dark:text-white">Import Faculty</h2>
            <p class="text-xs text-gray-400 font-medium mt-0.5">Upload an Excel file with faculty details and subject assignments</p>
          </div>
          <button onclick={() => showFacultyImportPanel = false} class="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <!-- Template Download -->
          <div class="p-5 bg-violet-50 dark:bg-violet-500/10 rounded-2xl border border-violet-100 dark:border-violet-500/20 flex items-center justify-between">
            <div>
              <p class="text-sm font-black text-violet-900 dark:text-violet-100">Download Faculty Template</p>
              <p class="text-xs text-violet-600 dark:text-violet-400 font-medium mt-0.5">Single sheet with all required columns</p>
            </div>
            <button onclick={downloadFacultyTemplate} class="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-700 transition-all shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download Template
            </button>
          </div>

          <!-- Format info -->
          <div class="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl space-y-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">Required Columns (Row 1 = Headers)</p>
            {#each [
              { col: 'Faculty List', note: 'Full name of the faculty member', req: true },
              { col: 'ID', note: 'Employee ID / Faculty code (e.g. FAC001)', req: true },
              { col: 'faculty Mail id', note: 'Official email address', req: true },
              { col: 'faculty number', note: 'Mobile / phone number', req: false },
              { col: 'Subject List', note: 'Comma-separated subject codes they teach (e.g. DS, DBMS, WAD)', req: false },
            ] as row}
              <div class="flex items-start gap-3">
                <code class="text-[10px] font-black text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-lg shrink-0">{row.col}</code>
                <div class="flex-1">
                  <p class="text-xs text-gray-500 font-medium">{row.note}</p>
                </div>
                {#if !row.req}<span class="text-[8px] font-black text-gray-300 uppercase shrink-0">optional</span>{/if}
              </div>
            {/each}
            <p class="text-[10px] text-amber-600 dark:text-amber-400 font-bold pt-1">Subject codes must match the codes in your Subjects list. Unrecognized codes are silently skipped.</p>
          </div>

          <!-- File Upload -->
          <label class="block cursor-pointer group">
            <div class="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl p-10 text-center group-hover:border-violet-400 group-hover:bg-violet-50/30 dark:group-hover:bg-violet-500/5 transition-all">
              <div class="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 transition-all">
                <svg class="w-6 h-6 text-gray-400 group-hover:text-violet-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              </div>
              <p class="text-sm font-black text-gray-700 dark:text-gray-300">Drop your Faculty Excel file here</p>
              <p class="text-xs text-gray-400 font-medium mt-1">or click to browse — .xlsx / .xls files</p>
              {#if facultyImportProcessing}
                <div class="mt-3 flex items-center justify-center gap-2 text-violet-600">
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  <span class="text-xs font-black uppercase tracking-widest">Importing...</span>
                </div>
              {/if}
            </div>
            <input type="file" accept=".xlsx,.xls" class="sr-only" disabled={facultyImportProcessing} onchange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { runFacultyExcelImport(f); (e.target as HTMLInputElement).value = ''; } }} />
          </label>

          {#if facultyImportError}
            <div class="p-5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
              <p class="text-sm font-black text-rose-700 dark:text-rose-400">Import Failed</p>
              <p class="text-xs text-rose-600 dark:text-rose-300 font-medium mt-1">{facultyImportError}</p>
            </div>
          {/if}

          {#if facultyImportResult}
            <div class="p-6 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-2xl space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-violet-500 rounded-xl flex items-center justify-center">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                </div>
                <p class="font-black text-violet-800 dark:text-violet-300">{facultyImportResult.summary}</p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-center">
                  <p class="text-lg font-black text-violet-600">{facultyImportResult.created}</p>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Imported</p>
                </div>
                <div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-center">
                  <p class="text-lg font-black text-rose-500">{facultyImportResult.failed}</p>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Failed</p>
                </div>
              </div>
              {#if facultyImportResult.errors?.length > 0}
                <div class="space-y-2">
                  <p class="text-[10px] font-black text-rose-600 uppercase tracking-widest">{facultyImportResult.errors.length} Error{facultyImportResult.errors.length !== 1 ? 's' : ''}</p>
                  {#each facultyImportResult.errors as err}
                    <div class="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl">
                      <p class="text-[10px] text-rose-500">{err}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Internal Tabs -->
  <div class="flex gap-4 p-1.5 bg-gray-100/50 dark:bg-slate-800/50 rounded-2xl w-fit">
    <button onclick={() => activeTab = 'structure'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'structure' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">1. Structure</button>
    <button onclick={() => activeTab = 'terms'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'terms' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">2. Academic Terms</button>
    <button onclick={() => activeTab = 'batches'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'batches' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">3. Batches & Subjects</button>
    <button onclick={() => activeTab = 'faculty'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'faculty' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">4. Faculty Ops</button>
  </div>

  {#if activeTab === 'structure'}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8" in:fly={{ y: 20 }}>
      <!-- Campuses -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-black text-gray-900 dark:text-white">Campus Directory</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Geographic locations</p>
          </div>
          <button onclick={() => showForm = showForm === 'campus' ? null : 'campus'} class="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>

        {#if showForm === 'campus'}
          <div class="mb-8 p-6 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-3xl border border-indigo-100 dark:border-indigo-500/10" transition:slide>
            <div class="grid grid-cols-2 gap-4">
               <input bind:value={newCampus.name} placeholder="Name (e.g. South Campus)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <input bind:value={newCampus.code} placeholder="Code (e.g. SC)" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <button onclick={createCampus} disabled={processing} class="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 transition-all">
                 {processing ? 'Processing...' : 'Add Campus'}
               </button>
            </div>
          </div>
        {/if}

        <div class="space-y-3 flex-1">
          {#each campuses as campus}
            <div class="flex items-center justify-between p-5 bg-gray-50/50 dark:bg-slate-800/30 rounded-2xl border border-transparent hover:border-indigo-500/20 group transition-all">
               <div>
                 <h4 class="font-black text-gray-900 dark:text-white text-sm tracking-tight">{campus.name}</h4>
                 <code class="text-[10px] text-indigo-500 font-black uppercase tracking-tighter">{campus.code}</code>
               </div>
               <button onclick={() => handleAction(`/api/academic/campuses?id=${campus.id}`, 'DELETE', null)} class="p-2 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>
            </div>
          {/each}
        </div>
      </div>

      <!-- Programs -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-black text-gray-900 dark:text-white">Academic Programs</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Degrees & Departments</p>
          </div>
          <button onclick={() => showForm = showForm === 'program' ? null : 'program'} class="p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>

        {#if showForm === 'program'}
          <div class="mb-8 p-6 bg-emerald-50/50 dark:bg-emerald-500/5 rounded-3xl border border-emerald-100 dark:border-emerald-500/10" transition:slide>
            <div class="grid grid-cols-2 gap-4">
               <input bind:value={newProgram.name} placeholder="Program (e.g. B.Tech Computer Science)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <input bind:value={newProgram.code} placeholder="Code (e.g. BTCS)" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <select bind:value={newProgram.degree_type} class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold">
                 <option value="B.Tech">B.Tech</option>
                 <option value="M.Tech">M.Tech</option>
                 <option value="MBA">MBA</option>
                 <option value="B.Sc">B.Sc</option>
                 <option value="PhD">PhD</option>
               </select>
               <button onclick={createProgram} disabled={processing} class="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-all">
                 {processing ? 'Creating...' : 'Confirm & Create'}
               </button>
            </div>
          </div>
        {/if}

        <div class="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-2">
          {#each programs as program}
            <div class="flex items-center justify-between p-5 bg-gray-50/50 dark:bg-slate-800/30 rounded-2xl border border-transparent hover:border-emerald-500/20 group transition-all">
               <div>
                  <div class="flex items-center gap-2">
                    <h4 class="font-black text-gray-900 dark:text-white text-sm tracking-tight">{program.name}</h4>
                    <span class="text-[8px] font-black px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 rounded uppercase">{program.degree_type}</span>
                  </div>
                  <code class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{program.code}</code>
               </div>
               <button aria-label="Delete program" onclick={() => handleAction(`/api/academic/programs?id=${program.id}`, 'DELETE', null)} class="p-2 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if activeTab === 'terms'}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8" in:fly={{ y: 20 }}>
       <!-- Program Selection for Terms -->
       <div class="md:col-span-1 space-y-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Select Program</p>
          <div class="space-y-2 max-h-[600px] overflow-y-auto pr-2">
             {#each programs as p}
               <button 
                onclick={() => termTargetProgramId = p.id}
                class="w-full text-left p-4 rounded-2xl border transition-all {termTargetProgramId === p.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-700 dark:text-white hover:border-indigo-500/50'}"
               >
                 <p class="text-xs font-black uppercase tracking-tight leading-tight">{p.name}</p>
                 <p class="text-[10px] font-bold opacity-60 mt-1">{p.code}</p>
               </button>
             {/each}
          </div>
       </div>

       <!-- Terms List -->
       <div class="md:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col">
          <div class="flex items-center justify-between mb-8">
            <div>
              <h3 class="text-xl font-black text-gray-900 dark:text-white">Academic Terms</h3>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Define Semesters & Trimesters</p>
            </div>
            <button aria-label="Toggle term form" onclick={() => showForm = showForm === 'term' ? null : 'term'} class="p-3 bg-violet-600 text-white rounded-2xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-600/20 active:scale-95">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>

          {#if showForm === 'term'}
            <div class="mb-8 p-6 bg-violet-50/50 dark:bg-violet-500/5 rounded-3xl border border-violet-100 dark:border-violet-500/10" transition:slide>
              <div class="grid grid-cols-2 gap-4">
                 <input bind:value={newTerm.name} placeholder="Term Name (e.g. Semester 1, Fall 2024)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                 <div class="flex flex-col gap-1">
                    <label class="text-[9px] font-black text-violet-600 uppercase ml-2">Start Date</label>
                    <input type="date" bind:value={newTerm.start_date} class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                 </div>
                 <div class="flex flex-col gap-1">
                    <label class="text-[9px] font-black text-violet-600 uppercase ml-2">End Date</label>
                    <input type="date" bind:value={newTerm.end_date} class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                 </div>
                 <button onclick={createTerm} disabled={processing || !termTargetProgramId} class="col-span-2 py-3 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-600/20">
                   {processing ? 'Creating...' : 'Define Term'}
                 </button>
              </div>
            </div>
          {/if}

          <div class="space-y-4 flex-1">
              {#each terms as term}
                <div class="flex items-center justify-between p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[2rem] border border-transparent hover:border-violet-500/20 group transition-all">
                   <div>
                     <h4 class="font-black text-gray-900 dark:text-white text-md tracking-tight">{term.name}</h4>
                     <div class="flex items-center gap-3 mt-1.5 font-bold text-[10px] text-gray-500 uppercase tracking-widest">
                        <span>{new Date(term.start_date).toLocaleDateString()}</span>
                        <span class="text-violet-500">→</span>
                        <span>{new Date(term.end_date).toLocaleDateString()}</span>
                        <span class="ml-2 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/50 text-violet-600 rounded-lg">{term.status}</span>
                     </div>
                   </div>
                  <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onclick={() => startEditTerm(term)} class="p-2 text-gray-400 hover:text-indigo-600 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick={() => handleAction(`/api/academic/terms?id=${term.id}`, 'DELETE', null)} class="p-2 text-gray-400 hover:text-rose-500 transition-colors">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>
             {/each}
             {#if terms.length === 0 && !loading}
                <div class="flex flex-col items-center justify-center py-20 text-center opacity-40 grayscale">
                   <div class="w-16 h-16 bg-gray-100 rounded-full mb-4 flex items-center justify-center">⏳</div>
                   <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">No terms defined for this program</p>
                </div>
             {/if}
          </div>
       </div>
    </div>
  {:else if activeTab === 'batches'}
    <div class="grid grid-cols-1 md:grid-cols-4 gap-8" in:fly={{ y: 20 }}>
       <!-- Program & Term Selection -->
       <div class="md:col-span-1 space-y-6">
          <div class="space-y-4">
            <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">1. Select Program</p>
            <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2">
               {#each programs as p}
                 <button 
                  onclick={() => { termTargetProgramId = p.id; sectionTargetTermId = ""; }}
                  class="w-full text-left p-4 rounded-2xl border transition-all {termTargetProgramId === p.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-700 dark:text-white hover:border-indigo-500/50'}"
                 >
                   <p class="text-[10px] font-black uppercase tracking-tight leading-tight">{p.name}</p>
                 </button>
               {/each}
            </div>
          </div>

          {#if termTargetProgramId}
            <div class="space-y-4" transition:slide>
              <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">2. Select Term</p>
              <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                 {#each terms as t}
                   <button 
                    onclick={() => sectionTargetTermId = t.id}
                    class="w-full text-left p-4 rounded-2xl border transition-all {sectionTargetTermId === t.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-700 dark:text-white hover:border-indigo-500/50'}"
                   >
                     <p class="text-[10px] font-black uppercase tracking-tight leading-tight">{t.name}</p>
                   </button>
                 {/each}
              </div>
            </div>
          {/if}
       </div>

       <!-- Sections Management -->
       <div class="md:col-span-3 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col min-h-[600px]">
          {#if !sectionTargetTermId}
            <div class="flex-1 flex flex-col items-center justify-center text-center opacity-40 grayscale">
               <div class="w-20 h-20 bg-gray-100 rounded-full mb-6 flex items-center justify-center text-3xl">🧩</div>
               <p class="text-xs font-black uppercase tracking-widest text-gray-500">Select a Program & Term to manage sections</p>
            </div>
  {:else}
            <div class="flex items-center justify-between mb-8">
              <div>
                <h3 class="text-xl font-black text-gray-900 dark:text-white">Curriculum & Groups</h3>
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Manage Sections & Subjects</p>
              </div>
              <div class="flex gap-2">
                <button onclick={() => showForm = showForm === 'section' ? null : 'section'} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-all flex items-center gap-2">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                   Add Section
                </button>
                <button onclick={() => showForm = showForm === 'subject' ? null : 'subject'} class="px-4 py-2 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-violet-700 transition-all flex items-center gap-2">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                   Add Subject
                </button>
              </div>
            </div>

            {#if showForm === 'section'}
              <div class="mb-8 p-6 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-3xl border border-indigo-100 dark:border-indigo-500/10" transition:slide>
                <div class="grid grid-cols-2 gap-4">
                   <input bind:value={newSection.name} placeholder="Section Name (e.g. Section A)" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                   <input bind:value={newSection.batch_code} placeholder="Batch Code (e.g. B2024-A)" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                   <input type="number" bind:value={newSection.strength} placeholder="Strength" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                   <button onclick={createSection} disabled={processing} class="py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all">
                     {processing ? 'Creating...' : 'Create Section'}
                   </button>
                </div>
              </div>
            {:else if showForm === 'subject'}
              <div class="mb-8 p-6 bg-violet-50/50 dark:bg-violet-500/5 rounded-3xl border border-violet-100 dark:border-violet-500/10" transition:slide>
                <div class="grid grid-cols-2 gap-4">
                   <input bind:value={newSubject.name} placeholder="Subject Name (e.g. Data Structures)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                   <div class="col-span-2 grid grid-cols-2 gap-4">
                      <div class="space-y-1">
                        <label for="subject_code" class="text-[8px] font-black text-violet-400 dark:text-violet-500 uppercase tracking-widest px-2">Subject Code</label>
                        <input id="subject_code" bind:value={newSubject.code} placeholder="e.g. CS101" class="w-full px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-violet-500/20 transition-all" />
                      </div>
                      <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-1">
                          <label for="subject_credits" class="text-[8px] font-black text-violet-400 dark:text-violet-500 uppercase tracking-widest px-2">Credits</label>
                          <input id="subject_credits" type="number" bind:value={newSubject.credit_value} placeholder="e.g. 4" class="w-full px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-violet-500/20 transition-all" />
                        </div>
                        <div class="space-y-1">
                          <label for="subject_sessions" class="text-[8px] font-black text-violet-400 dark:text-violet-500 uppercase tracking-widest px-2">Sessions</label>
                          <input id="subject_sessions" type="number" bind:value={newSubject.total_sessions} placeholder="e.g. 30" class="w-full px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-violet-500/20 transition-all" />
                        </div>
                      </div>
                   </div>
                   <button onclick={createSubject} disabled={processing} class="py-3 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-700 transition-all">
                     {processing ? 'Creating...' : 'Add Subject'}
                   </button>
                </div>
              </div>
            {/if}

            <div class="space-y-8 flex-1">
              <!-- Sections List -->
              <div>
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Sections ({sections.length})</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {#each sections as section}
                    <div class="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[2rem] border border-transparent hover:border-indigo-500/20 transition-all group">
                        <div class="flex justify-between items-start mb-4">
                          <div>
                            <h4 class="font-black text-gray-900 dark:text-white text-md tracking-tight">{section.name}</h4>
                            <code class="text-[9px] text-indigo-500 font-black uppercase tracking-widest">{section.batch_code}</code>
                          </div>
                        </div>
                        
                        <div class="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                          <button 
                            onclick={() => importStudents(section.id)}
                            disabled={processing}
                            class="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:bg-indigo-600 hover:text-white"
                          >
                            Bulk Student Import
                          </button>
                        </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Subjects List -->
              <div>
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Subjects ({subjects.length})</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {#each subjects as subject}
                    <div class="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[2rem] border border-transparent hover:border-violet-500/20 transition-all group">
                        <div class="flex justify-between items-start">
                          <div>
                            <h4 class="font-black text-gray-900 dark:text-white text-md tracking-tight">{subject.name}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                <code class="text-[9px] text-violet-500 font-black uppercase tracking-widest">{subject.code}</code>
                                <span class="text-[8px] font-bold text-gray-400">• {subject.credit_value} Credits</span>
                                <span class="text-[8px] font-bold text-gray-400">• {subject.total_sessions_required} Sessions</span>
                            </div>
                          </div>
                        </div>
                    </div>
                  {/each}
                </div>
              </div>

              {#if sections.length === 0 && subjects.length === 0 && !loading}
                <div class="py-20 text-center opacity-30">
                    <p class="text-[10px] font-black uppercase tracking-widest">No configurations for this term</p>
                </div>
              {/if}
            </div>
          {/if}
       </div>
    </div>
  {:else if activeTab === 'faculty'}
    <div in:fly={{ y: 20 }}>
      <div class="p-10 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3.5rem] shadow-sm">
        <div class="flex items-center justify-between mb-12">
          <div>
            <h3 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Faculty Personnel</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-2">Manage teaching staff & onboarding</p>
          </div>
          <button 
            onclick={importFaculty}
            disabled={processing}
            class="px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl active:scale-95"
          >
             {processing ? 'Processing...' : 'Bulk Import Faculty'}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each faculty as f}
            <div class="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[2.5rem] border border-transparent hover:border-black/10 dark:hover:border-white/10 transition-all group">
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-xs uppercase">
                    {f.name?.substring(0, 2) || 'FP'}
                  </div>
                  <div>
                    <h4 class="font-black text-gray-900 dark:text-white text-sm tracking-tight">{f.name || 'Faculty Member'}</h4>
                    <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{f.employee_code}</p>
                  </div>
               </div>
               <div class="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700 grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Department</p>
                    <p class="text-[10px] font-bold text-gray-700 dark:text-white mt-1">{f.department || 'N/A'}</p>
                  </div>
                  <div>
                    <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Designation</p>
                    <p class="text-[10px] font-bold text-gray-700 dark:text-white mt-1">{f.designation || 'Lecturer'}</p>
                  </div>
               </div>
            </div>
          {/each}
          
          {#if faculty.length === 0 && !loading}
            <div class="col-span-full py-32 text-center opacity-30">
               <div class="text-4xl mb-6">👔</div>
               <p class="text-[10px] font-black uppercase tracking-widest">No faculty onboarded yet</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Footer Help -->
  <div class="p-8 bg-black dark:bg-white text-white dark:text-black rounded-[2.5rem] mt-12 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group">
     <div class="z-10">
        <h4 class="text-xl font-black tracking-tight">Setup Foundation</h4>
        <div class="flex flex-wrap gap-4 mt-4">
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {campuses.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Campuses</span>
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {programs.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Programs</span>
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {terms.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Terms</span>
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {subjects.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Subjects</span>
        </div>
     </div>
     <div class="flex flex-col items-end z-10 shrink-0">
        <p class="text-zinc-500 text-xs font-bold mb-2 uppercase tracking-widest opacity-80">Final Step</p>
        <button class="px-8 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:shadow-xl hover:scale-105 transition-all duration-300">Onboard Faculty Personnel →</button>
     </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #f8fafc;
  }
  :global(.dark body) {
    background-color: #020617;
  }
  select {
    background-image: none;
  }
  ::-webkit-calendar-picker-indicator {
    filter: invert(0.5);
    cursor: pointer;
  }
</style>
