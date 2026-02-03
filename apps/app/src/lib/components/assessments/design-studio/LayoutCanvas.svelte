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
    showLines = false, // V16: Default to false (image has lines)
    showText = true,
    showBackground = true,
    bgOpacity = 1.0, // V16: Default to 1.0 (Full image)
    highContrast = false,
    showRegions = false,
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

  // V16: Fields are the primary interactable elements
  let fields = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "field"),
  );
  let lineElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "line"),
  );
  let slotElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "image-slot"),
  );

  function getFontSize(el: any) {
    const hPx = el.height * canvasHeight;
    if (el.is_header) {
      return Math.min(26, Math.max(10, hPx * 0.1));
    }
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
  {#if backgroundImage && showBackground && bgOpacity < 1}
    <div
      class="absolute inset-0 bg-white pointer-events-none z-0 transition-opacity"
      style="opacity: {1 - bgOpacity};"
    ></div>
  {/if}

  <!-- V16 Debug Overlay: Show detected regions/lines -->
  {#if showRegions}
    <div class="absolute inset-0 pointer-events-none z-[60]">
      {#if showLines}
        <svg class="absolute inset-0 w-full h-full">
          {#each lineElements as l}
            <line
              x1={l.x1 * 100 + "%"}
              y1={l.y1 * 100 + "%"}
              x2={l.x2 * 100 + "%"}
              y2={l.y2 * 100 + "%"}
              stroke="rgba(255,0,0,0.3)"
              stroke-width="1"
            />
          {/each}
        </svg>
      {/if}
      {#each fields as el}
        <div
          class="absolute border {el.is_header
            ? 'border-red-500/50 bg-red-500/5'
            : 'border-blue-500/50 bg-blue-500/5'}"
          style="
            left: {el.x * 100}%; 
            top: {el.y * 100}%; 
            width: {el.width * 100}%; 
            height: {el.height * 100}%;
          "
        >
          <span
            class="absolute top-0 right-0 text-[6px] font-bold bg-black/50 text-white px-0.5"
          >
            {el.is_header ? "HDR" : "FLD"}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if activePage}
    <!-- V16: Fillable Text Fields Overlay Layer -->
    {#each fields as el (el.id)}
      <div
        class="absolute group transition-colors"
        style="
          left: {el.x * 100}%; 
          top: {el.y * 100}%; 
          width: {el.width * 100}%; 
          height: {el.height * 100}%;
          z-index: 20;
        "
      >
        <textarea
          bind:value={el.value}
          oninput={(e) =>
            onElementChange?.(el.id, (e.target as HTMLTextAreaElement).value)}
          class="w-full h-full bg-transparent border-none outline-none resize-none px-1 py-0.5 block leading-tight overflow-hidden selection:bg-indigo-500/30 transition-all hover:bg-black/[0.02] focus:bg-white/80 focus:shadow-sm"
          style="
            font-size: {getFontSize(el)}px;
            text-align: {el.is_header ? 'center' : 'left'};
            font-weight: {el.is_header ? '700' : '400'};
            color: #000;
            font-family: {el.is_header ? "'Inter', sans-serif" : 'monospace'};
            white-space: pre-wrap;
          "
        ></textarea>
        <!-- Field Indicator for designers -->
        <div
          class="absolute inset-0 border border-dashed border-indigo-500/0 group-hover:border-indigo-500/20 pointer-events-none"
        ></div>
      </div>
    {/each}

    <!-- Image Slots Layer -->
    {#each slotElements as el (el.id)}
      <div
        class="absolute z-30 pointer-events-none"
        style="
          left: {el.x * 100}%; 
          top: {el.y * 100}%; 
          width: {el.width * 100}%; 
          height: {el.height * 100}%;
        "
      >
        <div
          class="w-full h-full bg-indigo-500/5 border border-dashed border-indigo-500/20 flex flex-col items-center justify-center text-indigo-500/20 p-2 text-center"
        >
          <div class="text-[8px] font-black uppercase tracking-tighter">
            {el.slotName || "slot"}
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
  textarea::-webkit-scrollbar {
    display: none;
  }
</style>
