<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state(data.selectedUniversityId || '');
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

<div class="space-y-8 p-4 md:p-8" in:fade>
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
    <div>
      <h1 class="text-3xl font-black text-gray-900 tracking-tight">Campaigns</h1>
      <p class="mt-1 text-sm font-bold text-gray-400 uppercase tracking-widest">Email Statistics and Status</p>
    </div>
    <a 
      href={selectedUniversityId ? `/campaigns/new?universityId=${selectedUniversityId}` : '#'}
      onclick={(e) => { if(!selectedUniversityId && data.userRole==='ADMIN') { e.preventDefault(); alert('Please select an institution first to initiate a campaign.'); } }}
      class="inline-flex items-center px-8 py-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/20 hover:scale-[1.02] transition-all active:scale-95"
    >
      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
      START CAMPAIGN
    </a>
  </div>

  {#if data.userRole === 'ADMIN' || data.userRole === 'PROGRAM_OPS'}
    <div class="bg-white p-6 rounded-[32px] shadow-floating border border-gray-100 flex flex-col md:flex-row items-center gap-6">
        <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            </div>
            <label for="univ-select" class="text-xs font-black text-gray-400 uppercase tracking-widest">Active Institution</label>
        </div>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={onUnivChange}
            class="block w-full md:w-80 bg-gray-50 border border-transparent rounded-2xl px-6 py-4 text-sm font-black text-gray-700 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all outline-none"
        >
            <option value="">All Entities...</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="space-y-8">
    {#each groupedCampaigns as [date, items]}
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <h2 class="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] bg-indigo-50 px-4 py-1.5 rounded-lg border border-indigo-100">{date}</h2>
          <div class="h-px flex-1 bg-gray-100"></div>
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{items.length} Campaigns</span>
        </div>

        <div class="bg-white rounded-[32px] shadow-floating border border-gray-100 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full">
              <thead>
                <tr class="bg-gray-50/50">
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Campaign Name</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Template</th>
                  <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Progress</th>
                  <th class="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                {#each items as cam}
                  <tr class="group hover:bg-indigo-50/10 transition-colors">
                    <td class="px-8 py-6 whitespace-normal max-w-xs">
                      <div class="text-sm font-black text-gray-900 group-hover:text-indigo-700 transition-colors break-words">{cam.name}</div>
                      <div class="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">ID: {cam.id.slice(0,8)}</div>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap">
                      <span class="px-4 py-2 text-[10px] font-black rounded-xl uppercase tracking-widest shadow-sm
                        {cam.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border border-green-100' : 
                         cam.status === 'FAILED' ? 'bg-red-50 text-red-700 border border-red-100' : 
                         cam.status === 'DRAFT' ? 'bg-gray-100 text-gray-600 border border-gray-200' : 
                         cam.status === 'STOPPED' ? 'bg-red-100 text-red-800' :
                         'bg-indigo-600 text-white animate-pulse'}">
                        {cam.status === 'IN_PROGRESS' ? 'PROCESSING' : cam.status === 'COMPLETED' ? 'DONE' : cam.status}
                      </span>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap">
                      <div class="flex items-center text-xs font-black text-gray-700">
                          <svg class="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          {cam.template_name}
                      </div>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap">
                      <div class="flex items-center space-x-3">
                          <div class="flex-1 w-32 bg-gray-100 h-2 rounded-full overflow-hidden">
                              <div class="bg-indigo-600 h-full transition-all duration-500" style="width: {(cam.sent_count / cam.total_recipients) * 100}%"></div>
                          </div>
                          <span class="text-sm font-black text-gray-900">{cam.sent_count} / {cam.total_recipients}</span>
                      </div>
                    </td>
                    <td class="px-8 py-6 whitespace-nowrap text-right">
                      <div class="flex items-center justify-end space-x-2">
                          <a href={`/campaigns/${cam.id}`} class="p-2.5 bg-gray-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm" title="Execution Details">
                              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          </a>
                          {#if cam.status === 'DRAFT' || cam.status === 'FAILED' || data.userRole === 'ADMIN'}
                              <button onclick={() => deleteCampaign(cam.id)} class="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Terminate Asset">
                                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
      <div class="px-8 py-24 text-center bg-white rounded-[32px] border border-gray-100 shadow-floating">
          <div class="flex flex-col items-center">
              <div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-4xl mb-6">📡</div>
              <p class="text-xs font-black text-gray-400 uppercase tracking-widest">No Active Communication Channels</p>
          </div>
      </div>
    {/each}
  </div>
</div>
