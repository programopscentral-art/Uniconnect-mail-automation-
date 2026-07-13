<script lang="ts">
  /**
   * Caution shown when a university's MID/SEM template hasn't been loaded yet.
   * Hidden on print so it never leaks onto a real question paper.
   */
  import type { ResolvedTemplate } from "./templateRegistry";

  let { resolved }: { resolved: ResolvedTemplate } = $props();
</script>

{#if resolved.status !== "ready"}
  <div
    class="mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[10pt] font-semibold print:hidden {resolved.status ===
    'fallback'
      ? 'border-amber-400 bg-amber-50 text-amber-900'
      : 'border-red-300 bg-red-50 text-red-900'}"
    role="alert"
  >
    <span class="text-base leading-none">⚠️</span>
    <span>
      {resolved.message}
      <span class="ml-1 rounded bg-black/5 px-1.5 py-0.5 font-mono text-[9pt]"
        >{resolved.slug}</span
      >
    </span>
  </div>
{/if}
