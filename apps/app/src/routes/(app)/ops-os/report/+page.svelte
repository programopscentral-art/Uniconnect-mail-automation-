<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props<{ data: { campuses: Array<{ campus_id: string; code: string; display_name: string }>; today: string; role: string } }>();

  // ─── Field model (V2) ────────────────────────────────────────────────
  //
  // Each field has a `kind` discriminator that controls rendering:
  //   number   — single numeric input
  //   text     — single textarea
  //   pair     — two numeric inputs side by side (X / Y, e.g. present/total)
  //   pills    — enum rendered as pill button group
  //   yesno    — Yes/No buttons + optional follow-up text field
  //
  // `source` is a visual hint ('auto' | 'manual') — currently cosmetic
  // since real upstream integrations aren't wired; the slot is here so we
  // can light up the AUTO tag once HRMS/biometric/helpdesk are connected.

  type SourceHint = 'auto' | 'manual';

  type NumberField = { kind: 'number'; metric_id: string; label: string; required: boolean; source?: SourceHint; sourceLabel?: string };
  type TextField   = { kind: 'text';   metric_id: string; label: string; required: boolean; source?: SourceHint; sourceLabel?: string; placeholder?: string };
  type PairField   = { kind: 'pair';   label: string; required: boolean; source?: SourceHint; sourceLabel?: string;
                       leftLabel: string;  leftMetricId:  string;
                       rightLabel: string; rightMetricId: string; };
  type PillsField  = { kind: 'pills';  metric_id: string; label: string; required: boolean; source?: SourceHint; sourceLabel?: string;
                       options: Array<{ value: string; label: string }>; followUp?: { metric_id: string; placeholder: string } };
  type YesNoField  = { kind: 'yesno';  metric_id: string; label: string; required: boolean; source?: SourceHint; sourceLabel?: string;
                       followUp?: { metric_id: string; placeholder: string } };

  type Field = NumberField | TextField | PairField | PillsField | YesNoField;
  type Section = { code: string; index: number; title: string; banner?: string; fields: Field[] };

  // Hardcoded V2 schema. Metric IDs match seeds in migrations 0090 + 0092.
  const SECTIONS: Section[] = [
    {
      code: 'attendance', index: 2, title: 'Attendance Heartbeat',
      fields: [
        { kind: 'pair', label: 'Students present / total', required: true, source: 'auto', sourceLabel: 'AUTO 4:00pm',
          leftLabel: 'Present', leftMetricId: 'daily.attendance.present',
          rightLabel: 'Total',  rightMetricId: 'daily.attendance.total_enrolled' },
        { kind: 'pair', label: 'Faculty present / total', required: true, source: 'auto', sourceLabel: 'AUTO 4:00pm',
          leftLabel: 'Present', leftMetricId: 'daily.faculty.present',
          rightLabel: 'Total',  rightMetricId: 'daily.faculty.expected' },
        { kind: 'pair', label: 'Success coaches present / total', required: true, source: 'auto', sourceLabel: 'AUTO 4:00pm',
          leftLabel: 'Present', leftMetricId: 'daily.attendance.success_coaches_present',
          rightLabel: 'Total',  rightMetricId: 'daily.attendance.success_coaches_total' },
        { kind: 'pair', label: 'Program ops team present / total', required: true, source: 'auto', sourceLabel: 'AUTO 4:00pm',
          leftLabel: 'Present', leftMetricId: 'daily.attendance.program_ops_present',
          rightLabel: 'Total',  rightMetricId: 'daily.attendance.program_ops_total' },
        { kind: 'number', metric_id: 'daily.attendance.absent_authorized',   label: 'Absent — authorized',   required: true, source: 'manual' },
        { kind: 'number', metric_id: 'daily.attendance.absent_unauthorized', label: 'Absent — unauthorized', required: true, source: 'manual' },
      ],
    },
    {
      code: 'academic', index: 3, title: 'Academic Delivery',
      fields: [
        { kind: 'pair', label: 'Classes held / scheduled', required: true, source: 'auto', sourceLabel: 'AUTO 4:00pm',
          leftLabel: 'Held',      leftMetricId: 'daily.academic.sessions_conducted',
          rightLabel: 'Scheduled', rightMetricId: 'daily.academic.sessions_scheduled' },
        { kind: 'pills', metric_id: 'daily.academic.cancellation_reason', label: 'Sessions cancelled — primary reason', required: false, source: 'manual',
          options: [
            { value: 'faculty_absent',   label: 'Faculty absent' },
            { value: 'infra_issue',      label: 'Infra issue' },
            { value: 'holiday',          label: 'Unplanned holiday' },
            { value: 'student_absence',  label: 'Student absence' },
            { value: 'other',            label: 'Other' },
          ],
          followUp: { metric_id: 'daily.academic.cancellation_notes', placeholder: 'Brief context (required if Other)' } },
      ],
    },
    {
      code: 'faculty', index: 4, title: 'Faculty Status',
      fields: [
        { kind: 'number', metric_id: 'daily.faculty.absent_count', label: 'Faculty absent today (count)', required: true, source: 'auto', sourceLabel: 'AUTO 4:00pm' },
        { kind: 'pills',  metric_id: 'daily.faculty.replacement_assigned', label: 'Replacement assigned', required: false, source: 'manual',
          options: [
            { value: 'yes',     label: 'Yes' },
            { value: 'partial', label: 'Partial' },
            { value: 'no',      label: 'No' },
          ] },
        { kind: 'number', metric_id: 'daily.faculty.absences_exceeding_sop', label: 'Absences exceeding 2-day SOP', required: true, source: 'manual' },
        { kind: 'text',   metric_id: 'daily.faculty.substitution_notes', label: 'Substitution notes', required: false, source: 'manual', placeholder: 'Optional' },
      ],
    },
    {
      code: 'infra', index: 5, title: 'Infrastructure Check',
      banner: 'Visual check from your 9am walk-through. All manual.',
      fields: [
        { kind: 'pills', metric_id: 'daily.infra.wifi_status', label: 'Wi-Fi / ISP / bandwidth', required: true, source: 'manual',
          options: [
            { value: 'ok',       label: 'OK' },
            { value: 'degraded', label: 'Degraded' },
            { value: 'down',     label: 'Down' },
          ] },
        { kind: 'pills', metric_id: 'daily.infra.av_status', label: 'TV / AV in classrooms', required: true, source: 'manual',
          options: [
            { value: 'ok',      label: 'OK' },
            { value: 'partial', label: 'Partial' },
            { value: 'down',    label: 'Down' },
          ],
          followUp: { metric_id: 'daily.infra.av_notes', placeholder: 'e.g. Room 204 projector down' } },
        { kind: 'pills', metric_id: 'daily.infra.cleanliness_status', label: 'Cleanliness — classroom, washroom, campus', required: true, source: 'manual',
          options: [
            { value: 'ok',     label: 'OK' },
            { value: 'issues', label: 'Issues' },
          ],
          followUp: { metric_id: 'daily.infra.cleanliness_notes', placeholder: 'e.g. 2nd floor washroom flagged for re-cleaning' } },
        { kind: 'pills', metric_id: 'daily.infra.electricity_status', label: 'Electricity / UPS / generator', required: true, source: 'manual',
          options: [
            { value: 'ok',              label: 'OK' },
            { value: 'backup_engaged',  label: 'Backup engaged' },
            { value: 'down',            label: 'Down' },
          ] },
        { kind: 'pills', metric_id: 'daily.infra.power_status', label: 'Power (main supply)', required: true, source: 'manual',
          options: [
            { value: 'normal',           label: 'Normal' },
            { value: 'outage_brief',     label: 'Brief outage' },
            { value: 'outage_extended',  label: 'Extended outage' },
            { value: 'unstable',         label: 'Unstable' },
          ] },
        { kind: 'pills', metric_id: 'daily.infra.water_status', label: 'Water', required: true, source: 'manual',
          options: [
            { value: 'normal',       label: 'Normal' },
            { value: 'intermittent', label: 'Intermittent' },
            { value: 'unavailable',  label: 'Unavailable' },
          ] },
        { kind: 'pills', metric_id: 'daily.infra.connectivity_status', label: 'Connectivity (campus network)', required: true, source: 'manual',
          options: [
            { value: 'normal',   label: 'Normal' },
            { value: 'degraded', label: 'Degraded' },
            { value: 'down',     label: 'Down' },
          ] },
        { kind: 'text',  metric_id: 'daily.infra.open_issues', label: 'Other open infrastructure issues', required: false, source: 'manual', placeholder: 'One per line — optional' },
      ],
    },
    {
      code: 'student_ops', index: 6, title: 'Student-Facing Operations',
      fields: [
        { kind: 'number', metric_id: 'daily.student_ops.hostel_issues_count',      label: 'Hostel issues',         required: true, source: 'auto', sourceLabel: 'AUTO' },
        { kind: 'number', metric_id: 'daily.student_ops.transport_incidents_count', label: 'Transport incidents',  required: true, source: 'auto', sourceLabel: 'AUTO' },
        { kind: 'number', metric_id: 'daily.student_ops.escalations_opened',       label: 'Escalations opened',    required: true, source: 'auto', sourceLabel: 'AUTO' },
        { kind: 'number', metric_id: 'daily.student_ops.escalations_closed',       label: 'Escalations closed',    required: true, source: 'auto', sourceLabel: 'AUTO' },
        { kind: 'pills',  metric_id: 'daily.student_ops.mess_status', label: 'Mess service', required: true, source: 'manual',
          options: [
            { value: 'served',     label: 'Served' },
            { value: 'delayed',    label: 'Delayed' },
            { value: 'not_served', label: 'Not served' },
          ] },
        { kind: 'pills',  metric_id: 'daily.student_ops.transport_status', label: 'Transport', required: true, source: 'manual',
          options: [
            { value: 'normal',     label: 'Normal' },
            { value: 'delayed',    label: 'Delayed' },
            { value: 'partial',    label: 'Partial' },
            { value: 'unavailable', label: 'Unavailable' },
          ] },
        { kind: 'text',   metric_id: 'daily.student_ops.other_notes', label: 'Other notes', required: false, source: 'manual', placeholder: 'Optional' },
      ],
    },
    {
      code: 'incidents', index: 7, title: 'Incidents & Safety',
      banner: 'Each Yes auto-routes to HR + designated owner. Be specific. Do not name parties.',
      fields: [
        { kind: 'yesno', metric_id: 'daily.incidents.posh_pocso',       label: 'PoSH / PoCSO concern',      required: true,
          followUp: { metric_id: 'daily.incidents.posh_pocso_text',     placeholder: 'Context (required if Yes). Do not name parties.' } },
        { kind: 'yesno', metric_id: 'daily.incidents.anti_ragging',     label: 'Anti-ragging / bullying',   required: true,
          followUp: { metric_id: 'daily.incidents.anti_ragging_text',   placeholder: 'Context (required if Yes). Do not name parties.' } },
        { kind: 'yesno', metric_id: 'daily.incidents.safety_on_campus', label: 'Safety incident on campus', required: true,
          followUp: { metric_id: 'daily.incidents.safety_text',         placeholder: 'Type, severity, action taken' } },
        { kind: 'yesno', metric_id: 'daily.incidents.parent_complaint', label: 'Parent complaint escalated', required: true,
          followUp: { metric_id: 'daily.incidents.parent_complaint_text', placeholder: 'Cohort, nature, current status' } },
        { kind: 'yesno', metric_id: 'daily.incidents.ceo_visible',      label: 'CEO-visible incident',      required: true,
          followUp: { metric_id: 'daily.incidents.ceo_visible_text',    placeholder: 'What happened, who is informed' } },
        // Backwards-compatible aggregate count + summary (still in the schema)
        { kind: 'number', metric_id: 'daily.incidents.count', label: 'Total incident count today', required: true, source: 'manual' },
        { kind: 'text',   metric_id: 'daily.incidents.summary', label: 'Aggregate incident summary (required if count > 0)', required: false, source: 'manual', placeholder: 'Summarize across all flagged items' },
      ],
    },
    {
      code: 'remark', index: 8, title: 'BOA Remark',
      fields: [
        { kind: 'text', metric_id: 'daily.remark.boa', label: 'Any additional context for PM review', required: false, source: 'manual', placeholder: 'Optional' },
      ],
    },
  ];

  // PM remark is a reserved section displayed in the form but not edited by BOA
  // It's a column on the submission row, populated only on PM sign-off.

  // ─── State ─────────────────────────────────────────────────────────────

  let selectedCampusId = $state(data.campuses[0]?.campus_id ?? '');
  let submissionId = $state<string | null>(null);
  let submissionStatus = $state<string>('');
  let sentBackReasonCode = $state<string | null>(null);
  let sentBackReasonText = $state<string | null>(null);
  let pmRemark = $state<string | null>(null);

  // Field values (keyed by metric_id)
  let values = $state<Record<string, string | number | boolean | null>>({});
  let saveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  let saveError = $state<Record<string, string | null>>({});

  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  // Retract state
  let submittedAtMs = $state<number | null>(null);
  let nowMs = $state(Date.now());
  let retracting = $state(false);
  let retractError = $state<string | null>(null);
  const RETRACTION_WINDOW_MS = 30 * 60 * 1000;

  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  onMount(() => {
    if (selectedCampusId) ensureDraft();
    const tick = setInterval(() => { nowMs = Date.now(); }, 30 * 1000);
    return () => clearInterval(tick);
  });

  $effect(() => {
    if (selectedCampusId) ensureDraft();
  });

  async function ensureDraft() {
    loading = true;
    loadError = null;
    submissionId = null;
    values = {};
    saveState = {};
    saveError = {};

    try {
      const idempotency_key = `boa.draft.${selectedCampusId}.${data.today}`;
      const res = await fetch('/api/ops-os/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campus_id: selectedCampusId, cadence: 'DAILY',
          period_start: data.today, period_end: data.today, idempotency_key,
        }),
      });
      if (!res.ok) {
        loadError = (await res.text()) || `Failed to load draft (HTTP ${res.status})`;
        return;
      }
      const sub = await res.json();
      submissionId = sub.submission_id;
      submissionStatus = sub.status;
      sentBackReasonCode = sub.sent_back_reason_code;
      sentBackReasonText = sub.sent_back_reason_text;
      pmRemark = sub.pm_remark;
      submittedAtMs = sub.submitted_at ? new Date(sub.submitted_at).getTime() : null;

      const detail = await fetch(`/api/ops-os/submissions/${submissionId}`);
      if (detail.ok) {
        const j = await detail.json();
        for (const v of j.values ?? []) {
          values[v.metric_id] = v.value_numeric ?? v.value_text ?? v.value_boolean ?? null;
        }
      }
    } catch (e) {
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  // ─── Save ──────────────────────────────────────────────────────────────

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
    saveState[metric_id] = 'saving';
    saveError[metric_id] = null;
    try {
      const idempotency_key = `boa.save.${submissionId}.${metric_id}.${Date.now()}`;
      const res = await fetch(
        `/api/ops-os/submissions/${submissionId}/values/${encodeURIComponent(metric_id)}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val, value_type, idempotency_key }) },
      );
      if (!res.ok) {
        saveState[metric_id] = 'error';
        saveError[metric_id] = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      saveState[metric_id] = 'saved';
      if (submissionStatus === 'NEW') submissionStatus = 'DRAFT';
      setTimeout(() => { if (saveState[metric_id] === 'saved') saveState[metric_id] = 'idle'; }, 3000);
    } catch (e) {
      saveState[metric_id] = 'error';
      saveError[metric_id] = (e as Error).message;
    }
  }

  // ─── Required / progress computation ───────────────────────────────────

  function isFieldFilled(f: Field): boolean {
    switch (f.kind) {
      case 'number':
      case 'text':
        return notEmpty(values[f.metric_id]);
      case 'pair':
        return notEmpty(values[f.leftMetricId]) && notEmpty(values[f.rightMetricId]);
      case 'pills':
        return notEmpty(values[f.metric_id]);
      case 'yesno':
        return values[f.metric_id] === true || values[f.metric_id] === false;
    }
  }

  function notEmpty(v: unknown): boolean {
    return v !== null && v !== undefined && v !== '';
  }

  function sectionState(s: Section): 'complete' | 'in_progress' | 'empty' {
    const required = s.fields.filter(f => f.required);
    if (required.length === 0) return 'complete';
    const filled = required.filter(isFieldFilled).length;
    if (filled === 0) return 'empty';
    if (filled === required.length) return 'complete';
    return 'in_progress';
  }

  let sectionsCompleteCount = $derived(SECTIONS.filter(s => sectionState(s) === 'complete').length);
  let sectionsTotalCount = $derived(SECTIONS.length);

  let missingRequired = $derived.by(() => {
    const missing: string[] = [];
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        if (!f.required) continue;
        if (!isFieldFilled(f)) missing.push(f.kind === 'pair' ? f.label : f.label);
      }
    }
    // Cross-field: any yes-no with `true` value must have follow-up text
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        if (f.kind === 'yesno' && values[f.metric_id] === true && f.followUp) {
          const txt = String(values[f.followUp.metric_id] ?? '').trim();
          if (txt === '') missing.push(`${f.label} — context required when Yes`);
        }
      }
    }
    // Incident summary required if count > 0
    const ct = Number(values['daily.incidents.count'] ?? 0);
    const sm = String(values['daily.incidents.summary'] ?? '').trim();
    if (ct > 0 && sm.length === 0) missing.push('Aggregate incident summary (count > 0)');
    return missing;
  });

  let isLocked = $derived(submissionStatus === 'LOCKED' || submissionStatus === 'SIGNED_OFF');
  let isReadOnly = $derived(isLocked || submissionStatus === 'SUBMITTED');
  let canSubmit = $derived(
    !!submissionId && !submitting && !isReadOnly && missingRequired.length === 0,
  );

  // ─── Submit / Retract ─────────────────────────────────────────────────

  async function submitReport() {
    if (!submissionId || !canSubmit) return;
    submitting = true;
    submitError = null;
    try {
      const idempotency_key = `boa.submit.${submissionId}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submissionId}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key }),
      });
      if (!res.ok) {
        submitError = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      const updated = await res.json();
      submissionStatus = updated.status;
      submittedAtMs = updated.submitted_at ? new Date(updated.submitted_at).getTime() : null;
    } catch (e) {
      submitError = (e as Error).message;
    } finally {
      submitting = false;
    }
  }

  let retractRemainingMs = $derived(
    submittedAtMs !== null ? (submittedAtMs + RETRACTION_WINDOW_MS) - nowMs : 0,
  );
  let canRetract = $derived(
    submissionStatus === 'SUBMITTED' && retractRemainingMs > 0 && !retracting,
  );
  function fmtMmSs(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  }
  async function retractReport() {
    if (!submissionId || !canRetract) return;
    retracting = true;
    retractError = null;
    try {
      const idempotency_key = `boa.retract.${submissionId}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submissionId}/retract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key }),
      });
      if (!res.ok) {
        retractError = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      const updated = await res.json();
      submissionStatus = updated.status;
      submittedAtMs = null;
    } catch (e) {
      retractError = (e as Error).message;
    } finally {
      retracting = false;
    }
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-3xl px-4 py-6 pb-32">

    <!-- ── Header card ────────────────────────────────────────────────── -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">NIAT Daily</div>
          <div class="mt-1 text-base font-semibold">
            {data.campuses.find(c => c.campus_id === selectedCampusId)?.display_name ?? '—'}
          </div>
          <div class="mt-0.5 text-xs text-zinc-400">{data.today}</div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Sections</div>
          <div class="mt-1 text-base font-semibold tabular-nums">
            {sectionsCompleteCount} <span class="text-zinc-500">/ {sectionsTotalCount}</span>
          </div>
        </div>
      </div>

      <!-- Section progress strip (fixed 7 segments — matches SECTIONS.length) -->
      <div class="mt-3 grid grid-cols-7 gap-1.5">
        {#each SECTIONS as s (s.code)}
          {@const st = sectionState(s)}
          <div
            class="h-1 rounded-full"
            class:bg-emerald-500={st === 'complete'}
            class:bg-amber-500={st === 'in_progress'}
            class:bg-zinc-800={st === 'empty'}
            title="{s.title}: {st}"
          ></div>
        {/each}
      </div>

      <!-- Campus selector if multi -->
      {#if data.campuses.length > 1}
        <div class="mt-3">
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="campus-sel">Campus</label>
          <select
            id="campus-sel"
            class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            bind:value={selectedCampusId}
          >
            {#each data.campuses as c (c.campus_id)}
              <option value={c.campus_id}>{c.display_name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    {#if loading}
      <div class="py-12 text-center text-sm text-zinc-500">Loading draft…</div>
    {:else if loadError}
      <div class="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">{loadError}</div>
    {:else if data.campuses.length === 0}
      <div class="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
        No campuses assigned. Contact your PM to request access.
      </div>
    {:else if submissionId}

      <!-- ── Status banner ───────────────────────────────────────────── -->
      <div class="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              class:bg-zinc-800={submissionStatus === 'NEW' || submissionStatus === 'DRAFT'}
              class:text-zinc-300={submissionStatus === 'NEW' || submissionStatus === 'DRAFT'}
              class:bg-blue-900={submissionStatus === 'SUBMITTED'}
              class:text-blue-200={submissionStatus === 'SUBMITTED'}
              class:bg-amber-900={submissionStatus === 'SENT_BACK'}
              class:text-amber-200={submissionStatus === 'SENT_BACK'}
              class:bg-emerald-900={submissionStatus === 'SIGNED_OFF'}
              class:text-emerald-200={submissionStatus === 'SIGNED_OFF'}
              class:bg-violet-900={submissionStatus === 'LOCKED'}
              class:text-violet-200={submissionStatus === 'LOCKED'}
            >{submissionStatus}</span>
          </div>
          {#if canRetract}
            <button
              type="button"
              class="rounded-md border border-blue-800 bg-blue-900/40 px-3 py-1 text-xs font-medium text-blue-100 hover:bg-blue-900 disabled:opacity-50"
              disabled={retracting}
              onclick={retractReport}
            >{retracting ? 'Retracting…' : `Retract (${fmtMmSs(retractRemainingMs)})`}</button>
          {/if}
        </div>
        {#if submissionStatus === 'SENT_BACK' && sentBackReasonCode}
          <div class="mt-2 border-t border-zinc-800 pt-2 text-amber-300">
            <span class="text-[10px] uppercase tracking-wider text-amber-500">Returned for correction</span>
            <div class="mt-0.5">{sentBackReasonCode}{sentBackReasonText ? ` — ${sentBackReasonText}` : ''}</div>
          </div>
        {/if}
        {#if (submissionStatus === 'SIGNED_OFF' || submissionStatus === 'LOCKED') && pmRemark}
          <div class="mt-2 border-t border-zinc-800 pt-2 text-emerald-300">
            <span class="text-[10px] uppercase tracking-wider text-emerald-500">PM remark</span>
            <div class="mt-0.5 whitespace-pre-wrap">{pmRemark}</div>
          </div>
        {/if}
        {#if retractError}
          <div class="mt-2 border-t border-zinc-800 pt-2 text-xs text-red-300">{retractError}</div>
        {/if}
      </div>

      <!-- ── Sections ────────────────────────────────────────────────── -->
      {#each SECTIONS as section (section.code)}
        {@const st = sectionState(section)}
        <section class="mb-4 rounded-xl border border-zinc-800 bg-zinc-900">
          <header class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div class="flex items-center gap-2">
              <!-- Completion glyph -->
              {#if st === 'complete'}
                <span class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">✓</span>
              {:else if st === 'in_progress'}
                <span class="flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-500 text-[10px] text-amber-400">●</span>
              {:else}
                <span class="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 text-[10px] text-zinc-600">○</span>
              {/if}
              <div>
                <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section {section.index}</div>
                <div class="text-sm font-semibold text-zinc-100">{section.title}</div>
              </div>
            </div>
            <div class="text-[10px] uppercase tracking-wider text-zinc-500">
              {#if st === 'complete'}Complete{:else if st === 'in_progress'}In progress{:else}Not started{/if}
            </div>
          </header>

          {#if section.banner}
            <div
              class="border-b border-zinc-800 px-4 py-2 text-xs"
              class:bg-red-950={section.code === 'incidents'}
              class:text-red-200={section.code === 'incidents'}
              class:bg-blue-950={section.code !== 'incidents'}
              class:text-blue-200={section.code !== 'incidents'}
            >{section.banner}</div>
          {/if}

          <div class="space-y-4 px-4 py-4">
            {#each section.fields as f}
              {@const isPair = f.kind === 'pair'}
              <div>
                <!-- Field header (label + source label) -->
                <div class="flex items-center gap-2">
                  <label class="text-xs font-medium text-zinc-300">
                    {f.label}{#if f.required}<span class="ml-0.5 text-red-400">*</span>{/if}
                  </label>
                  {#if f.source === 'auto' && f.sourceLabel}
                    <span class="rounded-md bg-blue-900/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-blue-300">{f.sourceLabel}</span>
                  {:else if f.source === 'manual' && f.kind !== 'yesno'}
                    <span class="rounded-md border border-zinc-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">Manual</span>
                  {/if}
                </div>

                <!-- Field body -->
                <div class="mt-1.5">
                  {#if f.kind === 'number'}
                    <input
                      type="number" inputmode="numeric"
                      class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none disabled:opacity-50"
                      value={values[f.metric_id] ?? ''}
                      disabled={isReadOnly}
                      oninput={(e) => onValueChange(f.metric_id, 'numeric', (e.currentTarget as HTMLInputElement).value === '' ? null : Number((e.currentTarget as HTMLInputElement).value))}
                      onblur={() => onValueChange(f.metric_id, 'numeric', values[f.metric_id], false)}
                    />
                  {:else if f.kind === 'text'}
                    <textarea
                      class="min-h-[44px] w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none disabled:opacity-50"
                      value={values[f.metric_id] ?? ''}
                      placeholder={f.placeholder ?? ''}
                      disabled={isReadOnly}
                      oninput={(e) => onValueChange(f.metric_id, 'text', (e.currentTarget as HTMLTextAreaElement).value)}
                      onblur={() => onValueChange(f.metric_id, 'text', values[f.metric_id], false)}
                    ></textarea>
                  {:else if f.kind === 'pair'}
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <input
                          type="number" inputmode="numeric"
                          class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none disabled:opacity-50"
                          value={values[f.leftMetricId] ?? ''}
                          placeholder={f.leftLabel}
                          disabled={isReadOnly}
                          oninput={(e) => onValueChange(f.leftMetricId, 'numeric', (e.currentTarget as HTMLInputElement).value === '' ? null : Number((e.currentTarget as HTMLInputElement).value))}
                          onblur={() => onValueChange(f.leftMetricId, 'numeric', values[f.leftMetricId], false)}
                        />
                        <div class="mt-0.5 text-[10px] text-zinc-500">{f.leftLabel}</div>
                      </div>
                      <div>
                        <input
                          type="number" inputmode="numeric"
                          class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm tabular-nums focus:border-blue-600 focus:outline-none disabled:opacity-50"
                          value={values[f.rightMetricId] ?? ''}
                          placeholder={f.rightLabel}
                          disabled={isReadOnly}
                          oninput={(e) => onValueChange(f.rightMetricId, 'numeric', (e.currentTarget as HTMLInputElement).value === '' ? null : Number((e.currentTarget as HTMLInputElement).value))}
                          onblur={() => onValueChange(f.rightMetricId, 'numeric', values[f.rightMetricId], false)}
                        />
                        <div class="mt-0.5 text-[10px] text-zinc-500">{f.rightLabel}</div>
                      </div>
                    </div>
                  {:else if f.kind === 'pills'}
                    <div class="flex flex-wrap gap-2">
                      {#each f.options as opt (opt.value)}
                        {@const selected = values[f.metric_id] === opt.value}
                        <button
                          type="button"
                          class="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                          class:border-blue-600={selected}
                          class:bg-blue-600={selected}
                          class:text-white={selected}
                          class:border-zinc-700={!selected}
                          class:bg-zinc-950={!selected}
                          class:text-zinc-300={!selected}
                          class:hover:bg-zinc-800={!selected && !isReadOnly}
                          disabled={isReadOnly}
                          onclick={() => onValueChange(f.metric_id, 'text', selected ? null : opt.value, false)}
                        >{opt.label}</button>
                      {/each}
                    </div>
                    {#if f.followUp && notEmpty(values[f.metric_id])}
                      <textarea
                        class="mt-2 min-h-[40px] w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-blue-600 focus:outline-none disabled:opacity-50"
                        value={values[f.followUp.metric_id] ?? ''}
                        placeholder={f.followUp.placeholder}
                        disabled={isReadOnly}
                        oninput={(e) => onValueChange(f.followUp!.metric_id, 'text', (e.currentTarget as HTMLTextAreaElement).value)}
                        onblur={() => onValueChange(f.followUp!.metric_id, 'text', values[f.followUp!.metric_id], false)}
                      ></textarea>
                    {/if}
                  {:else if f.kind === 'yesno'}
                    {@const yes = values[f.metric_id] === true}
                    {@const no  = values[f.metric_id] === false}
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        class:border-red-600={yes}
                        class:bg-red-600={yes}
                        class:text-white={yes}
                        class:border-zinc-700={!yes}
                        class:bg-zinc-950={!yes}
                        class:text-zinc-300={!yes}
                        disabled={isReadOnly}
                        onclick={() => onValueChange(f.metric_id, 'boolean', yes ? null : true, false)}
                      >Yes</button>
                      <button
                        type="button"
                        class="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        class:border-emerald-600={no}
                        class:bg-emerald-600={no}
                        class:text-white={no}
                        class:border-zinc-700={!no}
                        class:bg-zinc-950={!no}
                        class:text-zinc-300={!no}
                        disabled={isReadOnly}
                        onclick={() => onValueChange(f.metric_id, 'boolean', no ? null : false, false)}
                      >No</button>
                    </div>
                    {#if f.followUp && values[f.metric_id] === true}
                      <textarea
                        class="mt-2 min-h-[40px] w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-red-600 focus:outline-none disabled:opacity-50"
                        value={values[f.followUp.metric_id] ?? ''}
                        placeholder={f.followUp.placeholder}
                        disabled={isReadOnly}
                        oninput={(e) => onValueChange(f.followUp!.metric_id, 'text', (e.currentTarget as HTMLTextAreaElement).value)}
                        onblur={() => onValueChange(f.followUp!.metric_id, 'text', values[f.followUp!.metric_id], false)}
                      ></textarea>
                    {/if}
                  {/if}
                </div>

                <!-- Save state -->
                {#if !isPair}
                  {@const ss = saveState[(f as any).metric_id]}
                  <div class="mt-1 min-h-[14px] text-[10px] text-zinc-500">
                    {#if ss === 'saving'}Saving…
                    {:else if ss === 'saved'}Saved
                    {:else if ss === 'error'}<span class="text-red-400">Save failed — {saveError[(f as any).metric_id]}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}

      <!-- ── Reserved PM Remark section ─────────────────────────────── -->
      <section class="mb-4 rounded-xl border border-zinc-800 bg-zinc-900">
        <header class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 text-[10px] text-zinc-600">○</span>
            <div>
              <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Section 9</div>
              <div class="text-sm font-semibold text-zinc-100">PM Remark</div>
            </div>
          </div>
          <div class="text-[10px] uppercase tracking-wider text-zinc-500">PM adds at sign-off</div>
        </header>
        <div class="px-4 py-6 text-center text-xs text-zinc-500">
          Reserved for PM. Submit your sections first — PM completes this at review.
        </div>
      </section>
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
            {sectionsCompleteCount} of {sectionsTotalCount} sections complete
          </div>
          <button
            class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            disabled={!canSubmit}
            onclick={submitReport}
          >
            {submitting ? 'Submitting…' : submissionStatus === 'SENT_BACK' ? 'Resubmit' : 'Submit for PM review'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
