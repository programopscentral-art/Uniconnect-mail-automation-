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

  // Group: date+slot → classroom → { invigilators[], subjects[], subjectCodes[] }
  interface ClassroomRow {
    classroomName: string;
    classroomId: string;
    invigilators: { id: string; name: string; assignmentId: string }[];
    subjects: string[];
    subjectCodes: string[];
  }
  interface SlotGroup {
    key: string;
    examDate: string;
    slotStart: string;
    slotEnd: string;
    classrooms: ClassroomRow[];
  }

  const grouped = $derived((): SlotGroup[] => {
    const slotMap = new Map<string, { examDate: string; slotStart: string; slotEnd: string; classroomMap: Map<string, ClassroomRow> }>();

    for (const a of assignments) {
      const slotKey = `${a.exam_date}_${a.slot_start}`;
      if (!slotMap.has(slotKey)) {
        slotMap.set(slotKey, { examDate: a.exam_date, slotStart: a.slot_start, slotEnd: a.slot_end, classroomMap: new Map() });
      }
      const slot = slotMap.get(slotKey)!;
      const cId = a.classroom_id || 'unknown';
      const cName = a.classroom_name || '—';

      if (!slot.classroomMap.has(cId)) {
        slot.classroomMap.set(cId, { classroomName: cName, classroomId: cId, invigilators: [], subjects: [], subjectCodes: [] });
      }
      const room = slot.classroomMap.get(cId)!;

      // Add invigilator if not already present
      if (!room.invigilators.some(inv => inv.id === a.faculty_profile_id)) {
        room.invigilators.push({ id: a.faculty_profile_id, name: a.faculty_name || 'Unknown', assignmentId: a.id });
      }

      // Add subjects from all_subjects or single subject
      if (a.all_subjects) {
        for (const s of a.all_subjects.split(', ')) {
          if (s && !room.subjects.includes(s)) room.subjects.push(s);
        }
      } else if (a.subject_name && !room.subjects.includes(a.subject_name)) {
        room.subjects.push(a.subject_name);
      }

      if (a.all_subject_codes) {
        for (const c of a.all_subject_codes.split(', ')) {
          if (c && !room.subjectCodes.includes(c)) room.subjectCodes.push(c);
        }
      } else if (a.subject_code && !room.subjectCodes.includes(a.subject_code)) {
        room.subjectCodes.push(a.subject_code);
      }
    }

    return [...slotMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, val]) => ({
        key,
        examDate: val.examDate,
        slotStart: val.slotStart,
        slotEnd: val.slotEnd,
        classrooms: [...val.classroomMap.values()].sort((a, b) => a.classroomName.localeCompare(b.classroomName))
      }));
  });

  const uniqueClassrooms = $derived(new Set(assignments.map(a => a.classroom_id).filter(Boolean)).size);
  const uniqueFaculty = $derived(new Set(assignments.map(a => a.faculty_profile_id)).size);

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
        {#if assignments.length > 0}
          <a href="/api/academic/exams/plans/{selectedPlanId}/export-invigilation" target="_blank"
            class="px-4 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-lg active:scale-95 inline-flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Export
          </a>
        {/if}
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
        <p class="text-3xl font-black text-indigo-600 mt-1">{uniqueFaculty}</p>
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
    <div class="space-y-5">
      {#each grouped() as slot, i}
        <div class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden" in:fly={{ y: 15, delay: i * 50 }}>
          <!-- Slot Header -->
          <div class="px-5 py-3 bg-gray-50 dark:bg-slate-800/50 flex items-center gap-4 flex-wrap border-b border-gray-100 dark:border-slate-800">
            <div class="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-black">
              {fmtDate(slot.examDate)}
            </div>
            <span class="text-xs font-bold text-gray-500">{fmtTime(slot.slotStart)} — {fmtTime(slot.slotEnd)}</span>
            <span class="text-[10px] font-bold text-gray-400">{slot.classrooms.length} classrooms</span>
          </div>

          <!-- Table: one row per classroom -->
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-slate-800">
                  <th class="px-5 py-2.5 w-10">#</th>
                  <th class="px-5 py-2.5">Classroom</th>
                  <th class="px-5 py-2.5">Invigilators</th>
                  <th class="px-5 py-2.5">Subjects</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 dark:divide-slate-800">
                {#each slot.classrooms as room, ri}
                  <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-all group">
                    <td class="px-5 py-3 text-xs font-bold text-gray-300">{ri + 1}</td>
                    <td class="px-5 py-3">
                      <span class="text-sm font-extrabold text-gray-900 dark:text-white">{room.classroomName}</span>
                    </td>
                    <td class="px-5 py-3">
                      <div class="flex flex-wrap gap-2">
                        {#each room.invigilators as inv}
                          <div class="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-lg group/inv">
                            <div class="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[8px] font-black shrink-0">
                              {inv.name[0]}
                            </div>
                            <span class="text-xs font-bold text-teal-800 dark:text-teal-300">{inv.name}</span>
                            <button onclick={() => removeAssignment(inv.assignmentId)}
                              class="opacity-0 group-hover/inv:opacity-100 ml-0.5 text-gray-300 hover:text-rose-500 transition-all" title="Remove">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        {/each}
                      </div>
                    </td>
                    <td class="px-5 py-3">
                      <div class="flex flex-wrap gap-1.5">
                        {#each room.subjects as subj, si}
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded text-xs font-bold text-indigo-700 dark:text-indigo-300">
                            {subj}
                            {#if room.subjectCodes[si]}
                              <span class="text-[9px] font-semibold text-indigo-400">({room.subjectCodes[si]})</span>
                            {/if}
                          </span>
                        {/each}
                      </div>
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
