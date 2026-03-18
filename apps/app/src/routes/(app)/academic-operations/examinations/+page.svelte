<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly, slide } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let plans = $state<any[]>([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let saving = $state(false);
  let programs = $state<any[]>([]);
  let terms = $state<any[]>([]);
  let subjects = $state<any[]>([]);
  let sections = $state<any[]>([]);
  let classrooms = $state<any[]>([]);
  let selectedPlan = $state<any>(null);
  let showAddExam = $state(false);

  // Toast notification system
  let toasts = $state<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  let toastId = 0;
  function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++toastId;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4000);
  }

  let planForm = $state({
    exam_name: '', exam_type: 'INTERNAL' as const,
    program_id: '', term_id: '', start_date: '', end_date: ''
  });

  let examForm = $state({
    subject_id: '', section_id: '', exam_date: '',
    slot_start: '10:00', slot_end: '13:00', classroom_id: '', exam_mode: 'OFFLINE'
  });

  $effect(() => {
    if (universityId) { loadPlans(); loadRefs(); }
  });

  async function loadPlans() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/exams/plans?universityId=${universityId}`);
      if (res.ok) plans = await res.json();
      else toast('Failed to load exam plans', 'error');
    } catch { toast('Network error loading plans', 'error'); }
    loading = false;
  }

  async function loadRefs() {
    try {
      const [pRes, tRes, sRes, secRes, cRes] = await Promise.all([
        fetch(`/api/academic/programs?universityId=${universityId}`),
        fetch(`/api/academic/terms?universityId=${universityId}`),
        fetch(`/api/academic/subjects?universityId=${universityId}`),
        fetch(`/api/academic/sections?universityId=${universityId}`),
        fetch(`/api/academic/classrooms?universityId=${universityId}`)
      ]);
      if (pRes.ok) programs = await pRes.json();
      if (tRes.ok) terms = await tRes.json();
      if (sRes.ok) subjects = await sRes.json();
      if (secRes.ok) sections = await secRes.json();
      if (cRes.ok) classrooms = await cRes.json();
    } catch { toast('Failed to load reference data', 'error'); }
  }

  async function createPlan() {
    saving = true;
    try {
      const res = await fetch('/api/academic/exams/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...planForm, university_id: universityId })
      });
      if (res.ok) {
        showCreate = false;
        planForm = { exam_name: '', exam_type: 'INTERNAL', program_id: '', term_id: '', start_date: '', end_date: '' };
        toast('Exam plan created successfully!', 'success');
        await loadPlans();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.message || 'Failed to create plan', 'error');
      }
    } catch { toast('Network error creating plan', 'error'); }
    saving = false;
  }

  async function selectPlan(plan: any) {
    try {
      const res = await fetch(`/api/academic/exams/plans/${plan.id}`);
      if (res.ok) selectedPlan = await res.json();
      else toast('Failed to load plan details', 'error');
    } catch { toast('Network error', 'error'); }
  }

  async function addExamToPlan() {
    if (!selectedPlan) return;
    saving = true;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlan.id}/exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examForm)
      });
      if (res.ok) {
        showAddExam = false;
        examForm = { subject_id: '', section_id: '', exam_date: '', slot_start: '10:00', slot_end: '13:00', classroom_id: '', exam_mode: 'OFFLINE' };
        toast('Exam added successfully!', 'success');
        await selectPlan(selectedPlan);
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.message || 'Failed to add exam', 'error');
      }
    } catch { toast('Network error adding exam', 'error'); }
    saving = false;
  }

  async function deletePlan(id: string) {
    if (!confirm('Delete this exam plan and all its exams?')) return;
    try {
      await fetch(`/api/academic/exams/plans/${id}`, { method: 'DELETE' });
      selectedPlan = null;
      toast('Exam plan deleted', 'success');
      await loadPlans();
    } catch { toast('Failed to delete plan', 'error'); }
  }

  function fmtDate(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }
</script>

<!-- Toast Notifications -->
<div class="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
  {#each toasts as t (t.id)}
    <div class="pointer-events-auto px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl text-sm font-bold flex items-center gap-3 min-w-[280px] border
      {t.type === 'success' ? 'bg-emerald-50/95 dark:bg-emerald-900/90 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700' :
       t.type === 'error' ? 'bg-rose-50/95 dark:bg-rose-900/90 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-700' :
       'bg-indigo-50/95 dark:bg-indigo-900/90 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700'}"
      transition:fly={{ x: 50, duration: 300 }}>
      {#if t.type === 'success'}
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      {:else if t.type === 'error'}
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      {:else}
        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      {/if}
      <span>{t.message}</span>
    </div>
  {/each}
</div>

<div class="space-y-6" in:fade>
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Exam <span class="text-indigo-600">Control Center</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Create exam plans, schedule exams, assign classrooms, and manage seating</p>
    </div>
    <button onclick={() => showCreate = true}
      class="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-lg hover:scale-[1.02] active:scale-95">
      + New Exam Plan
    </button>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    {#each [
      { label: 'Exam Plans', value: plans.length, color: 'text-violet-600', bg: 'from-violet-500/5 to-violet-500/0', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
      { label: 'Draft', value: plans.filter(p => p.version_status === 'DRAFT').length, color: 'text-amber-600', bg: 'from-amber-500/5 to-amber-500/0', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
      { label: 'Published', value: plans.filter(p => p.version_status === 'PUBLISHED').length, color: 'text-emerald-600', bg: 'from-emerald-500/5 to-emerald-500/0', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'Total Exams', value: plans.reduce((s, p) => s + (parseInt(p.exam_count) || 0), 0), color: 'text-indigo-600', bg: 'from-indigo-500/5 to-indigo-500/0', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' }
    ] as stat, i}
      <div class="relative overflow-hidden p-5 bg-gradient-to-br {stat.bg} bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl group hover:shadow-md transition-all" in:fly={{ y: 15, delay: i * 60 }}>
        <div class="absolute top-2 right-2 opacity-5 group-hover:opacity-10 transition-opacity">
          <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={stat.icon}/></svg>
        </div>
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
        <p class="text-3xl font-black {stat.color} mt-1">{stat.value}</p>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <!-- Plans List -->
    <div class="xl:col-span-1 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div class="p-4 border-b border-gray-50 dark:border-slate-800">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Exam Plans</h3>
      </div>
      {#if loading}
        <div class="p-10 text-center">
          <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p class="text-[10px] text-gray-400 font-bold mt-3">Loading plans...</p>
        </div>
      {:else if plans.length === 0}
        <div class="p-10 text-center">
          <svg class="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <p class="text-gray-400 text-sm font-bold">No exam plans yet</p>
          <p class="text-gray-300 text-xs mt-1">Create one to get started</p>
        </div>
      {:else}
        <div class="divide-y divide-gray-50 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
          {#each plans as plan}
            <button onclick={() => selectPlan(plan)}
              class="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all
              {selectedPlan?.id === plan.id ? 'bg-indigo-50 dark:bg-indigo-500/5 border-l-4 border-indigo-600' : ''}">
              <div class="flex items-start justify-between">
                <div>
                  <p class="text-sm font-black text-gray-900 dark:text-white">{plan.exam_name}</p>
                  <p class="text-[10px] text-gray-400 font-bold mt-0.5">{plan.program_name || '—'} · {plan.term_name || '—'}</p>
                  <p class="text-[10px] text-gray-400 mt-0.5">{fmtDate(plan.start_date)} — {fmtDate(plan.end_date)}</p>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase
                    {plan.version_status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                     plan.version_status === 'ARCHIVED' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}">
                    {plan.version_status}
                  </span>
                  <span class="text-[10px] font-bold text-gray-400">{plan.exam_count || 0} exams</span>
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Plan Detail -->
    <div class="xl:col-span-2">
      {#if selectedPlan}
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ x: 20 }}>
          <div class="p-5 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 class="text-lg font-black text-gray-900 dark:text-white">{selectedPlan.exam_name}</h3>
              <p class="text-xs text-gray-500 mt-0.5">
                <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-100 text-indigo-700">{selectedPlan.exam_type}</span>
                · {fmtDate(selectedPlan.start_date)} — {fmtDate(selectedPlan.end_date)}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button onclick={() => showAddExam = true} class="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all hover:shadow-md active:scale-95">+ Add Exam</button>
              <a href="/academic-operations/examinations/seating?planId={selectedPlan.id}" class="px-4 py-2 bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-violet-700 transition-all">Seating</a>
              <a href="/academic-operations/examinations/invigilation?planId={selectedPlan.id}" class="px-4 py-2 bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-700 transition-all">Invigilation</a>
              <button onclick={() => deletePlan(selectedPlan.id)} class="p-2 text-gray-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-all" title="Delete Plan">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          {#if selectedPlan.stats}
            <div class="grid grid-cols-3 md:grid-cols-6 gap-3 p-4 bg-gray-50 dark:bg-slate-800/50">
              {#each [
                { l: 'Exams', v: selectedPlan.stats.total_exams, c: 'text-indigo-600' },
                { l: 'Subjects', v: selectedPlan.stats.total_subjects, c: 'text-violet-600' },
                { l: 'Sections', v: selectedPlan.stats.total_sections, c: 'text-blue-600' },
                { l: 'Rooms', v: selectedPlan.stats.classrooms_assigned, c: 'text-emerald-600' },
                { l: 'Invigilators', v: selectedPlan.stats.invigilators_assigned, c: 'text-teal-600' },
                { l: 'Seating', v: selectedPlan.stats.seating_plans_generated, c: 'text-amber-600' },
              ] as stat}
                <div class="text-center">
                  <p class="text-lg font-black {stat.c}">{stat.v || 0}</p>
                  <p class="text-[8px] font-bold text-gray-400 uppercase">{stat.l}</p>
                </div>
              {/each}
            </div>
          {/if}

          {#if selectedPlan.exams?.length > 0}
            <div class="overflow-x-auto">
              <table class="w-full text-left">
                <thead>
                  <tr class="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 dark:border-slate-800">
                    <th class="px-4 py-3">Subject</th>
                    <th class="px-4 py-3">Section</th>
                    <th class="px-4 py-3">Date</th>
                    <th class="px-4 py-3">Time</th>
                    <th class="px-4 py-3">Room</th>
                    <th class="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
                  {#each selectedPlan.exams as exam}
                    <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all">
                      <td class="px-4 py-3">
                        <p class="text-xs font-black text-gray-900 dark:text-white">{exam.subject_name}</p>
                        <p class="text-[9px] text-gray-400 font-bold">{exam.subject_code}</p>
                      </td>
                      <td class="px-4 py-3 text-xs font-bold text-gray-600">{exam.section_name}</td>
                      <td class="px-4 py-3 text-xs font-bold text-gray-700">{fmtDate(exam.exam_date)}</td>
                      <td class="px-4 py-3 text-[10px] font-bold text-gray-500">{fmtTime(exam.slot_start)} — {fmtTime(exam.slot_end)}</td>
                      <td class="px-4 py-3 text-xs font-bold text-gray-600">{exam.classroom_name || '—'}</td>
                      <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase
                          {exam.exam_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                           exam.exam_status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' :
                           exam.exam_status === 'IN_PROGRESS' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}">{exam.exam_status}</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="p-10 text-center text-gray-400 text-sm">
              <svg class="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              No exams added yet. Click "+ Add Exam" to start.
            </div>
          {/if}
        </div>
      {:else}
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-20 text-center">
          <svg class="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <p class="text-gray-400 font-bold">Select an exam plan or create a new one</p>
          <p class="text-gray-300 text-xs mt-1">Plans appear in the sidebar on the left</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Create Plan Modal -->
{#if showCreate}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => showCreate = false} transition:fade>
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-lg shadow-2xl" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">New Exam Plan</h3>
        <button onclick={() => showCreate = false} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div>
          <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Exam Name <span class="text-rose-500">*</span></label>
          <input type="text" bind:value={planForm.exam_name} placeholder="CIA 1 - March 2026" class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Type</label>
            <select bind:value={planForm.exam_type} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="INTERNAL">Internal (CIA)</option>
              <option value="SEMESTER_END">Semester End</option>
              <option value="BACKLOG">Backlog</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Program</label>
            <select bind:value={planForm.program_id} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="">Select...</option>
              {#each programs as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Term</label>
            <select bind:value={planForm.term_id} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="">Select...</option>
              {#each terms as t}<option value={t.id}>{t.name}</option>{/each}
            </select>
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Start</label>
            <input type="date" bind:value={planForm.start_date} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">End</label>
            <input type="date" bind:value={planForm.end_date} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
        </div>
        <button onclick={createPlan} disabled={saving || !planForm.exam_name}
          class="w-full py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all hover:shadow-lg active:scale-[0.98]">
          {saving ? 'Creating...' : 'Create Plan'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Add Exam Modal -->
{#if showAddExam && selectedPlan}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => showAddExam = false} transition:fade>
    <div class="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-lg shadow-2xl" onclick={(e) => e.stopPropagation()}>
      <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
        <h3 class="text-lg font-black text-gray-900 dark:text-white">Add Exam to {selectedPlan.exam_name}</h3>
        <button onclick={() => showAddExam = false} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="p-6 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Subject <span class="text-rose-500">*</span></label>
            <select bind:value={examForm.subject_id} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="">Select...</option>
              {#each subjects as s}<option value={s.id}>{s.code ? s.code + ' - ' : ''}{s.name}</option>{/each}
            </select>
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Section <span class="text-rose-500">*</span></label>
            <select bind:value={examForm.section_id} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="">Select...</option>
              {#each sections as s}<option value={s.id}>{s.name}</option>{/each}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Date <span class="text-rose-500">*</span></label>
            <input type="date" bind:value={examForm.exam_date} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Start</label>
            <input type="time" bind:value={examForm.slot_start} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">End</label>
            <input type="time" bind:value={examForm.slot_end} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Classroom</label>
            <select bind:value={examForm.classroom_id} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="">Select...</option>
              {#each classrooms as c}<option value={c.id}>{c.name} ({c.capacity} seats)</option>{/each}
            </select>
          </div>
          <div>
            <label class="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">Mode</label>
            <select bind:value={examForm.exam_mode} class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-bold">
              <option value="OFFLINE">Offline</option>
              <option value="ONLINE">Online</option>
            </select>
          </div>
        </div>
        <button onclick={addExamToPlan} disabled={saving || !examForm.subject_id || !examForm.section_id || !examForm.exam_date}
          class="w-full py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all hover:shadow-lg active:scale-[0.98]">
          {saving ? 'Adding...' : 'Add Exam'}
        </button>
      </div>
    </div>
  </div>
{/if}
