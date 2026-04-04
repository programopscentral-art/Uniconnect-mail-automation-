<script lang="ts">
  import { untrack } from 'svelte';
  // @ts-ignore
  let { data } = $props();

  // --- State ---
  let selectedUniversityId = $state<string>('ALL');
  let dateRange = $state<string>('30d');
  let customFrom = $state('');
  let customTo = $state('');
  let isLoading = $state(true);
  let teamData = $state<any[]>([]);
  let universities = $state<any[]>([]);

  // User drill-down
  let selectedUserId = $state<string | null>(null);
  let userDetail = $state<any>(null);
  let isLoadingDetail = $state(false);

  // Computed date range
  let dateFrom = $derived.by(() => {
    if (dateRange === 'custom') return customFrom;
    const d = new Date();
    if (dateRange === '7d') d.setDate(d.getDate() - 7);
    else if (dateRange === '30d') d.setDate(d.getDate() - 30);
    else if (dateRange === '90d') d.setDate(d.getDate() - 90);
    else return ''; // all time
    return d.toISOString().split('T')[0];
  });
  let dateTo = $derived(dateRange === 'custom' ? customTo : new Date().toISOString().split('T')[0]);

  // Gemini AI insights
  let aiInsights = $state<string>('');
  let isLoadingAI = $state(false);

  // ─── Tab navigation ───────────────────────────────────────────
  let activeTab = $state('team');
  const analyticsTabs = [
    { id: 'team', label: 'Team Overview', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 'task-patterns', label: 'Task Patterns', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'peer-comparison', label: 'Peer Compare', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { id: 'university-rankings', label: 'Rankings', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
    { id: 'event-intelligence', label: 'Event Intel', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'ask-ai', label: 'Ask AI', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  ];

  // ─── Phase 3/4 State ───────────────────────────────────────────
  let analyticsViewData = $state<any>(null);
  let analyticsViewLoading = $state(false);

  // NLQ (Ask AI)
  let nlqQuestion = $state('');
  let nlqAnswer = $state('');
  let nlqQuery = $state('');
  let nlqData = $state<any[]>([]);
  let nlqLoading = $state(false);
  let nlqShowQuery = $state(false);

  // Event Intelligence
  let eventIntelAI = $state('');
  let eventIntelAILoading = $state(false);

  // ─── Phase 3/4 Data Loaders ────────────────────────────────────
  async function loadAnalyticsView(view: string) {
    if (view === 'team' || view === 'ask-ai') return;
    analyticsViewLoading = true;
    analyticsViewData = null;
    try {
      const today = new Date().toISOString().split('T')[0];
      const params = new URLSearchParams({
        view,
        date: today,
        dateRange: '30d'
      });
      const res = await fetch(`/api/ops?${params}`);
      if (res.ok) {
        analyticsViewData = await res.json();
      }
    } catch (e) {
      console.error('[ANALYTICS] View load error:', e);
    } finally {
      analyticsViewLoading = false;
    }
  }

  async function askAI() {
    if (!nlqQuestion.trim() || nlqLoading) return;
    nlqLoading = true;
    nlqAnswer = '';
    nlqQuery = '';
    nlqData = [];
    try {
      const res = await fetch('/api/ops/nlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: nlqQuestion })
      });
      const result = await res.json();
      nlqAnswer = result.answer || 'No answer available.';
      nlqQuery = result.query || '';
      nlqData = result.data || [];
    } catch (e: any) {
      nlqAnswer = `Error: ${e.message}`;
    } finally {
      nlqLoading = false;
    }
  }

  async function loadEventIntelAI() {
    if (!analyticsViewData || eventIntelAILoading) return;
    eventIntelAILoading = true;
    eventIntelAI = '';
    try {
      const res = await fetch('/api/ops/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'event-budget', data: analyticsViewData })
      });
      const result = await res.json();
      eventIntelAI = result.insights || 'No insights available.';
    } catch { eventIntelAI = 'Failed to load AI insights.'; }
    finally { eventIntelAILoading = false; }
  }

  function switchTab(tabId: string) {
    activeTab = tabId;
    if (tabId !== 'team' && tabId !== 'ask-ai') {
      loadAnalyticsView(tabId);
    }
  }

  // --- Load team data ---
  async function loadTeam() {
    isLoading = true;
    try {
      const params = new URLSearchParams();
      if (selectedUniversityId !== 'ALL') params.set('universityId', selectedUniversityId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/analytics?${params}`);
      if (res.ok) {
        const result = await res.json();
        teamData = result.team || [];
        if (result.universities?.length) {
          universities = result.universities;
        }
      }
    } catch (e) {
      console.error('[ANALYTICS] Load error:', e);
    } finally {
      isLoading = false;
    }
  }

  // --- Load user detail ---
  async function loadUserDetail(userId: string) {
    isLoadingDetail = true;
    try {
      const params = new URLSearchParams({ userId });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/analytics/users?${params}`);
      if (res.ok) {
        userDetail = await res.json();
      }
    } catch (e) {
      console.error('[ANALYTICS] User detail error:', e);
    } finally {
      isLoadingDetail = false;
    }
  }

  // --- Load Gemini AI insights ---
  async function loadAIInsights() {
    if (isLoadingAI) return;
    isLoadingAI = true;
    aiInsights = '';
    try {
      const payload: any = {};
      if (selectedUserId && userDetail) {
        payload.mode = 'user';
        payload.user = userDetail.user;
        payload.stats = userDetail.stats;
        payload.task_types = userDetail.task_types;
        payload.priority_breakdown = userDetail.priority_breakdown;
        payload.weekly_trend = userDetail.weekly_trend;
        payload.communication_tasks = userDetail.communication_tasks;
      } else {
        payload.mode = 'team';
        payload.team = teamData.map(m => ({
          name: m.name, role: m.role, university_name: m.university_name,
          total_assigned: m.total_assigned, total_completed: m.total_completed,
          total_in_progress: m.total_in_progress, total_overdue: m.total_overdue,
          avg_completion_hours: m.avg_completion_hours, current_streak: m.current_streak,
          tasks_completed_on_time: m.tasks_completed_on_time, tasks_completed_late: m.tasks_completed_late,
        }));
      }
      payload.dateRange = dateRange;
      payload.universityFilter = selectedUniversityId;

      const res = await fetch('/api/analytics/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        aiInsights = result.insights || 'No insights generated.';
      } else {
        const errData = await res.json().catch(() => null);
        aiInsights = `Error: ${errData?.message || res.statusText || 'Failed to generate report'}. Please try again.`;
      }
    } catch (e) {
      console.error('[ANALYTICS] AI error:', e);
      aiInsights = 'Failed to load AI insights. Please try again.';
    } finally {
      isLoadingAI = false;
    }
  }

  // --- Reload everything (called on filter change) ---
  function reloadAll() {
    loadTeam();
    if (selectedUserId) {
      loadUserDetail(selectedUserId);
    }
    aiInsights = ''; // clear stale AI insights
  }

  // Reactive load — tracks dateFrom/dateTo/university so it re-runs on any change
  $effect(() => {
    const _u = selectedUniversityId;
    const _df = dateFrom;
    const _dt = dateTo;
    untrack(() => { loadTeam(); });
  });

  // Auto-load for non-admins (self view)
  $effect(() => {
    if (!data.isGlobalOps && !selectedUserId) {
      selectedUserId = data.user.id;
      untrack(() => { loadUserDetail(data.user.id); });
    }
  });

  // Reload user detail when selected user changes
  $effect(() => {
    const uid = selectedUserId;
    if (uid) {
      untrack(() => { loadUserDetail(uid); });
    }
  });

  function selectUser(userId: string) {
    if (selectedUserId === userId) {
      if (data.isGlobalOps) { selectedUserId = null; userDetail = null; }
    } else {
      selectedUserId = userId;
    }
  }

  function goBack() { selectedUserId = null; userDetail = null; }

  // --- Computed ---
  let totalCompleted = $derived(teamData.reduce((s, u) => s + parseInt(u.total_completed || 0), 0));
  let totalAssigned = $derived(teamData.reduce((s, u) => s + parseInt(u.total_assigned || 0), 0));
  let totalOverdue = $derived(teamData.reduce((s, u) => s + parseInt(u.total_overdue || 0), 0));
  let totalInProgress = $derived(teamData.reduce((s, u) => s + parseInt(u.total_in_progress || 0), 0));
  let avgSpeed = $derived.by(() => {
    const withSpeed = teamData.filter(u => parseFloat(u.avg_completion_hours) > 0);
    if (!withSpeed.length) return 0;
    return withSpeed.reduce((s, u) => s + parseFloat(u.avg_completion_hours), 0) / withSpeed.length;
  });
  let totalOnTime = $derived(teamData.reduce((s, u) => s + parseInt(u.tasks_completed_on_time || 0), 0));
  let teamEfficiency = $derived(totalAssigned > 0 ? Math.round((totalOnTime / totalAssigned) * 100) : 0);

  // Helpers
  function getRating(completed: number, total: number) {
    if (total === 0) return { letter: '-', color: 'from-gray-400 to-gray-500', ring: 'ring-gray-200 dark:ring-gray-700' };
    const pct = (completed / total) * 100;
    if (pct >= 90) return { letter: 'S', color: 'from-amber-400 to-amber-600', ring: 'ring-amber-200 dark:ring-amber-800' };
    if (pct >= 75) return { letter: 'A', color: 'from-emerald-400 to-emerald-600', ring: 'ring-emerald-200 dark:ring-emerald-800' };
    if (pct >= 50) return { letter: 'B', color: 'from-blue-400 to-blue-600', ring: 'ring-blue-200 dark:ring-blue-800' };
    return { letter: 'C', color: 'from-gray-400 to-gray-600', ring: 'ring-gray-200 dark:ring-gray-700' };
  }

  function formatHours(h: number) {
    if (!h || h <= 0) return '-';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
  }

  function getPresenceColor(status: string) {
    if (status === 'ONLINE') return 'bg-green-500';
    if (status === 'BUSY') return 'bg-red-500';
    if (status === 'AWAY') return 'bg-amber-500';
    return 'bg-gray-400';
  }

  function getRankBadge(index: number) {
    if (index === 0) return { emoji: '1st', bg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
    if (index === 1) return { emoji: '2nd', bg: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' };
    if (index === 2) return { emoji: '3rd', bg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' };
    return null;
  }

  // --- Smart Insights (computed from data) ---
  let teamInsights = $derived.by(() => {
    if (!teamData.length) return [];
    const insights: { icon: string; title: string; detail: string; type: 'success' | 'warning' | 'info' | 'tip' }[] = [];

    // Top performer
    const topPerformer = teamData.reduce((best, m) => {
      const pct = parseInt(m.total_assigned) > 0 ? parseInt(m.total_completed) / parseInt(m.total_assigned) : 0;
      const bestPct = parseInt(best.total_assigned) > 0 ? parseInt(best.total_completed) / parseInt(best.total_assigned) : 0;
      return pct > bestPct ? m : best;
    }, teamData[0]);
    if (topPerformer && parseInt(topPerformer.total_completed) > 0) {
      const pct = Math.round((parseInt(topPerformer.total_completed) / parseInt(topPerformer.total_assigned)) * 100);
      insights.push({ icon: 'trophy', title: 'Top Performer', detail: `${topPerformer.name} leads with ${pct}% completion rate (${topPerformer.total_completed} tasks done)`, type: 'success' });
    }

    // Fastest worker
    const fastest = teamData.filter(m => parseFloat(m.avg_completion_hours) > 0).sort((a, b) => parseFloat(a.avg_completion_hours) - parseFloat(b.avg_completion_hours))[0];
    if (fastest) {
      insights.push({ icon: 'bolt', title: 'Speed Champion', detail: `${fastest.name} has the fastest avg completion time of ${formatHours(parseFloat(fastest.avg_completion_hours))}`, type: 'info' });
    }

    // Overdue alert
    if (totalOverdue > 0) {
      const overdueMembers = teamData.filter(m => parseInt(m.total_overdue) > 0).map(m => m.name).slice(0, 3);
      insights.push({ icon: 'alert', title: 'Overdue Tasks Alert', detail: `${totalOverdue} tasks are overdue. Affected: ${overdueMembers.join(', ')}${teamData.filter(m => parseInt(m.total_overdue) > 0).length > 3 ? '...' : ''}`, type: 'warning' });
    }

    // Workload imbalance
    const assignments = teamData.map(m => parseInt(m.total_assigned) || 0);
    const maxLoad = Math.max(...assignments);
    const minLoad = Math.min(...assignments);
    if (maxLoad > 0 && minLoad >= 0 && (maxLoad - minLoad) > maxLoad * 0.5 && teamData.length > 1) {
      const overloaded = teamData.find(m => parseInt(m.total_assigned) === maxLoad);
      const underloaded = teamData.find(m => parseInt(m.total_assigned) === minLoad);
      insights.push({ icon: 'balance', title: 'Workload Imbalance', detail: `${overloaded?.name} has ${maxLoad} tasks while ${underloaded?.name} has ${minLoad}. Consider redistributing.`, type: 'tip' });
    }

    // Team efficiency insight
    if (teamEfficiency >= 80) {
      insights.push({ icon: 'star', title: 'Great Team Performance', detail: `Team efficiency is at ${teamEfficiency}%. The team is performing above expectations.`, type: 'success' });
    } else if (teamEfficiency < 50 && totalAssigned > 0) {
      insights.push({ icon: 'trending-down', title: 'Efficiency Below Target', detail: `Team efficiency is at ${teamEfficiency}%. Consider reviewing task priorities and blockers.`, type: 'warning' });
    }

    // Streak highlight
    const streakLeader = teamData.filter(m => parseInt(m.current_streak) > 0).sort((a, b) => parseInt(b.current_streak) - parseInt(a.current_streak))[0];
    if (streakLeader && parseInt(streakLeader.current_streak) >= 3) {
      insights.push({ icon: 'fire', title: 'Hot Streak', detail: `${streakLeader.name} is on a ${streakLeader.current_streak}-day completion streak!`, type: 'success' });
    }

    return insights;
  });

  let userInsights = $derived.by(() => {
    if (!userDetail) return [];
    const s = userDetail.stats;
    const insights: { icon: string; title: string; detail: string; type: 'success' | 'warning' | 'info' | 'tip' }[] = [];

    const eff = s.total_assigned > 0 ? Math.round((s.total_completed / s.total_assigned) * 100) : 0;

    // Performance summary
    if (eff >= 90) {
      insights.push({ icon: 'star', title: 'Outstanding Performance', detail: `${eff}% completion rate. Keep up the excellent work!`, type: 'success' });
    } else if (eff >= 70) {
      insights.push({ icon: 'thumbs-up', title: 'Good Progress', detail: `${eff}% completion rate. ${s.total_assigned - s.total_completed} tasks remaining to reach full completion.`, type: 'info' });
    } else if (s.total_assigned > 0) {
      insights.push({ icon: 'alert', title: 'Needs Attention', detail: `Only ${eff}% completion rate. ${s.total_in_progress} tasks in progress, ${s.total_pending} pending.`, type: 'warning' });
    }

    // Speed analysis
    if (s.avg_completion_hours > 0 && s.avg_completion_hours < 24) {
      insights.push({ icon: 'bolt', title: 'Quick Turnaround', detail: `Average task completion in ${formatHours(s.avg_completion_hours)}. Fastest was ${formatHours(s.fastest_completion_hours)}.`, type: 'success' });
    } else if (s.avg_completion_hours >= 72) {
      insights.push({ icon: 'clock', title: 'Slow Completion Time', detail: `Avg ${formatHours(s.avg_completion_hours)} per task. Consider breaking large tasks into smaller ones.`, type: 'tip' });
    }

    // On-time analysis
    if (s.on_time + s.late > 0) {
      const otPct = Math.round((s.on_time / (s.on_time + s.late)) * 100);
      if (otPct >= 90) {
        insights.push({ icon: 'clock-check', title: 'Excellent Timeliness', detail: `${otPct}% of tasks completed on time (${s.on_time} on time, ${s.late} late).`, type: 'success' });
      } else if (otPct < 60) {
        insights.push({ icon: 'alert', title: 'Timeliness Concern', detail: `Only ${otPct}% on time. ${s.late} tasks completed late. Review due dates and prioritization.`, type: 'warning' });
      }
    }

    // Task type insight
    const tt = userDetail.task_types;
    if (tt.recurring + tt.unique > 0) {
      const recurPct = Math.round((tt.recurring / (tt.recurring + tt.unique)) * 100);
      if (recurPct > 70) {
        insights.push({ icon: 'repeat', title: 'Mostly Recurring Work', detail: `${recurPct}% of tasks are recurring. Consider automating repetitive workflows.`, type: 'tip' });
      } else if (recurPct < 30 && tt.recurring + tt.unique > 5) {
        insights.push({ icon: 'sparkle', title: 'Diverse Task Portfolio', detail: `${100 - recurPct}% unique tasks — handling a wide variety of work.`, type: 'info' });
      }
    }

    // Most active day from daily activity
    if (userDetail.daily_activity?.length > 0) {
      const bestDay = userDetail.daily_activity.reduce((best: any, d: any) => d.completed > (best?.completed || 0) ? d : best, null);
      if (bestDay && bestDay.completed > 0) {
        const dayName = new Date(bestDay.day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
        insights.push({ icon: 'calendar', title: 'Most Productive Day', detail: `${dayName} with ${bestDay.completed} tasks completed.`, type: 'info' });
      }
    }

    // Weekly trend direction
    if (userDetail.weekly_trend?.length >= 2) {
      const recent = userDetail.weekly_trend.slice(-2);
      const trend = recent[1].completed - recent[0].completed;
      if (trend > 0) {
        insights.push({ icon: 'trending-up', title: 'Upward Trend', detail: `Completed ${recent[1].completed} tasks this week vs ${recent[0].completed} last week. Momentum is building!`, type: 'success' });
      } else if (trend < 0 && recent[0].completed > 0) {
        insights.push({ icon: 'trending-down', title: 'Declining Activity', detail: `Down from ${recent[0].completed} to ${recent[1].completed} tasks. Check for blockers or bandwidth issues.`, type: 'warning' });
      }
    }

    return insights;
  });

  function insightIcon(icon: string) {
    const icons: Record<string, string> = {
      'trophy': 'M5 3h14l-1.5 8H6.5L5 3zm3 8v4a2 2 0 002 2h4a2 2 0 002-2v-4M12 17v4M8 21h8',
      'bolt': 'M13 2L3 14h9l-1 8 10-12h-9l1-8',
      'alert': 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z',
      'balance': 'M3 6l9-4 9 4M3 6v14h18V6M12 2v20',
      'star': 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
      'fire': 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z',
      'thumbs-up': 'M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3',
      'clock': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
      'clock-check': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      'repeat': 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
      'sparkle': 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
      'calendar': 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      'trending-up': 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
      'trending-down': 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
    };
    return icons[icon] || icons['star'];
  }

  function insightColor(type: string) {
    if (type === 'success') return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: 'text-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' };
    if (type === 'warning') return { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-500', text: 'text-amber-700 dark:text-amber-300' };
    if (type === 'tip') return { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', icon: 'text-violet-500', text: 'text-violet-700 dark:text-violet-300' };
    return { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', icon: 'text-blue-500', text: 'text-blue-700 dark:text-blue-300' };
  }

  // SVG donut helper
  function donutDash(pct: number, radius: number) {
    const circ = 2 * Math.PI * radius;
    const filled = (pct / 100) * circ;
    return `${filled} ${circ - filled}`;
  }
  const C50 = 2 * Math.PI * 50; // circumference for r=50
  const C45 = 2 * Math.PI * 45; // circumference for r=45

  // Inline calc helpers to avoid @const in div
  function pctOf(val: number, total: number) { return total > 0 ? (val / total) * 100 : 0; }
  function dashSeg(pct: number, circ: number) { return `${(pct / 100) * circ} ${circ}`; }
  function dashOff(pct: number, circ: number) { return `-${(pct / 100) * circ}`; }
  function speedGauge(avgH: number) { return avgH > 0 ? Math.min((24 / avgH) * 20, 100) : 0; }
</script>

<!-- MAIN LAYOUT -->
<div class="space-y-6 animate-premium-fade">

  <!-- HEADER -->
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div>
      {#if selectedUserId && data.isGlobalOps}
        <button onclick={goBack} class="flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors mb-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Back to Team
        </button>
      {/if}
      <h1 class="text-xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">
        {selectedUserId && userDetail ? userDetail.user.name : 'System Analytics'}
      </h1>
      <p class="mt-1 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 hidden sm:block">
        {selectedUserId && userDetail ? `Performance report for ${userDetail.user.email}` : 'Team performance, speed metrics, and individual reports.'}
      </p>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2">
      <select bind:value={dateRange} onchange={() => { setTimeout(() => { if (dateRange !== 'custom') reloadAll(); }, 0); }} class="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm text-gray-900 dark:text-white">
        <option value="7d">Last 7 Days</option>
        <option value="30d">Last 30 Days</option>
        <option value="90d">Last 90 Days</option>
        <option value="all">All Time</option>
        <option value="custom">Custom Range</option>
      </select>
      {#if dateRange === 'custom'}
        <input type="date" bind:value={customFrom} onchange={() => setTimeout(reloadAll, 0)} class="px-2 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white" />
        <input type="date" bind:value={customTo} onchange={() => setTimeout(reloadAll, 0)} class="px-2 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white" />
      {/if}
      {#if data.isGlobalOps}
        <select bind:value={selectedUniversityId} onchange={() => setTimeout(reloadAll, 0)} class="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm text-gray-900 dark:text-white">
          <option value="ALL">All Teams</option>
          {#each universities as univ}
            <option value={univ.id}>{univ.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="flex gap-1 overflow-x-auto pb-1 border-b border-gray-200 dark:border-slate-700/50">
    {#each analyticsTabs as tab}
      <button
        onclick={() => switchTab(tab.id)}
        class="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg whitespace-nowrap transition-all {activeTab === tab.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800/50'}"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={tab.icon}/></svg>
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === 'team'}
  <!-- ============= TEAM OVERVIEW TAB ============= -->

  {#if isLoading && !selectedUserId}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>

  <!-- ============= USER DETAIL VIEW ============= -->
  {:else if selectedUserId && userDetail}
    {@const s = userDetail.stats}
    {@const efficiency = s.total_assigned > 0 ? Math.round((s.on_time / s.total_assigned) * 100) : 0}
    {@const onTimePct = (s.on_time + s.late) > 0 ? Math.round((s.on_time / (s.on_time + s.late)) * 100) : 100}
    {@const rating = getRating(s.total_completed, s.total_assigned)}

    {#if isLoadingDetail}
      <div class="flex items-center justify-center py-20">
        <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    {:else}

    <!-- User Profile Header -->
    <div class="glass p-6 rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-6">
      <div class="relative">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br {rating.color} flex items-center justify-center text-white font-black text-2xl shadow-lg">
          {userDetail.user.name?.[0] || 'U'}
        </div>
        <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full {getPresenceColor(userDetail.user.presence_status)} border-2 border-white dark:border-slate-900"></div>
      </div>
      <div class="flex-1">
        <h2 class="text-lg font-black text-gray-900 dark:text-white">{userDetail.user.name}</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400">{userDetail.user.email} &middot; {userDetail.user.role} &middot; {userDetail.user.university_name || 'No University'}</p>
      </div>
      <div class="w-14 h-14 rounded-full bg-gradient-to-br {rating.color} ring-2 {rating.ring} ring-offset-2 dark:ring-offset-slate-900 flex items-center justify-center text-white font-black text-xl shadow-lg">
        {rating.letter}
      </div>
    </div>

    <!-- Circular Charts Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <!-- Efficiency Circle -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="text-indigo-500" stroke-dasharray={donutDash(efficiency, 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400 -mt-1">{efficiency}%</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Efficiency</div>
      </div>

      <!-- On Time Circle -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="{onTimePct >= 80 ? 'text-emerald-500' : onTimePct >= 50 ? 'text-amber-500' : 'text-red-500'}"
            stroke-dasharray={donutDash(onTimePct, 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-2xl font-black {onTimePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : onTimePct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} -mt-1">{onTimePct}%</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">On Time</div>
      </div>

      <!-- Task Status Donut -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="text-emerald-500" stroke-dasharray={dashSeg(pctOf(s.total_completed, s.total_assigned), C50)} stroke-dashoffset="0" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10"
            class="text-blue-500" stroke-dasharray={dashSeg(pctOf(s.total_in_progress, s.total_assigned), C50)} stroke-dashoffset={dashOff(pctOf(s.total_completed, s.total_assigned), C50)} />
        </svg>
        <div class="text-lg font-black text-gray-900 dark:text-white -mt-1">{s.total_assigned}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total Tasks</div>
        <div class="flex gap-2 mt-2">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-[8px] font-bold text-gray-400">{s.total_completed}</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500"></span><span class="text-[8px] font-bold text-gray-400">{s.total_in_progress}</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-[8px] font-bold text-gray-400">{s.total_pending}</span></span>
        </div>
      </div>

      <!-- Speed Gauge -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-24 h-24 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="text-violet-500" stroke-dasharray={donutDash(speedGauge(s.avg_completion_hours), 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-xl font-black text-violet-600 dark:text-violet-400 -mt-1">{formatHours(s.avg_completion_hours)}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Avg Speed</div>
        <div class="flex gap-3 mt-2 text-[8px] font-bold text-gray-400">
          <span>Fast: {formatHours(s.fastest_completion_hours)}</span>
          <span>Slow: {formatHours(s.slowest_completion_hours)}</span>
        </div>
      </div>
    </div>

    <!-- Smart Insights -->
    {#if userInsights.length > 0}
      <div class="glass p-6 rounded-[2rem]">
        <div class="flex items-center gap-2 mb-4">
          <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
          <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Smart Insights</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {#each userInsights as insight}
            {@const c = insightColor(insight.type)}
            <div class="flex items-start gap-3 p-3 rounded-xl border {c.bg} {c.border}">
              <svg class="w-5 h-5 flex-shrink-0 mt-0.5 {c.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={insightIcon(insight.icon)} /></svg>
              <div>
                <div class="text-xs font-black {c.text}">{insight.title}</div>
                <div class="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">{insight.detail}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- AI Report -->
    <div class="glass p-6 rounded-[2rem]">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
          <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">AI Report</h3>
          <span class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">AI</span>
        </div>
        <button
          onclick={loadAIInsights}
          disabled={isLoadingAI}
          class="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isLoadingAI}
            <div class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Analyzing...
          {:else}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Generate AI Report
          {/if}
        </button>
      </div>
      {#if aiInsights}
        <div class="prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed text-gray-700 dark:text-gray-300 space-y-2 whitespace-pre-line bg-purple-50/50 dark:bg-purple-900/10 rounded-xl p-4 border border-purple-100 dark:border-purple-800/30">
          {aiInsights}
        </div>
      {:else if !isLoadingAI}
        <p class="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Click "Generate AI Report" for a detailed analysis powered by Gemini AI — includes work distribution, task recommendations, performance patterns, and actionable suggestions.</p>
      {/if}
    </div>

    <!-- Task Categories + Priority -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Task Categories with pie-style -->
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-5">Task Categories</h3>
        <div class="flex items-center gap-6">
          <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90 flex-shrink-0">
            <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="14" class="text-gray-100 dark:text-slate-800" />
            <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"
              class="text-indigo-500" stroke-dasharray={dashSeg(pctOf(userDetail.task_types.recurring, userDetail.task_types.recurring + userDetail.task_types.unique), C45)} stroke-dashoffset="0" />
            <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="14"
              class="text-emerald-500" stroke-dasharray={dashSeg(pctOf(userDetail.task_types.unique, userDetail.task_types.recurring + userDetail.task_types.unique), C45)} stroke-dashoffset={dashOff(pctOf(userDetail.task_types.recurring, userDetail.task_types.recurring + userDetail.task_types.unique), C45)} />
          </svg>
          <div class="flex-1 space-y-3">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="w-3 h-3 rounded-full bg-indigo-500"></span>
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300">Recurring</span>
              </div>
              <div class="text-sm font-black text-gray-900 dark:text-white">{userDetail.task_types.recurring_completed}/{userDetail.task_types.recurring} done &middot; {formatHours(userDetail.task_types.recurring_avg_hours)} avg</div>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300">Unique</span>
              </div>
              <div class="text-sm font-black text-gray-900 dark:text-white">{userDetail.task_types.unique_completed}/{userDetail.task_types.unique} done &middot; {formatHours(userDetail.task_types.unique_avg_hours)} avg</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Priority Breakdown with visual bars -->
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-5">By Priority</h3>
        <div class="space-y-3">
          {#each userDetail.priority_breakdown as pb}
            {@const barPct = pb.total > 0 ? (pb.completed / pb.total) * 100 : 0}
            {@const barColor = pb.priority === 'URGENT' ? 'from-red-400 to-red-600' : pb.priority === 'HIGH' ? 'from-orange-400 to-orange-600' : pb.priority === 'MEDIUM' ? 'from-blue-400 to-blue-600' : 'from-gray-400 to-gray-500'}
            {@const textColor = pb.priority === 'URGENT' ? 'text-red-600 dark:text-red-400' : pb.priority === 'HIGH' ? 'text-orange-600 dark:text-orange-400' : pb.priority === 'MEDIUM' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-[10px] font-black uppercase tracking-wider {textColor}">{pb.priority}</span>
                <span class="text-xs font-bold text-gray-900 dark:text-white">{pb.completed}/{pb.total} &middot; {formatHours(pb.avg_hours)}</span>
              </div>
              <div class="h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r {barColor} rounded-full transition-all duration-700" style="width: {barPct}%"></div>
              </div>
            </div>
          {/each}
          {#if userDetail.priority_breakdown.length === 0}
            <p class="text-xs text-gray-400 text-center py-4">No priority data</p>
          {/if}
        </div>
        <!-- Communication tasks -->
        <div class="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-bold text-gray-500">Communication Tasks</span>
          <span class="text-sm font-black text-gray-900 dark:text-white">{userDetail.communication_tasks.completed} / {userDetail.communication_tasks.total}</span>
        </div>
      </div>
    </div>

    <!-- Weekly Trend Chart — FIXED with pixel heights -->
    {#if userDetail.weekly_trend.length > 0}
      {@const maxWeekly = Math.max(...userDetail.weekly_trend.map((w: any) => w.completed), 1)}
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4">Weekly Trend</h3>
        <div class="flex items-end gap-3" style="height: 180px;">
          {#each userDetail.weekly_trend as week}
            {@const barH = Math.max((week.completed / maxWeekly) * 150, 6)}
            <div class="flex-1 flex flex-col items-center justify-end group" style="height: 100%;">
              <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{week.completed}</span>
              <div class="w-full max-w-[40px] rounded-t-xl bg-gradient-to-t from-indigo-600 via-indigo-500 to-blue-400 shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all" style="height: {barH}px;"></div>
              <span class="text-[9px] font-bold text-gray-400 dark:text-gray-500 mt-2 whitespace-nowrap">{new Date(week.week_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Daily Activity (30 days) heatmap -->
    {#if userDetail.daily_activity.length > 0}
      {@const maxDaily = Math.max(...userDetail.daily_activity.map((a: any) => a.completed), 1)}
      <div class="glass p-6 rounded-[2rem]">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4">Daily Activity (Last 30 Days)</h3>
        <div class="flex flex-wrap gap-1.5">
          {#each Array.from({ length: 30 }, (_, idx) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - idx));
            const dateStr = d.toISOString().split('T')[0];
            const dayData = userDetail.daily_activity.find((a: any) => new Date(a.day).toISOString().split('T')[0] === dateStr);
            return { date: dateStr, count: dayData?.completed || 0, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' }) };
          }) as cell}
            {@const intensity = cell.count > 0 ? Math.max(0.25, cell.count / maxDaily) : 0}
            <div
              class="w-7 h-7 rounded-lg transition-all cursor-default flex items-center justify-center text-[8px] font-bold {cell.count === 0 ? 'bg-gray-100 dark:bg-slate-800 text-gray-300 dark:text-gray-600' : 'text-white'}"
              style={cell.count > 0 ? `background-color: rgba(99, 102, 241, ${intensity})` : ''}
              title="{cell.label}: {cell.count} tasks"
            >
              {cell.count > 0 ? cell.count : ''}
            </div>
          {/each}
        </div>
        <div class="flex items-center gap-2 mt-3 text-[9px] font-bold text-gray-400">
          <span>Less</span>
          <div class="w-4 h-4 rounded bg-gray-100 dark:bg-slate-800"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 0.25)"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 0.5)"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 0.75)"></div>
          <div class="w-4 h-4 rounded" style="background-color: rgba(99, 102, 241, 1)"></div>
          <span>More</span>
        </div>
      </div>
    {/if}

    <!-- Recent Tasks Table -->
    <div class="glass rounded-[2rem] overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
        <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Recent Tasks</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
          <thead class="bg-gray-50/50 dark:bg-slate-800/50">
            <tr>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Task</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Priority</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Started At</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Finished At</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Time Taken</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Efficiency</th>
              <th class="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Assigned By</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800/50">
            {#each userDetail.recent_tasks as task}
              {@const pColor = task.priority === 'URGENT' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : task.priority === 'HIGH' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' : task.priority === 'MEDIUM' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}
              {@const sColor = task.assignee_status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : task.assignee_status === 'IN_PROGRESS' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}
              {@const isLate = task.assignee_status === 'COMPLETED' && task.due_date && new Date(task.completed_at) > new Date(task.due_date)}
              {@const taskEff = (() => {
                if (task.assignee_status !== 'COMPLETED') return null;
                const est = parseFloat(task.estimated_time);
                const actual = parseFloat(task.hours_taken);
                if (est > 0 && actual > 0) {
                  return Math.min(Math.round((est / actual) * 100), 100);
                }
                if (task.due_date && task.completed_at) {
                  const due = new Date(task.due_date).getTime();
                  const done = new Date(task.completed_at).getTime();
                  if (isNaN(due) || isNaN(done)) return null;
                  if (done <= due) return 100;
                  const daysLate = (done - due) / (1000 * 60 * 60 * 24);
                  return Math.max(0, Math.round(100 - daysLate * 10));
                }
                return null;
              })()}
              {@const effColor = taskEff === null ? '' : taskEff >= 80 ? 'text-emerald-600 dark:text-emerald-400' : taskEff >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}
              <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <td class="px-4 py-3">
                  <div class="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">{task.title}</div>
                  <div class="text-[10px] text-gray-400 font-mono">{new Date(task.created_at).toLocaleDateString()}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full {pColor}">{task.priority}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full {sColor}">
                    {task.assignee_status}
                  </span>
                  {#if isLate}
                    <span class="ml-1 text-[9px] font-bold text-red-500">LATE</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums">
                  {task.started_at ? new Date(task.started_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums">
                  {task.completed_at ? new Date(task.completed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                </td>
                <td class="px-4 py-3 text-sm font-bold text-gray-600 dark:text-gray-300 tabular-nums">
                  {task.hours_taken ? formatHours(task.hours_taken) : '-'}
                </td>
                <td class="px-4 py-3 text-sm font-bold tabular-nums {effColor}">
                  {taskEff !== null ? `${taskEff}%` : '-'}
                </td>
                <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{task.assigned_by_name || '-'}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-4 py-12 text-center text-gray-400 text-sm">No tasks found</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
    {/if}

  <!-- ============= TEAM OVERVIEW ============= -->
  {:else}

    <!-- Top Summary with Circular Charts -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Team Efficiency Donut -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="text-indigo-500" stroke-dasharray={donutDash(teamEfficiency, 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-3xl font-black text-indigo-600 dark:text-indigo-400 -mt-2">{teamEfficiency}%</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Team Efficiency</div>
      </div>

      <!-- Task Distribution Donut -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="text-emerald-500" stroke-dasharray={dashSeg(pctOf(totalCompleted, totalAssigned), C50)} stroke-dashoffset="0" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10"
            class="text-blue-500" stroke-dasharray={dashSeg(pctOf(totalInProgress, totalAssigned), C50)} stroke-dashoffset={dashOff(pctOf(totalCompleted, totalAssigned), C50)} />
        </svg>
        <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 -mt-2">{totalCompleted}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Completed</div>
        <div class="flex gap-3 mt-2">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-[8px] font-bold text-gray-400">{totalCompleted} done</span></span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-500"></span><span class="text-[8px] font-bold text-gray-400">{totalInProgress} active</span></span>
        </div>
      </div>

      <!-- Avg Speed -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-28 h-28 -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" class="text-gray-100 dark:text-slate-800" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
            class="text-violet-500" stroke-dasharray={donutDash(speedGauge(avgSpeed), 50)} stroke-dashoffset="0"
            style="transition: stroke-dasharray 1s ease" />
        </svg>
        <div class="text-3xl font-black text-violet-600 dark:text-violet-400 -mt-2">{formatHours(avgSpeed)}</div>
        <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Avg Speed</div>
      </div>

      <!-- Overdue / Team Size -->
      <div class="glass p-5 rounded-[2rem] flex flex-col items-center justify-center">
        <div class="grid grid-cols-2 gap-4 w-full">
          <div class="text-center">
            <div class="text-3xl font-black text-gray-900 dark:text-white">{teamData.length}</div>
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Members</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-black {totalOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}">{totalOverdue}</div>
            <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Overdue</div>
          </div>
        </div>
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 w-full text-center">
          <div class="text-lg font-black text-gray-900 dark:text-white">{totalAssigned}</div>
          <div class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Tasks</div>
        </div>
      </div>
    </div>

    <!-- Smart Insights -->
    {#if teamInsights.length > 0}
      <div class="glass p-6 rounded-[2rem]">
        <div class="flex items-center gap-2 mb-4">
          <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
          <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Smart Insights</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each teamInsights as insight}
            {@const c = insightColor(insight.type)}
            <div class="flex items-start gap-3 p-3 rounded-xl border {c.bg} {c.border}">
              <svg class="w-5 h-5 flex-shrink-0 mt-0.5 {c.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={insightIcon(insight.icon)} /></svg>
              <div>
                <div class="text-xs font-black {c.text}">{insight.title}</div>
                <div class="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">{insight.detail}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- AI Report (Team) -->
    <div class="glass p-6 rounded-[2rem]">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
          <h3 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">AI Report</h3>
          <span class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300">AI</span>
        </div>
        <button
          onclick={loadAIInsights}
          disabled={isLoadingAI}
          class="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isLoadingAI}
            <div class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Analyzing...
          {:else}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Generate AI Report
          {/if}
        </button>
      </div>
      {#if aiInsights}
        <div class="prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed text-gray-700 dark:text-gray-300 space-y-2 whitespace-pre-line bg-purple-50/50 dark:bg-purple-900/10 rounded-xl p-4 border border-purple-100 dark:border-purple-800/30">
          {aiInsights}
        </div>
      {:else if !isLoadingAI}
        <p class="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Click "Generate AI Report" for a detailed team analysis — work distribution, bottleneck detection, task recommendations, and actionable suggestions powered by AI.</p>
      {/if}
    </div>

    <!-- Leaderboard / Team Table -->
    <div class="glass rounded-[2rem] overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
        <h2 class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Team Leaderboard</h2>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Click to drill down</span>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
          <thead class="bg-gray-50/50 dark:bg-slate-800/50">
            <tr>
              <th class="px-3 sm:px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-8">#</th>
              <th class="px-3 sm:px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Member</th>
              <th class="px-3 sm:px-6 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest hidden sm:table-cell">Progress</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Done</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">Avg Speed</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">On Time</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Streak</th>
              <th class="px-3 sm:px-6 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Rating</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-slate-800/50">
            {#each teamData as member, idx}
              {@const completed = parseInt(member.total_completed) || 0}
              {@const assigned = parseInt(member.total_assigned) || 0}
              {@const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0}
              {@const onTime = parseInt(member.tasks_completed_on_time) || 0}
              {@const late = parseInt(member.tasks_completed_late) || 0}
              {@const onTimePct = (onTime + late) > 0 ? Math.round((onTime / (onTime + late)) * 100) : 100}
              {@const avgH = parseFloat(member.avg_completion_hours) || 0}
              {@const streak = parseInt(member.current_streak) || 0}
              {@const rating = getRating(completed, assigned)}
              {@const badge = getRankBadge(idx)}
              <tr
                class="group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all cursor-pointer active:scale-[0.99]"
                onclick={() => selectUser(member.id)}
              >
                <td class="px-3 sm:px-6 py-3 sm:py-4">
                  {#if badge}
                    <span class="text-[10px] font-black px-2 py-1 rounded-lg {badge.bg}">{badge.emoji}</span>
                  {:else}
                    <span class="text-xs font-bold text-gray-400">{idx + 1}</span>
                  {/if}
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4">
                  <div class="flex items-center gap-3">
                    <div class="relative">
                      <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md group-hover:shadow-lg transition-shadow">
                        {member.name?.[0] || 'U'}
                      </div>
                      <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full {getPresenceColor(member.presence_status)} border-2 border-white dark:border-slate-900"></div>
                    </div>
                    <div>
                      <div class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{member.name}</div>
                      <div class="text-[10px] text-gray-400 font-bold">{member.role} &middot; {member.university_name || 'Global'}</div>
                    </div>
                  </div>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden max-w-[120px]">
                      <div class="h-full bg-gradient-to-r from-blue-400 to-indigo-600 rounded-full transition-all duration-700" style="width: {pct}%"></div>
                    </div>
                    <span class="text-[10px] font-black text-gray-500 w-8">{pct}%</span>
                  </div>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center">
                  <span class="text-sm font-black text-gray-900 dark:text-white">{completed}</span>
                  <span class="text-[10px] text-gray-400 font-bold">/{assigned}</span>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center hidden md:table-cell">
                  <span class="text-sm font-bold {avgH > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}">{formatHours(avgH)}</span>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center hidden md:table-cell">
                  <span class="text-sm font-bold {onTimePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : onTimePct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}">{onTimePct}%</span>
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center hidden lg:table-cell">
                  {#if streak > 0}
                    <span class="text-sm font-black text-amber-600 dark:text-amber-400">{streak}d</span>
                  {:else}
                    <span class="text-sm text-gray-300 dark:text-gray-600">-</span>
                  {/if}
                </td>
                <td class="px-3 sm:px-6 py-3 sm:py-4 text-center">
                  <div class="w-9 h-9 rounded-full bg-gradient-to-br {rating.color} ring-2 {rating.ring} ring-offset-1 dark:ring-offset-slate-900 flex items-center justify-center text-white font-black text-sm shadow-md mx-auto transition-transform group-hover:scale-110">
                    {rating.letter}
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-6 py-20 text-center">
                  <div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 space-y-3">
                    <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <p class="text-[10px] font-black uppercase tracking-[0.2em]">No team members found</p>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Rating Legend -->
    <div class="flex flex-wrap items-center gap-4 px-2">
      <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ratings:</span>
      {#each [
        { l: 'S', range: '90-100%', color: 'from-amber-400 to-amber-600' },
        { l: 'A', range: '75-89%', color: 'from-emerald-400 to-emerald-600' },
        { l: 'B', range: '50-74%', color: 'from-blue-400 to-blue-600' },
        { l: 'C', range: '<50%', color: 'from-gray-400 to-gray-600' },
      ] as r}
        <div class="flex items-center gap-1.5">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br {r.color} flex items-center justify-center text-[9px] font-black text-white">{r.l}</div>
          <span class="text-[10px] font-bold text-gray-400">{r.range}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ============= END TEAM TAB ============= -->

  {:else if activeTab === 'task-patterns'}
  <!-- ============= TASK PATTERNS ============= -->
  {#if analyticsViewLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  {:else}
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Task Pattern Analysis</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Recurring tasks, frequency, and completion metrics across teams.</p>

      {#if analyticsViewData?.patterns?.length}
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="glass rounded-2xl p-4 text-center">
            <div class="text-2xl font-black text-gray-900 dark:text-white">{analyticsViewData.patterns.length}</div>
            <div class="text-xs font-bold text-gray-500">Unique Task Types</div>
          </div>
          <div class="glass rounded-2xl p-4 text-center border border-emerald-200 dark:border-emerald-800/50">
            <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400">{analyticsViewData.patterns.reduce((s: number, p: any) => s + (p.completed_count || 0), 0)}</div>
            <div class="text-xs font-bold text-gray-500">Total Completed</div>
          </div>
          <div class="glass rounded-2xl p-4 text-center border border-red-200 dark:border-red-800/50">
            <div class="text-2xl font-black text-red-600 dark:text-red-400">{analyticsViewData.patterns.reduce((s: number, p: any) => s + (p.overdue_count || 0), 0)}</div>
            <div class="text-xs font-bold text-gray-500">Overdue</div>
          </div>
        </div>

        <div class="glass rounded-2xl overflow-hidden">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-gray-200 dark:border-slate-700">
              <th class="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Task</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Freq</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Done</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Overdue</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Hours</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Assignees</th>
              <th class="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Frequency</th>
            </tr></thead>
            <tbody>
              {#each analyticsViewData.patterns as p}
                {@const maxFreq = Math.max(...analyticsViewData.patterns.map((x: any) => x.frequency))}
                <tr class="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                  <td class="px-4 py-3 font-bold text-gray-900 dark:text-white max-w-[200px] truncate" title={p.title}>{p.title}</td>
                  <td class="text-center px-3 py-3 text-indigo-600 dark:text-indigo-400 font-black">{p.frequency}</td>
                  <td class="text-center px-3 py-3 text-emerald-600 dark:text-emerald-400">{p.completed_count}</td>
                  <td class="text-center px-3 py-3 {p.overdue_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}">{p.overdue_count}</td>
                  <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{p.avg_completion_hours ? `${p.avg_completion_hours}h` : '—'}</td>
                  <td class="text-center px-3 py-3 text-gray-500">{p.assignee_count}</td>
                  <td class="px-3 py-3">
                    <div class="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
                      <div class="bg-indigo-500 h-2 rounded-full" style="width: {Math.round((p.frequency / maxFreq) * 100)}%"></div>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if analyticsViewData.byTeam?.length}
          <h3 class="text-lg font-black text-gray-900 dark:text-white mt-8 mb-4">Task Volume by University / Week</h3>
          <div class="glass rounded-2xl overflow-hidden">
            <table class="w-full text-sm">
              <thead><tr class="border-b border-gray-200 dark:border-slate-700">
                <th class="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">University</th>
                <th class="text-left px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Week</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tasks</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Done</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Overdue</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Hours</th>
              </tr></thead>
              <tbody>
                {#each analyticsViewData.byTeam as row}
                  <tr class="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                    <td class="px-4 py-3 font-bold text-gray-900 dark:text-white">{row.university_name || '—'}</td>
                    <td class="px-3 py-3 text-gray-500 text-xs">{row.week_start}</td>
                    <td class="text-center px-3 py-3 text-indigo-600 dark:text-indigo-400">{row.task_count}</td>
                    <td class="text-center px-3 py-3 text-emerald-600 dark:text-emerald-400">{row.completed}</td>
                    <td class="text-center px-3 py-3 {row.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}">{row.overdue}</td>
                    <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{row.avg_hours ? `${row.avg_hours}h` : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {:else}
        <div class="text-center py-16 text-gray-500">
          <p class="text-lg font-bold mb-2">No task data found</p>
          <p class="text-sm">Tasks created this month will appear here with pattern analysis.</p>
        </div>
      {/if}
    </div>
  {/if}

  {:else if activeTab === 'peer-comparison'}
  <!-- ============= PEER COMPARISON ============= -->
  {#if analyticsViewLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  {:else}
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Peer Comparison</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Compare task completion metrics across team members.</p>

      {#if analyticsViewData?.users?.length}
        <div class="glass rounded-2xl overflow-hidden mb-8">
          <div class="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h3 class="text-sm font-black text-gray-900 dark:text-white">Leaderboard — Task Completion</h3>
          </div>
          <table class="w-full text-sm">
            <thead><tr class="border-b border-gray-200 dark:border-slate-700">
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest w-12">#</th>
              <th class="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
              <th class="text-left px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">University</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tasks</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Done</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">On-time</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Overdue</th>
              <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Hours</th>
              <th class="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Completion</th>
            </tr></thead>
            <tbody>
              {#each analyticsViewData.users as user, i}
                {@const rate = user.total_tasks > 0 ? Math.round((user.completed / user.total_tasks) * 100) : 0}
                <tr class="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                  <td class="text-center px-3 py-3 {i < 3 ? 'text-amber-500 font-black' : 'text-gray-400'}">{i + 1}</td>
                  <td class="px-4 py-3 font-bold text-gray-900 dark:text-white">{user.user_name}</td>
                  <td class="px-3 py-3 text-gray-500 text-xs">{user.university_name || '—'}</td>
                  <td class="text-center px-3 py-3 text-indigo-600 dark:text-indigo-400">{user.total_tasks}</td>
                  <td class="text-center px-3 py-3 text-emerald-600 dark:text-emerald-400 font-black">{user.completed}</td>
                  <td class="text-center px-3 py-3 text-emerald-500">{user.on_time_count}</td>
                  <td class="text-center px-3 py-3 {user.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}">{user.overdue}</td>
                  <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{user.avg_hours ? `${user.avg_hours}h` : '—'}</td>
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-100 dark:bg-slate-800 rounded-full h-2">
                        <div class="h-2 rounded-full {rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}" style="width: {rate}%"></div>
                      </div>
                      <span class="text-xs font-bold text-gray-400 w-8">{rate}%</span>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        {#if analyticsViewData.sameTaskComparisons?.length}
          <h3 class="text-lg font-black text-gray-900 dark:text-white mb-4">Same-Task Speed Comparison</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each analyticsViewData.sameTaskComparisons.slice(0, 10) as comp}
              {@const maxHrs = Math.max(...comp.completions.map((c: any) => c.avg_hours || 1))}
              <div class="glass rounded-2xl p-4">
                <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3 truncate" title={comp.taskTitle}>{comp.taskTitle}</h4>
                {#each comp.completions as c}
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs text-gray-500 w-24 truncate" title={c.user_name}>{c.user_name}</span>
                    <div class="flex-1 bg-gray-100 dark:bg-slate-800 rounded-full h-3">
                      <div class="bg-indigo-500 h-3 rounded-full flex items-center justify-end pr-1" style="width: {Math.max(Math.round((c.avg_hours / maxHrs) * 100), 10)}%">
                        <span class="text-[9px] text-white font-bold">{c.avg_hours}h</span>
                      </div>
                    </div>
                    <span class="text-[10px] text-gray-500 w-8">{c.times_done}x</span>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="text-center py-16 text-gray-500">
          <p class="text-lg font-bold mb-2">No comparison data</p>
          <p class="text-sm">Task data for this month will appear here.</p>
        </div>
      {/if}
    </div>
  {/if}

  {:else if activeTab === 'university-rankings'}
  <!-- ============= UNIVERSITY RANKINGS ============= -->
  {#if analyticsViewLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  {:else}
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">University Rankings</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Composite efficiency scores: Sessions 25%, Attendance 25%, Coach Coverage 15%, At-Risk Follow-up 10%, Compliance 15%, Events 10%.</p>

      {#if analyticsViewData?.rankings?.length}
        <div class="space-y-3">
          {#each analyticsViewData.rankings as uni, i}
            <div class="glass rounded-2xl p-4 hover:shadow-lg transition-all">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg font-black {i === 0 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : i === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' : i === 2 ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400' : 'bg-gray-50 dark:bg-slate-800 text-gray-400'}">
                  {i + 1}
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-1">
                    <h3 class="font-black text-gray-900 dark:text-white">{uni.university_name}</h3>
                    <span class="text-2xl font-black {uni.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : uni.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}">{uni.score}</span>
                    <span class="text-xs text-gray-400">/100</span>
                    {#if uni.trend_delta != null}
                      <span class="text-xs font-bold px-2 py-0.5 rounded {uni.trend_delta > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : uni.trend_delta < 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}">
                        {uni.trend_delta > 0 ? '+' : ''}{uni.trend_delta} vs prev
                      </span>
                    {/if}
                  </div>
                  <div class="flex gap-3 text-xs">
                    <span class="text-gray-500">Sessions <span class="{uni.sessRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : uni.sessRate >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} font-bold">{uni.sessRate}%</span></span>
                    <span class="text-gray-500">Attendance <span class="{uni.attRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : uni.attRate >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} font-bold">{uni.attRate}%</span></span>
                    <span class="text-gray-500">Coach <span class="{uni.coachRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : uni.coachRate >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} font-bold">{uni.coachRate}%</span></span>
                    <span class="text-gray-500">Risk F/U <span class="{uni.riskRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} font-bold">{uni.riskRate}%</span></span>
                    <span class="text-gray-500">Compliance <span class="{uni.complianceRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : uni.complianceRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'} font-bold">{uni.complianceRate}%</span></span>
                    <span class="text-gray-500">Events <span class="text-indigo-600 dark:text-indigo-400 font-bold">{uni.eventRate}%</span></span>
                  </div>
                </div>
                <div class="w-32">
                  <div class="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-3">
                    <div class="h-3 rounded-full {uni.score >= 80 ? 'bg-emerald-500' : uni.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}" style="width: {uni.score}%"></div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-center py-16 text-gray-500">
          <p class="text-lg font-bold mb-2">No ranking data</p>
          <p class="text-sm">Ops daily data for this month is needed to generate rankings.</p>
        </div>
      {/if}
    </div>
  {/if}

  {:else if activeTab === 'event-intelligence'}
  <!-- ============= EVENT INTELLIGENCE ============= -->
  {#if analyticsViewLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
    </div>
  {:else}
    <div>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Event & Budget Intelligence</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">ROI analysis, budget efficiency, and attendance accuracy for events.</p>

      {#if analyticsViewData?.aggregates}
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div class="glass rounded-2xl p-4 text-center">
            <div class="text-2xl font-black text-gray-900 dark:text-white">{analyticsViewData.aggregates.totalEvents}</div>
            <div class="text-xs font-bold text-gray-500">Total Events</div>
          </div>
          <div class="glass rounded-2xl p-4 text-center border border-indigo-200 dark:border-indigo-800/50">
            <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400">{analyticsViewData.aggregates.eventsWithReports}</div>
            <div class="text-xs font-bold text-gray-500">With Reports</div>
          </div>
          <div class="glass rounded-2xl p-4 text-center border border-emerald-200 dark:border-emerald-800/50">
            <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400">{analyticsViewData.aggregates.avgBudgetUtilization}%</div>
            <div class="text-xs font-bold text-gray-500">Avg Budget Util.</div>
          </div>
          <div class="glass rounded-2xl p-4 text-center border border-violet-200 dark:border-violet-800/50">
            <div class="text-2xl font-black text-violet-600 dark:text-violet-400">{analyticsViewData.aggregates.avgAttendanceAccuracy}%</div>
            <div class="text-xs font-bold text-gray-500">Attendance Accuracy</div>
          </div>
          <div class="glass rounded-2xl p-4 text-center border border-amber-200 dark:border-amber-800/50">
            <div class="text-xl font-black text-amber-600 dark:text-amber-400">{analyticsViewData.aggregates.avgCostPerParticipant > 0 ? `₹${analyticsViewData.aggregates.avgCostPerParticipant}` : '—'}</div>
            <div class="text-xs font-bold text-gray-500">Avg Cost/Person</div>
          </div>
        </div>

        <!-- AI Analysis Button -->
        <div class="mb-6">
          <button onclick={loadEventIntelAI} disabled={eventIntelAILoading}
            class="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-md">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {eventIntelAILoading ? 'Analyzing...' : 'AI Analysis'}
          </button>
          {#if eventIntelAI}
            <div class="mt-4 glass rounded-2xl p-4 border border-violet-200 dark:border-violet-800/50">
              <h4 class="text-sm font-black text-violet-600 dark:text-violet-400 mb-2">AI Budget & Event Insights</h4>
              <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{eventIntelAI}</div>
            </div>
          {/if}
        </div>

        <!-- Problem Patterns -->
        {#if analyticsViewData.problemPatterns?.length}
          <div class="mb-6">
            <h3 class="text-sm font-black text-red-600 dark:text-red-400 mb-3">Problem Patterns</h3>
            <div class="space-y-2">
              {#each analyticsViewData.problemPatterns as problem}
                <div class="glass rounded-xl p-3 flex items-start gap-3 border border-red-200 dark:border-red-800/50">
                  <span class="text-xs font-bold px-2 py-0.5 rounded {problem.type === 'budget_overrun' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}">
                    {problem.type === 'budget_overrun' ? 'OVER BUDGET' : 'LOW ATTENDANCE'}
                  </span>
                  <div class="flex-1">
                    <span class="text-sm font-bold text-gray-900 dark:text-white">{problem.event}</span>
                    <span class="text-xs text-gray-500 ml-2">@ {problem.university}</span>
                    <span class="text-xs text-red-600 dark:text-red-400 ml-2 font-bold">{problem.value}</span>
                    {#if problem.detail}<p class="text-xs text-gray-500 mt-1">{problem.detail}</p>{/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- By Event Type -->
        {#if analyticsViewData.byType?.length}
          <h3 class="text-sm font-black text-gray-900 dark:text-white mb-3">By Event Type</h3>
          <div class="glass rounded-2xl overflow-hidden mb-6">
            <table class="w-full text-sm">
              <thead><tr class="border-b border-gray-200 dark:border-slate-700">
                <th class="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Events</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Done</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Budget</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Avg Attend.</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cost/Person</th>
              </tr></thead>
              <tbody>
                {#each analyticsViewData.byType as t}
                  <tr class="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                    <td class="px-4 py-3 font-bold text-gray-900 dark:text-white">{t.event_type || '—'}</td>
                    <td class="text-center px-3 py-3 text-indigo-600 dark:text-indigo-400">{t.total_events}</td>
                    <td class="text-center px-3 py-3 text-emerald-600 dark:text-emerald-400">{t.completed}</td>
                    <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{t.avg_budget ? `₹${Math.round(t.avg_budget)}` : '—'}</td>
                    <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{t.avg_attendance || '—'}</td>
                    <td class="text-center px-3 py-3 text-amber-600 dark:text-amber-400">{t.avg_cost_pp ? `₹${Math.round(t.avg_cost_pp)}` : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <!-- Events Table -->
        {#if analyticsViewData.events?.length}
          <h3 class="text-sm font-black text-gray-900 dark:text-white mb-3">All Events ({analyticsViewData.events.length})</h3>
          <div class="glass rounded-2xl overflow-hidden overflow-x-auto">
            <table class="w-full text-sm min-w-[800px]">
              <thead><tr class="border-b border-gray-200 dark:border-slate-700">
                <th class="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Event</th>
                <th class="text-left px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">University</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Budget Est.</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actual</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Util %</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Exp. Att.</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actual Att.</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cost/PP</th>
                <th class="text-center px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
              </tr></thead>
              <tbody>
                {#each analyticsViewData.events.slice(0, 50) as ev}
                  <tr class="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                    <td class="px-4 py-3 font-bold text-gray-900 dark:text-white max-w-[180px] truncate" title={ev.title}>{ev.title}</td>
                    <td class="px-3 py-3 text-gray-500 text-xs">{ev.university_name || '—'}</td>
                    <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{ev.estimated_total_budget ? `₹${Math.round(ev.estimated_total_budget)}` : '—'}</td>
                    <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{ev.actual_budget_used ? `₹${Math.round(ev.actual_budget_used)}` : '—'}</td>
                    <td class="text-center px-3 py-3 {ev.budget_utilization && parseFloat(ev.budget_utilization) > 130 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-600 dark:text-gray-300'}">{ev.budget_utilization ? `${ev.budget_utilization}%` : '—'}</td>
                    <td class="text-center px-3 py-3 text-gray-500">{ev.expected_attendance || '—'}</td>
                    <td class="text-center px-3 py-3 text-gray-600 dark:text-gray-300">{ev.actual_attendance || '—'}</td>
                    <td class="text-center px-3 py-3 text-amber-600 dark:text-amber-400">{ev.cost_per_participant ? `₹${ev.cost_per_participant}` : '—'}</td>
                    <td class="text-center px-3 py-3">
                      <span class="text-xs px-2 py-0.5 rounded-full {ev.status === 'CLOSED' || ev.status === 'REPORT_SUBMITTED' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : ev.status === 'APPROVED' || ev.status === 'EVENT_COMPLETED' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500'}">{ev.status}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {:else}
        <div class="text-center py-16 text-gray-500">
          <p class="text-lg font-bold mb-2">No event data</p>
          <p class="text-sm">Budget proposals and event reports for this month will be analyzed here.</p>
        </div>
      {/if}
    </div>
  {/if}

  {:else if activeTab === 'ask-ai'}
  <!-- ============= ASK AI / NLQ ============= -->
  <div class="max-w-4xl">
    <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Ask AI</h2>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Ask questions about your operations data in natural language. Powered by Gemini AI.</p>

    <div class="flex gap-3 mb-4">
      <input
        type="text"
        bind:value={nlqQuestion}
        placeholder="Ask anything about operations..."
        class="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        onkeydown={(e) => { if (e.key === 'Enter') askAI(); }}
      />
      <button onclick={askAI} disabled={nlqLoading || !nlqQuestion.trim()}
        class="px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2 shadow-md">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        {nlqLoading ? 'Thinking...' : 'Ask'}
      </button>
    </div>

    <!-- Suggested questions -->
    <div class="flex flex-wrap gap-2 mb-6">
      {#each ['How did each university perform last week?', 'Which universities have the highest attendance?', 'Show me overdue tasks', 'Compare session rates across universities this month', 'Which university has the most at-risk students?', 'Show instructor leave trends'] as suggestion}
        <button
          onclick={() => { nlqQuestion = suggestion; askAI(); }}
          class="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-gray-400 rounded-full transition-colors"
        >{suggestion}</button>
      {/each}
    </div>

    {#if nlqLoading}
      <div class="flex items-center gap-3 py-8 justify-center">
        <div class="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <span class="text-gray-500">Analyzing your question...</span>
      </div>
    {/if}

    {#if nlqAnswer}
      <div class="glass rounded-2xl p-5 mb-4 border border-violet-200 dark:border-violet-800/50">
        <h4 class="text-sm font-black text-violet-600 dark:text-violet-400 mb-2 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          AI Answer
        </h4>
        <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{nlqAnswer}</div>
      </div>

      {#if nlqQuery}
        <button onclick={() => nlqShowQuery = !nlqShowQuery} class="text-xs text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 mb-2 flex items-center gap-1">
          <svg class="w-3 h-3 transition-transform {nlqShowQuery ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          {nlqShowQuery ? 'Hide' : 'Show'} generated SQL
        </button>
        {#if nlqShowQuery}
          <pre class="glass rounded-xl p-3 text-xs text-gray-500 dark:text-gray-400 font-mono overflow-x-auto mb-4 border border-gray-200 dark:border-slate-700">{nlqQuery}</pre>
        {/if}
      {/if}

      {#if nlqData?.length}
        <div class="glass rounded-2xl overflow-hidden overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-gray-200 dark:border-slate-700">
              {#each Object.keys(nlqData[0]) as col}
                <th class="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{col.replace(/_/g, ' ')}</th>
              {/each}
            </tr></thead>
            <tbody>
              {#each nlqData.slice(0, 50) as row}
                <tr class="border-b border-gray-100 dark:border-slate-800/50 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                  {#each Object.values(row) as val}
                    <td class="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{val != null ? val : '—'}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if nlqData.length > 50}
          <p class="text-xs text-gray-500 mt-2">Showing 50 of {nlqData.length} rows</p>
        {/if}
      {/if}
    {/if}
  </div>

  {/if}
</div>
