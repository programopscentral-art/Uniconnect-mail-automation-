<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';

  type Row = {
    campus_id: string;
    campus_code: string;
    campus_name: string;
    submission_id: string | null;
    status: string;
    submitted_at: string | null;
    signed_off_at: string | null;
    locked_at: string | null;
    is_late_submission: boolean;
    is_late_sign_off: boolean;
    sent_back_count: number;
    auto_signed_off: boolean;
    pm_remark_preview: string | null;
    pm_remark_truncated: boolean;
    incident_count: number;
    has_infra_issue: boolean;
    is_holiday: boolean;
    holiday_reason: string | null;
  };
  type PeriodRow = {
    campus_id: string;
    campus_code: string;
    campus_name: string;
    days_in_range: number;
    days_submitted: number;
    days_signed_off: number;
    days_holiday: number;
    days_auto_signed_off: number;
    days_late_submission: number;
    days_no_submission: number;
    sent_backs_count: number;
    total_sessions_held: number;
    total_sessions_scheduled: number;
    total_students_present: number;
    total_students_enrolled: number;
    total_incidents_flagged: number;
    avg_attendance_pct: number | null;
    sessions_held_pct: number | null;
  };

  let { data } = $props<{
    data: {
      campuses: Array<{ campus_id: string; code: string; display_name: string }>;
      today: string;
      role: string;
      cadence: 'daily' | 'weekly' | 'monthly';
      dailyRows: Row[] | null;
      periodRows: PeriodRow[] | null;
      weekStart: string;
      monthStart: string;
      periodStart: string;
      periodEnd: string;
      filters: { date: string; campus: string; status: string; late: boolean; incidents: boolean };
    };
  }>();

  function fmtRelative(iso: string | null): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(iso).toLocaleDateString();
  }
  function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function updateFilter(name: string, value: string | boolean) {
    const url = new URL($page.url);
    const v = typeof value === 'boolean' ? (value ? '1' : '') : value;
    if (v) url.searchParams.set(name, v);
    else url.searchParams.delete(name);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }

  // Daily-only summary (only shown on the Daily cadence tab)
  let dailySummary = $derived.by(() => {
    const rows = data.dailyRows ?? [];
    const total = rows.length;
    const holiday = rows.filter(r => r.is_holiday).length;
    const signedOff = rows.filter(r => r.status === 'SIGNED_OFF' || r.status === 'LOCKED').length;
    const inFlight = rows.filter(r => ['SUBMITTED', 'PM_REVIEW', 'SENT_BACK', 'DRAFT', 'NEW'].includes(r.status)).length;
    const noSub = rows.filter(r => r.status === 'NO_SUBMISSION').length;
    const late = rows.filter(r => r.is_late_submission || r.is_late_sign_off).length;
    const autoSignedOff = rows.filter(r => r.auto_signed_off).length;
    const incidents = rows.filter(r => !r.is_holiday).reduce((s, r) => s + r.incident_count, 0);
    const infraIssue = rows.filter(r => !r.is_holiday && r.has_infra_issue).length;
    const completionPct = total > 0 ? Math.round(((signedOff + holiday) / total) * 100) : 0;
    return { total, signedOff, inFlight, noSub, late, autoSignedOff, incidents, infraIssue, holiday, completionPct };
  });

  // Period summary across the campus rollup rows (weekly + monthly tabs)
  let periodSummary = $derived.by(() => {
    const rows = data.periodRows ?? [];
    const total = rows.length;
    const totalDaysInRange = rows.reduce((s, r) => s + r.days_in_range, 0);
    const totalSubmitted = rows.reduce((s, r) => s + r.days_submitted, 0);
    const totalSignedOff = rows.reduce((s, r) => s + r.days_signed_off, 0);
    const totalHoliday = rows.reduce((s, r) => s + r.days_holiday, 0);
    const totalLate = rows.reduce((s, r) => s + r.days_late_submission, 0);
    const totalNoSub = rows.reduce((s, r) => s + r.days_no_submission, 0);
    const totalIncidents = rows.reduce((s, r) => s + r.total_incidents_flagged, 0);
    const totalSentBacks = rows.reduce((s, r) => s + r.sent_backs_count, 0);
    const reportingPct = totalDaysInRange > 0
        ? Math.round(((totalSubmitted + totalHoliday) / totalDaysInRange) * 100)
        : 0;
    return { total, totalDaysInRange, totalSubmitted, totalSignedOff, totalHoliday, totalLate, totalNoSub, totalIncidents, totalSentBacks, reportingPct };
  });

  async function setCadence(c: 'daily' | 'weekly' | 'monthly') {
    if (c === data.cadence) return;
    const url = new URL($page.url);
    url.searchParams.set('cadence', c);
    // Clear period-specific params when switching so each tab opens to its own default
    url.searchParams.delete('week');
    url.searchParams.delete('month');
    url.searchParams.delete('date');
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }
  async function shiftPeriod(deltaDays: number) {
    const url = new URL($page.url);
    if (data.cadence === 'weekly') {
      const d = new Date(data.weekStart + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + deltaDays);
      url.searchParams.set('week', d.toISOString().slice(0, 10));
    } else if (data.cadence === 'monthly') {
      const d = new Date(data.monthStart + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + (deltaDays / 30 > 0 ? 1 : -1));
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      url.searchParams.set('month', first.toISOString().slice(0, 10));
    }
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }
  function fmtPct(pct: number | null): string { return pct === null ? '—' : `${pct}%`; }

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'NO_SUBMISSION': return 'bg-zinc-800 text-zinc-500';
      case 'DRAFT':
      case 'NEW':         return 'bg-zinc-800 text-zinc-300';
      case 'SUBMITTED':
      case 'PM_REVIEW':   return 'bg-blue-900 text-blue-200';
      case 'SENT_BACK':   return 'bg-amber-900 text-amber-200';
      case 'SIGNED_OFF':  return 'bg-emerald-900 text-emerald-200';
      case 'LOCKED':      return 'bg-violet-900 text-violet-200';
      default:            return 'bg-zinc-800 text-zinc-400';
    }
  }
  function statusDisplay(status: string): string {
    if (status === 'NO_SUBMISSION') return 'NO SUB';
    if (status === 'PM_REVIEW') return 'IN REVIEW';
    if (status === 'SENT_BACK') return 'SENT BACK';
    if (status === 'SIGNED_OFF') return 'SIGNED OFF';
    return status;
  }

  // Row health: green = signed off & no issues, amber = in flight or has issues, red = late or incidents
  function rowHealth(r: Row): 'good' | 'warn' | 'bad' | 'idle' {
    if (r.status === 'NO_SUBMISSION') return 'idle';
    // Holiday submissions are accounted for — show as good regardless of
    // status, since no operational data is expected.
    if (r.is_holiday) return 'good';
    if (r.is_late_submission || r.is_late_sign_off || r.incident_count > 0) return 'bad';
    if (r.status === 'SIGNED_OFF' || r.status === 'LOCKED') {
      if (r.has_infra_issue) return 'warn';
      return 'good';
    }
    if (r.has_infra_issue || ['SUBMITTED', 'PM_REVIEW', 'SENT_BACK'].includes(r.status)) return 'warn';
    return 'idle';
  }
  function healthDot(h: 'good' | 'warn' | 'bad' | 'idle'): string {
    if (h === 'good') return 'bg-emerald-500';
    if (h === 'warn') return 'bg-amber-500';
    if (h === 'bad')  return 'bg-red-500';
    return 'bg-zinc-700';
  }

  // Friendly date label
  let dateLabel = $derived.by(() => {
    const d = new Date(data.filters.date + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  });
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-7xl px-4 py-6">

    <!-- ── Cadence tabs ───────────────────────────────────────────────── -->
    <div class="mb-3 inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
      {#each ['daily', 'weekly', 'monthly'] as c}
        <button
          class="rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors
                 {data.cadence === c ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}"
          onclick={() => setCadence(c as 'daily' | 'weekly' | 'monthly')}
        >{c}</button>
      {/each}
    </div>

    <!-- ── Header card ────────────────────────────────────────────────── -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Operations Overview</div>
          <div class="mt-1 text-lg font-semibold">
            {#if data.cadence === 'daily'}Daily campus health{:else if data.cadence === 'weekly'}Weekly campus rollup{:else}Monthly campus rollup{/if}
          </div>
          <div class="mt-0.5 text-xs text-zinc-400">
            {#if data.cadence === 'daily'}
              {dateLabel}
            {:else}
              {data.periodStart} → {data.periodEnd}
            {/if}
          </div>
        </div>
        <div class="flex items-center gap-3">
          <!-- Completion ring -->
          <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5">
            <div class="flex items-center gap-3">
              <div class="text-right">
                <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Signed off</div>
                <div class="text-base font-semibold tabular-nums text-emerald-200">{dailySummary.signedOff} / {dailySummary.total}</div>
              </div>
              <div class="h-10 w-10 relative">
                <svg viewBox="0 0 36 36" class="h-10 w-10 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#27272a" stroke-width="3" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" stroke-width="3"
                    stroke-dasharray={`${dailySummary.completionPct * 0.88} 88`} stroke-linecap="round" />
                </svg>
                <div class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-emerald-300">{dailySummary.completionPct}%</div>
              </div>
            </div>
          </div>
          <button
            class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            onclick={() => invalidateAll()}
          >↻ Refresh</button>
        </div>
      </div>

      <!-- Health tiles -->
      {#if data.cadence === 'daily'}
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Campuses</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums">{dailySummary.total}</div>
        </div>
        <div class="rounded-xl border border-blue-900 bg-blue-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">In flight</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-blue-200">{dailySummary.inFlight}</div>
        </div>
        <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">No submission</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-zinc-400">{dailySummary.noSub}</div>
        </div>
        <div class="rounded-xl border border-red-900 bg-red-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-red-400">Late</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-red-200">{dailySummary.late}</div>
        </div>
        <div class="rounded-xl border border-rose-900 bg-rose-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-rose-400">Incidents</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-rose-200">{dailySummary.incidents}</div>
        </div>
        <div class="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Infra issue</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-200">{dailySummary.infraIssue}</div>
        </div>
      </div>
      {:else}
      <!-- Weekly / monthly aggregate tiles -->
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Campuses</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums">{periodSummary.total}</div>
        </div>
        <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Signed-off days</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">{periodSummary.totalSignedOff}</div>
        </div>
        <div class="rounded-xl border border-blue-900 bg-blue-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">Reporting %</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-blue-200">{periodSummary.reportingPct}%</div>
        </div>
        <div class="rounded-xl border border-red-900 bg-red-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-red-400">Late days</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-red-200">{periodSummary.totalLate}</div>
        </div>
        <div class="rounded-xl border border-rose-900 bg-rose-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-rose-400">Total incidents</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-rose-200">{periodSummary.totalIncidents}</div>
        </div>
        <div class="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Send-backs</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-200">{periodSummary.totalSentBacks}</div>
        </div>
      </div>
      {/if}

      {#if dailySummary.autoSignedOff > 0}
        <div class="mt-3 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          <strong class="text-amber-200">{dailySummary.autoSignedOff} campus{dailySummary.autoSignedOff === 1 ? '' : 'es'} auto-signed-off</strong>
          — PM did not respond by 6:30 PM IST. Non-response counter incremented on assigned PMs.
          <a href="/ops-os/access-rights" class="ml-1 underline decoration-amber-500/50 hover:decoration-amber-200">Review assignments →</a>
        </div>
      {/if}
    </div>

    <!-- ── Filters ────────────────────────────────────────────────────── -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      {#if data.cadence === 'daily'}
        <div>
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="date-filter">Date</label>
          <input
            id="date-filter" type="date"
            class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
            value={data.filters.date}
            onchange={(e) => updateFilter('date', (e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      {:else if data.cadence === 'weekly'}
        <div class="flex items-end gap-2">
          <button class="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => shiftPeriod(-7)}>← Prev week</button>
          <div>
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="week-pick">Week of</label>
            <input
              id="week-pick" type="date"
              class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
              value={data.weekStart}
              onchange={(e) => { const url = new URL($page.url); url.searchParams.set('week', (e.currentTarget as HTMLInputElement).value); goto(url.pathname + url.search, { invalidateAll: true, keepFocus: true, noScroll: true }); }}
            />
          </div>
          <button class="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => shiftPeriod(7)}>Next week →</button>
        </div>
      {:else}
        <div class="flex items-end gap-2">
          <button class="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => shiftPeriod(-30)}>← Prev month</button>
          <div>
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="month-pick">Month</label>
            <input
              id="month-pick" type="month"
              class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
              value={data.monthStart.slice(0, 7)}
              onchange={(e) => { const url = new URL($page.url); url.searchParams.set('month', `${(e.currentTarget as HTMLInputElement).value}-01`); goto(url.pathname + url.search, { invalidateAll: true, keepFocus: true, noScroll: true }); }}
            />
          </div>
          <button class="rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => shiftPeriod(30)}>Next month →</button>
        </div>
      {/if}
      <div>
        <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="campus-filter">Campus</label>
        <select
          id="campus-filter"
          class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          value={data.filters.campus}
          onchange={(e) => updateFilter('campus', (e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="">All campuses</option>
          {#each data.campuses as c (c.campus_id)}
            <option value={c.campus_id}>{c.display_name}</option>
          {/each}
        </select>
      </div>
      {#if data.cadence === 'daily'}
        <div>
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="status-filter">Status</label>
          <select
            id="status-filter"
            class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            value={data.filters.status}
            onchange={(e) => updateFilter('status', (e.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">All</option>
            <option value="NO_SUBMISSION">No submission</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="SENT_BACK">Sent back</option>
            <option value="SIGNED_OFF">Signed off</option>
            <option value="LOCKED">Locked</option>
          </select>
        </div>
        <label class="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800">
          <input
            type="checkbox"
            checked={data.filters.late}
            onchange={(e) => updateFilter('late', (e.currentTarget as HTMLInputElement).checked)}
            class="accent-amber-500"
          />
          Late only
        </label>
        <label class="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800">
          <input
            type="checkbox"
            checked={data.filters.incidents}
            onchange={(e) => updateFilter('incidents', (e.currentTarget as HTMLInputElement).checked)}
            class="accent-rose-500"
          />
          Incidents only
        </label>
      {/if}
    </div>

    <!-- ── Table (daily cadence) ──────────────────────────────────────── -->
    {#if data.cadence === 'daily'}
    {#if (data.dailyRows ?? []).length === 0}
      <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-16 text-center">
        <div class="text-3xl">🔍</div>
        <div class="mt-3 text-base font-semibold text-zinc-200">No campuses match the current filters.</div>
        <div class="mt-1 text-xs text-zinc-500">Try changing the date or clearing the filters above.</div>
      </div>
    {:else}
      <div class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="w-8 px-2 py-3 text-center font-medium"></th>
              <th class="px-3 py-3 text-left font-medium">Campus</th>
              <th class="px-3 py-3 text-left font-medium">Status</th>
              <th class="px-3 py-3 text-left font-medium">Submitted</th>
              <th class="px-3 py-3 text-left font-medium">Signed off</th>
              <th class="px-3 py-3 text-right font-medium">Inc.</th>
              <th class="px-3 py-3 text-center font-medium">Infra</th>
              <th class="px-3 py-3 text-right font-medium">SB</th>
              <th class="px-3 py-3 text-left font-medium">PM remark</th>
              <th class="px-3 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each (data.dailyRows ?? []) as r (r.campus_id)}
              {@const h = rowHealth(r)}
              <tr
                class="transition-colors"
                class:hover:bg-zinc-800={r.submission_id}
                class:cursor-pointer={r.submission_id}
                onclick={r.submission_id ? () => goto(`/ops-os/operations/${r.submission_id}`) : undefined}
              >
                <td class="px-2 py-3 text-center">
                  <div class="mx-auto h-2 w-2 rounded-full {healthDot(h)}" title={h}></div>
                </td>
                <td class="px-3 py-3">
                  <div class="font-medium">{r.campus_name}</div>
                  <div class="text-[10px] uppercase tracking-wider text-zinc-500">{r.campus_code}</div>
                </td>
                <td class="px-3 py-3">
                  {#if r.is_holiday}
                    <span class="rounded-md bg-amber-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white" title={r.holiday_reason ?? 'No reason given'}>Holiday</span>
                  {:else}
                    <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusBadgeClass(r.status)}">
                      {statusDisplay(r.status)}
                    </span>
                  {/if}
                  {#if r.auto_signed_off}
                    <span class="ml-1 rounded-md bg-amber-900 px-1.5 py-0.5 text-[9px] uppercase font-semibold text-amber-200" title="System auto-signed-off because PM did not respond by 6:30 PM IST">auto</span>
                  {/if}
                  {#if r.is_late_submission || r.is_late_sign_off}
                    <span class="ml-1 rounded-md bg-red-900 px-1.5 py-0.5 text-[9px] uppercase font-semibold text-red-200">late</span>
                  {/if}
                </td>
                <td class="px-3 py-3 text-zinc-400 tabular-nums" title={r.submitted_at ?? ''}>
                  {#if r.submitted_at}
                    <div>{fmtTime(r.submitted_at)}</div>
                    <div class="text-[10px] text-zinc-500">{fmtRelative(r.submitted_at)}</div>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-3 text-zinc-400 tabular-nums" title={r.signed_off_at ?? ''}>
                  {#if r.signed_off_at}
                    <div>{fmtTime(r.signed_off_at)}</div>
                    <div class="text-[10px] text-zinc-500">{fmtRelative(r.signed_off_at)}</div>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-3 text-right">
                  {#if r.incident_count > 0}
                    <span class="rounded-md bg-rose-900/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-100">{r.incident_count}</span>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-3 text-center">
                  {#if r.has_infra_issue}
                    <span class="text-amber-400 text-base leading-none" title="Infrastructure issue reported">●</span>
                  {:else}<span class="text-zinc-700">—</span>{/if}
                </td>
                <td class="px-3 py-3 text-right tabular-nums {r.sent_back_count > 0 ? 'text-amber-300 font-medium' : 'text-zinc-500'}">{r.sent_back_count}</td>
                <td class="px-3 py-3 text-zinc-400 max-w-xs">
                  {#if r.pm_remark_preview}
                    <span title={r.pm_remark_truncated ? r.pm_remark_preview + '…' : r.pm_remark_preview} class="block truncate">
                      {r.pm_remark_preview}{r.pm_remark_truncated ? '…' : ''}
                    </span>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-3 text-right">
                  {#if r.submission_id}
                    <a
                      href={`/ops-os/operations/${r.submission_id}`}
                      class="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                      onclick={(e) => e.stopPropagation()}
                    >Open →</a>
                  {:else}<span class="text-[10px] text-zinc-600">—</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {:else}
    <!-- ── Period table (weekly / monthly) ────────────────────────────── -->
    {#if (data.periodRows ?? []).length === 0}
      <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-16 text-center">
        <div class="text-3xl">🔍</div>
        <div class="mt-3 text-base font-semibold text-zinc-200">No campuses to show for {data.periodStart} → {data.periodEnd}.</div>
      </div>
    {:else}
      <div class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <table class="w-full text-sm">
          <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              <th class="px-3 py-3 text-left font-medium">Campus</th>
              <th class="px-3 py-3 text-right font-medium">Reported</th>
              <th class="px-3 py-3 text-right font-medium">Signed off</th>
              <th class="px-3 py-3 text-right font-medium">Holiday</th>
              <th class="px-3 py-3 text-right font-medium">Late</th>
              <th class="px-3 py-3 text-right font-medium">Sessions held</th>
              <th class="px-3 py-3 text-right font-medium">Attendance</th>
              <th class="px-3 py-3 text-right font-medium">Incidents</th>
              <th class="px-3 py-3 text-right font-medium">Send-backs</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each (data.periodRows ?? []) as r (r.campus_id)}
              <tr class="transition-colors hover:bg-zinc-800">
                <td class="px-3 py-3">
                  <div class="font-medium">{r.campus_name}</div>
                  <div class="text-[10px] uppercase tracking-wider text-zinc-500">{r.campus_code}</div>
                </td>
                <td class="px-3 py-3 text-right tabular-nums">
                  <div>{r.days_submitted} / {r.days_in_range}</div>
                  {#if r.days_no_submission > 0}
                    <div class="text-[10px] text-zinc-500">{r.days_no_submission} missed</div>
                  {/if}
                </td>
                <td class="px-3 py-3 text-right tabular-nums text-emerald-300">{r.days_signed_off}</td>
                <td class="px-3 py-3 text-right tabular-nums {r.days_holiday > 0 ? 'text-amber-300' : 'text-zinc-500'}">{r.days_holiday}</td>
                <td class="px-3 py-3 text-right tabular-nums {r.days_late_submission > 0 ? 'text-red-300' : 'text-zinc-500'}">{r.days_late_submission}</td>
                <td class="px-3 py-3 text-right tabular-nums">
                  <div>{r.total_sessions_held} / {r.total_sessions_scheduled}</div>
                  <div class="text-[10px] text-zinc-500">{fmtPct(r.sessions_held_pct)} delivered</div>
                </td>
                <td class="px-3 py-3 text-right tabular-nums">{fmtPct(r.avg_attendance_pct)}</td>
                <td class="px-3 py-3 text-right">
                  {#if r.total_incidents_flagged > 0}
                    <span class="rounded-md bg-rose-900/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-rose-100">{r.total_incidents_flagged}</span>
                  {:else}<span class="text-zinc-600">—</span>{/if}
                </td>
                <td class="px-3 py-3 text-right tabular-nums {r.sent_backs_count > 0 ? 'text-amber-300 font-medium' : 'text-zinc-500'}">{r.sent_backs_count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="mt-3 text-xs text-zinc-500">
        Computed by aggregating each campus's daily submissions for {data.periodStart} → {data.periodEnd}.
      </div>
    {/if}
    {/if}
  </div>
</div>
