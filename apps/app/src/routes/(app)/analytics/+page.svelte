<script lang="ts">
    import { goto } from '$app/navigation';
    // @ts-ignore
    let { data } = $props();

  let selectedDate = $state<string>('');

  $effect.pre(() => {
    selectedDate = data.selectedDate;
  });

    function onDateChange() {
        goto(`?date=${selectedDate}`);
    }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-bold dark:text-white tracking-tight">Analytics & Reports</h1>
            <p class="text-gray-500 mt-1">Comprehensive performance data for {new Date(data.report.date).toLocaleDateString()}.</p>
        </div>
        
        <div class="flex items-center space-x-3 bg-white dark:bg-slate-900 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <span class="text-sm font-bold text-gray-700 dark:text-slate-400 ml-2">Select Date:</span>
            <input 
                type="date" 
                bind:value={selectedDate} 
                onchange={onDateChange}
                class="block pl-3 pr-4 py-2 text-sm border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-blue-500 rounded-lg bg-gray-50 dark:bg-slate-800 font-bold text-gray-900 dark:text-white"
            >
        </div>
    </div>

    <!-- Team Reports Table -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div class="px-8 py-6 border-b border-gray-50 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Task Completion Report</h2>
            <div class="flex items-center space-x-2">
                <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                <span class="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase">Live Updates</span>
            </div>
        </div>
        
        <table class="min-w-full divide-y divide-gray-100">
            <thead>
                <tr class="bg-white">
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Team Member</th>
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Progress</th>
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Efficiency</th>
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Tasks</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                {#each data.report.user_reports as item}
                    <tr class="hover:bg-gray-50/80 dark:hover:bg-slate-950/80 transition-all">
                        <td class="px-8 py-5">
                            <div class="flex items-center">
                                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm mr-3 shadow-md">
                                    {item.user_name?.[0] || 'U'}
                                </div>
                                <div>
                                    <div class="font-bold text-gray-900">{item.user_name}</div>
                                    <div class="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Team Member</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-8 py-5">
                            <div class="w-full max-w-xs h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                <div 
                                    class="h-full bg-gradient-to-r from-blue-400 to-indigo-600 transition-all duration-1000" 
                                    style="width: {item.total_tasks > 0 ? (item.completed_tasks / item.total_tasks) * 100 : 0}%"
                                ></div>
                            </div>
                        </td>
                        <td class="px-8 py-5">
                            <span class="font-black text-indigo-600 block text-lg">
                                {item.total_tasks > 0 ? Math.round((item.completed_tasks / item.total_tasks) * 100) : 0}%
                            </span>
                        </td>
                        <td class="px-8 py-5">
                            <span class="px-3 py-1 bg-gray-100 rounded-lg text-sm font-bold text-gray-600 border border-gray-200">
                                {item.completed_tasks} / {item.total_tasks}
                            </span>
                        </td>
                    </tr>
                {:else}
                    <tr>
                        <td colspan="4" class="px-8 py-24 text-center">
                            <div class="max-w-xs mx-auto opacity-50">
                                <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
                                     <svg class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h3 class="text-xl font-bold text-gray-900">No Data Available</h3>
                                <p class="text-gray-500 mt-2">There is no activity recorded for this date.</p>
                            </div>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>
