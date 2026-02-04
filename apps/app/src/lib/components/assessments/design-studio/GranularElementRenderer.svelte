<script lang="ts">
  /**
   * V49: Granular Element Renderer
   * Renders individual editable overlay elements on top of background image
   * Each element is selectable, draggable, and resizable
   */

  let {
    elements = [],
    backgroundImage = "",
    pageWidth = 210,
    pageHeight = 297,
    zoom = 1,
    showRegions = false,
    onElementSelect = (id: string) => {},
    onElementUpdate = (id: string, updates: any) => {},
  } = $props();

  let selectedElementId = $state<string | null>(null);
  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });

  function handleElementClick(elementId: string, event: MouseEvent) {
    event.stopPropagation();
    selectedElementId = elementId;
    onElementSelect(elementId);
  }

  function handleMouseDown(elementId: string, event: MouseEvent) {
    isDragging = true;
    dragStart = { x: event.clientX, y: event.clientY };
    selectedElementId = elementId;
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDragging || !selectedElementId) return;

    const element = elements.find((el: any) => el.id === selectedElementId);
    if (!element) return;

    const deltaX = (event.clientX - dragStart.x) / zoom / pageWidth;
    const deltaY = (event.clientY - dragStart.y) / zoom / pageHeight;

    onElementUpdate(selectedElementId, {
      x: element.x + deltaX,
      y: element.y + deltaY,
    });

    dragStart = { x: event.clientX, y: event.clientY };
  }

  function handleMouseUp() {
    isDragging = false;
  }
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<div
  class="element-renderer"
  style="position: relative; width: {pageWidth * zoom}px; height: {pageHeight *
    zoom}px;"
>
  <!-- Background Image Layer -->
  {#if backgroundImage}
    <img
      src={backgroundImage}
      alt="Template Background"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; user-select: none;"
    />
  {/if}

  <!-- Overlay Elements Layer -->
  {#each elements as element (element.id)}
    <div
      class="template-element"
      class:selected={selectedElementId === element.id}
      class:show-regions={showRegions}
      style="
        position: absolute;
        left: {element.x * pageWidth * zoom}px;
        top: {element.y * pageHeight * zoom}px;
        width: {element.w * pageWidth * zoom}px;
        height: {element.h * pageHeight * zoom}px;
        font-size: {element.style?.fontSize || 10}px;
        font-weight: {element.style?.fontWeight || 'normal'};
        text-align: {element.style?.align || 'left'};
        color: {element.style?.color || '#000000'};
        cursor: pointer;
        border: {showRegions ? '1px solid rgba(59, 130, 246, 0.5)' : 'none'};
        background: {showRegions ? 'rgba(59, 130, 246, 0.1)' : 'transparent'};
      "
      onclick={(e) => handleElementClick(element.id, e)}
      onmousedown={(e) => handleMouseDown(element.id, e)}
      role="button"
      tabindex="0"
    >
      <div
        class="element-content"
        style="padding: 2px; overflow: hidden; text-overflow: ellipsis;"
      >
        {element.text || element.value || ""}
      </div>

      {#if selectedElementId === element.id}
        <div class="element-handles">
          <div class="handle nw"></div>
          <div class="handle ne"></div>
          <div class="handle sw"></div>
          <div class="handle se"></div>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .element-renderer {
    background: #f5f5f5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .template-element {
    transition:
      border-color 0.2s,
      background-color 0.2s;
  }

  .template-element:hover {
    border: 1px solid rgba(59, 130, 246, 0.7) !important;
    background: rgba(59, 130, 246, 0.05) !important;
  }

  .template-element.selected {
    border: 2px solid #3b82f6 !important;
    background: rgba(59, 130, 246, 0.1) !important;
    z-index: 100;
  }

  .element-content {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .element-handles {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #3b82f6;
    border: 1px solid white;
    border-radius: 50%;
    pointer-events: all;
    cursor: pointer;
  }

  .handle.nw {
    top: -4px;
    left: -4px;
    cursor: nw-resize;
  }
  .handle.ne {
    top: -4px;
    right: -4px;
    cursor: ne-resize;
  }
  .handle.sw {
    bottom: -4px;
    left: -4px;
    cursor: sw-resize;
  }
  .handle.se {
    bottom: -4px;
    right: -4px;
    cursor: se-resize;
  }
</style>
