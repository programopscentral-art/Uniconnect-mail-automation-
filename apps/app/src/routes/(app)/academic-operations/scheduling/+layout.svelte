<script lang="ts">
  import { page } from "$app/stores";

  let { children } = $props();

  const subLinks = [
    { href: "/academic-operations/scheduling", label: "Overview" },
    { href: "/academic-operations/scheduling/upload", label: "Upload" },
    { href: "/academic-operations/scheduling/availability", label: "Availability" },
    { href: "/academic-operations/scheduling/leave", label: "Leave" },
    { href: "/academic-operations/scheduling/conflicts", label: "Conflicts" },
    { href: "/academic-operations/scheduling/sessions", label: "Live Sessions" },
    { href: "/academic-operations/scheduling/logs", label: "Change Logs" },
  ];
</script>

<div class="flex flex-col gap-6" in:fade>
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

  <div class="mt-2">
    {@render children()}
  </div>
</div>
