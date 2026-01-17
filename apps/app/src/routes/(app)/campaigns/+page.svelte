<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state('');

  $effect.pre(() => {
    selectedUniversityId = data.selectedUniversityId || '';
  });
  let campaigns = $derived(data.campaigns);

  onMount(() => {
    const interval = setInterval(() => {
      // Refresh data if any campaign is in progress
      if (data.campaigns.some((c: any) => c.status === 'IN_PROGRESS' || c.status === 'PENDING')) {
        invalidateAll();
      }
    }, 5000);
    return () => clearInterval(interval);
  });

  function onUnivChange() {
      if (selectedUniversityId) goto(`?universityId=${selectedUniversityId}`);
      else goto('/campaigns');
  }

  async function deleteCampaign(id: string) {
      if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) return;
      try {
          const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
          if (res.ok) {
            invalidateAll();
          } else {
            const err = await res.json();
            alert(err.message || 'Failed to delete');
          }
      } catch (e) {
          alert('Error deleting campaign');
      }
  }

  function formatDate(date: any) {
    if (!date) return 'Unknown Date';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const groupedCampaigns = $derived.by(() => {
    const groups: Record<string, any[]> = {};
    const sorted = [...campaigns].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
    });
    
    sorted.forEach(c => {
      const dateStr = formatDate(c.created_at);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(c);
    });
    
    return Object.entries(groups);
  });
</script>

<div class="space-y-8 animate-premium-fade">
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
    <div class="animate-premium-slide">
      <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Campaigns</h1>
      <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">Monitor and execute institutional communication strategies.</p>
    </div>
    <a 
      href={selectedUniversityId ? `/campaigns/new?universityId=${selectedUniversityId}` : '#'}
      onclick={(e) => { if(!selectedUniversityId && (data.user?.permissions || []).includes('universities')) { e.preventDefault(); alert('Please select an institution first to initiate a campaign.'); } }}
      class="inline-flex items-center px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 animate-premium-slide"
      style="animation-delay: 100ms;"
    >
      <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
      Initialize Campaign
    </a>
  </div>

  {#if (data.user?.permissions || []).includes('universities') || data.universities.length > 1}
    <div class="glass p-6 rounded-[2.5rem] flex items-center gap-6 animate-premium-slide" style="animation-delay: 200ms;">
        <div class="hidden sm:flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </div>
            <label for="univ-select" class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Active Node</label>
        </div>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={onUnivChange}
            class="flex-1 max-w-md bg-white/50 dark:bg-slate-800/50 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all text-gray-900 dark:text-white"
        >
            <option value="">Global Hierarchy (All)</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="space-y-12">
    {#each groupedCampaigns as [date, items], i}
      <div class="space-y-6 animate-premium-slide" style="animation-delay: {300 + (i * 100)}ms;">
        <div class="flex items-center gap-6">
          <h2 class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] bg-indigo-50 dark:bg-indigo-900/30 px-5 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm">{date}</h2>
          <div class="h-px flex-1 bg-gray-100 dark:bg-slate-800"></div>
          <span class="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-widest italic">{items.length} Registered Tasks</span>
        </div>

        <div class="glass overflow-hidden rounded-[2.5rem]">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
              <thead class="bg-gray-50/50 dark:bg-slate-800/50">
                <tr>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Campaign Reference</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Operational State</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Blueprint Used</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Throughput</th>
                  <th class="px-8 py-5 text-right text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">System Control</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
                {#each items as cam}
                  <tr class="group hover:bg-slate-950/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td class="px-8 py-6 whitespace-normal max-w-xs">
                      <div class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{cam.name}</div>
                      <div class="text-[9px] font-black text-gray-400 dark:text-slate-400 mt-1 uppercase tracking-tighter italic">CRC: {cam.id.slice(0,8)}</div>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap">
                      <span class="px-4 py-1.5 text-[9px] font-black rounded-lg uppercase tracking-widest shadow-sm border
                        {cam.status === 'COMPLETED' ? 'bg-green-100 dark:bg-slate-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' : 
                         cam.status === 'FAILED' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' : 
                         cam.status === 'DRAFT' ? 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' : 
                         cam.status === 'STOPPED' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' :
                         'bg-indigo-600 text-white border-transparent animate-pulse animate-duration-1000'}">
                        {cam.status === 'IN_PROGRESS' ? 'PROCESSING' : cam.status === 'COMPLETED' ? 'EXECUTED' : cam.status}
                      </span>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap">
                      <div class="flex items-center text-xs font-bold text-gray-700 dark:text-gray-300">
                          <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          <span class="truncate max-w-[150px]">{cam.template_name}</span>
                      </div>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap">
                      <div class="flex items-center space-x-4">
                          <div class="flex-1 w-32 bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden shadow-inner">
                              <div class="bg-indigo-600 dark:bg-indigo-500 h-full transition-all duration-700 shadow-lg shadow-indigo-500/20" style="width: {(cam.sent_count / cam.total_recipients) * 100}%"></div>
                          </div>
                          <span class="text-[11px] font-black text-gray-900 dark:text-white font-mono tracking-tighter">
                            {cam.sent_count}<span class="text-gray-400 mx-1">/</span>{cam.total_recipients}
                          </span>
                      </div>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap text-right">
                      <div class="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                          <a 
                            href={`/campaigns/${cam.id}`} 
                            class="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all active:scale-90" 
                            title="Execution Matrix"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </a>
                          {#if cam.status === 'DRAFT' || cam.status === 'FAILED' || data.userRole === 'ADMIN'}
                              <button 
                                onclick={() => deleteCampaign(cam.id)} 
                                class="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90" 
                                title="Purge Record"
                              >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              </button>
                          {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {:else}
      <div class="px-8 py-32 text-center glass rounded-[2.5rem] animate-premium-slide" style="animation-delay: 300ms;">
          <div class="flex flex-col items-center space-y-6">
              <div class="w-20 h-20 bg-gray-50 dark:bg-slate-800/50 rounded-3xl flex items-center justify-center text-4xl shadow-inner animate-bounce animate-duration-[3000ms]">📡</div>
              <p class="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.3em]">No valid frequency detected.</p>
          </div>
      </div>
    {/each}
  </div>
</div>
