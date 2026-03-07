<script lang="ts">
  import { page } from "$app/stores";
  import { fly } from "svelte/transition";

  let { children } = $props();

  const subLinks = [
    { href: "/academic-operations", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/academic-operations/scheduling", label: "Scheduling", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { href: "/academic-operations/examinations", label: "Examinations", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
    { href: "/academic-operations/faculty-ops", label: "Faculty Ops", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z" },
    { href: "/academic-operations/student-ops", label: "Student Ops", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
    { href: "/academic-operations/portal-access", label: "Portal & Access", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
    { href: "/academic-operations/support-escalations", label: "Support", icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" },
    { href: "/academic-operations/reports-compliance", label: "Reports", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { href: "/academic-operations/ai-copilot", label: "AI Copilot", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  ];
</script>

<div class="flex flex-col gap-6 p-6 lg:p-10 max-w-[1600px] mx-auto w-full">
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div>
      <h1 class="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
        Academic <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Operations</span>
      </h1>
      <p class="text-gray-500 dark:text-gray-400 mt-2 font-medium">
        Manage scheduling, examinations, and faculty workflows from a single command center.
      </p>
    </div>
  </div>

  <!-- Sub Navigation -->
  <div class="flex items-center gap-2 p-1.5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border border-gray-100 dark:border-slate-800 rounded-[2rem] overflow-x-auto no-scrollbar shadow-sm">
    {#each subLinks as link}
      <a
        href={link.href}
        class="flex items-center gap-2.5 px-6 py-3 rounded-[1.5rem] text-sm font-bold transition-all duration-300 shrink-0
        {$page.url.pathname === link.href || ($page.url.pathname.startsWith(link.href) && link.href !== '/academic-operations')
          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md ring-1 ring-gray-100 dark:ring-slate-700'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-slate-800/30'}"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={link.icon} />
        </svg>
        {link.label}
      </a>
    {/each}
  </div>

  <div class="mt-2">
    {@render children()}
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
