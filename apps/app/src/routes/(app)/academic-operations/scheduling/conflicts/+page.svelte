<script lang="ts">
  import { fade, fly } from "svelte/transition";

  const conflicts = [
    { 
        id: "C-101", 
        type: "Faculty Clash", 
        severity: "CRITICAL",
        message: "Dr. Sathish K. is scheduled for two sessions at 10:00 AM.",
        details: {
            session1: "Operating Systems (Block A-102)",
            session2: "Embedded Systems (Block B-304)"
        }
    },
    { 
        id: "C-102", 
        type: "Room Clash", 
        severity: "HIGH",
        message: "Room 405 (Block C) is double-booked for Section B and Section D.",
        details: {
            time: "02:00 PM - 03:30 PM",
            sessions: ["DBMS Lab", "Software Engineering"]
        }
    },
    { 
        id: "C-103", 
        type: "Capacity Alert", 
        severity: "MEDIUM",
        message: "Room 201 capacity (40) is less than Section G student count (52).",
        details: {
            required: 52,
            actual: 40
        }
    }
  ];

  function getSeverityColor(sev: string) {
    switch (sev) {
        case 'CRITICAL': return 'bg-rose-500 text-white shadow-rose-500/30';
        case 'HIGH': return 'bg-orange-500 text-white shadow-orange-500/30';
        case 'MEDIUM': return 'bg-amber-500 text-white shadow-amber-500/30';
        default: return 'bg-gray-500 text-white';
    }
  }
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-center justify-between">
    <div>
        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Conflict <span class="text-rose-600">Center</span></h2>
        <p class="text-sm text-gray-500 font-medium mt-1">Review and resolve schedule overlaps, room capacity issues, and faculty clashing.</p>
    </div>
    <div class="flex gap-3">
        <button class="px-6 py-2.5 bg-gray-50 dark:bg-slate-800 text-gray-500 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-gray-100 transition-all">
            Refresh Analysis
        </button>
        <button class="px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
            Resolve All (AI)
        </button>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-6">
    {#each conflicts as conflict, i}
      <div 
        class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 group"
        in:fly={{ y: 20, delay: i * 100 }}
      >
        <div class="flex flex-col md:flex-row gap-8">
            <div class="md:w-64 shrink-0">
                <span class="inline-block px-4 py-1.5 rounded-full {getSeverityColor(conflict.severity)} text-[10px] font-black uppercase tracking-widest shadow-lg">
                    {conflict.severity}
                </span>
                <h3 class="text-xl font-black text-gray-900 dark:text-white mt-4 tracking-tight">{conflict.type}</h3>
                <p class="text-[10px] font-black text-gray-400 uppercase mt-1 tracking-widest">ID: {conflict.id}</p>
            </div>

            <div class="flex-1">
                <p class="text-lg font-bold text-gray-800 dark:text-gray-200 leading-relaxed group-hover:text-indigo-600 transition-colors">
                    {conflict.message}
                </p>
                
                <div class="mt-6 p-6 bg-gray-50 dark:bg-slate-800/50 rounded-3xl border border-transparent group-hover:border-indigo-500/20 transition-all">
                    {#if conflict.type === 'Faculty Clash'}
                        <div class="flex items-center justify-between text-sm">
                            <div class="space-y-2">
                                <div class="flex items-center gap-2">
                                    <div class="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                                    <span class="font-bold text-gray-600 dark:text-gray-400">{conflict.details.session1}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div class="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                                    <span class="font-bold text-gray-600 dark:text-gray-400">{conflict.details.session2}</span>
                                </div>
                            </div>
                            <button class="px-4 py-2 bg-indigo-600/10 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                                Swap Faculty
                            </button>
                        </div>
                    {:else if conflict.type === 'Room Clash'}
                         <div class="flex items-end justify-between">
                            <div>
                                <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Time Slot</p>
                                <p class="text-3xl font-black text-indigo-600">{conflict.details.time}</p>
                            </div>
                            <button class="px-4 py-2 bg-indigo-600/10 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                                Reassign Room
                            </button>
                         </div>
                    {:else}
                         <div class="flex items-center justify-between">
                             <div class="flex gap-8">
                                <div>
                                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Required</p>
                                    <p class="text-2xl font-black text-gray-900 dark:text-white">{conflict.details.required}</p>
                                </div>
                                <div>
                                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Capacity</p>
                                    <p class="text-2xl font-black text-rose-500">{conflict.details.actual}</p>
                                </div>
                             </div>
                             <button class="px-4 py-2 bg-indigo-600/10 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                                Find Larger Room
                            </button>
                         </div>
                    {/if}
                </div>
            </div>

            <div class="flex flex-col gap-2 md:w-48">
                <button class="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all active:scale-95">
                    Resolve Manually
                </button>
                <button class="w-full py-3 border-2 border-gray-100 dark:border-slate-700 text-gray-400 dark:text-gray-500 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:border-indigo-500 hover:text-indigo-600 transition-all active:scale-95">
                    Ignore Alert
                </button>
            </div>
        </div>
      </div>
    {/each}
  </div>
</div>
