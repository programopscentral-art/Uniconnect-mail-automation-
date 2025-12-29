<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state(data.userUniversityId || '');
  let isLoading = $state(false);
  let mailboxes = $state(data.mailboxes);

  async function loadMailboxes() {
      if (!selectedUniversityId) return;
      isLoading = true;
      try {
          // Implementing API fetch for mailboxes on client side for Admin filter
          const res = await fetch(`/api/mailboxes?universityId=${selectedUniversityId}`);
          if (res.ok) {
              mailboxes = await res.json();
          }
      } finally {
          isLoading = false;
      }
  }

  function connectMailbox() {
      if (!selectedUniversityId) return;
      // Redirect to start endpoint
      window.location.href = `/api/mailboxes/google/start?universityId=${selectedUniversityId}`;
  }

  async function requestAccess(mailboxId: string) {
      const res = await fetch('/api/mailboxes/permissions', {
          method: 'POST',
          body: JSON.stringify({ mailboxId }),
          headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
          alert('Access request submitted.');
          invalidateAll();
      }
  }

  async function updatePermission(permissionId: string, status: 'APPROVED' | 'REVOKED') {
      const res = await fetch('/api/mailboxes/permissions', {
          method: 'PATCH',
          body: JSON.stringify({ permissionId, status }),
          headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
          invalidateAll();
      }
  }

  async function revokeMailbox(id: string) {
      if (!confirm('Are you sure you want to revoke this mailbox connection? You will need to re-login to restore it.')) return;
      isLoading = true;
      try {
          const res = await fetch(`/api/mailboxes?id=${id}`, { method: 'DELETE' });
          if (res.ok) {
              alert('Connection revoked.');
              invalidateAll();
          } else {
              alert('Failed to revoke.');
          }
      } finally {
          isLoading = false;
      }
  }
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Mailbox Connections</h1>
      <p class="mt-1 text-sm text-gray-500">Connect Gmail accounts for sending automation.</p>
    </div>
    <button 
      onclick={connectMailbox}
      disabled={!selectedUniversityId && data.userRole === 'ADMIN'}
      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50"
    >
      <svg class="-ml-1 mr-2 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
      </svg>
      Connect Gmail
    </button>
  </div>
  
  {#if data.userRole === 'ADMIN'}
    <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating flex items-center gap-6">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Institutional Node:</label>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={loadMailboxes}
            class="flex-1 max-w-md bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all focus:bg-white"
        >
            <option value="">Global Hierarchy (All)</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="bg-white shadow-floating overflow-hidden rounded-[32px] border border-gray-100">
    <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
            <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Connected At</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
            {#each mailboxes as box}
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{box.email}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {box.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            {box.status}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(box.created_at).toLocaleDateString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {#if data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS' || data.userRole === 'UNIVERSITY_OPERATOR'}
                            <button 
                                onclick={() => revokeMailbox(box.id)}
                                class="text-red-600 hover:text-red-900 font-medium"
                            >
                                Revoke
                            </button>
                        {:else if !data.permissions.find(p => p.mailbox_id === box.id && p.user_id === data.userId)}
                            <button onclick={() => requestAccess(box.id)} class="text-blue-600 hover:text-blue-900 font-medium">Request Access</button>
                        {:else if data.permissions.find(p => p.mailbox_id === box.id && p.user_id === data.userId && p.status === 'PENDING')}
                            <span class="text-gray-400 italic">Request Pending</span>
                        {:else if data.permissions.find(p => p.mailbox_id === box.id && p.user_id === data.userId && p.status === 'APPROVED')}
                            <span class="text-green-600 font-bold">Access Granted</span>
                        {:else}
                            <button onclick={() => requestAccess(box.id)} class="text-orange-600 hover:text-orange-900 font-medium">Re-request Access</button>
                        {/if}
                    </td>
                </tr>
            {/each}
            {#if mailboxes.length === 0}
                <tr>
                    <td colspan="4" class="px-6 py-4 text-center text-sm text-gray-500">
                        {selectedUniversityId ? 'No mailboxes connected.' : 'Select a university.'}
                    </td>
                </tr>
            {/if}
        </tbody>
    </table>
  </div>

  {#if (data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS' || data.userRole === 'UNIVERSITY_OPERATOR') && data.permissions.length > 0}
    <div class="mt-12">
        <h2 class="text-xl font-bold text-gray-900 mb-4">Access Requests</h2>
        <div class="bg-white shadow overflow-hidden rounded-lg border border-gray-200">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mailbox</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    {#each data.permissions as perm}
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="text-sm font-medium text-gray-900">{perm.user_name || 'Unknown'}</div>
                                <div class="text-xs text-gray-500">{perm.user_email}</div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{perm.mailbox_email}</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                    {perm.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 
                                     perm.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 
                                     'bg-red-100 text-red-800'}">
                                    {perm.status}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                {#if perm.status === 'PENDING'}
                                    <button onclick={() => updatePermission(perm.id, 'APPROVED')} class="text-green-600 hover:text-green-900">Approve</button>
                                    <button onclick={() => updatePermission(perm.id, 'REVOKED')} class="text-red-600 hover:text-red-900">Reject</button>
                                {:else if perm.status === 'APPROVED'}
                                    <button onclick={() => updatePermission(perm.id, 'REVOKED')} class="text-red-600 hover:text-red-900">Revoke Access</button>
                                {:else}
                                    <button onclick={() => updatePermission(perm.id, 'APPROVED')} class="text-green-600 hover:text-green-900">Approve</button>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    </div>
  {/if}
</div>
