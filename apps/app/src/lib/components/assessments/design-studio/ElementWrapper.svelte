<script lang="ts">
  import { onMount } from "svelte";
  import RichTextEditor from "./RichTextEditor.svelte";
  import TableEditor from "./TableEditor.svelte";

  let {
    element = $bindable(),
    selected = false,
    onSelect,
    zoom = 1,
    mmToPx = 3.7795,
    activeCellId = $bindable(),
  } = $props();

  let isDragging = $state(false);
  let isResizing = $state(false);
  let isEditing = $state(false);
  let startX = $state(0);
  let startY = $state(0);
  let startW = $state(0);
  let startH = $state(0);
  let startMouseX = $state(0);
  let startMouseY = $state(0);
  let activeHandle = $state<string | null>(null);
  let editorRef = $state<any>(null);

  // Focus the editor when entering edit mode
  $effect(() => {
    if (isEditing && editorRef?.focus) {
      editorRef.focus();
    }
  });

  // Reset editing mode when deselected
  $effect(() => {
    if (!selected) {
      isEditing = false;
    }
  });

  // Public method to proxy formatting to the editor
  export function format(cmd: string, val: string | null = null) {
    if (editorRef) editorRef.exec(cmd, val);
  }

  function handlePointerDown(
    e: PointerEvent,
    type: "move" | "resize",
    handle?: string,
  ) {
    if (isEditing) return; // Prevent drag/resize while typing

    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startX = element.x;
    startY = element.y;
    startW = element.w;
    startH = element.h;

    if (type === "move") {
      isDragging = true;
    } else {
      isResizing = true;
      activeHandle = handle || null;
    }

    onSelect();
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging && !isResizing) return;

    const dx = (e.clientX - startMouseX) / (zoom * mmToPx);
    const dy = (e.clientY - startMouseY) / (zoom * mmToPx);

    if (isDragging) {
      element.x = Math.round((startX + dx) * 10) / 10;
      element.y = Math.round((startY + dy) * 10) / 10;
    } else if (isResizing) {
      if (activeHandle?.includes("right"))
        element.w = Math.max(10, Math.round((startW + dx) * 10) / 10);
      if (activeHandle?.includes("bottom"))
        element.h = Math.max(5, Math.round((startH + dy) * 10) / 10);
      if (activeHandle?.includes("left")) {
        const newW = Math.max(10, startW - dx);
        const shiftX = startW - newW;
        element.x = Math.round((startX + shiftX) * 10) / 10;
        element.w = Math.round(newW * 10) / 10;
      }
      if (activeHandle?.includes("top")) {
        const newH = Math.max(5, startH - dy);
        const shiftY = startH - newH;
        element.y = Math.round((startY + shiftY) * 10) / 10;
        element.h = Math.round(newH * 10) / 10;
      }
    }
  }

  function handlePointerUp(e: PointerEvent) {
    isDragging = false;
    isResizing = false;
    activeHandle = null;
  }

  function handleDoubleClick(e: MouseEvent) {
    if (element.type === "text" || element.type === "table") {
      isEditing = true;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="absolute group select-none"
  class:cursor-move={!isEditing}
  class:ring-2={selected}
  class:ring-indigo-500={selected}
  class:z-50={selected}
  style="
    left: {element.x}mm; 
    top: {element.y}mm; 
    width: {element.w}mm; 
    height: {element.h}mm;
  "
  onpointerdown={(e) => handlePointerDown(e, "move")}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  ondblclick={handleDoubleClick}
>
  <!-- Content Slot -->
  <div
    class="w-full h-full overflow-hidden {selected || isEditing
      ? 'pointer-events-auto'
      : 'pointer-events-none'}"
  >
    {@render children()}
  </div>

  <!-- Resize Handles -->
  {#if selected && !isEditing}
    <div
      class="absolute -inset-0.5 border border-indigo-500 pointer-events-none"
    ></div>

    <!-- Corners -->
    <div
      class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize shadow-md"
      onpointerdown={(e) => handlePointerDown(e, "resize", "top-left")}
    ></div>
    <div
      class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full cursor-nesw-resize shadow-md"
      onpointerdown={(e) => handlePointerDown(e, "resize", "top-right")}
    ></div>
    <div
      class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full cursor-nesw-resize shadow-md"
      onpointerdown={(e) => handlePointerDown(e, "resize", "bottom-left")}
    ></div>
    <div
      class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full cursor-nwse-resize shadow-md"
      onpointerdown={(e) => handlePointerDown(e, "resize", "bottom-right")}
    ></div>

    <!-- Edges -->
    <div
      class="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-4 bg-white border border-indigo-500 rounded-full cursor-ew-resize shadow-sm"
      onpointerdown={(e) => handlePointerDown(e, "resize", "left")}
    ></div>
    <div
      class="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-4 bg-white border border-indigo-500 rounded-full cursor-ew-resize shadow-sm"
      onpointerdown={(e) => handlePointerDown(e, "resize", "right")}
    ></div>
    <div
      class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-indigo-500 rounded-full cursor-ns-resize shadow-sm"
      onpointerdown={(e) => handlePointerDown(e, "resize", "top")}
    ></div>
    <div
      class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border border-indigo-500 rounded-full cursor-ns-resize shadow-sm"
      onpointerdown={(e) => handlePointerDown(e, "resize", "bottom")}
    ></div>
  {/if}
</div>

{#snippet children()}
  <!-- This is where the actual element content (Text/Image/Table) will be rendered -->
  <div
    class="w-full h-full flex items-center justify-center overflow-hidden"
    style="
    font-family: {element.styles?.fontFamily || 'inherit'};
    font-size: {element.styles?.fontSize || 14}px;
    color: {element.styles?.color || 'inherit'};
    line-height: {element.styles?.lineHeight || 1.2};
    letter-spacing: {element.styles?.letterSpacing || 0}px;
    font-weight: {element.styles?.fontWeight || 'normal'};
    font-style: {element.styles?.fontStyle || 'normal'};
    text-decoration: {element.styles?.textDecoration || 'none'};
    text-align: {element.styles?.textAlign || 'left'};
  "
  >
    {#if element.type === "text"}
      <RichTextEditor
        bind:this={editorRef}
        bind:value={element.content}
        active={isEditing}
        onUpdate={() => {}}
      />
    {:else if element.type === "table"}
      <TableEditor bind:element selected={isEditing} bind:activeCellId />
    {:else if element.type === "image"}
      <img
        src={element.src || "https://via.placeholder.com/150?text=Upload+Image"}
        alt="Canvas element"
        class="max-w-full max-h-full object-contain pointer-events-none"
      />
    {:else if element.type === "shape"}
      <div
        class="w-full h-full border-2 border-black pointer-events-none"
      ></div>
    {/if}
  </div>
{/snippet}
