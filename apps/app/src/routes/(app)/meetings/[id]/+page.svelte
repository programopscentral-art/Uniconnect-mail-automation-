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

  function statusColor(s: string) {
    switch (s) {
      case 'COMPLETED': return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400';
      case 'PROCESSING': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
      case 'FAILED': return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
      case 'NO_DATA': return 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400';
      default: return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
    }
  }

  function responseColor(s: string) {
    switch (s) {
      case 'accepted': return 'text-green-600 dark:text-green-400';
      case 'declined': return 'text-red-500';
      case 'tentative': return 'text-amber-600 dark:text-amber-400';
      default: return 'text-gray-400';
    }
  }

  let meeting = $derived(meetingData?.meeting);
  let invitees = $derived(meetingData?.invitees || []);
  let participants = $derived(meetingData?.participants || []);
  let attendance = $derived(meetingData?.attendance || []);
  let summary = $derived(meetingData?.summary || {});
</script>

<svelte:head>
  <title>{meeting?.title || 'Meeting'} | UniConnect</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
  <div class="max-w-6xl mx-auto space-y-6">
    <!-- Back -->
    <button onclick={() => goto('/meetings')} class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
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
          <div>
            <h1 class="text-xl font-black text-gray-900 dark:text-white">{meeting.title}</h1>
            <div class="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Organized by <strong class="text-gray-700 dark:text-gray-300">{meeting.organizer_name || meeting.organizer_email}</strong></span>
              <span>&middot;</span>
              <span>{formatDate(meeting.scheduled_start)}</span>
              {#if meeting.duration_minutes}
                <span>&middot;</span>
                <span>{meeting.duration_minutes}min</span>
              {/if}
            </div>
            {#if meeting.meet_link}
              <a href={meeting.meet_link} target="_blank" rel="noopener" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1 inline-block">{meeting.meet_link}</a>
            {/if}
          </div>
          <div class="flex items-center gap-3">
            <span class="px-3 py-1.5 rounded-full text-xs font-bold {statusColor(meeting.status)}">{meeting.status}</span>
            {#if meeting.status === 'DISCOVERED' || meeting.status === 'FAILED' || meeting.status === 'NO_DATA'}
              <button onclick={processMeeting} disabled={isProcessing} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                {isProcessing ? 'Processing...' : 'Process Meeting'}
              </button>
            {/if}
          </div>
        </div>

        {#if meeting.processing_error}
          <div class="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
            {meeting.processing_error}
          </div>
        {/if}
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-xs text-gray-500 uppercase">Invited</p>
          <p class="text-2xl font-black text-gray-900 dark:text-white">{summary.invited || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-xs text-gray-500 uppercase">Attended</p>
          <p class="text-2xl font-black text-green-600 dark:text-green-400">{summary.attended || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-xs text-gray-500 uppercase">Absent</p>
          <p class="text-2xl font-black text-red-500">{summary.absent || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-xs text-gray-500 uppercase">Accepted but Absent</p>
          <p class="text-2xl font-black text-amber-600 dark:text-amber-400">{summary.accepted_but_absent || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
          <p class="text-xs text-gray-500 uppercase">Attendance Rate</p>
          <p class="text-2xl font-black text-indigo-600 dark:text-indigo-400">{summary.attendance_rate || 0}%</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {#each [['overview', 'Overview'], ['attendance', 'Attendance'], ['transcript', 'Transcript'], ['ai-report', 'AI Report']] as [tab, label]}
          <button
            onclick={() => activeTab = tab as any}
            class="px-4 py-2 rounded-lg text-sm font-semibold transition-all {activeTab === tab ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}"
          >
            {label}
          </button>
        {/each}
      </div>

      <!-- Tab Content -->
      {#if activeTab === 'overview'}
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6 space-y-4">
          <h3 class="font-bold text-gray-900 dark:text-white">Meeting Details</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><span class="text-gray-500">Source:</span> <span class="ml-2 font-medium text-gray-900 dark:text-white">{meeting.source}</span></div>
            <div><span class="text-gray-500">Meet Code:</span> <span class="ml-2 font-medium text-gray-900 dark:text-white">{meeting.google_meet_code || '-'}</span></div>
            <div><span class="text-gray-500">Scheduled:</span> <span class="ml-2 font-medium text-gray-900 dark:text-white">{formatDate(meeting.scheduled_start)} - {formatDate(meeting.scheduled_end)}</span></div>
            <div><span class="text-gray-500">Participants:</span> <span class="ml-2 font-medium text-gray-900 dark:text-white">{meeting.participant_count}</span></div>
            {#if meeting.transcript_doc_url}
              <div><span class="text-gray-500">Transcript:</span> <a href={meeting.transcript_doc_url} target="_blank" class="ml-2 text-indigo-600 hover:underline">View in Google Docs</a></div>
            {/if}
            {#if meeting.recording_url}
              <div><span class="text-gray-500">Recording:</span> <a href={meeting.recording_url} target="_blank" class="ml-2 text-indigo-600 hover:underline">View Recording</a></div>
            {/if}
          </div>
          {#if meeting.description}
            <div>
              <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{meeting.description}</p>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'attendance'}
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div class="p-5 border-b border-gray-100 dark:border-slate-800">
            <h3 class="font-bold text-gray-900 dark:text-white">Attendance Report</h3>
            <p class="text-xs text-gray-500 mt-1">Cross-referenced calendar invitees vs actual participants</p>
          </div>
          {#if attendance.length > 0}
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-100 dark:border-slate-800">
                  <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Person</th>
                  <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">RSVP</th>
                  <th class="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Attended</th>
                  <th class="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Spoke</th>
                  <th class="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase">Duration</th>
                </tr>
              </thead>
              <tbody>
                {#each attendance as inv}
                  <tr class="border-b border-gray-50 dark:border-slate-800/50">
                    <td class="px-5 py-3">
                      <p class="text-sm font-medium text-gray-900 dark:text-white">{inv.name || inv.email}</p>
                      <p class="text-xs text-gray-400">{inv.email}</p>
                    </td>
                    <td class="px-5 py-3">
                      <span class="text-sm font-medium capitalize {responseColor(inv.response_status)}">{inv.response_status}</span>
                    </td>
                    <td class="px-5 py-3 text-center">
                      {#if inv.attended}
                        <span class="inline-flex w-6 h-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20 text-green-600 text-xs font-bold">Y</span>
                      {:else}
                        <span class="inline-flex w-6 h-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 text-red-500 text-xs font-bold">N</span>
                      {/if}
                    </td>
                    <td class="px-5 py-3 text-center">
                      {#if inv.participant?.spoke_in_transcript}
                        <span class="text-sm text-green-600">{inv.participant.speaking_segments} segments</span>
                      {:else}
                        <span class="text-sm text-gray-400">-</span>
                      {/if}
                    </td>
                    <td class="px-5 py-3 text-center">
                      <span class="text-sm text-gray-700 dark:text-gray-300">
                        {inv.participant?.duration_minutes ? `${inv.participant.duration_minutes}m` : '-'}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <div class="p-10 text-center text-gray-500">
              <p>No attendance data yet. Process the meeting to extract attendance from transcript and Drive.</p>
            </div>
          {/if}

          <!-- Participants not in invitee list -->
          {#if participants.filter((p: any) => !attendance.some((a: any) => a.email?.toLowerCase() === p.email?.toLowerCase())).length > 0}
            <div class="p-5 border-t border-gray-100 dark:border-slate-800">
              <h4 class="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">Additional Participants (not in invite list)</h4>
              <div class="space-y-2">
                {#each participants.filter((p: any) => !attendance.some((a: any) => a.email?.toLowerCase() === p.email?.toLowerCase())) as p}
                  <div class="flex items-center gap-3 text-sm">
                    <span class="font-medium text-gray-900 dark:text-white">{p.name}</span>
                    <span class="text-gray-400">{p.email || 'No email'}</span>
                    {#if p.speaking_segments > 0}
                      <span class="text-xs text-indigo-600">{p.speaking_segments} speaking segments</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'transcript'}
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-gray-900 dark:text-white">Transcript</h3>
            {#if meeting.transcript_doc_url}
              <a href={meeting.transcript_doc_url} target="_blank" class="text-sm text-indigo-600 hover:underline">Open in Google Docs</a>
            {/if}
          </div>
          {#if meeting.raw_transcript}
            <div class="prose prose-sm dark:prose-invert max-w-none">
              <pre class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed bg-gray-50 dark:bg-slate-800 rounded-xl p-4 max-h-[600px] overflow-y-auto">{meeting.raw_transcript}</pre>
            </div>
          {:else}
            <div class="text-center py-10 text-gray-500">
              <p>No transcript available. {meeting.status === 'DISCOVERED' ? 'Process the meeting to extract transcript from Google Docs.' : 'The meeting may not have had transcription enabled.'}</p>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'ai-report'}
        <div class="space-y-6">
          {#if meeting.ai_summary}
            <!-- AI Summary -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
              <div class="flex items-center gap-2 mb-4">
                <div class="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 text-sm font-bold">AI</div>
                <h3 class="font-bold text-gray-900 dark:text-white">AI Summary</h3>
                {#if meeting.ai_sentiment}
                  <span class="px-2 py-0.5 rounded-full text-xs font-medium {meeting.ai_sentiment === 'positive' ? 'bg-green-100 text-green-700' : meeting.ai_sentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}">
                    {meeting.ai_sentiment}
                  </span>
                {/if}
              </div>
              <div class="prose prose-sm dark:prose-invert max-w-none">
                <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{meeting.ai_summary}</p>
              </div>
              {#if meeting.ai_processed_at}
                <p class="text-xs text-gray-400 mt-4">Generated: {formatDate(meeting.ai_processed_at)}</p>
              {/if}
            </div>

            <!-- Action Items -->
            {#if meeting.ai_action_items && (typeof meeting.ai_action_items === 'string' ? JSON.parse(meeting.ai_action_items) : meeting.ai_action_items).length > 0}
              {@const items = typeof meeting.ai_action_items === 'string' ? JSON.parse(meeting.ai_action_items) : meeting.ai_action_items}
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
                <h3 class="font-bold text-gray-900 dark:text-white mb-4">Action Items</h3>
                <div class="space-y-3">
                  {#each items as item}
                    <div class="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-500/5 rounded-xl border border-amber-100 dark:border-amber-500/10">
                      <div class="w-5 h-5 rounded border-2 border-amber-400 mt-0.5 flex-shrink-0"></div>
                      <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{item.task}</p>
                        <div class="flex gap-3 mt-1 text-xs text-gray-500">
                          {#if item.assignee}<span>Assigned to: <strong>{item.assignee}</strong></span>{/if}
                          {#if item.deadline}<span>Deadline: {item.deadline}</span>{/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Key Decisions -->
            {#if meeting.ai_key_decisions && (typeof meeting.ai_key_decisions === 'string' ? JSON.parse(meeting.ai_key_decisions) : meeting.ai_key_decisions).length > 0}
              {@const decisions = typeof meeting.ai_key_decisions === 'string' ? JSON.parse(meeting.ai_key_decisions) : meeting.ai_key_decisions}
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
                <h3 class="font-bold text-gray-900 dark:text-white mb-4">Key Decisions</h3>
                <div class="space-y-3">
                  {#each decisions as decision}
                    <div class="p-3 bg-green-50 dark:bg-green-500/5 rounded-xl border border-green-100 dark:border-green-500/10">
                      <p class="text-sm font-medium text-gray-900 dark:text-white">{decision.decision}</p>
                      {#if decision.context}
                        <p class="text-xs text-gray-500 mt-1">{decision.context}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Topics Discussed -->
            {#if meeting.ai_topics && (typeof meeting.ai_topics === 'string' ? JSON.parse(meeting.ai_topics) : meeting.ai_topics).length > 0}
              {@const topics = typeof meeting.ai_topics === 'string' ? JSON.parse(meeting.ai_topics) : meeting.ai_topics}
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
                <h3 class="font-bold text-gray-900 dark:text-white mb-4">Topics Discussed</h3>
                <div class="space-y-3">
                  {#each topics as topic}
                    <div class="p-3 bg-indigo-50 dark:bg-indigo-500/5 rounded-xl border border-indigo-100 dark:border-indigo-500/10">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-semibold text-gray-900 dark:text-white">{topic.topic}</p>
                        {#if topic.duration_estimate}
                          <span class="text-xs text-gray-400">~{topic.duration_estimate}</span>
                        {/if}
                      </div>
                      {#if topic.summary}
                        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{topic.summary}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

          {:else}
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-10 text-center">
              <div class="text-4xl mb-3">🤖</div>
              <h3 class="font-bold text-gray-900 dark:text-white">No AI Report Yet</h3>
              <p class="text-sm text-gray-500 mt-2">
                {#if meeting.raw_transcript}
                  Transcript is available. Click "Process Meeting" to generate an AI report.
                {:else}
                  A transcript is needed to generate an AI report. Process the meeting first to extract the transcript from Google Docs.
                {/if}
              </p>
              {#if meeting.raw_transcript}
                <button onclick={processMeeting} disabled={isProcessing} class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {isProcessing ? 'Generating...' : 'Generate AI Report'}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>
