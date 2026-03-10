<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { page } from "$app/stores";

  let searchQuery = $state('');

  const docTypes = [
    { label: "Appointment Letters", count: 0, icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" },
    { label: "ID Proofs", count: 0, icon: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2", color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Qualification Certificates", count: 0, icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z", color: "text-amber-500 bg-amber-50 dark:bg-amber-900/20" },
    { label: "Experience Letters", count: 0, icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", color: "text-purple-500 bg-purple-50 dark:bg-purple-900/20" }
  ];
</script>

<div class="space-y-8" in:fade>
  <div class="flex items-end justify-between">
    <div>
      <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Faculty <span class="text-indigo-600">Documents</span></h2>
      <p class="text-xs font-medium text-gray-400 mt-1">Store and manage faculty credentials, letters, and certificates</p>
    </div>
  </div>

  <!-- Document categories -->
  <div class="grid grid-cols-2 xl:grid-cols-4 gap-5" in:fly={{ y: 10 }}>
    {#each docTypes as doc}
      <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] text-center">
        <div class="w-12 h-12 rounded-2xl {doc.color} mx-auto flex items-center justify-center mb-3">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={doc.icon}/></svg>
        </div>
        <p class="text-xl font-black text-gray-900 dark:text-white">{doc.count}</p>
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{doc.label}</p>
      </div>
    {/each}
  </div>

  <!-- Coming soon notice -->
  <div class="p-12 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-700 rounded-[3rem] text-center" in:fly={{ y: 15, delay: 100 }}>
    <div class="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-900/20 mx-auto flex items-center justify-center mb-5">
      <svg class="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
    </div>
    <h3 class="text-lg font-black text-gray-900 dark:text-white mb-2">Document Management</h3>
    <p class="text-sm font-medium text-gray-400 max-w-md mx-auto leading-relaxed">
      Upload, organize, and manage faculty documents per employee. Appointment letters, ID proofs, qualification certificates, and experience letters — all in one place.
    </p>
    <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
      <div class="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-slate-800 rounded-xl">
        <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
        <span class="text-xs font-bold text-gray-600 dark:text-gray-300">Per-faculty storage</span>
      </div>
      <div class="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-slate-800 rounded-xl">
        <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
        <span class="text-xs font-bold text-gray-600 dark:text-gray-300">Expiry reminders</span>
      </div>
      <div class="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-slate-800 rounded-xl">
        <div class="w-2 h-2 rounded-full bg-amber-500"></div>
        <span class="text-xs font-bold text-gray-600 dark:text-gray-300">PDF / Image support</span>
      </div>
    </div>
    <p class="mt-4 text-[10px] font-black text-indigo-500 uppercase tracking-widest">Coming soon</p>
  </div>
</div>
