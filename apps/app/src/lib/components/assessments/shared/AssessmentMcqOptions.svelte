<script lang="ts">
    /**
     * Smart MCQ option renderer.
     * Prevents double labeling like "(a) A. Rs. 200".
     */
    let { options = [], class: className = "" } = $props();

    function formatOption(opt: string, index: number) {
        if (!opt) return "";
        const label = String.fromCharCode(97 + index); // a, b, c, d
        const cleanOpt = opt.trim();
        
        // If it already starts with A. or (A) or A)
        const hasLabel = /^[a-dA-D][\.\)]/.test(cleanOpt) || /^\([a-dA-D]\)/.test(cleanOpt);
        
        if (hasLabel) return cleanOpt;
        return `(${label}) ${cleanOpt}`;
    }
</script>

{#if options && options.length > 0}
    <div class="mt-1.5 text-xs grid grid-cols-2 gap-x-4 opacity-80 italic {className}">
        {#each options as opt, i}
            <span>{formatOption(opt, i)}</span>
        {/each}
    </div>
{/if}
