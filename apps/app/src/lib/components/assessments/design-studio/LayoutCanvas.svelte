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
  } = $props();

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795; // 96 DPI / 25.4 mm/inch

  let activePage = $derived(
    layout.pages?.find((p: any) => p.id === activePageId) || layout.pages?.[0],
  );
</script>

<div
  class="layout-canvas bg-white shadow-2xl origin-top transition-transform relative select-none"
  style="
    width: {A4_WIDTH_MM * MM_TO_PX}px; 
    height: {A4_HEIGHT_MM * MM_TO_PX}px; 
    transform: scale({zoom});
    font-family: 'Outfit', sans-serif;
  "
>
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
          class="absolute overflow-hidden"
          style="
                left: {el.x}mm; 
                top: {el.y}mm; 
                width: {el.w}mm; 
                height: {el.h}mm;
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
            {@html el.content}
          {:else if el.type === "table"}
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
                    background-color: {el.color}; 
                    width: {el.orientation === 'horizontal'
                ? '100%'
                : el.thickness + 'px'};
                    height: {el.orientation === 'vertical'
                ? '100%'
                : el.thickness + 'px'};
                  "
            ></div>
          {:else if el.type === "shape"}
            <div
              style="
                    background-color: {el.backgroundColor};
                    border: {el.borderWidth}px solid {el.borderColor};
                    width: 100%;
                    height: 100%;
                    border-radius: {el.shapeType === 'circle' ? '50%' : '0'};
                  "
            ></div>
          {:else if el.type === "image"}
            <img
              src={el.src}
              alt={el.alt}
              class="w-full h-full object-contain"
            />
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
