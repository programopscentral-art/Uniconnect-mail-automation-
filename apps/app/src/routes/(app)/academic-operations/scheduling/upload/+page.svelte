<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly, scale } from "svelte/transition";

  let step = $state(1);
  let source = $state<"UPLOAD" | "MANUAL" | "CLONE" | null>(null);
  let file = $state<File | null>(null);
  let processing = $state(false);
  let errorMsg = $state('');

  // University context
  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // Parse & match results
  let parseResult = $state<any>(null);
  let matchResult = $state<any>(null);

  // Programs and terms for context
  let programs = $state<any[]>([]);
  let selectedProgramId = $state('');
  let terms = $state<any[]>([]);
  let selectedTermId = $state('');
  let selectedYear = $state(new Date().getFullYear());

  // Available entities for manual remapping
  let dbSubjects = $state<any[]>([]);
  let dbFaculty = $state<any[]>([]);
  let dbSections = $state<any[]>([]);

  // Manual mapping overrides
  let subjectOverrides = $state<Record<string, string>>({});
  let facultyOverrides = $state<Record<string, string>>({});
  let sectionOverrides = $state<Record<number, string>>({});

  // Confirm result
  let confirmResult = $state<any>(null);
  let publishing = $state(false);

  $effect(() => {
    if (universityId) loadPrograms();
  });

  $effect(() => {
    if (universityId && selectedProgramId) loadTerms();
  });

  async function loadPrograms() {
    try {
      const res = await fetch(`/api/academic/programs?universityId=${universityId}`);
      if (res.ok) programs = await res.json();
    } catch {}
  }

  async function loadTerms() {
    try {
      const res = await fetch(`/api/academic/terms?universityId=${universityId}&programId=${selectedProgramId}`);
      if (res.ok) terms = await res.json();
    } catch {}
  }

  async function loadEntities() {
    try {
      const [subjRes, facRes, secRes] = await Promise.all([
        fetch(`/api/academic/subjects?universityId=${universityId}`),
        fetch(`/api/academic/faculty?universityId=${universityId}`),
        fetch(`/api/academic/sections?universityId=${universityId}${selectedTermId ? `&termId=${selectedTermId}` : ''}`)
      ]);
      if (subjRes.ok) dbSubjects = await subjRes.json();
      if (facRes.ok) dbFaculty = await facRes.json();
      if (secRes.ok) dbSections = await secRes.json();
    } catch {}
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) file = input.files[0];
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
      file = f;
    }
  }

  async function handleSourceSelect(s: typeof source) {
    source = s;
    if (s === 'MANUAL') {
      window.location.href = '/academic-operations/scheduling/designer';
      return;
    }
    step = 2;
  }

  async function startUpload() {
    if (!file || !universityId) return;
    processing = true;
    errorMsg = '';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('universityId', universityId);
      formData.append('year', String(selectedYear));

      const res = await fetch('/api/academic/scheduling/import', { method: 'POST', body: formData });
      const data = await res.json();

      if (!data.success) {
        errorMsg = data.message || 'Failed to parse file';
        if (data.debugSheets?.length) {
          errorMsg += '\n\nSheet preview (first 5 sheets):\n';
          for (const ds of data.debugSheets) {
            errorMsg += `\n📄 "${ds.name}" (${ds.rowCount} rows):\n`;
            for (const row of ds.preview) {
              const cells = row.cells.map((c: any) => c.value || '(empty)').join(' | ');
              errorMsg += `  Row ${row.row}: ${cells}\n`;
            }
          }
        }
        processing = false;
        return;
      }

      parseResult = data.parseResult;
      matchResult = data.matchResult;

      // Load entities for remapping dropdowns
      await loadEntities();

      // Pre-populate overrides from matched data
      for (const s of matchResult.subjects || []) {
        if (s.dbId) subjectOverrides[s.parsed] = s.dbId;
      }
      for (const f of matchResult.faculty || []) {
        if (f.dbId) facultyOverrides[f.parsed] = f.dbId;
      }
      for (const sec of matchResult.sections || []) {
        const num = parseInt(sec.parsed.replace('Section ', ''));
        if (sec.dbId && !isNaN(num)) sectionOverrides[num] = sec.dbId;
      }

      processing = false;
      step = 3;
    } catch (e: any) {
      errorMsg = e.message || 'Upload failed';
      processing = false;
    }
  }

  async function confirmImport() {
    processing = true;
    errorMsg = '';

    try {
      // Re-apply overrides to matched sessions
      const updatedSessions = (matchResult.matchedSessions || []).map((ms: any) => ({
        ...ms,
        subjectId: subjectOverrides[ms.subjectCode] || ms.subjectId,
        sectionId: sectionOverrides[ms.sectionNumber] || ms.sectionId,
        facultyProfileId: (() => {
          for (const fname of ms.facultyNames || []) {
            if (facultyOverrides[fname]) return facultyOverrides[fname];
          }
          return ms.facultyProfileId;
        })()
      }));

      const res = await fetch('/api/academic/scheduling/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityId,
          programId: selectedProgramId || null,
          termId: selectedTermId || null,
          matchedSessions: updatedSessions,
          slots: parseResult?.slots || [],
          notes: `Imported from ${file?.name || 'Excel'}`,
          fileName: file?.name || 'unknown.xlsx',
          fileSizeBytes: file?.size || 0
        })
      });

      const data = await res.json();
      confirmResult = data;
      processing = false;

      if (data.success) {
        step = data.conflictsDetected > 0 ? 4 : 5;
      } else {
        errorMsg = data.message || 'Import failed';
      }
    } catch (e: any) {
      errorMsg = e.message || 'Confirm failed';
      processing = false;
    }
  }

  async function publishVersion() {
    if (!confirmResult?.versionId) return;
    publishing = true;
    try {
      await fetch('/api/academic/scheduling/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: confirmResult.versionId, universityId })
      });
      step = 5;
    } catch {}
    publishing = false;
  }

  const steps = [
    { title: "Select Source", icon: "1" },
    { title: "Upload File", icon: "2" },
    { title: "Map Entities", icon: "3" },
    { title: "Review", icon: "4" },
    { title: "Complete", icon: "5" }
  ];
</script>

<div class="space-y-10" in:fade>
  {#if !universityId}
    <div class="p-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl text-center">
      <p class="text-gray-500 font-bold text-sm">Please select a university from the top selector first.</p>
    </div>
  {:else}

  <!-- Step Indicator -->
  <div class="flex items-center justify-between gap-4 max-w-3xl mx-auto relative">
    <div class="absolute top-5 left-0 w-full h-0.5 bg-gray-100 dark:bg-slate-800 -z-10"></div>
    {#each steps as s, i}
      <div class="flex flex-col items-center gap-2 relative z-10 transition-all {step > i ? 'opacity-100' : 'opacity-40'}">
        <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black transition-all
          {step === i+1 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : step > i+1 ? 'bg-green-600 text-white' : 'bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 text-gray-400'}">
          {step > i+1 ? '✓' : s.icon}
        </div>
        <span class="text-[9px] font-black uppercase tracking-widest text-gray-500">{s.title}</span>
      </div>
    {/each}
  </div>

  <!-- Content -->
  <div class="p-10 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm max-w-4xl mx-auto min-h-[450px]">

    {#if errorMsg}
      <div class="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800 rounded-2xl text-sm text-red-700 dark:text-red-300 font-medium whitespace-pre-wrap font-mono">
        {errorMsg}
      </div>
    {/if}

    <!-- STEP 1: Source Selection -->
    {#if step === 1}
      <div class="text-center space-y-8" in:fly={{ y: 20 }}>
        <div>
          <h2 class="text-2xl font-black text-gray-900 dark:text-white">New <span class="text-indigo-600">Timetable</span> Import</h2>
          <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">How would you like to initialize the schedule?</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button onclick={() => handleSourceSelect('UPLOAD')} class="group p-8 rounded-[2rem] border-2 border-gray-100 dark:border-slate-800 hover:border-indigo-600 transition-all flex flex-col items-center gap-5 hover:shadow-xl hover:shadow-indigo-600/5">
            <div class="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all">
              <svg class="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            </div>
            <div class="text-center">
              <h4 class="font-black text-sm uppercase tracking-tight mb-1">Excel Import</h4>
              <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">Upload timetable<br/>from .xlsx file</p>
            </div>
          </button>
          <button onclick={() => handleSourceSelect('MANUAL')} class="group p-8 rounded-[2rem] border-2 border-gray-100 dark:border-slate-800 hover:border-violet-600 transition-all flex flex-col items-center gap-5 hover:shadow-xl">
            <div class="w-14 h-14 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all">
              <svg class="w-7 h-7 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </div>
            <div class="text-center">
              <h4 class="font-black text-sm uppercase tracking-tight mb-1">Manual Builder</h4>
              <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">Create sessions<br/>one at a time</p>
            </div>
          </button>
          <button onclick={() => handleSourceSelect('CLONE')} class="group p-8 rounded-[2rem] border-2 border-gray-100 dark:border-slate-800 hover:border-blue-600 transition-all flex flex-col items-center gap-5 hover:shadow-xl opacity-50 cursor-not-allowed" disabled>
            <div class="w-14 h-14 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center">
              <svg class="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </div>
            <div class="text-center">
              <h4 class="font-black text-sm uppercase tracking-tight mb-1">Clone Term</h4>
              <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">Coming soon</p>
            </div>
          </button>
        </div>
      </div>

    <!-- STEP 2: File Upload -->
    {:else if step === 2}
      <div class="space-y-8" in:fly={{ y: 20 }}>
        <div class="text-center">
          <h2 class="text-2xl font-black text-gray-900 dark:text-white">Upload <span class="text-indigo-600">Timetable</span></h2>
          <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Select your Excel file with the weekly timetable sheets</p>
        </div>

        <!-- Context selectors -->
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Program (optional)</label>
            <select bind:value={selectedProgramId} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold">
              <option value="">All Programs</option>
              {#each programs as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
          </div>
          <div>
            <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Term (optional)</label>
            <select bind:value={selectedTermId} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold">
              <option value="">All Terms</option>
              {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
            </select>
          </div>
          <div>
            <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Year</label>
            <input type="number" bind:value={selectedYear} min="2020" max="2030" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold" />
          </div>
        </div>

        <!-- Drop zone -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          ondragover={(e) => e.preventDefault()}
          ondrop={handleDrop}
          class="flex flex-col items-center justify-center border-3 border-dashed border-gray-200 dark:border-slate-700 rounded-[2.5rem] p-16 group hover:border-indigo-400 transition-all cursor-pointer bg-gray-50/50 dark:bg-slate-800/20 relative"
          onclick={() => document.getElementById('fileInput')?.click()}
          role="button"
          tabindex="0"
        >
          <input id="fileInput" type="file" accept=".xlsx,.xls" onchange={handleFileInput} class="hidden" />

          {#if file}
            <div class="w-16 h-16 bg-green-100 dark:bg-green-500/10 rounded-2xl flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p class="font-black text-sm text-gray-900 dark:text-white">{file.name}</p>
            <p class="text-[10px] text-gray-400 font-bold mt-1">{(file.size / 1024).toFixed(0)} KB</p>
          {:else}
            <div class="w-16 h-16 bg-white dark:bg-slate-700 rounded-2xl shadow-md flex items-center justify-center mb-4 group-hover:scale-110 transition-all">
              <svg class="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            </div>
            <p class="font-black text-sm text-gray-900 dark:text-white mb-1">Drop your Excel file here</p>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">or click to browse (.xlsx, .xls)</p>
          {/if}
        </div>

        <div class="flex items-center justify-between pt-4">
          <button onclick={() => { step = 1; file = null; }} class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all">Back</button>
          <button
            onclick={startUpload}
            disabled={!file || processing}
            class="px-10 py-3.5 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {processing ? 'Parsing...' : 'Parse & Analyze'}
          </button>
        </div>
      </div>

    <!-- STEP 3: Entity Mapping -->
    {:else if step === 3}
      <div class="space-y-8" in:fly={{ y: 20 }}>
        <div class="flex justify-between items-start">
          <div>
            <h2 class="text-2xl font-black text-gray-900 dark:text-white">Map <span class="text-indigo-600">Entities</span></h2>
            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Link parsed entities to database records</p>
          </div>
          <div class="flex gap-3">
            <div class="px-4 py-2 bg-green-50 dark:bg-green-500/10 rounded-xl text-[10px] font-black text-green-600 uppercase tracking-widest">
              {matchResult?.totalMatchable || 0} / {matchResult?.totalParsed || 0} Ready
            </div>
            {#if parseResult?.sheets}
              <div class="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                {parseResult.sheets.length} Sheets
              </div>
            {/if}
          </div>
        </div>

        <!-- Parsed sheets summary -->
        {#if parseResult?.sheets?.length > 0}
          <div class="flex gap-2 flex-wrap">
            {#each parseResult.sheets as sheet}
              <div class="px-3 py-1.5 bg-gray-50 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-gray-600 dark:text-gray-400">
                {sheet.name}: {sheet.sessionCount} sessions
              </div>
            {/each}
          </div>
        {/if}

        <!-- Sections Mapping -->
        <div class="space-y-3">
          <h3 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">Sections</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            {#each matchResult?.sections || [] as sec}
              {@const num = parseInt(sec.parsed.replace('Section ', ''))}
              <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border {sec.confidence === 'unmatched' ? 'border-red-200 dark:border-red-800' : 'border-transparent'}">
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">{sec.parsed}</p>
                <select
                  value={sectionOverrides[num] || sec.dbId || ''}
                  onchange={(e) => { sectionOverrides[num] = (e.target as HTMLSelectElement).value; }}
                  class="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 py-2"
                >
                  <option value="">-- Unmatched --</option>
                  {#each dbSections as s}<option value={s.id}>{s.name}{s.batch_code ? ` (${s.batch_code})` : ''}</option>{/each}
                </select>
              </div>
            {/each}
          </div>
        </div>

        <!-- Subjects Mapping -->
        <div class="space-y-3">
          <h3 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">Subjects</h3>
          <div class="grid grid-cols-2 gap-3">
            {#each matchResult?.subjects || [] as subj}
              <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl flex items-center gap-4 border {subj.confidence === 'unmatched' ? 'border-red-200 dark:border-red-800' : 'border-transparent'}">
                <div class="shrink-0">
                  <span class="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-black">{subj.parsed}</span>
                </div>
                <div class="flex-1 min-w-0">
                  {#if subj.confidence !== 'unmatched'}
                    <p class="text-xs font-bold text-green-600 truncate">{subj.dbName}</p>
                  {:else}
                    <select
                      value={subjectOverrides[subj.parsed] || ''}
                      onchange={(e) => { subjectOverrides[subj.parsed] = (e.target as HTMLSelectElement).value; }}
                      class="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 py-2"
                    >
                      <option value="">-- Select Subject --</option>
                      {#each dbSubjects as s}<option value={s.id}>{s.code} - {s.name}</option>{/each}
                    </select>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Faculty Mapping -->
        <div class="space-y-3">
          <h3 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest">Faculty</h3>
          <div class="grid grid-cols-2 gap-3">
            {#each matchResult?.faculty || [] as fac}
              <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl flex items-center gap-4 border {fac.confidence === 'unmatched' ? 'border-amber-200 dark:border-amber-800' : 'border-transparent'}">
                <div class="shrink-0">
                  <span class="px-3 py-1.5 bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 rounded-lg text-xs font-black">{fac.parsed}</span>
                </div>
                <div class="flex-1 min-w-0">
                  {#if fac.confidence !== 'unmatched'}
                    <p class="text-xs font-bold text-green-600 truncate">{fac.dbName}</p>
                    <p class="text-[9px] text-gray-400">{fac.confidence}</p>
                  {:else}
                    <select
                      value={facultyOverrides[fac.parsed] || ''}
                      onchange={(e) => { facultyOverrides[fac.parsed] = (e.target as HTMLSelectElement).value; }}
                      class="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold px-3 py-2"
                    >
                      <option value="">-- Select Faculty --</option>
                      {#each dbFaculty as f}<option value={f.id}>{f.name || f.employee_code}</option>{/each}
                    </select>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Warnings -->
        {#if matchResult?.warnings?.length > 0}
          <div class="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 rounded-2xl">
            <p class="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Warnings</p>
            {#each matchResult.warnings as w}
              <p class="text-xs text-amber-700 dark:text-amber-300">{w}</p>
            {/each}
          </div>
        {/if}

        <div class="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-800">
          <button onclick={() => { step = 2; }} class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all">Re-Upload</button>
          <button
            onclick={confirmImport}
            disabled={processing}
            class="px-10 py-3.5 bg-green-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-600/20 hover:bg-green-700 transition-all disabled:opacity-40"
          >
            {processing ? 'Importing...' : 'Confirm & Import'}
          </button>
        </div>
      </div>

    <!-- STEP 4: Review (conflicts found) -->
    {:else if step === 4}
      <div class="space-y-8" in:fly={{ y: 20 }}>
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-black text-gray-900 dark:text-white">Import <span class="text-amber-500">Review</span></h2>
            <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Sessions imported with some conflicts detected</p>
          </div>
          {#if confirmResult}
            <div class="text-right">
              <p class="text-sm font-black text-gray-900 dark:text-white">{confirmResult.sessionsCreated} sessions created</p>
              <p class="text-[10px] text-amber-600 font-bold">{confirmResult.conflictsDetected} conflicts</p>
            </div>
          {/if}
        </div>

        <div class="p-6 bg-amber-50 dark:bg-amber-500/5 rounded-2xl border border-amber-100 dark:border-amber-800">
          <p class="text-sm text-amber-800 dark:text-amber-200">
            The timetable has been imported as a <span class="font-black">DRAFT</span>. Review conflicts in the Conflict Center before publishing.
          </p>
        </div>

        <div class="flex gap-4">
          <a href="/academic-operations/scheduling/conflicts" class="flex-1 p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-center hover:shadow-md transition-all">
            <p class="text-xs font-black uppercase tracking-widest text-amber-600">View Conflicts</p>
          </a>
          <button onclick={publishVersion} disabled={publishing} class="flex-1 p-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40 transition-all">
            {publishing ? 'Publishing...' : 'Publish Anyway'}
          </button>
        </div>

        <a href="/academic-operations/scheduling/sessions" class="block text-center text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all">View Sessions</a>
      </div>

    <!-- STEP 5: Complete -->
    {:else if step === 5}
      <div class="text-center space-y-10 py-8" in:scale={{ duration: 400, start: 0.95 }}>
        <div class="w-24 h-24 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <div>
          <h2 class="text-3xl font-black text-gray-900 dark:text-white mb-2">Timetable <span class="text-green-600">Imported</span></h2>
          <p class="text-xs text-gray-400 font-bold uppercase tracking-widest">Version {confirmResult?.versionNumber || '?'} created as DRAFT</p>
        </div>

        <div class="grid grid-cols-3 gap-4 max-w-lg mx-auto">
          <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
            <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sessions</p>
            <p class="text-2xl font-black text-gray-900 dark:text-white">{confirmResult?.sessionsCreated || 0}</p>
          </div>
          <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
            <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Skipped</p>
            <p class="text-2xl font-black {(confirmResult?.sessionsSkipped || 0) > 0 ? 'text-red-500' : 'text-gray-300'}">{confirmResult?.sessionsSkipped || 0}</p>
          </div>
          <div class="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl">
            <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Conflicts</p>
            <p class="text-2xl font-black {(confirmResult?.conflictsDetected || 0) > 0 ? 'text-amber-600' : 'text-green-600'}">{confirmResult?.conflictsDetected || 0}</p>
          </div>
        </div>

        {#if confirmResult?.errorDetails?.length > 0}
          <div class="max-w-lg mx-auto p-4 bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-800 rounded-2xl">
            <p class="text-[10px] font-black text-red-600 uppercase tracking-widest mb-2">Skipped Rows ({confirmResult.errorDetails.length})</p>
            <div class="max-h-32 overflow-y-auto space-y-1">
              {#each confirmResult.errorDetails.slice(0, 20) as err}
                <p class="text-xs text-red-600 dark:text-red-400">{err.date} | Section {err.section} | {err.slot} | {err.subject} — {err.reason}</p>
              {/each}
              {#if confirmResult.errorDetails.length > 20}
                <p class="text-xs text-red-400">...and {confirmResult.errorDetails.length - 20} more</p>
              {/if}
            </div>
          </div>
        {/if}

        <div class="flex flex-col items-center gap-4 pt-4">
          {#if !publishing}
            <button onclick={publishVersion} class="px-10 py-3.5 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all">
              Publish Timetable
            </button>
          {:else}
            <div class="px-10 py-3.5 bg-green-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest">Published!</div>
          {/if}
          <div class="flex gap-4">
            <a href="/academic-operations/scheduling/sessions" class="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-all">View Sessions</a>
            <a href="/academic-operations/scheduling" class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-all">Back to Overview</a>
          </div>
        </div>
      </div>
    {/if}
  </div>
  {/if}
</div>
