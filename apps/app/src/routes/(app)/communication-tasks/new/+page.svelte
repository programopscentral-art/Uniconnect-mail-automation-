<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import {
    MessageSquare,
    Calendar,
    Users,
    ClipboardList,
    Info,
    ArrowLeft,
    Send,
    Sparkles,
  } from "lucide-svelte";

  let { data, form } = $props();
  let universities = $derived(data.universities);
  let users = $derived(data.users);

  let selectedUniversities = $state<string[]>([]);
  let userSearchQuery = $state("");

  const filteredUsers = $derived(
    users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.role.toLowerCase().includes(userSearchQuery.toLowerCase());

      if (selectedUniversities.length === 0) return matchesSearch;

      const selectedUniIds = universities
        .filter((uni) =>
          selectedUniversities.includes(uni.short_name || uni.name),
        )
        .map((uni) => uni.id);

      const userUniIds = [
        u.university_id,
        ...(u.universities || []).map((un: any) => un.id),
      ].filter(Boolean);
      return (
        matchesSearch && selectedUniIds.some((id) => userUniIds.includes(id))
      );
    }),
  );

  const channels = [
    "WhatsApp - Students",
    "WhatsApp - Parents",
    "Student App",
    "Parent App",
    "Email",
  ];

  const priorities = ["Low", "Normal", "High"];
  const updateTypes = [
    "Announcement",
    "Reminder",
    "Event Campaign",
    "Positive Message",
    "Other",
  ];
  const teams = ["Student Engagement", "Parent Communication"];
  const contentTypes = ["Plain Text", "Markdown"];

  // Set default scheduled time to 1 hour from now
  const defaultDate = new Date();
  defaultDate.setHours(defaultDate.getHours() + 1);
  const defaultScheduledAt = defaultDate.toISOString().slice(0, 16);
</script>

<div class="max-w-4xl mx-auto space-y-8" in:fade>
  <!-- Simple Breadcrumb -->
  <a
    href="/communication-tasks"
    class="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-[0.2em] transition-colors group"
  >
    <ArrowLeft
      size={14}
      class="group-hover:-translate-x-1 transition-transform"
    />
    Back to Tasks
  </a>

  <!-- Header Section -->
  <div class="flex items-center gap-6">
    <div
      class="p-5 bg-indigo-600 text-white rounded-[2rem] shadow-xl shadow-indigo-500/20"
    >
      <Sparkles size={32} />
    </div>
    <div>
      <h1
        class="text-3xl font-black text-gray-900 dark:text-white tracking-tight"
      >
        Schedule New Message
      </h1>
      <p
        class="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1"
      >
        Define task parameters and assigned executioners
      </p>
    </div>
  </div>

  {#if form?.error}
    <div
      class="p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl flex items-center gap-3 text-red-600 text-xs font-bold uppercase tracking-widest"
      in:fly={{ y: -10 }}
    >
      <Info size={18} />
      {form.error}
    </div>
  {/if}

  <form method="POST" class="space-y-6">
    <!-- Main Configuration Card -->
    <div
      class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-8 md:p-12 shadow-sm space-y-10"
    >
      <!-- Section 1: Visibility & Channel -->
      <div class="space-y-6">
        <div
          class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
        >
          <span class="w-8 h-px bg-indigo-100 dark:bg-indigo-900/50"></span>
          Step 1: Context & Method
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Universities Select (Multiple) -->
          <div class="space-y-3">
            <label
              class="flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight"
            >
              <Users size={14} class="text-indigo-500" />
              Target Universities
            </label>
            <div
              class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1"
            >
              {#each universities as uni}
                <label
                  class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-transparent hover:border-indigo-500/30 cursor-pointer transition-all has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-500/10 has-[:checked]:border-indigo-500/50"
                >
                  <input
                    type="checkbox"
                    name="universities"
                    value={uni.short_name || uni.name}
                    bind:group={selectedUniversities}
                    class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span
                    class="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase"
                    >{uni.short_name || uni.name}</span
                  >
                </label>
              {/each}
            </div>
          </div>

          <!-- Channel Select -->
          <div class="space-y-3">
            <label
              class="flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight"
            >
              <MessageSquare size={14} class="text-indigo-500" />
              Communication Channel
            </label>
            <div class="space-y-2">
              {#each channels as channel}
                <label
                  class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-transparent hover:border-indigo-500/30 cursor-pointer transition-all has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-500/10 has-[:checked]:border-indigo-500/50"
                >
                  <input
                    type="radio"
                    name="channel"
                    value={channel}
                    class="w-4 h-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    required
                  />
                  <span
                    class="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase"
                    >{channel}</span
                  >
                </label>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Message Content -->
      <div class="space-y-6">
        <div
          class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
        >
          <span class="w-8 h-px bg-indigo-100 dark:bg-indigo-900/50"></span>
          Step 2: Message Details
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label
                class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight pl-1"
                for="update_type">Update Type</label
              >
              <select
                name="update_type"
                id="update_type"
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none outline-none"
              >
                {#each updateTypes as type}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </div>
            <div class="space-y-2">
              <label
                class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight pl-1"
                for="team">Team (Optional)</label
              >
              <select
                name="team"
                id="team"
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none outline-none"
              >
                <option value="">Select Team</option>
                {#each teams as team}
                  <option value={team}>{team}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <label
              class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight pl-1"
              for="title">Message Title</label
            >
            <input
              type="text"
              name="message_title"
              id="title"
              placeholder="e.g. ⚠️ GSOC 2026 – Final Reminder"
              class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
              required
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label
                class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight pl-1"
                for="content_type">Content Type</label
              >
              <select
                name="content_type"
                id="content_type"
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none outline-none"
              >
                {#each contentTypes as type}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </div>
            <div class="space-y-2">
              <label
                class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight pl-1"
                for="link">Link (Optional)</label
              >
              <input
                type="url"
                name="link"
                id="link"
                placeholder="https://..."
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label
              class="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight pl-1"
              for="body">Message Content (Copyable by assigned staff)</label
            >
            <textarea
              name="message_body"
              id="body"
              rows="6"
              placeholder="Paste the message content here..."
              class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none resize-none"
              required
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Section 3: Scheduling & Assignment -->
      <div class="space-y-6">
        <div
          class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
        >
          <span class="w-8 h-px bg-indigo-100 dark:bg-indigo-900/50"></span>
          Step 3: Execution Plan
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="space-y-4">
            <div class="space-y-2">
              <label
                class="flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight"
                for="scheduled_at"
              >
                <Calendar size={14} class="text-indigo-500" />
                Scheduled Time
              </label>
              <input
                type="datetime-local"
                name="scheduled_at"
                id="scheduled_at"
                value={defaultScheduledAt}
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all outline-none"
                required
              />
            </div>

            <div class="space-y-2">
              <label
                class="flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight"
                for="priority"
              >
                <ClipboardList size={14} class="text-indigo-500" />
                Priority Level
              </label>
              <select
                name="priority"
                id="priority"
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all appearance-none outline-none"
              >
                {#each priorities as p}
                  <option value={p}>{p}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <label
              class="flex items-center gap-2 text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight"
            >
              <Users size={14} class="text-indigo-500" />
              Assigned Staff
            </label>
            <div class="space-y-3">
              <div class="relative">
                <Search
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={12}
                />
                <input
                  type="text"
                  bind:value={userSearchQuery}
                  placeholder="Search staff..."
                  class="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-slate-800/50 border border-transparent rounded-xl text-[10px] font-bold focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none"
                />
              </div>
              <div
                class="h-48 overflow-y-auto p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-transparent custom-scrollbar"
              >
                <div class="space-y-2">
                  {#each filteredUsers as staff (staff.id)}
                    <label
                      class="flex items-center gap-3 p-3 hover:bg-white dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors group"
                    >
                      <input
                        type="checkbox"
                        name="assigned_to"
                        value={staff.id}
                        class="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div class="flex flex-col">
                        <span
                          class="text-xs font-bold text-gray-700 dark:text-gray-200"
                          >{staff.name}</span
                        >
                        <span
                          class="text-[9px] font-black text-gray-400 uppercase tracking-widest"
                          >{staff.role}</span
                        >
                      </div>
                    </label>
                  {:else}
                    <div class="py-10 text-center">
                      <p
                        class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
                      >
                        No matching staff
                      </p>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Submit Section -->
      <div class="pt-10 flex border-t border-gray-50 dark:border-slate-800/50">
        <button
          type="submit"
          class="w-full md:w-auto px-12 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          <Send size={18} />
          Schedule Communication
        </button>
      </div>
    </div>
  </form>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(99, 102, 241, 0.1);
    border-radius: 10px;
  }
</style>
