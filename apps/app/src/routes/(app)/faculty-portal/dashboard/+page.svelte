<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let schedules = $state<any[]>([]);
  let loading = $state(true);
  let fetchError = $state<string | null>(null);
  let markingId = $state<string | null>(null);

  // Faculty profile + subjects
  let profile = $state<any>(null);
  let mySubjects = $state<any[]>([]);
  let profileLoading = $state(true);

  // Leave request
  let showLeavePanel = $state(false);
  let leaveHistory = $state<any[]>([]);
  let leaveHistoryLoading = $state(false);
  let leaveForm = $state({ leave_type: 'CASUAL', leave_date: '', leave_end_date: '', reason: '' });
  let leaveSubmitting = $state(false);
  let leaveError = $state('');
  let leaveSuccess = $state('');

  const leaveTypes = [
    { key: 'CASUAL', label: 'Casual' },
    { key: 'SICK',   label: 'Sick' },
    { key: 'EARNED', label: 'Earned' },
    { key: 'DUTY',   label: 'On Duty' },
  ];

  function leaveLabel(type: string) {
    return leaveTypes.find(t => t.key === type)?.label ?? type;
  }

  function statusStyle(s: string) {
    if (s === 'APPROVED') return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    if (s === 'REJECTED') return 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400';
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }

  function sessionBadge(status: string) {
    if (status === 'COMPLETED')   return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    if (status === 'IN_PROGRESS') return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400';
    if (status === 'CANCELLED')   return 'bg-gray-100 dark:bg-gray-700 text-gray-500';
    return 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }

  // Group subjects by semester (deduplicated by term_name, not term_id)
  const subjectsBySemester = $derived(() => {
    const semMap = new Map<string, { term_name: string; subjects: Map<string, any> }>();
    for (const s of mySubjects) {
      const termKey = s.term_name || 'Unassigned';
      if (!semMap.has(termKey)) {
        semMap.set(termKey, { term_name: termKey, subjects: new Map() });
      }
      const sem = semMap.get(termKey)!;
      if (!sem.subjects.has(s.subject_id)) {
        sem.subjects.set(s.subject_id, { ...s, sections: [] });
      }
      const subj = sem.subjects.get(s.subject_id)!;
      if (s.section_id && !subj.sections.some((sec: any) => sec.section_id === s.section_id)) {
        subj.sections.push({ section_id: s.section_id, section_name: s.section_name, batch_code: s.batch_code, program_name: s.program_name });
      }
    }
    return Array.from(semMap.values()).map(sem => ({
      ...sem,
      subjects: Array.from(sem.subjects.values())
    }));
  });

  const uniqueSubjectCount = $derived(() => {
    const ids = new Set<string>();
    for (const s of mySubjects) ids.add(s.subject_id);
    return ids.size;
  });

  const conducted = $derived(schedules.filter(s => s.status === 'COMPLETED').length);
  const remaining = $derived(schedules.filter(s => s.status !== 'COMPLETED' && s.status !== 'CANCELLED').length);
  const todayStr  = new Date().toISOString().split('T')[0];
  const today     = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function fetchMySchedule() {
    loading = true; fetchError = null;
    try {
      const res = await fetch('/api/faculty/schedule');
      if (!res.ok) throw new Error('Failed to load schedule');
      schedules = await res.json();
    } catch (e: any) {
      fetchError = e.message ?? 'Could not load schedule';
      schedules = [];
    } finally { loading = false; }
  }

  async function fetchProfile() {
    profileLoading = true;
    try {
      const res = await fetch('/api/academic/faculty/me');
      if (res.ok) {
        const data = await res.json();
        profile = data.profile;
        mySubjects = data.subjects || [];
      }
    } catch { } finally { profileLoading = false; }
  }

  async function fetchLeaveHistory() {
    leaveHistoryLoading = true;
    try {
      const res = await fetch('/api/academic/faculty/leave-requests');
      if (res.ok) leaveHistory = await res.json();
    } catch { } finally { leaveHistoryLoading = false; }
  }

  async function markConducted(sessionId: string) {
    markingId = sessionId;
    try {
      const res = await fetch(`/api/academic/scheduling/sessions/${sessionId}/mark-conducted`, { method: 'PATCH' });
      if (res.ok) schedules = schedules.map(s => s.id === sessionId ? { ...s, status: 'COMPLETED' } : s);
    } catch { } finally { markingId = null; }
  }

  const leaveTotalDays = $derived(() => {
    if (!leaveForm.leave_date) return 0;
    const end = leaveForm.leave_end_date || leaveForm.leave_date;
    const diff = Math.round((new Date(end).getTime() - new Date(leaveForm.leave_date).getTime()) / (1000 * 60 * 60 * 24));
    return diff + 1;
  });

  async function submitLeaveRequest() {
    leaveError = ''; leaveSuccess = '';
    if (!leaveForm.leave_date) { leaveError = 'Please select a start date.'; return; }
    if (leaveForm.leave_end_date && leaveForm.leave_end_date < leaveForm.leave_date) {
      leaveError = 'End date cannot be before start date.'; return;
    }
    leaveSubmitting = true;
    try {
      const res = await fetch('/api/academic/faculty/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveForm)
      });
      const data = await res.json();
      if (res.ok) {
        leaveSuccess = 'Request submitted — pending approval.';
        leaveForm = { leave_type: 'CASUAL', leave_date: '', leave_end_date: '', reason: '' };
        leaveHistory = [data, ...leaveHistory];
      } else {
        leaveError = data?.message || 'Submission failed.';
      }
    } catch { leaveError = 'Network error. Please try again.'; }
    finally { leaveSubmitting = false; }
  }

  async function cancelLeave(id: string) {
    try {
      const res = await fetch(`/api/academic/faculty/leave-requests?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        leaveHistory = leaveHistory.filter(r => r.id !== id);
        leaveSuccess = 'Leave request cancelled.';
        setTimeout(() => leaveSuccess = '', 3000);
      } else {
        const data = await res.json();
        leaveError = data?.message || 'Failed to cancel.';
      }
    } catch { leaveError = 'Network error.'; }
  }

  function openLeavePanel() {
    showLeavePanel = true; leaveError = ''; leaveSuccess = '';
    fetchLeaveHistory();
  }

  onMount(() => {
    fetchMySchedule();
    fetchProfile();
  });
</script>

<div class="space-y-8" in:fade>

  <!-- Header Banner -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl shadow-indigo-600/20 overflow-hidden relative gap-4">
    <div class="absolute -right-20 -top-20 w-60 h-60 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="relative z-10">
      <p class="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1">Faculty Portal</p>
      <h2 class="text-2xl sm:text-3xl font-black tracking-tight">
        {#if profile?.name}Welcome, <span class="bg-white text-indigo-600 px-3 py-1 rounded-2xl ml-1">{profile.name.split(' ')[0]}</span>
        {:else}Academic <span class="bg-white text-indigo-600 px-3 py-1 rounded-2xl ml-1">Workspace</span>{/if}
      </h2>
      <p class="text-indigo-200 text-xs font-medium mt-2">{today}</p>
    </div>
    <div class="flex items-center gap-3 relative z-10 shrink-0">
      <div class="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl">
        <span class="text-[10px] font-black uppercase tracking-widest text-indigo-100">Sessions</span>
        <span class="text-sm font-black">{loading ? '—' : conducted}/{loading ? '—' : schedules.length}</span>
      </div>
      <button onclick={openLeavePanel} class="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
        Apply Leave
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

    <!-- Session Timeline -->
    <div class="lg:col-span-2 space-y-6">
      <h3 class="text-xl font-black text-gray-900 dark:text-white px-1">Today's <span class="text-indigo-600">Sessions</span></h3>

      {#if loading}
        <div class="p-20 flex flex-col items-center justify-center">
          <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent animate-spin rounded-full mb-4"></div>
          <p class="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading schedule...</p>
        </div>
      {:else if fetchError}
        <div class="p-12 bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-500/20 rounded-[3rem] flex flex-col items-center text-center">
          <p class="text-sm font-black text-gray-900 dark:text-white">Could not load schedule</p>
          <p class="text-xs text-gray-400 mt-1">{fetchError}</p>
          <button onclick={fetchMySchedule} class="mt-4 px-5 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all">Retry</button>
        </div>
      {:else if schedules.length === 0}
        <div class="p-20 bg-white dark:bg-slate-900 rounded-[3rem] border border-gray-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
          <div class="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-full mb-6 flex items-center justify-center">
            <svg class="w-9 h-9 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p class="text-sm font-black text-gray-900 dark:text-white">No Sessions Today</p>
          <p class="text-[10px] uppercase tracking-widest text-gray-400 mt-2">Your schedule is clear for today</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each schedules as session, i}
            <div class="p-6 sm:p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:shadow-xl hover:shadow-indigo-600/5 transition-all" in:fly={{ y: 20, delay: i * 60 }}>
              <div class="flex items-center gap-6 flex-1 min-w-0">
                <div class="flex flex-col items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl min-w-[90px] shrink-0">
                  <p class="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{session.start_time}</p>
                  <div class="w-4 h-0.5 bg-indigo-200 dark:bg-indigo-500/30 rounded-full my-1"></div>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">{session.end_time}</p>
                </div>
                <div class="min-w-0">
                  <h4 class="text-base font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-all uppercase tracking-tight truncate">{session.subject_name}</h4>
                  <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{session.section_name}</span>
                    <span class="w-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></span>
                    <span class="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{session.room_code}</span>
                    {#if session.session_type && session.session_type !== 'LECTURE'}
                      <span class="text-[9px] font-black text-violet-500 uppercase tracking-widest px-2 py-0.5 bg-violet-50 dark:bg-violet-500/10 rounded-full">{session.session_type}</span>
                    {/if}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest {sessionBadge(session.status)}">
                  {session.status === 'COMPLETED' ? 'Conducted' : session.status === 'IN_PROGRESS' ? 'Ongoing' : 'Upcoming'}
                </span>
                {#if session.status !== 'COMPLETED' && session.status !== 'CANCELLED'}
                  <button onclick={() => markConducted(session.id)} disabled={markingId === session.id} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-wait">
                    {markingId === session.id ? '...' : 'Mark Conducted'}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Right Sidebar -->
    <div class="space-y-5">

      <!-- Profile Summary -->
      {#if profile}
        <div class="p-7 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
          <div class="flex items-center gap-4 mb-5">
            <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-sm font-black">
              {(profile.name || 'F').slice(0, 2).toUpperCase()}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-black text-gray-900 dark:text-white truncate">{profile.name || profile.employee_code}</p>
              <p class="text-[10px] text-gray-400 font-medium">{profile.designation || 'Faculty'} · {profile.department || '—'}</p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl text-center">
              <p class="text-lg font-black text-indigo-600 dark:text-indigo-400">{uniqueSubjectCount()}</p>
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Subjects</p>
            </div>
            <div class="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl text-center">
              <p class="text-lg font-black text-emerald-600 dark:text-emerald-400">{loading ? '—' : conducted}</p>
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Done</p>
            </div>
            <div class="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl text-center">
              <p class="text-lg font-black text-amber-600 dark:text-amber-400">{loading ? '—' : remaining}</p>
              <p class="text-[8px] font-black text-gray-400 uppercase tracking-widest">Left</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- My Subjects by Semester -->
      <div class="p-7 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm">
        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">My Subjects by Semester</p>
        {#if profileLoading}
          <div class="flex justify-center py-6">
            <div class="w-6 h-6 border-3 border-indigo-600 border-t-transparent animate-spin rounded-full"></div>
          </div>
        {:else if subjectsBySemester().length === 0}
          <p class="text-xs text-gray-400 text-center py-4">No subjects assigned yet</p>
        {:else}
          <div class="space-y-4">
            {#each subjectsBySemester() as sem}
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                  <span class="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{sem.term_name}</span>
                </div>
                <div class="space-y-2 pl-3.5 border-l-2 border-indigo-100 dark:border-indigo-500/20">
                  {#each sem.subjects as subj}
                    <div class="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-2xl">
                      <div class="flex items-center gap-2 mb-1.5">
                        <span class="text-[8px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-lg">{subj.subject_code}</span>
                        <span class="text-xs font-black text-gray-900 dark:text-white truncate">{subj.subject_name}</span>
                      </div>
                      {#if subj.sections.length > 0}
                        <div class="flex flex-wrap gap-1.5">
                          {#each subj.sections as sec}
                            <span class="px-2 py-0.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-[9px] font-bold text-gray-600 dark:text-gray-300">
                              {sec.program_name}{#if sec.section_name} · {sec.section_name}{/if}{#if sec.batch_code} ({sec.batch_code}){/if}
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Quick Actions -->
      <div class="space-y-3">
        <a href="/faculty-portal/marks" class="w-full p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] shadow-sm flex items-center gap-4 group hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-600/5 transition-all">
          <div class="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center group-hover:bg-violet-600 transition-all shrink-0">
            <svg class="w-5 h-5 text-violet-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-black text-gray-900 dark:text-white group-hover:text-violet-600 transition-colors">Enter Marks</p>
            <p class="text-[10px] text-gray-400 font-medium mt-0.5">Mid 1, Mid 2, Sem, Lab exams</p>
          </div>
          <svg class="w-4 h-4 text-gray-300 dark:text-slate-600 shrink-0 group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
        </a>

        <button onclick={openLeavePanel} class="w-full p-5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] shadow-sm flex items-center gap-4 group hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-600/5 transition-all text-left">
          <div class="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center group-hover:bg-indigo-600 transition-all shrink-0">
            <svg class="w-5 h-5 text-indigo-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">Leave Requests</p>
            <p class="text-[10px] text-gray-400 font-medium mt-0.5">Apply & track your leave history</p>
          </div>
          <svg class="w-4 h-4 text-gray-300 dark:text-slate-600 shrink-0 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Leave Request Slide-in Panel -->
{#if showLeavePanel}
  <div class="fixed inset-0 z-50 flex" transition:fade={{ duration: 150 }}>
    <button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => showLeavePanel = false} aria-label="Close"></button>

    <div class="relative ml-auto w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden" transition:fly={{ x: 440, duration: 300 }}>

      <!-- Panel Header -->
      <div class="flex items-center justify-between px-8 py-6 border-b border-gray-100 dark:border-slate-800 shrink-0">
        <div>
          <h2 class="text-lg font-black text-gray-900 dark:text-white">Leave Request</h2>
          <p class="text-xs text-gray-400 font-medium mt-0.5">Submitted for department approval</p>
        </div>
        <button onclick={() => showLeavePanel = false} class="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">

        <!-- New Request Form -->
        <div class="px-8 py-6 border-b border-gray-100 dark:border-slate-800">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5">Apply for Leave</p>

          <!-- Leave Type -->
          <div class="mb-5">
            <label class="text-xs font-black text-gray-500 uppercase tracking-widest block mb-3">Leave Type</label>
            <div class="grid grid-cols-2 gap-2">
              {#each leaveTypes as t}
                <button
                  onclick={() => leaveForm.leave_type = t.key}
                  class="py-3 px-4 rounded-2xl border-2 text-xs font-black uppercase tracking-widest transition-all
                    {leaveForm.leave_type === t.key
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600'
                      : 'border-gray-100 dark:border-slate-700 text-gray-500 hover:border-gray-300 dark:hover:border-slate-600'}"
                >{t.label}</button>
              {/each}
            </div>
          </div>

          <!-- Date Range -->
          <div class="mb-5">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-black text-gray-500 uppercase tracking-widest">Date Range</label>
              {#if leaveTotalDays() > 0}
                <span class="text-[10px] font-black px-2.5 py-1 rounded-lg {leaveTotalDays() === 1 ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}">
                  {leaveTotalDays()} day{leaveTotalDays() > 1 ? 's' : ''}
                </span>
              {/if}
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">From</p>
                <input type="date" bind:value={leaveForm.leave_date} min={todayStr}
                  class="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div>
                <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">To <span class="normal-case font-medium">(optional)</span></p>
                <input type="date" bind:value={leaveForm.leave_end_date} min={leaveForm.leave_date || todayStr}
                  class="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
            </div>
          </div>

          <!-- Reason -->
          <div class="mb-5">
            <label class="text-xs font-black text-gray-500 uppercase tracking-widest block mb-2">Reason <span class="normal-case font-medium text-gray-400">(optional)</span></label>
            <textarea bind:value={leaveForm.reason} rows="3" placeholder="Brief reason for leave..."
              class="w-full px-5 py-3.5 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 transition-all resize-none"></textarea>
          </div>

          {#if leaveError}
            <div class="mb-4 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl">
              <p class="text-xs font-bold text-rose-600 dark:text-rose-400">{leaveError}</p>
            </div>
          {/if}
          {#if leaveSuccess}
            <div class="mb-4 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3">
              <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
              <p class="text-xs font-bold text-emerald-700 dark:text-emerald-400">{leaveSuccess}</p>
            </div>
          {/if}

          <button onclick={submitLeaveRequest} disabled={leaveSubmitting}
            class="w-full py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait shadow-lg shadow-indigo-600/20">
            {leaveSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>

        <!-- Leave History -->
        <div class="px-8 py-6">
          <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Recent History</p>
          {#if leaveHistoryLoading}
            <div class="flex justify-center py-8">
              <svg class="w-5 h-5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            </div>
          {:else if leaveHistory.length === 0}
            <p class="text-xs text-gray-400 font-medium text-center py-8">No leave requests yet</p>
          {:else}
            <div class="space-y-3">
              {#each leaveHistory as req, i}
                <div class="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-between gap-3" in:fly={{ y: 10, delay: i * 40 }}>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-xs font-black text-gray-900 dark:text-white">{leaveLabel(req.leave_type)} Leave</p>
                      {#if req.total_days > 1}
                        <span class="text-[9px] font-black px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/20 text-amber-600 rounded-md">{req.total_days}d</span>
                      {/if}
                    </div>
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">
                      {new Date(req.leave_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {#if req.leave_end_date && req.leave_end_date !== req.leave_date}
                        → {new Date(req.leave_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {/if}
                    </p>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest {statusStyle(req.approval_status)}">{req.approval_status}</span>
                    {#if req.approval_status === 'PENDING'}
                      <button onclick={() => cancelLeave(req.id)} class="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors" title="Cancel this request">
                        Cancel
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  input[type="date"]::-webkit-calendar-picker-indicator { filter: opacity(0.4); cursor: pointer; }
</style>
