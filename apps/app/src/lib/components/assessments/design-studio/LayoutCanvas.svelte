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
  const MM_TO_PX = 3.7795;

  let canvasRef = $state<HTMLDivElement | null>(null);
  let canvasWidth = $derived(A4_WIDTH_MM * MM_TO_PX);
  let canvasHeight = $derived(A4_HEIGHT_MM * MM_TO_PX);

  let activePage = $derived(
    layout.pages?.find((p: any) => p.id === activePageId) || layout.pages?.[0],
  );
</script>

<div
  bind:this={canvasRef}
  class="layout-canvas bg-white shadow-2xl transition-transform relative select-none shrink-0"
  style="
    width: {canvasWidth}px; 
    height: {canvasHeight}px; 
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
        <!-- V11: Strict Normalized Overlay Renderer -->
        <div
          class="absolute overflow-visible {highContrast
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
            {el.style && el.type === 'text'
            ? `font-size: ${el.style.fontSize * canvasHeight * 0.75}px; 
               text-align: ${el.style.textAlign}; 
               font-weight: ${el.style.fontWeight}; 
               color: ${el.style.color}; 
               line-height: 1.1; 
               white-space: nowrap;`
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
              class="outline-none focus:ring-1 focus:ring-indigo-500 rounded px-0.5 block w-full h-full"
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
                min-width: 1px;
                min-height: 1px;
              "
            ></div>
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
