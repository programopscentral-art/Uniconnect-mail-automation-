<script lang="ts">
  import { fly, fade } from "svelte/transition";

  const metrics = [
    { label: "Published Sessions", value: "2,401", change: "+12%", trend: "up" },
    { label: "Faculty Utilization", value: "88%", change: "+3%", trend: "up" },
    { label: "Room Conflicts", value: "0", change: "-100%", trend: "down" },
    { label: "Substitutions", value: "14", change: "+2", trend: "neutral" },
  ];
</script>

<div class="space-y-8" in:fade>
  <!-- Metrics -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each metrics as metric, i}
      <div 
        class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl"
        in:fly={{ y: 10, delay: i * 50 }}
      >
        <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{metric.label}</p>
        <div class="flex items-end justify-between mt-2">
          <h3 class="text-3xl font-black text-gray-900 dark:text-white leading-none">{metric.value}</h3>
          <span class="text-[10px] font-bold {metric.trend === 'up' ? 'text-emerald-500' : metric.trend === 'down' ? 'text-rose-500' : 'text-gray-400'}">
            {metric.change}
          </span>
        </div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    <!-- Upcoming sessions or something -->
    <div class="xl:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-tight">Schedule <span class="text-indigo-600">Timeline</span></h2>
        <div class="flex gap-2">
          <button class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all" aria-label="Previous Day"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg></button>
          <button class="px-4 py-2 bg-gray-50 dark:bg-slate-800 text-xs font-black rounded-xl">Today, 08 March</button>
          <button class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 transition-all" aria-label="Next Day"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg></button>
        </div>
      </div>

      <div class="relative h-[400px] flex items-center justify-center border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-[2rem]">
        <div class="text-center">
            <div class="p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-full w-fit mx-auto mb-4">
                <svg class="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <p class="text-gray-500 dark:text-gray-400 font-bold uppercase text-[10px] tracking-widest">No active sessions currently</p>
        </div>
      </div>
    </div>

    <!-- Right: Quick Actions -->
    <div class="p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-xl shadow-indigo-500/20">
      <h2 class="text-xl font-black tracking-tight mb-2">Scheduling Actions</h2>
      <p class="text-indigo-100 text-xs font-medium mb-8 leading-relaxed">Quickly manage campus sessions and faculty leaves.</p>
      
      <div class="space-y-4">
        <a href="/academic-operations/scheduling/upload" class="flex items-center gap-4 p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all">
          <div class="p-2 bg-white rounded-xl text-indigo-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          </div>
          <span class="text-sm font-black uppercase tracking-widest">Import Timetable</span>
        </a>
        <a href="/academic-operations/scheduling/leave" class="flex items-center gap-4 p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all">
          <div class="p-2 bg-white rounded-xl text-indigo-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <span class="text-sm font-black uppercase tracking-widest">Report Leave</span>
        </a>
        <a href="/academic-operations/scheduling/conflicts" class="flex items-center gap-4 p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all">
          <div class="p-2 bg-white rounded-xl text-indigo-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <span class="text-sm font-black uppercase tracking-widest">Conflict Center</span>
        </a>
      </div>
    </div>
  </div>
</div>
