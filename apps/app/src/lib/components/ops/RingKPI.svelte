<script lang="ts">
    let {
        rings = [],
        size = 220,
        centerLabel = '',
        centerValue = '',
        centerSuffix = '%'
    }: {
        rings?: Array<{ label: string; value: number; color: string; target?: number }>;
        size?: number;
        centerLabel?: string;
        centerValue?: string | number;
        centerSuffix?: string;
    } = $props();

    const strokeW = 14;
    const gap = 6;
    const cx = $derived(size / 2);
    const cy = $derived(size / 2);

    function circ(r: number) {
        return 2 * Math.PI * r;
    }

    function pct(v: number, target = 100) {
        const p = target > 0 ? (v / target) * 100 : 0;
        return Math.max(0, Math.min(100, p));
    }
</script>

<div class="relative" style="width: {size}px; height: {size}px;">
    <svg viewBox="0 0 {size} {size}" class="-rotate-90">
        {#each rings as ring, i}
            {@const r = (size / 2) - strokeW / 2 - i * (strokeW + gap)}
            {@const c = circ(r)}
            {@const p = pct(ring.value, ring.target ?? 100)}
            <circle
                {cx}
                {cy}
                r={r}
                stroke="currentColor"
                class="text-zinc-100 dark:text-zinc-800"
                stroke-width={strokeW}
                fill="none"
            />
            <circle
                {cx}
                {cy}
                r={r}
                stroke={ring.color}
                stroke-width={strokeW}
                fill="none"
                stroke-linecap="round"
                stroke-dasharray={c}
                stroke-dashoffset={c - (c * p) / 100}
                style="transition: stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1);"
            />
        {/each}
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div class="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            {centerLabel}
        </div>
        <div class="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums leading-none mt-1">
            {centerValue}<span class="text-xl md:text-2xl text-zinc-400 dark:text-zinc-500 ml-0.5">{centerSuffix}</span>
        </div>
    </div>
</div>
