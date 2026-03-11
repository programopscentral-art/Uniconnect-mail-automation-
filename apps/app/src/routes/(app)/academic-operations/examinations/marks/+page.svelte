<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { page } from "$app/stores";
  import { getContext } from 'svelte';

  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let subjects = $state<any[]>([]);
  let sections = $state<any[]>([]);
  let students = $state<any[]>([]);

  let selectedProgram = $state('');
  let selectedTerm = $state('');
  let selectedSubject = $state('');
  let selectedSection = $state('');
  let examType = $state('MID1');
  let totalMarks = $state('');

  let loading = $state(false);
  let saving = $state(false);
  let saveMsg = $state('');
  let saveMsgType = $state<'success' | 'error'>('success');
  let marksData = $state<Record<string, string>>({});

  // CSV import
  let importing = $state(false);
  let importMsg = $state('');
  let fileInput: HTMLInputElement;

  // View mode: 'entry' for entering marks, 'overview' to see fill status
  let viewMode = $state<'entry'|'overview'>('entry');
  let overviewData = $state<any[]>([]);
  let overviewLoading = $state(false);

  const examTypes = [
    { key: 'MID1', label: 'Mid 1' },
    { key: 'MID2', label: 'Mid 2' },
    { key: 'SEM', label: 'Semester Exam' },
    { key: 'INTERNAL_LAB', label: 'Internal Lab' },
    { key: 'EXTERNAL_LAB', label: 'External Lab' },
  ];

  // Try to get university from ops context, fallback to user's university
  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // Cascade: university → programs
  $effect(() => {
    if (universityId) {
      loadPrograms();
      selectedProgram = ''; selectedTerm = ''; selectedSubject = ''; selectedSection = '';
    } else {
      programs = [];
    }
  });
  // program → terms
  $effect(() => {
    if (selectedProgram) loadTerms();
    else { terms = []; selectedTerm = ''; }
  });
  // term → subjects + sections
  $effect(() => {
    if (selectedTerm) loadSubjectsAndSections();
    else { subjects = []; sections = []; selectedSubject = ''; selectedSection = ''; }
  });
  // subject + section + exam → students
  $effect(() => {
    if (selectedSubject && selectedSection && examType && viewMode === 'entry') loadStudents();
    else { students = []; marksData = {}; }
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

  async function loadSubjectsAndSections() {
    selectedSubject = ''; selectedSection = '';
    const [subRes, secRes] = await Promise.all([
      fetch(`/api/academic/subjects?termId=${selectedTerm}`),
      fetch(`/api/academic/sections?termId=${selectedTerm}`)
    ]);
    if (subRes.ok) subjects = await subRes.json();
    if (secRes.ok) sections = await secRes.json();
  }

  async function loadStudents() {
    loading = true;
    try {
      const [studRes, marksRes] = await Promise.all([
        fetch(`/api/academic/students?sectionId=${selectedSection}`),
        fetch(`/api/academic/marks?subjectId=${selectedSubject}&sectionId=${selectedSection}&examType=${examType}`)
      ]);
      if (studRes.ok) {
        students = await studRes.json();
        marksData = {};
        const existingMarks = marksRes.ok ? await marksRes.json() : [];
        for (const s of students) {
          const existing = existingMarks.find((m: any) => m.student_id === s.id);
          marksData[s.id] = existing?.marks?.toString() || '';
          if (existing?.total_marks && !totalMarks) {
            totalMarks = existing.total_marks.toString();
          }
        }
      }
    } finally { loading = false; }
  }

  // Overview: for each subject+section+exam, check how many marks are filled
  async function loadOverview() {
    if (!selectedTerm || subjects.length === 0 || sections.length === 0) return;
    overviewLoading = true;
    overviewData = [];
    try {
      const results: any[] = [];
      for (const subj of subjects) {
        for (const sec of sections) {
          for (const ex of examTypes) {
            const [studRes, marksRes] = await Promise.all([
              fetch(`/api/academic/students?sectionId=${sec.id}`),
              fetch(`/api/academic/marks?subjectId=${subj.id}&sectionId=${sec.id}&examType=${ex.key}`)
            ]);
            const studs = studRes.ok ? await studRes.json() : [];
            const marks = marksRes.ok ? await marksRes.json() : [];
            const filled = marks.filter((m: any) => m.marks !== null && m.marks !== undefined).length;
            results.push({
              subject_name: subj.name,
              subject_code: subj.code,
              section_name: sec.name,
              batch_code: sec.batch_code,
              exam_type: ex.key,
              exam_label: ex.label,
              total_students: studs.length,
              filled,
              pending: studs.length - filled
            });
          }
        }
      }
      overviewData = results.filter(r => r.total_students > 0);
    } finally { overviewLoading = false; }
  }

  async function saveMarks() {
    if (!selectedSubject || !selectedSection) return;
    saving = true; saveMsg = '';
    try {
      const entries = Object.entries(marksData)
        .filter(([_, v]) => v !== '')
        .map(([studentId, marks]) => ({
          student_id: studentId,
          subject_id: selectedSubject,
          section_id: selectedSection,
          exam_type: examType,
          marks: Number(marks)
        }));
      if (entries.length === 0) {
        saveMsg = 'No marks to save'; saveMsgType = 'error'; return;
      }
      const res = await fetch('/api/academic/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, total_marks: totalMarks ? Number(totalMarks) : null })
      });
      if (res.ok) {
        saveMsg = `Saved ${entries.length} marks`; saveMsgType = 'success';
        setTimeout(() => saveMsg = '', 3000);
      } else {
        saveMsg = 'Failed to save marks'; saveMsgType = 'error';
      }
    } finally { saving = false; }
  }

  function downloadCSV() {
    if (!selectedSubject || !selectedSection) return;
    window.open(`/api/academic/marks/export?subjectId=${selectedSubject}&sectionId=${selectedSection}&examType=${examType}`, '_blank');
  }

  function downloadTemplate() {
    const headers = ['NIAT_ID', 'Student_Name', 'Marks_Obtained'];
    const rows = [headers.join(',')];
    for (const s of students) {
      rows.push(`${s.roll_number || ''},"${s.name || s.roll_number || ''}",`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'marks_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileImport(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file || !selectedSubject || !selectedSection) return;
    importing = true; importMsg = '';
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) { importMsg = 'File is empty or has no data rows'; return; }
      const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const niatIdx = header.findIndex(h => /niat|roll|student_id/i.test(h));
      const marksIdx = header.findIndex(h => /marks|obtained|score/i.test(h));
      if (niatIdx === -1 || marksIdx === -1) {
        importMsg = 'CSV must have columns: NIAT_ID and Marks_Obtained'; return;
      }
      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols[niatIdx] && cols[marksIdx]) {
          rows.push({ niat_id: cols[niatIdx], marks: cols[marksIdx] });
        }
      }
      const res = await fetch('/api/academic/marks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          subject_id: selectedSubject,
          section_id: selectedSection,
          exam_type: examType,
          total_marks: totalMarks ? Number(totalMarks) : null
        })
      });
      const data = await res.json();
      if (data.success) {
        importMsg = `Imported ${data.matched} marks` + (data.skipped ? `, ${data.skipped} skipped` : '');
        loadStudents();
      } else {
        importMsg = data.message || 'Import failed';
      }
    } catch (err: any) {
      importMsg = err.message || 'Failed to process file';
    } finally {
      importing = false;
      if (target) target.value = '';
    }
  }

  const filledCount = $derived(Object.values(marksData).filter(v => v !== '').length);
</script>

<div class="space-y-6" in:fade>
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Marks <span class="text-indigo-600">Management</span></h2>
      <p class="text-xs font-medium text-gray-400 mt-1">Enter and review student marks across programs</p>
    </div>
    <div class="flex items-center gap-2">
      <button onclick={() => viewMode = 'entry'}
        class="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors
          {viewMode === 'entry' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}">
        Enter Marks
      </button>
      <button onclick={() => { viewMode = 'overview'; if (selectedTerm && subjects.length > 0 && sections.length > 0) loadOverview(); }}
        class="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors
          {viewMode === 'overview' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}">
        Overview
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="grid grid-cols-2 md:grid-cols-{viewMode === 'entry' ? '6' : '3'} gap-3 p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
    <!-- 1. Program / Branch -->
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Program / Branch</label>
      <select bind:value={selectedProgram}
        class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
        <option value="">Select Program</option>
        {#each programs as p}<option value={p.id}>{p.code} — {p.name}</option>{/each}
      </select>
    </div>

    <!-- 2. Semester -->
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Semester</label>
      <select bind:value={selectedTerm}
        disabled={!selectedProgram}
        class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 disabled:opacity-40">
        <option value="">Select Semester</option>
        {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </div>

    {#if viewMode === 'entry'}
      <!-- 3. Subject -->
      <div class="flex flex-col gap-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subject</label>
        <select bind:value={selectedSubject}
          disabled={!selectedTerm}
          class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 disabled:opacity-40">
          <option value="">Select Subject</option>
          {#each subjects as s}<option value={s.id}>{s.code} — {s.name}</option>{/each}
        </select>
      </div>

      <!-- 4. Section -->
      <div class="flex flex-col gap-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Section</label>
        <select bind:value={selectedSection}
          disabled={!selectedTerm}
          class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 disabled:opacity-40">
          <option value="">Select Section</option>
          {#each sections as s}<option value={s.id}>{s.name}{s.batch_code ? ` (${s.batch_code})` : ''}</option>{/each}
        </select>
      </div>

      <!-- 5. Exam Type -->
      <div class="flex flex-col gap-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Exam Type</label>
        <select bind:value={examType}
          class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
          {#each examTypes as t}<option value={t.key}>{t.label}</option>{/each}
        </select>
      </div>

      <!-- 6. Total Marks -->
      <div class="flex flex-col gap-1">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Marks</label>
        <input type="number" min="0" step="1" bind:value={totalMarks} placeholder="e.g. 100"
          class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
      </div>
    {:else}
      <!-- Overview: load button -->
      <div class="flex flex-col gap-1 justify-end">
        <button onclick={loadOverview}
          disabled={!selectedTerm || overviewLoading}
          class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50">
          {overviewLoading ? 'Loading...' : 'Load Overview'}
        </button>
      </div>
    {/if}
  </div>

  {#if viewMode === 'entry'}
    <!-- ENTRY MODE -->
    {#if !universityId}
      <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
        <div class="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 mx-auto flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
        </div>
        <p class="text-gray-500 font-bold text-sm">Please select a university first</p>
        <p class="text-gray-400 text-xs mt-1">Use the university selector at the top of the page</p>
      </div>
    {:else if !selectedSubject || !selectedSection}
      <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
        <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        </div>
        <p class="text-gray-500 font-bold text-sm">Select program, semester, subject, section & exam type</p>
      </div>
    {:else if loading}
      <div class="p-20 flex flex-col items-center">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading students...</p>
      </div>
    {:else if students.length === 0}
      <div class="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
        <p class="text-gray-500 font-bold text-sm">No students found for this section</p>
        <p class="text-gray-400 text-xs mt-1">Students must be enrolled in this section first</p>
      </div>
    {:else}
      <!-- Actions bar -->
      <div class="flex flex-wrap items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl" in:fly={{ y: 10 }}>
        <input type="file" accept=".csv" bind:this={fileInput} onchange={handleFileImport} class="hidden" />
        <button onclick={() => fileInput?.click()} disabled={importing}
          class="px-4 py-2 bg-violet-50 dark:bg-violet-500/10 text-violet-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-100 transition-colors disabled:opacity-50">
          {importing ? 'Importing...' : 'Import CSV'}
        </button>
        <button onclick={downloadTemplate} class="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
          Template
        </button>
        <button onclick={downloadCSV} class="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-100 transition-colors">
          Export CSV
        </button>
        {#if importMsg}
          <span class="text-xs font-bold text-amber-600" transition:fade>{importMsg}</span>
        {/if}
        <div class="flex-1"></div>
        <p class="text-[10px] text-gray-400">{students.length} students · {filledCount} marks entered{totalMarks ? ` · Total: ${totalMarks}` : ''}</p>
      </div>

      <!-- Marks table -->
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ y: 10 }}>
        <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h3 class="font-black text-gray-900 dark:text-white text-sm">
            {subjects.find(s => s.id === selectedSubject)?.name} — {examTypes.find(t => t.key === examType)?.label}
          </h3>
          <div class="flex items-center gap-3">
            {#if saveMsg}
              <span class="text-xs font-bold {saveMsgType === 'success' ? 'text-emerald-600' : 'text-rose-600'}" transition:fade>{saveMsg}</span>
            {/if}
            <button onclick={saveMarks} disabled={saving || filledCount === 0}
              class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Marks'}
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-gray-50 dark:bg-slate-800">
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-12">#</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">NIAT ID</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Student Name</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-32">Marks{totalMarks ? ` / ${totalMarks}` : ''}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
              {#each students as student, i}
                <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td class="px-6 py-3 text-xs font-bold text-gray-400">{i + 1}</td>
                  <td class="px-6 py-3 text-xs font-mono text-gray-500">{student.roll_number || '—'}</td>
                  <td class="px-6 py-3 text-xs font-bold text-gray-900 dark:text-white">{student.name || student.roll_number}</td>
                  <td class="px-6 py-3">
                    <input type="number" min="0" max={totalMarks ? Number(totalMarks) : 999} step="0.5"
                      bind:value={marksData[student.id]}
                      placeholder="—"
                      class="w-24 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-center focus:ring-2 ring-indigo-500 outline-none" />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

  {:else}
    <!-- OVERVIEW MODE -->
    {#if !selectedTerm}
      <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
        <p class="text-gray-500 font-bold text-sm">Select a program and semester, then click "Load Overview"</p>
        <p class="text-gray-400 text-xs mt-1">Shows fill status for each subject, section, and exam type</p>
      </div>
    {:else if overviewLoading}
      <div class="p-20 flex flex-col items-center">
        <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading overview...</p>
      </div>
    {:else if overviewData.length === 0}
      <div class="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
        <p class="text-gray-500 font-bold text-sm">No data found — click "Load Overview" after selecting filters</p>
      </div>
    {:else}
      <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ y: 10 }}>
        <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
          <h3 class="font-black text-gray-900 dark:text-white text-sm">Marks Fill Status</h3>
          <p class="text-[10px] text-gray-400 mt-0.5">{overviewData.length} combinations · {programs.find(p => p.id === selectedProgram)?.name} · {terms.find(t => t.id === selectedTerm)?.name}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-gray-50 dark:bg-slate-800">
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Subject</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Section</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Exam Type</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Students</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Filled</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Pending</th>
                <th class="text-left px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
              {#each overviewData as row}
                <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td class="px-6 py-3 text-xs font-bold text-gray-900 dark:text-white">{row.subject_code} — {row.subject_name}</td>
                  <td class="px-6 py-3 text-xs text-gray-500">{row.section_name}{row.batch_code ? ` (${row.batch_code})` : ''}</td>
                  <td class="px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-300">{row.exam_label}</td>
                  <td class="px-6 py-3 text-xs font-bold text-gray-700 dark:text-gray-200">{row.total_students}</td>
                  <td class="px-6 py-3 text-xs font-bold text-emerald-600">{row.filled}</td>
                  <td class="px-6 py-3 text-xs font-bold {row.pending > 0 ? 'text-amber-600' : 'text-gray-400'}">{row.pending}</td>
                  <td class="px-6 py-3">
                    {#if row.filled === 0}
                      <span class="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-lg">Not Started</span>
                    {:else if row.pending === 0}
                      <span class="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-lg">Complete</span>
                    {:else}
                      <span class="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-lg">Partial</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
