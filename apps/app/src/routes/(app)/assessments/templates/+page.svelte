<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { invalidateAll, goto } from "$app/navigation";
  import AssessmentPaperRenderer from "$lib/components/assessments/AssessmentPaperRenderer.svelte";
  import ImportWizard from "$lib/components/assessments/ImportWizard.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  onMount(() => {
    // Ensure fonts are available for preview
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Outfit:wght@400;700;900&family=Playfair+Display:wght@400;700;900&display=swap";
    document.head.appendChild(link);
  });

  let showImportModal = $state(false);

  function handleUniversityChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const url = new URL(window.location.href);
    url.searchParams.set("universityId", target.value);
    goto(url.toString(), { invalidateAll: true });
  }

  async function cloneTemplate(id: string) {
    if (!confirm("Clone this template?")) return;

    try {
      const res = await fetch(`/api/assessments/templates/${id}/clone`, {
        method: "POST",
      });
      if (res.ok) {
        invalidateAll();
      } else {
        const err = await res.json();
        alert(`Clone failed: ${err.message}`);
      }
    } catch (e) {
      alert("A network error occurred.");
    }
  }

  async function deleteTemplate(id: string) {
    if (
      !confirm(
        "Are you sure you want to delete this template? This cannot be undone.",
      )
    )
      return;

    try {
      const res = await fetch(`/api/assessments/templates?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        invalidateAll();
      }
    } catch (e) {
      alert("Failed to delete template.");
    }
  }

  const activeUniversity = $derived(
    data.universities?.find(
      (u: { id: string }) => u.id === data.selectedUniversityId,
    ),
  );
</script>

<div class="space-y-8 animate-premium-fade">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div>
      <div class="flex items-center gap-3 mb-2">
        <a
          href="/assessments"
          title="Back to Assessments"
          class="p-2 bg-white dark:bg-slate-800 rounded-xl text-gray-400 hover:text-indigo-600 transition-all border border-gray-100 dark:border-slate-800"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            /></svg
          >
        </a>
        <h1
          class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase"
        >
          Assessment <span class="text-indigo-600 dark:text-indigo-400"
            >Templates</span
          >
        </h1>
      </div>
      <p class="text-sm font-medium text-gray-500 dark:text-slate-500 ml-12">
        Manage and isolate your university-specific assessment designs.
      </p>
    </div>

    <div class="flex gap-4">
      <button
        onclick={() => (showImportModal = true)}
        class="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
      >
        <svg
          class="w-5 h-5 mr-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          /></svg
        >
        Import Design
      </button>
    </div>
  </div>

  <!-- University Context -->
  <div
    class="glass p-6 rounded-[2.5rem] flex items-center justify-between border border-white dark:border-slate-800"
  >
    <div class="flex items-center gap-4">
      <div
        class="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-black shadow-lg uppercase"
      >
        {activeUniversity?.name?.[0] || "U"}
      </div>
      <div>
        <h3
          class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight"
        >
          {activeUniversity?.name || "All Universities"}
        </h3>
        <p
          class="text-[9px] font-black text-indigo-500 uppercase tracking-widest"
        >
          Selected Entity
        </p>
      </div>
    </div>

    {#if data.universities.length > 1}
      <div class="flex flex-col gap-1.5 min-w-[240px]">
        <label
          for="uni-select"
          class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
          >Switch University</label
        >
        <select
          id="uni-select"
          value={data.selectedUniversityId}
          onchange={handleUniversityChange}
          class="bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-xl text-xs font-bold px-4 py-2.5 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
        >
          {#each data.universities as uni}
            <option value={uni.id}>{uni.name}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
    {#each data.templates as template}
      <div
        class="glass rounded-[2.5rem] flex flex-col overflow-hidden border border-white dark:border-slate-800 transition-all hover:shadow-2xl hover:shadow-indigo-500/10 group"
      >
        <!-- Preview area (miniaturized renderer or placeholder) -->
        <div
          class="h-48 bg-slate-100 dark:bg-slate-900/50 relative overflow-hidden flex items-center justify-center border-b border-gray-100 dark:border-slate-800"
        >
          <div
            class="scale-[0.25] origin-center opacity-50 group-hover:opacity-100 transition-all"
          >
            <AssessmentPaperRenderer
              paperMeta={{}}
              currentSetData={{ questions: [] }}
              paperStructure={template.config || []}
              layoutSchema={template.layout_schema || {}}
              mode="preview"
            />
          </div>
        </div>

        <div class="p-6 space-y-4">
          <div class="flex justify-between items-start">
            <div>
              <h4
                class="text-md font-black text-gray-900 dark:text-white uppercase tracking-tight"
              >
                {template.name}
              </h4>
              <div class="flex items-center gap-2 mt-1">
                <span
                  class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase rounded-md tracking-widest"
                  >v{template.version}</span
                >
                <span
                  class="px-2 py-0.5 {template.status === 'published'
                    ? 'bg-green-100 text-green-600'
                    : 'bg-amber-100 text-amber-600'} text-[8px] font-black uppercase rounded-md tracking-widest"
                >
                  {template.status}
                </span>
              </div>
            </div>
            <div class="flex gap-1">
              <a
                href="/assessments/templates/{template.id}"
                title="Edit Template"
                class="p-2 bg-white dark:bg-slate-800 rounded-xl text-gray-400 hover:text-indigo-600 border border-gray-100 dark:border-slate-800 transition-all hover:scale-110"
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
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </a>
              <button
                onclick={() => cloneTemplate(template.id)}
                title="Clone Template"
                class="p-2 bg-white dark:bg-slate-800 rounded-xl text-gray-400 hover:text-blue-500 border border-gray-100 dark:border-slate-800 transition-all hover:scale-110"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                  /></svg
                >
              </button>
              <button
                onclick={() => deleteTemplate(template.id)}
                title="Delete Template"
                class="p-2 bg-white dark:bg-slate-800 rounded-xl text-gray-400 hover:text-red-500 border border-gray-100 dark:border-slate-800 transition-all hover:scale-110"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"
                  /></svg
                >
              </button>
            </div>
          </div>

          <div
            class="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-widest"
          >
            <span>{template.exam_type}</span>
            <span>{new Date(template.updated_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    {:else}
      <div
        class="col-span-full py-20 flex flex-col items-center justify-center text-center glass rounded-[3rem] opacity-50 border border-dashed border-gray-300"
      >
        <svg
          class="w-16 h-16 text-gray-300 mb-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          /></svg
        >
        <h3 class="text-xl font-black text-gray-900 dark:text-white uppercase">
          No templates found
        </h3>
        <p
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2"
        >
          Import a design to get started
        </p>
      </div>
    {/each}
  </div>
</div>

<ImportWizard
  bind:show={showImportModal}
  universityId={data.selectedUniversityId}
/>

<style>
  :global(.glass) {
    @apply bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl;
  }
</style>
