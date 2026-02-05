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
  let importMode = $state<"figma">("figma");
  let figmaUrl = $state("");
  let figmaToken = $state("");
  let importName = $state("");
  let importExamType = $state("MID1");
  let importFile = $state<File | null>(null);
  let logoFile = $state<File | null>(null);
  let detectedLayout = $state<any>(null);
  let metadataFields = $state<Record<string, string>>({});

  // V65: Figma selection states
  let figmaPages = $state<any[]>([]);
  let selectedPageId = $state("");
  let selectedFrameId = $state("");
  let isVerifyingFigma = $state(false);
  let isFigmaVerified = $state(false);
  let errorMsg = $state("");
  let previewZoom = $state(0.75);

  // Visibility Controls
  let showLines = $state(true);
  let showText = $state(true);
  let showBackground = $state(true);
  let bgOpacity = $state(0.7);
  let highContrast = $state(false);
  let highFidelityMode = $state(true); // New: True by default as requested
  let showRegions = $state(false); // V15: Debug regions overlay
  let showDiffOverlay = $state(true);

  async function verifyFigma() {
    if (!figmaUrl || !figmaToken) return;
    isVerifyingFigma = true;
    errorMsg = "";
    try {
      const res = await fetch("/api/figma/verify", {
        method: "POST",
        body: JSON.stringify({ url: figmaUrl, token: figmaToken }),
      });
      const data = await res.json();
      if (res.ok) {
        figmaPages = data.pages;
        isFigmaVerified = true;
        if (!importName) importName = data.fileName;
      } else {
        errorMsg = data.message || "Figma verification failed";
      }
    } catch (e: any) {
      errorMsg = "Verification Error: Could not connect to Figma API relay.";
    } finally {
      isVerifyingFigma = false;
    }
  }

  async function startAnalysis() {
    if (!figmaUrl || !figmaToken || !selectedFrameId) return;
    if (!importName) return;

    isAnalyzing = true;
    errorMsg = "";
    const formData = new FormData();

    formData.append("figmaFileUrl", figmaUrl);
    formData.append("figmaAccessToken", figmaToken);
    formData.append("figmaFrameId", selectedFrameId);
    formData.append("name", importName);
    formData.append("exam_type", importExamType);
    formData.append("dryRun", "true");

    try {
      // Step 1: Analysis (Now using the process API with dryRun=true)
      const res = await fetch("/api/assessments/templates/process", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        detectedLayout = data.template.layout_schema;
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
    if (!importName || !detectedLayout) {
      errorMsg = "Missing Required Specification (Name or Analysis)";
      return;
    }

    isAnalyzing = true;
    errorMsg = "";

    // V32/V33: Capture and downscale background image to stay under 512KB limit
    let rawBg = detectedLayout.debugImage || detectedLayout.backgroundImageUrl;
    if (rawBg && rawBg.startsWith("data:")) {
      rawBg = await downscaleImage(rawBg);
    }
    const bgImage = rawBg;
    let bgBlob: Blob | null = null;

    if (bgImage && bgImage.startsWith("data:")) {
      try {
        const parts = bgImage.split(",");
        const mime = parts[0].match(/:(.*?);/)?.[1];
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        bgBlob = new Blob([u8arr], { type: mime || "image/png" });
        console.log(
          `[V32_COMMIT] 🖼️ Converted base64 to binary Blob (${bgBlob.size} bytes)`,
        );
      } catch (e) {
        console.error(
          `[V32_COMMIT] ⚠️ Blob conversion failed, falling back to string:`,
          e,
        );
      }
    }

    const cleanLayout = JSON.parse(JSON.stringify(detectedLayout));
    const recursiveClean = (obj: any) => {
      if (!obj || typeof obj !== "object") return;

      // V30/V32: Strip large base64 strings from JSON to prevent payload overflow
      delete obj.debugImage;
      delete obj.base64;

      if (Array.isArray(obj)) obj.forEach(recursiveClean);
      else Object.values(obj).forEach(recursiveClean);
    };
    recursiveClean(cleanLayout);

    // V32: Payload mapping
    const payload = {
      name: importName,
      exam_type: importExamType,
      university_id: universityId,
      layout: cleanLayout,
      metadata: metadataFields,
    };

    console.log(`[V32_COMMIT] 📤 Request Payload (Optimized):`, {
      ...payload,
      layout: "{stripped}",
    });

    const formData = new FormData();
    formData.append("name", payload.name);
    formData.append("exam_type", payload.exam_type);
    formData.append("universityId", payload.university_id); // Backend expects universityId
    formData.append("university_id", payload.university_id); // Legacy/shared compatibility
    formData.append("layout", JSON.stringify(payload.layout));
    formData.append("metadata", JSON.stringify(payload.metadata));

    // V22/V32: Explicitly pass regions and background if already present in layout
    const regionsToPass =
      payload.layout.regions || payload.layout.pages?.[0]?.elements || [];
    formData.append("regions", JSON.stringify(regionsToPass));

    if (bgBlob) {
      formData.append("backgroundImageUrl", bgBlob, "background.png");
    } else if (bgImage) {
      formData.append("backgroundImageUrl", bgImage);
    }

    if (importFile) formData.append("file", importFile);
    if (importMode === "figma") {
      formData.append("figmaFileUrl", figmaUrl);
      formData.append("figmaAccessToken", figmaToken);
    }

    try {
      const res = await fetch("/api/assessments/templates/process", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      console.log(`[V32_COMMIT] 📥 Response (${res.status}):`, data);

      if (res.ok) {
        if (onImportComplete) {
          onImportComplete({
            ...data.template,
            id: data.templateId || data.template.id,
          });
        }
        step = 3;
      } else {
        errorMsg = `Build Error (${res.status}): ${data.message || "Validation Failed"}${data.detail ? ` (${data.detail})` : ""}`;
      }
    } catch (e: any) {
      console.error("[V12_COMMIT] 🚨 Critical Error:", e);
      errorMsg = `System failure during transmission: ${e.message}`;
    } finally {
      isAnalyzing = false;
    }
  }

  // V33: Downscale large images to stay under 512KB payload limit
  async function downscaleImage(
    dataUrl: string,
    maxWidth = 1600,
  ): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxWidth) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8)); // Use JPEG 0.8 to save space
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function deleteTemplate() {
    if (!detectedLayout?.id) return;
    if (!confirm("Irreversible: Delete this template blueprint?")) return;

    isAnalyzing = true;
    errorMsg = "";

    try {
      console.log(
        `[V12_DELETE] 🗑️ Request: DELETE /api/assessments/templates/${detectedLayout.id}`,
      );
      const res = await fetch(
        `/api/assessments/templates/${detectedLayout.id}`,
        {
          method: "DELETE",
        },
      );

      console.log(`[V12_DELETE] 📥 Response: ${res.status}`);

      if (res.ok || res.status === 204) {
        closeModal();
        if (onImportComplete) onImportComplete(null);
      } else {
        const data = await res.json().catch(() => ({}));
        errorMsg = data.message || `Eradication failed (${res.status}).`;
      }
    } catch (e: any) {
      console.error("[V12_DELETE] 🚨 Error:", e);
      errorMsg = `Transmission failure: ${e.message}`;
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
                  class="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl px-6 py-5 text-xs font-bold text-white outline-none focus:border-indigo-500/50 transition-all cursor-pointer [color-scheme:dark]"
                >
                  <option value="MID1" class="bg-[#1a1a1a] text-white"
                    >MIDTERM 1</option
                  >
                  <option value="MID2" class="bg-[#1a1a1a] text-white"
                    >MIDTERM 2</option
                  >
                  <option value="SEM" class="bg-[#1a1a1a] text-white"
                    >SEMESTER FINAL</option
                  >
                </select>
              </div>

              <div class="space-y-3">
                <label
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >Source Type</label
                >
                <div
                  class="p-1 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center gap-3"
                >
                  <div
                    class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center"
                  >
                    <Layout class="w-4 h-4 text-white" />
                  </div>
                  <span
                    class="text-[10px] font-black uppercase tracking-widest text-white/40"
                    >Figma Design System</span
                  >
                </div>
              </div>

              <div class="space-y-4" transition:slide>
                <div class="space-y-2">
                  <label
                    class="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1"
                    >Figma File URL</label
                  >
                  <input
                    bind:value={figmaUrl}
                    disabled={isFigmaVerified}
                    placeholder="https://figma.com/file/..."
                    class="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-indigo-500/50 transition-all font-mono disabled:opacity-50"
                  />
                </div>
                <div class="space-y-2">
                  <label
                    class="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1"
                    >Access Token</label
                  >
                  <input
                    type="password"
                    bind:value={figmaToken}
                    disabled={isFigmaVerified}
                    placeholder="figd_..."
                    class="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-indigo-500/50 transition-all font-mono disabled:opacity-50"
                  />
                </div>

                {#if !isFigmaVerified}
                  <button
                    onclick={verifyFigma}
                    disabled={isVerifyingFigma || !figmaUrl || !figmaToken}
                    class="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white hover:bg-white/10 transition-all disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {isVerifyingFigma ? "Syncing..." : "Fetch File Info"}
                    <ChevronRight class="w-3 h-3" />
                  </button>
                {:else}
                  <div
                    class="space-y-4 pt-4 border-t border-white/5"
                    transition:slide
                  >
                    <div class="flex items-center justify-between">
                      <span
                        class="text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                        >File Verified</span
                      >
                      <button
                        onclick={() => {
                          isFigmaVerified = false;
                          figmaPages = [];
                        }}
                        class="text-[8px] font-black text-white/20 hover:text-white uppercase"
                        >Reset</button
                      >
                    </div>

                    <div class="space-y-2">
                      <label
                        class="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1"
                        >Select Page</label
                      >
                      <select
                        bind:value={selectedPageId}
                        class="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-indigo-500/50 transition-all [color-scheme:dark]"
                      >
                        <option value="" class="bg-[#1a1a1a] text-white"
                          >Choose Page...</option
                        >
                        {#each figmaPages as page}
                          <option
                            value={page.id}
                            class="bg-[#1a1a1a] text-white">{page.name}</option
                          >
                        {/each}
                      </select>
                    </div>

                    {#if selectedPageId}
                      <div class="space-y-2" transition:slide>
                        <label
                          class="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1"
                          >Select Frame</label
                        >
                        <select
                          bind:value={selectedFrameId}
                          class="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white outline-none focus:border-indigo-500/50 transition-all [color-scheme:dark]"
                        >
                          <option value="" class="bg-[#1a1a1a] text-white"
                            >Choose Frame...</option
                          >
                          {#each figmaPages.find((p) => p.id === selectedPageId)?.frames || [] as frame}
                            <option
                              value={frame.id}
                              class="bg-[#1a1a1a] text-white"
                              >{frame.name}</option
                            >
                          {/each}
                        </select>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              <div class="space-y-3">
                <label
                  for="logo-source"
                  class="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1"
                  >University Logo (Optional)</label
                >
                <div class="relative group">
                  <input
                    id="logo-source"
                    type="file"
                    accept="image/*"
                    onchange={(e) =>
                      (logoFile = e.currentTarget.files?.[0] || null)}
                    class="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div
                    class="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 flex items-center gap-4 transition-all group-hover:bg-white/[0.04]"
                  >
                    <div class="p-2 bg-indigo-500/10 rounded-xl">
                      <Upload class="w-4 h-4 text-indigo-500" />
                    </div>
                    <span
                      class="text-[9px] font-bold text-white/40 uppercase truncate"
                    >
                      {logoFile ? logoFile.name : "Select Logo..."}
                    </span>
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
                      >Detected Header Field</label
                    >
                    <textarea
                      id="header-{el.id}"
                      bind:value={el.value}
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

            <div class="pt-8 border-t border-white/5 space-y-6">
              <h3
                class="text-[10px] font-black text-white/20 uppercase tracking-widest"
              >
                Visibility Settings
              </h3>
              <div class="grid grid-cols-2 gap-2">
                <button
                  onclick={() => (showBackground = !showBackground)}
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 {showBackground
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'bg-white/[0.01] text-white/20'} transition-all"
                >
                  <span class="text-[9px] font-black uppercase">BG Image</span>
                </button>
                <button
                  onclick={() => (showLines = !showLines)}
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 {showLines
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'bg-white/[0.01] text-white/20'} transition-all"
                >
                  <span class="text-[9px] font-black uppercase">Lines</span>
                </button>
                <button
                  onclick={() => (showText = !showText)}
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 {showText
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'bg-white/[0.01] text-white/20'} transition-all"
                >
                  <span class="text-[9px] font-black uppercase">Text</span>
                </button>
                <button
                  onclick={() => {
                    highFidelityMode = !highFidelityMode;
                    showBackground = highFidelityMode;
                    bgOpacity = highFidelityMode ? 0.6 : 0.7;
                  }}
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 {highFidelityMode
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-white/[0.01] text-white/20'} transition-all"
                >
                  <span class="text-[9px] font-black uppercase"
                    >High Fidelity</span
                  >
                </button>
                <button
                  onclick={() => (showRegions = !showRegions)}
                  class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/5 {showRegions
                    ? 'bg-red-500/20 text-red-400 border-red-500/30 shadow-lg shadow-red-500/10'
                    : 'bg-white/[0.01] text-white/20'} transition-all"
                >
                  <SearchCode class="w-3 h-3" />
                  <span class="text-[9px] font-black uppercase"
                    >Show Regions</span
                  >
                </button>
              </div>

              <div class="space-y-2">
                <label
                  for="bg-opacity"
                  class="text-[8px] font-black text-white/10 uppercase tracking-widest ml-1"
                  >Diff Overlay: {Math.round(bgOpacity * 100)}%</label
                >
                <input
                  id="bg-opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  bind:value={bgOpacity}
                  class="w-full accent-indigo-500 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div class="pt-8 border-t border-white/5">
              <h3
                class="text-[10px] font-black text-white/20 uppercase tracking-widest mb-6"
              >
                Structural Nodes
              </h3>
              <div class="space-y-2">
                {#each (detectedLayout?.pages?.[0]?.elements || []).slice(0, 100) as el: any}
                  <div
                    class="px-3 py-2 rounded-lg bg-white/[0.01] border border-white/[0.03] flex items-center justify-between group hover:bg-white/[0.03] transition-all cursor-crosshair"
                  >
                    <div class="flex items-center gap-2">
                      {#if el.type === "field"}<Type
                          class="w-3 h-3 text-indigo-400/40"
                        />{:else if el.type === "text"}<Type
                          class="w-3 h-3 text-white/10"
                        />{:else}<Layout class="w-3 h-3 text-white/10" />{/if}
                      <span
                        class="text-[9px] font-bold text-white/20 uppercase tracking-tight truncate max-w-[140px]"
                        >{el.type === "field"
                          ? el.value
                          : el.type === "text"
                            ? el.content
                            : el.type}</span
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
                backgroundImage={detectedLayout?.debugImage ||
                  detectedLayout?.backgroundImageUrl}
                {showLines}
                {showText}
                {showBackground}
                {bgOpacity}
                {highContrast}
                {showRegions}
                onElementChange={(elId, newContent) => {
                  // V22: Sync both elements and regions for preview
                  if (detectedLayout.regions) {
                    detectedLayout.regions = detectedLayout.regions.map(
                      (r: any) =>
                        r.id === elId
                          ? {
                              ...r,
                              value: newContent,
                              content: newContent,
                              text: newContent,
                            }
                          : r,
                    );
                  }
                  if (detectedLayout.pages?.[0]?.elements) {
                    detectedLayout.pages[0].elements =
                      detectedLayout.pages[0].elements.map((el: any) =>
                        el.id === elId
                          ? {
                              ...el,
                              value: newContent,
                              content: newContent,
                              text: newContent,
                            }
                          : el,
                      );
                  }
                }}
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
              disabled={isAnalyzing || !selectedFrameId || !importName}
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
  select option {
    background-color: #1a1a1a !important;
    color: white !important;
  }
</style>
