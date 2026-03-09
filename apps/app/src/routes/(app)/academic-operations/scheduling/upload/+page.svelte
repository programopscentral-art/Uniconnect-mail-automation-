<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly, slide } from "svelte/transition";

  let step = $state(1); // 1: Source, 2: Upload, 3: Mapping, 4: Review, 5: Finish
  let source = $state<"UPLOAD" | "MANUAL" | "CLONE" | null>(null);
  let file = $state<File | null>(null);
  let versions = $state<any[]>([]);
  let processing = $state(false);

  // Example mappings
  let mappings = $state({
    subject: "Subject_Code",
    faculty: "Faculty_Email",
    room: "Room_ID",
    day: "Day",
    start: "Start_Time",
    end: "End_Time"
  });

  async function handleSourceSelect(s) {
    source = s;
    if (s === 'CLONE') {
        // Fetch existing terms
    }
    step = 2;
  }

  async function startUpload() {
    processing = true;
    setTimeout(() => {
        processing = false;
        step = 3;
    }, 1500);
  }

  const steps = [
    { title: "Select Source", icon: "🛠️" },
    { title: "Input Schedule", icon: "📁" },
    { title: "Map Schema", icon: "🗺️" },
    { title: "Review Risks", icon: "⚠️" },
    { title: "Dispatch", icon: "🚀" }
  ];
</script>

<div class="space-y-12" in:fade>
  <!-- Multi-step Indicator -->
  <div class="flex items-center justify-between gap-4 max-w-4xl mx-auto mb-12 relative">
    <div class="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 dark:bg-slate-800 -translate-y-1/2 -z-10"></div>
    {#each steps as s, i}
      <div class="flex flex-col items-center gap-3 relative z-10 transition-all {step > i ? 'opacity-100' : 'opacity-40 grayscale'}">
        <div class="w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-xl transition-all {step === i+1 ? 'bg-indigo-600' : step > i+1 ? 'bg-green-600' : 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800'}">
           {step > i+1 ? '✅' : s.icon}
        </div>
        <span class="text-[10px] font-black uppercase tracking-widest text-gray-500">{s.title}</span>
      </div>
    {/each}
  </div>

  <div class="p-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm max-w-4xl mx-auto overflow-hidden min-h-[500px] flex flex-col justify-center">
    {#if step === 1}
      <div class="text-center space-y-8" in:fly={{ y: 20 }}>
        <div>
          <h2 class="text-3xl font-black text-gray-900 dark:text-white">New <span class="text-indigo-600">Timetable</span> Cycle</h2>
          <p class="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-2">How would you like to initialize your schedule?</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button onclick={() => handleSourceSelect('UPLOAD')} class="group p-8 rounded-[2rem] border-2 border-gray-50 dark:border-slate-800 hover:border-indigo-600 transition-all flex flex-col items-center gap-6 hover:shadow-2xl hover:shadow-indigo-600/10">
            <div class="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-all">📂</div>
            <div class="text-center">
              <h4 class="font-black text-sm uppercase tracking-tight mb-1">Spreadsheet Hub</h4>
              <p class="text-[9px] text-gray-400 font-bold uppercase tracking-[0.15em] leading-relaxed">Import from Existing<br/>Excel or CSV Master</p>
            </div>
          </button>

          <button onclick={() => handleSourceSelect('MANUAL')} class="group p-8 rounded-[2rem] border-2 border-gray-50 dark:border-slate-800 hover:border-indigo-600 transition-all flex flex-col items-center gap-6 hover:shadow-2xl hover:shadow-indigo-600/10">
            <div class="w-16 h-16 bg-violet-50 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-all">✍️</div>
            <div class="text-center">
              <h4 class="font-black text-sm uppercase tracking-tight mb-1">Manual Builder</h4>
              <p class="text-[9px] text-gray-400 font-bold uppercase tracking-[0.15em] leading-relaxed">Surgical Precision UI<br/>for Single Entries</p>
            </div>
          </button>

          <button onclick={() => handleSourceSelect('CLONE')} class="group p-8 rounded-[2rem] border-2 border-gray-50 dark:border-slate-800 hover:border-indigo-600 transition-all flex flex-col items-center gap-6 hover:shadow-2xl hover:shadow-indigo-600/10">
            <div class="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-all">♻️</div>
            <div class="text-center">
              <h4 class="font-black text-sm uppercase tracking-tight mb-1">Term Clone</h4>
              <p class="text-[9px] text-gray-400 font-bold uppercase tracking-[0.15em] leading-relaxed">Duplicate Last Semester's<br/>Validated Strategy</p>
            </div>
          </button>
        </div>
      </div>
    {:else if step === 2}
      <div class="text-center space-y-12" in:fly={{ y: 20 }}>
        {#if source === 'UPLOAD'}
          <div class="flex flex-col items-center justify-center border-4 border-dashed border-gray-100 dark:border-slate-800 rounded-[3rem] p-20 py-32 group hover:border-indigo-600/50 transition-all cursor-pointer bg-gray-50/50 dark:bg-slate-800/20">
              <div class="w-20 h-20 bg-white dark:bg-slate-700 rounded-2xl shadow-lg flex items-center justify-center text-3xl mb-8 group-hover:scale-110 transition-all">📄</div>
              <h3 class="text-xl font-black text-gray-900 dark:text-white mb-2">Deploy Spreadsheet Master</h3>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest max-w-[250px] mx-auto leading-relaxed">Accepted formats: .XLSX, .CSV, .JSON (Max 50MB)</p>
              
              <button onclick={startUpload} class="mt-12 px-12 py-4 bg-indigo-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/20 hover:bg-orange-600 transition-all hover:scale-105 active:scale-95">
                  {processing ? 'Analyzing Schema...' : 'Prepare Master Import'}
              </button>
          </div>
        {:else if source === 'CLONE'}
          <div class="space-y-8 text-left max-w-2xl mx-auto">
            <h3 class="text-xl font-black text-gray-900 dark:text-white mb-2">Clone Previous Strategy</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">Select a successfully published term to replicate its skeleton.</p>
            
            <div class="space-y-4">
                <div class="p-6 bg-gray-50 dark:bg-slate-800/40 rounded-[2rem] border border-transparent hover:border-indigo-500/10 transition-all flex items-center justify-between">
                    <div>
                        <p class="font-black text-sm uppercase tracking-tight">Winter Semester 2025</p>
                        <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Published 3 months ago · 42 Sections</p>
                    </div>
                    <button onclick={() => step = 4} class="px-6 py-2 bg-white dark:bg-slate-700 rounded-xl text-[10px] font-black uppercase border shadow-sm">Select Term</button>
                </div>
                <div class="p-6 bg-gray-50 dark:bg-slate-800/40 rounded-[2rem] border border-transparent hover:border-indigo-500/10 transition-all flex items-center justify-between opacity-50 grayscale">
                    <div>
                        <p class="font-black text-sm uppercase tracking-tight">Autumn Semester 2024</p>
                        <p class="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Archived · 38 Sections</p>
                    </div>
                </div>
            </div>
          </div>
        {:else if source === 'MANUAL'}
          <div class="space-y-8 text-left max-w-2xl mx-auto">
            <h3 class="text-xl font-black text-gray-900 dark:text-white mb-2">Manual Slot Injection</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">Start with a blank canvas and add sessions row-by-row.</p>
            
            <div class="p-12 border-2 border-dashed border-gray-100 rounded-[2.5rem] flex flex-col items-center justify-center grayscale opacity-40">
                <p class="text-[10px] font-black uppercase tracking-widest mb-6 text-center leading-loose">Schedule Builder Interface<br/>Loading Canvas...</p>
                <button onclick={() => step = 4} class="px-8 py-3 bg-gray-200 rounded-2xl text-[10px] font-black uppercase tracking-widest">Initialize Blank Term</button>
            </div>
          </div>
        {/if}
        
        <button onclick={() => step = 1} class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all">Go Back to Sources</button>
      </div>
    {:else if step === 3}
      <div class="space-y-12" in:fly={{ y: 20 }}>
        <div class="flex justify-between items-center">
            <div>
                <h3 class="text-2xl font-black text-gray-900 dark:text-white leading-tight">Map Schema <span class="text-indigo-500">Master</span></h3>
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 leading-relaxed">Link your local column headers to UniConnect Core Entities</p>
            </div>
            <div class="px-6 py-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-full text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100">88 Ready Rows Detected</div>
        </div>

        <div class="grid grid-cols-2 gap-4">
            {#each Object.entries(mappings) as [key, value]}
                <div class="p-6 bg-gray-50 dark:bg-slate-800/40 rounded-[2rem] border border-transparent hover:border-indigo-500/10 transition-all">
                    <p class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 p-1">{key.replace('_', ' ')}</p>
                    <select bind:value={mappings[key as keyof typeof mappings]} class="w-full bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold px-6 py-3 cursor-pointer focus:ring-2 focus:ring-indigo-500/20">
                        <option value={value}>{value}</option>
                        <option value="Col_A">Column A</option>
                        <option value="Col_B">Column B</option>
                    </select>
                </div>
            {/each}
        </div>

        <div class="flex items-center justify-between pt-8 border-t border-gray-100 dark:border-slate-800 mt-8">
            <button onclick={() => step = 2} class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all">Correction Mode</button>
            <button onclick={() => step = 4} class="px-12 py-4 bg-indigo-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/20 hover:bg-orange-600 transition-all hover:scale-105 active:scale-95">Verify Conflicts</button>
        </div>
      </div>
    {:else if step === 4}
      <div class="space-y-12" in:fly={{ y: 20 }}>
        <div class="flex justify-between items-center">
            <div>
                <h3 class="text-2xl font-black text-gray-900 dark:text-white leading-tight">Risk <span class="text-red-500">Analysis</span></h3>
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 leading-relaxed">System scan complete. Review potential operational clashes.</p>
            </div>
            <div class="px-6 py-2 bg-red-50 dark:bg-red-500/10 rounded-full text-[9px] font-black text-red-600 uppercase tracking-widest border border-red-100">3 Conflicts Identified</div>
        </div>

        <div class="space-y-4">
            <div class="p-6 bg-red-50/50 dark:bg-red-500/5 rounded-[2rem] border border-red-100 dark:border-red-900/30 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-lg">👩‍🏫</div>
                    <div>
                        <p class="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">FACULTY_CLASH</p>
                        <p class="text-xs font-bold text-gray-900 dark:text-white">Dr. Sarah Wilson scheduled for Math & Physics concurrently.</p>
                    </div>
                </div>
                <button class="px-4 py-2 bg-white rounded-xl text-[9px] font-bold uppercase shadow-sm">Fix Slot</button>
            </div>

            <div class="p-6 bg-orange-50/50 dark:bg-orange-500/5 rounded-[2rem] border border-orange-100 dark:border-orange-900/30 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-lg">🏫</div>
                    <div>
                        <p class="text-[9px] font-black text-orange-600 uppercase tracking-widest mb-1">ROOM_CLASH</p>
                        <p class="text-xs font-bold text-gray-900 dark:text-white">Room 402 double-booked for Section A and Section C.</p>
                    </div>
                </div>
                <button class="px-4 py-2 bg-white rounded-xl text-[9px] font-bold uppercase shadow-sm">Fix Slot</button>
            </div>
        </div>

        <div class="flex items-center justify-between pt-8 border-t border-gray-100 dark:border-slate-800 mt-8">
            <button onclick={() => step = 3} class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all">Re-Map Schema</button>
            <button onclick={() => step = 5} class="px-12 py-4 bg-green-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-green-600/20 hover:bg-indigo-600 transition-all hover:scale-105 active:scale-95">Publish Timetable</button>
        </div>
      </div>
    {:else if step === 5}
      <div class="text-center space-y-12 py-12" in:scale={{ duration: 500, start: 0.9 }}>
        <div class="w-32 h-32 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center text-5xl mx-auto shadow-2xl shadow-green-600/10 mb-8">
            🎉
        </div>
        <div>
            <h2 class="text-4xl font-black text-gray-900 dark:text-white mb-4 italic tracking-tight underline elevation-2">TIMETABLE <span class="text-green-600">LIVE</span></h2>
            <p class="text-[11px] text-gray-400 font-bold uppercase tracking-[0.3em] leading-loose">The operational pulse of the university has been updated.</p>
        </div>

        <div class="grid grid-cols-2 gap-4 max-w-sm mx-auto">
            <div class="p-6 bg-gray-50 dark:bg-slate-800 rounded-[2rem]">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Syncing</p>
                <p class="font-black text-sm uppercase tracking-tight">420 Calendars</p>
            </div>
             <div class="p-6 bg-gray-50 dark:bg-slate-800 rounded-[2rem]">
                <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Dispatching</p>
                <p class="font-black text-sm uppercase tracking-tight">3,200 Alerts</p>
            </div>
        </div>

        <div class="flex flex-col items-center gap-6 pt-8">
            <a href="/academic-operations" class="px-12 py-4 bg-indigo-600 text-white rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/20 hover:bg-orange-600 transition-all hover:scale-105 active:scale-95">Exit to Operations</a>
            <button class="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-indigo-600 transition-all underline decoration-2 decoration-indigo-200">View Audit History</button>
        </div>
      </div>
    {/if}
  </div>
</div>
