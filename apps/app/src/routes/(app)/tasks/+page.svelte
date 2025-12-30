<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { fly, fade } from 'svelte/transition';
    // @ts-ignore
    let { data } = $props();

    let showModal = $state(false);
    let editingTask = $state<any>(null);
    let isSubmitting = $state(false);
    
    // Filters
    let filterStatus = $state('');
    let filterUniversity = $state('');
    let filterAssignedTo = $state('');

    // Form State
    let form = $state({
        title: '',
        description: '',
        priority: 'MEDIUM' as const,
        assigned_to: '',
        university_id: '',
        due_date: ''
    });

    const priorityColors: Record<string, string> = {
        URGENT: 'bg-red-100 text-red-700 border-red-200',
        HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
        MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200',
        LOW: 'bg-gray-100 text-gray-700 border-gray-200'
    };

    const statusColors: Record<string, string> = {
        PENDING: 'bg-amber-50 text-amber-700 border-amber-100',
        IN_PROGRESS: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        COMPLETED: 'bg-green-50 text-green-700 border-green-100',
        CANCELLED: 'bg-gray-50 text-gray-700 border-gray-100'
    };

    const statusLabels: Record<string, string> = {
        PENDING: '🕒 Pending',
        IN_PROGRESS: '🚀 Processing',
        COMPLETED: '✅ Done',
        CANCELLED: '❌ Cancelled'
    };

    let filteredTasks = $derived(data.tasks.filter((t: any) => {
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterUniversity && t.university_id !== filterUniversity) return false;
        if (filterAssignedTo && t.assigned_to !== filterAssignedTo) return false;
        return true;
    }));

    let filteredUsers = $derived.by(() => {
        const isGlobalAdmin = (data.user.role as any) === 'ADMIN' || (data.user.role as any) === 'PROGRAM_OPS';
        const isUnivAdmin = (data.user.role as any) === 'UNIVERSITY_OPERATOR';
        
        if (isGlobalAdmin) {
            if (!form.university_id) return data.users;
            return data.users.filter((u: any) => u.university_id === form.university_id);
        }
        
        // Non-global admins can only see users from their own university
        return data.users.filter((u: any) => u.university_id === data.user.university_id);
    });

    function openCreate() {
        editingTask = null;
        const isGlobalAdmin = (data.user.role as any) === 'ADMIN' || (data.user.role as any) === 'PROGRAM_OPS';
        const isUnivAdmin = (data.user.role as any) === 'UNIVERSITY_OPERATOR';

        form = {
            title: '',
            description: '',
            priority: 'MEDIUM',
            assigned_to: (isGlobalAdmin || isUnivAdmin) ? '' : data.user.id,
            university_id: isGlobalAdmin ? '' : data.user.university_id,
            due_date: ''
        };
        showModal = true;
    }

    function openEdit(task: any) {
        editingTask = task;
        form = {
            title: task.title,
            description: task.description || '',
            priority: task.priority || 'MEDIUM',
            assigned_to: task.assigned_to || '',
            university_id: task.university_id || '',
            due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : ''
        };
        showModal = true;
    }

    async function saveTask() {
        if (!form.title) return;
        isSubmitting = true;
        try {
            const url = '/api/tasks';
            const method = editingTask ? 'PATCH' : 'POST';
            const body = editingTask ? { id: editingTask.id, ...form } : form;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showModal = false;
                invalidateAll();
            }
        } finally {
            isSubmitting = false;
        }
    }

    async function updateStatus(task: any, newStatus: string) {
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: newStatus })
        });
        if (res.ok) invalidateAll();
    }

    async function deleteTask(id: string) {
        if (!confirm('Are you sure you want to delete this task?')) return;
        const res = await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
        if (res.ok) invalidateAll();
    }

    function getInitials(name: string) {
        return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '??';
    }
</script>

<div class="space-y-8 pb-12">
    <!-- Header Area -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">Task Command Center</h1>
            <p class="mt-1 text-gray-500 font-medium">Orchestrate your team's daily operations and student follow-ups.</p>
        </div>
        <button 
            onclick={openCreate}
            class="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 font-bold hover:bg-indigo-700 hover:-translate-y-0.5 transition-all duration-200"
        >
            <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
            </svg>
            {(data.user.role === 'ADMIN' || data.user.role === 'PROGRAM_OPS' || data.user.role === 'UNIVERSITY_OPERATOR') ? 'Assign New Task' : 'New Task'}
        </button>
    </div>

    <!-- Stats Dashboard View -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating">
            <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Open Tasks</div>
            <div class="text-3xl font-black text-gray-900 leading-tight">{data.tasks.filter((t:any) => t.status !== 'COMPLETED').length}</div>
        </div>
        <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating">
            <div class="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5 opacity-60">Critical Path</div>
            <div class="text-3xl font-black text-red-600 leading-tight">{data.tasks.filter((t:any) => t.priority === 'URGENT' || t.priority === 'HIGH').length}</div>
        </div>
        <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating">
            <div class="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 opacity-60">Active Sync</div>
            <div class="text-3xl font-black text-indigo-600 leading-tight">{data.tasks.filter((t:any) => t.status === 'IN_PROGRESS').length}</div>
        </div>
        <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating">
            <div class="text-[10px] font-black text-green-400 uppercase tracking-widest mb-1.5 opacity-60">Success Ops</div>
            <div class="text-3xl font-black text-green-600 leading-tight">{data.tasks.filter((t:any) => t.status === 'COMPLETED').length}</div>
        </div>
    </div>

    <!-- Filters Strip -->
    <div class="flex flex-wrap items-end gap-6 bg-gray-50/50 p-6 rounded-[32px] border border-gray-100 shadow-inner">
        <div class="flex-1 min-w-[200px]">
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Status</label>
            <select bind:value={filterStatus} class="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm">
                <option value="">All Statuses</option>
                <option value="PENDING">⏳ Pending</option>
                <option value="IN_PROGRESS">🚀 Processing</option>
                <option value="COMPLETED">✅ Done</option>
                <option value="CANCELLED">❌ Cancelled</option>
            </select>
        </div>
        {#if (data.user.role === 'ADMIN' || data.user.role === 'PROGRAM_OPS')}
            <div class="flex-1 min-w-[200px]">
                <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">University</label>
                <select bind:value={filterUniversity} class="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm">
                    <option value="">All Universities</option>
                    {#each data.universities as univ}
                        <option value={univ.id}>{univ.name}</option>
                    {/each}
                </select>
            </div>
        {/if}
        <div class="flex-1 min-w-[200px]">
            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Assigned To</label>
            <select bind:value={filterAssignedTo} class="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm">
                <option value="">All Members</option>
                {#each data.users as user}
                    <option value={user.id}>{user.name || user.email}</option>
                {/each}
            </select>
        </div>
        <button 
            onclick={() => { filterStatus = ''; filterUniversity = ''; filterAssignedTo = ''; }}
            class="px-6 py-3 text-sm font-black text-gray-400 hover:text-indigo-600 transition-colors mb-0.5 uppercase tracking-widest"
        >
            Reset
        </button>
    </div>

    <!-- Task Cards Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {#each filteredTasks as task (task.id)}
            <div 
                in:fly={{ y: 20, duration: 300 }}
                class="group bg-white rounded-[32px] border border-gray-100 shadow-floating hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden"
            >
                <!-- Priority/Status Bar -->
                <div class="flex items-center justify-between px-5 py-3 border-b border-gray-50 bg-gray-50/50 group-hover:bg-indigo-50/30 transition-colors">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border {priorityColors[task.priority] || priorityColors.MEDIUM}">
                        {task.priority || 'MEDIUM'} Priority
                    </span>
                    <div class="flex items-center space-x-2">
                        <select 
                            onchange={(e) => updateStatus(task, (e.target as HTMLSelectElement).value)}
                            class="text-[11px] font-bold py-1 px-2 rounded-lg border-none bg-transparent hover:bg-white cursor-pointer transition-all {statusColors[task.status] || statusColors.PENDING}"
                        >
                            {#each Object.entries(statusLabels) as [val, label]}
                                <option value={val} selected={task.status === val}>{label}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div class="p-6 flex-1 space-y-4">
                    <div class="flex justify-between items-start gap-3">
                        <div class="space-y-1">
                            <h3 class="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight">
                                {task.title}
                            </h3>
                            {#if task.university_name}
                                <div class="flex items-center text-xs font-semibold text-indigo-500 bg-indigo-50/50 px-2 py-0.5 rounded-full">
                                    <svg class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                    {task.university_short_name || task.university_name}
                                </div>
                            {/if}
                        </div>
                        <div class="flex flex-col items-end gap-2">
                             {#if task.assigned_to_name}
                                <div class="flex items-center gap-2 bg-gray-50 pr-3 rounded-full border border-gray-100 group-hover:bg-indigo-50/50 transition-colors">
                                    <div 
                                        class="w-7 h-7 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-indigo-600 shadow-sm"
                                        title="Assigned to: {task.assigned_to_name}"
                                    >
                                        {getInitials(task.assigned_to_name)}
                                    </div>
                                    <span class="text-[9px] font-bold text-gray-700 truncate max-w-[70px]">{task.assigned_to_name}</span>
                                </div>
                            {:else}
                                <div class="flex items-center gap-2 bg-gray-50 pr-3 rounded-full border border-gray-100">
                                    <div class="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-gray-400">
                                        ?
                                    </div>
                                    <span class="text-[9px] font-bold text-gray-400">Unassigned</span>
                                </div>
                            {/if}

                            {#if task.assigned_by_name}
                                <div class="text-[8px] font-black text-gray-400 uppercase tracking-tighter opacity-70">
                                    BY: {task.assigned_by_name}
                                </div>
                            {/if}
                        </div>
                    </div>

                    {#if task.description}
                        <p class="text-sm text-gray-600 line-clamp-2 leading-relaxed h-[40px]">
                            {task.description}
                        </p>
                    {/if}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-50">
                        <div class="flex items-center space-x-4">
                            <div class="flex items-center text-xs font-bold text-gray-400">
                                <svg class="h-4 w-4 mr-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Set Date'}
                            </div>
                        </div>
                        <div class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onclick={() => openEdit(task)}
                                class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Task"
                            >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button 
                                onclick={() => deleteTask(task.id)}
                                class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Task"
                            >
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        {:else}
            <div class="col-span-full py-16 flex flex-col items-center justify-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200">
                <div class="bg-gray-100 p-4 rounded-full mb-4">
                    <svg class="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" /></svg>
                </div>
                <h3 class="text-xl font-bold text-gray-900">Clear Skies!</h3>
                <p class="text-gray-500 font-medium">No tasks match your current filters. Take a break or create a new one.</p>
            </div>
        {/each}
    </div>
</div>

<!-- Premium Task Modal -->
{#if showModal}
<div class="fixed inset-0 z-50 flex items-center justify-center px-4" transition:fade={{ duration: 200 }}>
    <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onclick={() => showModal = false}></div>
    
    <div 
        class="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden"
        transition:fly={{ y: 30, duration: 400 }}
    >
        <div class="bg-indigo-600 px-8 py-6 text-white relative">
            <h3 class="text-2xl font-bold">{editingTask ? 'Edit Task Details' : 'Design New Task'}</h3>
            <p class="text-indigo-100 text-sm opacity-80">{editingTask ? 'Refine parameters and reassign if needed.' : 'Set clear goals and assign to team members.'}</p>
            <div class="absolute right-6 top-6">
                <button onclick={() => showModal = false} class="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>

        <div class="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
            <div class="space-y-4">
                <div>
                    <label for="f-title" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Title</label>
                    <input id="f-title" type="text" bind:value={form.title} placeholder="What needs to be done?" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all">
                </div>
                
                <div>
                    <label for="f-desc" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Description / Context</label>
                    <textarea id="f-desc" bind:value={form.description} rows="3" placeholder="Provide extra details for the team member..." class="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="f-priority" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Priority</label>
                        <select id="f-priority" bind:value={form.priority} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
                            <option value="URGENT">🔴 Urgent</option>
                            <option value="HIGH">🟠 High</option>
                            <option value="MEDIUM" selected>🔵 Medium</option>
                            <option value="LOW">⚪ Low</option>
                        </select>
                    </div>
                    <div>
                        <label for="f-due" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Deadline (Optional)</label>
                        <input id="f-due" type="datetime-local" bind:value={form.due_date} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="f-assign" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Assign To</label>
                        {#if (data.user.role === 'ADMIN' || data.user.role === 'PROGRAM_OPS' || data.user.role === 'UNIVERSITY_OPERATOR')}
                            <select id="f-assign" bind:value={form.assigned_to} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
                                <option value="">Personal / Unassigned</option>
                                <option value={data.user.id}>Assign to Myself</option>
                                {#each filteredUsers.filter(u => u.id !== data.user.id) as user}
                                    <option value={user.id}>{user.name || user.email}</option>
                                {/each}
                            </select>
                        {:else}
                            <div class="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-500">
                                Assigned to Self
                            </div>
                        {/if}
                    </div>
                    <div>
                        <label for="f-univ" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">University</label>
                        {#if (data.user.role === 'ADMIN' || data.user.role === 'PROGRAM_OPS')}
                            <select id="f-univ" bind:value={form.university_id} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
                                <option value="">None</option>
                                {#each data.universities as univ}
                                    <option value={univ.id}>{univ.name}</option>
                                {/each}
                            </select>
                        {:else}
                            <div class="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-500 truncate">
                                {data.universities.find(u => u.id === data.user.university_id)?.name || 'University'}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>

        <div class="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <button onclick={() => showModal = false} class="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">Discard Changes</button>
            <button 
                onclick={saveTask}
                disabled={isSubmitting || !form.title}
                class="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
                {isSubmitting ? 'Syncing...' : (editingTask ? 'Update Task' : 'Create Task')}
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
