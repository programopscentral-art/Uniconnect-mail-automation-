<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';

  let conflicts = $state([]);
  let loading = $state(true);
  let universityId = $state(""); // Should be from session

  async function fetchConflicts() {
    loading = true;
    try {
      const res = await fetch('/api/academic/scheduling/conflicts'); // We'll need this API
      conflicts = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(fetchConflicts);

  async function resolveConflict(conflictId: string) {
    try {
      const res = await fetch(`/api/academic/scheduling/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'MANUAL_OVERRIDE', actor_id: 'mock-admin-id' })
      });
      if (res.ok) {
        conflicts = conflicts.filter(c => c.id !== conflictId);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const getSeverityClass = (severity) => {
    if (severity === 'CRITICAL') return 'bg-red-500/10 text-red-600 border-red-200';
    if (severity === 'ERROR') return 'bg-orange-500/10 text-orange-600 border-orange-200';
    return 'bg-blue-500/10 text-blue-600 border-blue-200';
  };
</script>

<div class="space-y-8" in:fade>
  <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-2xl font-black text-gray-900 dark:text-white">Conflict <span class="text-red-600">Center</span></h2>
        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Operational War Room for Scheduling</p>
      </div>
      <button onclick={fetchConflicts} class="px-6 py-2.5 bg-gray-100 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Refresh Engine</button>
    </div>

    {#if loading}
      <div class="flex flex-col items-center justify-center py-20 grayscale opacity-40">
        <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">Checking for System Conflicts...</p>
      </div>
    {:else if conflicts.length === 0}
      <div class="flex flex-col items-center justify-center py-20 grayscale opacity-40 text-center">
        <div class="w-20 h-20 bg-green-100 rounded-full mb-6 flex items-center justify-center text-3xl">✅</div>
        <p class="text-sm font-black text-gray-900 dark:text-white">Zero Conflicts Detected</p>
        <p class="text-[10px] uppercase tracking-widest text-gray-400 mt-2">Systems are cleared for implementation</p>
      </div>
    {:else}
      <div class="space-y-4">
        {#each conflicts as conflict}
          <div class="p-6 border rounded-[1.5rem] flex items-center justify-between transition-all hover:shadow-md {getSeverityClass(conflict.severity)}" transition:fly={{ x: 20 }}>
            <div class="flex items-center gap-6">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/50 backdrop-blur-sm shadow-sm border border-transparent font-black text-xs">
                {conflict.conflict_type === 'FACULTY_CLASH' ? '👩‍🏫' : conflict.conflict_type === 'ROOM_CLASH' ? '🏫' : '🧩'}
              </div>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/60">{conflict.conflict_type}</span>
                  <span class="text-[10px] font-black uppercase tracking-widest">{conflict.severity}</span>
                </div>
                <h4 class="font-black text-gray-900 dark:text-white leading-tight">{conflict.description}</h4>
              </div>
            </div>
            <div class="flex items-center gap-3">
               <button class="px-5 py-2.5 bg-white dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase border border-inherit hover:shadow-sm transition-all focus:ring-2 focus:ring-indigo-500">View Slot</button>
               <button onclick={() => resolveConflict(conflict.id)} class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all">Resolve Fix</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
