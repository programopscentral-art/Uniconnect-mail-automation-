<script lang="ts">
    import { goto, invalidateAll } from '$app/navigation';
    import { fade } from 'svelte/transition';
    // @ts-ignore
    let { data } = $props();

    // Calendar logic
    const today = new Date();
    let currentMonth = $state(today.getMonth());
    let currentYear = $state(today.getFullYear());
    let viewMode = $state<'MY_TASKS' | 'STUDENT_SCHEDULE'>('MY_TASKS');
    
    // Modal & Form State
    let showDayModal = $state(false);
    let showTaskModal = $state(false);
    
    // Use $derived for reactivity from data props if possible, or watch data
    let selectedUniversityId = $derived(data.selectedUniversityId);
    let defaultUniversityId = $derived(data.defaultUniversityId);

    let selectedDateEvents: any[] = $state([]);
    let selectedDateLabel = $state('');
    let selectedDayNum = $state(0); 

    let isAddingEvent = $state(false);
    let newEvent = $state({ 
        title: '', 
        type: 'EVENT', 
        description: '',
        start_date: '',
        due_date: ''
    });
    
    let taskForm = $state({
        title: '',
        description: '',
        priority: 'MEDIUM',
        assigned_to: data.userId, // Default to self
        university_id: data.defaultUniversityId || '',
        due_date: new Date().toISOString().slice(0, 16)
    });

    let isSaving = $state(false);

    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    let calendarDays = $derived.by(() => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        let days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(i);
        return days;
    });

    function nextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0; currentYear++;
        } else {
            currentMonth++;
        }
    }

    function prevMonth() {
        if (currentMonth === 0) {
            currentMonth = 11; currentYear--;
        } else {
            currentMonth--;
        }
    }

    // Task Stats
    const taskStats = $derived([
        { label: 'Total Tasks', value: data.taskStats.total, icon: '📋', color: 'bg-blue-50 text-blue-600' },
        { label: 'Done', value: data.taskStats.completed, icon: '✅', color: 'bg-green-50 text-green-600' },
        { label: 'Pending', value: data.taskStats.pending, icon: '⏳', color: 'bg-yellow-50 text-yellow-600' },
        { label: 'Processing', value: data.taskStats.in_progress || 0, icon: '🚀', color: 'bg-indigo-50 text-indigo-600' },
        { label: 'Overdue', value: data.taskStats.overdue || 0, icon: '⚠️', color: 'bg-red-50 text-red-600' },
    ]);

    function parseEvent(task: any) {
        let type = 'TASK';
        let desc = task.description || '';
        try {
            if (desc.startsWith('{')) {
                const parsed = JSON.parse(desc);
                if (parsed.type) {
                    type = parsed.type;
                    desc = parsed.description || '';
                }
            }
        } catch (e) {}
        
        return { ...task, type, parsedDescription: desc };
    }

    function getEventsForDay(day: number) {
        if (!day) return [];
        const targetDate = new Date(currentYear, currentMonth, day);
        targetDate.setHours(0, 0, 0, 0);
        const targetTime = targetDate.getTime();

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (viewMode === 'MY_TASKS') {
            return data.tasks.filter((t: any) => {
                const endD = new Date(t.due_date);
                endD.setHours(0, 0, 0, 0);
                return targetTime === endD.getTime();
            }).map(t => {
                const dueDate = new Date(t.due_date);
                dueDate.setHours(0,0,0,0);
                const isOverdue = t.status !== 'COMPLETED' && dueDate.getTime() < now.getTime();
                return { ...t, type: 'TASK', isOverdue };
            });
        } else {
            return data.scheduleEvents.filter((e: any) => {
                const startD = new Date(e.start_date);
                startD.setHours(0, 0, 0, 0);
                const endD = new Date(e.due_date);
                endD.setHours(0, 0, 0, 0);
                return targetTime >= startD.getTime() && targetTime <= endD.getTime();
            });
        }
    }

    function openDayModal(day: number) {
        if (!day) return;
        selectedDayNum = day;
        selectedDateLabel = `${monthNames[currentMonth]} ${day}, ${currentYear}`;
        selectedDateEvents = getEventsForDay(day);
        isAddingEvent = false;
        newEvent = { title: '', type: 'EVENT', description: '', start_date: '', due_date: '' };
        showDayModal = true;
    }

    function onUnivChange(e: Event) {
        const val = (e.target as HTMLSelectElement).value;
        const url = new URL(window.location.href);
        if (val) url.searchParams.set('universityId', val);
        else url.searchParams.delete('universityId');
        goto(url.toString());
    }

    async function toggleStatus(task: any) {
        const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: newStatus })
        });
        if (res.ok) {
            await invalidateAll();
            setTimeout(() => {
                selectedDateEvents = getEventsForDay(selectedDayNum);
            }, 100);
        }
    }

    async function deleteEvent(id: string, type: string) {
        if (!confirm('Are you sure?')) return;
        const endpoint = type === 'TASK' ? `/api/tasks?id=${id}` : `/api/schedule-events?id=${id}`;
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (res.ok) {
            await invalidateAll();
            setTimeout(() => { selectedDateEvents = getEventsForDay(selectedDayNum); }, 100);
        }
    }

    async function saveEvent() {
        if (!newEvent.title) return alert('Title is required.');
        isSaving = true;
        try {
            const payload = {
                title: newEvent.title,
                type: newEvent.type,
                description: newEvent.description,
                start_date: newEvent.start_date || new Date(currentYear, currentMonth, selectedDayNum, 9).toISOString(),
                due_date: newEvent.due_date || new Date(currentYear, currentMonth, selectedDayNum, 18).toISOString(),
                university_id: data.selectedUniversityId || data.defaultUniversityId
            };

            const res = await fetch('/api/schedule-events', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                await invalidateAll();
                setTimeout(() => {
                    selectedDateEvents = getEventsForDay(selectedDayNum);
                    isAddingEvent = false; 
                }, 100);
            } else {
                alert('Failed to save event');
            }
        } catch (e) {
            console.error(e);
            alert('Error');
        } finally {
            isSaving = false;
        }
    }

    async function saveTask() {
        if (!taskForm.title) return alert('Title is required.');
        isSaving = true;
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                body: JSON.stringify(taskForm),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showTaskModal = false;
                taskForm = {
                    title: '',
                    description: '',
                    priority: 'MEDIUM',
                    assigned_to: data.userId,
                    university_id: data.defaultUniversityId || '',
                    due_date: new Date().toISOString().slice(0, 16)
                };
                await invalidateAll();
            } else {
                const err = await res.json();
                alert(err.message || 'Failed to save task');
            }
        } finally {
            isSaving = false;
        }
    }

    function getEventColor(event: any) {
        if (event.type === 'TASK') {
            if (event.status === 'COMPLETED') return 'bg-green-50 text-green-700 border-green-200';
            if (event.status === 'CANCELLED') return 'bg-gray-100 text-gray-500 border-gray-200';
            
            switch (event.priority) {
                case 'URGENT': return 'bg-red-50 text-red-700 border-red-200';
                case 'HIGH': return 'bg-orange-50 text-orange-700 border-orange-200';
                case 'MEDIUM': return 'bg-blue-50 text-blue-700 border-blue-200';
                default: return 'bg-gray-50 text-gray-600 border-gray-200';
            }
        }
        switch (event.type) {
            case 'HOLIDAY': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
            case 'EXAM': return 'bg-red-50 text-red-700 border-red-200';
            case 'EVENT': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            default: return 'bg-gray-50 text-gray-600';
        }
    }

    function getStatusSymbol(status: string) {
        switch (status) {
            case 'PENDING': return '🕒';
            case 'IN_PROGRESS': return '🚀';
            case 'COMPLETED': return '✅';
            case 'CANCELLED': return '❌';
            default: return '📋';
        }
    }

    const upcomingTasks = $derived.by(() => {
        const now = new Date().getTime();
        return data.tasks
            .filter((t: any) => t.status !== 'COMPLETED' && t.due_date && new Date(t.due_date).getTime() > now)
            .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
            .slice(0, 5)
            .map(parseEvent);
    });

    // Day Plan state and logic
    let dayPlanItems = $derived(data.dayPlans || []);
    let newDayPlanTitle = $state('');
    let isAddingItem = $state(false);

    async function toggleDayPlanItem(item: any) {
        try {
            const res = await fetch('/api/day-plans', {
                method: 'PATCH',
                body: JSON.stringify({
                    id: item.id,
                    completed: !item.completed
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) await invalidateAll();
        } catch (e) {
            console.error('Error toggling day plan item:', e);
        }
    }

    async function addDayPlanItem() {
        if (!newDayPlanTitle.trim()) return;
        try {
            const res = await fetch('/api/day-plans', {
                method: 'POST',
                body: JSON.stringify({
                    title: newDayPlanTitle,
                    plan_date: new Date().toISOString().split('T')[0]
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                newDayPlanTitle = '';
                isAddingItem = false;
                await invalidateAll();
            }
        } catch (e) {
            console.error('Error adding day plan item:', e);
        }
    }

    async function deleteDayPlanItem(id: string) {
        try {
            const res = await fetch(`/api/day-plans?id=${id}`, {
                method: 'DELETE'
            });
            if (res.ok) await invalidateAll();
        } catch (e) {
            console.error('Error deleting day plan item:', e);
        }
    }

    async function promoteToTask(item: any) {
        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                body: JSON.stringify({
                    title: item.title,
                    description: 'Promoted from Day Plan',
                    priority: 'MEDIUM',
                    assigned_to: data.userId,
                    university_id: data.defaultUniversityId || undefined
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                await deleteDayPlanItem(item.id);
                await invalidateAll();
            }
        } catch (e) {
            console.error('Error promoting task:', e);
        }
    }
</script>

<div class="flex flex-col xl:flex-row gap-8 min-h-screen relative p-2 md:p-6" in:fade>
    <!-- Main Content Area (Left) -->
    <div class="flex-1 space-y-8">
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
                <h1 class="text-3xl font-black text-gray-900 tracking-tight">Main Dashboard</h1>
                <p class="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">Real-time Overview</p>
            </div>
            {#if data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS'}
                <div class="w-full sm:w-auto">
                   <select 
                        onchange={onUnivChange} 
                        value={data.selectedUniversityId || ''} 
                        class="block w-full sm:w-72 bg-white border border-gray-100 rounded-2xl px-5 py-3.5 text-sm font-black text-gray-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none"
                    >
                       <option value="">All Universities</option>
                       {#each data.universities as univ}
                           <option value={univ.id}>{univ.name}</option>
                       {/each}
                   </select>
                </div>
            {/if}
        </div>

        <!-- Task Stats -->
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
            {#each taskStats as stat}
                <div class="bg-white p-6 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-gray-100 flex flex-col items-center text-center transition-all hover:scale-[1.05] hover:shadow-indigo-500/10 cursor-default group">
                    <div class="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl {stat.color} shadow-sm mb-4 group-hover:rotate-6 transition-transform">{stat.icon}</div>
                    <div class="w-full">
                        <div class="text-3xl font-black text-gray-900 leading-none mb-1">{stat.value}</div>
                        <div class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{stat.label}</div>
                    </div>
                </div>
            {/each}
        </div>

        <!-- Calendar Section -->
        <div class="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div class="flex items-center gap-6">
                    <h2 class="text-xl font-black text-gray-900">Task Calendar</h2>
                    <div class="flex bg-gray-50/50 p-1.5 rounded-2xl border border-gray-100">
                        <button onclick={() => viewMode = 'MY_TASKS'} class="px-5 py-2 text-xs font-black rounded-xl transition-all {viewMode === 'MY_TASKS' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-400 hover:text-gray-600'}">All Tasks</button>
                        <button onclick={() => viewMode = 'STUDENT_SCHEDULE'} class="px-5 py-2 text-xs font-black rounded-xl transition-all {viewMode === 'STUDENT_SCHEDULE' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-400 hover:text-gray-600'}">Student Schedule</button>
                    </div>
                </div>
                
                <div class="flex items-center gap-3">
                    <button onclick={prevMonth} class="p-3 bg-gray-50 hover:bg-white hover:shadow-md rounded-[18px] transition-all border border-transparent hover:border-gray-100" aria-label="Previous Month"><svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg></button>
                    <span class="text-sm font-black w-40 text-center text-gray-700 bg-gray-50 py-3 rounded-[18px] tracking-wide border border-transparent">{monthNames[currentMonth]} {currentYear}</span>
                    <button onclick={nextMonth} class="p-3 bg-gray-50 hover:bg-white hover:shadow-md rounded-[18px] transition-all border border-transparent hover:border-gray-100" aria-label="Next Month"><svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg></button>
                </div>
            </div>

            <div class="grid grid-cols-7 gap-3">
                {#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
                    <div class="py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{day}</div>
                {/each}
                {#each calendarDays as day}
                    <div role="button" tabindex="0" class="bg-gray-50/30 h-32 p-3 relative rounded-[24px] border border-transparent group hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-100 transition-all cursor-pointer" onclick={() => day && openDayModal(day)} onkeydown={(e) => e.key==='Enter' && day && openDayModal(day)}>
                        {#if day}
                            <div class="flex justify-between items-start">
                                <span class="text-sm font-black {day === today.getDate() && currentMonth === today.getMonth() ? 'bg-indigo-600 text-white w-7 h-7 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200' : 'text-gray-700 group-hover:text-indigo-600'} transition-colors">
                                    {day}
                                </span>
                            </div>
                            <div class="mt-2 space-y-1.5 overflow-y-auto max-h-[calc(100%-2rem)] scrollbar-hide">
                                {#each getEventsForDay(day).slice(0, 3) as event}
                                    <div 
                                        class="text-[9px] px-2 py-1.5 rounded-xl border transition-all hover:scale-[1.02] font-black uppercase tracking-tighter {getEventColor(event)} {getEventColor(event).includes('green') ? 'shadow-sm shadow-green-100' : ''} {event.isOverdue ? 'ring-2 ring-red-400/20 border-red-300' : ''}"
                                    >
                                        <div class="truncate max-w-[90%]">
                                             {#if event.type === 'TASK'}{getStatusSymbol(event.status)}{/if} {event.title}
                                        </div>
                                    </div>
                                {/each}
                                {#if getEventsForDay(day).length > 3}
                                    <div class="text-[8px] text-indigo-400 pl-1 font-black uppercase tracking-widest">+ {getEventsForDay(day).length - 3} More</div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Recent Campaigns Table -->
        <div class="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
            <div class="p-8 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                <div>
                    <h2 class="text-xl font-black text-gray-900 leading-tight">Recent Activity</h2>
                    <p class="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Live statistics and updates</p>
                </div>
                <a href="/campaigns" class="px-6 py-2.5 bg-white border border-gray-100 rounded-2xl text-xs font-black text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm">View All</a>
            </div>

            <div class="overflow-x-auto">
                <table class="min-w-full">
                    <thead>
                        <tr class="bg-gray-50/50">
                            <th class="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Campaign Name</th>
                            <th class="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">University</th>
                            <th class="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Created By</th>
                            <th class="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Status</th>
                            <th class="px-8 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Engagement</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        {#each data.stats.recent_campaigns || [] as campaign}
                            <tr class="group hover:bg-indigo-50/20 transition-colors">
                                <td class="px-8 py-6">
                                    <div class="text-sm font-black text-gray-900 group-hover:text-indigo-700 transition-colors">{campaign.name}</div>
                                    <div class="text-[10px] font-bold text-gray-400 mt-0.5">{new Date(campaign.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                </td>
                                <td class="px-8 py-6">
                                    <span class="text-xs font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50/50 px-2.5 py-1 rounded-xl">{campaign.university_name}</span>
                                </td>
                                <td class="px-8 py-6">
                                    <div class="text-xs font-black text-gray-700">{campaign.creator_name || 'System Auto'}</div>
                                    <div class="text-[10px] font-bold text-gray-400">{campaign.creator_email || 'automated@uniconnect.com'}</div>
                                </td>
                                <td class="px-8 py-6">
                                    <span class="px-3 py-1.5 text-[9px] font-black rounded-xl uppercase tracking-widest shadow-sm
                                        {campaign.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border border-green-100' : 
                                         campaign.status === 'IN_PROGRESS' ? 'bg-indigo-600 text-white animate-pulse' : 
                                         'bg-gray-100 text-gray-700 border border-gray-200'}">
                                        {campaign.status}
                                    </span>
                                </td>
                                <td class="px-8 py-6">
                                    <div class="flex items-center space-x-4 text-xs">
                                        <div class="flex flex-col">
                                            <span class="text-indigo-600 font-black">{campaign.sent_count}</span>
                                            <span class="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Velocity</span>
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="text-green-600 font-black">{campaign.open_count}</span>
                                            <span class="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Impact</span>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="5" class="px-8 py-16 text-center">
                                    <div class="flex flex-col items-center">
                                        <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-2xl mb-4">📭</div>
                                        <p class="text-xs font-black text-gray-400 uppercase tracking-widest">No Active Telemetry</p>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Right Sidebar (Day Plan & Quick Actions) -->
    <div class="w-full lg:w-[380px] space-y-8">
        <!-- Daily Focus / Day Plan -->
        <div class="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8 flex flex-col">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h3 class="text-sm font-black text-gray-900 uppercase tracking-widest">My Day Plan</h3>
                    <p class="text-[10px] font-bold text-gray-400 mt-1">Personal Focus for Today</p>
                </div>
                <div class="p-3 bg-indigo-50 rounded-2xl">
                    <svg class="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                </div>
            </div>

            <div class="space-y-4">
                {#each dayPlanItems as item}
                    <div class="group flex items-start gap-3 p-4 rounded-2xl bg-gray-50/50 border border-transparent hover:border-indigo-100 hover:bg-white transition-all">
                        <button 
                            onclick={() => toggleDayPlanItem(item)}
                            class="mt-1 flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center {item.completed ? 'bg-green-500 border-green-500' : 'border-gray-200'}"
                        >
                            {#if item.completed}
                                <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4"><path d="M5 13l4 4L19 7"/></svg>
                            {/if}
                        </button>
                        <div class="flex-1 min-w-0">
                            <span class="text-sm font-bold {item.completed ? 'text-gray-400 line-through' : 'text-gray-700'} transition-all block leading-snug">
                                {item.title}
                            </span>
                            {#if !item.completed}
                                <div class="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onclick={() => promoteToTask(item)}
                                        class="text-[9px] font-black text-indigo-500 uppercase tracking-tighter hover:text-indigo-700"
                                    >
                                        Move to Tasks →
                                    </button>
                                    <span class="text-gray-300">|</span>
                                    <button 
                                        onclick={() => deleteDayPlanItem(item.id)}
                                        class="text-[9px] font-black text-red-500 uppercase tracking-tighter hover:text-red-700"
                                    >
                                        Delete
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div class="text-center py-6 bg-gray-50/30 rounded-2xl border border-dashed border-gray-100">
                        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Plan is Empty</p>
                    </div>
                {/each}

                {#if isAddingItem}
                    <div 
                        transition:fade={{ duration: 200 }}
                        class="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200"
                    >
                        <input 
                            bind:value={newDayPlanTitle}
                            placeholder="What's the focus?"
                            class="w-full bg-transparent border-none p-0 text-sm font-bold text-gray-700 placeholder:text-indigo-300 focus:ring-0"
                            onkeydown={(e) => e.key === 'Enter' && addDayPlanItem()}
                        />
                        <div class="flex items-center justify-end gap-2 mt-3">
                            <button onclick={() => { console.log('Cancelling add'); isAddingItem = false; }} class="text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600">Cancel</button>
                            <button onclick={addDayPlanItem} class="text-[9px] font-black text-indigo-600 uppercase tracking-widest px-3 py-1.5 bg-white rounded-lg shadow-sm border border-indigo-100">Add Item</button>
                        </div>
                    </div>
                {/if}
            </div>
            
            {#if !isAddingItem}
                <button 
                    onclick={() => isAddingItem = true}
                    class="w-full mt-6 py-4 rounded-2xl bg-indigo-50 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-100 transition-all"
                >
                    Add To Day Plan
                </button>
            {/if}
        </div>

        <!-- Upcoming Tasks -->
        <div class="bg-white rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h3 class="text-sm font-black text-gray-900 uppercase tracking-widest">Upcoming Deadlines</h3>
                    <p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">{upcomingTasks.length} Pending tasks</p>
                </div>
                <div class="p-3 bg-red-50 rounded-2xl">
                    <svg class="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
            </div>
            
            <div class="space-y-6">
                {#each upcomingTasks as task}
                    <div 
                        role="button" 
                        tabindex="0"
                        class="group cursor-pointer bg-gray-50/50 p-5 rounded-2xl border border-transparent hover:border-indigo-100 hover:bg-white hover:shadow-xl hover:shadow-indigo-500/5 transition-all" 
                        onclick={() => goto('/tasks')}
                        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto('/tasks')}
                    >
                        <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0">
                                <div class="text-sm font-black text-gray-900 truncate group-hover:text-indigo-600 transition-colors leading-tight">{task.title}</div>
                                <div class="flex flex-col gap-1.5 mt-2">
                                    <div class="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                        T- {new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    {#if task.university_short_name}
                                        <span class="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em]">{task.university_short_name} Entity</span>
                                    {/if}
                                </div>
                            </div>
                            <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                                <span class="text-[10px] px-2.5 py-1.5 rounded-xl border border-gray-100 bg-white text-gray-600 font-black uppercase tracking-widest shadow-sm">
                                    {task.priority}
                                </span>
                                {#if task.assigned_by_name}
                                    <span class="text-[8px] font-black text-gray-400 uppercase tracking-tighter opacity-70">
                                        BY: {task.assigned_by_name}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="text-center py-10 bg-gray-50/50 rounded-[32px] border border-dashed border-gray-100">
                        <div class="text-3xl mb-3">🛡️</div>
                        <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Perimeter Secured</p>
                    </div>
                {/each}
            </div>
            {#if upcomingTasks.length > 0}
                <button onclick={() => goto('/tasks')} class="w-full mt-8 py-4 text-xs font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 rounded-2xl transition-all border border-indigo-100/50">View All Tasks</button>
            {/if}
        </div>

        <!-- Quick Actions -->
        <div class="bg-gray-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden shadow-floating">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-transparent"></div>
            <h3 class="relative z-10 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-6">Quick Actions</h3>
            <div class="relative z-10 space-y-4">
                <button onclick={() => showTaskModal = true} class="w-full flex items-center p-5 rounded-2xl bg-white text-gray-900 hover:scale-[1.02] transition-all font-black shadow-xl group hover:shadow-floating">
                    <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center mr-4 group-hover:rotate-6 transition-transform">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                    </div>
                    CREATE TASK
                </button>
                {#if data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS'}
                    <button onclick={() => goto('/universities')} class="w-full flex items-center p-5 rounded-2xl bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all font-black text-sm uppercase tracking-widest hover:shadow-floating">UNIVERSITIES</button>
                {/if}
                <button onclick={() => goto('/users')} class="w-full flex items-center p-5 rounded-2xl bg-white/10 border border-white/10 text-white hover:bg-white/20 transition-all font-black text-sm uppercase tracking-widest hover:shadow-floating">
                    TEAM MEMBERS
                </button>
            </div>
        </div>
    </div>
</div>

{#if showDayModal}
<div class="fixed z-[100] inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
    <div class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" role="presentation" onclick={() => showDayModal = false} onkeydown={(e) => e.key === 'Escape' && (showDayModal = false)}></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
      <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
          {selectedDateLabel}
        </h3>
        
        {#if isAddingEvent}
            <div class="space-y-4 bg-gray-50 p-4 rounded-lg">
                <h4 class="font-bold text-sm text-gray-700">Add Schedule Event</h4>
                <div class="grid grid-cols-2 gap-4">
                     <div>
                        <label for="event-type" class="block text-xs font-medium text-gray-500">Event Type</label>
                        <select id="event-type" bind:value={newEvent.type} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm">
                            <option value="EVENT">Event</option>
                            <option value="HOLIDAY">Holiday</option>
                            <option value="EXAM">Exam</option>
                        </select>
                    </div>
                    <div>
                        <label for="event-title" class="block text-xs font-medium text-gray-500">Title</label>
                        <input id="event-title" type="text" bind:value={newEvent.title} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" placeholder="e.g. Christmas">
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                     <div>
                        <label for="event-start" class="block text-xs font-medium text-gray-500">Start Date</label>
                        <!-- Default to selected day -->
                        <input id="event-start" type="datetime-local" bind:value={newEvent.start_date} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm">
                    </div>
                    <div>
                        <label for="event-due" class="block text-xs font-medium text-gray-500">End/Due Date</label>
                        <input id="event-due" type="datetime-local" bind:value={newEvent.due_date} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm">
                    </div>
                </div>

                <div>
                    <label for="event-description" class="block text-xs font-medium text-gray-500">Description</label>
                    <input id="event-description" type="text" bind:value={newEvent.description} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" placeholder="Details...">
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button onclick={() => isAddingEvent = false} class="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">Cancel</button>
                    <button onclick={saveEvent} disabled={isSaving} class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700">{isSaving ? 'Saving...' : 'Save Event'}</button>
                </div>
            </div>
        {:else}
            <!-- View Events -->
             {#if selectedDateEvents.length === 0}
                <div class="text-center py-8">
                    <p class="text-sm text-gray-500">No events scheduled for this day.</p>
                </div>
            {:else}
                <ul class="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {#each selectedDateEvents as event}
                        <li class="p-3 rounded-lg border bg-white flex justify-between items-start shadow-sm {getEventColor(event)}">
                            <div class="flex gap-3">
                                <!-- Status Icon -->
                                <div class="flex-shrink-0 mt-1">
                                    <span class="text-lg">{getStatusSymbol(event.status || 'EVENT')}</span>
                                </div>
                                <div>
                                    <div class="font-bold text-gray-900 text-sm flex items-center gap-2">
                                        {event.title}
                                        {#if event.priority}
                                            <span class="text-[9px] px-1.5 py-0.5 rounded-full border border-gray-200 bg-white font-black">{event.priority}</span>
                                        {/if}
                                    </div>
                                    <div class="flex items-center gap-2 mt-0.5">
                                        {#if event.assigned_to_name}
                                            <div class="text-[10px] text-gray-500 font-medium px-1.5 py-0.5 bg-gray-100 rounded">👤 {event.assigned_to_name}</div>
                                        {/if}
                                        {#if event.assigned_by_name}
                                            <div class="text-[10px] text-indigo-500 font-black uppercase tracking-tighter">By: {event.assigned_by_name}</div>
                                        {/if}
                                    </div>
                                    {#if event.parsedDescription}
                                        <div class="text-xs text-gray-600 mt-2 bg-black/5 p-2 rounded italic border-l-2 border-black/10">{event.parsedDescription}</div>
                                    {/if}
                                </div>
                            </div>
                            
                            <div class="flex flex-col items-end gap-2">
                                <span class="text-[9px] px-2 py-0.5 rounded-full bg-white border font-black uppercase tracking-widest">{event.status || event.type}</span>
                                <div class="flex gap-2">
                                    {#if event.type === 'TASK' && event.status !== 'COMPLETED'}
                                        <button onclick={() => toggleStatus(event)} class="px-2 py-1 bg-green-600 text-white rounded text-[10px] font-bold shadow-sm hover:bg-green-700 transition-colors">Mark Done</button>
                                    {/if}
                                    <button onclick={() => deleteEvent(event.id, event.type)} class="px-2 py-1 bg-red-50 text-red-600 border border-red-100 rounded text-[10px] font-bold hover:bg-red-100 transition-colors">Delete</button>
                                </div>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        {/if}
      </div>
      
      <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:justify-between items-center">
         <div class="flex gap-2">
             <button type="button" onclick={() => showDayModal = false} class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm">
              Close
            </button>
        </div>
        
        {#if !isAddingEvent && viewMode === 'STUDENT_SCHEDULE'}
            <button type="button" onclick={() => {
                isAddingEvent = true;
                // Set default times
                const baseDate = new Date(currentYear, currentMonth, selectedDayNum, 9, 0, 0); // 9 AM
                const offset = baseDate.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(baseDate.getTime() - offset)).toISOString().slice(0, -1);
                newEvent.start_date = localISOTime;
                newEvent.due_date = localISOTime; // same day default
            }} class="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none sm:w-auto sm:text-sm">
               Add Event
            </button>
        {/if}
      </div>
    </div>
  </div>
</div>
{/if}

{#if showTaskModal}
<div class="fixed z-[100] inset-0 overflow-y-auto" aria-labelledby="task-modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
    <div class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" role="presentation" onclick={() => showTaskModal = false}></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full border border-gray-100">
      <div class="bg-gradient-to-br from-indigo-600 to-blue-700 px-6 py-4 flex justify-between items-center">
          <h3 class="text-lg font-bold text-white" id="task-modal-title">Create New Task</h3>
          <button onclick={() => showTaskModal = false} class="text-white/80 hover:text-white" aria-label="Close"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>
      <div class="p-6 space-y-4">
        <div>
            <label for="task-title" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Task Title</label>
            <input id="task-title" type="text" bind:value={taskForm.title} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all" placeholder="What needs to be done?">
        </div>
        <div>
            <label for="task-desc" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Description</label>
            <textarea id="task-desc" bind:value={taskForm.description} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all min-h-[100px]" placeholder="Add some context..."></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label for="task-prio" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Priority</label>
                <select id="task-prio" bind:value={taskForm.priority} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
                    <option value="URGENT">Urgent</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                </select>
            </div>
            <div>
                <label for="task-due" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Due Date</label>
                <input id="task-due" type="datetime-local" bind:value={taskForm.due_date} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all">
            </div>
        </div>
      </div>
      <div class="p-6 bg-gray-50 flex gap-3">
          <button onclick={() => showTaskModal = false} class="flex-1 py-3 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
          <button onclick={saveTask} disabled={isSaving} class="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50">
              {isSaving ? 'Creating...' : 'Create Task'}
          </button>
      </div>
    </div>
  </div>
</div>
{/if}
