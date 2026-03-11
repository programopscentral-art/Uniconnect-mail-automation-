<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let slots = $state<any[]>([]);
  let loading = $state(true);

  // New slot form
  let newSlotName = $state('');
  let newSlotStart = $state('');
  let newSlotEnd = $state('');
  let newSlotType = $state('LECTURE');
  let saving = $state(false);

  $effect(() => {
    if (universityId) loadSlots();
  });

  async function loadSlots() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/scheduling/slots?universityId=${universityId}`);
      if (res.ok) slots = await res.json();
    } catch {}
    loading = false;
  }

  async function addSlot() {
    if (!newSlotStart || !newSlotEnd) return;
    saving = true;
    try {
      const res = await fetch('/api/academic/scheduling/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityId,
          name: newSlotName || `Slot ${slots.length + 1}`,
          start_time: newSlotStart,
          end_time: newSlotEnd,
          slot_type: newSlotType
        })
      });
      if (res.ok) {
        newSlotName = '';
        newSlotStart = '';
        newSlotEnd = '';
        newSlotType = 'LECTURE';
        loadSlots();
      }
    } catch {}
    saving = false;
  }

  async function deleteSlot(id: string) {
    if (!confirm('Delete this slot?')) return;
    try {
      await fetch(`/api/academic/scheduling/slots/${id}`, { method: 'DELETE' });
      loadSlots();
    } catch {}
  }

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    return `${h12}:${m} ${ampm}`;
  }

  function slotTypeColor(type: string) {
    switch (type) {
      case 'BREAK': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      case 'LAB': return 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400';
      default: return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400';
    }
  }
</script>

<div class="space-y-8" in:fade>
  {#if !universityId}
    <div class="p-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl text-center">
      <p class="text-gray-500 font-bold text-sm">Please select a university first.</p>
    </div>
  {:else}

  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Time <span class="text-indigo-600">Slots</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Define the university's daily time slot structure.</p>
    </div>
  </div>

  <!-- Visual Timeline -->
  {#if slots.length > 0}
    <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
      <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Daily Timeline</p>
      <div class="flex gap-2 overflow-x-auto pb-2">
        {#each slots as slot}
          <div class="flex-1 min-w-[100px] p-3 rounded-2xl {slotTypeColor(slot.slot_type)} text-center">
            <p class="text-[9px] font-black uppercase tracking-widest opacity-70">{slot.name}</p>
            <p class="text-xs font-black mt-1">{formatTime(slot.start_time)}</p>
            <p class="text-[10px] opacity-70">{formatTime(slot.end_time)}</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Existing Slots -->
    <div class="lg:col-span-2 space-y-3">
      {#if loading}
        <div class="p-10 text-center">
          <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      {:else if slots.length === 0}
        <div class="p-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] text-center">
          <p class="text-gray-400 font-bold text-sm">No time slots defined yet.</p>
          <p class="text-[10px] text-gray-300 mt-1">Add your university's daily schedule structure below.</p>
        </div>
      {:else}
        {#each slots as slot, i}
          <div class="flex items-center gap-4 p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-md transition-all" in:fly={{ y: 10, delay: i * 30 }}>
            <div class="w-10 h-10 rounded-xl {slotTypeColor(slot.slot_type)} flex items-center justify-center text-sm font-black">
              {i + 1}
            </div>
            <div class="flex-1">
              <p class="text-sm font-black text-gray-900 dark:text-white">{slot.name}</p>
              <p class="text-xs text-gray-400 font-bold">{formatTime(slot.start_time)} — {formatTime(slot.end_time)}</p>
            </div>
            <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase {slotTypeColor(slot.slot_type)}">{slot.slot_type}</span>
            <button onclick={() => deleteSlot(slot.id)} class="p-2 text-gray-400 hover:text-red-500 transition-all" title="Delete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Add Slot Form -->
    <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm h-fit sticky top-6">
      <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight mb-6">Add Time Slot</h3>
      <div class="space-y-4">
        <div>
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Slot Name</label>
          <input type="text" bind:value={newSlotName} placeholder="e.g. Period 1, Lunch" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Start Time</label>
            <input type="time" bind:value={newSlotStart} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold" />
          </div>
          <div>
            <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">End Time</label>
            <input type="time" bind:value={newSlotEnd} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold" />
          </div>
        </div>
        <div>
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Type</label>
          <select bind:value={newSlotType} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold">
            <option value="LECTURE">Lecture</option>
            <option value="LAB">Lab</option>
            <option value="BREAK">Break</option>
          </select>
        </div>
        <button
          onclick={addSlot}
          disabled={saving || !newSlotStart || !newSlotEnd}
          class="w-full py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-40"
        >
          {saving ? 'Adding...' : 'Add Slot'}
        </button>
      </div>
    </div>
  </div>
  {/if}
</div>
