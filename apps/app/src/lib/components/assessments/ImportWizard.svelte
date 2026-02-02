<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import {
    Layout,
    X,
    ChevronRight,
    ChevronLeft,
    Upload,
    FileText,
    Zap,
    CheckCircle2,
    AlertCircle,
    ZoomIn,
    ZoomOut,
    Search,
    Type,
    ArrowRight,
  } from "lucide-svelte";
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
        // Clean error message for premium feel
        errorMsg =
          err.message ||
          "We encountered an issue while processing your document layout.";
      }
    } catch (e: any) {
      errorMsg =
        "System Connectivity Error: The layout analysis engine is currently unreachable.";
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
        const data = await res.json();
        onImportComplete(data.template);
        step = 3;
      } else {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        errorMsg = err.message || "Failed to finalize template import.";
      }
    } catch (e: any) {
      errorMsg =
        "Connectivity Error: Failed to save the reconstructed template.";
    } finally {
      isAnalyzing = false;
    }
  }

  function closeModal() {
    show = false;
    step = 1;
    importName = "";
    importFile = null;
    errorMsg = "";
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm transition-all overflow-hidden"
    transition:fade
  >
    <div
      class="bg-[#121212] rounded-[2.5rem] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/5 overflow-hidden animate-premium-slide"
      transition:fly={{ y: 30, duration: 500 }}
    >
      <!-- Standardized Header (Matches Design Studio) -->
      <header
        class="h-20 border-b border-white/5 bg-[#181818] px-8 flex items-center justify-between shrink-0 z-50 shadow-xl"
      >
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              <Zap class="w-5 h-5 text-white" />
            </div>
            <div>
              <h1
                class="text-[13px] font-black uppercase tracking-[0.25em] text-white"
              >
                Import Wizard
              </h1>
              <p
                class="text-[9px] font-bold text-white/30 uppercase tracking-[0.15em] mt-0.5"
              >
                Phase {step} of 3: {step === 1
                  ? "Source Analysis"
                  : step === 2
                    ? "Mesh Review"
                    : "Success"}
              </p>
            </div>
          </div>
        </div>

        <button
          onclick={closeModal}
          class="p-3 hover:bg-white/5 rounded-2xl text-white/20 hover:text-white transition-all active:scale-90"
        >
          <X class="w-5 h-5" />
        </button>
      </header>

      <div class="flex-1 overflow-hidden flex min-h-0 bg-[#0a0a0a]">
        <!-- Sidebar: Premium Glass Properties Panel -->
        <div
          class="w-80 min-w-[320px] border-r border-white/5 p-10 space-y-10 bg-[#121212] overflow-y-auto shrink-0 scrollbar-hide"
        >
          {#if step === 1}
            <div class="space-y-8 animate-premium-fade">
              <div class="space-y-3">
                <label
                  for="import-name"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Blueprint Name</label
                >
                <input
                  id="import-name"
                  type="text"
                  bind:value={importName}
                  placeholder="e.g. Crescent MID EXAM"
                  class="w-full bg-white/[0.03] border border-white/5 rounded-2xl px-6 py-5 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10"
                />
              </div>

              <div class="space-y-3">
                <label
                  for="import-exam-type"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Sequence Mode</label
                >
                <div class="relative group">
                  <select
                    id="import-exam-type"
                    bind:value={importExamType}
                    class="w-full bg-white/[0.03] border border-white/5 rounded-2xl px-6 py-5 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer hover:bg-white/[0.05]"
                  >
                    <option value="MID1">MIDTERM 1</option>
                    <option value="MID2">MIDTERM 2</option>
                    <option value="SEM">SEMESTER FINAL</option>
                  </select>
                  <ChevronRight
                    class="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none transition-transform group-hover:translate-x-1"
                  />
                </div>
              </div>

              <div class="space-y-3">
                <label
                  for="import-file"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Document Source</label
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
                    class="w-full bg-indigo-500/5 border-2 border-dashed border-indigo-500/20 rounded-3xl px-6 py-10 text-center group-hover:border-indigo-500/50 transition-all active:scale-[0.98]"
                  >
                    <Upload
                      class="w-8 h-8 text-indigo-500/40 mx-auto mb-4 group-hover:scale-110 transition-transform"
                    />
                    <span
                      class="text-[10px] font-black text-white/40 uppercase block"
                      >{importFile
                        ? importFile.name
                        : "Drop Document Here"}</span
                    >
                  </div>
                </div>
              </div>
            </div>
          {:else if step === 2}
            <div class="space-y-8 animate-premium-fade">
              <div
                class="p-6 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 shadow-2xl shadow-indigo-500/5"
              >
                <div class="flex items-center gap-3 mb-3">
                  <CheckCircle2 class="w-4 h-4 text-indigo-400" />
                  <h4
                    class="text-[10px] font-black text-indigo-400 uppercase tracking-widest"
                  >
                    Mesh Extracted
                  </h4>
                </div>
                <p
                  class="text-[10px] font-medium text-white/50 leading-relaxed uppercase tracking-wide"
                >
                  Layout nodes detected. review structural dividers and headers.
                </p>
              </div>

              <div class="space-y-4">
                <p
                  class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] ml-1"
                >
                  Reconstructed Nodes
                </p>
                <div class="space-y-2">
                  {#each detectedLayout?.pages?.[0]?.elements?.slice(0, 8) || [] as el}
                    <div
                      class="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5"
                    >
                      <div
                        class="w-8 h-8 rounded-xl bg-black/40 flex items-center justify-center text-white/20"
                      >
                        {#if el.type === "text"}<Type
                            class="w-3.5 h-3.5"
                          />{:else}<Layout class="w-3.5 h-3.5" />{/if}
                      </div>
                      <span
                        class="text-[9px] font-bold text-white/40 uppercase tracking-widest"
                        >{el.type}</span
                      >
                    </div>
                  {/each}
                  {#if (detectedLayout?.pages?.[0]?.elements?.length || 0) > 8}
                    <p
                      class="text-[8px] font-black text-white/10 text-center uppercase py-2"
                    >
                      + {detectedLayout.pages[0].elements.length - 8} more elements
                    </p>
                  {/if}
                </div>
              </div>
            </div>
          {/if}

          {#if errorMsg}
            <div
              class="p-6 rounded-[1.5rem] bg-red-500/10 border border-red-500/20 text-red-100 text-[10px] font-bold uppercase tracking-widest whitespace-pre-wrap break-words animate-premium-fade"
            >
              <div class="flex items-center gap-3 mb-2">
                <AlertCircle class="w-4 h-4 text-red-500" />
                <span class="font-black">Critical Error</span>
              </div>
              {errorMsg}
            </div>
          {/if}
        </div>

        <!-- Main Workspace area -->
        <div
          class="flex-1 bg-[#0a0a0a] flex flex-col items-center justify-start p-8 md:p-16 overflow-x-hidden overflow-y-auto relative scrollbar-hide shadow-inner"
        >
          {#if step === 1}
            <div
              class="w-full max-w-2xl flex flex-col items-center justify-center py-20 text-center space-y-8 animate-premium-fade"
            >
              <div
                class="w-24 h-24 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex items-center justify-center relative group"
              >
                <div
                  class="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                ></div>
                <FileText
                  class="w-10 h-10 text-indigo-500 group-hover:scale-110 transition-transform"
                />
              </div>
              <div>
                <h2
                  class="text-3xl font-black text-white mb-4 uppercase tracking-tighter"
                >
                  Replicate Document
                </h2>
                <p
                  class="text-xs font-medium text-white/30 max-w-md mx-auto leading-relaxed uppercase tracking-widest"
                >
                  Upload a raw university paper. Our high-fidelity
                  reconstruction system will extract the exact layout.
                </p>
              </div>
            </div>
          {:else if step === 2}
            <!-- Floating Zoom Control -->
            <div
              class="absolute top-8 right-8 z-[100] flex items-center gap-1 bg-black/60 backdrop-blur-xl border border-white/5 p-1.5 rounded-2xl shadow-2xl animate-premium-slide-left"
            >
              <button
                onclick={() => (previewZoom = Math.max(0.1, previewZoom - 0.1))}
                class="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"
              >
                <ZoomOut class="w-4 h-4" />
              </button>
              <div class="px-2 text-[10px] font-black font-mono text-white/40">
                {Math.round(previewZoom * 100)}%
              </div>
              <button
                onclick={() => (previewZoom = Math.min(2, previewZoom + 0.1))}
                class="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"
              >
                <ZoomIn class="w-4 h-4" />
              </button>
            </div>

            <div
              class="w-full h-full flex items-start justify-center p-12 overflow-visible"
            >
              <div
                class="relative group shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/5 rounded-sm"
              >
                <div
                  class="absolute inset-0 bg-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
                ></div>
                <div class="p-12 overflow-visible">
                  <LayoutCanvas
                    layout={detectedLayout}
                    zoom={previewZoom}
                    showMargins={true}
                    mode="preview"
                  />
                </div>
              </div>
            </div>
          {:else if step === 3}
            <div
              class="w-full h-full flex flex-col items-center justify-center text-center animate-premium-fade"
            >
              <div
                class="w-32 h-32 rounded-[3.5rem] bg-indigo-600 flex items-center justify-center mb-10 shadow-3xl shadow-indigo-600/30 ring-8 ring-indigo-600/10"
              >
                <CheckCircle2 class="w-16 h-16 text-white" />
              </div>
              <h2
                class="text-4xl font-black text-white mb-4 uppercase tracking-tighter"
              >
                Reconstruction Ready
              </h2>
              <p
                class="text-xs font-medium text-white/30 max-w-md uppercase tracking-[0.2em] leading-relaxed"
              >
                The blueprint has been integrated into your library. You can now
                finalize it in the Design Studio.
              </p>
              <button
                onclick={closeModal}
                class="mt-12 px-12 py-5 bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-indigo-500 hover:text-white transition-all active:scale-95 shadow-2xl shadow-white/5"
              >
                Go to Design Studio
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer Area -->
      <footer
        class="h-24 bg-[#181818] border-t border-white/5 px-10 flex items-center justify-between shrink-0 z-50 shadow-xl"
      >
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5">
            {#each [1, 2, 3] as s}
              <div
                class="h-1 rounded-full transition-all duration-500 {step === s
                  ? 'w-10 bg-indigo-500'
                  : 'w-2 bg-white/10'}"
              ></div>
            {/each}
          </div>
        </div>

        <div class="flex gap-4">
          {#if step < 3}
            <button
              onclick={closeModal}
              class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all"
            >
              Discard Changes
            </button>
            <button
              onclick={step === 1 ? startAnalysis : confirmImport}
              disabled={isAnalyzing ||
                (step === 1 && (!importFile || !importName))}
              class="flex items-center gap-4 px-10 py-4 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-500 disabled:opacity-20 transition-all shadow-xl shadow-indigo-600/20 group"
            >
              <span
                >{isAnalyzing
                  ? "Processing Architecture..."
                  : step === 1
                    ? "Initialize Analysis"
                    : "Commit to Library"}</span
              >
              {#if !isAnalyzing}
                <ArrowRight
                  class="w-4 h-4 transition-transform group-hover:translate-x-1"
                />
              {/if}
            </button>
          {/if}
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  input::placeholder {
    color: rgba(255, 255, 255, 0.1);
  }
</style>
