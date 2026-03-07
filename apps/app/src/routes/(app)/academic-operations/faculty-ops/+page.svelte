<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const facultySummary = [
    { label: "Total Faculty", value: "156", sub: "Active", color: "from-blue-500 to-indigo-600", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
    { label: "On Duty", value: "142", sub: "Today", color: "from-emerald-400 to-teal-500", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { label: "Leave Requests", value: "8", sub: "Pending", color: "from-amber-400 to-orange-500", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { label: "Avg Workload", value: "18h", sub: "/ weekly", color: "from-violet-500 to-fuchsia-600", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  ];

  const facultyList = [
    { name: "Dr. Sathish Kumar", dept: "Computer Science", role: "Associate Professor", workload: "22h", status: "ONLINE" },
    { name: "Prof. Neha Sharma", dept: "Information Tech", role: "Professor", workload: "16h", status: "AWAY" },
    { name: "Dr. Anand Raju", dept: "Computer Science", role: "Assistant Professor", workload: "20h", status: "BUSY" },
    { name: "Prof. Kirti V.", dept: "Data Science", role: "Guest Faculty", workload: "8h", status: "OFFLINE" },
  ];
</script>

<div class="space-y-8" in:fade>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#each facultySummary as stat, i}
      <div 
        class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm overflow-hidden group"
        in:fly={{ y: 20, delay: i * 100 }}
      >
        <div class="p-3 bg-gradient-to-br {stat.color} text-white rounded-2xl w-fit mb-4">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={stat.icon} /></svg>
        </div>
        <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{stat.label}</p>
        <div class="flex items-end justify-between mt-1">
            <h3 class="text-3xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</h3>
            <span class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">{stat.sub}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
     <div class="xl:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Faculty <span class="text-indigo-600">Directory</span></h2>
            <div class="flex gap-2">
                <input type="text" placeholder="Search faculty..." class="px-4 py-2 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-medium w-64 focus:ring-2 ring-indigo-500 transition-all" />
                <button class="px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">Add Faculty</button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each facultyList as faculty}
                <div class="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-3xl border border-transparent hover:border-indigo-500/20 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group">
                    <div class="flex items-start justify-between">
                        <div class="flex gap-4">
                            <div class="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black text-lg">
                                {faculty.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                                <h4 class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors uppercase text-sm tracking-tight">{faculty.name}</h4>
                                <p class="text-[10px] font-bold text-gray-500 mt-0.5">{faculty.role} • {faculty.dept}</p>
                            </div>
                        </div>
                        <div class="w-2.5 h-2.5 rounded-full {faculty.status === 'ONLINE' ? 'bg-emerald-500' : faculty.status === 'BUSY' ? 'bg-rose-500' : 'bg-gray-400'} shadow-sm"></div>
                    </div>
                    <div class="mt-6 flex items-center justify-between">
                        <div>
                            <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Weekly Workload</p>
                            <p class="text-sm font-black text-gray-900 dark:text-white mt-0.5">{faculty.workload}</p>
                        </div>
                        <button class="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">View Profile</button>
                    </div>
                </div>
            {/each}
        </div>
     </div>

     <!-- Resource Center -->
     <div class="p-8 bg-indigo-600 rounded-[3rem] text-white shadow-xl shadow-indigo-500/20 flex flex-col">
        <h2 class="text-2xl font-black tracking-tight mb-2">Faculty Hub</h2>
        <p class="text-indigo-100 text-sm font-medium mb-8 leading-relaxed">Centralized communication and resource management for all institution staff.</p>

        <div class="space-y-4 flex-1">
             <button class="w-full flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all text-left">
                <div>
                    <h4 class="text-sm font-black uppercase tracking-widest">Announcement</h4>
                    <p class="text-[10px] text-indigo-100 mt-1">Send broadcast to all faculty</p>
                </div>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.001 0 01-1.564-.317z"/></svg>
             </button>
             <button class="w-full flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all text-left">
                <div>
                    <h4 class="text-sm font-black uppercase tracking-widest">Onboarding</h4>
                    <p class="text-[10px] text-indigo-100 mt-1">Start new staff onboarding</p>
                </div>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
             </button>
             <button class="w-full flex items-center justify-between p-5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all text-left">
                <div>
                    <h4 class="text-sm font-black uppercase tracking-widest">Policy Hub</h4>
                    <p class="text-[10px] text-indigo-100 mt-1">View instructional policies</p>
                </div>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
             </button>
        </div>

        <div class="mt-8 pt-6 border-t border-white/10">
            <div class="flex items-center gap-3">
                 <div class="w-8 h-8 rounded-lg bg-orange-400"></div>
                 <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-indigo-100">Live Support</p>
                    <p class="text-xs font-bold text-white leading-none">3 Ops staff active</p>
                 </div>
            </div>
        </div>
     </div>
  </div>
</div>
