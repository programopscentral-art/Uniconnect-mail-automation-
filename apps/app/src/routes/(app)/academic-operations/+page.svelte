<script lang="ts">
  import { fade, fly } from "svelte/transition";
  let { data } = $props();

  const { stats, alerts, userRole } = $derived(data);

  const statCards = $derived([
    {
      label: "Staff on Leave",
      value: stats.staffOnLeave,
      sub: stats.staffOnLeave === 0 ? "Full attendance" : `${stats.staffOnLeave} absent today`,
      color: "from-amber-400 to-orange-500",
      icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    },
    {
      label: "Syllabus Coverage",
      value: stats.syllabusPercent + "%",
      sub: stats.syllabusPercent === 0 ? "No data yet" : stats.syllabusPercent >= 75 ? "On track" : "Needs attention",
      color: stats.syllabusPercent >= 75 ? "from-emerald-400 to-teal-500" : "from-amber-400 to-orange-500",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    }
  ]);

</script>

<div class="space-y-8" in:fade>
  <!-- Stats Grid — Real Data -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    <!-- Overview Panel -->
    <div class="lg:col-span-2 space-y-6">
      <div class="p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-4">
          Academic <span class="text-indigo-600">Overview</span>
        </h2>
        <p class="text-sm text-gray-500 font-medium mb-6">
          Manage examinations, faculty workflows, and student operations from this hub.
        </p>
        <div class="grid grid-cols-2 gap-4">
          <a href="/academic-operations/examinations" class="p-5 bg-violet-50 dark:bg-violet-500/10 rounded-2xl border border-violet-100 dark:border-violet-500/20 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-all">
            <h3 class="font-black text-violet-700 dark:text-violet-300 text-sm">Examinations</h3>
            <p class="text-xs text-gray-500 mt-1">Exam plans, seating, marks & results</p>
          </a>
          <a href="/academic-operations/faculty-ops" class="p-5 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-100 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all">
            <h3 class="font-black text-amber-700 dark:text-amber-300 text-sm">Faculty Ops</h3>
            <p class="text-xs text-gray-500 mt-1">Leave management & faculty profiles</p>
          </a>
          <a href="/academic-operations/student-ops" class="p-5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all">
            <h3 class="font-black text-emerald-700 dark:text-emerald-300 text-sm">Student Ops</h3>
            <p class="text-xs text-gray-500 mt-1">Attendance, onboarding & profiles</p>
          </a>
          <a href="/academic-operations/setup" class="p-5 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">
            <h3 class="font-black text-gray-700 dark:text-gray-300 text-sm">Setup & Config</h3>
            <p class="text-xs text-gray-500 mt-1">Subjects, batches, branches & more</p>
          </a>
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

      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-4">
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

        <a
          href="/academic-operations/faculty-ops"
          class="flex flex-col items-center justify-center p-6 bg-amber-50 dark:bg-amber-500/10 rounded-[2rem] border border-amber-100 dark:border-amber-500/20 group hover:bg-amber-600 transition-all duration-300"
        >
          <div class="p-3 rounded-2xl bg-white dark:bg-slate-800 text-amber-600 group-hover:text-white group-hover:bg-amber-500 shadow-sm transition-all">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <span class="text-[10px] font-black text-amber-900 dark:text-amber-100 group-hover:text-white uppercase tracking-widest mt-3 text-center">Faculty Ops</span>
        </a>
      </div>
    </div>
  </div>

  <!-- Module Explorer -->
  <div class="space-y-6 pt-10 border-t border-gray-100 dark:border-slate-800">
    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
      Academic <span class="text-violet-600">Modules</span>
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
