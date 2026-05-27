<script lang="ts">
  import { goto } from '$app/navigation';
  import { page, navigating } from '$app/stores';

  type Rollup = {
    period_start: string;
    period_end: string;
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
    total_faculty_absent: number;
    total_incidents_flagged: number;
    total_hostel_issues: number;
    total_transport_incidents: number;
    total_escalations_opened: number;
    total_escalations_closed: number;
    avg_attendance_pct: number | null;
    sessions_held_pct: number | null;
  };

  let { data } = $props<{ data: {
    campuses: Array<{ campus_id: string; code: string; display_name: string }>;
    period_start: string;
    period_end: string;
    role: string;
    activeCampusId: string;
    rollup: Rollup | null;
  } }>();

  async function onCampusChange(newCampusId: string) {
    if (newCampusId === data.activeCampusId) return;
    const url = new URL($page.url);
    url.searchParams.set('campus', newCampusId);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }
  async function onMonthChange(firstOfMonth: string) {
    const url = new URL($page.url);
    url.searchParams.set('month', firstOfMonth);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }
  function shiftMonth(delta: number): string {
    const d = new Date(data.period_start + 'T00:00:00Z');
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
    return next.toISOString().slice(0, 10);
  }

  function fmtPct(pct: number | null): string { return pct === null ? '—' : `${pct}%`; }
  function backToDaily() {
    const url = new URL($page.url);
    const next = new URL('/ops-os/report', url.origin);
    if (data.activeCampusId) next.searchParams.set('campus', data.activeCampusId);
    goto(next.pathname + next.search);
  }

  let prettyMonth = $derived.by(() => {
    const d = new Date(data.period_start + 'T00:00:00Z');
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });
</script>

{#if $navigating}
  <div class="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden">
    <div class="h-full w-1/3 animate-pulse bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]"></div>
  </div>
{/if}

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-3xl px-4 py-6">

    <div class="mb-3">
      <button class="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5" onclick={backToDaily}>
        <span>←</span> Back to Daily Report
      </button>
    </div>

    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div>
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Monthly Summary · NIAT</div>
        <div class="mt-1 text-lg font-semibold">
          {data.campuses.find(c => c.campus_id === data.activeCampusId)?.display_name ?? '—'}
        </div>
        <div class="mt-0.5 text-sm text-zinc-400">{prettyMonth}</div>
        <div class="mt-0.5 text-xs text-zinc-500 tabular-nums">{data.period_start} → {data.period_end} (IST)</div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          class="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => onMonthChange(shiftMonth(-1))}
        >← Previous month</button>
        <input
          type="month"
          value={data.period_start.slice(0, 7)}
          onchange={(e) => onMonthChange(`${(e.currentTarget as HTMLInputElement).value}-01`)}
          class="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-blue-600 focus:outline-none"
        />
        <button
          class="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => onMonthChange(shiftMonth(1))}
        >Next month →</button>
      </div>

      {#if data.campuses.length > 1}
        <div class="mt-3">
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="campus-sel">Campus</label>
          <select
            id="campus-sel"
            class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            value={data.activeCampusId}
            onchange={(e) => onCampusChange((e.currentTarget as HTMLSelectElement).value)}
          >
            {#each data.campuses as c (c.campus_id)}
              <option value={c.campus_id}>{c.display_name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    {#if data.campuses.length === 0}
      <div class="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
        No campuses available.
      </div>
    {:else if !data.rollup}
      <div class="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        Pick a campus to load the monthly summary.
      </div>
    {:else}
      {@const r = data.rollup}

      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Day completeness</div>
          <div class="text-sm font-semibold">{r.days_submitted} of {r.days_in_range} days reported · {r.days_signed_off} signed off</div>
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-3">
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Submitted days</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.days_submitted} / {r.days_in_range}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-emerald-400">Signed off</div><div class="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{r.days_signed_off}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Holiday days</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{r.days_holiday}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-red-400">Late submissions</div><div class="mt-1 text-lg font-semibold tabular-nums text-red-300">{r.days_late_submission}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Auto-signed-off</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{r.days_auto_signed_off}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">No submission</div><div class="mt-1 text-lg font-semibold tabular-nums text-zinc-400">{r.days_no_submission}</div></div>
        </div>
        {#if r.sent_backs_count > 0}
          <div class="border-t border-zinc-800 px-4 py-2 text-xs text-amber-300">
            <strong>{r.sent_backs_count}</strong> send-back{r.sent_backs_count === 1 ? '' : 's'} across this month's daily reports.
          </div>
        {/if}
      </section>

      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Academic + attendance</div>
          <div class="text-sm font-semibold">Sessions held vs scheduled · attendance %</div>
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800">
          <div class="bg-zinc-900 px-3 py-3">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Sessions held / scheduled</div>
            <div class="mt-1 text-lg font-semibold tabular-nums">{r.total_sessions_held} / {r.total_sessions_scheduled}</div>
            <div class="text-xs text-zinc-500 tabular-nums">{fmtPct(r.sessions_held_pct)} delivered</div>
          </div>
          <div class="bg-zinc-900 px-3 py-3">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Avg attendance</div>
            <div class="mt-1 text-lg font-semibold tabular-nums">{fmtPct(r.avg_attendance_pct)}</div>
            <div class="text-xs text-zinc-500 tabular-nums">{r.total_students_present} present / {r.total_students_enrolled} enrolled</div>
          </div>
          <div class="bg-zinc-900 px-3 py-3">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Faculty absent (sum)</div>
            <div class="mt-1 text-lg font-semibold tabular-nums">{r.total_faculty_absent}</div>
          </div>
        </div>
      </section>

      <section class="mb-4 overflow-hidden rounded-xl border bg-zinc-900"
        class:border-red-800={r.total_incidents_flagged > 0}
        class:border-zinc-800={r.total_incidents_flagged === 0}
      >
        <header class="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Student ops + incidents</div>
            <div class="text-sm font-semibold">Hostel / transport / escalations / incidents</div>
          </div>
          {#if r.total_incidents_flagged > 0}
            <span class="rounded-md bg-red-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-200">Attention</span>
          {/if}
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-4">
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-rose-400">Incidents</div><div class="mt-1 text-lg font-semibold tabular-nums text-rose-300">{r.total_incidents_flagged}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Hostel issues</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_hostel_issues}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Transport</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_transport_incidents}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Escalations open / close</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_escalations_opened} / {r.total_escalations_closed}</div></div>
        </div>
      </section>

      <div class="mt-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-500">
        Computed from this campus's daily reports for {prettyMonth}.
        Nothing to fill — change campus or month to load a different rollup.
      </div>
    {/if}
  </div>
</div>
