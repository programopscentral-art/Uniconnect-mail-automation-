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
    SearchCode,
  } from "lucide-svelte";
  import LayoutCanvas from "$lib/components/assessments/design-studio/LayoutCanvas.svelte";

  let { show = $bindable(false), universityId, onImportComplete } = $props();

  let step = $state(1); // 1: Upload, 2: Preview & Confirm, 3: Success
  let isAnalyzing = $state(false);
  let importName = $state("");
  let importExamType = $state("MID1");
  let importFile = $state<File | null>(null);
  let logoFile = $state<File | null>(null);
  let detectedLayout = $state<any>(null);
  let metadataFields = $state<Record<string, string>>({});
  let errorMsg = $state("");
  let previewZoom = $state(0.75);

  async function startAnalysis() {
    if (!importFile || !importName) return;

    isAnalyzing = true;
    errorMsg = "";
    const formData = new FormData();
    formData.append("file", importFile);

    try {
      // Step 1: Free Internal Analysis
      const res = await fetch("/api/templates/analyze", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        detectedLayout = await res.json();
        metadataFields = detectedLayout.metadata_fields || {};
        step = 2;
      } else {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        errorMsg = err.message || "Free analysis engine encountered an issue.";
      }
    } catch (e: any) {
      errorMsg =
        e.message ||
        "Analysis Error: The engine failed to process the document.";
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
    if (logoFile) formData.append("logo", logoFile);
    formData.append("universityId", universityId);

    // Pass back the edited metadata and layout
    formData.append("metadata", JSON.stringify(metadataFields));
    formData.append("layout", JSON.stringify(detectedLayout));

    try {
      // Internal save route handles database insertion
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
        {#if step === 1}
          <!-- Step 1 Layout: Centered Upload -->
          <div
            class="w-80 border-r border-white/5 p-8 space-y-8 bg-[#121212] overflow-y-auto shrink-0"
          >
            <div class="space-y-6">
              <div class="space-y-3">
                <label
                  for="blueprint-name"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Blueprint Name</label
                >
                <input
                  id="blueprint-name"
                  bind:value={importName}
                  placeholder="e.g. Crescent MID EXAM"
                  class="w-full bg-white/[0.03] border border-white/5 rounded-2xl px-6 py-5 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all placeholder:text-white/10"
                />
              </div>

              <div class="space-y-3">
                <label
                  for="sequence-mode"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Sequence Mode</label
                >
                <select
                  id="sequence-mode"
                  bind:value={importExamType}
                  class="w-full bg-white/[0.03] border border-white/5 rounded-2xl px-6 py-5 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                >
                  <option value="MID1">MIDTERM 1</option>
                  <option value="MID2">MIDTERM 2</option>
                  <option value="SEM">SEMESTER FINAL</option>
                </select>
              </div>

              <div class="space-y-3">
                <label
                  for="doc-source"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Document Source</label
                >
                <div class="relative group">
                  <input
                    id="doc-source"
                    type="file"
                    accept=".pdf,image/*"
                    onchange={(e) =>
                      (importFile = e.currentTarget.files?.[0] || null)}
                    class="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div
                    class="w-full bg-indigo-500/5 border-2 border-dashed border-indigo-500/20 rounded-3xl px-6 py-10 text-center"
                  >
                    <Upload class="w-8 h-8 text-indigo-500/40 mx-auto mb-4" />
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

            {#if errorMsg}
              <div
                class="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase"
              >
                {errorMsg}
              </div>
            {/if}
          </div>

          <div
            class="flex-1 flex flex-col items-center justify-center p-20 text-center space-y-8 animate-premium-fade"
          >
            <div
              class="w-24 h-24 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex items-center justify-center relative group"
            >
              <div
                class="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full opacity-50"
              ></div>
              <FileText class="w-10 h-10 text-indigo-500" />
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
                FREE MONOLITHIC ENGINE. NO BILLING. NO EXTERNAL SERVICES.
              </p>
            </div>
          </div>
        {:else if step === 2}
          <!-- Step 2 Layout: 3-Column Balanced View -->

          <!-- Column 1: Scene Tree / Left Controls -->
          <div
            class="w-80 border-r border-white/5 p-8 space-y-8 bg-[#121212] overflow-y-auto shrink-0 scrollbar-hide"
          >
            <div>
              <h3
                class="text-[10px] font-black text-white/20 uppercase tracking-widest mb-6"
              >
                University Headers
              </h3>
              <div class="space-y-4">
                {#each (detectedLayout?.pages?.[0]?.elements || []).filter((el: any) => el.is_header) as el}
                  <div class="space-y-2">
                    <label
                      for="header-{el.id}"
                      class="text-[8px] font-black text-white/10 uppercase tracking-widest ml-1"
                      >Detected Header</label
                    >
                    <textarea
                      id="header-{el.id}"
                      bind:value={el.content}
                      class="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-indigo-400 outline-none focus:border-indigo-500/50 transition-all resize-none"
                      rows="2"
                    ></textarea>
                  </div>
                {:else}
                  <p
                    class="text-[10px] font-bold text-white/10 uppercase tracking-widest text-center py-4"
                  >
                    No headers detected
                  </p>
                {/each}
              </div>
            </div>

            <div class="pt-8 border-t border-white/5">
              <h3
                class="text-[10px] font-black text-white/20 uppercase tracking-widest mb-6"
              >
                Structural Nodes
              </h3>
              <div class="space-y-2">
                {#each (detectedLayout?.pages?.[0]?.elements || []).slice(0, 50) as el: any}
                  <div
                    class="px-3 py-2 rounded-lg bg-white/[0.01] border border-white/[0.03] flex items-center justify-between group hover:bg-white/[0.03] transition-all"
                  >
                    <div class="flex items-center gap-2">
                      {#if el.type === "text"}<Type
                          class="w-3 h-3 text-indigo-400/40"
                        />{:else}<Layout class="w-3 h-3 text-white/10" />{/if}
                      <span
                        class="text-[9px] font-bold text-white/20 uppercase tracking-tight truncate max-w-[140px]"
                        >{el.type === "text" ? el.content : el.type}</span
                      >
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Column 2: Centered Canvas (Main) -->
          <div
            class="flex-1 bg-black/40 relative overflow-auto p-20 flex items-start justify-center min-w-0 scrollbar-hide"
          >
            <!-- Interactive Preview Wrapper -->
            <div
              class="relative group shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/5 bg-[#1a1a1a]"
              style="transform: scale({previewZoom}); transform-origin: top center;"
            >
              <LayoutCanvas
                layout={detectedLayout}
                zoom={1}
                showMargins={true}
                mode="preview"
                backgroundImage={detectedLayout?.debugImage}
              />
            </div>

            <!-- Floating Zoom Control -->
            <div
              class="fixed bottom-32 right-96 z-[100] flex items-center gap-1 bg-black/60 backdrop-blur-xl border border-white/5 p-1.5 rounded-2xl shadow-2xl"
            >
              <button
                onclick={() => (previewZoom = Math.max(0.1, previewZoom - 0.1))}
                class="p-2 hover:bg-white/5 rounded-xl text-white/40"
              >
                <ZoomOut class="w-4 h-4" />
              </button>
              <div class="px-2 text-[10px] font-black font-mono text-white/40">
                {Math.round(previewZoom * 100)}%
              </div>
              <button
                onclick={() => (previewZoom = Math.min(2, previewZoom + 0.1))}
                class="p-2 hover:bg-white/5 rounded-xl text-white/40"
              >
                <ZoomIn class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Column 3: Properties / Right Controls -->
          <div
            class="w-80 border-l border-white/5 p-8 space-y-8 bg-[#121212] overflow-y-auto shrink-0 scrollbar-hide"
          >
            <h3
              class="text-[10px] font-black text-white/20 uppercase tracking-widest"
            >
              Metadata Tuning
            </h3>
            <div class="space-y-6">
              {#each Object.entries(metadataFields) as [key, value]}
                <div class="space-y-3">
                  <label
                    for="meta-{key}"
                    class="text-[8px] font-black text-white/20 uppercase tracking-widest ml-1"
                    >{key.replace("_", " ")}</label
                  >
                  <input
                    id="meta-{key}"
                    type="text"
                    bind:value={metadataFields[key]}
                    class="w-full bg-white/[0.03] border border-white/5 rounded-xl px-5 py-4 text-xs font-bold text-white focus:border-indigo-500/50 outline-none transition-all"
                  />
                </div>
              {/each}
            </div>
          </div>
        {:else if step === 3}
          <div
            class="flex-1 flex flex-col items-center justify-center text-center animate-premium-fade"
          >
            <div
              class="w-32 h-32 rounded-[3.5rem] bg-indigo-600 flex items-center justify-center mb-10 shadow-3xl shadow-indigo-600/30"
            >
              <CheckCircle2 class="w-16 h-16 text-white" />
            </div>
            <h2
              class="text-4xl font-black text-white mb-4 uppercase tracking-tighter"
            >
              Blueprint Ready
            </h2>
            <p
              class="text-xs font-medium text-white/30 max-w-md uppercase tracking-[0.2em] leading-relaxed"
            >
              The free reconstruction is complete. You can now finalize this
              template in the Design Studio.
            </p>
          </div>
        {/if}
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
