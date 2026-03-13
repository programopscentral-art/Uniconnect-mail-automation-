<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  // University context
  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // State
  let plans = $state<any[]>([]);
  let loading = $state(false);
  let selectedPlan = $state<any>(null);
  let showUpload = $state(false);

  // Upload state
  let file = $state<File | null>(null);
  let uploading = $state(false);
  let uploadError = $state('');
  let uploadResult = $state<any>(null);

  // Programs and terms for context
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let selectedProgramId = $state('');
  let selectedTermId = $state('');

  // Manual plan form
  let showManualForm = $state(false);
  let manualPlan = $state({
    start_date: '', end_date: '', working_days_per_week: 5, total_working_days: 0,
    saturdays_off: 'ALL', slots_per_day: 7, slot_duration_minutes: 50,
    total_university_working_days: 0, university_assessment_days: 0,
    niat_working_days: 0, total_niat_slots: 0, niat_assessment_slots: 0,
    net_executional_slots: 0, buffer_slots: 0, remarks: ''
  });

  // Add subject requirement form
  let showAddSubject = $state(false);
  let newSubject = $state({
    subject_code: '', subject_name: '', total_slots_required: 0,
    slots_per_week: 0, buffer_slots: 0, lab_slots_required: 0,
    lab_slots_per_week: 0, priority: 1, remarks: ''
  });

  $effect(() => { loadPlans(); if (universityId) loadPrograms(); });
  $effect(() => { if (universityId && selectedProgramId) loadTerms(); });

  async function loadPlans() {
    loading = true;
    try {
      let url = `/api/academic/scheduling/apd/plans`;
      const params: string[] = [];
      if (universityId) params.push(`universityId=${universityId}`);
      if (selectedTermId) params.push(`termId=${selectedTermId}`);
      if (params.length) url += '?' + params.join('&');
      const res = await fetch(url);
      if (res.ok) plans = await res.json();
    } catch {} finally { loading = false; }
  }

  async function loadPrograms() {
    try {
      const res = await fetch(`/api/academic/programs?universityId=${universityId}`);
      if (res.ok) programs = await res.json();
    } catch {}
  }

  async function loadTerms() {
    try {
      const res = await fetch(`/api/academic/terms?universityId=${universityId}&programId=${selectedProgramId}`);
      if (res.ok) terms = await res.json();
    } catch {}
  }

  async function loadPlanDetail(planId: string) {
    try {
      const res = await fetch(`/api/academic/scheduling/apd/plans/${planId}`);
      if (res.ok) selectedPlan = await res.json();
    } catch {}
  }

  // File upload
  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) file = input.files[0];
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped && (dropped.name.endsWith('.xlsx') || dropped.name.endsWith('.xls'))) {
      file = dropped;
    }
  }

  async function uploadAPD() {
    if (!file) return;
    uploading = true;
    uploadError = '';
    uploadResult = null;

    const fd = new FormData();
    fd.append('file', file);
    if (universityId) fd.append('universityId', universityId);
    if (selectedTermId) fd.append('termId', selectedTermId);
    if (selectedProgramId) fd.append('programId', selectedProgramId);

    try {
      const res = await fetch('/api/academic/scheduling/apd/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        uploadResult = data;
        await loadPlans();
        file = null;
      } else {
        uploadError = data.message || 'Import failed';
        uploadResult = data;
      }
    } catch (e: any) {
      uploadError = e.message || 'Upload failed';
    } finally { uploading = false; }
  }

  // Manual plan creation
  async function createManualPlan() {
    try {
      const res = await fetch('/api/academic/scheduling/apd/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityId, termId: selectedTermId || undefined,
          programId: selectedProgramId || undefined, ...manualPlan
        })
      });
      if (res.ok) {
        showManualForm = false;
        await loadPlans();
      }
    } catch {}
  }

  // Plan actions
  async function activatePlan(planId: string) {
    await fetch(`/api/academic/scheduling/apd/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' })
    });
    await loadPlans();
    if (selectedPlan?.id === planId) await loadPlanDetail(planId);
  }

  async function archivePlan(planId: string) {
    await fetch(`/api/academic/scheduling/apd/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ARCHIVED' })
    });
    await loadPlans();
    if (selectedPlan?.id === planId) selectedPlan = null;
  }

  async function deletePlan(planId: string) {
    if (!confirm('Delete this plan and all its subject requirements?')) return;
    await fetch(`/api/academic/scheduling/apd/plans/${planId}`, { method: 'DELETE' });
    if (selectedPlan?.id === planId) selectedPlan = null;
    await loadPlans();
  }

  // Subject requirement actions
  async function addSubjectRequirement() {
    if (!selectedPlan) return;
    try {
      const res = await fetch(`/api/academic/scheduling/apd/plans/${selectedPlan.id}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSubject)
      });
      if (res.ok) {
        showAddSubject = false;
        newSubject = { subject_code: '', subject_name: '', total_slots_required: 0, slots_per_week: 0, buffer_slots: 0, lab_slots_required: 0, lab_slots_per_week: 0, priority: 1, remarks: '' };
        await loadPlanDetail(selectedPlan.id);
      }
    } catch {}
  }

  async function deleteRequirement(reqId: string) {
    if (!selectedPlan) return;
    await fetch(`/api/academic/scheduling/apd/plans/${selectedPlan.id}/requirements/${reqId}`, { method: 'DELETE' });
    await loadPlanDetail(selectedPlan.id);
  }

  function statusColor(status: string) {
    if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (status === 'ARCHIVED') return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  }
</script>

<div class="space-y-6" in:fade>
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">APD Planning</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Upload APD sheets and manage university scheduling constraints</p>
    </div>
    <div class="flex gap-2">
      <button onclick={() => showManualForm = !showManualForm}
        class="px-4 py-2 text-sm font-medium rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
        Manual Plan
      </button>
      <button onclick={() => showUpload = !showUpload}
        class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
        Import APD Sheet
      </button>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex gap-3 flex-wrap">
    <select bind:value={selectedProgramId} class="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white">
      <option value="">All Programs</option>
      {#each programs as p}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
    {#if selectedProgramId}
      <select bind:value={selectedTermId} onchange={() => loadPlans()} class="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-white">
        <option value="">All Terms</option>
        {#each terms as t}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
    {/if}
  </div>

  <!-- Upload Panel -->
  {#if showUpload}
    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6" in:fly={{ y: -10, duration: 200 }}>
      <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Import APD Sheet</h3>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {#if universityId}
          Importing for selected university only.
        {:else}
          <span class="text-indigo-600 dark:text-indigo-400 font-medium">All Universities mode</span> — each row will be auto-matched to its university by name.
        {/if}
      </p>

      <!-- Drop zone -->
      <div
        class="border-2 border-dashed rounded-xl p-8 text-center transition-colors
          {file ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-gray-300 dark:border-slate-600 hover:border-indigo-300'}"
        ondrop={handleDrop}
        ondragover={(e) => e.preventDefault()}
        role="button"
        tabindex="0"
      >
        {#if file}
          <p class="text-sm font-medium text-indigo-600 dark:text-indigo-400">{file.name}</p>
          <p class="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          <button onclick={() => file = null} class="text-xs text-red-500 mt-2 hover:underline">Remove</button>
        {:else}
          <p class="text-sm text-gray-500 dark:text-gray-400">Drag & drop APD Excel file here, or</p>
          <label class="inline-block mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700">
            Browse Files
            <input type="file" accept=".xlsx,.xls" onchange={handleFileInput} class="hidden" />
          </label>
        {/if}
      </div>

      {#if file}
        <div class="mt-4 flex justify-end">
          <button onclick={uploadAPD} disabled={uploading}
            class="px-6 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {uploading ? 'Importing...' : 'Import APD'}
          </button>
        </div>
      {/if}

      {#if uploadError}
        <div class="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{uploadError}</div>
      {/if}

      {#if uploadResult?.success}
        <div class="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm">
          <p class="font-semibold">Import Successful</p>
          <p class="mt-1">{uploadResult.plansCreated} plan(s) created from {uploadResult.parseResult?.totalRows || 0} rows</p>
          {#if uploadResult.unmatchedUniversities?.length}
            <div class="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
              <p class="text-xs font-semibold">Unmatched Universities (skipped):</p>
              {#each uploadResult.unmatchedUniversities as name}
                <p class="text-xs mt-0.5">- {name}</p>
              {/each}
              <p class="text-xs mt-1 italic">Add these universities to the system first, then re-import.</p>
            </div>
          {/if}
          {#if uploadResult.parseResult?.warnings?.length}
            <div class="mt-2 text-amber-600 dark:text-amber-400">
              {#each uploadResult.parseResult.warnings as w}
                <p class="text-xs">- {w}</p>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if uploadResult?.errors?.length}
        <div class="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm">
          <p class="font-semibold text-red-600 dark:text-red-400">Parse Errors</p>
          {#each uploadResult.errors as err}
            <p class="text-xs text-red-500 mt-1">Row {err.row}: {err.message} {err.field ? `(${err.field})` : ''}</p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Manual Plan Form -->
  {#if showManualForm}
    <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6" in:fly={{ y: -10, duration: 200 }}>
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">Create Manual Plan</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
          <input type="date" bind:value={manualPlan.start_date} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End Date</label>
          <input type="date" bind:value={manualPlan.end_date} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Working Days/Week</label>
          <input type="number" bind:value={manualPlan.working_days_per_week} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Working Days</label>
          <input type="number" bind:value={manualPlan.total_working_days} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Saturdays Off</label>
          <select bind:value={manualPlan.saturdays_off} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
            <option value="ALL">All Saturdays</option>
            <option value="ALTERNATE">Alternate</option>
            <option value="NONE">None (all working)</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Slots/Day</label>
          <input type="number" bind:value={manualPlan.slots_per_day} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Net Executional Slots</label>
          <input type="number" bind:value={manualPlan.net_executional_slots} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Buffer Slots</label>
          <input type="number" bind:value={manualPlan.buffer_slots} class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
        </div>
        <div class="col-span-2 md:col-span-4">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Remarks</label>
          <textarea bind:value={manualPlan.remarks} rows="2" class="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white"></textarea>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button onclick={() => showManualForm = false} class="px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300">Cancel</button>
        <button onclick={createManualPlan} class="px-6 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">Create Plan</button>
      </div>
    </div>
  {/if}

  <!-- Plans List + Detail Split View -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Plans List -->
    <div class="lg:col-span-1 space-y-3">
      <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Plans ({plans.length})</h3>

      {#if loading}
        <div class="text-sm text-gray-400 animate-pulse">Loading plans...</div>
      {:else if plans.length === 0}
        <div class="text-center py-12 text-gray-400 dark:text-gray-500">
          <p class="text-sm">No APD plans yet</p>
          <p class="text-xs mt-1">Import an APD sheet or create a manual plan</p>
        </div>
      {:else}
        {#each plans as plan}
          <button
            onclick={() => loadPlanDetail(plan.id)}
            class="w-full text-left p-4 rounded-xl border transition-all
              {selectedPlan?.id === plan.id
                ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10 dark:border-indigo-500'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600'}"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold {statusColor(plan.plan_status)} px-2 py-0.5 rounded-full">{plan.plan_status}</span>
              <span class="text-xs text-gray-400">{plan.subject_count || 0} subjects</span>
            </div>
            {#if !universityId && plan.university_name}
              <p class="text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate mb-0.5">{plan.university_name}</p>
            {/if}
            <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {plan.program_name || 'All Programs'} — {plan.term_name || 'All Terms'}
            </p>
            {#if plan.start_date}
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {plan.start_date} to {plan.end_date || '—'}
              </p>
            {/if}
            <p class="text-xs text-gray-400 mt-1">
              {plan.net_executional_slots || '—'} executional slots | {plan.buffer_slots || 0} buffer
            </p>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Plan Detail -->
    <div class="lg:col-span-2">
      {#if selectedPlan}
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6" in:fade={{ duration: 150 }}>
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                {selectedPlan.program_name || 'All Programs'} — {selectedPlan.term_name || 'All Terms'}
              </h3>
              <span class="text-xs font-bold {statusColor(selectedPlan.plan_status)} px-2 py-0.5 rounded-full">{selectedPlan.plan_status}</span>
            </div>
            <div class="flex gap-2">
              {#if selectedPlan.plan_status === 'DRAFT'}
                <button onclick={() => activatePlan(selectedPlan.id)} class="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Activate</button>
              {/if}
              {#if selectedPlan.plan_status !== 'ARCHIVED'}
                <button onclick={() => archivePlan(selectedPlan.id)} class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-300">Archive</button>
              {/if}
              <button onclick={() => deletePlan(selectedPlan.id)} class="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
            </div>
          </div>

          <!-- Constraint Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Date Range</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{selectedPlan.start_date || '—'} to {selectedPlan.end_date || '—'}</p>
            </div>
            <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Working Days</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{selectedPlan.total_working_days || '—'} <span class="text-xs font-normal text-gray-400">({selectedPlan.working_days_per_week || 5}/week)</span></p>
            </div>
            <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Slots/Day</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{selectedPlan.slots_per_day || '—'} <span class="text-xs font-normal text-gray-400">({selectedPlan.slot_duration_minutes || 50} min)</span></p>
            </div>
            <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
              <p class="text-xs text-gray-500 dark:text-gray-400">Saturdays</p>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{selectedPlan.saturdays_off || 'ALL'} off</p>
            </div>
            <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <p class="text-xs text-blue-500 dark:text-blue-400">Total NIAT Slots</p>
              <p class="text-sm font-bold text-blue-700 dark:text-blue-300">{selectedPlan.total_niat_slots || '—'}</p>
            </div>
            <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <p class="text-xs text-blue-500 dark:text-blue-400">Assessment Slots</p>
              <p class="text-sm font-bold text-blue-700 dark:text-blue-300">{selectedPlan.niat_assessment_slots || 0}</p>
            </div>
            <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20">
              <p class="text-xs text-indigo-500 dark:text-indigo-400">Net Executional</p>
              <p class="text-sm font-bold text-indigo-700 dark:text-indigo-300">{selectedPlan.net_executional_slots || '—'}</p>
            </div>
            <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <p class="text-xs text-amber-500 dark:text-amber-400">Buffer Slots</p>
              <p class="text-sm font-bold text-amber-700 dark:text-amber-300">{selectedPlan.buffer_slots || 0}</p>
            </div>
          </div>

          {#if selectedPlan.remarks}
            <div class="mb-6 p-3 rounded-xl bg-gray-50 dark:bg-slate-700/50">
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Remarks</p>
              <p class="text-sm text-gray-700 dark:text-gray-300">{selectedPlan.remarks}</p>
            </div>
          {/if}

          <!-- Subject Slot Requirements -->
          <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Subject Slot Requirements</h4>
              <button onclick={() => showAddSubject = !showAddSubject}
                class="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                + Add Subject
              </button>
            </div>

            {#if showAddSubject}
              <div class="mb-4 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10" in:fly={{ y: -10, duration: 150 }}>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Subject Code *</label>
                    <input type="text" bind:value={newSubject.subject_code} placeholder="e.g. DS" class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Subject Name</label>
                    <input type="text" bind:value={newSubject.subject_name} placeholder="Data Structures" class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Total Slots *</label>
                    <input type="number" bind:value={newSubject.total_slots_required} class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Slots/Week</label>
                    <input type="number" bind:value={newSubject.slots_per_week} class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Lab Slots</label>
                    <input type="number" bind:value={newSubject.lab_slots_required} class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Buffer</label>
                    <input type="number" bind:value={newSubject.buffer_slots} class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Priority</label>
                    <input type="number" bind:value={newSubject.priority} min="1" max="10" class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div class="flex items-end">
                    <button onclick={addSubjectRequirement} class="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Add</button>
                  </div>
                </div>
              </div>
            {/if}

            {#if selectedPlan.subject_requirements?.length}
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-slate-700">
                      <th class="pb-2 pr-3">Code</th>
                      <th class="pb-2 pr-3">Subject</th>
                      <th class="pb-2 pr-3 text-right">Total</th>
                      <th class="pb-2 pr-3 text-right">Per Week</th>
                      <th class="pb-2 pr-3 text-right">Lab</th>
                      <th class="pb-2 pr-3 text-right">Buffer</th>
                      <th class="pb-2 pr-3 text-right">Allocated</th>
                      <th class="pb-2 text-right">Remaining</th>
                      <th class="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each selectedPlan.subject_requirements as req}
                      <tr class="border-b border-gray-100 dark:border-slate-700/50">
                        <td class="py-2 pr-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{req.subject_code}</td>
                        <td class="py-2 pr-3 text-gray-700 dark:text-gray-300">{req.subject_name || req.matched_subject_name || '—'}</td>
                        <td class="py-2 pr-3 text-right font-semibold">{req.total_slots_required}</td>
                        <td class="py-2 pr-3 text-right">{req.slots_per_week}</td>
                        <td class="py-2 pr-3 text-right">{req.lab_slots_required || 0}</td>
                        <td class="py-2 pr-3 text-right">{req.buffer_slots || 0}</td>
                        <td class="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">{req.slots_allocated || 0}</td>
                        <td class="py-2 text-right font-semibold {(req.total_slots_required - (req.slots_allocated || 0)) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">
                          {req.total_slots_required - (req.slots_allocated || 0)}
                        </td>
                        <td class="py-2 pl-2">
                          <button onclick={() => deleteRequirement(req.id)} class="text-xs text-red-400 hover:text-red-600">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                  <tfoot>
                    <tr class="text-xs font-bold text-gray-600 dark:text-gray-300 border-t border-gray-300 dark:border-slate-600">
                      <td class="pt-2 pr-3" colspan="2">TOTALS</td>
                      <td class="pt-2 pr-3 text-right">{selectedPlan.subject_requirements.reduce((s: number, r: any) => s + (r.total_slots_required || 0), 0)}</td>
                      <td class="pt-2 pr-3 text-right">{selectedPlan.subject_requirements.reduce((s: number, r: any) => s + (r.slots_per_week || 0), 0)}</td>
                      <td class="pt-2 pr-3 text-right">{selectedPlan.subject_requirements.reduce((s: number, r: any) => s + (r.lab_slots_required || 0), 0)}</td>
                      <td class="pt-2 pr-3 text-right">{selectedPlan.subject_requirements.reduce((s: number, r: any) => s + (r.buffer_slots || 0), 0)}</td>
                      <td class="pt-2 pr-3 text-right">{selectedPlan.subject_requirements.reduce((s: number, r: any) => s + (r.slots_allocated || 0), 0)}</td>
                      <td class="pt-2 text-right">{selectedPlan.subject_requirements.reduce((s: number, r: any) => s + (r.total_slots_required || 0) - (r.slots_allocated || 0), 0)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            {:else}
              <p class="text-center text-sm text-gray-400 py-6">No subject requirements yet. Add subjects manually or re-import the APD sheet with a Subjects sheet.</p>
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
          <p class="text-sm">Select a plan to view details</p>
        </div>
      {/if}
    </div>
  </div>
</div>
