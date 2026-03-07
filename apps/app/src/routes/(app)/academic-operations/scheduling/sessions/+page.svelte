<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const timeSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  
  const sessions = [
    { id: 1, time: "09:00", subject: "Discrete Mathematics", room: "A-101", faculty: "Dr. Sathish", section: "CS-A", status: "COMPLETED" },
    { id: 2, time: "10:00", subject: "Data Structures", room: "B-204", faculty: "Prof. Neha", section: "CS-A", status: "IN_PROGRESS" },
    { id: 3, time: "11:00", subject: "Computer Networks", room: "C-405", faculty: "Dr. Anand", section: "CS-B", status: "SCHEDULED" },
    { id: 4, time: "11:00", subject: "Big Data Analytics", room: "A-102", faculty: "Prof. Kirti", section: "DS-A", status: "SCHEDULED" },
    { id: 5, time: "14:00", subject: "Software Engineering", room: "B-101", faculty: "Dr. Priya", section: "CS-A", status: "MISSED" },
  ];

  function getStatusStyle(status: string) {
    switch (status) {
        case 'COMPLETED': return 'bg-emerald-500 text-white shadow-emerald-500/20';
        case 'IN_PROGRESS': return 'bg-indigo-600 text-white shadow-indigo-600/30 animate-pulse';
        case 'MISSED': return 'bg-rose-500 text-white shadow-rose-500/20';
        case 'CANCELLED': return 'bg-gray-400 text-white';
        default: return 'bg-white dark:bg-slate-800 text-gray-400 border border-gray-100 dark:border-slate-800';
    }
  }
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-center justify-between">
    <div>
        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Today's <span class="text-violet-600">Sessions</span></h2>
        <p class="text-sm text-gray-500 font-medium mt-1">Real-time execution dashboard for all campus academic activities.</p>
    </div>
    <div class="p-1 bg-gray-100 dark:bg-slate-800 rounded-2xl flex gap-1">
        <button class="px-6 py-2 bg-white dark:bg-slate-700 shadow-sm rounded-xl text-xs font-black uppercase tracking-widest text-indigo-600">Timeline</button>
        <button class="px-6 py-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900">List View</button>
    </div>
  </div>

  <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] p-8 shadow-sm overflow-x-auto">
    <div class="min-w-[1000px] relative">
        <!-- Time Headers -->
        <div class="flex border-b border-gray-50 dark:border-slate-800 pb-4 mb-6">
            <div class="w-24 shrink-0"></div>
            {#each timeSlots as slot}
                <div class="flex-1 text-center">
                    <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">{slot}</span>
                </div>
            {/each}
        </div>

        <!-- Grid Body -->
        <div class="space-y-6">
            {#each ["Block A", "Block B", "Block C"] as block}
                <div class="flex items-center">
                    <div class="w-24 shrink-0">
                        <span class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tighter">{block}</span>
                    </div>
                    <div class="flex-1 flex gap-2 h-24 relative">
                        <!-- Horizontal Grid Lines (bg) -->
                        <div class="absolute inset-0 flex">
                            {#each timeSlots as _}
                                <div class="flex-1 border-l border-gray-50 dark:border-slate-800/50 h-full"></div>
                            {/each}
                        </div>

                        <!-- Sessions (Mock implementation) -->
                        {#each sessions.filter(s => s.room.startsWith(block.split(' ')[1])) as session}
                             <div 
                                class="absolute h-[80%] rounded-[1.5rem] p-4 flex flex-col justify-center transition-all hover:scale-[1.02] hover:shadow-xl cursor-pointer z-10 {getStatusStyle(session.status)}"
                                style="left: {(timeSlots.indexOf(session.time) / timeSlots.length) * 100}%; width: {100 / timeSlots.length - 1}%"
                             >
                                <p class="text-[9px] font-black uppercase tracking-tighter opacity-80">{session.section} • {session.room}</p>
                                <h4 class="text-xs font-black leading-tight mt-1 truncate">{session.subject}</h4>
                                <p class="text-[9px] font-bold mt-1 opacity-70 truncate">{session.faculty}</p>
                             </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    </div>
  </div>

  <!-- Legend & Info -->
  <div class="flex gap-8 p-8 bg-gray-50 dark:bg-slate-800/50 rounded-[2.5rem] border border-gray-100 dark:border-slate-800">
      <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Completed</span>
      </div>
      <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-indigo-600 animate-pulse"></div>
          <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">In Progress</span>
      </div>
      <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-rose-500"></div>
          <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Missed / Late</span>
      </div>
      <div class="flex-1"></div>
      <div class="text-right">
          <p class="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Next Sync in 45s</p>
      </div>
  </div>
</div>
