<script lang="ts">
    import { goto } from '$app/navigation';
    // @ts-ignore
    let { data } = $props();

    let selectedDate = $state(data.selectedDate);

    function onDateChange() {
        goto(`?date=${selectedDate}`);
    }

    const campaignStats = [
        { label: 'Total Sent', value: data.report.campaign_summary.total_sent, color: 'text-green-600', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        { label: 'Total Failed', value: data.report.campaign_summary.total_failed, color: 'text-red-600', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        { label: 'Total Opened', value: data.report.campaign_summary.total_opened, color: 'text-purple-600', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' }
    ];
</script>

<div class="space-y-8">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-black text-gray-900 tracking-tight">Day Plan Report</h1>
            <p class="text-gray-500 mt-1">Team-wide performance summary for {new Date(data.report.date).toLocaleDateString()}.</p>
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
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        {#each campaignStats as stat}
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">{stat.label}</span>
                    <svg class="h-5 w-5 {stat.color} opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={stat.icon} />
                    </svg>
                </div>
                <p class="text-3xl font-black text-gray-900">{stat.value.toLocaleString()}</p>
                <p class="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">Across all universities</p>
            </div>
        {/each}
    </div>

    <!-- Team Reports Table -->
    <div class="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
            <h2 class="text-xl font-bold text-gray-900">User Productivity</h2>
            <div class="flex items-center space-x-2">
                <span class="w-3 h-3 bg-green-500 rounded-full"></span>
                <span class="text-xs font-bold text-gray-500 uppercase">Live Team Tracking</span>
            </div>
        </div>
        
        <table class="min-w-full divide-y divide-gray-100">
            <thead>
                <tr class="bg-white">
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Team Member</th>
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Progress</th>
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Completion</th>
                    <th class="px-8 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Tasks</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                {#each data.report.user_reports as item}
                    <tr class="hover:bg-gray-50/80 transition-all">
                        <td class="px-8 py-5">
                            <div class="flex items-center">
                                <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-black text-sm mr-3">
                                    {item.user_name?.[0] || 'U'}
                                </div>
                                <span class="font-bold text-gray-900">{item.user_name}</span>
                            </div>
                        </td>
                        <td class="px-8 py-5">
                            <div class="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                    class="h-full bg-blue-600 transition-all duration-700" 
                                    style="width: {item.total_tasks > 0 ? (item.completed_tasks / item.total_tasks) * 100 : 0}%"
                                ></div>
                            </div>
                        </td>
                        <td class="px-8 py-5">
                            <span class="font-black text-blue-600 block">
                                {item.total_tasks > 0 ? Math.round((item.completed_tasks / item.total_tasks) * 100) : 0}%
                            </span>
                        </td>
                        <td class="px-8 py-5">
                            <span class="text-sm font-bold text-gray-500">
                                <span class="text-gray-900">{item.completed_tasks}</span> / {item.total_tasks}
                            </span>
                        </td>
                    </tr>
                {:else}
                    <tr>
                        <td colspan="4" class="px-8 py-16 text-center">
                            <div class="max-w-xs mx-auto">
                                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                    <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                </div>
                                <h3 class="font-bold text-gray-900">No Activity Logged</h3>
                                <p class="text-sm text-gray-500 mt-1">Team members haven't started their tasks for this date yet.</p>
                            </div>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>
