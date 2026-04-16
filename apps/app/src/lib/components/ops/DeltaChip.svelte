<script lang="ts">
    let {
        value = 0,
        suffix = '%',
        invert = false,
        size = 'sm'
    }: {
        value?: number | null;
        suffix?: string;
        invert?: boolean;
        size?: 'xs' | 'sm' | 'md';
    } = $props();

    const fmt = $derived.by(() => {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        const v = Number(value);
        if (v === 0) return '0' + suffix;
        const sign = v > 0 ? '+' : '';
        return `${sign}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}${suffix}`;
    });

    const tone = $derived.by(() => {
        if (value === null || value === undefined || Number.isNaN(value) || value === 0)
            return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';
        const good = invert ? (value < 0) : (value > 0);
        return good
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400';
    });

    const sizeCls = $derived({
        xs: 'text-[10px] px-1.5 py-0.5 gap-0.5',
        sm: 'text-[11px] px-2 py-0.5 gap-1',
        md: 'text-xs px-2.5 py-1 gap-1'
    }[size]);

    const arrow = $derived(value === null || value === undefined || value === 0 ? '' : value > 0 ? '↑' : '↓');
</script>

<span class="inline-flex items-center rounded-full font-semibold tabular-nums {sizeCls} {tone}">
    {#if arrow}<span>{arrow}</span>{/if}
    <span>{fmt}</span>
</span>
