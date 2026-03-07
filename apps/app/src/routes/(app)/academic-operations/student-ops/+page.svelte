<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const studentSummary = [
      { label: "Enrolled", value: "12,450", sub: "Active", color: "from-blue-500 to-indigo-600" },
      { label: "Attendance", value: "82%", sub: "Avg.", color: "from-emerald-400 to-teal-500" },
      { label: "Requests", value: "48", sub: "Pending", color: "from-amber-400 to-orange-500" },
      { label: "Dismissed/On Hold", value: "12", sub: "Flagged", color: "from-rose-500 to-red-600" },
  ];

  const recentStudents = [
      { name: "Aditya Verma", roll: "2021CS01", program: "B.Tech CSE", attendance: "94%", status: "NORMAL" },
      { name: "Sneha Reddy", roll: "2021CS42", program: "B.Tech CSE", attendance: "68%", status: "AT_RISK" },
      { name: "Rahul Singh", roll: "2021IT12", program: "B.Tech IT", attendance: "88%", status: "NORMAL" },
      { name: "Priya Das", roll: "2021DS15", program: "B.Sc DS", attendance: "52%", status: "CRITICAL" },
  ];
</script>

<div class="space-y-8" in:fade>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each studentSummary as stat, i}
          <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm overflow-hidden" in:fly={{ y: 20, delay: i * 100 }}>
              <div class="h-1 w-12 bg-gradient-to-r {stat.color} rounded-full mb-4"></div>
              <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <div class="flex items-end justify-between mt-1">
                  <h3 class="text-3xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</h3>
                  <span class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">{stat.sub}</span>
              </div>
          </div>
      {/each}
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
          <div class="flex items-center justify-between mb-8">
              <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Student <span class="text-indigo-600">Monitoring</span></h2>
              <div class="flex gap-2">
                  <button class="px-6 py-2.5 bg-gray-50 dark:bg-slate-800 text-xs font-black uppercase tracking-widest rounded-2xl active:scale-95 transition-all">Export All</button>
              </div>
          </div>

          <div class="space-y-4">
              {#each recentStudents as student}
                  <div class="flex items-center justify-between p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-3xl group hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-indigo-100 dark:hover:border-slate-700 transition-all duration-300">
                      <div class="flex items-center gap-5">
                          <div class="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black">
                              {student.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                              <h4 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{student.name}</h4>
                              <p class="text-[10px] font-bold text-gray-500 mt-0.5">{student.roll} • {student.program}</p>
                          </div>
                      </div>
                      <div class="flex items-center gap-10">
                          <div class="text-right">
                              <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Attendance</p>
                              <p class="text-lg font-black {parseInt(student.attendance) < 60 ? 'text-rose-500' : parseInt(student.attendance) < 75 ? 'text-amber-500' : 'text-emerald-500'} mt-0.5">{student.attendance}</p>
                          </div>
                          <button class="p-2 text-gray-400 hover:text-indigo-600 transition-colors" aria-label="View Student Details">
                              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
                          </button>
                      </div>
                  </div>
              {/each}
          </div>
      </div>

      <div class="space-y-6">
          <div class="p-8 bg-rose-500 text-white rounded-[3rem] shadow-xl shadow-rose-500/20">
              <h2 class="text-xl font-black tracking-tight mb-2">Critical Attendance</h2>
              <p class="text-rose-100 text-xs font-medium mb-8">4 students have dropped below 60% attendance this week.</p>
              <button class="w-full py-4 bg-white text-rose-500 text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all">Notify Guardians</button>
          </div>

          <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
               <h3 class="text-sm font-black text-gray-900 dark:text-white tracking-widest uppercase mb-6">Quick Actions</h3>
               <div class="space-y-3">
                   <button class="w-full py-3 bg-gray-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all text-gray-600 dark:text-gray-400">Manage Documents</button>
                   <button class="w-full py-3 bg-gray-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all text-gray-600 dark:text-gray-400">Issue ID Card</button>
                   <button class="w-full py-3 bg-gray-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all text-gray-600 dark:text-gray-400">Sync with Portal</button>
               </div>
          </div>
      </div>
  </div>
</div>
