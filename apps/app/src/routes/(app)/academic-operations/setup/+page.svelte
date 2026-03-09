<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import { onMount } from "svelte";

  let { data } = $props();
  const { universities } = data;

  let selectedUniversityId = $state(universities[0]?.id || "");
  let activeTab = $state("structure"); // structure, terms, batches

  let campuses = $state<any[]>([]);
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let loading = $state(false);

  // Form states
  let newCampus = $state({ name: "", code: "", address: "" });
  let newProgram = $state({ name: "", code: "", degree_type: "B.Tech", semester_count: 8 });
  let newTerm = $state({ name: "", program_id: "", start_date: "", end_date: "" });
  
  let processing = $state(false);
  let showForm = $state<string | null>(null);

  // Selection state for terms tab
  let termTargetProgramId = $state("");

  async function refreshData() {
    if (!selectedUniversityId) return;
    loading = true;
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/academic/campuses?universityId=${selectedUniversityId}`),
        fetch(`/api/academic/programs?universityId=${selectedUniversityId}`)
      ]);
      campuses = await cRes.json();
      programs = await pRes.json();
      
      if (programs.length > 0 && !termTargetProgramId) {
        termTargetProgramId = programs[0].id;
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchTerms() {
    if (!termTargetProgramId) return;
    loading = true;
    try {
      const res = await fetch(`/api/academic/terms?programId=${termTargetProgramId}`);
      terms = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(refreshData);
  $effect(() => { if (selectedUniversityId) refreshData(); });
  $effect(() => { if (termTargetProgramId) fetchTerms(); });

  async function handleAction(endpoint: string, method: string, body: any) {
    processing = true;
    try {
      const res = await fetch(endpoint, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
      const resData = await res.json();
      if (!res.ok) {
        alert(`Error: ${resData.message || 'Operation failed'}`);
        return;
      }
      if (activeTab === 'terms') {
        await fetchTerms();
      } else {
        await refreshData();
      }
      showForm = null;
    } catch (e) {
      alert("Network error occurred.");
    } finally {
      processing = false;
    }
  }

  function createCampus() {
    handleAction("/api/academic/campuses", "POST", { ...newCampus, university_id: selectedUniversityId });
    newCampus = { name: "", code: "", address: "" };
  }

  function createProgram() {
    handleAction("/api/academic/programs", "POST", { ...newProgram, university_id: selectedUniversityId });
    newProgram = { name: "", code: "", degree_type: "B.Tech", semester_count: 8 };
  }

  function createTerm() {
    handleAction("/api/academic/terms", "POST", { 
      ...newTerm, 
      university_id: selectedUniversityId, 
      program_id: termTargetProgramId 
    });
    newTerm = { name: "", program_id: "", start_date: "", end_date: "" };
  }
</script>

<div class="space-y-8 pb-20" in:fade>
  <!-- University Selector -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div class="flex-1">
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Academic <span class="text-indigo-600">Setup</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Configure the core organizational structure for your institution.</p>
    </div>
    <div class="w-full md:w-80">
      <div class="relative">
        <select 
          bind:value={selectedUniversityId}
          class="w-full pl-6 pr-12 py-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none transition-all cursor-pointer shadow-inner"
        >
          {#each universities as univ}
            <option value={univ.id}>{univ.name}</option>
          {/each}
        </select>
        <div class="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
           <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"/></svg>
        </div>
      </div>
    </div>
  </div>

  <!-- Internal Tabs -->
  <div class="flex gap-4 p-1.5 bg-gray-100/50 dark:bg-slate-800/50 rounded-2xl w-fit">
    <button onclick={() => activeTab = 'structure'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'structure' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">1. Structure</button>
    <button onclick={() => activeTab = 'terms'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'terms' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">2. Academic Terms</button>
    <button onclick={() => activeTab = 'batches'} class="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all {activeTab === 'batches' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}">3. Batches & Sections</button>
  </div>

  {#if activeTab === 'structure'}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8" in:fly={{ y: 20 }}>
      <!-- Campuses -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-black text-gray-900 dark:text-white">Campus Directory</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Geographic locations</p>
          </div>
          <button onclick={() => showForm = showForm === 'campus' ? null : 'campus'} class="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>

        {#if showForm === 'campus'}
          <div class="mb-8 p-6 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-3xl border border-indigo-100 dark:border-indigo-500/10" transition:slide>
            <div class="grid grid-cols-2 gap-4">
               <input bind:value={newCampus.name} placeholder="Name (e.g. South Campus)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <input bind:value={newCampus.code} placeholder="Code (e.g. SC)" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <button onclick={createCampus} disabled={processing} class="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 transition-all">
                 {processing ? 'Processing...' : 'Add Campus'}
               </button>
            </div>
          </div>
        {/if}

        <div class="space-y-3 flex-1">
          {#each campuses as campus}
            <div class="flex items-center justify-between p-5 bg-gray-50/50 dark:bg-slate-800/30 rounded-2xl border border-transparent hover:border-indigo-500/20 group transition-all">
               <div>
                 <h4 class="font-black text-gray-900 dark:text-white text-sm tracking-tight">{campus.name}</h4>
                 <code class="text-[10px] text-indigo-500 font-black uppercase tracking-tighter">{campus.code}</code>
               </div>
               <button onclick={() => handleAction(`/api/academic/campuses?id=${campus.id}`, 'DELETE', null)} class="p-2 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>
            </div>
          {/each}
        </div>
      </div>

      <!-- Programs -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h3 class="text-xl font-black text-gray-900 dark:text-white">Academic Programs</h3>
            <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Degrees & Departments</p>
          </div>
          <button onclick={() => showForm = showForm === 'program' ? null : 'program'} class="p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>

        {#if showForm === 'program'}
          <div class="mb-8 p-6 bg-emerald-50/50 dark:bg-emerald-500/5 rounded-3xl border border-emerald-100 dark:border-emerald-500/10" transition:slide>
            <div class="grid grid-cols-2 gap-4">
               <input bind:value={newProgram.name} placeholder="Program (e.g. B.Tech Computer Science)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <input bind:value={newProgram.code} placeholder="Code (e.g. BTCS)" class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
               <select bind:value={newProgram.degree_type} class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold">
                 <option value="B.Tech">B.Tech</option>
                 <option value="M.Tech">M.Tech</option>
                 <option value="MBA">MBA</option>
                 <option value="B.Sc">B.Sc</option>
                 <option value="PhD">PhD</option>
               </select>
               <button onclick={createProgram} disabled={processing} class="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-all">
                 {processing ? 'Creating...' : 'Confirm & Create'}
               </button>
            </div>
          </div>
        {/if}

        <div class="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-2">
          {#each programs as program}
            <div class="flex items-center justify-between p-5 bg-gray-50/50 dark:bg-slate-800/30 rounded-2xl border border-transparent hover:border-emerald-500/20 group transition-all">
               <div>
                  <div class="flex items-center gap-2">
                    <h4 class="font-black text-gray-900 dark:text-white text-sm tracking-tight">{program.name}</h4>
                    <span class="text-[8px] font-black px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 rounded uppercase">{program.degree_type}</span>
                  </div>
                  <code class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{program.code}</code>
               </div>
               <button onclick={() => handleAction(`/api/academic/programs?id=${program.id}`, 'DELETE', null)} class="p-2 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if activeTab === 'terms'}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8" in:fly={{ y: 20 }}>
       <!-- Program Selection for Terms -->
       <div class="md:col-span-1 space-y-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Select Program</p>
          <div class="space-y-2 max-h-[600px] overflow-y-auto pr-2">
             {#each programs as p}
               <button 
                onclick={() => termTargetProgramId = p.id}
                class="w-full text-left p-4 rounded-2xl border transition-all {termTargetProgramId === p.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-700 dark:text-white hover:border-indigo-500/50'}"
               >
                 <p class="text-xs font-black uppercase tracking-tight leading-tight">{p.name}</p>
                 <p class="text-[10px] font-bold opacity-60 mt-1">{p.code}</p>
               </button>
             {/each}
          </div>
       </div>

       <!-- Terms List -->
       <div class="md:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm flex flex-col">
          <div class="flex items-center justify-between mb-8">
            <div>
              <h3 class="text-xl font-black text-gray-900 dark:text-white">Academic Terms</h3>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Define Semesters & Trimesters</p>
            </div>
            <button onclick={() => showForm = showForm === 'term' ? null : 'term'} class="p-3 bg-violet-600 text-white rounded-2xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-600/20 active:scale-95">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
            </button>
          </div>

          {#if showForm === 'term'}
            <div class="mb-8 p-6 bg-violet-50/50 dark:bg-violet-500/5 rounded-3xl border border-violet-100 dark:border-violet-500/10" transition:slide>
              <div class="grid grid-cols-2 gap-4">
                 <input bind:value={newTerm.name} placeholder="Term Name (e.g. Semester 1, Fall 2024)" class="col-span-2 px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                 <div class="flex flex-col gap-1">
                    <label class="text-[9px] font-black text-violet-600 uppercase ml-2">Start Date</label>
                    <input type="date" bind:value={newTerm.start_date} class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                 </div>
                 <div class="flex flex-col gap-1">
                    <label class="text-[9px] font-black text-violet-600 uppercase ml-2">End Date</label>
                    <input type="date" bind:value={newTerm.end_date} class="px-6 py-3 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold" />
                 </div>
                 <button onclick={createTerm} disabled={processing || !termTargetProgramId} class="col-span-2 py-3 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-600/20">
                   {processing ? 'Creating...' : 'Define Term'}
                 </button>
              </div>
            </div>
          {/if}

          <div class="space-y-4 flex-1">
             {#each terms as term}
               <div class="flex items-center justify-between p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[2rem] border border-transparent hover:border-violet-500/20 transition-all">
                  <div>
                    <h4 class="font-black text-gray-900 dark:text-white text-md tracking-tight">{term.name}</h4>
                    <div class="flex items-center gap-3 mt-1.5 font-bold text-[10px] text-gray-500 uppercase tracking-widest">
                       <span>{new Date(term.start_date).toLocaleDateString()}</span>
                       <span class="text-violet-500">→</span>
                       <span>{new Date(term.end_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span class="px-3 py-1 bg-violet-100 dark:bg-violet-900/50 text-violet-600 text-[9px] font-black rounded-lg uppercase tracking-tighter">{term.status}</span>
               </div>
             {/each}
             {#if terms.length === 0 && !loading}
                <div class="flex flex-col items-center justify-center py-20 text-center opacity-40 grayscale">
                   <div class="w-16 h-16 bg-gray-100 rounded-full mb-4 flex items-center justify-center">⏳</div>
                   <p class="text-[10px] font-black uppercase tracking-widest text-gray-500">No terms defined for this program</p>
                </div>
             {/if}
          </div>
       </div>
    </div>
  {:else if activeTab === 'batches'}
    <div class="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-800 rounded-[3rem]" in:fly={{ y: 20 }}>
       <div class="text-4xl mb-4">👥</div>
       <h3 class="text-lg font-black text-gray-900 dark:text-white">Batches & Sections</h3>
       <p class="text-sm text-gray-500 max-w-sm text-center mt-2 font-medium">Map students into groups like "Batch 2024" or "CS-A". This module will be live shortly.</p>
    </div>
  {/if}

  <!-- Footer Help -->
  <div class="p-8 bg-indigo-600 rounded-[2.5rem] text-white flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group">
     <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
     <div class="z-10">
        <h4 class="text-xl font-black tracking-tight">Setup Checklist</h4>
        <div class="flex flex-wrap gap-4 mt-4">
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {campuses.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Campuses</span>
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {programs.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Programs</span>
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full {terms.length > 0 ? 'bg-emerald-400' : 'bg-gray-400'}"></div> Terms</span>
           <span class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"><div class="w-2 h-2 rounded-full bg-gray-400 opacity-50"></div> Faculty List</span>
        </div>
     </div>
     <div class="flex flex-col items-end z-10 shrink-0">
        <p class="text-indigo-100 text-xs font-bold mb-2 uppercase tracking-widest opacity-80">Next Step</p>
        <button class="px-8 py-3 bg-white text-indigo-600 text-xs font-black uppercase tracking-widest rounded-2xl hover:shadow-xl hover:scale-105 transition-all duration-300">Proceed to Faculty Mapping</button>
     </div>
  </div>
</div>

<style>
  :global(body) {
    background-color: #f8fafc;
  }
  :global(.dark body) {
    background-color: #020617;
  }
  select {
    background-image: none;
  }
  ::-webkit-calendar-picker-indicator {
    filter: invert(0.5);
    cursor: pointer;
  }
</style>
