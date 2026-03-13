<script lang="ts">
  import { page } from "$app/stores";
  import { getContext } from "svelte";
  import { fade, fly } from "svelte/transition";

  let opsUniversityId: { get: () => string } | undefined;
  try { opsUniversityId = getContext('opsUniversityId'); } catch {}
  const universityId = $derived(opsUniversityId?.get() || $page.data?.user?.university_id || '');

  // State
  let versions = $state<any[]>([]);
  let loading = $state(false);
  let selectedVersion = $state<any>(null);
  let versionDetail = $state<any>(null);
  let loadingDetail = $state(false);

  // Diff
  let showDiff = $state(false);
  let diffCompareId = $state('');
  let diffs = $state<any[]>([]);
  let loadingDiff = $state(false);

  // Changelog
  let changeLogs = $state<any[]>([]);
  let showChangelog = $state(false);
  let loadingChangelog = $state(false);

  // Actions
  let actionLoading = $state('');

  $effect(() => { if (universityId) loadVersions(); });

  async function loadVersions() {
    loading = true;
    try {
      const res = await fetch(`/api/academic/scheduling/versions?universityId=${universityId}`);
      if (res.ok) versions = await res.json();
    } catch {} finally { loading = false; }
  }

  async function selectVersion(v: any) {
    selectedVersion = v;
    loadingDetail = true;
    showDiff = false;
    showChangelog = false;
    try {
      const res = await fetch(`/api/academic/scheduling/versions/${v.id}`);
      if (res.ok) versionDetail = await res.json();
    } catch {} finally { loadingDetail = false; }
  }

  async function publishVersion() {
    if (!selectedVersion || !confirm('Publish this version? Previously published versions will be archived.')) return;
    actionLoading = 'publish';
    try {
      const res = await fetch(`/api/academic/scheduling/versions/${selectedVersion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', universityId })
      });
      const data = await res.json();
      if (data.success) {
        loadVersions();
        selectVersion(selectedVersion);
      }
    } catch {} finally { actionLoading = ''; }
  }

  async function archiveVersion() {
    if (!selectedVersion || !confirm('Archive this version?')) return;
    actionLoading = 'archive';
    try {
      const res = await fetch(`/api/academic/scheduling/versions/${selectedVersion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', universityId })
      });
      const data = await res.json();
      if (data.success) {
        loadVersions();
        selectVersion(selectedVersion);
      }
    } catch {} finally { actionLoading = ''; }
  }

  async function loadDiff() {
    if (!selectedVersion || !diffCompareId) return;
    loadingDiff = true;
    try {
      const res = await fetch(`/api/academic/scheduling/versions/${selectedVersion.id}/diff?compareWith=${diffCompareId}`);
      if (res.ok) {
        const data = await res.json();
        diffs = data.diffs || [];
      }
    } catch {} finally { loadingDiff = false; }
  }

  async function loadChangelog() {
    if (!selectedVersion) return;
    loadingChangelog = true;
    showChangelog = true;
    try {
      const res = await fetch(`/api/academic/scheduling/changelog?universityId=${universityId}&versionId=${selectedVersion.id}`);
      if (res.ok) changeLogs = await res.json();
    } catch {} finally { loadingChangelog = false; }
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  }

  function statusColor(status: string) {
    switch (status) {
      case 'PUBLISHED': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
      case 'DRAFT': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
      case 'ARCHIVED': return 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400';
      default: return 'bg-gray-100 dark:bg-slate-700 text-gray-500';
    }
  }

  function changeTypeIcon(type: string) {
    switch (type) {
      case 'EDIT': return 'pencil';
      case 'CANCEL': return 'x';
      case 'SWAP_FACULTY': return 'swap';
      case 'CLONE_WEEK': return 'copy';
      default: return 'dot';
    }
  }
</script>

<div class="space-y-6" in:fade>
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Publish Center</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Version management, diff comparison, and change audit trail</p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Versions List -->
    <div class="lg:col-span-1">
      <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div class="p-4 border-b border-gray-200 dark:border-slate-700">
          <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">Versions</h3>
        </div>
        {#if loading}
          <div class="p-8 text-center text-gray-400 text-sm">Loading...</div>
        {:else if versions.length === 0}
          <div class="p-8 text-center text-gray-400 text-sm">No versions yet</div>
        {:else}
          <div class="divide-y divide-gray-100 dark:divide-slate-700 max-h-[70vh] overflow-y-auto">
            {#each versions as v}
              <button
                onclick={() => selectVersion(v)}
                class="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors
                  {selectedVersion?.id === v.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500' : ''}"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-bold text-gray-800 dark:text-gray-200">v{v.version_number}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full {statusColor(v.version_status)}">{v.version_status}</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {v.source_type || 'UPLOAD'} &middot; {v.session_count || 0} sessions
                </p>
                {#if v.program_name || v.term_name}
                  <p class="text-xs text-gray-400 mt-0.5">{v.program_name || ''} {v.term_name || ''}</p>
                {/if}
                <p class="text-[10px] text-gray-400 mt-1">{formatDateTime(v.created_at)}</p>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Version Detail -->
    <div class="lg:col-span-2">
      {#if !selectedVersion}
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center text-gray-400">
          Select a version to view details
        </div>
      {:else if loadingDetail}
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center text-gray-400 text-sm">Loading...</div>
      {:else if versionDetail}
        <div in:fly={{ x: 10, duration: 200 }} class="space-y-4">
          <!-- Version Info -->
          <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h3 class="text-lg font-bold text-gray-800 dark:text-white">Version {versionDetail.version_number}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{versionDetail.notes || 'No description'}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-medium {statusColor(versionDetail.version_status)}">
                {versionDetail.version_status}
              </span>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div class="text-center p-3 rounded-xl bg-gray-50 dark:bg-slate-900">
                <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{versionDetail.session_count || 0}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Sessions</p>
              </div>
              <div class="text-center p-3 rounded-xl bg-gray-50 dark:bg-slate-900">
                <p class="text-2xl font-bold text-red-500">{versionDetail.unassigned_count || 0}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Unassigned</p>
              </div>
              <div class="text-center p-3 rounded-xl bg-gray-50 dark:bg-slate-900">
                <p class="text-2xl font-bold text-amber-500">{versionDetail.change_count || 0}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Changes</p>
              </div>
              <div class="text-center p-3 rounded-xl bg-gray-50 dark:bg-slate-900">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{versionDetail.source_type}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">Source</p>
              </div>
            </div>

            <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              {#if versionDetail.program_name}<p>Program: <strong>{versionDetail.program_name}</strong></p>{/if}
              {#if versionDetail.term_name}<p>Term: <strong>{versionDetail.term_name}</strong></p>{/if}
              {#if versionDetail.published_at}<p>Published: <strong>{formatDateTime(versionDetail.published_at)}</strong> by {versionDetail.publisher_name || 'Unknown'}</p>{/if}
              <p>Created: {formatDateTime(versionDetail.created_at)}</p>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-slate-700">
              {#if versionDetail.version_status === 'DRAFT'}
                <button onclick={publishVersion} disabled={actionLoading === 'publish'}
                  class="px-4 py-2 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  {actionLoading === 'publish' ? 'Publishing...' : 'Publish'}
                </button>
              {/if}
              {#if versionDetail.version_status !== 'ARCHIVED'}
                <button onclick={archiveVersion} disabled={actionLoading === 'archive'}
                  class="px-4 py-2 text-sm rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-50">
                  {actionLoading === 'archive' ? 'Archiving...' : 'Archive'}
                </button>
              {/if}
              <button onclick={loadChangelog}
                class="px-4 py-2 text-sm rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200">
                View Changelog
              </button>
              <button onclick={() => { showDiff = !showDiff; showChangelog = false; }}
                class="px-4 py-2 text-sm rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200">
                Compare Versions
              </button>
            </div>
          </div>

          <!-- Diff Panel -->
          {#if showDiff}
            <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5" in:fly={{ y: 10, duration: 200 }}>
              <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Compare with another version</h4>
              <div class="flex gap-2 mb-4">
                <select bind:value={diffCompareId} class="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white">
                  <option value="">Select version...</option>
                  {#each versions.filter(v => v.id !== selectedVersion?.id) as v}
                    <option value={v.id}>v{v.version_number} ({v.version_status}) — {v.session_count || 0} sessions</option>
                  {/each}
                </select>
                <button onclick={loadDiff} disabled={!diffCompareId || loadingDiff}
                  class="px-4 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {loadingDiff ? 'Loading...' : 'Compare'}
                </button>
              </div>

              {#if diffs.length > 0}
                <div class="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="bg-gray-50 dark:bg-slate-800/80 text-gray-500 dark:text-gray-400">
                        <th class="p-2 text-left">Date</th>
                        <th class="p-2 text-left">Time</th>
                        <th class="p-2 text-left">Section</th>
                        <th class="p-2 text-left">Subject</th>
                        <th class="p-2 text-left">Field</th>
                        <th class="p-2 text-left">v{versionDetail.version_number}</th>
                        <th class="p-2 text-left">Other</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each diffs as d}
                        <tr class="border-t border-gray-100 dark:border-slate-700/50">
                          <td class="p-2 text-gray-600 dark:text-gray-400">{d.session_date}</td>
                          <td class="p-2 text-gray-500">{formatTime(d.slot_start)}</td>
                          <td class="p-2 text-gray-600 dark:text-gray-400">{d.section_name}</td>
                          <td class="p-2 font-mono text-indigo-600 dark:text-indigo-400">{d.subject_code}</td>
                          <td class="p-2 font-medium text-gray-700 dark:text-gray-300">{d.field}</td>
                          <td class="p-2 {d.v1_value ? 'text-red-500' : 'text-gray-400'}">{d.v1_value || '—'}</td>
                          <td class="p-2 {d.v2_value ? 'text-emerald-600' : 'text-gray-400'}">{d.v2_value || '—'}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                <p class="text-xs text-gray-400 mt-2">{diffs.length} difference(s) found</p>
              {:else if !loadingDiff && diffCompareId}
                <p class="text-sm text-gray-400 text-center py-4">No differences found</p>
              {/if}
            </div>
          {/if}

          <!-- Changelog Panel -->
          {#if showChangelog}
            <div class="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5" in:fly={{ y: 10, duration: 200 }}>
              <h4 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Change History</h4>
              {#if loadingChangelog}
                <p class="text-sm text-gray-400 text-center py-4">Loading...</p>
              {:else if changeLogs.length === 0}
                <p class="text-sm text-gray-400 text-center py-4">No changes recorded</p>
              {:else}
                <div class="space-y-2 max-h-[40vh] overflow-y-auto">
                  {#each changeLogs as log}
                    <div class="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-900">
                      <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                        {log.change_type === 'EDIT' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
                         log.change_type === 'CANCEL' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
                         log.change_type === 'SWAP_FACULTY' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' :
                         'bg-gray-100 dark:bg-slate-700 text-gray-500'}">
                        {log.change_type === 'EDIT' ? 'E' : log.change_type === 'CANCEL' ? 'X' : log.change_type === 'SWAP_FACULTY' ? 'S' : 'C'}
                      </div>
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-bold text-gray-700 dark:text-gray-300">{log.change_type}</span>
                          {#if log.subject_code}
                            <span class="text-xs font-mono text-indigo-500">{log.subject_code}</span>
                          {/if}
                          {#if log.section_name}
                            <span class="text-xs text-gray-400">{log.section_name}</span>
                          {/if}
                        </div>
                        {#if log.field_name}
                          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            <span class="font-medium">{log.field_name}:</span>
                            {#if log.old_value}<span class="text-red-400 line-through">{log.old_value}</span>{/if}
                            {#if log.old_value && log.new_value} → {/if}
                            {#if log.new_value}<span class="text-emerald-500">{log.new_value}</span>{/if}
                          </p>
                        {/if}
                        <p class="text-[10px] text-gray-400 mt-1">
                          {formatDateTime(log.changed_at)}
                          {#if log.changer_name} by {log.changer_name}{/if}
                        </p>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
