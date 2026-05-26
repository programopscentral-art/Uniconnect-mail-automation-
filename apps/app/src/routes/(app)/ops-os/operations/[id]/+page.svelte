<script lang="ts">
  import { goto } from '$app/navigation';

  type Submission = {
    submission_id: string;
    campus_id: string;
    cadence: string;
    period_start: string;
    period_end: string;
    status: string;
    revision: number;
    submitted_by: string | null;
    submitted_at: string | null;
    signed_off_by: string | null;
    signed_off_at: string | null;
    sent_back_count: number;
    sent_back_reason_code: string | null;
    sent_back_reason_text: string | null;
    pm_remark: string | null;
    is_late_submission: boolean;
    is_late_sign_off: boolean;
    locked_at: string | null;
  };
  type ValueRow = {
    metric_id: string;
    value_numeric: number | null;
    value_text: string | null;
    value_boolean: boolean | null;
    source_kind: string;
    recorded_at: string;
  };
  type EventRow = {
    event_id: string;
    event_type: string;
    recorded_at: string;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    payload: Record<string, unknown>;
  };

  let { data } = $props<{ data: {
    submission_id: string;
    role: string;
    submission: Submission;
    values: ValueRow[];
    events: EventRow[];
    campus: { display_name: string; code: string } | null;
  } }>();

  type Render =
    | { kind: 'pair';  label: string; leftLabel: string; leftMetricId: string; rightLabel: string; rightMetricId: string }
    | { kind: 'pills'; label: string; metric_id: string; options: Array<{ value: string; label: string }>; followUp?: { metric_id: string; label: string } }
    | { kind: 'yesno'; label: string; metric_id: string; followUp?: { metric_id: string; label: string } }
    | { kind: 'value'; label: string; metric_id: string };
  type Section = { code: string; index: number; title: string; fields: Render[] };

  const SECTIONS: Section[] = [
    { code: 'attendance', index: 2, title: 'Attendance Heartbeat', fields: [
      { kind: 'pair',  label: 'Students',        leftLabel: 'Present', leftMetricId: 'daily.attendance.present',                 rightLabel: 'Total', rightMetricId: 'daily.attendance.total_enrolled' },
      { kind: 'pair',  label: 'Faculty',         leftLabel: 'Present', leftMetricId: 'daily.faculty.present',                    rightLabel: 'Total', rightMetricId: 'daily.faculty.expected' },
      { kind: 'pair',  label: 'Success coaches', leftLabel: 'Present', leftMetricId: 'daily.attendance.success_coaches_present', rightLabel: 'Total', rightMetricId: 'daily.attendance.success_coaches_total' },
      { kind: 'pair',  label: 'Program ops',     leftLabel: 'Present', leftMetricId: 'daily.attendance.program_ops_present',     rightLabel: 'Total', rightMetricId: 'daily.attendance.program_ops_total' },
      { kind: 'value', label: 'Absent (authorized)',   metric_id: 'daily.attendance.absent_authorized' },
      { kind: 'value', label: 'Absent (unauthorized)', metric_id: 'daily.attendance.absent_unauthorized' },
    ]},
    { code: 'academic', index: 3, title: 'Academic Delivery', fields: [
      { kind: 'pair',  label: 'Classes', leftLabel: 'Held', leftMetricId: 'daily.academic.sessions_conducted', rightLabel: 'Scheduled', rightMetricId: 'daily.academic.sessions_scheduled' },
      { kind: 'pills', label: 'Cancellation reason', metric_id: 'daily.academic.cancellation_reason',
        options: [
          { value: 'faculty_absent',  label: 'Faculty absent' },
          { value: 'infra_issue',     label: 'Infra issue' },
          { value: 'holiday',         label: 'Unplanned holiday' },
          { value: 'student_absence', label: 'Student absence' },
          { value: 'other',           label: 'Other' },
        ],
        followUp: { metric_id: 'daily.academic.cancellation_notes', label: 'Notes' } },
    ]},
    { code: 'faculty', index: 4, title: 'Faculty Status', fields: [
      { kind: 'value', label: 'Faculty absent today', metric_id: 'daily.faculty.absent_count' },
      { kind: 'pills', label: 'Replacement assigned', metric_id: 'daily.faculty.replacement_assigned',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'partial', label: 'Partial' }, { value: 'no', label: 'No' }] },
      { kind: 'value', label: 'Absences exceeding 2-day SOP', metric_id: 'daily.faculty.absences_exceeding_sop' },
      { kind: 'value', label: 'Substitution notes', metric_id: 'daily.faculty.substitution_notes' },
    ]},
    { code: 'infra', index: 5, title: 'Infrastructure Check', fields: [
      { kind: 'pills', label: 'Wi-Fi / ISP / bandwidth', metric_id: 'daily.infra.wifi_status',
        options: [{ value: 'ok', label: 'OK' }, { value: 'degraded', label: 'Degraded' }, { value: 'down', label: 'Down' }] },
      { kind: 'pills', label: 'TV / AV in classrooms',    metric_id: 'daily.infra.av_status',
        options: [{ value: 'ok', label: 'OK' }, { value: 'partial', label: 'Partial' }, { value: 'down', label: 'Down' }],
        followUp: { metric_id: 'daily.infra.av_notes', label: 'AV notes' } },
      { kind: 'pills', label: 'Cleanliness',              metric_id: 'daily.infra.cleanliness_status',
        options: [{ value: 'ok', label: 'OK' }, { value: 'issues', label: 'Issues' }],
        followUp: { metric_id: 'daily.infra.cleanliness_notes', label: 'Cleanliness notes' } },
      { kind: 'pills', label: 'Electricity / UPS',        metric_id: 'daily.infra.electricity_status',
        options: [{ value: 'ok', label: 'OK' }, { value: 'backup_engaged', label: 'Backup engaged' }, { value: 'down', label: 'Down' }] },
      { kind: 'pills', label: 'Power (main supply)',      metric_id: 'daily.infra.power_status',
        options: [{ value: 'normal', label: 'Normal' }, { value: 'outage_brief', label: 'Brief outage' }, { value: 'outage_extended', label: 'Extended outage' }, { value: 'unstable', label: 'Unstable' }] },
      { kind: 'pills', label: 'Water',                    metric_id: 'daily.infra.water_status',
        options: [{ value: 'normal', label: 'Normal' }, { value: 'intermittent', label: 'Intermittent' }, { value: 'unavailable', label: 'Unavailable' }] },
      { kind: 'pills', label: 'Connectivity',             metric_id: 'daily.infra.connectivity_status',
        options: [{ value: 'normal', label: 'Normal' }, { value: 'degraded', label: 'Degraded' }, { value: 'down', label: 'Down' }] },
      { kind: 'value', label: 'Other open issues', metric_id: 'daily.infra.open_issues' },
    ]},
    { code: 'student_ops', index: 6, title: 'Student-Facing Operations', fields: [
      { kind: 'value', label: 'Hostel issues',       metric_id: 'daily.student_ops.hostel_issues_count' },
      { kind: 'value', label: 'Transport incidents', metric_id: 'daily.student_ops.transport_incidents_count' },
      { kind: 'value', label: 'Escalations opened',  metric_id: 'daily.student_ops.escalations_opened' },
      { kind: 'value', label: 'Escalations closed',  metric_id: 'daily.student_ops.escalations_closed' },
      { kind: 'pills', label: 'Mess service', metric_id: 'daily.student_ops.mess_status',
        options: [{ value: 'served', label: 'Served' }, { value: 'delayed', label: 'Delayed' }, { value: 'not_served', label: 'Not served' }] },
      { kind: 'pills', label: 'Transport',    metric_id: 'daily.student_ops.transport_status',
        options: [{ value: 'normal', label: 'Normal' }, { value: 'delayed', label: 'Delayed' }, { value: 'partial', label: 'Partial' }, { value: 'unavailable', label: 'Unavailable' }] },
      { kind: 'value', label: 'Other notes',  metric_id: 'daily.student_ops.other_notes' },
    ]},
    { code: 'incidents', index: 7, title: 'Incidents & Safety', fields: [
      { kind: 'yesno', label: 'PoSH / PoCSO concern',       metric_id: 'daily.incidents.posh_pocso',       followUp: { metric_id: 'daily.incidents.posh_pocso_text',     label: 'Context' } },
      { kind: 'yesno', label: 'Anti-ragging / bullying',    metric_id: 'daily.incidents.anti_ragging',     followUp: { metric_id: 'daily.incidents.anti_ragging_text',   label: 'Context' } },
      { kind: 'yesno', label: 'Safety incident on campus',  metric_id: 'daily.incidents.safety_on_campus', followUp: { metric_id: 'daily.incidents.safety_text',         label: 'Context' } },
      { kind: 'yesno', label: 'Parent complaint escalated', metric_id: 'daily.incidents.parent_complaint', followUp: { metric_id: 'daily.incidents.parent_complaint_text', label: 'Context' } },
      { kind: 'yesno', label: 'CEO-visible incident',       metric_id: 'daily.incidents.ceo_visible',      followUp: { metric_id: 'daily.incidents.ceo_visible_text',    label: 'Context' } },
      { kind: 'value', label: 'Total incident count',       metric_id: 'daily.incidents.count' },
      { kind: 'value', label: 'Aggregate summary',          metric_id: 'daily.incidents.summary' },
    ]},
    { code: 'remark', index: 8, title: 'BOA Remark', fields: [
      { kind: 'value', label: 'BOA remark', metric_id: 'daily.remark.boa' },
    ]},
  ];

  const EVENT_LABEL: Record<string, string> = {
    'submission.created':       'Draft created',
    'submission.field_updated': 'Field updated',
    'submission.submitted':     'Submitted for PM review',
    'submission.sent_back':     'Returned for correction',
    'submission.signed_off':    'PM signed off',
    'submission.retracted':     'Retracted by BOA',
    'submission.superseded':    'Superseded by amendment',
    'verification.send_back':   'PM sent back',
    'verification.signed_off':  'PM signed off',
    'edit.captured':            'Edit recorded',
  };

  let valuesByMetric = $derived.by(() => {
    const map: Record<string, ValueRow> = {};
    for (const v of data.values) map[v.metric_id] = v;
    return map;
  });

  function rawValue(metric_id: string): unknown {
    const v = valuesByMetric[metric_id];
    if (!v) return null;
    if (v.value_numeric !== null) return Number(v.value_numeric);
    if (v.value_text !== null) return v.value_text;
    if (v.value_boolean !== null) return v.value_boolean;
    return null;
  }
  function pairText(left: string, right: string): string {
    const l = rawValue(left); const r = rawValue(right);
    if (l === null && r === null) return '—';
    return `${l ?? '—'} / ${r ?? '—'}`;
  }
  function pillsLabel(metric_id: string, options: Array<{ value: string; label: string }>): string {
    const v = rawValue(metric_id);
    if (v === null || v === '') return '—';
    return options.find(o => o.value === v)?.label ?? String(v);
  }
  function valueText(metric_id: string): string {
    const v = rawValue(metric_id);
    if (v === null || v === '') return '—';
    return String(v);
  }
  function fmtAbs(iso: string | null): string { return iso ? new Date(iso).toLocaleString() : '—'; }
  function fmtTimelineTime(iso: string): string {
    return new Date(iso).toLocaleString([], {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }
  function eventLabel(t: string): string { return EVENT_LABEL[t] || t; }

  // Collapse runs of field updates into a single line with a count
  let collapsedEvents = $derived.by(() => {
    const out: Array<EventRow & { _runCount?: number }> = [];
    let runStart: EventRow | null = null;
    let runCount = 0;
    for (const e of data.events) {
      if (e.event_type === 'submission.field_updated') {
        if (!runStart) { runStart = e; runCount = 1; } else runCount++;
        continue;
      }
      if (runStart) { out.push({ ...runStart, _runCount: runCount }); runStart = null; runCount = 0; }
      out.push(e);
    }
    if (runStart) out.push({ ...runStart, _runCount: runCount });
    return out;
  });

  let incidentCount = $derived(Number(rawValue('daily.incidents.count') ?? 0));
  let hasAnyIncidentFlag = $derived(
    [
      'daily.incidents.posh_pocso',
      'daily.incidents.anti_ragging',
      'daily.incidents.safety_on_campus',
      'daily.incidents.parent_complaint',
      'daily.incidents.ceo_visible',
    ].some(id => rawValue(id) === true),
  );

  function statusBadgeClass(status: string): string {
    switch (status) {
      case 'DRAFT':
      case 'NEW':         return 'bg-zinc-800 text-zinc-300';
      case 'SUBMITTED':
      case 'PM_REVIEW':   return 'bg-blue-900 text-blue-200';
      case 'SENT_BACK':   return 'bg-amber-900 text-amber-200';
      case 'SIGNED_OFF':  return 'bg-emerald-900 text-emerald-200';
      case 'LOCKED':      return 'bg-violet-900 text-violet-200';
      case 'RETRACTED':   return 'bg-zinc-800 text-zinc-400';
      default:            return 'bg-zinc-800 text-zinc-400';
    }
  }

  function eventDotClass(t: string): string {
    if (t.includes('signed_off')) return 'bg-emerald-500';
    if (t.includes('sent_back') || t.includes('send_back')) return 'bg-amber-500';
    if (t.includes('submitted')) return 'bg-blue-500';
    if (t.includes('locked')) return 'bg-violet-500';
    if (t.includes('retracted')) return 'bg-zinc-500';
    return 'bg-zinc-600';
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-5xl px-4 py-6 pb-12">

    <div class="mb-3">
      <button class="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5" onclick={() => goto('/ops-os/operations')}>
        <span>←</span> Back to overview
      </button>
    </div>

    <!-- ── Header card ────────────────────────────────────────────────── -->
    <div class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div class="px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Operations · {data.submission.cadence}</div>
            <div class="mt-1 text-lg font-semibold truncate">
              {data.campus?.display_name ?? 'Unknown campus'}
              {#if data.campus}<span class="ml-2 text-xs font-normal text-zinc-500">{data.campus.code}</span>{/if}
            </div>
            <div class="mt-0.5 text-sm text-zinc-400 tabular-nums">{data.submission.period_start}</div>
          </div>
          <div class="flex-shrink-0 text-right">
            <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusBadgeClass(data.submission.status)}">{data.submission.status}</span>
            {#if data.submission.is_late_submission || data.submission.is_late_sign_off}
              <div class="mt-1"><span class="rounded-md bg-red-900 px-1.5 py-0.5 text-[9px] uppercase font-semibold text-red-200">late</span></div>
            {/if}
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Submitted</div>
            <div class="mt-0.5 text-xs">{fmtAbs(data.submission.submitted_at)}</div>
          </div>
          <div class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Signed off</div>
            <div class="mt-0.5 text-xs">{fmtAbs(data.submission.signed_off_at)}</div>
          </div>
          <div class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Locked</div>
            <div class="mt-0.5 text-xs">{fmtAbs(data.submission.locked_at)}</div>
          </div>
          <div class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Send-backs</div>
            <div class="mt-0.5 text-xs tabular-nums {data.submission.sent_back_count > 0 ? 'text-amber-300' : ''}">{data.submission.sent_back_count}</div>
          </div>
        </div>
      </div>
    </div>

    {#if hasAnyIncidentFlag || incidentCount > 0}
      <div class="mb-4 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-100">
        <span class="font-semibold">⚠ Incidents flagged</span> · Read Section 7 carefully.
      </div>
    {/if}

    {#if data.submission.pm_remark}
      <div class="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm">
        <div class="text-[10px] uppercase tracking-wider text-emerald-500">PM remark</div>
        <div class="mt-1 whitespace-pre-wrap text-emerald-200">{data.submission.pm_remark}</div>
      </div>
    {/if}

    {#if data.submission.status === 'SENT_BACK' && data.submission.sent_back_reason_code}
      <div class="mb-4 rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm">
        <div class="text-[10px] uppercase tracking-wider text-amber-500">Last sent back</div>
        <div class="mt-1 text-amber-200">{data.submission.sent_back_reason_code}{data.submission.sent_back_reason_text ? ` — ${data.submission.sent_back_reason_text}` : ''}</div>
      </div>
    {/if}

    <!-- ── Sections ───────────────────────────────────────────────────── -->
    {#each SECTIONS as section (section.code)}
      <section
        class="mb-4 overflow-hidden rounded-xl border bg-zinc-900"
        class:border-red-800={section.code === 'incidents' && (hasAnyIncidentFlag || incidentCount > 0)}
        class:border-zinc-800={!(section.code === 'incidents' && (hasAnyIncidentFlag || incidentCount > 0))}
      >
        <header class="border-b border-zinc-800 px-4 py-3">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section {section.index}</div>
          <div class="text-sm font-semibold">{section.title}</div>
        </header>
        <div class="divide-y divide-zinc-800">
          {#each section.fields as f}
            <div class="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
              <div class="text-zinc-400">{f.label}</div>
              <div class="max-w-[60%] text-right">
                {#if f.kind === 'pair'}
                  <span class="font-medium tabular-nums">{pairText(f.leftMetricId, f.rightMetricId)}</span>
                {:else if f.kind === 'pills'}
                  {@const v = rawValue(f.metric_id)}
                  {#if v === null || v === ''}
                    <span class="text-zinc-600">—</span>
                  {:else}
                    <span class="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs font-medium">{pillsLabel(f.metric_id, f.options)}</span>
                  {/if}
                  {#if f.followUp && valueText(f.followUp.metric_id) !== '—'}
                    <div class="mt-1 text-xs text-zinc-400 whitespace-pre-wrap">{valueText(f.followUp.metric_id)}</div>
                  {/if}
                {:else if f.kind === 'yesno'}
                  {@const v = rawValue(f.metric_id)}
                  {#if v === true}
                    <span class="rounded-md bg-red-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-100">Yes</span>
                  {:else if v === false}
                    <span class="rounded-md bg-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">No</span>
                  {:else}
                    <span class="text-zinc-600">—</span>
                  {/if}
                  {#if f.followUp && valueText(f.followUp.metric_id) !== '—'}
                    <div class="mt-1 text-xs text-zinc-400 whitespace-pre-wrap">{valueText(f.followUp.metric_id)}</div>
                  {/if}
                {:else}
                  <span class="font-medium whitespace-pre-wrap">{valueText(f.metric_id)}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}

    <!-- ── Timeline ───────────────────────────────────────────────────── -->
    <section class="mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <header class="border-b border-zinc-800 px-4 py-3">
        <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Audit</div>
        <div class="text-sm font-semibold">Timeline</div>
      </header>
      {#if collapsedEvents.length === 0}
        <div class="px-4 py-6 text-center text-xs text-zinc-500">No events recorded.</div>
      {:else}
        <ol class="relative px-4 py-3">
          {#each collapsedEvents as e (e.event_id)}
            <li class="relative flex gap-3 pb-4 last:pb-0">
              <!-- Vertical line + dot -->
              <div class="flex flex-col items-center">
                <div class="h-2.5 w-2.5 rounded-full {eventDotClass(e.event_type)} ring-2 ring-zinc-900 z-10"></div>
                <div class="mt-1 w-px flex-1 bg-zinc-800"></div>
              </div>
              <div class="flex-1 min-w-0 -mt-0.5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium">
                      {eventLabel(e.event_type)}
                      {#if (e as { _runCount?: number })._runCount && (e as { _runCount?: number })._runCount! > 1}
                        <span class="ml-1 text-[10px] text-zinc-500">×{(e as { _runCount?: number })._runCount}</span>
                      {/if}
                    </div>
                    <div class="mt-0.5 text-[11px] text-zinc-500">{e.actor_name ?? e.actor_email ?? 'system'}</div>
                  </div>
                  <div class="shrink-0 text-[11px] tabular-nums text-zinc-500">{fmtTimelineTime(e.recorded_at)}</div>
                </div>
                {#if e.event_type === 'submission.sent_back' && e.payload?.reason_code}
                  <div class="mt-1 text-[11px] text-amber-300">Reason: {e.payload.reason_code as string}</div>
                {/if}
                {#if e.event_type === 'submission.signed_off' && e.payload?.transition === 'locked'}
                  <div class="mt-1 text-[11px] text-violet-300">Transitioned to LOCKED</div>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </div>
</div>
