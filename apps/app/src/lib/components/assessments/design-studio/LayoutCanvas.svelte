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
    selectedElementId = null,
    regions = $bindable([]),
  } = $props();

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795; // 96 DPI

  let canvasWidth = $derived(A4_WIDTH_MM * MM_TO_PX);
  let canvasHeight = $derived(A4_HEIGHT_MM * MM_TO_PX);

  let activePage = $derived(
    layout.pages?.find((p: any) => p.id === activePageId) || layout.pages?.[0],
  );

  // V22/V27: Data sources are now passed in via props

  let lineElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "line"),
  );
  let slotElements = $derived(
    (activePage?.elements || []).filter((el: any) => el.type === "image-slot"),
  );

  // V69: Only render regions that are NOT already present as manual elements to avoid double-rendering
  let filteredRegions = $derived(
    regions.filter(
      (r: any) => !activePage?.elements?.some((el: any) => el.id === r.id),
    ),
  );

  function handleSelect(id: string, e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onElementSelect?.(id);
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

  {#if activePage || regions.length > 0}
    <!-- V25: High-Fidelity Manual Draggable Elements -->
    {#if activePage}
      {#each activePage.elements || [] as _, i (activePage.elements[i].id)}
        {#if ElementComponent && activePage.elements[i].type !== "line" && activePage.elements[i].type !== "image-slot"}
          <ElementComponent
            bind:element={activePage.elements[i]}
            selected={selectedElementId === activePage.elements[i].id}
            onSelect={() => onElementSelect?.(activePage.elements[i].id)}
            {zoom}
            mmToPx={MM_TO_PX}
            bind:selectedCell
            bind:activeCellId
          />
        {/if}
      {/each}
    {/if}

    <!-- V25: High-Fidelity OCR Locked Overlays (Regions) -->
    <!-- V69: Only render regions that are NOT already present as manual elements to avoid double-rendering -->
    {#each filteredRegions as region (region.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute group transition-all {selectedElementId === region.id
          ? 'z-50 ring-2 ring-indigo-500 shadow-xl'
          : 'z-20'}"
        onpointerdown={(e) => handleSelect(region.id, e)}
        style="
          left: {region.x * canvasWidth}px; 
          top: {region.y * canvasHeight}px; 
          width: {(region.width || region.w) * canvasWidth}px; 
          height: {(region.height || region.h) * canvasHeight}px;
          cursor: move;
          pointer-events: auto;
        "
      >
        {#if (region.height || region.h) > 0.05}
          <textarea
            bind:value={region.value}
            oninput={(e) =>
              onElementChange?.(
                region.id,
                (e.target as HTMLTextAreaElement).value,
              )}
            onpointerdown={(e) => handleSelect(region.id, e)}
            class="w-full h-full bg-transparent border-none outline-none resize-none px-1 py-0.5 block leading-tight overflow-hidden selection:bg-indigo-500/30 transition-all hover:bg-black/[0.02] {selectedElementId ===
            region.id
              ? 'bg-white/90'
              : 'bg-transparent'}"
            style="
              font-size: {getFontSize(region)}px;
              text-align: {region.is_header || region.type === 'label'
              ? 'center'
              : 'left'};
              font-weight: {region.is_header || region.type === 'label'
              ? '700'
              : '400'};
              color: #000;
              font-family: {region.is_header || region.type === 'label'
              ? "'Inter', sans-serif"
              : 'monospace'};
              white-space: pre-wrap;
              pointer-events: auto;
            "
          ></textarea>
        {:else}
          <input
            type="text"
            bind:value={region.value}
            oninput={(e) =>
              onElementChange?.(
                region.id,
                (e.target as HTMLInputElement).value,
              )}
            onpointerdown={(e) => handleSelect(region.id, e)}
            class="w-full h-full bg-transparent border-none outline-none px-1 py-0.5 block leading-tight selection:bg-indigo-500/30 transition-all hover:bg-black/[0.02] {selectedElementId ===
            region.id
              ? 'bg-white/90'
              : 'bg-transparent'}"
            style="
              font-size: {getFontSize(region)}px;
              text-align: {region.is_header || region.type === 'label'
              ? 'center'
              : 'left'};
              font-weight: {region.is_header || region.type === 'label'
              ? '700'
              : '400'};
              color: #000;
              font-family: {region.is_header || region.type === 'label'
              ? "'Inter', sans-serif"
              : 'monospace'};
              pointer-events: auto;
            "
          />
        {/if}
        <!-- Field Indicator for designers -->
        <div
          class="absolute inset-0 border border-dashed {selectedElementId ===
          region.id
            ? 'border-indigo-500'
            : 'border-indigo-500/0 group-hover:border-indigo-500/40'} pointer-events-none"
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
          width: {(el.width || el.w || 0.1) * canvasWidth}px; 
          height: {(el.height || el.h || 0.1) * canvasHeight}px;
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
