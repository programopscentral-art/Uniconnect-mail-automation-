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
  let processingIds = $state<Set<string>>(new Set());
  let deletingIds = $state<Set<string>>(new Set());
  let statusFilter = $state('');
  let searchQuery = $state('');

  // Manual meeting form
  let showAddForm = $state(false);
  let extensionToken = $state('');
  let showTokenModal = $state(false);
  let isGeneratingToken = $state(false);
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

  async function processMeeting(id: string) {
    processingIds = new Set([...processingIds, id]);
    try {
      const res = await fetch(`/api/meetings/${id}/process`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Processing failed' }));
        alert(`Failed to process: ${err.message || 'Unknown error'}`);
      }
      await loadData();
    } catch (e) {
      alert('Failed to process meeting — request may have timed out. Check the meeting detail page.');
      await loadData();
    } finally {
      processingIds = new Set([...processingIds].filter(x => x !== id));
    }
  }

  async function reprocessAll() {
    const toProcess = meetings.filter((m: any) => m.status !== 'PROCESSING');
    if (!confirm(`Re-process all ${toProcess.length} meetings? This may take several minutes.`)) return;
    isProcessingAll = true;
    let processed = 0;
    let failed = 0;
    for (const m of toProcess) {
      processingIds = new Set([...processingIds, m.id]);
      try {
        const res = await fetch(`/api/meetings/${m.id}/process`, { method: 'POST' });
        if (res.ok) processed++;
        else failed++;
      } catch (e) {
        failed++;
      }
      processingIds = new Set([...processingIds].filter(x => x !== m.id));
    }
    alert(`Re-processed: ${processed} succeeded, ${failed} failed out of ${toProcess.length}`);
    await loadData();
    isProcessingAll = false;
  }

  async function deleteMeeting(id: string) {
    if (!confirm('Delete this meeting and all its data?')) return;
    deletingIds = new Set([...deletingIds, id]);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('Failed to delete meeting');
      }
      await loadData();
    } catch (e) {
      alert('Failed to delete');
    } finally {
      deletingIds = new Set([...deletingIds].filter(x => x !== id));
    }
  }

  async function deleteAllMeetings() {
    if (!confirm(`Delete ALL ${meetings.length} meetings? This cannot be undone!`)) return;
    if (!confirm('Are you absolutely sure? All meeting data, participants, and AI reports will be permanently deleted.')) return;
    isLoading = true;
    let deleted = 0;
    for (const m of meetings) {
      try {
        await fetch(`/api/meetings/${m.id}`, { method: 'DELETE' });
        deleted++;
      } catch (e) {}
    }
    alert(`Deleted ${deleted} meetings`);
    await loadData();
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

  function connectAccount() {
    window.location.href = '/api/meetings/google/start';
  }

  async function generateExtensionToken() {
    isGeneratingToken = true;
    try {
      const res = await fetch('/api/auth/extension-token', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        extensionToken = data.token;
        showTokenModal = true;
      } else {
        alert('Failed to generate token');
      }
    } catch (e) {
      alert('Failed to generate token');
    } finally {
      isGeneratingToken = false;
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(extensionToken);
      alert('Token copied to clipboard! Paste it in the Chrome extension settings.');
    } catch {
      // Fallback for non-HTTPS
      const textarea = document.createElement('textarea');
      textarea.value = extensionToken;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Token copied! Paste it in the Chrome extension settings.');
    }
  }

  async function disconnectAccount() {
    if (!confirm('Disconnect Google account? You can reconnect with updated permissions afterward.')) return;
    try {
      // Delete ALL connections for this user (no ID needed)
      const res = await fetch('/api/meetings/connections', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert('Google account disconnected successfully.');
        window.location.reload();
      } else {
        alert('Failed to disconnect: ' + (data.message || `Status ${res.status}`));
      }
    } catch (e: any) {
      alert('Failed to disconnect: ' + e.message);
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
      <div class="flex flex-wrap gap-3">
        {#if connections.length === 0}
          <button onclick={connectAccount} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
            Connect Google Account
          </button>
        {:else}
          <button onclick={syncCalendar} disabled={isSyncing} class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50">
            {isSyncing ? 'Syncing...' : 'Sync Calendar'}
          </button>
          <button onclick={connectAccount} class="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-all">
            Reconnect Google
          </button>
          <button onclick={disconnectAccount} class="px-4 py-2 bg-red-600/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 rounded-xl text-sm font-semibold hover:bg-red-600/20 transition-all">
            Disconnect
          </button>
        {/if}
        <button onclick={generateExtensionToken} disabled={isGeneratingToken} class="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all">
          {isGeneratingToken ? 'Generating...' : 'Extension Token'}
        </button>
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

    <!-- Filters + Bulk Actions -->
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
      {#if meetings.length > 0}
        <button onclick={reprocessAll} disabled={isProcessingAll} class="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
          {#if isProcessingAll}
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Re-processing...
          {:else}
            Re-process All ({meetings.length})
          {/if}
        </button>
        <button onclick={deleteAllMeetings} disabled={isProcessingAll} class="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
          Delete All ({meetings.length})
        </button>
      {/if}
    </div>

    <!-- Processing Banner -->
    {#if isProcessingAll}
      <div class="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4">
        <div class="flex items-center gap-3">
          <div class="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
          <span class="text-sm text-blue-700 dark:text-blue-400 font-medium">
            Re-processing all meetings... This may take several minutes. Please don't close the page.
          </span>
        </div>
      </div>
    {/if}

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
                <tr class="border-b border-gray-50 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors {processingIds.has(meeting.id) ? 'opacity-60' : ''}">
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
                    {#if processingIds.has(meeting.id)}
                      <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 flex items-center gap-1.5 w-fit">
                        <div class="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
                        Processing...
                      </span>
                    {:else if deletingIds.has(meeting.id)}
                      <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
                        Deleting...
                      </span>
                    {:else}
                      <span class="px-2.5 py-1 rounded-full text-xs font-bold {statusColor(meeting.status)}">{meeting.status}</span>
                    {/if}
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex gap-2">
                      <button onclick={() => goto(`/meetings/${meeting.id}`)} class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                        View
                      </button>
                      {#if !processingIds.has(meeting.id) && !deletingIds.has(meeting.id)}
                        <button onclick={() => processMeeting(meeting.id)} class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                          {meeting.status === 'DISCOVERED' || meeting.status === 'FAILED' || meeting.status === 'NO_DATA' ? 'Process' : 'Re-process'}
                        </button>
                        <button onclick={() => deleteMeeting(meeting.id)} class="text-xs text-red-500 hover:underline font-medium">
                          Delete
                        </button>
                      {/if}
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

  <!-- Extension Token Modal -->
  {#if showTokenModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onclick={() => showTokenModal = false}>
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full space-y-4 border border-gray-200 dark:border-slate-700" onclick={(e) => e.stopPropagation()}>
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">Chrome Extension Auth Token</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Copy this token and paste it into the UniConnect Meeting Tracker extension's "Auth Token" field. This token is valid for 7 days.
        </p>
        <div class="relative">
          <input type="text" readonly value={extensionToken} class="w-full px-3 py-3 pr-20 border border-gray-200 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-xs font-mono text-gray-900 dark:text-white" />
          <button onclick={copyToken} class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">
            Copy
          </button>
        </div>
        <div class="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3">
          <p class="text-xs text-amber-700 dark:text-amber-400 font-medium">Steps:</p>
          <ol class="text-xs text-amber-600 dark:text-amber-400/80 mt-1 space-y-1 list-decimal list-inside">
            <li>Click "Copy" above</li>
            <li>Click the UniConnect extension icon in Chrome</li>
            <li>Paste the token in the "Auth Token" field</li>
            <li>Enter your server URL and click "Save Settings"</li>
          </ol>
        </div>
        <button onclick={() => showTokenModal = false} class="w-full px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-slate-700">
          Close
        </button>
      </div>
    </div>
  {/if}
</div>
