<script lang="ts">
  import { goto } from "$app/navigation";

  // @ts-ignore
  let { data } = $props();

  let meetings = $state<any[]>([]);
  let stats = $state<any>(null);
  let connections = $state<any[]>([]);
  let isLoading = $state(true);
  let isSyncing = $state(false);
  let isProcessingAll = $state(false);
  let statusFilter = $state('');
  let searchQuery = $state('');

  // Manual meeting form
  let showAddForm = $state(false);
  let manualTitle = $state('');
  let manualMeetLink = $state('');
  let manualOrganizer = $state('');
  let manualStart = $state('');
  let manualEnd = $state('');

  async function loadData() {
    try {
      const [meetingsRes, connRes] = await Promise.all([
        fetch('/api/meetings?stats=true').then(r => r.ok ? r.json() : { meetings: [], total: 0 }),
        fetch('/api/meetings/connections').then(r => r.ok ? r.json() : { connections: [] })
      ]);
      meetings = meetingsRes.meetings || [];
      stats = meetingsRes.stats || null;
      connections = connRes.connections || [];
    } catch (e) {
      console.error('[MEETINGS] Load error:', e);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    loadData();
  });

  let filteredMeetings = $derived(() => {
    let result = meetings;
    if (statusFilter) {
      result = result.filter((m: any) => m.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m: any) =>
        m.title?.toLowerCase().includes(q) ||
        m.organizer_email?.toLowerCase().includes(q) ||
        m.organizer_name?.toLowerCase().includes(q)
      );
    }
    return result;
  });

  async function syncCalendar() {
    isSyncing = true;
    try {
      const res = await fetch('/api/meetings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (res.ok) {
        alert(`Synced ${result.synced} new meetings (${result.skipped} already existed)`);
        await loadData();
      } else {
        alert(result.message || 'Sync failed');
      }
    } catch (e) {
      alert('Failed to sync calendar');
    } finally {
      isSyncing = false;
    }
  }

  async function processAllDiscovered() {
    isProcessingAll = true;
    const discovered = meetings.filter((m: any) => m.status === 'DISCOVERED' || m.status === 'FAILED');
    let processed = 0;
    for (const m of discovered) {
      try {
        await fetch(`/api/meetings/${m.id}/process`, { method: 'POST' });
        processed++;
      } catch (e) {
        console.error(`Failed to process meeting ${m.id}:`, e);
      }
    }
    alert(`Processed ${processed}/${discovered.length} meetings`);
    await loadData();
    isProcessingAll = false;
  }

  async function addManualMeeting() {
    if (!manualTitle || !manualOrganizer) {
      alert('Title and organizer email are required');
      return;
    }
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manualTitle,
          meetLink: manualMeetLink,
          organizerEmail: manualOrganizer,
          scheduledStart: manualStart || undefined,
          scheduledEnd: manualEnd || undefined
        })
      });
      if (res.ok) {
        showAddForm = false;
        manualTitle = ''; manualMeetLink = ''; manualOrganizer = ''; manualStart = ''; manualEnd = '';
        await loadData();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to add meeting');
      }
    } catch (e) {
      alert('Error adding meeting');
    }
  }

  async function deleteMeeting(id: string) {
    if (!confirm('Delete this meeting and all its data?')) return;
    try {
      await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (e) {
      alert('Failed to delete');
    }
  }

  function connectAccount() {
    window.location.href = '/api/meetings/google/start';
  }

  async function disconnectAccount() {
    if (!connections[0]) return;
    if (!confirm('Disconnect Google account? You can reconnect with updated permissions afterward.')) return;
    try {
      await fetch('/api/meetings/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connections[0].id })
      });
      connections = [];
    } catch (e) {
      alert('Failed to disconnect');
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
</script>

<svelte:head>
  <title>Meeting Intelligence | UniConnect</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
  <div class="max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black text-gray-900 dark:text-white">Meeting Intelligence</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitor Google Meet meetings, attendance, transcripts & AI-generated reports</p>
      </div>
      <div class="flex gap-3">
        {#if connections.length === 0}
          <button onclick={connectAccount} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
            Connect Google Account
          </button>
        {:else}
          <button onclick={syncCalendar} disabled={isSyncing} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50">
            {isSyncing ? 'Syncing...' : 'Sync Calendar'}
          </button>
        {/if}
        <button onclick={() => showAddForm = !showAddForm} class="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-all">
          + Add Meeting
        </button>
      </div>
    </div>

    <!-- Connection Status -->
    {#if connections.length > 0}
      <div class="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-2xl p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span class="text-sm text-green-700 dark:text-green-400 font-medium">
            Connected: <span class="font-bold">{connections[0].email}</span>
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick={connectAccount} class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            Reconnect (Update Permissions)
          </button>
          <button onclick={disconnectAccount} class="text-xs text-red-500 hover:underline font-medium">
            Disconnect
          </button>
        </div>
      </div>
    {/if}

    <!-- Stats Cards -->
    {#if stats}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800">
          <p class="text-xs text-gray-500 uppercase tracking-wider">Total Meetings</p>
          <p class="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.total_meetings || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800">
          <p class="text-xs text-gray-500 uppercase tracking-wider">With AI Reports</p>
          <p class="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{stats.with_ai_report || 0}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800">
          <p class="text-xs text-gray-500 uppercase tracking-wider">Avg Participants</p>
          <p class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{Math.round(stats.avg_participants || 0)}</p>
        </div>
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-100 dark:border-slate-800">
          <p class="text-xs text-gray-500 uppercase tracking-wider">Avg Duration</p>
          <p class="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{Math.round(stats.avg_duration_minutes || 0)}m</p>
        </div>
      </div>
    {/if}

    <!-- Add Manual Meeting Form -->
    {#if showAddForm}
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6 space-y-4">
        <h3 class="font-bold text-gray-900 dark:text-white">Add Meeting Manually</h3>
        <p class="text-xs text-gray-500">For ad-hoc meetings that weren't on the calendar</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title *</label>
            <input bind:value={manualTitle} placeholder="Weekly standup" class="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Organizer Email *</label>
            <input bind:value={manualOrganizer} placeholder="organizer@nxtwave.in" class="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Meet Link</label>
            <input bind:value={manualMeetLink} placeholder="https://meet.google.com/abc-defg-hij" class="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Scheduled Start</label>
            <input type="datetime-local" bind:value={manualStart} class="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white" />
          </div>
        </div>
        <div class="flex gap-3">
          <button onclick={addManualMeeting} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">Add Meeting</button>
          <button onclick={() => showAddForm = false} class="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-4">
      <input bind:value={searchQuery} placeholder="Search meetings..." class="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white w-64" />
      <select bind:value={statusFilter} class="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white">
        <option value="">All Statuses</option>
        <option value="DISCOVERED">Discovered</option>
        <option value="PROCESSING">Processing</option>
        <option value="COMPLETED">Completed</option>
        <option value="FAILED">Failed</option>
        <option value="NO_DATA">No Data</option>
      </select>
      {#if meetings.some((m: any) => m.status === 'DISCOVERED' || m.status === 'FAILED')}
        <button onclick={processAllDiscovered} disabled={isProcessingAll} class="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
          {isProcessingAll ? 'Processing...' : 'Process All Pending'}
        </button>
      {/if}
    </div>

    <!-- Meetings Table -->
    {#if isLoading}
      <div class="flex items-center justify-center py-20">
        <div class="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent"></div>
      </div>
    {:else if filteredMeetings().length === 0}
      <div class="text-center py-20">
        <div class="text-5xl mb-4">📹</div>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">No meetings found</h3>
        <p class="text-sm text-gray-500 mt-2">
          {#if connections.length === 0}
            Connect your Google account to start syncing meetings from Calendar.
          {:else}
            Click "Sync Calendar" to fetch meetings, or add one manually.
          {/if}
        </p>
      </div>
    {:else}
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-100 dark:border-slate-800">
                <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Meeting</th>
                <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Organizer</th>
                <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th class="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Invited</th>
                <th class="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Attended</th>
                <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredMeetings() as meeting (meeting.id)}
                <tr class="border-b border-gray-50 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td class="px-5 py-4">
                    <button onclick={() => goto(`/meetings/${meeting.id}`)} class="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left">
                      {meeting.title}
                    </button>
                    <p class="text-xs text-gray-400 mt-0.5">
                      {meeting.source}
                      {#if meeting.ai_summary}
                        <span class="ml-1 text-indigo-500">AI Report</span>
                      {/if}
                    </p>
                  </td>
                  <td class="px-5 py-4">
                    <p class="text-sm text-gray-700 dark:text-gray-300">{meeting.organizer_name || meeting.organizer_email}</p>
                  </td>
                  <td class="px-5 py-4">
                    <p class="text-sm text-gray-700 dark:text-gray-300">{formatDate(meeting.scheduled_start)}</p>
                  </td>
                  <td class="px-5 py-4 text-center">
                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{meeting.invitee_count || 0}</span>
                  </td>
                  <td class="px-5 py-4 text-center">
                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{meeting.actual_participant_count || meeting.participant_count || 0}</span>
                  </td>
                  <td class="px-5 py-4">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold {statusColor(meeting.status)}">{meeting.status}</span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex gap-2">
                      <button onclick={() => goto(`/meetings/${meeting.id}`)} class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                        View
                      </button>
                      {#if meeting.status !== 'PROCESSING'}
                        <button onclick={async () => { await fetch(`/api/meetings/${meeting.id}/process`, { method: 'POST' }); loadData(); }} class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                          {meeting.status === 'DISCOVERED' || meeting.status === 'FAILED' || meeting.status === 'NO_DATA' ? 'Process' : 'Re-process'}
                        </button>
                      {/if}
                      <button onclick={() => deleteMeeting(meeting.id)} class="text-xs text-red-500 hover:underline font-medium">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>
