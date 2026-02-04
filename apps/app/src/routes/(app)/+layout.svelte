<script lang="ts">
  import { page } from "$app/stores";
  import { fade, fly } from "svelte/transition";
  import ThemeToggle from "$lib/components/ui/ThemeToggle.svelte";
  import { untrack } from "svelte";
  import { clickOutside } from "$lib/utils/clickOutside";
  let { children, data } = $props();
  let user = $derived(data.user);
  let currentTheme = $state<"light" | "dark">(
    untrack(() => data.theme) || "light",
  );

  $effect(() => {
    // Root application of theme
    const root = document.documentElement;
    if (currentTheme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }
  });

  $effect(() => {
    // Sync from server data without creating a loop
    if (data.theme) {
      untrack(() => {
        if (currentTheme !== data.theme) {
          currentTheme = data.theme;
        }
      });
    }
  });

  let isSidebarOpen = $state(false);

  const menuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
    },
    {
      id: "tasks",
      label: "All Tasks",
      href: "/tasks",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    },
    {
      id: "universities",
      label: "Universities",
      href: "/universities",
      icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    },
    {
      id: "students",
      label: "Students & Recipients",
      href: "/students",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
    },
    {
      id: "users",
      label: "Team Members",
      href: "/users",
      icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    },
    {
      id: "analytics",
      label: "Analytics",
      href: "/analytics",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    },
    {
      id: "mailboxes",
      label: "Mailboxes",
      href: "/mailboxes",
      icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    },
    {
      id: "templates",
      label: "Templates",
      href: "/templates",
      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      id: "campaigns",
      label: "Campaigns",
      href: "/campaigns",
      icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.001 0 01-1.564-.317z",
    },
    {
      id: "assessments",
      label: "Assessments",
      href: "/assessments",
      icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    },
    {
      id: "mail-logs",
      label: "Mail Audit Log",
      href: "/mail-logs",
      icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    },
    {
      id: "permissions",
      label: "Permissions",
      href: "/permissions",
      icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    },
  ];

  let notifications = $state<any[]>([]);
  let showNotifications = $state(false);
  let unreadCount = $derived(notifications.filter((n) => !n.is_read).length);
  let showPresenceMenu = $state(false);

  const presenceOptions = [
    { label: "Available", status: "ONLINE", color: "bg-emerald-500" },
    { label: "Busy", status: "BUSY", color: "bg-red-500" },
    { label: "Be right back", status: "AWAY", color: "bg-amber-500" },
    { label: "Appear offline", status: "OFFLINE", color: "bg-gray-400" },
  ];

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) notifications = await res.json();
    } catch (e) {}
  }

  async function markRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id }),
        headers: { "Content-Type": "application/json" },
      });
      notifications = notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      );
    } catch (e) {}
  }

  import { invalidateAll } from "$app/navigation";
  async function switchUniversity(univId: string) {
    try {
      const res = await fetch("/api/auth/active-university", {
        method: "POST",
        body: JSON.stringify({ universityId: univId }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        invalidateAll();
      }
    } catch (e) {
      console.error("Failed to switch university", e);
    }
  }

  async function updatePresence(
    status: "ONLINE" | "OFFLINE" | "AWAY" | "BUSY",
    mode: "AUTO" | "MANUAL" = "AUTO",
  ) {
    if (!user) return;
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, mode }),
      });
      // Update local state if it's a manual change to avoid waiting for next session refresh
      if (mode === "MANUAL") {
        user.presence_status = status;
        user.presence_mode = "MANUAL";
      } else if (user.presence_mode === "AUTO") {
        user.presence_status = status;
      }
    } catch (e) {}
  }

  async function setManualStatus(
    status: "ONLINE" | "OFFLINE" | "AWAY" | "BUSY",
  ) {
    await updatePresence(status, "MANUAL");
    showPresenceMenu = false;
  }

  async function resetToAutoPresence() {
    await updatePresence("ONLINE", "AUTO");
    showPresenceMenu = false;
  }

  import { onMount } from "svelte";
  onMount(() => {
    fetchNotifications();
    const notificationInterval = setInterval(fetchNotifications, 30000); // 30s

    // Initial online status if AUTO
    if (user?.presence_mode === "AUTO") {
      updatePresence("ONLINE", "AUTO");
    }

    // Heartbeat for presence
    const presenceInterval = setInterval(() => {
      if (user?.presence_mode === "AUTO") {
        updatePresence("ONLINE", "AUTO");
      } else if (user) {
        // Just ping to keep last_active_at updated without changing status
        updatePresence(user.presence_status, "MANUAL");
      }
    }, 120000); // 2 mins

    // Handle tab visibility (Away status) - ONLY if in AUTO mode
    const handleVisibilityChange = () => {
      if (user?.presence_mode !== "AUTO") return;
      if (document.hidden) {
        updatePresence("AWAY", "AUTO");
      } else {
        updatePresence("ONLINE", "AUTO");
      }
    };

    const handleFocus = () => {
      if (user?.presence_mode === "AUTO") {
        updatePresence("ONLINE", "AUTO");
      }
    };

    const handleBlur = () => {
      if (user?.presence_mode === "AUTO") {
        updatePresence("AWAY", "AUTO");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      clearInterval(notificationInterval);
      clearInterval(presenceInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      updatePresence("OFFLINE");
    };
  });
</script>

<div
  class="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden transition-colors duration-500"
>
  <!-- Mobile Header -->
  <header
    class="lg:hidden h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 px-4 flex items-center justify-between sticky top-0 z-50"
  >
    <div class="flex items-center space-x-2">
      <div
        class="p-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-50 dark:border-gray-700 shadow-sm transition-transform hover:scale-105 active:scale-95"
      >
        <img
          src="/nxtwave-logo.png"
          alt="NxtWave"
          class="h-6 object-contain dark:invert"
          style="height: 24px; width: auto;"
        />
      </div>
      <span
        class="text-lg font-black text-gray-900 dark:text-white tracking-tight leading-none"
        >UniConnect</span
      >
    </div>
    <div class="flex items-center gap-1">
      <ThemeToggle bind:currentTheme />
      <button
        onclick={() => (isSidebarOpen = !isSidebarOpen)}
        class="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all active:scale-90"
        aria-label="Toggle Sidebar"
      >
        <svg
          class="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M4 6h16M4 12h16M4 18h16"
          /></svg
        >
      </button>
    </div>
  </header>

  <div class="flex flex-1 relative">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800 lg:static lg:block z-[60] transition-all duration-300 {isSidebarOpen
        ? 'translate-x-0 bubble-glow'
        : '-translate-x-full lg:translate-x-0'} flex flex-col shadow-2xl lg:shadow-none"
    >
      <div
        class="h-24 flex items-center justify-between px-8 border-b border-gray-50 dark:border-slate-800/50"
      >
        <div class="flex items-center space-x-4">
          <div
            class="p-2.5 bg-white dark:bg-gray-800 rounded-[1.25rem] border border-gray-50 dark:border-gray-700 shadow-sm transition-transform hover:scale-110 active:scale-95"
          >
            <img
              src="/nxtwave-logo.png"
              alt="NxtWave Institutional"
              class="h-11 w-auto object-contain dark:invert"
              style="height: 44px; width: auto;"
            />
          </div>
          <div class="flex flex-col">
            <span
              class="text-xl font-black text-gray-900 dark:text-white leading-none"
              >UniConnect</span
            >
            <span
              class="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mt-1.5 tracking-widest uppercase opacity-70"
              >Program Operations</span
            >
          </div>
        </div>
      </div>

      <nav class="flex-1 p-6 space-y-1.5 overflow-y-auto">
        {#each menuItems as item}
          {#if user?.permissions?.includes(item.id)}
            <a
              href={item.href}
              onclick={() => (isSidebarOpen = false)}
              class="flex items-center px-4 py-3 text-sm font-bold rounded-2xl transition-all duration-300
            {$page.url.pathname.startsWith(item.href)
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-[1.02]'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'}"
            >
              <div
                class="mr-4 h-6 w-6 flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d={item.icon}
                  />
                </svg>
              </div>
              {item.label}
            </a>
          {/if}
        {/each}
      </nav>

      <div
        class="px-8 py-10 border-t border-gray-100 dark:border-slate-800 bg-gray-50/10 dark:bg-slate-900/10"
      >
        <div class="px-2 mb-4 flex justify-between items-center">
          <p
            class="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] opacity-40"
          >
            System Status
          </p>
        </div>
        <div class="px-2 flex items-center gap-3">
          <div
            class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]"
          ></div>
          <span
            class="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-tighter"
            >System Online</span
          >
        </div>
      </div>
    </aside>

    {#if isSidebarOpen}
      <div
        role="presentation"
        class="fixed inset-0 bg-gray-900/40 backdrop-blur-sm lg:hidden z-[55]"
        onclick={() => (isSidebarOpen = false)}
        onkeydown={(e) => e.key === "Escape" && (isSidebarOpen = false)}
        transition:fade={{ duration: 200 }}
      ></div>
    {/if}
    <!-- Main Content -->
    <main
      class="flex-1 w-0 min-w-0 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-slate-950 focus:outline-none flex flex-col transition-colors duration-500"
    >
      <div
        class="sticky top-0 z-40 bg-gray-50/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-100/50 dark:border-slate-800/50 w-full flex justify-center"
      >
        <div
          class="w-full max-w-[1280px] px-4 sm:px-6 md:px-8 py-2 md:py-3 flex justify-end items-center gap-2 sm:gap-4"
        >
          <div class="hidden lg:block">
            <ThemeToggle bind:currentTheme />
          </div>

          <!-- Notification Bell -->
          <div
            class="relative"
            use:clickOutside={() => (showNotifications = false)}
          >
            <button
              onclick={() => (showNotifications = !showNotifications)}
              class="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors relative"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {#if unreadCount > 0}
                <span
                  class="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"
                ></span>
              {/if}
            </button>

            {#if showNotifications}
              <div
                class="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 animate-in fade-in slide-in-from-top-2"
              >
                <div
                  class="p-4 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center"
                >
                  <h3
                    class="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest"
                  >
                    Notifications
                  </h3>
                  {#if unreadCount > 0}
                    <span
                      class="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-bold"
                      >{unreadCount} New</span
                    >
                  {/if}
                </div>
                <div class="max-h-96 overflow-y-auto">
                  {#each notifications as n}
                    <div
                      class="p-4 border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group {n.is_read
                        ? 'opacity-60'
                        : ''}"
                    >
                      <div class="flex justify-between items-start gap-2">
                        <div>
                          <div
                            class="text-xs font-bold text-gray-900 dark:text-gray-100"
                          >
                            {n.title}
                          </div>
                          <p
                            class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2"
                          >
                            {n.message}
                          </p>
                          <div
                            class="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-2"
                          >
                            <span
                              >{new Date(
                                n.created_at,
                              ).toLocaleDateString()}</span
                            >
                            {#if !n.is_read}
                              <button
                                onclick={() => markRead(n.id)}
                                aria-label="Mark notification as read"
                                class="text-blue-600 dark:text-blue-400 hover:underline font-bold"
                              >
                                Mark as Read
                              </button>
                            {/if}
                          </div>
                        </div>
                        {#if n.link}
                          <a
                            href={n.link}
                            class="text-xs text-blue-600 font-bold hover:underline"
                            >View</a
                          >
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <div class="p-8 text-center text-gray-400 text-xs">
                      No notifications yet
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <!-- Institutional Context Selector -->
          {#if user && (user.role === "ADMIN" || user.role === "PROGRAM_OPS" || (user.universities && user.universities.length > 1))}
            <div
              class="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl sm:rounded-2xl shadow-sm transition-all hover:shadow-md"
            >
              <span
                class="text-[8px] sm:text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest hidden sm:block"
                >Team:</span
              >
              <select
                value={user.university_id || "ALL"}
                onchange={(e) => switchUniversity(e.currentTarget.value)}
                class="bg-transparent border-none text-[9px] sm:text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight focus:ring-0 cursor-pointer outline-none max-w-[120px] sm:max-w-[200px] truncate"
              >
                {#if user.role === "ADMIN" || user.role === "PROGRAM_OPS"}
                  <option value="ALL">All Teams</option>
                {/if}
                {#if (user.universities || []).length > 0}
                  {#each (user.universities || []).filter((u: any) => u.is_team) as univ}
                    <option value={univ.id}>{univ.name}</option>
                  {/each}
                {/if}
              </select>
            </div>
          {:else if user?.university_id}
            <!-- Single University Display (ReadOnly) -->
            <div
              class="px-3 sm:px-4 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl sm:rounded-2xl opacity-60"
            >
              <span
                class="text-[8px] sm:text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate max-w-[100px] sm:max-w-none block"
              >
                {user.universities?.find(
                  (u: any) => u.id === user.university_id,
                )?.name || "Member Access"}
              </span>
            </div>
          {/if}

          <!-- Account Hub Header -->
          <div
            class="relative"
            use:clickOutside={() => (showPresenceMenu = false)}
          >
            <button
              onclick={() => (showPresenceMenu = !showPresenceMenu)}
              class="flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-xl hover:shadow-indigo-500/10 transition-all group active:scale-95"
            >
              <div class="relative">
                <div
                  class="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-xs sm:text-sm font-black text-indigo-700 dark:text-indigo-400 mr-2 group-hover:scale-110 transition-transform relative"
                >
                  {#if user?.profile_picture_url}
                    <img
                      src={user.profile_picture_url}
                      alt={user.name}
                      class="w-full h-full object-cover rounded-lg sm:rounded-xl"
                    />
                  {:else}
                    {user?.name?.[0] || "U"}
                  {/if}

                  <!-- User Status Dot -->
                  <span
                    class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 shadow-sm
                    {user?.presence_status === 'ONLINE'
                      ? 'bg-emerald-500'
                      : user?.presence_status === 'BUSY'
                        ? 'bg-red-500'
                        : user?.presence_status === 'AWAY'
                          ? 'bg-amber-500'
                          : 'bg-gray-400'}"
                    title="You are {user?.presence_status?.toLowerCase()} ({user?.presence_mode})"
                  ></span>
                </div>
              </div>
              <div class="text-right hidden xs:block">
                <div
                  class="text-[9px] sm:text-[10px] font-black text-gray-900 dark:text-white truncate leading-tight uppercase tracking-tight max-w-[60px] sm:max-w-[100px]"
                >
                  {user?.display_name || user?.name || "User"}
                </div>
                <div
                  class="text-[7px] sm:text-[8px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest leading-none mt-0.5 opacity-70"
                >
                  {user?.presence_status === "ONLINE"
                    ? "Available"
                    : user?.presence_status === "BUSY"
                      ? "Busy"
                      : user?.presence_status === "AWAY"
                        ? "Be right back"
                        : "Offline"}
                </div>
              </div>
              <svg
                class="w-3 h-3 ml-2 text-gray-400 transition-transform {showPresenceMenu
                  ? 'rotate-180'
                  : ''}"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M19 9l-7 7-7-7"
                /></svg
              >
            </button>

            {#if showPresenceMenu}
              <div
                class="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 z-[100] p-2 animate-in fade-in slide-in-from-top-2"
                transition:fade={{ duration: 100 }}
              >
                <div
                  class="px-3 py-2 border-b border-gray-50 dark:border-slate-800/50 mb-1"
                >
                  <p
                    class="text-[9px] font-black text-gray-400 uppercase tracking-widest"
                  >
                    Set Status
                  </p>
                </div>
                {#each presenceOptions as option}
                  <button
                    onclick={() => setManualStatus(option.status as any)}
                    class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl transition-colors group"
                  >
                    <div
                      class="w-2.5 h-2.5 rounded-full {option.color} ring-2 ring-white dark:ring-slate-900 group-hover:scale-110 transition-transform"
                    ></div>
                    <span
                      class="text-[11px] font-bold text-gray-700 dark:text-gray-200"
                      >{option.label}</span
                    >
                    {#if user?.presence_status === option.status && user?.presence_mode === "MANUAL"}
                      <svg
                        class="w-3.5 h-3.5 ml-auto text-indigo-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        ><path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M5 13l4 4L19 7"
                        /></svg
                      >
                    {/if}
                  </button>
                {/each}
                <div class="h-px bg-gray-50 dark:bg-slate-800/50 my-1"></div>
                <button
                  onclick={resetToAutoPresence}
                  class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-indigo-600 dark:text-indigo-400"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    /></svg
                  >
                  <span
                    class="text-[11px] font-black uppercase tracking-tighter"
                    >Reset to Auto</span
                  >
                </button>
                <a
                  href="/profile"
                  onclick={() => (showPresenceMenu = false)}
                  class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <svg
                    class="w-3.5 h-3.5 text-gray-400 font-bold"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    /></svg
                  >
                  <span
                    class="text-[11px] font-bold text-gray-700 dark:text-gray-200"
                    >View Profile</span
                  >
                </a>
              </div>
            {/if}
          </div>

          <form action="/api/auth/logout" method="POST">
            <button
              class="p-2 sm:p-2.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all flex items-center justify-center bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg sm:rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-100 dark:hover:border-red-800 hover:shadow-lg hover:shadow-red-500/5 active:scale-95"
              title="Sign Out"
            >
              <svg
                class="w-4 h-4 sm:w-5 sm:h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                /></svg
              >
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
