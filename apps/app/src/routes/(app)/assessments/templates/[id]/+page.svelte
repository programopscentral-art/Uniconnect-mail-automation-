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
    Type,
    Paintbrush,
    Maximize,
    Save,
    ChevronLeft,
  } from "lucide-svelte";
  import { dndzone } from "svelte-dnd-action";
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
          class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
        >
          {template.name} • v{template.version}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div class="h-8 w-[1px] bg-gray-100 dark:bg-slate-800 mx-2"></div>

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
      <div class="flex-1 overflow-y-auto p-6 space-y-8">
        {#if activeTab === "branding"}
          <div in:fade={{ duration: 200 }}>
            <h3
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4"
            >
              University Branding
            </h3>
            <div class="space-y-4">
              <div class="space-y-1.5">
                <span class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >University Name</span
                >
                <input
                  id="univ-name"
                  bind:value={template.layout_schema.universityName}
                  placeholder="CHAITANYA"
                  class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
              <div class="space-y-1.5">
                <span class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Sub-Header</span
                >
                <input
                  bind:value={template.layout_schema.universitySubName}
                  placeholder="(DEEMED TO BE UNIVERSITY)"
                  class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
              <div class="space-y-1.5">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Address / Tagline</label
                >
                <input
                  bind:value={template.layout_schema.universityAddress}
                  class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
              <div class="space-y-1.5">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Logo URL</label
                >
                <div class="flex gap-2">
                  <input
                    bind:value={template.layout_schema.logoUrl}
                    placeholder="/crescent-logo.png"
                    class="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
                  />
                  {#if template.layout_schema.logoUrl}
                    <div
                      class="w-10 h-10 bg-white rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden shrink-0 shadow-sm"
                    >
                      <img
                        src={template.layout_schema.logoUrl}
                        class="max-w-full max-h-full object-contain"
                        alt="Preview"
                      />
                    </div>
                  {/if}
                </div>
              </div>

              <div class="space-y-1.5 pt-2">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Watermark Text</label
                >
                <input
                  bind:value={template.layout_schema.watermarkText}
                  placeholder="CONFIDENTIAL"
                  class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 pt-2">
                <div
                  class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:border-indigo-200 transition-all"
                >
                  <div>
                    <p
                      class="text-xs font-black uppercase text-gray-900 dark:text-white"
                    >
                      Metadata Grid
                    </p>
                    <p
                      class="text-[9px] font-bold text-gray-400 uppercase tracking-tight"
                    >
                      Boxed table for paper info
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    bind:checked={template.layout_schema.showMetadataTable}
                    class="w-5 h-5 rounded-md border-gray-200 text-indigo-600 focus:ring-indigo-500/10 transition-all"
                  />
                </div>

                <div
                  class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm hover:border-indigo-200 transition-all"
                >
                  <div>
                    <p
                      class="text-xs font-black uppercase text-gray-900 dark:text-white"
                    >
                      Roll No Box
                    </p>
                    <p
                      class="text-[9px] font-bold text-gray-400 uppercase tracking-tight"
                    >
                      Display RRN entry field
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    bind:checked={template.layout_schema.showRRN}
                    class="w-5 h-5 rounded-md border-gray-200 text-indigo-600 focus:ring-indigo-500/10 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        {:else if activeTab === "design"}
          <div in:fade={{ duration: 200 }} class="space-y-8">
            <div class="space-y-4">
              <h3
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"
              >
                <Paintbrush class="w-3.5 h-3.5" />
                Visual Styling
              </h3>

              <div class="space-y-1.5 text-left">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Accent Theme Color</label
                >
                <div
                  class="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm"
                >
                  <input
                    type="color"
                    bind:value={template.layout_schema.primaryColor}
                    class="w-10 h-10 rounded-lg border-none bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    bind:value={template.layout_schema.primaryColor}
                    class="flex-1 bg-transparent border-none text-xs font-black uppercase outline-none"
                  />
                </div>
              </div>

              <div class="space-y-1.5 text-left">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Typography</label
                >
                <div class="grid grid-cols-2 gap-2">
                  <button
                    onclick={() =>
                      (template.layout_schema.fontFamily = "serif")}
                    class="p-3 rounded-xl border-2 transition-all text-center {template
                      .layout_schema.fontFamily === 'serif'
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-gray-50 bg-white'}"
                  >
                    <span class="text-sm font-serif decoration-indigo-200"
                      >Aa</span
                    >
                    <p class="text-[8px] font-black uppercase mt-1">Serif</p>
                  </button>
                  <button
                    onclick={() =>
                      (template.layout_schema.fontFamily = "sans-serif")}
                    class="p-3 rounded-xl border-2 transition-all text-center {template
                      .layout_schema.fontFamily === 'sans-serif'
                      ? 'border-indigo-600 bg-indigo-50/50'
                      : 'border-gray-50 bg-white'}"
                  >
                    <span class="text-sm font-sans">Aa</span>
                    <p class="text-[8px] font-black uppercase mt-1">Sans</p>
                  </button>
                </div>
              </div>
            </div>

            <div
              class="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800"
            >
              <h3
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"
              >
                <Maximize class="w-3.5 h-3.5" />
                Layout Settings
              </h3>

              <div class="space-y-1.5 text-left">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Page Margins</label
                >
                <div class="flex gap-1.5">
                  {#each ["narrow", "normal", "wide"] as margin}
                    <button
                      onclick={() =>
                        (template.layout_schema.pageMargin = margin)}
                      class="flex-1 py-2 text-[8px] font-black uppercase rounded-lg border-2 transition-all {template
                        .layout_schema.pageMargin === margin
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600'
                        : 'border-gray-50 bg-white text-gray-400'}"
                    >
                      {margin}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-1.5 text-left">
                <label
                  class="text-[9px] font-black text-gray-500 uppercase ml-1"
                  >Preview Zoom ({Math.round(previewScale * 100)}%)</label
                >
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  bind:value={previewScale}
                  class="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 shadow-inner"
                />
              </div>

              <div
                class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm"
              >
                <div>
                  <p
                    class="text-xs font-black uppercase text-gray-900 dark:text-white"
                  >
                    Page Border
                  </p>
                  <p
                    class="text-[9px] font-bold text-gray-400 uppercase tracking-tight"
                  >
                    Decorative double line
                  </p>
                </div>
                <input
                  type="checkbox"
                  bind:checked={template.layout_schema.showBorder}
                  class="w-5 h-5 rounded-md border-gray-100 text-indigo-600 focus:ring-indigo-500/10 transition-all"
                />
              </div>
            </div>

            <div
              class="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800 text-left"
            >
              <h3
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"
              >
                <Component class="w-3.5 h-3.5" />
                Style Presets
              </h3>
              <div class="grid grid-cols-1 gap-2">
                {#each [{ id: "standard", name: "Modern Clear", desc: "Grid-based minimalist" }, { id: "crescent", name: "Crescent Official", desc: "Boxed metadata & seal" }, { id: "cdu", name: "CDU Academic", desc: "Red labels & centered header" }] as style}
                  <button
                    onclick={() => (template.layout_schema.style = style.id)}
                    class="p-3.5 rounded-2xl border-2 transition-all text-left {template
                      .layout_schema.style === style.id
                      ? 'border-indigo-600 bg-indigo-50/20'
                      : 'border-gray-100 hover:border-gray-200 bg-white'}"
                  >
                    <p class="text-[10px] font-black uppercase">{style.name}</p>
                    <p class="text-[8px] font-bold text-gray-400">
                      {style.desc}
                    </p>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {:else if activeTab === "structure"}
          <div in:fade={{ duration: 200 }} class="space-y-6">
            <div
              class="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800"
            >
              <h3
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
              >
                Canvas Components
              </h3>
              <button
                onclick={addSection}
                class="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
              >
                <Plus class="w-3.5 h-3.5" />
                Add Part
              </button>
            </div>

            <div
              class="space-y-4"
              use:dndzone={{ items: template.config, flipDurationMs: 200 }}
              onconsider={handleDndConsider}
              onfinalize={handleDndFinalize}
            >
              {#each template.config || [] as section, idx (section.id)}
                <div
                  class="bg-white dark:bg-slate-800 rounded-2xl p-4 border-2 border-gray-50 dark:border-slate-800 space-y-4 shadow-sm group hover:border-indigo-100 transition-all relative overflow-hidden"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <div
                        class="cursor-grab active:cursor-grabbing text-gray-300 hover:text-indigo-400 p-1"
                      >
                        <GripVertical class="w-4 h-4" />
                      </div>
                      <span
                        class="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg uppercase"
                      >
                        Part {section.part}
                      </span>
                    </div>
                    <button
                      onclick={() => removeSection(idx)}
                      class="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    bind:value={section.title}
                    class="w-full bg-gray-50 dark:bg-slate-900 border-none rounded-xl text-xs font-bold px-3 py-2 outline-none"
                  />
                  <div
                    class="grid grid-cols-2 gap-3 pb-4 border-b border-gray-100 dark:border-slate-700"
                  >
                    <div class="space-y-1">
                      <label
                        class="text-[8px] font-black text-gray-400 uppercase ml-1"
                        >Marks/Q</label
                      >
                      <input
                        type="number"
                        bind:value={section.marks_per_q}
                        class="w-full bg-gray-50 dark:bg-slate-900 border-none rounded-xl text-xs font-bold px-3 py-2 outline-none"
                      />
                    </div>
                    <div class="space-y-1">
                      <label
                        class="text-[8px] font-black text-gray-400 uppercase ml-1"
                        >Answer Limit</label
                      >
                      <input
                        type="number"
                        bind:value={section.answered_count}
                        class="w-full bg-gray-50 dark:bg-slate-900 border-none rounded-xl text-xs font-bold px-3 py-2 outline-none"
                      />
                    </div>
                  </div>

                  <!-- Slots -->
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span
                        class="text-[8px] font-black text-gray-400 uppercase tracking-widest"
                        >Question Slots</span
                      >
                      <button
                        onclick={() => {
                          section.slots = [
                            ...(section.slots || []),
                            {
                              label: String((section.slots?.length || 0) + 1),
                              qType: "ANY",
                              marks: section.marks_per_q,
                            },
                          ];
                        }}
                        class="text-[8px] font-black text-indigo-600 hover:underline uppercase"
                        >+ Add Slot</button
                      >
                    </div>
                    <div class="space-y-1.5">
                      {#each section.slots || [] as slot, sIdx}
                        <div
                          class="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 p-2 rounded-lg group"
                        >
                          <input
                            bind:value={slot.label}
                            class="w-8 bg-transparent border-none text-[10px] font-black text-center outline-none"
                            placeholder="#"
                          />
                          <select
                            bind:value={slot.type}
                            class="bg-white dark:bg-slate-800 border-none rounded-md text-[8px] font-black uppercase px-2 py-1 outline-none"
                          >
                            <option value="SINGLE">Single</option>
                            <option value="OR_GROUP">OR Pair</option>
                          </select>
                          <select
                            bind:value={slot.target_co}
                            class="flex-1 bg-white dark:bg-slate-800 border-none rounded-md text-[8px] font-black uppercase px-2 py-1 outline-none"
                          >
                            <option value={undefined}>No CO</option>
                            {#each [1, 2, 3, 4, 5, 6] as n}
                              <option value="CO{n}">CO{n}</option>
                            {/each}
                          </select>
                          <input
                            type="number"
                            bind:value={slot.marks}
                            class="w-12 bg-white dark:bg-slate-800 border-none rounded-md text-[10px] font-black px-2 py-1 outline-none"
                          />
                          <button
                            onclick={() => {
                              section.slots = section.slots.filter(
                                (_: any, i: number) => i !== sIdx,
                              );
                            }}
                            class="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all"
                          >
                            <svg
                              class="w-3 h-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2.5"
                                d="M6 18L18 6M6 6l12 12"
                              /></svg
                            >
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
          <div in:fade={{ duration: 200 }} class="space-y-6">
            <h3
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
            >
              Building Library
            </h3>

            <div class="grid grid-cols-1 gap-4">
              <button
                onclick={() => {
                  const part = String.fromCharCode(65 + template.config.length);
                  template.config = [
                    ...template.config,
                    {
                      part,
                      title: `PART ${part} (2M Questions)`,
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
                class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-left"
              >
                <p class="text-xs font-black uppercase">
                  Standard Part A (Short)
                </p>
                <p class="text-[9px] font-bold text-gray-400">
                  5 Questions x 2 Marks each
                </p>
              </button>

              <button
                onclick={() => {
                  const part = String.fromCharCode(65 + template.config.length);
                  template.config = [
                    ...template.config,
                    {
                      part,
                      title: `PART ${part} (Essay-type with choices)`,
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
                class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-left"
              >
                <p class="text-xs font-black uppercase">
                  Standard Part B (Long)
                </p>
                <p class="text-[9px] font-bold text-gray-400">
                  3 Pairs of OR-Questions x 15 Marks each
                </p>
              </button>

              <button
                onclick={() => {
                  const part = String.fromCharCode(65 + template.config.length);
                  template.config = [
                    ...template.config,
                    {
                      part,
                      title: `SECTION ${part} (Fill in the blanks)`,
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
                class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 hover:border-indigo-500 transition-all text-left"
              >
                <p class="text-xs font-black uppercase">
                  Fill in the Blanks Section
                </p>
                <p class="text-[9px] font-bold text-gray-400">
                  10 Questions x 1 Mark each
                </p>
              </button>
            </div>

            <div class="pt-6 border-t border-gray-100 dark:border-slate-800">
              <h3 class="text-[10px] font-black text-gray-400 uppercase mb-4">
                Paper Properties
              </h3>
              <div class="space-y-4">
                <div class="space-y-1.5 text-left">
                  <label
                    class="text-[9px] font-black text-gray-500 uppercase ml-1"
                    >Template Name</label
                  >
                  <input
                    bind:value={template.name}
                    class="w-full bg-white dark:bg-slate-800 border-none rounded-2xl text-xs font-bold px-4 py-3.5 outline-none shadow-sm focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  />
                </div>
                <div class="space-y-1.5 text-left">
                  <label
                    class="text-[9px] font-black text-gray-500 uppercase ml-1"
                    >Exam Category</label
                  >
                  <select
                    bind:value={template.exam_type}
                    class="w-full bg-white dark:bg-slate-800 border-none rounded-2xl text-xs font-bold px-4 py-3.5 outline-none shadow-sm focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  >
                    <option value="Semester">Semester End</option>
                    <option value="Internal">Continuous Assessment</option>
                    <option value="Assignment">Home Assignment</option>
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
