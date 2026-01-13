<script lang="ts">
    import { goto } from '$app/navigation';
    // @ts-ignore
    let { data } = $props();

  let selectedDate = $state(data.selectedDate);

  $effect(() => {
    selectedDate = data.selectedDate;
  });

    function onDateChange() {
        goto(`?date=${selectedDate}`);
    }

    const campaignStats = $derived([
        { label: 'Total Sent', value: data.report.campaign_summary.total_sent, color: 'text-green-600', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        { label: 'Total Failed', value: data.report.campaign_summary.total_failed, color: 'text-red-600', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        { label: 'Total Opened', value: data.report.campaign_summary.total_opened, color: 'text-purple-600', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' }
    ]);
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-black text-gray-900 tracking-tight">Analytics & Reports</h1>
            <p class="text-gray-500 mt-1">Comprehensive performance data for {new Date(data.report.date).toLocaleDateString()}.</p>
        </div>
        
        <div class="flex items-center space-x-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
            <span class="text-sm font-bold text-gray-700 ml-2">Select Date:</span>
            <input 
                type="date" 
                bind:value={selectedDate} 
                onchange={onDateChange}
                class="block pl-3 pr-4 py-2 text-sm border-gray-200 focus:outline-none focus:ring-blue-500 rounded-lg bg-gray-50 font-bold"
            >
        </div>
    </div>

    <!-- Campaign Summary Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        {#each campaignStats as stat}
            <div class="bg-white rounded-[32px] shadow-floating border border-gray-100 p-8 flex items-center space-x-6 hover:-translate-y-1 transition-all duration-300">
                <div class="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <svg class="h-10 w-10 {stat.color}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={stat.icon} />
                    </svg>
                </div>
                <div>
                    <p class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 opacity-60">{stat.label}</p>
                    <p class="text-4xl font-black text-gray-900 leading-tight">{stat.value.toLocaleString()}</p>
                </div>
            </div>
        {/each}
    </div>

    <!-- Team Reports Table -->
    <div class="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
            <h2 class="text-xl font-bold text-gray-900">Task Completion Report</h2>
            <div class="flex items-center space-x-2">
                <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                <span class="text-xs font-bold text-gray-500 uppercase">Live Updates</span>
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
                    <tr class="hover:bg-gray-50/80 transition-all">
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
