<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    // @ts-ignore
    let { data } = $props();

    let logs = $state<any[]>([]);
    let total = $state(0);
    let limit = $state(50);
    let offset = $state(0);
    let isLoading = $state(true);
    let universityId = $state((data.user?.university_id as string) || '');

    $effect(() => {
        universityId = (data.user?.university_id as string) || '';
    });

    async function fetchLogs() {
        isLoading = true;
        try {
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
            });
            if (universityId) params.append('university_id', universityId);

            const res = await fetch(`/api/mail-logs?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                logs = data.logs;
                total = data.total;
            }
        } catch (e) {
            console.error(e);
        } finally {
            isLoading = false;
        }
    }

    onMount(fetchLogs);

    function getStatusColor(status: string) {
        switch (status) {
            case 'SENT': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
            case 'OPENED': return 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300';
            case 'ACKNOWLEDGED': return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
            case 'FAILED': return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
            default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
        }
    }
</script>

<div class="space-y-8 animate-premium-fade">
    <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div class="animate-premium-slide">
            <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Mail Audit Log</h1>
            <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Track and monitor all outgoing system communications.</p>
        </div>

        {#if (data.user?.role as any) === 'ADMIN' || (data.user?.role as any) === 'PROGRAM_OPS'}
            <div class="flex items-center gap-4 w-full lg:w-auto animate-premium-slide" style="animation-delay: 100ms;">
                <label for="univ-select" class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest whitespace-nowrap hidden sm:block">Filter by Node:</label>
                <select 
                    id="univ-select"
                    bind:value={universityId} 
                    onchange={fetchLogs}
                    class="flex-1 lg:w-64 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all text-gray-900 dark:text-white"
                >
                    <option value="">All Institutional Nodes</option>
                    {#each data.universities || [] as univ}
                        <option value={univ.id}>{univ.name}</option>
                    {/each}
                </select>
            </div>
        {/if}
    </div>

    <div class="glass overflow-hidden rounded-[2.5rem] animate-premium-slide" style="animation-delay: 200ms;">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                <thead class="bg-gray-50/50 dark:bg-gray-800/50">
                    <tr>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sent Chronology</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Recipient Identity</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Delivery Status</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Campaign Context</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sender Authority</th>
                        <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Engagement Matrix</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {#if isLoading}
                        {#each Array(5) as _, i}
                            <tr class="animate-pulse">
                                <td colspan="6" class="px-8 py-6"><div class="h-8 bg-gray-100 dark:bg-gray-800 rounded-xl w-full"></div></td>
                            </tr>
                        {/each}
                    {:else if logs.length === 0}
                        <tr>
                            <td colspan="6" class="px-8 py-20 text-center">
                                <div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 space-y-4">
                                     <div class="w-16 h-16 rounded-3xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
                                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                     </div>
                                     <p class="text-[10px] font-black uppercase tracking-[0.2em]">No audit entries detected.</p>
                                </div>
                            </td>
                        </tr>
                    {:else}
                        {#each logs as log, i}
                            <tr class="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                                <td class="px-8 py-6 whitespace-nowrap">
                                    <div class="text-[11px] font-black text-gray-500 dark:text-gray-400 font-mono uppercase italic tracking-tighter">
                                        {log.sent_at ? new Date(log.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '---'}
                                    </div>
                                </td>
                                <td class="px-8 py-6 whitespace-nowrap">
                                    <div class="text-sm font-bold text-gray-900 dark:text-white">{log.to_email}</div>
                                </td>
                                <td class="px-8 py-6 whitespace-nowrap">
                                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest {getStatusColor(log.status)}">
                                        {log.status}
                                    </span>
                                </td>
                                <td class="px-8 py-6 whitespace-nowrap">
                                    <div class="text-xs font-bold text-gray-800 dark:text-gray-200">{log.campaign_name}</div>
                                    <div class="text-[9px] text-indigo-500 dark:text-indigo-400 font-black uppercase mt-1 tracking-tighter italic">@{log.university_name}</div>
                                </td>
                                <td class="px-8 py-6 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400 font-medium">
                                    {log.sender_email}
                                </td>
                                <td class="px-8 py-6 whitespace-nowrap">
                                    <div class="flex items-center gap-3">
                                        {#if log.opened_at}
                                            <div class="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                                <div class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                                Opened {new Date(log.opened_at).toLocaleDateString()}
                                            </div>
                                        {/if}
                                        {#if log.acknowledged_at}
                                            <div class="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
                                                <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                                Ack'd {new Date(log.acknowledged_at).toLocaleDateString()}
                                            </div>
                                        {/if}
                                        {#if !log.opened_at && !log.acknowledged_at}
                                            <span class="text-[9px] font-black uppercase tracking-widest text-gray-300 dark:text-gray-700 italic">No Interaction</span>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>
        </div>

        {#if total > limit}
            <div class="px-8 py-6 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div class="text-[10px] text-gray-500 dark:text-gray-400 font-black uppercase tracking-widest">
                    Showing {offset + 1} - {Math.min(offset + limit, total)} <span class="text-indigo-500 px-1">/</span> Total {total}
                </div>
                <div class="flex gap-3">
                    <button 
                        onclick={() => { offset = Math.max(0, offset - limit); fetchLogs(); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                        disabled={offset === 0}
                        class="px-5 py-2.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-all shadow-sm active:scale-95"
                    >
                        Previous
                    </button>
                    <button 
                        onclick={() => { offset += limit; fetchLogs(); window.scrollTo({top: 0, behavior: 'smooth'}); }}
                        disabled={offset + limit >= total}
                        class="px-5 py-2.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 transition-all shadow-sm active:scale-95"
                    >
                        Next
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>
