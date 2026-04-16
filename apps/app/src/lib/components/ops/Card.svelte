<script lang="ts">
    import type { Snippet } from 'svelte';

    let {
        title = '',
        subtitle = '',
        icon,
        accent = '',
        className = '',
        header,
        children,
        footer
    }: {
        title?: string;
        subtitle?: string;
        icon?: Snippet;
        accent?: '' | 'rose' | 'amber' | 'emerald' | 'sky' | 'violet';
        className?: string;
        header?: Snippet;
        children?: Snippet;
        footer?: Snippet;
    } = $props();

    const accentRing: Record<string, string> = {
        '': '',
        rose: 'ring-1 ring-rose-200 dark:ring-rose-900/40 bg-gradient-to-br from-rose-50/70 to-white dark:from-rose-950/30 dark:to-zinc-900',
        amber: 'ring-1 ring-amber-200 dark:ring-amber-900/40',
        emerald: 'ring-1 ring-emerald-200 dark:ring-emerald-900/40',
        sky: 'ring-1 ring-sky-200 dark:ring-sky-900/40',
        violet: 'ring-1 ring-violet-200 dark:ring-violet-900/40'
    };
</script>

<div
    class="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800
           shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)]
           p-5 md:p-6 flex flex-col gap-4 {accentRing[accent]} {className}"
>
    {#if header}
        {@render header()}
    {:else if title}
        <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
                {#if icon}
                    <span class="text-zinc-500 dark:text-zinc-400 shrink-0">{@render icon()}</span>
                {/if}
                <div class="min-w-0">
                    <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{title}</h3>
                    {#if subtitle}
                        <p class="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</p>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    {#if children}
        {@render children()}
    {/if}

    {#if footer}
        <div class="pt-3 border-t border-zinc-100 dark:border-zinc-800">
            {@render footer()}
        </div>
    {/if}
</div>
