<script lang="ts">
  import { fade, fly } from "svelte/transition";

  let calendarFile = $state<File | null>(null);
  let prodFile = $state<File | null>(null);
  let isGenerating = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  let mapping = $state<Record<string, string>>({
    "Web Development-2": "WA2",
    DBMS: "DBMS",
    "Data Structures": "DS",
    "Advanced English": "EA",
    "Numerical Ability": "NA",
    "Large Language Models": "LLM",
    Physics: "Phy",
    Chemistry: "Che",
    Yoga: "Yoga",
    TDP: "TDP",
    HVS: "HVS",
    "Aptitude Skills": "AS",
    "Basic Electronics": "BE",
    IKS: "IKS",
    "Language & Culture": "LA&C",
    "Environmental Studies": "ENV",
    "Indian Constitution": "IC",
    "Logical Ability-E": "LA-E",
    "Engineering Drawing": "ED",
    "Cloud Computing": "CC",
  });

  async function generate() {
    if (!calendarFile || !prodFile) {
      error = "Please upload both Calendar and Prod Sequence files.";
      return;
    }

    isGenerating = true;
    error = null;
    success = false;

    try {
      const formData = new FormData();
      formData.append("calendar_file", calendarFile);
      formData.append("prod_sequence_file", prodFile);
      formData.append(
        "config",
        JSON.stringify({
          subject_mapping: mapping,
          default_niat_assessment_slots: 75,
        }),
      );

      // In a real production setup, this would point to the FastAPI service URL
      // For now, we assume it's proxied through /api/niat-planner or similar
      const response = await fetch("http://localhost:8000/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to generate planner");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `APD_2.0_Generated_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      success = true;
    } catch (e: any) {
      error = e.message;
    } finally {
      isGenerating = false;
    }
  }

  function handleFileChange(event: Event, type: "calendar" | "prod") {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      if (type === "calendar") calendarFile = target.files[0];
      else prodFile = target.files[0];
    }
  }
</script>

<div class="max-w-5xl mx-auto px-6 py-12 space-y-10">
  <div class="space-y-2">
    <h1
      class="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight"
    >
      NIAT Planner
    </h1>
    <p class="text-lg text-gray-500 dark:text-gray-400">
      Automate APD 2.0 generation from Calendar and Prod Sequence workbooks.
    </p>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
    <!-- Upload Section -->
    <div class="space-y-6">
      <div
        class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-gray-100 dark:border-slate-800 shadow-xl shadow-gray-200/50 dark:shadow-none space-y-6"
      >
        <h2
          class="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-200"
        >
          <svg
            class="w-6 h-6 text-indigo-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            ></path></svg
          >
          Upload Inputs
        </h2>

        <div class="space-y-4">
          <div class="space-y-2">
            <label
              for="calendar-upload"
              class="text-sm font-black text-gray-400 uppercase tracking-widest px-1"
              >Calendar Sheet (APD Input)</label
            >
            <label
              class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all group"
            >
              <div class="flex flex-col items-center justify-center pt-5 pb-6">
                {#if calendarFile}
                  <p
                    class="text-sm font-bold text-indigo-600 dark:text-indigo-400"
                  >
                    {calendarFile.name}
                  </p>
                {:else}
                  <svg
                    class="w-8 h-8 text-gray-400 group-hover:text-indigo-500 transition-colors mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    ></path></svg
                  >
                  <p class="text-xs text-gray-500 font-medium">
                    Click to upload .xlsx or .csv
                  </p>
                {/if}
              </div>
              <input
                id="calendar-upload"
                type="file"
                class="hidden"
                accept=".xlsx,.xls,.csv"
                onchange={(e) => handleFileChange(e, "calendar")}
              />
            </label>
          </div>

          <div class="space-y-2">
            <label
              for="prod-upload"
              class="text-sm font-black text-gray-400 uppercase tracking-widest px-1"
              >Prod Sequence Workbook</label
            >
            <label
              class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all group"
            >
              <div class="flex flex-col items-center justify-center pt-5 pb-6">
                {#if prodFile}
                  <p
                    class="text-sm font-bold text-indigo-600 dark:text-indigo-400"
                  >
                    {prodFile.name}
                  </p>
                {:else}
                  <svg
                    class="w-8 h-8 text-gray-400 group-hover:text-indigo-500 transition-colors mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    ></path></svg
                  >
                  <p class="text-xs text-gray-500 font-medium">
                    Click to upload .xlsx
                  </p>
                {/if}
              </div>
              <input
                id="prod-upload"
                type="file"
                class="hidden"
                accept=".xlsx,.xls"
                onchange={(e) => handleFileChange(e, "prod")}
              />
            </label>
          </div>
        </div>

        <button
          onclick={generate}
          disabled={isGenerating || !calendarFile || !prodFile}
          class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          {#if isGenerating}
            <div
              class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></div>
            Generating...
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              ></path></svg
            >
            Generate APD 2.0
          {/if}
        </button>

        {#if error}
          <div
            transition:fade
            class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-2xl text-red-600 dark:text-red-400 text-sm font-bold animate-shake"
          >
            {error}
          </div>
        {/if}

        {#if success}
          <div
            transition:fade
            class="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-2xl text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center gap-2"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              ></path></svg
            >
            Generated Successfully! Check your downloads.
          </div>
        {/if}
      </div>
    </div>

    <!-- Configuration Section -->
    <div class="space-y-6">
      <div
        class="bg-indigo-50 dark:bg-slate-900 rounded-3xl p-8 border border-indigo-100 dark:border-slate-800 shadow-sm space-y-6"
      >
        <h2
          class="text-xl font-bold flex items-center gap-2 text-indigo-900 dark:text-indigo-400"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            ></path><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            ></path></svg
          >
          Subject Mapping
        </h2>

        <p
          class="text-sm text-indigo-700/70 dark:text-indigo-400/70 font-medium leading-relaxed"
        >
          Map Prod Workbook tab names to the subject codes used in your Calendar
          sheet.
        </p>

        <div
          class="h-[460px] overflow-y-auto bg-white dark:bg-slate-800/50 rounded-2xl border border-indigo-100 dark:border-slate-700 p-4 space-y-3 shadow-inner"
        >
          {#each Object.entries(mapping) as [tab, code]}
            <div class="flex items-center gap-3">
              <div
                class="flex-1 bg-gray-50 dark:bg-slate-700 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 truncate"
                title={tab}
              >
                {tab}
              </div>
              <svg
                class="w-4 h-4 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                ></path></svg
              >
              <input
                type="text"
                bind:value={mapping[tab]}
                class="w-24 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 px-3 py-2 rounded-lg text-xs font-black text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-4px);
    }
    75% {
      transform: translateX(4px);
    }
  }
  .animate-shake {
    animation: shake 0.2s ease-in-out 0s 2;
  }
</style>
