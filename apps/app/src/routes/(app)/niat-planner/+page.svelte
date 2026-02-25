<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { inspectWorkbook, generatePlan } from "$lib/niatApi";

  let calendarFile = $state<File | null>(null);
  let prodFile = $state<File | null>(null);
  let isGenerating = $state(false);
  let isInspectingCalendar = $state(false);
  let isInspectingProd = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  let calendarSheets = $state<string[]>([]);
  let prodSheets = $state<string[]>([]);
  let selectedCalendarSheet = $state<string>("");

  let validationErrors = $state<string[]>([]);
  let validationWarnings = $state<string[]>([]);
  let proceedAnyway = $state(false);

  // Production-safe Config Framework (JSON)
  let config = $state({
    calendar: {
      sheetAutoDetect: true,
      headerAliases: {
        date: ["Date", "Day", "Session Date"],
        subject: ["Subject", "Course", "Module"],
        slot: ["Slot", "Slot No", "Slot Number"],
        topic: ["Topic", "Session Name"],
      },
    },
    prodSequence: {
      slotColumnStrategy: "topic_column_2",
      forwardFillSlots: true,
      allowBlankSlots: true,
    },
    slotRules: {
      practiceGrouping: "by_prod_sequence",
      notes:
        "MCQ Practice I/II and JS Coding Practice may or may not be in same slot; follow prod sequence slot numbering.",
    },
    universityVariations: {
      assessmentSlotsMayVary: true,
    },
    validation: {
      blockOnMissingCriticalColumns: true,
      warnOnUnknownPatterns: true,
    },
  });

  // mapping: Prod Sheet Name -> APD Subject Code
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

  // Track which sheet is selected for which subject code
  // We'll update the mapping based on this
  let subjectToSheet = $state<Record<string, string>>({});

  // Initialize subjectToSheet once sheets are ready or mapping exists
  function syncMapping() {
    const newMapping: Record<string, string> = {};
    Object.entries(subjectToSheet).forEach(([code, sheet]) => {
      if (sheet) newMapping[sheet] = code;
    });
    // If subjectToSheet is empty or missing items, we might need a fallback
    // But for now, let's assume the user picks.
    if (Object.keys(newMapping).length > 0) {
      mapping = newMapping;
    }
  }

  async function generate() {
    validationErrors = [];
    syncMapping();

    if (!calendarFile || !prodFile) {
      validationErrors.push(
        "Please upload both Calendar and Prod Sequence files.",
      );
      return;
    }

    if (calendarFile.name.endsWith(".xlsx") && !selectedCalendarSheet) {
      validationErrors.push(
        "Please select the calendar sheet before generating.",
      );
      return;
    }

    if (validationWarnings.length > 0 && !proceedAnyway) {
      validationErrors.push(
        "Please check 'Proceed anyway' to acknowledge warnings.",
      );
      return;
    }

    isGenerating = true;
    error = null;
    success = false;

    try {
      const blob = await generatePlan(
        calendarFile,
        prodFile,
        selectedCalendarSheet,
        {
          ...config,
          subjectMapping: mapping,
        },
      );

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NIAT_Planner_Output_${new Date().toISOString().split("T")[0]}.xlsx`;
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

  async function handleFileChange(event: Event, type: "calendar" | "prod") {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      if (type === "calendar") {
        calendarFile = file;
        validationErrors = [];
        validationWarnings = [];
        proceedAnyway = false;
        await inspectCalendar(file);
      } else {
        prodFile = file;
        await inspectProd(file);
      }
    }
  }

  async function inspectCalendar(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      calendarSheets = [];
      selectedCalendarSheet = "";
      return;
    }

    isInspectingCalendar = true;
    try {
      const data = await inspectWorkbook(file);
      calendarSheets = data.sheets || [];

      if (calendarSheets.length > 0) {
        let found = calendarSheets.find((s) => s === "APD 2.0");
        if (!found) {
          found = calendarSheets.find((s) => s.toUpperCase().includes("APD"));
        }
        selectedCalendarSheet = found || calendarSheets[0];
      }
    } catch (e: any) {
      validationErrors.push(`Failed to inspect calendar: ${e.message}`);
    } finally {
      isInspectingCalendar = false;
    }
  }

  async function inspectProd(file: File) {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      prodSheets = [];
      return;
    }

    isInspectingProd = true;
    try {
      const data = await inspectWorkbook(file);
      prodSheets = data.sheets || [];

      // Auto-initialize subjectToSheet if names match
      const newSubjectToSheet: Record<string, string> = {};
      const subjectCodes = Object.values(mapping);
      const subjectNames = Object.keys(mapping);

      prodSheets.forEach((sheet) => {
        // Check if sheet name exists in our mapping keys (Subject Names)
        if (mapping[sheet]) {
          newSubjectToSheet[mapping[sheet]] = sheet;
        } else {
          // Fuzzy match
          const match = subjectNames.find((n) =>
            sheet.toLowerCase().includes(n.toLowerCase()),
          );
          if (match) {
            newSubjectToSheet[mapping[match]] = sheet;
          }
        }
      });
      subjectToSheet = { ...subjectToSheet, ...newSubjectToSheet };
    } catch (e: any) {
      validationErrors.push(`Failed to inspect prod sequence: ${e.message}`);
    } finally {
      isInspectingProd = false;
    }
  }

  const subjectCodes = [
    { name: "Web Development-2", code: "WA2" },
    { name: "DBMS", code: "DBMS" },
    { name: "Data Structures", code: "DS" },
    { name: "Advanced English", code: "EA" },
    { name: "Numerical Ability", code: "NA" },
    { name: "Large Language Models", code: "LLM" },
    { name: "Physics", code: "Phy" },
    { name: "Chemistry", code: "Che" },
    { name: "Yoga", code: "Yoga" },
    { name: "TDP", code: "TDP" },
    { name: "HVS", code: "HVS" },
    { name: "Aptitude Skills", code: "AS" },
    { name: "Basic Electronics", code: "BE" },
    { name: "IKS", code: "IKS" },
    { name: "Language & Culture", code: "LA&C" },
    { name: "Environmental Studies", code: "ENV" },
    { name: "Indian Constitution", code: "IC" },
    { name: "Logical Ability-E", code: "LA-E" },
    { name: "Engineering Drawing", code: "ED" },
    { name: "Cloud Computing", code: "CC" },
  ];
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
    <!-- Main Form Section -->
    <div class="space-y-6">
      <div
        class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-gray-100 dark:border-slate-800 shadow-xl shadow-gray-200/50 dark:shadow-none space-y-6"
      >
        <div class="flex items-center justify-between">
          <h2
            class="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-200"
          >
            <svg
              class="w-6 h-6 text-indigo-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Upload Inputs
          </h2>
        </div>

        <!-- Validation Dashboard -->
        {#if validationErrors.length > 0 || validationWarnings.length > 0}
          <div
            class="p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 space-y-4"
            transition:fade
          >
            {#if validationErrors.length > 0}
              <div class="space-y-2">
                <p
                  class="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1"
                >
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                      d="M6 18L18 6M6 6l12 12"
                    /></svg
                  >
                  Blocking Errors
                </p>
                <ul class="space-y-1">
                  {#each validationErrors as err}
                    <li
                      class="text-xs text-red-600 dark:text-red-400 font-semibold flex items-start gap-2"
                    >
                      <span
                        class="mt-1.5 w-1 h-1 rounded-full bg-red-400 flex-shrink-0"
                      ></span>
                      {err}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if validationWarnings.length > 0}
              <div class="space-y-2">
                <p
                  class="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1"
                >
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    /></svg
                  >
                  Warnings
                </p>
                <ul class="space-y-1">
                  {#each validationWarnings as warn}
                    <li
                      class="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-start gap-2"
                    >
                      <span
                        class="mt-1.5 w-1 h-1 rounded-full bg-amber-400 flex-shrink-0"
                      ></span>
                      {warn}
                    </li>
                  {/each}
                </ul>
                <label
                  class="flex items-center gap-2 cursor-pointer group mt-2"
                >
                  <input
                    type="checkbox"
                    bind:checked={proceedAnyway}
                    class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span
                    class="text-xs font-bold text-gray-500 group-hover:text-indigo-600 transition-colors"
                    >Proceed anyway</span
                  >
                </label>
              </div>
            {/if}
          </div>
        {/if}

        <div class="space-y-5">
          <!-- Calendar Upload -->
          <div class="space-y-2">
            <label
              for="calendar-upload"
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Calendar Workbook (APD Input)</label
            >
            <div class="relative group">
              <label
                class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all"
              >
                <div
                  class="flex flex-col items-center justify-center pt-5 pb-6"
                >
                  {#if calendarFile}
                    <p
                      class="text-sm font-bold text-indigo-600 dark:text-indigo-400"
                    >
                      {calendarFile.name}
                    </p>
                    {#if calendarSheets.length > 0}
                      <div
                        class="mt-2 w-full px-6"
                        role="presentation"
                        onclick={(e) => e.stopPropagation()}
                      >
                        <label
                          for="cal-sheet"
                          class="text-[9px] font-black text-gray-400 uppercase block mb-1 text-center"
                          >Select Sheet</label
                        >
                        <select
                          id="cal-sheet"
                          bind:value={selectedCalendarSheet}
                          class="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {#each calendarSheets as sheet}
                            <option value={sheet}>{sheet}</option>
                          {/each}
                        </select>
                      </div>
                    {:else if isInspectingCalendar}
                      <div
                        class="mt-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                      >
                        <div
                          class="w-3 h-3 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin"
                        ></div>
                        Analyzing...
                      </div>
                    {/if}
                  {:else}
                    <svg
                      class="w-8 h-8 text-gray-400 group-hover:text-indigo-500 transition-colors mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <p class="text-xs text-gray-500 font-medium">
                      Drop APD Input Excel here
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
              {#if calendarFile}
                <button
                  onclick={() => {
                    calendarFile = null;
                    calendarSheets = [];
                    selectedCalendarSheet = "";
                  }}
                  class="absolute top-2 right-2 p-1.5 bg-red-50 dark:bg-red-900/40 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                  aria-label="Remove calendar file"
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
                      d="M6 18L18 6M6 6l12 12"
                    /></svg
                  >
                </button>
              {/if}
            </div>
          </div>

          <!-- Prod Upload -->
          <div class="space-y-2">
            <label
              for="prod-upload"
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Prod Sequence Workbook</label
            >
            <div class="relative group">
              <label
                class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all"
              >
                <div
                  class="flex flex-col items-center justify-center pt-5 pb-6"
                >
                  {#if prodFile}
                    <p
                      class="text-sm font-bold text-indigo-600 dark:text-indigo-400"
                    >
                      {prodFile.name}
                    </p>
                    {#if prodSheets.length > 0}
                      <div
                        class="mt-2 flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest"
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
                            d="M5 13l4 4L19 7"
                          /></svg
                        >
                        {prodSheets.length} sheets analyzed
                      </div>
                    {:else if isInspectingProd}
                      <div
                        class="mt-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                      >
                        <div
                          class="w-3 h-3 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin"
                        ></div>
                        Analyzing...
                      </div>
                    {/if}
                  {:else}
                    <svg
                      class="w-8 h-8 text-gray-400 group-hover:text-indigo-500 transition-colors mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <p class="text-xs text-gray-500 font-medium">
                      Drop Prod Sequence Workbook here
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
              {#if prodFile}
                <button
                  onclick={() => {
                    prodFile = null;
                    prodSheets = [];
                  }}
                  class="absolute top-2 right-2 p-1.5 bg-red-50 dark:bg-red-900/40 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                  aria-label="Remove prod sequence file"
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
                      d="M6 18L18 6M6 6l12 12"
                    /></svg
                  >
                </button>
              {/if}
            </div>
          </div>
        </div>

        <button
          onclick={generate}
          disabled={isGenerating || !calendarFile || !prodFile}
          class="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-black rounded-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
        >
          {#if isGenerating}
            <div
              class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></div>
            Generating Planner...
          {:else}
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Generate APD 2.0
          {/if}
        </button>

        {#if error}
          <div
            transition:fade
            class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold animate-shake"
          >
            {error}
          </div>
        {/if}

        {#if success}
          <div
            transition:fade
            class="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-2xl text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2"
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
              /></svg
            >
            Generated Successfully! Plan downloaded.
          </div>
        {/if}
      </div>
    </div>

    <!-- Configuration / Mapping Section -->
    <div class="space-y-6">
      <div
        class="bg-indigo-50 dark:bg-slate-900/50 rounded-3xl p-8 border border-indigo-100 dark:border-slate-800 shadow-sm space-y-6"
      >
        <h2
          class="text-xl font-bold flex items-center gap-2 text-indigo-900 dark:text-indigo-400"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
          Subject Mapping
        </h2>
        <p
          class="text-sm text-indigo-700/70 dark:text-indigo-400/70 font-medium leading-relaxed"
        >
          Assign sheets from the Prod Workbook to your subject codes.
        </p>

        <div
          class="h-[520px] overflow-y-auto bg-white/50 dark:bg-slate-800/50 rounded-2xl border border-indigo-100 dark:border-slate-700 p-4 space-y-4 shadow-inner"
        >
          {#each subjectCodes as item}
            <div class="space-y-1">
              <div class="flex items-center justify-between px-1">
                <span
                  class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
                  >{item.name} ({item.code})</span
                >
              </div>
              <div class="flex items-center gap-3">
                <select
                  bind:value={subjectToSheet[item.code]}
                  class="flex-1 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-slate-700 px-3 py-2 rounded-lg text-[11px] font-bold text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">-- No sheet selected --</option>
                  {#each prodSheets as sheet}
                    <option value={sheet}>{sheet}</option>
                  {/each}
                </select>

                <svg
                  class="w-4 h-4 text-indigo-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  /></svg
                >

                <div
                  class="w-16 bg-indigo-50 dark:bg-slate-800 px-2 py-2 rounded-lg text-[10px] font-black text-indigo-600 text-center border border-indigo-100 dark:border-slate-700"
                >
                  {item.code}
                </div>
              </div>
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
