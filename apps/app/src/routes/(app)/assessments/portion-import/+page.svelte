<script lang="ts">
  type LoadStats = {
    subject: string; university: string | null;
    units_created: number; units_existing: number;
    topics_created: number; topics_existing: number;
    sessions_created: number; sessions_existing: number;
  };
  type TabResult = {
    tab: string;
    status: 'loaded' | 'unmatched' | 'skipped' | 'error';
    detail?: string;
    modules?: number; topics?: number; sessions?: number;
    matched_subjects?: number;
    subjects?: LoadStats[];
  };
  type Result = { sheet_id: string; semester: number; dry_run: boolean; tabs: TabResult[] };

  let sheetUrl = $state('');
  let semester = $state(3);
  let busy = $state(false);
  let result = $state<Result | null>(null);
  let errorMsg = $state<string | null>(null);
  let lastWasPreview = $state(true);

  async function run(dryRun: boolean) {
    if (!sheetUrl.trim()) { errorMsg = 'Paste the portion sheet link first.'; return; }
    busy = true; errorMsg = null;
    if (dryRun) result = null;
    lastWasPreview = dryRun;
    try {
      const res = await fetch('/api/assessments/portion/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_url: sheetUrl.trim(), semester: Number(semester), dry_run: dryRun }),
      });
      const j = await res.json();
      if (!res.ok) { errorMsg = j.message || `HTTP ${res.status}`; return; }
      result = j;
    } catch (e: any) {
      errorMsg = e?.message || 'Request failed';
    } finally {
      busy = false;
    }
  }

  const statusColor = (s: string) =>
    s === 'loaded' ? 'text-emerald-300 border-emerald-800 bg-emerald-950/30'
    : s === 'unmatched' ? 'text-amber-300 border-amber-800 bg-amber-950/30'
    : s === 'error' ? 'text-red-300 border-red-800 bg-red-950/30'
    : 'text-zinc-400 border-zinc-800 bg-zinc-900';

  let totals = $derived.by(() => {
    if (!result) return null;
    let u = 0, t = 0, s = 0, matched = 0, unmatched = 0;
    for (const tab of result.tabs) {
      if (tab.status === 'unmatched') unmatched++;
      for (const sub of tab.subjects ?? []) { u += sub.units_created; t += sub.topics_created; s += sub.sessions_created; }
      if (tab.status === 'loaded') matched++;
    }
    return { u, t, s, matched, unmatched };
  });
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-5xl px-4 py-8">
    <div class="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Examinations</div>
    <h1 class="text-2xl font-semibold">Load Portion from Sheet</h1>
    <p class="mt-2 max-w-2xl text-sm text-zinc-400">
      Upload a portion workbook (one tab per subject with <span class="text-zinc-300">Module Number · Module Name · Topic · Session Name</span>).
      Each subject tab is matched by name + semester and its modules/topics/sessions are loaded into every university's copy of that subject.
      Re-running is safe — it only adds what's missing and never deletes questions.
    </p>

    <div class="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div class="flex flex-wrap items-end gap-4">
        <div class="flex-1 min-w-[280px]">
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="sheet">Portion sheet link</label>
          <input id="sheet" type="text" placeholder="https://docs.google.com/spreadsheets/d/…" bind:value={sheetUrl}
            class="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" />
        </div>
        <div>
          <label class="block text-[10px] uppercase tracking-[0.18em] text-zinc-500" for="sem">Semester</label>
          <input id="sem" type="number" min="1" max="8" bind:value={semester}
            class="mt-1 w-24 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" />
        </div>
        <button onclick={() => run(true)} disabled={busy}
          class="rounded-md border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          {busy && lastWasPreview ? 'Previewing…' : 'Preview'}
        </button>
        <button onclick={() => run(false)} disabled={busy || !result}
          class="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          title={!result ? 'Preview first' : 'Apply the import'}>
          {busy && !lastWasPreview ? 'Importing…' : 'Import'}
        </button>
      </div>
      <div class="mt-2 text-[11px] text-zinc-500">Tip: <strong>Preview</strong> first to see what will load, then <strong>Import</strong>. The sheet must be shared “Anyone with the link → Viewer”.</div>
      {#if errorMsg}<div class="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">{errorMsg}</div>{/if}
    </div>

    {#if result}
      <div class="mt-5 flex items-center gap-3">
        <span class="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider {result.dry_run ? 'bg-amber-900 text-amber-200' : 'bg-emerald-900 text-emerald-200'}">
          {result.dry_run ? 'Preview (nothing saved yet)' : 'Imported'}
        </span>
        {#if totals}
          <span class="text-xs text-zinc-400">
            {totals.matched} subject{totals.matched === 1 ? '' : 's'} matched ·
            <span class="text-zinc-200">{totals.u}</span> modules,
            <span class="text-zinc-200">{totals.t}</span> topics,
            <span class="text-zinc-200">{totals.s}</span> sessions {result.dry_run ? 'to add' : 'added'}
            {#if totals.unmatched > 0}· <span class="text-amber-300">{totals.unmatched} tab(s) unmatched</span>{/if}
          </span>
        {/if}
      </div>

      <div class="mt-3 space-y-3">
        {#each result.tabs as tab (tab.tab)}
          <section class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
              <div class="font-medium">{tab.tab}</div>
              <div class="flex items-center gap-2 text-[11px]">
                {#if tab.modules != null}<span class="text-zinc-500">{tab.modules} modules · {tab.topics} topics · {tab.sessions} sessions in sheet</span>{/if}
                <span class="rounded-md border px-2 py-0.5 font-semibold uppercase tracking-wider {statusColor(tab.status)}">{tab.status}</span>
              </div>
            </header>
            {#if tab.detail}
              <div class="px-4 py-2 text-xs text-zinc-400">{tab.detail}</div>
            {/if}
            {#if tab.subjects && tab.subjects.length > 0}
              <table class="w-full text-sm">
                <thead class="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                  <tr>
                    <th class="px-3 py-2 text-left">University</th>
                    <th class="px-3 py-2 text-right">Modules +</th>
                    <th class="px-3 py-2 text-right">Topics +</th>
                    <th class="px-3 py-2 text-right">Sessions +</th>
                    <th class="px-3 py-2 text-right text-zinc-600">Existing (u/t/s)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800">
                  {#each tab.subjects as s}
                    <tr>
                      <td class="px-3 py-2">{s.university ?? '—'} <span class="text-[10px] text-zinc-500">({s.subject})</span></td>
                      <td class="px-3 py-2 text-right tabular-nums text-emerald-300">{s.units_created}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-emerald-300">{s.topics_created}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-emerald-300">{s.sessions_created}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-zinc-500">{s.units_existing}/{s.topics_existing}/{s.sessions_existing}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </div>
</div>
