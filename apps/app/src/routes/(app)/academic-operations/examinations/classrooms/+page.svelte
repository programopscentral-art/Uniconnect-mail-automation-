<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let classrooms = $state<any[]>([]);
  let loading = $state(true);
  let filterType = $state('');
  let showCreate = $state(false);
  let showImport = $state(false);
  let showLayout = $state<any>(null);
  let saving = $state(false);
  let importRows = $state('');
  let zoomLevel = $state(1);

  // Create form
  let form = $state({
    name: '', code: '', room_type: 'LECTURE', capacity: 0,
    floor: 0, building: '', total_benches: 30, seats_per_bench: 2,
    bench_rows: 5, bench_columns: 6, layout_type: 'grid', invigilators_required: 1
  });

  $effect(() => {
    if (universityId) loadClassrooms();
  });

  async function loadClassrooms() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/classrooms?universityId=${universityId}`);
      if (res.ok) classrooms = await res.json();
    } catch {}
    loading = false;
  }

  const filtered = $derived(
    filterType ? classrooms.filter(c => c.room_type === filterType) : classrooms
  );

  const totalCapacity = $derived(classrooms.reduce((sum, c) => sum + (c.capacity || 0), 0));
  const totalBenches = $derived(classrooms.reduce((sum, c) => sum + (c.total_benches || 0), 0));

  // Auto-calculate grid when benches change
  $effect(() => {
    if (form.total_benches > 0) {
      form.bench_columns = Math.ceil(Math.sqrt(form.total_benches));
      form.bench_rows = Math.ceil(form.total_benches / form.bench_columns);
      form.capacity = form.total_benches * form.seats_per_bench;
    }
  });

  async function createClassroom() {
    saving = true;
    try {
      const res = await fetch('/api/academic/classrooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, university_id: universityId })
      });
      if (res.ok) {
        showCreate = false;
        form = { name: '', code: '', room_type: 'LECTURE', capacity: 0, floor: 0, building: '', total_benches: 30, seats_per_bench: 2, bench_rows: 5, bench_columns: 6, layout_type: 'grid', invigilators_required: 1 };
        await loadClassrooms();
      }
    } catch {}
    saving = false;
  }

  async function importFromSheet() {
    saving = true;
    try {
      // Parse pasted data — expect tab-separated or JSON
      let rows: any[];
      try {
        rows = JSON.parse(importRows);
      } catch {
        // Parse as tab-separated
        const lines = importRows.trim().split('\n').filter(l => l.trim());
        rows = lines.map(line => {
          const cols = line.split('\t');
          return {
            university_name: cols[0]?.trim() || '',
            classrooms_count: parseInt(cols[1]) || 1,
            benches_per_classroom: cols[2]?.trim() || '30',
            students_per_bench: parseInt(cols[3]) || 2,
            max_capacity_per_classroom: cols[4]?.trim() || '',
            total_capacity: parseInt(cols[5]) || 0,
            invigilators_per_classroom: cols[6]?.trim() || '1',
            total_invigilators: parseInt(cols[7]) || 0,
            remarks: cols[8]?.trim() || ''
          };
        });
      }
      const res = await fetch('/api/academic/classrooms/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityId, rows })
      });
      if (res.ok) {
        const data = await res.json();
        showImport = false;
        importRows = '';
        await loadClassrooms();
        alert(`Successfully imported ${data.created} classrooms!`);
      }
    } catch (e: any) {
      alert('Import failed: ' + e.message);
    }
    saving = false;
  }

  async function deleteClassroom(id: string) {
    if (!confirm('Delete this classroom?')) return;
    await fetch(`/api/academic/classrooms/${id}`, { method: 'DELETE' });
    await loadClassrooms();
  }

  // Section colors for BookMyShow visualization
  const SECTION_COLORS = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-teal-500',
    'bg-orange-500', 'bg-indigo-500', 'bg-lime-500', 'bg-fuchsia-500'
  ];

  function getBenchIndex(row: number, col: number, totalCols: number) {
    return row * totalCols + col;
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Header + Stats -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Classroom <span class="text-indigo-600">Manager</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Visual room layouts with BookMyShow-style bench arrangement</p>
    </div>
    <div class="flex items-center gap-3">
      <select bind:value={filterType} class="px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold shadow-sm">
        <option value="">All Types</option>
        <option value="LECTURE">Lecture</option>
        <option value="LAB">Lab</option>
        <option value="HALL">Hall</option>
      </select>
      <button onclick={() => showImport = true} class="px-5 py-2.5 bg-gray-900 dark:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-800 transition-all shadow-sm">
        Import from Sheet
      </button>
      <button onclick={() => showCreate = true} class="px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-sm">
        + Add Classroom
      </button>
    </div>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Rooms</p>
      <p class="text-3xl font-black text-gray-900 dark:text-white mt-1">{classrooms.length}</p>
    </div>
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Capacity</p>
      <p class="text-3xl font-black text-indigo-600 mt-1">{totalCapacity.toLocaleString()}</p>
    </div>
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Benches</p>
      <p class="text-3xl font-black text-emerald-600 mt-1">{totalBenches.toLocaleString()}</p>
    </div>
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Halls</p>
      <p class="text-3xl font-black text-violet-600 mt-1">{classrooms.filter(c => c.room_type === 'HALL').length}</p>
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  {:else if classrooms.length === 0}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] text-center">
      <svg class="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
      <p class="text-gray-400 font-bold text-sm">No classrooms configured yet</p>
      <p class="text-gray-300 text-xs mt-1">Add classrooms manually or import from your Google Sheet</p>
    </div>
  {:else}
    <!-- Classroom Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {#each filtered as room, i}
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden hover:shadow-lg transition-all group cursor-pointer"
          in:fly={{ y: 20, delay: i * 50 }}
          onclick={() => showLayout = room}>
          <!-- Room Header -->
          <div class="p-5 border-b border-gray-50 dark:border-slate-800">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider
                    {room.room_type === 'HALL' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' :
                     room.room_type === 'LAB' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' :
                     'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'}">{room.room_type || 'LECTURE'}</span>
                  {#if room.code}
                    <span class="text-[9px] font-bold text-gray-400">{room.code}</span>
                  {/if}
                </div>
                <h3 class="text-sm font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">{room.name}</h3>
                {#if room.building || room.floor}
                  <p class="text-[10px] text-gray-400 font-bold mt-0.5">{room.building || ''}{room.building && room.floor ? ', ' : ''}{room.floor ? `Floor ${room.floor}` : ''}</p>
                {/if}
              </div>
              <button onclick={(e) => { e.stopPropagation(); deleteClassroom(room.id); }}
                class="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <!-- Mini Bench Preview -->
          <div class="p-4 bg-gray-50/50 dark:bg-slate-800/30">
            <div class="flex justify-center mb-3">
              <div class="px-8 py-1 bg-gray-200 dark:bg-slate-700 rounded-b-lg text-[7px] font-black text-gray-500 uppercase tracking-widest">Board</div>
            </div>
            <div class="flex justify-center">
              <div class="grid gap-[3px]" style="grid-template-columns: repeat({Math.min(room.bench_columns || 6, 10)}, 1fr);">
                {#each Array(Math.min((room.bench_rows || 5) * (room.bench_columns || 6), 60)) as _, idx}
                  <div class="w-3.5 h-2.5 rounded-[2px] bg-emerald-400/60 dark:bg-emerald-500/40 transition-all hover:bg-indigo-500"></div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Stats Footer -->
          <div class="p-4 grid grid-cols-3 gap-3 border-t border-gray-50 dark:border-slate-800">
            <div class="text-center">
              <p class="text-lg font-black text-gray-900 dark:text-white">{room.capacity || 0}</p>
              <p class="text-[8px] font-bold text-gray-400 uppercase">Seats</p>
            </div>
            <div class="text-center">
              <p class="text-lg font-black text-gray-900 dark:text-white">{room.total_benches || 0}</p>
              <p class="text-[8px] font-bold text-gray-400 uppercase">Benches</p>
            </div>
            <div class="text-center">
              <p class="text-lg font-black text-gray-900 dark:text-white">{room.invigilators_required || 1}</p>
              <p class="text-[8px] font-bold text-gray-400 uppercase">Invig.</p>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- BookMyShow Layout Modal -->
{#if showLayout}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => { showLayout = null; zoomLevel = 1; }} transition:fade>
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
            <h3 class="text-xl font-black text-gray-900 dark:text-white">{showLayout.name}</h3>
            <span class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase
              {showLayout.room_type === 'HALL' ? 'bg-violet-100 text-violet-700' : showLayout.room_type === 'LAB' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}">
              {showLayout.room_type || 'LECTURE'}
            </span>
          </div>
          <p class="text-xs text-gray-500 mt-1">
            {showLayout.bench_rows || 5} rows x {showLayout.bench_columns || 6} columns · {showLayout.total_benches || 30} benches · {showLayout.seats_per_bench || 2} seats/bench · Capacity: {showLayout.capacity}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <!-- Zoom -->
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
            <button onclick={() => zoomLevel = Math.max(0.5, zoomLevel - 0.1)} class="p-1.5 hover:bg-white rounded-lg text-xs font-black">−</button>
            <span class="text-[10px] font-bold text-gray-500 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
            <button onclick={() => zoomLevel = Math.min(2, zoomLevel + 0.1)} class="p-1.5 hover:bg-white rounded-lg text-xs font-black">+</button>
          </div>
          <button onclick={() => { showLayout = null; zoomLevel = 1; }} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- BookMyShow Layout -->
      <div class="p-8 overflow-auto max-h-[70vh]">
        <div class="flex flex-col items-center" style="transform: scale({zoomLevel}); transform-origin: top center;">
          <!-- Board/Screen -->
          <div class="w-2/3 mb-8">
            <div class="h-2 bg-gradient-to-r from-transparent via-gray-300 dark:via-slate-600 to-transparent rounded-full"></div>
            <p class="text-center text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2">Board / Screen</p>
          </div>

          <!-- Bench Grid -->
          <div class="grid gap-3" style="grid-template-columns: auto repeat({showLayout.bench_columns || 6}, 1fr) auto;">
            {#each Array(showLayout.bench_rows || 5) as _, rowIdx}
              <!-- Row Label -->
              <div class="flex items-center justify-center">
                <span class="text-[10px] font-black text-gray-400 w-6 text-right">{String.fromCharCode(65 + rowIdx)}</span>
              </div>

              {#each Array(showLayout.bench_columns || 6) as _, colIdx}
                {@const benchNum = getBenchIndex(rowIdx, colIdx, showLayout.bench_columns || 6) + 1}
                {@const isActive = benchNum <= (showLayout.total_benches || 30)}
                <div class="flex flex-col items-center">
                  {#if isActive}
                    <!-- Bench with seats -->
                    <div class="flex gap-0.5 p-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all group/bench cursor-pointer">
                      {#each Array(showLayout.seats_per_bench || 2) as _, seatIdx}
                        <div class="w-8 h-8 rounded-md bg-emerald-400 dark:bg-emerald-500 flex items-center justify-center text-[7px] font-black text-white shadow-sm group-hover/bench:bg-indigo-500 transition-colors">
                          {String.fromCharCode(65 + rowIdx)}{colIdx + 1}
                        </div>
                      {/each}
                    </div>
                    <p class="text-[7px] text-gray-300 font-bold mt-0.5">{benchNum}</p>
                  {:else}
                    <div class="flex gap-0.5 p-1.5 rounded-lg border border-dashed border-gray-100 dark:border-slate-800 opacity-30">
                      {#each Array(showLayout.seats_per_bench || 2) as _}
                        <div class="w-8 h-8 rounded-md bg-gray-200 dark:bg-slate-700"></div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}

              <!-- Row Label Right -->
              <div class="flex items-center justify-center">
                <span class="text-[10px] font-black text-gray-400 w-6">{String.fromCharCode(65 + rowIdx)}</span>
              </div>
            {/each}
          </div>

          <!-- Column Numbers -->
          <div class="grid gap-3 mt-2" style="grid-template-columns: auto repeat({showLayout.bench_columns || 6}, 1fr) auto;">
            <div></div>
            {#each Array(showLayout.bench_columns || 6) as _, colIdx}
              <div class="text-center">
                <span class="text-[9px] font-black text-gray-400">{colIdx + 1}</span>
              </div>
            {/each}
            <div></div>
          </div>

          <!-- Door indicators -->
          <div class="flex justify-between w-full mt-8 px-8">
            <div class="flex items-center gap-2 text-gray-300">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              <span class="text-[9px] font-black uppercase tracking-widest">Entry</span>
            </div>
            <div class="flex items-center gap-2 text-gray-300">
              <span class="text-[9px] font-black uppercase tracking-widest">Exit</span>
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="p-5 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
        <div class="flex flex-wrap gap-6 items-center justify-center">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded bg-emerald-400"></div>
            <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Available</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded bg-indigo-500"></div>
            <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Selected</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded bg-gray-200 dark:bg-slate-700 opacity-30"></div>
            <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">Inactive</span>
          </div>
          <div class="text-[10px] font-bold text-gray-400 ml-4">
            Invigilators required: <span class="text-indigo-600 font-black">{showLayout.invigilators_required || 1}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Create Classroom Modal -->
{#if showCreate}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => showCreate = false} transition:fade>
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Create Classroom</h3>
        <button onclick={() => showCreate = false} class="p-2 hover:bg-gray-100 rounded-xl">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="p-6 space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Name</label>
            <input type="text" bind:value={form.name} placeholder="Room 101" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Code</label>
            <input type="text" bind:value={form.code} placeholder="R-101" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Type</label>
            <select bind:value={form.room_type} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="LECTURE">Lecture Room</option>
              <option value="LAB">Lab</option>
              <option value="HALL">Hall</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Building</label>
            <input type="text" bind:value={form.building} placeholder="Block A" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Floor</label>
            <input type="number" bind:value={form.floor} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Invigilators Required</label>
            <input type="number" bind:value={form.invigilators_required} min="1" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
        </div>

        <!-- Bench Configuration -->
        <div class="p-5 bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl">
          <h4 class="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-4">Bench Configuration</h4>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Total Benches</label>
              <input type="number" bind:value={form.total_benches} min="1" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg text-sm font-black text-center" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Seats per Bench</label>
              <input type="number" bind:value={form.seats_per_bench} min="1" max="6" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg text-sm font-black text-center" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Capacity (auto)</label>
              <div class="px-3 py-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg text-sm font-black text-center text-indigo-700">{form.capacity}</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Rows (auto)</label>
              <div class="px-3 py-2 bg-indigo-100/50 dark:bg-indigo-500/10 rounded-lg text-sm font-bold text-center text-indigo-600">{form.bench_rows}</div>
            </div>
            <div>
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Columns (auto)</label>
              <div class="px-3 py-2 bg-indigo-100/50 dark:bg-indigo-500/10 rounded-lg text-sm font-bold text-center text-indigo-600">{form.bench_columns}</div>
            </div>
          </div>
        </div>

        <!-- Live Preview -->
        <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl">
          <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Live Preview</p>
          <div class="flex justify-center mb-2">
            <div class="px-6 py-0.5 bg-gray-200 dark:bg-slate-700 rounded-b text-[7px] font-bold text-gray-400 uppercase">Board</div>
          </div>
          <div class="flex justify-center">
            <div class="grid gap-1" style="grid-template-columns: repeat({form.bench_columns}, 1fr);">
              {#each Array(form.bench_rows * form.bench_columns) as _, idx}
                {@const isActive = idx < form.total_benches}
                <div class="flex gap-px">
                  {#each Array(form.seats_per_bench) as _}
                    <div class="w-4 h-3 rounded-sm {isActive ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700 opacity-30'}"></div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>

        <button onclick={createClassroom} disabled={saving || !form.name || !form.code}
          class="w-full py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50">
          {saving ? 'Creating...' : 'Create Classroom'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Import from Sheet Modal -->
{#if showImport}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => showImport = false} transition:fade>
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Import Classrooms from Sheet</h3>
        <p class="text-xs text-gray-500 mt-1">Paste the data from your "Exam Detail Required" Google Sheet (tab-separated)</p>
      </div>

      <div class="p-6 space-y-4">
        <div class="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-xl p-4">
          <p class="text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest mb-2">Expected Columns (tab-separated)</p>
          <p class="text-[10px] text-blue-600 font-mono">University | Classrooms Count | Benches/Classroom | Students/Bench | Max Capacity | Total Capacity | Invigilators/Room | Total Invigilators | Remarks</p>
        </div>

        <textarea bind:value={importRows} rows="8" placeholder="Paste tab-separated data here (skip the header row)...
Example:
Annamacharya	4	24 / 48	1	24 / 48	142	1 / 2	3	"
          class="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-mono resize-y"></textarea>

        <button onclick={importFromSheet} disabled={saving || !importRows.trim()}
          class="w-full py-3 bg-gray-900 dark:bg-slate-700 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50">
          {saving ? 'Importing...' : 'Import Classrooms'}
        </button>
      </div>
    </div>
  </div>
{/if}
