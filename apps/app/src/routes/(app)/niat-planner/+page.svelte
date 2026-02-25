<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import {
    importCurriculum,
    exportCurriculumExcel,
    inspectCurriculum,
  } from "$lib/niatApi";

  const { data } = $props();

  // State Management
  let step = $state<"upload" | "preview" | "success">("upload");
  let importFile = $state<File | null>(null);
  let importInput = $state<HTMLInputElement>();

  let isInspecting = $state(false);
  let isImporting = $state(false);
  let previewSubjects = $state<{ name: string; session_count: number }[]>([]);
  let subjectMetadataMap = $state<Record<string, any>>({});

  let importSummary = $state<any>(null);
  let error = $state<string | null>(null);
  let success = $state(false);

  // State for Export
  let selectedImportId = $state("");
  let isExporting = $state(false);

  async function handleAnalyze() {
    if (!importFile) return;
    isInspecting = true;
    error = null;

    try {
      const result = await inspectCurriculum(importFile);
      previewSubjects = result.subjects;

      // Initialize metadata map with sensible defaults
      const newMap: Record<string, any> = {};
      previewSubjects.forEach((sub) => {
        newMap[sub.name] = {
          semester_name: "Semester 1",
          category: "Full Stack",
          sub_category: "Web Development",
          source_code: "",
          credits: 3,
        };
      });
      subjectMetadataMap = newMap;
      step = "preview";
    } catch (e: any) {
      error = e.message;
    } finally {
      isInspecting = false;
    }
  }

  async function handleConfirmImport() {
    if (!importFile) return;
    isImporting = true;
    error = null;

    try {
      const result = await importCurriculum(
        importFile,
        subjectMetadataMap,
        data.user.id,
      );
      importSummary = result.summary;
      success = true;
      step = "success";
    } catch (e: any) {
      error = e.message;
    } finally {
      isImporting = false;
    }
  }

  async function handleExport() {
    if (!selectedImportId) return;
    isExporting = true;
    error = null;

    try {
      const blob = await exportCurriculumExcel(selectedImportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Curriculum_Export_${selectedImportId.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      error = e.message;
    } finally {
      isExporting = false;
    }
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files?.length) {
      importFile = target.files[0];
      step = "upload";
    }
  }

  function clearImport() {
    importFile = null;
    importSummary = null;
    success = false;
    step = "upload";
    previewSubjects = [];
  }

  // Utility to bulk update a field
  function applyToAll(field: string, value: any) {
    Object.keys(subjectMetadataMap).forEach((key) => {
      subjectMetadataMap[key][field] = value;
    });
  }
</script>

<svelte:head>
  <title>Curriculum Management | UniConnect</title>
</svelte:head>

<div class="p-8 max-w-7xl mx-auto space-y-12 pb-24">
  <!-- Header Section -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <div
          class="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20"
        >
          <svg
            class="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h1
          class="text-4xl font-black text-gray-900 dark:text-white tracking-tight"
        >
          Curriculum <span class="text-indigo-600">Engine</span>
        </h1>
      </div>
      <p class="text-gray-500 dark:text-gray-400 font-medium text-lg ml-1">
        Automated UUID generation & Granular Content Control
      </p>
    </div>
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    <!-- IMPORT WORKFLOW (2/3 width on extra large) -->
    <div
      class="xl:col-span-2 bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl shadow-indigo-500/5 border border-gray-100 dark:border-slate-800 space-y-8 h-fit"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center"
          >
            <svg
              class="w-6 h-6 text-indigo-600 dark:text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Curriculum Ingestion
            </h2>
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest {step ===
                'upload'
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'bg-emerald-100 text-emerald-600'} transition-colors"
              >
                {step.toUpperCase()} Phase
              </span>
            </div>
          </div>
        </div>

        {#if step !== "upload"}
          <button
            onclick={clearImport}
            class="text-xs font-black text-red-500 uppercase tracking-widest hover:bg-red-50 px-4 py-2 rounded-xl transition-colors"
          >
            Reset Ingestor
          </button>
        {/if}
      </div>

      <div class="space-y-6">
        <!-- STEP 1: UPLOAD & ANALYZE -->
        {#if step === "upload"}
          <div transition:fade>
            <label
              class="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-[2rem] cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all group-hover:border-indigo-500"
            >
              {#if !importFile}
                <div class="flex flex-col items-center justify-center py-6">
                  <div class="p-5 bg-indigo-50 rounded-3xl mb-4">
                    <svg
                      class="w-10 h-10 text-indigo-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <p class="text-lg font-bold text-gray-700">
                    Upload Prod Sequence
                  </p>
                  <p
                    class="text-[10px] text-gray-400 mt-2 uppercase font-black tracking-widest"
                  >
                    Drag and drop or click to browse
                  </p>
                </div>
              {:else}
                <div
                  class="flex flex-col items-center justify-center p-6 text-center"
                >
                  <div
                    class="p-5 bg-indigo-600 rounded-3xl mb-4 shadow-xl shadow-indigo-500/40"
                  >
                    <svg
                      class="w-10 h-10 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p class="text-xl font-black text-indigo-600">
                    {importFile.name}
                  </p>
                  <p
                    class="text-xs text-gray-400 font-bold mt-1 uppercase tracking-tighter"
                  >
                    File Ready for Analysis
                  </p>
                </div>
              {/if}
              <input
                type="file"
                onchange={handleFileChange}
                class="hidden"
                accept=".xlsx"
              />
            </label>

            {#if importFile}
              <button
                onclick={handleAnalyze}
                disabled={isInspecting}
                class="w-full mt-6 py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-[1.5rem] font-bold text-lg shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3"
              >
                {#if isInspecting}
                  <div
                    class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  ></div>
                  <span>Analyzing Subjects...</span>
                {:else}
                  <span>Inspect Workbook</span>
                {/if}
              </button>
            {/if}
          </div>
        {/if}

        <!-- STEP 2: PREVIEW & METADATA -->
        {#if step === "preview"}
          <div transition:fly={{ y: 20 }} class="space-y-8">
            <div
              class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800 flex items-start gap-4"
            >
              <div class="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
                <svg
                  class="w-4 h-4 text-amber-600 dark:text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  /></svg
                >
              </div>
              <div class="space-y-1">
                <p class="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Analysis Complete
                </p>
                <p
                  class="text-xs text-amber-800/60 dark:text-amber-400/60 font-medium"
                >
                  We found {previewSubjects.length} subjects. Please define metadata
                  for each before importing.
                </p>
              </div>
            </div>

            <div
              class="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar"
            >
              {#each previewSubjects as sub, i}
                <div
                  class="p-6 bg-gray-50 dark:bg-slate-800/50 rounded-[2rem] border border-gray-100 dark:border-slate-800 space-y-4"
                >
                  <div
                    class="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-4"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black text-xs"
                      >
                        {i + 1}
                      </div>
                      <h3
                        class="text-lg font-black text-gray-900 dark:text-white capitalize"
                      >
                        {sub.name}
                      </h3>
                    </div>
                    <div
                      class="px-3 py-1 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700"
                    >
                      <p
                        class="text-[10px] font-black text-indigo-600 uppercase tracking-widest"
                      >
                        {sub.session_count} Slots Detected
                      </p>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div class="space-y-1">
                      <label
                        class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
                        >Semester</label
                      >
                      <input
                        type="text"
                        bind:value={subjectMetadataMap[sub.name].semester_name}
                        placeholder="Sem 1"
                        class="w-full bg-white dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div class="space-y-1">
                      <label
                        class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
                        >Category</label
                      >
                      <input
                        type="text"
                        bind:value={subjectMetadataMap[sub.name].category}
                        placeholder="Full Stack"
                        class="w-full bg-white dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div class="space-y-1">
                      <label
                        class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
                        >Sub-Cat</label
                      >
                      <input
                        type="text"
                        bind:value={subjectMetadataMap[sub.name].sub_category}
                        placeholder="Node.js"
                        class="w-full bg-white dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div class="space-y-1">
                      <label
                        class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
                        >Code</label
                      >
                      <input
                        type="text"
                        bind:value={subjectMetadataMap[sub.name].source_code}
                        placeholder="CS101"
                        class="w-full bg-white dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div class="space-y-1">
                      <label
                        class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
                        >Credits</label
                      >
                      <input
                        type="number"
                        bind:value={subjectMetadataMap[sub.name].credits}
                        class="w-full bg-white dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <div class="flex flex-col md:flex-row gap-4 pt-4">
              <button
                onclick={handleConfirmImport}
                disabled={isImporting}
                class="flex-1 py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-[1.5rem] font-bold text-lg shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"
              >
                {#if isImporting}
                  <div
                    class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  ></div>
                  <span>Writing to Database...</span>
                {:else}
                  <svg
                    class="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    /></svg
                  >
                  <span>Confirm & Generate UUIDs</span>
                {/if}
              </button>
            </div>
          </div>
        {/if}

        <!-- STEP 3: SUCCESS -->
        {#if step === "success"}
          <div
            transition:fly={{ y: 30 }}
            class="flex flex-col items-center py-12 text-center space-y-6"
          >
            <div
              class="p-8 bg-emerald-100 rounded-[3rem] shadow-inner shadow-emerald-500/20"
            >
              <svg
                class="w-20 h-20 text-emerald-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div class="space-y-2">
              <h3 class="text-4xl font-black text-gray-900 dark:text-white">
                Import Complete
              </h3>
              <p
                class="text-gray-400 font-bold uppercase tracking-widest text-sm"
              >
                Successfully ingested {importSummary?.subjects} courses and {importSummary?.sessions}
                sessions.
              </p>
            </div>
            <div class="grid grid-cols-3 gap-6 w-full max-w-md pt-6">
              <div class="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                <p class="text-2xl font-black text-indigo-600">
                  {importSummary?.subjects}
                </p>
                <p
                  class="text-[9px] font-bold text-gray-400 uppercase tracking-tighter"
                >
                  Subjects
                </p>
              </div>
              <div class="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                <p class="text-2xl font-black text-indigo-600">
                  {importSummary?.sessions}
                </p>
                <p
                  class="text-[9px] font-bold text-gray-400 uppercase tracking-tighter"
                >
                  Slots
                </p>
              </div>
              <div class="p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl">
                <p class="text-2xl font-black text-indigo-600">
                  {importSummary?.resources}
                </p>
                <p
                  class="text-[9px] font-bold text-gray-400 uppercase tracking-tighter"
                >
                  Resources
                </p>
              </div>
            </div>
            <button
              onclick={clearImport}
              class="mt-8 px-12 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
            >
              Initialize New Ingestion
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- EXPORT SIDEBAR (1/3 width) -->
    <div
      class="bg-indigo-50/50 dark:bg-slate-900/50 rounded-[2.5rem] p-8 border border-indigo-100 dark:border-slate-800 flex flex-col justify-between"
    >
      <div class="space-y-8">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm"
          >
            <svg
              class="w-6 h-6 text-indigo-600 dark:text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              Distribution Export
            </h2>
            <p
              class="text-sm text-gray-400 font-bold uppercase tracking-widest"
            >
              XLSX 4-Sheet Protocol
            </p>
          </div>
        </div>

        <div class="space-y-6">
          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Select Import Version</label
            >
            <div
              class="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto custom-scrollbar"
            >
              {#each data.imports as imp}
                <button
                  onclick={() => (selectedImportId = imp.id)}
                  class="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-indigo-50/30 transition-colors {selectedImportId ===
                  imp.id
                    ? 'bg-indigo-50 dark:bg-slate-700/50'
                    : ''}"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-2 h-2 rounded-full {selectedImportId === imp.id
                        ? 'bg-indigo-600'
                        : 'bg-gray-200'}"
                    ></div>
                    <div>
                      <p
                        class="text-sm font-bold text-gray-900 dark:text-white"
                      >
                        {imp.source_filename}
                      </p>
                      <p class="text-[10px] text-gray-400 font-medium">
                        {new Date(imp.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p
                      class="text-[10px] font-black text-indigo-600 uppercase tracking-tighter"
                    >
                      ID: {imp.id.slice(0, 8)}
                    </p>
                  </div>
                </button>
              {:else}
                <div class="p-8 text-center text-gray-400 text-sm italic">
                  No imports found yet.
                </div>
              {/each}
            </div>
          </div>

          <button
            onclick={handleExport}
            disabled={isExporting || !selectedImportId}
            class="w-full py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-slate-800 text-white rounded-[1.5rem] font-bold text-lg shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"
          >
            {#if isExporting}
              <div
                class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
              ></div>
              <span>Packaging Excel...</span>
            {:else}
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                /></svg
              >
              <span>Download 4-Sheet Distro</span>
            {/if}
          </button>
        </div>
      </div>

      <div
        class="mt-8 p-4 bg-indigo-100/30 dark:bg-slate-800/30 rounded-2xl flex items-start gap-3"
      >
        <svg
          class="w-5 h-5 text-indigo-600 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          /></svg
        >
        <p
          class="text-[11px] text-indigo-900/60 dark:text-indigo-400 font-medium leading-relaxed"
        >
          UUIDs are auto-mapped within each import run. Re-ingesting a file will
          generate a fresh version with unique identifiers for all courses and
          sessions.
        </p>
      </div>
    </div>
  </div>

  {#if error}
    <div
      class="fixed bottom-8 right-8 p-4 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 flex items-center gap-3 z-50 animate-bounce-short"
      transition:fade
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        /></svg
      >
      <p class="font-bold text-sm tracking-tight">{error}</p>
    </div>
  {/if}
</div>

<style>
  @keyframes bounce-short {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }
  .animate-bounce-short {
    animation: bounce-short 1s ease-in-out infinite;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
  }
  .dark .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #334155;
  }
</style>
