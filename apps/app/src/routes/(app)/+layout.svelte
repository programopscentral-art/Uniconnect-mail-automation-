
<script lang="ts">
  import { page } from "$app/stores";
  import { fade, fly } from "svelte/transition";
  import ThemeToggle from "$lib/components/ui/ThemeToggle.svelte";
  import { untrack, onMount } from "svelte";
  import { clickOutside } from "$lib/utils/clickOutside";
  import { getFcmToken, onForegroundMessage } from "$lib/firebase";
  import NotificationToast from "$lib/components/NotificationToast.svelte";
  let { children, data } = $props();
  let user = $derived(data.user);
  let currentTheme = $state<"light" | "dark">(
    untrack(() => data.theme) || "light",
  );

  // Global university selector for central team / multi-university users
  let userUniversities = $state<Array<{ id: string; name: string }>>([]);
  let selectedUniversityId = $state('');
  let selectedUniversityName = $derived(userUniversities.find(u => u.id === selectedUniversityId)?.name || '');

  async function loadUserUniversities() {
    if (!user) return;
    try {
      const res = await fetch('/api/user-universities');
      if (res.ok) {
        const j = await res.json();
        userUniversities = j.universities || [];
        if (user.university_id && userUniversities.find((u: any) => u.id === user.university_id)) {
          selectedUniversityId = user.university_id;
        } else if (userUniversities.length > 0) {
          selectedUniversityId = userUniversities[0].id;
        }
      }
    } catch {}
  }

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

  // Full navigation — ADMIN / PROGRAM_OPS and permission-gated roles
  const adminNavigation = [
    {
      group: "Core",
      items: [
        { id: "dashboard",  label: "Dashboard",      href: "/dashboard", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
        { id: "tasks",      label: "Task Center",    href: "/tasks",     icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
        { id: "users",      label: "Team Directory", href: "/users",     icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
      ]
    },
    {
      group: "Academic Ops",
      items: [
        { id: "academic-operations", label: "Operations Hub",  href: "/academic-operations",      icon: "M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" },
        { id: "universities",        label: "Campus Registry", href: "/universities",             icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
        { id: "students",            label: "Student Master",  href: "/students",                 icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
        { id: "assessments",         label: "Examinations",    href: "/assessments",              icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
      ]
    },
    {
      group: "Daily Operations",
      items: [
        { id: "ops-os-report", label: "Daily Report",   href: "/ops-os/report", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
        { id: "ops-os-pm-inbox", label: "PM Inbox", href: "/ops-os/pm-inbox", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
        { id: "ops-os-review", label: "PM Review Queue", href: "/ops-os/review", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
        { id: "ops-os-operations", label: "Operations Overview", href: "/ops-os/operations", icon: "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
        { id: "ops-os-access-rights", label: "Access Rights", href: "/ops-os/access-rights", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
      ]
    },
    {
      group: "Communication",
      items: [
        { id: "campaigns",           label: "Campaigns",       href: "/campaigns",           icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.001 0 01-1.564-.317z" },
        { id: "mailboxes",           label: "Central Mailbox", href: "/mailboxes",           icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
        { id: "templates",           label: "Doc Templates",   href: "/templates",           icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
        { id: "communication-tasks", label: "Scheduled Comms", href: "/communication-tasks", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
        { id: "mail-logs",           label: "Mail Audit Log",  href: "/mail-logs",           icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
        { id: "meetings",             label: "Meeting Intel",   href: "/meetings",             icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
        { id: "sheets",               label: "Smart Sheets",    href: "/sheets",               icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
      ]
    },
    {
      group: "Administration",
      items: [
        { id: "ops-dashboard",       label: "Ops Dashboard",       href: "/ops-dashboard",       icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
        { id: "faculty-attendance", label: "Faculty Attendance", href: "/faculty-attendance", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
        { id: "analytics",          label: "System Analytics",   href: "/analytics",          icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
        { id: "budget-proposals",   label: "Budgeting",          href: "/budget-proposals",   icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.407 2.73 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.407-2.73-1M12 16v-1m-4-4h8m-8 4h8" },
        { id: "petty-cash",         label: "Petty Cash",         href: "/petty-cash",         icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
        { id: "fee-collection",     label: "Fee Collection",     href: "/fee-collection-v2", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
        { id: "permissions",        label: "Access Rights",      href: "/permissions",        icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
      ]
    }
  ];

  // Focused navigation — FACULTY role sees only their workspace
  const facultyNavigation = [
    {
      group: "My Workspace",
      items: [
        { id: "faculty-portal", label: "My Dashboard", href: "/faculty-portal/dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", alwaysShow: true },
        { id: "marks",          label: "Enter Marks",  href: "/faculty-portal/marks",     icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", alwaysShow: true },
        { id: "timetable",      label: "My Timetable", href: "/faculty-portal/timetable",       icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", alwaysShow: true },
        { id: "daily-report",   label: "Daily Report", href: "/faculty-portal/teaching-report", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", alwaysShow: true },
        { id: "expertise",      label: "My Expertise", href: "/faculty-portal/my-expertise", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", alwaysShow: true },
      ]
    },
    {
      group: "Academic",
      items: [
        { id: "assessments", label: "Examinations", href: "/assessments", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", alwaysShow: true },
      ]
    }
  ];

  // Reactive: pick nav based on current user's role
  const navigation = $derived(
    user?.role === 'FACULTY' ? facultyNavigation : adminNavigation
  );

  let notifications = $state<any[]>([]);
  let showNotifications = $state(false);
  let unreadCount = $derived(notifications.filter((n) => !n.is_read).length);
  let showPresenceMenu = $state(false);
  let activeToasts = $state<any[]>([]);

  function removeToast(id: string) {
    activeToasts = activeToasts.filter((t) => t.id !== id);
  }

  const presenceOptions = [
    { label: "Available", status: "ONLINE", color: "bg-emerald-500" },
    { label: "Busy", status: "BUSY", color: "bg-red-500" },
    { label: "Be right back", status: "AWAY", color: "bg-amber-500" },
    { label: "Appear offline", status: "OFFLINE", color: "bg-gray-400" },
  ];

  // Multi-tab Notifications Coordination & Full-duplex Processing
  const processedSourceIds = new Set<string>();
  let notifChannel: BroadcastChannel | null = null;

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();

        // SELF-HEALING: If FCM missed a message, but it's in the DB, trigger it now.
        // Logic: Check unread notifications from the last 15 minutes.
        const now = new Date();
        for (const n of data) {
          const createdAt = new Date(n.created_at);
          const isRecent = now.getTime() - createdAt.getTime() < 15 * 60 * 1000;

          if (
            !n.is_read &&
            isRecent &&
            n.source_id &&
            !processedSourceIds.has(n.source_id)
          ) {
            console.log(
              "[POLLING_FALLBACK] Found missed notification:",
              n.source_id,
            );
            processedSourceIds.add(n.source_id);
            if (notifChannel)
              notifChannel.postMessage({
                type: "STOP_DUPLICATE",
                sourceId: n.source_id,
              });

            const taskId = n.source_id.startsWith("CT_")
              ? n.source_id.split("_")[1]
              : undefined;
            triggerNativePopup(n.title, n.message, n.link, taskId, n.source_id);
          }
        }

        notifications = data;
      }
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    }
  }

  import { browser } from "$app/environment";
  let notificationPermission = $state<string>(
    browser && "Notification" in window ? Notification.permission : "default",
  );

  async function requestPermission() {
    if (!browser || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    notificationPermission = result;
    if (result === "granted") {
      const token = await getFcmToken();
      if (token) {
        await fetch("/api/fcm/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      }
    }
  }

  const triggerNativePopup = async (
    title: string,
    body: string,
    url: string | null,
    taskId: string | undefined,
    sourceId: string,
  ) => {
    if (!browser || Notification.permission !== "granted") return;

    const options: any = {
      body,
      icon: "/nxtwave-logo.png",
      badge: "/nxtwave-logo.png",
      tag: sourceId,
      renotify: true,
      data: { url, taskId },
    };

    // Add persistent features for critical alerts
    if (!!taskId && (body.includes("DUE") || body.includes("OVERDUE"))) {
      options.requireInteraction = true;
      options.vibrate = [200, 100, 200];
    }

    try {
      // Logic: Ensure high reliability WITHOUT duplication.
      const reg = await navigator.serviceWorker.ready;

      // On Windows/Chrome, reg.showNotification works perfectly in both foreground and background.
      // Calling both reg.showNotification AND new Notification() usually results in 2 popups.
      await reg.showNotification(title, options);

      // Fallback only if the above failed or if specifically restricted
    } catch (e) {
      console.error("Native popup (SW) failed, using window fallback:", e);
      try {
        new Notification(title, options);
      } catch (err) {
        console.error("Window notification failed:", err);
      }
    }
  };

  async function testDesktopNotification() {
    if (!browser || !("Notification" in window)) {
      alert("Notifications are not supported in this browser.");
      return;
    }

    if (Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      notificationPermission = result;
      if (result !== "granted") return;
    }

    try {
      await triggerNativePopup(
        "🔔 Test Desktop Alert",
        "Success! This is how your task alerts will appear, even when you are in other apps or tabs.",
        null,
        "test-task",
        "test-alert-" + Date.now(),
      );
    } catch (e) {
      console.error("Test notification failed:", e);
    }
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

  onMount(() => {
    loadUserUniversities();
    notifChannel = new BroadcastChannel("uni-notifications-coord");

    fetchNotifications();
    const notificationInterval = setInterval(fetchNotifications, 15000); // Check every 15s

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

    // Explicitly register messaging service worker & Force update
    if (browser && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js", {
          scope: "/",
        })
        .then((registration) => {
          // Force immediate update if new one is waiting
          registration.update();
          console.log("SW Registered / Updating...");
        })
        .catch((err) => {
          console.error("SW registration failed:", err);
        });

      // Ensure the new SW takes control of all tabs immediately
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("Service Worker took control! Re-initializing FCM...");
        // Re-get token to ensure we're linked to the fresh SW
        getFcmToken().then((t) => {
          if (t)
            fetch("/api/fcm/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: t }),
            });
        });
      });
    }

    // Handle tab visibility (Away status) - ONLY if in AUTO mode
    const handleVisibilityChange = () => {
      fetchNotifications();
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

    // FCM Registration
    if (user) {
      if (
        Notification.permission !== "granted" &&
        Notification.permission !== "denied"
      ) {
        Notification.requestPermission();
      }
      getFcmToken().then((token) => {
        if (token) {
          fetch("/api/fcm/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              deviceInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
              },
            }),
          });
        }
      });

      onForegroundMessage((payload) => {
        // Log to verify message receipt
        console.log("[FCM_FOREGROUND] Received:", payload);

        const data = payload.data || {};
        const sourceId = data.sourceId || data.taskId || `notif-${Date.now()}`;
        const taskId = data.taskId;
        const action = data.action;
        const title =
          data.title || payload.notification?.title || "UniConnect Alert";
        const body = data.body || payload.notification?.body || "";

        // 1. DEDUPLICATION (Local & Multi-tab)
        if (processedSourceIds.has(sourceId)) return;
        processedSourceIds.add(sourceId);
        if (notifChannel)
          notifChannel.postMessage({ type: "STOP_DUPLICATE", sourceId });

        let url = data.link || (taskId ? `/communication-tasks/${taskId}` : null);
        if (!url && action === "OPEN_REQUESTS") url = "/users";

        // 2. Local State Sync (Tray)
        // Refresh tray data to include the new notification
        fetchNotifications();

        // 3. UI DISPLAY
        // Show the in-app toast only on the currently visible tab
        if (!document.hidden) {
          activeToasts = [
            ...activeToasts,
            {
              id: Math.random().toString(),
              title,
              message: body,
              link: url,
            },
          ];
        }

        // 4. NATIVE POPUP (Designated Task)
        triggerNativePopup(title, body, url, taskId, sourceId);
      });

      if (notifChannel) {
        notifChannel.onmessage = (event) => {
          if (event.data.type === "STOP_DUPLICATE") {
            processedSourceIds.add(event.data.sourceId);
          }
        };
      }
    }

    return () => {
      clearInterval(notificationInterval);
      clearInterval(presenceInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      if (notifChannel) notifChannel.close();
      updatePresence("OFFLINE");
    };
  });
</script>

<div
  class="flex flex-col h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden transition-colors duration-500"
>
  <!-- Mobile Header -->
  <header
    class="lg:hidden w-full h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 px-4 flex items-center justify-between sticky top-0 z-50 shrink-0"
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

  <div class="flex flex-1 min-h-0 relative">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800 lg:sticky lg:top-0 lg:h-screen z-[60] transition-all duration-300 {isSidebarOpen
        ? 'translate-x-0'
        : '-translate-x-full lg:translate-x-0'} flex flex-col overflow-hidden shadow-2xl lg:shadow-none"
    >
      <!-- Fixed Sidebar Header -->
      <div
        class="h-24 shrink-0 flex items-center justify-between px-8 border-b border-gray-50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md"
      >
        <div class="flex items-center space-x-3">
          <div
            class="p-2.5 bg-indigo-600 rounded-[1.25rem] shadow-lg shadow-indigo-500/20 transition-transform hover:rotate-12 hover:scale-105"
          >
            <img
              src="/nxtwave-logo.png"
              alt="NxtWave Institutional"
              class="h-7 w-auto object-contain invert"
            />
          </div>
          <div class="flex flex-col">
            <span
              class="text-lg font-black text-gray-900 dark:text-white leading-none tracking-tight"
              >UniConnect</span
            >
            <span
              class="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 mt-1.5 tracking-widest uppercase opacity-70"
              >Program Operations</span
            >
          </div>
        </div>
      </div>

      <!-- Scrollable Sidebar Content -->
      <nav class="flex-1 overflow-y-auto thin-scrollbar px-4 py-8 space-y-8">
        {#each navigation as section}
          {@const visibleItems = section.items.filter((item: any) =>
            item.alwaysShow ||
            user?.role === 'ADMIN' ||
            user?.role === 'PROGRAM_OPS' ||
            (item.id === 'budget-proposals' && (user?.role === 'CMA_MANAGER' || user?.role === 'CMA')) ||
            (user?.permissions || []).includes(item.id)
          )}
          {#if visibleItems.length > 0}
          <div class="space-y-1">
            <h3 class="px-4 pb-2 text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.25em]">
              {section.group}
            </h3>
            {#each visibleItems as item}
              <a
                href={item.href}
                onclick={() => (isSidebarOpen = false)}
                class="group flex items-center px-4 py-3 text-[13px] font-bold rounded-2xl transition-all duration-200
                {$page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/dashboard')
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/30 scale-[1.02]'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/80 hover:text-gray-900 dark:hover:text-gray-100'}"
              >
                <div class="mr-3 h-5 w-5 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d={item.icon} />
                  </svg>
                </div>
                <span class="truncate">{item.label}</span>
                {#if $page.url.pathname === item.href || ($page.url.pathname.startsWith(item.href) && item.href !== '/dashboard')}
                  <div class="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white] animate-pulse"></div>
                {/if}
              </a>
            {/each}
          </div>
          {/if}
        {/each}
      </nav>

      <!-- Fixed Sidebar Footer / Status -->
      <div
        class="shrink-0 px-8 py-6 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50"
      >
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse"></div>
            <span class="text-[9px] font-black text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-widest">System Active</span>
          </div>
          <button class="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:underline opacity-60 hover:opacity-100 transition-opacity">
            Help
          </button>
        </div>
        
        <div class="flex items-center gap-3 p-2 rounded-2xl bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/5 shadow-sm">
          <div class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-sm font-black text-white uppercase shadow-md">
            {user?.name?.[0] || 'U'}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-black text-gray-900 dark:text-white truncate uppercase tracking-tight">{user?.name || 'User'}</p>
            <p class="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{user?.role || 'Member'}</p>
          </div>
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
      class="flex-1 w-full min-w-0 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-slate-950 focus:outline-none flex flex-col transition-colors duration-500"
    >
      <div
        class="sticky top-0 z-40 bg-gray-50/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-gray-100/50 dark:border-slate-800/50 w-full flex justify-center"
      >
        <div
          class="w-full max-w-[1280px] px-4 sm:px-6 md:px-8 py-2 md:py-3 flex justify-end items-center gap-2 sm:gap-4"
        >
          <!-- University name badge (info only — each page has its own filter) -->
          {#if userUniversities.length === 1}
            <div class="text-xs font-bold text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40">
              {userUniversities[0].name}
            </div>
          {:else if userUniversities.length > 1}
            <div class="text-xs font-bold text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {userUniversities.length} Universities
            </div>
          {/if}

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

                {#if notificationPermission !== "granted"}
                  <div
                    class="p-5 bg-indigo-600 dark:bg-indigo-600 border-b border-indigo-500 shadow-inner"
                  >
                    <div class="flex items-start gap-3 mb-4">
                      <div class="p-2 bg-white/20 rounded-lg text-white">
                        <svg
                          class="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                          /></svg
                        >
                      </div>
                      <div class="flex-1">
                        <h4
                          class="text-[11px] font-black text-white uppercase tracking-wider mb-1"
                        >
                          System Alerts
                        </h4>
                        <p
                          class="text-[10px] font-bold text-indigo-100 leading-snug"
                        >
                          Get Teams-style popups even when you are working in
                          other apps.
                        </p>
                      </div>
                    </div>
                    <button
                      onclick={requestPermission}
                      class="w-full py-2.5 bg-white text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-gray-50 transition-all shadow-xl shadow-black/10 active:scale-95 animate-pulse-subtle"
                    >
                      Enable Desktop Alerts
                    </button>
                  </div>
                {:else}
                  <div
                    class="p-3 bg-emerald-50/50 dark:bg-emerald-500/10 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between"
                  >
                    <div class="flex items-center gap-2">
                      <div
                        class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
                      ></div>
                      <span
                        class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest"
                        >System Alerts Active</span
                      >
                    </div>
                    <button
                      onclick={testDesktopNotification}
                      class="text-[9px] font-black text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-2 py-1 rounded-md transition-all active:scale-95"
                    >
                      Send Test Popup
                    </button>
                  </div>
                {/if}
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

<!-- Toast Container -->
<div
  class="fixed top-6 right-6 z-[100] flex flex-col items-end pointer-events-none"
>
  {#each activeToasts as toast (toast.id)}
    <NotificationToast
      id={toast.id}
      title={toast.title}
      message={toast.message}
      link={toast.link}
      onClose={removeToast}
    />
  {/each}
</div>


