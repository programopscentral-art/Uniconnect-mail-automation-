<script lang="ts">
    /**
     * Smart MCQ option renderer — now editable.
     *
     * Each option is a contenteditable cell, so an SME can correct a typo in an
     * option without re-uploading the bank. The (a)/(b) label is rendered
     * separately and is NOT part of the stored value, so editing never
     * double-labels ("(a) A. Rs. 200").
     *
     * Persistence: options are mutated in place on the question object (a
     * reactive proxy) and then "paper:touch" — published by installPaperUi — is
     * called to save. That keeps every existing call site unchanged.
     */
    import { getContext } from "svelte";
    import AssessmentEditable from "./AssessmentEditable.svelte";

    let {
        options = [],
        class: className = "",
        isEditable = true,
    } = $props();

    const touch = getContext<(() => void) | undefined>("paper:touch");

    // True when the stored value already carries its own "A." / "(A)" / "A)" label.
    const hasOwnLabel = (opt: string) => {
        const v = String(opt || "").trim();
        return /^[a-dA-D][\.\)]/.test(v) || /^\([a-dA-D]\)/.test(v);
    };

    const labelFor = (index: number) => `(${String.fromCharCode(97 + index)})`;

    function setOption(index: number, value: string) {
        if (!options || options[index] === value) return;
        options[index] = value;
        touch?.();
    }
</script>

{#if options && options.length > 0}
    <div
        class="mt-1.5 text-xs grid grid-cols-2 gap-x-4 gap-y-0.5 opacity-80 italic {className}"
    >
        {#each options as opt, i}
            <span class="flex items-start gap-1 min-w-0">
                {#if !hasOwnLabel(opt)}
                    <span class="shrink-0">{labelFor(i)}</span>
                {/if}
                <AssessmentEditable
                    value={String(opt ?? "")}
                    {isEditable}
                    onUpdate={(v: string) => setOption(i, v)}
                    class="flex-1 min-w-[2ch]"
                />
            </span>
        {/each}
    </div>
{/if}
