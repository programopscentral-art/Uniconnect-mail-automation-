<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { fade, fly } from 'svelte/transition';

    let { data } = $props();
    let user = $derived(data.user);
    let stats = $derived(data.stats);
    let auditLogs = $derived(data.auditLogs);

    let isEditing = $state(false);
    let isUploading = $state(false);
    let message = $state({ text: '', type: '' });
    let showPerformanceModal = $state(false);

    let form = $state({
        display_name: '',
        phone: '',
        age: '',
        bio: ''
    });

    $effect(() => {
        if (user) {
            form.display_name = user.display_name || user.name || '';
            form.phone = user.phone || '';
            form.age = user.age?.toString() || '';
            form.bio = user.bio || '';
        }
    });

    async function handleUpdate() {
        try {
            const res = await fetch('/api/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: user.id,
                    ...form,
                    age: form.age ? parseInt(form.age.toString()) : null
                })
            });

            if (res.ok) {
                await invalidateAll();
                isEditing = false;
                message = { text: 'Profile updated successfully!', type: 'success' };
                setTimeout(() => message = { text: '', type: '' }, 3000);
            } else {
                message = { text: 'Failed to update profile.', type: 'error' };
            }
        } catch (e) {
            message = { text: 'An error occurred.', type: 'error' };
        }
    }

    async function handleFileUpload(e: Event) {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        isUploading = true;
        const formData = new FormData();
        formData.append('image', file);
        formData.append('userId', user.id);

        try {
            const res = await fetch('/api/profile/upload-image', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const { url } = await res.json();
                await fetch('/api/users', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: user.id, profile_picture_url: url })
                });
                await invalidateAll();
            }
        } catch (e) {
            console.error(e);
        } finally {
            isUploading = false;
        }
    }

    function formatTime(date: any) {
        const d = new Date(date);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString();
    }
</script>

<div class="max-w-7xl mx-auto space-y-8 p-4 md:p-8" in:fade>
    <!-- Header/Cover Area -->
    <div class="relative h-48 md:h-64 rounded-[32px] overflow-hidden shadow-floating">
        <div class="absolute inset-0 bg-gradient-to-br from-indigo-600 to-indigo-400"></div>
        <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(circle at 2px 2px, white 1px, transparent 0); background-size: 24px 24px;"></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 -mt-24 md:-mt-32 relative z-10">
        <!-- Sidebar Profile Card -->
        <div class="lg:col-span-4 space-y-6">
            <div class="bg-white rounded-[32px] p-8 shadow-floating border border-gray-100 flex flex-col items-center text-center space-y-6">
                <div class="relative inline-block group">
                    <div class="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-indigo-50 flex items-center justify-center text-4xl font-black text-indigo-700 mx-auto transition-transform group-hover:scale-[1.02]">
                        {#if user?.profile_picture_url}
                            <img src={user.profile_picture_url} alt={user.name} class="w-full h-full object-cover">
                        {:else}
                            {user?.name?.[0] || 'U'}
                        {/if}
                        {#if isUploading}
                            <div class="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                                <svg class="animate-spin h-8 w-8 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            </div>
                        {/if}
                    </div>
                    <label class="absolute bottom-0 right-0 p-2 bg-indigo-600 rounded-full text-white cursor-pointer shadow-lg hover:bg-indigo-700 transition-colors border-2 border-white">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <input type="file" class="hidden" accept="image/*" onchange={handleFileUpload}>
                    </label>
                </div>

                <div>
                    <h2 class="text-2xl font-black text-gray-900 leading-tight">{user?.display_name || user?.name || 'User'}</h2>
                    <p class="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{user?.role?.replace('_', ' ') || 'Team Member'}</p>
                </div>

                <div class="flex items-center justify-center gap-4 py-4 border-y border-gray-50">
                    <div class="text-center">
                        <div class="text-lg font-black text-gray-900">{stats.tasks.total}</div>
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Tasks</div>
                    </div>
                    <div class="w-px h-8 bg-gray-100"></div>
                    <div class="text-center">
                        <div class="text-lg font-black text-gray-900">{stats.mails.total}</div>
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Mails</div>
                    </div>
                    <div class="w-px h-8 bg-gray-100"></div>
                    <div class="text-center">
                        <div class="text-lg font-black text-gray-900">{stats.efficiency}%</div>
                        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Efficiency</div>
                    </div>
                </div>

                <div class="space-y-2">
                    <button 
                        onclick={() => showPerformanceModal = true}
                        class="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg active:scale-[0.98]"
                    >
                        Detailed Work Report
                    </button>
                </div>
            </div>

            <!-- Stats Mini Card -->
            <div class="bg-indigo-600 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                <div class="absolute top-0 right-0 p-4 opacity-10">
                    <svg class="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <h3 class="text-sm font-bold opacity-80 uppercase tracking-widest mb-1">Impact Level</h3>
                <div class="text-3xl font-black mb-4">{stats.impactRating}</div>
                <div class="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div class="h-full bg-white" style="width: {stats.efficiency}%"></div>
                </div>
                <p class="mt-4 text-[10px] font-bold opacity-60">
                    {#if stats.impactRating === 'Bronze Operator'}
                        Focus on task completion to unlock Silver tier.
                    {:else if stats.impactRating === 'Silver Operator'}
                        Excellent velocity. 50+ tasks for Gold tier.
                    {:else}
                        Top-tier performance maintained.
                    {/if}
                </p>
            </div>
        </div>

        <!-- Main Content (Forms/Timeline) -->
        <div class="lg:col-span-8 space-y-8 pb-12">
            <!-- Profile Information -->
            <div class="bg-white rounded-[32px] border border-gray-100 shadow-floating overflow-hidden">
                <div class="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                    <div>
                        <h3 class="text-lg font-black text-gray-900">Account Details</h3>
                        <p class="text-xs font-bold text-gray-400">Personalize your professional identity</p>
                    </div>
                    <button 
                        onclick={() => isEditing = !isEditing}
                        class="px-5 py-2.5 {isEditing ? 'bg-red-50 text-red-600' : 'bg-indigo-600 text-white'} rounded-xl text-xs font-black transition-all shadow-sm active:scale-95"
                    >
                        {isEditing ? 'Cancel Edit' : 'Edit Profile'}
                    </button>
                </div>

                <div class="p-8">
                    {#if message.text}
                        <div 
                            in:fly={{ y: 10 }}
                            class="mb-6 p-4 rounded-xl text-xs font-bold {message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}"
                        >
                            {message.text}
                        </div>
                    {/if}

                    <div class="grid grid-cols-2 gap-6">
                        <div class="col-span-2 sm:col-span-1">
                            <label for="p-name" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                            <input id="p-name" type="text" bind:value={form.display_name} readonly={!isEditing} class="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-4 text-sm font-black outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 focus:bg-white transition-all read-only:opacity-60">
                        </div>
                        <div class="col-span-2 sm:col-span-1">
                            <label for="p-age" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Age</label>
                            <input id="p-age" type="number" bind:value={form.age} readonly={!isEditing} class="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-4 text-sm font-black outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 focus:bg-white transition-all read-only:opacity-60">
                        </div>
                        <div class="col-span-2">
                            <label for="p-phone" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">WhatsApp / Phone</label>
                            <input id="p-phone" type="text" bind:value={form.phone} readonly={!isEditing} class="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-4 text-sm font-black outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 focus:bg-white transition-all read-only:opacity-60">
                        </div>
                        <div class="col-span-2">
                            <label for="p-bio" class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Public Bio</label>
                            <textarea id="p-bio" bind:value={form.bio} readonly={!isEditing} rows="3" class="w-full bg-gray-50 border border-transparent rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 focus:bg-white transition-all read-only:opacity-60" placeholder="Tell the team about your role..."></textarea>
                        </div>
                        
                        {#if isEditing}
                            <div class="col-span-2 pt-4" in:fly={{ y: 20 }}>
                                <button onclick={handleUpdate} class="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98]">
                                    Securely Save Changes
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Activity Timeline -->
            <div class="bg-white rounded-[32px] border border-gray-100 shadow-floating p-8">
                <h3 class="text-lg font-black text-gray-900 mb-6">Live Activity Audit</h3>
                {#if auditLogs.length > 0}
                    <div class="space-y-6">
                        {#each auditLogs as log}
                            <div class="flex gap-4 group">
                                <div class="flex flex-col items-center">
                                    <div class="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg shadow-sm group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors">
                                        {#if log.action.includes('CREATE')} 📝 {:else if log.action.includes('SEND')} 📤 {:else if log.action.includes('DELETE')} 🗑️ {:else} ⚡ {/if}
                                    </div>
                                    <div class="w-px flex-1 bg-gray-100 my-2 group-last:hidden"></div>
                                </div>
                                <div class="pb-6">
                                    <div class="text-sm font-black text-gray-900">{log.action.replace('_', ' ')}</div>
                                    <p class="text-xs font-bold text-gray-500 mt-0.5">{log.entity_type}: {log.entity_id || 'System Event'}</p>
                                    <span class="text-[10px] font-black text-gray-300 uppercase mt-2 block tracking-widest">{formatTime(log.created_at)}</span>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="text-center py-12 text-gray-400 font-bold">No recent activities found.</div>
                {/if}
            </div>
        </div>
    </div>
</div>

{#if showPerformanceModal}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" in:fade>
        <div class="bg-white rounded-[40px] w-full max-w-2xl overflow-hidden shadow-2xl" in:fly={{ y: 50 }}>
            <div class="p-10 space-y-8">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-3xl font-black text-gray-900">Performance Report</h2>
                        <p class="text-sm font-bold text-gray-400 mt-1">Institutional productivity metrics for {user.name}</p>
                    </div>
                    <button 
                        onclick={() => showPerformanceModal = false} 
                        aria-label="Close performance report"
                        class="p-3 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors"
                    >
                        <svg class="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                        <div class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Task Velocity</div>
                        <div class="text-4xl font-black text-indigo-700">{stats.tasks.completed}/{stats.tasks.total}</div>
                        <p class="text-[10px] font-bold text-indigo-600 mt-2">Historical completion rate</p>
                    </div>
                    <div class="p-6 bg-blue-50 rounded-3xl border border-blue-100">
                        <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Communication Power</div>
                        <div class="text-4xl font-black text-blue-700">{stats.mails.total}</div>
                        <p class="text-[10px] font-bold text-blue-600 mt-2">Total emails successfully fired</p>
                    </div>
                </div>

                <div class="space-y-4">
                    <h4 class="text-sm font-black text-gray-900 uppercase tracking-widest pl-1">Operational Efficiency</h4>
                    <div class="p-6 bg-gray-50 rounded-3xl border border-gray-100 relative overflow-hidden">
                        <div class="relative z-10 flex items-center justify-between mb-4">
                            <span class="text-2xl font-black text-gray-900">{stats.efficiency}%</span>
                            <span class="text-xs font-bold text-gray-400">Target Range: 90-100%</span>
                        </div>
                        <div class="h-3 bg-gray-200 rounded-full overflow-hidden relative">
                             <div class="h-full bg-gradient-to-r from-indigo-500 to-blue-500" style="width: {stats.efficiency}%"></div>
                        </div>
                    </div>
                </div>

                <button onclick={() => showPerformanceModal = false} class="w-full py-5 bg-gray-900 text-white rounded-3xl font-black text-sm hover:shadow-xl transition-all shadow-indigo-100">
                    Close Institutional Report
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
</style>
