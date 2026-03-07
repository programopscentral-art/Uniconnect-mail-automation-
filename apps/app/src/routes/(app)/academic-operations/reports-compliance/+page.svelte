<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const reportPacks = [
      { id: "A-1", title: "Syllabus Compliance", description: "Subject-wise completion percentage vs required sessions.", tags: ["Academic", "Compliance"] },
      { id: "A-2", title: "Attendance Trends", description: "Daily, weekly and monthly student attendance heatmaps.", tags: ["Student", "Operational"] },
      { id: "F-1", title: "Faculty Workload", description: "Total teaching hours and duty assignments per professor.", tags: ["Faculty", "Admin"] },
      { id: "E-1", title: "Examination Audit", description: "Full audit trail of marks entry and evaluation progress.", tags: ["Exam", "Audit"] },
      { id: "S-1", title: "Session Execution", description: "Analysis of missed, cancelled and rescheduled sessions.", tags: ["Operational", "Efficiency"] },
      { id: "U-1", title: "University Export", description: "Raw data export formatted for university regulatory filings.", tags: ["Compliance", "Export"] },
  ];
</script>

<div class="space-y-10" in:fade>
  <div class="flex items-center justify-between">
    <div>
        <h2 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Reporting <span class="text-indigo-600">& Intelligence</span></h2>
        <p class="text-sm text-gray-500 font-medium mt-1">Generate deep operational insights and regulatory compliance exports.</p>
    </div>
    <div class="flex gap-3">
        <button class="px-8 py-3 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 text-gray-900 dark:text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:shadow-lg transition-all active:scale-95">Manual Query</button>
        <button class="px-8 py-3 bg-gray-950 dark:bg-white text-white dark:text-gray-950 text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-black/10 active:scale-95 transition-all">Schedule New</button>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {#each reportPacks as pack, i}
        <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group" in:fly={{ y: 20, delay: i * 100 }}>
            <div class="p-4 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-3xl w-fit mb-6 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            
            <div class="flex items-center gap-2 mb-3">
                {#each pack.tags as tag}
                    <span class="px-3 py-1 bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-gray-500 text-[9px] font-black uppercase tracking-widest rounded-lg"># {tag}</span>
                {/each}
            </div>

            <h3 class="text-xl font-black text-gray-900 dark:text-white tracking-tight">{pack.title}</h3>
            <p class="text-sm text-gray-500 font-medium mt-3 leading-relaxed mb-10">{pack.description}</p>

            <div class="flex items-center gap-2 mt-auto">
                 <button class="flex-1 py-3.5 bg-gray-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-gray-100 transition-all text-gray-600 dark:text-gray-300">View Online</button>
                 <button class="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20 hover:opacity-90 active:scale-95 transition-all" aria-label="Download Report">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                 </button>
            </div>
        </div>
      {/each}
  </div>

  <!-- Compliance Center Banner -->
  <div class="p-10 bg-indigo-600 rounded-[3rem] text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl shadow-indigo-600/30 overflow-hidden relative">
      <div class="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
      <div class="relative z-10 text-center md:text-left">
          <h2 class="text-3xl font-black tracking-tight mb-3 italic">University Regulatory Export</h2>
          <p class="text-indigo-100 text-lg font-medium">Generate audited session and examination logs for compliance filing.</p>
      </div>
      <button class="relative z-10 px-10 py-5 bg-white text-indigo-600 text-sm font-black uppercase tracking-widest rounded-[1.5rem] shadow-2xl active:scale-95 transition-all hover:bg-gray-100">
          Start Audit Pack
      </button>
  </div>
</div>
