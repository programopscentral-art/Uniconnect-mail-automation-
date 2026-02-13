<script lang="ts">
  import { fly } from "svelte/transition";
  import { X, Bell, ExternalLink } from "lucide-svelte";
  import { onMount } from "svelte";

  let { id, title, message, link, onClose } = $props<{
    id: string;
    title: string;
    message: string;
    link?: string | null;
    onClose: (id: string) => void;
  }>();

  onMount(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 8000); // 8 seconds to give enough time to read
    return () => clearTimeout(timer);
  });
</script>

<div
  transition:fly={{ x: 100, duration: 400 }}
  class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-100 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex gap-4 min-w-[320px] max-w-[420px] pointer-events-auto group relative overflow-hidden mb-3 animate-in fade-in slide-in-from-right-4"
>
  <!-- Accent Bar -->
  <div
    class="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.5)]"
  ></div>

  <!-- Icon Section -->
  <div class="flex-shrink-0">
    <div
      class="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 shadow-sm"
    >
      <Bell class="w-5 h-5" />
    </div>
  </div>

  <!-- Content Section -->
  <div class="flex-1 min-w-0 pr-6">
    <div class="flex items-center justify-between mb-1">
      <h4
        class="text-sm font-black text-gray-900 dark:text-white truncate tracking-tight uppercase"
      >
        {title}
      </h4>
      <span
        class="text-[9px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded-md uppercase tracking-tighter"
        >New</span
      >
    </div>
    <p
      class="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-snug font-medium"
    >
      {message}
    </p>

    {#if link}
      <div class="mt-3 flex items-center justify-between">
        <a
          href={link}
          onclick={() => onClose(id)}
          class="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          View Details
          <ExternalLink class="w-3 h-3" />
        </a>
      </div>
    {/if}
  </div>

  <!-- Close Button -->
  <button
    onclick={() => onClose(id)}
    class="absolute top-4 right-4 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all hover:rotate-90"
    aria-label="Close notification"
  >
    <X class="w-4 h-4" />
  </button>
</div>

<style>
  div {
    z-index: 10000;
  }
</style>
