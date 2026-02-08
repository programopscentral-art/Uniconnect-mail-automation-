<script lang="ts">
  /**
   * Reusable, robust contenteditable cell.
   * Prevents common focus/composition bugs in Svelte 5.
   */
  let {
    value = "",
    onUpdate,
    class: className = "",
    isEditable = true,
    multiline = false,
    placeholder = "",
    style = "",
  } = $props();

  function editable(node: HTMLElement) {
    node.innerHTML = value || "";
    node.contentEditable = isEditable ? "true" : "false";
    let lastValue = value;

    const handleBlur = () => {
      const current = node.innerHTML;
      if (current !== lastValue) {
        lastValue = current;
        value = current;
        if (onUpdate) onUpdate(current);
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
        node.blur();
      }
    };

    node.addEventListener("blur", handleBlur);
    node.addEventListener("keydown", handleKeydown);

    const cleanup = $effect.root(() => {
      $effect(() => {
        node.contentEditable = isEditable ? "true" : "false";
        // Only update DOM if the state changed from OUTSIDE
        if (value !== lastValue) {
          lastValue = value;
          node.innerHTML = value || "";
        }
      });
    });

    return {
      destroy() {
        node.removeEventListener("blur", handleBlur);
        node.removeEventListener("keydown", handleKeydown);
        cleanup();
      },
    };
  }
</script>

<div
  use:editable
  class="outline-none focus:bg-indigo-50/10 dark:focus:bg-indigo-900/20 min-w-[20px] transition-colors rounded {className} {isEditable
    ? 'cursor-text hover:bg-slate-50 dark:hover:bg-slate-800'
    : 'pointer-events-none'}"
  style="{style}; white-space: pre-wrap; color: inherit; font-family: {(() => {
    const v = String(value || '');
    return (
      v.includes('      ') ||
      v.includes('    ') ||
      v.includes('\t') ||
      v.includes('[COL]')
    );
  })()
    ? 'monospace'
    : 'inherit'};"
  tabindex={isEditable ? 0 : -1}
  role="textbox"
  aria-label={placeholder || "Editable Content"}
  aria-multiline={multiline}
  data-placeholder={placeholder}
></div>

<style>
  div:empty:before {
    content: attr(data-placeholder);
    color: #94a3b8; /* text-slate-400 */
    font-weight: 500;
  }
</style>
