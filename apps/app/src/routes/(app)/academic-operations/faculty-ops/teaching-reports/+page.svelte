<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { page } from "$app/stores";

  let reports = $state<any[]>([]);
  let faculty = $state<any[]>([]);
  let loading = $state(true);

  let selectedFaculty = $state('');
  let selectedDate = $state('');
  let dateFrom = $state('');
  let dateTo = $state('');

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  $effect(() => { if (universityId) loadFaculty(); });
  $effect(() => { if (universityId) loadReports(); });

  async function loadFaculty() {
    const res = await fetch(`/api/academic/faculty?universityId=${universityId}`);
    if (res.ok) faculty = await res.json();
  }

  async function loadReports() {
    loading = true;
    try {
      const params = new URLSearchParams();
      if (selectedFaculty) params.set('facultyProfileId', selectedFaculty);
      if (selectedDate) params.set('date', selectedDate);
      const res = await fetch(`/api/academic/faculty/teaching-reports?${params}`);
      if (res.ok) {
        let data = await res.json();
        // Client-side date range filter
        if (dateFrom) data = data.filter((r: any) => (r.report_date?.split('T')[0] || '') >= dateFrom);
        if (dateTo) data = data.filter((r: any) => (r.report_date?.split('T')[0] || '') <= dateTo);
        reports = data;
      }
    } finally { loading = false; }
  }

  function statusBadge(status: string) {
    if (status === 'COMPLETED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600';
    if (status === 'PARTIAL') return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600';
    return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600';
  }

  function portionColor(pct: number) {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  }

  // Group by date
  const reportsByDate = $derived(() => {
    const map = new Map<string, any[]>();
    for (const r of reports) {
      const d = r.report_date?.split('T')[0] || r.report_date;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  });

  // Stats
  const totalReports = $derived(reports.length);
  const completedCount = $derived(reports.filter(r => r.topic_status === 'COMPLETED').length);
  const partialCount = $derived(reports.filter(r => r.topic_status === 'PARTIAL').length);
  const avgPortion = $derived(
    reports.length > 0
      ? Math.round(reports.reduce((sum, r) => sum + (r.portion_percentage || 0), 0) / reports.length)
      : 0
  );

  // Faculty-wise summary
  const facultySummary = $derived(() => {
    const map = new Map<string, { name: string; total: number; completed: number; partial: number; avgPortion: number }>();
    for (const r of reports) {
      const fName = r.faculty_name || 'Unknown';
      const fId = r.faculty_profile_id;
      if (!map.has(fId)) map.set(fId, { name: fName, total: 0, completed: 0, partial: 0, avgPortion: 0 });
      const entry = map.get(fId)!;
      entry.total++;
      if (r.topic_status === 'COMPLETED') entry.completed++;
      if (r.topic_status === 'PARTIAL') entry.partial++;
      entry.avgPortion += (r.portion_percentage || 0);
    }
    return Array.from(map.values())
      .map(e => ({ ...e, avgPortion: e.total > 0 ? Math.round(e.avgPortion / e.total) : 0 }))
      .sort((a, b) => b.total - a.total);
  });
</script>

<div class="space-y-6" in:fade>
  <div>
    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Teaching <span class="text-indigo-600">Reports</span></h2>
    <p class="text-xs font-medium text-gray-400 mt-1">Track daily teaching reports, topic coverage, and syllabus progress</p>
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
    <div class="flex flex-col gap-1">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Faculty</label>
      <select bind:value={selectedFaculty} onchange={() => loadReports()}
        class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 min-w-[180px]">
        <option value="">All Faculty</option>
        {#each faculty as f}
          <option value={f.id}>{f.name} ({f.employee_code || '—'})</option>
        {/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Specific Date</label>
      <input type="date" bind:value={selectedDate} onchange={() => loadReports()}
        class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
    </div>
    <div class="flex flex-col gap-1">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">From</label>
      <input type="date" bind:value={dateFrom} onchange={() => loadReports()}
        class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
    </div>
    <div class="flex flex-col gap-1">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">To</label>
      <input type="date" bind:value={dateTo} onchange={() => loadReports()}
        class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
    </div>
    <button onclick={() => { selectedFaculty = ''; selectedDate = ''; dateFrom = ''; dateTo = ''; loadReports(); }}
      class="px-3 py-2.5 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-gray-700 transition-colors">Clear</button>
  </div>

  <!-- Stats cards -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Reports</p>
      <p class="text-2xl font-black text-gray-900 dark:text-white mt-1">{loading ? '—' : totalReports}</p>
    </div>
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Completed Topics</p>
      <p class="text-2xl font-black text-emerald-600 mt-1">{loading ? '—' : completedCount}</p>
    </div>
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Partial Topics</p>
      <p class="text-2xl font-black text-amber-600 mt-1">{loading ? '—' : partialCount}</p>
    </div>
    <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
      <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Avg Portion</p>
      <p class="text-2xl font-black text-indigo-600 mt-1">{loading ? '—' : `${avgPortion}%`}</p>
    </div>
  </div>

  {#if loading}
    <div class="p-20 flex flex-col items-center">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
      <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading reports...</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Reports timeline -->
      <div class="lg:col-span-2 space-y-4">
        {#if reports.length === 0}
          <div class="p-16 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-700 rounded-[2rem] flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p class="text-sm font-black text-gray-500">No teaching reports found</p>
            <p class="text-[10px] text-gray-400 mt-1">Faculty haven't submitted any reports{selectedFaculty || selectedDate || dateFrom ? ' for these filters' : ' yet'}</p>
          </div>
        {:else}
          {#each reportsByDate() as [date, dayReports], di}
            <div class="space-y-2" in:fly={{ y: 10, delay: Math.min(di * 40, 200) }}>
              <div class="flex items-center justify-between px-1">
                <p class="text-xs font-black text-gray-600 dark:text-gray-400">
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <span class="text-[10px] font-bold text-gray-400">{dayReports.length} report{dayReports.length > 1 ? 's' : ''}</span>
              </div>
              {#each dayReports as report}
                <div class="p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-md transition-all">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap mb-1">
                        <h4 class="text-sm font-black text-gray-900 dark:text-white">{report.topic_name}</h4>
                        <span class="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest {statusBadge(report.topic_status)}">{report.topic_status}</span>
                      </div>
                      <div class="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                        <span class="font-black text-indigo-500">{report.faculty_name || 'Unknown'}</span>
                        {#if report.subject_name}<span>· {report.subject_name}</span>{/if}
                        {#if report.section_name}<span>· {report.section_name}</span>{/if}
                      </div>
                      {#if report.notes}
                        <p class="text-[10px] text-gray-400 italic mt-1">{report.notes}</p>
                      {/if}
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-lg font-black {report.portion_percentage >= 80 ? 'text-emerald-600' : report.portion_percentage >= 50 ? 'text-amber-600' : 'text-rose-500'}">{report.portion_percentage ?? 100}%</p>
                      <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Portion</p>
                    </div>
                  </div>
                  {#if report.portion_percentage !== null}
                    <div class="h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3">
                      <div class="h-full rounded-full transition-all {portionColor(report.portion_percentage)}" style="width: {report.portion_percentage}%"></div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <!-- Faculty summary sidebar -->
      <div class="space-y-4">
        <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem]">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Faculty Summary</p>
          {#if facultySummary().length === 0}
            <p class="text-xs text-gray-400 text-center py-6">No data yet</p>
          {:else}
            <div class="space-y-3">
              {#each facultySummary() as fs}
                <div class="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                  <div class="flex items-center justify-between mb-1.5">
                    <p class="text-xs font-black text-gray-800 dark:text-gray-200 truncate flex-1 mr-2">{fs.name}</p>
                    <span class="text-[10px] font-black text-indigo-600">{fs.total} reports</span>
                  </div>
                  <div class="flex items-center gap-3 text-[9px] font-bold">
                    <span class="text-emerald-600">{fs.completed} done</span>
                    <span class="text-amber-600">{fs.partial} partial</span>
                    <span class="text-gray-400">avg {fs.avgPortion}%</span>
                  </div>
                  <div class="h-1 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                    <div class="h-full rounded-full {portionColor(fs.avgPortion)}" style="width: {fs.avgPortion}%"></div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
