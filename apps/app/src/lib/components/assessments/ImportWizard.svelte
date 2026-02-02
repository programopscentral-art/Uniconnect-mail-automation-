<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import LayoutCanvas from "$lib/components/assessments/design-studio/LayoutCanvas.svelte";

  let { show = $bindable(false), universityId, onImportComplete } = $props();

  let step = $state(1); // 1: Upload, 2: Preview & Confirm, 3: Success
  let isAnalyzing = $state(false);
  let importName = $state("");
  let importExamType = $state("MID1");
  let importFile = $state<File | null>(null);
  let detectedLayout = $state<any>(null);
  let errorMsg = $state("");
  let previewZoom = $state(0.75);

  async function startAnalysis() {
    if (!importFile || !importName) return;

    isAnalyzing = true;
    errorMsg = "";
    const formData = new FormData();
    formData.append("name", importName);
    formData.append("exam_type", importExamType);
    formData.append("file", importFile);
    formData.append("universityId", universityId);
    formData.append("dryRun", "true");

    try {
      const res = await fetch("/api/assessments/templates/process", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        detectedLayout = data.template.layout_schema;
        step = 2;
      } else {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        errorMsg = `[ERROR ${res.status}] ${err.message || "Analysis Failed"}`;
        if (err.detail) {
          console.error("Analysis Detail:", err.detail);
          errorMsg += `\nDetail: ${err.detail.slice(0, 100)}...`;
        }
      }
    } catch (e: any) {
      errorMsg = `Network Error: ${e.message || "Unknown Connection Issue"}`;
    } finally {
      isAnalyzing = false;
    }
  }

  async function confirmImport() {
    isAnalyzing = true;
    const formData = new FormData();
    formData.append("name", importName);
    formData.append("exam_type", importExamType);
    formData.append("file", importFile!);
    formData.append("universityId", universityId);

    try {
      const res = await fetch("/api/assessments/templates/process", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        step = 3;
        setTimeout(() => {
          show = false;
          if (onImportComplete) onImportComplete();
        }, 2000);
      } else {
        const err = await res.json();
        errorMsg = err.message || "Failed to finalize import";
      }
    } catch (e) {
      errorMsg = "A network error occurred.";
    } finally {
      isAnalyzing = false;
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
    transition:fade
  >
    <div
      class="bg-[#121212] rounded-[3rem] w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden"
      transition:fly={{ y: 30, duration: 500 }}
    >
      <!-- Header -->
      <div
        class="px-12 py-8 border-b border-white/5 flex justify-between items-center bg-black/20"
      >
        <div>
          <h3 class="text-2xl font-black text-white uppercase tracking-tighter">
            Import <span class="text-indigo-400">Wizard</span>
          </h3>
          <p
            class="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1"
          >
            Phase {step} of 3: {step === 1
              ? "Layout Extraction"
              : step === 2
                ? "Bypass / Verification"
                : "Seeding Complete"}
          </p>
        </div>
        <button
          onclick={() => (show = false)}
          aria-label="Close wizard"
          title="Close wizard"
          class="p-4 bg-white/5 rounded-full text-white/40 hover:text-white transition-all"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>

      <div class="flex-1 overflow-hidden flex">
        <!-- Sidebar -->
        <div
          class="w-80 border-r border-white/5 p-10 space-y-8 bg-black/10 overflow-y-auto shrink-0"
        >
          {#if step === 1}
            <div class="space-y-6">
              <div class="space-y-2">
                <label
                  for="import-name"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Template Name</label
                >
                <input
                  id="import-name"
                  type="text"
                  bind:value={importName}
                  placeholder="e.g. Crescent MID EXAM"
                  class="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10"
                />
              </div>
              <div class="space-y-2">
                <label
                  for="import-exam-type"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Exam Type</label
                >
                <select
                  id="import-exam-type"
                  bind:value={importExamType}
                  class="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer hover:bg-[#222]"
                >
                  <option value="MID1" class="bg-[#1a1a1a] py-4"
                    >Midterm 1</option
                  >
                  <option value="MID2" class="bg-[#1a1a1a] py-4"
                    >Midterm 2</option
                  >
                  <option value="SEM" class="bg-[#1a1a1a] py-4"
                    >Semester Exam</option
                  >
                </select>
              </div>
              <div class="space-y-2">
                <label
                  for="import-file"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Source File</label
                >
                <div class="relative group">
                  <input
                    id="import-file"
                    type="file"
                    accept=".pdf,image/*"
                    onchange={(e) =>
                      (importFile = e.currentTarget.files?.[0] || null)}
                    class="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div
                    class="w-full bg-white/5 border-2 border-dashed border-white/10 rounded-2xl px-5 py-8 text-center group-hover:border-indigo-500/50 transition-all"
                  >
                    <span class="text-[10px] font-black text-white/40 uppercase"
                      >{importFile
                        ? importFile.name
                        : "Click to Upload PDF / PNG"}</span
                    >
                  </div>
                  <p
                    class="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-2 text-center"
                  >
                    Supported: PDF, PNG, JPG
                  </p>
                </div>
              </div>
            </div>
          {:else if step === 2}
            <div class="space-y-6 animate-in slide-in-from-left duration-500">
              <div
                class="p-5 rounded-3xl bg-green-500/10 border border-green-500/20 shadow-2xl shadow-green-500/5"
              >
                <h4
                  class="text-[10px] font-black text-green-400 uppercase mb-2 tracking-widest"
                >
                  Analysis Engine Ready
                </h4>
                <p
                  class="text-[10px] font-medium text-white/50 leading-relaxed uppercase tracking-wide"
                >
                  Headers, Tables, and Structural Dividers have been
                  reconstructed from the document mesh.
                </p>
              </div>
              <div class="space-y-4">
                <p
                  class="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] ml-1"
                >
                  Detected Layers
                </p>
                <div class="space-y-2">
                  {#each detectedLayout?.pages?.[0]?.elements || [] as el}
                    <div
                      class="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5"
                    >
                      <div
                        class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[8px] font-black"
                      >
                        {el.type[0].toUpperCase()}
                      </div>
                      <span
                        class="text-[9px] font-bold text-white/40 uppercase tracking-widest"
                        >{el.type}</span
                      >
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          {#if errorMsg}
            <div
              class="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest"
            >
              {errorMsg}
            </div>
          {/if}
        </div>

        <!-- Main Workspace: Centered Preview -->
        <div
          class="flex-1 bg-black/40 flex flex-col items-center justify-start p-16 overflow-auto relative scrollbar-hide"
        >
          {#if step === 1}
            <div
              class="my-auto text-center space-y-8 max-w-md animate-in fade-in zoom-in duration-700"
            >
              <div
                class="w-32 h-32 bg-indigo-500/10 rounded-[2.5rem] flex items-center justify-center text-indigo-400 mx-auto mb-8 shadow-2xl shadow-indigo-500/10 relative"
              >
                <div
                  class="absolute inset-0 border-2 border-indigo-500/20 rounded-[2.5rem] animate-ping opacity-20"
                ></div>
                <svg
                  class="w-16 h-16"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h4
                class="text-2xl font-black text-white uppercase tracking-tighter"
              >
                REPLICATE DOCUMENT
              </h4>
              <p
                class="text-[10px] font-black text-white/20 leading-relaxed uppercase tracking-[0.2em]"
              >
                Upload a raw university paper. Our high-fidelity reconstruction
                system will extract the exact layout.
              </p>
            </div>
          {:else if step === 2}
            <div
              class="w-full flex flex-col items-center min-h-max animate-in fade-in duration-500"
            >
              <div class="flex items-center gap-6 mb-10">
                <div class="h-px w-24 bg-white/5"></div>
              </div>

              <!-- Floating Zoom Controller -->
              <div
                class="mb-6 flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-2 px-4 shadow-2xl backdrop-blur-md"
              >
                <button
                  onclick={() =>
                    (previewZoom = Math.max(0.5, previewZoom - 0.1))}
                  class="p-2 text-white/40 hover:text-indigo-400 transition-all"
                  title="Zoom Out"
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
                      d="M20 12H4"
                    /></svg
                  >
                </button>
                <div
                  class="w-20 text-center text-[10px] font-black text-indigo-400 uppercase tracking-widest"
                >
                  {Math.round(previewZoom * 100)}%
                </div>
                <button
                  onclick={() =>
                    (previewZoom = Math.min(1.5, previewZoom + 0.1))}
                  class="p-2 text-white/40 hover:text-indigo-400 transition-all"
                  title="Zoom In"
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
                      d="M12 4v16m8-8H4"
                    /></svg
                  >
                </button>
                <div class="h-4 w-px bg-white/10 mx-2"></div>
                <button
                  onclick={() => (previewZoom = 0.75)}
                  class="text-[9px] font-black text-white/20 hover:text-white uppercase tracking-tighter px-2"
                >
                  Reset
                </button>
              </div>

              <!-- Mathematical Scaling & Centering -->
              <div
                class="shadow-[0_0_120px_rgba(0,0,0,0.9)] border border-white/5 rounded-sm bg-white relative group shrink-0"
              >
                <div
                  class="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                ></div>
                <div class="p-12 overflow-auto max-h-[60vh] scrollbar-hide">
                  <LayoutCanvas
                    layout={detectedLayout}
                    zoom={previewZoom}
                    showMargins={true}
                    mode="preview"
                  />
                </div>
              </div>

              <div class="h-32 w-full"></div>
            </div>
          {:else if step === 3}
            <div class="my-auto text-center space-y-8">
              <div
                class="w-32 h-32 bg-green-500/10 rounded-full flex items-center justify-center text-green-400 mx-auto mb-8 shadow-2xl shadow-green-500/10"
              >
                <svg
                  class="w-16 h-16"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h4
                class="text-3xl font-black text-white uppercase tracking-tighter"
              >
                RECONSTRUCTION SUCCESSFUL
              </h4>
              <p
                class="text-[10px] font-black text-white/30 uppercase tracking-[0.25em]"
              >
                Template isolated and localized correctly.
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div
        class="px-12 py-10 border-t border-white/5 bg-black/20 flex justify-end gap-6 items-center"
      >
        {#if step === 1}
          <div
            class="mr-auto text-[9px] font-black text-white/10 uppercase tracking-[0.2em]"
          >
            Principal Engineer Pipeline v4.2 (Isolated)
          </div>
          <button
            onclick={startAnalysis}
            disabled={isAnalyzing || !importFile || !importName}
            class="px-12 py-5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 shadow-2xl shadow-indigo-500/20 disabled:opacity-30 transition-all active:scale-95"
          >
            {isAnalyzing ? "Extracting Mesh..." : "Start Analysis"}
          </button>
        {:else if step === 2}
          <button
            onclick={() => (step = 1)}
            class="px-10 py-5 bg-white/5 text-white/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all"
          >
            Back to Input
          </button>
          <button
            onclick={confirmImport}
            disabled={isAnalyzing}
            class="px-12 py-5 bg-green-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-green-500 shadow-2xl shadow-green-500/20 transition-all active:scale-95"
          >
            {isAnalyzing
              ? "Finalizing Isolation..."
              : "Confirm & Seed Template"}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
