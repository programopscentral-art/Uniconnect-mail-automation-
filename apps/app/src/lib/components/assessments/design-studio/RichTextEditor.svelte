<script lang="ts">
  import { onMount } from "svelte";

  let {
    value = $bindable(""),
    active = false,
    placeholder = "Type something...",
    onUpdate,
  } = $props();

  let editorNode = $state<HTMLElement | null>(null);
  let isFocused = $state(false);

  // Sync state -> DOM
  $effect(() => {
    if (editorNode && !isFocused && editorNode.innerHTML !== value) {
      editorNode.innerHTML = value || "";
    }
  });

  function handleInput() {
    if (editorNode) {
      const current = editorNode.innerHTML;
      if (current !== value) {
        value = current;
        if (onUpdate) onUpdate(current);
      }
    }
  }

  function handleFocus() {
    isFocused = true;
  }

  function handleBlur() {
    isFocused = false;
    handleInput();
  }

  // Public methods to be called from parent toolbar
  export function exec(command: string, value: string | null = null) {
    if (!editorNode) return;
    editorNode.focus();
    document.execCommand(command, false, value || undefined);
    handleInput();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={editorNode}
  contenteditable="true"
  class="w-full h-full outline-none p-1 min-h-[1em] relative"
  class:cursor-text={active}
  oninput={handleInput}
  onfocus={handleFocus}
  onblur={handleBlur}
  {placeholder}
></div>

<style>
  div:empty:before {
    content: attr(placeholder);
    color: #cbd5e1;
    opacity: 0.5;
    pointer-events: none;
    position: absolute;
  }

  /* Reset some default styles for rich text */
  div :global(p) {
    margin: 0;
  }
  div :global(b),
  div :global(strong) {
    font-weight: 700;
  }
</style>
