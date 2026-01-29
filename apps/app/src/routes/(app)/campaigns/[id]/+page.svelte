<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let isScheduling = $state(false);
  let scheduledAt = $state(''); // ISO string from datetime-local
  let showScheduleInput = $state(false);

  let recipients = $state<any[]>([]);
  let lastRecipientUpdate = $state<string | null>(null);
  let isLoadingRecipients = $state(false);
  let showRecipients = $state(false);

  let testEmail = $state('');

  // CRITICAL: Reset state ONLY when switching to a different campaign
  let activeCampaignId = $state<string | null>(null);
  $effect(() => {
      const currentId = data.campaign.id;
      if (activeCampaignId !== currentId) {
          activeCampaignId = currentId;
          recipients = [];
          lastRecipientUpdate = null;
          showRecipients = false;
          statusFilter = 'ALL';
      }
  });
  let isSendingTest = $state(false);

  let isRetrying = $state(false);
  let statusFilter = $state<'ALL' | 'FAILED' | 'SENT' | 'OPENED' | 'ACKNOWLEDGED'>('ALL');
  let recipientSearch = $state('');

  let filteredRecipients = $derived.by(() => {
      let result = recipients;
      if (statusFilter !== 'ALL') {
          result = result.filter(r => r.status === statusFilter);
      }
      if (recipientSearch) {
          const s = recipientSearch.toLowerCase();
          result = result.filter(r => 
              (r.student_name && r.student_name.toLowerCase().includes(s)) ||
              (r.to_email && r.to_email.toLowerCase().includes(s)) ||
              (r.external_id && r.external_id.toLowerCase().includes(s))
          );
      }
      return result;
  });

  // Edit Student Modal
  let showEditModal = $state(false);
  let editingRecipient = $state<any>(null);
  let isSavingEdit = $state(false);

  async function sendTestEmail() {
      if (!testEmail) return alert('Enter a test email address');
      isSendingTest = true;
      try {
          const res = await fetch(`/api/campaigns/${data.campaign.id}/test-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ testEmail })
          });
          if (res.ok) {
              const result = await res.json();
              alert(`Test email enqueued! (Job ID: ${result.jobId || 'OK'})\nSending to: ${testEmail}\n\nPlease check your inbox and SPAM folder in 1-2 minutes.`);
          } else {
              const err = await res.json();
              alert(err.message || 'Failed to send test email');
          }
      } catch (e) {
          alert('Error sending test email');
      } finally {
          isSendingTest = false;
      }
  }

  async function loadRecipients(force = false, filterToSet?: any) {
      if (filterToSet) statusFilter = filterToSet;

      if (!force && showRecipients && !filterToSet) {
          showRecipients = false;
          return;
      }
      if (!force) showRecipients = true;
      if (!force && recipients.length > 0 && !filterToSet) return;
      
      isLoadingRecipients = !force && !lastRecipientUpdate; 
      try {
          let url = `/api/campaigns/${data.campaign.id}/recipients`;
          // Use delta fetch ONLY if we already have data and are forcing a refresh
          if (force && lastRecipientUpdate && recipients.length > 0) {
              url += `?updatedSince=${encodeURIComponent(lastRecipientUpdate)}`;
          }

          console.log(`[UI] Fetching recipients from: ${url}`);
          const res = await fetch(url);
          if (res.ok) {
              const delta: any[] = await res.json();
              console.log(`[UI] Received ${delta.length} recipients (isDelta: ${force && !!lastRecipientUpdate})`);

              if (force && lastRecipientUpdate && recipients.length > 0) {
                  // Merge delta into existing recipients
                  const newRecipients = [...recipients];
                  delta.forEach(newR => {
                      const idx = newRecipients.findIndex(r => r.id === newR.id);
                      if (idx > -1) newRecipients[idx] = newR;
                      else newRecipients.push(newR);
                  });
                  recipients = newRecipients;
              } else {
                  recipients = delta;
              }
              lastRecipientUpdate = new Date().toISOString();
          }
      } catch (err) {
          console.error('[UI] Failed to load recipients:', err);
          alert('Failed to load recipient list. Please check your connection or redeploy.');
      } finally {
          isLoadingRecipients = false;
      }
  }

  async function retryFailed() {
      if (!confirm('Retry sending emails to all failed recipients?')) return;
      isRetrying = true;
      try {
          const res = await fetch(`/api/campaigns/${data.campaign.id}/retry-failed`, { method: 'POST' });
          if (res.ok) {
              alert('Retry started!');
              invalidateAll();
          } else {
              alert('Failed to start retry');
          }
      } finally {
          isRetrying = false;
      }
  }

  function openEdit(r: any) {
      editingRecipient = { ...r, metadata_str: JSON.stringify(r.metadata || {}, null, 2) };
      showEditModal = true;
  }

  async function saveStudentEdit() {
      isSavingEdit = true;
      try {
          const meta = JSON.parse(editingRecipient.metadata_str);
          
          // CONSOLIDATED ATOMIC UPDATE: This single call updates student, recipient, AND triggers immediate send
          const res = await fetch(`/api/campaigns/${data.campaign.id}/recipients/${editingRecipient.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  email: editingRecipient.to_email,
                  name: editingRecipient.student_name,
                  metadata: meta
              })
          });

          if (res.ok) {
              alert('Student updated and email triggered successfully!');
              showEditModal = false;
              invalidateAll();
              if (showRecipients) loadRecipients(true);
          } else {
              const err = await res.text();
              console.error('Update failed:', err);
              alert(`Failed to update. Server returned: ${res.status}`);
          }
      } catch(e) {
          alert('Invalid JSON in metadata or network error');
      } finally {
          isSavingEdit = false;
      }
  }

    async function scheduleCampaign() {
      const isLater = showScheduleInput && scheduledAt;
      
      if (!isLater) {
          if (!confirm('🚀 CONFIRM: Are you sure you want to start sending emails to all recipients now? This action cannot be undone.')) return;
      } else {
          if (!confirm(`Schedule this campaign for ${new Date(scheduledAt).toLocaleString()}?`)) return;
      }

      isScheduling = true;
      try {
          const res = await fetch(`/api/campaigns/${data.campaign.id}/schedule`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  scheduledAt: isLater ? scheduledAt : null
              })
          });
          if (res.ok) {
              alert(isLater ? 'Campaign Scheduled!' : 'Campaign Started!');
              invalidateAll();
          } else {
              const err = await res.json();
              alert(err.message || 'Failed to schedule');
          }
      } catch(e) {
          alert('Error');
      } finally {
          isScheduling = false;
          // Trigger immediate update after starting
          setTimeout(() => {
              invalidateAll();
              if (showRecipients) loadRecipients(true);
          }, 500);
      }
    }

    async function stopCampaign() {
        if (!confirm('🛑 Are you sure you want to STOP this campaign? Emails already in the queue will be cancelled.')) return;
        try {
            const res = await fetch(`/api/campaigns/${data.campaign.id}/stop`, { method: 'POST' });
            if (res.ok) {
                localStatusOverride = 'STOPPED';
                data.campaign.status = 'STOPPED';
                alert('Campaign Stopped!');
                invalidateAll();
            } else {
                const err = await res.json();
                alert(err.message || 'Failed to stop');
            }
        } catch(e) {
            alert('Error');
        }
    }

    let localStatusOverride = $state<string | null>(null);

    $effect(() => {
        const interval = setInterval(async () => {
            // Only poll if campaign is active AND not locally overridden (to avoid lag)
            const currentStatus = localStatusOverride || data.campaign.status;
            if (currentStatus === 'IN_PROGRESS' || currentStatus === 'QUEUED' || currentStatus === 'SCHEDULED') {
                const res = await fetch(`/api/campaigns/${data.campaign.id}`);
                if (res.ok) {
                    const stats = await res.json();
                    data.campaign = { ...data.campaign, ...stats };
                    
                    // Clear override if the polled status finally matches what we expect
                    if (data.campaign.status === localStatusOverride) {
                        localStatusOverride = null;
                    }
                }
            }
        }, 2000); // Increased polling frequency to 2s for active campaigns
        return () => clearInterval(interval);
    });

    async function resumeCampaign() {
        if (!confirm('▶️ Are you sure you want to RESUME this campaign? Emails will start sending to remaining recipients.')) return;
        try {
            const res = await fetch(`/api/campaigns/${data.campaign.id}/resume`, { method: 'POST' });
            if (res.ok) {
                localStatusOverride = 'QUEUED';
                data.campaign.status = 'QUEUED';
                const result = await res.json();
                alert(result.message);
                invalidateAll();
            } else {
                const err = await res.json();
                alert(err.message || 'Failed to resume');
            }
        } catch(e) {
            alert('Error');
        }
    }

    // Polling for progress if ACTIVE
    let pollInterval: any;
    $effect(() => {
        if (['IN_PROGRESS', 'QUEUED', 'SCHEDULED'].includes(data.campaign.status)) {
            pollInterval = setInterval(() => {
                invalidateAll();
                // If showing recipients, refresh them too
                if (showRecipients) {
                    loadRecipients(true);
                }
            }, 2000); // 2s polling for "live" feel
        }
        return () => clearInterval(pollInterval);
    });

    const progress = $derived.by(() => {
        const total = data.campaign.total_recipients || 0;
        if (total === 0) return 0;
        const processed = (data.campaign.sent_count || 0) + (data.campaign.failed_count || 0);
        return Math.round((processed / total) * 100);
    });
</script>

<div class="space-y-6">
    <div class="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-800">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">{data.campaign.name}</h1>
            <p class="text-sm text-gray-500">ID: {data.campaign.id}</p>
        </div>
        <div class="flex items-center space-x-4">
            <span class="px-3 py-1 rounded-full text-sm font-bold 
                {data.campaign.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' : 
                 data.campaign.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                 data.campaign.status === 'STOPPED' ? 'bg-red-100 text-red-800' :
                 data.campaign.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                 'bg-blue-100 text-blue-800 animate-pulse border border-blue-200'}">
                {data.campaign.status}
            </span>
            
            {#if ['IN_PROGRESS', 'QUEUED', 'SCHEDULED'].includes(data.campaign.status)}
                <button 
                    onclick={stopCampaign}
                    class="inline-flex items-center px-4 py-1.5 border border-red-300 text-xs font-bold rounded-full text-red-600 bg-white hover:bg-red-50 transition-all shadow-sm active:scale-95"
                >
                    <svg class="mr-1.5 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"></path></svg>
                    STOP CAMPAIGN
                </button>
            {/if}
            {#if data.campaign.status === 'STOPPED'}
                <button 
                    onclick={resumeCampaign}
                    class="inline-flex items-center px-4 py-1.5 border border-green-300 text-xs font-bold rounded-full text-green-600 bg-white hover:bg-green-50 transition-all shadow-sm active:scale-95"
                >
                    <svg class="mr-1.5 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" clip-rule="evenodd"></path><path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z"></path></svg>
                    RESUME CAMPAIGN
                </button>
            {/if}
            {#if data.campaign.include_ack}
                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                    <svg class="mr-1.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
                    ACK Enabled
                </span>
            {/if}
            {#if data.campaign.status === 'DRAFT'}
                {#if !showScheduleInput}
                    <button 
                        onclick={() => showScheduleInput = true}
                        class="text-sm text-blue-600 hover:text-blue-800"
                    >
                        Schedule for later
                    </button>
                    <button 
                        onclick={scheduleCampaign}
                        disabled={isScheduling}
                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none disabled:opacity-50"
                    >
                        {isScheduling ? 'Starting...' : 'Start Now'}
                    </button>
                {:else}
                    <div class="flex items-center space-x-2">
                            type="datetime-local" 
                            bind:value={scheduledAt}
                            class="block w-48 pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md text-gray-900 bg-white"
                        />
                        <button 
                            onclick={scheduleCampaign}
                            disabled={isScheduling || !scheduledAt}
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                        >
                            Schedule
                        </button>
                        <button onclick={() => showScheduleInput = false} class="text-sm text-gray-500 font-bold">Cancel</button>
                    </div>
                {/if}
            {/if}
        </div>
    </div>

    {#if data.campaign.status === 'DRAFT'}
        <div class="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
            <h2 class="text-xl font-bold mb-2" style="color: #312e81 !important">Production Readiness Check 🧪</h2>
            <p class="text-sm mb-5 font-bold" style="color: #312e81 !important">
                Verify your layout, NIAT branding, and dynamic placeholders using real student data before the official launch.
            </p>
            <div class="flex items-center space-x-3">
                <input 
                    type="email" 
                    bind:value={testEmail}
                    placeholder="Enter your email address"
                    class="block w-72 px-4 py-2.5 text-sm border-indigo-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 rounded-xl outline-none transition-all text-gray-900 font-bold bg-white"
                />
                <button 
                    onclick={sendTestEmail}
                    disabled={isSendingTest}
                    class="inline-flex items-center px-6 py-2.5 bg-white border border-indigo-200 text-sm font-bold rounded-xl text-indigo-600 hover:bg-indigo-50 shadow-sm transition-all disabled:opacity-50"
                >
                    {isSendingTest ? 'Processing...' : 'Send Live Test'}
                </button>
            </div>
        </div>
    {/if}

    {#if data.campaign.status === 'IN_PROGRESS' || data.campaign.status === 'COMPLETED'}
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div class="flex justify-between items-end">
                <div>
                    <h3 class="text-sm font-black uppercase tracking-widest" style="color: #6b7280 !important">Global Sending Progress</h3>
                    <div class="text-2xl font-black mt-1" style="color: #111827 !important">{progress}% <span class="text-sm font-bold" style="color: #9ca3af !important">({(data.campaign.sent_count || 0) + (data.campaign.failed_count || 0)} / {data.campaign.total_recipients})</span></div>
                </div>
                <div class="text-xs font-bold text-indigo-600 animate-pulse">
                    {#if progress >= 100 && data.campaign.status === 'IN_PROGRESS'}
                        ⏳ Finishing up processing...
                    {:else}
                        {data.campaign.status === 'IN_PROGRESS' ? '● System is sending...' : '✓ Sending Complete'}
                    {/if}
                </div>
            </div>
            <div class="w-full bg-gray-100 h-5 rounded-full overflow-hidden border border-gray-50 shadow-inner relative">
                <div 
                    class="bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600 h-full transition-all duration-500 ease-out relative" 
                    style="width: {progress}%"
                >
                    <!-- Glossy effect for active progress -->
                    {#if data.campaign.status === 'IN_PROGRESS'}
                        <div class="absolute inset-0 bg-white/20 animate-pulse"></div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <button 
            onclick={() => loadRecipients(false, 'ALL')}
            class="bg-white p-6 rounded-2xl shadow-sm border {statusFilter === 'ALL' ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-gray-100'} hover:border-indigo-200 transition-all text-left group"
        >
            <h3 class="text-sm font-bold uppercase" style="color: #6b7280 !important">Total Recipients</h3>
            <p class="mt-2 text-3xl font-black" style="color: #111827 !important">{data.campaign.total_recipients}</p>
        </button>
        <button 
            onclick={() => loadRecipients(false, 'SENT')}
            class="bg-white p-6 rounded-2xl shadow-sm border {statusFilter === 'SENT' ? 'border-blue-500 ring-4 ring-blue-50' : 'border-gray-100'} hover:border-blue-200 transition-all text-left group"
        >
            <h3 class="text-sm font-bold uppercase" style="color: #6b7280 !important">Sent</h3>
            <p class="mt-2 text-3xl font-black" style="color: #111827 !important">{data.campaign.sent_count}</p>
        </button>
        <button 
            onclick={() => loadRecipients(false, 'OPENED')}
            class="bg-white p-6 rounded-2xl shadow-sm border {statusFilter === 'OPENED' ? 'border-cyan-500 ring-4 ring-cyan-50' : 'border-gray-100'} hover:border-cyan-200 transition-all text-left group"
        >
            <h3 class="text-sm font-bold uppercase" style="color: #6b7280 !important">Opened</h3>
            <p class="mt-2 text-3xl font-black text-blue-600">{data.campaign.open_count}</p>
        </button>
        <button 
            onclick={() => loadRecipients(false, 'ACKNOWLEDGED')}
            class="bg-white p-6 rounded-2xl shadow-sm border {statusFilter === 'ACKNOWLEDGED' ? 'border-green-500 ring-4 ring-green-50' : 'border-gray-100'} hover:border-green-200 transition-all text-left group"
        >
            <h3 class="text-sm font-bold uppercase" style="color: #6b7280 !important">Acknowledged</h3>
            <p class="mt-2 text-3xl font-black text-green-600">{data.campaign.ack_count || 0}</p>
        </button>
        <button 
            onclick={() => loadRecipients(false, 'FAILED')}
            class="bg-white p-6 rounded-2xl shadow-sm border {statusFilter === 'FAILED' ? 'border-red-500 ring-4 ring-red-50' : 'border-gray-100'} hover:border-red-200 transition-all text-left relative group"
        >
            <h3 class="text-sm font-bold uppercase" style="color: #6b7280 !important">Failed</h3>
            <div class="flex items-end justify-between">
                <p class="mt-2 text-3xl font-black text-red-600">{data.campaign.failed_count || 0}</p>
                {#if data.campaign.failed_count > 0}
                    <div class="text-[10px] font-black text-red-500 uppercase tracking-widest animate-bounce">Click to view ↴</div>
                {/if}
            </div>
        </button>
    </div>

    <!-- Recipients -->
    <div class="bg-white shadow-2xl rounded-[2.5rem] overflow-hidden border border-gray-100">
        <div class="px-8 py-6 flex justify-between items-center bg-gray-50/50">
            <div class="flex-1">
                <div class="flex items-center gap-3">
                    <h3 class="text-lg font-black uppercase tracking-tight" style="color: #111827 !important">Recipient Details</h3>
                    <span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-black border border-red-200 animate-pulse">BUILD: V6.0-DEBUG-ENABLED</span>
                </div>
                <div class="mt-4 space-y-4">
                    <div class="flex flex-wrap gap-2">
                        {#each ['ALL', 'SENT', 'OPENED', 'ACKNOWLEDGED', 'FAILED'] as filter}
                            <button 
                                onclick={() => statusFilter = filter as any}
                                class="px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                                {statusFilter === filter ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-gray-700 border border-gray-100 hover:border-indigo-200 font-bold'}"
                            >
                                {filter}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="mt-4">
                    <div class="relative max-w-md">
                        <input 
                            type="text" 
                            bind:value={recipientSearch}
                            placeholder="Search by student name, email, or ID..."
                            class="w-full px-12 py-3 rounded-2xl text-xs font-bold border-2 border-gray-100 dark:border-slate-800 focus:border-indigo-500 outline-none shadow-sm bg-white/50 backdrop-blur-sm transition-all text-gray-900"
                        />
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-4">
                {#if statusFilter === 'FAILED' && data.campaign.failed_count > 0}
                    <button 
                        onclick={retryFailed} 
                        disabled={isRetrying}
                        class="inline-flex items-center px-6 py-2 bg-red-600 text-white text-xs font-black rounded-xl hover:bg-red-700 transition-all shadow-xl shadow-red-200 disabled:opacity-50 active:scale-95"
                    >
                        <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        RETRY ALL FAILED
                    </button>
                {/if}
                <button onclick={() => loadRecipients()} class="text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">
                    {showRecipients ? 'Hide Details' : 'Show Details'}
                </button>
            </div>
        </div>
        
        {#if showRecipients}
            <div class="border-t border-gray-200">
                {#if isLoadingRecipients}
                    <div class="p-4 text-center dark:text-slate-400">Loading...</div>
                {:else}
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-100">
                                {#each filteredRecipients as r}
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{r.student_name || 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{r.to_email}</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                {r.status === 'SENT' ? 'bg-blue-100 text-blue-800' : 
                                                 r.status === 'OPENED' ? 'bg-cyan-100 text-cyan-800' :
                                                 r.status === 'ACKNOWLEDGED' ? 'bg-green-100 text-green-800' :
                                                 r.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}">
                                                {r.status}
                                            </span>
                                            {#if r.error_message}
                                                <p class="text-xs text-red-500 mt-1 max-w-xs overflow-hidden text-ellipsis">{r.error_message}</p>
                                            {/if}
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onclick={() => openEdit(r)} class="text-blue-600 hover:text-blue-900">Edit</button>
                                        </td>
                                    </tr>
                                {/each}
                                {#if recipients.length === 0}
                                    <tr><td colspan="4" class="p-4 text-center text-gray-500 font-medium">No recipients found.</td></tr>
                                {/if}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<!-- Edit Student Modal -->
{#if showEditModal}
<div class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
    <div 
      class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
      onclick={() => showEditModal = false}
      onkeydown={(e) => e.key === 'Escape' && (showEditModal = false)}
      role="button"
      tabindex="-1"
      aria-label="Close Modal"
    ></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <h3 class="text-lg leading-6 font-black mb-4" style="color: #111827 !important">Edit Student Data</h3>
        
        <div class="space-y-4">
            <div>
                <label for="edit-name" class="block text-sm font-medium text-gray-700">Student Name</label>
                <input id="edit-name" type="text" bind:value={editingRecipient.student_name} class="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm text-gray-900 font-medium px-3 py-2">
            </div>
            <div>
                <label for="edit-email" class="block text-sm font-medium text-gray-700">Email Address</label>
                <input id="edit-email" type="email" bind:value={editingRecipient.to_email} class="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm text-gray-900 font-medium px-3 py-2">
            </div>
            <div>
                <label for="edit-meta" class="block text-sm font-medium text-gray-700">Metadata (JSON)</label>
                <textarea id="edit-meta" bind:value={editingRecipient.metadata_str} rows="10" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm font-mono text-xs text-gray-900 px-3 py-2"></textarea>
                <p class="mt-1 text-xs dark:text-slate-400 italic">This will update the student's record and all future mails sent to them.</p>
            </div>
        </div>
      </div>
      <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
        <button 
            type="button" 
            onclick={saveStudentEdit}
            disabled={isSavingEdit}
            class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
        >
          {isSavingEdit ? 'Saving...' : 'Save Changes'}
        </button>
        <button 
            type="button" 
            onclick={() => showEditModal = false}
            class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</div>
{/if}
