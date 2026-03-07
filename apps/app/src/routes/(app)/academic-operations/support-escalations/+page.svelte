<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const tickets = [
    { id: "T-4021", user: "Dr. Anand Raju", category: "ACADEMIC", priority: "HIGH", status: "OPEN", title: "Attendance discrepancy in CS302", time: "2 hours ago" },
    { id: "T-4018", user: "Sneha Reddy", category: "PORTAL", priority: "MEDIUM", status: "IN_PROGRESS", title: "Cannot access Mid-term results", time: "5 hours ago" },
    { id: "T-4015", user: "Prof. Neha Sharma", category: "INFRA", priority: "URGENT", status: "OPEN", title: "Projector not working in Block B-204", time: "8 hours ago" },
    { id: "T-3992", user: "Aditya Verma", category: "EXAM", priority: "LOW", status: "RESOLVED", title: "Clarification on exam seating", time: "1 day ago" },
  ];

  function getPriorityStyle(prio: string) {
      switch (prio) {
          case 'URGENT': return 'bg-rose-500 text-white shadow-rose-500/30';
          case 'HIGH': return 'bg-orange-500 text-white shadow-orange-500/20';
          case 'MEDIUM': return 'bg-amber-500 text-white shadow-amber-500/20';
          default: return 'bg-gray-100 dark:bg-slate-800 text-gray-500';
      }
  }
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-center justify-between">
    <div>
        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Support <span class="text-rose-600">& Escalations</span></h2>
        <p class="text-sm text-gray-500 font-medium mt-1">Unified ticketing and resolution system for students, faculty, and ops.</p>
    </div>
    <div class="flex gap-3">
        <button class="px-6 py-2.5 bg-gray-50 dark:bg-slate-800 text-xs font-black uppercase tracking-widest rounded-2xl">Filter Views</button>
        <button class="px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg active:scale-95 transition-all">New Ticket</button>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div class="md:col-span-2 space-y-4">
          {#each tickets as ticket}
            <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                             <span class="text-[9px] font-black uppercase tracking-widest text-gray-400">{ticket.id} • {ticket.category}</span>
                             <span class="px-3 py-1 rounded-full {getPriorityStyle(ticket.priority)} text-[9px] font-black uppercase tracking-widest">{ticket.priority}</span>
                        </div>
                        <h4 class="text-lg font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors tracking-tight">{ticket.title}</h4>
                        <p class="text-xs text-gray-500 font-medium mt-1">Raised by <span class="font-bold text-gray-700 dark:text-gray-300">{ticket.user}</span> • {ticket.time}</p>
                    </div>
                    <div class="text-right">
                        <span class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest
                            {ticket.status === 'OPEN' ? 'bg-rose-50 text-rose-600 border border-rose-100' : ticket.status === 'IN_PROGRESS' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}">
                            {ticket.status.replace('_', ' ')}
                        </span>
                        <div class="mt-4 flex justify-end gap-2">
                            <button class="p-2 bg-gray-50 dark:bg-slate-800 rounded-xl text-gray-400 hover:text-indigo-600 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg></button>
                        </div>
                    </div>
                </div>
            </div>
          {/each}
      </div>

      <div class="space-y-6">
          <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
             <h3 class="text-sm font-black text-gray-900 dark:text-white tracking-widest uppercase mb-6">Queue Health</h3>
             <div class="space-y-6">
                 <div>
                    <div class="flex justify-between mb-2">
                        <span class="text-xs font-bold text-gray-500">Avg. Resolution Time</span>
                        <span class="text-xs font-black">4.2h</span>
                    </div>
                    <div class="h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div class="h-full bg-emerald-500" style="width: 80%"></div>
                    </div>
                 </div>
                 <div>
                    <div class="flex justify-between mb-2">
                        <span class="text-xs font-bold text-gray-500">SLA Compliance</span>
                        <span class="text-xs font-black">98%</span>
                    </div>
                    <div class="h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div class="h-full bg-indigo-600" style="width: 98%"></div>
                    </div>
                 </div>
             </div>
          </div>

          <div class="p-8 bg-indigo-600 rounded-[3rem] text-white shadow-xl shadow-indigo-600/20">
              <h3 class="text-lg font-black tracking-tight mb-2">Auto-Escalation</h3>
              <p class="text-indigo-100 text-xs font-medium mb-6">3 tickets are nearing SLA breach. Auto-escalating to Program Ops Manager in 15 mins.</p>
              <button class="w-full py-4 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl border border-white/20 transition-all">Review Escalations</button>
          </div>
      </div>
  </div>
</div>
