<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data } = $props<{ data: PageData }>();
  let universities = $derived(data.universities);
  let user = $derived(data.user);

  let currentStep = $state(1);
  let isSubmitting = $state(false);

  let form = $state({
    university_id: user.university_id || "",
    title: "",
    event_type: "Workshop",
    proposed_date: "",
    venue: "",
    expected_attendance: 0,
    description: "",
    priority: "MED",
    items: [
      { category: "VENUE", description: "", qty: 1, unit_cost: 0, amount: 0 },
    ],
  });

  const eventTypes = [
    "Workshop",
    "Conference",
    "Guest Lecture",
    "Competition",
    "Cultural Event",
    "Tech Fest",
    "Sports",
    "Other",
  ];
  const categories = [
    "VENUE",
    "FOOD",
    "SPEAKER",
    "TRAVEL",
    "MARKETING",
    "AWARDS",
    "RECOGNITION",
    "HOSPITALITY",
    "CERTIFICATES",
    "GIFTS",
    "MISC",
  ];

  function addItem() {
    form.items.push({
      category: "MISC",
      description: "",
      qty: 1,
      unit_cost: 0,
      amount: 0,
    });
  }

  function removeItem(index: number) {
    if (form.items.length > 1) {
      form.items.splice(index, 1);
    }
  }

  $effect(() => {
    form.items.forEach((item) => {
      item.amount = item.qty * item.unit_cost;
    });
  });

  let totalBudget = $derived(form.items.reduce((sum, i) => sum + i.amount, 0));

  async function handleSubmit() {
    isSubmitting = true;
    try {
      const res = await fetch("/api/budget-proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const proposal = await res.json();
        goto(`/budget-proposals/${proposal.id}`);
      } else {
        const err = await res.json();
        alert(err.message || "Failed to create proposal");
      }
    } finally {
      isSubmitting = false;
    }
  }

  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  });
</script>

<div class="p-6 max-w-4xl mx-auto space-y-10 min-h-screen">
  <!-- Progress Header -->
  <div class="flex items-center justify-between mb-12">
    <div>
      <button
        onclick={() => history.back()}
        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors mb-2 flex items-center gap-1 font-bold text-xs uppercase tracking-widest"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="3"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </button>
      <h1 class="text-4xl font-black text-gray-900 dark:text-white">
        Propose Event Budget
      </h1>
    </div>

    <div class="flex items-center gap-4">
      {#each [1, 2, 3] as step}
        <div class="flex items-center gap-2">
          <div
            class="w-10 h-10 rounded-2xl flex items-center justify-center font-black transition-all {currentStep ===
            step
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
              : currentStep > step
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}"
          >
            {step}
          </div>
          {#if step < 3}
            <div class="w-8 h-1 bg-gray-100 dark:bg-gray-800 rounded-full">
              <div
                class="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style="width: {currentStep > step ? '100%' : '0%'}"
              ></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div
    class="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl shadow-gray-200 dark:shadow-none p-10 border border-gray-100 dark:border-gray-700 relative overflow-hidden"
  >
    <div
      class="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -mr-32 -mt-32 blur-3xl"
    ></div>

    {#if currentStep === 1}
      <div in:fade={{ duration: 200 }} class="space-y-8">
        <div class="border-b border-gray-100 dark:border-gray-700 pb-6">
          <h2 class="text-2xl font-black text-gray-900 dark:text-white">
            Core Details
          </h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Start by defining the scope of your event.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
              >Target University</label
            >
            <select
              bind:value={form.university_id}
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white font-bold appearance-none"
            >
              <option value="">Select University</option>
              {#each universities as univ}
                <option value={univ.id}>{univ.name}</option>
              {/each}
            </select>
          </div>

          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
              >Event Type</label
            >
            <select
              bind:value={form.event_type}
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white font-bold appearance-none"
            >
              {#each eventTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </div>

          <div class="col-span-full space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
              >Proposal Title</label
            >
            <input
              bind:value={form.title}
              type="text"
              placeholder="e.g. Annual Tech Symposium 2024"
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-lg font-black dark:text-white"
            />
          </div>

          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
              >Planned Date</label
            >
            <input
              bind:value={form.proposed_date}
              type="datetime-local"
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold dark:text-white"
            />
          </div>

          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-1"
              >Priority Level</label
            >
            <div
              class="flex items-center gap-2 p-1 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700"
            >
              {#each ["LOW", "MED", "HIGH"] as p}
                <button
                  onclick={() => (form.priority = p as any)}
                  class="flex-1 py-3 rounded-xl font-bold text-xs transition-all {form.priority ===
                  p
                    ? 'bg-white dark:bg-gray-800 shadow-sm text-emerald-600'
                    : 'text-gray-400'}"
                >
                  {p}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if currentStep === 2}
      <div in:fade={{ duration: 200 }} class="space-y-8">
        <div
          class="border-b border-gray-100 dark:border-gray-700 pb-6 flex justify-between items-end"
        >
          <div>
            <h2 class="text-2xl font-black text-gray-900 dark:text-white">
              Budget Line Items
            </h2>
            <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Itemize all estimated expenses.
            </p>
          </div>
          <div class="text-right">
            <span
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest block"
              >Total Estimation</span
            >
            <span class="text-2xl font-black text-emerald-600"
              >{formatter.format(totalBudget)}</span
            >
          </div>
        </div>

        <div class="space-y-4">
          {#each form.items as item, idx}
            <div
              class="flex flex-col md:flex-row gap-4 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-700 group relative"
              transition:slide
            >
              <div class="md:w-32 shrink-0 space-y-1">
                <label class="text-[9px] font-bold text-gray-400 uppercase ml-1"
                  >Category</label
                >
                <select
                  bind:value={item.category}
                  class="w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-xs font-bold dark:text-white appearance-none"
                >
                  {#each categories as cat}
                    <option value={cat}>{cat}</option>
                  {/each}
                </select>
              </div>

              <div class="flex-1 space-y-1">
                <label class="text-[9px] font-bold text-gray-400 uppercase ml-1"
                  >Description</label
                >
                <input
                  bind:value={item.description}
                  type="text"
                  placeholder="Explain what this is..."
                  class="w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-sm font-bold dark:text-white"
                />
              </div>

              <div class="md:w-20 shrink-0 space-y-1">
                <label
                  class="text-[9px] font-bold text-gray-400 uppercase ml-1 text-center block"
                  >Qty</label
                >
                <input
                  bind:value={item.qty}
                  type="number"
                  min="1"
                  class="w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-sm font-bold dark:text-white text-center"
                />
              </div>

              <div class="md:w-32 shrink-0 space-y-1">
                <label
                  class="text-[9px] font-bold text-gray-400 uppercase ml-1 text-right block"
                  >Unit Cost</label
                >
                <input
                  bind:value={item.unit_cost}
                  type="number"
                  class="w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-sm font-bold dark:text-white text-right"
                />
              </div>

              {#if form.items.length > 1}
                <button
                  onclick={() => removeItem(idx)}
                  class="absolute -top-2 -right-2 w-8 h-8 bg-white dark:bg-gray-800 shadow-lg shadow-black/5 rounded-full flex items-center justify-center text-red-500 hover:scale-110 transition-all border border-gray-100 dark:border-gray-700 opacity-0 group-hover:opacity-100"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}

          <button
            onclick={addItem}
            class="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl text-gray-400 hover:text-emerald-500 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Add Item
          </button>
        </div>
      </div>
    {:else if currentStep === 3}
      <div in:fade={{ duration: 200 }} class="space-y-8">
        <div class="border-b border-gray-100 dark:border-gray-700 pb-6">
          <h2 class="text-2xl font-black text-gray-900 dark:text-white">
            Final Narrative
          </h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Provide context to help SET understand the proposal.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-2 col-span-full">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Venue Description</label
            >
            <input
              bind:value={form.venue}
              type="text"
              placeholder="e.g. Campus Amphitheater or Hall 1"
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold dark:text-white"
            />
          </div>

          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Expected Attendance</label
            >
            <input
              bind:value={form.expected_attendance}
              type="number"
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold dark:text-white"
            />
          </div>

          <div class="col-span-full space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
              >Detailed Description / Purpose</label
            >
            <textarea
              bind:value={form.description}
              placeholder="What is the goal of this event? Why is this budget necessary?"
              class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm dark:text-white font-medium shadow-inner"
              rows="6"
            ></textarea>
          </div>
        </div>
      </div>
    {/if}

    <div
      class="flex items-center justify-between mt-12 pt-8 border-t border-gray-50 dark:border-gray-700"
    >
      <button
        onclick={() => (currentStep > 1 ? currentStep-- : history.back())}
        class="px-8 py-4 text-sm font-black text-gray-400 uppercase hover:text-gray-600 transition-all"
      >
        {currentStep === 1 ? "Cancel" : "Previous"}
      </button>

      <button
        onclick={() => (currentStep < 3 ? currentStep++ : handleSubmit())}
        class="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-700 hover:-translate-y-0.5 transition-all active:translate-y-0 active:scale-95 flex items-center gap-2"
        disabled={isSubmitting}
      >
        {#if isSubmitting}
          <div
            class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
          ></div>
          Processing
        {:else}
          {currentStep === 3 ? "Finalize Proposal" : "Continue"}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>
