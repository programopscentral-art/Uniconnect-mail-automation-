<script lang="ts">
  import { goto } from "$app/navigation";
  let { data } = $props();

  const CATEGORIES = ["TRAVEL", "FOOD", "VENUE", "PRINTING", "STATIONERY", "HOSPITALITY", "MAINTENANCE", "COURIER", "MARKETING", "MISC"];

  let form = $state({
    university_id: data.universities[0]?.id || "",
    purpose: "",
    category: "TRAVEL",
    payee_vendor: "",
    amount_requested: null as number | null,
    needed_by: "",
    linked_activity: "",
  });
  let busy = $state(false);
  let err = $state("");

  async function submit(sendForApproval: boolean) {
    err = "";
    if (!form.university_id) { err = "Pick a university."; return; }
    if (!form.purpose.trim()) { err = "Describe what the money is for."; return; }
    if (!form.amount_requested || form.amount_requested <= 0) { err = "Enter a valid amount."; return; }
    busy = true;
    const r = await fetch("/api/petty-cash", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!r.ok) { err = (await r.json().catch(() => ({}))).message || "Could not create the request."; busy = false; return; }
    const created = await r.json();
    if (sendForApproval) {
      await fetch(`/api/petty-cash/${created.id}/submit`, { method: "POST" }).catch(() => {});
    }
    goto(`/petty-cash/${created.id}`);
  }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-4 sm:p-8">
  <div class="max-w-2xl mx-auto space-y-6">
    <div class="flex items-center gap-4">
      <a href="/petty-cash" class="w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm flex items-center justify-center text-gray-400 hover:text-indigo-600" title="Back">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" /></svg>
      </a>
      <div>
        <p class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Petty Cash</p>
        <h1 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight uppercase">New Request</h1>
      </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-5">
      {#if err}
        <div class="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-sm font-semibold">{err}</div>
      {/if}

      {#if data.universities.length > 1}
        <label class="block">
          <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">University</span>
          <select bind:value={form.university_id} class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            {#each data.universities as u}<option value={u.id}>{u.name}</option>{/each}
          </select>
        </label>
      {/if}

      <label class="block">
        <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Purpose <span class="text-red-400">*</span></span>
        <textarea bind:value={form.purpose} rows="2" placeholder="What is this money for?"
          class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm resize-none"></textarea>
      </label>

      <div class="grid grid-cols-2 gap-4">
        <label class="block">
          <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</span>
          <select bind:value={form.category} class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            {#each CATEGORIES as c}<option value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>{/each}
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount (₹) <span class="text-red-400">*</span></span>
          <input type="number" bind:value={form.amount_requested} min="1" placeholder="0"
            class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums" />
        </label>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <label class="block">
          <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payee / Vendor</span>
          <input bind:value={form.payee_vendor} placeholder="Who gets paid?"
            class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
        </label>
        <label class="block">
          <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Needed by</span>
          <input type="date" bind:value={form.needed_by}
            class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
        </label>
      </div>

      <label class="block">
        <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked activity (optional)</span>
        <input bind:value={form.linked_activity} placeholder="Event / task this relates to"
          class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm" />
      </label>

      <div class="flex gap-3 pt-2">
        <button onclick={() => submit(false)} disabled={busy}
          class="flex-1 px-5 py-3.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-gray-50 disabled:opacity-50">
          {busy ? "Saving…" : "Save Draft"}
        </button>
        <button onclick={() => submit(true)} disabled={busy}
          class="flex-1 px-5 py-3.5 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 disabled:opacity-50">
          {busy ? "Saving…" : "Save & Send for Approval"}
        </button>
      </div>
    </div>
  </div>
</div>
