<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  // @ts-ignore
  let { data } = $props();

  let showModal = $state(false);
  let isSubmitting = $state(false);
  
  // Form State
  let email = $state('');
  let name = $state('');
  let role = $state<string>('UNIVERSITY_OPERATOR');
  let universityIds = $state<string[]>([]);  // Changed from single string to array
  let editingUserId = $state<string | null>(null);
  let phone = $state('');
  let bio = $state('');
  let displayName = $state('');
  let showUniversityDropdown = $state(false);  // For multi-select dropdown

  let activeTab = $state<'users' | 'requests'>('users');
  let accessRequests = $state<any[]>([]);

  onMount(() => {
    accessRequests = [...data.accessRequests];
  });

  async function handleRequestAction(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
        const res = await fetch(`/api/users/access-requests/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });

        if (res.ok) {
            accessRequests = accessRequests.filter(r => r.id !== id);
            alert(`Request ${status.toLowerCase()} successfully`);
            invalidateAll();
        } else {
            alert('Failed to update request');
        }
    } catch (err) {
        alert('An error occurred');
    }
  }

  async function saveUser() {
    isSubmitting = true;
    try {
        const payload = {
            id: editingUserId,
            email,
            name,
            phone,
            bio,
            display_name: displayName || name,
            role,
            university_ids: (role !== 'ADMIN' && role !== 'PROGRAM_OPS') ? universityIds : []
        };
        
        const method = editingUserId ? 'PATCH' : 'POST';
        const endpoint = editingUserId ? '/api/users' : '/api/users/invite';
        
        const res = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.message || 'Failed');
            return;
        }

        if (!editingUserId) {
            alert('Invitation sent successfully!');
        }

        closeModal();
        invalidateAll();
    } catch (e) {
        console.error(e);
        alert('Error saving user');
    } finally {
        isSubmitting = false;
    }
  }

  function openEdit(user: any) {
      editingUserId = user.id;
      email = user.email;
      name = user.name || '';
      phone = user.phone || '';
      bio = user.bio || '';
      displayName = user.display_name || '';
      role = user.role;
      // Load universities from the universities array if available
      universityIds = user.universities?.map((u: any) => u.id) || (user.university_id ? [user.university_id] : []);
      showModal = true;
  }

  const selectAll = () => universityIds = data.universities.map((u:any) => u.id);
  const clearSelection = () => universityIds = [];

  function closeModal() {
      showModal = false;
      editingUserId = null;
      email = '';
      name = '';
      phone = '';
      bio = '';
      displayName = '';
      role = 'UNIVERSITY_OPERATOR';
      universityIds = [];
  }

  function toggleUniversity(univId: string) {
      if (universityIds.includes(univId)) {
          universityIds = universityIds.filter(id => id !== univId);
      } else {
          universityIds = [...universityIds, univId];
      }
  }

  async function deleteUser(id: string) {
      if (!confirm('Are you sure you want to remove this user? This action cannot be undone.')) return;
      try {
          const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
          if (res.ok) {
              alert('User removed');
              invalidateAll();
          } else {
              alert('Failed to remove user');
          }
      } catch (e) {
          alert('Error occurred');
      }
  }
  let searchQuery = $state('');
  let filterRole = $state('');
  let filterUniversity = $state('');
  let selectedUser = $state<any>(null);

  let filteredUsers = $derived(data.users.filter((u: any) => {
    if (searchQuery && !u.name?.toLowerCase().includes(searchQuery.toLowerCase()) && !u.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (filterUniversity && u.university_id !== filterUniversity) return false;
    return true;
  }));

  async function updateProfile(id: string, updates: any) {
    try {
        const res = await fetch('/api/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...updates })
        });
        if (res.ok) {
            invalidateAll();
        }
    } catch (e) {
        console.error(e);
    }
  }

  const roleColors: Record<string, string> = {
    ADMIN: 'bg-purple-50 text-purple-700 border-purple-200',
    PROGRAM_OPS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    UNIVERSITY_OPERATOR: 'bg-blue-50 text-blue-700 border-blue-200',
    COS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PM: 'bg-amber-50 text-amber-700 border-amber-200',
    PMA: 'bg-orange-50 text-orange-700 border-orange-200',
    BOA: 'bg-gray-50 text-gray-700 border-gray-200',
    CMA: 'bg-rose-50 text-rose-700 border-rose-200',
    CMA_MANAGER: 'bg-pink-50 text-pink-700 border-pink-200'
  };
</script>

<div class="space-y-8 pb-12">
  <!-- Header & Navigation -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="animate-premium-slide">
      <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Team Members <span class="text-xs font-normal text-gray-400 dark:text-slate-500 opacity-50 ml-2">v5.0.0</span></h1>
      <p class="mt-1 text-gray-500 dark:text-slate-400 font-medium">Manage your team and their access.</p>
    </div>
    
    <div class="flex flex-wrap items-center gap-4">
        <div class="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl shadow-inner">
            <button 
                onclick={() => activeTab = 'users'}
                class="px-5 py-2 rounded-lg text-sm font-bold transition-all {activeTab === 'users' ? 'bg-white dark:bg-slate-900 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400'}"
            >
                Directory
            </button>
            <button 
                onclick={() => activeTab = 'requests'}
                class="px-5 py-2 rounded-lg text-sm font-bold transition-all relative {activeTab === 'requests' ? 'bg-white dark:bg-slate-900 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400'}"
            >
                Requests
                {#if accessRequests.filter(r => r.status === 'PENDING').length > 0}
                    <span class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800">
                        {accessRequests.filter(r => r.status === 'PENDING').length}
                    </span>
                {/if}
            </button>
        </div>

        <button 
            onclick={() => { editingUserId = null; showModal = true; }}
            class="inline-flex items-center px-6 py-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 font-bold hover:bg-indigo-700 transition-all active:scale-95"
        >
            <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
            </svg>
            Add Team Member
        </button>
    </div>
  </div>

  {#if activeTab === 'users'}
    <!-- Search & Filters -->
    <div class="flex flex-wrap items-end gap-6 bg-gray-50/50 dark:bg-slate-900/40 p-6 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-inner animate-premium-fade stagger-1">
        <div class="flex-1 min-w-[280px]">
            <label for="u-search" class="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Search Members</label>
            <div class="relative">
                <input id="u-search" type="text" bind:value={searchQuery} placeholder="Search by name or email identity..." class="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3.5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all shadow-sm">
                <svg class="w-5 h-5 absolute left-4 top-3.5 text-gray-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
        </div>
        
        {#if data.isGlobalAdmin}
            <div class="w-[240px]">
                <label for="filter-univ" class="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">University Filter</label>
                <select id="filter-univ" bind:value={filterUniversity} class="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl px-5 py-3.5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all shadow-sm">
                    <option value="" class="dark:bg-slate-900">All Universities</option>
                    {#each data.universities as univ}
                        <option value={univ.id} class="dark:bg-slate-900">{univ.name}</option>
                    {/each}
                </select>
            </div>
        {/if}

        <div class="w-[220px]">
            <label for="filter-role" class="block text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 ml-1">Role Filter</label>
            <select id="filter-role" bind:value={filterRole} class="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl px-5 py-3.5 text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/20 transition-all shadow-sm">
                <option value="" class="dark:bg-slate-900">All Roles</option>
                <option value="ADMIN" class="dark:bg-slate-900">Admin</option>
                <option value="UNIVERSITY_OPERATOR" class="dark:bg-slate-900">University Admin</option>
                <option value="COS" class="dark:bg-slate-900">COS</option>
                <option value="PM" class="dark:bg-slate-900">PM</option>
                <option value="PMA" class="dark:bg-slate-900">PMA</option>
                <option value="BOA" class="dark:bg-slate-900">BOA</option>
                <option value="CMA" class="dark:bg-slate-900">CMA</option>
                <option value="CMA_MANAGER" class="dark:bg-slate-900">CMA Manager</option>
            </select>
        </div>
    </div>

    <!-- Users Grid/Table -->
    <div class="flex gap-8 relative items-start">
        <div class="flex-1 bg-white dark:bg-slate-900 shadow-floating dark:shadow-2xl rounded-[32px] border border-gray-100 dark:border-slate-800 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-100">
                    <thead class="bg-gray-50/50">
                        <tr>
                            <th class="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                            <th class="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Role</th>
                            <th class="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                            <th class="px-6 py-4 text-right text-[11px] font-black text-gray-400 uppercase tracking-widest">Activity</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        {#each filteredUsers as user}
                            <tr 
                                onclick={() => selectedUser = (selectedUser?.id === user.id ? null : user)}
                                class="group transition-all duration-200 cursor-pointer {selectedUser?.id === user.id ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-gray-50 dark:hover:bg-slate-900'}"
                            >
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-4">
                                        <div class="h-10 w-10 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-sm font-black text-gray-500 dark:text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                            {user.name ? user.name.split(' ').map((n:any)=>n[0]).join('').toUpperCase().substring(0,2) : user.email[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div class="text-sm font-bold text-gray-900">{user.name || 'Incomplete Profile'}</div>
                                            <div class="text-[11px] font-medium text-gray-400">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <div class="flex flex-col gap-1">
                                        <span class="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border {roleColors[user.role] || roleColors.BOA} w-fit">
                                            {user.role}
                                        </span>
                                        {#if user.universities && user.universities.length > 0}
                                            <div class="flex flex-col">
                                                {#each user.universities as univ}
                                                    <span class="text-[9px] font-bold text-indigo-400 leading-tight">• {univ.name}</span>
                                                {/each}
                                            </div>
                                        {:else if user.university_name}
                                            <span class="text-[10px] font-bold text-indigo-400">{user.university_name}</span>
                                        {/if}
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    {#if user.is_active}
                                        <div class="flex items-center gap-1.5 text-xs font-bold text-green-600">
                                            <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                            Active
                                        </div>
                                    {:else}
                                        <div class="flex items-center gap-1.5 text-xs font-bold text-red-400">
                                            <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                            Suspended
                                        </div>
                                    {/if}
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <div class="text-xs font-bold text-gray-400 uppercase tracking-tighter">
                                        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'New Invite'}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {#if filteredUsers.length === 0}
                <div class="p-16 flex flex-col items-center justify-center bg-gray-50/20 text-center">
                    <div class="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4"><svg class="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" /></svg></div>
                    <p class="text-sm font-bold text-gray-900">No matching members</p>
                    <p class="text-xs text-gray-400 mt-1">Try broadening your search or filters.</p>
                </div>
            {/if}
        </div>

        <!-- Detail Side Panel -->
        {#if selectedUser}
            <div class="w-80 h-fit sticky top-6 bg-white rounded-2xl border border-indigo-100 shadow-xl overflow-hidden animate-in slide-in-from-right-8 duration-300">
                <div class="h-24 bg-gradient-to-br from-indigo-600 to-blue-700 relative">
                     <button onclick={() => selectedUser = null} class="absolute top-4 right-4 p-1.5 bg-black/10 hover:bg-black/20 rounded-full text-white transition-colors" aria-label="Close Details">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div class="px-6 pb-8 -mt-10 relative">
                    <div class="h-20 w-20 rounded-2xl bg-white p-1 shadow-lg border border-gray-50 flex items-center justify-center mx-auto mb-4">
                        <div class="w-full h-full rounded-xl bg-gray-100 flex items-center justify-center text-xl font-black text-indigo-600">
                            {selectedUser.name ? selectedUser.name[0] : selectedUser.email[0]}
                        </div>
                    </div>
                    
                    <div class="text-center space-y-1">
                        <h3 class="text-xl font-bold text-gray-900">{selectedUser.name || 'New Member'}</h3>
                        <p class="text-xs font-bold text-indigo-500 uppercase tracking-widest">{selectedUser.role}</p>
                    </div>

                    <div class="mt-8 space-y-5">
                        <div class="space-y-1">
                            <span class="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Contact Email</span>
                            <p class="text-sm font-bold text-gray-700 break-all">{selectedUser.email}</p>
                        </div>
                        
                        {#if selectedUser.university_name}
                            <div class="space-y-1">
                                <span class="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Institution</span>
                                <p class="text-sm font-bold text-gray-700">{selectedUser.university_name}</p>
                            </div>
                        {/if}

                        <div class="space-y-1">
                            <span class="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Contact Options</span>
                            <div class="flex gap-2 pt-1">
                                <a href="mailto:{selectedUser.email}" class="flex-1 py-1.5 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-gray-100 text-[10px] font-black text-center transition-all uppercase tracking-tighter">📧 Email</a>
                                {#if selectedUser.phone}
                                    <a href="https://wa.me/{selectedUser.phone.replace(/[^0-9]/g, '')}" target="_blank" class="flex-1 py-1.5 bg-gray-50 hover:bg-green-50 hover:text-green-600 rounded-lg border border-gray-100 text-[10px] font-black text-center transition-all uppercase tracking-tighter">💬 WhatsApp</a>
                                {/if}
                            </div>
                        </div>

                        {#if selectedUser.bio}
                            <div class="space-y-1">
                                <span class="block text-[9px] font-black text-gray-400 uppercase tracking-widest">About / Bio</span>
                                <p class="text-[11px] font-medium text-gray-500 leading-relaxed italic border-l-2 border-gray-100 pl-3">"{selectedUser.bio}"</p>
                            </div>
                        {/if}
                    </div>

                    <div class="mt-8 pt-6 border-t border-gray-50 flex flex-col gap-2">
                        <button onclick={() => openEdit(selectedUser)} class="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-gray-200 hover:bg-black transition-all">Edit Permissions</button>
                        <button onclick={() => deleteUser(selectedUser.id)} class="w-full py-2.5 text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold transition-all">Remove from Team</button>
                    </div>
                </div>
            </div>
        {/if}
    </div>
  {:else}
    <!-- Access Requests View -->
    <div class="bg-white shadow-xl rounded-3xl border border-gray-100 overflow-hidden">
        <div class="p-8 border-b border-gray-50">
            <h2 class="text-xl font-extrabold text-gray-900 tracking-tight">Access Requests</h2>
            <p class="text-sm text-gray-500 font-medium">Approve or reject pending access requests.</p>
        </div>
        <div class="divide-y divide-gray-50">
            {#if accessRequests.filter(r => r.status === 'PENDING').length === 0}
                <div class="p-16 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
                    No pending invitations in the queue.
                </div>
            {:else}
                {#each accessRequests.filter(r => r.status === 'PENDING') as req}
                    <div class="p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-indigo-50/20 transition-all group">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <div class="font-black text-lg text-gray-900 group-hover:text-indigo-600 transition-colors">{req.user_name || 'Anonymous Applicant'}</div>
                                <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-tighter border border-indigo-100">Verification Pending</span>
                            </div>
                            <div class="text-sm font-bold text-gray-400 flex items-center gap-2 mb-4">
                                📩 {req.user_email}
                            </div>
                            <div class="flex flex-wrap gap-2">
                                {#each req.university_ids as univId}
                                    <span class="px-3 py-1 bg-white text-gray-600 rounded-xl text-[10px] font-black border border-gray-200 shadow-sm flex items-center gap-1.5">
                                        <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                        {data.universities.find((u:any) => u.id === univId)?.name || 'Institutional Access'}
                                    </span>
                                {/each}
                            </div>
                        </div>
                        <div class="flex items-center gap-3 w-full md:w-auto">
                            <button 
                                onclick={() => handleRequestAction(req.id, 'REJECTED')}
                                class="flex-1 md:flex-none px-6 py-3 text-red-500 hover:bg-red-50 rounded-xl text-sm font-black transition-all"
                            >
                                Decline
                            </button>
                            <button 
                                onclick={() => handleRequestAction(req.id, 'APPROVED')}
                                class="flex-1 md:flex-none px-8 py-3 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95"
                            >
                                Grant Access
                            </button>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
  {/if}
</div>

<!-- Refined Invite Modal -->
{#if showModal}
<div class="fixed inset-0 z-50 flex items-center justify-center px-4">
  <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="button" tabindex="-1" aria-label="Close modal background"></div>
  <div class="inline-block align-bottom bg-white rounded-3xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-100 animate-in zoom-in-95 duration-200">
    <div class="bg-gradient-to-br from-emerald-600 to-emerald-800 px-8 py-6 text-white">
        <h3 class="text-2xl font-black tracking-tight flex items-center justify-between" id="modal-title">
          <span>{editingUserId ? 'Edit Member' : 'Invite Member'}</span>
          <div class="flex items-center gap-2">
            <span class="text-[9px] bg-white/20 px-2 py-1 rounded-full border border-white/20 animate-pulse uppercase tracking-widest">Multi-Select Active</span>
            <span class="text-[10px] bg-black/20 px-2 py-1 rounded-lg">Build: 1600</span>
          </div>
        </h3>
        <p class="text-indigo-100 text-sm opacity-80 mt-1">Set user details and assigned roles.</p>
    </div>
    
    <div class="p-8 space-y-6 max-h-[65vh] overflow-y-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="col-span-2">
                <label for="f-email" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                <input type="email" id="f-email" bind:value={email} disabled={!!editingUserId} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all disabled:opacity-50">
            </div>
            <div class="col-span-1">
                <label for="f-name" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                <input type="text" id="f-name" bind:value={name} placeholder="John Doe" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
            </div>
            <div class="col-span-1">
                <label for="f-role" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Member Role</label>
                <select id="f-role" bind:value={role} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
                    {#if data.isGlobalAdmin}
                        <option value="ADMIN">Program Ops (Admin)</option>
                    {/if}
                    <option value="UNIVERSITY_OPERATOR">Univ Admin (Sub-Admin)</option>
                    <option value="COS">COS</option>
                    <option value="PM">PM</option>
                    <option value="PMA">PMA</option>
                    <option value="BOA">BOA</option>
                    {#if universityIds.includes('13f3513e-9ab1-4515-a97c-1d7ef7bba9fc')}
                        <option value="CMA">CMA</option>
                        <option value="CMA_MANAGER">CMA Manager</option>
                    {/if}
                </select>
            </div>
            
            <div class="col-span-1">
                <label for="f-phone" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">WhatsApp / Phone</label>
                <input type="text" id="f-phone" bind:value={phone} placeholder="+91 9876543210" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
            </div>

            <div class="col-span-2">
                <label for="f-bio" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Short Bio</label>
                <textarea id="f-bio" bind:value={bio} placeholder="e.g. Managing institutional outreach and student coordination." class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all" rows="2"></textarea>
            </div>

            {#if data.isGlobalAdmin}
            <div class="col-span-2">
                <div class="flex items-center justify-between mb-3 px-1">
                    <span id="assign-inst-label" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Assign to Institutions</span>
                    <div class="flex gap-3">
                        <button type="button" onclick={selectAll} class="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest transition-colors">Select All</button>
                        <button type="button" onclick={clearSelection} class="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors">Clear</button>
                    </div>
                </div>
                <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 max-h-48 overflow-y-auto space-y-2 shadow-inner" aria-labelledby="assign-inst-label">
                    {#each data.universities as univ}
                        <label class="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl hover:bg-indigo-50/50 hover:border-indigo-100 cursor-pointer transition-all group">
                            <input
                                type="checkbox"
                                checked={universityIds.includes(univ.id)}
                                onchange={() => toggleUniversity(univ.id)}
                                class="w-6 h-6 rounded-lg border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-all"
                            />
                            <div class="flex flex-col">
                                <span class="text-sm font-bold text-gray-700 group-hover:text-emerald-700 transition-colors">{univ.name}</span>
                                {#if univ.short_name}
                                    <span class="text-[10px] font-medium text-gray-400 uppercase tracking-tighter">{univ.short_name}</span>
                                {/if}
                            </div>
                        </label>
                    {/each}
                    {#each Array(3) as _}
                        <div class="h-1 invisible"></div> <!-- Extra spacer for scroll bottom -->
                    {/each}
                </div>
                <div class="mt-2 ml-1 text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    Selected: {universityIds.length} institutions
                </div>
            </div>
            {/if}
        </div>
    </div>

    <div class="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <button onclick={closeModal} class="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">Discard</button>
        <button 
            onclick={saveUser}
            disabled={isSubmitting || !email || (role !== 'ADMIN' && universityIds.length === 0 && data.isGlobalAdmin) || ((role === 'CMA' || role === 'CMA_MANAGER') && !universityIds.includes('13f3513e-9ab1-4515-a97c-1d7ef7bba9fc'))}
            class="bg-indigo-600 text-white px-10 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
        >
            {isSubmitting ? 'Syncing...' : (editingUserId ? 'Update Permissions' : 'Send Invitation')}
        </button>
    </div>
  </div>
</div>
{/if}

<style>
    :global(body) {
        background-color: #fcfcfd;
    }
</style>
