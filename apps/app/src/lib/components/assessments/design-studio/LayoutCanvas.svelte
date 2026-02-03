<script lang="ts">
  import type { LayoutSchema } from "$lib/server/services/layout-reconstructor";

  let {
    layout = $bindable(),
    zoom = 1,
    showMargins = false,
    activePageId = "",
    mode = "view", // 'view' | 'edit' | 'preview'
    elementComponent: ElementComponent = null, // Component to use for elements (ElementWrapper)
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
  const MM_TO_PX = 3.7795; // 96 DPI / 25.4 mm/inch

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
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    transform: scale({zoom});
    transform-origin: center top;
    font-family: 'Outfit', sans-serif;
  "
>
  {#if backgroundImage && showBackground}
    <div
      class="absolute inset-0 bg-white pointer-events-none z-0 transition-opacity"
      style="opacity: {1 - bgOpacity};"
    ></div>
  {/if}
  <!-- Margins -->
  {#if showMargins && layout.page?.margins}
    <div
      class="absolute border border-dashed border-indigo-500/20 pointer-events-none z-50 text-[8px] font-black text-indigo-500/40"
      style="
        inset: {layout.page.margins.top}mm {layout.page.margins.right}mm {layout
        .page.margins.bottom}mm {layout.page.margins.left}mm;
      "
    >
      <span class="absolute -top-4 left-0 uppercase tracking-widest"
        >Margin ({layout.page.margins.left}mm)</span
      >
    </div>
  {/if}

  <!-- Element Loop -->
  {#if activePage}
    {#each activePage.elements as el (el.id)}
      {#if ElementComponent}
        <!-- Use the provided wrapper component for interactive modes -->
        <ElementComponent
          element={el}
          {zoom}
          onSelect={() => onElementSelect?.(el.id)}
          bind:selectedCell
          bind:activeCellId
        />
      {:else}
        <!-- Simple static rendering for preview/view -->
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
                left: {(el.x !== undefined ? el.x : el.x1 || 0) * 100}%; 
                top: {(el.y !== undefined ? el.y : el.y1 || 0) * 100}%; 
                width: {(el.width ||
            (el.x2 !== undefined ? Math.abs(el.x2 - el.x1) : 0)) * 100}%; 
                height: {(el.height ||
            (el.y2 !== undefined ? Math.abs(el.y2 - el.y1) : 0)) * 100}%;
                {el.style
            ? Object.entries(el.style)
                .map(
                  ([k, v]) =>
                    `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${typeof v === 'number' && k.toLowerCase().includes('fontsize') ? v + 'px' : v}`,
                )
                .join('; ')
            : ''}
                {el.styles
            ? Object.entries(el.styles)
                .map(
                  ([k, v]) =>
                    `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${v}`,
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
              class="outline-none focus:ring-1 focus:ring-indigo-500 rounded px-0.5"
            >
              {@html el.text || el.content}
            </span>
          {:else if el.type === "rect"}
            <div
              style="
                width: 100%;
                height: 100%;
                border: {el.strokeWidth || 1}px solid {el.borderColor ||
                '#000'};
                background-color: {el.backgroundColor || 'transparent'};
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
          {:else if el.type === "table"}
            <!-- existing table logic -->
            <table
              class="w-full h-full border-collapse border border-slate-300"
            >
              <tbody>
                {#each el.tableData.rows as row}
                  <tr>
                    {#each row.cells as cell}
                      <td
                        class="border border-slate-300 p-1"
                        style={cell.styles
                          ? Object.entries(cell.styles)
                              .map(
                                ([k, v]) =>
                                  `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${v}`,
                              )
                              .join("; ")
                          : ""}
                      >
                        {@html cell.content}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else if el.type === "line"}
            <div
              style="
                    background-color: {highContrast
                ? '#4f46e5'
                : el.color || '#000'}; 
                    width: {el.orientation === 'horizontal'
                ? '100%'
                : (el.strokeWidth || el.thickness || 1) + 'px'};
                    height: {el.orientation === 'vertical'
                ? '100%'
                : (el.strokeWidth || el.thickness || 1) + 'px'};
                  "
            ></div>
          {:else if el.type === "image"}
            <img
              src={el.src}
              alt={el.alt || ""}
              class="w-full h-full object-contain"
            />
          {:else if el.type === "shape"}
            <div
              style="background-color: {el.backgroundColor ||
                'transparent'}; border: {el.borderWidth ||
                0}px solid {el.borderColor ||
                '#000'}; border-radius: {el.shapeType === 'circle'
                ? '50%'
                : el.styles?.borderRadius ||
                  '0px'}; width: 100%; height: 100%; {el.styles?.borderDash
                ? `border-style: dashed;`
                : ''}"
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
    background-size: 5mm 5mm;
  }
</style>
