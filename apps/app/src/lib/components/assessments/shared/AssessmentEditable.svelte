<script lang="ts">
    /**
     * Reusable, robust contenteditable cell.
     * Prevents common focus/composition bugs in Svelte 5.
     */
    let { value = '', onUpdate, class: className = '', isEditable = true, multiline = false } = $props();

    function editable(node: HTMLElement) {
        node.innerHTML = value || '';
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
            if (!multiline && e.key === 'Enter') {
                e.preventDefault();
                node.blur();
            }
        };

        node.addEventListener('blur', handleBlur);
        node.addEventListener('keydown', handleKeydown);

        return {
            update() {
                node.contentEditable = isEditable ? "true" : "false";
                // Only update DOM if the state changed from OUTSIDE
                if (value !== lastValue) {
                    lastValue = value;
                    node.innerHTML = value || '';
                }
            },
            destroy() {
                node.removeEventListener('blur', handleBlur);
                node.removeEventListener('keydown', handleKeydown);
            }
        };
    }
</script>

<div 
    use:editable
    class="outline-none focus:bg-indigo-50/10 min-w-[20px] transition-colors rounded {className} {isEditable ? 'cursor-text hover:bg-slate-50' : 'pointer-events-none'}"
    role="textbox"
    aria-multiline={multiline}
    tabindex="0"
></div>
