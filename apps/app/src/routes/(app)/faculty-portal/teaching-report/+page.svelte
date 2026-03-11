<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let profile = $state<any>(null);
  let mySubjects = $state<any[]>([]);
  let reports = $state<any[]>([]);
  let loading = $state(true);
  let reportsLoading = $state(false);

  let selectedSubject = $state('');
  let selectedSection = $state('');
  let reportDate = $state(new Date().toISOString().split('T')[0]);
  let topicName = $state('');
  let topicStatus = $state('COMPLETED');
  let portionPct = $state('100');
  let notes = $state('');

  let submitting = $state(false);
  let submitMsg = $state('');
  let submitMsgType = $state<'success'|'error'>('success');

  const statuses = [
    { key: 'COMPLETED', label: 'Completed', color: 'emerald' },
    { key: 'PARTIAL', label: 'Partial', color: 'amber' },
    { key: 'INTRODUCED', label: 'Introduced', color: 'blue' },
  ];

  const uniqueSubjects = $derived(() => {
    const map = new Map<string, any>();
    for (const s of mySubjects) {
      if (!map.has(s.subject_id)) {
        map.set(s.subject_id, { ...s, sections: [] });
      }
      if (s.section_id) {
        const existing = map.get(s.subject_id);
        if (!existing.sections.find((sec: any) => sec.section_id === s.section_id)) {
          existing.sections.push({ section_id: s.section_id, section_name: s.section_name, batch_code: s.batch_code });
        }
      }
    }
    return Array.from(map.values());
  });

  const availableSections = $derived(() => {
    if (!selectedSubject) return [];
    const subj = uniqueSubjects().find((s: any) => s.subject_id === selectedSubject);
    return subj?.sections || [];
  });

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
      const res = await fetch('/api/academic/faculty/teaching-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty_profile_id: profile.id,
          subject_id: selectedSubject || null,
          section_id: selectedSection || null,
          report_date: reportDate,
          topic_name: topicName.trim(),
          topic_status: topicStatus,
          portion_percentage: Number(portionPct) || 100,
          notes: notes.trim() || null
        })
      });
      if (res.ok) {
        submitMsg = 'Report submitted successfully'; submitMsgType = 'success';
        topicName = ''; notes = ''; portionPct = '100'; topicStatus = 'COMPLETED';
        loadReports();
        setTimeout(() => submitMsg = '', 3000);
      } else {
        const data = await res.json();
        submitMsg = data.message || 'Failed to submit'; submitMsgType = 'error';
      }
    } catch { submitMsg = 'Network error'; submitMsgType = 'error'; }
    finally { submitting = false; }
  }

  async function deleteReport(id: string) {
    await fetch(`/api/academic/faculty/teaching-reports?id=${id}`, { method: 'DELETE' });
    reports = reports.filter(r => r.id !== id);
  }

  function statusBadge(status: string) {
    if (status === 'COMPLETED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600';
    if (status === 'PARTIAL') return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600';
    return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600';
  }

  // Group reports by date for display
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
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">New Report</p>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</label>
          <input type="date" bind:value={reportDate}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subject</label>
          <select bind:value={selectedSubject} onchange={() => { selectedSection = ''; }}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
            <option value="">Select Subject</option>
            {#each uniqueSubjects() as s}
              <option value={s.subject_id}>{s.subject_code} — {s.subject_name}</option>
            {/each}
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Section / Branch</label>
          <select bind:value={selectedSection}
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500">
            <option value="">All / General</option>
            {#each availableSections() as sec}
              <option value={sec.section_id}>{sec.section_name} ({sec.batch_code})</option>
            {/each}
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Topic Covered <span class="text-rose-500">*</span></label>
          <input type="text" bind:value={topicName} placeholder="e.g. Introduction to Thermodynamics"
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500" />
        </div>

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

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Portion Done (%)</label>
          <div class="flex items-center gap-3">
            <input type="range" min="0" max="100" step="5" bind:value={portionPct} class="flex-1 accent-indigo-600" />
            <span class="text-xs font-black text-indigo-600 w-10 text-right">{portionPct}%</span>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Notes <span class="font-medium text-gray-400 normal-case">(optional)</span></label>
          <textarea bind:value={notes} rows="2" placeholder="Any additional details..."
            class="px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-medium text-gray-700 dark:text-gray-300 focus:ring-2 ring-indigo-500 resize-none"></textarea>
        </div>

        {#if submitMsg}
          <div class="p-3 rounded-xl text-xs font-bold {submitMsgType === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}" transition:fade>{submitMsg}</div>
        {/if}

        <button onclick={submitReport} disabled={submitting}
          class="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20">
          {submitting ? 'Submitting...' : 'Submit Report'}
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
                  <button onclick={() => deleteReport(report.id)} class="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
