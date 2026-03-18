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
    } catch {}
    loading = false;
  }

  async function loadAssignments() {
    if (!selectedPlanId) return;
    try {
      const res = await fetch(`/api/academic/exams/plans/${selectedPlanId}/invigilation`);
      if (res.ok) assignments = await res.json();
    } catch {}
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
        if (result.error) alert(result.error);
        else {
          alert(`Auto-assigned ${result.assignments_count} invigilators!`);
          await loadAssignments();
        }
      }
    } catch {}
    assigning = false;
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
          class="px-5 py-2.5 bg-teal-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-all shadow-sm">
          {assigning ? 'Assigning...' : 'Auto-Assign Invigilators'}
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="p-20 text-center">
      <div class="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  {:else if !selectedPlanId}
    <div class="p-20 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-center">
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
    <div class="grid grid-cols-3 gap-4">
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
    </div>

    <!-- Grouped by Date/Slot -->
    <div class="space-y-4">
      {#each grouped() as [slotKey, slotAssignments], i}
        {@const first = slotAssignments[0]}
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ y: 15, delay: i * 50 }}>
          <div class="p-4 bg-gray-50 dark:bg-slate-800/50 flex items-center gap-4">
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
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
                {#each slotAssignments as a}
                  <tr class="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center text-[10px] font-black text-teal-700 dark:text-teal-300">
                          {(a.faculty_name || '?')[0]}
                        </div>
                        <span class="text-xs font-bold text-gray-900 dark:text-white">{a.faculty_name}</span>
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
                      <span class="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-100 text-emerald-700">
                        {a.assignment_status || 'ASSIGNED'}
                      </span>
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
