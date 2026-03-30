<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  let meetingData = $state<any>(null);
  let isLoading = $state(true);
  let isProcessing = $state(false);
  let activeTab = $state<'overview' | 'attendance' | 'transcript' | 'ai-report'>('overview');

  const meetingId = $derived($page.params.id);

  async function loadMeeting() {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      if (res.ok) {
        meetingData = await res.json();
      } else {
        alert('Meeting not found');
        goto('/meetings');
      }
    } catch (e) {
      console.error('[MEETING_DETAIL] Load error:', e);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    if (meetingId) loadMeeting();
  });

  async function processMeeting() {
    isProcessing = true;
    try {
      const res = await fetch(`/api/meetings/${meetingId}/process`, { method: 'POST' });
      const result = await res.json();
      if (res.ok) {
        await loadMeeting();
      } else {
        alert(result.message || 'Processing failed');
      }
    } catch (e) {
      alert('Failed to process meeting');
    } finally {
      isProcessing = false;
    }
  }

  function formatDate(d: any) {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatTime(d: any) {
    if (!d) return '-';
    return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(s: string) {
    switch (s) {
      case 'COMPLETED': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'PROCESSING': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'FAILED': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'NO_DATA': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      default: return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  }

  function rsvpLabel(s: string) {
    switch (s) {
      case 'accepted': return 'Accepted';
      case 'declined': return 'Declined';
      case 'tentative': return 'Maybe';
      case 'needsAction': return 'No Response';
      default: return s;
    }
  }

  function rsvpBadge(s: string) {
    switch (s) {
      case 'accepted': return 'bg-green-500/10 text-green-400';
      case 'declined': return 'bg-red-500/10 text-red-400';
      case 'tentative': return 'bg-amber-500/10 text-amber-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  }

  let meeting = $derived(meetingData?.meeting);
  let participants = $derived(meetingData?.participants || []);
  let attendance = $derived(meetingData?.attendance || []);
  let uninvitedParticipants = $derived(meetingData?.uninvitedParticipants || []);
  let summary = $derived(meetingData?.summary || {});

  let meetingDurationMinutes = $derived(() => {
    if (!meeting) return 0;
    if (meeting.duration_minutes) return meeting.duration_minutes;
    if (meeting.scheduled_start && meeting.scheduled_end) {
      return Math.round((new Date(meeting.scheduled_end).getTime() - new Date(meeting.scheduled_start).getTime()) / 60000);
    }
    return 60;
  });
</script>

<svelte:head>
  <title>{meeting?.title || 'Meeting'} | UniConnect</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
  <div class="max-w-7xl mx-auto space-y-6">
    <button onclick={() => goto('/meetings')} class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1.5 group">
      <svg class="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      Back to Meetings
    </button>

    {#if isLoading}
      <div class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent"></div>
      </div>
    {:else if meeting}
      <!-- Header -->
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <h1 class="text-xl font-black text-gray-900 dark:text-white truncate">{meeting.title}</h1>
              <span class="px-3 py-1 rounded-full text-xs font-bold border {statusBadge(meeting.status)} flex-shrink-0">{meeting.status}</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                <strong class="text-gray-700 dark:text-gray-300">{meeting.organizer_name || meeting.organizer_email}</strong>
              </span>
              <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                {formatDate(meeting.scheduled_start)}
              </span>
              {#if meeting.duration_minutes}
                <span class="flex items-center gap-1.5">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  {meeting.duration_minutes} min
                </span>
              {/if}
            </div>
            {#if meeting.meet_link}
              <a href={meeting.meet_link} target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                {meeting.meet_link}
              </a>
            {/if}
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            {#if meeting.recording_url}
              <a href={meeting.recording_url} target="_blank" class="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-all flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Recording
              </a>
            {/if}
            {#if meeting.transcript_doc_url}
              <a href={meeting.transcript_doc_url} target="_blank" class="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-sm font-semibold hover:bg-blue-500/20 transition-all flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Transcript Doc
              </a>
            {/if}
            {#if meeting.status === 'DISCOVERED' || meeting.status === 'FAILED' || meeting.status === 'NO_DATA'}
              <button onclick={processMeeting} disabled={isProcessing} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                {isProcessing ? 'Processing...' : 'Process Meeting'}
              </button>
            {/if}
          </div>
        </div>
        {#if meeting.processing_error}
          <div class="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">{meeting.processing_error}</div>
        {/if}
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Invited</p>
          <p class="text-2xl font-black text-gray-900 dark:text-white mt-1">{summary.invited || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Attended</p>
          <p class="text-2xl font-black text-green-500 mt-1">{summary.attended || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Absent</p>
          <p class="text-2xl font-black text-red-500 mt-1">{summary.absent || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Accepted & Absent</p>
          <p class="text-2xl font-black text-amber-500 mt-1">{summary.accepted_but_absent || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Uninvited Joined</p>
          <p class="text-2xl font-black text-purple-500 mt-1">{summary.uninvited_joined || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-[10px] text-gray-500 uppercase tracking-widest">Attendance Rate</p>
          <p class="text-2xl font-black text-indigo-500 mt-1">{summary.attendance_rate || 0}%</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {#each [['overview', 'Overview'], ['attendance', 'Attendance'], ['transcript', 'Transcript'], ['ai-report', 'AI Report']] as [tab, label]}
          <button onclick={() => activeTab = tab as any} class="px-4 py-2 rounded-lg text-sm font-semibold transition-all {activeTab === tab ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}">
            {label}
          </button>
        {/each}
      </div>

      <!-- OVERVIEW TAB -->
      {#if activeTab === 'overview'}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
            <h3 class="font-bold text-gray-900 dark:text-white mb-4">Meeting Details</h3>
            <div class="space-y-3 text-sm">
              {#each [['Source', meeting.source], ['Meet Code', meeting.google_meet_code || '-'], ['Start Time', formatDate(meeting.scheduled_start)], ['End Time', formatDate(meeting.scheduled_end)], ...(meeting.actual_start ? [['Actual Start', formatDate(meeting.actual_start)]] : []), ...(meeting.actual_end ? [['Actual End', formatDate(meeting.actual_end)]] : []), ['Total Participants', String(summary.total_joined || meeting.participant_count || 0)]] as [lbl, val]}
                <div class="flex justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-0">
                  <span class="text-gray-500">{lbl}</span>
                  <span class="font-medium text-gray-900 dark:text-white {lbl === 'Meet Code' ? 'font-mono' : ''}">{val}</span>
                </div>
              {/each}
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
            <h3 class="font-bold text-gray-900 dark:text-white mb-4">Attendance Breakdown</h3>
            {#if summary.invited > 0}
              <div class="flex items-center justify-center mb-6">
                <div class="relative w-40 h-40">
                  <svg viewBox="0 0 36 36" class="w-40 h-40 -rotate-90">
                    <circle cx="18" cy="18" r="15.9155" fill="none" stroke-width="3" class="stroke-gray-100 dark:stroke-slate-800"/>
                    <circle cx="18" cy="18" r="15.9155" fill="none" stroke-width="3" stroke-dasharray="{summary.attendance_rate || 0}, 100" class="stroke-green-500 transition-all duration-1000"/>
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-3xl font-black text-gray-900 dark:text-white">{summary.attendance_rate || 0}%</span>
                    <span class="text-[10px] text-gray-500 uppercase tracking-wider">attended</span>
                  </div>
                </div>
              </div>
              <div class="space-y-2">
                {#each [[`Attended`, summary.attended || 0, 'bg-green-500'], [`Absent`, summary.absent || 0, 'bg-red-500'], [`Accepted & Absent`, summary.accepted_but_absent || 0, 'bg-amber-500'], ...(summary.uninvited_joined ? [[`Joined without invite`, summary.uninvited_joined, 'bg-purple-500']] : [])] as [lbl, count, color]}
                  <div class="flex items-center justify-between text-sm">
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full {color}"></div> {lbl}</div>
                    <span class="font-bold text-gray-900 dark:text-white">{count}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-center py-8 text-gray-500 text-sm">No invitee data from calendar yet.</div>
            {/if}
          </div>
          {#if meeting.description}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6 lg:col-span-2">
              <h3 class="font-bold text-gray-900 dark:text-white mb-2">Description</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">{meeting.description}</p>
            </div>
          {/if}
        </div>

      <!-- ATTENDANCE TAB -->
      {:else if activeTab === 'attendance'}
        <div class="space-y-6">
          {#if attendance.length > 0}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
              <div class="p-5 border-b border-gray-100 dark:border-slate-800">
                <h3 class="font-bold text-gray-900 dark:text-white">Invited Attendees</h3>
                <p class="text-xs text-gray-500 mt-1">Calendar invitees cross-referenced with actual participation</p>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                      <th class="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Person</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">RSVP</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Join Time</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leave Time</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Speaking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each attendance as inv}
                      <tr class="border-b border-gray-50 dark:border-slate-800/50 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td class="px-5 py-3">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold {inv.attended ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}">
                              {(inv.name || inv.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p class="text-sm font-semibold text-gray-900 dark:text-white">{inv.name || inv.email.split('@')[0]}</p>
                              <p class="text-[11px] text-gray-400">{inv.email}</p>
                            </div>
                            {#if inv.is_organizer}
                              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400">Organizer</span>
                            {/if}
                          </div>
                        </td>
                        <td class="px-5 py-3 text-center">
                          <span class="px-2 py-1 rounded-full text-[11px] font-semibold {rsvpBadge(inv.response_status)}">{rsvpLabel(inv.response_status)}</span>
                        </td>
                        <td class="px-5 py-3 text-center">
                          {#if inv.attended}
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-green-500/10 text-green-400">
                              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                              Joined
                            </span>
                          {:else}
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400">
                              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                              Absent
                            </span>
                          {/if}
                        </td>
                        <td class="px-5 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{inv.participant?.join_time ? formatTime(inv.participant.join_time) : '-'}</td>
                        <td class="px-5 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{inv.participant?.leave_time ? formatTime(inv.participant.leave_time) : '-'}</td>
                        <td class="px-5 py-3 text-center">
                          {#if inv.participant?.duration_minutes}
                            <div class="flex flex-col items-center gap-1">
                              <span class="text-sm font-semibold text-gray-900 dark:text-white">{inv.participant.duration_minutes}m</span>
                              <div class="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                <div class="h-full rounded-full bg-green-500 transition-all" style="width: {Math.min((inv.participant.duration_minutes / meetingDurationMinutes()) * 100, 100)}%"></div>
                              </div>
                            </div>
                          {:else}
                            <span class="text-sm text-gray-400">-</span>
                          {/if}
                        </td>
                        <td class="px-5 py-3 text-center">
                          {#if inv.participant?.spoke_in_transcript}
                            <span class="px-2 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400">{inv.participant.speaking_segments} seg</span>
                          {:else}
                            <span class="text-sm text-gray-400">-</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}

          <!-- Uninvited Participants -->
          {#if uninvitedParticipants.length > 0}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-purple-200 dark:border-purple-500/20 overflow-hidden">
              <div class="p-5 border-b border-purple-100 dark:border-purple-500/10 bg-purple-50/50 dark:bg-purple-500/5">
                <h3 class="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div class="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <svg class="w-3 h-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                  </div>
                  Joined Without Invite ({uninvitedParticipants.length})
                </h3>
                <p class="text-xs text-gray-500 mt-1">Participants who joined but were not on the calendar invite</p>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b border-gray-100 dark:border-slate-800">
                      <th class="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Person</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Source</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Join Time</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leave Time</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Speaking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each uninvitedParticipants as p}
                      <tr class="border-b border-gray-50 dark:border-slate-800/50">
                        <td class="px-5 py-3">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center text-xs font-bold">{p.name.charAt(0).toUpperCase()}</div>
                            <div>
                              <p class="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
                              <p class="text-[11px] text-gray-400">{p.email || 'No email'}</p>
                            </div>
                          </div>
                        </td>
                        <td class="px-5 py-3 text-center"><span class="px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-slate-800 text-gray-500">{p.source}</span></td>
                        <td class="px-5 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{p.join_time ? formatTime(p.join_time) : '-'}</td>
                        <td class="px-5 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{p.leave_time ? formatTime(p.leave_time) : '-'}</td>
                        <td class="px-5 py-3 text-center">{#if p.duration_minutes}<span class="text-sm font-semibold text-gray-900 dark:text-white">{p.duration_minutes}m</span>{:else}<span class="text-sm text-gray-400">-</span>{/if}</td>
                        <td class="px-5 py-3 text-center">{#if p.spoke_in_transcript}<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400">{p.speaking_segments} seg</span>{:else}<span class="text-sm text-gray-400">-</span>{/if}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}

          {#if attendance.length === 0 && participants.length === 0}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-10 text-center text-gray-500 text-sm">
              No attendance data yet. Process the meeting or use the Chrome extension to capture participant data.
            </div>
          {/if}

          <!-- Standalone participants when no invitee data -->
          {#if participants.length > 0 && attendance.length === 0}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
              <div class="p-5 border-b border-gray-100 dark:border-slate-800">
                <h3 class="font-bold text-gray-900 dark:text-white">All Participants</h3>
                <p class="text-xs text-gray-500 mt-1">Detected from transcript or Chrome extension</p>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b border-gray-100 dark:border-slate-800">
                      <th class="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Person</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Source</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Join</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leave</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                      <th class="px-5 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Speaking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each participants as p}
                      <tr class="border-b border-gray-50 dark:border-slate-800/50">
                        <td class="px-5 py-3">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-xs font-bold">{p.name.charAt(0).toUpperCase()}</div>
                            <div>
                              <p class="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
                              <p class="text-[11px] text-gray-400">{p.email || 'No email'}</p>
                            </div>
                          </div>
                        </td>
                        <td class="px-5 py-3 text-center"><span class="px-2 py-1 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-slate-800 text-gray-500">{p.source}</span></td>
                        <td class="px-5 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{p.join_time ? formatTime(p.join_time) : '-'}</td>
                        <td class="px-5 py-3 text-center text-sm text-gray-600 dark:text-gray-400">{p.leave_time ? formatTime(p.leave_time) : '-'}</td>
                        <td class="px-5 py-3 text-center">{#if p.duration_minutes}<span class="text-sm font-semibold text-gray-900 dark:text-white">{p.duration_minutes}m</span>{:else}<span class="text-sm text-gray-400">-</span>{/if}</td>
                        <td class="px-5 py-3 text-center">{#if p.spoke_in_transcript}<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400">{p.speaking_segments} seg</span>{:else}<span class="text-sm text-gray-400">-</span>{/if}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        </div>

      <!-- TRANSCRIPT TAB -->
      {:else if activeTab === 'transcript'}
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-gray-900 dark:text-white">Transcript</h3>
            {#if meeting.transcript_doc_url}
              <a href={meeting.transcript_doc_url} target="_blank" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                Open in Google Docs
              </a>
            {/if}
          </div>
          {#if meeting.raw_transcript}
            <div class="bg-gray-50 dark:bg-slate-800 rounded-xl p-5 max-h-[600px] overflow-y-auto">
              <pre class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">{meeting.raw_transcript}</pre>
            </div>
          {:else}
            <div class="text-center py-16">
              <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
                <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <h4 class="font-bold text-gray-900 dark:text-white mb-1">No Transcript Available</h4>
              <p class="text-sm text-gray-500 max-w-md mx-auto">
                {#if meeting.status === 'DISCOVERED'}
                  Click "Process Meeting" to scan Google Drive for the transcript.
                {:else if meeting.transcript_doc_url}
                  A transcript document was found but text extraction failed. <a href={meeting.transcript_doc_url} target="_blank" class="text-indigo-500 hover:underline">View it in Google Docs</a>.
                {:else}
                  No transcript found in Drive. Use the Chrome extension to capture live captions.
                {/if}
              </p>
              {#if meeting.status === 'DISCOVERED' || meeting.status === 'NO_DATA'}
                <button onclick={processMeeting} disabled={isProcessing} class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {isProcessing ? 'Processing...' : 'Process Meeting'}
                </button>
              {/if}
            </div>
          {/if}
        </div>

      <!-- AI REPORT TAB -->
      {:else if activeTab === 'ai-report'}
        <div class="space-y-6">
          {#if meeting.ai_summary}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-indigo-500/20">AI</div>
                <div>
                  <h3 class="font-bold text-gray-900 dark:text-white">Meeting Summary</h3>
                  {#if meeting.ai_processed_at}<p class="text-[11px] text-gray-400">Generated {formatDate(meeting.ai_processed_at)}</p>{/if}
                </div>
                {#if meeting.ai_sentiment}
                  <span class="ml-auto px-3 py-1 rounded-full text-xs font-bold {meeting.ai_sentiment === 'positive' ? 'bg-green-500/10 text-green-400' : meeting.ai_sentiment === 'negative' ? 'bg-red-500/10 text-red-400' : meeting.ai_sentiment === 'mixed' ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-500/10 text-gray-400'}">{meeting.ai_sentiment}</span>
                {/if}
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{meeting.ai_summary}</p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {#if meeting.ai_action_items && (typeof meeting.ai_action_items === 'string' ? JSON.parse(meeting.ai_action_items) : meeting.ai_action_items).length > 0}
                {@const items = typeof meeting.ai_action_items === 'string' ? JSON.parse(meeting.ai_action_items) : meeting.ai_action_items}
                <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
                  <h3 class="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <span class="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 text-xs">!</span>
                    Action Items ({items.length})
                  </h3>
                  <div class="space-y-3">
                    {#each items as item, i}
                      <div class="flex items-start gap-3 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                        <span class="w-5 h-5 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i+1}</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-gray-900 dark:text-white">{item.task}</p>
                          <div class="flex flex-wrap gap-2 mt-1.5">
                            {#if item.assignee}<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400">{item.assignee}</span>{/if}
                            {#if item.deadline}<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400">{item.deadline}</span>{/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if meeting.ai_key_decisions && (typeof meeting.ai_key_decisions === 'string' ? JSON.parse(meeting.ai_key_decisions) : meeting.ai_key_decisions).length > 0}
                {@const decisions = typeof meeting.ai_key_decisions === 'string' ? JSON.parse(meeting.ai_key_decisions) : meeting.ai_key_decisions}
                <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
                  <h3 class="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <span class="w-6 h-6 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 text-xs">&#10003;</span>
                    Key Decisions ({decisions.length})
                  </h3>
                  <div class="space-y-3">
                    {#each decisions as decision}
                      <div class="p-3 bg-green-500/5 rounded-xl border border-green-500/10">
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{decision.decision}</p>
                        {#if decision.context}<p class="text-xs text-gray-500 mt-1">{decision.context}</p>{/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            {#if meeting.ai_topics && (typeof meeting.ai_topics === 'string' ? JSON.parse(meeting.ai_topics) : meeting.ai_topics).length > 0}
              {@const topics = typeof meeting.ai_topics === 'string' ? JSON.parse(meeting.ai_topics) : meeting.ai_topics}
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
                <h3 class="font-bold text-gray-900 dark:text-white mb-4">Topics Discussed</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {#each topics as topic}
                    <div class="p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                      <div class="flex items-center justify-between mb-2">
                        <p class="text-sm font-bold text-gray-900 dark:text-white">{topic.topic}</p>
                        {#if topic.duration_estimate}<span class="text-[10px] text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">~{topic.duration_estimate}</span>{/if}
                      </div>
                      {#if topic.summary}<p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{topic.summary}</p>{/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {:else}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-10 text-center">
              <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
                <span class="text-2xl font-black bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">AI</span>
              </div>
              <h3 class="font-bold text-gray-900 dark:text-white text-lg">No AI Report Yet</h3>
              <p class="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                {#if meeting.raw_transcript}
                  A transcript is available. Generate an AI-powered analysis with summary, action items, and key decisions.
                {:else}
                  A transcript is needed first. Process the meeting to extract it from Google Docs, or use the Chrome extension to capture live captions.
                {/if}
              </p>
              {#if meeting.raw_transcript || meeting.status === 'DISCOVERED' || meeting.status === 'NO_DATA'}
                <button onclick={processMeeting} disabled={isProcessing} class="mt-4 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20 transition-all">
                  {isProcessing ? 'Processing...' : meeting.raw_transcript ? 'Generate AI Report' : 'Process Meeting'}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
