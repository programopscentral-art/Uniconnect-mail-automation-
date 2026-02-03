<script lang="ts">
  let {
    layout = $bindable(),
    zoom = 1,
    showMargins = false,
    activePageId = "",
    mode = "view", // 'view' | 'edit' | 'preview'
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

  let activePage = $derived(
    layout.pages?.find((p: any) => p.id === activePageId) || layout.pages?.[0],
  );
</script>

<div
  class="layout-canvas bg-white shadow-2xl transition-transform relative select-none shrink-0"
  style="
    width: {A4_WIDTH_MM * MM_TO_PX}px; 
    height: {A4_HEIGHT_MM * MM_TO_PX}px; 
    background: {backgroundImage && showBackground
    ? `url(${backgroundImage})`
    : 'white'};
    background-size: 100% 100%;
    background-position: center;
    background-repeat: no-repeat;
    transform: scale({zoom});
    transform-origin: center top;
    font-family: 'Inter', sans-serif;
  "
>
  {#if backgroundImage && showBackground}
    <div
      class="absolute inset-0 bg-white pointer-events-none z-0 transition-opacity"
      style="opacity: {1 - bgOpacity};"
    ></div>
  {/if}

  {#if activePage}
    {#each activePage.elements as el (el.id)}
      {#if ElementComponent}
        <ElementComponent
          element={el}
          {zoom}
          onSelect={() => onElementSelect?.(el.id)}
          bind:selectedCell
          bind:activeCellId
        />
      {:else}
        <!-- V10: Unified Normalized Rendering -->
        <div
          class="absolute overflow-visible min-h-fit {highContrast
            ? 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
            : ''}"
          style="
            display: {el.type === 'text'
            ? showText
              ? 'block'
              : 'none'
            : showLines
              ? 'block'
              : 'none'};
            left: {el.x * 100}%; 
            top: {el.y * 100}%; 
            width: {el.width * 100}%; 
            height: {el.height * 100}%;
            {el.style
            ? Object.entries(el.style)
                .map(
                  ([k, v]) =>
                    `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${typeof v === 'number' && k.toLowerCase().includes('fontsize') ? v + 'px' : v}`,
                )
                .join('; ')
            : ''}
          "
        >
          {#if el.type === "text"}
            <span
              contenteditable="true"
              onblur={(e) =>
                onElementChange?.(
                  el.id,
                  (e.target as HTMLSpanElement).innerText,
                )}
              style={highContrast
                ? "color: #4f46e5; font-weight: 900;"
                : el.style?.color
                  ? `color: ${el.style.color};`
                  : ""}
              class="outline-none focus:ring-1 focus:ring-indigo-500 rounded px-0.5 whitespace-pre-wrap block w-full h-full"
            >
              {@html el.text || el.content}
            </span>
          {:else if el.type === "line"}
            <div
              style="
                background-color: {highContrast
                ? '#4f46e5'
                : el.color || '#000'}; 
                width: 100%;
                height: 100%;
                min-width: {el.orientation === 'vertical' ? '1px' : '0'};
                min-height: {el.orientation === 'horizontal' ? '1px' : '0'};
              "
            ></div>
          {:else if el.type === "image-slot"}
            <div
              class="w-full h-full bg-indigo-500/10 border-2 border-dashed border-indigo-500/30 flex flex-col items-center justify-center text-indigo-500/40 p-2 text-center"
            >
              <div class="text-[8px] font-black uppercase tracking-tighter">
                {el.slotName || "image-slot"}
              </div>
            </div>
          {/if}
        </div>
      {/if}
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
