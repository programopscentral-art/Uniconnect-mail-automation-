<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
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
            case 'SENT': return 'bg-blue-100 text-blue-700';
            case 'OPENED': return 'bg-yellow-100 text-yellow-700';
            case 'ACKNOWLEDGED': return 'bg-green-100 text-green-700';
            case 'FAILED': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    }
</script>

<div class="space-y-6" in:fade>
    <div class="flex justify-between items-center">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Mail Audit Log</h1>
            <p class="mt-1 text-sm text-gray-500">Track and monitor all outgoing system communications.</p>
        </div>

        {#if (data.user?.role as any) === 'ADMIN' || (data.user?.role as any) === 'PROGRAM_OPS'}
            <div class="flex items-center gap-3">
                <select 
                    bind:value={universityId} 
                    onchange={fetchLogs}
                    class="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-blue-50 transition-all"
                >
                    <option value="">All Universities</option>
                    {#each data.universities || [] as univ}
                        <option value={univ.id}>{univ.name}</option>
                    {/each}
                </select>
            </div>
        {/if}
    </div>

    <div class="bg-white rounded-[32px] shadow-floating border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-100">
                <thead>
                    <tr class="bg-gray-50/50">
                        <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Sent At</th>
                        <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Recipient</th>
                        <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                        <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Campaign / Univ</th>
                        <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Sender</th>
                        <th class="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Interactions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                    {#if isLoading}
                        {#each Array(5) as _}
                            <tr class="animate-pulse">
                                <td colspan="6" class="px-6 py-4"><div class="h-4 bg-gray-100 rounded-lg w-full"></div></td>
                            </tr>
                        {/each}
                    {:else if logs.length === 0}
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-sm text-gray-400">No logs found.</td>
                        </tr>
                    {:else}
                        {#each logs as log}
                            <tr class="hover:bg-blue-50/30 transition-colors group">
                                <td class="px-6 py-4 whitespace-nowrap text-xs font-medium text-gray-600">
                                    {log.sent_at ? new Date(log.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-sm font-bold text-gray-900">{log.to_email}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider {getStatusColor(log.status)}">
                                        {log.status}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="text-xs font-bold text-gray-800">{log.campaign_name}</div>
                                    <div class="text-[10px] text-indigo-400 font-bold uppercase mt-0.5">@{log.university_name}</div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-medium">
                                    {log.sender_email}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="flex items-center gap-4">
                                        {#if log.opened_at}
                                            <div class="text-[10px] group-hover:text-blue-600 transition-colors">
                                                <span class="font-black">O</span> Opened {new Date(log.opened_at).toLocaleDateString()}
                                            </div>
                                        {/if}
                                        {#if log.acknowledged_at}
                                            <div class="text-[10px] group-hover:text-green-600 transition-colors">
                                                <span class="font-black">A</span> Ack'd {new Date(log.acknowledged_at).toLocaleDateString()}
                                            </div>
                                        {/if}
                                        {#if !log.opened_at && !log.acknowledged_at}
                                            <span class="text-[10px] text-gray-300">No interaction</span>
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
            <div class="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div class="text-xs text-gray-500 font-medium">
                    Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} logs
                </div>
                <div class="flex gap-2">
                    <button 
                        onclick={() => { offset = Math.max(0, offset - limit); fetchLogs(); }}
                        disabled={offset === 0}
                        class="px-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm"
                    >
                        Previous
                    </button>
                    <button 
                        onclick={() => { offset += limit; fetchLogs(); }}
                        disabled={offset + limit >= total}
                        class="px-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm"
                    >
                        Next
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>
