<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import { invalidateAll, goto } from "$app/navigation";
  import AssessmentPaperRenderer from "$lib/components/assessments/AssessmentPaperRenderer.svelte";
  import {
    Layout,
    Layers,
    Palette,
    Component,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    GripVertical,
    Save,
    ChevronLeft,
    Info,
    RotateCcw,
    HelpCircle,
    Type,
    MousePointer2,
    Sparkles,
    Grid,
    Maximize2,
    Maximize,
  } from "lucide-svelte";
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let template = $state(JSON.parse(JSON.stringify(data.template || {})));

  // Robust initialization
  if (!template.layout_schema) template.layout_schema = {};
  if (!template.config) template.config = [];

  let isSaving = $state(false);
  let activeTab = $state("branding"); // branding | design | structure | components
  let previewScale = $state(0.85);

  const TABS = [
    { id: "branding", label: "Identity", icon: Layout },
    { id: "design", label: "Design", icon: Palette },
    { id: "structure", label: "Structure", icon: Layers },
    { id: "components", label: "Library", icon: Component },
  ];

  // Preview Metadata (Stateful for reactivity)
  let previewMeta = $state({
    course_code: "CS101",
    semester: "I",
    subject_name: "Generic Assessment Preview",
    paper_date: "DD/MM/YYYY",
    duration_minutes: 180,
    max_marks: 100,
    programme: "B.Tech (CSE)",
    exam_title: template.name?.toUpperCase() || "ASSESSMENT TITLE",
  });

  $effect(() => {
    previewMeta.exam_title = template.name?.toUpperCase();
  });

  async function saveTemplate() {
    isSaving = true;
    try {
      const resp = await fetch(`/api/assessments/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          exam_type: template.exam_type,
          config: template.config,
          layout_schema: template.layout_schema,
          status: template.status,
          version: template.version + 1, // Auto-increment version on save
        }),
      });

      if (resp.ok) {
        // Success
        invalidateAll();
      } else {
        alert("Failed to save template");
      }
    } catch (e) {
      console.error(e);
      alert("Error saving template");
    } finally {
      isSaving = false;
    }
  }

  function addSection() {
    const nextPart = String.fromCharCode(65 + (template.config?.length || 0));
    template.config = [
      ...(template.config || []),
      {
        part: nextPart,
        title: `PART ${nextPart}`,
        marks_per_q: 2,
        answered_count: 5,
        slots: Array(5).fill({ label: "1", qType: "ANY", marks: 2 }),
      },
    ];
  }

  function removeSection(index: number) {
    template.config = template.config.filter(
      (_: any, i: number) => i !== index,
    );
  }

  function resetTemplate() {
    if (
      confirm(
        "Are you sure you want to start from scratch? This will remove all sections and reset layout settings.",
      )
    ) {
      template.config = [];
      template.layout_schema = {
        style: "standard",
        fontFamily: "serif",
        primaryColor: "#000000",
        showRRN: true,
        showMetadataTable: false,
        watermarkText: "",
        pageMargin: "normal",
        showBorder: false,
      };
    }
  }

  function handleDndConsider(e: CustomEvent<DndEvent<any>>) {
    template.config = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent<DndEvent<any>>) {
    template.config = e.detail.items;
  }

  // Ensure config has IDs for DND
  $effect(() => {
    if (template.config && template.config.length > 0) {
      template.config = template.config.map((s: any, idx: number) => ({
        ...s,
        id: s.id || `section-${idx}-${Date.now()}`,
      }));
    }
  });
</script>

<div class="h-screen flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
  <!-- Header -->
  <header
    class="h-16 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between px-6 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20"
  >
    <div class="flex items-center gap-4">
      <button
        onclick={() => history.back()}
        class="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-2xl transition-all group"
        title="Go Back"
      >
        <ChevronLeft
          class="w-5 h-5 text-gray-500 group-hover:text-indigo-600 transition-colors"
        />
      </button>
      <div>
        <h1
          class="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white flex items-center gap-2"
        >
          <div class="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
          Design Studio
        </h1>
        <p
          class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"
        >
          <Sparkles class="w-2.5 h-2.5 text-indigo-400" />
          {template.name} • v{template.version}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <button
        onclick={resetTemplate}
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
      >
        <RotateCcw class="w-3.5 h-3.5" />
        Start Fresh
      </button>

      <div class="h-8 w-[1px] bg-gray-100 dark:bg-slate-800 mx-1"></div>

      <select
        bind:value={template.status}
        class="bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-[10px] font-black uppercase px-4 py-2.5 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer shadow-inner"
      >
        <option value="draft">Drafting</option>
        <option value="published">Live</option>
        <option value="archived">Archived</option>
      </select>

      <button
        onclick={saveTemplate}
        disabled={isSaving}
        class="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all flex items-center gap-2 active:scale-95"
      >
        {#if isSaving}
          <div
            class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
          ></div>
        {:else}
          <Save class="w-3.5 h-3.5" />
        {/if}
        {isSaving ? "Saving..." : "Push Changes"}
      </button>
    </div>
  </header>

  <!-- Main View -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Sidebar / Controls -->
    <aside
      class="w-[400px] border-r border-gray-100 dark:border-slate-800 flex flex-col shrink-0 bg-gray-50/50 dark:bg-slate-900/50 overflow-hidden"
    >
      <!-- Tabs -->
      <div
        class="flex p-3 gap-1.5 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        {#each TABS as tab}
          <button
            onclick={() => (activeTab = tab.id)}
            class="flex-1 py-2.5 px-2 flex flex-col items-center gap-1.5 rounded-2xl transition-all {activeTab ===
            tab.id
              ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 shadow-sm border border-indigo-100 dark:border-indigo-800'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800'}"
          >
            <tab.icon class="w-4 h-4" />
            <span class="text-[8px] font-black uppercase tracking-[0.1em]"
              >{tab.label}</span
            >
          </button>
        {/each}
      </div>

      <!-- Tab Content -->
      <div class="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
        {#if activeTab === "branding"}
          <div in:fade={{ duration: 200 }} class="space-y-6">
            <header>
              <h3
                class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.15em]"
              >
                University Identity
              </h3>
              <p
                class="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1"
              >
                Configure the official branding for your assessment paper.
              </p>
            </header>

            <div class="space-y-5">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label
                    for="univ-name"
                    class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2"
                  >
                    University Name
                    <button
                      class="text-slate-400 hover:text-indigo-500 transition-colors"
                      title="The primary name of the institution"
                    >
                      <HelpCircle class="w-3 h-3" />
                    </button>
                  </label>
                </div>
                <input
                  id="univ-name"
                  bind:value={template.layout_schema.universityName}
                  placeholder="e.g. HARVARD UNIVERSITY"
                  class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                />
              </div>

              <div class="space-y-2">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2"
                >
                  Sub-Header / Tagline
                  <button
                    class="text-slate-400 hover:text-indigo-500 transition-colors"
                    title="Additional info like '(Deemed to be University)'"
                  >
                    <HelpCircle class="w-3 h-3" />
                  </button>
                </label>
                <input
                  bind:value={template.layout_schema.universitySubName}
                  placeholder="e.g. (ESTABLISHED UNDER ACT...)"
                  class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                />
              </div>

              <div class="space-y-2">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2"
                >
                  Campus Address
                </label>
                <input
                  bind:value={template.layout_schema.universityAddress}
                  placeholder="e.g. Vandalur, Kelambakam Crescent"
                  class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                />
              </div>
              <div class="space-y-2">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2"
                >
                  Branding Logo
                </label>
                <div class="flex gap-3">
                  <div class="flex-1 relative group">
                    <input
                      bind:value={template.layout_schema.logoUrl}
                      placeholder="e.g. /university-logo.png"
                      class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                    />
                    <Layout
                      class="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none group-focus-within:text-indigo-500 transition-colors"
                    />
                  </div>
                  {#if template.layout_schema.logoUrl}
                    <div
                      class="w-[52px] h-[52px] bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-100 dark:border-slate-700 flex items-center justify-center p-2.5 overflow-hidden shrink-0 shadow-sm transition-all hover:scale-105"
                    >
                      <img
                        src={template.layout_schema.logoUrl}
                        class="max-w-full max-h-full object-contain"
                        alt="Logo Preview"
                      />
                    </div>
                  {/if}
                </div>
                <p
                  class="text-[10px] font-medium text-slate-400 dark:text-slate-500 px-1"
                >
                  Tip: Use a transparent PNG logo for best results.
                </p>
              </div>

              <div class="space-y-2 pt-2">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2"
                >
                  Watermark Text
                  <button
                    class="text-slate-400 hover:text-indigo-500 transition-colors"
                    title="Subtle text displayed behind the assessment content"
                  >
                    <HelpCircle class="w-3 h-3" />
                  </button>
                </label>
                <input
                  bind:value={template.layout_schema.watermarkText}
                  placeholder="e.g. CONFIDENTIAL / DRAFT"
                  class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 pt-4">
                <div
                  class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-[24px] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all group"
                >
                  <div class="flex items-center gap-4">
                    <div
                      class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600"
                    >
                      <Grid class="w-5 h-5" />
                    </div>
                    <div>
                      <p
                        class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                      >
                        Metadata Grid
                      </p>
                      <p
                        class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                      >
                        Boxed table layout for details
                      </p>
                    </div>
                  </div>
                  <label
                    class="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      bind:checked={template.layout_schema.showMetadataTable}
                      class="sr-only peer"
                    />
                    <div
                      class="w-11 h-6 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"
                    ></div>
                  </label>
                </div>

                <div
                  class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-[24px] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all group"
                >
                  <div class="flex items-center gap-4">
                    <div
                      class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-600 dark:text-slate-400"
                    >
                      <Type class="w-5 h-5" />
                    </div>
                    <div>
                      <p
                        class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                      >
                        Roll Number Box
                      </p>
                      <p
                        class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                      >
                        Display RRN entry field
                      </p>
                    </div>
                  </div>
                  <label
                    class="relative inline-flex items-center cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      bind:checked={template.layout_schema.showRRN}
                      class="sr-only peer"
                    />
                    <div
                      class="w-11 h-6 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"
                    ></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        {:else if activeTab === "design"}
          <div in:fade={{ duration: 200 }} class="space-y-8">
            <header>
              <h3
                class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.15em]"
              >
                Global Aesthetics
              </h3>
              <p
                class="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1"
              >
                Refine the visual tone and spacing of the document.
              </p>
            </header>

            <div class="space-y-6">
              <div class="space-y-3">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                  >Primary Accent Color</label
                >
                <div
                  class="flex items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:border-indigo-100 dark:hover:border-indigo-900/30"
                >
                  <div class="relative w-12 h-12 shrink-0">
                    <input
                      type="color"
                      bind:value={template.layout_schema.primaryColor}
                      class="absolute inset-0 w-full h-full rounded-2xl border-none p-0 cursor-pointer overflow-hidden"
                      style="background-color: {template.layout_schema
                        .primaryColor}"
                    />
                  </div>
                  <div class="flex-1">
                    <input
                      type="text"
                      bind:value={template.layout_schema.primaryColor}
                      class="w-full bg-transparent border-none text-sm font-black uppercase outline-none text-slate-900 dark:text-white"
                    />
                    <p
                      class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight"
                    >
                      Hex Code
                    </p>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                  >Typography Pair</label
                >
                <div class="grid grid-cols-2 gap-3">
                  <button
                    onclick={() =>
                      (template.layout_schema.fontFamily = "serif")}
                    class="group p-4 rounded-[28px] border-2 transition-all flex flex-col items-center gap-2 {template
                      .layout_schema.fontFamily === 'serif'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : 'border-slate-50 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-sm'}"
                  >
                    <div
                      class="w-10 h-10 rounded-full flex items-center justify-center text-xl font-serif {template
                        .layout_schema.fontFamily === 'serif'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}"
                    >
                      Aa
                    </div>
                    <p
                      class="text-[10px] font-black uppercase tracking-tight {template
                        .layout_schema.fontFamily === 'serif'
                        ? 'text-indigo-600'
                        : 'text-slate-500'}"
                    >
                      Classic Serif
                    </p>
                  </button>
                  <button
                    onclick={() =>
                      (template.layout_schema.fontFamily = "sans-serif")}
                    class="group p-4 rounded-[28px] border-2 transition-all flex flex-col items-center gap-2 {template
                      .layout_schema.fontFamily === 'sans-serif'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : 'border-slate-50 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-sm'}"
                  >
                    <div
                      class="w-10 h-10 rounded-full flex items-center justify-center text-xl font-sans {template
                        .layout_schema.fontFamily === 'sans-serif'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}"
                    >
                      Aa
                    </div>
                    <p
                      class="text-[10px] font-black uppercase tracking-tight {template
                        .layout_schema.fontFamily === 'sans-serif'
                        ? 'text-indigo-600'
                        : 'text-slate-500'}"
                    >
                      Modern Sans
                    </p>
                  </button>
                </div>
              </div>
            </div>

            <div
              class="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800"
            >
              <div class="space-y-3">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                  >Page Margins</label
                >
                <div
                  class="flex p-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700"
                >
                  {#each ["narrow", "normal", "wide"] as margin}
                    <button
                      onclick={() =>
                        (template.layout_schema.pageMargin = margin)}
                      class="flex-1 py-2 text-[9px] font-black uppercase rounded-xl transition-all {template
                        .layout_schema.pageMargin === margin
                        ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}"
                    >
                      {margin}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-3">
                <label
                  class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                  >Preview Scale</label
                >
                <div class="flex items-center gap-4">
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    bind:value={previewScale}
                    class="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 shadow-inner"
                  />
                  <span class="text-[10px] font-black text-slate-400 w-8"
                    >{Math.round(previewScale * 100)}%</span
                  >
                </div>
              </div>

              <div
                class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-[28px] border border-slate-100 dark:border-slate-700 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-600 dark:text-slate-400"
                  >
                    <Maximize2 class="w-5 h-5" />
                  </div>
                  <div>
                    <p
                      class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                    >
                      Page Border
                    </p>
                    <p
                      class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      Decorative theme outline
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={template.layout_schema.showBorder}
                    class="sr-only peer"
                  />
                  <div
                    class="w-11 h-6 bg-slate-200 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"
                  ></div>
                </label>
              </div>
            </div>

            <div
              class="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800"
            >
              <label
                class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                >Style Preset</label
              >
              <div class="grid grid-cols-1 gap-2.5">
                {#each [{ id: "standard", name: "Modern Clear", desc: "Grid-based minimalist", icon: Layout }, { id: "crescent", name: "Crescent Official", desc: "Boxed metadata & seal", icon: Grid }, { id: "cdu", name: "CDU Academic", desc: "Red labels & centered header", icon: Type }] as style}
                  <button
                    onclick={() => (template.layout_schema.style = style.id)}
                    class="p-4 rounded-[28px] border-2 transition-all text-left flex items-start gap-4 {template
                      .layout_schema.style === style.id
                      ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20'
                      : 'border-slate-50 dark:border-slate-800 bg-white dark:bg-slate-800 hover:border-slate-100 dark:hover:border-slate-700'}"
                  >
                    <div
                      class="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 {template
                        .layout_schema.style === style.id
                        ? 'text-indigo-500'
                        : ''}"
                    >
                      <style.icon class="w-5 h-5" />
                    </div>
                    <div>
                      <p
                        class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                      >
                        {style.name}
                      </p>
                      <p
                        class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                      >
                        {style.desc}
                      </p>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {:else if activeTab === "structure"}
          <div in:fade={{ duration: 200 }} class="space-y-6">
            <header class="flex items-center justify-between">
              <div>
                <h3
                  class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.15em]"
                >
                  Document Structure
                </h3>
                <p
                  class="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1"
                >
                  Organize and reorder your paper sections.
                </p>
              </div>
              <button
                onclick={addSection}
                class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                <Plus class="w-4 h-4" />
                Add Part
              </button>
            </header>

            <div
              class="space-y-5"
              use:dndzone={{ items: template.config, flipDurationMs: 200 }}
              onconsider={handleDndConsider}
              onfinalize={handleDndFinalize}
            >
              {#each template.config || [] as section, idx (section.id)}
                <div
                  class="bg-white dark:bg-slate-800 rounded-[32px] p-5 border-2 border-slate-50 dark:border-slate-800 space-y-5 shadow-sm group hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all relative"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div
                        class="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl transition-colors"
                      >
                        <GripVertical class="w-4 h-4" />
                      </div>
                      <div>
                        <span
                          class="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg uppercase tracking-wider"
                        >
                          Part {section.part}
                        </span>
                      </div>
                    </div>
                    <button
                      onclick={() => removeSection(idx)}
                      class="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-2xl transition-all"
                      title="Remove Section"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>

                  <div class="space-y-2">
                    <label
                      class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-1 tracking-widest"
                      >Section Title</label
                    >
                    <input
                      bind:value={section.title}
                      class="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500/20 rounded-2xl text-xs font-bold px-4 py-3 outline-none transition-all"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-4 pt-2">
                    <div class="space-y-2">
                      <label
                        class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-1 tracking-widest"
                        >Marks per Q</label
                      >
                      <div class="relative">
                        <input
                          type="number"
                          bind:value={section.marks_per_q}
                          class="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500/20 rounded-2xl text-xs font-bold px-4 py-3 outline-none transition-all"
                        />
                        <Type
                          class="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300"
                        />
                      </div>
                    </div>
                    <div class="space-y-2">
                      <label
                        class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-1 tracking-widest"
                        >Answer Limit</label
                      >
                      <div class="relative">
                        <input
                          type="number"
                          bind:value={section.answered_count}
                          class="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500/20 rounded-2xl text-xs font-bold px-4 py-3 outline-none transition-all"
                        />
                        <MousePointer2
                          class="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Slots -->
                  <div
                    class="space-y-4 pt-5 border-t border-slate-50 dark:border-slate-700/50"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <Layers class="w-3.5 h-3.5 text-slate-400" />
                        <span
                          class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]"
                          >Question Slots</span
                        >
                      </div>
                      <button
                        onclick={() => {
                          section.slots = [
                            ...(section.slots || []),
                            {
                              label: String((section.slots?.length || 0) + 1),
                              type: "SINGLE",
                              marks: section.marks_per_q,
                            },
                          ];
                        }}
                        class="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[9px] font-black uppercase rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
                      >
                        + Add Slot
                      </button>
                    </div>
                    <div class="space-y-2">
                      {#each section.slots || [] as slot, sIdx}
                        <div
                          class="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-2xl group/slot relative border border-transparent hover:border-indigo-500/10 transition-all"
                        >
                          <input
                            bind:value={slot.label}
                            class="w-10 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-black text-center outline-none focus:border-indigo-500/30 transition-all py-1.5"
                            placeholder="#"
                          />
                          <select
                            bind:value={slot.type}
                            class="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase px-2 py-1.5 outline-none focus:border-indigo-500/30 transition-all"
                          >
                            <option value="SINGLE">Single</option>
                            <option value="OR_GROUP">OR Pair</option>
                          </select>
                          <select
                            bind:value={slot.target_co}
                            class="flex-1 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase px-2 py-1.5 outline-none focus:border-indigo-500/30 transition-all"
                          >
                            <option value={undefined}>No CO</option>
                            {#each [1, 2, 3, 4, 5, 6] as n}
                              <option value="CO{n}">CO{n}</option>
                            {/each}
                          </select>
                          <input
                            type="number"
                            bind:value={slot.marks}
                            class="w-14 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-black px-2 py-1.5 outline-none focus:border-indigo-500/30 transition-all"
                          />
                          <button
                            onclick={() => {
                              section.slots = section.slots.filter(
                                (_: any, i: number) => i !== sIdx,
                              );
                            }}
                            class="p-1.5 text-slate-300 hover:text-red-500 transition-all"
                          >
                            <Trash2 class="w-3.5 h-3.5" />
                          </button>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else if activeTab === "components"}
          <div in:fade={{ duration: 200 }} class="space-y-8">
            <header>
              <h3
                class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.15em]"
              >
                Element Library
              </h3>
              <p
                class="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1"
              >
                Add pre-configured sections to your canvas.
              </p>
            </header>

            <div class="grid grid-cols-1 gap-4">
              <button
                onclick={resetTemplate}
                class="group p-5 bg-white dark:bg-slate-800 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-red-500/50 hover:bg-red-50/30 dark:hover:bg-red-950/10 transition-all text-left relative overflow-hidden"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"
                  >
                    <RotateCcw class="w-6 h-6" />
                  </div>
                  <div>
                    <p
                      class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                    >
                      Blank Slate
                    </p>
                    <p
                      class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      Reset and start from scratch
                    </p>
                  </div>
                </div>
              </button>

              <button
                onclick={() => {
                  const part = String.fromCharCode(65 + template.config.length);
                  template.config = [
                    ...template.config,
                    {
                      id: crypto.randomUUID(),
                      part,
                      title: `PART ${part} (Short Answers)`,
                      marks_per_q: 2,
                      answered_count: 5,
                      slots: Array(5)
                        .fill(0)
                        .map((_, i) => ({
                          label: String(i + 1),
                          type: "SINGLE",
                          marks: 2,
                        })),
                    },
                  ];
                }}
                class="group p-5 bg-white dark:bg-slate-800 rounded-[32px] border-2 border-slate-50 dark:border-slate-800 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/5 transition-all text-left"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 group-hover:rotate-12 transition-transform"
                  >
                    <Type class="w-6 h-6" />
                  </div>
                  <div>
                    <p
                      class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                    >
                      Quick Shorts
                    </p>
                    <p
                      class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      5 Questions x 2 Marks each
                    </p>
                  </div>
                </div>
              </button>

              <button
                onclick={() => {
                  const part = String.fromCharCode(65 + template.config.length);
                  template.config = [
                    ...template.config,
                    {
                      id: crypto.randomUUID(),
                      part,
                      title: `PART ${part} (Descriptive Questions)`,
                      marks_per_q: 15,
                      answered_count: 3,
                      slots: Array(3)
                        .fill(0)
                        .map((_, i) => ({
                          label: String(i + 1),
                          type: "OR_GROUP",
                          marks: 15,
                        })),
                    },
                  ];
                }}
                class="group p-5 bg-white dark:bg-slate-800 rounded-[32px] border-2 border-slate-50 dark:border-slate-800 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/5 transition-all text-left"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 group-hover:rotate-12 transition-transform"
                  >
                    <Layers class="w-6 h-6" />
                  </div>
                  <div>
                    <p
                      class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                    >
                      Standard Essays
                    </p>
                    <p
                      class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      3 Pairs of 15-Mark OR questions
                    </p>
                  </div>
                </div>
              </button>

              <button
                onclick={() => {
                  const part = String.fromCharCode(65 + template.config.length);
                  template.config = [
                    ...template.config,
                    {
                      id: crypto.randomUUID(),
                      part,
                      title: `SECTION ${part} (Technical)`,
                      marks_per_q: 1,
                      answered_count: 10,
                      slots: Array(10)
                        .fill(0)
                        .map((_, i) => ({
                          label: String(i + 1),
                          type: "SINGLE",
                          marks: 1,
                          qType: "FILL_IN_BLANK",
                        })),
                    },
                  ];
                }}
                class="group p-5 bg-white dark:bg-slate-800 rounded-[32px] border-2 border-slate-50 dark:border-slate-800 hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/5 transition-all text-left"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center text-orange-600 group-hover:rotate-12 transition-transform"
                  >
                    <Maximize class="w-6 h-6" />
                  </div>
                  <div>
                    <p
                      class="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100"
                    >
                      Objective Section
                    </p>
                    <p
                      class="text-[10px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      10 Fill-in-the-blanks (1M each)
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div class="pt-8 border-t border-slate-100 dark:border-slate-800">
              <header class="mb-5">
                <h3
                  class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-[0.15em]"
                >
                  Paper Properties
                </h3>
                <p
                  class="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1"
                >
                  Core settings for this assessment template.
                </p>
              </header>
              <div class="space-y-5">
                <div class="space-y-2">
                  <label
                    class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                    >Template Name</label
                  >
                  <input
                    bind:value={template.name}
                    placeholder="e.g. End Semester V1"
                    class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                  />
                </div>
                <div class="space-y-2">
                  <label
                    class="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider"
                    >Exam Category</label
                  >
                  <select
                    bind:value={template.exam_type}
                    class="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl text-xs font-bold px-4 py-3.5 outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-sm"
                  >
                    <option value="Semester">Semester End Examination</option>
                    <option value="Internal"
                      >Continuous Internal Assessment</option
                    >
                    <option value="Assignment"
                      >Practical / Home Assignment</option
                    >
                  </select>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </aside>

    <main
      class="flex-1 bg-gray-100 dark:bg-slate-950/50 overflow-auto p-12 scroll-smooth"
    >
      <div
        class="max-w-[8.27in] mx-auto shadow-2xl origin-top transition-transform duration-300 ease-out"
        style="transform: scale({previewScale});"
      >
        <AssessmentPaperRenderer
          paperMeta={previewMeta}
          currentSetData={{ questions: [] }}
          paperStructure={template.config}
          layoutSchema={template.layout_schema}
          mode="preview"
        />
      </div>
    </main>
  </div>
</div>

<style>
  :global(.glass) {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
  }
</style>
