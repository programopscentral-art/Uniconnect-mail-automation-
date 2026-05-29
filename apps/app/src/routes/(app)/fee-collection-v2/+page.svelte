<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page, navigating } from '$app/stores';

  type Window = {
    id: string; name: string; sheet_id: string; status: string;
    batch_subsheets: string; dates_subsheet: string | null; dropout_subsheet: string | null;
    auto_sync_enabled: boolean; auto_sync_interval_minutes: number;
    last_synced_at: string | null; last_sync_error: string | null;
  };
  type Batch = { id: string; batch_start_year: number; semester_number: number; display_name: string; subsheet_name: string; student_count: number; };
  type PerBatch = { id: string; batch_start_year: number; semester_number: number; display_name: string; total: number; fully_paid: number; partial: number; yet_to_pay: number; dropouts: number; total_payable: number; total_paid: number; paid_from_fully: number; paid_from_partial: number; };
  type Coach = { coach: string; total: number; fully_paid: number; partial: number; yet_to_pay: number; };
  type UniDate = { university_id: string; university_name: string; fee_per_student: number | null; sem_last_date: string | null; collection_start_date: string | null; collection_end_date: string | null; next_sem_start_date: string | null; meta_remarks: string | null; };
  type Overview = {
    totals: { students: number; fully_paid: number; partial: number; yet_to_pay: number; dropouts: number; total_payable: number; total_paid: number; collection_pct: number; paid_from_fully: number; paid_from_partial: number; };
    per_batch: PerBatch[];
    tag_counts: Array<{ tag_case: string; c: number }>;
    success_coaches: Coach[];
    university_dates: UniDate[];
  };

  let { data } = $props<{ data: {
    windows: Window[];
    activeWindow: Window | null;
    batches: Batch[];
    overview: Overview | null;
    role: string;
    userIsAdmin: boolean;
  } }>();

  type Tab = 'overview' | 'batch' | 'custom';
  let tab = $state<Tab>('overview');
  let selectedBatchId = $state<string>('');
  let selectedUniversityId = $state<string>('');
  let students = $state<any[]>([]);
  let studentsLoading = $state(false);
  let studentSearch = $state('');
  let statusFilter = $state('');
  let tagFilter = $state('');

  // Per-batch settings drawer
  let showBatchSettings = $state(false);

  // Custom tab — multi-select batches to combine
  let customSelected = $state<Set<string>>(new Set());
  function toggleCustom(id: string) {
    const next = new Set(customSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    customSelected = next;
  }

  // Setup modal
  let showSetup = $state(false);
  let setupForm = $state({
    id: '', name: '', sheet_id: '',
    batch_subsheets: '', dates_subsheet: 'semester 3 dates', dropout_subsheet: 'dropout',
    auto_sync_enabled: true, auto_sync_interval_minutes: 5,
  });
  let savingSetup = $state(false);
  let setupError = $state<string | null>(null);

  // Tab-discovery state for the sheet-ID input
  type DiscoveredBatch = { name: string; gid: string; batch_start_year: number; semester_number: number; existing_windows: number };
  type Discovery = { total_tabs: number; batches: DiscoveredBatch[]; dates_tab: string | null; dropout_tab: string | null };
  let discovery = $state<Discovery | null>(null);
  let discoveryLoading = $state(false);
  let discoveryError = $state<string | null>(null);
  let discoveryDebounce: ReturnType<typeof setTimeout> | null = null;
  let showAdvanced = $state(false);

  function extractSheetId(raw: string): string {
    const s = raw.trim();
    // Already an ID (alphanum + -_)
    if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
    // Pasted full URL: docs.google.com/spreadsheets/d/<ID>/edit...
    const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : s;
  }

  async function runDiscovery() {
    const id = extractSheetId(setupForm.sheet_id);
    if (!id || id.length < 20) { discovery = null; discoveryError = null; return; }
    // If user pasted a URL, normalize the field to just the ID
    if (setupForm.sheet_id !== id) setupForm.sheet_id = id;
    discoveryLoading = true; discoveryError = null;
    try {
      const res = await fetch(`/api/fees2/discover-tabs?sheet_id=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (!res.ok) { discoveryError = j.message || `HTTP ${res.status}`; discovery = null; return; }
      discovery = j;
      // If the batch list is still empty in the form, auto-apply discovery results
      // so the user doesn't have to click "Use these" for the common case.
      if (j.batches.length > 0 && !setupForm.batch_subsheets.trim()) applyDiscovery();
    } catch (e: any) {
      discoveryError = e?.message || 'Discovery failed';
      discovery = null;
    } finally {
      discoveryLoading = false;
    }
  }

  function onSheetIdInput() {
    if (discoveryDebounce) clearTimeout(discoveryDebounce);
    discoveryDebounce = setTimeout(runDiscovery, 600);
  }

  function applyDiscovery() {
    if (!discovery) return;
    setupForm.batch_subsheets = discovery.batches.map(b => b.name).join('\n');
    if (discovery.dates_tab) setupForm.dates_subsheet = discovery.dates_tab;
    if (discovery.dropout_tab) setupForm.dropout_subsheet = discovery.dropout_tab;
    // Suggest a window name if empty — based on the highest semester in the batches.
    if (!setupForm.name.trim() && discovery.batches.length > 0) {
      const sems = discovery.batches.map(b => b.semester_number);
      const maxSem = Math.max(...sems);
      const year = new Date().getFullYear();
      setupForm.name = `NIAT Semester ${maxSem} · ${year}`;
    }
  }

  let syncing = $state(false);
  let syncResult = $state<any>(null);
  let toast = $state<{ text: string; tone: 'ok' | 'err' } | null>(null);
  function flash(text: string, tone: 'ok' | 'err' = 'ok') {
    toast = { text, tone };
    setTimeout(() => { toast = null; }, 3500);
  }

  function fmtMoney(n: number | null | undefined): string {
    if (!n && n !== 0) return '—';
    const v = Number(n);
    if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`;
    if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)}L`;
    if (v >= 1000)        return `₹${(v / 1000).toFixed(1)}k`;
    return `₹${v.toLocaleString('en-IN')}`;
  }
  function fmtPct(num: number, denom: number): string {
    if (!denom) return '—';
    return `${Math.round((num / denom) * 100)}%`;
  }

  async function onWindowChange(id: string) {
    const url = new URL($page.url);
    url.searchParams.set('window', id);
    await goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
  }

  async function triggerSync() {
    if (!data.activeWindow) return;
    syncing = true; syncResult = null;
    try {
      const res = await fetch(`/api/fees2/windows/${data.activeWindow.id}/sync`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) { flash(j.message || 'Sync failed', 'err'); return; }
      syncResult = j.summary;
      flash(`Sync done — ${j.summary.batch_periods_synced} batches · ${j.summary.students_upserted} students`, 'ok');
      await invalidateAll();
    } catch (e: any) { flash(e?.message || 'Sync failed', 'err'); }
    finally { syncing = false; }
  }

  let sendingSnapshot = $state(false);
  async function sendSnapshot() {
    if (!data.activeWindow) return;
    sendingSnapshot = true;
    try {
      const res = await fetch(`/api/fees2/windows/${data.activeWindow.id}/send-snapshot`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) { flash(j.message || 'Snapshot failed', 'err'); return; }
      const s = j.summary;
      flash(`Snapshot fired — sent to ${s.recipients_sent}, deduped ${s.recipients_deduped}${s.errors.length ? `, ${s.errors.length} errors` : ''}`, s.errors.length ? 'err' : 'ok');
    } catch (e: any) { flash(e?.message || 'Snapshot failed', 'err'); }
    finally { sendingSnapshot = false; }
  }

  function openCreateSetup() {
    setupForm = { id: '', name: '', sheet_id: '', batch_subsheets: '', dates_subsheet: 'semester 3 dates', dropout_subsheet: 'dropout', auto_sync_enabled: true, auto_sync_interval_minutes: 5 };
    setupError = null; showSetup = true;
    discovery = null; discoveryError = null; discoveryLoading = false;
    showAdvanced = false;
  }
  function openEditSetup(w: Window) {
    setupForm = {
      id: w.id, name: w.name, sheet_id: w.sheet_id,
      batch_subsheets: w.batch_subsheets, dates_subsheet: w.dates_subsheet || 'semester 3 dates',
      dropout_subsheet: w.dropout_subsheet || 'dropout',
      auto_sync_enabled: w.auto_sync_enabled, auto_sync_interval_minutes: w.auto_sync_interval_minutes,
    };
    setupError = null; showSetup = true;
    discovery = null; discoveryError = null; discoveryLoading = false;
    showAdvanced = true; // edit flow: surface the existing values
  }
  async function saveSetup() {
    if (!setupForm.sheet_id) { setupError = 'Paste the Google Sheet link or ID first'; return; }
    // Auto-name if user didn't bother — applyDiscovery already sets a suggested
    // name when batches are found, so this only fires when the sheet had no
    // recognizable batch tabs (rare).
    if (!setupForm.name.trim()) {
      setupForm.name = `Fee window · ${new Date().toISOString().slice(0, 10)}`;
    }
    savingSetup = true; setupError = null;
    try {
      const url = setupForm.id ? `/api/fees2/windows/${setupForm.id}` : '/api/fees2/windows';
      const res = await fetch(url, {
        method: setupForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupForm),
      });
      const j = await res.json();
      if (!res.ok) { setupError = j.message || `HTTP ${res.status}`; return; }
      flash(setupForm.id ? 'Window updated' : 'Window created', 'ok');
      showSetup = false;
      await invalidateAll();
      if (!setupForm.id && j.window?.id) onWindowChange(j.window.id);
    } catch (e: any) { setupError = e?.message || 'Save failed'; }
    finally { savingSetup = false; }
  }

  async function loadStudents() {
    if (!selectedBatchId) { students = []; return; }
    studentsLoading = true;
    try {
      const params = new URLSearchParams();
      if (selectedUniversityId) params.set('university_id', selectedUniversityId);
      if (statusFilter) params.set('status', statusFilter);
      if (tagFilter) params.set('tag', tagFilter);
      if (studentSearch.trim()) params.set('search', studentSearch.trim());
      const res = await fetch(`/api/fees2/batches/${selectedBatchId}/students?${params}`);
      if (res.ok) students = (await res.json()).students || [];
    } finally { studentsLoading = false; }
  }
  $effect(() => {
    // Re-load whenever filters or batch change
    selectedBatchId; selectedUniversityId; statusFilter; tagFilter;
    if (tab === 'batch') loadStudents();
  });

  async function setTagCase(studentId: string, newTag: string | null) {
    const res = await fetch(`/api/fees2/students/${studentId}/tag-case`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_case: newTag }),
    });
    if (!res.ok) { flash((await res.json()).message || 'Failed', 'err'); return; }
    // Optimistic local update
    students = students.map(s => s.id === studentId ? { ...s, tag_case: newTag } : s);
    flash(newTag ? `Tagged: ${newTag}` : 'Tag cleared', 'ok');
  }

  const TAG_CASES = [
    'Dropout', 'Will Pay', 'Wants to Drop', 'Hostel Caution Deposit Query',
    'Propelled Loan Case', 'Sales Team Dependency', 'Referral Amount Query',
    'Other', 'Payment Completed', 'Loan Applied', 'Yet to Apply for Loan',
    'UTR Verification Pending', 'Finance Team Dependency', 'Fee Waiver Request',
  ];

  let universitiesInBatch = $derived.by(() => {
    const m = new Map<string, string>();
    for (const s of students) {
      if (s.university_id) m.set(s.university_id, s.university_name);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  let activeBatch = $derived(data.batches.find(b => b.id === selectedBatchId) || null);
  let activeBatchPerBatch = $derived(data.overview?.per_batch?.find(b => b.id === selectedBatchId) || null);

  // Per-batch + per-university breakdown — grouped from loaded students
  let universityBreakdown = $derived.by(() => {
    type Row = { university_id: string; university_name: string; total: number; fully: number; partial: number; yet: number; payable: number; paid: number; };
    const map = new Map<string, Row>();
    for (const s of students) {
      const id = s.university_id || 'unknown';
      const r = map.get(id) || { university_id: id, university_name: s.university_name || '—', total: 0, fully: 0, partial: 0, yet: 0, payable: 0, paid: 0 };
      r.total++;
      if (s.status === 'Fully Paid') r.fully++;
      else if (s.status === 'Partially Paid') r.partial++;
      else r.yet++;
      r.payable += Number(s.payable || 0);
      r.paid += Number(s.paid || 0);
      map.set(id, r);
    }
    return Array.from(map.values()).sort((a, b) => b.payable - a.payable);
  });

  // Aggregated totals across the user's currently-selected batches (Custom tab)
  let customTotals = $derived.by(() => {
    if (!data.overview) return null;
    const rows = data.overview.per_batch.filter(b => customSelected.has(b.id));
    if (rows.length === 0) return null;
    return rows.reduce((acc, r) => ({
      students: acc.students + Number(r.total),
      fully_paid: acc.fully_paid + Number(r.fully_paid),
      partial: acc.partial + Number(r.partial),
      yet_to_pay: acc.yet_to_pay + Number(r.yet_to_pay),
      dropouts: acc.dropouts + Number(r.dropouts),
      total_payable: acc.total_payable + Number(r.total_payable),
      total_paid: acc.total_paid + Number(r.total_paid),
      batches: acc.batches + 1,
    }), { students: 0, fully_paid: 0, partial: 0, yet_to_pay: 0, dropouts: 0, total_payable: 0, total_paid: 0, batches: 0 });
  });

  function selectBatch(id: string) {
    selectedBatchId = id;
    selectedUniversityId = '';
    tab = 'batch';
  }

  // Auto-pick the first batch when switching to Batch tab without a selection
  $effect(() => {
    if (tab === 'batch' && !selectedBatchId && data.batches.length > 0) {
      selectedBatchId = data.batches[0].id;
    }
  });
</script>

{#if $navigating}
  <div class="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden">
    <div class="h-full w-1/3 animate-pulse bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]"></div>
  </div>
{/if}

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-7xl px-4 py-6">

    <!-- Header card -->
    <div class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Fee Collection</div>
          <div class="mt-1 text-lg font-semibold">
            {data.activeWindow ? data.activeWindow.name : 'No active semester window yet'}
          </div>
          {#if data.activeWindow?.last_synced_at}
            <div class="mt-0.5 text-xs text-zinc-400">
              Last synced: {new Date(data.activeWindow.last_synced_at).toLocaleString()}
              {#if data.activeWindow.last_sync_error}
                · <span class="text-red-400">{data.activeWindow.last_sync_error}</span>
              {/if}
            </div>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          {#if data.windows.length > 1}
            <select
              class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
              value={data.activeWindow?.id ?? ''}
              onchange={(e) => onWindowChange((e.currentTarget as HTMLSelectElement).value)}
            >
              {#each data.windows as w (w.id)}
                <option value={w.id}>{w.name}</option>
              {/each}
            </select>
          {/if}
          {#if data.activeWindow && data.userIsAdmin}
            <button class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => openEditSetup(data.activeWindow!)}>Edit setup</button>
            <button class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50" disabled={sendingSnapshot} onclick={sendSnapshot} title="Fire snapshot email to PM/COS/Admin + Pavan + central ops">
              {sendingSnapshot ? 'Sending…' : '✉ Send snapshot'}
            </button>
            <button class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50" disabled={syncing} onclick={triggerSync}>
              {syncing ? 'Syncing…' : '↻ Sync now'}
            </button>
          {/if}
          {#if data.userIsAdmin}
            <button class="rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/60" onclick={openCreateSetup}>+ New window</button>
          {/if}
        </div>
      </div>
    </div>

    {#if !data.activeWindow}
      <div class="rounded-2xl border border-amber-800 bg-amber-950/30 p-10 text-center">
        <div class="text-3xl">📋</div>
        <div class="mt-2 text-base font-semibold text-amber-200">No semester window set up yet</div>
        <div class="mt-1 text-xs text-amber-300/80">
          {#if data.userIsAdmin}
            Click <strong>+ New window</strong> above to register a Google Sheet for this semester period.
          {:else}
            Ask an admin to set up a semester window for fee collection.
          {/if}
        </div>
      </div>
    {:else}

      <!-- Top nav: Overview | one chip per batch | Custom -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <button
          class="rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors border
                 {tab === 'overview' ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'}"
          onclick={() => { tab = 'overview'; }}
        >Overview</button>

        {#each data.batches as b}
          <button
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border
                   {tab === 'batch' && selectedBatchId === b.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'}"
            onclick={() => selectBatch(b.id)}
            title={b.subsheet_name}
          >
            NIAT Batch {b.batch_start_year}
            <span class="ml-1 text-[10px] opacity-70">· Sem {b.semester_number}</span>
            {#if b.student_count > 0}
              <span class="ml-1 text-[10px] opacity-60">({b.student_count})</span>
            {/if}
          </button>
        {/each}

        {#if data.batches.length > 1}
          <button
            class="rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors border
                   {tab === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'}"
            onclick={() => { tab = 'custom'; }}
          >Custom</button>
        {/if}
      </div>

      {#if tab === 'overview' && data.overview}
        {@const ov = data.overview}
        <!-- Totals -->
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Students</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums">{ov.totals.students}</div>
          </div>
          <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Fully paid</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">{ov.totals.fully_paid}</div>
          </div>
          <div class="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Partial</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-amber-200">{ov.totals.partial}</div>
          </div>
          <div class="rounded-xl border border-red-900 bg-red-950/30 px-3 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-red-400">Yet to pay</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-red-200">{ov.totals.yet_to_pay}</div>
          </div>
          <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Dropouts</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-zinc-300">{ov.totals.dropouts}</div>
          </div>
          <div class="rounded-xl border border-blue-900 bg-blue-950/30 px-3 py-3" title={`${fmtMoney(ov.totals.paid_from_fully)} from fully paid · ${fmtMoney(ov.totals.paid_from_partial)} from partial`}>
            <div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">Collected</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-blue-200">{fmtMoney(ov.totals.total_paid)}</div>
            <div class="text-[11px] text-blue-300/80">of {fmtMoney(ov.totals.total_payable)}</div>
            <div class="mt-1 text-[10px] text-blue-300/70 leading-tight">
              {fmtMoney(ov.totals.paid_from_fully)} · fully<br/>
              {fmtMoney(ov.totals.paid_from_partial)} · partial
            </div>
          </div>
          <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Collection %</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">{ov.totals.collection_pct}%</div>
          </div>
        </div>

        <!-- Per-batch -->
        <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <header class="border-b border-zinc-800 px-4 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Per batch</div>
            <div class="text-sm font-semibold">All running batches in this window</div>
          </header>
          {#if ov.per_batch.length === 0}
            <div class="px-4 py-8 text-center text-sm text-zinc-500">No batches synced yet. Click "Sync now" to import.</div>
          {:else}
            <table class="w-full text-sm">
              <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th class="px-3 py-2.5 text-left font-medium">Batch · Semester</th>
                  <th class="px-3 py-2.5 text-right font-medium">Students</th>
                  <th class="px-3 py-2.5 text-right font-medium">Fully</th>
                  <th class="px-3 py-2.5 text-right font-medium">Partial</th>
                  <th class="px-3 py-2.5 text-right font-medium">Yet</th>
                  <th class="px-3 py-2.5 text-right font-medium">Dropout</th>
                  <th class="px-3 py-2.5 text-right font-medium">Payable</th>
                  <th class="px-3 py-2.5 text-right font-medium">Paid</th>
                  <th class="px-3 py-2.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each ov.per_batch as b (b.id)}
                  <tr class="cursor-pointer hover:bg-zinc-800/40" onclick={() => { tab = 'batch'; selectedBatchId = b.id; }}>
                    <td class="px-3 py-2.5 font-medium">{b.display_name}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{b.total}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-emerald-300">{b.fully_paid}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-amber-300">{b.partial}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-red-300">{b.yet_to_pay}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-zinc-400">{b.dropouts}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(Number(b.total_payable))}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(Number(b.total_paid))}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtPct(Number(b.total_paid), Number(b.total_payable))}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </section>

        <!-- Tag-case counts -->
        {#if ov.tag_counts.length > 0}
        <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <header class="border-b border-zinc-800 px-4 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Tag-case counts</div>
            <div class="text-sm font-semibold">Across the whole window</div>
          </header>
          <div class="flex flex-wrap gap-2 p-4">
            {#each ov.tag_counts as t}
              <span class="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs">
                <span class="text-zinc-400">{t.tag_case}</span>
                <span class="ml-2 font-semibold tabular-nums text-zinc-100">{t.c}</span>
              </span>
            {/each}
          </div>
        </section>
        {/if}

        <!-- Success coach roll-up -->
        {#if ov.success_coaches.length > 0}
        <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <header class="border-b border-zinc-800 px-4 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Success coaches</div>
            <div class="text-sm font-semibold">Payment counts per coach</div>
          </header>
          <table class="w-full text-sm">
            <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <tr>
                <th class="px-3 py-2.5 text-left">Coach</th>
                <th class="px-3 py-2.5 text-right">Total</th>
                <th class="px-3 py-2.5 text-right">Fully</th>
                <th class="px-3 py-2.5 text-right">Partial</th>
                <th class="px-3 py-2.5 text-right">Yet to Pay</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800">
              {#each ov.success_coaches as c}
                <tr>
                  <td class="px-3 py-2.5 font-medium">{c.coach}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums">{c.total}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-emerald-300">{c.fully_paid}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-amber-300">{c.partial}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-red-300">{c.yet_to_pay}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
        {/if}

        <!-- Semester dates per university -->
        {#if ov.university_dates.length > 0}
        <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <header class="border-b border-zinc-800 px-4 py-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Semester dates</div>
            <div class="text-sm font-semibold">From "{data.activeWindow.dates_subsheet}" sub-sheet</div>
          </header>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th class="px-3 py-2.5 text-left">University</th>
                  <th class="px-3 py-2.5 text-left">Sem 2 last</th>
                  <th class="px-3 py-2.5 text-left">Collection start</th>
                  <th class="px-3 py-2.5 text-left">Collection last</th>
                  <th class="px-3 py-2.5 text-left">Next sem start</th>
                  <th class="px-3 py-2.5 text-right">Fee amount</th>
                  <th class="px-3 py-2.5 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each ov.university_dates as d}
                  <tr>
                    <td class="px-3 py-2.5 font-medium">{d.university_name}</td>
                    <td class="px-3 py-2.5 text-zinc-400">{d.sem_last_date ?? '—'}</td>
                    <td class="px-3 py-2.5 text-zinc-400">{d.collection_start_date ?? '—'}</td>
                    <td class="px-3 py-2.5 text-zinc-400">{d.collection_end_date ?? '—'}</td>
                    <td class="px-3 py-2.5 text-zinc-400">{d.next_sem_start_date ?? '—'}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(d.fee_per_student)}</td>
                    <td class="px-3 py-2.5 text-zinc-400 max-w-xs truncate" title={d.meta_remarks ?? ''}>{d.meta_remarks ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
        {/if}

      {:else if tab === 'batch' && activeBatch}
        <!-- Batch header card: clearly labels which batch + semester we're viewing -->
        <section class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Viewing batch</div>
              <div class="mt-1 text-xl font-semibold">
                NIAT Batch {activeBatch.batch_start_year}
                <span class="ml-2 text-zinc-400 text-base font-normal">· Semester {activeBatch.semester_number}</span>
              </div>
              <div class="mt-1 text-xs text-zinc-500">Source sub-sheet: <span class="font-mono text-zinc-300">{activeBatch.subsheet_name}</span> · {activeBatch.student_count} students synced</div>
            </div>
            <div class="flex items-center gap-2">
              <button class="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => showBatchSettings = true} title="Per-batch settings">⚙ Settings</button>
            </div>
          </div>
          {#if activeBatchPerBatch}
            <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Students</div><div class="mt-1 text-xl font-semibold tabular-nums">{activeBatchPerBatch.total}</div></div>
              <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Fully paid</div><div class="mt-1 text-xl font-semibold tabular-nums text-emerald-200">{activeBatchPerBatch.fully_paid}</div></div>
              <div class="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Partial</div><div class="mt-1 text-xl font-semibold tabular-nums text-amber-200">{activeBatchPerBatch.partial}</div></div>
              <div class="rounded-xl border border-red-900 bg-red-950/30 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.18em] text-red-400">Yet to pay</div><div class="mt-1 text-xl font-semibold tabular-nums text-red-200">{activeBatchPerBatch.yet_to_pay}</div></div>
              <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Dropouts</div><div class="mt-1 text-xl font-semibold tabular-nums text-zinc-300">{activeBatchPerBatch.dropouts}</div></div>
              <div class="rounded-xl border border-blue-900 bg-blue-950/30 px-3 py-2.5" title={`${fmtMoney(Number(activeBatchPerBatch.paid_from_fully))} from fully paid · ${fmtMoney(Number(activeBatchPerBatch.paid_from_partial))} from partial`}>
                <div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">Collected</div>
                <div class="mt-1 text-xl font-semibold tabular-nums text-blue-200">{fmtMoney(Number(activeBatchPerBatch.total_paid))}</div>
                <div class="text-[11px] text-blue-300/80">of {fmtMoney(Number(activeBatchPerBatch.total_payable))}</div>
                <div class="mt-1 text-[10px] text-blue-300/70 leading-tight">{fmtMoney(Number(activeBatchPerBatch.paid_from_fully))} fully · {fmtMoney(Number(activeBatchPerBatch.paid_from_partial))} partial</div>
              </div>
              <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-2.5"><div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Collection %</div><div class="mt-1 text-xl font-semibold tabular-nums text-emerald-200">{fmtPct(Number(activeBatchPerBatch.total_paid), Number(activeBatchPerBatch.total_payable))}</div></div>
            </div>
          {/if}
        </section>

        <!-- University-wise breakdown for this batch -->
        {#if universityBreakdown.length > 0 && !selectedUniversityId}
          <section class="mb-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <header class="border-b border-zinc-800 px-4 py-3">
              <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">University-wise (within this batch · semester {activeBatch.semester_number})</div>
              <div class="text-sm font-semibold">Click a row to filter the student list to that university</div>
            </header>
            <table class="w-full text-sm">
              <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th class="px-3 py-2.5 text-left font-medium">University</th>
                  <th class="px-3 py-2.5 text-right font-medium">Students</th>
                  <th class="px-3 py-2.5 text-right font-medium text-emerald-400">Fully</th>
                  <th class="px-3 py-2.5 text-right font-medium text-amber-400">Partial</th>
                  <th class="px-3 py-2.5 text-right font-medium text-red-400">Yet</th>
                  <th class="px-3 py-2.5 text-right font-medium">Payable</th>
                  <th class="px-3 py-2.5 text-right font-medium">Collected</th>
                  <th class="px-3 py-2.5 text-right font-medium">Coll %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each universityBreakdown as u}
                  <tr class="cursor-pointer hover:bg-zinc-800/40" onclick={() => { selectedUniversityId = u.university_id; }}>
                    <td class="px-3 py-2.5 font-medium">{u.university_name}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{u.total}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-emerald-300">{u.fully}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-amber-300">{u.partial}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-red-300">{u.yet}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(u.payable)}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(u.paid)}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtPct(u.paid, u.payable)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}

        <!-- Filters + student list -->
        <div class="mb-3 flex flex-wrap items-end gap-3">
          {#if selectedUniversityId}
            <div>
              <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">University</label>
              <select class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={selectedUniversityId}>
                <option value="">All universities</option>
                {#each universitiesInBatch as u (u.id)}
                  <option value={u.id}>{u.name}</option>
                {/each}
              </select>
            </div>
          {/if}
          <div>
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">Status</label>
            <select class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={statusFilter}>
              <option value="">All</option>
              <option value="Fully Paid">Fully Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Yet To Pay">Yet To Pay</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">Tag</label>
            <select class="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={tagFilter}>
              <option value="">All</option>
              {#each TAG_CASES as t}<option value={t}>{t}</option>{/each}
            </select>
          </div>
          <div class="flex-1 min-w-[200px]">
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">Search</label>
            <input type="search" placeholder="Name or User ID…" class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={studentSearch} onkeydown={(e) => { if (e.key === 'Enter') loadStudents(); }} />
          </div>
        </div>

        {#if activeBatch}
          <div class="mb-3 text-xs text-zinc-500">
            Showing <strong class="text-zinc-200">{students.length}</strong> students
            {#if selectedUniversityId} · filtered to {universitiesInBatch.find(u => u.id === selectedUniversityId)?.name ?? ''}{/if}
            {#if statusFilter} · {statusFilter}{/if}
            {#if tagFilter} · {tagFilter}{/if}
          </div>
        {/if}

        {#if studentsLoading}
          <div class="rounded-2xl border border-zinc-800 bg-zinc-900 py-12 text-center text-sm text-zinc-500">Loading…</div>
        {:else if students.length === 0}
          <div class="rounded-2xl border border-zinc-800 bg-zinc-900 py-12 text-center text-sm text-zinc-500">No students match the filters.</div>
        {:else}
          <div class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <table class="w-full text-sm">
              <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th class="px-3 py-2.5 text-left">Student</th>
                  <th class="px-3 py-2.5 text-left">University</th>
                  <th class="px-3 py-2.5 text-right">Payable</th>
                  <th class="px-3 py-2.5 text-right">Paid</th>
                  <th class="px-3 py-2.5 text-right">Pending</th>
                  <th class="px-3 py-2.5 text-left">Status</th>
                  <th class="px-3 py-2.5 text-left">Tag case</th>
                  <th class="px-3 py-2.5 text-left">Success coach</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each students as s (s.id)}
                  <tr>
                    <td class="px-3 py-2.5">
                      <div class="font-medium truncate max-w-[200px]">{s.student_name ?? '—'}</div>
                      <div class="text-[10px] text-zinc-500 truncate max-w-[200px]" title={s.zoho_user_id}>{s.zoho_user_id}</div>
                    </td>
                    <td class="px-3 py-2.5 text-zinc-400">{s.university_name ?? '—'}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(Number(s.payable))}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-emerald-300">{fmtMoney(Number(s.paid))}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums {Number(s.pending) > 0 ? 'text-red-300 font-semibold' : 'text-zinc-500'}">{fmtMoney(Number(s.pending))}</td>
                    <td class="px-3 py-2.5">
                      <span class="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider
                        {s.status === 'Fully Paid' ? 'bg-emerald-900 text-emerald-200' : s.status === 'Partially Paid' ? 'bg-amber-900 text-amber-200' : 'bg-red-900 text-red-200'}">{s.status}</span>
                    </td>
                    <td class="px-3 py-2.5">
                      <select class="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 focus:border-blue-600 focus:outline-none" value={s.tag_case ?? ''} onchange={(e) => setTagCase(s.id, (e.currentTarget as HTMLSelectElement).value || null)}>
                        <option value="">—</option>
                        {#each TAG_CASES as t}<option value={t}>{t}</option>{/each}
                      </select>
                    </td>
                    <td class="px-3 py-2.5 text-zinc-400 truncate max-w-[160px]" title={s.success_coach_name ?? ''}>{s.success_coach_name ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

      {:else if tab === 'custom'}
        <!-- Custom: multi-select batches and see combined totals -->
        <section class="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Custom view</div>
          <div class="mt-1 text-sm font-semibold">Pick the batches you want to combine</div>
          <div class="mt-3 flex flex-wrap gap-2">
            {#each data.batches as b}
              <label class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors
                            {customSelected.has(b.id) ? 'bg-blue-900/40 border-blue-700 text-blue-100' : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}">
                <input type="checkbox" checked={customSelected.has(b.id)} onchange={() => toggleCustom(b.id)} class="accent-blue-500" />
                NIAT Batch {b.batch_start_year} · Sem {b.semester_number}
              </label>
            {/each}
          </div>
          {#if customSelected.size === 0}
            <div class="mt-3 text-[11px] text-zinc-500">Select two or more batches above to see combined totals.</div>
          {/if}
        </section>

        {#if customTotals}
          <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Batches</div><div class="mt-1 text-2xl font-semibold tabular-nums">{customTotals.batches}</div></div>
            <div class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Students</div><div class="mt-1 text-2xl font-semibold tabular-nums">{customTotals.students}</div></div>
            <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Fully paid</div><div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">{customTotals.fully_paid}</div></div>
            <div class="rounded-xl border border-amber-900 bg-amber-950/30 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-amber-400">Partial</div><div class="mt-1 text-2xl font-semibold tabular-nums text-amber-200">{customTotals.partial}</div></div>
            <div class="rounded-xl border border-red-900 bg-red-950/30 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-red-400">Yet to pay</div><div class="mt-1 text-2xl font-semibold tabular-nums text-red-200">{customTotals.yet_to_pay}</div></div>
            <div class="rounded-xl border border-blue-900 bg-blue-950/30 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-blue-400">Collected</div><div class="mt-1 text-2xl font-semibold tabular-nums text-blue-200">{fmtMoney(customTotals.total_paid)}</div><div class="text-[11px] text-blue-300/80">of {fmtMoney(customTotals.total_payable)}</div></div>
            <div class="rounded-xl border border-emerald-900 bg-emerald-950/30 px-3 py-3"><div class="text-[10px] uppercase tracking-[0.18em] text-emerald-400">Collection %</div><div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-200">{fmtPct(customTotals.total_paid, customTotals.total_payable)}</div></div>
          </div>

          <section class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <header class="border-b border-zinc-800 px-4 py-3">
              <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Per batch</div>
              <div class="text-sm font-semibold">Selected batches breakdown</div>
            </header>
            <table class="w-full text-sm">
              <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                <tr>
                  <th class="px-3 py-2.5 text-left">Batch · Semester</th>
                  <th class="px-3 py-2.5 text-right">Students</th>
                  <th class="px-3 py-2.5 text-right text-emerald-400">Fully</th>
                  <th class="px-3 py-2.5 text-right text-amber-400">Partial</th>
                  <th class="px-3 py-2.5 text-right text-red-400">Yet</th>
                  <th class="px-3 py-2.5 text-right">Payable</th>
                  <th class="px-3 py-2.5 text-right">Collected</th>
                  <th class="px-3 py-2.5 text-right">Coll %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each (data.overview?.per_batch || []).filter(b => customSelected.has(b.id)) as b}
                  <tr class="cursor-pointer hover:bg-zinc-800/40" onclick={() => selectBatch(b.id)}>
                    <td class="px-3 py-2.5 font-medium">{b.display_name}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{b.total}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-emerald-300">{b.fully_paid}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-amber-300">{b.partial}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums text-red-300">{b.yet_to_pay}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(Number(b.total_payable))}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtMoney(Number(b.total_paid))}</td>
                    <td class="px-3 py-2.5 text-right tabular-nums">{fmtPct(Number(b.total_paid), Number(b.total_payable))}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<!-- Per-batch settings drawer -->
{#if showBatchSettings && activeBatch && data.activeWindow}
  <div class="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60 backdrop-blur-sm" onclick={() => showBatchSettings = false} role="presentation">
    <aside class="w-full max-w-md border-l border-zinc-800 bg-zinc-900 p-6 overflow-y-auto" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="mb-4 flex items-start justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Batch settings</div>
          <div class="mt-1 text-lg font-semibold">NIAT Batch {activeBatch.batch_start_year} · Semester {activeBatch.semester_number}</div>
        </div>
        <button class="text-zinc-400 hover:text-zinc-100" onclick={() => showBatchSettings = false}>✕</button>
      </div>

      <div class="space-y-3 text-sm">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Display name</div>
          <div class="mt-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">{activeBatch.display_name}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Linked sub-sheet</div>
          <div class="mt-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono">{activeBatch.subsheet_name}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Students synced</div>
          <div class="mt-1 text-sm">{activeBatch.student_count}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Source sheet</div>
          <a href={`https://docs.google.com/spreadsheets/d/${data.activeWindow.sheet_id}/edit`} target="_blank" rel="noopener" class="mt-1 inline-block text-sm text-blue-300 hover:underline">Open Google Sheet ↗</a>
        </div>
        {#if data.activeWindow.last_synced_at}
          <div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Window last synced</div>
            <div class="mt-1 text-sm text-zinc-300">{new Date(data.activeWindow.last_synced_at).toLocaleString()}</div>
          </div>
        {/if}

        {#if data.userIsAdmin}
          <div class="border-t border-zinc-800 pt-3">
            <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Window-level settings</div>
            <p class="mt-1 text-[11px] text-zinc-500">Batch display names and the linked sheet are inherited from the window. To rename or change the sheet, edit the window.</p>
            <button class="mt-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => { showBatchSettings = false; openEditSetup(data.activeWindow!); }}>Edit window setup</button>
          </div>
        {/if}
      </div>
    </aside>
  </div>
{/if}

<!-- Toast -->
{#if toast}
  <div class="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2 text-sm font-medium shadow-lg
              {toast.tone === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}">
    {toast.text}
  </div>
{/if}

<!-- Setup modal -->
{#if showSetup}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onclick={() => showSetup = false} role="presentation">
    <div class="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="mb-4 flex items-start justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Fee Collection</div>
          <div class="mt-1 text-lg font-semibold">{setupForm.id ? 'Edit semester window' : 'New semester window'}</div>
        </div>
        <button class="text-zinc-400 hover:text-zinc-100" onclick={() => showSetup = false}>✕</button>
      </div>
      <div class="space-y-4">
        <!-- PRIMARY: sheet ID / URL — this is all the user usually needs to fill -->
        <div>
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="setup-sheet">Google Sheet link or ID</label>
          <input id="setup-sheet" type="text" placeholder="paste the Google Sheet link or ID — batches will be detected automatically" class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-mono focus:border-blue-600 focus:outline-none" bind:value={setupForm.sheet_id} oninput={onSheetIdInput} />
          <div class="mt-1 text-[10px] text-zinc-500">The sheet must be shared as "Anyone with the link → Viewer".</div>
        </div>

        {#if discoveryLoading}
          <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">Scanning sheet for batches…</div>
        {/if}
        {#if discoveryError}
          <div class="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">{discoveryError}</div>
        {/if}

        {#if discovery && !discoveryLoading}
          <div class="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-[12px] text-zinc-300">
            <div class="font-semibold text-zinc-100">
              {discovery.batches.length === 0
                ? 'No batch tabs found in this sheet'
                : `Detected ${discovery.batches.length} batch${discovery.batches.length === 1 ? '' : 'es'} from the sheet`}
            </div>
            {#if discovery.batches.length > 0}
              <ul class="mt-2 space-y-1">
                {#each discovery.batches as b}
                  <li class="flex items-center justify-between font-mono text-[11px]">
                    <span class="text-zinc-200">{b.name}</span>
                    {#if b.existing_windows > 0}
                      <span class="text-[10px] text-emerald-300">continuing — already tracked in {b.existing_windows} prior window{b.existing_windows === 1 ? '' : 's'}</span>
                    {:else}
                      <span class="text-[10px] text-zinc-500">new batch</span>
                    {/if}
                  </li>
                {/each}
              </ul>
              <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                <span>dates sub-sheet: <span class="font-mono text-zinc-300">{discovery.dates_tab || setupForm.dates_subsheet}</span></span>
                <span>dropout sub-sheet: <span class="font-mono text-zinc-300">{discovery.dropout_tab || setupForm.dropout_subsheet}</span></span>
              </div>
            {/if}
          </div>

          <!-- Auto-suggested name — editable inline -->
          <div>
            <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="setup-name">Window name <span class="text-zinc-600 normal-case tracking-normal">(auto-suggested, edit if you want)</span></label>
            <input id="setup-name" type="text" placeholder="e.g. NIAT Semester 5 · 2026" class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={setupForm.name} />
          </div>
        {/if}

        <!-- Advanced — only visible when the user opts in -->
        <button type="button" class="text-[10px] uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300" onclick={() => showAdvanced = !showAdvanced}>
          {showAdvanced ? '▾' : '▸'} Advanced options
        </button>

        {#if showAdvanced}
          <div class="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <div>
              <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="setup-batch-subs">Batch sub-sheets (one per line)</label>
              <textarea id="setup-batch-subs" rows="3" placeholder="auto-filled from sheet — override only if you want to limit which batches are synced" class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none" bind:value={setupForm.batch_subsheets}></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="setup-dates">Dates sub-sheet name</label>
                <input id="setup-dates" type="text" class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={setupForm.dates_subsheet} />
              </div>
              <div>
                <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="setup-dropout">Dropout sub-sheet name</label>
                <input id="setup-dropout" type="text" class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" bind:value={setupForm.dropout_subsheet} />
              </div>
            </div>
            <label class="flex items-center gap-2 text-xs text-zinc-200">
              <input type="checkbox" bind:checked={setupForm.auto_sync_enabled} class="accent-blue-500" />
              Auto-sync every
              <select class="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs" bind:value={setupForm.auto_sync_interval_minutes}>
                <option value={5}>5 minutes (recommended)</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
              </select>
            </label>
          </div>
        {/if}

        {#if setupError}
          <div class="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">{setupError}</div>
        {/if}
        <div class="flex justify-end gap-2 pt-2">
          <button class="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800" onclick={() => showSetup = false}>Cancel</button>
          <button class="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:bg-zinc-700" disabled={savingSetup || (!setupForm.id && !setupForm.sheet_id)} onclick={saveSetup}>{savingSetup ? 'Saving…' : (setupForm.id ? 'Save changes' : 'Create window')}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
