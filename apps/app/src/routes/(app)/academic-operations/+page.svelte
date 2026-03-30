<script lang="ts">
  import { fade, fly } from "svelte/transition";
  let { data } = $props();

  const { stats, todaysSessions, alerts, userRole } = $derived(data);

  const statCards = $derived([
    {
      label: "Today's Sessions",
      value: stats.todaysSessions,
      sub: stats.todaysSessions === 0 ? "No sessions today" : `${stats.todaysSessions} scheduled`,
      color: "from-blue-500 to-indigo-600",
      icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    },
    {
      label: "Staff on Leave",
      value: stats.staffOnLeave,
      sub: stats.staffOnLeave === 0 ? "Full attendance" : `${stats.staffOnLeave} absent today`,
      color: "from-amber-400 to-orange-500",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    },
    {
      label: "Open Conflicts",
      value: stats.openConflicts,
      sub: stats.openConflicts === 0 ? "No conflicts" : `${stats.openConflicts} need resolution`,
      color: stats.openConflicts > 0 ? "from-rose-500 to-red-600" : "from-emerald-400 to-teal-500",
      icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
    },
    {
      label: "Syllabus Coverage",
      value: stats.syllabusPercent + "%",
      sub: stats.syllabusPercent === 0 ? "No data yet" : stats.syllabusPercent >= 75 ? "On track" : "Needs attention",
      color: stats.syllabusPercent >= 75 ? "from-emerald-400 to-teal-500" : "from-amber-400 to-orange-500",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    }
  ]);

  function statusColor(status: string) {
    switch (status?.toUpperCase()) {
      case 'IN_PROGRESS': return 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'COMPLETED': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'CANCELLED': return 'bg-gray-50 dark:bg-gray-500/10 text-gray-500 dark:text-gray-400';
      default: return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    }
  }

  function statusLabel(status: string) {
    switch (status?.toUpperCase()) {
      case 'IN_PROGRESS': return 'In Progress';
      case 'COMPLETED': return 'Completed';
      case 'CANCELLED': return 'Cancelled';
      default: return 'Scheduled';
    }
  }
</script>

<div class="space-y-8" in:fade>
  <!-- Stats Grid — Real Data -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#each statCards as stat, i}
      <div
        class="relative group overflow-hidden p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500"
        in:fly={{ y: 20, delay: i * 80 }}
      >
        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={stat.icon} />
          </svg>
        </div>

        <div class="flex items-center gap-4 mb-4">
          <div class="p-3 rounded-2xl bg-gradient-to-br {stat.color} text-white shadow-lg">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={stat.icon} />
            </svg>
          </div>
          <p class="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{stat.label}</p>
        </div>

        <div class="flex items-end justify-between">
          <h2 class="text-4xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</h2>
          <span class="text-sm font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 px-3 py-1 rounded-full">{stat.sub}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Today's Sessions -->
    <div class="lg:col-span-2 space-y-6">
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Today's <span class="text-indigo-600">Sessions</span>
            </h2>
            <p class="text-sm text-gray-500 font-medium mt-1">
              {#if todaysSessions.length > 0}
                {todaysSessions.length} session{todaysSessions.length !== 1 ? 's' : ''} across all departments
              {:else}
                No sessions scheduled for today
              {/if}
            </p>
          </div>
          <a
            href="/academic-operations/scheduling"
            class="px-6 py-2.5 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-900 dark:text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95"
          >
            Full Schedule
          </a>
        </div>

        <div class="space-y-4">
          {#if todaysSessions.length === 0}
            <div class="py-16 flex flex-col items-center justify-center text-center opacity-40">
              <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                <svg class="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <p class="text-sm font-black text-gray-900 dark:text-white">No sessions today</p>
              <p class="text-xs text-gray-400 font-medium mt-1">Upload a timetable to see live sessions here</p>
              <a
                href="/academic-operations/scheduling/upload"
                class="mt-4 px-5 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all"
              >
                Upload Timetable
              </a>
            </div>
          {:else}
            {#each todaysSessions as session, i}
              <div
                class="flex items-center gap-6 p-5 bg-gray-50/50 dark:bg-slate-800/30 rounded-3xl border border-transparent hover:border-indigo-500/30 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group"
                in:fly={{ y: 10, delay: i * 60 }}
              >
                <div class="w-20 text-center shrink-0">
                  <p class="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Starts</p>
                  <p class="text-base font-black text-gray-900 dark:text-white leading-tight">{session.start_time}</p>
                  <p class="text-[9px] font-bold text-gray-400">{session.end_time}</p>
                </div>
                <div class="h-10 w-[2px] bg-gray-200 dark:bg-slate-700 shrink-0"></div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors truncate">{session.subject_name}</h3>
                  <p class="text-xs text-gray-500 font-bold mt-0.5">
                    {session.section_name}
                    {#if session.room_name} · {session.room_name}{/if}
                    {#if session.faculty_name} · {session.faculty_name}{/if}
                  </p>
                </div>
                <div class="shrink-0">
                  <span class="px-3 py-1.5 rounded-xl {statusColor(session.status)} text-[10px] font-black uppercase tracking-widest">
                    {statusLabel(session.status)}
                  </span>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- Right Column: Alerts & Quick Actions -->
    <div class="space-y-8">
      <!-- Live Alerts -->
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <h2 class="text-xl font-black text-gray-900 dark:text-white tracking-tight mb-6">
          Execution <span class="text-rose-500">Alerts</span>
        </h2>

        <div class="space-y-6">
          {#if alerts.length === 0}
            <div class="py-8 flex flex-col items-center text-center opacity-40">
              <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p class="text-xs font-black text-gray-600 dark:text-gray-400">All Clear</p>
              <p class="text-[10px] text-gray-400 mt-1">No open conflicts or pending leave</p>
            </div>
          {:else}
            {#each alerts as alert}
              <div
                class="relative pl-6 border-l-2 {alert.type === 'error' ? 'border-rose-500' : alert.type === 'warning' ? 'border-amber-500' : 'border-blue-500'}"
              >
                <h4 class="text-sm font-black text-gray-900 dark:text-white capitalize">{alert.title}</h4>
                <p class="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{alert.message}</p>
                <p class="text-[10px] text-gray-400 font-bold mt-2 uppercase tracking-widest">{alert.time}</p>
              </div>
            {/each}
          {/if}
        </div>

        {#if stats.openConflicts > 0}
          <a
            href="/academic-operations/scheduling/conflicts"
            class="w-full mt-8 py-4 bg-gray-950 dark:bg-white text-white dark:text-gray-950 text-[10px] font-black uppercase tracking-[0.2em] rounded-[1.5rem] hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-black/10 flex items-center justify-center"
          >
            Resolve {stats.openConflicts} Conflict{stats.openConflicts !== 1 ? 's' : ''}
          </a>
        {/if}
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-4">
        <a
          href="/academic-operations/scheduling/upload"
          class="flex flex-col items-center justify-center p-6 bg-indigo-50 dark:bg-indigo-500/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-500/20 group hover:bg-indigo-600 transition-all duration-300"
        >
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 text-indigo-600 group-hover:text-white group-hover:bg-indigo-500 shadow-sm transition-all">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
            </svg>
          </div>
          <span class="text-[10px] font-black text-indigo-900 dark:text-indigo-100 group-hover:text-white uppercase tracking-widest mt-3 text-center">Upload Timetable</span>
        </a>

        <a
          href="/academic-operations/examinations"
          class="flex flex-col items-center justify-center p-6 bg-violet-50 dark:bg-violet-500/10 rounded-[2rem] border border-violet-100 dark:border-violet-500/20 group hover:bg-violet-600 transition-all duration-300"
        >
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 text-violet-600 group-hover:text-white group-hover:bg-violet-500 shadow-sm transition-all">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
          <span class="text-[10px] font-black text-violet-900 dark:text-violet-100 group-hover:text-white uppercase tracking-widest mt-3 text-center">Plan Exams</span>
        </a>
      </div>
    </div>
  </div>

  <!-- Module Explorer -->
  <div class="space-y-6 pt-10 border-t border-gray-100 dark:border-slate-800">
    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
      Academic <span class="text-violet-600">Modules</span>
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <a href="/academic-operations/scheduling" class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
        <div class="p-4 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-3xl w-fit mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <h4 class="font-black text-gray-900 dark:text-white">Scheduling</h4>
        <p class="text-xs text-gray-500 mt-2">Timetables, faculty leaves, room allocations.</p>
      </a>

      <a href="/academic-operations/examinations" class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
        <div class="p-4 bg-violet-50 dark:bg-violet-500/10 text-violet-600 rounded-3xl w-fit mb-6 group-hover:bg-violet-600 group-hover:text-white transition-all">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <h4 class="font-black text-gray-900 dark:text-white">Examinations</h4>
        <p class="text-xs text-gray-500 mt-2">Exam plans, seating, marks, results.</p>
      </a>

      <a href="/academic-operations/student-ops" class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
        <div class="p-4 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-3xl w-fit mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-all">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
          </svg>
        </div>
        <h4 class="font-black text-gray-900 dark:text-white">Student Ops</h4>
        <p class="text-xs text-gray-500 mt-2">Attendance, onboarding, student profiles.</p>
      </a>

    </div>
  </div>
</div>
