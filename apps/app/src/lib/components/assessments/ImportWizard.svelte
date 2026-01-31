<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentPaperRenderer from "$lib/components/assessments/AssessmentPaperRenderer.svelte";

  let { show = $bindable(false), universityId, onImportComplete } = $props();

  let step = $state(1); // 1: Upload, 2: Preview & Confirm, 3: Success
  let isAnalyzing = $state(false);
  let importName = $state("");
  let importExamType = $state("MID1");
  let importFile = $state<File | null>(null);
  let detectedLayout = $state<any>(null);
  let errorMsg = $state("");

  async function startAnalysis() {
    if (!importFile || !importName) return;

    isAnalyzing = true;
    errorMsg = "";
    const formData = new FormData();
    formData.append("name", importName);
    formData.append("exam_type", importExamType);
    formData.append("file", importFile);
    formData.append("universityId", universityId);
    formData.append("dryRun", "true"); // Signal that we just want the detection result

    try {
      // For this implementation, we'll reuse the import API but handle a dryRun flag or just use the mock result locally for now since the API is synchronous
      const res = await fetch("/api/assessments/templates/import", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        detectedLayout = data.template.layout_schema;
        step = 2;
      } else {
        const err = await res.json();
        errorMsg = err.message || "Failed to analyze document";
      }
    } catch (e) {
      errorMsg = "A network error occurred.";
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
      const res = await fetch("/api/assessments/templates/import", {
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
    transition:fade
  >
    <div
      class="bg-white dark:bg-[#1a1a1a] rounded-[3rem] w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden"
      transition:fly={{ y: 30, duration: 500 }}
    >
      <!-- Header -->
      <div
        class="px-10 py-8 border-b border-white/5 flex justify-between items-center bg-black/20"
      >
        <div>
          <h3 class="text-2xl font-black text-white uppercase tracking-tighter">
            Import <span class="text-indigo-400">Wizard</span>
          </h3>
          <p
            class="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1"
          >
            Step {step} of 3: {step === 1
              ? "Analyze Document"
              : step === 2
                ? "Verify Layout"
                : "Import Complete"}
          </p>
        </div>
        <button
          onclick={() => (show = false)}
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
        <!-- Sidebar: Info/Settings -->
        <div
          class="w-80 border-r border-white/5 p-10 space-y-8 bg-black/10 overflow-y-auto"
        >
          {#if step === 1}
            <div class="space-y-6">
              <div class="space-y-2">
                <label
                  class="text-[10px] font-black text-indigo-400 uppercase tracking-widest"
                  >Template Name</label
                >
                <input
                  type="text"
                  bind:value={importName}
                  placeholder="e.g. AMET Final Exam"
                  class="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white outline-none focus:border-indigo-500/50"
                />
              </div>
              <div class="space-y-2">
                <label
                  class="text-[10px] font-black text-indigo-400 uppercase tracking-widest"
                  >Exam Type</label
                >
                <select
                  bind:value={importExamType}
                  class="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white outline-none"
                >
                  <option value="MID1">Midterm 1</option>
                  <option value="MID2">Midterm 2</option>
                  <option value="SEM">Semester Exam</option>
                </select>
              </div>
              <div class="space-y-2">
                <label
                  class="text-[10px] font-black text-indigo-400 uppercase tracking-widest"
                  >Source File</label
                >
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onchange={(e) =>
                    (importFile = e.currentTarget.files?.[0] || null)}
                  class="w-full bg-black/30 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white"
                />
              </div>
            </div>
          {:else if step === 2}
            <div class="space-y-6">
              <div
                class="p-4 rounded-3xl bg-green-500/10 border border-green-500/20"
              >
                <h4
                  class="text-[10px] font-black text-green-400 uppercase mb-2"
                >
                  Analysis Successful
                </h4>
                <p
                  class="text-[10px] font-medium text-white/60 leading-relaxed"
                >
                  Our AI has detected the header, tables, and instructions.
                  Review the preview and confirm to create the template.
                </p>
              </div>
              <div class="space-y-2">
                <p
                  class="text-[9px] font-black text-white/30 uppercase tracking-widest"
                >
                  Detected Elements
                </p>
                <ul class="space-y-2">
                  {#each detectedLayout?.pages[0]?.elements || [] as el}
                    <li
                      class="flex items-center gap-3 p-2 rounded-xl bg-white/5"
                    >
                      <div
                        class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[8px] font-black uppercase"
                      >
                        {el.type[0]}
                      </div>
                      <span class="text-[9px] font-bold text-white/60 uppercase"
                        >{el.id}</span
                      >
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          {/if}

          {#if errorMsg}
            <div
              class="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase"
            >
              {errorMsg}
            </div>
          {/if}
        </div>

        <!-- Main Workspace: Preview -->
        <div
          class="flex-1 bg-black/40 flex flex-col items-center justify-center p-10 overflow-hidden"
        >
          {#if step === 1}
            <div class="text-center space-y-6 max-w-md">
              <div
                class="w-24 h-24 bg-indigo-500/10 rounded-[2.5rem] flex items-center justify-center text-indigo-400 mx-auto mb-8"
              >
                <svg
                  class="w-12 h-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  /></svg
                >
              </div>
              <h4
                class="text-xl font-black text-white uppercase tracking-tighter"
              >
                Ready to Analyze
              </h4>
              <p class="text-xs font-medium text-white/40 leading-relaxed">
                Upload a sample question paper or design. Our analyzer will
                identify tables, text blocks, and dynamic slots automatically.
              </p>
            </div>
          {:else if step === 2}
            <div
              class="w-full h-full flex flex-col items-center overflow-hidden"
            >
              <h4
                class="text-[10px] font-black text-white/20 uppercase tracking-widest mb-4"
              >
                Live Analysis Preview
              </h4>
              <div
                class="flex-1 w-full bg-slate-900/50 rounded-[3rem] p-10 overflow-auto scrollbar-hide flex items-center justify-center"
              >
                <div class="scale-[0.6] origin-top bg-white shadow-2xl">
                  <AssessmentPaperRenderer
                    paperMeta={{}}
                    currentSetData={{ questions: [] }}
                    paperStructure={[]}
                    layoutSchema={detectedLayout}
                    mode="preview"
                  />
                </div>
              </div>
            </div>
          {:else if step === 3}
            <div class="text-center space-y-6">
              <div
                class="w-24 h-24 bg-green-500/10 rounded-[2.5rem] flex items-center justify-center text-green-400 mx-auto mb-8"
              >
                <svg
                  class="w-12 h-12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M5 13l4 4L19 7"
                  /></svg
                >
              </div>
              <h4
                class="text-2xl font-black text-white uppercase tracking-tighter"
              >
                SUCCESSFULLY IMPORTED
              </h4>
              <p
                class="text-xs font-medium text-white/40 uppercase tracking-widest"
              >
                Redirecting to template list...
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div
        class="px-10 py-8 border-t border-white/5 bg-black/20 flex justify-end gap-4"
      >
        {#if step === 1}
          <button
            onclick={startAnalysis}
            disabled={isAnalyzing || !importFile || !importName}
            class="px-10 py-4 bg-indigo-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 shadow-xl shadow-indigo-500/20 disabled:opacity-30 transition-all"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Document"}
          </button>
        {:else if step === 2}
          <button
            onclick={() => (step = 1)}
            class="px-8 py-4 bg-white/5 text-white/40 rounded-[1.5rem] text-[10px] font-black uppercase hover:bg-white/10"
          >
            Re-Scan
          </button>
          <button
            onclick={confirmImport}
            disabled={isAnalyzing}
            class="px-10 py-4 bg-green-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-green-500 shadow-xl shadow-green-500/20 transition-all"
          >
            {isAnalyzing ? "Finalizing..." : "Confirm & Create Template"}
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
