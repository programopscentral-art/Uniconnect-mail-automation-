<script lang="ts">
    let {
        groups = [],
        series = []
    }: {
        groups?: string[];
        series?: Array<{ name: string; values: number[]; color: string }>;
    } = $props();

    const height = 160;
    const padT = 10;
    const padB = 22;
    const padL = 24;
    const padR = 8;
    const width = 420;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const max = $derived(Math.max(1, ...series.flatMap((s) => s.values)));
    const groupWidth = $derived(groups.length > 0 ? innerW / groups.length : innerW);
    const barGap = 2;
    const barWidth = $derived(Math.max(6, (groupWidth - barGap * (series.length + 1)) / Math.max(series.length, 1)));
</script>

<div class="w-full">
    <svg viewBox="0 0 {width} {height}" class="w-full h-auto" preserveAspectRatio="none">
        {#each [0, 0.5, 1] as p}
            {@const y = padT + innerH * (1 - p)}
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="currentColor" class="text-zinc-100 dark:text-zinc-800" />
            <text x={padL - 4} y={y + 3} text-anchor="end" class="fill-zinc-400 dark:fill-zinc-500" font-size="9">{Math.round(max * p)}</text>
        {/each}

        {#each groups as g, gi}
            {@const gx = padL + gi * groupWidth}
            {#each series as s, si}
                {@const v = s.values[gi] || 0}
                {@const h = (v / max) * innerH}
                {@const x = gx + barGap + si * (barWidth + barGap)}
                {@const y = padT + innerH - h}
                <rect {x} {y} width={barWidth} height={h} rx="2" fill={s.color}>
                    <title>{s.name}: {v}</title>
                </rect>
            {/each}
            <text x={gx + groupWidth / 2} y={height - 6} text-anchor="middle" class="fill-zinc-500 dark:fill-zinc-400" font-size="10">{g}</text>
        {/each}
    </svg>

    <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] mt-1 px-1">
        {#each series as s}
            <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-sm" style="background: {s.color}"></span>
                <span class="text-zinc-600 dark:text-zinc-400">{s.name}</span>
            </div>
        {/each}
    </div>
</div>
