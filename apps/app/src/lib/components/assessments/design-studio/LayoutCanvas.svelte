<script lang="ts">
  let {
    layout = $bindable(),
    zoom = 1,
    showMargins = false,
    activePageId = "",
    mode = "view",
    elementComponent: ElementComponent = null,
    onElementSelect = null,
    selectedCell = $bindable(null),
    activeCellId = $bindable(null),
    backgroundImage = null,
    showLines = true,
    showText = true,
    showBackground = true,
    bgOpacity = 0.7,
    highContrast = false,
    onElementChange = null,
  } = $props();

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795; // 96 DPI

  let canvasWidth = $derived(A4_WIDTH_MM * MM_TO_PX);
  let canvasHeight = $derived(A4_HEIGHT_MM * MM_TO_PX);

  let activePage = $derived(
    layout.pages?.find((p: any) => p.id === activePageId) || layout.pages?.[0],
  );

  let textElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "text"),
  );
  let lineElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "line"),
  );
  let slotElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "image-slot"),
  );

  function getFontSize(el: any) {
    // V14: Precision Region Scaling 0.55 and clamping Max 22px
    const hPx = el.height * canvasHeight;
    return Math.min(22, Math.max(8, hPx * 0.55));
  }
</script>

<div
  class="layout-canvas bg-white shadow-2xl transition-transform relative select-none shrink-0"
  style="
    width: {canvasWidth}px; 
    height: {canvasHeight}px; 
    background: {backgroundImage && showBackground
    ? `url(${backgroundImage})`
    : 'white'};
    background-size: 100% 100%;
    transform: scale({zoom});
    transform-origin: center top;
  "
>
  {#if backgroundImage && showBackground}
    <div
      class="absolute inset-0 bg-white pointer-events-none z-0 transition-opacity"
      style="opacity: {1 - bgOpacity};"
    ></div>
  {/if}

  <!-- V13: High-Fidelity SVG Overlay Layer for Lines/Tables -->
  {#if showLines}
    <svg
      class="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
    >
      {#each lineElements as l (l.id)}
        <line
          x1={l.x1 * 100 + "%"}
          y1={l.y1 * 100 + "%"}
          x2={l.x2 * 100 + "%"}
          y2={l.y2 * 100 + "%"}
          stroke={highContrast ? "#4f46e5" : l.color || "#000"}
          stroke-width={Math.max(1, (l.thickness || 0.001) * canvasHeight)}
          stroke-linecap="round"
        />
      {/each}
    </svg>
  {/if}

  {#if activePage}
    <!-- Text Elements Layer -->
    {#each textElements as el (el.id)}
      <div
        class="absolute overflow-hidden {highContrast
          ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
          : ''}"
        style="
          display: {showText ? 'block' : 'none'};
          left: {el.x * 100}%; 
          top: {el.y * 100}%; 
          width: {el.width * 100}%; 
          height: {el.height * 100}%;
          max-width: {el.width * 100}%;
          max-height: {el.height * 100}%;
          font-size: {getFontSize(el)}px;
          text-align: {el.style?.textAlign || 'left'};
          font-weight: {el.style?.fontWeight || '400'};
          color: {highContrast ? '#4f46e5' : el.style?.color || '#000'};
          font-family: {el.style?.fontFamily || "'Inter', sans-serif"};
          line-height: 1.05;
          white-space: pre-wrap;
          overflow: hidden;
          text-overflow: clip;
          z-index: 20;
        "
      >
        <span
          contenteditable="true"
          onblur={(e) =>
            onElementChange?.(el.id, (e.target as HTMLSpanElement).innerText)}
          class="outline-none focus:ring-1 focus:ring-indigo-500 rounded px-0.5 block w-full h-full"
        >
          {@html el.text || el.content}
        </span>
      </div>
    {/each}

    <!-- Image Slots Layer -->
    {#each slotElements as el (el.id)}
      <div
        class="absolute z-30"
        style="
          left: {el.x * 100}%; 
          top: {el.y * 100}%; 
          width: {el.width * 100}%; 
          height: {el.height * 100}%;
        "
      >
        <div
          class="w-full h-full bg-indigo-500/10 border-2 border-dashed border-indigo-500/30 flex flex-col items-center justify-center text-indigo-500/40 p-2 text-center"
        >
          <div class="text-[8px] font-black uppercase tracking-tighter">
            {el.slotName || "image-slot"}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .layout-canvas {
    background-image: linear-gradient(to right, #f1f5f9 1px, transparent 1px),
      linear-gradient(to bottom, #f1f5f9 1px, transparent 1px);
    background-size: 10mm 10mm;
  }
</style>
