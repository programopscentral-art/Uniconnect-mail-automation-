<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';

  let schedules = $state([]);
  let loading = $state(true);
  let activeView = $state('today');

  async function fetchMySchedule() {
    loading = true;
    try {
      const res = await fetch('/api/faculty/schedule'); // Needs implementation
      schedules = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(fetchMySchedule);
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-center justify-between p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-600/20 overflow-hidden relative">
      <div class="absolute -right-20 -top-20 w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>
      <div class="relative z-10">
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-2">Faculty Hub</p>
          <h2 class="text-3xl font-black tracking-tight">Academic <span class="bg-white text-indigo-600 px-3 py-1 rounded-2xl ml-1">Workspace</span></h2>
      </div>
      <div class="flex gap-4 relative z-10">
          <button onclick={() => activeView = 'today'} class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {activeView === 'today' ? 'bg-white text-indigo-600 shadow-lg' : 'text-indigo-100 hover:text-white'}">My Sessions</button>
          <button onclick={() => activeView = 'pending'} class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {activeView === 'pending' ? 'bg-white text-indigo-600 shadow-lg' : 'text-indigo-100 hover:text-white'}">Pending Tasks</button>
      </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div class="lg:col-span-2 space-y-6">
        <h3 class="text-xl font-black text-gray-900 dark:text-white px-2">Operational <span class="text-indigo-600">Timeline</span></h3>
        
        {#if loading}
            <div class="p-20 flex flex-col items-center justify-center grayscale opacity-40">
                <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
                <p class="text-[10px] font-black uppercase tracking-widest">Compiling Schedule...</p>
            </div>
        {:else if schedules.length === 0}
            <div class="p-20 bg-white dark:bg-slate-900 rounded-[3rem] border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-center opacity-40 grayscale">
                <div class="w-20 h-20 bg-gray-100 rounded-full mb-6 flex items-center justify-center text-3xl">🌴</div>
                <p class="text-sm font-black text-gray-900 dark:text-white">Zero Mandatory Sessions</p>
                <p class="text-[10px] uppercase tracking-widest text-gray-400 mt-2">Enjoy your administrative window</p>
            </div>
        {:else}
            <div class="space-y-4">
                {#each schedules as session}
                    <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm flex items-center justify-between group hover:shadow-xl hover:shadow-indigo-600/5 transition-all" transition:fly={{ y: 20 }}>
                        <div class="flex items-center gap-8">
                            <div class="flex flex-col items-center justify-center p-5 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl min-w-[100px]">
                                <p class="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">{session.start_time}</p>
                                <div class="w-4 h-1 bg-indigo-200 rounded-full mb-1"></div>
                                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{session.end_time}</p>
                            </div>
                            <div>
                                <h4 class="text-lg font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-all font-outfit uppercase tracking-tight">{session.subject_name}</h4>
                                <div class="flex items-center gap-3 mt-2">
                                    <span class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{session.section_name}</span>
                                    <span class="w-1 h-1 bg-gray-200 rounded-full"></span>
                                    <span class="text-[9px] font-black text-indigo-500 uppercase tracking-widest">RM: {session.room_code}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <button class="px-5 py-2.5 bg-gray-100 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase transition-all hover:bg-red-500/10 hover:text-red-600">Report Issue</button>
                            <button class="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all">Mark Conducted</button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="space-y-8">
        <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
            <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-6">Action <span class="text-indigo-600">Required</span></h3>
            <div class="space-y-4">
                <button class="w-full p-4 rounded-2xl bg-orange-500/10 border border-orange-200 text-orange-600 flex items-center justify-between group transition-all hover:shadow-md">
                    <div class="flex items-center gap-3">
                        <span class="w-2 h-2 bg-orange-500 animate-pulse rounded-full"></span>
                        <span class="text-[10px] font-black uppercase tracking-widest">Upload Marks (Sem 2)</span>
                    </div>
                    <span class="text-xs group-hover:translate-x-1 transition-all">→</span>
                </button>
            </div>
        </div>

        <button class="w-full p-10 bg-indigo-50/50 dark:bg-indigo-500/5 border-2 border-dashed border-indigo-200 dark:border-indigo-500/20 rounded-[3rem] flex flex-col items-center justify-center gap-4 group hover:border-indigo-600 transition-all">
            <div class="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-lg flex items-center justify-center text-xl group-hover:scale-110 transition-all">✉️</div>
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Submit Leave Request</span>
        </button>
    </div>
  </div>
</div>
