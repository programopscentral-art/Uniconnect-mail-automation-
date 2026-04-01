<script lang="ts">
  import { untrack } from 'svelte';
  // @ts-ignore
  let { data } = $props();

  // --- State ---
  let selectedUniversityId = $state<string>('ALL');
  let dateRange = $state<string>('30d');
  let customFrom = $state('');
  let customTo = $state('');
  let isLoading = $state(true);
  let teamData = $state<any[]>([]);
  let universities = $state<any[]>([]);

  // User drill-down
  let selectedUserId = $state<string | null>(null);
  let userDetail = $state<any>(null);
  let isLoadingDetail = $state(false);

  // Computed date range
  let dateFrom = $derived.by(() => {
    if (dateRange === 'custom') return customFrom;
    const d = new Date();
    if (dateRange === '7d') d.setDate(d.getDate() - 7);
    else if (dateRange === '30d') d.setDate(d.getDate() - 30);
    else if (dateRange === '90d') d.setDate(d.getDate() - 90);
    else return ''; // all time
    return d.toISOString().split('T')[0];
  });
  let dateTo = $derived(dateRange === 'custom' ? customTo : new Date().toISOString().split('T')[0]);

  // --- Load team data ---
  async function loadTeam() {
    isLoading = true;
    try {
      const params = new URLSearchParams();
      if (selectedUniversityId !== 'ALL') params.set('universityId', selectedUniversityId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/analytics?${params}`);
      if (res.ok) {
        const result = await res.json();
        teamData = result.team || [];
        if (result.universities?.length && universities.length === 0) {
          universities = result.universities;
        }
      }
    } catch (e) {
      console.error('[ANALYTICS] Load error:', e);
    } finally {
      isLoading = false;
    }
  }

  // --- Load user detail ---
  async function loadUserDetail(userId: string) {
    isLoadingDetail = true;
    try {
      const params = new URLSearchParams({ userId });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/analytics/users?${params}`);
      if (res.ok) {
        userDetail = await res.json();
      }
    } catch (e) {
      console.error('[ANALYTICS] User detail error:', e);
    } finally {
      isLoadingDetail = false;
    }
  }

  // Reactive load
  $effect(() => {
    const _u = selectedUniversityId;
    const _d = dateRange;
    const _cf = customFrom;
    const _ct = customTo;
    untrack(() => { loadTeam(); });
  });

  // Auto-load for non-admins (self view)
  $effect(() => {
    if (!data.isGlobalOps && !selectedUserId) {
      selectedUserId = data.user.id;
    }
  });

  $effect(() => {
    if (selectedUserId) {
      untrack(() => { loadUserDetail(selectedUserId!); });
    }
  });

  function selectUser(userId: string) {
    if (selectedUserId === userId) {
      if (data.isGlobalOps) { selectedUserId = null; userDetail = null; }
    } else {
      selectedUserId = userId;
    }
  }

  function goBack() { selectedUserId = null; userDetail = null; }

  // --- Computed ---
  let totalCompleted = $derived(teamData.reduce((s, u) => s + parseInt(u.total_completed || 0), 0));
  let totalAssigned = $derived(teamData.reduce((s, u) => s + parseInt(u.total_assigned || 0), 0));
  let totalOverdue = $derived(teamData.reduce((s, u) => s + parseInt(u.total_overdue || 0), 0));
  let totalInProgress = $derived(teamData.reduce((s, u) => s + parseInt(u.total_in_progress || 0), 0));
  let avgSpeed = $derived.by(() => {
    const withSpeed = teamData.filter(u => parseFloat(u.avg_completion_hours) > 0);
    if (!withSpeed.length) return 0;
    return withSpeed.reduce((s, u) => s + parseFloat(u.avg_completion_hours), 0) / withSpeed.length;
  });
  let teamEfficiency = $derived(totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0);

  // Helpers
  function getRating(completed: number, total: number) {
    if (total === 0) return { letter: '-', color: 'from-gray-400 to-gray-500', ring: 'ring-gray-200 dark:ring-gray-700' };
    const pct = (completed / total) * 100;
    if (pct >= 90) return { letter: 'S', color: 'from-amber-400 to-amber-600', ring: 'ring-amber-200 dark:ring-amber-800' };
    if (pct >= 75) return { letter: 'A', color: 'from-emerald-400 to-emerald-600', ring: 'ring-emerald-200 dark:ring-emerald-800' };
    if (pct >= 50) return { letter: 'B', color: 'from-blue-400 to-blue-600', ring: 'ring-blue-200 dark:ring-blue-800' };
    return { letter: 'C', color: 'from-gray-400 to-gray-600', ring: 'ring-gray-200 dark:ring-gray-700' };
  }

  function formatHours(h: number) {
    if (!h || h <= 0) return '-';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  }

  function getPresenceColor(status: string) {
    if (status === 'ONLINE') return 'bg-green-500';
    if (status === 'BUSY') return 'bg-red-500';
    if (status === 'AWAY') return 'bg-amber-500';
    return 'bg-gray-400';
  }

  function getRankBadge(index: number) {
    if (index === 0) return { emoji: '1st', bg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
    if (index === 1) return { emoji: '2nd', bg: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' };
    if (index === 2) return { emoji: '3rd', bg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' };
    return null;
  }

  // SVG donut helper
  function donutDash(pct: number, radius: number) {
    const circ = 2 * Math.PI * radius;
    const filled = (pct / 100) * circ;
    return `${filled} ${circ - filled}`;
  }
  const C50 = 2 * Math.PI * 50; // circumference for r=50
  const C45 = 2 * Math.PI * 45; // circumference for r=45

  // Inline calc helpers to avoid @const in div
  function pctOf(val: number, total: number) { return total > 0 ? (val / total) * 100 : 0; }
  function dashSeg(pct: number, circ: number) { return `${(pct / 100) * circ} ${circ}`; }
  function dashOff(pct: number, circ: number) { return `-${(pct / 100) * circ}`; }
  function speedGauge(avgH: number) { return avgH > 0 ? Math.min((24 / avgH) * 20, 100) : 0; }
</script>

<!-- MAIN LAYOUT -->
<div class="space-y-6 animate-premium-fade">

  <!-- HEADER -->
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div>
      {#if selectedUserId && data.isGlobalOps}
        <button onclick={goBack} class="flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Back to Team
        </button>
      {/if}
      <h1 class="text-xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">
        {selectedUserId && userDetail ? userDetail.user.name : 'System Analytics'}
      </h1>
      <p class="mt-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 hidden sm:block">
        {selectedUserId && userDetail ? `Performance report for ${userDetail.user.email}` : 'Team performance, speed metrics, and individual reports.'}
      </p>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2">
      <select bind:value={dateRange} class="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm text-gray-900 dark:text-white">
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
        <option value="all">All Time</option>
        <option value="custom">Custom Range</option>
      </select>
      {#if dateRange === 'custom'}
        <input type="date" bind:value={customFrom} class="px-2 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white" />
        <input type="date" bind:value={customTo} class="px-2 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white" />
      {/if}
      {#if data.isGlobalOps && !selectedUserId}
        <select bind:value={selectedUniversityId} class="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm text-gray-900 dark:text-white">
          <option value="ALL">All Teams</option>
          {#each universities as univ}
            <option value={univ.id}>{univ.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  {#if isLoading && !selectedUserId}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>

  <!-- ============= USER DETAIL VIEW ============= -->
  {:else if selectedUserId && userDetail}
    {@const s = userDetail.stats}
    {@const efficiency = s.total_assigned > 0 ? Math.round((s.total_completed / s.total_assigned) * 100) : 0}
    {@const onTimePct = (s.on_time + s.late) > 0 ? Math.round((s.on_time / (s.on_time + s.late)) * 100) : 100}
    {@const rating = getRating(s.total_completed, s.total_assigned)}

    {#if isLoadingDetail}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    {:else}

    <!-- User Profile Header -->
    <div class="glass p-6 rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-6">
      <div class="relative">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br {rating.color} flex items-center justify-center text-white font-black text-2xl shadow-lg">
          {userDetail.user.name?.[0] || 'U'}
        </div>
        <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full {getPresenceColor(userDetail.user.presence_status)} border-2 border-white dark:border-slate-900"></div>
      </div>
      <div class="flex-1">
        <h2 class="text-lg font-black text-gray-900 dark:text-white">{userDetail.user.name}</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400">{userDetail.user.email} &middot; {userDetail.user.role} &middot; {userDetail.user.university_name || 'No University'}</p>
      </div>
      <div class="w-14 h-14 rounded-full bg-gradient-to-br {rating.color} ring-2 {rating.ring} ring-offset-2 dark:ring-offset-slate-900 flex items-center justify-center text-white font-black text-xl shadow-lg">
        {rating.letter}
      </div>
    </div>

    <!-- Circular Charts Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <!-- Efficiency Circle -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="text-indigo-500" stroke-dasharray={donutDash(efficiency, 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400 -mt-1">{efficiency}%</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Efficiency</div>
      </div>

      <!-- On Time Circle -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="{onTimePct >= 80 ? 'text-emerald-500' : onTimePct >= 50 ? 'text-amber-500' : 'text-red-500'}"
            stroke-dasharray={donutDash(onTimePct, 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-2xl font-black {onTimePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : onTimePct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} -mt-1">{onTimePct}%</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">On Time</div>
      </div>

      <!-- Task Status Donut -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="text-emerald-500" stroke-dasharray={dashSeg(pctOf(s.total_completed, s.total_assigned), C50)} stroke-dashoffset="0" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10"
            class="text-blue-500" stroke-dasharray={dashSeg(pctOf(s.total_in_progress, s.total_assigned), C50)} stroke-dashoffset={dashOff(pctOf(s.total_completed, s.total_assigned), C50)} />
        </svg>
        <div class="text-lg font-black text-gray-900 dark:text-white -mt-1">{s.total_assigned}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total Tasks</div>
        <div class="flex gap-2 mt-2">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-[8px] font-bold text-gray-400">{s.total_completed}</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500"></span><span class="text-[8px] font-bold text-gray-400">{s.total_in_progress}</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-[8px] font-bold text-gray-400">{s.total_pending}</span></span>
        </div>
      </div>

      <!-- Speed Gauge -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="text-violet-500" stroke-dasharray={donutDash(speedGauge(s.avg_completion_hours), 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-xl font-black text-violet-600 dark:text-violet-400 -mt-1">{formatHours(s.avg_completion_hours)}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Avg Speed</div>
        <div class="flex gap-3 mt-2 text-[8px] font-bold text-gray-400">
          <span>Fast: {formatHours(s.fastest_completion_hours)}</span>
          <span>Slow: {formatHours(s.slowest_completion_hours)}</span>
        </div>
      </div>
    </div>

    <!-- Task Categories + Priority -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Task Categories with pie-style -->
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-5">Task Categories</h3>
        <div class="flex items-center gap-6">
          <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90 flex-shrink-0">
            <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="14" class="text-gray-100 dark:text-slate-800" />
            <circle cx="60" cy="60" r="45" fill="none" stroke-width="14" stroke-linecap="round"
              class="text-indigo-500" stroke-dasharray={dashSeg(pctOf(userDetail.task_types.recurring, userDetail.task_types.recurring + userDetail.task_types.unique), C45)} stroke-dashoffset="0" />
            <circle cx="60" cy="60" r="45" fill="none" stroke-width="14"
              class="text-emerald-500" stroke-dasharray={dashSeg(pctOf(userDetail.task_types.unique, userDetail.task_types.recurring + userDetail.task_types.unique), C45)} stroke-dashoffset={dashOff(pctOf(userDetail.task_types.recurring, userDetail.task_types.recurring + userDetail.task_types.unique), C45)} />
          </svg>
          <div class="flex-1 space-y-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="w-3 h-3 rounded-full bg-indigo-500"></span>
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300">Recurring</span>
              </div>
              <div class="text-sm font-black text-gray-900 dark:text-white">{userDetail.task_types.recurring_completed}/{userDetail.task_types.recurring} done &middot; {formatHours(userDetail.task_types.recurring_avg_hours)} avg</div>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300">Unique</span>
              </div>
              <div class="text-sm font-black text-gray-900 dark:text-white">{userDetail.task_types.unique_completed}/{userDetail.task_types.unique} done &middot; {formatHours(userDetail.task_types.unique_avg_hours)} avg</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Priority Breakdown with visual bars -->
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-5">By Priority</h3>
        <div class="space-y-3">
          {#each userDetail.priority_breakdown as pb}
            {@const barPct = pb.total > 0 ? (pb.completed / pb.total) * 100 : 0}
            {@const barColor = pb.priority === 'URGENT' ? 'from-red-400 to-red-600' : pb.priority === 'HIGH' ? 'from-orange-400 to-orange-600' : pb.priority === 'MEDIUM' ? 'from-blue-400 to-blue-600' : 'from-gray-400 to-gray-500'}
            {@const textColor = pb.priority === 'URGENT' ? 'text-red-600 dark:text-red-400' : pb.priority === 'HIGH' ? 'text-orange-600 dark:text-orange-400' : pb.priority === 'MEDIUM' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-[10px] font-black uppercase tracking-wider {textColor}">{pb.priority}</span>
                <span class="text-xs font-bold text-gray-900 dark:text-white">{pb.completed}/{pb.total} &middot; {formatHours(pb.avg_hours)}</span>
              </div>
              <div class="h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r {barColor} rounded-full transition-all duration-700" style="width: {barPct}%"></div>
              </div>
            </div>
          {/each}
          {#if userDetail.priority_breakdown.length === 0}
            <p class="text-xs text-gray-400 text-center py-4">No priority data</p>
          {/if}
        </div>
        <!-- Communication tasks -->
        <div class="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-bold text-gray-500">Communication Tasks</span>
          <span class="text-sm font-black text-gray-900 dark:text-white">{userDetail.communication_tasks.completed} / {userDetail.communication_tasks.total}</span>
        </div>
      </div>
    </div>

    <!-- Weekly Trend Chart — FIXED with pixel heights -->
    {#if userDetail.weekly_trend.length > 0}
      {@const maxWeekly = Math.max(...userDetail.weekly_trend.map((w: any) => w.completed), 1)}
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4">Weekly Trend</h3>
        <div class="flex items-end gap-3" style="height: 180px;">
          {#each userDetail.weekly_trend as week}
            {@const barH = Math.max((week.completed / maxWeekly) * 150, 6)}
            <div class="flex-1 flex flex-col items-center justify-end group" style="height: 100%;">
              <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{week.completed}</span>
              <div class="w-full max-w-[40px] rounded-t-xl bg-gradient-to-t from-indigo-600 via-indigo-500 to-blue-400 shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all" style="height: {barH}px;"></div>
              <span class="text-[9px] font-bold text-gray-400 dark:text-gray-500 mt-2 whitespace-nowrap">{new Date(week.week_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Daily Activity (30 days) heatmap -->
    {#if userDetail.daily_activity.length > 0}
      {@const maxDaily = Math.max(...userDetail.daily_activity.map((a: any) => a.completed), 1)}
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4">Daily Activity (Last 30 Days)</h3>
        <div class="flex flex-wrap gap-1.5">
          {#each Array.from({ length: 30 }, (_, idx) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - idx));
            const dateStr = d.toISOString().split('T')[0];
            const dayData = userDetail.daily_activity.find((a: any) => new Date(a.day).toISOString().split('T')[0] === dateStr);
            return { date: dateStr, count: dayData?.completed || 0, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' }) };
          }) as cell}
            {@const intensity = cell.count > 0 ? Math.max(0.25, cell.count / maxDaily) : 0}
            <div
              class="w-7 h-7 rounded-lg transition-all cursor-default flex items-center justify-center text-[8px] font-bold {cell.count === 0 ? 'bg-gray-100 dark:bg-slate-800 text-gray-300 dark:text-gray-600' : 'text-white'}"
              style={cell.count > 0 ? `background-color: rgba(99, 102, 241, ${intensity})` : ''}
              title="{cell.label}: {cell.count} tasks"
            >
              {cell.count > 0 ? cell.count : ''}
            </div>
          {/each}
        </div>
        <div class="flex items-center gap-2 mt-3 text-[9px] font-bold text-gray-400">
          <span>Less</span>
          <div class="w-4 h-4 rounded bg-gray-100 dark:bg-slate-800"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 0.25)"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 0.5)"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 0.75)"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 1)"></div>
          <span>More</span>
        </div>
      </div>
    {/if}

    <!-- Recent Tasks Table -->
    <div class="glass rounded-[2rem] overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Recent Tasks</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
          <thead class="bg-gray-50/50 dark:bg-slate-800/50">
            <tr>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Task</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Priority</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Time Taken</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Assigned By</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800/50">
            {#each userDetail.recent_tasks as task}
              {@const pColor = task.priority === 'URGENT' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : task.priority === 'HIGH' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' : task.priority === 'MEDIUM' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}
              {@const sColor = task.assignee_status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : task.assignee_status === 'IN_PROGRESS' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}
              {@const isLate = task.assignee_status === 'COMPLETED' && task.due_date && new Date(task.completed_at) > new Date(task.due_date)}
              <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <td class="px-4 py-3">
                  <div class="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">{task.title}</div>
                  <div class="text-[10px] text-gray-400 font-mono">{new Date(task.created_at).toLocaleDateString()}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full {pColor}">{task.priority}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full {sColor}">
                    {task.assignee_status}
                  </span>
                  {#if isLate}
                    <span class="ml-1 text-[9px] font-bold text-red-500">LATE</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-sm font-bold text-gray-600 dark:text-gray-300 tabular-nums">
                  {task.hours_taken ? formatHours(task.hours_taken) : '-'}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{task.assigned_by_name || '-'}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="5" class="px-4 py-12 text-center text-gray-400 text-sm">No tasks found</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    {/if}

  <!-- ============= TEAM OVERVIEW ============= -->
  {:else}

    <!-- Top Summary with Circular Charts -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Team Efficiency Donut -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="text-indigo-500" stroke-dasharray={donutDash(teamEfficiency, 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-3xl font-black text-indigo-600 dark:text-indigo-400 -mt-2">{teamEfficiency}%</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Team Efficiency</div>
      </div>

      <!-- Task Distribution Donut -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="text-emerald-500" stroke-dasharray={dashSeg(pctOf(totalCompleted, totalAssigned), C50)} stroke-dashoffset="0" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10"
            class="text-blue-500" stroke-dasharray={dashSeg(pctOf(totalInProgress, totalAssigned), C50)} stroke-dashoffset={dashOff(pctOf(totalCompleted, totalAssigned), C50)} />
        </svg>
        <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 -mt-2">{totalCompleted}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Completed</div>
        <div class="flex gap-3 mt-2">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-[8px] font-bold text-gray-400">{totalCompleted} done</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500"></span><span class="text-[8px] font-bold text-gray-400">{totalInProgress} active</span></span>
        </div>
      </div>

      <!-- Avg Speed -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke-width="10" stroke-linecap="round"
            class="text-violet-500" stroke-dasharray={donutDash(speedGauge(avgSpeed), 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-3xl font-black text-violet-600 dark:text-violet-400 -mt-2">{formatHours(avgSpeed)}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Avg Speed</div>
      </div>

      <!-- Overdue / Team Size -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center justify-center">
        <div class="grid grid-cols-2 gap-4 w-full">
          <div class="text-center">
            <div class="text-3xl font-black text-gray-900 dark:text-white">{teamData.length}</div>
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Members</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-black {totalOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}">{totalOverdue}</div>
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Overdue</div>
          </div>
        </div>
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 w-full text-center">
          <div class="text-lg font-black text-gray-900 dark:text-white">{totalAssigned}</div>
          <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Tasks</div>
        </div>
      </div>
    </div>

    <!-- Leaderboard / Team Table -->
    <div class="glass rounded-[2rem] overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
        <h2 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Team Leaderboard</h2>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Click to drill down</span>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
          <thead class="bg-gray-50/50 dark:bg-slate-800/50">
            <tr>
              <th class="px-3 sm:px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
              <th class="px-3 sm:px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Member</th>
              <th class="px-3 sm:px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell">Progress</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Done</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">Avg Speed</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">On Time</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Streak</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Rating</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800/50">
            {#each teamData as member, idx}
              {@const completed = parseInt(member.total_completed) || 0}
              {@const assigned = parseInt(member.total_assigned) || 0}
              {@const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0}
              {@const onTime = parseInt(member.tasks_completed_on_time) || 0}
              {@const late = parseInt(member.tasks_completed_late) || 0}
              {@const onTimePct = (onTime + late) > 0 ? Math.round((onTime / (onTime + late)) * 100) : 100}
              {@const avgH = parseFloat(member.avg_completion_hours) || 0}
              {@const streak = parseInt(member.current_streak) || 0}
              {@const rating = getRating(completed, assigned)}
              {@const badge = getRankBadge(idx)}
              <tr
                class="group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all cursor-pointer active:scale-[0.99]"
                onclick={() => selectUser(member.id)}
              >
                <td class="px-3 sm:px-6 py-3 sm:py-4">
                  {#if badge}
                    <span class="text-[10px] font-black px-2 py-1 rounded-lg {badge.bg}">{badge.emoji}</span>
                  {:else}
                    <span class="text-xs font-bold text-gray-400">{idx + 1}</span>
                  {/if}
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4">
                  <div class="flex items-center gap-3">
                    <div class="relative">
                      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md group-hover:shadow-lg transition-shadow">
                        {member.name?.[0] || 'U'}
                      </div>
                      <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full {getPresenceColor(member.presence_status)} border-2 border-white dark:border-slate-900"></div>
                    </div>
                    <div>
                      <div class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{member.name}</div>
                      <div class="text-[10px] text-gray-400 font-bold">{member.role} &middot; {member.university_name || 'Global'}</div>
                    </div>
                  </div>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden max-w-[120px]">
                      <div class="h-full bg-gradient-to-r from-blue-400 to-indigo-600 rounded-full transition-all duration-700" style="width: {pct}%"></div>
                    </div>
                    <span class="text-[10px] font-black text-gray-500 w-8">{pct}%</span>
                  </div>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center">
                  <span class="text-sm font-black text-gray-900 dark:text-white">{completed}</span>
                  <span class="text-[10px] text-gray-400 font-bold">/{assigned}</span>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center hidden md:table-cell">
                  <span class="text-sm font-bold {avgH > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}">{formatHours(avgH)}</span>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center hidden md:table-cell">
                  <span class="text-sm font-bold {onTimePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : onTimePct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}">{onTimePct}%</span>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center hidden lg:table-cell">
                  {#if streak > 0}
                    <span class="text-sm font-black text-amber-600 dark:text-amber-400">{streak}d</span>
                  {:else}
                    <span class="text-sm text-gray-300 dark:text-gray-600">-</span>
                  {/if}
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center">
                  <div class="w-9 h-9 rounded-full bg-gradient-to-br {rating.color} ring-2 {rating.ring} ring-offset-1 dark:ring-offset-slate-900 flex items-center justify-center text-white font-black text-sm shadow-md mx-auto transition-transform group-hover:scale-110">
                    {rating.letter}
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-6 py-20 text-center">
                  <div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 space-y-3">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em]">No team members found</p>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Rating Legend -->
    <div class="flex flex-wrap items-center gap-4 px-2">
      <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ratings:</span>
      {#each [
        { l: 'S', range: '90-100%', color: 'from-amber-400 to-amber-600' },
        { l: 'A', range: '75-89%', color: 'from-emerald-400 to-emerald-600' },
        { l: 'B', range: '50-74%', color: 'from-blue-400 to-blue-600' },
        { l: 'C', range: '<50%', color: 'from-gray-400 to-gray-600' },
      ] as r}
        <div class="flex items-center gap-1.5">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br {r.color} flex items-center justify-center text-[9px] font-black text-white">{r.l}</div>
          <span class="text-[10px] font-bold text-gray-400">{r.range}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
