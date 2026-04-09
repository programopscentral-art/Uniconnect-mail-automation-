<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // Toast notification system
  let toasts = $state<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  let toastId = 0;
  function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++toastId;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4000);
  }

  let classrooms = $state<any[]>([]);
  let loading = $state(true);
  let filterType = $state('');
  let showCreate = $state(false);
  let showImport = $state(false);
  let showLayout = $state<any>(null);
  let saving = $state(false);
  let importFile = $state<File | null>(null);
  let importResult = $state<any>(null);
  let importError = $state('');
  let zoomLevel = $state(1);
  let editingRoom = $state<any>(null);
  let editForm = $state({ name: '', code: '', room_type: 'LECTURE', building: '', floor: 0, total_benches: 0, seats_per_bench: 2, invigilators_required: 1, bench_types: [{ count: 0, seats_per_bench: 2, label: '' }] as Array<{count: number; seats_per_bench: number; label: string}> });
  let editSaving = $state(false);

  // Computed totals from bench types
  const editTotalBenches = $derived(editForm.bench_types.reduce((s, b) => s + (b.count || 0), 0));
  const editCapacity = $derived(editForm.bench_types.reduce((s, b) => s + (b.count || 0) * (b.seats_per_bench || 2), 0));

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
      else toast('Failed to load classrooms', 'error');
    } catch { toast('Network error loading classrooms', 'error'); }
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
        toast('Classroom created successfully!', 'success');
        await loadClassrooms();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.message || 'Failed to create classroom', 'error');
      }
    } catch { toast('Network error creating classroom', 'error'); }
    saving = false;
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      importFile = file;
      importError = '';
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) {
      importFile = input.files[0];
      importError = '';
    }
  }

  async function importFromSheet() {
    if (!importFile) return;
    saving = true;
    importError = '';
    importResult = null;
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      if (universityId) formData.append('universityId', universityId);

      const res = await fetch('/api/academic/classrooms/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        importError = data.error || 'Import failed';
        importResult = data;
      } else {
        importResult = data;
        if (data.created > 0) {
          toast(`Successfully imported ${data.created} classrooms!`, 'success');
          await loadClassrooms();
        }
      }
    } catch (e: any) {
      importError = 'Import failed: ' + e.message;
    }
    saving = false;
  }

  async function deleteClassroom(id: string) {
    if (!confirm('Delete this classroom? This cannot be undone.')) return;
    try {
      await fetch(`/api/academic/classrooms/${id}`, { method: 'DELETE' });
      toast('Classroom deleted', 'success');
      await loadClassrooms();
    } catch { toast('Failed to delete classroom', 'error'); }
  }

  async function deleteAllClassrooms() {
    if (!confirm(`Delete ALL ${classrooms.length} classrooms? This will clear everything so you can re-import fresh.`)) return;
    try {
      const res = await fetch(`/api/academic/classrooms`, { method: 'DELETE' });
      const data = await res.json();
      toast(`Deleted ${data.deleted} classrooms`, 'success');
      await loadClassrooms();
    } catch { toast('Failed to delete classrooms', 'error'); }
  }

  function startEdit(room: any, e?: Event) {
    e?.stopPropagation();
    editingRoom = room;
    const meta = typeof room.metadata_json === 'string' ? JSON.parse(room.metadata_json || '{}') : (room.metadata_json || {});
    const benchTypes = meta.bench_types?.length > 0
      ? meta.bench_types
      : [{ count: room.total_benches || 0, seats_per_bench: room.seats_per_bench || 2, label: '' }];
    editForm = { name: room.name, code: room.code || '', room_type: room.room_type || 'LECTURE', building: room.building || '', floor: room.floor || 0, total_benches: room.total_benches || 0, seats_per_bench: room.seats_per_bench || 2, invigilators_required: room.invigilators_required || 1, bench_types: benchTypes };
  }

  async function saveEdit() {
    if (!editingRoom) return;
    editSaving = true;
    try {
      const totalBenches = editTotalBenches;
      const capacity = editCapacity;
      const cols = Math.ceil(Math.sqrt(totalBenches || 1));
      const rows = Math.ceil((totalBenches || 1) / cols);
      // Use the most common seats_per_bench as default
      const mainType = editForm.bench_types.reduce((a, b) => b.count > a.count ? b : a, editForm.bench_types[0]);
      const meta = { bench_types: editForm.bench_types.filter(b => b.count > 0) };
      const { bench_types: _, ...formData } = editForm;
      const res = await fetch(`/api/academic/classrooms/${editingRoom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, total_benches: totalBenches, seats_per_bench: mainType.seats_per_bench, bench_rows: rows, bench_columns: cols, capacity, metadata_json: meta })
      });
      if (res.ok) {
        toast('Classroom updated!', 'success');
        editingRoom = null;
        showLayout = null;
        await loadClassrooms();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.message || 'Failed to update', 'error');
      }
    } catch { toast('Network error', 'error'); }
    editSaving = false;
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

<!-- Toast Notifications -->
<div class="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
  {#each toasts as t (t.id)}
    <div class="pointer-events-auto px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl text-sm font-bold flex items-center gap-3 min-w-[280px] border
      {t.type === 'success' ? 'bg-emerald-50/95 dark:bg-emerald-900/90 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700' :
       t.type === 'error' ? 'bg-rose-50/95 dark:bg-rose-900/90 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-700' :
       'bg-indigo-50/95 dark:bg-indigo-900/90 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700'}"
      transition:fly={{ x: 50, duration: 300 }}>
      {#if t.type === 'success'}
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      {:else if t.type === 'error'}
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      {:else}
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      {/if}
      <span>{t.message}</span>
    </div>
  {/each}
</div>

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
      {#if classrooms.length > 0}
        <button onclick={deleteAllClassrooms} class="px-5 py-2.5 bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-700 transition-all shadow-sm">
          Delete All
        </button>
      {/if}
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
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden hover:shadow-lg transition-all group cursor-pointer"
          role="button" tabindex="0"
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
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button onclick={(e) => startEdit(room, e)}
                  class="p-1.5 text-gray-300 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 transition-all" title="Edit classroom">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onclick={(e) => { e.stopPropagation(); deleteClassroom(room.id); }}
                  class="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all" title="Delete classroom">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Mini Bench Preview (BookMyShow style) -->
          <div class="p-4 bg-gray-50/50 dark:bg-slate-800/30">
            <div class="flex justify-center mb-3">
              <div class="px-10 py-0.5 bg-gradient-to-r from-transparent via-gray-300 dark:via-slate-600 to-transparent rounded-full"></div>
            </div>
            <div class="text-center text-[6px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Board</div>
            {#each [Math.min(room.bench_columns || Math.ceil(Math.sqrt(room.total_benches || 20)), 8)] as previewCols}
              {#each [Math.min(room.bench_rows || Math.ceil((room.total_benches || 20) / previewCols), 6)] as previewRows}
                {@const meta = typeof room.metadata_json === 'string' ? JSON.parse(room.metadata_json || '{}') : (room.metadata_json || {})}
                {@const benchTypes = meta.bench_types || []}
                {@const seatsPerBenchArr = (() => { const arr = []; for (const bt of benchTypes) { for (let i = 0; i < (bt.count || 0); i++) arr.push(bt.seats_per_bench || 2); } return arr.length > 0 ? arr : null; })()}
                {#each [Math.min(room.seats_per_bench || 2, 4)] as defaultSpb}
                  <div class="flex flex-col items-center gap-1.5">
                    {#each Array(previewRows) as _, rowIdx}
                      <div class="flex items-center gap-1">
                        <span class="text-[6px] font-black text-gray-300 w-3 text-right">{String.fromCharCode(65 + rowIdx)}</span>
                        <div class="flex gap-1">
                          {#each Array(previewCols) as _, colIdx}
                            {@const benchNum = rowIdx * previewCols + colIdx + 1}
                            {@const isActive = benchNum <= (room.total_benches || 20)}
                            {@const spb = Math.min(seatsPerBenchArr ? (seatsPerBenchArr[benchNum - 1] || defaultSpb) : defaultSpb, 4)}
                            {@const isSmall = seatsPerBenchArr ? (seatsPerBenchArr[benchNum - 1] || defaultSpb) < (seatsPerBenchArr[0] || defaultSpb) : false}
                            {#if isActive}
                              <div class="flex gap-[1px] px-[2px] py-[1px] rounded-[3px] bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.05)]" title="{spb}-seater {isSmall ? '(small)' : ''}">
                                {#each Array(spb) as _}
                                  <div class="w-[5px] h-[6px] rounded-[1px] {isSmall ? 'bg-amber-400 dark:bg-amber-500' : 'bg-emerald-400 dark:bg-emerald-500'}"></div>
                                {/each}
                              </div>
                            {:else}
                              <div class="flex gap-[1px] px-[2px] py-[1px] rounded-[3px] opacity-20">
                                {#each Array(defaultSpb) as _}
                                  <div class="w-[5px] h-[6px] rounded-[1px] bg-gray-300 dark:bg-slate-600"></div>
                                {/each}
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                  <div class="text-center mt-2">
                    {#if benchTypes.length > 1}
                      <span class="text-[7px] font-bold text-gray-400">{benchTypes.map((bt: any) => `${bt.count}×${bt.seats_per_bench}-seat`).join(' + ')}</span>
                    {:else}
                      <span class="text-[7px] font-bold text-gray-400">{room.total_benches || 0} benches × {room.seats_per_bench || 2} seats</span>
                    {/if}
                  </div>
                {/each}
              {/each}
            {/each}
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
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="button" tabindex="0" onclick={() => { showLayout = null; zoomLevel = 1; }} transition:fade>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl" role="document" onclick={(e) => e.stopPropagation()}>
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
            {showLayout.bench_rows || 5} rows x {showLayout.bench_columns || 6} columns ·
            {(() => {
              const m = typeof showLayout.metadata_json === 'string' ? JSON.parse(showLayout.metadata_json || '{}') : (showLayout.metadata_json || {});
              const bts = m.bench_types || [];
              if (bts.length > 1) return bts.map((bt: any) => `${bt.count} × ${bt.seats_per_bench}-seat${bt.label ? ' (' + bt.label + ')' : ''}`).join(' + ') + ' ·';
              return `${showLayout.total_benches || 30} benches · ${showLayout.seats_per_bench || 2} seats/bench ·`;
            })()}
            Capacity: {showLayout.capacity}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button onclick={() => { startEdit(showLayout); showLayout = null; }}
            class="px-4 py-2 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-200 transition-all">
            Edit
          </button>
          <!-- Zoom -->
          <div class="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
            <button onclick={() => zoomLevel = Math.max(0.5, zoomLevel - 0.1)} class="p-1.5 hover:bg-white rounded-lg text-xs font-black">−</button>
            <span class="text-[10px] font-bold text-gray-500 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
            <button onclick={() => zoomLevel = Math.min(2, zoomLevel + 0.1)} class="p-1.5 hover:bg-white rounded-lg text-xs font-black">+</button>
          </div>
          <button onclick={() => { showLayout = null; zoomLevel = 1; }} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all" aria-label="Close">
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
          {#each [(() => { const m = typeof showLayout.metadata_json === 'string' ? JSON.parse(showLayout.metadata_json || '{}') : (showLayout.metadata_json || {}); const bts = m.bench_types || []; const arr = []; for (const bt of bts) { for (let i = 0; i < (bt.count || 0); i++) arr.push(bt.seats_per_bench || 2); } return arr.length > 0 ? arr : null; })()] as modalSeatsArr}
          {#each [showLayout.seats_per_bench || 2] as defaultSeats}
          <div class="grid gap-3" style="grid-template-columns: auto repeat({showLayout.bench_columns || 6}, 1fr) auto;">
            {#each Array(showLayout.bench_rows || 5) as _, rowIdx}
              <!-- Row Label -->
              <div class="flex items-center justify-center">
                <span class="text-[10px] font-black text-gray-400 w-6 text-right">{String.fromCharCode(65 + rowIdx)}</span>
              </div>

              {#each Array(showLayout.bench_columns || 6) as _, colIdx}
                {@const benchNum = getBenchIndex(rowIdx, colIdx, showLayout.bench_columns || 6) + 1}
                {@const isActive = benchNum <= (showLayout.total_benches || 30)}
                {@const thisBenchSeats = modalSeatsArr ? (modalSeatsArr[benchNum - 1] || defaultSeats) : defaultSeats}
                {@const isSmallBench = modalSeatsArr ? thisBenchSeats < (modalSeatsArr[0] || defaultSeats) : false}
                <div class="flex flex-col items-center gap-1">
                  {#if isActive}
                    <div class="flex flex-col items-center group/bench cursor-pointer" title="{thisBenchSeats}-seater{isSmallBench ? ' (small)' : ''}">
                      <div class="flex gap-1 mb-0.5">
                        {#each Array(thisBenchSeats) as _, seatIdx}
                          <div class="w-7 h-7 rounded-full {isSmallBench ? 'bg-amber-400 dark:bg-amber-500 border-amber-300 dark:border-amber-400 group-hover/bench:bg-orange-500 group-hover/bench:border-orange-400' : 'bg-emerald-400 dark:bg-emerald-500 border-emerald-300 dark:border-emerald-400 group-hover/bench:bg-indigo-500 group-hover/bench:border-indigo-400'} flex items-center justify-center text-[6px] font-black text-white shadow-sm transition-colors border-2">
                            {seatIdx + 1}
                          </div>
                        {/each}
                      </div>
                      <div class="w-full h-2.5 bg-amber-700/70 dark:bg-amber-800/60 rounded-[3px] shadow-inner group-hover/bench:bg-indigo-700/50 transition-colors" style="min-width: {thisBenchSeats * 28 + 4}px;"></div>
                    </div>
                    <p class="text-[7px] text-gray-300 font-bold">{String.fromCharCode(65 + rowIdx)}{colIdx + 1}</p>
                  {:else}
                    <div class="flex flex-col items-center opacity-20">
                      <div class="flex gap-1 mb-0.5">
                        {#each Array(defaultSeats) as _}
                          <div class="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-700 border-2 border-gray-100 dark:border-slate-600"></div>
                        {/each}
                      </div>
                      <div class="w-full h-2.5 bg-gray-300 dark:bg-slate-600 rounded-[3px]" style="min-width: {defaultSeats * 28 + 4}px;"></div>
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
          {/each}
          {/each}

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
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="button" tabindex="0" onclick={() => showCreate = false} transition:fade>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-3xl max-h-[90vh] overflow-auto shadow-2xl" role="document" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Create Classroom</h3>
        <button onclick={() => showCreate = false} class="p-2 hover:bg-gray-100 rounded-xl" aria-label="Close">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="p-6 space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Name</label>
            <input type="text" bind:value={form.name} placeholder="Room 101" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Code</label>
            <input type="text" bind:value={form.code} placeholder="R-101" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Type</label>
            <select bind:value={form.room_type} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="LECTURE">Lecture Room</option>
              <option value="LAB">Lab</option>
              <option value="HALL">Hall</option>
            </select>
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Building</label>
            <input type="text" bind:value={form.building} placeholder="Block A" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Floor</label>
            <input type="number" bind:value={form.floor} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Invigilators Required</label>
            <input type="number" bind:value={form.invigilators_required} min="1" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
        </div>

        <!-- Bench Configuration -->
        <div class="p-5 bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl">
          <h4 class="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-4">Bench Configuration</h4>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Total Benches</label>
              <input type="number" bind:value={form.total_benches} min="1" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg text-sm font-black text-center" />
            </div>
            <div>
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Seats per Bench</label>
              <input type="number" bind:value={form.seats_per_bench} min="1" max="6" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 rounded-lg text-sm font-black text-center" />
            </div>
            <div>
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Capacity (auto)</label>
              <div class="px-3 py-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg text-sm font-black text-center text-indigo-700">{form.capacity}</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-3">
            <div>
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label class="text-[10px] font-bold text-indigo-600 block mb-1">Rows (auto)</label>
              <div class="px-3 py-2 bg-indigo-100/50 dark:bg-indigo-500/10 rounded-lg text-sm font-bold text-center text-indigo-600">{form.bench_rows}</div>
            </div>
            <div>
              <!-- svelte-ignore a11y_label_has_associated_control -->
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

<!-- Edit Classroom Modal -->
{#if editingRoom}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="button" tabindex="0" onclick={() => editingRoom = null} transition:fade>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-xl max-h-[90vh] overflow-auto shadow-2xl" role="document" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Edit Classroom</h3>
        <button onclick={() => editingRoom = null} class="p-2 hover:bg-gray-100 rounded-xl" aria-label="Close">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Name</label>
            <input type="text" bind:value={editForm.name} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Code</label>
            <input type="text" bind:value={editForm.code} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Type</label>
            <select bind:value={editForm.room_type} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="LECTURE">Lecture</option><option value="LAB">Lab</option><option value="HALL">Hall</option>
            </select>
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Building</label>
            <input type="text" bind:value={editForm.building} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Invigilators</label>
            <input type="number" bind:value={editForm.invigilators_required} min="1" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Capacity (auto)</label>
            <div class="px-4 py-2.5 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl text-sm font-black text-center text-indigo-700">{editCapacity} seats ({editTotalBenches} benches)</div>
          </div>
        </div>

        <!-- Bench Types Configuration -->
        <div class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest">Bench Types</label>
            <button onclick={() => editForm.bench_types = [...editForm.bench_types, { count: 0, seats_per_bench: 2, label: '' }]}
              class="px-2 py-1 text-[9px] font-black text-indigo-600 hover:bg-indigo-50 rounded-lg uppercase">+ Add Type</button>
          </div>
          <div class="space-y-2">
            {#each editForm.bench_types as bt, i}
              <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <div class="flex-1">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label class="text-[8px] font-bold text-gray-400 uppercase">Count</label>
                  <input type="number" bind:value={bt.count} min="0" class="w-full px-3 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-bold" />
                </div>
                <div class="flex-1">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label class="text-[8px] font-bold text-gray-400 uppercase">Seats/Bench</label>
                  <input type="number" bind:value={bt.seats_per_bench} min="1" max="6" class="w-full px-3 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-bold" />
                </div>
                <div class="flex-1">
                  <!-- svelte-ignore a11y_label_has_associated_control -->
                  <label class="text-[8px] font-bold text-gray-400 uppercase">Label</label>
                  <input type="text" bind:value={bt.label} placeholder="e.g. Big, Small" class="w-full px-3 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-bold" />
                </div>
                {#if editForm.bench_types.length > 1}
                  <button onclick={() => editForm.bench_types = editForm.bench_types.filter((_, idx) => idx !== i)}
                    class="mt-4 p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg" aria-label="Remove bench type">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
          <p class="text-[9px] text-gray-400 font-bold mt-1">Example: 21 benches × 3 seats (Big) + 2 benches × 2 seats (Small)</p>
        </div>
        <button onclick={saveEdit} disabled={editSaving || !editForm.name}
          class="w-full py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50">
          {editSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Import from Sheet Modal -->
{#if showImport}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="button" tabindex="0" onclick={() => { showImport = false; importResult = null; importError = ''; importFile = null; }} transition:fade>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl" role="document" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Import Classrooms from Excel</h3>
        <p class="text-xs text-gray-500 mt-1">Upload your "Exam Detail Required" sheet — it auto-detects all classrooms, benches, capacity, and invigilators</p>
      </div>

      <div class="p-6 space-y-4">
        <!-- How it works -->
        <div class="bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 rounded-xl p-4">
          <p class="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest mb-2">How it works</p>
          <ul class="text-[10px] text-indigo-600 dark:text-indigo-400 space-y-1">
            <li>1. Upload the Excel file from your "Exam Detail Required" Google Sheet</li>
            <li>2. It auto-detects columns: University, Classrooms, Benches, Students/Bench, Capacity, Invigilators</li>
            <li>3. Handles complex data like "Hall 1: 32, Hall 2: 40" or "24 (small) / 48 (large)"</li>
            <li>4. Matches university names to your DB and creates classrooms with proper bench layouts</li>
          </ul>
        </div>

        <!-- File Upload -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="relative border-2 border-dashed rounded-2xl p-8 text-center transition-all
            {importFile ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/5' : 'border-gray-200 dark:border-slate-700 hover:border-indigo-400'}"
          ondragover={(e) => e.preventDefault()}
          ondrop={handleFileDrop}>
          {#if importFile}
            <svg class="w-10 h-10 text-emerald-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="text-sm font-black text-emerald-700 dark:text-emerald-400">{importFile.name}</p>
            <p class="text-[10px] text-emerald-600 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
            <button onclick={() => { importFile = null; importResult = null; importError = ''; }}
              class="mt-3 text-[10px] font-bold text-gray-500 hover:text-rose-500 underline">Remove file</button>
          {:else}
            <svg class="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            <p class="text-sm font-bold text-gray-500 dark:text-gray-400">Drag & drop your Excel file here</p>
            <p class="text-[10px] text-gray-400 mt-1">or click to browse (.xlsx, .xls)</p>
            <input type="file" accept=".xlsx,.xls" onchange={handleFileSelect}
              class="absolute inset-0 opacity-0 cursor-pointer" />
          {/if}
        </div>

        <!-- Import button -->
        <button onclick={importFromSheet} disabled={saving || !importFile}
          class="w-full py-3.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-sm relative overflow-hidden">
          {#if saving}
            <span class="flex items-center justify-center gap-2">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Importing & Creating Classrooms...
            </span>
            <div class="absolute bottom-0 left-0 h-1 bg-white/30 animate-pulse w-full"></div>
          {:else}
            Import Classrooms
          {/if}
        </button>

        <!-- Results -->
        {#if importResult}
          <div class="space-y-3">
            {#if importResult.created > 0}
              <div class="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4">
                <p class="text-sm font-black text-emerald-700 dark:text-emerald-400">
                  Successfully created {importResult.created} classrooms!
                </p>
                {#if importResult.skipped > 0}
                  <p class="text-[10px] text-amber-600 mt-1">{importResult.skipped} skipped (see details below)</p>
                {/if}
              </div>
            {/if}

            {#if importResult.skippedDetails?.length > 0}
              <div class="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4">
                <p class="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Skipped ({importResult.skippedDetails.length})</p>
                <div class="space-y-1 max-h-[150px] overflow-y-auto">
                  {#each importResult.skippedDetails as s}
                    <p class="text-[10px] text-amber-600">{s.name}: {s.reason}</p>
                  {/each}
                </div>
              </div>
            {/if}

            {#if importResult.classrooms?.length > 0}
              <div class="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                <p class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Created Classrooms</p>
                <div class="space-y-1 max-h-[200px] overflow-y-auto">
                  {#each importResult.classrooms as c}
                    <div class="flex items-center justify-between text-[10px]">
                      <span class="font-bold text-gray-700 dark:text-gray-300">{c.name}</span>
                      <span class="text-gray-400">{c.total_benches} benches · {c.capacity} seats · {c.invigilators_required} invig.</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if importError && !importResult?.created}
          <div class="bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-xl p-4">
            <p class="text-sm font-bold text-rose-700 dark:text-rose-400">{importError}</p>
            {#if importResult?.hint}
              <p class="text-[10px] text-rose-600 mt-1">{importResult.hint}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
