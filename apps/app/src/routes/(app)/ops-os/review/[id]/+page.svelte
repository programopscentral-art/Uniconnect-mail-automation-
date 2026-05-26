<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let { data } = $props<{ data: { submission_id: string; role: string } }>();

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

  // Display schema mirroring the BOA form's section/field structure.
  // Uses paired / pills / yesno renderings to match what the BOA filled.

  type Render =
    | { kind: 'pair';  label: string; leftLabel: string; leftMetricId: string; rightLabel: string; rightMetricId: string }
    | { kind: 'pills'; label: string; metric_id: string; options: Array<{ value: string; label: string }>; followUp?: { metric_id: string; label: string } }
    | { kind: 'yesno'; label: string; metric_id: string; followUp?: { metric_id: string; label: string } }
    | { kind: 'value'; label: string; metric_id: string };
  type Section = { code: string; index: number; title: string; fields: Render[] };

  const SECTIONS: Section[] = [
    { code: 'attendance', index: 2, title: 'Attendance Heartbeat', fields: [
      { kind: 'pair',  label: 'Students',        leftLabel: 'Present', leftMetricId: 'daily.attendance.present', rightLabel: 'Total', rightMetricId: 'daily.attendance.total_enrolled' },
      { kind: 'pair',  label: 'Faculty',         leftLabel: 'Present', leftMetricId: 'daily.faculty.present',     rightLabel: 'Total', rightMetricId: 'daily.faculty.expected' },
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
        options: [
          { value: 'yes',     label: 'Yes' },
          { value: 'partial', label: 'Partial' },
          { value: 'no',      label: 'No' },
        ] },
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
      { kind: 'yesno', label: 'PoSH / PoCSO concern',      metric_id: 'daily.incidents.posh_pocso',       followUp: { metric_id: 'daily.incidents.posh_pocso_text',     label: 'Context' } },
      { kind: 'yesno', label: 'Anti-ragging / bullying',   metric_id: 'daily.incidents.anti_ragging',     followUp: { metric_id: 'daily.incidents.anti_ragging_text',   label: 'Context' } },
      { kind: 'yesno', label: 'Safety incident on campus', metric_id: 'daily.incidents.safety_on_campus', followUp: { metric_id: 'daily.incidents.safety_text',         label: 'Context' } },
      { kind: 'yesno', label: 'Parent complaint escalated', metric_id: 'daily.incidents.parent_complaint', followUp: { metric_id: 'daily.incidents.parent_complaint_text', label: 'Context' } },
      { kind: 'yesno', label: 'CEO-visible incident',      metric_id: 'daily.incidents.ceo_visible',      followUp: { metric_id: 'daily.incidents.ceo_visible_text',    label: 'Context' } },
      { kind: 'value', label: 'Total incident count',      metric_id: 'daily.incidents.count' },
      { kind: 'value', label: 'Aggregate summary',         metric_id: 'daily.incidents.summary' },
    ]},
    { code: 'remark', index: 8, title: 'BOA Remark', fields: [
      { kind: 'value', label: 'BOA remark', metric_id: 'daily.remark.boa' },
    ]},
  ];

  let submission = $state<Submission | null>(null);
  let valuesByMetric = $state<Record<string, ValueRow>>({});
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let decision = $state<'sign_off' | 'send_back' | null>(null);
  let pmRemarkInput = $state('');
  let sendBackReasonCode = $state<'data_inconsistency' | 'missing_field' | 'needs_clarification' | 'other'>('missing_field');
  let sendBackReasonText = $state('');
  let acting = $state(false);
  let actionError = $state<string | null>(null);

  async function loadSubmission() {
    loading = true;
    loadError = null;
    try {
      const res = await fetch(`/api/ops-os/submissions/${data.submission_id}`);
      if (!res.ok) {
        loadError = res.status === 404 ? 'Submission not found or out of scope' : (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      const j = await res.json();
      submission = j.submission;
      const map: Record<string, ValueRow> = {};
      for (const v of j.values ?? []) map[v.metric_id] = v;
      valuesByMetric = map;
    } catch (e) {
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(loadSubmission);

  function rawValue(metric_id: string): unknown {
    const v = valuesByMetric[metric_id];
    if (!v) return null;
    if (v.value_numeric !== null) return Number(v.value_numeric);
    if (v.value_text !== null) return v.value_text;
    if (v.value_boolean !== null) return v.value_boolean;
    return null;
  }

  function displayPairValue(left: string, right: string): string {
    const l = rawValue(left); const r = rawValue(right);
    if (l === null && r === null) return '—';
    return `${l ?? '—'} / ${r ?? '—'}`;
  }

  function pillsLabelFor(metric_id: string, options: Array<{ value: string; label: string }>): string {
    const v = rawValue(metric_id);
    if (v === null || v === '') return '—';
    return options.find(o => o.value === v)?.label ?? String(v);
  }

  function valueText(metric_id: string): string {
    const v = rawValue(metric_id);
    if (v === null || v === '') return '—';
    return String(v);
  }

  let canAct = $derived(
    !!submission &&
    (submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW') &&
    !acting,
  );
  let canSignOff = $derived(canAct && pmRemarkInput.trim().length > 0);
  let canSendBack = $derived(canAct && (sendBackReasonCode !== 'other' || sendBackReasonText.trim().length > 0));

  async function signOff() {
    if (!submission || !canSignOff) return;
    acting = true; actionError = null;
    try {
      const idempotency_key = `pm.signoff.${submission.submission_id}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submission.submission_id}/sign-off`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_remark: pmRemarkInput.trim(), idempotency_key }),
      });
      if (!res.ok) { actionError = (await res.text()) || `HTTP ${res.status}`; return; }
      await loadSubmission();
      decision = null; pmRemarkInput = '';
    } catch (e) { actionError = (e as Error).message; }
    finally { acting = false; }
  }

  async function sendBack() {
    if (!submission || !canSendBack) return;
    acting = true; actionError = null;
    try {
      const idempotency_key = `pm.sendback.${submission.submission_id}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submission.submission_id}/send-back`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason_code: sendBackReasonCode,
          reason_text: sendBackReasonText.trim() || undefined,
          idempotency_key,
        }),
      });
      if (!res.ok) { actionError = (await res.text()) || `HTTP ${res.status}`; return; }
      await loadSubmission();
      decision = null; sendBackReasonText = '';
    } catch (e) { actionError = (e as Error).message; }
    finally { acting = false; }
  }

  function fmtAbs(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString() : '—';
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-4xl px-4 py-6 pb-32">
    <div class="mb-3">
      <button class="text-xs text-zinc-400 hover:text-zinc-200" onclick={() => goto('/ops-os/review')}>← Back to queue</button>
    </div>

    {#if loading}
      <div class="py-12 text-center text-sm text-zinc-500">Loading…</div>
    {:else if loadError}
      <div class="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</div>
    {:else if submission}
      <!-- Header -->
      <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">PM Review</div>
            <div class="mt-1 text-base font-semibold">{submission.cadence} · {submission.period_start}</div>
          </div>
          <div class="text-right">
            <span
              class="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              class:bg-blue-900={submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
              class:text-blue-200={submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
              class:bg-amber-900={submission.status === 'SENT_BACK'}
              class:text-amber-200={submission.status === 'SENT_BACK'}
              class:bg-emerald-900={submission.status === 'SIGNED_OFF'}
              class:text-emerald-200={submission.status === 'SIGNED_OFF'}
              class:bg-violet-900={submission.status === 'LOCKED'}
              class:text-violet-200={submission.status === 'LOCKED'}
              class:bg-zinc-800={submission.status === 'DRAFT' || submission.status === 'NEW'}
              class:text-zinc-400={submission.status === 'DRAFT' || submission.status === 'NEW'}
            >{submission.status}</span>
            {#if submission.is_late_submission || submission.is_late_sign_off}
              <span class="ml-1 rounded bg-red-900 px-1 py-0.5 text-[9px] uppercase text-red-200">late</span>
            {/if}
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Submitted</div>
            <div class="mt-0.5 text-xs">{fmtAbs(submission.submitted_at)}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Revision</div>
            <div class="mt-0.5 text-xs tabular-nums">{submission.revision}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Send-backs</div>
            <div class="mt-0.5 text-xs tabular-nums">{submission.sent_back_count}</div>
          </div>
          <div>
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">Signed off</div>
            <div class="mt-0.5 text-xs">{fmtAbs(submission.signed_off_at)}</div>
          </div>
        </div>
      </div>

      {#if submission.pm_remark}
        <div class="mb-4 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-emerald-500">Previous PM remark</div>
          <div class="mt-1 whitespace-pre-wrap text-emerald-200">{submission.pm_remark}</div>
        </div>
      {/if}

      {#if submission.status === 'SENT_BACK' && submission.sent_back_reason_code}
        <div class="mb-4 rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-amber-500">Previously sent back</div>
          <div class="mt-1 text-amber-200">{submission.sent_back_reason_code}{submission.sent_back_reason_text ? ` — ${submission.sent_back_reason_text}` : ''}</div>
        </div>
      {/if}

      <!-- Sections -->
      {#each SECTIONS as section (section.code)}
        <section class="mb-4 rounded-xl border border-zinc-800 bg-zinc-900">
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
                    <span class="font-medium tabular-nums">{displayPairValue(f.leftMetricId, f.rightMetricId)}</span>
                  {:else if f.kind === 'pills'}
                    {@const v = rawValue(f.metric_id)}
                    {#if v === null || v === ''}
                      <span class="text-zinc-600">—</span>
                    {:else}
                      <span class="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs font-medium">{pillsLabelFor(f.metric_id, f.options)}</span>
                    {/if}
                    {#if f.followUp && valueText(f.followUp.metric_id) !== '—'}
                      <div class="mt-1 text-xs text-zinc-400 whitespace-pre-wrap">{valueText(f.followUp.metric_id)}</div>
                    {/if}
                  {:else if f.kind === 'yesno'}
                    {@const v = rawValue(f.metric_id)}
                    {#if v === true}
                      <span class="rounded-md bg-red-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-200">Yes</span>
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
    {/if}
  </div>

  <!-- Sticky decision footer -->
  {#if submission && (submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW')}
    <div class="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
      <div class="mx-auto max-w-4xl">
        {#if decision === null}
          <div class="flex gap-3">
            <button
              class="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
              onclick={() => { decision = 'sign_off'; actionError = null; }}
            >Sign off</button>
            <button
              class="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500"
              onclick={() => { decision = 'send_back'; actionError = null; }}
            >Send back</button>
          </div>
        {:else if decision === 'sign_off'}
          <div class="space-y-2">
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="pm-remark">PM remark (required)</label>
            <textarea
              id="pm-remark"
              class="min-h-[60px] w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              bind:value={pmRemarkInput}
              placeholder="What you verified. Visible in audit log."
            ></textarea>
            {#if actionError}<div class="text-xs text-red-400">{actionError}</div>{/if}
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500"
                disabled={!canSignOff}
                onclick={signOff}
              >{acting ? 'Signing off…' : 'Confirm sign-off'}</button>
              <button
                class="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
                onclick={() => { decision = null; pmRemarkInput = ''; actionError = null; }}
              >Cancel</button>
            </div>
          </div>
        {:else if decision === 'send_back'}
          <div class="space-y-2">
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="reason-code">Reason</label>
            <select
              id="reason-code"
              class="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              bind:value={sendBackReasonCode}
            >
              <option value="missing_field">Missing field</option>
              <option value="data_inconsistency">Data inconsistency</option>
              <option value="needs_clarification">Needs clarification</option>
              <option value="other">Other (text required)</option>
            </select>
            <textarea
              class="min-h-[60px] w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
              bind:value={sendBackReasonText}
              placeholder={sendBackReasonCode === 'other' ? 'Required when reason is Other' : 'Optional: more detail for the BOA'}
            ></textarea>
            {#if actionError}<div class="text-xs text-red-400">{actionError}</div>{/if}
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500"
                disabled={!canSendBack}
                onclick={sendBack}
              >{acting ? 'Sending back…' : 'Confirm send-back'}</button>
              <button
                class="rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
                onclick={() => { decision = null; sendBackReasonText = ''; actionError = null; }}
              >Cancel</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
