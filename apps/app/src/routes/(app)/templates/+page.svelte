<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state('');

  $effect.pre(() => {
    selectedUniversityId = data.selectedUniversityId || '';
  });

  function onUnivChange() {
      if (selectedUniversityId) goto(`?universityId=${selectedUniversityId}`);
  }

  async function deleteTemp(id: string) {
      if(!confirm('Delete template?')) return;
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      invalidateAll();
  }
</script>

<div class="space-y-8 animate-premium-fade">
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
    <div class="animate-premium-slide">
      <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Templates</h1>
      <p class="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
        Design and manage email templates.
      </p>
    </div>
    <a 
      href={selectedUniversityId ? `/templates/new?universityId=${selectedUniversityId}` : '#'}
      onclick={(e) => { if(!selectedUniversityId && (data.user?.permissions || []).includes('universities')) { e.preventDefault(); alert('Select university first'); } }}
      class="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 animate-premium-slide"
      style="animation-delay: 100ms;"
    >
      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
      Create Template
    </a>
  </div>

  {#if (data.user?.permissions || []).includes('universities') || data.universities.length > 1}
    <div class="glass p-6 rounded-[2.5rem] flex items-center gap-6 animate-premium-slide" style="animation-delay: 200ms;">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">University:</label>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={onUnivChange}
            class="flex-1 max-w-md bg-white/50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/30 transition-all focus:bg-white dark:focus:bg-gray-800 text-gray-900 dark:text-white"
        >
            <option value="">All Universities</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="glass overflow-hidden rounded-[2.5rem] animate-premium-slide" style="animation-delay: 300ms;">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
        <thead class="bg-gray-50/50 dark:bg-slate-800/50">
          <tr>
            <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Template Name</th>
            <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Subject Reference</th>
            <th class="px-8 py-5 text-left text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Added Date</th>
            <th class="px-8 py-5 text-right text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800/50">
          {#each data.templates as temp}
            <tr class="group hover:bg-gray-50/50 dark:hover:bg-slate-950/50 transition-colors">
              <td class="px-8 py-6 whitespace-nowrap">
                <div class="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{temp.name}</div>
              </td>
              <td class="px-8 py-6 whitespace-nowrap">
                <div class="text-sm text-gray-600 dark:text-gray-400 font-medium truncate max-w-xs">{temp.subject}</div>
              </td>
              <td class="px-8 py-6 whitespace-nowrap">
                <div class="text-xs font-bold text-gray-400 dark:text-slate-400 font-mono italic">
                  {new Date(temp.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              </td>
              <td class="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                  <a 
                    href={`/templates/${temp.id}`} 
                    class="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 transition-all active:scale-90"
                    title="Edit Template"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </a>
                  <button 
                    onclick={() => deleteTemp(temp.id)} 
                    class="p-2 bg-red-50 dark:bg-slate-900/30 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-600 hover:text-white dark:hover:bg-red-500 transition-all active:scale-90"
                    title="Delete Template"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
          {#if data.templates.length === 0}
            <tr>
              <td colspan="4" class="px-8 py-16 text-center">
                <div class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 space-y-4">
                  <div class="w-16 h-16 rounded-3xl bg-gray-50 dark:bg-slate-800/50 flex items-center justify-center">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <p class="text-[10px] font-black uppercase tracking-[0.2em]">No templates found for this university.</p>
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
