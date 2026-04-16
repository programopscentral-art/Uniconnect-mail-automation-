<script lang="ts">
    let {
        series = [],
        labels = [],
        height = 180
    }: {
        series?: Array<{ name: string; points: number[]; color: string }>;
        labels?: string[];
        height?: number;
    } = $props();

    const width = 520;
    const padL = 32;
    const padR = 12;
    const padT = 12;
    const padB = 24;
    const innerW = width - padL - padR;
    const innerH = $derived(height - padT - padB);

    const allVals = $derived(series.flatMap((s) => s.points));
    const max = $derived(Math.max(1, ...allVals));
    const min = $derived(Math.min(0, ...allVals));
    const range = $derived(max - min || 1);

    function pointsToPath(pts: number[]) {
        if (!pts.length) return '';
        const step = pts.length > 1 ? innerW / (pts.length - 1) : innerW;
        return (
            'M ' +
            pts
                .map((v, i) => {
                    const x = padL + i * step;
                    const y = padT + innerH - ((v - min) / range) * innerH;
                    return `${x},${y}`;
                })
                .join(' L ')
        );
    }

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => padT + innerH * (1 - p));
</script>

<div class="w-full">
    <svg viewBox="0 0 {width} {height}" class="w-full h-auto" preserveAspectRatio="none">
        {#each gridLines as y}
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="currentColor" class="text-zinc-100 dark:text-zinc-800" stroke-width="1" />
        {/each}

        {#each [0, 0.5, 1] as p}
            {@const v = Math.round(min + range * p)}
            <text x={padL - 6} y={padT + innerH - innerH * p + 3} text-anchor="end" class="fill-zinc-400 dark:fill-zinc-500" font-size="10">{v}</text>
        {/each}

        {#each series as s}
            <path d={pointsToPath(s.points)} fill="none" stroke={s.color} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            {#each s.points as v, i}
                {@const step = s.points.length > 1 ? innerW / (s.points.length - 1) : innerW}
                {@const x = padL + i * step}
                {@const y = padT + innerH - ((v - min) / range) * innerH}
                <circle cx={x} cy={y} r="2.5" fill={s.color} />
            {/each}
        {/each}

        {#each labels as lbl, i}
            {@const step = labels.length > 1 ? innerW / (labels.length - 1) : innerW}
            {@const x = padL + i * step}
            <text {x} y={height - 6} text-anchor="middle" class="fill-zinc-400 dark:fill-zinc-500" font-size="10">{lbl}</text>
        {/each}
    </svg>

    {#if series.length > 1}
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mt-2 px-1">
            {#each series as s}
                <div class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full" style="background: {s.color}"></span>
                    <span class="text-zinc-600 dark:text-zinc-400">{s.name}</span>
                </div>
            {/each}
        </div>
    {/if}
</div>
