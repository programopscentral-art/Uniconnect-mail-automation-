<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data } = $props<{ data: PageData }>();
  let proposal = $derived(data.proposal);

  let isSubmitting = $state(false);
  let form = $state({
    actual_date: data.proposal.report?.actual_date || "",
    actual_attendance: data.proposal.report?.actual_attendance || 0,
    actual_budget_used:
      data.proposal.report?.actual_budget_used ||
      data.proposal.approved_total_budget ||
      0,
    outcomes: data.proposal.report?.outcomes || "",
    feedback_summary: data.proposal.report?.feedback_summary || "",
    issues_faced: data.proposal.report?.issues_faced || "",
    photos_urls: data.proposal.report?.photos_urls || [],
  });

  let remainingBudget = $derived(
    (proposal.approved_total_budget || 0) - form.actual_budget_used,
  );

  let isUploadingPhotos = $state(false);
  let photoInput = $state<HTMLInputElement>();

  async function uploadPhotos(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    isUploadingPhotos = true;
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "REPORT_PHOTO");

        const res = await fetch(`/api/budget-proposals/${proposal.id}/attachments`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const attachment = await res.json();
          form.photos_urls = [...form.photos_urls, attachment.file_url];
        } else {
          const err = await res.json();
          alert(`Failed to upload ${file.name}: ${err.message}`);
        }
      }
    } finally {
      isUploadingPhotos = false;
      if (photoInput) photoInput.value = "";
    }
  }

  function removePhoto(url: string) {
    form.photos_urls = form.photos_urls.filter((u) => u !== url);
  }

  async function handleSubmit() {
    isSubmitting = true;
    try {
      const res = await fetch(`/api/budget-proposals/${proposal.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, remaining_budget: remainingBudget }),
      });
      if (res.ok) {
        goto(`/budget-proposals/${proposal.id}`);
      } else {
        const err = await res.json();
        alert(err.message || "Failed to submit report");
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

<div class="p-6 max-w-4xl mx-auto space-y-8">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-black text-gray-900 dark:text-white">
        Post-Event Report
      </h1>
      <p class="text-gray-500 dark:text-gray-400 mt-1">
        Finalize budget and outcomes for <span
          class="text-emerald-600 font-bold">{proposal.title}</span
        >
      </p>
    </div>
    <div
      class="bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-2xl border border-gray-200 dark:border-gray-700"
    >
      <span
        class="text-[10px] font-black text-gray-400 uppercase tracking-widest block"
        >Approved Budget</span
      >
      <span class="text-lg font-black text-emerald-600"
        >{formatter.format(proposal.approved_total_budget || 0)}</span
      >
    </div>
  </div>

  <div
    class="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl p-10 border border-gray-100 dark:border-gray-700 space-y-10 overflow-hidden relative"
  >
    <div
      class="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -mr-32 -mt-32 blur-3xl"
    ></div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="space-y-2">
        <label
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
          >Actual Event Date</label
        >
        <input
          bind:value={form.actual_date}
          type="datetime-local"
          class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold dark:text-white"
        />
      </div>

      <div class="space-y-2">
        <label
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
          >Actual Attendance</label
        >
        <input
          bind:value={form.actual_attendance}
          type="number"
          class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold dark:text-white"
        />
      </div>

      <div class="space-y-2">
        <label
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
          >Actual Budget Utilized (INR)</label
        >
        <input
          bind:value={form.actual_budget_used}
          type="number"
          class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold dark:text-white"
        />
      </div>

      <div class="space-y-2 flex flex-col justify-end">
        <div
          class="p-4 bg-gray-100 dark:bg-gray-900/80 rounded-2xl border border-gray-200 dark:border-gray-700"
        >
          <span class="text-[10px] font-black text-gray-400 uppercase"
            >Remaining Funds</span
          >
          <p
            class="text-xl font-black {remainingBudget < 0
              ? 'text-red-500'
              : 'text-emerald-600'}"
          >
            {formatter.format(remainingBudget)}
          </p>
        </div>
      </div>

      <div class="col-span-full space-y-2 pt-4">
        <label
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
          >Summary of Outcomes</label
        >
        <textarea
          bind:value={form.outcomes}
          placeholder="How did the event go? Were goals met?"
          class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium dark:text-white"
          rows="4"
        ></textarea>
      </div>

      <div class="col-span-full space-y-2">
        <label
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
          >Feedback Summary</label
        >
        <textarea
          bind:value={form.feedback_summary}
          placeholder="Student/Speaker feedback highlights"
          class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium dark:text-white"
          rows="3"
        ></textarea>
      </div>

      <div class="col-span-full space-y-2">
        <label
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1"
          >Issues Faced (Optional)</label
        >
        <textarea
          bind:value={form.issues_faced}
          placeholder="Logistical or financial hurdles"
          class="w-full p-4 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium dark:text-white"
          rows="2"
        ></textarea>
      </div>
      
      <div class="col-span-full space-y-4 pt-4 border-t border-gray-50 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Event Gallery (Photos)</label>
          <div class="relative">
            <input type="file" multiple accept="image/*" class="hidden" bind:this={photoInput} onchange={uploadPhotos} />
            <button 
              type="button" 
              onclick={() => photoInput?.click()} 
              disabled={isUploadingPhotos}
              class="text-xs font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-2"
            >
              {#if isUploadingPhotos}
                <div class="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
              {:else}
                📸
              {/if}
              Upload Photos
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {#each form.photos_urls as photo}
            <div class="aspect-square bg-gray-50 dark:bg-gray-900 rounded-3xl overflow-hidden relative group border border-gray-100 dark:border-gray-700">
              <img src={photo.startsWith('/uploads/') ? photo.replace('/uploads/', '/api/uploads/') : photo} alt="Event" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <button 
                type="button" 
                onclick={() => removePhoto(photo)}
                class="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-xl shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
          
          {#if form.photos_urls.length === 0 && !isUploadingPhotos}
             <button 
               type="button"
               onclick={() => photoInput?.click()}
               class="aspect-square rounded-3xl border-2 border-dashed border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-300 hover:text-indigo-400 hover:border-indigo-400/30 hover:bg-indigo-500/5 transition-all"
             >
               <span class="text-2xl">➕</span>
               <span class="text-[9px] font-black uppercase tracking-widest">Add Photos</span>
             </button>
          {/if}
        </div>
      </div>
    </div>

    <div
      class="flex items-center justify-between pt-10 border-t border-gray-50 dark:border-gray-700"
    >
      <button
        onclick={() => history.back()}
        class="px-8 py-4 text-xs font-black text-gray-400 uppercase hover:text-gray-600 transition-all tracking-widest"
        >Discard</button
      >
      <button
        onclick={handleSubmit}
        disabled={isSubmitting}
        class="px-12 py-5 bg-emerald-600 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
      >
        {isSubmitting ? "Processing..." : "Submit Final Report"}
      </button>
    </div>
  </div>
</div>
