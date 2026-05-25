<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props<{ data: { campuses: Array<{ campus_id: string; code: string; display_name: string }>; today: string; role: string } }>();

  type ValueType = 'numeric' | 'text';
  type Field = { metric_id: string; label: string; type: ValueType; required: boolean; options?: string[]; placeholder?: string };
  type Section = { code: string; title: string; fields: Field[] };

  // V1 form schema — hardcoded. Field list matches metric_dim seeds in migration 0090.
  const SECTIONS: Section[] = [
    {
      code: 'attendance', title: 'Attendance Heartbeat',
      fields: [
        { metric_id: 'daily.attendance.total_enrolled', label: 'Total enrolled', type: 'numeric', required: true },
        { metric_id: 'daily.attendance.present', label: 'Present', type: 'numeric', required: true },
        { metric_id: 'daily.attendance.absent_authorized', label: 'Absent (authorized)', type: 'numeric', required: true },
        { metric_id: 'daily.attendance.absent_unauthorized', label: 'Absent (unauthorized)', type: 'numeric', required: true },
      ],
    },
    {
      code: 'academic', title: 'Academic Delivery',
      fields: [
        { metric_id: 'daily.academic.sessions_scheduled', label: 'Sessions scheduled', type: 'numeric', required: true },
        { metric_id: 'daily.academic.sessions_conducted', label: 'Sessions conducted', type: 'numeric', required: true },
        { metric_id: 'daily.academic.cancellation_notes', label: 'Cancellation notes (if any)', type: 'text', required: false, placeholder: 'Reason + session count' },
      ],
    },
    {
      code: 'faculty', title: 'Faculty Status',
      fields: [
        { metric_id: 'daily.faculty.expected', label: 'Faculty expected', type: 'numeric', required: true },
        { metric_id: 'daily.faculty.present', label: 'Faculty present', type: 'numeric', required: true },
        { metric_id: 'daily.faculty.substitution_notes', label: 'Substitution notes', type: 'text', required: false },
      ],
    },
    {
      code: 'infra', title: 'Infrastructure Check',
      fields: [
        { metric_id: 'daily.infra.power_status', label: 'Power', type: 'text', required: true, options: ['normal', 'outage_brief', 'outage_extended', 'unstable'] },
        { metric_id: 'daily.infra.water_status', label: 'Water', type: 'text', required: true, options: ['normal', 'intermittent', 'unavailable'] },
        { metric_id: 'daily.infra.connectivity_status', label: 'Connectivity', type: 'text', required: true, options: ['normal', 'degraded', 'down'] },
        { metric_id: 'daily.infra.open_issues', label: 'Open infrastructure issues', type: 'text', required: false, placeholder: 'One per line' },
      ],
    },
    {
      code: 'student_ops', title: 'Student-Facing Operations',
      fields: [
        { metric_id: 'daily.student_ops.mess_status', label: 'Mess', type: 'text', required: true, options: ['served', 'delayed', 'not_served'] },
        { metric_id: 'daily.student_ops.transport_status', label: 'Transport', type: 'text', required: true, options: ['normal', 'delayed', 'partial', 'unavailable'] },
        { metric_id: 'daily.student_ops.other_notes', label: 'Other notes', type: 'text', required: false },
      ],
    },
    {
      code: 'incidents', title: 'Incidents & Safety',
      fields: [
        { metric_id: 'daily.incidents.count', label: 'Incidents today', type: 'numeric', required: true },
        { metric_id: 'daily.incidents.summary', label: 'Incident summary (required if count > 0)', type: 'text', required: false, placeholder: 'Type, severity, action taken' },
      ],
    },
    {
      code: 'remark', title: 'BOA Remark',
      fields: [
        { metric_id: 'daily.remark.boa', label: 'Any additional context for PM review', type: 'text', required: false },
      ],
    },
  ];

  // ─── State ─────────────────────────────────────────────────────────────

  let selectedCampusId = $state(data.campuses[0]?.campus_id ?? '');
  let submissionId = $state<string | null>(null);
  let submissionStatus = $state<string>('');
  let sentBackReasonCode = $state<string | null>(null);
  let sentBackReasonText = $state<string | null>(null);
  let pmRemark = $state<string | null>(null);

  // Per-field state
  let values = $state<Record<string, string | number | null>>({});
  let saveState = $state<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  let saveError = $state<Record<string, string | null>>({});

  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);

  // Retraction window state — populated from submission.submitted_at
  let submittedAtMs = $state<number | null>(null);
  let nowMs = $state(Date.now());
  let retracting = $state(false);
  let retractError = $state<string | null>(null);
  const RETRACTION_WINDOW_MS = 30 * 60 * 1000;

  // Debounce timers per metric_id
  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  onMount(() => {
    if (selectedCampusId) ensureDraft();
    // Tick nowMs every 30s so the retract window countdown stays current
    // without being jittery. Granularity matches the 30-min window.
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
      // Idempotent create-or-find for today's DAILY draft
      const idempotency_key = `boa.draft.${selectedCampusId}.${data.today}`;
      const res = await fetch('/api/ops-os/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campus_id: selectedCampusId,
          cadence: 'DAILY',
          period_start: data.today,
          period_end: data.today,
          idempotency_key,
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

      // Load existing values
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

  // ─── Autosave ──────────────────────────────────────────────────────────

  function onFieldInput(metric_id: string, type: ValueType, raw: string) {
    values[metric_id] = type === 'numeric' ? (raw === '' ? null : Number(raw)) : raw;
    clearTimeout(debounceTimers[metric_id]);
    debounceTimers[metric_id] = setTimeout(() => saveField(metric_id, type), 700);
  }

  function onFieldBlur(metric_id: string, type: ValueType) {
    clearTimeout(debounceTimers[metric_id]);
    saveField(metric_id, type);
  }

  async function saveField(metric_id: string, type: ValueType) {
    if (!submissionId) return;
    if (isLocked) return;
    const val = values[metric_id];
    saveState[metric_id] = 'saving';
    saveError[metric_id] = null;
    try {
      const idempotency_key = `boa.save.${submissionId}.${metric_id}.${Date.now()}`;
      const res = await fetch(
        `/api/ops-os/submissions/${submissionId}/values/${encodeURIComponent(metric_id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val, value_type: type, idempotency_key }),
        },
      );
      if (!res.ok) {
        saveState[metric_id] = 'error';
        saveError[metric_id] = (await res.text()) || `HTTP ${res.status}`;
        return;
      }
      saveState[metric_id] = 'saved';
      // Bump status from NEW to DRAFT locally
      if (submissionStatus === 'NEW') submissionStatus = 'DRAFT';
      // Clear "saved" indicator after 4s
      setTimeout(() => {
        if (saveState[metric_id] === 'saved') saveState[metric_id] = 'idle';
      }, 4000);
    } catch (e) {
      saveState[metric_id] = 'error';
      saveError[metric_id] = (e as Error).message;
    }
  }

  // ─── Submit ────────────────────────────────────────────────────────────

  let missingRequired = $derived.by(() => {
    const missing: string[] = [];
    for (const section of SECTIONS) {
      for (const f of section.fields) {
        if (!f.required) continue;
        const v = values[f.metric_id];
        if (v === null || v === undefined || v === '') missing.push(f.label);
      }
    }
    // Cross-field: incidents.count > 0 → summary required
    const ct = Number(values['daily.incidents.count'] ?? 0);
    const sm = String(values['daily.incidents.summary'] ?? '').trim();
    if (ct > 0 && sm.length === 0) missing.push('Incident summary (count > 0)');
    return missing;
  });

  let canSubmit = $derived(
    !!submissionId &&
    !submitting &&
    !isLocked &&
    submissionStatus !== 'SUBMITTED' &&
    submissionStatus !== 'SIGNED_OFF' &&
    missingRequired.length === 0,
  );

  let isLocked = $derived(submissionStatus === 'LOCKED' || submissionStatus === 'SIGNED_OFF');

  async function submitReport() {
    if (!submissionId || !canSubmit) return;
    submitting = true;
    submitError = null;
    try {
      const idempotency_key = `boa.submit.${submissionId}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submissionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // ─── Retract ───────────────────────────────────────────────────────────
  // Move SUBMITTED → DRAFT within the 30-min window, before PM acts.

  let retractRemainingMs = $derived(
    submittedAtMs !== null ? (submittedAtMs + RETRACTION_WINDOW_MS) - nowMs : 0,
  );
  let canRetract = $derived(
    submissionStatus === 'SUBMITTED' && retractRemainingMs > 0 && !retracting,
  );

  function fmtMmSs(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${String(r).padStart(2, '0')}s`;
  }

  async function retractReport() {
    if (!submissionId || !canRetract) return;
    retracting = true;
    retractError = null;
    try {
      const idempotency_key = `boa.retract.${submissionId}.${Date.now()}`;
      const res = await fetch(`/api/ops-os/submissions/${submissionId}/retract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Section progress for the strip at top
  function sectionProgress(section: Section): number {
    const required = section.fields.filter(f => f.required);
    if (required.length === 0) return 100;
    const filled = required.filter(f => {
      const v = values[f.metric_id];
      return v !== null && v !== undefined && v !== '';
    });
    return Math.round((filled.length / required.length) * 100);
  }
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
  <div class="mx-auto max-w-3xl px-4 py-6">
    <!-- Header -->
    <div class="mb-6">
      <div class="text-xs uppercase tracking-wider text-gray-500">Daily report</div>
      <h1 class="mt-1 text-xl font-semibold text-gray-100">{data.today}</h1>
    </div>

    <!-- Campus selector -->
    {#if data.campuses.length === 0}
      <div class="rounded border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-200">
        No campuses assigned. Contact your PM to request access.
      </div>
    {:else}
      <div class="mb-4">
        <label class="block text-xs uppercase tracking-wider text-gray-500" for="campus-select">Campus</label>
        <select
          id="campus-select"
          class="mt-1 w-full rounded border border-gray-800 bg-gray-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          bind:value={selectedCampusId}
          disabled={data.campuses.length === 1}
        >
          {#each data.campuses as c (c.campus_id)}
            <option value={c.campus_id}>{c.display_name}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if loading}
      <div class="py-12 text-center text-sm text-gray-500">Loading draft…</div>
    {:else if loadError}
      <div class="rounded border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
        {loadError}
      </div>
    {:else if submissionId}
      <!-- Status banner -->
      <div class="mb-4 rounded border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-xs uppercase tracking-wider text-gray-500">Status</span>
            <span class="ml-2 font-medium">{submissionStatus}</span>
          </div>
        </div>
        {#if submissionStatus === 'SENT_BACK' && sentBackReasonCode}
          <div class="mt-2 border-t border-gray-800 pt-2 text-amber-300">
            <div class="text-xs uppercase tracking-wider text-amber-500">Returned for correction</div>
            <div class="mt-1">Reason: {sentBackReasonCode}{sentBackReasonText ? ` — ${sentBackReasonText}` : ''}</div>
          </div>
        {/if}
        {#if (submissionStatus === 'SIGNED_OFF' || submissionStatus === 'LOCKED') && pmRemark}
          <div class="mt-2 border-t border-gray-800 pt-2 text-emerald-300">
            <div class="text-xs uppercase tracking-wider text-emerald-500">PM remark</div>
            <div class="mt-1">{pmRemark}</div>
          </div>
        {/if}
      </div>

      <!-- Section progress strip -->
      <div class="mb-4 grid grid-cols-7 gap-1">
        {#each SECTIONS as section (section.code)}
          {@const pct = sectionProgress(section)}
          <div
            class="h-1 rounded"
            class:bg-emerald-600={pct === 100}
            class:bg-amber-600={pct > 0 && pct < 100}
            class:bg-gray-800={pct === 0}
            title="{section.title}: {pct}%"
          ></div>
        {/each}
      </div>

      <!-- Sections -->
      {#each SECTIONS as section (section.code)}
        <section class="mb-6 rounded border border-gray-800 bg-gray-900">
          <header class="border-b border-gray-800 px-4 py-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-gray-100">{section.title}</h2>
              <span class="text-xs text-gray-500">{sectionProgress(section)}%</span>
            </div>
          </header>
          <div class="space-y-3 px-4 py-4">
            {#each section.fields as f (f.metric_id)}
              <div>
                <label class="block text-xs uppercase tracking-wider text-gray-500" for={f.metric_id}>
                  {f.label}{#if f.required}<span class="ml-1 text-red-400">*</span>{/if}
                </label>
                <div class="mt-1 flex items-center gap-2">
                  {#if f.options}
                    <select
                      id={f.metric_id}
                      class="w-full rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none disabled:opacity-50"
                      value={values[f.metric_id] ?? ''}
                      disabled={isLocked || submissionStatus === 'SUBMITTED'}
                      oninput={(e) => onFieldInput(f.metric_id, f.type, (e.currentTarget as HTMLSelectElement).value)}
                      onblur={() => onFieldBlur(f.metric_id, f.type)}
                    >
                      <option value="">—</option>
                      {#each f.options as opt (opt)}
                        <option value={opt}>{opt}</option>
                      {/each}
                    </select>
                  {:else if f.type === 'numeric'}
                    <input
                      id={f.metric_id}
                      type="number"
                      inputmode="numeric"
                      class="w-full rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none disabled:opacity-50"
                      value={values[f.metric_id] ?? ''}
                      placeholder={f.placeholder ?? ''}
                      disabled={isLocked || submissionStatus === 'SUBMITTED'}
                      oninput={(e) => onFieldInput(f.metric_id, f.type, (e.currentTarget as HTMLInputElement).value)}
                      onblur={() => onFieldBlur(f.metric_id, f.type)}
                    />
                  {:else}
                    <textarea
                      id={f.metric_id}
                      class="min-h-[44px] w-full rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none disabled:opacity-50"
                      value={values[f.metric_id] ?? ''}
                      placeholder={f.placeholder ?? ''}
                      disabled={isLocked || submissionStatus === 'SUBMITTED'}
                      oninput={(e) => onFieldInput(f.metric_id, f.type, (e.currentTarget as HTMLTextAreaElement).value)}
                      onblur={() => onFieldBlur(f.metric_id, f.type)}
                    ></textarea>
                  {/if}
                </div>
                <div class="mt-1 min-h-[16px] text-[11px] text-gray-500">
                  {#if saveState[f.metric_id] === 'saving'}Saving…
                  {:else if saveState[f.metric_id] === 'saved'}Saved
                  {:else if saveState[f.metric_id] === 'error'}<span class="text-red-400">Save failed — {saveError[f.metric_id]}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}

      <!-- Submit bar -->
      {#if !isLocked && submissionStatus !== 'SUBMITTED'}
        <div class="sticky bottom-0 -mx-4 border-t border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur">
          {#if missingRequired.length > 0}
            <div class="mb-2 text-xs text-amber-400">
              Missing required: {missingRequired.slice(0, 3).join(', ')}{missingRequired.length > 3 ? ` (+${missingRequired.length - 3} more)` : ''}
            </div>
          {/if}
          {#if submitError}
            <div class="mb-2 text-xs text-red-400">{submitError}</div>
          {/if}
          <button
            class="w-full rounded bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
            disabled={!canSubmit}
            onclick={submitReport}
          >
            {submitting ? 'Submitting…' : submissionStatus === 'SENT_BACK' ? 'Resubmit' : 'Submit for PM review'}
          </button>
        </div>
      {:else if submissionStatus === 'SUBMITTED'}
        <div class="rounded border border-blue-800 bg-blue-950/30 px-4 py-3 text-sm text-blue-200">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div>Submitted. Awaiting PM review.</div>
              {#if canRetract}
                <div class="mt-1 text-xs text-blue-300/80">
                  You can retract this for edits within {fmtMmSs(retractRemainingMs)}, while PM hasn't started review.
                </div>
              {:else if submittedAtMs !== null && retractRemainingMs <= 0}
                <div class="mt-1 text-xs text-blue-300/60">
                  Retraction window closed. Ask PM to send back if you need to edit.
                </div>
              {/if}
            </div>
            {#if canRetract}
              <button
                type="button"
                class="shrink-0 rounded border border-blue-700 bg-blue-900/50 px-3 py-1.5 text-xs font-medium text-blue-100 hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={retracting}
                onclick={retractReport}
              >
                {retracting ? 'Retracting…' : 'Retract'}
              </button>
            {/if}
          </div>
          {#if retractError}
            <div class="mt-2 border-t border-blue-900 pt-2 text-xs text-red-300">
              {retractError}
            </div>
          {/if}
        </div>
      {:else if submissionStatus === 'SIGNED_OFF'}
        <div class="rounded border border-emerald-800 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          Signed off. Awaiting end-of-day lock.
        </div>
      {:else if submissionStatus === 'LOCKED'}
        <div class="rounded border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-400">
          Locked. Read-only.
        </div>
      {/if}
    {/if}
  </div>
</div>
