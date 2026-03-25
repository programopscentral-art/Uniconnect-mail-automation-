<script lang="ts">
  import { goto } from "$app/navigation";
  import { fade, fly } from "svelte/transition";
  // @ts-ignore
  let { data } = $props();

  // ─── Client-side Data State ─────────────────────────────────────────────
  let tasks = $state<any[]>([]);
  let scheduleEvents = $state<any[]>([]);
  let calendarFreezes = $state<any[]>([]);
  let allUsers = $state<any[]>([]);
  let rawTaskStats = $state<any>({ PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, OVERDUE: 0 });
  let isLoading = $state(true);

  // ─── Calendar State ───────────────────────────────────────────────────────
  type CalendarView = "month" | "week" | "day";
  let calendarView = $state<CalendarView>("week");
  let currentDate = $state(new Date());
  let today = new Date();

  // ─── Event Type Filters ─────────────────────────────────────────────────
  let showTasks = $state(true);
  let showScheduleEvents = $state(true);
  let showHolidays = $state(true);
  let showExams = $state(true);
  let showAcademics = $state(true);
  let showActivities = $state(true);
  let searchQuery = $state('');
  import { browser } from '$app/environment';
  let sidebarOpen = $state(browser ? window.innerWidth >= 1024 : false);

  // ─── Modals ───────────────────────────────────────────────────────────────
  let showTaskModal = $state(false);
  let showTaskDetail = $state(false);
  let selectedTask = $state<any>(null);
  let showCreateEvent = $state(false);
  let showEventDetail = $state(false);
  let selectedEvent = $state<any>(null);
  let showFreezeModal = $state(false);
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
  let autoChecklistGenerated = $state(false);
  let assigneeSearch = $state('');
  let assigneeFilterUniv = $state('');

  // ─── Task Detail State ────────────────────────────────────────────────────
  let checklistItems = $state<any[]>([]);
  let checklistProgress = $state({ total: 0, completed: 0, percent: 0 });
  let viewStats = $state<any[]>([]);
  let newChecklistTitle = $state('');
  let viewLogId = $state('');
  let viewStartTime = $state(0);
  let taskTimeline = $state<any>(null);
  let taskNotes = $state('');
  let savingNotes = $state(false);
  let notesTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Event Form (Enhanced) ──────────────────────────────────────────────
  let eventForm = $state({
    title: '', type: 'EVENT' as string, description: '',
    priority: 'MEDIUM' as string,
    assignee_ids: [] as string[], university_id: '',
    start_date: '', due_date: ''
  });
  let eventAssigneeSearch = $state('');
  let eventAssigneeFilterUniv = $state('');
  let sopFile = $state<File | null>(null);
  let sopTaskFile = $state<File | null>(null);

  // ─── Event Detail State ────────────────────────────────────────────────
  let eventChecklistItems = $state<any[]>([]);
  let eventChecklistProgress = $state({ total: 0, completed: 0, percent: 0 });
  let eventViewStats = $state<any[]>([]);
  let newEventChecklistTitle = $state('');
  let eventViewLogId = $state('');
  let eventViewStartTime = $state(0);
  let eventSOPDocs = $state<any[]>([]);
  let viewingSOPDoc = $state<any | null>(null);
  let eventMessages = $state<any[]>([]);
  let viewingMessage = $state<any | null>(null);

  // ─── Calendar Freeze State ─────────────────────────────────────────────
  let freezeDates = $state<string[]>([]);
  let freezeReason = $state('');
  let freezeUniversityId = $state('');
  const canFreeze = $derived(['PM', 'PMA', 'COS', 'ADMIN', 'PROGRAM_OPS'].includes(data.userRole as string));

  // ─── Client-side Data Loading ──────────────────────────────────────────
  async function loadDashboardData() {
    const univParam = data.selectedUniversityId || data.defaultUniversityId || '';
    const qs = univParam ? `?university_id=${univParam}` : '';

    try {
      const fetches: Promise<any>[] = [
        // Tasks — always fetch (tasks are core for all roles)
        fetch(`/api/tasks${qs ? qs + '&' : '?'}limit=1000`).then(r => r.ok ? r.json() : []),
        // Schedule Events
        fetch(`/api/schedule-events${qs}`).then(r => r.ok ? r.json() : []),
        // Calendar Freezes
        fetch(`/api/calendar-freeze${qs}`).then(r => r.ok ? r.json() : []),
        // Users (minimal)
        fetch(`/api/users${qs ? qs + '&' : '?'}minimal=true`).then(r => r.ok ? r.json() : []),
        // Task Stats
        fetch(`/api/task-stats${qs}`).then(r => r.ok ? r.json() : {}),
      ];

      const [t, se, cf, u, ts] = await Promise.all(fetches);
      tasks = t || [];
      scheduleEvents = se || [];
      calendarFreezes = cf || [];
      allUsers = u || [];
      rawTaskStats = ts || {};
    } catch (e) {
      console.error('[DASHBOARD] Client-side data load error:', e);
    } finally {
      isLoading = false;
    }
  }

  // Load data on mount + when university changes + poll every 60s
  $effect(() => {
    // Track selectedUniversityId so this effect re-runs when university changes
    const _univId = data.selectedUniversityId;
    isLoading = true;
    loadDashboardData();
    const interval = setInterval(() => loadDashboardData(), 60000);
    return () => clearInterval(interval);
  });

  // ─── Derived Data ─────────────────────────────────────────────────────────
  let activeUniv = $derived(data.user?.universities?.find((u: any) => u.id === data.user?.university_id));
  let isCentralBOA = $derived(data.user?.role === 'BOA' && (!data.user?.university_id || activeUniv?.is_team));

  const taskStats = $derived({
    total: (rawTaskStats.PENDING || 0) + (rawTaskStats.IN_PROGRESS || 0) + (rawTaskStats.COMPLETED || 0) + (rawTaskStats.CANCELLED || 0),
    completed: rawTaskStats.COMPLETED || 0,
    pending: rawTaskStats.PENDING || 0,
    in_progress: rawTaskStats.IN_PROGRESS || 0,
    overdue: rawTaskStats.OVERDUE || 0
  });

  // Color maps for event types
  // Solid chip colors (Google Calendar style) — used in week/day views
  const chipColors: Record<string, { solid: string; hover: string; dot: string }> = {
    task:        { solid: '#4285f4', hover: '#3367d6', dot: 'bg-blue-500' },
    task_urgent: { solid: '#ea4335', hover: '#c5221f', dot: 'bg-red-500' },
    task_high:   { solid: '#f97316', hover: '#ea580c', dot: 'bg-orange-500' },
    task_done:   { solid: '#34a853', hover: '#1e8e3e', dot: 'bg-emerald-500' },
    holiday:     { solid: '#f59e0b', hover: '#d97706', dot: 'bg-amber-500' },
    exam:        { solid: '#a855f7', hover: '#9333ea', dot: 'bg-purple-500' },
    event:       { solid: '#8b5cf6', hover: '#7c3aed', dot: 'bg-violet-500' },
    curricular:  { solid: '#0891b2', hover: '#0e7490', dot: 'bg-cyan-600' },
    co_curricular: { solid: '#059669', hover: '#047857', dot: 'bg-emerald-600' },
    club:        { solid: '#d946ef', hover: '#c026d3', dot: 'bg-fuchsia-500' },
    cultural:    { solid: '#e11d48', hover: '#be123c', dot: 'bg-rose-600' },
    freeze:      { solid: '#64748b', hover: '#475569', dot: 'bg-slate-500' },
  };

  // Academic types group (EXAM has its own toggle, CURRICULAR controlled by Academics toggle)
  const ACADEMIC_TYPES = ['CURRICULAR'];
  // Activity types group (EVENT has its own toggle via showScheduleEvents)
  const ACTIVITY_TYPES = ['CO_CURRICULAR', 'CLUB_ACTIVITY', 'CULTURAL_ACTIVITY'];

  // Light chip colors for month view
  const eventTypeColors: Record<string, { bg: string; border: string; dot: string; text: string }> = {
    task: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-400', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300' },
    task_urgent: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-400', dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300' },
    task_high: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-400', dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
    task_done: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-400', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
    holiday: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-400', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
    exam: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-400', dot: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-300' },
    event: { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-400', dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
    curricular: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-cyan-500', dot: 'bg-cyan-600', text: 'text-cyan-700 dark:text-cyan-300' },
    co_curricular: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-500', dot: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-300' },
    club: { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', border: 'border-fuchsia-500', dot: 'bg-fuchsia-500', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
    cultural: { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-500', dot: 'bg-rose-600', text: 'text-rose-700 dark:text-rose-300' },
    freeze: { bg: 'bg-slate-100 dark:bg-slate-800/50', border: 'border-slate-400', dot: 'bg-slate-500', text: 'text-slate-700 dark:text-slate-300' },
  };

  function getScheduleTypeKey(type: string): string {
    if (type === 'CURRICULAR') return 'curricular';
    if (type === 'CO_CURRICULAR') return 'co_curricular';
    if (type === 'CLUB_ACTIVITY') return 'club';
    if (type === 'CULTURAL_ACTIVITY') return 'cultural';
    if (type === 'HOLIDAY') return 'holiday';
    if (type === 'EXAM') return 'exam';
    return 'event';
  }

  function getEventStyle(ev: any) {
    if (ev.eventType === 'task') {
      if (ev.status === 'COMPLETED') return eventTypeColors.task_done;
      if (ev.priority === 'URGENT') return eventTypeColors.task_urgent;
      if (ev.priority === 'HIGH') return eventTypeColors.task_high;
      return eventTypeColors.task;
    }
    if (ev.eventType === 'freeze') return eventTypeColors.freeze;
    return eventTypeColors[getScheduleTypeKey(ev.type)] || eventTypeColors.event;
  }

  function getChipColor(ev: any): { solid: string; hover: string; dot: string } {
    if (ev.eventType === 'task') {
      if (ev.status === 'COMPLETED') return chipColors.task_done;
      if (ev.priority === 'URGENT') return chipColors.task_urgent;
      if (ev.priority === 'HIGH') return chipColors.task_high;
      return chipColors.task;
    }
    if (ev.eventType === 'freeze') return chipColors.freeze;
    return chipColors[getScheduleTypeKey(ev.type)] || chipColors.event;
  }

  // Combine tasks + schedule events into unified events
  let allEvents = $derived.by(() => {
    const events: any[] = [];
    if (showTasks) {
      for (const t of tasks) {
        const startDate = t.due_date ? new Date(t.due_date) : new Date(t.created_at);
        events.push({
          ...t, eventType: 'task',
          startDate,
          endDate: new Date(startDate.getTime() + 60 * 60 * 1000),
        });
      }
    }
    for (const e of scheduleEvents) {
      if (e.type === 'HOLIDAY' && !showHolidays) continue;
      if (e.type === 'EXAM' && !showExams) continue;
      if (ACADEMIC_TYPES.includes(e.type) && !showAcademics) continue;
      if (ACTIVITY_TYPES.includes(e.type) && !showActivities) continue;
      if (!['HOLIDAY', 'EXAM', ...ACADEMIC_TYPES, ...ACTIVITY_TYPES].includes(e.type) && !showScheduleEvents) continue;
      events.push({
        ...e, eventType: 'schedule',
        startDate: new Date(e.start_date),
        endDate: new Date(e.due_date || e.start_date),
      });
    }
    // Add calendar freezes as visual indicators
    for (const f of calendarFreezes) {
      const fDate = new Date(f.freeze_date);
      events.push({
        ...f, eventType: 'freeze',
        title: `Frozen: ${f.reason || 'Calendar Freeze'}`,
        startDate: fDate,
        endDate: new Date(fDate.getTime() + 24 * 60 * 60 * 1000),
        type: 'FREEZE',
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return events.filter(e => e.title?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    return events;
  });

  // Event counts per type for sidebar
  let eventCounts = $derived.by(() => {
    const se = scheduleEvents;
    const taskCount = tasks.length;
    const holidays = se.filter((e: any) => e.type === 'HOLIDAY').length;
    const exams = se.filter((e: any) => e.type === 'EXAM').length;
    const academics = se.filter((e: any) => ACADEMIC_TYPES.includes(e.type)).length;
    const activities = se.filter((e: any) => ACTIVITY_TYPES.includes(e.type)).length;
    const events = se.filter((e: any) => !['HOLIDAY', 'EXAM', ...ACADEMIC_TYPES, ...ACTIVITY_TYPES].includes(e.type)).length;
    const freezes = calendarFreezes.length;
    return { tasks: taskCount, holidays, exams, academics, activities, events, freezes };
  });

  // ─── Users grouped by university (for assignee picker) ──────────────────
  let usersGroupedByUniv = $derived.by(() => {
    const users = allUsers;
    const groups: Record<string, { univName: string; univId: string; users: any[] }> = {};
    for (const u of users) {
      const key = u.university_id || '__none__';
      if (!groups[key]) {
        groups[key] = { univId: key, univName: u.university_name || 'No University', users: [] };
      }
      groups[key].users.push(u);
    }
    // Sort: universities with names first, "No University" last
    return Object.values(groups).sort((a, b) => {
      if (a.univId === '__none__') return 1;
      if (b.univId === '__none__') return -1;
      return a.univName.localeCompare(b.univName);
    });
  });

  let filteredAssigneeUsers = $derived.by(() => {
    let groups = usersGroupedByUniv;
    if (assigneeFilterUniv) {
      groups = groups.filter(g => g.univId === assigneeFilterUniv);
    }
    if (assigneeSearch.trim()) {
      const q = assigneeSearch.toLowerCase();
      groups = groups.map(g => ({
        ...g,
        users: g.users.filter((u: any) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q))
      })).filter(g => g.users.length > 0);
    }
    return groups;
  });

  // ─── Overlap handling for week/day views ────────────────────────────────
  function getEventsWithLayout(date: Date) {
    const dayEvents = allEvents.filter(e => isSameDay(e.startDate, date));
    // Sort by start time
    dayEvents.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    // Assign columns for overlapping events
    const columns: any[][] = [];
    for (const ev of dayEvents) {
      const evStart = ev.startDate.getTime();
      const evEnd = ev.endDate.getTime();
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (evStart >= lastInCol.endDate.getTime()) {
          columns[c].push(ev);
          ev._col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = columns.length;
        columns.push([ev]);
      }
      ev._totalCols = 0; // will be set below
    }
    const totalCols = columns.length || 1;
    for (const ev of dayEvents) {
      ev._totalCols = totalCols;
    }
    return dayEvents;
  }

  // ─── Date Navigation ──────────────────────────────────────────────────────
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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

  // ─── Mini Calendar Data ────────────────────────────────────────────────────
  let miniCalMonth = $state(new Date());
  let miniCalDays = $derived.by(() => {
    const year = miniCalMonth.getFullYear();
    const month = miniCalMonth.getMonth();
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

  const SLOT_H = 60; // px per hour — both views
  const START_HOUR = 6;
  const END_HOUR = 22;
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);
  const totalGridH = hours.length * SLOT_H;

  function getEventsForDate(date: Date) {
    return allEvents.filter(e => isSameDay(e.startDate, date));
  }

  function formatHour(h: number) {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  // Current time red line
  let nowMinutes = $state(new Date().getHours() * 60 + new Date().getMinutes());
  $effect(() => {
    const t = setInterval(() => { nowMinutes = new Date().getHours() * 60 + new Date().getMinutes(); }, 60000);
    return () => clearInterval(t);
  });
  let nowLineTop = $derived((nowMinutes - START_HOUR * 60) / 60 * SLOT_H);

  // Auto-scroll to ~current hour on mount / view change
  $effect(() => {
    const _v = calendarView;
    if (_v === 'week' || _v === 'day') {
      setTimeout(() => {
        const el = document.querySelector('[data-cal-scroll]');
        if (el) el.scrollTop = Math.max(0, (new Date().getHours() - START_HOUR - 1) * SLOT_H);
      }, 60);
    }
  });

  function formatTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function getHeaderLabel() {
    if (calendarView === 'month') return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (calendarView === 'week') {
      const s = weekDays[0];
      const e = weekDays[6];
      if (s.getMonth() === e.getMonth()) return `${monthNames[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
      return `${shortMonths[s.getMonth()]} ${s.getDate()} – ${shortMonths[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${dayNames[currentDate.getDay()]}, ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
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
    assigneeSearch = '';
    assigneeFilterUniv = data.selectedUniversityId || '';
    showTaskModal = true;
  }

  async function saveTask() {
    if (!taskForm.title) return alert('Title is required.');
    isSaving = true;
    autoChecklistGenerated = false;
    try {
      // Build proper start/end datetime with explicit timezone offset
      const tzOffset = new Date().getTimezoneOffset(); // in minutes, negative for IST
      const tzSign = tzOffset <= 0 ? '+' : '-';
      const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
      const tzMins = String(Math.abs(tzOffset) % 60).padStart(2, '0');
      const tzStr = `${tzSign}${tzHours}:${tzMins}`;

      const startDateTime = taskForm.due_date
        ? `${taskForm.due_date}T${taskForm.start_time || '09:00'}:00${tzStr}`
        : new Date().toISOString();
      const dueDateTime = taskForm.due_date
        ? `${taskForm.due_date}T${taskForm.end_time || '17:00'}:00${tzStr}`
        : new Date().toISOString();
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...taskForm, start_date: startDateTime, due_date: dueDateTime })
      });
      if (res.ok) {
        const task = await res.json();
        showTaskModal = false;
        // Auto-generate checklist from description or title
        const checklistSource = taskForm.description && taskForm.description.length > 10
          ? taskForm.description
          : taskForm.title;
        if (checklistSource) {
          const clRes = await fetch(`/api/tasks/${task.id}/checklist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_generate: true, description: checklistSource })
          });
          if (clRes.ok) {
            const clData = await clRes.json();
            if (clData.generated > 0) autoChecklistGenerated = true;
          }
        }
        await loadDashboardData();
        // Auto-open the newly created task to show the checklist
        if (autoChecklistGenerated) {
          setTimeout(() => {
            const newTask = tasks.find((t: any) => t.id === task.id);
            if (newTask) openTaskDetail(newTask);
          }, 500);
        }
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
          university_id: eventForm.university_id || data.selectedUniversityId || data.defaultUniversityId
        })
      });
      if (res.ok) {
        const event = await res.json();
        showCreateEvent = false;
        isSaving = false;

        // Run checklist generation + SOP upload in parallel (non-blocking)
        const backgroundTasks: Promise<any>[] = [];

        if (eventForm.description && eventForm.description.length > 10) {
          backgroundTasks.push(
            fetch(`/api/schedule-events/${event.id}/checklist`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ auto_generate: true, description: eventForm.description })
            }).catch(() => {})
          );
        }

        // Upload SOP document (view-only)
        if (sopFile) {
          const fd = new FormData();
          fd.append('file', sopFile);
          fd.append('mode', 'view');
          backgroundTasks.push(
            fetch(`/api/schedule-events/${event.id}/sop`, { method: 'POST', body: fd })
              .catch(() => {})
          );
          sopFile = null;
        }

        // Upload SOP tasks doc (generate checklist)
        if (sopTaskFile) {
          const fd = new FormData();
          fd.append('file', sopTaskFile);
          fd.append('mode', 'generate');
          const uploadFile = sopTaskFile.name;
          backgroundTasks.push(
            fetch(`/api/schedule-events/${event.id}/sop`, { method: 'POST', body: fd })
              .then(async (sopRes) => {
                if (sopRes.ok) {
                  const sopData = await sopRes.json();
                  if (sopData.checklist?.generated > 0) {
                    alert(`${sopData.checklist.generated} checklist items generated from "${uploadFile}"`);
                  }
                } else {
                  const sopErr = await sopRes.json().catch(() => ({ message: 'Upload failed' }));
                  alert(`Task doc upload issue: ${sopErr.message}`);
                }
              })
              .catch(() => alert('Task doc upload failed. Try uploading from the event detail view.'))
          );
          sopTaskFile = null;
        }

        // Refresh calendar immediately, background tasks continue
        await loadDashboardData();
        if (backgroundTasks.length > 0) {
          Promise.all(backgroundTasks).then(() => loadDashboardData()).catch(() => {});
        }
      } else {
        const err = await res.json().catch(() => ({ message: 'Failed to save event' }));
        alert(err.message || 'Failed to save event');
      }
    } finally { isSaving = false; }
  }

  async function toggleTaskStatus(task: any) {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    // Optimistic update — reflect immediately in modal
    task.status = newStatus;
    if (selectedTask?.id === task.id) selectedTask = { ...selectedTask, status: newStatus };
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus })
    });
    await loadDashboardData();
    // Re-sync selectedTask with fresh data
    if (selectedTask?.id === task.id) {
      const fresh = tasks.find((t: any) => t.id === task.id);
      if (fresh) selectedTask = { ...fresh };
    }
  }

  async function deleteEvent(id: string, type: string) {
    if (!confirm('Are you sure?')) return;
    const endpoint = type === 'task' ? `/api/tasks?id=${id}` : `/api/schedule-events?id=${id}`;
    await fetch(endpoint, { method: 'DELETE' });
    if (selectedTask?.id === id) { showTaskDetail = false; selectedTask = null; }
    await loadDashboardData();
  }

  // ─── Task Detail ──────────────────────────────────────────────────────────
  async function openTaskDetail(task: any) {
    selectedTask = task;
    showTaskDetail = true;
    viewStartTime = Date.now();
    taskTimeline = null;
    taskNotes = task.notes || '';
    savingNotes = false;
    if (notesTimer) { clearTimeout(notesTimer); notesTimer = null; }

    // Build task timeline
    const created = task.created_at ? new Date(task.created_at) : null;
    const due = task.due_date ? new Date(task.due_date) : null;
    const assignees = task.assignees || [];
    const startedAssignee = assignees.find((a: any) => a.started_at);
    const completedAssignee = assignees.find((a: any) => a.completed_at);
    const started = startedAssignee ? new Date(startedAssignee.started_at) : null;
    const completed = completedAssignee ? new Date(completedAssignee.completed_at) : null;

    taskTimeline = {
      created,
      due,
      started,
      completed,
      isOverdue: due && !completed && due < new Date(),
      timeToStart: created && started ? Math.round((started.getTime() - created.getTime()) / 1000) : null,
      timeToComplete: created && completed ? Math.round((completed.getTime() - created.getTime()) / 1000) : null,
      activeWorkTime: started && completed ? Math.round((completed.getTime() - started.getTime()) / 1000) : null,
      elapsedSinceCreated: created ? Math.round((Date.now() - created.getTime()) / 1000) : null,
    };

    // Load checklist
    try {
      const res = await fetch(`/api/tasks/${task.id}/checklist`);
      if (res.ok) {
        const d = await res.json();
        checklistItems = d.items || [];
        checklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
      }
    } catch {}
    // Log this view
    try {
      const res = await fetch(`/api/tasks/${task.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: crypto.randomUUID() })
      });
      if (res.ok) { const log = await res.json(); viewLogId = log.id; }
    } catch {}
    // Load view stats (visible to everyone)
    try {
      const res = await fetch(`/api/tasks/${task.id}/views`);
      if (res.ok) viewStats = await res.json();
    } catch {}
  }

  function closeTaskDetail() {
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

  function saveNotes(value: string) {
    taskNotes = value;
    if (notesTimer) clearTimeout(notesTimer);
    savingNotes = false;
    notesTimer = setTimeout(async () => {
      savingNotes = true;
      try {
        await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedTask.id, notes: taskNotes })
        });
      } catch {} finally { savingNotes = false; }
    }, 800);
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
    if (!seconds || seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600 * 10) / 10}h`;
    const days = Math.floor(seconds / 86400);
    const hrs = Math.round((seconds % 86400) / 3600);
    return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
  }

  function formatDateShort(d: Date | null) {
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function clickTimeSlot(date: Date, hour: number) {
    createEventDate = date.toISOString().split('T')[0];
    createEventStartTime = `${String(hour).padStart(2, '0')}:00`;
    createEventEndTime = `${String(hour + 1).padStart(2, '0')}:00`;
    eventForm = { title: '', type: 'EVENT', description: '', priority: 'MEDIUM', assignee_ids: [], university_id: data.selectedUniversityId || data.defaultUniversityId || '', start_date: '', due_date: '' };
    eventAssigneeSearch = '';
    eventAssigneeFilterUniv = data.selectedUniversityId || '';
    sopFile = null;
    sopTaskFile = null;
    showCreateEvent = true;
  }

  function openCreateEvent(date?: Date) {
    const d = date || new Date();
    createEventDate = d.toISOString().split('T')[0];
    createEventStartTime = '09:00';
    createEventEndTime = '10:00';
    eventForm = { title: '', type: 'EVENT', description: '', priority: 'MEDIUM', assignee_ids: [], university_id: data.selectedUniversityId || data.defaultUniversityId || '', start_date: '', due_date: '' };
    eventAssigneeSearch = '';
    eventAssigneeFilterUniv = data.selectedUniversityId || '';
    sopFile = null;
    sopTaskFile = null;
    showCreateEvent = true;
  }

  function handleEventClick(e: MouseEvent, event: any) {
    e.stopPropagation();
    if (event.eventType === 'task') openTaskDetail(event);
    else if (event.eventType === 'schedule') openEventDetail(event);
    else if (event.eventType === 'freeze' && canFreeze) {
      removeFreeze(event.id);
    }
  }

  // ─── Event Detail ──────────────────────────────────────────────────────
  async function openEventDetail(event: any) {
    selectedEvent = event;
    showEventDetail = true;
    eventViewStartTime = Date.now();
    eventChecklistItems = [];
    eventChecklistProgress = { total: 0, completed: 0, percent: 0 };
    eventViewStats = [];
    eventSOPDocs = [];
    eventMessages = [];
    newEventChecklistTitle = '';

    // Load checklist
    try {
      const res = await fetch(`/api/schedule-events/${event.id}/checklist`);
      if (res.ok) {
        const d = await res.json();
        eventChecklistItems = d.items || [];
        eventChecklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
      }
    } catch {}
    // Log view
    try {
      const res = await fetch(`/api/schedule-events/${event.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: crypto.randomUUID() })
      });
      if (res.ok) { const log = await res.json(); eventViewLogId = log.id; }
    } catch {}
    // Load view stats
    try {
      const res = await fetch(`/api/schedule-events/${event.id}/views`);
      if (res.ok) eventViewStats = await res.json();
    } catch {}
    // Load SOP docs + messages in parallel
    try {
      const [sopRes, msgRes] = await Promise.all([
        fetch(`/api/schedule-events/${event.id}/sop`),
        fetch(`/api/schedule-events/${event.id}/messages`)
      ]);
      if (sopRes.ok) eventSOPDocs = await sopRes.json();
      if (msgRes.ok) eventMessages = await msgRes.json();
    } catch {}
  }

  function closeEventDetail() {
    if (eventViewLogId && eventViewStartTime) {
      const duration = Math.round((Date.now() - eventViewStartTime) / 1000);
      fetch(`/api/schedule-events/${selectedEvent?.id}/views`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewLogId: eventViewLogId, durationSeconds: duration })
      }).catch(() => {});
    }
    showEventDetail = false;
    selectedEvent = null;
    eventViewLogId = '';
    eventViewStartTime = 0;
  }

  async function toggleEventChecklistItem(itemId: string) {
    const res = await fetch(`/api/schedule-events/${selectedEvent.id}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle: true, itemId })
    });
    if (res.ok) {
      const r = await fetch(`/api/schedule-events/${selectedEvent.id}/checklist`);
      if (r.ok) {
        const d = await r.json();
        eventChecklistItems = d.items || [];
        eventChecklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
      }
    }
  }

  async function addEventChecklistItemUI() {
    if (!newEventChecklistTitle.trim()) return;
    await fetch(`/api/schedule-events/${selectedEvent.id}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newEventChecklistTitle })
    });
    newEventChecklistTitle = '';
    const r = await fetch(`/api/schedule-events/${selectedEvent.id}/checklist`);
    if (r.ok) {
      const d = await r.json();
      eventChecklistItems = d.items || [];
      eventChecklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
    }
  }

  // Group checklist items by [Section] prefix for structured display
  function groupChecklistItems(items: any[]): { section: string; items: any[] }[] {
    const groups: { section: string; items: any[] }[] = [];
    let currentSection = '';
    let currentGroup: any[] = [];

    for (const item of items) {
      const title = item.title || '';
      // Parse "[Section] Task — Description" format
      const sectionMatch = title.match(/^\[([^\]]+)\]\s*(.*)$/);
      const section = sectionMatch ? sectionMatch[1].trim() : '';
      const remainder = sectionMatch ? sectionMatch[2].trim() : title;

      // Parse "Task — Description" within the remainder
      const dashMatch = remainder.match(/^(.+?)\s*—\s*(.+)$/);
      const enrichedItem = {
        ...item,
        _section: section,
        _taskName: dashMatch ? dashMatch[1].trim() : '',
        _taskDesc: dashMatch ? dashMatch[2].trim() : '',
        _displayTitle: remainder
      };

      if (section !== currentSection) {
        if (currentGroup.length > 0) {
          groups.push({ section: currentSection, items: currentGroup });
        }
        currentSection = section;
        currentGroup = [enrichedItem];
      } else {
        currentGroup.push(enrichedItem);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ section: currentSection, items: currentGroup });
    }
    return groups;
  }

  async function deleteEventChecklistItemUI(itemId: string) {
    await fetch(`/api/schedule-events/${selectedEvent.id}/checklist?itemId=${itemId}`, { method: 'DELETE' });
    const r = await fetch(`/api/schedule-events/${selectedEvent.id}/checklist`);
    if (r.ok) {
      const d = await r.json();
      eventChecklistItems = d.items || [];
      eventChecklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
    }
  }

  // ─── Event Messages ──────────────────────────────────────────────────────
  async function toggleMessageSent(messageId: string) {
    const res = await fetch(`/api/schedule-events/${selectedEvent.id}/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle: true, messageId })
    });
    if (res.ok) {
      const r = await fetch(`/api/schedule-events/${selectedEvent.id}/messages`);
      if (r.ok) eventMessages = await r.json();
    }
  }

  async function deleteMessageUI(messageId: string) {
    await fetch(`/api/schedule-events/${selectedEvent.id}/messages?messageId=${messageId}`, { method: 'DELETE' });
    const r = await fetch(`/api/schedule-events/${selectedEvent.id}/messages`);
    if (r.ok) eventMessages = await r.json();
  }

  async function copyMessageContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      alert('Message copied to clipboard!');
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Message copied to clipboard!');
    }
  }

  function downloadSOPDoc(doc: any) {
    const content = doc.content_text || '';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename || 'document.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function deleteSOPDocUI(docId: string) {
    if (!confirm('Delete this document?')) return;
    await fetch(`/api/schedule-events/${selectedEvent.id}/sop?docId=${docId}`, { method: 'DELETE' });
    const r = await fetch(`/api/schedule-events/${selectedEvent.id}/sop`);
    if (r.ok) eventSOPDocs = await r.json();
  }

  async function uploadSOPDocView() {
    if (!sopFile || !selectedEvent) return;
    const fd = new FormData();
    fd.append('file', sopFile);
    fd.append('mode', 'view');
    try {
      const res = await fetch(`/api/schedule-events/${selectedEvent.id}/sop`, { method: 'POST', body: fd });
      if (res.ok) {
        const result = await res.json();
        const msgCount = result.messages?.generated || 0;
        const msg = msgCount > 0
          ? `SOP document "${sopFile.name}" uploaded! ${msgCount} messages extracted.`
          : `SOP document "${sopFile.name}" uploaded successfully! Click on it to view the content.`;
        alert(msg);
        sopFile = null;
        // Reload SOP docs and messages (messages are auto-extracted from view uploads)
        const [docsRes, msgRes] = await Promise.all([
          fetch(`/api/schedule-events/${selectedEvent.id}/sop`),
          fetch(`/api/schedule-events/${selectedEvent.id}/messages`)
        ]);
        if (docsRes.ok) eventSOPDocs = await docsRes.json();
        if (msgRes.ok) eventMessages = await msgRes.json();
      } else {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        alert(`Upload failed: ${err.message}`);
      }
    } catch (e) {
      alert('Upload failed. Please try again.');
    }
  }

  async function uploadSOPTaskDoc() {
    if (!sopTaskFile || !selectedEvent) return;
    const fd = new FormData();
    fd.append('file', sopTaskFile);
    fd.append('mode', 'generate');
    try {
      const res = await fetch(`/api/schedule-events/${selectedEvent.id}/sop`, { method: 'POST', body: fd });
      if (res.ok) {
        const result = await res.json();
        if (result.checklist?.generated > 0) {
          alert(`Generated ${result.checklist.generated} checklist items from "${sopTaskFile.name}"`);
        } else {
          alert('Document uploaded but no checklist items could be extracted. Try a different format.');
        }
        sopTaskFile = null;
        // Reload SOP docs and checklist (generate mode = tasks only, no messages)
        const [docsRes, clRes] = await Promise.all([
          fetch(`/api/schedule-events/${selectedEvent.id}/sop`),
          fetch(`/api/schedule-events/${selectedEvent.id}/checklist`)
        ]);
        if (docsRes.ok) eventSOPDocs = await docsRes.json();
        if (clRes.ok) {
          const d = await clRes.json();
          eventChecklistItems = d.items || [];
          eventChecklistProgress = d.progress || { total: 0, completed: 0, percent: 0 };
        }
      } else {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        alert(`Upload failed: ${err.message}\n\nTip: For .doc/.docx/.pdf files, try using a .txt file or paste the content in the description field instead.`);
      }
    } catch (e) {
      alert('Upload failed. Try uploading from the event detail view or paste content in the description.');
    }
  }

  async function deleteEventUI(id: string) {
    if (!confirm('Are you sure you want to delete this event?')) return;
    await fetch(`/api/schedule-events?id=${id}`, { method: 'DELETE' });
    if (selectedEvent?.id === id) { showEventDetail = false; selectedEvent = null; }
    await loadDashboardData();
  }

  // ─── Calendar Freeze ───────────────────────────────────────────────────
  function openFreezeModal() {
    freezeDates = [];
    freezeReason = '';
    freezeUniversityId = data.selectedUniversityId || data.defaultUniversityId || '';
    showFreezeModal = true;
  }

  async function submitFreeze() {
    if (!freezeUniversityId) return alert('Select a university');
    if (freezeDates.length === 0) return alert('Select at least one date');
    if (!freezeReason.trim()) return alert('Please provide a reason for freezing');
    isSaving = true;
    try {
      const res = await fetch('/api/calendar-freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ university_id: freezeUniversityId, freeze_dates: freezeDates, reason: freezeReason.trim() })
      });
      if (res.ok) {
        const result = await res.json();
        alert(`Successfully frozen ${result.frozen} date(s). Student Engagement team has been notified.`);
        showFreezeModal = false;
        await loadDashboardData();
      } else {
        const err = await res.json().catch(() => ({ message: 'Unknown error' }));
        alert(`Failed to freeze dates: ${err.message || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Freeze failed: ${e.message || 'Network error'}`);
    } finally { isSaving = false; }
  }

  async function removeFreeze(freezeId: string) {
    if (!confirm('Are you sure you want to remove this calendar freeze?')) return;
    try {
      const res = await fetch(`/api/calendar-freeze?id=${freezeId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadDashboardData();
      } else {
        const err = await res.json().catch(() => ({ message: 'Unknown error' }));
        alert(`Failed to remove freeze: ${err.message || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Failed to remove freeze: ${e.message || 'Network error'}`);
    }
  }

  function isFrozenDate(date: Date): any {
    return calendarFreezes.find((f: any) => {
      const fd = new Date(f.freeze_date);
      return fd.getFullYear() === date.getFullYear() && fd.getMonth() === date.getMonth() && fd.getDate() === date.getDate();
    });
  }

  // Filtered event assignee list (reuses usersGroupedByUniv)
  let filteredEventAssigneeUsers = $derived.by(() => {
    let groups = usersGroupedByUniv;
    if (eventAssigneeFilterUniv) {
      groups = groups.filter(g => g.univId === eventAssigneeFilterUniv);
    }
    if (eventAssigneeSearch.trim()) {
      const q = eventAssigneeSearch.toLowerCase();
      groups = groups.map(g => ({
        ...g,
        users: g.users.filter((u: any) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      })).filter(g => g.users.length > 0);
    }
    return groups;
  });

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

<div class="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-64px)] overflow-hidden bg-white dark:bg-slate-950" in:fade>
  <!-- ═══════ PAGE HEADING ═══════ -->
  <div class="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-shrink-0">
    <div class="flex items-center gap-2 sm:gap-3">
      <svg class="w-5 h-5 sm:w-7 sm:h-7 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      <div>
        <h1 class="text-sm sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
        <p class="text-[9px] sm:text-[11px] text-gray-400 dark:text-slate-500 hidden sm:block">Manage tasks, events, and track team activity</p>
      </div>
    </div>
    <div class="hidden md:flex items-center gap-3 text-xs">
      <div class="flex items-center gap-4 text-gray-500 dark:text-gray-400">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Tasks ({eventCounts.tasks})</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-violet-500"></span> Events ({eventCounts.events})</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Holidays ({eventCounts.holidays})</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Exams ({eventCounts.exams})</span>
      </div>
    </div>
  </div>

  <div class="flex flex-1 overflow-hidden relative">
  <!-- ═══════ LEFT SIDEBAR (Google Calendar style) ═══════ -->
  {#if sidebarOpen}
    <!-- Mobile sidebar overlay backdrop -->
    <div class="fixed inset-0 bg-black/30 z-30 lg:hidden" onclick={() => sidebarOpen = false} role="presentation" transition:fade={{ duration: 150 }}></div>
    <div class="fixed inset-y-0 left-0 z-40 w-64 lg:relative lg:w-60 flex-shrink-0 border-r border-gray-200 dark:border-slate-800 flex flex-col overflow-y-auto bg-white dark:bg-slate-950 p-4 shadow-2xl lg:shadow-none" in:fly={{ x: -20, duration: 150 }}>
      <!-- Create Button -->
      <button onclick={() => openCreateTask()}
        class="w-full flex items-center gap-3 px-5 py-3 mb-5 rounded-2xl shadow-md hover:shadow-lg transition-all bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 font-medium text-sm">
        <svg class="w-8 h-8 text-indigo-500" viewBox="0 0 36 36" fill="none">
          <path d="M18 12v12M12 18h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        Create
      </button>

      <!-- Mini Calendar -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2 px-1">
          <span class="text-xs font-bold text-gray-700 dark:text-gray-300">{shortMonths[miniCalMonth.getMonth()]} {miniCalMonth.getFullYear()}</span>
          <div class="flex gap-0.5">
            <button onclick={() => { const d = new Date(miniCalMonth); d.setMonth(d.getMonth() - 1); miniCalMonth = d; }} class="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800">
              <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button onclick={() => { const d = new Date(miniCalMonth); d.setMonth(d.getMonth() + 1); miniCalMonth = d; }} class="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800">
              <svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-7 gap-0">
          {#each ['S','M','T','W','T','F','S'] as d}
            <div class="text-center text-[9px] font-bold text-gray-400 py-1">{d}</div>
          {/each}
          {#each miniCalDays as { date, isCurrentMonth }}
            <button
              onclick={() => { currentDate = date; calendarView = 'day'; }}
              class="text-center text-[10px] py-1 rounded-full transition-colors
                {!isCurrentMonth ? 'text-gray-300 dark:text-slate-700' : ''}
                {isToday(date) ? 'bg-indigo-600 text-white font-bold' : ''}
                {isSameDay(date, currentDate) && !isToday(date) ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 font-bold' : ''}
                {isCurrentMonth && !isToday(date) && !isSameDay(date, currentDate) ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800' : ''}">
              {date.getDate()}
            </button>
          {/each}
        </div>
      </div>

      <!-- Search -->
      <div class="mb-4">
        <input bind:value={searchQuery} placeholder="Search events..."
          class="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
      </div>

      <!-- Event Type Filters -->
      <div class="space-y-1">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">Event Types</p>
        <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer">
          <input type="checkbox" bind:checked={showTasks} class="sr-only" />
          <span class="w-3 h-3 rounded-sm flex-shrink-0 border-2 transition-colors {showTasks ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-slate-600'}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">Tasks</span>
          <span class="text-[10px] font-bold text-gray-400">{eventCounts.tasks}</span>
        </label>
        <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer">
          <input type="checkbox" bind:checked={showScheduleEvents} class="sr-only" />
          <span class="w-3 h-3 rounded-sm flex-shrink-0 border-2 transition-colors {showScheduleEvents ? 'bg-violet-500 border-violet-500' : 'border-gray-300 dark:border-slate-600'}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">Events</span>
          <span class="text-[10px] font-bold text-gray-400">{eventCounts.events}</span>
        </label>
        <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer">
          <input type="checkbox" bind:checked={showHolidays} class="sr-only" />
          <span class="w-3 h-3 rounded-sm flex-shrink-0 border-2 transition-colors {showHolidays ? 'bg-amber-500 border-amber-500' : 'border-gray-300 dark:border-slate-600'}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">Holidays</span>
          <span class="text-[10px] font-bold text-gray-400">{eventCounts.holidays}</span>
        </label>

        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mt-3 mb-1">Academics</p>
        <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer">
          <input type="checkbox" bind:checked={showExams} class="sr-only" />
          <span class="w-3 h-3 rounded-sm flex-shrink-0 border-2 transition-colors {showExams ? 'bg-purple-500 border-purple-500' : 'border-gray-300 dark:border-slate-600'}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">Exams</span>
          <span class="text-[10px] font-bold text-gray-400">{eventCounts.exams}</span>
        </label>
        <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer">
          <input type="checkbox" bind:checked={showAcademics} class="sr-only" />
          <span class="w-3 h-3 rounded-sm flex-shrink-0 border-2 transition-colors {showAcademics ? 'bg-cyan-600 border-cyan-600' : 'border-gray-300 dark:border-slate-600'}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">Curricular</span>
          <span class="text-[10px] font-bold text-gray-400">{eventCounts.academics}</span>
        </label>

        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mt-3 mb-1">Activity / Events</p>
        <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer">
          <input type="checkbox" bind:checked={showActivities} class="sr-only" />
          <span class="w-3 h-3 rounded-sm flex-shrink-0 border-2 transition-colors {showActivities ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 dark:border-slate-600'}"></span>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">Activities</span>
          <span class="text-[10px] font-bold text-gray-400">{eventCounts.activities}</span>
        </label>
      </div>

      <!-- Calendar Freezes -->
      {#if calendarFreezes.length > 0}
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            Frozen Dates ({eventCounts.freezes})
          </p>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            {#each calendarFreezes as f}
              <div class="flex items-center gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-[10px] group">
                <span class="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"></span>
                <span class="flex-1 text-gray-600 dark:text-gray-400 truncate">{new Date(f.freeze_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })} — {f.reason || 'Frozen'}</span>
                {#if canFreeze}
                  <button onclick={() => removeFreeze(f.id)} class="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30" title="Remove freeze">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- University Filter -->
      {#if (data.user?.permissions || []).includes('universities') || (data.universities).length > 1}
        <div class="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800">
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">University</p>
          <select onchange={onUnivChange} value={data.selectedUniversityId || ''}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300">
            <option value="">All Universities</option>
            {#each data.universities as univ}
              <option value={univ.id}>{univ.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <!-- Task Stats -->
      <div class="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800 space-y-2">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">Task Summary</p>
        <div class="grid grid-cols-2 gap-2">
          <div class="bg-blue-50 dark:bg-blue-900/10 rounded-lg px-3 py-2 text-center">
            <p class="text-lg font-black text-blue-600 dark:text-blue-400">{taskStats.total}</p>
            <p class="text-[9px] font-bold text-blue-400 uppercase">Total</p>
          </div>
          <div class="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg px-3 py-2 text-center">
            <p class="text-lg font-black text-emerald-600 dark:text-emerald-400">{taskStats.completed}</p>
            <p class="text-[9px] font-bold text-emerald-400 uppercase">Done</p>
          </div>
          <div class="bg-amber-50 dark:bg-amber-900/10 rounded-lg px-3 py-2 text-center">
            <p class="text-lg font-black text-amber-600 dark:text-amber-400">{taskStats.pending}</p>
            <p class="text-[9px] font-bold text-amber-400 uppercase">Pending</p>
          </div>
          <div class="bg-red-50 dark:bg-red-900/10 rounded-lg px-3 py-2 text-center">
            <p class="text-lg font-black text-red-600 dark:text-red-400">{taskStats.overdue}</p>
            <p class="text-[9px] font-bold text-red-400 uppercase">Overdue</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- ═══════ MAIN CALENDAR AREA ═══════ -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Calendar Header Bar -->
    <div class="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex-shrink-0 gap-1">
      <div class="flex items-center gap-1 sm:gap-2 min-w-0">
        <!-- Sidebar Toggle -->
        <button onclick={() => sidebarOpen = !sidebarOpen} class="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 flex-shrink-0" title="Toggle sidebar">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <button onclick={goToday} class="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300 flex-shrink-0">Today</button>
        <button onclick={goPrev} class="p-1 sm:p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 flex-shrink-0">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button onclick={goNext} class="p-1 sm:p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 flex-shrink-0">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>
        <h2 class="text-sm sm:text-xl font-normal text-gray-700 dark:text-gray-200 ml-1 sm:ml-2 truncate">{getHeaderLabel()}</h2>
      </div>
      <div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <!-- View Switcher -->
        <div class="flex border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden">
          {#each [['month','M'],['week','W'],['day','D']] as [v, label]}
            <button onclick={() => calendarView = v as CalendarView}
              class="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-all border-r last:border-r-0 border-gray-300 dark:border-slate-600
                {calendarView === v ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}">
              <span class="hidden sm:inline">{v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Day'}</span>
              <span class="sm:hidden">{label}</span>
            </button>
          {/each}
        </div>
        <!-- Quick Create -->
        <div class="flex gap-1 ml-1 sm:ml-2">
          <button onclick={() => openCreateTask()}
            class="p-1.5 sm:px-3 sm:py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-all flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="hidden sm:inline">Task</span>
          </button>
          <button onclick={() => openCreateEvent()}
            class="p-1.5 sm:px-3 sm:py-1.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <span class="hidden sm:inline">Event</span>
          </button>
          {#if canFreeze}
            <button onclick={openFreezeModal}
              class="p-1.5 sm:px-3 sm:py-1.5 border border-slate-400 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5 hidden sm:flex">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              Freeze
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Notification Banner (compact) -->
    {#if notificationStatus !== 'granted' && notificationStatus !== 'NOT_SUPPORTED'}
      <div class="flex items-center justify-between px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/30 flex-shrink-0">
        <p class="text-xs text-indigo-700 dark:text-indigo-300 font-medium">{notificationStatus === 'denied' ? 'Notifications blocked in browser settings' : 'Enable notifications to stay updated'}</p>
        {#if notificationStatus !== 'denied'}
          <button onclick={requestNotificationPermission} class="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700">Enable</button>
        {/if}
      </div>
    {/if}

    <!-- ═══════ CALENDAR VIEWS ═══════ -->
    <div class="flex-1 overflow-auto">
      <!-- Loading State -->
      {#if isLoading}
        <div class="flex items-center justify-center h-full">
          <div class="text-center">
            <svg class="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p class="text-sm text-gray-400 dark:text-slate-500 font-medium">Loading calendar...</p>
          </div>
        </div>
      <!-- MONTH VIEW -->
      {:else if calendarView === 'month'}
        <div class="h-full flex flex-col">
          <div class="grid grid-cols-7 border-b border-gray-200 dark:border-slate-800 flex-shrink-0">
            {#each shortDays as day}
              <div class="px-0.5 sm:px-3 py-1 sm:py-2 text-[9px] sm:text-[11px] font-medium text-gray-500 dark:text-slate-500 text-center">{day}</div>
            {/each}
          </div>
          <div class="grid grid-cols-7 flex-1" style="grid-auto-rows: minmax(0, 1fr);">
            {#each monthDays as { date, isCurrentMonth }}
              {@const frozen = isFrozenDate(date)}
              <div
                class="border-b border-r border-gray-100 dark:border-slate-800/50 p-1 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-900/30 transition-colors overflow-hidden {!isCurrentMonth ? 'bg-gray-50/50 dark:bg-slate-900/20' : ''} {frozen ? 'bg-red-50/60 dark:bg-red-950/20' : ''}"
                style={frozen ? 'background-image: repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(239,68,68,0.06) 8px, rgba(239,68,68,0.06) 10px);' : ''}
                onclick={() => { currentDate = date; calendarView = 'day'; }}
                role="button" tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter') { currentDate = date; calendarView = 'day'; } }}
              >
                <div class="flex justify-end items-center gap-1">
                  {#if frozen}
                    <span class="text-[8px] font-bold text-red-500 uppercase tracking-wider" title={frozen.reason || 'Frozen'}>
                      <svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    </span>
                  {/if}
                  <span class="text-xs inline-flex items-center justify-center w-6 h-6 rounded-full
                    {isToday(date) ? 'bg-indigo-600 text-white font-bold' : isCurrentMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-slate-600'}">
                    {date.getDate()}
                  </span>
                </div>
                <div class="mt-0.5 space-y-px hidden sm:block">
                  {#each getEventsForDate(date).slice(0, 3) as event}
                    {@const style = getEventStyle(event)}
                    <div class="text-[10px] font-medium px-1.5 py-0.5 rounded truncate {style.bg} {style.text} border-l-2 {style.border}"
                      onclick={(e) => handleEventClick(e, event)}>
                      {event.title}
                    </div>
                  {/each}
                  {#if getEventsForDate(date).length > 3}
                    <p class="text-[10px] text-gray-400 font-medium pl-1">+{getEventsForDate(date).length - 3} more</p>
                  {/if}
                </div>
                <!-- Mobile: just show dot indicators -->
                {#if getEventsForDate(date).length > 0}
                  <div class="flex justify-center gap-0.5 mt-0.5 sm:hidden">
                    {#each getEventsForDate(date).slice(0, 4) as event}
                      {@const style = getEventStyle(event)}
                      <span class="w-1 h-1 rounded-full {style.dot || 'bg-indigo-500'}"></span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

      <!-- ════════════════════ WEEK VIEW ════════════════════ -->
      {:else if calendarView === 'week'}
        <div class="h-full flex flex-col bg-white dark:bg-slate-950">
          <!-- Sticky header row: gutter + 7 day columns -->
          <div class="flex-shrink-0 border-b border-gray-200 dark:border-slate-800">
            <div class="grid" style="grid-template-columns: 36px repeat(7, 1fr);">
              <div class="py-2 sm:py-3"></div>
              {#each weekDays as wd, i}
                {@const wdFrozen = isFrozenDate(wd)}
                <div class="py-1.5 sm:py-3 text-center {i < 6 ? 'border-r border-gray-100 dark:border-slate-800/50' : ''} {wdFrozen ? 'bg-red-50/60 dark:bg-red-950/20' : ''}">
                  <span class="text-[9px] sm:text-[11px] font-semibold tracking-wide uppercase {isToday(wd) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}">{shortDays[i]}</span>
                  {#if wdFrozen}
                    <div class="text-[7px] sm:text-[8px] font-bold text-red-500 mt-0.5 hidden sm:block">
                      <svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                      FROZEN
                    </div>
                  {/if}
                  <div class="mt-0.5 sm:mt-1">
                    {#if isToday(wd)}
                      <span class="inline-flex items-center justify-center w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white text-xs sm:text-lg font-medium">{wd.getDate()}</span>
                    {:else}
                      <span class="inline-flex items-center justify-center w-6 h-6 sm:w-10 sm:h-10 rounded-full text-xs sm:text-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer transition-colors" onclick={() => { currentDate = wd; calendarView = 'day'; }}>{wd.getDate()}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Scrollable time grid -->
          <div class="flex-1 overflow-y-auto" data-cal-scroll style="scroll-behavior: smooth;">
            <div class="grid" style="grid-template-columns: 36px repeat(7, 1fr); min-height: {totalGridH}px;">
              <!-- Time gutter -->
              <div class="relative">
                {#each hours as h, idx}
                  <div class="absolute w-full text-right pr-1 sm:pr-3 text-[8px] sm:text-[10px] font-medium select-none -translate-y-1/2
                    {isToday(today) && h === new Date().getHours() ? 'text-red-500 font-bold' : 'text-gray-400 dark:text-gray-500'}"
                    style="top: {idx * SLOT_H}px;">
                    {formatHour(h)}
                  </div>
                {/each}
              </div>

              <!-- 7 day columns -->
              {#each weekDays as wd, dayIdx}
                <div class="relative {dayIdx < 6 ? 'border-r border-gray-100 dark:border-slate-800/40' : ''} {isToday(wd) ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''} {isFrozenDate(wd) ? 'bg-red-50/30 dark:bg-red-950/10' : ''}"
                  style={isFrozenDate(wd) ? 'background-image: repeating-linear-gradient(135deg, transparent, transparent 12px, rgba(239,68,68,0.04) 12px, rgba(239,68,68,0.04) 14px);' : ''}>
                  <!-- Hourly grid lines -->
                  {#each hours as _, idx}
                    <div class="absolute left-0 right-0 border-t border-gray-200/60 dark:border-slate-700/30" style="top: {idx * SLOT_H}px;"></div>
                    <div class="absolute left-0 right-0 border-t border-dashed border-gray-100/80 dark:border-slate-800/20" style="top: {idx * SLOT_H + SLOT_H / 2}px;"></div>
                  {/each}

                  <!-- Click zones -->
                  {#each hours as h, idx}
                    <button class="absolute left-0 right-0 z-[1] hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors" style="top: {idx * SLOT_H}px; height: {SLOT_H}px;"
                      onclick={() => clickTimeSlot(wd, h)} tabindex="-1"></button>
                  {/each}

                  <!-- Current-time red line -->
                  {#if isToday(wd) && nowLineTop >= 0 && nowLineTop <= totalGridH}
                    <div class="absolute left-0 right-0 z-30 pointer-events-none" style="top: {nowLineTop}px;">
                      <div class="absolute -left-[5px] -top-[5px] w-[10px] h-[10px] rounded-full bg-red-500"></div>
                      <div class="h-[2px] bg-red-500 w-full"></div>
                    </div>
                  {/if}

                  <!-- Event chips (solid Google Calendar style) -->
                  {#each getEventsWithLayout(wd) as ev}
                    {@const t0 = (ev.startDate.getHours() - START_HOUR) * 60 + ev.startDate.getMinutes()}
                    {@const t1 = (ev.endDate.getHours()   - START_HOUR) * 60 + ev.endDate.getMinutes()}
                    {@const top = Math.max(t0 / 60 * SLOT_H, 0)}
                    {@const chipH = Math.max((t1 - t0) / 60 * SLOT_H, 22)}
                    {@const c = getChipColor(ev)}
                    {@const nc = ev._totalCols || 1}
                    {@const ci = ev._col || 0}
                    <button
                      class="absolute z-10 rounded-md overflow-hidden cursor-pointer text-white text-left group transition-all duration-100 hover:z-20 hover:brightness-90 hover:shadow-lg active:scale-[0.98]"
                      style="top:{top}px; height:{chipH}px; left:calc({ci/nc*100}% + 2px); width:calc({1/nc*100}% - 4px); background:{c.solid};"
                      onclick={(e) => handleEventClick(e, ev)}
                      tabindex="0"
                      onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (ev.eventType === 'task') openTaskDetail(ev); } }}
                    >
                      <div class="px-1.5 py-0.5 h-full flex flex-col justify-start">
                        <p class="text-[10px] font-semibold truncate leading-snug drop-shadow-sm">{ev.title}</p>
                        {#if chipH > 30}
                          <p class="text-[9px] opacity-80 truncate leading-snug">{formatTime(ev.startDate)}</p>
                        {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>

      <!-- ════════════════════ DAY VIEW ════════════════════ -->
      {:else if calendarView === 'day'}
        <div class="h-full flex flex-col bg-white dark:bg-slate-950">
          <!-- Day header -->
          <div class="flex-shrink-0 border-b border-gray-200 dark:border-slate-800 px-3 sm:px-6 py-2 sm:py-4">
            <div class="flex items-center gap-3 sm:gap-4">
              <div class="text-center">
                <span class="text-[10px] sm:text-[11px] font-semibold tracking-wide uppercase {isToday(currentDate) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}">{shortDays[currentDate.getDay()]}</span>
                <div class="mt-0.5 sm:mt-1">
                  {#if isToday(currentDate)}
                    <span class="inline-flex items-center justify-center w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-blue-600 text-white text-lg sm:text-2xl font-medium">{currentDate.getDate()}</span>
                  {:else}
                    <span class="text-2xl sm:text-4xl font-light text-gray-700 dark:text-gray-200">{currentDate.getDate()}</span>
                  {/if}
                </div>
              </div>
              <div class="border-l border-gray-200 dark:border-slate-700 pl-4">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</p>
                {#if isFrozenDate(currentDate)}
                  <div class="flex items-center gap-1.5 mt-1 px-2 py-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                    <svg class="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    <span class="text-xs font-bold text-red-600 dark:text-red-400 flex-1">FROZEN — {isFrozenDate(currentDate).reason || 'Calendar Freeze'}</span>
                    {#if canFreeze}
                      <button onclick={() => removeFreeze(isFrozenDate(currentDate).id)} class="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30" title="Remove freeze">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    {/if}
                  </div>
                {:else if getEventsForDate(currentDate).length > 0}
                  <p class="text-xs text-gray-400 mt-0.5">{getEventsForDate(currentDate).length} event{getEventsForDate(currentDate).length !== 1 ? 's' : ''} scheduled</p>
                {:else}
                  <p class="text-xs text-gray-400 mt-0.5">No events scheduled</p>
                {/if}
              </div>
            </div>
          </div>

          <!-- Scrollable time grid -->
          <div class="flex-1 overflow-y-auto" data-cal-scroll style="scroll-behavior: smooth;">
            <div class="grid" style="grid-template-columns: 40px 1fr; min-height: {totalGridH}px;">
              <!-- Time gutter -->
              <div class="relative border-r border-gray-200 dark:border-slate-800">
                {#each hours as h, idx}
                  <div class="absolute w-full text-right pr-1 sm:pr-3 text-[9px] sm:text-[11px] font-medium select-none -translate-y-1/2
                    {isToday(currentDate) && h === new Date().getHours() ? 'text-red-500 font-bold' : 'text-gray-400 dark:text-gray-500'}"
                    style="top: {idx * SLOT_H}px;">
                    {formatHour(h)}
                  </div>
                {/each}
              </div>

              <!-- Single day column -->
              <div class="relative">
                <!-- Hourly grid lines -->
                {#each hours as _, idx}
                  <div class="absolute left-0 right-0 border-t border-gray-200/60 dark:border-slate-700/30" style="top: {idx * SLOT_H}px;"></div>
                  <div class="absolute left-0 right-0 border-t border-dashed border-gray-100/80 dark:border-slate-800/20" style="top: {idx * SLOT_H + SLOT_H / 2}px;"></div>
                {/each}

                <!-- Click zones -->
                {#each hours as h, idx}
                  <button class="absolute left-0 right-0 z-[1] hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors" style="top: {idx * SLOT_H}px; height: {SLOT_H}px;"
                    onclick={() => clickTimeSlot(currentDate, h)} tabindex="-1"></button>
                {/each}

                <!-- Current time indicator -->
                {#if isToday(currentDate) && nowLineTop >= 0 && nowLineTop <= totalGridH}
                  <div class="absolute left-0 right-0 z-30 pointer-events-none" style="top: {nowLineTop}px;">
                    <div class="absolute -left-[6px] -top-[6px] w-[12px] h-[12px] rounded-full bg-red-500 shadow-md shadow-red-200"></div>
                    <div class="h-[2px] bg-red-500 w-full"></div>
                  </div>
                {/if}

                <!-- Event chips (solid, with more detail in day view) -->
                {#each getEventsWithLayout(currentDate) as ev}
                  {@const t0 = (ev.startDate.getHours() - START_HOUR) * 60 + ev.startDate.getMinutes()}
                  {@const t1 = (ev.endDate.getHours()   - START_HOUR) * 60 + ev.endDate.getMinutes()}
                  {@const top = Math.max(t0 / 60 * SLOT_H, 0)}
                  {@const chipH = Math.max((t1 - t0) / 60 * SLOT_H, 28)}
                  {@const c = getChipColor(ev)}
                  {@const nc = ev._totalCols || 1}
                  {@const ci = ev._col || 0}
                  <button
                    class="absolute z-10 rounded-lg overflow-hidden cursor-pointer text-white text-left group transition-all duration-100 hover:z-20 hover:brightness-90 hover:shadow-xl active:scale-[0.99]"
                    style="top:{top}px; height:{chipH}px; left:calc({ci/nc*100}% + 4px); width:calc({1/nc*100}% - 8px); background:{c.solid};"
                    onclick={(e) => handleEventClick(e, ev)}
                    tabindex="0"
                    onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (ev.eventType === 'task') openTaskDetail(ev); } }}
                  >
                    <div class="px-3 py-1.5 h-full flex flex-col justify-start">
                      <p class="text-sm font-semibold truncate drop-shadow-sm">{ev.title}</p>
                      {#if chipH > 36}
                        <p class="text-[11px] opacity-85 truncate">{formatTime(ev.startDate)} – {formatTime(ev.endDate)}</p>
                      {/if}
                      {#if ev.eventType === 'task' && ev.assignees?.length && chipH > 56}
                        <p class="text-[10px] opacity-70 mt-0.5 truncate">{ev.assignees.map((a: any) => a.name).join(', ')}</p>
                      {/if}
                      {#if ev.eventType === 'schedule' && chipH > 56}
                        <span class="text-[9px] font-bold uppercase opacity-70 mt-0.5">{ev.type}</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- CREATE TASK MODAL -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showTaskModal}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onclick={() => showTaskModal = false} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg sm:mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()} role="document" in:fly={{ y: 20, duration: 200 }}>
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">New Task</h3>
          <button onclick={() => showTaskModal = false} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="space-y-4">
          <input bind:value={taskForm.title} placeholder="Task title" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm font-medium dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
          <div>
            <textarea bind:value={taskForm.description} placeholder="Describe the task in detail — bullet points, numbered steps, or sentences. A checklist will be auto-generated from this description." rows="4"
              class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white focus:ring-2 ring-indigo-500 outline-none"></textarea>
            <p class="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Checklist items will be auto-generated from description. View tracking starts when assignees open this task.
            </p>
          </div>
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
          <!-- Assignees (grouped by university) -->
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Assign To</label>
            <!-- Selected badges -->
            {#if taskForm.assignee_ids.length > 0}
              <div class="flex flex-wrap gap-1.5 mb-2">
                {#each taskForm.assignee_ids as uid}
                  {@const u = allUsers.find((x: any) => x.id === uid)}
                  {#if u}
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold rounded-full">
                      {u.name}
                      <button onclick={() => { taskForm.assignee_ids = taskForm.assignee_ids.filter((id: string) => id !== uid); }} class="ml-0.5 hover:text-red-500">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </span>
                  {/if}
                {/each}
              </div>
            {/if}
            <!-- Search & filter bar -->
            <div class="flex gap-2 mb-2">
              <input bind:value={assigneeSearch} placeholder="Search by name, email..."
                class="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
              <select bind:value={assigneeFilterUniv}
                class="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white min-w-[120px]">
                <option value="">All Universities</option>
                {#each usersGroupedByUniv as g}
                  {#if g.univId !== '__none__'}
                    <option value={g.univId}>{g.univName}</option>
                  {/if}
                {/each}
              </select>
            </div>
            <!-- University-grouped user list -->
            <div class="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 divide-y divide-gray-100 dark:divide-slate-700/50">
              {#each filteredAssigneeUsers as group}
                <div>
                  <div class="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 sticky top-0 z-[1]">
                    <span class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{group.univName}</span>
                    <span class="text-[9px] text-gray-400 ml-1">({group.users.length})</span>
                  </div>
                  {#each group.users as user}
                    <button
                      onclick={() => {
                        if (taskForm.assignee_ids.includes(user.id)) {
                          taskForm.assignee_ids = taskForm.assignee_ids.filter((id: string) => id !== user.id);
                        } else {
                          taskForm.assignee_ids = [...taskForm.assignee_ids, user.id];
                        }
                      }}
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white dark:hover:bg-slate-700/50 transition-colors">
                      <div class="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all
                        {taskForm.assignee_ids.includes(user.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-slate-600'}">
                        {#if taskForm.assignee_ids.includes(user.id)}
                          <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                        {/if}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{user.name || user.email}</p>
                        <p class="text-[9px] text-gray-400 truncate">{user.role} {user.email ? `· ${user.email}` : ''}</p>
                      </div>
                    </button>
                  {/each}
                </div>
              {/each}
              {#if filteredAssigneeUsers.length === 0}
                <div class="px-3 py-4 text-xs text-gray-400 text-center">No users found</div>
              {/if}
            </div>
          </div>
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Estimated Time</label>
            <input bind:value={taskForm.estimated_time} placeholder="e.g. 2h, 30m" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button onclick={() => showTaskModal = false} class="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
          <button onclick={saveTask} disabled={isSaving} class="px-6 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {#if isSaving}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Creating & generating checklist...
            {:else}
              Create Task
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- CREATE EVENT MODAL (Enhanced — same options as tasks) -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showCreateEvent}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onclick={() => showCreateEvent = false} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg sm:mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()} role="document" in:fly={{ y: 20, duration: 200 }}>
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">New Event</h3>
          <button onclick={() => showCreateEvent = false} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="space-y-4">
          <input bind:value={eventForm.title} placeholder="Event title" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm font-medium dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
          <div>
            <textarea bind:value={eventForm.description} placeholder="Description — bullet points, steps, or SOP content. A checklist will be auto-generated." rows="3"
              class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white focus:ring-2 ring-indigo-500 outline-none"></textarea>
            <p class="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Checklist auto-generated from description. Upload SOP below for detailed analysis.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Type</label>
              <select bind:value={eventForm.type} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
                <option value="EVENT">Event</option>
                <option value="HOLIDAY">Holiday</option>
                <option value="EXAM">Exam</option>
                <option value="CURRICULAR">Curricular</option>
                <option value="CO_CURRICULAR">Co-Curricular</option>
                <option value="CLUB_ACTIVITY">Club Activity</option>
                <option value="CULTURAL_ACTIVITY">Cultural Activity</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Priority</label>
              <select bind:value={eventForm.priority} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Date</label>
              <input type="date" bind:value={createEventDate} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">University</label>
              <select bind:value={eventForm.university_id} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
                <option value="">Select University</option>
                {#each data.universities as univ}
                  <option value={univ.id}>{univ.name}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Start Time</label>
              <input type="time" bind:value={createEventStartTime} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
            <div>
              <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">End Time</label>
              <input type="time" bind:value={createEventEndTime} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            </div>
          </div>

          <!-- SOP Document Upload (View Only) -->
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Upload SOP Document (for viewing)</label>
            <div class="flex items-center gap-2">
              <input type="file" accept=".txt,.md,.csv,.doc,.docx,.pdf" onchange={(e) => { const target = e.target as HTMLInputElement; sopFile = target.files?.[0] || null; }}
                class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs dark:text-white file:mr-2 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-700 file:text-xs file:font-medium" />
            </div>
            {#if sopFile}
              <p class="text-[10px] text-blue-600 mt-1">Selected: {sopFile.name} — will be saved for viewing</p>
            {/if}
          </div>

          <!-- SOP Task Upload (Generate Checklist) -->
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Upload SOP Tasks (to generate checklist)</label>
            <div class="flex items-center gap-2">
              <input type="file" accept=".txt,.md,.csv,.doc,.docx,.pdf" onchange={(e) => { const target = e.target as HTMLInputElement; sopTaskFile = target.files?.[0] || null; }}
                class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs dark:text-white file:mr-2 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-emerald-100 file:text-emerald-700 file:text-xs file:font-medium" />
            </div>
            {#if sopTaskFile}
              <p class="text-[10px] text-emerald-600 mt-1">Selected: {sopTaskFile.name} — will be analyzed to generate checklist items</p>
            {/if}
          </div>

          <!-- Assign To (University-wise grouping) -->
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Assign To</label>
            <div class="flex gap-2 mb-2">
              <input bind:value={eventAssigneeSearch} placeholder="Search people..."
                class="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white" />
              <select bind:value={eventAssigneeFilterUniv}
                class="px-2 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white max-w-[140px]">
                <option value="">All Univs</option>
                {#each usersGroupedByUniv as g}
                  <option value={g.univId}>{g.univName}</option>
                {/each}
              </select>
            </div>
            {#if eventForm.assignee_ids.length > 0}
              <div class="flex flex-wrap gap-1.5 mb-2">
                {#each eventForm.assignee_ids as uid}
                  {#each allUsers.filter((u) => u.id === uid) as u}
                    <span class="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-[10px] font-medium">
                      {u.name || u.email}
                      <button onclick={() => eventForm.assignee_ids = eventForm.assignee_ids.filter(i => i !== uid)} class="hover:text-red-500">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </span>
                  {/each}
                {/each}
              </div>
            {/if}
            <div class="max-h-40 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-xl">
              {#each filteredEventAssigneeUsers as group}
                <div class="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase sticky top-0">{group.univName}</div>
                {#each group.users as u}
                  <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <input type="checkbox" checked={eventForm.assignee_ids.includes(u.id)}
                      onchange={() => {
                        if (eventForm.assignee_ids.includes(u.id)) eventForm.assignee_ids = eventForm.assignee_ids.filter(i => i !== u.id);
                        else eventForm.assignee_ids = [...eventForm.assignee_ids, u.id];
                      }}
                      class="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <span class="text-xs text-gray-700 dark:text-gray-300 flex-1">{u.name || u.email}</span>
                    <span class="text-[9px] text-gray-400">{u.role}</span>
                  </label>
                {/each}
              {/each}
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button onclick={() => showCreateEvent = false} class="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
          <button onclick={saveEvent} disabled={isSaving} class="px-6 py-2 text-sm font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- TASK DETAIL MODAL (Full Analytics) -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showTaskDetail && selectedTask}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onclick={closeTaskDetail} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl mx-0 sm:mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()} role="document" in:fly={{ y: 30, duration: 200 }}>
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
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-line">{selectedTask.description}</p>
            {/if}
          </div>
          <div class="flex gap-2 flex-shrink-0">
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
        <div class="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4 pb-4 border-b border-gray-100 dark:border-slate-800">
          {#if selectedTask.due_date}
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Due: {new Date(selectedTask.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{#if selectedTask.start_date}, {new Date(selectedTask.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {new Date(selectedTask.due_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{:else}, {new Date(selectedTask.due_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{/if}
            </span>
          {/if}
          {#if selectedTask.estimated_time}
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Est: {selectedTask.estimated_time}
            </span>
          {/if}
          {#if selectedTask.assignees?.length}
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              {selectedTask.assignees.map((a: any) => a.name).join(', ')}
            </span>
          {/if}
          {#if selectedTask.assigned_by_name}
            <span>By: {selectedTask.assigned_by_name}</span>
          {/if}
        </div>

        <!-- ═══ TASK TIMELINE & TRACKING ═══ -->
        {#if taskTimeline}
          <div class="mb-4 pb-4 border-b border-gray-100 dark:border-slate-800">
            <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Task Timeline & Tracking
            </h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div class="bg-gray-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 text-center">
                <p class="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Created</p>
                <p class="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{formatDateShort(taskTimeline.created)}</p>
              </div>
              <div class="bg-gray-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 text-center">
                <p class="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Started</p>
                <p class="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{taskTimeline.started ? formatDateShort(taskTimeline.started) : 'Not yet'}</p>
              </div>
              <div class="bg-gray-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5 text-center">
                <p class="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Completed</p>
                <p class="text-[11px] font-semibold {taskTimeline.completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}">
                  {taskTimeline.completed ? formatDateShort(taskTimeline.completed) : 'Not yet'}
                </p>
              </div>
              <div class="rounded-xl px-3 py-2.5 text-center {taskTimeline.isOverdue ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-slate-800/50'}">
                <p class="text-[9px] font-bold uppercase mb-0.5 {taskTimeline.isOverdue ? 'text-red-400' : 'text-gray-400'}">
                  {taskTimeline.completed ? 'Time Taken' : 'Elapsed'}
                </p>
                <p class="text-[11px] font-bold {taskTimeline.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}">
                  {taskTimeline.timeToComplete ? formatDuration(taskTimeline.timeToComplete) : formatDuration(taskTimeline.elapsedSinceCreated)}
                  {#if taskTimeline.isOverdue}
                    <span class="text-[9px]"> (OVERDUE)</span>
                  {/if}
                </p>
              </div>
            </div>
            {#if taskTimeline.timeToStart || taskTimeline.activeWorkTime}
              <div class="flex gap-4 mt-2 text-[10px] text-gray-400 px-1">
                {#if taskTimeline.timeToStart}
                  <span>Time to start: {formatDuration(taskTimeline.timeToStart)}</span>
                {/if}
                {#if taskTimeline.activeWorkTime}
                  <span>Active work time: {formatDuration(taskTimeline.activeWorkTime)}</span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <!-- ═══ CHECKLIST ═══ -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                Checklist
              </h4>
              {#if checklistProgress.total > 0}
                <span class="text-[10px] font-bold text-gray-400">{checklistProgress.completed}/{checklistProgress.total}</span>
                <div class="w-28 h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all {checklistProgress.percent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}" style="width: {checklistProgress.percent}%"></div>
                </div>
                <span class="text-[10px] font-bold {checklistProgress.percent === 100 ? 'text-emerald-500' : 'text-indigo-500'}">{checklistProgress.percent}%</span>
              {/if}
            </div>
            {#if selectedTask.description && checklistItems.length === 0}
              <button onclick={autoGenerateChecklist} class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Auto-generate from description
              </button>
            {/if}
          </div>
          {#if checklistItems.length === 0}
            <div class="text-center py-4 text-xs text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/30 rounded-xl">
              No checklist items yet.
              {#if selectedTask.description}
                Click "Auto-generate" to create from description.
              {/if}
            </div>
          {/if}
          <div class="space-y-1">
            {#each checklistItems as item}
              <div class="flex items-center gap-3 group px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <button onclick={() => toggleChecklistItem(item.id)}
                  class="w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all
                    {item.is_completed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 dark:border-slate-600 hover:border-indigo-400'}">
                  {#if item.is_completed}
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                  {/if}
                </button>
                <div class="flex-1 min-w-0">
                  <span class="text-sm block {item.is_completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}">{item.title}</span>
                  {#if item.is_completed && (item.completed_by_name || item.completed_at)}
                    <span class="text-[9px] text-gray-400">
                      {item.completed_by_name ? `by ${item.completed_by_name}` : ''}
                      {item.completed_at ? ` · ${new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                    </span>
                  {/if}
                </div>
                <button onclick={() => deleteChecklistItem(item.id)} class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            {/each}
          </div>
          <div class="flex gap-2 mt-2">
            <input bind:value={newChecklistTitle} placeholder="Add checklist item..." onkeydown={(e) => { if (e.key === 'Enter') addChecklistItem(); }}
              class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white focus:ring-2 ring-indigo-500 outline-none" />
            <button onclick={addChecklistItem} class="px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Add</button>
          </div>
        </div>

        <!-- ═══ NOTES ═══ -->
        <div class="mb-4 pb-4 border-t border-gray-100 dark:border-slate-800 pt-4">
          <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Notes
            {#if savingNotes}
              <span class="text-[10px] font-normal text-amber-500 animate-pulse">Saving...</span>
            {/if}
          </h4>
          <textarea
            value={taskNotes}
            oninput={(e) => saveNotes(e.currentTarget.value)}
            placeholder="Add notes, additional info, or context..."
            rows="4"
            class="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white focus:ring-2 ring-indigo-500 outline-none resize-y placeholder:text-gray-400"
          ></textarea>
        </div>

        <!-- ═══ ASSIGNEE PROGRESS ═══ -->
        {#if selectedTask.assignees?.length}
          <div class="mb-4 pb-4 border-t border-gray-100 dark:border-slate-800 pt-4">
            <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              Assignee Progress
            </h4>
            <div class="space-y-2">
              {#each selectedTask.assignees as assignee}
                <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/50">
                  <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                    {assignee.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{assignee.name}</p>
                    <div class="flex items-center gap-2 text-[10px] text-gray-400">
                      {#if assignee.started_at}
                        <span>Started: {new Date(assignee.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      {/if}
                      {#if assignee.completed_at}
                        <span>Done: {new Date(assignee.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      {/if}
                      {#if assignee.started_at && assignee.completed_at}
                        <span class="font-bold text-emerald-500">({formatDuration(Math.round((new Date(assignee.completed_at).getTime() - new Date(assignee.started_at).getTime()) / 1000))})</span>
                      {/if}
                    </div>
                  </div>
                  <span class="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full flex-shrink-0
                    {assignee.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                     assignee.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                     'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400'}">
                    {assignee.status || 'PENDING'}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- ═══ VIEW ANALYTICS (visible to all) ═══ -->
        <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
          <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            Who Viewed This Task
          </h4>
          {#if viewStats.length > 0}
            <!-- Summary stats -->
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="bg-blue-50 dark:bg-blue-900/10 rounded-lg px-3 py-2 text-center">
                <p class="text-lg font-bold text-blue-600 dark:text-blue-400">{viewStats.reduce((a: number, v: any) => a + parseInt(v.view_count || 0), 0)}</p>
                <p class="text-[9px] font-bold text-blue-400 uppercase">Total Views</p>
              </div>
              <div class="bg-violet-50 dark:bg-violet-900/10 rounded-lg px-3 py-2 text-center">
                <p class="text-lg font-bold text-violet-600 dark:text-violet-400">{viewStats.length}</p>
                <p class="text-[9px] font-bold text-violet-400 uppercase">Unique Viewers</p>
              </div>
              <div class="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg px-3 py-2 text-center">
                <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatDuration(viewStats.reduce((a: number, v: any) => a + parseInt(v.total_duration_seconds || 0), 0))}</p>
                <p class="text-[9px] font-bold text-emerald-400 uppercase">Total Time Spent</p>
              </div>
            </div>
            <!-- Per-user breakdown -->
            <div class="space-y-1.5">
              {#each viewStats as vs}
                <div class="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/50">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
                    {vs.user_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">{vs.user_name}</p>
                    <p class="text-[10px] text-gray-400 truncate">{vs.user_email}</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-sm font-bold text-blue-600 dark:text-blue-400">{vs.view_count}<span class="text-[10px] font-normal text-gray-400 ml-0.5">view{parseInt(vs.view_count) > 1 ? 's' : ''}</span></p>
                    <p class="text-[10px] text-gray-400">
                      {formatDuration(parseInt(vs.total_duration_seconds || '0'))} spent
                    </p>
                  </div>
                  <div class="text-right flex-shrink-0 text-[10px] text-gray-400 ml-2 leading-relaxed">
                    {#if vs.first_viewed_at}
                      <p>First: {formatDateShort(new Date(vs.first_viewed_at))}</p>
                    {/if}
                    {#if vs.last_viewed_at}
                      <p>Last: {formatDateShort(new Date(vs.last_viewed_at))}</p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-6 text-gray-400 dark:text-gray-500">
              <svg class="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              <p class="text-xs">No one has viewed this task yet</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- EVENT DETAIL MODAL (with Checklist, View Tracking, SOP Docs, Delete) -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showEventDetail && selectedEvent}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onclick={closeEventDetail} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl mx-0 sm:mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()} role="document" in:fly={{ y: 30, duration: 200 }}>
      <div class="p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full" style="background:{getChipColor(selectedEvent).solid}; color:white;">
                {selectedEvent.type?.replace(/_/g, ' ')}
              </span>
              {#if selectedEvent.priority && selectedEvent.priority !== 'MEDIUM'}
                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full
                  {selectedEvent.priority === 'URGENT' ? 'bg-red-100 text-red-700' : selectedEvent.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
                  {selectedEvent.priority}
                </span>
              {/if}
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">{selectedEvent.title}</h3>
            {#if selectedEvent.description}
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedEvent.description}</p>
            {/if}
            <p class="text-xs text-gray-400 mt-2">{new Date(selectedEvent.start_date || selectedEvent.startDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div class="flex items-center gap-2 ml-4">
            <button onclick={() => deleteEventUI(selectedEvent.id)} class="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600" title="Delete event">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
            <button onclick={closeEventDetail} class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Assignees -->
        {#if selectedEvent.assignees?.length > 0}
          <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Assigned To</h4>
            <div class="flex flex-wrap gap-2">
              {#each selectedEvent.assignees as a}
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                  <span class="w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-[9px] font-bold">{a.name?.[0]?.toUpperCase() || '?'}</span>
                  {a.name || a.email}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Checklist -->
        <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              Checklist
              {#if eventChecklistProgress.total > 0}
                <span class="text-[10px] font-normal text-gray-400">{eventChecklistProgress.completed}/{eventChecklistProgress.total} ({eventChecklistProgress.percent}%)</span>
              {/if}
            </h4>
          </div>
          {#if eventChecklistProgress.total > 0}
            <div class="w-full h-2 bg-gray-100 dark:bg-slate-800 rounded-full mb-3 overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: {eventChecklistProgress.percent}%"></div>
            </div>
          {/if}
          <div class="space-y-1 max-h-[400px] overflow-y-auto pr-1">
            {#each groupChecklistItems(eventChecklistItems) as group}
              {#if group.section}
                <div class="flex items-center gap-2 pt-3 pb-1 px-1 first:pt-0">
                  <span class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{group.section}</span>
                  <div class="flex-1 h-px bg-indigo-100 dark:bg-indigo-900/30"></div>
                  <span class="text-[9px] text-gray-400">{group.items.filter((i: any) => i.is_completed).length}/{group.items.length}</span>
                </div>
              {/if}
              {#each group.items as item}
                <div class="flex items-start gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/50 group hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                  <button onclick={() => toggleEventChecklistItem(item.id)}
                    class="w-5 h-5 mt-0.5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors
                      {item.is_completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-slate-600 hover:border-emerald-400'}">
                    {#if item.is_completed}
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                    {/if}
                  </button>
                  <div class="flex-1 min-w-0">
                    {#if item._taskName && item._taskDesc}
                      <p class="text-sm font-medium {item.is_completed ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}">{item._taskName}</p>
                      <p class="text-xs {item.is_completed ? 'line-through text-gray-300' : 'text-gray-500 dark:text-gray-400'} mt-0.5">{item._taskDesc}</p>
                    {:else}
                      <p class="text-sm {item.is_completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}">{item._displayTitle}</p>
                    {/if}
                    {#if item.completed_by_name || item.completed_at}
                      <div class="flex items-center gap-2 mt-1">
                        {#if item.completed_by_name}
                          <span class="text-[9px] text-gray-400">{item.completed_by_name}</span>
                        {/if}
                        {#if item.completed_at}
                          <span class="text-[9px] text-emerald-500">{new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  <button onclick={() => deleteEventChecklistItemUI(item.id)} class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity mt-0.5">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              {/each}
            {/each}
          </div>
          <div class="flex gap-2 mt-2">
            <input bind:value={newEventChecklistTitle} placeholder="Add checklist item..."
              onkeydown={(e) => { if (e.key === 'Enter') addEventChecklistItemUI(); }}
              class="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white" />
            <button onclick={addEventChecklistItemUI} class="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">Add</button>
          </div>
        </div>

        <!-- SOP Documents (View Only) -->
        <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
          <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            SOP Documents
          </h4>
          {#if eventSOPDocs.length > 0}
            <div class="space-y-1.5 mb-3">
              {#each eventSOPDocs as doc}
                <div class="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-xs group">
                  <svg class="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  <button onclick={() => { viewingSOPDoc = doc; }}
                    class="flex-1 font-medium text-gray-700 dark:text-gray-300 truncate hover:text-blue-600 dark:hover:text-blue-400 text-left cursor-pointer">{doc.filename}</button>
                  <span class="text-gray-400 text-[10px]">{doc.uploaded_by_name || 'Unknown'}</span>
                  <span class="text-gray-400 text-[10px]">{new Date(doc.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <button onclick={() => { viewingSOPDoc = doc; }} title="View"
                    class="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors">
                    <svg class="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  </button>
                  <button onclick={() => downloadSOPDoc(doc)} title="Download"
                    class="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded transition-colors">
                    <svg class="w-3.5 h-3.5 text-gray-400 hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  </button>
                  <button onclick={() => deleteSOPDocUI(doc.id)} title="Delete"
                    class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors">
                    <svg class="w-3.5 h-3.5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          <div class="flex items-center gap-2">
            <input type="file" accept=".txt,.md,.csv,.doc,.docx,.pdf" onchange={(e) => { const target = e.target as HTMLInputElement; sopFile = target.files?.[0] || null; }}
              class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs dark:text-white file:mr-2 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-700 file:text-xs file:font-medium" />
            <button onclick={uploadSOPDocView} disabled={!sopFile}
              class="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              Upload Doc
            </button>
          </div>
          <p class="text-[9px] text-gray-400 mt-1">Upload SOP documents for team members to view. Click any document above to read it.</p>
        </div>

        <!-- SOP Task Upload (Generate Checklist) -->
        <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
          <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
            Generate Checklist from SOP
          </h4>
          <div class="flex items-center gap-2">
            <input type="file" accept=".txt,.md,.csv,.doc,.docx,.pdf" onchange={(e) => { const target = e.target as HTMLInputElement; sopTaskFile = target.files?.[0] || null; }}
              class="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs dark:text-white file:mr-2 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-emerald-100 file:text-emerald-700 file:text-xs file:font-medium" />
            <button onclick={uploadSOPTaskDoc} disabled={!sopTaskFile}
              class="px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              Generate
            </button>
          </div>
          <p class="text-[9px] text-gray-400 mt-1">Upload a task/checklist document to auto-generate checklist items and messages from it.</p>
        </div>

        <!-- Messages (Communication Tasks) -->
        <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
          <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            Messages
            {#if eventMessages.length > 0}
              <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold">
                {eventMessages.filter((m: any) => m.is_sent).length}/{eventMessages.length} sent
              </span>
            {/if}
          </h4>
          {#if eventMessages.length > 0}
            <div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {#each eventMessages as msg}
                <div class="rounded-xl border {msg.is_sent ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'} overflow-hidden">
                  <div class="flex items-center gap-2 px-3 py-2">
                    <button onclick={() => toggleMessageSent(msg.id)}
                      class="w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all {msg.is_sent ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-slate-600 hover:border-emerald-400'}">
                      {#if msg.is_sent}
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                      {/if}
                    </button>
                    <span class="flex-1 text-xs font-semibold {msg.is_sent ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-gray-800 dark:text-gray-200'}">{msg.title}</span>
                    <button onclick={() => { viewingMessage = viewingMessage?.id === msg.id ? null : msg; }}
                      class="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors" title="Expand">
                      <svg class="w-3.5 h-3.5 text-gray-400 transition-transform {viewingMessage?.id === msg.id ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <button onclick={() => copyMessageContent(msg.content)} title="Copy message"
                      class="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors">
                      <svg class="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    </button>
                    <button onclick={() => deleteMessageUI(msg.id)} title="Delete"
                      class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100">
                      <svg class="w-3.5 h-3.5 text-gray-400 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                  {#if msg.is_sent && (msg.sent_by_name || msg.sent_at)}
                    <div class="px-3 pb-1">
                      <span class="text-[9px] text-emerald-600 dark:text-emerald-400">
                        Sent {msg.sent_by_name ? `by ${msg.sent_by_name}` : ''}
                        {msg.sent_at ? ` · ${new Date(msg.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                      </span>
                    </div>
                  {/if}
                  {#if viewingMessage?.id === msg.id}
                    <div class="px-3 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50">
                      <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-sans leading-relaxed">{msg.content}</pre>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-gray-400 italic">No messages yet. Upload an SOP with a "Messages" section to auto-extract them.</p>
          {/if}
        </div>

        <!-- View Analytics -->
        <div class="border-t border-gray-100 dark:border-slate-800 pt-4">
          <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            Who Viewed This Event
          </h4>
          {#if eventViewStats.length > 0}
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="bg-blue-50 dark:bg-blue-900/10 rounded-lg px-3 py-2 text-center">
                <p class="text-lg font-bold text-blue-600 dark:text-blue-400">{eventViewStats.reduce((a, v) => a + parseInt(v.view_count || 0), 0)}</p>
                <p class="text-[9px] font-bold text-blue-400 uppercase">Total Views</p>
              </div>
              <div class="bg-violet-50 dark:bg-violet-900/10 rounded-lg px-3 py-2 text-center">
                <p class="text-lg font-bold text-violet-600 dark:text-violet-400">{eventViewStats.length}</p>
                <p class="text-[9px] font-bold text-violet-400 uppercase">Unique Viewers</p>
              </div>
              <div class="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg px-3 py-2 text-center">
                <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatDuration(eventViewStats.reduce((a, v) => a + parseInt(v.total_duration_seconds || 0), 0))}</p>
                <p class="text-[9px] font-bold text-emerald-400 uppercase">Total Time</p>
              </div>
            </div>
            <div class="space-y-1.5">
              {#each eventViewStats as vs}
                <div class="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800/50">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
                    {vs.user_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">{vs.user_name}</p>
                    <p class="text-[10px] text-gray-400 truncate">{vs.user_email}</p>
                  </div>
                  <div class="text-right flex-shrink-0">
                    <p class="text-sm font-bold text-blue-600 dark:text-blue-400">{vs.view_count}<span class="text-[10px] font-normal text-gray-400 ml-0.5">view{parseInt(vs.view_count) > 1 ? 's' : ''}</span></p>
                    <p class="text-[10px] text-gray-400">{formatDuration(parseInt(vs.total_duration_seconds || '0'))} spent</p>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-6 text-gray-400 dark:text-gray-500">
              <svg class="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              <p class="text-xs">No one has viewed this event yet</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════ -->
<!-- CALENDAR FREEZE MODAL -->
<!-- ═══════════════════════════════════════════════════════════════════════════ -->
{#if showFreezeModal}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onclick={() => showFreezeModal = false} role="dialog" in:fade={{ duration: 150 }}>
    <div class="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md sm:mx-4 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      onclick={(e) => e.stopPropagation()} role="document" in:fly={{ y: 20, duration: 200 }}>
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Freeze Calendar Dates</h3>
          </div>
          <button onclick={() => showFreezeModal = false} class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">Freeze dates to notify the Student Engagement team about exams, holidays, or blocked periods. They will be able to see these and plan events accordingly.</p>
        <div class="space-y-4">
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">University</label>
            <select bind:value={freezeUniversityId} class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white">
              <option value="">Select University</option>
              {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Reason</label>
            <input bind:value={freezeReason} placeholder="e.g. Mid-semester exams, University holiday..."
              class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
          </div>
          <div>
            <label class="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Select Dates to Freeze</label>
            <input type="date"
              onchange={(e) => { const v = (e.target as HTMLInputElement).value; if (v && !freezeDates.includes(v)) freezeDates = [...freezeDates, v]; (e.target as HTMLInputElement).value = ''; }}
              class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm dark:text-white" />
            {#if freezeDates.length > 0}
              <div class="flex flex-wrap gap-1.5 mt-2">
                {#each freezeDates as fd}
                  <span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-[10px] font-medium">
                    {new Date(fd + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                    <button onclick={() => freezeDates = freezeDates.filter(d => d !== fd)} class="hover:text-red-500">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button onclick={() => showFreezeModal = false} class="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">Cancel</button>
          <button onclick={submitFreeze} disabled={isSaving || freezeDates.length === 0} class="px-6 py-2 text-sm font-bold rounded-xl bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50">
            {isSaving ? 'Freezing...' : `Freeze ${freezeDates.length} Date${freezeDates.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if viewingSOPDoc}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center sm:p-4" onclick={() => viewingSOPDoc = null}>
    <div class="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[90vh] sm:max-h-[85vh] flex flex-col" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          <div>
            <h3 class="text-sm font-bold text-gray-800 dark:text-white">{viewingSOPDoc.filename}</h3>
            <p class="text-[10px] text-gray-400">Uploaded by {viewingSOPDoc.uploaded_by_name || 'Unknown'} on {new Date(viewingSOPDoc.uploaded_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button onclick={() => downloadSOPDoc(viewingSOPDoc)} title="Download" class="p-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors">
            <svg class="w-5 h-5 text-gray-400 hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </button>
          <button onclick={() => viewingSOPDoc = null} class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-6 py-4">
        {#if viewingSOPDoc.content_html}
          <div class="sop-doc-viewer text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {@html viewingSOPDoc.content_html}
          </div>
        {:else}
          <pre class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{viewingSOPDoc.content_text || 'No content available.'}</pre>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.sop-doc-viewer h1) { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; }
  :global(.sop-doc-viewer h2) { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; }
  :global(.sop-doc-viewer h3) { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.4rem; }
  :global(.sop-doc-viewer h4, .sop-doc-viewer h5, .sop-doc-viewer h6) { font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0.3rem; }
  :global(.sop-doc-viewer p) { margin: 0.4rem 0; }
  :global(.sop-doc-viewer ul, .sop-doc-viewer ol) { padding-left: 1.5rem; margin: 0.4rem 0; }
  :global(.sop-doc-viewer li) { margin: 0.2rem 0; }
  :global(.sop-doc-viewer table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.8rem;
  }
  :global(.sop-doc-viewer th) {
    background: #f1f5f9;
    font-weight: 700;
    text-align: left;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e2e8f0;
  }
  :global(.sop-doc-viewer td) {
    padding: 0.5rem 0.75rem;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }
  :global(.sop-doc-viewer tr:nth-child(even)) { background: #f8fafc; }
  :global(.dark .sop-doc-viewer th) { background: #1e293b; border-color: #334155; }
  :global(.dark .sop-doc-viewer td) { border-color: #334155; }
  :global(.dark .sop-doc-viewer tr:nth-child(even)) { background: #0f172a; }
  :global(.sop-doc-viewer strong, .sop-doc-viewer b) { font-weight: 700; }
  :global(.sop-doc-viewer em, .sop-doc-viewer i) { font-style: italic; }
</style>
