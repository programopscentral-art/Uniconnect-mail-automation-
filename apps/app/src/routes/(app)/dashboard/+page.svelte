<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { fade, fly, slide } from "svelte/transition";
  // @ts-ignore
  let { data } = $props();

  // ─── Calendar State ───────────────────────────────────────────────────────
  type CalendarView = "month" | "week" | "day";
  let calendarView = $state<CalendarView>("week");
  let currentDate = $state(new Date());
  let today = new Date();

  // ─── Modals ───────────────────────────────────────────────────────────────
  let showTaskModal = $state(false);
  let showTaskDetail = $state(false);
  let selectedTask = $state<any>(null);
  let showCreateEvent = $state(false);
  let createEventDate = $state('');
  let createEventStartTime = $state('09:00');
  let createEventEndTime = $state('10:00');

  // ─── Task Form ────────────────────────────────────────────────────────────
  let taskForm = $state({
    title: '', description: '', priority: 'MEDIUM' as string,
    assignee_ids: [] as string[], university_id: '',
    due_date: '', start_time: '09:00', end_time: '10:00',
    status: 'PENDING', estimated_time: '1h'
  });
  let isSaving = $state(false);

  // ─── Task Detail State ────────────────────────────────────────────────────
  let checklistItems = $state<any[]>([]);
  let checklistProgress = $state({ total: 0, completed: 0, percent: 0 });
  let viewStats = $state<any[]>([]);
  let newChecklistTitle = $state('');
  let viewLogId = $state('');
  let viewStartTime = $state(0);

  // ─── Event Form ───────────────────────────────────────────────────────────
  let eventForm = $state({
    title: '', type: 'EVENT' as string, description: '',
    start_date: '', due_date: ''
  });

  // Polling
  $effect(() => {
    const interval = setInterval(() => invalidateAll(), 30000);
    return () => clearInterval(interval);
  });

  // ─── Derived Data ─────────────────────────────────────────────────────────
  let activeUniv = $derived(data.user.universities?.find((u: any) => u.id === data.user.university_id));
  let isCentralBOA = $derived(data.user.role === 'BOA' && (!data.user.university_id || activeUniv?.is_team));

  const taskStats = $derived({
    total: data.taskStats.total,
    completed: data.taskStats.completed,
    pending: data.taskStats.pending,
    in_progress: data.taskStats.in_progress || 0,
    overdue: data.taskStats.overdue || 0
  });

  // Combine tasks + schedule events into unified events
  let allEvents = $derived.by(() => {
    const events: any[] = [];
    for (const t of (data.tasks || [])) {
      const startDate = t.due_date ? new Date(t.due_date) : new Date(t.created_at);
      events.push({
        ...t, eventType: 'task',
        startDate,
        endDate: new Date(startDate.getTime() + 60 * 60 * 1000), // 1hr default
        color: t.status === 'COMPLETED' ? 'emerald' :
               t.priority === 'URGENT' ? 'red' :
               t.priority === 'HIGH' ? 'orange' : 'indigo'
      });
    }
    for (const e of (data.scheduleEvents || [])) {
      events.push({
        ...e, eventType: 'schedule',
        startDate: new Date(e.start_date),
        endDate: new Date(e.due_date),
        color: e.type === 'HOLIDAY' ? 'amber' : e.type === 'EXAM' ? 'red' : 'violet'
      });
    }
    return events;
  });

  // ─── Date Navigation ──────────────────────────────────────────────────────
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const shortDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function goToday() { currentDate = new Date(); }
  function goPrev() {
    const d = new Date(currentDate);
    if (calendarView === 'month') d.setMonth(d.getMonth() - 1);
    else if (calendarView === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    currentDate = d;
  }
  function goNext() {
    const d = new Date(currentDate);
    if (calendarView === 'month') d.setMonth(d.getMonth() + 1);
    else if (calendarView === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    currentDate = d;
  }

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function isToday(d: Date) { return isSameDay(d, today); }

  // ─── Month View Data ──────────────────────────────────────────────────────
  let monthDays = $derived.by(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  });

  // ─── Week View Data ───────────────────────────────────────────────────────
  let weekDays = $derived.by(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      days.push(dd);
    }
    return days;
  });

  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

  function getEventsForDate(date: Date) {
    return allEvents.filter(e => isSameDay(e.startDate, date));
  }

  function getEventsForHour(date: Date, hour: number) {
    return allEvents.filter(e => isSameDay(e.startDate, date) && e.startDate.getHours() === hour);
  }

  function formatHour(h: number) {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function getHeaderLabel() {
    if (calendarView === 'month') return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (calendarView === 'week') {
      const s = weekDays[0];
      const e = weekDays[6];
      if (s.getMonth() === e.getMonth()) return `${monthNames[s.getMonth()]} ${s.getDate()} - ${e.getDate()}, ${s.getFullYear()}`;
      return `${monthNames[s.getMonth()]} ${s.getDate()} - ${monthNames[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${dayNames[currentDate.getDay()]}, ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  }

  // ─── Event Colors ─────────────────────────────────────────────────────────
  function eventBg(color: string) {
    const map: Record<string, string> = {
      indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800'
    };
    return map[color] || map.indigo;
  }

  function eventDot(color: string) {
    const map: Record<string, string> = {
      indigo: 'bg-indigo-500', red: 'bg-red-500', orange: 'bg-orange-500',
      emerald: 'bg-emerald-500', amber: 'bg-amber-500', violet: 'bg-violet-500'
    };
    return map[color] || 'bg-indigo-500';
  }

  // ─── University Change ────────────────────────────────────────────────────
  function onUnivChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    const url = new URL(window.location.href);
    if (val) url.searchParams.set('universityId', val);
    else url.searchParams.delete('universityId');
    goto(url.toString());
  }

  // ─── Task CRUD ────────────────────────────────────────────────────────────
  function openCreateTask(date?: Date) {
    const d = date || new Date();
    taskForm = {
      title: '', description: '', priority: 'MEDIUM',
      assignee_ids: [data.userId],
      university_id: data.selectedUniversityId || data.defaultUniversityId || '',
      due_date: d.toISOString().split('T')[0],
      start_time: '09:00', end_time: '10:00',
      status: 'PENDING', estimated_time: '1h'
    };
    showTaskModal = true;
  }

  async function saveTask() {
    if (!taskForm.title) return alert('Title is required.');
    isSaving = true;
    try {
      const dueDateTime = taskForm.due_date
        ? `${taskForm.due_date}T${taskForm.end_time || '17:00'}:00`
        : new Date().toISOString();
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskForm,
          due_date: dueDateTime
        })
      });
      if (res.ok) {
        const task = await res.json();
        showTaskModal = false;
        // Auto-generate checklist if description is substantial
        if (taskForm.description && taskForm.description.length > 20) {
          await fetch(`/api/tasks/${task.id}/checklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_generate: true, description: taskForm.description })
          });
        }
        await invalidateAll();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to save task');
      }
    } finally { isSaving = false; }
  }

  async function saveEvent() {
    if (!eventForm.title) return alert('Title is required.');
    isSaving = true;
    try {
      const res = await fetch('/api/schedule-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventForm,
          start_date: eventForm.start_date || `${createEventDate}T${createEventStartTime}:00`,
          due_date: eventForm.due_date || `${createEventDate}T${createEventEndTime}:00`,
          university_id: data.selectedUniversityId || data.defaultUniversityId
        })
      });
      if (res.ok) { showCreateEvent = false; await invalidateAll(); }
      else alert('Failed to save event');
    } finally { isSaving = false; }
  }

  async function toggleTaskStatus(task: any) {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus })
    });
    await invalidateAll();
  }

  async function deleteEvent(id: string, type: string) {
    if (!confirm('Are you sure?')) return;
    const endpoint = type === 'task' ? `/api/tasks?id=${id}` : `/api/schedule-events?id=${id}`;
    await fetch(endpoint, { method: 'DELETE' });
    if (selectedTask?.id === id) { showTaskDetail = false; selectedTask = null; }
    await invalidateAll();
  }

  // ─── Task Detail ──────────────────────────────────────────────────────────
  async function openTaskDetail(task: any) {
    selectedTask = task;
    showTaskDetail = true;
    viewStartTime = Date.now();
    // Load checklist
    try {
      const res = await fetch(`/api/tasks/${task.id}/checklist`);
      if (res.ok) {
        const data = await res.json();
        checklistItems = data.items || [];
        checklistProgress = data.progress || { total: 0, completed: 0, percent: 0 };
      }
    } catch {}
    // Log view
    try {
      const res = await fetch(`/api/tasks/${task.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: crypto.randomUUID() })
      });
      if (res.ok) { const log = await res.json(); viewLogId = log.id; }
    } catch {}
    // Load view stats (admin)
    if (['ADMIN', 'PROGRAM_OPS', 'BOA', 'PM', 'PMA', 'CMA_MANAGER'].includes(data.user.role)) {
      try {
        const res = await fetch(`/api/tasks/${task.id}/views`);
        if (res.ok) viewStats = await res.json();
      } catch {}
    }
  }

  function closeTaskDetail() {
    // Update view duration
    if (viewLogId && viewStartTime) {
      const duration = Math.round((Date.now() - viewStartTime) / 1000);
      fetch(`/api/tasks/${selectedTask?.id}/views`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewLogId, durationSeconds: duration })
      }).catch(() => {});
    }
    showTaskDetail = false;
    selectedTask = null;
    viewLogId = '';
    viewStartTime = 0;
  }

  async function toggleChecklistItem(itemId: string) {
    const res = await fetch(`/api/tasks/${selectedTask.id}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle: true, itemId })
    });
    if (res.ok) {
      // Refresh checklist
      const r = await fetch(`/api/tasks/${selectedTask.id}/checklist`);
      if (r.ok) {
        const d = await r.json();
        checklistItems = d.items || [];
        checklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
      }
    }
  }

  async function addChecklistItem() {
    if (!newChecklistTitle.trim()) return;
    await fetch(`/api/tasks/${selectedTask.id}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newChecklistTitle })
    });
    newChecklistTitle = '';
    const r = await fetch(`/api/tasks/${selectedTask.id}/checklist`);
    if (r.ok) {
      const d = await r.json();
      checklistItems = d.items || [];
      checklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
    }
  }

  async function autoGenerateChecklist() {
    if (!selectedTask?.description) return;
    await fetch(`/api/tasks/${selectedTask.id}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_generate: true, description: selectedTask.description })
    });
    const r = await fetch(`/api/tasks/${selectedTask.id}/checklist`);
    if (r.ok) {
      const d = await r.json();
      checklistItems = d.items || [];
      checklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
    }
  }

  async function deleteChecklistItem(itemId: string) {
    await fetch(`/api/tasks/${selectedTask.id}/checklist?itemId=${itemId}`, { method: 'DELETE' });
    const r = await fetch(`/api/tasks/${selectedTask.id}/checklist`);
    if (r.ok) {
      const d = await r.json();
      checklistItems = d.items || [];
      checklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
    }
  }

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600 * 10) / 10}h`;
  }

  // Click on empty time slot to create event
  function clickTimeSlot(date: Date, hour: number) {
    createEventDate = date.toISOString().split('T')[0];
    createEventStartTime = `${String(hour).padStart(2, '0')}:00`;
    createEventEndTime = `${String(hour + 1).padStart(2, '0')}:00`;
    eventForm = { title: '', type: 'EVENT', description: '', start_date: '', due_date: '' };
    showCreateEvent = true;
  }

  // Notification imports
  import { getFcmToken } from "$lib/firebase";
  let notificationStatus = $state<'NOT_SUPPORTED' | 'granted' | 'denied' | 'default'>('default');
  $effect(() => {
    if (!('Notification' in window)) notificationStatus = 'NOT_SUPPORTED';
    else notificationStatus = Notification.permission as any;
  });
  async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    notificationStatus = permission;
    if (permission === 'granted') {
      const token = await getFcmToken();
      if (token) {
        await fetch('/api/fcm/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, deviceInfo: { userAgent: navigator.userAgent } }) });
      }
    }
  }
</script>

<div class="flex flex-col gap-6 min-h-screen" in:fade>
  <!-- Top Bar -->
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div>
      <h1 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
      <p class="text-xs text-gray-400 dark:text-slate-500 font-medium mt-0.5">Real-time overview and task management</p>
    </div>
    <div class="flex items-center gap-3">
      {#if (data.user?.permissions || []).includes('universities') || data.universities.length > 1}
        <select onchange={onUnivChange} value={data.selectedUniversityId || ''}
          class="px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 min-w-[180px]">
          <option value="">All Universities</option>
          {#each data.universities as univ}
            <option value={univ.id}>{univ.name}</option>
          {/each}
        </select>
      {/if}
      <button onclick={() => openCreateTask()} class="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        New Task
      </button>
    </div>
  </div>

  <!-- Notification Banner -->
  {#if notificationStatus !== 'granted'}
    <div class="bg-indigo-600 rounded-2xl p-4 text-white flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-lg">🔔</div>
        <p class="text-xs font-bold">{notificationStatus === 'denied' ? 'Notifications blocked in browser settings' : 'Enable notifications to stay updated'}</p>
      </div>
      {#if notificationStatus !== 'denied'}
        <button onclick={requestNotificationPermission} class="px-5 py-2 bg-white text-indigo-600 rounded-lg font-bold text-xs hover:bg-gray-50">Enable</button>
      {/if}
    </div>
  {/if}

  <!-- Task Stats -->
  <div class="grid grid-cols-5 gap-3">
    {#each [
      { label: 'Total', value: taskStats.total, color: 'indigo' },
      { label: 'Done', value: taskStats.completed, color: 'emerald' },
      { label: 'Pending', value: taskStats.pending, color: 'amber' },
      { label: 'In Progress', value: taskStats.in_progress, color: 'blue' },
      { label: 'Overdue', value: taskStats.overdue, color: 'red' }
    ] as stat}
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 text-center">
        <p class="text-2xl font-black text-gray-900 dark:text-white">{stat.value}</p>
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">{stat.label}</p>
      </div>
    {/each}
  </div>

  <!-- Calendar Section -->
  <div class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden flex-1">
    <!-- Calendar Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
      <div class="flex items-center gap-3">
        <button onclick={goToday} class="px-3 py-1.5 text-xs font-bold border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300">Today</button>
        <div class="flex items-center gap-1">
          <button onclick={goPrev} class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          </button>
          <button onclick={goNext} class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
        <h2 class="text-lg font-bold text-gray-900 dark:text-white">{getHeaderLabel()}</h2>
      </div>
      <div class="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-0.5">
        {#each [['month','Month'],['week','Week'],['day','Day']] as [v, label]}
          <button onclick={() => calendarView = v as CalendarView}
            class="px-4 py-1.5 text-xs font-bold rounded-md transition-all {calendarView === v ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}">
            {label}
          </button>
        {/each}
      </div>
    </div>

    <!-- MONTH VIEW -->
    {#if calendarView === 'month'}
      <div class="grid grid-cols-7">
        {#each shortDays as day}
          <div class="px-3 py-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider text-center border-b border-gray-100 dark:border-slate-800">{day}</div>
        {/each}
        {#each monthDays as { date, isCurrentMonth }}
          <div
            class="min-h-[100px] p-1.5 border-b border-r border-gray-50 dark:border-slate-800/50 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors {!isCurrentMonth ? 'opacity-40' : ''}"
            onclick={() => { currentDate = date; calendarView = 'day'; }}
            role="button" tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && (() => { currentDate = date; calendarView = 'day'; })()}
          >
            <span class="text-xs font-bold inline-flex items-center justify-center w-7 h-7 rounded-full
              {isToday(date) ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-300'}">
              {date.getDate()}
            </span>
            <div class="mt-1 space-y-0.5">
              {#each getEventsForDate(date).slice(0, 3) as event}
                <div class="text-[9px] font-semibold px-1.5 py-0.5 rounded truncate border-l-2 {eventBg(event.color)}"
                  onclick|stopPropagation={() => event.eventType === 'task' && openTaskDetail(event)}>
                  {event.title}
                </div>
              {/each}
              {#if getEventsForDate(date).length > 3}
                <p class="text-[9px] text-gray-400 pl-1">+{getEventsForDate(date).length - 3} more</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- WEEK VIEW (Google Calendar style) -->
    {#if calendarView === 'week'}
      <div class="flex overflow-auto" style="max-height: calc(100vh - 320px);">
        <!-- Time gutter -->
        <div class="w-16 flex-shrink-0 border-r border-gray-100 dark:border-slate-800">
          <div class="h-12"></div><!-- spacer for header -->
          {#each hours as h}
            <div class="h-16 flex items-start justify-end pr-2 -mt-2">
              <span class="text-[10px] font-medium text-gray-400">{formatHour(h)}</span>
            </div>
          {/each}
        </div>
        <!-- Day columns -->
        <div class="flex-1 grid grid-cols-7">
          <!-- Day headers -->
          {#each weekDays as wd, i}
            <div class="h-12 flex flex-col items-center justify-center border-b border-r border-gray-100 dark:border-slate-800 {isToday(wd) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}">
              <span class="text-[10px] font-bold text-gray-400 uppercase">{shortDays[i]}</span>
              <span class="text-sm font-black {isToday(wd) ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 w-7 h-7 rounded-full flex items-center justify-center' : 'text-gray-700 dark:text-gray-300'}">
                {wd.getDate()}
              </span>
            </div>
          {/each}
          <!-- Time slots per day -->
          {#each weekDays as wd, dayIdx}
            <div class="relative border-r border-gray-50 dark:border-slate-800/50" style="grid-row: 2 / span {hours.length}; grid-column: {dayIdx + 1};">
              {#each hours as h, hIdx}
                <div
                  class="h-16 border-b border-gray-50 dark:border-slate-800/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 cursor-pointer transition-colors"
                  onclick={() => clickTimeSlot(wd, h)}
                  role="button" tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && clickTimeSlot(wd, h)}
                >
                  <!-- Events in this slot -->
                  {#each getEventsForHour(wd, h) as event}
                    <div
                      class="absolute left-0.5 right-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold border cursor-pointer z-10 overflow-hidden {eventBg(event.color)}"
                      style="top: {hIdx * 64 + 2}px; min-height: 28px;"
                      onclick|stopPropagation={() => event.eventType === 'task' ? openTaskDetail(event) : null}
                      role="button" tabindex="0"
                      onkeydown|stopPropagation={(e) => e.key === 'Enter' && (event.eventType === 'task' ? openTaskDetail(event) : null)}
                    >
                      <p class="truncate font-bold">{event.title}</p>
                      <p class="text-[8px] opacity-70">{formatTime(event.startDate)}</p>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- DAY VIEW -->
    {#if calendarView === 'day'}
      <div class="flex overflow-auto" style="max-height: calc(100vh - 320px);">
        <!-- Time gutter -->
        <div class="w-20 flex-shrink-0 border-r border-gray-100 dark:border-slate-800">
          {#each hours as h}
            <div class="h-20 flex items-start justify-end pr-3 -mt-2">
              <span class="text-xs font-medium text-gray-400">{formatHour(h)}</span>
            </div>
          {/each}
        </div>
        <!-- Day column -->
        <div class="flex-1 relative">
          {#each hours as h, hIdx}
            <div
              class="h-20 border-b border-gray-50 dark:border-slate-800/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 cursor-pointer transition-colors relative"
              onclick={() => clickTimeSlot(currentDate, h)}
              role="button" tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && clickTimeSlot(currentDate, h)}
            >
              {#each getEventsForHour(currentDate, h) as event}
                <div
                  class="absolute left-2 right-2 rounded-xl px-4 py-2 border cursor-pointer z-10 {eventBg(event.color)}"
                  style="top: 2px; min-height: 36px;"
                  onclick|stopPropagation={() => event.eventType === 'task' ? openTaskDetail(event) : null}
                  role="button" tabindex="0"
                  onkeydown|stopPropagation={(e) => e.key === 'Enter' && (event.eventType === 'task' ? openTaskDetail(event) : null)}
                >
                  <p class="text-sm font-bold truncate">{event.title}</p>
                  <p class="text-xs opacity-70">{formatTime(event.startDate)} - {formatTime(event.endDate)}</p>
                  {#if event.eventType === 'task' && event.assignees?.length}
                    <p class="text-[10px] opacity-60 mt-1">{event.assignees.map((a: any) => a.name).join(', ')}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- CREATE TASK MODAL -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showTaskModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onclick={() => showTaskModal = false} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[85vh] overflow-y-auto"
      onclick|stopPropagation role="document" in:fly={{ y: 20, duration: 200 }}>
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">New Task</h3>
          <button onclick={() => showTaskModal = false} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="space-y-4">
          <input bind:value={taskForm.title} placeholder="Task title" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm font-medium dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
          <textarea bind:value={taskForm.description} placeholder="Description (checklist will be auto-generated from this)" rows="4"
            class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white focus:ring-2 ring-indigo-500 outline-none"></textarea>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Date</label>
              <input type="date" bind:value={taskForm.due_date} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Priority</label>
              <select bind:value={taskForm.priority} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Start Time</label>
              <input type="time" bind:value={taskForm.start_time} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">End Time</label>
              <input type="time" bind:value={taskForm.end_time} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
          </div>
          <!-- Assignees -->
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Assign To</label>
            <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {#each data.allUsers as user}
                <button
                  onclick={() => {
                    if (taskForm.assignee_ids.includes(user.id)) {
                      taskForm.assignee_ids = taskForm.assignee_ids.filter(id => id !== user.id);
                    } else {
                      taskForm.assignee_ids = [...taskForm.assignee_ids, user.id];
                    }
                  }}
                  class="px-3 py-1 text-xs rounded-full border transition-all {taskForm.assignee_ids.includes(user.id)
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold'
                    : 'border-gray-200 dark:border-slate-700 text-gray-500 hover:border-gray-300'}">
                  {user.name}
                </button>
              {/each}
            </div>
          </div>
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Estimated Time</label>
            <input bind:value={taskForm.estimated_time} placeholder="e.g. 2h, 30m" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button onclick={() => showTaskModal = false} class="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
          <button onclick={saveTask} disabled={isSaving} class="px-6 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- CREATE EVENT MODAL -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showCreateEvent}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onclick={() => showCreateEvent = false} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md mx-4 shadow-2xl border border-gray-200 dark:border-slate-700"
      onclick|stopPropagation role="document" in:fly={{ y: 20, duration: 200 }}>
      <div class="p-6">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">New Event</h3>
        <div class="space-y-3">
          <input bind:value={eventForm.title} placeholder="Event title" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
          <select bind:value={eventForm.type} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
            <option value="EVENT">Event</option>
            <option value="HOLIDAY">Holiday</option>
            <option value="EXAM">Exam</option>
          </select>
          <textarea bind:value={eventForm.description} placeholder="Description" rows="2" class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white"></textarea>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Date</label>
              <input type="date" bind:value={createEventDate} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Type</label>
              <select bind:value={eventForm.type} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
                <option value="EVENT">Event</option><option value="HOLIDAY">Holiday</option><option value="EXAM">Exam</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Start</label>
              <input type="time" bind:value={createEventStartTime} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">End</label>
              <input type="time" bind:value={createEventEndTime} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button onclick={() => showCreateEvent = false} class="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
          <button onclick={saveEvent} disabled={isSaving} class="px-6 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- TASK DETAIL MODAL (with Checklist, View Tracking, Analytics) -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showTaskDetail && selectedTask}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onclick={closeTaskDetail} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl mx-0 sm:mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      onclick|stopPropagation role="document" in:fly={{ y: 30, duration: 200 }}>
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                {selectedTask.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                 selectedTask.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}">
                {selectedTask.status}
              </span>
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
                {selectedTask.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                 selectedTask.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                 'bg-gray-100 text-gray-600'}">
                {selectedTask.priority}
              </span>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">{selectedTask.title}</h3>
            {#if selectedTask.description}
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedTask.description}</p>
            {/if}
          </div>
          <div class="flex gap-2">
            <button onclick={() => toggleTaskStatus(selectedTask)} class="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
              {selectedTask.status === 'COMPLETED' ? 'Reopen' : 'Complete'}
            </button>
            <button onclick={() => deleteEvent(selectedTask.id, 'task')} class="px-3 py-1.5 text-xs font-bold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
            <button onclick={closeTaskDetail} class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 mb-5 pb-5 border-b border-gray-100 dark:border-slate-800">
          {#if selectedTask.due_date}
            <span>Due: {new Date(selectedTask.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          {/if}
          {#if selectedTask.estimated_time}
            <span>Est: {selectedTask.estimated_time}</span>
          {/if}
          {#if selectedTask.assignees?.length}
            <span>Assigned: {selectedTask.assignees.map((a: any) => a.name).join(', ')}</span>
          {/if}
          {#if selectedTask.assigned_by_name}
            <span>By: {selectedTask.assigned_by_name}</span>
          {/if}
        </div>

        <!-- Checklist Section -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <h4 class="text-sm font-bold text-gray-900 dark:text-white">Checklist</h4>
              {#if checklistProgress.total > 0}
                <span class="text-[10px] font-bold text-gray-400">{checklistProgress.completed}/{checklistProgress.total}</span>
                <div class="w-24 h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full transition-all" style="width: {checklistProgress.percent}%"></div>
                </div>
              {/if}
            </div>
            {#if selectedTask.description && checklistItems.length === 0}
              <button onclick={autoGenerateChecklist} class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Auto-generate</button>
            {/if}
          </div>
          <div class="space-y-1.5">
            {#each checklistItems as item}
              <div class="flex items-center gap-3 group px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800/50">
                <button onclick={() => toggleChecklistItem(item.id)}
                  class="w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all
                    {item.is_completed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-slate-600 hover:border-indigo-400'}">
                  {#if item.is_completed}
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                  {/if}
                </button>
                <span class="text-sm flex-1 {item.is_completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}">{item.title}</span>
                {#if item.completed_by_name}
                  <span class="text-[10px] text-gray-400">{item.completed_by_name}</span>
                {/if}
                <button onclick={() => deleteChecklistItem(item.id)} class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            {/each}
          </div>
          <!-- Add checklist item -->
          <div class="flex gap-2 mt-2">
            <input bind:value={newChecklistTitle} placeholder="Add checklist item..." onkeydown={(e) => e.key === 'Enter' && addChecklistItem()}
              class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white" />
            <button onclick={addChecklistItem} class="px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Add</button>
          </div>
        </div>

        <!-- View Analytics (Admin Only) -->
        {#if viewStats.length > 0}
          <div class="border-t border-gray-100 dark:border-slate-800 pt-5">
            <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3">View Analytics</h4>
            <div class="space-y-2">
              {#each viewStats as vs}
                <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/50 text-sm">
                  <div>
                    <p class="font-semibold text-gray-700 dark:text-gray-300">{vs.user_name}</p>
                    <p class="text-[10px] text-gray-400">{vs.user_email}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs font-bold text-gray-600 dark:text-gray-300">{vs.view_count} view{vs.view_count > 1 ? 's' : ''}</p>
                    <p class="text-[10px] text-gray-400">
                      {formatDuration(parseInt(vs.total_duration_seconds || '0'))} total
                      {#if vs.last_viewed_at}
                         &middot; Last: {new Date(vs.last_viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {/if}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Assignee Status Tracking -->
        {#if selectedTask.assignees?.length}
          <div class="border-t border-gray-100 dark:border-slate-800 pt-5 mt-5">
            <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3">Assignee Progress</h4>
            <div class="space-y-2">
              {#each selectedTask.assignees as assignee}
                <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/50">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      {assignee.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{assignee.name}</span>
                  </div>
                  <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full
                    {assignee.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                     assignee.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                     'bg-gray-100 text-gray-500'}">
                    {assignee.status || 'PENDING'}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
