<script lang="ts">
  import { page } from "$app/stores";
  import { fade } from "svelte/transition";
  import { setContext } from "svelte";

  let { children } = $props();

  const subLinks = [
    { href: "/academic-operations/faculty-ops", label: "Overview" },
    { href: "/academic-operations/faculty-ops/profiles", label: "Profiles" },
    { href: "/academic-operations/faculty-ops/leave", label: "Leave Mgmt" },
    { href: "/academic-operations/faculty-ops/workload", label: "Workload" },
    { href: "/academic-operations/faculty-ops/documents", label: "Documents" },
  ];

  const user = $derived($page.data?.user);
  const universities = $derived((user?.universities || []).filter((u: any) => u.is_team));

  // Show selector if ADMIN/PROGRAM_OPS with multiple universities,
  // or if university_id is null (ALL selected globally)
  const showSelector = $derived(
    (user?.role === 'ADMIN' || user?.role === 'PROGRAM_OPS') &&
    universities.length > 1
  );

  // Selected university — defaults to user's current university_id
  let selectedUniversityId = $state(user?.university_id || '');

  // When global context changes (header dropdown), sync our local selection
  $effect(() => {
    if (user?.university_id && user.university_id !== selectedUniversityId) {
      selectedUniversityId = user.university_id;
    }
  });

  // Make the resolved universityId available to all child pages via context
  const activeUniversityId = $derived(selectedUniversityId || user?.university_id || '');
  setContext('facultyOpsUniversityId', { get: () => activeUniversityId });

  const selectedUnivName = $derived(
    universities.find((u: any) => u.id === selectedUniversityId)?.name ||
    (selectedUniversityId ? 'Selected University' : 'Select University')
  );
</script>

<div class="flex flex-col gap-6" in:fade>
  <!-- Tab bar + university selector -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-1.5 p-1 bg-gray-100/50 dark:bg-slate-800/50 rounded-2xl w-fit">
      {#each subLinks as link}
        <a
          href={link.href}
          class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300
          {$page.url.pathname === link.href
            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}"
        >
          {link.label}
        </a>
      {/each}
    </div>

    <!-- University selector (visible for multi-university admins) -->
    {#if showSelector}
      <div class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-sm">
        <svg class="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
        <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest hidden sm:block">University</span>
        <select
          bind:value={selectedUniversityId}
          class="bg-transparent border-none text-xs font-black text-indigo-600 dark:text-indigo-400 focus:ring-0 outline-none cursor-pointer max-w-[200px] truncate"
        >
          {#each universities as u}
            <option value={u.id}>{u.name}</option>
          {/each}
        </select>
      </div>
    {:else if user?.university_id}
      <!-- Single university — show as readonly label -->
      <div class="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-slate-800 rounded-2xl">
        <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
        <span class="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate max-w-[180px]">
          {universities.find((u: any) => u.id === user.university_id)?.name || 'University'}
        </span>
      </div>
    {/if}
  </div>

  <!-- Warn if no university selected yet -->
  {#if showSelector && !selectedUniversityId}
    <div class="p-5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl flex items-center gap-3">
      <svg class="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <p class="text-xs font-bold text-amber-700 dark:text-amber-400">
        Select a university above to view faculty data for that institution.
      </p>
    </div>
  {/if}

  <div>
    {@render children()}
  </div>
</div>
