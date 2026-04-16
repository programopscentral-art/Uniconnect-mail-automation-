<script lang="ts">
    let {
        points = [],
        width = 120,
        height = 36,
        color = '#6366f1',
        fill = true
    }: {
        points?: number[];
        width?: number;
        height?: number;
        color?: string;
        fill?: boolean;
    } = $props();

    const path = $derived.by(() => {
        if (!points.length) return { line: '', area: '' };
        const max = Math.max(...points, 1);
        const min = Math.min(...points, 0);
        const range = max - min || 1;
        const step = points.length > 1 ? width / (points.length - 1) : width;
        const ys = points.map((p) => height - ((p - min) / range) * (height - 4) - 2);
        const coords = points.map((_, i) => `${i * step},${ys[i]}`);
        const line = 'M ' + coords.join(' L ');
        const area = line + ` L ${width},${height} L 0,${height} Z`;
        return { line, area };
    });
</script>

<svg {width} {height} viewBox="0 0 {width} {height}" class="overflow-visible">
    {#if fill}
        <path d={path.area} fill={color} fill-opacity="0.12" stroke="none" />
    {/if}
    <path d={path.line} fill="none" stroke={color} stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
</svg>
