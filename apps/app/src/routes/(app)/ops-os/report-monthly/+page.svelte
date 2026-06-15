<script lang="ts">
  import { goto } from '$app/navigation';
  import { page, navigating } from '$app/stores';

  type OpsRollup = {
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

  type FullRollup = {
    period_start: string;
    period_end: string;
    campus_id: string;
    university_id: string | null;
    university_name: string | null;
    ops_rollup: OpsRollup;
    faculty: {
      days_recorded: number;
      total_instructors: number;
      present_count: number;
      absent_authorised_count: number;
      absent_unauthorised_count: number;
      attendance_pct: number | null;
      per_instructor: Array<{ instructor_id: string; name: string | null; present: number; absent_auth: number; absent_unauth: number; total_days: number; attendance_pct: number | null }>;
    };
    coach: {
      days_recorded: number;
      total_coaches: number;
      total_student_calls: number;
      total_parent_calls: number;
      target_aggregate: number;
      days_target_met: number;
      days_target_missed: number;
      target_attainment_pct: number | null;
      per_coach: Array<{ coach_id: string; name: string | null; student_calls: number; parent_calls: number; target_sum: number; days_recorded: number }>;
    };
    fees: {
      end_of_month_students: number | null;
      end_of_month_fully_paid: number | null;
      end_of_month_partial: number | null;
      end_of_month_yet_to_pay: number | null;
      end_of_month_total_payable: string | null;
      end_of_month_total_paid: string | null;
      end_of_month_collection_pct: number | null;
      snapshot_date: string | null;
      snapshots_in_range: number;
    };
  };

  let { data } = $props<{ data: {
    campuses: Array<{ campus_id: string; code: string; display_name: string; university_id: string | null; university_name: string | null }>;
    universities: Array<{ id: string; name: string }>;
    period_start: string;
    period_end: string;
    role: string;
    canDownloadUniWide: boolean;
    activeCampusId: string;
    rollup: FullRollup | null;
  } }>();

  let selectedUniId = $state<string>('');

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
  function fmtMoney(v: string | number | null): string {
    if (v === null || v === undefined) return '—';
    const n = typeof v === 'string' ? Number(v) : v;
    if (!Number.isFinite(n)) return '—';
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
  }
  function backToDaily() {
    const url = new URL($page.url);
    const next = new URL('/ops-os/report', url.origin);
    if (data.activeCampusId) next.searchParams.set('campus', data.activeCampusId);
    goto(next.pathname + next.search);
  }
  function downloadCampusReport() {
    if (!data.activeCampusId) return;
    const params = new URLSearchParams();
    params.set('campus', data.activeCampusId);
    params.set('month', data.period_start);
    window.location.href = `/api/ops-os/monthly-report.xlsx?${params.toString()}`;
  }
  function downloadUniversityReport() {
    if (!selectedUniId) return;
    const params = new URLSearchParams();
    params.set('university', selectedUniId);
    params.set('month', data.period_start);
    window.location.href = `/api/ops-os/monthly-report.xlsx?${params.toString()}`;
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
  <div class="mx-auto max-w-4xl px-4 py-6">

    <div class="mb-3">
      <button class="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5" onclick={backToDaily}>
        <span>←</span> Back to Daily Report
      </button>
    </div>

    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Monthly Summary · NIAT</div>
          <div class="mt-1 text-lg font-semibold">
            {data.campuses.find(c => c.campus_id === data.activeCampusId)?.display_name ?? '—'}
          </div>
          <div class="mt-0.5 text-sm text-zinc-400">{prettyMonth}</div>
          <div class="mt-0.5 text-xs text-zinc-500 tabular-nums">{data.period_start} → {data.period_end} (IST)</div>
        </div>
        {#if data.activeCampusId}
          <button
            class="rounded-md border border-maroon-700 bg-maroon-900/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40 border-emerald-800"
            style="background:#064e3b; color:#d1fae5; border-color:#065f46"
            onclick={downloadCampusReport}
          >
            ⬇ Download report (.xlsx)
          </button>
        {/if}
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
              <option value={c.campus_id}>{c.display_name}{c.university_name ? ` · ${c.university_name}` : ''}</option>
            {/each}
          </select>
        </div>
      {/if}

      {#if data.canDownloadUniWide && data.universities.length > 0}
        <div class="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
          <label class="block text-[10px] uppercase tracking-[0.18em] text-amber-400" for="uni-sel">University-wide download</label>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <select
              id="uni-sel"
              class="flex-1 min-w-[200px] rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              bind:value={selectedUniId}
            >
              <option value="">— pick a university —</option>
              {#each data.universities as u (u.id)}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
            <button
              class="rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-40"
              style="background:#92400e; color:#fef3c7"
              disabled={!selectedUniId}
              onclick={downloadUniversityReport}
            >
              ⬇ Download
            </button>
          </div>
          <div class="mt-1.5 text-[11px] text-amber-300/70">
            Downloads one workbook with every campus in the chosen university for {prettyMonth} — Ops + Faculty + Coaches + Fees.
          </div>
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
      {@const o = r.ops_rollup}

      <!-- Submission completeness banner -->
      {#if o.days_no_submission > o.days_in_range / 2}
        <div class="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
          <strong>Partial month:</strong> only {o.days_submitted} of {o.days_in_range} days were submitted by the BOA. The Ops figures below cover only the submitted days. Faculty + Coach + Fee figures below cover the entire month independent of submissions.
        </div>
      {/if}

      <!-- Day completeness -->
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Day completeness · Ops OS submissions</div>
          <div class="text-sm font-semibold">{o.days_submitted} of {o.days_in_range} days reported · {o.days_signed_off} signed off</div>
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-3">
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Submitted days</div><div class="mt-1 text-lg font-semibold tabular-nums">{o.days_submitted} / {o.days_in_range}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-emerald-400">Signed off</div><div class="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{o.days_signed_off}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Holiday days</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{o.days_holiday}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-red-400">Late submissions</div><div class="mt-1 text-lg font-semibold tabular-nums text-red-300">{o.days_late_submission}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Auto-signed-off</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{o.days_auto_signed_off}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">No submission</div><div class="mt-1 text-lg font-semibold tabular-nums text-zinc-400">{o.days_no_submission}</div></div>
        </div>
        {#if o.sent_backs_count > 0}
          <div class="border-t border-zinc-800 px-4 py-2 text-xs text-amber-300">
            <strong>{o.sent_backs_count}</strong> send-back{o.sent_backs_count === 1 ? '' : 's'} across this month's daily reports.
          </div>
        {/if}
      </section>

      <!-- Academic + attendance (from ops_os submissions) -->
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Academic + Daily attendance (from BOA submissions)</div>
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800">
          <div class="bg-zinc-900 px-3 py-3">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Sessions held / scheduled</div>
            <div class="mt-1 text-lg font-semibold tabular-nums">{o.total_sessions_held} / {o.total_sessions_scheduled}</div>
            <div class="text-xs text-zinc-500 tabular-nums">{fmtPct(o.sessions_held_pct)} delivered</div>
          </div>
          <div class="bg-zinc-900 px-3 py-3">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Student avg attendance</div>
            <div class="mt-1 text-lg font-semibold tabular-nums">{fmtPct(o.avg_attendance_pct)}</div>
            <div class="text-xs text-zinc-500 tabular-nums">{o.total_students_present} present / {o.total_students_enrolled} enrolled</div>
          </div>
        </div>
      </section>

      <!-- Faculty Attendance (from instructor_attendance — full month) -->
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Faculty attendance · {r.university_name ?? '—'}</div>
          <div class="text-sm font-semibold">
            {r.faculty.total_instructors} instructors · {r.faculty.days_recorded} days recorded · {fmtPct(r.faculty.attendance_pct)} present
          </div>
        </header>
        {#if r.faculty.days_recorded === 0}
          <div class="px-4 py-4 text-sm text-zinc-500 italic">No faculty attendance recorded for this university this month.</div>
        {:else}
          <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-4">
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-emerald-400">Present (sum)</div><div class="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{r.faculty.present_count}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Absent (authorised)</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{r.faculty.absent_authorised_count}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-red-400">Absent (unauthorised)</div><div class="mt-1 text-lg font-semibold tabular-nums text-red-300">{r.faculty.absent_unauthorised_count}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Days with any record</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.faculty.days_recorded}</div></div>
          </div>
          <div class="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">Per-instructor breakdown available in the .xlsx download.</div>
        {/if}
      </section>

      <!-- Success Coaches (from success_coach_daily_log — full month) -->
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Success coach calls · {r.university_name ?? '—'}</div>
          <div class="text-sm font-semibold">
            {r.coach.total_coaches} coaches · {r.coach.days_recorded} days logged · {fmtPct(r.coach.target_attainment_pct)} of target
          </div>
        </header>
        {#if r.coach.days_recorded === 0}
          <div class="px-4 py-4 text-sm text-zinc-500 italic">No coach call activity recorded for this university this month.</div>
        {:else}
          <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-4">
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Student calls</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.coach.total_student_calls}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Parent calls</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.coach.total_parent_calls}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-emerald-400">Target hit (days)</div><div class="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{r.coach.days_target_met}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-red-400">Target missed (days)</div><div class="mt-1 text-lg font-semibold tabular-nums text-red-300">{r.coach.days_target_missed}</div></div>
          </div>
          <div class="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">Per-coach breakdown available in the .xlsx download.</div>
        {/if}
      </section>

      <!-- Fee Collection (end-of-month snapshot) -->
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Fee collection · {r.university_name ?? '—'}</div>
          <div class="text-sm font-semibold">
            {#if r.fees.snapshot_date}
              End-of-month snapshot: {r.fees.snapshot_date} · {fmtPct(r.fees.end_of_month_collection_pct)} collected
            {:else}
              No fee snapshot in this month for this university.
            {/if}
          </div>
        </header>
        {#if r.fees.snapshot_date}
          <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-3">
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Students</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.fees.end_of_month_students ?? '—'}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-emerald-400">Fully paid</div><div class="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{r.fees.end_of_month_fully_paid ?? '—'}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Partial</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{r.fees.end_of_month_partial ?? '—'}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-red-400">Yet to pay</div><div class="mt-1 text-lg font-semibold tabular-nums text-red-300">{r.fees.end_of_month_yet_to_pay ?? '—'}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Total payable</div><div class="mt-1 text-lg font-semibold tabular-nums">{fmtMoney(r.fees.end_of_month_total_payable)}</div></div>
            <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Total paid</div><div class="mt-1 text-lg font-semibold tabular-nums">{fmtMoney(r.fees.end_of_month_total_paid)}</div></div>
          </div>
        {/if}
      </section>

      <!-- Student ops + incidents -->
      <section class="mb-4 overflow-hidden rounded-xl border bg-zinc-900"
        class:border-red-800={o.total_incidents_flagged > 0}
        class:border-zinc-800={o.total_incidents_flagged === 0}
      >
        <header class="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Student ops + incidents</div>
            <div class="text-sm font-semibold">Hostel / transport / escalations / incidents</div>
          </div>
          {#if o.total_incidents_flagged > 0}
            <span class="rounded-md bg-red-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-200">Attention</span>
          {/if}
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-4">
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-rose-400">Incidents</div><div class="mt-1 text-lg font-semibold tabular-nums text-rose-300">{o.total_incidents_flagged}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Hostel issues</div><div class="mt-1 text-lg font-semibold tabular-nums">{o.total_hostel_issues}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Transport</div><div class="mt-1 text-lg font-semibold tabular-nums">{o.total_transport_incidents}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Escalations open / close</div><div class="mt-1 text-lg font-semibold tabular-nums">{o.total_escalations_opened} / {o.total_escalations_closed}</div></div>
        </div>
      </section>

      <div class="mt-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-500">
        Ops figures are from this campus's daily BOA submissions. Faculty, Coach, and Fee figures cover the entire month from their respective source tables — independent of BOA submission completeness.
      </div>
    {/if}
  </div>
</div>
