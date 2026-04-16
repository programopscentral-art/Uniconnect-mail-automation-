<script lang="ts">
    import DeltaChip from './DeltaChip.svelte';
    import type { Snippet } from 'svelte';

    let {
        label = '',
        value = '',
        suffix = '',
        delta = null,
        deltaSuffix = '%',
        invertDelta = false,
        hint = '',
        tone = 'default',
        icon
    }: {
        label?: string;
        value?: string | number;
        suffix?: string;
        delta?: number | null;
        deltaSuffix?: string;
        invertDelta?: boolean;
        hint?: string;
        tone?: 'default' | 'good' | 'warn' | 'bad';
        icon?: Snippet;
    } = $props();

    const toneCls: Record<string, string> = {
        default: 'text-zinc-900 dark:text-zinc-50',
        good: 'text-emerald-600 dark:text-emerald-400',
        warn: 'text-amber-600 dark:text-amber-400',
        bad: 'text-rose-600 dark:text-rose-400'
    };
</script>

<div class="flex flex-col gap-1 min-w-0">
    <div class="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
        {#if icon}
            <span class="shrink-0">{@render icon()}</span>
        {/if}
        <span class="truncate">{label}</span>
    </div>
    <div class="flex items-baseline gap-2">
        <div class="text-2xl md:text-3xl font-bold tabular-nums leading-none {toneCls[tone]}">
            {value}{#if suffix}<span class="text-base text-zinc-400 dark:text-zinc-500 ml-0.5">{suffix}</span>{/if}
        </div>
        {#if delta !== null && delta !== undefined}
            <DeltaChip value={delta} suffix={deltaSuffix} invert={invertDelta} size="xs" />
        {/if}
    </div>
    {#if hint}
        <div class="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</div>
    {/if}
</div>
