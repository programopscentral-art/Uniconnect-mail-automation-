<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { page } from "$app/stores";

  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let subjects = $state<any[]>([]);
  let sections = $state<any[]>([]);
  let students = $state<any[]>([]);

  let selectedProgram = $state('');
  let selectedTerm = $state('');
  let selectedSubject = $state('');
  let selectedSection = $state('');
  let examType = $state('MID_TERM');
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

  const universityId = $derived($page.data?.user?.university_id || '');

  $effect(() => { if (universityId) loadPrograms(); });
  $effect(() => {
    if (selectedProgram) loadTerms();
    else { terms = []; selectedTerm = ''; }
  });
  $effect(() => {
    if (selectedTerm) loadSubjectsAndSections();
    else { subjects = []; sections = []; selectedSubject = ''; selectedSection = ''; }
  });
  $effect(() => {
    if (selectedSubject && selectedSection) loadStudents();
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
        // Pre-fill existing marks
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
        saveMsg = 'No marks to save'; saveMsgType = 'error';
        return;
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
    const url = `/api/academic/marks/export?subjectId=${selectedSubject}&sectionId=${selectedSection}&examType=${examType}`;
    window.open(url, '_blank');
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
        importMsg = 'CSV must have columns: NIAT_ID and Marks_Obtained';
        return;
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
        if (data.errors?.length) importMsg += ` | ${data.errors.slice(0, 3).join(', ')}`;
        // Reload marks
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

  const examTypes = [
    { key: 'MID_TERM', label: 'Mid Term' },
    { key: 'END_TERM', label: 'End Term' },
    { key: 'INTERNAL_1', label: 'Internal 1' },
    { key: 'INTERNAL_2', label: 'Internal 2' },
    { key: 'ASSIGNMENT', label: 'Assignment' },
  ];

  const filledCount = $derived(Object.values(marksData).filter(v => v !== '').length);
</script>

<div class="space-y-6" in:fade>
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Marks <span class="text-indigo-600">Entry</span></h2>
      <p class="text-xs font-medium text-gray-400 mt-1">Upload and manage student marks by subject and exam type</p>
    </div>
    {#if selectedSubject && selectedSection && students.length > 0}
      <div class="flex items-center gap-2">
        <button onclick={downloadTemplate} class="px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
          Download Template
        </button>
        <button onclick={downloadCSV} class="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-100 transition-colors">
          Export CSV
        </button>
      </div>
    {/if}
  </div>

  <!-- Filters -->
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3 p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Program</label>
      <select bind:value={selectedProgram} class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
        <option value="">Select</option>
        {#each programs as p}<option value={p.id}>{p.code} — {p.name}</option>{/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Semester</label>
      <select bind:value={selectedTerm} class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
        <option value="">Select</option>
        {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subject</label>
      <select bind:value={selectedSubject} class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
        <option value="">Select</option>
        {#each subjects as s}<option value={s.id}>{s.code} — {s.name}</option>{/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Section</label>
      <select bind:value={selectedSection} class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
        <option value="">Select</option>
        {#each sections as s}<option value={s.id}>{s.name} ({s.batch_code})</option>{/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Exam Type</label>
      <select bind:value={examType} class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
        {#each examTypes as t}<option value={t.key}>{t.label}</option>{/each}
      </select>
    </div>
  </div>

  {#if !selectedSubject || !selectedSection}
    <div class="text-center py-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
      <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      </div>
      <p class="text-gray-500 font-bold text-sm">Select program, semester, subject & section to enter marks</p>
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
    <!-- Total Marks + Import/Actions Bar -->
    <div class="flex flex-wrap items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl" in:fly={{ y: 10 }}>
      <div class="flex items-center gap-2">
        <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Total Marks</label>
        <input type="number" min="0" step="1" bind:value={totalMarks} placeholder="e.g. 100"
          class="w-24 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-center focus:ring-2 ring-indigo-500 outline-none" />
      </div>

      <div class="flex-1"></div>

      <input type="file" accept=".csv,.xlsx" bind:this={fileInput} onchange={handleFileImport} class="hidden" />
      <button onclick={() => fileInput?.click()} disabled={importing}
        class="px-4 py-2 bg-violet-50 dark:bg-violet-500/10 text-violet-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-100 transition-colors disabled:opacity-50">
        {importing ? 'Importing...' : 'Import CSV'}
      </button>

      {#if importMsg}
        <span class="text-xs font-bold text-amber-600" transition:fade>{importMsg}</span>
      {/if}
    </div>

    <!-- Marks table -->
    <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ y: 10 }}>
      <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 class="font-black text-gray-900 dark:text-white text-sm">
            {subjects.find(s => s.id === selectedSubject)?.name} — {examTypes.find(t => t.key === examType)?.label}
          </h3>
          <p class="text-[10px] text-gray-400 mt-0.5">{students.length} students · {filledCount} marks entered{totalMarks ? ` · Total: ${totalMarks}` : ''}</p>
        </div>
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
</div>
