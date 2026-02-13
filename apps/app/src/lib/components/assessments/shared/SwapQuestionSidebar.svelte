<script lang="ts">
  import { slide, fade } from "svelte/transition";

  let {
    isOpen = $bindable(false),
    onClose = null,
    onSelect,
    questionPool = [],
    currentMark = 0,
    currentQuestionId = null,
  } = $props();

  let searchQuery = $state("");
  let selectedType = $state<string | null>(null);
  let showAllMarks = $state(false);

  const availableTypes = $derived(
    Array.from(new Set(questionPool.map((q) => q.type).filter(Boolean))).sort(),
  );

  const filteredQuestions = $derived.by(() => {
    let list = (questionPool || []).filter((q) => q.id !== currentQuestionId);

    // Initial Filter: Match Marks (unless showAllMarks is true)
    if (!showAllMarks) {
      list = list.filter((q) => Number(q.marks || q.mark) === currentMark);
    }

    // Secondary Filter: Question Type
    if (selectedType) {
      list = list.filter((q) => q.type === selectedType);
    }

    // Tertiary Filter: Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((qObj) =>
        (qObj.question_text || qObj.text || "").toLowerCase().includes(q),
      );
    }

    return list;
  });
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] no-print"
    role="none"
    onclick={() => {
      isOpen = false;
      if (onClose) onClose();
    }}
    transition:fade={{ duration: 200 }}
  ></div>

  <div
    transition:slide={{ axis: "x" }}
    class="fixed right-0 top-0 bottom-0 w-[450px] bg-white dark:bg-slate-950 border-l border-gray-200 dark:border-slate-800 shadow-2xl overflow-hidden no-print z-[210] flex flex-col"
  >
    <!-- Header -->
    <div
      class="p-6 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-10"
    >
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3
            class="font-black text-gray-900 dark:text-white uppercase tracking-tight text-lg"
          >
            Swap Question
          </h3>
          <p
            class="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] mt-0.5"
          >
            Original: {currentMark} Marks
          </p>
        </div>
        <button
          onclick={() => {
            isOpen = false;
            if (onClose) onClose();
          }}
          class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500"
          aria-label="Close Sidebar"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Search Bar -->
      <div class="relative group mb-4">
        <div
          class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
        >
          <svg
            class="w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search question text..."
          class="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-slate-900 border border-transparent focus:border-indigo-500 rounded-2xl text-sm font-medium transition-all outline-none"
        />
      </div>

      <!-- Type Filters -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span
            class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
            >Quick Filters</span
          >
          <button
            onclick={() => (showAllMarks = !showAllMarks)}
            class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors {showAllMarks
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-500 hover:bg-gray-200'}"
          >
            {showAllMarks ? "Showing All Marks" : "Showing Matching Marks"}
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            onclick={() => (selectedType = null)}
            class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border {selectedType ===
            null
              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600'
              : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-500 hover:border-gray-300'}"
          >
            All Types
          </button>
          {#each availableTypes as type}
            <button
              onclick={() => (selectedType = type)}
              class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border {selectedType ===
              type
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600'
                : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-500 hover:border-gray-300'}"
            >
              {type}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Results List -->
    <div class="flex-1 overflow-y-auto p-6 space-y-3">
      {#each filteredQuestions as q}
        <button
          onclick={() => onSelect(q)}
          class="w-full text-left p-5 bg-gray-50 dark:bg-slate-900 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 rounded-[1.5rem] transition-all group relative overflow-hidden"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-[10px] font-black text-indigo-600 dark:text-indigo-400"
              >
                {q.marks || q.mark}M
              </span>
              <span
                class="text-[9px] font-black text-gray-400 uppercase tracking-widest"
              >
                {q.type}
              </span>
            </div>
            {#if q.bloom_level}
              <span
                class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded"
              >
                {q.bloom_level}
              </span>
            {/if}
          </div>
          <div
            class="text-[13px] font-semibold text-gray-700 dark:text-slate-300 leading-relaxed line-clamp-4"
          >
            {@html q.question_text || q.text}
          </div>

          {#if q.image_url}
            <div
              class="mt-3 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 bg-white"
            >
              <img
                src={q.image_url}
                alt="Question Graphic"
                class="w-full h-auto max-h-32 object-contain"
              />
            </div>
          {/if}

          <!-- Hover Effect indicator -->
          <div
            class="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div
              class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/40 translate-x-4 group-hover:translate-x-0 transition-transform"
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
                  stroke-width="3"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </div>
          </div>
        </button>
      {:else}
        <div
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <div
            class="w-16 h-16 rounded-3xl bg-gray-50 dark:bg-slate-900 flex items-center justify-center mb-4"
          >
            <svg
              class="w-8 h-8 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p class="text-sm font-bold text-gray-400 uppercase tracking-widest">
            No matching questions
          </p>
          <p class="text-[10px] text-gray-400 mt-1">
            Try adjusting your filters or search terms
          </p>
          <button
            onclick={() => {
              searchQuery = "";
              selectedType = null;
              showAllMarks = true;
            }}
            class="mt-6 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline"
          >
            Clear all filters
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* Custom scrollbar for better aesthetics */
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 10px;
  }
  .dark ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
  }
</style>
