<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  // @ts-ignore
  let { data } = $props();

  let selectedUniversityId = $state(data.selectedUniversityId || '');

  $effect(() => {
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

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">Templates</h1>
      <p class="mt-1 text-sm text-gray-500">Manage email templates.</p>
    </div>
    <a 
      href={selectedUniversityId ? `/templates/new?universityId=${selectedUniversityId}` : '#'}
      onclick={(e) => { if(!selectedUniversityId && data.userRole==='ADMIN') { e.preventDefault(); alert('Select university first'); } }}
      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
    >
      Create Template
    </a>
  </div>

  {#if data.userRole === 'ADMIN'}
    <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-floating flex items-center gap-6">
        <label for="univ-select" class="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Institutional Node:</label>
        <select 
            id="univ-select" 
            bind:value={selectedUniversityId} 
            onchange={onUnivChange}
            class="flex-1 max-w-md bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all focus:bg-white"
        >
            <option value="">Global Hierarchy (All)</option>
            {#each data.universities as univ}
                <option value={univ.id}>{univ.name}</option>
            {/each}
        </select>
    </div>
  {/if}

  <div class="bg-white shadow-floating overflow-hidden rounded-[32px] border border-gray-100">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
          <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {#each data.templates as temp}
          <tr>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{temp.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{temp.subject}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(temp.created_at).toLocaleDateString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <a href={`/templates/${temp.id}`} class="text-indigo-600 hover:text-indigo-900 mr-4">Edit</a>
                <button onclick={() => deleteTemp(temp.id)} class="text-red-600 hover:text-red-900">Delete</button>
            </td>
          </tr>
        {/each}
        {#if data.templates.length === 0}
             <tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">No templates found.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>
