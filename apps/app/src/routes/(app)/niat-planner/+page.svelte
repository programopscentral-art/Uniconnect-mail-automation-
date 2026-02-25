<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { importCurriculum, exportCurriculumExcel } from "$lib/niatApi";

  const { data } = $props();

  // State for Import
  let importFile = $state<File | null>(null);
  let importInput = $state<HTMLInputElement>();
  let metadata = $state({
    semester_name: "",
    category: "Full Stack",
    sub_category: "Web Development",
    source_code: "",
    credits: 0,
    uploaded_by: data.user.id,
  });

  let isImporting = $state(false);
  let importSummary = $state<any>(null);
  let error = $state<string | null>(null);
  let success = $state(false);

  // State for Export
  let selectedImportId = $state("");
  let isExporting = $state(false);

  async function handleImport() {
    if (!importFile) return;
    isImporting = true;
    error = null;
    success = false;
    importSummary = null;

    try {
      const result = await importCurriculum(importFile, metadata);
      importSummary = result.summary;
      success = true;
      // Refresh imports list would be nice, but for now we just show success
      // If we want real-time update we'd need invalidateAll()
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
    }
  }

  function clearImport() {
    importFile = null;
    importSummary = null;
    success = false;
  }
</script>

<svelte:head>
  <title>Curriculum Management | UniConnect</title>
</svelte:head>

<div class="p-8 max-w-6xl mx-auto space-y-12 pb-24">
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
        Automated UUID generation & 4-Sheet Content Distribution
      </p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- IMPORT CARD -->
    <div
      class="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl shadow-indigo-500/5 border border-gray-100 dark:border-slate-800 space-y-8"
    >
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
              d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            Import Prod Sequence
          </h2>
          <p class="text-sm text-gray-400 font-bold uppercase tracking-widest">
            Parser v3.0
          </p>
        </div>
      </div>

      <div class="space-y-6">
        <!-- File Dropzone -->
        <div class="relative group">
          <label
            class="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-[2rem] cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all group-hover:border-indigo-500"
          >
            {#if !importFile}
              <div class="flex flex-col items-center justify-center py-6">
                <svg
                  class="w-12 h-12 text-gray-300 group-hover:text-indigo-500 transition-colors mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <p class="text-sm font-bold text-gray-500">
                  Drop Prod Sequence Workbook
                </p>
                <p
                  class="text-[10px] text-gray-400 mt-1 uppercase font-black tracking-widest"
                >
                  .xlsx format only
                </p>
              </div>
            {:else}
              <div
                class="flex flex-col items-center justify-center text-center p-6"
                transition:fade
              >
                <div
                  class="p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl mb-3"
                >
                  <svg
                    class="w-8 h-8 text-emerald-500"
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
                <p
                  class="text-sm font-bold text-emerald-600 dark:text-emerald-400"
                >
                  {importFile.name}
                </p>
                <button
                  onclick={clearImport}
                  class="mt-2 text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                  >Remove File</button
                >
              </div>
            {/if}
            <input
              type="file"
              bind:this={importInput}
              onchange={handleFileChange}
              class="hidden"
              accept=".xlsx"
            />
          </label>
        </div>

        <!-- Metadata Inputs -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Semester Name</label
            >
            <input
              type="text"
              bind:value={metadata.semester_name}
              placeholder="e.g. Semester 2"
              class="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="space-y-1">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Source Code</label
            >
            <input
              type="text"
              bind:value={metadata.source_code}
              placeholder="e.g. CS201"
              class="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="space-y-1">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Category</label
            >
            <input
              type="text"
              bind:value={metadata.category}
              placeholder="e.g. Full Stack"
              class="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="space-y-1">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Sub Category</label
            >
            <input
              type="text"
              bind:value={metadata.sub_category}
              placeholder="e.g. Web Dev"
              class="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div class="col-span-2 space-y-1">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Credits</label
            >
            <input
              type="number"
              bind:value={metadata.credits}
              class="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onclick={handleImport}
          disabled={isImporting || !importFile}
          class="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-slate-800 text-white rounded-[1.5rem] font-bold text-lg shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-3"
        >
          {#if isImporting}
            <div
              class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></div>
            <span>Ingesting Curriculum...</span>
          {:else}
            <span>Ingest & Create UUIDs</span>
          {/if}
        </button>

        {#if success && importSummary}
          <div
            class="p-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-[2rem] space-y-3"
            transition:fly={{ y: 20 }}
          >
            <div
              class="flex items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-widest"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                /></svg
              >
              Import Successful
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div
                class="text-center p-3 bg-white/50 dark:bg-slate-900/50 rounded-2xl"
              >
                <p class="text-lg font-black text-gray-900 dark:text-white">
                  {importSummary.subjects}
                </p>
                <p
                  class="text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                >
                  Courses
                </p>
              </div>
              <div
                class="text-center p-3 bg-white/50 dark:bg-slate-900/50 rounded-2xl"
              >
                <p class="text-lg font-black text-gray-900 dark:text-white">
                  {importSummary.sessions}
                </p>
                <p
                  class="text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                >
                  Slots
                </p>
              </div>
              <div
                class="text-center p-3 bg-white/50 dark:bg-slate-900/50 rounded-2xl"
              >
                <p class="text-lg font-black text-gray-900 dark:text-white">
                  {importSummary.resources}
                </p>
                <p
                  class="text-[10px] text-gray-400 font-bold uppercase tracking-widest"
                >
                  Links
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- EXPORT CARD -->
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
              class="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700 max-h-[300px] overflow-y-auto"
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
</style>
