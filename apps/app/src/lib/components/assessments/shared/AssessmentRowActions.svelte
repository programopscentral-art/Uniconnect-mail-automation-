<script lang="ts">
    /**
     * Shared row actions for assessment templates (Swap, Move Up/Down, Delete).
     *
     * Reordering is done with explicit Move Up / Move Down buttons rather than
     * native drag-and-drop. Drag (svelte-dnd-action on <tbody> rows) broke on
     * OR-groups — a single question slot renders multiple <tr> rows, so the
     * library mis-mapped items to rows during a drag and stacked the text on top
     * of itself. Move buttons are deterministic and work identically on every
     * template, including table-based ones.
     *
     * onMoveUp/onMoveDown are optional: when a template hasn't wired reordering,
     * the buttons simply don't render (no dead controls).
     */
    let {
        onSwap,
        onDelete,
        onMoveUp = null,
        onMoveDown = null,
        canMoveUp = true,
        canMoveDown = true,
        isEditable = true,
        class: className = ""
    } = $props();
</script>

{#if isEditable}
    <div class="absolute -left-12 top-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 group-hover/row:opacity-100 group-hover/q:opacity-100 transition-opacity no-print z-50 {className}">
        {#if onSwap}
            <button
                onclick={(e) => { e.stopPropagation(); onSwap(); }}
                title="Swap Question"
                class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700 active:scale-95 transition-all"
            >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
        {/if}

        {#if onMoveUp}
            <button
                onclick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={!canMoveUp}
                title="Move Up"
                class="w-7 h-7 bg-slate-800 text-white rounded-lg flex items-center justify-center shadow hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
            >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7" /></svg>
            </button>
        {/if}

        {#if onMoveDown}
            <button
                onclick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={!canMoveDown}
                title="Move Down"
                class="w-7 h-7 bg-slate-800 text-white rounded-lg flex items-center justify-center shadow hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
            >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" /></svg>
            </button>
        {/if}

        {#if onDelete}
            <button
                onclick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete Question"
                class="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center shadow hover:bg-red-600 active:scale-95 transition-all"
            >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        {/if}
    </div>
{/if}
