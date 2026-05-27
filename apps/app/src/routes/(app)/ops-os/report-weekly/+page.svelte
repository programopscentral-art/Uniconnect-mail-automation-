<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page, navigating } from '$app/stores';

  type SubmissionRow = {
    submission_id: string;
    status: string;
    sent_back_reason_code: string | null;
    sent_back_reason_text: string | null;
    pm_remark: string | null;
    submitted_at: string | null;
  };
  type ValueRow = {
    metric_id: string;
    value_numeric: number | null;
    value_text: string | null;
    value_boolean: boolean | null;
  };
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
    submission: SubmissionRow | null;
    values: ValueRow[];
    rollup: Rollup | null;
  } }>();

  function valuesFromServer(rows: ValueRow[]): Record<string, string | number | boolean | null> {
    const out: Record<string, string | number | boolean | null> = {};
    for (const v of rows) out[v.metric_id] = v.value_numeric ?? v.value_text ?? v.value_boolean ?? null;
    return out;
  }

  let selectedCampusId   = $state(data.activeCampusId);
  let submissionId       = $state<string | null>(data.submission?.submission_id ?? null);
  let submissionStatus   = $state<string>(data.submission?.status ?? '');
  let sentBackReasonCode = $state<string | null>(data.submission?.sent_back_reason_code ?? null);
  let sentBackReasonText = $state<string | null>(data.submission?.sent_back_reason_text ?? null);
  let pmRemark           = $state<string | null>(data.submission?.pm_remark ?? null);

  let values    = $state<Record<string, string | number | boolean | null>>(valuesFromServer(data.values));
  let saveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  let saveError = $state<Record<string, string | null>>({});

  let submitting  = $state(false);
  let submitError = $state<string | null>(null);

  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // Re-hydrate when SvelteKit replaces data on navigation
  $effect(() => {
    const sub = data.submission;
    submissionId       = sub?.submission_id ?? null;
    submissionStatus   = sub?.status ?? '';
    sentBackReasonCode = sub?.sent_back_reason_code ?? null;
    sentBackReasonText = sub?.sent_back_reason_text ?? null;
    pmRemark           = sub?.pm_remark ?? null;
    values             = valuesFromServer(data.values);
    selectedCampusId   = data.activeCampusId;
    saveState = {}; saveError = {};
  });

  let isLocked   = $derived(submissionStatus === 'LOCKED' || submissionStatus === 'SIGNED_OFF');
  let isReadOnly = $derived(isLocked || submissionStatus === 'SUBMITTED');
  let isHolidayWeek = $derived(values['weekly.is_holiday_week'] === true);

  // Required fields: summary + concerns + priorities + team_morale (unless holiday week)
  let missingRequired = $derived.by(() => {
    if (isHolidayWeek) return [];
    const missing: string[] = [];
    if (!notEmpty(values['weekly.summary']))              missing.push('Week summary');
    if (!notEmpty(values['weekly.concerns']))             missing.push('Concerns / blockers');
    if (!notEmpty(values['weekly.next_week_priorities'])) missing.push('Next week priorities');
    if (!values['weekly.team_morale'])                    missing.push('Team morale');
    return missing;
  });
  function notEmpty(v: unknown): boolean {
    return v !== null && v !== undefined && String(v).trim() !== '';
  }
  let canSubmit = $derived(
    !!submissionId && !submitting && !isReadOnly && missingRequired.length === 0,
  );

  // ─── Save / submit ──────────────────────────────────────────────────
  function onValueChange(metric_id: string, value_type: 'numeric' | 'text' | 'boolean', val: string | number | boolean | null, debounce = true) {
    values[metric_id] = val;
    if (debounce) {
      clearTimeout(debounceTimers[metric_id]);
      debounceTimers[metric_id] = setTimeout(() => saveField(metric_id, value_type), 700);
    } else {
      clearTimeout(debounceTimers[metric_id]);
      saveField(metric_id, value_type);
    }
  }
  async function saveField(metric_id: string, value_type: 'numeric' | 'text' | 'boolean') {
    if (!submissionId || isLocked) return;
    const val = values[metric_id];
    saveState[metric_id] = 'saving'; saveError[metric_id] = null;
    try {
      const idempotency_key = `boa.weekly.save.${submissionId}.${metric_id}.${Date.now()}`;
      const res = await fetch(
        `/api/ops-os/submissions/${submissionId}/values/${encodeURIComponent(metric_id)}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val, value_type, idempotency_key }) },
      );
      if (!res.ok) {
        saveState[metric_id] = 'error'; saveError[metric_id] = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      saveState[metric_id] = 'saved';
      if (submissionStatus === 'NEW') submissionStatus = 'DRAFT';
      setTimeout(() => { if (saveState[metric_id] === 'saved') saveState[metric_id] = 'idle'; }, 3000);
    } catch (e) {
      saveState[metric_id] = 'error'; saveError[metric_id] = (e as Error).message;
    }
  }
  async function submitReport() {
    if (!submissionId || !canSubmit) return;
    submitting = true; submitError = null;
    try {
      const idempotency_key = `boa.weekly.submit.${submissionId}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submissionId}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key }),
      });
      if (!res.ok) { submitError = (await res.text()) || `HTTP ${res.status}`; return; }
      const updated = await res.json();
      submissionStatus = updated.status;
      await invalidateAll();
    } catch (e) { submitError = (e as Error).message; }
    finally { submitting = false; }
  }

  // ─── Filter helpers ─────────────────────────────────────────────────
  async function onCampusChange(newCampusId: string) {
    if (newCampusId === selectedCampusId) return;
    const url = new URL($page.url);
    url.searchParams.set('campus', newCampusId);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }
  async function onWeekChange(newMonday: string) {
    const url = new URL($page.url);
    url.searchParams.set('week', newMonday);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }
  function shiftWeek(deltaDays: number) {
    const d = new Date(data.period_start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT': case 'NEW': return 'bg-zinc-800 text-zinc-300';
      case 'SUBMITTED': case 'PM_REVIEW': return 'bg-blue-900 text-blue-200';
      case 'SENT_BACK': return 'bg-amber-900 text-amber-200';
      case 'SIGNED_OFF': return 'bg-emerald-900 text-emerald-200';
      case 'LOCKED': return 'bg-violet-900 text-violet-200';
      default: return 'bg-zinc-800 text-zinc-400';
    }
  }
  function fmtPct(pct: number | null): string { return pct === null ? '—' : `${pct}%`; }
</script>

{#if $navigating}
  <div class="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden">
    <div class="h-full w-1/3 animate-pulse bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]"></div>
  </div>
{/if}

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-3xl px-4 py-6 pb-32">

    <!-- ── Header card ────────────────────────────────────────────────── -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">NIAT Weekly</div>
          <div class="mt-1 text-base font-semibold">
            {data.campuses.find(c => c.campus_id === selectedCampusId)?.display_name ?? '—'}
          </div>
          <div class="mt-0.5 text-xs text-zinc-400 tabular-nums">
            {data.period_start} → {data.period_end} (Mon → Sun IST)
          </div>
        </div>
        {#if submissionStatus}
          <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusBadgeClass(submissionStatus)}">{submissionStatus}</span>
        {/if}
      </div>

      <!-- Week navigator -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          class="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => onWeekChange(shiftWeek(-7))}
        >← Previous week</button>
        <input
          type="date"
          value={data.period_start}
          onchange={(e) => onWeekChange((e.currentTarget as HTMLInputElement).value)}
          class="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:border-blue-600 focus:outline-none"
        />
        <button
          class="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          onclick={() => onWeekChange(shiftWeek(7))}
        >Next week →</button>
      </div>

      {#if data.campuses.length > 1}
        <div class="mt-3">
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="campus-sel">Campus</label>
          <select
            id="campus-sel"
            class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            value={selectedCampusId}
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
        No campuses assigned. Contact your PM to request access.
      </div>
    {:else if !data.rollup}
      <div class="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        Pick a campus to load the weekly view.
      </div>
    {:else}

      <!-- ── Status banner ────────────────────────────────────────────── -->
      {#if submissionStatus === 'SENT_BACK' && sentBackReasonCode}
        <div class="mb-4 rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-amber-500">Returned for correction</div>
          <div class="mt-0.5 text-amber-200">
            <strong>{sentBackReasonCode}</strong>
            {#if sentBackReasonText} — {sentBackReasonText}{/if}
          </div>
        </div>
      {/if}
      {#if (submissionStatus === 'SIGNED_OFF' || submissionStatus === 'LOCKED') && pmRemark}
        <div class="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-emerald-500">PM remark</div>
          <div class="mt-1 whitespace-pre-wrap text-emerald-200">{pmRemark}</div>
        </div>
      {/if}

      <!-- ── Auto-rollup card (read-only) ─────────────────────────────── -->
      {@const r = data.rollup}
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section 1</div>
          <div class="text-sm font-semibold">Auto rollup · from daily submissions</div>
          <div class="mt-0.5 text-xs text-zinc-500">Computed from this campus's 7 daily reports. Read-only.</div>
        </header>
        <div class="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-3">
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Submitted days</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.days_submitted} / {r.days_in_range}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-emerald-400">Signed off</div><div class="mt-1 text-lg font-semibold tabular-nums text-emerald-300">{r.days_signed_off}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Holiday days</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{r.days_holiday}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-red-400">Late submissions</div><div class="mt-1 text-lg font-semibold tabular-nums text-red-300">{r.days_late_submission}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-amber-400">Auto-signed-off</div><div class="mt-1 text-lg font-semibold tabular-nums text-amber-300">{r.days_auto_signed_off}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">No submission</div><div class="mt-1 text-lg font-semibold tabular-nums text-zinc-400">{r.days_no_submission}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Sessions held</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_sessions_held} / {r.total_sessions_scheduled}<span class="ml-1 text-xs text-zinc-500">({fmtPct(r.sessions_held_pct)})</span></div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Avg attendance</div><div class="mt-1 text-lg font-semibold tabular-nums">{fmtPct(r.avg_attendance_pct)}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-rose-400">Incidents</div><div class="mt-1 text-lg font-semibold tabular-nums text-rose-300">{r.total_incidents_flagged}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Faculty absent (sum)</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_faculty_absent}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Hostel + transport</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_hostel_issues + r.total_transport_incidents}</div></div>
          <div class="bg-zinc-900 px-3 py-3"><div class="text-[10px] uppercase tracking-wider text-zinc-500">Escalations open/close</div><div class="mt-1 text-lg font-semibold tabular-nums">{r.total_escalations_opened} / {r.total_escalations_closed}</div></div>
        </div>
        {#if r.sent_backs_count > 0}
          <div class="border-t border-zinc-800 px-4 py-2 text-xs text-amber-300">
            <strong>{r.sent_backs_count}</strong> send-back{r.sent_backs_count === 1 ? '' : 's'} across the week's daily reports.
          </div>
        {/if}
      </section>

      <!-- ── Holiday week toggle ──────────────────────────────────────── -->
      <section class="mb-4 overflow-hidden rounded-xl border bg-zinc-900"
        class:border-amber-700={isHolidayWeek}
        class:border-zinc-800={!isHolidayWeek}
      >
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section 2</div>
          <div class="text-sm font-semibold">Was the entire week a holiday?</div>
          <div class="mt-0.5 text-xs text-zinc-500">e.g. sem break, university vacation. If so, qualitative fields are optional.</div>
        </header>
        <div class="px-4 py-3 space-y-2">
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              class:border-emerald-600={!isHolidayWeek}
              class:bg-emerald-600={!isHolidayWeek}
              class:text-white={!isHolidayWeek}
              class:border-zinc-700={isHolidayWeek}
              class:bg-zinc-950={isHolidayWeek}
              class:text-zinc-300={isHolidayWeek}
              disabled={isReadOnly}
              onclick={() => onValueChange('weekly.is_holiday_week', 'boolean', false, false)}
            >Normal working week</button>
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              class:border-amber-600={isHolidayWeek}
              class:bg-amber-600={isHolidayWeek}
              class:text-white={isHolidayWeek}
              class:border-zinc-700={!isHolidayWeek}
              class:bg-zinc-950={!isHolidayWeek}
              class:text-zinc-300={!isHolidayWeek}
              disabled={isReadOnly}
              onclick={() => onValueChange('weekly.is_holiday_week', 'boolean', true, false)}
            >Whole week holiday</button>
          </div>
          {#if isHolidayWeek}
            <input
              type="text"
              placeholder="e.g. Sem break, university notice 2026-05-20 to 2026-05-26"
              class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-amber-600 focus:outline-none disabled:opacity-50"
              value={values['weekly.holiday_week_reason'] ?? ''}
              disabled={isReadOnly}
              oninput={(e) => onValueChange('weekly.holiday_week_reason', 'text', (e.currentTarget as HTMLInputElement).value)}
              onblur={() => onValueChange('weekly.holiday_week_reason', 'text', values['weekly.holiday_week_reason'], false)}
            />
          {/if}
        </div>
      </section>

      <!-- ── Qualitative section ──────────────────────────────────────── -->
      {#if !isHolidayWeek}
      <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section 3</div>
          <div class="text-sm font-semibold">Your commentary on the week</div>
          <div class="mt-0.5 text-xs text-zinc-500">PM reviews this alongside the auto rollup.</div>
        </header>
        <div class="space-y-4 px-4 py-4">
          <!-- Summary -->
          <div>
            <label class="block text-xs font-medium text-zinc-300" for="weekly-summary">
              Week summary <span class="text-red-400">*</span>
            </label>
            <textarea
              id="weekly-summary"
              rows="3"
              class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none disabled:opacity-50"
              placeholder="2-4 sentences. How did the week go? Key numbers, what stood out."
              value={values['weekly.summary'] ?? ''}
              disabled={isReadOnly}
              oninput={(e) => onValueChange('weekly.summary', 'text', (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={() => onValueChange('weekly.summary', 'text', values['weekly.summary'], false)}
            ></textarea>
          </div>

          <!-- Highlights -->
          <div>
            <label class="block text-xs font-medium text-zinc-300" for="weekly-highlights">
              Highlights this week
              <span class="text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="weekly-highlights"
              rows="2"
              class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none disabled:opacity-50"
              placeholder="What went well — celebrate the wins."
              value={values['weekly.highlights'] ?? ''}
              disabled={isReadOnly}
              oninput={(e) => onValueChange('weekly.highlights', 'text', (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={() => onValueChange('weekly.highlights', 'text', values['weekly.highlights'], false)}
            ></textarea>
          </div>

          <!-- Concerns -->
          <div>
            <label class="block text-xs font-medium text-zinc-300" for="weekly-concerns">
              Concerns / blockers <span class="text-red-400">*</span>
            </label>
            <textarea
              id="weekly-concerns"
              rows="3"
              class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-red-600 focus:outline-none disabled:opacity-50"
              placeholder="What is stuck, blocked, or needs PM/COS attention?"
              value={values['weekly.concerns'] ?? ''}
              disabled={isReadOnly}
              oninput={(e) => onValueChange('weekly.concerns', 'text', (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={() => onValueChange('weekly.concerns', 'text', values['weekly.concerns'], false)}
            ></textarea>
          </div>

          <!-- Next-week priorities -->
          <div>
            <label class="block text-xs font-medium text-zinc-300" for="weekly-priorities">
              Next week priorities <span class="text-red-400">*</span>
            </label>
            <textarea
              id="weekly-priorities"
              rows="3"
              class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none disabled:opacity-50"
              placeholder="Top 3 things you're driving next week."
              value={values['weekly.next_week_priorities'] ?? ''}
              disabled={isReadOnly}
              oninput={(e) => onValueChange('weekly.next_week_priorities', 'text', (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={() => onValueChange('weekly.next_week_priorities', 'text', values['weekly.next_week_priorities'], false)}
            ></textarea>
          </div>

          <!-- Team morale -->
          <div>
            <label class="block text-xs font-medium text-zinc-300">
              Team morale <span class="text-red-400">*</span>
            </label>
            <div class="mt-1 flex gap-2">
              {#each [{ v: 'high', label: 'High', color: 'emerald' }, { v: 'medium', label: 'Medium', color: 'amber' }, { v: 'low', label: 'Low', color: 'red' }] as opt (opt.v)}
                {@const selected = values['weekly.team_morale'] === opt.v}
                <button
                  type="button"
                  class="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  class:border-emerald-600={selected && opt.color === 'emerald'}
                  class:bg-emerald-600={selected && opt.color === 'emerald'}
                  class:border-amber-600={selected && opt.color === 'amber'}
                  class:bg-amber-600={selected && opt.color === 'amber'}
                  class:border-red-600={selected && opt.color === 'red'}
                  class:bg-red-600={selected && opt.color === 'red'}
                  class:text-white={selected}
                  class:border-zinc-700={!selected}
                  class:bg-zinc-950={!selected}
                  class:text-zinc-300={!selected}
                  disabled={isReadOnly}
                  onclick={() => onValueChange('weekly.team_morale', 'text', opt.v, false)}
                >{opt.label}</button>
              {/each}
            </div>
          </div>

          <!-- Major events -->
          <div>
            <label class="block text-xs font-medium text-zinc-300" for="weekly-events">
              Major events held <span class="text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="weekly-events"
              rows="2"
              class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none disabled:opacity-50"
              placeholder="Guest lectures, hackathons, parent meets, etc."
              value={values['weekly.major_events'] ?? ''}
              disabled={isReadOnly}
              oninput={(e) => onValueChange('weekly.major_events', 'text', (e.currentTarget as HTMLTextAreaElement).value)}
              onblur={() => onValueChange('weekly.major_events', 'text', values['weekly.major_events'], false)}
            ></textarea>
          </div>
        </div>
      </section>
      {/if}
    {/if}
  </div>

  <!-- ── Sticky submit footer ──────────────────────────────────────── -->
  {#if submissionId && !isReadOnly && submissionStatus !== 'SUBMITTED'}
    <div class="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
      <div class="mx-auto max-w-3xl">
        {#if missingRequired.length > 0}
          <div class="mb-2 text-xs text-amber-400">
            Missing: {missingRequired.slice(0, 2).join(', ')}{missingRequired.length > 2 ? ` (+${missingRequired.length - 2} more)` : ''}
          </div>
        {/if}
        {#if submitError}
          <div class="mb-2 text-xs text-red-400">{submitError}</div>
        {/if}
        <div class="flex items-center justify-between gap-3">
          <div class="text-xs text-zinc-500">
            {#if isHolidayWeek}
              <span class="text-amber-300 font-medium">Holiday week</span> · qualitative section skipped
            {:else}
              Weekly report for {data.period_start} → {data.period_end}
            {/if}
          </div>
          <button
            class="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500
                   {isHolidayWeek ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}"
            disabled={!canSubmit}
            onclick={submitReport}
          >
            {submitting ? 'Submitting…' : isHolidayWeek ? 'Submit holiday notice' : submissionStatus === 'SENT_BACK' ? 'Resubmit' : 'Submit for PM review'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
