<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { invalidateAll } from '$app/navigation';

  let roles = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'BOA'];
  let features = [
    { id: 'dashboard', label: 'Dashboard', desc: 'Main overview and stats' },
    { id: 'tasks', label: 'Tasks', desc: 'Task management and tracking' },
    { id: 'universities', label: 'Universities', desc: 'University management (Admin only)' },
    { id: 'students', label: 'Students', desc: 'Student and recipient directory' },
    { id: 'users', label: 'Team Members', desc: 'User management (Admin only)' },
    { id: 'analytics', label: 'Analytics', desc: 'Performance reports and data' },
    { id: 'mailboxes', label: 'Mailboxes', desc: 'Email connection management' },
    { id: 'templates', label: 'Templates', desc: 'Email template builder' },
    { id: 'campaigns', label: 'Campaigns', desc: 'Email automation campaigns' },
    { id: 'assessments', label: 'Assessments', desc: 'PDF parsing and QP generation' },
    { id: 'mail-logs', label: 'Mail Audit Log', desc: 'System-wide mail tracking' },
    { id: 'permissions', label: 'Permissions', desc: 'Feature management configuration' }
  ];

  let selectedRole = $state(roles[0]);
  let permissionsState = $state<Record<string, string[]>>({});
  let isLoading = $state(true);
  let isSaving = $state(false);

  async function fetchPermissions() {
    isLoading = true;
    try {
      const res = await fetch('/api/admin/permissions');
      if (res.ok) {
        const data = await res.json();
        // Initialize all roles with fetched data or empty arrays
        const newState: Record<string, string[]> = {};
        roles.forEach(role => {
          const existing = data.find((p: any) => p.role === role);
          newState[role] = existing ? (existing.features || []) : [];
        });
        permissionsState = newState;
      }
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  async function restoreDefaults() {
      if (!confirm('This will overwrite ALL role permissions with system defaults. Continue?')) return;
      isSaving = true;
      try {
          const res = await fetch('/api/admin/permissions', { method: 'PATCH' });
          if (res.ok) {
              const data = await res.json();
              const newState: Record<string, string[]> = {};
              roles.forEach(role => {
                  const existing = data.find((p: any) => p.role === role);
                  newState[role] = existing ? (existing.features || []) : [];
              });
              permissionsState = newState;
              await invalidateAll();
              alert('Default permissions restored successfully.');
          }
      } catch (e) {
          alert('Failed to restore defaults.');
      } finally {
          isSaving = false;
      }
  }

  onMount(fetchPermissions);

  let currentFeatures = $derived(permissionsState[selectedRole] || []);

  async function toggleFeature(featureId: string) {
    if (!permissionsState[selectedRole]) return;
    
    const originalFeatures = [...(permissionsState[selectedRole] || [])];
    let updatedFeatures = [...originalFeatures];

    if (updatedFeatures.includes(featureId)) {
        updatedFeatures = updatedFeatures.filter(id => id !== featureId);
    } else {
        updatedFeatures.push(featureId);
    }

    if (selectedRole === 'ADMIN' && featureId === 'permissions' && !updatedFeatures.includes('permissions')) {
        if (!confirm('Warning: You are about to disable this page for Admins. Continue?')) return;
    }

    // PHASE 1: Instant UI Update (Zero Latency)
    // We update the state Record directly. Svelte 5 will trigger all dependent UI parts immediately.
    permissionsState[selectedRole] = updatedFeatures;
    
    // PHASE 2: Background Sync (Non-blocking)
    syncToServer(selectedRole, updatedFeatures, originalFeatures);
  }

  async function syncToServer(role: string, features: string[], fallback: string[]) {
      isSaving = true;
      try {
        const res = await fetch('/api/admin/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, features })
        });
        
        if (!res.ok) throw new Error('Sync failed');
        
        // Quietly update sidebar data
        invalidateAll();
      } catch (e: any) {
        // Only revert on hard error, and inform the user
        permissionsState[role] = fallback;
        alert(`Could not save changes: ${e.message}. Settings have been reverted.`);
      } finally {
        isSaving = false;
      }
  }

  function getFeatureStatus(role: string, featureId: string) {
      return (permissionsState[role] || []).includes(featureId);
  }
</script>

<div class="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-4xl font-black text-gray-900 tracking-tight">Feature Management</h1>
      <p class="text-gray-500 mt-2 font-medium">Control which roles have access to specific application features. (Build: 2026-01-14-1500)</p>
    </div>
    <div class="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 hidden md:block">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <div>
                <div class="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">Global Access Policy</div>
                <div class="text-sm font-black text-indigo-700 mt-0.5 uppercase tracking-tight">Active Matrix Control</div>
            </div>
        </div>
    </div>
    <button 
        onclick={restoreDefaults}
        disabled={isSaving || isLoading}
        class="px-6 py-3 bg-white border-2 border-indigo-100 text-indigo-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 hover:border-indigo-200 transition-all disabled:opacity-50"
    >
        Restore System Defaults
    </button>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
    <!-- Role Selector -->
    <div class="lg:col-span-1 bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden sticky top-24">
      <div class="p-6 border-b border-gray-50 bg-gray-50/30">
        <h2 class="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Select Role</h2>
      </div>
      <div class="divide-y divide-gray-50">
        {#each roles as role}
          <button 
            onclick={() => selectedRole = role}
            class="w-full px-6 py-5 flex items-center justify-between group transition-all 
            {selectedRole === role ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}"
          >
            <div class="text-left">
              <span class="block text-sm font-black {selectedRole === role ? 'text-indigo-600' : 'text-gray-700'} uppercase tracking-tight">{role}</span>
              <span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{(permissionsState[role] || []).length} Features Active</span>
            </div>
            {#if selectedRole === role}
              <div transition:fly={{ x: 10, duration: 200 }} class="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200"></div>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Feature Matrix -->
    <div class="lg:col-span-3 space-y-6">
      {#if isLoading}
        <div class="flex flex-col items-center justify-center py-24 space-y-4">
          <div class="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <span class="text-xs font-black text-gray-400 uppercase tracking-widest">Loading permissions matrix...</span>
        </div>
      {:else}
        {#key selectedRole}
        <div class="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden" in:fade={{ duration: 200 }}>
          <div class="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h2 class="text-xl font-black text-gray-900 uppercase tracking-tight">Feature Matrix for {selectedRole}</h2>
              <p class="text-xs text-gray-500 font-medium mt-1">Changes take effect immediately for all users in this role.</p>
            </div>
            {#if isSaving}
              <div transition:fade class="flex items-center gap-2 text-indigo-600">
                <div class="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <span class="text-[10px] font-black uppercase tracking-widest">Syncing...</span>
              </div>
            {/if}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-50">
            {#each features as feature (feature.id)}
              <div class="p-8 hover:bg-gray-50/50 transition-all flex items-start gap-4">
                <label class="relative inline-flex items-center cursor-pointer mt-1">
                  <input 
                    type="checkbox" 
                    checked={currentFeatures.includes(feature.id)}
                    onchange={() => toggleFeature(feature.id)}
                    class="sr-only peer"
                  >
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
                <div>
                  <div class="text-sm font-black text-gray-900 uppercase tracking-tight">{feature.label}</div>
                  <p class="text-[11px] text-gray-500 font-medium mt-1 leading-relaxed">{feature.desc}</p>
                  
                  {#if currentFeatures.includes(feature.id)}
                    <span class="inline-block mt-2 px-3 py-1 bg-green-50 text-green-600 text-[10px] font-black rounded-lg uppercase tracking-widest border border-green-100 shadow-sm animate-in fade-in zoom-in duration-300">Enabled</span>
                  {:else}
                    <span class="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-400 text-[10px] font-black rounded-lg uppercase tracking-widest border border-gray-200 opacity-60">Disabled</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
        {/key}

        <!-- Global Roles Summary Table -->
         <div class="bg-indigo-900 rounded-[32px] p-8 text-white shadow-xl shadow-indigo-900/20 overflow-hidden relative">
            <div class="absolute -right-20 -top-20 w-64 h-64 bg-indigo-800 rounded-full opacity-50 blur-3xl"></div>
            <div class="relative z-10">
                <h3 class="text-lg font-black uppercase tracking-tight mb-6">Global Roles Summary</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                        <thead>
                            <tr class="border-b border-indigo-800">
                                <th class="pb-4 font-black uppercase tracking-widest text-indigo-300">Role</th>
                                {#each features.slice(0, 6) as f}
                                    <th class="pb-4 font-black uppercase tracking-widest text-indigo-300">{f.label}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-indigo-800/50">
                            {#each roles as role}
                                <tr class="hover:bg-white/5 transition-colors">
                                    <td class="py-4 font-black uppercase tracking-tight text-white">{role}</td>
                                    {#each features.slice(0, 6) as f}
                                        <td class="py-4">
                                            {#if getFeatureStatus(role, f.id)}
                                                <div class="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></div>
                                            {:else}
                                                <div class="w-2 h-2 rounded-full bg-indigo-800"></div>
                                            {/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
         </div>
      {/if}
    </div>
  </div>
</div>

<style>
  :global(.shadow-floating) {
    box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.08);
  }
</style>
