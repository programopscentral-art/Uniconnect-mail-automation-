<script lang="ts">
  import { fade, fly, slide } from "svelte/transition";
  import {
    CheckCircle2,
    AlertCircle,
    Clock,
    ArrowLeft,
    Copy,
    MessageSquare,
    Users,
    Globe,
    Calendar,
    Check,
    AlertTriangle,
    Info,
    Share2,
  } from "lucide-svelte";
  import { enhance } from "$app/forms";

  let { data, form } = $props();
  let task = $derived(data.task);
  let user = $derived(data.user);

  let copied = $state(false);
  let showIssueForm = $state(false);

  function copyBody() {
    navigator.clipboard.writeText(task.message_body);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  const statusConfig = {
    Scheduled: {
      icon: Clock,
      color: "text-slate-500",
      bg: "bg-slate-50",
      border: "border-slate-100",
      label: "Scheduled",
    },
    Notified: {
      icon: AlertCircle,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      border: "border-indigo-100",
      label: "Due Now",
    },
    Completed: {
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      label: "Completed",
    },
    Canceled: {
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
      label: "Issue Reported",
    },
  };

  const config = $derived(
    statusConfig[task.status] || statusConfig["Scheduled"],
  );
</script>

<div class="max-w-4xl mx-auto space-y-8" in:fade>
  <!-- Breadcrumb -->
  <a
    href="/communication-tasks"
    class="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-[0.2em] transition-colors"
  >
    <ArrowLeft size={14} />
    Tasks Dashboard
  </a>

  <!-- Header & Status -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="space-y-2">
      <h1
        class="text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-none"
      >
        {task.message_title}
      </h1>
      <div class="flex items-center gap-3">
        <span
          class="px-3 py-1 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-full text-[9px] font-black uppercase tracking-widest text-indigo-500"
          >Task #{task.id.split("-")[0]}</span
        >
        <span class="text-gray-300 dark:text-gray-700">•</span>
        <span
          class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
          >Added {new Date(task.created_at).toLocaleDateString()}</span
        >
      </div>
    </div>

    <div
      class="flex items-center gap-4 px-6 py-4 rounded-[2rem] border {config.border} {config.bg} transition-all duration-500"
    >
      <config.icon size={24} class={config.color} />
      <div class="flex flex-col">
        <span
          class="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1"
          >Current Status</span
        >
        <span class="text-sm font-black {config.color} uppercase tracking-tight"
          >{config.label}</span
        >
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <!-- Main Message Content -->
    <div class="lg:col-span-2 space-y-6">
      <div
        class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-8 md:p-10 shadow-sm space-y-8 relative overflow-hidden"
      >
        <div class="absolute top-0 right-0 p-8">
          <button
            onclick={copyBody}
            class="flex items-center gap-2 px-5 py-2.5 {copied
              ? 'bg-emerald-500 text-white'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300'} rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-gray-200 dark:shadow-none"
          >
            {#if copied}
              <Check size={14} />
              Copied!
            {:else}
              <Copy size={14} />
              Copy Message
            {/if}
          </button>
        </div>

        <div class="space-y-4 pr-32">
          <div
            class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest"
          >
            <MessageSquare size={14} />
            Message Content to Send
          </div>
        </div>

        <div
          class="p-8 bg-gray-50 dark:bg-slate-800/50 rounded-3xl border border-gray-100 dark:border-slate-800/50 relative group"
        >
          <p
            class="text-gray-800 dark:text-gray-200 font-medium leading-relaxed whitespace-pre-wrap selection:bg-indigo-100 dark:selection:bg-indigo-900/40"
          >
            {task.message_body}
          </p>
        </div>

        <div
          class="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl"
        >
          <Info size={18} class="text-amber-600 shrink-0" />
          <p
            class="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase leading-relaxed tracking-tight"
          >
            Instructions: Copy the content above and send it via <span
              class="text-amber-600 dark:text-amber-300 underline underline-offset-2"
              >{task.channel}</span
            > to the target audience.
          </p>
        </div>
      </div>

      <!-- Execution Actions -->
      {#if task.status !== "Completed" && task.status !== "Canceled"}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" in:fly={{ y: 20 }}>
          <form method="POST" action="?/complete" use:enhance>
            <button
              class="w-full h-24 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group"
            >
              <div class="flex items-center gap-3">
                <CheckCircle2
                  size={24}
                  class="group-hover:scale-110 transition-transform"
                />
                <span class="text-sm font-black uppercase tracking-widest"
                  >Mark as Sent</span
                >
              </div>
              <span
                class="text-[9px] font-bold text-emerald-100 uppercase tracking-widest opacity-60"
                >Completed Execution</span
              >
            </button>
          </form>

          <button
            onclick={() => (showIssueForm = !showIssueForm)}
            class="w-full h-24 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 rounded-[2rem] transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group"
          >
            <div class="flex items-center gap-3">
              <AlertTriangle size={24} />
              <span class="text-sm font-black uppercase tracking-widest"
                >Report Issue</span
              >
            </div>
            <span
              class="text-[9px] font-bold text-red-400 uppercase tracking-widest opacity-60"
              >Execution Blocked</span
            >
          </button>
        </div>

        {#if showIssueForm}
          <div
            class="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/30 rounded-[2rem] p-8 shadow-2xl space-y-4"
            transition:slide
          >
            <h4
              class="text-xs font-black text-red-600 uppercase tracking-widest"
            >
              What's the issue?
            </h4>
            <form method="POST" action="?/report" use:enhance class="space-y-4">
              <textarea
                name="issue"
                rows="3"
                placeholder="Explain why this task cannot be completed..."
                class="w-full p-4 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-red-500/11 transition-all outline-none"
              ></textarea>
              <div class="flex justify-end gap-3">
                <button
                  type="button"
                  onclick={() => (showIssueForm = false)}
                  class="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-widest"
                  >Cancel</button
                >
                <button
                  type="submit"
                  class="px-8 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all"
                  >Submit Issue</button
                >
              </div>
            </form>
          </div>
        {/if}
      {:else if task.status === "Completed"}
        <div
          class="p-8 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 rounded-[2.5rem] flex items-center gap-6"
          in:fade
        >
          <div
            class="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h3
              class="text-lg font-black text-emerald-900 dark:text-emerald-400"
            >
              Execution Completed
            </h3>
            <p
              class="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest"
            >
              Marked sent on {new Date(task.marked_sent_at).toLocaleString()}
            </p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Sidebar Details -->
    <div class="space-y-6">
      <div
        class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm space-y-8"
      >
        <div class="space-y-6">
          <div class="space-y-2">
            <div
              class="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest"
            >
              <Globe size={14} />
              Universities
            </div>
            <div class="flex flex-wrap gap-2">
              {#each task.universities as uni}
                <span
                  class="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold"
                  >{uni}</span
                >
              {/each}
            </div>
          </div>

          <div class="space-y-2">
            <div
              class="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest"
            >
              <Share2 size={14} />
              Channel
            </div>
            <span
              class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight"
              >{task.channel}</span
            >
          </div>

          <div class="space-y-2">
            <div
              class="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest"
            >
              <Calendar size={14} />
              Execution Window
            </div>
            <div class="space-y-1">
              <span
                class="text-sm font-black text-gray-900 dark:text-white block uppercase tracking-tight"
              >
                {new Date(task.scheduled_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
              >
                {new Date(task.scheduled_at).toLocaleDateString([], {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          <div class="pt-6 border-t border-gray-50 dark:border-slate-800/50">
            <div
              class="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3"
            >
              <Users size={14} />
              Assigned Staff
            </div>
            <div class="space-y-3">
              {#each task.assigned_to as staffId}
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase border border-indigo-100/50 dark:border-indigo-800/50"
                  >
                    ID
                  </div>
                  <span
                    class="text-xs font-bold text-gray-600 dark:text-gray-300"
                    >Staff #{staffId.split("-")[0]}</span
                  >
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Notes Section -->
      {#if task.notes}
        <div
          class="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-[2rem] p-6 space-y-3"
        >
          <div
            class="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest"
          >
            <ClipboardList size={14} />
            Special Instructions
          </div>
          <p
            class="text-xs font-bold text-amber-900/70 dark:text-amber-400/70 leading-relaxed italic"
          >
            "{task.notes}"
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>
