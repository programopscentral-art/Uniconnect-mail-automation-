<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const stats = [
    { label: "Today's Sessions", value: "42", sub: "8 in progress", color: "from-blue-500 to-indigo-600", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Staff on Leave", value: "5", sub: "2 substituted", color: "from-amber-400 to-orange-500", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { label: "Open Tickets", value: "18", sub: "4 urgent", color: "from-rose-500 to-red-600", icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" },
    { label: "Syllabus Status", value: "74%", sub: "On track", color: "from-emerald-400 to-teal-500", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  ];

  const recentAlerts = [
    { title: "Conflict Detected", message: "Prof. Sharma has a clash in Block B, Room 204 at 10:00 AM.", time: "10 mins ago", type: "error" },
    { title: "Schedule Published", message: "Mid-term exam schedule for CS Department has been published.", time: "1 hour ago", type: "info" },
    { title: "Leave Request", message: "Dr. Verma requested leave for March 15th-18th.", time: "2 hours ago", type: "warning" },
  ];
</script>

<div class="space-y-8" in:fade>
  <!-- Stats Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#each stats as stat, i}
      <div 
        class="relative group overflow-hidden p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500"
        in:fly={{ y: 20, delay: i * 100 }}
      >
        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={stat.icon} />
          </svg>
        </div>
        
        <div class="flex items-center gap-4 mb-4">
          <div class="p-3 rounded-2xl bg-gradient-to-br {stat.color} text-white shadow-lg">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={stat.icon} />
            </svg>
          </div>
          <div>
            <p class="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{stat.label}</p>
          </div>
        </div>

        <div class="flex items-end justify-between">
          <h2 class="text-4xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</h2>
          <span class="text-sm font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 px-3 py-1 rounded-full">{stat.sub}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Main Monitoring Section -->
    <div class="lg:col-span-2 space-y-6">
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Real-time <span class="text-indigo-600">Execution</span></h2>
            <p class="text-sm text-gray-500 font-medium mt-1">Live status of academic sessions across campuses.</p>
          </div>
          <button class="px-6 py-2.5 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-900 dark:text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95">
            View Live Map
          </button>
        </div>

        <div class="space-y-4">
          <!-- Placeholder for Live Sessions -->
          {#each Array(3) as _, i}
            <div class="flex items-center gap-6 p-5 bg-gray-50/50 dark:bg-slate-800/30 rounded-3xl border border-transparent hover:border-indigo-500/30 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group">
              <div class="w-16 text-center">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Starts</p>
                <p class="text-lg font-black text-gray-900 dark:text-white">10:30</p>
              </div>
              <div class="h-10 w-[2px] bg-gray-200 dark:bg-slate-700"></div>
              <div class="flex-1">
                <h3 class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">Computer Networks & Security</h3>
                <p class="text-xs text-gray-500 font-bold mt-0.5">Section A • Room 302 • Dr. Anand R.</p>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  Scheduled
                </span>
                <button class="p-2 text-gray-400 hover:text-indigo-600 transition-colors">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Right Column: Alerts & Quick Actions -->
    <div class="space-y-8">
      <!-- Recent Alerts -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-tight mb-6">Execution <span class="text-rose-500">Alerts</span></h2>
        
        <div class="space-y-6">
          {#each recentAlerts as alert}
            <div class="relative pl-6 border-l-2 {alert.type === 'error' ? 'border-rose-500' : alert.type === 'warning' ? 'border-amber-500' : 'border-blue-500'}">
              <h4 class="text-sm font-black text-gray-900 dark:text-white">{alert.title}</h4>
              <p class="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{alert.message}</p>
              <p class="text-[10px] text-gray-400 font-bold mt-2 uppercase tracking-widest">{alert.time}</p>
            </div>
          {/each}
        </div>

        <button class="w-full mt-8 py-4 bg-gray-950 dark:bg-white text-white dark:text-gray-950 text-xs font-black uppercase tracking-[0.2em] rounded-[1.5rem] hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-black/10">
          Open Conflict Center
        </button>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-4">
        <button class="flex flex-col items-center justify-center p-6 bg-indigo-50 dark:bg-indigo-500/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-500/20 group hover:bg-indigo-600 transition-all duration-300">
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 text-indigo-600 group-hover:text-white group-hover:bg-indigo-500 shadow-sm transition-all">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
          </div>
          <span class="text-[10px] font-black text-indigo-900 dark:text-indigo-100 group-hover:text-white uppercase tracking-widest mt-3">Upload Timetable</span>
        </button>
        <button class="flex flex-col items-center justify-center p-6 bg-violet-50 dark:bg-violet-500/10 rounded-[2rem] border border-violet-100 dark:border-violet-500/20 group hover:bg-violet-600 transition-all duration-300">
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 text-violet-600 group-hover:text-white group-hover:bg-violet-500 shadow-sm transition-all">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </div>
          <span class="text-[10px] font-black text-violet-900 dark:text-violet-100 group-hover:text-white uppercase tracking-widest mt-3">Plan Exams</span>
        </button>
      </div>
    </div>
  </div>
</div>
