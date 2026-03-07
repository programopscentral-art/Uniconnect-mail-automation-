<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const examStats = [
    { label: "Active Cycles", value: "2", sub: "CIA 1, Mid-Sem", color: "from-violet-500 to-fuchsia-600", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    { label: "Total Students", value: "12,450", sub: "Registered", color: "from-blue-500 to-indigo-600", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
    { label: "Invigilators", value: "142", sub: "Assigned", color: "from-emerald-400 to-teal-500", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { label: "Pending Marks", value: "4", sub: "Subjects", color: "from-rose-500 to-red-600", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
  ];

  const upcomingExams = [
    { name: "Computer Organization & Architecture", code: "CS302", date: "12 Mar 2024", time: "10:00 AM - 01:00 PM", venue: "Main Hall", status: "READY" },
    { name: "Design & Analysis of Algorithms", code: "CS304", date: "14 Mar 2024", time: "10:00 AM - 01:00 PM", venue: "Block B, R202", status: "PENDING_RESOURCES" },
    { name: "Probability & Statistics", code: "MA201", date: "15 Mar 2024", time: "02:00 PM - 05:00 PM", venue: "Main Hall", status: "READY" },
  ];
</script>

<div class="space-y-8" in:fade>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#each examStats as stat, i}
      <div 
        class="relative group p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm overflow-hidden"
        in:fly={{ y: 20, delay: i * 100 }}
      >
        <div class="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={stat.icon} /></svg>
        </div>
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
     <!-- Exam Schedule Table -->
     <div class="xl:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Active Exam <span class="text-indigo-600">Schedule</span></h2>
            <button class="px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl">New Cycle</button>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead>
                    <tr class="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 dark:border-slate-800">
                        <th class="pb-4">Subject</th>
                        <th class="pb-4">Schedule</th>
                        <th class="pb-4">Venue</th>
                        <th class="pb-4 text-right">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
                    {#each upcomingExams as exam}
                        <tr class="group">
                            <td class="py-6">
                                <p class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">{exam.name}</p>
                                <p class="text-[10px] font-bold text-gray-500 uppercase mt-1">{exam.code}</p>
                            </td>
                            <td class="py-6">
                                <p class="text-sm font-bold text-gray-700 dark:text-gray-300">{exam.date}</p>
                                <p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">{exam.time}</p>
                            </td>
                            <td class="py-6">
                                <div class="flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
                                    <span class="text-sm font-bold text-gray-700 dark:text-gray-300">{exam.venue}</span>
                                </div>
                            </td>
                            <td class="py-6 text-right">
                                <span class="px-3 py-1.5 rounded-xl {exam.status === 'READY' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} text-[10px] font-black uppercase tracking-widest">
                                    {exam.status.replace('_', ' ')}
                                </span>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
     </div>

     <!-- Status Summary -->
     <div class="space-y-6">
        <div class="p-8 bg-gray-900 dark:bg-slate-800 text-white rounded-[3rem] shadow-xl">
            <h3 class="text-lg font-black tracking-tight mb-4 text-indigo-400">Readiness Check</h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-gray-300">Question Papers Uploaded</span>
                    <span class="text-xs font-black">92%</span>
                </div>
                <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500" style="width: 92%"></div>
                </div>
                
                <div class="flex items-center justify-between mt-6">
                    <span class="text-xs font-bold text-gray-300">Invigilation Duty Assigned</span>
                    <span class="text-xs font-black">100%</span>
                </div>
                <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-emerald-500" style="width: 100%"></div>
                </div>

                <div class="flex items-center justify-between mt-6">
                    <span class="text-xs font-bold text-gray-300">Seating Plan Generated</span>
                    <span class="text-xs font-black">45%</span>
                </div>
                <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div class="h-full bg-amber-500" style="width: 45%"></div>
                </div>
            </div>

            <button class="w-full mt-10 py-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-indigo-600/30">
                Generate Seating Plan
            </button>
        </div>

        <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
             <h3 class="text-sm font-black text-gray-900 dark:text-white tracking-widest uppercase mb-4">Quick Links</h3>
             <div class="grid grid-cols-2 gap-3">
                 <button class="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <span class="text-[10px] font-black uppercase tracking-widest">Hall Ticket</span>
                 </button>
                 <button class="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <span class="text-[10px] font-black uppercase tracking-widest">Barcodes</span>
                 </button>
                 <button class="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <span class="text-[10px] font-black uppercase tracking-widest">Invig. Slip</span>
                 </button>
                 <button class="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <span class="text-[10px] font-black uppercase tracking-widest">Reports</span>
                 </button>
             </div>
        </div>
     </div>
  </div>
</div>
