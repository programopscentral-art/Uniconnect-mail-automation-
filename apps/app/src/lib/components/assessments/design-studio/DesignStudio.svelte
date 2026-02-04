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
    HelpCircle,
    Plus,
    Grid,
    ChevronRight,
    Play,
    Info,
    X,
    Monitor,
    FileText,
    History,
    CheckCircle2,
    Clock,
    Fullscreen,
    AlignCenter,
    AlignLeft,
    AlignRight,
    AlignJustify,
    Type as TypeIcon,
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Minus,
  } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import ElementWrapper from "./ElementWrapper.svelte";
  import LayoutCanvas from "./LayoutCanvas.svelte";

  // Import Google Fonts for the canvas
  let fontLink = $state<HTMLLinkElement | null>(null);
  onMount(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Playfair+Display:wght@400;700;900&family=JetBrains+Mono:wght@400;700&family=Dancing+Script:wght@400;700&family=Outfit:wght@400;700;900&family=Cinzel:wght@400;700;900&family=Pacifico&display=swap";
    document.head.appendChild(link);
    fontLink = link;
    return () => {
      if (fontLink) document.head.removeChild(fontLink);
    };
  });

  let {
    template = $bindable(),
    assets = [],
    universityId,
    role,
    onSave,
  } = $props();

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
    locked?: boolean;
    hidden?: boolean;
    tableData?: any;
  }

  // V22: Initialization Logic
  if (!template.layout_schema) template.layout_schema = { pages: [] };
  if (!template.regions) template.regions = [];

  let layout = $state(template.layout_schema);
  let regions = $state(template.regions || []);
  let activePageId = $state<string>(
    template.layout_schema?.pages?.[0]?.id || "",
  );

  let showRegions = $state(false);

  // Sync state from template prop
  $effect(() => {
    if (template.regions?.length > 0 && regions.length === 0) {
      regions = template.regions;
    }
    if (template.layout_schema?.pages?.length > 0) {
      const isEmpty = !layout.pages?.[0]?.elements?.length;
      if (isEmpty) {
        layout = JSON.parse(JSON.stringify(template.layout_schema));
      }
    }
  });

  // Ensure activePageId is set when layout becomes available
  $effect(() => {
    if (layout.pages.length > 0 && !activePageId) {
      activePageId = layout.pages[0].id;
    }
  });

  // Keep template sync'd
  $effect(() => {
    template.layout_schema = layout;
    template.regions = regions;
    template.config = template.config || [];
  });

  let selectedElementId = $state<string | null>(null);
  let editingElementId = $state<string | null>(null);
  let activeCellId = $state<string | null>(null);
  let selectedCell = $state<{ rowIndex: number; colIndex: number } | null>(
    null,
  );

  let selectedElement = $derived.by(() => {
    if (!selectedElementId) return null;

    // Search in manual elements
    const manualEl = layout.pages
      .find((p: any) => p.id === activePageId)
      ?.elements.find((e: any) => e.id === selectedElementId);
    if (manualEl) return manualEl;

    // Search in OCR regions
    const regionEl = regions.find((r: any) => r.id === selectedElementId);
    if (regionEl) return regionEl;

    return null;
  });

  function updateStyle(key: string, value: any) {
    if (!selectedElement) return;
    if (!selectedElement.styles) selectedElement.styles = {};
    selectedElement.styles[key] = value;
    // Svelte 5 proxies handle the update
  }

  let activeTab = $state("elements");
  let zoomLevel = $state(0.75);
  let fullScreen = $state(false);
  let showMargins = $state(true);
  let zoomMode = $state("percent");

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795;

  let elementRefs = $state<Record<string, any>>({});

  // --- Table Operations (Requirement 8) ---
  function addRow(mode: "above" | "below") {
    if (!selectedElement || selectedElement.type !== "table" || !selectedCell)
      return;
    const { rowIndex } = selectedCell;
    const targetIdx = mode === "above" ? rowIndex : rowIndex + 1;
    const cols = selectedElement.tableData.rows[0].cells.length;

    const newRow = {
      id: crypto.randomUUID(),
      cells: Array(cols)
        .fill(0)
        .map(() => ({
          id: crypto.randomUUID(),
          content: "",
          rowSpan: 1,
          colSpan: 1,
          styles: { border: "1px solid #000" },
        })),
    };

    selectedElement.tableData.rows.splice(targetIdx, 0, newRow);
  }

  function addCol(mode: "left" | "right") {
    if (!selectedElement || selectedElement.type !== "table" || !selectedCell)
      return;
    const { colIndex } = selectedCell;
    const targetIdx = mode === "left" ? colIndex : colIndex + 1;

    selectedElement.tableData.rows.forEach((row: any) => {
      row.cells.splice(targetIdx, 0, {
        id: crypto.randomUUID(),
        content: "",
        rowSpan: 1,
        colSpan: 1,
        styles: { border: "1px solid #000" },
      });
    });
    layout = { ...layout };
  }

  function deleteCol() {
    if (!selectedElement || selectedElement.type !== "table" || !selectedCell)
      return;
    const { colIndex } = selectedCell;
    if (selectedElement.tableData.rows[0].cells.length <= 1) return;
    selectedElement.tableData.rows.forEach((row: any) => {
      row.cells.splice(colIndex, 1);
    });
    selectedCell = null;
    activeCellId = null;
    // Force reactivity update
    layout = JSON.parse(JSON.stringify(layout));
  }

  function deleteRow() {
    if (!selectedElement || selectedElement.type !== "table" || !selectedCell)
      return;
    const { rowIndex } = selectedCell;
    if (selectedElement.tableData.rows.length <= 1) return;
    selectedElement.tableData.rows.splice(rowIndex, 1);
    selectedCell = null;
    activeCellId = null;
    layout = JSON.parse(JSON.stringify(layout));
  }

  function addElement(type: string) {
    const currentPageIndex = layout.pages.findIndex(
      (p: any) => p.id === activePageId,
    );
    if (currentPageIndex === -1) return;

    const newEl: CanvasElement = {
      id: `el-${Date.now()}`,
      type,
      x: 20,
      y: 20,
      w: type === "line" ? 170 : 100,
      h: type === "line" ? 2 : 50,
      content: type === "text" ? "New Text Component" : "",
      styles: { fontFamily: "Outfit, sans-serif", fontSize: 14 },
    };

    if (type === "table") {
      newEl.tableData = {
        rows: [
          {
            id: "r1",
            cells: [
              {
                id: "c1",
                content: "Cell 1",
                styles: { border: "1px solid #000" },
              },
              {
                id: "c2",
                content: "Cell 2",
                styles: { border: "1px solid #000" },
              },
            ],
          },
        ],
      };
    }

    layout.pages[currentPageIndex].elements.push(newEl);
    layout = { ...layout };
    selectedElementId = newEl.id;
    return newEl;
  }

  function autoFit() {
    // Basic autofit logic
    zoomLevel = 0.75;
  }
</script>

<div
  class="flex flex-col h-screen bg-[#0a0a0a] text-white selection:bg-indigo-500/30 overflow-hidden font-['Outfit']"
>
  <!-- Header Panel -->
  <header
    class="h-16 border-b border-white/5 bg-[#121212] px-6 flex items-center justify-between shrink-0 z-50 shadow-2xl"
  >
    <div class="flex items-center gap-6">
      <button
        onclick={() => window.history.back()}
        class="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all mr-2"
        title="Go Back"
      >
        <ChevronRight class="w-5 h-5 rotate-180" />
      </button>

      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20"
        >
          <Layout class="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 class="text-[11px] font-black uppercase tracking-[0.2em]">
            {template.name || "Untiled Template"}
          </h1>
          <p
            class="text-[8px] font-bold text-white/20 uppercase tracking-widest"
          >
            {template.exam_type} • VERSION {template.version}
          </p>
        </div>
      </div>
      <div class="h-8 w-px bg-white/5 mx-4"></div>

      <div class="flex items-center gap-1 bg-black/20 p-1 rounded-xl">
        <button
          onclick={() => (showRegions = !showRegions)}
          class="px-4 py-2 rounded-lg transition-all flex items-center gap-2 {showRegions
            ? 'bg-indigo-600 text-white shadow-lg'
            : 'hover:bg-white/5 text-white/40'}"
        >
          <Layers class="w-4 h-4" />
          <span class="text-[9px] font-black uppercase tracking-widest"
            >Regions</span
          >
        </button>
      </div>
      <div
        class="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5"
      >
        <button
          onclick={() => (zoomLevel = Math.max(0.1, zoomLevel - 0.1))}
          class="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
          ><ZoomOut class="w-3.5 h-3.5" /></button
        >
        <span class="text-[9px] font-black w-10 text-center text-white/60"
          >{Math.round(zoomLevel * 100)}%</span
        >
        <button
          onclick={() => (zoomLevel = Math.min(3, zoomLevel + 0.1))}
          class="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
          ><ZoomIn class="w-3.5 h-3.5" /></button
        >
      </div>
    </div>

    <div class="flex items-center gap-4">
      <button
        onclick={() => (showMargins = !showMargins)}
        class="p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all {showMargins
          ? 'text-indigo-400 border-indigo-500/20'
          : 'text-white/40'}"><Grid class="w-4 h-4" /></button
      >
      <button
        onclick={() => (fullScreen = !fullScreen)}
        class="p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all {fullScreen
          ? 'text-indigo-400 border-indigo-500/20'
          : 'text-white/40'}"><Maximize2 class="w-4 h-4" /></button
      >
      <button
        onclick={() => onSave?.()}
        class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-2"
      >
        <Save class="w-3.5 h-3.5" /> Save Template
      </button>
    </div>
  </header>

  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar: Library -->
    <aside
      class="w-80 border-r border-white/5 bg-[#121212] flex flex-col shrink-0 z-40 shadow-2xl {fullScreen
        ? 'hidden'
        : ''}"
    >
      <div class="p-2 border-b border-white/5 flex gap-1 bg-black/20">
        {#each ["elements", "styles", "layers", "pages"] as tab}
          <button
            onclick={() => (activeTab = tab)}
            class="flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all {activeTab ===
            tab
              ? 'bg-white/5 text-indigo-400'
              : 'text-white/20 hover:text-white/40'}">{tab}</button
          >
        {/each}
      </div>

      <div class="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {#if activeTab === "elements"}
          <div class="space-y-6">
            <section>
              <h3
                class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
              >
                Core Components
              </h3>
              <div class="grid grid-cols-2 gap-3">
                <button
                  onclick={() => addElement("text")}
                  class="group p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/50 transition-all text-center flex flex-col items-center gap-2"
                >
                  <Type
                    class="w-5 h-5 text-white/20 group-hover:text-indigo-400 transition-all"
                  />
                  <span
                    class="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white"
                    >Text Block</span
                  >
                </button>
                <button
                  onclick={() => addElement("table")}
                  class="group p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/50 transition-all text-center flex flex-col items-center gap-2"
                >
                  <TableIcon
                    class="w-5 h-5 text-white/20 group-hover:text-indigo-400 transition-all"
                  />
                  <span
                    class="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white"
                    >Table</span
                  >
                </button>
                <button
                  onclick={() => addElement("line")}
                  class="group p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/50 transition-all text-center flex flex-col items-center gap-2"
                >
                  <Minus
                    class="w-5 h-5 text-white/20 group-hover:text-indigo-400 transition-all"
                  />
                  <span
                    class="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white"
                    >Divider</span
                  >
                </button>
                <button
                  onclick={() => addElement("image")}
                  class="group p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/50 transition-all text-center flex flex-col items-center gap-2"
                >
                  <ImageIcon
                    class="w-5 h-5 text-white/20 group-hover:text-indigo-400 transition-all"
                  />
                  <span
                    class="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white"
                    >Image</span
                  >
                </button>
                <button
                  onclick={() => addElement("shape")}
                  class="group p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/50 transition-all text-center flex flex-col items-center gap-2"
                >
                  <Square
                    class="w-5 h-5 text-white/20 group-hover:text-indigo-400 transition-all"
                  />
                  <span
                    class="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white"
                    >Shape</span
                  >
                </button>
              </div>
            </section>

            <!-- Image Panel (Requirement A3) -->
            <section class="pt-6 border-t border-white/5 space-y-4">
              <h3
                class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]"
              >
                University Assets
              </h3>
              <div class="grid grid-cols-3 gap-2">
                {#each assets as asset}
                  <button
                    onclick={() => {
                      const newEl = addElement("image");
                      if (newEl) {
                        newEl.src = asset.url;
                        layout = JSON.parse(JSON.stringify(layout));
                      }
                    }}
                    aria-label="Add asset {asset.name}"
                    title="Add asset {asset.name}"
                    class="aspect-square rounded-xl bg-black/40 border border-white/5 overflow-hidden hover:border-indigo-500/50 transition-all group"
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      class="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all"
                    />
                  </button>
                {/each}
                {#if assets.length === 0}
                  <div class="col-span-3 py-6 text-center opacity-20">
                    <p class="text-[8px] font-black uppercase tracking-widest">
                      No assets found
                    </p>
                  </div>
                {/if}
              </div>
            </section>
          </div>
        {:else if activeTab === "layers"}
          <!-- Requirement 6: Non-empty layers state -->
          <div class="space-y-4">
            {#each layout.pages.find((p: any) => p.id === activePageId)?.elements || [] as el}
              <button
                onclick={() => (selectedElementId = el.id)}
                class="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border {selectedElementId ===
                el.id
                  ? 'border-indigo-500/50 bg-indigo-500/5'
                  : 'border-white/5'}"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-white/40"
                  >
                    {#if el.type === "text"}<Type
                        class="w-3.5 h-3.5"
                      />{:else if el.type === "table"}<TableIcon
                        class="w-3.5 h-3.5"
                      />{:else if el.type === "image"}<ImageIcon
                        class="w-3.5 h-3.5"
                      />{:else}<Square class="w-3.5 h-3.5" />{/if}
                  </div>
                  <span
                    class="text-[9px] font-black uppercase tracking-widest text-white/60"
                    >{el.type} Layer</span
                  >
                </div>
              </button>
            {:else}
              <div
                class="py-20 text-center opacity-20 flex flex-col items-center gap-4"
              >
                <Layers class="w-12 h-12" />
                <p class="text-[9px] font-black uppercase tracking-[0.2em]">
                  No Layers on Page
                </p>
              </div>
            {/each}
          </div>
        {:else if activeTab === "pages"}
          <div class="space-y-3">
            {#each layout.pages as page, i}
              <button
                onclick={() => (activePageId = page.id)}
                aria-label="Switch to Page {i + 1}"
                title="Page {i + 1}"
                class="w-full aspect-[1/1.41] bg-white rounded-sm mb-4 border-4 {activePageId ===
                page.id
                  ? 'border-indigo-500 shadow-2xl'
                  : 'border-transparent opacity-40'}"
              ></button>
            {/each}
            <button
              class="w-full py-6 border-2 border-dashed border-white/5 rounded-2xl text-[9px] font-black text-white/10 uppercase tracking-widest hover:border-indigo-500/30 hover:text-indigo-400 transition-all flex flex-col items-center gap-3"
              aria-label="Add Page"
              title="Add Page"
            >
              <Plus class="w-5 h-5" /> Add Page
            </button>
          </div>
        {/if}
      </div>
    </aside>

    <!-- Canvas Viewport -->
    <main
      class="flex-1 bg-[#121212] overflow-auto relative flex justify-center items-start p-20 scrollbar-hide select-none transition-all"
      onpointerdown={(e) => {
        if (e.button !== 0) return;
        selectedElementId = null;
        editingElementId = null;
        selectedCell = null;
        activeCellId = null;
      }}
    >
      <div
        class="absolute inset-0 opacity-[0.03] pointer-events-none"
        style="background-image: radial-gradient(circle, white 0.5px, transparent 0.5px); background-size: {20 *
          zoomLevel}px {20 * zoomLevel}px;"
      ></div>

      <LayoutCanvas
        bind:layout
        zoom={zoomLevel}
        {showMargins}
        {activePageId}
        backgroundImage={template.backgroundImageUrl || layout.debugImage}
        bgOpacity={1.0}
        {showRegions}
        {regions}
        {selectedElementId}
        mode={editingElementId ? "edit" : "view"}
        elementComponent={ElementWrapper}
        onElementSelect={(id: string) => {
          selectedElementId = id;
          if (id !== editingElementId) editingElementId = null;
        }}
        onElementChange={(id, value) => {
          const reg = regions.find((r) => r.id === id);
          if (reg) reg.value = value;

          // Also sync to layout.pages elements if they exist (backward compatibility)
          layout.pages.forEach((p) => {
            const el = p.elements.find((e) => e.id === id);
            if (el) el.value = value;
          });
        }}
        bind:selectedCell
        bind:activeCellId
      />
    </main>

    <!-- Right Sidebar: Properties -->
    <aside
      class="w-80 border-l border-white/5 bg-[#121212] flex flex-col shrink-0 z-40 shadow-2xl {fullScreen
        ? 'hidden'
        : ''}"
    >
      <div class="p-6 border-b border-white/5 bg-black/10">
        <h2
          class="text-[11px] font-black uppercase tracking-[0.2em] text-white/80"
        >
          Properties
        </h2>
      </div>

      <div class="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {#if selectedElement}
          <section class="space-y-6">
            <h3
              class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]"
            >
              Geometry
            </h3>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label
                  for="geo-x"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >x</label
                >
                <input
                  id="geo-x"
                  type="number"
                  step="0.001"
                  bind:value={selectedElement.x}
                  class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none"
                />
              </div>
              <div class="space-y-2">
                <label
                  for="geo-y"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >y</label
                >
                <input
                  id="geo-y"
                  type="number"
                  step="0.001"
                  bind:value={selectedElement.y}
                  class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none"
                />
              </div>
              <div class="space-y-2">
                <label
                  for="geo-w"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >w</label
                >
                <input
                  id="geo-w"
                  type="number"
                  step="0.001"
                  value={selectedElement.w ?? selectedElement.width}
                  oninput={(e) => {
                    const val = parseFloat(
                      (e.target as HTMLInputElement).value,
                    );
                    if (selectedElement.w !== undefined)
                      selectedElement.w = val;
                    if (selectedElement.width !== undefined)
                      selectedElement.width = val;
                  }}
                  class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none"
                />
              </div>
              <div class="space-y-2">
                <label
                  for="geo-h"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >h</label
                >
                <input
                  id="geo-h"
                  type="number"
                  step="0.001"
                  value={selectedElement.h ?? selectedElement.height}
                  oninput={(e) => {
                    const val = parseFloat(
                      (e.target as HTMLInputElement).value,
                    );
                    if (selectedElement.h !== undefined)
                      selectedElement.h = val;
                    if (selectedElement.height !== undefined)
                      selectedElement.height = val;
                  }}
                  class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none"
                />
              </div>
            </div>
          </section>

          {#if selectedElement.type === "text"}
            <section class="pt-6 border-t border-white/5 space-y-6">
              <h3
                class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]"
              >
                Typography
              </h3>
              <!-- Typography controls omitted for brevity but would go here -->
              <div class="space-y-2">
                <label
                  for="content-edit"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >Content</label
                >
                <textarea
                  id="content-edit"
                  rows="4"
                  value={selectedElement.value ??
                    selectedElement.content ??
                    selectedElement.defaultText ??
                    ""}
                  oninput={(e) => {
                    const val = (e.target as HTMLTextAreaElement).value;
                    if (selectedElement.value !== undefined)
                      selectedElement.value = val;
                    else if (selectedElement.content !== undefined)
                      selectedElement.content = val;
                    else if (selectedElement.defaultText !== undefined)
                      selectedElement.defaultText = val;
                  }}
                  class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none resize-none"
                ></textarea>
              </div>
            </section>
          {/if}

          {#if selectedElement.type === "table"}
            <section class="pt-6 border-t border-white/5 space-y-6">
              <h3
                class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]"
              >
                Matrix Grid
              </h3>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <button
                  onclick={() => addRow("above")}
                  disabled={!selectedCell}
                  class="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 transition-all disabled:opacity-20 text-white/60"
                  >Row Above</button
                >
                <button
                  onclick={() => addRow("below")}
                  disabled={!selectedCell}
                  class="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 transition-all disabled:opacity-20 text-white/60"
                  >Row Below</button
                >
              </div>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <button
                  onclick={() => addCol("left")}
                  disabled={!selectedCell}
                  class="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 transition-all disabled:opacity-20 text-white/60"
                  >Col Left</button
                >
                <button
                  onclick={() => addCol("right")}
                  disabled={!selectedCell}
                  class="px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black uppercase hover:bg-white/10 transition-all disabled:opacity-20 text-white/60"
                  >Col Right</button
                >
              </div>
              <div class="grid grid-cols-2 gap-3">
                <button
                  onclick={deleteRow}
                  disabled={!selectedCell}
                  class="px-4 py-3 bg-red-500/10 border border-red-500/10 rounded-xl text-[9px] font-black uppercase hover:bg-red-500/20 transition-all text-red-500 disabled:opacity-20"
                  >Delete Row</button
                >
                <button
                  onclick={deleteCol}
                  disabled={!selectedCell}
                  class="px-4 py-3 bg-red-500/10 border border-red-500/10 rounded-xl text-[9px] font-black uppercase hover:bg-red-500/20 transition-all text-red-500 disabled:opacity-20"
                  >Delete Col</button
                >
              </div>
            </section>
          {/if}

          <!-- Colors & Fonts (Requirement A5 & A7) -->
          <section class="pt-6 border-t border-white/5 space-y-6">
            <h3
              class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]"
            >
              Styles
            </h3>

            {#if selectedElement.type === "text" || selectedElement.type === "table"}
              <div class="space-y-2">
                <label
                  for="font-family-select"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >Font Family</label
                >
                <select
                  id="font-family-select"
                  onchange={(e) =>
                    updateStyle("fontFamily", e.currentTarget.value)}
                  class="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold focus:border-indigo-500/50 outline-none"
                >
                  {#each ["Outfit", "Inter", "Playfair Display", "JetBrains Mono", "Dancing Script", "Cinzel", "Pacifico"] as font}
                    <option
                      value="{font}, sans-serif"
                      selected={selectedElement.styles?.fontFamily?.includes(
                        font,
                      )}>{font}</option
                    >
                  {/each}
                </select>
              </div>
            {/if}

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label
                  for="text-color-picker"
                  class="text-[9px] font-black uppercase text-white/20 ml-1"
                  >Color</label
                >
                <div class="flex items-center gap-2">
                  <input
                    id="text-color-picker"
                    type="color"
                    value={selectedElement.styles?.color || "#000000"}
                    oninput={(e) => updateStyle("color", e.currentTarget.value)}
                    class="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer"
                  />
                  <input
                    id="text-color-hex"
                    aria-label="Text color hex"
                    type="text"
                    value={selectedElement.styles?.color || "#000000"}
                    oninput={(e) => updateStyle("color", e.currentTarget.value)}
                    class="flex-1 bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-[10px] font-mono outline-none"
                  />
                </div>
              </div>

              {#if selectedElement.type === "shape"}
                <div class="space-y-2">
                  <label
                    for="shape-fill-picker"
                    class="text-[9px] font-black uppercase text-white/20 ml-1"
                    >Fill</label
                  >
                  <div class="flex items-center gap-2">
                    <input
                      id="shape-fill-picker"
                      type="color"
                      value={selectedElement.backgroundColor || "#4f46e5"}
                      oninput={(e) => {
                        selectedElement.backgroundColor = e.currentTarget.value;
                        layout = { ...layout };
                      }}
                      class="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer"
                    />
                  </div>
                </div>
              {/if}
            </div>
          </section>
        {:else}
          <!-- Requirement 6: Empty state for properties -->
          <div
            class="h-full flex flex-col items-center justify-center text-center p-10 opacity-20"
          >
            <MousePointer2 class="w-12 h-12 mb-6" />
            <h4 class="text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              Editor Standby
            </h4>
            <p
              class="text-[9px] font-medium leading-relaxed uppercase tracking-widest text-white/60"
            >
              Select an element on the canvas to adjust its properties and
              styles.
            </p>
          </div>
        {/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  :global(.layout-canvas) {
    transform-origin: top center;
  }
</style>
