<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const portals = [
    { name: "LMS Console", url: "https://lms.univ.edu", status: "HEALTHY", accounts: 12450, integration: "ACTIVE", lastSync: "5 mins ago" },
    { name: "NIAT Planner", url: "https://niat.univ.edu", status: "DEGRADED", accounts: 450, integration: "PARTIAL", lastSync: "1 hour ago" },
    { name: "Student Portal", url: "https://portal.univ.edu", status: "HEALTHY", accounts: 12450, integration: "ACTIVE", lastSync: "10 mins ago" },
    { name: "Exam Server", url: "https://exams.univ.edu", status: "OFFLINE", accounts: 0, integration: "DISCONNECTED", lastSync: "2 days ago" },
  ];

  const accessRequests = [
    { name: "Dr. Sathish Kumar", role: "FACULTY", portal: "LMS Console", type: "Admin Access", status: "PENDING" },
    { name: "Sneha Reddy", role: "STUDENT", portal: "Student Portal", type: "Password Reset", status: "APPROVED" },
  ];
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-center justify-between">
    <div>
        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Portal <span class="text-amber-600">& Access</span></h2>
        <p class="text-sm text-gray-500 font-medium mt-1">Track connectivity and access levels across university external systems.</p>
    </div>
    <button class="px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all">New Integration</button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#each portals as portal}
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col justify-between">
        <div>
            <div class="flex items-center justify-between mb-4">
                <div class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest
                    {portal.status === 'HEALTHY' ? 'bg-emerald-50 text-emerald-600' : portal.status === 'DEGRADED' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}">
                    {portal.status}
                </div>
                <div class="w-2 h-2 rounded-full {portal.status === 'HEALTHY' ? 'bg-emerald-500' : portal.status === 'DEGRADED' ? 'bg-amber-500' : 'bg-rose-500'} shadow-sm"></div>
            </div>
            <h3 class="text-xl font-black text-gray-900 dark:text-white tracking-tight">{portal.name}</h3>
            <p class="text-xs text-gray-500 font-medium truncate mt-1">{portal.url}</p>
        </div>

        <div class="mt-8 pt-6 border-t border-gray-50 dark:border-slate-800">
            <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-black text-gray-400 uppercase">Accounts</span>
                <span class="text-sm font-black text-gray-900 dark:text-white">{portal.accounts}</span>
            </div>
            <div class="flex items-center justify-between">
                <span class="text-[10px] font-black text-gray-400 uppercase">Last Sync</span>
                <span class="text-[10px] font-bold text-gray-500">{portal.lastSync}</span>
            </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
      <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-tight mb-8">Recent <span class="text-indigo-600">Access Requests</span></h2>
      
      <div class="space-y-4">
          {#each accessRequests as request}
            <div class="flex items-center justify-between p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-3xl group hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-indigo-100 dark:hover:border-slate-700 transition-all duration-300">
                <div class="flex items-center gap-5">
                    <div class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                    </div>
                    <div>
                        <h4 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">{request.name} <span class="text-xs text-gray-400 font-bold ml-2">({request.role})</span></h4>
                        <p class="text-[10px] font-bold text-gray-500 mt-0.5">{request.type} for {request.portal}</p>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <span class="px-3 py-1.5 rounded-xl {request.status === 'PENDING' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'} text-[10px] font-black uppercase tracking-widest">
                        {request.status}
                    </span>
                    {#if request.status === 'PENDING'}
                        <button class="px-6 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 active:scale-95 transition-all">Review</button>
                    {/if}
                </div>
            </div>
          {/each}
      </div>
  </div>
</div>
