<script lang="ts">
  /**
   * Consistent Solutions Mode toggle for every template. The button text
   * ("Solutions Mode: ON/OFF") is matched by the paper page's answer-key
   * capture flow (findSolutionsToggle), so keeping it verbatim lets the answer
   * key PDF be captured on any template.
   *
   * `ui` is the reactive object returned by installPaperUi(); mutating
   * ui.showSolutions here updates it everywhere (same object reference).
   */
  let { ui, class: className = "" } = $props();
</script>

<button
  type="button"
  onclick={() => (ui.showSolutions = !ui.showSolutions)}
  class="no-print flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all {ui.showSolutions
    ? 'bg-blue-600 text-white border-blue-700'
    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'} {className}"
>
  {#if ui.showSolutions}
    Solutions Mode: ON
  {:else}
    Solutions Mode: OFF
  {/if}
</button>
