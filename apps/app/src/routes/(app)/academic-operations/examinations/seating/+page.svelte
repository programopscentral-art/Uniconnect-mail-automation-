<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let plans = $state<any[]>([]);
  let selectedPlanId = $state($page.url.searchParams.get('planId') || '');
  let planDetail = $state<any>(null);
  let classrooms = $state<any[]>([]);
  let selectedClassroomIds = $state<string[]>([]);
  let seatingPlans = $state<any[]>([]);
  let activeClassroom = $state('');
  let loading = $state(true);
  let generating = $state(false);
  let zoomLevel = $state(1);
  let selectedSeat = $state<any>(null);

  const SECTION_COLORS = [
    { bg: 'bg-blue-500', text: 'text-white', light: 'bg-blue-100 text-blue-700' },
    { bg: 'bg-emerald-500', text: 'text-white', light: 'bg-emerald-100 text-emerald-700' },
    { bg: 'bg-violet-500', text: 'text-white', light: 'bg-violet-100 text-violet-700' },
    { bg: 'bg-amber-500', text: 'text-white', light: 'bg-amber-100 text-amber-700' },
    { bg: 'bg-rose-500', text: 'text-white', light: 'bg-rose-100 text-rose-700' },
    { bg: 'bg-cyan-500', text: 'text-white', light: 'bg-cyan-100 text-cyan-700' },
    { bg: 'bg-pink-500', text: 'text-white', light: 'bg-pink-100 text-pink-700' },
    { bg: 'bg-teal-500', text: 'text-white', light: 'bg-teal-100 text-teal-700' },
    { bg: 'bg-orange-500', text: 'text-white', light: 'bg-orange-100 text-orange-700' },
    { bg: 'bg-indigo-500', text: 'text-white', light: 'bg-indigo-100 text-indigo-700' },
  ];

  let sectionColorMap = $state(new Map<string, number>());

  function getSectionColor(sectionId: string) {
    if (!sectionColorMap.has(sectionId)) {
      sectionColorMap.set(sectionId, sectionColorMap.size % SECTION_COLORS.length);
    }
    return SECTION_COLORS[sectionColorMap.get(sectionId)!];
  }

  $effect(() => {
    if (universityId) loadData();
  });

  $effect(() => {
    if (selectedPlanId) loadPlanDetail();
  });

  async function loadData() {
    loading = true;
    try {
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/academic/exams/plans?universityId=${universityId}`),
        fetch(`/api/academic/classrooms?universityId=${universityId}`)
      ]);
      if (pRes.ok) plans = await pRes.json();
      if (cRes.ok) classrooms = await cRes.json();
      if (selectedPlanId) await loadPlanDetail();
    } catch {}
    loading = false;
  }

  async function loadPlanDetail() {
    if (!selectedPlanId) return;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlanId}`);
      if (res.ok) {
        planDetail = await res.json();
        // Load seating plans for first exam
        if (planDetail.exams?.length > 0) {
          await loadSeatingForExam(planDetail.exams[0].id);
        }
      }
    } catch {}
  }

  async function loadSeatingForExam(examId: string) {
    try {
      const res = await fetch(`/api/academic/exams/seating/${examId}`);
      if (res.ok) {
        const data = await res.json();
        seatingPlans = Array.isArray(data) ? data : data ? [data] : [];
        if (seatingPlans.length > 0 && !activeClassroom) {
          activeClassroom = seatingPlans[0].classroom_id;
        }
        // Build section color map
        sectionColorMap = new Map();
        for (const plan of seatingPlans) {
          const sd = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json;
          for (const a of sd?.assignments || []) {
            getSectionColor(a.section_id);
          }
        }
      }
    } catch {}
  }

  async function generateSeating() {
    if (!selectedPlanId || selectedClassroomIds.length === 0) {
      alert('Select at least one classroom');
      return;
    }
    generating = true;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlanId}/generate-seating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomIds: selectedClassroomIds })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.error) {
          alert(result.error);
        } else {
          alert(`Seating generated! ${result.total_seated} students seated across ${result.results?.length || 0} classrooms.`);
          await loadPlanDetail();
        }
      }
    } catch (e: any) {
      alert('Generation failed: ' + e.message);
    }
    generating = false;
  }

  async function swapSeats(plan: any, seat1: any, seat2: any) {
    try {
      await fetch(`/api/academic/exams/seating/${plan.id}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seat1, seat2 })
      });
      if (planDetail.exams?.length > 0) {
        await loadSeatingForExam(planDetail.exams[0].id);
      }
    } catch {}
    selectedSeat = null;
  }

  function handleSeatClick(plan: any, assignment: any) {
    if (!selectedSeat) {
      selectedSeat = { plan, assignment };
    } else if (selectedSeat.assignment === assignment) {
      selectedSeat = null;
    } else {
      // Swap
      swapSeats(plan, {
        row: selectedSeat.assignment.bench_row,
        col: selectedSeat.assignment.bench_col,
        seat: selectedSeat.assignment.seat
      }, {
        row: assignment.bench_row,
        col: assignment.bench_col,
        seat: assignment.seat
      });
    }
  }

  const activeSeating = $derived(seatingPlans.find(p => p.classroom_id === activeClassroom));
  const activeData = $derived(() => {
    if (!activeSeating?.seating_data_json) return null;
    return typeof activeSeating.seating_data_json === 'string'
      ? JSON.parse(activeSeating.seating_data_json)
      : activeSeating.seating_data_json;
  });

  function getAssignment(data: any, row: number, col: number, seat: number) {
    return data?.assignments?.find((a: any) => a.bench_row === row && a.bench_col === col && a.seat === seat);
  }

  function isViolation(data: any, assignment: any) {
    if (!assignment || !data?.assignments) return false;
    const neighbor = data.assignments.find((a: any) =>
      a.bench_row === assignment.bench_row && a.bench_col === assignment.bench_col &&
      a.seat !== assignment.seat && a.section_id === assignment.section_id
    );
    return !!neighbor;
  }

  function exportCSV() {
    if (!planDetail?.exams?.[0]) return;
    window.open(`/api/academic/exams/seating/${planDetail.exams[0].id}/export`, '_blank');
  }

  function printLayout() {
    window.print();
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Exam <span class="text-violet-600">Seating Plan</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Visual seat assignment with branch-interleaving constraints</p>
    </div>
    <div class="flex items-center gap-3">
      <select bind:value={selectedPlanId}
        class="px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold min-w-[200px] shadow-sm">
        <option value="">Select Exam Plan...</option>
        {#each plans as p}<option value={p.id}>{p.exam_name}</option>{/each}
      </select>
      {#if seatingPlans.length > 0}
        <button onclick={exportCSV} class="px-4 py-2.5 bg-gray-900 dark:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm">Export CSV</button>
        <button onclick={printLayout} class="px-4 py-2.5 bg-gray-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm">Print</button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  {:else if !selectedPlanId}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
      <p class="text-gray-400 font-bold">Select an exam plan to view or generate seating</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <!-- Sidebar: Classroom Selection & Stats -->
      <div class="xl:col-span-1 space-y-4">
        <!-- Generate Seating -->
        <div class="bg-gray-900 dark:bg-slate-800 text-white rounded-2xl p-5">
          <h3 class="text-sm font-black text-indigo-400 uppercase tracking-widest mb-3">Generate Seating</h3>
          <p class="text-[10px] text-gray-400 mb-3">Select classrooms and auto-assign students with interleaving constraints (no same-branch adjacent)</p>
          <div class="space-y-2 max-h-[200px] overflow-y-auto mb-4">
            {#each classrooms as room}
              <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer">
                <input type="checkbox" value={room.id}
                  checked={selectedClassroomIds.includes(room.id)}
                  onchange={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) selectedClassroomIds = [...selectedClassroomIds, room.id];
                    else selectedClassroomIds = selectedClassroomIds.filter(id => id !== room.id);
                  }}
                  class="rounded border-gray-600" />
                <span class="text-xs font-bold">{room.name}</span>
                <span class="text-[9px] text-gray-500 ml-auto">{room.capacity} seats</span>
              </label>
            {/each}
          </div>
          <button onclick={generateSeating} disabled={generating || selectedClassroomIds.length === 0}
            class="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
            {generating ? 'Generating...' : 'Generate Seating Plan'}
          </button>
        </div>

        <!-- Classroom Tabs -->
        {#if seatingPlans.length > 0}
          <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div class="p-3 border-b border-gray-50 dark:border-slate-800">
              <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Classrooms</h3>
            </div>
            <div class="divide-y divide-gray-50 dark:divide-slate-800">
              {#each seatingPlans as plan}
                {@const data = typeof plan.seating_data_json === 'string' ? JSON.parse(plan.seating_data_json) : plan.seating_data_json}
                <button onclick={() => activeClassroom = plan.classroom_id}
                  class="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all
                  {activeClassroom === plan.classroom_id ? 'bg-indigo-50 dark:bg-indigo-500/5 border-l-4 border-indigo-600' : ''}">
                  <p class="text-xs font-black text-gray-900 dark:text-white">{plan.classroom_name}</p>
                  <div class="flex items-center gap-3 mt-1">
                    <span class="text-[9px] font-bold text-gray-400">{data?.total_seated || 0} seated</span>
                    <span class="text-[9px] font-bold {data?.violations > 0 ? 'text-rose-500' : 'text-emerald-500'}">
                      {data?.violations > 0 ? `${data.violations} violations` : 'No violations'}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          </div>

          <!-- Section Legend -->
          <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-4">
            <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Section Colors</h3>
            <div class="space-y-2">
              {#each [...sectionColorMap.entries()] as [sectionId, colorIdx]}
                {@const color = SECTION_COLORS[colorIdx]}
                {@const sectionName = activeData()?.assignments?.find((a: any) => a.section_id === sectionId)?.section_name || sectionId}
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded {color.bg}"></div>
                  <span class="text-[10px] font-bold text-gray-600 dark:text-gray-400">{sectionName}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Main: Visual Seating Grid -->
      <div class="xl:col-span-3">
        {#if activeSeating && activeData()}
          {@const data = activeData()}
          <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            <!-- Toolbar -->
            <div class="p-4 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-black text-gray-900 dark:text-white">{activeSeating.classroom_name}</h3>
                <p class="text-[10px] text-gray-400 font-bold">
                  {activeSeating.bench_rows} rows x {activeSeating.bench_columns} cols · {data.total_seated || 0}/{activeSeating.capacity} seats filled
                  {#if data.violations > 0}
                    · <span class="text-rose-500">{data.violations} constraint violations</span>
                  {/if}
                </p>
              </div>
              <div class="flex items-center gap-2">
                {#if selectedSeat}
                  <span class="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-black animate-pulse">Click another seat to swap</span>
                  <button onclick={() => selectedSeat = null} class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-[9px] font-black">Cancel</button>
                {/if}
                <div class="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
                  <button onclick={() => zoomLevel = Math.max(0.5, zoomLevel - 0.1)} class="p-1.5 hover:bg-white rounded-lg text-xs font-black">−</button>
                  <span class="text-[10px] font-bold text-gray-500 w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                  <button onclick={() => zoomLevel = Math.min(2, zoomLevel + 0.1)} class="p-1.5 hover:bg-white rounded-lg text-xs font-black">+</button>
                </div>
              </div>
            </div>

            <!-- Seating Grid -->
            <div class="p-8 overflow-auto">
              <div class="flex flex-col items-center" style="transform: scale({zoomLevel}); transform-origin: top center;">
                <!-- Board -->
                <div class="w-2/3 mb-8">
                  <div class="h-2 bg-gradient-to-r from-transparent via-gray-300 dark:via-slate-600 to-transparent rounded-full"></div>
                  <p class="text-center text-[9px] font-black text-gray-400 uppercase tracking-[0.3em] mt-2">Invigilator / Board</p>
                </div>

                <!-- Bench Grid -->
                <div class="grid gap-3" style="grid-template-columns: auto repeat({activeSeating.bench_columns || 6}, 1fr) auto;">
                  {#each Array(activeSeating.bench_rows || 5) as _, rowIdx}
                    <div class="flex items-center justify-center">
                      <span class="text-[10px] font-black text-gray-400 w-6 text-right">{String.fromCharCode(65 + rowIdx)}</span>
                    </div>

                    {#each Array(activeSeating.bench_columns || 6) as _, colIdx}
                      {@const benchNum = rowIdx * (activeSeating.bench_columns || 6) + colIdx}
                      {@const isActive = benchNum < (activeSeating.total_benches || 30)}
                      <div class="flex flex-col items-center">
                        {#if isActive}
                          <div class="flex gap-0.5 p-1 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                            {#each Array(activeSeating.seats_per_bench || 2) as _, seatIdx}
                              {@const assignment = getAssignment(data, rowIdx, colIdx, seatIdx)}
                              {@const violation = assignment ? isViolation(data, assignment) : false}
                              {@const isSelected = selectedSeat?.assignment === assignment}
                              {#if assignment}
                                {@const color = getSectionColor(assignment.section_id)}
                                <button
                                  onclick={() => handleSeatClick(activeSeating, assignment)}
                                  class="w-12 h-12 rounded-md {color.bg} {color.text} flex flex-col items-center justify-center transition-all hover:scale-110 hover:shadow-lg relative
                                  {violation ? 'ring-2 ring-rose-500 ring-offset-1' : ''}
                                  {isSelected ? 'ring-2 ring-amber-400 ring-offset-2 scale-110 shadow-lg' : ''}">
                                  <span class="text-[7px] font-black leading-none">{assignment.enrollment_no || '?'}</span>
                                  <span class="text-[6px] font-bold opacity-80 leading-none mt-0.5 truncate max-w-[40px]">{assignment.section_name}</span>
                                  {#if violation}
                                    <div class="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full flex items-center justify-center">
                                      <span class="text-[6px] text-white font-black">!</span>
                                    </div>
                                  {/if}
                                </button>
                              {:else}
                                <div class="w-12 h-12 rounded-md bg-gray-100 dark:bg-slate-700 border border-dashed border-gray-200 dark:border-slate-600 flex items-center justify-center">
                                  <span class="text-[8px] text-gray-300 font-bold">{String.fromCharCode(65 + rowIdx)}{colIdx + 1}</span>
                                </div>
                              {/if}
                            {/each}
                          </div>
                        {:else}
                          <div class="flex gap-0.5 p-1 opacity-20">
                            {#each Array(activeSeating.seats_per_bench || 2) as _}
                              <div class="w-12 h-12 rounded-md bg-gray-200 dark:bg-slate-700"></div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}

                    <div class="flex items-center justify-center">
                      <span class="text-[10px] font-black text-gray-400 w-6">{String.fromCharCode(65 + rowIdx)}</span>
                    </div>
                  {/each}
                </div>

                <!-- Column Numbers -->
                <div class="grid gap-3 mt-3" style="grid-template-columns: auto repeat({activeSeating.bench_columns || 6}, 1fr) auto;">
                  <div></div>
                  {#each Array(activeSeating.bench_columns || 6) as _, colIdx}
                    <div class="text-center"><span class="text-[9px] font-black text-gray-400">{colIdx + 1}</span></div>
                  {/each}
                  <div></div>
                </div>

                <!-- Entry/Exit -->
                <div class="flex justify-between w-full mt-8 px-8">
                  <div class="flex items-center gap-2 text-gray-300">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                    <span class="text-[9px] font-black uppercase tracking-widest">Entry</span>
                  </div>
                  <div class="flex items-center gap-2 text-gray-300">
                    <span class="text-[9px] font-black uppercase tracking-widest">Exit</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Legend -->
            <div class="p-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
              <div class="flex flex-wrap gap-6 items-center justify-center">
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded bg-gray-100 border border-dashed border-gray-200"></div>
                  <span class="text-[9px] font-black text-gray-500 uppercase">Empty</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded bg-blue-500"></div>
                  <span class="text-[9px] font-black text-gray-500 uppercase">Occupied</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded bg-blue-500 ring-2 ring-rose-500 ring-offset-1"></div>
                  <span class="text-[9px] font-black text-gray-500 uppercase">Constraint Violation</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-4 h-4 rounded bg-blue-500 ring-2 ring-amber-400 ring-offset-2"></div>
                  <span class="text-[9px] font-black text-gray-500 uppercase">Selected (swap)</span>
                </div>
              </div>
            </div>
          </div>
        {:else if seatingPlans.length === 0 && selectedPlanId}
          <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-20 text-center">
            <svg class="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/>
            </svg>
            <p class="text-gray-400 font-bold">No seating plan generated yet</p>
            <p class="text-gray-300 text-xs mt-1">Select classrooms and click "Generate Seating Plan" to auto-assign students</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  @media print {
    :global(nav), :global(header), :global(.no-print) { display: none !important; }
  }
</style>
