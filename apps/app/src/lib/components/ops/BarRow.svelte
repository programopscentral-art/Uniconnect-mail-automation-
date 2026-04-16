<script lang="ts">
    let {
        bars = [],
        max = 0
    }: {
        bars?: Array<{ label: string; value: number; color?: string; hint?: string }>;
        max?: number;
    } = $props();

    const computedMax = $derived(max > 0 ? max : Math.max(1, ...bars.map((b) => b.value)));
</script>

<div class="flex flex-col gap-2.5">
    {#each bars as b}
        {@const pct = Math.max(0, Math.min(100, (b.value / computedMax) * 100))}
        <div>
            <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-zinc-600 dark:text-zinc-400 font-medium">{b.label}</span>
                <span class="text-zinc-900 dark:text-zinc-100 font-semibold tabular-nums">
                    {b.value}{#if b.hint}<span class="text-zinc-400 font-normal ml-1">{b.hint}</span>{/if}
                </span>
            </div>
            <div class="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                    class="h-full rounded-full"
                    style="width: {pct}%; background: {b.color ?? '#6366f1'}; transition: width .6s cubic-bezier(.4,0,.2,1);"
                ></div>
            </div>
        </div>
    {/each}
</div>
