<script lang="ts">
  import { getContext } from "svelte";

  /**
   * Grip for handle-based drag-and-drop reordering of a question slot.
   * Both the drag source and a drop target: drag one grip onto another slot's
   * grip to move it. Reads the drag controller published by installPaperUi on
   * context "paper:drag", so a template just drops <AssessmentDragHandle
   * slotId={slot.id} /> next to each slot's other actions.
   */
  let { slotId, class: className = "" } = $props();

  const drag = getContext<any>("paper:drag");
  const dragging = $derived(!!drag && drag.activeId === slotId);
  const isOver = $derived(!!drag && drag.activeId && drag.overId === slotId && drag.activeId !== slotId);
  const active = $derived(!!drag && !!drag.activeId);
</script>

{#if drag && slotId}
  <button
    type="button"
    draggable="true"
    ondragstart={(e) => {
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      drag.start(slotId);
    }}
    ondragend={() => drag.cancel()}
    ondragenter={(e) => {
      if (drag.activeId) {
        e.preventDefault();
        drag.setOver(slotId);
      }
    }}
    ondragover={(e) => {
      if (drag.activeId) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }
    }}
    ondrop={(e) => {
      e.preventDefault();
      e.stopPropagation();
      drag.drop(slotId);
    }}
    title="Drag to reorder"
    aria-label="Drag to reorder question"
    class="no-print flex items-center justify-center rounded-lg text-white shadow transition-all cursor-grab active:cursor-grabbing
      {dragging ? 'bg-indigo-600 ring-2 ring-indigo-300 scale-105' : 'bg-slate-800 hover:bg-slate-900'}
      {isOver ? 'ring-2 ring-emerald-400 bg-emerald-600' : ''}
      {active ? 'opacity-100' : ''}
      {className || 'w-7 h-7'}"
  >
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 8h16M4 16h16" /></svg>
  </button>
{/if}
