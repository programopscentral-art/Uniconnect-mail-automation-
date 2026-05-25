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
  type EventRow = {
    event_id: string;
    event_type: string;
    recorded_at: string;
    actor_user_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
    payload: Record<string, unknown>;
  };

  // Same section ordering as the BOA form
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

  // Friendly labels for event types in the timeline
  const EVENT_LABEL: Record<string, string> = {
    'submission.created':      'Draft created',
    'submission.field_updated': 'Field updated',
    'submission.submitted':    'Submitted for PM review',
    'submission.sent_back':    'Returned for correction',
    'submission.signed_off':   'PM signed off',
    'submission.retracted':    'Retracted by BOA',
    'submission.superseded':   'Superseded by amendment',
    'verification.send_back':  'PM sent back',
    'verification.signed_off': 'PM signed off',
    'edit.captured':           'Edit recorded',
  };

  let submission = $state<Submission | null>(null);
  let valuesByMetric = $state<Record<string, ValueRow>>({});
  let events = $state<EventRow[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  async function loadAll() {
    loading = true;
    loadError = null;
    try {
      const [detailRes, eventsRes] = await Promise.all([
        fetch(`/api/ops-os/submissions/${data.submission_id}`),
        fetch(`/api/ops-os/submissions/${data.submission_id}/events`),
      ]);
      if (!detailRes.ok) {
        loadError = detailRes.status === 404
          ? 'Submission not found or out of scope'
          : (await detailRes.text()) || `HTTP ${detailRes.status}`;
        return;
      }
      const j = await detailRes.json();
      submission = j.submission;
      const map: Record<string, ValueRow> = {};
      for (const v of j.values ?? []) map[v.metric_id] = v;
      valuesByMetric = map;

      if (eventsRes.ok) {
        const ej = await eventsRes.json();
        events = ej.events ?? [];
      }
    } catch (e) {
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(loadAll);

  function displayValue(metric_id: string): string {
    const v = valuesByMetric[metric_id];
    if (!v) return '—';
    if (v.value_numeric !== null) return String(v.value_numeric);
    if (v.value_text !== null) return v.value_text;
    if (v.value_boolean !== null) return v.value_boolean ? 'yes' : 'no';
    return '—';
  }

  function fmtAbs(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function fmtTimelineTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString([], {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function eventLabel(t: string): string {
    return EVENT_LABEL[t] || t;
  }

  // Collapse runs of `submission.field_updated` events in the timeline to a single
  // summary entry so a 20-field autosave doesn't drown out meaningful transitions.
  let collapsedEvents = $derived.by(() => {
    const out: Array<EventRow & { _runCount?: number }> = [];
    let runStart: EventRow | null = null;
    let runCount = 0;
    for (const e of events) {
      if (e.event_type === 'submission.field_updated') {
        if (!runStart) { runStart = e; runCount = 1; }
        else runCount++;
        continue;
      }
      if (runStart) {
        out.push({ ...runStart, _runCount: runCount });
        runStart = null; runCount = 0;
      }
      out.push(e);
    }
    if (runStart) out.push({ ...runStart, _runCount: runCount });
    return out;
  });
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
  <div class="mx-auto max-w-5xl px-4 py-6">
    <div class="mb-4">
      <button class="text-xs text-gray-400 hover:text-gray-200" onclick={() => goto('/ops-os/operations')}>← Back to overview</button>
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
          <h1 class="mt-1 text-lg font-semibold">Submission (read-only)</h1>
        </div>
        <div class="text-right">
          <span
            class="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            class:bg-gray-800={submission.status === 'DRAFT' || submission.status === 'NEW'}
            class:text-gray-400={submission.status === 'DRAFT' || submission.status === 'NEW'}
            class:bg-blue-900={submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
            class:text-blue-200={submission.status === 'SUBMITTED' || submission.status === 'PM_REVIEW'}
            class:bg-amber-900={submission.status === 'SENT_BACK'}
            class:text-amber-200={submission.status === 'SENT_BACK'}
            class:bg-emerald-900={submission.status === 'SIGNED_OFF'}
            class:text-emerald-200={submission.status === 'SIGNED_OFF'}
            class:bg-violet-900={submission.status === 'LOCKED'}
            class:text-violet-200={submission.status === 'LOCKED'}
          >{submission.status}</span>
          {#if submission.is_late_submission || submission.is_late_sign_off}
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
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Signed off</div>
          <div class="mt-1 text-sm">{fmtAbs(submission.signed_off_at)}</div>
        </div>
        <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Locked</div>
          <div class="mt-1 text-sm">{fmtAbs(submission.locked_at)}</div>
        </div>
        <div class="rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-gray-500">Send-backs</div>
          <div class="mt-1 text-sm">{submission.sent_back_count}</div>
        </div>
      </div>

      {#if submission.pm_remark}
        <div class="mb-4 rounded border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-emerald-500">PM remark</div>
          <div class="mt-1 text-emerald-200 whitespace-pre-wrap">{submission.pm_remark}</div>
        </div>
      {/if}

      {#if submission.status === 'SENT_BACK' && submission.sent_back_reason_code}
        <div class="mb-4 rounded border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm">
          <div class="text-[10px] uppercase tracking-wider text-amber-500">Last sent back</div>
          <div class="mt-1 text-amber-200">{submission.sent_back_reason_code}{submission.sent_back_reason_text ? ` — ${submission.sent_back_reason_text}` : ''}</div>
        </div>
      {/if}

      <!-- Values grouped by section -->
      {#each SECTION_ORDER as section (section.code)}
        <section class="mb-4 rounded border border-gray-800 bg-gray-900">
          <header class="border-b border-gray-800 px-4 py-2 text-xs uppercase tracking-wider text-gray-500">{section.title}</header>
          <div class="divide-y divide-gray-800">
            {#each section.metrics as m (m.id)}
              <div class="flex items-start justify-between gap-4 px-4 py-2 text-sm">
                <div class="text-gray-400">{m.label}</div>
                <div class="text-right font-medium whitespace-pre-wrap max-w-[60%]">{displayValue(m.id)}</div>
              </div>
            {/each}
          </div>
        </section>
      {/each}

      <!-- Event timeline -->
      <section class="mb-4 rounded border border-gray-800 bg-gray-900">
        <header class="border-b border-gray-800 px-4 py-2 text-xs uppercase tracking-wider text-gray-500">Timeline</header>
        {#if collapsedEvents.length === 0}
          <div class="px-4 py-6 text-center text-xs text-gray-500">No events recorded.</div>
        {:else}
          <ol class="divide-y divide-gray-800">
            {#each collapsedEvents as e (e.event_id)}
              <li class="px-4 py-3">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="text-sm font-medium">
                      {eventLabel(e.event_type)}
                      {#if (e as any)._runCount > 1}
                        <span class="ml-1 text-[10px] text-gray-500">×{(e as any)._runCount}</span>
                      {/if}
                    </div>
                    <div class="mt-0.5 text-[11px] text-gray-500">
                      {e.actor_name ?? e.actor_email ?? 'system'}
                    </div>
                  </div>
                  <div class="shrink-0 text-[11px] text-gray-500">{fmtTimelineTime(e.recorded_at)}</div>
                </div>
                {#if e.event_type === 'submission.sent_back' && e.payload?.reason_code}
                  <div class="mt-1 text-[11px] text-amber-300">
                    Reason: {e.payload.reason_code}
                  </div>
                {/if}
                {#if e.event_type === 'submission.signed_off' && e.payload?.transition === 'locked'}
                  <div class="mt-1 text-[11px] text-violet-300">Transitioned to LOCKED</div>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {/if}
  </div>
</div>
