<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state(data.userUniversityId || '');
  let isLoading = $state(false);
  let mailboxes = $state(data.mailboxes);

  $effect(() => {
    selectedUniversityId = data.userUniversityId || '';
    mailboxes = data.mailboxes;
  });

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

<div class="space-y-8 animate-premium-fade">
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
    <div class="animate-premium-slide">
      <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Mailbox Connections</h1>
      <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Establish and manage secure Gmail integrations for system automation.</p>
    </div>
    <button 
      onclick={connectMailbox}
      disabled={!selectedUniversityId && data.userRole === 'ADMIN'}
      class="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale animate-premium-slide"
      style="animation-delay: 100ms;"
    >
      <svg class="w-5 h-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
      </svg>
      Link Google Workspace
    </button>
  </div>
  
  {#if data.userRole === 'ADMIN'}
    <div class="glass p-6 rounded-[2.5rem] flex items-center gap-6 animate-premium-slide" style="animation-delay: 200ms;">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] whitespace-nowrap">Institutional Node:</label>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={loadMailboxes}
            class="flex-1 max-w-md bg-white/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all text-gray-900 dark:text-white"
        >
            <option value="">Global Hierarchy (All)</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="glass overflow-hidden rounded-[2.5rem] animate-premium-slide" style="animation-delay: 300ms;">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
          <thead class="bg-gray-50/50 dark:bg-gray-800/50">
              <tr>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Mailbox Identity</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Operational Status</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Integration Date</th>
                  <th class="px-8 py-5 text-right text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Authority Control</th>
              </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
              {#each mailboxes as box}
                  <tr class="group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td class="px-8 py-6 whitespace-nowrap">
                        <div class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{box.email}</div>
                      </td>
                      <td class="px-8 py-6 whitespace-nowrap">
                          <span class="px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full {box.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}">
                              {box.status}
                          </span>
                      </td>
                      <td class="px-8 py-6 whitespace-nowrap text-xs font-bold text-gray-400 dark:text-gray-500 font-mono italic">
                        {new Date(box.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td class="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                          <div class="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                            {#if data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS' || data.userRole === 'UNIVERSITY_OPERATOR'}
                                <button 
                                    onclick={() => revokeMailbox(box.id)}
                                    class="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 dark:hover:bg-red-500 hover:text-white transition-all active:scale-90"
                                >
                                    Revoke
                                </button>
                            {:else if !data.permissions.find(p => p.mailbox_id === box.id && p.user_id === data.userId)}
                                <button 
                                  onclick={() => requestAccess(box.id)} 
                                  class="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-all active:scale-95"
                                >
                                  Request Authority
                                </button>
                            {:else if data.permissions.find(p => p.mailbox_id === box.id && p.user_id === data.userId && p.status === 'PENDING')}
                                <span class="text-[9px] font-black uppercase tracking-widest text-gray-400 italic">Request Pending</span>
                            {:else if data.permissions.find(p => p.mailbox_id === box.id && p.user_id === data.userId && p.status === 'APPROVED')}
                                <span class="text-[9px] font-black uppercase tracking-widest text-green-500 flex items-center gap-1.5">
                                  <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                  Authority Granted
                                </span>
                            {:else}
                                <button 
                                  onclick={() => requestAccess(box.id)} 
                                  class="px-4 py-2 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 dark:hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                                >
                                  Re-request
                                </button>
                            {/if}
                          </div>
                      </td>
                  </tr>
              {/each}
              {#if mailboxes.length === 0}
                  <tr>
                      <td colspan="4" class="px-8 py-20 text-center">
                          <div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 space-y-4">
                              <div class="w-16 h-16 rounded-3xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
                                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                              </div>
                              <p class="text-[10px] font-black uppercase tracking-[0.2em]">{selectedUniversityId ? 'No mailboxes connected in this node.' : 'Select institutional node to view connections.'}</p>
                          </div>
                      </td>
                  </tr>
              {/if}
          </tbody>
      </table>
    </div>
  </div>

  {#if (data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS' || data.userRole === 'UNIVERSITY_OPERATOR') && data.permissions.length > 0}
    <div class="mt-16 space-y-6 animate-premium-slide" style="animation-delay: 400ms;">
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-widest uppercase">Authority Requests</h2>
          <div class="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
          <span class="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-full uppercase tracking-tighter italic">{data.permissions.length} Pending</span>
        </div>
        
        <div class="glass overflow-hidden rounded-[2.5rem]">
            <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead class="bg-gray-50/50 dark:bg-gray-800/50">
                    <tr>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Inquirer Profile</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Target Resource</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Authority Status</th>
                        <th class="px-8 py-5 text-right text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">System Decision</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {#each data.permissions as perm}
                        <tr class="group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                            <td class="px-8 py-6 whitespace-nowrap">
                                <div class="text-sm font-bold text-gray-900 dark:text-white">{perm.user_name || 'System Operator'}</div>
                                <div class="text-xs font-semibold text-gray-400 dark:text-gray-500">{perm.user_email}</div>
                            </td>
                            <td class="px-8 py-6 whitespace-nowrap text-xs font-bold text-gray-700 dark:text-gray-300">
                              {perm.mailbox_email}
                            </td>
                            <td class="px-8 py-6 whitespace-nowrap">
                                <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest 
                                    {perm.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 
                                     perm.status === 'PENDING' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' : 
                                     'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}">
                                    {perm.status}
                                </span>
                            </td>
                            <td class="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                                <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                  {#if perm.status === 'PENDING'}
                                      <button 
                                        onclick={() => updatePermission(perm.id, 'APPROVED')} 
                                        class="px-4 py-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 dark:hover:bg-green-500 hover:text-white transition-all active:scale-90"
                                      >Approve</button>
                                      <button 
                                        onclick={() => updatePermission(perm.id, 'REVOKED')} 
                                        class="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 dark:hover:bg-red-500 hover:text-white transition-all active:scale-90"
                                      >Reject</button>
                                  {:else if perm.status === 'APPROVED'}
                                      <button 
                                        onclick={() => updatePermission(perm.id, 'REVOKED')} 
                                        class="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 dark:hover:bg-red-500 hover:text-white transition-all active:scale-90"
                                      >Revoke Authority</button>
                                  {:else}
                                      <button 
                                        onclick={() => updatePermission(perm.id, 'APPROVED')} 
                                        class="px-4 py-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 dark:hover:bg-green-500 hover:text-white transition-all active:scale-90"
                                      >Re-approve</button>
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
