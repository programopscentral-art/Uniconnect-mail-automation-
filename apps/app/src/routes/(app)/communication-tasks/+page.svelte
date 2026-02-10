<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import {
    Plus,
    MessageSquare,
    Clock,
    CheckCircle2,
    AlertCircle,
    Copy,
    ExternalLink,
    Filter,
    Search,
    Trash2,
  } from "lucide-svelte";
  import { enhance } from "$app/forms";

  let { data } = $props();
  let tasks = $derived(data.tasks);
  let user = $derived(data.user);

  let searchQuery = $state("");
  let statusFilter = $state("ALL");

  const filteredTasks = $derived(
    tasks.filter((t) => {
      const matchesSearch =
        t.message_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.universities.some((u) =>
          u.toLowerCase().includes(searchQuery.toLowerCase()),
        );
      const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    }),
  );

  function getPriorityColor(priority: string) {
    switch (priority) {
      case "High":
        return "text-red-500 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20";
      case "Normal":
        return "text-amber-500 bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20";
      default:
        return "text-blue-500 bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20";
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "Completed":
        return {
          icon: CheckCircle2,
          class:
            "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
        };
      case "Notified":
        return {
          icon: AlertCircle,
          class:
            "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20",
        };
      case "Canceled":
        return {
          icon: AlertCircle,
          class:
            "bg-gray-50 text-gray-600 dark:bg-gray-500/10 border-gray-100 dark:border-gray-500/20",
        };
      default:
        return {
          icon: Clock,
          class:
            "bg-slate-50 text-slate-600 dark:bg-slate-500/10 border-slate-100 dark:border-slate-500/20",
        };
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    // Toast?
  }

  let deletingId = $state<string | null>(null);
  let optimisticDeletedIds = $state<string[]>([]);
</script>

<div class="space-y-8" in:fade>
  <!-- Header Section -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h1
        class="text-3xl font-black text-gray-900 dark:text-white tracking-tight"
      >
        Communication Tasks
      </h1>
      <p
        class="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1"
      >
        Manage and track manual communications
      </p>
    </div>

    {#if ["ADMIN", "PROGRAM_OPS", "COS", "PMA", "PM"].includes(user.role)}
      <a
        href="/communication-tasks/new"
        class="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/20 transition-all active:scale-95"
      >
        <Plus size={16} />
        Create New Task
      </a>
    {/if}
  </div>

  <!-- Filters & Stats -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div class="md:col-span-2 relative">
      <Search
        class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        size={18}
      />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search by title or university..."
        class="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
      />
    </div>

    <div class="relative">
      <Filter
        class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        size={18}
      />
      <select
        bind:value={statusFilter}
        class="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none appearance-none"
      >
        <option value="ALL">All Statuses</option>
        <option value="Scheduled">Scheduled</option>
        <option value="Notified">Notified (Due Now)</option>
        <option value="Completed">Completed</option>
        <option value="Canceled">Canceled</option>
      </select>
    </div>

    <div class="bg-indigo-600 rounded-2xl p-4 flex flex-col justify-center">
      <span
        class="text-[10px] font-black text-indigo-100 uppercase tracking-widest"
        >Active Tasks</span
      >
      <span class="text-2xl font-black text-white">{filteredTasks.length}</span>
    </div>
  </div>

  <!-- Task Cards -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {#each filteredTasks.filter((t) => !optimisticDeletedIds.includes(t.id)) as task (task.id)}
      {@const statusBadge = getStatusBadge(task.status)}
      <div
        class="group bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/5 transition-all relative overflow-hidden"
        in:fly={{ y: 20, duration: 400 }}
      >
        <!-- Priority Dot -->
        <div class="absolute top-0 right-0 p-8 flex items-center gap-3">
          <span
            class="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border {getPriorityColor(
              task.priority,
            )}"
          >
            {task.priority}
          </span>

          {#if ["ADMIN", "PROGRAM_OPS", "COS", "PMA", "PM"].includes(user.role)}
            {#if deletingId === task.id}
              <div class="flex items-center gap-2" in:fly={{ x: 10 }}>
                <form
                  method="POST"
                  action="?/delete"
                  use:enhance={() => {
                    optimisticDeletedIds = [...optimisticDeletedIds, task.id];
                    return async ({ result, update }) => {
                      if (result.type !== "success") {
                        optimisticDeletedIds = optimisticDeletedIds.filter(
                          (id) => id !== task.id,
                        );
                      }
                      deletingId = null;
                      await update();
                    };
                  }}
                >
                  <input type="hidden" name="id" value={task.id} />
                  <button
                    type="submit"
                    class="p-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                    title="Confirm Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </form>
                <button
                  onclick={() => (deletingId = null)}
                  class="p-2 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded-xl hover:bg-gray-200 transition-colors text-[10px] font-black uppercase"
                >
                  Cancel
                </button>
              </div>
            {:else}
              <button
                onclick={() => (deletingId = task.id)}
                class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                title="Delete Task"
              >
                <Trash2 size={16} />
              </button>
            {/if}
          {/if}
        </div>

        <div class="space-y-6">
          <div class="flex items-start gap-4">
            <div
              class="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-2x border border-indigo-100 dark:border-indigo-800"
            >
              <MessageSquare
                class="text-indigo-600 dark:text-indigo-400"
                size={24}
              />
            </div>
            <div class="space-y-1 pr-16">
              <h3
                class="text-lg font-black text-gray-900 dark:text-white leading-tight"
              >
                {task.message_title}
              </h3>
              <div class="flex flex-wrap gap-2 pt-1">
                <span
                  class="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-tighter bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-lg border border-amber-100/50 dark:border-amber-800/50"
                  >{task.update_type}</span
                >
                {#if task.team}
                  <span
                    class="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-lg border border-emerald-100/50 dark:border-emerald-800/50"
                    >{task.team}</span
                  >
                {/if}
                {#each task.universities as uni}
                  <span
                    class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-tighter bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-lg border border-indigo-100/50 dark:border-indigo-800/50"
                    >{uni}</span
                  >
                {/each}
              </div>
            </div>
          </div>

          <div
            class="grid grid-cols-2 gap-4 bg-gray-50/50 dark:bg-slate-800/50 p-6 rounded-3xl border border-gray-100/50 dark:border-slate-800/50"
          >
            <div class="space-y-1">
              <span
                class="text-[9px] font-black text-gray-400 uppercase tracking-widest block"
                >Channel</span
              >
              <span class="text-xs font-black text-gray-700 dark:text-gray-300"
                >{task.channel}</span
              >
            </div>
            <div class="space-y-1">
              <span
                class="text-[9px] font-black text-gray-400 uppercase tracking-widest block"
                >Scheduled For</span
              >
              <span class="text-xs font-black text-gray-700 dark:text-gray-300"
                >{new Date(task.scheduled_at).toLocaleString()}</span
              >
            </div>
          </div>

          <div class="flex items-center justify-between pt-4">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl border {statusBadge.class}">
                <statusBadge.icon size={16} />
              </div>
              <div>
                <span
                  class="text-[9px] font-black text-gray-400 uppercase tracking-widest block"
                  >Status</span
                >
                <span
                  class="text-xs font-black {statusBadge.class.split(' ')[1]}"
                  >{task.status}</span
                >
              </div>
            </div>

            <a
              href="/communication-tasks/{task.id}"
              class="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg"
            >
              Open Details
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    {:else}
      <div class="lg:col-span-2 py-20 text-center">
        <div
          class="inline-flex p-6 bg-gray-50 dark:bg-slate-900 rounded-[2.5rem] mb-4 border border-gray-100 dark:border-slate-800"
        >
          <AlertCircle class="text-gray-300" size={48} />
        </div>
        <h3 class="text-lg font-black text-gray-900 dark:text-white">
          No tasks found
        </h3>
        <p
          class="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1"
        >
          Adjust your filters or create a new one
        </p>
      </div>
    {/each}
  </div>
</div>
