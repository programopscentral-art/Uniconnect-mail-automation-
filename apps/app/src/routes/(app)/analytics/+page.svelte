<script lang="ts">
  import { goto } from "$app/navigation";
  // @ts-ignore
  let { data } = $props();

  let selectedDate = $state<string>("");
  let selectedUniversity = $state<string>("ALL");

  $effect.pre(() => {
    selectedDate = data.selectedDate;
    selectedUniversity = data.selectedUniversity;
  });

  function onChange() {
    goto(`?date=${selectedDate}&universityId=${selectedUniversity}`);
  }

  const last7Days = $derived.by(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      const dateStr = d.toISOString().split("T")[0];

      const dayData = data.weeklyReport.filter((r: any) => {
        const rDate = new Date(r.day).toISOString().split("T")[0];
        return rDate === dateStr;
      });

      days.push({
        label,
        count: dayData.reduce(
          (acc: number, cur: any) => acc + parseInt(cur.completed_count),
          0,
        ),
      });
    }
    return days;
  });

  function getMaxScale(count: number) {
    const max = Math.max(...last7Days.map((d) => d.count), 1);
    return Math.max((count / max) * 100, 5); // Minimum 5% height for visibility
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1
        class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight"
      >
        Analytics & Reports
      </h1>
      <p class="text-gray-500 dark:text-slate-400 mt-1">
        Comprehensive performance data for {new Date(
          data.report.date,
        ).toLocaleDateString()}.
      </p>
    </div>

    <div
      class="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800"
    >
      <div class="flex items-center space-x-2 px-2">
        <span class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Date</span>
        <input
          type="date"
          bind:value={selectedDate}
          onchange={onChange}
          class="block pl-3 pr-4 py-2 text-sm border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-blue-500 rounded-lg bg-gray-50 dark:bg-slate-800 font-bold text-gray-900 dark:text-white"
        />
      </div>

      {#if data.universities?.length > 0}
        <div class="h-8 w-px bg-gray-100 dark:bg-slate-800 mx-2"></div>
        <div class="flex items-center space-x-2 px-2">
          <span class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Scope</span>
          <select
            bind:value={selectedUniversity}
            onchange={onChange}
            class="block pl-3 pr-8 py-2 text-sm border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-blue-500 rounded-lg bg-gray-50 dark:bg-slate-800 font-bold text-gray-900 dark:text-white appearance-none cursor-pointer"
          >
            <option value="ALL">ALL UNIVERSITIES & TEAMS</option>
            {#each data.universities as univ}
              <option value={univ.id}>{univ.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>
  </div>

  <!-- Weekly Performance Report -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div
      class="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm"
    >
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-xl font-black text-gray-900 dark:text-white">
          Weekly Activity
        </h2>
        <span class="text-[10px] font-black text-indigo-500 uppercase px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-md">Last 7 Days</span>
      </div>
      <div class="flex items-end justify-between h-48 gap-3 px-2">
        {#each last7Days as day}
          <div class="flex-1 flex flex-col items-center gap-3 group">
            <div
              class="w-full bg-indigo-100 dark:bg-indigo-900/30 rounded-t-2xl relative overflow-hidden flex flex-col justify-end transition-all duration-500 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/40"
              style="height: {getMaxScale(day.count)}%"
            >
              <div
                class="absolute inset-0 bg-gradient-to-t from-indigo-500 to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
              ></div>
              <div
                class="text-[11px] font-black text-indigo-600 dark:text-indigo-400 text-center mb-2 z-10 group-hover:text-white transition-colors"
              >
                {day.count}
              </div>
            </div>
            <div
              class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest"
            >
              {day.label}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div
      class="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-gray-100 dark:border-slate-800 shadow-sm"
    >
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-xl font-black text-gray-900 dark:text-white">
          Average Efficiency
        </h2>
        <span class="text-[10px] font-black text-amber-500 uppercase px-2 py-1 bg-amber-50 dark:bg-amber-900/30 rounded-md">Time Taken</span>
      </div>
      <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8 opacity-60">
        Average hours taken per completion (7d)
      </p>
      <div class="space-y-6">
        {#each data.weeklyReport.slice(-5) as item}
          <div class="flex items-center gap-4 group">
            <div
              class="w-16 text-[10px] font-black text-gray-400 group-hover:text-amber-500 transition-colors uppercase tracking-widest"
            >
              {new Date(item.day).toLocaleDateString(undefined, {
                weekday: "short",
              })}
            </div>
            <div
              class="flex-1 h-3 bg-gray-50 dark:bg-slate-800/50 rounded-full overflow-hidden shadow-inner p-0.5"
            >
              <div
                class="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                style="width: {Math.min(item.avg_hours_taken * 8, 100)}%"
              ></div>
            </div>
            <div
              class="w-14 text-sm font-black text-amber-600 dark:text-amber-400 text-right tabular-nums"
            >
              {Number(item.avg_hours_taken || 0).toFixed(1)}h
            </div>
          </div>
        {:else}
           <div class="flex flex-col items-center justify-center py-10 opacity-30">
              <svg class="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-[10px] font-black uppercase">No Data Tracked</span>
           </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Team Reports Table -->
  <div
    class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden"
  >
    <div
      class="px-8 py-6 border-b border-gray-50 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50"
    >
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">
        Task Completion Report
      </h2>
      <div class="flex items-center space-x-2">
        <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
        <span
          class="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase"
          >Live Updates</span
        >
      </div>
    </div>

    <table class="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
      <thead>
        <tr class="bg-white dark:bg-slate-900">
          <th
            class="px-8 py-4 text-left text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest"
            >Team Member</th
          >
          <th
            class="px-8 py-4 text-left text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest"
            >Progress</th
          >
          <th
            class="px-8 py-4 text-left text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest"
            >Efficiency</th
          >
          <th
            class="px-8 py-4 text-left text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest"
            >Tasks</th
          >
          <th
            class="px-8 py-4 text-left text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest"
            >Rating</th
          >
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-slate-800/50">
        {#each data.report.user_reports as item}
          <tr
            class="hover:bg-gray-50/80 dark:hover:bg-slate-950/80 transition-all"
          >
            <td class="px-8 py-5">
              <div class="flex items-center">
                <div
                  class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm mr-3 shadow-md"
                >
                  {item.user_name?.[0] || "U"}
                </div>
                <div>
                  <div class="font-bold text-gray-900 dark:text-gray-100">
                    {item.user_name}
                  </div>
                  <div
                    class="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider font-bold"
                  >
                    Team Member
                  </div>
                </div>
              </div>
            </td>
            <td class="px-8 py-5">
              <div
                class="w-full max-w-xs h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner"
              >
                <div
                  class="h-full bg-gradient-to-r from-blue-400 to-indigo-600 transition-all duration-1000 shadow-lg shadow-blue-500/20"
                  style="width: {item.total_tasks > 0
                    ? (item.completed_tasks / item.total_tasks) * 100
                    : 0}%"
                ></div>
              </div>
            </td>
            <td class="px-8 py-5">
              <span
                class="font-black text-indigo-600 dark:text-indigo-400 block text-lg"
              >
                {item.total_tasks > 0
                  ? Math.round((item.completed_tasks / item.total_tasks) * 100)
                  : 0}%
              </span>
            </td>
            <td class="px-8 py-5">
              <span
                class="px-3 py-1 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm font-bold text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700"
              >
                {item.completed_tasks} / {item.total_tasks}
              </span>
            </td>
            <td class="px-8 py-5">
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/10 transition-transform hover:scale-110
                {item.rating === 'S' ? 'bg-gradient-to-br from-amber-400 to-amber-600 ring-2 ring-amber-200 ring-offset-2 dark:ring-amber-900/40' : 
                 item.rating === 'A' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 ring-2 ring-emerald-200 ring-offset-2 dark:ring-emerald-900/40' : 
                 item.rating === 'B' ? 'bg-gradient-to-br from-blue-400 to-blue-600 ring-2 ring-blue-200 ring-offset-2 dark:ring-blue-900/40' : 
                 'bg-gradient-to-br from-gray-400 to-gray-600 ring-2 ring-gray-200 ring-offset-2 dark:ring-gray-900/40'}"
              >
                {item.rating}
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="px-8 py-24 text-center">
              <div class="max-w-xs mx-auto opacity-50">
                <div
                  class="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400 dark:text-slate-500"
                >
                  <svg
                    class="h-10 w-10"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                  No Data Available
                </h3>
                <p class="text-gray-500 dark:text-slate-400 mt-2">
                  There is no activity recorded for this date.
                </p>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
