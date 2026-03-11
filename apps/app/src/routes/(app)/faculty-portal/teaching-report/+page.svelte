<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let profile = $state<any>(null);
  let mySubjects = $state<any[]>([]);
  let reports = $state<any[]>([]);
  let syllabusTopics = $state<any[]>([]);
  let loading = $state(true);
  let reportsLoading = $state(false);

  // Filter state
  let reportDate = $state(new Date().toISOString().split('T')[0]);
  let selectedBatch = $state('');
  let selectedTerm = $state('');
  let selectedSection = $state('');
  let selectedSubject = $state('');
  let selectedUnit = $state('');

  // Report form
  let topicName = $state('');
  let topicStatus = $state('COMPLETED');
  let portionPct = $state('100');
  let notes = $state('');

  let editingReport = $state<any>(null);
  let submitting = $state(false);
  let submitMsg = $state('');
  let submitMsgType = $state<'success'|'error'>('success');

  const statuses = [
    { key: 'COMPLETED', label: 'Completed', color: 'emerald' },
    { key: 'PARTIAL', label: 'Partial', color: 'amber' },
    { key: 'INTRODUCED', label: 'Introduced', color: 'blue' },
  ];

  // Unique batches from subject data
  const uniqueBatches = $derived(() => {
    const set = new Set<string>();
    for (const s of mySubjects) {
      if (s.batch_code) set.add(s.batch_code);
    }
    return Array.from(set).sort();
  });

  // Unique semesters — deduplicated by term_name (not term_id)
  const uniqueTerms = $derived(() => {
    const map = new Map<string, { term_name: string; term_ids: string[] }>();
    for (const s of mySubjects) {
      if (!s.term_name) continue;
      if (selectedBatch && s.batch_code && s.batch_code !== selectedBatch) continue;
      if (map.has(s.term_name)) {
        const entry = map.get(s.term_name)!;
        if (!entry.term_ids.includes(s.term_id)) entry.term_ids.push(s.term_id);
      } else {
        map.set(s.term_name, { term_name: s.term_name, term_ids: [s.term_id] });
      }
    }
    return Array.from(map.values());
  });

  // Sections/branches for selected semester
  const termSections = $derived(() => {
    if (!selectedTerm) return [];
    const selectedTermEntry = uniqueTerms().find(t => t.term_name === selectedTerm);
    if (!selectedTermEntry) return [];
    const termIds = new Set(selectedTermEntry.term_ids);
    const seen = new Set<string>();
    const sections: any[] = [];
    for (const s of mySubjects) {
      if (termIds.has(s.term_id) && s.section_id && !seen.has(s.section_id)) {
        if (selectedBatch && s.batch_code && s.batch_code !== selectedBatch) continue;
        seen.add(s.section_id);
        sections.push({ section_id: s.section_id, section_name: s.section_name, batch_code: s.batch_code, program_name: s.program_name });
      }
    }
    return sections;
  });

  // Subjects for selected semester + section
  const filteredSubjects = $derived(() => {
    if (!selectedTerm) return [];
    const selectedTermEntry = uniqueTerms().find(t => t.term_name === selectedTerm);
    if (!selectedTermEntry) return [];
    const termIds = new Set(selectedTermEntry.term_ids);
    const map = new Map<string, any>();
    for (const s of mySubjects) {
      if (!termIds.has(s.term_id)) continue;
      if (selectedSection && s.section_id !== selectedSection) continue;
      if (!map.has(s.subject_id)) {
        map.set(s.subject_id, s);
      }
    }
    return Array.from(map.values());
  });

  // Load syllabus topics when subject changes
  $effect(() => {
    if (selectedSubject) {
      loadSyllabusTopics();
    } else {
      syllabusTopics = [];
      selectedUnit = '';
    }
  });

  async function loadSyllabusTopics() {
    try {
      const res = await fetch(`/api/academic/subjects/syllabus-topics?subjectId=${selectedSubject}`);
      if (res.ok) syllabusTopics = await res.json();
      else syllabusTopics = [];
    } catch { syllabusTopics = []; }
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/academic/faculty/me');
      if (res.ok) {
        const data = await res.json();
        profile = data.profile;
        mySubjects = data.subjects || [];
      }
    } finally { loading = false; }
    loadReports();
  });

  async function loadReports() {
    if (!profile) return;
    reportsLoading = true;
    try {
      const res = await fetch(`/api/academic/faculty/teaching-reports?facultyProfileId=${profile.id}`);
      if (res.ok) reports = await res.json();
    } finally { reportsLoading = false; }
  }

  $effect(() => {
    if (profile) loadReports();
  });

  async function submitReport() {
    if (!topicName.trim()) { submitMsg = 'Topic name is required'; submitMsgType = 'error'; return; }
    submitting = true; submitMsg = '';
    try {
      const unitLabel = selectedUnit ? syllabusTopics.find(t => t.id === selectedUnit)?.topic_name : '';
      const fullTopic = unitLabel ? `[${unitLabel}] ${topicName.trim()}` : topicName.trim();

      if (editingReport) {
        // PATCH — update existing
        const res = await fetch('/api/academic/faculty/teaching-reports', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingReport.id,
            topic_name: fullTopic,
            topic_status: topicStatus,
            portion_percentage: Number(portionPct) || 100,
            notes: notes.trim() || null,
            subject_id: selectedSubject || null,
            section_id: selectedSection || null,
            report_date: reportDate
          })
        });
        if (res.ok) {
          submitMsg = 'Report updated successfully'; submitMsgType = 'success';
          editingReport = null;
          topicName = ''; notes = ''; portionPct = '100'; topicStatus = 'COMPLETED'; selectedUnit = '';
          loadReports();
          setTimeout(() => submitMsg = '', 3000);
        } else {
          const data = await res.json();
          submitMsg = data.message || 'Failed to update'; submitMsgType = 'error';
        }
      } else {
        // POST — new report
        const res = await fetch('/api/academic/faculty/teaching-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            faculty_profile_id: profile.id,
            subject_id: selectedSubject || null,
            section_id: selectedSection || null,
            report_date: reportDate,
            topic_name: fullTopic,
            topic_status: topicStatus,
            portion_percentage: Number(portionPct) || 100,
            notes: notes.trim() || null
          })
        });
        if (res.ok) {
          submitMsg = 'Report submitted successfully'; submitMsgType = 'success';
          topicName = ''; notes = ''; portionPct = '100'; topicStatus = 'COMPLETED'; selectedUnit = '';
          loadReports();
          setTimeout(() => submitMsg = '', 3000);
        } else {
          const data = await res.json();
          submitMsg = data.message || 'Failed to submit'; submitMsgType = 'error';
        }
      }
    } catch { submitMsg = 'Network error'; submitMsgType = 'error'; }
    finally { submitting = false; }
  }

  function startEdit(report: any) {
    editingReport = report;
    reportDate = report.report_date?.split('T')[0] || report.report_date;
    topicName = report.topic_name || '';
    topicStatus = report.topic_status || 'COMPLETED';
    portionPct = report.portion_percentage?.toString() || '100';
    notes = report.notes || '';
    // Try to match subject/section
    if (report.subject_id) selectedSubject = report.subject_id;
    if (report.section_id) selectedSection = report.section_id;
    selectedUnit = '';
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    editingReport = null;
    topicName = ''; notes = ''; portionPct = '100'; topicStatus = 'COMPLETED'; selectedUnit = '';
    reportDate = new Date().toISOString().split('T')[0];
  }

  async function deleteReport(id: string) {
    if (!confirm('Delete this report?')) return;
    await fetch(`/api/academic/faculty/teaching-reports?id=${id}`, { method: 'DELETE' });
    reports = reports.filter(r => r.id !== id);
  }

  function statusBadge(status: string) {
    if (status === 'COMPLETED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600';
    if (status === 'PARTIAL') return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600';
    return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600';
  }

  const reportsByDate = $derived(() => {
    const map = new Map<string, any[]>();
    for (const r of reports) {
      const d = r.report_date?.split('T')[0] || r.report_date;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  });
</script>

<div class="space-y-6" in:fade>
  <div>
    <a href="/faculty-portal/dashboard" class="text-xs font-bold text-indigo-600 hover:underline mb-1 inline-block">&larr; Back to Dashboard</a>
    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Daily Teaching <span class="text-indigo-600">Report</span></h2>
    <p class="text-xs font-medium text-gray-400 mt-1">Submit what you taught today and track syllabus progress</p>
  </div>

  {#if loading}
    <div class="p-20 flex flex-col items-center">
      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
    </div>
  {:else if !profile}
    <div class="text-center py-16 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-3xl">
      <p class="text-gray-500 font-bold text-sm">No faculty profile found</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Submit Report Form -->
      <div class="lg:col-span-1 p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">{editingReport ? 'Edit Report' : 'New Report'}</p>
          {#if editingReport}
            <button onclick={cancelEdit} class="text-[9px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-widest">Cancel Edit</button>
          {/if}
        </div>

        <!-- 1. Date -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</label>
          <input type="date" bind:value={reportDate}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
        </div>

        <!-- 2. Batch -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Batch</label>
          <select bind:value={selectedBatch} onchange={() => { selectedTerm = ''; selectedSection = ''; selectedSubject = ''; selectedUnit = ''; }}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
            <option value="">All Batches</option>
            {#each uniqueBatches() as b}
              <option value={b}>{b}</option>
            {/each}
          </select>
        </div>

        <!-- 3. Semester -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Semester</label>
          <select bind:value={selectedTerm} onchange={() => { selectedSection = ''; selectedSubject = ''; selectedUnit = ''; }}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
            <option value="">Select Semester</option>
            {#each uniqueTerms() as t}
              <option value={t.term_name}>{t.term_name}</option>
            {/each}
          </select>
        </div>

        <!-- 4. Branch / Section -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Branch / Section</label>
          <select bind:value={selectedSection} onchange={() => { selectedSubject = ''; selectedUnit = ''; }}
            disabled={!selectedTerm}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 disabled:opacity-40">
            <option value="">All / General</option>
            {#each termSections() as sec}
              <option value={sec.section_id}>{sec.section_name}{sec.batch_code ? ` (${sec.batch_code})` : ''}{sec.program_name ? ` · ${sec.program_name}` : ''}</option>
            {/each}
          </select>
        </div>

        <!-- 5. Subject -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subject</label>
          <select bind:value={selectedSubject} onchange={() => { selectedUnit = ''; }}
            disabled={!selectedTerm}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 disabled:opacity-40">
            <option value="">Select Subject</option>
            {#each filteredSubjects() as s}
              <option value={s.subject_id}>{s.subject_code} — {s.subject_name}</option>
            {/each}
          </select>
        </div>

        <!-- 6. Unit (from syllabus topics) -->
        {#if selectedSubject}
          <div class="flex flex-col gap-1">
            <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unit / Chapter</label>
            <select bind:value={selectedUnit}
              class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
              <option value="">General / No Unit</option>
              {#each syllabusTopics as t}
                <option value={t.id}>{t.topic_name}{t.is_completed ? ' (Done)' : ''}</option>
              {/each}
            </select>
            {#if syllabusTopics.length === 0}
              <p class="text-[9px] text-gray-400 mt-0.5">No syllabus units defined for this subject yet</p>
            {/if}
          </div>
        {/if}

        <!-- 7. Topic Covered -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Topic Covered <span class="text-rose-500">*</span></label>
          <input type="text" bind:value={topicName} placeholder="e.g. Introduction to Thermodynamics"
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
        </div>

        <!-- 8. Status -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</label>
          <div class="grid grid-cols-3 gap-2">
            {#each statuses as s}
              <button onclick={() => topicStatus = s.key}
                class="py-2 px-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all
                  {topicStatus === s.key ? `border-${s.color}-500 bg-${s.color}-50 dark:bg-${s.color}-500/10 text-${s.color}-600` : 'border-gray-100 dark:border-slate-700 text-gray-400 hover:border-gray-300'}">
                {s.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- 9. Portion Done -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Portion Done (%)</label>
          <div class="flex items-center gap-3">
            <input type="range" min="0" max="100" step="5" bind:value={portionPct} class="flex-1 accent-indigo-600" />
            <span class="text-xs font-black text-indigo-600 w-10 text-right">{portionPct}%</span>
          </div>
        </div>

        <!-- 10. Notes (description) -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Description <span class="font-medium text-gray-400 normal-case">(where you stopped, key points)</span></label>
          <textarea bind:value={notes} rows="3" placeholder="Brief description of what was covered, where you stopped..."
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-medium text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 resize-none"></textarea>
        </div>

        {#if submitMsg}
          <div class="p-3 rounded-xl text-xs font-bold {submitMsgType === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}" transition:fade>{submitMsg}</div>
        {/if}

        <button onclick={submitReport} disabled={submitting}
          class="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20">
          {submitting ? 'Saving...' : editingReport ? 'Update Report' : 'Submit Report'}
        </button>
      </div>

      <!-- Reports History -->
      <div class="lg:col-span-2 space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Report History</p>
          <span class="text-[10px] text-gray-400">{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
        </div>

        {#if reportsLoading}
          <div class="p-12 flex justify-center">
            <div class="w-8 h-8 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
          </div>
        {:else if reports.length === 0}
          <div class="p-16 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-700 rounded-[2rem] flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center mb-4">
              <svg class="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <p class="text-sm font-black text-gray-500">No reports yet</p>
            <p class="text-[10px] text-gray-400 mt-1">Submit your first daily teaching report</p>
          </div>
        {:else}
          {#each reportsByDate() as [date, dayReports], di}
            <div class="space-y-2" in:fly={{ y: 10, delay: di * 40 }}>
              <p class="text-xs font-black text-gray-500 px-1">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                <span class="font-medium text-gray-400 ml-1">({dayReports.length} topic{dayReports.length > 1 ? 's' : ''})</span>
              </p>
              {#each dayReports as report}
                <div class="p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl flex items-start justify-between gap-3 group hover:shadow-md transition-all">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h4 class="text-sm font-black text-gray-900 dark:text-white">{report.topic_name}</h4>
                      <span class="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest {statusBadge(report.topic_status)}">{report.topic_status}</span>
                      {#if report.portion_percentage !== null && report.portion_percentage < 100}
                        <span class="text-[9px] font-black text-gray-400">{report.portion_percentage}% done</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      {#if report.subject_name}<span class="font-bold text-indigo-500">{report.subject_name}</span>{/if}
                      {#if report.section_name}<span>· {report.section_name}</span>{/if}
                      {#if report.notes}<span class="italic">— {report.notes}</span>{/if}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button onclick={() => startEdit(report)} class="p-1.5 text-gray-300 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick={() => deleteReport(report.id)} class="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
