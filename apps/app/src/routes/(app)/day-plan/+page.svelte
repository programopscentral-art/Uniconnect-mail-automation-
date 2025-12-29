<script lang="ts">
    import { invalidateAll } from '$app/navigation';
    import { onMount } from 'svelte';
    
    // @ts-ignore
    let { data } = $props();

    // Form State for Quick Add
    let title = $state('');
    let description = $state('');
    let dueDate = $state(new Date().toISOString().split('T')[0]);
    let repeat = $state('Do not repeat');
    let endDate = $state('');
    let linkToEvent = $state('No event');
    let isSubmitting = $state(false);

    async function toggleStatus(task: any) {
        const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: newStatus })
        });
        if (res.ok) invalidateAll();
    }

    async function addTask() {
        if (!title) return;
        isSubmitting = true;
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description,
                    due_date: dueDate,
                    type: linkToEvent !== 'No event' ? 'EVENT' : 'TASK'
                })
            });
            if (res.ok) {
                title = '';
                description = '';
                invalidateAll();
            }
        } finally {
            isSubmitting = false;
        }
    }

    const todayDateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
</script>

<div class="p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
    <!-- Header -->
    <div class="flex flex-col">
        <h1 class="text-sm font-bold text-green-600 uppercase tracking-wider mb-1">Day Plan</h1>
        <h2 class="text-3xl font-black text-gray-900">{todayDateLabel}</h2>
        <p class="text-gray-500 text-sm mt-1">Capture and complete today's commitments. Tasks auto-link to today.</p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Total Today -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-4">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Total today</span>
                <span class="flex items-center text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    <span class="w-1.5 h-1.5 bg-blue-600 rounded-full mr-1.5 animate-pulse"></span>
                    Live
                </span>
            </div>
            <div class="text-4xl font-black text-gray-900">{data.stats.total}</div>
            <div class="text-xs text-gray-400 mt-1">All tasks for today</div>
            <div class="absolute bottom-0 left-0 h-1 w-0 bg-blue-600 transition-all duration-500 group-hover:w-full"></div>
        </div>

        <!-- Completed Today -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-4">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Completed</span>
                <span class="flex items-center text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                    <span class="w-1.5 h-1.5 bg-green-600 rounded-full mr-1.5 animate-pulse"></span>
                    Live
                </span>
            </div>
            <div class="text-4xl font-black text-gray-900">{data.stats.completed}</div>
            <div class="text-xs text-gray-400 mt-1">Checked off today</div>
            <div class="absolute bottom-0 left-0 h-1 w-0 bg-green-600 transition-all duration-500 group-hover:w-full"></div>
        </div>

        <!-- Pending -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-4">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Pending</span>
                <span class="flex items-center text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    <span class="w-1.5 h-1.5 bg-indigo-600 rounded-full mr-1.5 animate-pulse"></span>
                    Live
                </span>
            </div>
            <div class="text-4xl font-black text-gray-900">{data.stats.pending}</div>
            <div class="text-xs text-gray-400 mt-1">Still open</div>
            <div class="absolute bottom-0 left-0 h-1 w-0 bg-indigo-600 transition-all duration-500 group-hover:w-full"></div>
        </div>

        <!-- Overdue -->
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-4">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Overdue</span>
                <span class="flex items-center text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    <span class="w-1.5 h-1.5 bg-red-600 rounded-full mr-1.5 animate-pulse"></span>
                    Live
                </span>
            </div>
            <div class="text-4xl font-black text-gray-900">{data.stats.overdue}</div>
            <div class="text-xs text-gray-400 mt-1">Carryover needed</div>
            <div class="absolute bottom-0 left-0 h-1 w-0 bg-red-600 transition-all duration-500 group-hover:w-full"></div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Tasks List -->
        <div class="lg:col-span-2 space-y-4">
            <div class="flex items-center justify-between px-2">
                <div>
                    <h3 class="font-bold text-gray-900">Today's tasks</h3>
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assigned to you · Real-time updated</p>
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm min-h-[400px]">
                {#if data.tasks.length === 0}
                    <div class="p-12 text-center">
                        <div class="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                            </svg>
                        </div>
                        <p class="text-gray-400 text-sm">No tasks for today. Use Quick Add or visit the <a href="/tasks" class="text-blue-600 font-bold hover:underline">All Tasks</a> page.</p>
                    </div>
                {:else}
                    <div class="divide-y divide-gray-50">
                        {#each data.tasks as task}
                            <div class="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group">
                                <button 
                                    onclick={() => toggleStatus(task)}
                                    class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                                    {task.status === 'COMPLETED' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 text-transparent hover:border-blue-400'}"
                                >
                                    {#if task.status === 'COMPLETED'}
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                                        </svg>
                                    {/if}
                                </button>
                                <div class="flex-1">
                                    <div class="text-sm font-semibold text-gray-900 {task.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}">{task.title}</div>
                                    {#if task.description}
                                        <div class="text-xs text-gray-500 truncate max-w-md">{task.description}</div>
                                    {/if}
                                </div>
                                {#if task.university_name}
                                    <span class="text-[10px] font-bold text-gray-400 border border-gray-100 px-2 py-0.5 rounded shadow-sm group-hover:bg-white transition-colors uppercase tracking-tight">
                                        {task.university_name}
                                    </span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <!-- Quick Add Sidebar -->
        <div class="space-y-4">
            <div class="px-2">
                <h3 class="font-bold text-gray-900">Quick add</h3>
                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Creates task for today automatically</p>
            </div>

            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                <!-- Title -->
                <div>
                    <label for="qa-title" class="block text-xs font-bold text-gray-500 uppercase mb-2">Title</label>
                    <input 
                        id="qa-title" 
                        type="text" 
                        bind:value={title}
                        placeholder="e.g., Call students about workshop" 
                        class="w-full px-4 py-2 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 text-sm font-medium transition-all"
                    >
                </div>

                <!-- Description -->
                <div>
                    <label for="qa-desc" class="block text-xs font-bold text-gray-500 uppercase mb-2">Description</label>
                    <textarea 
                        id="qa-desc" 
                        bind:value={description}
                        placeholder="Details (optional)" 
                        rows="3"
                        class="w-full px-4 py-2 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-gray-50 text-sm font-medium transition-all"
                    ></textarea>
                </div>

                <!-- Date Selection -->
                <div>
                    <label for="qa-date" class="block text-xs font-bold text-gray-500 uppercase mb-2">Task date</label>
                    <input 
                        id="qa-date" 
                        type="date" 
                        bind:value={dueDate}
                        class="w-full px-4 py-2 border border-gray-100 rounded-xl outline-none bg-gray-50 text-sm font-medium"
                    >
                </div>

                <!-- Repeat & End Date -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label for="qa-repeat" class="block text-xs font-bold text-gray-500 uppercase mb-2">Repeat</label>
                        <select id="qa-repeat" bind:value={repeat} class="w-full px-3 py-2 border border-gray-100 rounded-xl outline-none bg-gray-50 text-sm font-medium">
                            <option>Do not repeat</option>
                            <option>Daily</option>
                            <option>Weekly</option>
                        </select>
                    </div>
                    <div>
                        <label for="qa-end" class="block text-xs font-bold text-gray-500 uppercase mb-2">End date (optional)</label>
                        <input id="qa-end" type="date" bind:value={endDate} class="w-full px-3 py-2 border border-gray-100 rounded-xl outline-none bg-gray-50 text-sm font-medium">
                    </div>
                </div>

                <!-- Link to Event -->
                <div>
                    <label for="qa-event" class="block text-xs font-bold text-gray-500 uppercase mb-2">Link to event (optional)</label>
                    <select id="qa-event" bind:value={linkToEvent} class="w-full px-4 py-2 border border-gray-100 rounded-xl outline-none bg-gray-50 text-sm font-medium">
                        <option>No event</option>
                        <option>Holiday</option>
                        <option>Exam</option>
                        <option>Meeting</option>
                    </select>
                </div>

                <!-- Add Button -->
                <button 
                    onclick={addTask}
                    disabled={isSubmitting || !title}
                    class="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-sm shadow-lg shadow-green-100 transition-all disabled:opacity-50 disabled:grayscale hover:scale-[1.02] active:scale-[0.98]"
                >
                    {isSubmitting ? 'Processing...' : 'Add task for today'}
                </button>
                <p class="text-[10px] text-center text-gray-400 font-medium">
                    Tasks are scoped to your team via R.S. Admins can later reassign and link to events.
                </p>
            </div>
        </div>
    </div>
</div>
