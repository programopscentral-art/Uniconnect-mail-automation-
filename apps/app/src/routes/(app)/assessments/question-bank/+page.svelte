<script lang="ts">
  let { data } = $props();

  let scope = $state<"UNIVERSITY" | "GLOBAL">("UNIVERSITY");
  let universityId = $state<string>(data.universities?.[0]?.id || "");
  let file = $state<File | null>(null);
  let busy = $state(false);
  let result = $state<any>(null);
  let err = $state("");

  const onFile = (e: Event) => {
    const t = e.target as HTMLInputElement;
    file = t.files?.[0] || null;
    result = null;
    err = "";
  };

  async function upload() {
    if (!file) { err = "Choose a spreadsheet first."; return; }
    if (scope === "UNIVERSITY" && !universityId) { err = "Pick a university."; return; }
    busy = true; err = ""; result = null;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("scope", scope);
    if (universityId) fd.append("universityId", universityId);

    try {
      const res = await fetch("/api/assessments/questions/upload-bulk", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { err = body?.message || "Upload failed."; return; }
      result = body;
    } catch (e: any) {
      err = e?.message || "Upload failed.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 sm:p-10">
  <div class="max-w-3xl mx-auto space-y-8">
    <div>
      <a
        href="/assessments"
        class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] hover:underline"
        >← Examinations</a
      >
      <h1
        class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase mt-2"
      >
        Upload Question Bank
      </h1>
      <p class="text-sm text-gray-500 dark:text-slate-400 mt-2 max-w-xl">
        Load questions for many subjects at once. Each row is matched to a subject
        by its <strong>Subject</strong> column; missing subjects and units are created
        automatically.
      </p>
    </div>

    <!-- Scope -->
    <div
      class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-6 shadow-sm space-y-5"
    >
      <div>
        <p
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3"
        >
          Level
        </p>
        <div class="grid sm:grid-cols-2 gap-3">
          <button
            onclick={() => (scope = "UNIVERSITY")}
            class="text-left p-4 rounded-2xl border transition-all {scope === 'UNIVERSITY'
              ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
              : 'border-gray-200 dark:border-slate-800 hover:border-indigo-300'}"
          >
            <p class="font-black text-gray-900 dark:text-white text-sm">
              University Level
            </p>
            <p class="text-[11px] text-gray-500 mt-1">
              One university. Sheet needs a <strong>Subject</strong> column.
            </p>
          </button>
          <button
            onclick={() => (scope = "GLOBAL")}
            disabled={!data.canGlobal}
            class="text-left p-4 rounded-2xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed {scope === 'GLOBAL'
              ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
              : 'border-gray-200 dark:border-slate-800 hover:border-indigo-300'}"
          >
            <p class="font-black text-gray-900 dark:text-white text-sm">
              Global Level
            </p>
            <p class="text-[11px] text-gray-500 mt-1">
              Many universities. Sheet also needs a
              <strong>University</strong> column.
            </p>
          </button>
        </div>
      </div>

      <label class="block">
        <span
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
          >{scope === "GLOBAL" ? "Fallback university (rows with no University column)" : "University"}</span
        >
        <select
          bind:value={universityId}
          class="mt-1.5 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
        >
          {#each data.universities as u}
            <option value={u.id}>{u.name}</option>
          {/each}
        </select>
      </label>

      <label class="block">
        <span
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
          >Spreadsheet (.xlsx / .xls)</span
        >
        <input
          type="file"
          accept=".xlsx,.xls"
          onchange={onFile}
          class="mt-1.5 w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-indigo-600 file:text-white file:text-xs file:font-black file:uppercase file:tracking-widest"
        />
      </label>

      <div
        class="text-[11px] text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/40 rounded-xl p-4 leading-relaxed"
      >
        <span class="font-black uppercase tracking-widest text-[9px] text-gray-400"
          >Expected columns</span
        >
        <p class="mt-1.5">
          <strong>Subject</strong>{#if scope === "GLOBAL"}, <strong>University</strong>{/if},
          <strong>Unit</strong>, Topic, Question, Marks, CO, Bloom, Answer, and
          Option A–D for MCQs. Extra columns are ignored.
        </p>
      </div>

      {#if err}
        <p
          class="text-[12px] font-bold text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl px-4 py-3"
        >
          {err}
        </p>
      {/if}

      <button
        onclick={upload}
        disabled={busy || !file}
        class="w-full py-3.5 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
      >
        {busy ? "Importing…" : "Import Question Bank"}
      </button>
    </div>

    <!-- Result -->
    {#if result}
      <div
        class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden"
      >
        <div
          class="p-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between"
        >
          <p
            class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest"
          >
            Imported
          </p>
          <span class="text-2xl font-black text-emerald-600 tabular-nums"
            >{result.total}</span
          >
        </div>

        <div class="divide-y divide-gray-50 dark:divide-slate-800/60">
          {#each result.subjects as s}
            <div class="px-6 py-3 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="font-bold text-gray-900 dark:text-white truncate">
                  {s.subject}
                  {#if s.created}
                    <span
                      class="ml-2 text-[9px] font-black uppercase tracking-widest text-amber-600"
                      >new subject</span
                    >
                  {/if}
                </p>
                <p class="text-[11px] text-gray-400">{s.university}</p>
                {#if s.error}
                  <p class="text-[11px] text-red-500 font-semibold">{s.error}</p>
                {/if}
              </div>
              <span
                class="font-black tabular-nums text-sm {s.error
                  ? 'text-red-500'
                  : 'text-gray-900 dark:text-white'}">{s.count}</span
              >
            </div>
          {/each}
        </div>

        {#if result.unresolved?.length}
          <div
            class="p-5 border-t border-gray-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/10"
          >
            <p
              class="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2"
            >
              Skipped — university not recognised
            </p>
            {#each result.unresolved as u}
              <p class="text-[11px] text-gray-600 dark:text-slate-400">
                {u.subject} · "{u.university}" — {u.count} row{u.count === 1 ? "" : "s"}
              </p>
            {/each}
          </div>
        {/if}

        {#if result.skipped?.length}
          <div class="p-5 border-t border-gray-100 dark:border-slate-800">
            {#each result.skipped as s}
              <p class="text-[11px] text-gray-500">
                {s.count} row{s.count === 1 ? "" : "s"} skipped — {s.reason}
              </p>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
