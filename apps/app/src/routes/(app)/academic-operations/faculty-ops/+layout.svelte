<script lang="ts">
  import { page } from "$app/stores";
  import { fade } from "svelte/transition";
  import { setContext } from "svelte";

  let { children, data } = $props();

  const subLinks = [
    { href: "/academic-operations/faculty-ops", label: "Overview" },
    { href: "/academic-operations/faculty-ops/profiles", label: "Profiles" },
    { href: "/academic-operations/faculty-ops/leave", label: "Leave Mgmt" },
    { href: "/academic-operations/faculty-ops/workload", label: "Workload" },
    { href: "/academic-operations/faculty-ops/documents", label: "Documents" },
  ];

  const user = $derived($page.data?.user);
  const isPrivileged = $derived(user?.role === 'ADMIN' || user?.role === 'PROGRAM_OPS');

  // Use server-loaded universities (getAllUniversities) — reliable for ADMIN/PROGRAM_OPS
  // who may have NO entries in user_universities but still have global access
  const universities = $derived(
    (data?.allUniversities?.length
      ? data.allUniversities
      : (user?.universities || []).filter((u: any) => u.is_team)
    ) as { id: string; name: string; slug?: string }[]
  );

  // Always show selector for ADMIN/PROGRAM_OPS as long as there's at least 1 university
  const showSelector = $derived(isPrivileged && universities.length > 0);

  // Default to the cookie-active university_id
  let selectedUniversityId = $state(user?.university_id || '');

  // Sync when global header dropdown changes
  $effect(() => {
    const uid = user?.university_id;
    if (uid && uid !== selectedUniversityId) {
      selectedUniversityId = uid;
    }
  });

  // Auto-select first university if nothing is selected yet
  $effect(() => {
    if (!selectedUniversityId && universities.length > 0) {
      selectedUniversityId = universities[0].id;
    }
  });

  // Active university shared to all child pages via Svelte context
  const activeUniversityId = $derived(selectedUniversityId || universities[0]?.id || '');
  setContext('facultyOpsUniversityId', { get: () => activeUniversityId });
</script>

<div class="flex flex-col gap-6" in:fade>
  <!-- Tab bar + university selector -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <!-- Tabs -->
    <div class="flex items-center gap-1 p-1 bg-gray-100/60 dark:bg-slate-800/60 rounded-2xl w-fit">
      {#each subLinks as link}
        <a
          href={link.href}
          class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200
          {$page.url.pathname === link.href
            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
            : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}"
        >
          {link.label}
        </a>
      {/each}
    </div>

    <!-- Institution selector — always visible for ADMIN/PROGRAM_OPS -->
    {#if showSelector}
      <div class="flex items-center gap-2.5 px-4 py-2.5 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
        <div class="w-6 h-6 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Institution</span>
          <select
            bind:value={selectedUniversityId}
            class="bg-transparent border-none text-xs font-black text-indigo-600 dark:text-indigo-400 focus:ring-0 outline-none cursor-pointer max-w-[220px] truncate mt-0.5 leading-tight p-0"
          >
            {#each universities as u}
              <option value={u.id}>{u.name}</option>
            {/each}
          </select>
        </div>
        <div class="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Live data"></div>
      </div>
    {:else if user?.university_id}
      <!-- Non-privileged single institution — readonly label -->
      <div class="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl">
        <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
        <span class="text-[10px] font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest truncate max-w-[200px]">
          {(user?.universities || []).find((u: any) => u.id === user.university_id)?.name || 'Your Institution'}
        </span>
      </div>
    {/if}
  </div>

  <!-- Warning: privileged user but no university could be loaded -->
  {#if isPrivileged && !activeUniversityId}
    <div class="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl flex items-center gap-3">
      <svg class="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <p class="text-xs font-bold text-amber-700 dark:text-amber-400">
        Select an institution above to view faculty data.
      </p>
    </div>
  {/if}

  <div>
    {@render children()}
  </div>
</div>
