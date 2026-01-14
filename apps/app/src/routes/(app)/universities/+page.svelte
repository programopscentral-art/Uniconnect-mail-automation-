<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  
  // @ts-ignore
  let { data } = $props(); 

  let showModal = $state(false);
  let newName = $state('');
  let newSlug = $state('');
  let isSubmitting = $state(false);
  let deleteId = $state<string | null>(null);

  async function createUniversity() {
    isSubmitting = true;
    try {
      const res = await fetch('/api/universities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, slug: newSlug })
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert(err.message || 'Failed to create');
        return;
      }

      showModal = false;
      newName = '';
      newSlug = '';
      invalidateAll(); // Reload data
    } catch (e) {
      console.error(e);
      alert('Error creating university');
    } finally {
      isSubmitting = false;
    }
  }

  async function deleteUniv(id: string) {
    if (!confirm('Are you sure? This will delete all users and data associated with this university.')) return;
    
    try {
      const res = await fetch(`/api/universities/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      invalidateAll();
    } catch (e) {
      alert('Failed to delete');
    }
  }
</script>

<div class="space-y-8 pb-12">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">Universities <span class="text-xs font-normal text-gray-400 opacity-50 ml-2">(Build: 2200)</span></h1>
      <p class="mt-1 text-gray-500 font-medium">Manage your university partners and connections.</p>
    </div>
    <button 
      onclick={() => showModal = true}
      class="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 font-bold hover:bg-indigo-700 hover:-translate-y-0.5 transition-all duration-200"
    >
      <svg class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
      </svg>
      Add University
    </button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
    {#each data.universities as univ}
      {@const connectedMailboxes = data.mailboxes.filter(m => m.university_id === univ.id && m.status === 'ACTIVE')}
      {@const isConnected = connectedMailboxes.length > 0}
      <div class="group bg-white rounded-[32px] border border-gray-100 shadow-floating hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden">
        <div class="p-8 space-y-6 flex-1 flex flex-col">
          <div class="flex justify-between items-start">
             <div class="h-14 w-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-2xl font-black text-indigo-600 group-hover:scale-110 transition-transform">
                {univ.name.charAt(0)}
             </div>
             {#if isConnected}
                <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-50 text-green-700 border border-green-100">
                    ✅ Connected
                </span>
             {:else}
                <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-50 text-gray-400 border border-gray-100">
                    ⚪ Not Connected
                </span>
             {/if}
          </div>
          
          <div>
            <h3 class="text-xl font-black text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight">{univ.name}</h3>
            <div class="flex items-center gap-2 mt-2">
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">ID: {univ.slug}</span>
            </div>
          </div>

          {#if isConnected}
            <div class="bg-gray-50 rounded-xl p-3 space-y-1">
                <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Active Mailboxes</div>
                {#each connectedMailboxes as box}
                   <div class="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                       <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                       {box.email}
                   </div>
                {/each}
            </div>
          {/if}

          <div class="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
             <span class="text-[10px] font-bold text-gray-400 uppercase">Created {new Date(univ.created_at).toLocaleDateString()}</span>
             <button onclick={() => deleteUniv(univ.id)} class="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete University">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="col-span-full py-20 flex flex-col items-center justify-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200">
          <div class="bg-gray-100 p-4 rounded-full mb-4">
              <svg class="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" /></svg>
          </div>
          <h3 class="text-xl font-bold text-gray-900">No Universities Yet</h3>
          <p class="text-gray-500 font-medium">Start by adding your first institutional partner.</p>
      </div>
    {/each}
  </div>
</div>

{#if showModal}
<div class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
  <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
    <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onclick={() => showModal = false}></div>
    <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
    <div class="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full border border-gray-100">
      <div class="bg-gradient-to-br from-indigo-600 to-blue-700 px-8 py-6 text-white text-left">
          <h3 class="text-2xl font-bold" id="modal-title">Add University</h3>
          <p class="text-indigo-100 text-sm opacity-80">Add a new university to your list.</p>
      </div>
      <div class="bg-white px-8 py-6 space-y-6">
        <div>
          <label for="name" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">University Name</label>
          <input type="text" id="name" bind:value={newName} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all font-bold" placeholder="e.g. Central University">
        </div>
        <div>
          <label for="slug" class="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Short Name / ID</label>
          <input type="text" id="slug" bind:value={newSlug} class="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 transition-all font-bold" placeholder="e.g. central-univ">
          <p class="mt-2 text-[10px] text-gray-400 font-bold uppercase tracking-wide px-1">A simple shorthand name for this university.</p>
        </div>
      </div>
      <div class="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
         <button onclick={() => showModal = false} class="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
         <button 
            onclick={createUniversity} 
            disabled={isSubmitting || !newName || !newSlug}
            class="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? 'Syncing...' : 'Add Partner'}
        </button>
      </div>
    </div>
  </div>
</div>
{/if}
