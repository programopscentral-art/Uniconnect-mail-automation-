<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  let plans = $state<any[]>([]);
  let selectedPlanId = $state($page.url.searchParams.get('planId') || '');
  let assignments = $state<any[]>([]);
  let loading = $state(true);
  let assigning = $state(false);

  // Toast
  let toasts = $state<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  let toastId = 0;
  function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++toastId;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4000);
  }

  $effect(() => {
    if (universityId) loadPlans();
  });

  $effect(() => {
    if (selectedPlanId) loadAssignments();
  });

  async function loadPlans() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/exams/plans?universityId=${universityId}`);
      if (res.ok) plans = await res.json();
      else toast('Failed to load plans', 'error');
    } catch { toast('Network error loading plans', 'error'); }
    loading = false;
  }

  async function loadAssignments() {
    if (!selectedPlanId) return;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlanId}/invigilation`);
      if (res.ok) assignments = await res.json();
      else toast('Failed to load assignments', 'error');
    } catch { toast('Network error', 'error'); }
  }

  async function autoAssign() {
    if (!selectedPlanId || !universityId) return;
    assigning = true;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlanId}/invigilation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityId })
      });
      if (res.ok) {
        const result = await res.json();
        if (result.error) {
          toast(result.error, 'error');
        } else {
          toast(`Auto-assigned ${result.assignments_count} invigilators!`, 'success');
          await loadAssignments();
        }
      } else {
        toast('Failed to auto-assign invigilators', 'error');
      }
    } catch { toast('Network error during assignment', 'error'); }
    assigning = false;
  }

  async function removeAssignment(assignmentId: string) {
    if (!confirm('Remove this invigilator assignment?')) return;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlanId}/invigilation?assignmentId=${assignmentId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast('Assignment removed', 'success');
        await loadAssignments();
      } else {
        toast('Failed to remove assignment', 'error');
      }
    } catch { toast('Network error', 'error'); }
  }

  // Group assignments by date+slot
  const grouped = $derived(() => {
    const groups = new Map<string, any[]>();
    for (const a of assignments) {
      const key = `${a.exam_date}_${a.slot_start}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  // Unique classrooms count
  const uniqueClassrooms = $derived(new Set(assignments.map(a => a.classroom_id).filter(Boolean)).size);

  function fmtDate(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function fmtTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }
</script>

<!-- Toast -->
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
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Invigilation <span class="text-teal-600">Duty</span></h2>
      <p class="text-sm text-gray-500 font-medium mt-1">Assign and manage invigilators for exam classrooms</p>
    </div>
    <div class="flex items-center gap-3">
      <select bind:value={selectedPlanId}
        class="px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold min-w-[200px] shadow-sm">
        <option value="">Select Exam Plan...</option>
        {#each plans as p}<option value={p.id}>{p.exam_name}</option>{/each}
      </select>
      {#if selectedPlanId}
        <button onclick={autoAssign} disabled={assigning}
          class="px-5 py-2.5 bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-all shadow-sm hover:shadow-lg active:scale-95">
          {#if assigning}
            <span class="flex items-center gap-2">
              <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Assigning...
            </span>
          {:else}
            Auto-Assign Invigilators
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-xs text-gray-400 font-bold mt-4">Loading assignments...</p>
    </div>
  {:else if !selectedPlanId}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
      <svg class="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
      <p class="text-gray-400 font-bold">Select an exam plan to manage invigilation</p>
    </div>
  {:else if assignments.length === 0}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
      <svg class="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
      </svg>
      <p class="text-gray-400 font-bold">No invigilators assigned yet</p>
      <p class="text-gray-300 text-xs mt-1">Click "Auto-Assign" to distribute faculty across exam classrooms</p>
    </div>
  {:else}
    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Assignments</p>
        <p class="text-3xl font-black text-teal-600 mt-1">{assignments.length}</p>
      </div>
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unique Faculty</p>
        <p class="text-3xl font-black text-indigo-600 mt-1">{new Set(assignments.map(a => a.faculty_profile_id)).size}</p>
      </div>
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Exam Slots</p>
        <p class="text-3xl font-black text-violet-600 mt-1">{grouped().length}</p>
      </div>
      <div class="p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl">
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Classrooms</p>
        <p class="text-3xl font-black text-blue-600 mt-1">{uniqueClassrooms}</p>
      </div>
    </div>

    <!-- Grouped by Date/Slot -->
    <div class="space-y-4">
      {#each grouped() as [slotKey, slotAssignments], i}
        {@const first = slotAssignments[0]}
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ y: 15, delay: i * 50 }}>
          <div class="p-4 bg-gray-50 dark:bg-slate-800/50 flex items-center gap-4 flex-wrap">
            <div class="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-black">
              {fmtDate(first.exam_date)}
            </div>
            <span class="text-xs font-bold text-gray-500">{fmtTime(first.slot_start)} — {fmtTime(first.slot_end)}</span>
            <span class="text-[10px] font-bold text-gray-400">{slotAssignments.length} invigilators</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 dark:border-slate-800">
                  <th class="px-4 py-2">Faculty</th>
                  <th class="px-4 py-2">Classroom</th>
                  <th class="px-4 py-2">Subject</th>
                  <th class="px-4 py-2">Status</th>
                  <th class="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
                {#each slotAssignments as a}
                  <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all group">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center text-[10px] font-black text-teal-700 dark:text-teal-300">
                          {(a.faculty_name || '?')[0]}
                        </div>
                        <span class="text-xs font-bold text-gray-900 dark:text-white">{a.faculty_name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-xs font-bold text-gray-600">{a.classroom_name || '—'}</td>
                    <td class="px-4 py-3">
                      <span class="text-xs font-bold text-gray-500">{a.subject_name || '—'}</span>
                      {#if a.subject_code}
                        <span class="text-[9px] text-gray-400 ml-1">({a.subject_code})</span>
                      {/if}
                    </td>
                    <td class="px-4 py-3">
                      <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase
                        {a.assignment_status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' :
                         a.assignment_status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}">
                        {a.assignment_status || 'ASSIGNED'}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <button onclick={() => removeAssignment(a.id)}
                        class="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-all" title="Remove assignment">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
