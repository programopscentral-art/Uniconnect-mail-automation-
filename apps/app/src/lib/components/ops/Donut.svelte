<script lang="ts">
    let {
        segments = [],
        size = 140,
        thickness = 18,
        centerValue = '',
        centerLabel = ''
    }: {
        segments?: Array<{ label: string; value: number; color: string }>;
        size?: number;
        thickness?: number;
        centerValue?: string | number;
        centerLabel?: string;
    } = $props();

    const cx = $derived(size / 2);
    const cy = $derived(size / 2);
    const r = $derived(size / 2 - thickness / 2);
    const c = $derived(2 * Math.PI * r);
    const total = $derived(segments.reduce((s, x) => s + Math.max(0, x.value), 0));

    function buildArcs(segs: typeof segments, tot: number) {
        let offset = 0;
        return segs.map((s) => {
            const frac = tot > 0 ? Math.max(0, s.value) / tot : 0;
            const len = c * frac;
            const arc = { ...s, len, offset: c * 0.25 - offset };
            offset += len;
            return arc;
        });
    }
    const arcs = $derived(buildArcs(segments, total));
</script>

<div class="flex items-center gap-4">
    <div class="relative shrink-0" style="width: {size}px; height: {size}px;">
        <svg viewBox="0 0 {size} {size}">
            <circle
                {cx}
                {cy}
                r={r}
                stroke="currentColor"
                class="text-zinc-100 dark:text-zinc-800"
                stroke-width={thickness}
                fill="none"
            />
            {#each arcs as a}
                <circle
                    {cx}
                    {cy}
                    r={r}
                    stroke={a.color}
                    stroke-width={thickness}
                    fill="none"
                    stroke-dasharray="{a.len} {c}"
                    stroke-dashoffset={a.offset}
                    style="transition: stroke-dasharray .6s ease;"
                />
            {/each}
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div class="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums leading-none">
                {centerValue || total}
            </div>
            {#if centerLabel}
                <div class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {centerLabel}
                </div>
            {/if}
        </div>
    </div>

    <ul class="flex flex-col gap-1.5 text-xs min-w-0 flex-1">
        {#each segments as s}
            <li class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background: {s.color}"></span>
                <span class="text-zinc-600 dark:text-zinc-400 truncate flex-1">{s.label}</span>
                <span class="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{s.value}</span>
            </li>
        {/each}
    </ul>
</div>
