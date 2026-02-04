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

  // V22: Use explicit regions if available, fallback to elements
  let regions = $derived(
    layout.regions ||
      (activePage?.elements || []).filter(
        (el: any) => el.type === "field" || el.type === "text",
      ),
  );

  let lineElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "line"),
  );
  let slotElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "image-slot"),
  );

  // V25: Unified list of interactive nodes (Manual elements + OCR regions)
  let interactiveNodes = $derived([
    ...(activePage?.elements || []).filter((el: any) => el.type !== "line" && el.type !== "image-slot"),
    ...(layout.regions || [])
  ]);

  let selectedElementId = $state<string | null>(null);

  function handleSelect(id: string, e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onElementSelect?.(id);
    selectedElementId = id;
  }

  function getFontSize(el: any) {
    const hPx = (el.height || el.h) * canvasHeight;
    if (el.is_header || el.type === "label") {
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
    background: {(backgroundImage || layout.backgroundImageUrl) &&
  showBackground
    ? `url(${backgroundImage || layout.backgroundImageUrl})`
    : 'white'};
    background-size: 100% 100%;
    transform: scale({zoom});
    transform-origin: center top;
  "
>
  {#if (backgroundImage || layout.backgroundImageUrl) && showBackground && bgOpacity < 1}
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
              x1={(l.x1 || l.x) * canvasWidth}
              y1={(l.y1 || l.y) * canvasHeight}
              x2={(l.x2 || l.x + l.w) * canvasWidth}
              y2={(l.y2 || l.y + l.h) * canvasHeight}
              stroke="rgba(255,0,0,0.3)"
              stroke-width="1"
            />
          {/each}
        </svg>
      {/if}
      {#each regions as el}
        <div
          class="absolute border {el.is_header || el.type === 'label'
            ? 'border-red-500/50 bg-red-500/5'
            : 'border-blue-500/50 bg-blue-500/5'}"
          style="
            left: {el.x * canvasWidth}px; 
            top: {el.y * canvasHeight}px; 
            width: {(el.width || el.w) * canvasWidth}px; 
            height: {(el.height || el.h) * canvasHeight}px;
          "
        >
          <span
            class="absolute top-0 right-0 text-[6px] font-bold bg-black/50 text-white px-0.5"
          >
            {el.is_header || el.type === "label" ? "LBL" : "REG"}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if activePage || layout.regions}
    <!-- V25: High-Fidelity Unified Overlays (Regions + Elements) -->
    {#each interactiveNodes as el (el.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute group transition-all {selectedElementId === el.id ? 'z-50 ring-2 ring-indigo-500 shadow-xl' : 'z-20'}"
        onpointerdown={(e) => handleSelect(el.id, e)}
        style="
          left: {el.x * canvasWidth}px; 
          top: {el.y * canvasHeight}px; 
          width: {(el.width || el.w) * canvasWidth}px; 
          height: {(el.height || el.h) * canvasHeight}px;
          cursor: move;
        "
      >
        {#if (el.height || el.h) > 0.05}
          <textarea
            bind:value={el.value}
            oninput={(e) =>
              onElementChange?.(el.id, (e.target as HTMLTextAreaElement).value)}
            onpointerdown={(e) => handleSelect(el.id, e)}
            class="w-full h-full bg-transparent border-none outline-none resize-none px-1 py-0.5 block leading-tight overflow-hidden selection:bg-indigo-500/30 transition-all hover:bg-black/[0.02] {selectedElementId === el.id ? 'bg-white/90' : 'bg-transparent'}"
            style="
              font-size: {getFontSize(el)}px;
              text-align: {el.is_header || el.type === 'label'
              ? 'center'
              : 'left'};
              font-weight: {el.is_header || el.type === 'label'
              ? '700'
              : '400'};
              color: #000;
              font-family: {el.is_header || el.type === 'label'
              ? \"'Inter', sans-serif\"
              : 'monospace'};
              white-space: pre-wrap;
              pointer-events: auto;
            "
          ></textarea>
        {:else}
          <input
            type="text"
            bind:value={el.value}
            oninput={(e) =>
              onElementChange?.(el.id, (e.target as HTMLInputElement).value)}
            onpointerdown={(e) => handleSelect(el.id, e)}
            class="w-full h-full bg-transparent border-none outline-none px-1 py-0.5 block leading-tight selection:bg-indigo-500/30 transition-all hover:bg-black/[0.02] {selectedElementId === el.id ? 'bg-white/90' : 'bg-transparent'}"
            style="
              font-size: {getFontSize(el)}px;
              text-align: {el.is_header || el.type === 'label'
              ? 'center'
              : 'left'};
              font-weight: {el.is_header || el.type === 'label'
              ? '700'
              : '400'};
              color: #000;
              font-family: {el.is_header || el.type === 'label'
              ? \"'Inter', sans-serif\"
              : 'monospace'};
              pointer-events: auto;
            "
          />
        {/if}
        <!-- Field Indicator for designers -->
        <div
          class="absolute inset-0 border border-dashed {selectedElementId === el.id ? 'border-indigo-500' : 'border-indigo-500/0 group-hover:border-indigo-500/40'} pointer-events-none"
        ></div>
      </div>
    {/each}

    <!-- Image Slots Layer -->
    {#each slotElements as el (el.id)}
      <div
        class="absolute z-30 pointer-events-none"
        style="
          left: {el.x * canvasWidth}px; 
          top: {el.y * canvasHeight}px; 
          width: {el.width * canvasWidth}px; 
          height: {el.height * canvasHeight}px;
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
