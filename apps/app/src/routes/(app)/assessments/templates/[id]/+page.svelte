<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import { invalidateAll, goto } from "$app/navigation";
  import AssessmentPaperRenderer from "$lib/components/assessments/AssessmentPaperRenderer.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let template = $state(JSON.parse(JSON.stringify(data.template || {})));

  // Robust initialization
  if (!template.layout_schema) template.layout_schema = {};
  if (!template.config) template.config = [];
  if (!template.config) template.config = [];

  let isSaving = $state(false);
  let activeTab = $state("branding"); // branding | structure | general

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
</script>

<div class="h-screen flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
  <!-- Header -->
  <header
    class="h-16 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between px-6 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20"
  >
    <div class="flex items-center gap-4">
      <button
        onclick={() => history.back()}
        class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all"
        title="Go Back"
      >
        <svg
          class="w-5 h-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <div>
        <h1
          class="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white"
        >
          Template Editor
        </h1>
        <p
          class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest"
        >
          {template.name} • v{template.version}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <select
        bind:value={template.status}
        class="bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-[10px] font-black uppercase px-4 py-2 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
      >
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>

      <button
        onclick={saveTemplate}
        disabled={isSaving}
        class="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2"
      >
        {#if isSaving}
          <div
            class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
          ></div>
        {/if}
        {isSaving ? "Saving..." : "Save Changes"}
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
        class="flex p-2 gap-1 border-b border-gray-100 dark:border-slate-800"
      >
        {#each ["branding", "structure", "general"] as tab}
          <button
            onclick={() => (activeTab = tab)}
            class="flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all {activeTab ===
            tab
              ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}"
          >
            {tab}
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
                <input
                  bind:value={template.layout_schema.logoUrl}
                  placeholder="/crescent-logo.png"
                  class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
              <div
                class="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl"
              >
                <div>
                  <p
                    class="text-xs font-black uppercase text-gray-900 dark:text-white"
                  >
                    Metadata Table
                  </p>
                  <p class="text-[9px] font-bold text-gray-400">
                    Show information in a grid table
                  </p>
                </div>
                <input
                  type="checkbox"
                  bind:checked={template.layout_schema.showMetadataTable}
                  class="w-5 h-5 rounded-md border-gray-100 text-indigo-600 focus:ring-indigo-500/10 transition-all"
                />
              </div>
            </div>
          </div>
        {:else if activeTab === "structure"}
          <div in:fade={{ duration: 200 }} class="space-y-6">
            <div class="flex items-center justify-between">
              <h3
                class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
              >
                Paper Sections
              </h3>
              <button
                onclick={addSection}
                class="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>

            <div class="space-y-4">
              {#each template.config || [] as section, idx}
                <div
                  class="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 space-y-4"
                >
                  <div class="flex items-center justify-between">
                    <span
                      class="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase"
                      >Section {section.part}</span
                    >
                    <button
                      onclick={() => removeSection(idx)}
                      class="text-gray-300 hover:text-red-500 transition-all"
                    >
                      <svg
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        ><path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        /></svg
                      >
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
        {:else if activeTab === "general"}
          <div in:fade={{ duration: 200 }} class="space-y-4">
            <h3
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4"
            >
              General Settings
            </h3>
            <div class="space-y-1.5">
              <label class="text-[9px] font-black text-gray-500 uppercase ml-1"
                >Template Name</label
              >
              <input
                bind:value={template.name}
                class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-[9px] font-black text-gray-500 uppercase ml-1"
                >Exam Type</label
              >
              <select
                bind:value={template.exam_type}
                class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-4 py-3 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
              >
                <option value="Semester">Semester</option>
                <option value="Internal">Internal</option>
                <option value="Assignment">Assignment</option>
                <option value="Quiz">Quiz</option>
              </select>
            </div>
          </div>
        {/if}
      </div>
    </aside>

    <!-- Preview -->
    <main class="flex-1 bg-gray-100 dark:bg-slate-950/50 overflow-auto p-12">
      <div class="max-w-[8.27in] mx-auto shadow-2xl scale-[0.8] origin-top">
        <AssessmentPaperRenderer
          paperMeta={{
            course_code: "CS101",
            semester: "I",
            subject_name: "Generic Assessment Preview",
            paper_date: "DD/MM/YYYY",
            duration_minutes: 180,
            max_marks: 100,
            programme: "B.Tech (CSE)",
            exam_title: template.name.toUpperCase(),
          }}
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
