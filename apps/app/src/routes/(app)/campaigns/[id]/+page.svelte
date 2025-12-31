<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let isScheduling = $state(false);
  let scheduledAt = $state(''); // ISO string from datetime-local
  let showScheduleInput = $state(false);

  let recipients = $state<any[]>([]);
  let isLoadingRecipients = $state(false);
  let showRecipients = $state(false);

  let testEmail = $state(data.user?.email || '');
  let isSendingTest = $state(false);

  let isRetrying = $state(false);

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
              alert('Test email sent! Please check your inbox (and spam).');
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

  async function loadRecipients(force = false) {
      if (!force && showRecipients) {
          showRecipients = false;
          return;
      }
      if (!force) showRecipients = true;
      if (!force && recipients.length > 0) return;
      
      isLoadingRecipients = !force; // Only show loader on initial click
      try {
          const res = await fetch(`/api/campaigns/${data.campaign.id}/recipients`);
          if (res.ok) {
              recipients = await res.json();
          }
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
          // 1. Update Student Table
          const meta = JSON.parse(editingRecipient.metadata_str);
          const res = await fetch(`/api/students/${editingRecipient.student_id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  name: editingRecipient.student_name, 
                  email: editingRecipient.to_email,
                  metadata: meta
              })
          });

          if (res.ok) {
              alert('Student updated. You can now retry the failed mail.');
              showEditModal = false;
              // Refresh recipients if they are shown
              if (showRecipients) {
                  const rRes = await fetch(`/api/campaigns/${data.campaign.id}/recipients`);
                  if (rRes.ok) recipients = await rRes.json();
              }
              invalidateAll();
          } else {
              alert('Failed to update student');
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
      }
    }

    async function stopCampaign() {
        if (!confirm('🛑 Are you sure you want to STOP this campaign? Emails already in the queue will be cancelled.')) return;
        try {
            const res = await fetch(`/api/campaigns/${data.campaign.id}/stop`, { method: 'POST' });
            if (res.ok) {
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

    // Polling for progress if IN_PROGRESS
    let pollInterval: any;
    $effect(() => {
        if (data.campaign.status === 'IN_PROGRESS' || data.campaign.status === 'QUEUED' || data.campaign.status === 'SCHEDULED') {
            pollInterval = setInterval(() => {
                invalidateAll();
                if (showRecipients) loadRecipients(true);
            }, 3000);
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
    <div class="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">{data.campaign.name}</h1>
            <p class="text-sm text-gray-500">ID: {data.campaign.id}</p>
        </div>
        <div class="flex items-center space-x-4">
            <span class="px-3 py-1 rounded-full text-sm font-medium 
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
                        <input 
                            type="datetime-local" 
                            bind:value={scheduledAt}
                            class="block w-48 pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                        />
                        <button 
                            onclick={scheduleCampaign}
                            disabled={isScheduling || !scheduledAt}
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                        >
                            Schedule
                        </button>
                        <button onclick={() => showScheduleInput = false} class="text-sm text-gray-500">Cancel</button>
                    </div>
                {/if}
            {/if}
        </div>
    </div>

    {#if data.campaign.status === 'DRAFT'}
        <div class="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
            <h2 class="text-xl font-bold text-indigo-900 mb-2">Production Readiness Check 🧪</h2>
            <p class="text-sm text-indigo-700 mb-5 font-medium">
                Verify your layout, NIAT branding, and dynamic placeholders using real student data before the official launch.
            </p>
            <div class="flex items-center space-x-3">
                <input 
                    type="email" 
                    bind:value={testEmail}
                    placeholder="Enter your email address"
                    class="block w-72 px-4 py-2.5 text-sm border-indigo-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 rounded-xl outline-none transition-all"
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
                    <h3 class="text-sm font-black text-gray-400 uppercase tracking-widest">Global Sending Progress</h3>
                    <div class="text-2xl font-black text-gray-900 mt-1">{progress}% <span class="text-sm font-bold text-gray-400">({(data.campaign.sent_count || 0) + (data.campaign.failed_count || 0)} / {data.campaign.total_recipients})</span></div>
                </div>
                <div class="text-xs font-bold text-indigo-600 animate-pulse">
                    {#if progress >= 100 && data.campaign.status === 'IN_PROGRESS'}
                        ⏳ Finishing up processing...
                    {:else}
                        {data.campaign.status === 'IN_PROGRESS' ? '● System is sending...' : '✓ Sending Complete'}
                    {/if}
                </div>
            </div>
            <div class="w-full bg-gray-100 h-4 rounded-full overflow-hidden border border-gray-50 shadow-inner">
                <div 
                    class="bg-gradient-to-r from-indigo-500 to-blue-500 h-full transition-all duration-1000 ease-out" 
                    style="width: {progress}%"
                ></div>
            </div>
        </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 class="text-sm font-medium text-gray-500">Total Recipients</h3>
            <p class="mt-2 text-3xl font-bold text-gray-900">{data.campaign.total_recipients}</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 class="text-sm font-medium text-gray-500">Sent</h3>
            <p class="mt-2 text-3xl font-bold text-gray-900">{data.campaign.sent_count}</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 class="text-sm font-medium text-gray-500">Opened</h3>
            <p class="mt-2 text-3xl font-bold text-blue-600">{data.campaign.open_count}</p>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 relative">
            <h3 class="text-sm font-medium text-gray-500">Failed</h3>
            <div class="flex items-end justify-between">
                <p class="mt-2 text-3xl font-bold text-red-600">{data.campaign.failed_count || 0}</p>
                {#if data.campaign.failed_count > 0}
                    <button 
                        onclick={retryFailed} 
                        disabled={isRetrying}
                        class="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                    >
                        {isRetrying ? 'Retrying...' : 'Retry All'}
                    </button>
                {/if}
            </div>
        </div>
    </div>

    <!-- Recipients -->
    <div class="bg-white shadow sm:rounded-lg overflow-hidden border border-gray-200">
        <div class="px-4 py-5 sm:px-6 flex justify-between items-center">
            <h3 class="text-lg leading-6 font-medium text-gray-900">Recipient Details</h3>
            <button onclick={() => loadRecipients()} class="text-sm text-blue-600 hover:text-blue-900">
                {showRecipients ? 'Hide' : 'Show Details'}
            </button>
        </div>
        
        {#if showRecipients}
            <div class="border-t border-gray-200">
                {#if isLoadingRecipients}
                    <div class="p-4 text-center text-gray-500">Loading...</div>
                {:else}
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                {#each recipients as r}
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.student_name || 'N/A'}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.to_email}</td>
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
                                    <tr><td colspan="4" class="p-4 text-center text-gray-500">No recipients found.</td></tr>
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
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick={() => showEditModal = false}></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">Edit Student Data</h3>
        
        <div class="space-y-4">
            <div>
                <label for="edit-name" class="block text-sm font-medium text-gray-700">Student Name</label>
                <input id="edit-name" type="text" bind:value={editingRecipient.student_name} class="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm">
            </div>
            <div>
                <label for="edit-email" class="block text-sm font-medium text-gray-700">Email Address</label>
                <input id="edit-email" type="email" bind:value={editingRecipient.to_email} class="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm">
            </div>
            <div>
                <label for="edit-meta" class="block text-sm font-medium text-gray-700">Metadata (JSON)</label>
                <textarea id="edit-meta" bind:value={editingRecipient.metadata_str} rows="10" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm sm:text-sm font-mono text-xs"></textarea>
                <p class="mt-1 text-xs text-gray-500 italic">This will update the student's record and all future mails sent to them.</p>
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
