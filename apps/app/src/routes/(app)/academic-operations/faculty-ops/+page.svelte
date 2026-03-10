<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { getContext } from "svelte";
  import { page } from "$app/stores";

  let faculty = $state<any[]>([]);
  let pendingLeaves = $state(0);
  let loading = $state(true);
  let searchQuery = $state('');

  const univCtx = getContext<{ get: () => string }>('facultyOpsUniversityId');
  const universityId = $derived(univCtx?.get() || $page.data?.user?.university_id || '');

  $effect(() => {
    if (universityId) loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [facultyRes, leavesRes] = await Promise.all([
        fetch(`/api/academic/faculty?universityId=${universityId}`),
        fetch(`/api/academic/faculty/leave-requests?status=PENDING`)
      ]);
      if (facultyRes.ok) faculty = await facultyRes.json();
      if (leavesRes.ok) {
        const leaves = await leavesRes.json();
        pendingLeaves = leaves.length;
      }
    } finally {
      loading = false;
    }
  }

  const filtered = $derived(
    faculty.filter(f =>
      !searchQuery ||
      f.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.designation?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const stats = $derived([
    {
      label: "Total Faculty", value: faculty.length.toString(), sub: "Active",
      color: "from-blue-500 to-indigo-600",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
    },
    {
      label: "Departments", value: [...new Set(faculty.map(f => f.department).filter(Boolean))].length.toString(), sub: "Active",
      color: "from-emerald-400 to-teal-500",
      icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    },
    {
      label: "Leave Requests", value: pendingLeaves.toString(), sub: "Pending",
      color: "from-amber-400 to-orange-500",
      icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    },
    {
      label: "Designations", value: [...new Set(faculty.map(f => f.designation).filter(Boolean))].length.toString(), sub: "Roles",
      color: "from-violet-500 to-fuchsia-600",
      icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
    }
  ]);

  function getInitials(name: string) {
    return (name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  function getDesignationColor(designation: string) {
    if (!designation) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
    const d = designation.toLowerCase();
    if (d.includes('professor') && !d.includes('assistant') && !d.includes('associate')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    if (d.includes('associate')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    if (d.includes('assistant')) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300';
    if (d.includes('guest') || d.includes('visiting')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  }

  const quickActions = [
    { label: "Manage Profiles", desc: "View & edit faculty details", href: "/academic-operations/faculty-ops/profiles", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { label: "Leave Requests", desc: `${pendingLeaves} pending approval`, href: "/academic-operations/faculty-ops/leave", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
    { label: "Workload View", desc: "Semester-wise assignments", href: "/academic-operations/faculty-ops/workload", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" }
  ];
</script>

<div class="space-y-8" in:fade>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {#each stats as stat, i}
      <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] shadow-sm" in:fly={{ y: 20, delay: i * 80 }}>
        <div class="p-3 bg-gradient-to-br {stat.color} text-white rounded-2xl w-fit mb-4">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={stat.icon} /></svg>
        </div>
        <p class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{stat.label}</p>
        <div class="flex items-end justify-between mt-1">
          {#if loading}
            <div class="h-8 w-10 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse"></div>
          {:else}
            <h3 class="text-3xl font-black text-gray-900 dark:text-white leading-none">{stat.value}</h3>
          {/if}
          <span class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">{stat.sub}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
    <!-- Faculty Directory -->
    <div class="xl:col-span-2 p-8 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[3rem] shadow-sm">
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Faculty <span class="text-indigo-600">Directory</span></h2>
        <div class="flex gap-2">
          <input type="text" placeholder="Search..." bind:value={searchQuery}
            class="px-4 py-2 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-xs font-medium w-44 focus:ring-2 ring-indigo-500 transition-all" />
          <a href="/academic-operations/faculty-ops/profiles"
            class="px-5 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
            View All
          </a>
        </div>
      </div>

      {#if loading}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each Array(4) as _}
            <div class="p-6 bg-gray-50 dark:bg-slate-800/30 rounded-3xl animate-pulse">
              <div class="flex gap-4"><div class="w-12 h-12 rounded-2xl bg-gray-200 dark:bg-slate-700"></div><div class="flex-1 space-y-2"><div class="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div><div class="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/2"></div></div></div>
            </div>
          {/each}
        </div>
      {:else if filtered.length === 0}
        <div class="text-center py-16">
          <div class="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-slate-800 mx-auto flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <p class="text-gray-500 font-bold text-sm">{searchQuery ? 'No faculty match your search' : 'No faculty onboarded yet'}</p>
          {#if !searchQuery}
            <a href="/academic-operations/faculty-ops/profiles" class="mt-3 inline-block text-indigo-600 text-xs font-black uppercase tracking-widest hover:underline">Import Faculty →</a>
          {/if}
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each filtered.slice(0, 6) as f, i}
            <div class="p-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-3xl border border-transparent hover:border-indigo-500/20 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 group" in:fly={{ y: 10, delay: i * 50 }}>
              <div class="flex items-start justify-between">
                <div class="flex gap-3">
                  <div class="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 font-black text-sm flex-shrink-0">{getInitials(f.name)}</div>
                  <div class="min-w-0">
                    <h4 class="font-black text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors text-sm tracking-tight truncate">{f.name}</h4>
                    <p class="text-[10px] font-bold text-gray-500 mt-0.5">{f.department || '—'}</p>
                  </div>
                </div>
                {#if f.designation}
                  <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-xl flex-shrink-0 ml-2 {getDesignationColor(f.designation)}">{f.designation.split(' ')[0]}</span>
                {/if}
              </div>
              <div class="mt-4 flex items-center justify-between">
                <div>
                  <p class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Emp. Code</p>
                  <p class="text-xs font-black text-gray-700 dark:text-gray-200 mt-0.5 font-mono">{f.employee_code || '—'}</p>
                </div>
                <a href="/academic-operations/faculty-ops/profiles" class="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Details →</a>
              </div>
            </div>
          {/each}
        </div>
        {#if filtered.length > 6}
          <div class="mt-6 text-center">
            <a href="/academic-operations/faculty-ops/profiles" class="text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline">View all {filtered.length} faculty →</a>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Right sidebar -->
    <div class="flex flex-col gap-6">
      <div class="p-8 bg-indigo-600 rounded-[3rem] text-white shadow-xl shadow-indigo-500/20">
        <h2 class="text-xl font-black tracking-tight mb-1">Operations</h2>
        <p class="text-indigo-200 text-xs font-medium mb-6 leading-relaxed">Quick access to faculty management tools.</p>
        <div class="space-y-3">
          {#each quickActions as action}
            <a href={action.href} class="w-full flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-2xl transition-all text-left">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={action.icon} /></svg>
                </div>
                <div>
                  <h4 class="text-xs font-black uppercase tracking-widest">{action.label}</h4>
                  <p class="text-[9px] text-indigo-200 mt-0.5">{action.desc}</p>
                </div>
              </div>
              <svg class="w-4 h-4 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
          {/each}
        </div>
      </div>

      {#if !loading && faculty.length > 0}
        <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem]">
          <h3 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4">By Department</h3>
          <div class="space-y-3">
            {#each [...new Set(faculty.map(f => f.department).filter(Boolean))].slice(0, 6) as dept}
              {@const count = faculty.filter(f => f.department === dept).length}
              {@const pct = Math.round((count / faculty.length) * 100)}
              <div>
                <div class="flex justify-between mb-1">
                  <span class="text-xs font-bold text-gray-700 dark:text-gray-300 truncate max-w-[70%]">{dept}</span>
                  <span class="text-xs font-black text-indigo-600">{count}</span>
                </div>
                <div class="h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full" style="width: {pct}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
