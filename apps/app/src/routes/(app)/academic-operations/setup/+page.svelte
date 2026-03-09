<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { onMount } from "svelte";

  let { data } = $props();
  const { universities } = data;

  let selectedUniversityId = $state(universities[0]?.id || "");
  let campuses = $state<any[]>([]);
  let programs = $state<any[]>([]);
  let loadingCampuses = $state(false);
  let loadingPrograms = $state(false);

  // Form states
  let newCampus = $state({ name: "", code: "", address: "" });
  let creatingCampus = $state(false);
  
  let newProgram = $state({ name: "", code: "", degree_type: "B.Tech", semester_count: 8 });
  let creatingProgram = $state(false);
  let showProgramForm = $state(false);

  async function fetchCampuses(univId: string) {
    if (!univId) return;
    loadingCampuses = true;
    try {
      const res = await fetch(`/api/academic/campuses?universityId=${univId}`);
      campuses = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loadingCampuses = false;
    }
  }

  async function fetchPrograms(univId: string) {
    if (!univId) return;
    loadingPrograms = true;
    try {
      const res = await fetch(`/api/academic/programs?universityId=${univId}`);
      programs = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loadingPrograms = false;
    }
  }

  onMount(() => {
    if (selectedUniversityId) {
      fetchCampuses(selectedUniversityId);
      fetchPrograms(selectedUniversityId);
    }
  });

  $effect(() => {
    if (selectedUniversityId) {
      fetchCampuses(selectedUniversityId);
      fetchPrograms(selectedUniversityId);
    }
  });

  async function handleCreateCampus() {
    if (!newCampus.name || !newCampus.code) return;
    creatingCampus = true;
    try {
      const res = await fetch("/api/academic/campuses", {
        method: "POST",
        body: JSON.stringify({ ...newCampus, university_id: selectedUniversityId })
      });
      if (res.ok) {
        fetchCampuses(selectedUniversityId);
        newCampus = { name: "", code: "", address: "" };
      }
    } catch (e) {
      console.error(e);
    } finally {
      creatingCampus = false;
    }
  }

  async function deleteCampus(id: string) {
    if (!confirm("Are you sure you want to remove this campus?")) return;
    try {
      const res = await fetch(`/api/academic/campuses?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchCampuses(selectedUniversityId);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreateProgram() {
    if (!newProgram.name || !newProgram.code) return;
    creatingProgram = true;
    try {
      const res = await fetch("/api/academic/programs", {
        method: "POST",
        body: JSON.stringify({ 
          ...newProgram, 
          university_id: selectedUniversityId,
          status: 'ACTIVE'
        })
      });
      if (res.ok) {
        fetchPrograms(selectedUniversityId);
        newProgram = { name: "", code: "", degree_type: "B.Tech", semester_count: 8 };
        showProgramForm = false;
      }
    } catch (e) {
      console.error(e);
    } finally {
      creatingProgram = false;
    }
  }

  async function deleteProgram(id: string) {
    if (!confirm("Are you sure you want to remove this program?")) return;
    try {
      const res = await fetch(`/api/academic/programs?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchPrograms(selectedUniversityId);
    } catch (e) {
      console.error(e);
    }
  }
</script>

<div class="space-y-8" in:fade>
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
    <div class="flex-1">
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Academic <span class="text-indigo-600">Setup</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1 text-balance">Select a university to manage its campuses, programs, and operational details.</p>
    </div>
    <div class="w-full md:w-64">
      <select 
        bind:value={selectedUniversityId}
        class="w-full px-6 py-3 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all"
      >
        {#each universities as univ}
          <option value={univ.id}>{univ.name}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Campuses Section -->
    <div class="space-y-6">
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
        <div class="flex items-center justify-between mb-8">
          <h3 class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Campus Management</h3>
          <span class="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase rounded-lg">
            {campuses.length} Active
          </span>
        </div>

        {#if loadingCampuses}
          <div class="flex justify-center p-12">
            <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else}
          <div class="space-y-3">
            {#each campuses as campus}
              <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl group border border-transparent hover:border-indigo-500/30 transition-all">
                <div>
                  <h4 class="font-black text-gray-900 dark:text-white text-sm">{campus.name}</h4>
                  <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{campus.code}</p>
                </div>
                <button 
                  onclick={() => deleteCampus(campus.id)}
                  class="p-2 text-gray-400 hover:text-rose-500 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            {/each}
            {#if campuses.length === 0}
               <p class="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">No campuses configured</p>
            {/if}
          </div>
        {/if}

        <div class="mt-8 pt-8 border-t border-gray-100 dark:border-slate-800">
           <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Add New Campus</p>
           <div class="grid grid-cols-2 gap-3">
              <input type="text" bind:value={newCampus.name} placeholder="Campus Name" class="col-span-2 px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500" />
              <input type="text" bind:value={newCampus.code} placeholder="Code (e.g. MAIN)" class="px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500" />
              <button onclick={handleCreateCampus} disabled={creatingCampus} class="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all active:scale-95">
                {creatingCampus ? 'Adding...' : 'Add Campus'}
              </button>
           </div>
        </div>
      </div>
    </div>

    <!-- Programs Section -->
    <div class="space-y-6">
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
        <div class="flex items-center justify-between mb-8">
          <h3 class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Academic Programs</h3>
          <button 
            onclick={() => showProgramForm = !showProgramForm}
            class="p-2 {showProgramForm ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'} dark:bg-emerald-500/10 rounded-xl hover:opacity-80 transition-all"
          >
            {#if showProgramForm}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            {/if}
          </button>
        </div>

        {#if showProgramForm}
          <div class="mb-8 p-6 bg-emerald-50/30 dark:bg-emerald-500/5 rounded-3xl border border-emerald-100 dark:border-emerald-500/20" in:fly={{ y: -10 }}>
            <p class="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4">Create New Program</p>
            <div class="grid grid-cols-2 gap-4">
              <input type="text" bind:value={newProgram.name} placeholder="Program Name (e.g. B.Tech CS)" class="col-span-2 px-4 py-2.5 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold shadow-sm" />
              <input type="text" bind:value={newProgram.code} placeholder="Program Code" class="px-4 py-2.5 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold shadow-sm" />
              <select bind:value={newProgram.degree_type} class="px-4 py-2.5 bg-white dark:bg-slate-800 border-none rounded-xl text-xs font-bold shadow-sm">
                <option value="B.Tech">B.Tech</option>
                <option value="M.Tech">M.Tech</option>
                <option value="B.Sc">B.Sc</option>
                <option value="MBA">MBA</option>
                <option value="PHD">PHD</option>
              </select>
              <button 
                onclick={handleCreateProgram}
                disabled={creatingProgram}
                class="col-span-2 py-3 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
              >
                {creatingProgram ? 'Creating...' : 'Confirm & Create Program'}
              </button>
            </div>
          </div>
        {/if}

        {#if loadingPrograms}
          <div class="flex justify-center p-12">
            <div class="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        {:else}
          <div class="divide-y divide-gray-50 dark:divide-slate-800">
            {#each programs as program}
              <div class="py-4 flex items-center justify-between group">
                <div>
                  <h4 class="font-black text-gray-900 dark:text-white text-sm">{program.name}</h4>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded-md uppercase tracking-wider">{program.code}</span>
                    <span class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{program.degree_type || 'Degree'}</span>
                  </div>
                </div>
                <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-3">
                   <button class="text-xs font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest">Edit</button>
                   <button 
                     onclick={() => deleteProgram(program.id)}
                     class="text-xs font-black text-rose-400 hover:text-rose-600 uppercase tracking-widest"
                   >
                     Delete
                   </button>
                </div>
              </div>
            {/each}
            {#if programs.length === 0}
               <p class="text-center py-8 text-xs font-bold text-gray-400 uppercase tracking-widest">No programs available</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
