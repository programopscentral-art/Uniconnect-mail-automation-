<script lang="ts">
  import {
    Layout,
    Palette,
    Layers,
    Component,
    Maximize2,
    ZoomIn,
    ZoomOut,
    MousePointer2,
    Type,
    Table as TableIcon,
    Image as ImageIcon,
    Square,
    Save,
    Share2,
    RotateCcw,
    Plus,
    Grid,
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import ElementWrapper from "./ElementWrapper.svelte";

  let { template = $bindable(), universityId, onSave } = $props();

  // --- Types ---
  interface CanvasElement {
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    content: string;
    styles: any;
    src?: string;
  }

  // --- Design Studio State ---
  let activeTab = $state("elements"); // elements | layers | branding
  let zoomLevel = $state(0.75);
  let selectedElementId = $state<string | null>(null);
  let isSaving = $state(false);

  // --- Canvas Settings (A4 Prototype) ---
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795275591; // 1mm = 3.77px approx at 96dpi

  // --- Initialization Logic ---
  if (!template.layout_schema) template.layout_schema = {};
  if (!template.layout_schema.pages) {
    template.layout_schema.pages = [{ id: "p1", elements: [] }];
  }

  let layout = $state(template.layout_schema);
  let currentPage = $derived(layout.pages[0]);
  let selectedElement = $derived(
    currentPage.elements.find(
      (el: CanvasElement) => el.id === selectedElementId,
    ),
  );
  let elementRefs = $state<Record<string, any>>({});

  const TOOLBAR_ITEMS = [
    { id: "select", icon: MousePointer2, label: "Select" },
    { id: "text", icon: Type, label: "Text" },
    { id: "table", icon: TableIcon, label: "Table" },
    { id: "image", icon: ImageIcon, label: "Image" },
    { id: "shape", icon: Square, label: "Shape" },
  ];

  // --- Actions ---
  function addElement(type: string) {
    const id = `el-${Math.random().toString(36).substr(2, 9)}`;
    const newEl: CanvasElement = {
      id,
      type,
      x: 20,
      y: 20,
      w: type === "text" ? 100 : 50,
      h: type === "text" ? 12 : 50,
      content: type === "text" ? "New Text Element" : "",
      styles: {},
    };
    layout.pages[0].elements = [...layout.pages[0].elements, newEl];
    selectedElementId = id;
    template.layout_schema = layout;
  }

  function deleteElement(id: string) {
    layout.pages[0].elements = layout.pages[0].elements.filter(
      (el: CanvasElement) => el.id !== id,
    );
    if (selectedElementId === id) selectedElementId = null;
    template.layout_schema = layout;
  }

  function duplicateElement(id: string) {
    const original = layout.pages[0].elements.find(
      (el: CanvasElement) => el.id === id,
    );
    if (!original) return;

    const newId = `el-${Math.random().toString(36).substr(2, 9)}`;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = newId;
    copy.x += 10;
    copy.y += 10;

    layout.pages[0].elements = [...layout.pages[0].elements, copy];
    selectedElementId = newId;
    template.layout_schema = layout;
  }

  function triggerFormat(cmd: string, val: string | null = null) {
    if (selectedElementId && elementRefs[selectedElementId]) {
      elementRefs[selectedElementId].format(cmd, val);
    }
  }

  function handleZoom(delta: number) {
    zoomLevel = Math.min(Math.max(0.1, zoomLevel + delta), 3.0);
  }

  function autoFit() {
    if (typeof window === "undefined") return;
    const viewerWidth = window.innerWidth - 600;
    const paperPx = A4_WIDTH_MM * MM_TO_PX;
    zoomLevel = Math.min(1.2, Math.round((viewerWidth / paperPx) * 90) / 100);
  }

  onMount(() => {
    autoFit();
    window.addEventListener("resize", autoFit);
    return () => window.removeEventListener("resize", autoFit);
  });
</script>

<div
  class="h-screen w-full flex flex-col bg-[#1e1e1e] text-white overflow-hidden font-sans selection:bg-indigo-500/30"
>
  <!-- Top Header Bar -->
  <nav
    class="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#252525] shrink-0 z-50 shadow-xl"
  >
    <div class="flex items-center gap-4">
      <div
        class="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20"
      >
        <Layout class="w-5 h-5 text-white" />
      </div>
      <div>
        <h1
          class="text-[11px] font-black uppercase tracking-[0.2em] leading-none text-white/90"
        >
          Design Studio
        </h1>
        <p
          class="text-[9px] font-bold text-white/30 mt-1.5 uppercase tracking-widest truncate max-w-[200px]"
        >
          {template?.name || "Untitled"} • V{template?.version || 1}
        </p>
      </div>
    </div>

    <!-- Center Zoom Controls -->
    <div
      class="flex items-center bg-black/40 rounded-full px-4 py-1.5 gap-4 border border-white/10 shadow-inner"
    >
      <button
        onclick={() => handleZoom(-0.1)}
        class="p-1 hover:text-indigo-400 transition-colors"
        title="Zoom Out"
      >
        <ZoomOut class="w-4 h-4" />
      </button>
      <div class="flex items-center gap-1 min-w-[60px] justify-center">
        <span class="text-[11px] font-black text-indigo-400"
          >{Math.round(zoomLevel * 100)}%</span
        >
      </div>
      <button
        onclick={() => handleZoom(0.1)}
        class="p-1 hover:text-indigo-400 transition-colors"
        title="Zoom In"
      >
        <ZoomIn class="w-4 h-4" />
      </button>
      <div class="h-3 w-[1px] bg-white/10 mx-1"></div>
      <button
        onclick={autoFit}
        class="p-1 hover:text-indigo-400 transition-colors"
        title="Fit to Screen"
      >
        <Maximize2 class="w-4 h-4" />
      </button>
    </div>

    <!-- Right Actions -->
    <div class="flex items-center gap-3">
      <button
        onclick={onSave}
        disabled={isSaving}
        class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-[10px] font-black transition-all shadow-xl shadow-indigo-600/20 active:scale-95 leading-none"
      >
        {#if isSaving}
          <div
            class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
          ></div>
        {:else}
          <Save class="w-3.5 h-3.5" />
        {/if}
        {isSaving ? "SAVING..." : "SAVE TO CLOUD"}
      </button>
    </div>
  </nav>

  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar (Tool Rail) -->
    <aside
      class="w-[72px] border-r border-white/5 bg-[#252525] flex flex-col pt-4 items-center gap-2 shrink-0 z-40"
    >
      {#each TOOLBAR_ITEMS as item}
        <button
          class="w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all group hover:bg-white/5 active:scale-95"
          onclick={() =>
            item.id === "select"
              ? (activeTab = "elements")
              : addElement(item.id)}
          title={item.label}
        >
          <item.icon
            class="w-5 h-5 text-white/40 group-hover:text-white transition-colors"
          />
          <span
            class="text-[7px] font-black uppercase text-white/20 group-hover:text-white/40"
            >{item.label}</span
          >
        </button>
      {/each}
      <div class="mt-auto mb-6 flex flex-col gap-4">
        <button
          class="w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-white/5 text-white/40 hover:text-indigo-400 transition-all"
          title="Theme Settings"
        >
          <Palette class="w-5 h-5" />
        </button>
      </div>
    </aside>

    <!-- Navigation Panel (Layers / Elements) -->
    <aside
      class="w-72 border-r border-white/5 bg-[#252525]/30 backdrop-blur-3xl shrink-0 z-30 flex flex-col shadow-2xl"
    >
      <div class="px-6 py-4 border-b border-white/5 flex gap-6">
        <button
          onclick={() => (activeTab = "elements")}
          class="text-[10px] font-black uppercase tracking-[0.2em] transition-all {activeTab ===
          'elements'
            ? 'text-indigo-400'
            : 'text-white/30 hover:text-white/60'}">Elements</button
        >
        <button
          onclick={() => (activeTab = "layers")}
          class="text-[10px] font-black uppercase tracking-[0.2em] transition-all {activeTab ===
          'layers'
            ? 'text-indigo-400'
            : 'text-white/30 hover:text-white/60'}">Layers</button
        >
      </div>

      <div class="flex-1 overflow-auto p-4">
        {#if activeTab === "elements"}
          <div class="space-y-4">
            <section>
              <h3
                class="px-2 text-[9px] font-black text-white/20 uppercase tracking-widest mb-3"
              >
                Layout Presets
              </h3>
              <div class="grid grid-cols-2 gap-2">
                <button
                  onclick={() => addElement("text")}
                  class="aspect-square bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all group active:scale-95"
                >
                  <div
                    class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform"
                  >
                    <Type class="w-4 h-4" />
                  </div>
                  <span class="text-[9px] font-bold uppercase text-white/40"
                    >Text Box</span
                  >
                </button>
                <button
                  onclick={() => addElement("table")}
                  class="aspect-square bg-white/5 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all group active:scale-95"
                >
                  <div
                    class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform"
                  >
                    <TableIcon class="w-4 h-4" />
                  </div>
                  <span class="text-[9px] font-bold uppercase text-white/40"
                    >Table</span
                  >
                </button>
              </div>
            </section>
          </div>
        {:else}
          <div class="space-y-1">
            {#each [...currentPage.elements].reverse() as el}
              <div
                role="button"
                tabindex="0"
                onclick={() => (selectedElementId = el.id)}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ")
                    selectedElementId = el.id;
                }}
                class="w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left outline-none cursor-pointer group {selectedElementId ===
                el.id
                  ? 'bg-indigo-600/20 border-indigo-500/40'
                  : 'hover:bg-white/5 border-transparent'}"
              >
                <div
                  class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white/60"
                >
                  {#if el.type === "text"}<Type class="w-4 h-4" />{/if}
                  {#if el.type === "table"}<TableIcon class="w-4 h-4" />{/if}
                </div>
                <div class="flex-1 overflow-hidden">
                  <p
                    class="text-[10px] font-black uppercase text-white/80 truncate leading-tight"
                  >
                    {el.type} block
                  </p>
                  <p
                    class="text-[8px] font-medium text-white/20 uppercase truncate mt-0.5"
                  >
                    ID: {el.id.split("-")[1]}
                  </p>
                </div>
                <button
                  onclick={(e: MouseEvent) => {
                    e.stopPropagation();
                    deleteElement(el.id);
                  }}
                  class="p-2 text-white/5 hover:text-red-400 transition-colors"
                >
                  <RotateCcw class="w-3.5 h-3.5 rotate-45" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </aside>

    <!-- Canvas Viewport -->
    <div
      class="flex-1 bg-[#181818] overflow-auto relative flex justify-center items-start p-20 scrollbar-hide select-none transition-all"
      onclick={() => (selectedElementId = null)}
      role="presentation"
    >
      <div
        class="absolute inset-0 opacity-[0.04] pointer-events-none"
        style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: {10 *
          zoomLevel}px {10 * zoomLevel}px;"
      ></div>

      <div
        class="bg-white shadow-[0_0_100px_rgba(0,0,0,0.6)] origin-top mb-40 relative group transition-all"
        onclick={(e: MouseEvent) => e.stopPropagation()}
        role="presentation"
        style="width: {A4_WIDTH_MM * MM_TO_PX}px; height: {A4_HEIGHT_MM *
          MM_TO_PX}px; transform: scale({zoomLevel});"
      >
        <div
          class="absolute inset-[20mm] border border-dashed border-indigo-500/10 pointer-events-none"
        ></div>

        {#each currentPage.elements as el (el.id)}
          <ElementWrapper
            bind:this={elementRefs[el.id]}
            bind:element={
              currentPage.elements[
                currentPage.elements.findIndex((e) => e.id === el.id)
              ]
            }
            selected={selectedElementId === el.id}
            zoom={zoomLevel}
            onSelect={() => (selectedElementId = el.id)}
          />
        {/each}

        {#if currentPage.elements.length === 0}
          <div
            class="absolute inset-0 flex flex-col items-center justify-center opacity-[0.03] pointer-events-none"
          >
            <Layout class="w-32 h-32 text-black mb-8" />
            <h2
              class="text-4xl font-black uppercase tracking-[0.5em] text-black"
            >
              A4 CANVAS
            </h2>
          </div>
        {/if}
      </div>
    </div>

    <!-- Right Properties Panel -->
    <aside
      class="w-80 border-l border-white/5 bg-[#252525] shrink-0 z-40 flex flex-col shadow-2xl"
    >
      <div class="p-6 border-b border-white/5 bg-black/10">
        <h2
          class="text-[11px] font-black uppercase tracking-[0.2em] mb-1.5 text-white/80"
        >
          Properties
        </h2>
        <p class="text-[9px] font-bold text-white/20 uppercase tracking-widest">
          Adjust element details
        </p>
      </div>

      <div class="p-6 flex-1 overflow-auto">
        {#if selectedElement}
          <div class="space-y-8 animate-in fade-in duration-300">
            <section>
              <h3
                class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
              >
                Position & Size
              </h3>
              <div class="grid grid-cols-2 gap-4">
                {#each [{ id: "x", l: "X" }, { id: "y", l: "Y" }, { id: "w", l: "W" }, { id: "h", l: "H" }] as field}
                  <div class="space-y-2">
                    <label
                      for="p-{field.id}"
                      class="text-[9px] font-black uppercase text-white/20 ml-1"
                      >{field.l} (mm)</label
                    >
                    <input
                      id="p-{field.id}"
                      type="number"
                      bind:value={
                        selectedElement[field.id as keyof CanvasElement]
                      }
                      class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none transition-all"
                    />
                  </div>
                {/each}
              </div>
            </section>

            {#if selectedElement.type === "text"}
              <section class="pt-6 border-t border-white/5">
                <h3
                  class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
                >
                  Text Styling
                </h3>
                <div class="flex gap-2">
                  {#each [{ cmd: "bold", l: "B", s: "" }, { cmd: "italic", l: "I", s: "italic" }, { cmd: "underline", l: "U", s: "underline" }] as tool}
                    <button
                      onclick={() => triggerFormat(tool.cmd)}
                      class="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 hover:border-indigo-500/50 transition-all {tool.s}"
                    >
                      <span class="text-xs font-black">{tool.l}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}

            <section class="pt-6 border-t border-white/5">
              <h3
                class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
              >
                Quick Actions
              </h3>
              <div class="grid grid-cols-2 gap-2">
                <button
                  onclick={() => duplicateElement(selectedElement!.id)}
                  class="p-3 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-black uppercase hover:bg-white/10 transition-all text-white/40 hover:text-white"
                  >Duplicate</button
                >
                <button
                  onclick={() => deleteElement(selectedElement!.id)}
                  class="p-3 bg-red-500/10 rounded-2xl border border-red-500/10 text-[10px] font-black uppercase hover:bg-red-500/20 transition-all text-red-400"
                  >Delete</button
                >
              </div>
            </section>
          </div>
        {:else}
          <div
            class="h-full flex flex-col items-center justify-center text-center opacity-40"
          >
            <MousePointer2 class="w-8 h-8 text-white/20 mb-4" />
            <p
              class="text-[10px] font-black uppercase tracking-widest text-white/20"
            >
              Select an element
            </p>
          </div>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
