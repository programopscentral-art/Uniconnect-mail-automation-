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

  // Same section ordering as the BOA form. Display-only labels.
  const SECTION_ORDER: Array<{ code: string; title: string; metrics: Array<{ id: string; label: string }> }> = [
    { code: 'attendance', title: 'Attendance Heartbeat', metrics: [
      { id: 'daily.attendance.total_enrolled', label: 'Total enrolled' },
      { id: 'daily.attendance.present', label: 'Present' },
      { id: 'daily.attendance.absent_authorized', label: 'Absent (authorized)' },
      { id: 'daily.attendance.absent_unauthorized', label: 'Absent (unauthorized)' },
    ]},
    { code: 'academic', title: 'Academic Delivery', metrics: [
      { id: 'daily.academic.sessions_scheduled', label: 'Sessions scheduled' },
      { id: 'daily.academic.sessions_conducted', label: 'Sessions conducted' },
      { id: 'daily.academic.cancellation_notes', label: 'Cancellation notes' },
    ]},
    { code: 'faculty', title: 'Faculty Status', metrics: [
      { id: 'daily.faculty.expected', label: 'Faculty expected' },
      { id: 'daily.faculty.present', label: 'Faculty present' },
      { id: 'daily.faculty.substitution_notes', label: 'Substitution notes' },
    ]},
    { code: 'infra', title: 'Infrastructure', metrics: [
      { id: 'daily.infra.power_status', label: 'Power' },
      { id: 'daily.infra.water_status', label: 'Water' },
      { id: 'daily.infra.connectivity_status', label: 'Connectivity' },
      { id: 'daily.infra.open_issues', label: 'Open issues' },
    ]},
    { code: 'student_ops', title: 'Student-Facing Ops', metrics: [
      { id: 'daily.student_ops.mess_status', label: 'Mess' },
      { id: 'daily.student_ops.transport_status', label: 'Transport' },
      { id: 'daily.student_ops.other_notes', label: 'Other notes' },
    ]},
    { code: 'incidents', title: 'Incidents & Safety', metrics: [
      { id: 'daily.incidents.count', label: 'Incidents today' },
      { id: 'daily.incidents.summary', label: 'Incident summary' },
    ]},
    { code: 'remark', title: 'BOA Remark', metrics: [
      { id: 'daily.remark.boa', label: 'BOA remark' },
    ]},
  ];

  let submission = $state<Submission | null>(null);
  let valuesByMetric = $state<Record<string, ValueRow>>({});
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  // Decision state
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

  function displayValue(metric_id: string): string {
    const v = valuesByMetric[metric_id];
    if (!v) return '—';
    if (v.value_numeric !== null) return String(v.value_numeric);
    if (v.value_text !== null) return v.value_text;
    if (v.value_boolean !== null) return v.value_boolean ? 'yes' : 'no';
    return '—';
  }

  let canAct = $derived(
    !!submission &&
    (submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW') &&
    !acting,
  );

  let canSignOff = $derived(canAct && pmRemarkInput.trim().length > 0);
  let canSendBack = $derived(
    canAct &&
    (sendBackReasonCode !== 'other' || sendBackReasonText.trim().length > 0),
  );

  async function signOff() {
    if (!submission || !canSignOff) return;
    acting = true;
    actionError = null;
    try {
      const idempotency_key = `pm.signoff.${submission.submission_id}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submission.submission_id}/sign-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pm_remark: pmRemarkInput.trim(), idempotency_key }),
      });
      if (!res.ok) {
        actionError = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      await loadSubmission();
      decision = null;
      pmRemarkInput = '';
    } catch (e) {
      actionError = (e as Error).message;
    } finally {
      acting = false;
    }
  }

  async function sendBack() {
    if (!submission || !canSendBack) return;
    acting = true;
    actionError = null;
    try {
      const idempotency_key = `pm.sendback.${submission.submission_id}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submission.submission_id}/send-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason_code: sendBackReasonCode,
          reason_text: sendBackReasonText.trim() || undefined,
          idempotency_key,
        }),
      });
      if (!res.ok) {
        actionError = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      await loadSubmission();
      decision = null;
      sendBackReasonText = '';
    } catch (e) {
      actionError = (e as Error).message;
    } finally {
      acting = false;
    }
  }

  function fmtAbs(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
  <div class="mx-auto max-w-4xl px-4 py-6">
    <div class="mb-4">
      <button class="text-xs text-gray-400 hover:text-gray-200" onclick={() => goto('/ops-os/review')}>← Back to queue</button>
    </div>

    {#if loading}
      <div class="py-12 text-center text-sm text-gray-500">Loading…</div>
    {:else if loadError}
      <div class="rounded border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</div>
    {:else if submission}
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between rounded border border-gray-800 bg-gray-900 px-4 py-3">
        <div>
          <div class="text-xs uppercase tracking-wider text-gray-500">{submission.cadence} · {submission.period_start}</div>
          <h1 class="mt-1 text-lg font-semibold">Submission detail</h1>
        </div>
        <div class="text-right">
          <span
            class="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            class:bg-blue-900={submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
            class:text-blue-200={submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
            class:bg-amber-900={submission.status === 'SENT_BACK'}
            class:text-amber-200={submission.status === 'SENT_BACK'}
            class:bg-emerald-900={submission.status === 'SIGNED_OFF'}
            class:text-emerald-200={submission.status === 'SIGNED_OFF'}
            class:bg-gray-800={submission.status === 'LOCKED' || submission.status === 'DRAFT' || submission.status === 'NEW'}
            class:text-gray-400={submission.status === 'LOCKED' || submission.status === 'DRAFT' || submission.status === 'NEW'}
          >{submission.status}</span>
          {#if submission.is_late_submission}
            <span class="ml-1 rounded bg-red-900 px-1 py-0.5 text-[9px] uppercase text-red-200">late</span>
          {/if}
        </div>
      </div>

      <!-- Meta strip -->
      <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Submitted</div>
          <div class="mt-1 text-sm">{fmtAbs(submission.submitted_at)}</div>
        </div>
        <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Revision</div>
          <div class="mt-1 text-sm">{submission.revision}</div>
        </div>
        <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Send-back count</div>
          <div class="mt-1 text-sm">{submission.sent_back_count}</div>
        </div>
        <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Signed off</div>
          <div class="mt-1 text-sm">{fmtAbs(submission.signed_off_at)}</div>
        </div>
      </div>

      {#if submission.pm_remark}
        <div class="mb-4 rounded border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-emerald-500">Previous PM remark</div>
          <div class="mt-1 text-emerald-200">{submission.pm_remark}</div>
        </div>
      {/if}

      {#if submission.status === 'SENT_BACK' && submission.sent_back_reason_code}
        <div class="mb-4 rounded border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-amber-500">Previously sent back</div>
          <div class="mt-1 text-amber-200">{submission.sent_back_reason_code}{submission.sent_back_reason_text ? ` — ${submission.sent_back_reason_text}` : ''}</div>
        </div>
      {/if}

      <!-- Values, grouped by section -->
      {#each SECTION_ORDER as section (section.code)}
        <section class="mb-4 rounded border border-gray-800 bg-gray-900">
          <header class="border-b border-gray-800 px-4 py-2 text-xs uppercase tracking-wider text-gray-500">{section.title}</header>
          <div class="divide-y divide-gray-800">
            {#each section.metrics as m (m.id)}
              <div class="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <div class="text-gray-400">{m.label}</div>
                <div class="text-right font-medium">{displayValue(m.id)}</div>
              </div>
            {/each}
          </div>
        </section>
      {/each}

      <!-- Decision panel -->
      {#if submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
        <div class="sticky bottom-0 -mx-4 mt-6 border-t border-gray-800 bg-gray-950/95 px-4 py-4 backdrop-blur">
          {#if decision === null}
            <div class="flex gap-3">
              <button
                class="flex-1 rounded bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600"
                onclick={() => { decision = 'sign_off'; actionError = null; }}
              >Sign off</button>
              <button
                class="flex-1 rounded bg-amber-700 px-4 py-3 text-sm font-medium text-white hover:bg-amber-600"
                onclick={() => { decision = 'send_back'; actionError = null; }}
              >Send back</button>
            </div>
          {:else if decision === 'sign_off'}
            <div class="space-y-2">
              <label class="block text-xs uppercase tracking-wider text-gray-500" for="pm-remark">PM remark (required)</label>
              <textarea
                id="pm-remark"
                class="min-h-[60px] w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                bind:value={pmRemarkInput}
                placeholder="What you verified. Visible in audit log."
              ></textarea>
              {#if actionError}<div class="text-xs text-red-400">{actionError}</div>{/if}
              <div class="flex gap-2">
                <button
                  class="flex-1 rounded bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-500"
                  disabled={!canSignOff}
                  onclick={signOff}
                >{acting ? 'Signing off…' : 'Confirm sign-off'}</button>
                <button
                  class="rounded border border-gray-700 px-3 py-3 text-sm text-gray-300 hover:bg-gray-800"
                  onclick={() => { decision = null; pmRemarkInput = ''; actionError = null; }}
                >Cancel</button>
              </div>
            </div>
          {:else if decision === 'send_back'}
            <div class="space-y-2">
              <label class="block text-xs uppercase tracking-wider text-gray-500" for="reason-code">Reason</label>
              <select
                id="reason-code"
                class="w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                bind:value={sendBackReasonCode}
              >
                <option value="missing_field">Missing field</option>
                <option value="data_inconsistency">Data inconsistency</option>
                <option value="needs_clarification">Needs clarification</option>
                <option value="other">Other (text required)</option>
              </select>
              <textarea
                class="min-h-[60px] w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none"
                bind:value={sendBackReasonText}
                placeholder={sendBackReasonCode === 'other' ? 'Required when reason is Other' : 'Optional: more detail for the BOA'}
              ></textarea>
              {#if actionError}<div class="text-xs text-red-400">{actionError}</div>{/if}
              <div class="flex gap-2">
                <button
                  class="flex-1 rounded bg-amber-700 px-4 py-3 text-sm font-medium text-white hover:bg-amber-600 disabled:bg-gray-800 disabled:text-gray-500"
                  disabled={!canSendBack}
                  onclick={sendBack}
                >{acting ? 'Sending back…' : 'Confirm send-back'}</button>
                <button
                  class="rounded border border-gray-700 px-3 py-3 text-sm text-gray-300 hover:bg-gray-800"
                  onclick={() => { decision = null; sendBackReasonText = ''; actionError = null; }}
                >Cancel</button>
              </div>
            </div>
          {/if}
        </div>
      {:else if submission.status === 'SIGNED_OFF'}
        <div class="mt-4 rounded border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          Signed off at {fmtAbs(submission.signed_off_at)}. Awaiting end-of-day lock.
        </div>
      {:else if submission.status === 'LOCKED'}
        <div class="mt-4 rounded border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-400">
          Locked at {fmtAbs(submission.locked_at)}. Read-only.
        </div>
      {:else}
        <div class="mt-4 rounded border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">
          Status {submission.status} — no PM action available.
        </div>
      {/if}
    {/if}
  </div>
</div>
