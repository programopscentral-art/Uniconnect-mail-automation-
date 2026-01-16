<script lang="ts">
  import { page } from '$app/stores';
  import { fade, fly } from 'svelte/transition';
  let { children, data } = $props();
  let user = $derived(data.user);

  let isSidebarOpen = $state(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
    { id: 'tasks', label: 'All Tasks', href: '/tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { id: 'universities', label: 'Universities', href: '/universities', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'students', label: 'Students & Recipients', href: '/students', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'users', label: 'Team Members', href: '/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'analytics', label: 'Analytics', href: '/analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'mailboxes', label: 'Mailboxes', href: '/mailboxes', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { id: 'templates', label: 'Templates', href: '/templates', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'campaigns', label: 'Campaigns', href: '/campaigns', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.001 0 01-1.564-.317z' },
    { id: 'assessments', label: 'Assessments', href: '/assessments', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    { id: 'mail-logs', label: 'Mail Audit Log', href: '/mail-logs', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'permissions', label: 'Permissions', href: '/permissions', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  ];

  let notifications = $state<any[]>([]);
  let showNotifications = $state(false);
  let unreadCount = $derived(notifications.filter(n => !n.is_read).length);

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) notifications = await res.json();
    } catch (e) {}
  }

  async function markRead(id: string) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ id }),
        headers: { 'Content-Type': 'application/json' }
      });
      notifications = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
    } catch (e) {}
  }

  import { invalidateAll } from '$app/navigation';
  async function switchUniversity(univId: string) {
    try {
        const res = await fetch('/api/auth/active-university', {
            method: 'POST',
            body: JSON.stringify({ universityId: univId }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            invalidateAll();
        }
    } catch (e) {
        console.error('Failed to switch university', e);
    }
  }

  import { onMount } from 'svelte';
  onMount(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s
    return () => clearInterval(interval);
  });
</script>

<div class="flex h-screen bg-gray-50 overflow-hidden">
  <!-- Mobile Header -->
  <header class="lg:hidden h-16 bg-white border-b border-gray-100 px-6 flex items-center justify-between sticky top-0 z-50">
      <div class="flex items-center space-x-3">
        <div class="p-2 bg-white rounded-xl border border-gray-50 shadow-sm transition-transform hover:scale-105 active:scale-95">
            <img src="/nxtwave-logo.png" alt="NxtWave" class="h-8 object-contain">
        </div>
        <span class="text-xl font-black text-gray-900 tracking-tight leading-none">UniConnect</span>
      </div>
      <button 
          onclick={() => isSidebarOpen = !isSidebarOpen} 
          class="p-2 text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
          aria-label="Toggle Sidebar"
      >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
  </header>

  <div class="flex flex-1 relative">
  <!-- Sidebar -->
  <aside 
    class="fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-100 lg:static lg:block z-[60] transition-transform duration-300 {isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col shadow-2xl lg:shadow-none"
  >
    <div class="h-20 flex items-center justify-between px-8 border-b border-gray-50">
      <div class="flex items-center space-x-4">
        <div class="p-2.5 bg-white rounded-[1.25rem] border border-gray-50 shadow-sm transition-transform hover:scale-110 active:scale-95">
            <img src="/nxtwave-logo.png" alt="NxtWave Institutional" class="h-11 w-auto object-contain">
        </div>
        <div class="flex flex-col">
            <span class="text-xl font-black text-gray-900 leading-none">UniConnect</span>
            <span class="text-[10px] font-bold text-indigo-500 mt-1.5 tracking-widest uppercase opacity-70">Program Operations</span>
        </div>
      </div>
      <!-- Notification Bell -->
      <div class="relative">
        <button 
          onclick={() => showNotifications = !showNotifications}
          class="p-2 text-gray-400 hover:text-gray-600 transition-colors relative"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {#if unreadCount > 0}
            <span class="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>
          {/if}
        </button>

        {#if showNotifications}
          <div class="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 animate-in fade-in slide-in-from-top-2">
            <div class="p-4 border-b border-gray-50 flex justify-between items-center">
              <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest">Notifications</h3>
              {#if unreadCount > 0}
                <span class="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} New</span>
              {/if}
            </div>
            <div class="max-h-96 overflow-y-auto">
              {#each notifications as n}
                <div class="p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors group {n.is_read ? 'opacity-60' : ''}">
                  <div class="flex justify-between items-start gap-2">
                    <div>
                      <div class="text-xs font-bold text-gray-900">{n.title}</div>
                      <p class="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <div class="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                        <span>{new Date(n.created_at).toLocaleDateString()}</span>
                        {#if !n.is_read}
                          <button 
                            onclick={() => markRead(n.id)} 
                            aria-label="Mark notification as read"
                            class="text-blue-600 hover:underline font-bold"
                          >
                            Mark as Read
                          </button>
                        {/if}
                      </div>
                    </div>
                    {#if n.link}
                      <a href={n.link} class="text-xs text-blue-600 font-bold hover:underline">View</a>
                    {/if}
                  </div>
                </div>
              {:else}
                <div class="p-8 text-center text-gray-400 text-xs">No notifications yet</div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
      {#each menuItems as item}
        {#if user?.permissions?.includes(item.id)}
          <a 
            href={item.href}
            onclick={() => isSidebarOpen = false}
            class="flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all 
            {$page.url.pathname.startsWith(item.href) 
              ? 'bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
          >
            <svg class="mr-3 h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
            </svg>
            {item.label}
          </a>
        {/if}
      {/each}
    </nav>

    <div class="px-6 py-10 border-t border-gray-100 bg-gray-50/10">
      <div class="px-2 mb-4">
        <p class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-40">System Integrity</p>
      </div>
      <div class="px-2 flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span class="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Global Shield Active</span>
      </div>
    </div>
  </aside>

  {#if isSidebarOpen}
      <div 
        role="presentation"
        class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm lg:hidden z-[55]" 
        onclick={() => isSidebarOpen = false} 
        onkeydown={(e) => e.key === 'Escape' && (isSidebarOpen = false)}
        transition:fade={{ duration: 200 }}
      ></div>
  {/if}
  <!-- Main Content -->
  <main class="flex-1 w-0 min-w-0 overflow-y-auto overflow-x-hidden bg-gray-50 focus:outline-none flex flex-col">
    <div class="sticky top-0 z-40 bg-gray-50/80 backdrop-blur-md border-b border-gray-100/50 w-full flex justify-center">
      <div class="w-full max-w-[1280px] px-4 sm:px-6 md:px-8 py-3 flex justify-end items-center gap-4">
        
        <!-- Institutional Context Selector -->
        {#if user && (user.role === 'ADMIN' || user.role === 'PROGRAM_OPS' || (user.universities && user.universities.length > 1))}
          <div class="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest hidden sm:block">Context:</span>
            <select 
              value={user.university_id || 'ALL'} 
              onchange={(e) => switchUniversity(e.currentTarget.value)}
              class="bg-transparent border-none text-[10px] font-black text-indigo-600 uppercase tracking-tight focus:ring-0 cursor-pointer outline-none"
            >
              {#if user.role === 'ADMIN' || user.role === 'PROGRAM_OPS'}
                <option value="ALL">All Institutions</option>
              {/if}
              {#if user.universities}
                {#each user.universities as univ}
                  <option value={univ.id}>{univ.name}</option>
                {/each}
              {/if}
            </select>
          </div>
        {:else if user?.university_id}
          <!-- Single University Display (ReadOnly) -->
           <div class="px-4 py-2 bg-white border border-gray-100 rounded-2xl opacity-60">
              <span class="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                {user.universities?.find((u:any) => u.id === user.university_id)?.name || 'Member Access'}
              </span>
           </div>
        {/if}

        <!-- Account Hub Header -->
        <a 
          href="/profile" 
          class="flex items-center px-4 py-2 rounded-2xl bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/10 transition-all group active:scale-95"
        >
          <div class="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-sm font-black text-indigo-700 mr-2 group-hover:scale-110 transition-transform">
            {#if user?.profile_picture_url}
              <img src={user.profile_picture_url} alt={user.name} class="w-full h-full object-cover rounded-xl">
            {:else}
              {user?.name?.[0] || 'U'}
            {/if}
          </div>
          <div class="text-right">
            <div class="text-[10px] font-black text-gray-900 truncate leading-tight uppercase tracking-tight">{user?.display_name || user?.name || 'User'}</div>
            <div class="text-[8px] font-black text-indigo-500 uppercase tracking-widest leading-none mt-0.5 opacity-70">Account Hub</div>
          </div>
        </a>

        <form action="/api/auth/logout" method="POST">
          <button class="p-2.5 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center bg-white border border-gray-100 rounded-xl hover:bg-red-50 hover:border-red-100 hover:shadow-lg hover:shadow-red-500/5 active:scale-95" title="Sign Out">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </form>
      </div>
    </div>

    <div class="w-full flex-shrink-0 flex flex-col items-center">
      <div class="w-full max-w-[1280px] px-4 sm:px-6 md:px-8 py-4">
        {@render children()}
      </div>
    </div>
  </main>
  </div>
</div>
