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
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
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

  // --- Initialization Logic ---
  if (!template.layout_schema) template.layout_schema = {};
  if (!template.layout_schema.pages) {
    template.layout_schema.pages = [{ id: "p1", elements: [] }];
  }

  let layout = $state(template.layout_schema);
  let activePageId = $state(layout.pages[0].id);
  let activeTab = $state("elements"); // elements | layers | assets | pages
  let activeCellId = $state<string | null>(null);
  let onboardingActive = $state(false);
  let onboardingStep = $state(0);

  const ONBOARDING_STEPS = [
    {
      title: "Welcome to Design Studio V2",
      description:
        "A professional, high-fidelity canvas for building examination papers. Let's take a quick look around.",
      target: "canvas",
    },
    {
      title: "The Component Library",
      description:
        "Save complex blocks like headers or tables here and reuse them across templates instantly.",
      target: "sidebar",
    },
    {
      title: "Precision Controls",
      description:
        "Use the zoom engine and margin guides to ensure your layout is pixel-perfect.",
      target: "header",
    },
  ];
  let assets = $state([
    {
      id: "logo-1",
      name: "University Logo",
      url: "https://via.placeholder.com/150?text=LOGO",
      type: "image",
    },
    {
      id: "seal-1",
      name: "Official Seal",
      url: "https://via.placeholder.com/80?text=SEAL",
      type: "image",
    },
  ]);
  let library = $state([
    {
      id: "lib-1",
      name: "Standard Header",
      elements: [
        {
          id: "h1",
          type: "text",
          x: 20,
          y: 10,
          w: 170,
          h: 20,
          content: "<strong>UNIVERSITY NAME</strong>",
          styles: { textAlign: "center", fontSize: 24, fontFamily: "serif" },
        },
      ],
    },
  ]);
  let isUploading = $state(false);
  let zoomMode = $state<"percent" | "fit-page" | "fit-width">("fit-page");
  let zoomLevel = $state(1.0);
  let selectedElementId = $state<string | null>(null);
  let isSaving = $state(false);
  let showMargins = $state(true);
  let fullScreen = $state(false);
  // --- Canvas Settings (A4 Prototype) ---
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795275591; // 1mm = 3.77px approx at 96dpi

  let currentPage = $derived(
    layout.pages.find((p: { id: string }) => p.id === activePageId) ||
      layout.pages[0],
  );
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
  function selectAsset(asset: any) {
    if (
      activeTab === "assets" &&
      selectedElementId &&
      selectedElement?.type === "image"
    ) {
      selectedElement.src = asset.url;
      selectedElement.content = asset.name;
    } else {
      const id = `el-${Math.random().toString(36).substr(2, 9)}`;
      const newEl: CanvasElement = {
        id,
        type: "image",
        x: 20,
        y: 20,
        w: 50,
        h: 50,
        content: asset.name,
        src: asset.url,
        styles: { opacity: 1, lockAspectRatio: true },
      };
      layout.pages[0].elements = [...layout.pages[0].elements, newEl];
      selectedElementId = id;
    }
  }

  function handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    isUploading = true;
    // Simulate upload delay
    setTimeout(() => {
      const newAsset = {
        id: `ast-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        url: URL.createObjectURL(file), // Mock local URL for now
        type: "image" as const,
      };
      assets = [newAsset, ...assets];
      isUploading = false;
    }, 1000);
  }

  function addElement(type: CanvasElement["type"]) {
    if (type === "image") {
      activeTab = "assets";
      return;
    }
    const id = `el-${Math.random().toString(36).substr(2, 9)}`;
    const newEl: CanvasElement = {
      id,
      type,
      x: 20,
      y: 20,
      w: type === "text" ? 100 : 50,
      h: type === "text" ? 12 : 50,
      content: type === "text" ? "New Text Element" : "",
      styles: {
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        fontWeight: "normal",
        color: "#000000",
        textAlign: "left",
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    };

    const pageIndex = layout.pages.findIndex(
      (p: { id: string }) => p.id === activePageId,
    );
    if (pageIndex !== -1) {
      layout.pages[pageIndex].elements = [
        ...layout.pages[pageIndex].elements,
        newEl,
      ];
      selectedElementId = id;
      template.layout_schema = layout;
    }
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

  function addPage() {
    const id = `p-${Math.random().toString(36).substr(2, 9)}`;
    layout.pages = [...layout.pages, { id, elements: [] }];
    activePageId = id;
    template.layout_schema = layout;
  }

  const EXAM_TYPES = [
    { value: "Semester", label: "Semester End" },
    { value: "Internal", label: "Continuous Internal" },
    { value: "Assignment", label: "Practical/Home Assignment" },
  ];

  function saveAsComponent() {
    if (!selectedElement) return;
    const name = prompt(
      "Enter component name:",
      selectedElement.content?.substring(0, 20) || "New Component",
    );
    if (!name) return;

    const newComp = {
      id: `lib-${Math.random().toString(36).substr(2, 9)}`,
      name,
      elements: [JSON.parse(JSON.stringify(selectedElement))],
    };
    library = [...library, newComp];
  }

  function useComponent(comp: { elements: CanvasElement[] }) {
    const pageIndex = layout.pages.findIndex(
      (p: { id: string }) => p.id === activePageId,
    );
    if (pageIndex === -1) return;

    comp.elements.forEach((el: CanvasElement) => {
      const copy = JSON.parse(JSON.stringify(el));
      copy.id = `el-${Math.random().toString(36).substr(2, 9)}`;
      layout.pages[pageIndex].elements = [
        ...layout.pages[pageIndex].elements,
        copy,
      ];
    });
    template.layout_schema = layout;
  }

  // --- Table Actions ---
  function getActiveCell(el: any) {
    if (!el || !el.tableData || !activeCellId) return null;
    for (const row of el.tableData.rows) {
      const cell = row.cells.find((c: any) => c.id === activeCellId);
      if (cell) return cell;
    }
    return null;
  }

  function addRow(where: "above" | "below") {
    if (!selectedElement || selectedElement.type !== "table") return;
    const data = selectedElement.tableData;
    const activeCell = getActiveCell(selectedElement);
    let rowIndex = data.rows.findIndex((r: any) =>
      r.cells.some((c: any) => c.id === activeCellId),
    );
    if (rowIndex === -1) rowIndex = data.rows.length - 1;

    const insertAt = where === "below" ? rowIndex + 1 : rowIndex;
    const numCols = data.rows[0].cells.length;
    const newRow = {
      id: `r-${Math.random().toString(36).substr(2, 9)}`,
      cells: Array.from({ length: numCols }, (_, i) => ({
        id: `c-${Math.random().toString(36).substr(2, 9)}`,
        content: "",
        rowSpan: 1,
        colSpan: 1,
        styles: {},
      })),
    };
    data.rows.splice(insertAt, 0, newRow);
    selectedElement.tableData = { ...data };
  }

  function addColumn(where: "left" | "right") {
    if (!selectedElement || selectedElement.type !== "table") return;
    const data = selectedElement.tableData;
    const activeCell = getActiveCell(selectedElement);
    let colIndex = -1;
    data.rows.forEach((r: any) => {
      const idx = r.cells.findIndex((c: any) => c.id === activeCellId);
      if (idx !== -1) colIndex = idx;
    });
    if (colIndex === -1) colIndex = data.rows[0].cells.length - 1;

    const insertAt = where === "right" ? colIndex + 1 : colIndex;
    data.rows.forEach((r: any) => {
      r.cells.splice(insertAt, 0, {
        id: `c-${Math.random().toString(36).substr(2, 9)}`,
        content: "",
        rowSpan: 1,
        colSpan: 1,
        styles: {},
      });
    });
    selectedElement.tableData = { ...data };
  }

  function deleteRow() {
    if (!selectedElement || selectedElement.type !== "table") return;
    const data = selectedElement.tableData;
    if (data.rows.length <= 1) return;
    const rowIndex = data.rows.findIndex((r: any) =>
      r.cells.some((c: any) => c.id === activeCellId),
    );
    if (rowIndex === -1) return;
    data.rows.splice(rowIndex, 1);
    activeCellId = null;
    selectedElement.tableData = { ...data };
  }

  function deleteColumn() {
    if (!selectedElement || selectedElement.type !== "table") return;
    const data = selectedElement.tableData;
    if (data.rows[0].cells.length <= 1) return;
    let colIndex = -1;
    data.rows.forEach((r: any) => {
      const idx = r.cells.findIndex((c: any) => c.id === activeCellId);
      if (idx !== -1) colIndex = idx;
    });
    if (colIndex === -1) return;
    data.rows.forEach((r: any) => r.cells.splice(colIndex, 1));
    activeCellId = null;
    selectedElement.tableData = { ...data };
  }

  function triggerFormat(cmd: string, val: string | null = null) {
    if (selectedElementId && elementRefs[selectedElementId]) {
      elementRefs[selectedElementId].format(cmd, val);
    }
  }

  function setZoom(val: number | "fit-page" | "fit-width") {
    if (typeof val === "number") {
      zoomMode = "percent";
      zoomLevel = val;
    } else {
      zoomMode = val;
      autoFit();
    }
  }

  function autoFit() {
    if (typeof window === "undefined") return;
    const sidebarWidth = 72 + 288 + 320; // rail + nav + properties
    const viewerWidth =
      window.innerWidth - (fullScreen ? 0 : sidebarWidth) - 100;
    const viewerHeight = window.innerHeight - 56 - 100; // header + padding

    const paperPxW = A4_WIDTH_MM * MM_TO_PX;
    const paperPxH = A4_HEIGHT_MM * MM_TO_PX;

    if (zoomMode === "fit-width") {
      zoomLevel = viewerWidth / paperPxW;
    } else if (zoomMode === "fit-page") {
      const scaleW = viewerWidth / paperPxW;
      const scaleH = viewerHeight / paperPxH;
      zoomLevel = Math.min(scaleW, scaleH);
    }
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
  <!-- Top Header Bar (Breadcrumbs & Status) -->
  <nav
    class="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#1a1a1a] shrink-0 z-50"
  >
    <div class="flex items-center gap-4">
      <button
        onclick={() => history.back()}
        class="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
      >
        <ChevronRight class="w-5 h-5 rotate-180" />
      </button>

      <div
        class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
      >
        <span class="text-white/30 hover:text-white/60 cursor-pointer"
          >University</span
        >
        <ChevronRight class="w-3 h-3 text-white/10" />
        <span class="text-white/30 hover:text-white/60 cursor-pointer"
          >Templates</span
        >
        <ChevronRight class="w-3 h-3 text-white/10" />
        <span class="text-indigo-400 font-black"
          >{template?.name || "Untitled"}</span
        >
      </div>

      <div class="h-4 w-[1px] bg-white/10 mx-2"></div>

      <button
        onclick={() => (onboardingActive = true)}
        class="flex items-center gap-2 px-3 py-1 hover:bg-white/5 rounded-full text-white/40 hover:text-indigo-400 transition-all border border-transparent hover:border-white/10"
      >
        <HelpCircle class="w-3.5 h-3.5" />
        <span class="text-[9px] font-black uppercase tracking-wider">Help</span>
      </button>

      <div class="h-4 w-[1px] bg-white/10 mx-2"></div>

      <div
        class="flex items-center gap-2 px-2.5 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20"
      >
        {#if template.status === "published"}
          <CheckCircle2 class="w-3 h-3 text-emerald-400" />
          <span class="text-[9px] font-black text-emerald-400 leading-none"
            >PUBLISHED</span
          >
        {:else}
          <Clock class="w-3 h-3 text-amber-400" />
          <span
            class="text-[9px] font-black text-amber-400 leading-none uppercase"
            >{template.status || "DRAFT"}</span
          >
        {/if}
      </div>
    </div>

    <!-- Center Zoom Controls Engine -->
    <div
      class="flex items-center bg-black/40 rounded-xl px-3 py-1 gap-2 border border-white/10"
    >
      <select
        value={zoomMode === "percent" ? zoomLevel : zoomMode}
        onchange={(e) => {
          const val = (e.target as HTMLSelectElement).value;
          if (val === "fit-page" || val === "fit-width") setZoom(val);
          else setZoom(parseFloat(val));
        }}
        class="bg-transparent text-[10px] font-black text-white/60 outline-none border-none cursor-pointer hover:text-indigo-400 transition-colors"
      >
        <option value="fit-page" class="bg-[#1a1a1a]">Fit to Page</option>
        <option value="fit-width" class="bg-[#1a1a1a]">Fit to Width</option>
        <option value={0.5} class="bg-[#1a1a1a]">50%</option>
        <option value={0.75} class="bg-[#1a1a1a]">75%</option>
        <option value={1.0} class="bg-[#1a1a1a]">100%</option>
        <option value={1.25} class="bg-[#1a1a1a]">125%</option>
        <option value={1.5} class="bg-[#1a1a1a]">150%</option>
      </select>
      <div class="h-3 w-[1px] bg-white/10"></div>
      <button
        onclick={() => (showMargins = !showMargins)}
        class="p-1.5 hover:text-indigo-400 transition-all {showMargins
          ? 'text-indigo-400'
          : 'text-white/20'}"
        title="Toggle Guides"
      >
        <Grid class="w-3.5 h-3.5" />
      </button>
      <button
        onclick={() => (fullScreen = !fullScreen)}
        class="p-1.5 hover:text-indigo-400 transition-all {fullScreen
          ? 'text-indigo-400'
          : 'text-white/20'}"
        title="Focus Mode"
      >
        <Maximize2 class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Right Actions -->
    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-black transition-all border border-white/5"
      >
        <History class="w-3.5 h-3.5" />
        REVISIONS
      </button>
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
        {isSaving ? "SAVING..." : "PUBLISH CHANGES"}
      </button>
    </div>
  </nav>

  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar (Tool Rail) -->
    <aside
      class="w-[72px] border-r border-white/5 bg-[#1a1a1a] flex flex-col pt-4 items-center gap-2 shrink-0 z-40"
    >
      {#each TOOLBAR_ITEMS as item}
        <button
          class="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all group {activeTab ===
          item.id
            ? 'bg-indigo-600 text-white'
            : 'hover:bg-white/5 text-white/40'} active:scale-95"
          onclick={() =>
            (activeTab = item.id === "select" ? "elements" : item.id)}
          title={item.label}
        >
          <item.icon class="w-5 h-5 transition-colors" />
          <span class="text-[7px] font-black uppercase tracking-tighter"
            >{item.label}</span
          >
        </button>
      {/each}
      <div class="mt-auto mb-6 flex flex-col gap-4">
        <button
          class="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-white/5 text-white/40 hover:text-indigo-400 transition-all"
          onclick={() => (activeTab = "pages")}
          title="Pages & Thumbnails"
        >
          <FileText class="w-5 h-5" />
        </button>
      </div>
    </aside>

    <!-- Navigation Panel (Library / Elements / Assets / Pages) -->
    <aside
      class="w-72 border-r border-white/5 bg-[#252525]/30 backdrop-blur-3xl shrink-0 z-30 flex flex-col shadow-2xl {fullScreen
        ? 'hidden'
        : ''}"
    >
      <div
        class="px-6 py-4 border-b border-white/5 flex gap-6 overflow-x-auto scrollbar-hide"
      >
        {#each ["elements", "library", "assets", "pages"] as tab}
          <button
            onclick={() => (activeTab = tab)}
            class="text-[9px] font-black uppercase tracking-[0.2em] transition-all shrink-0 {activeTab ===
            tab
              ? 'text-indigo-400'
              : 'text-white/30 hover:text-white/60'}">{tab}</button
          >
        {/each}
      </div>

      <div class="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {#if activeTab === "elements"}
          <div class="space-y-8">
            <section>
              <h3
                class="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-4"
              >
                Template Settings
              </h3>
              <div class="space-y-4">
                <div class="space-y-2">
                  <label
                    for="template-name"
                    class="text-[8px] font-black text-white/40 uppercase ml-1"
                    >Template Name</label
                  >
                  <input
                    id="template-name"
                    bind:value={template.name}
                    class="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2.5 text-[10px] font-bold outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div class="space-y-2">
                  <label
                    for="template-category"
                    class="text-[8px] font-black text-white/40 uppercase ml-1"
                    >Exam Category</label
                  >
                  <select
                    id="template-category"
                    bind:value={template.exam_type}
                    class="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2.5 text-[10px] font-bold outline-none appearance-none"
                  >
                    {#each EXAM_TYPES as type}
                      <option value={type.value}>{type.label}</option>
                    {/each}
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h3
                class="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-4"
              >
                Add Elements
              </h3>
              <div class="grid grid-cols-2 gap-3">
                {#each TOOLBAR_ITEMS.filter((i) => i.id !== "select") as item}
                  <button
                    class="aspect-square rounded-2xl border border-white/5 bg-white/5 flex flex-col items-center justify-center gap-3 hover:border-indigo-500/50 hover:bg-white/10 transition-all group active:scale-95"
                    onclick={() => addElement(item.id)}
                  >
                    <item.icon
                      class="w-6 h-6 text-white/20 group-hover:text-indigo-400 transition-colors"
                    />
                    <span
                      class="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-white/60"
                      >{item.label}</span
                    >
                  </button>
                {/each}
              </div>
            </section>
          </div>
        {:else if activeTab === "library"}
          <div class="space-y-4">
            <h3
              class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2"
            >
              Saved Blocks
            </h3>
            {#each library as comp}
              <button
                onclick={() => useComponent(comp)}
                class="w-full p-4 rounded-2xl border border-white/5 bg-white/5 hover:border-indigo-500 transition-all text-left group"
              >
                <div class="flex items-center justify-between mb-2">
                  <span
                    class="text-[9px] font-black text-white/40 uppercase tracking-widest"
                    >{comp.name}</span
                  >
                  <Plus
                    class="w-3.5 h-3.5 text-white/10 group-hover:text-indigo-400"
                  />
                </div>
                <div
                  class="h-16 bg-black/20 rounded-lg overflow-hidden flex items-center justify-center border border-white/5"
                >
                  <span
                    class="text-[6px] font-black text-white/5 uppercase select-none"
                    >Preview</span
                  >
                </div>
              </button>
            {/each}
            {#if library.length === 0}
              <div class="py-10 text-center opacity-20">
                <History class="w-8 h-8 mx-auto mb-2" />
                <p class="text-[8px] font-black uppercase">
                  Your library is empty
                </p>
              </div>
            {/if}
          </div>
        {:else if activeTab === "assets"}
          <div class="space-y-6">
            <section>
              <div class="flex items-center justify-between mb-4">
                <h3
                  class="text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                >
                  University Assets
                </h3>
                {#if isUploading}
                  <div
                    class="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"
                  ></div>
                {/if}
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label
                  class="aspect-square rounded-2xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/5 hover:border-indigo-500/30 transition-all group cursor-pointer"
                >
                  <input
                    type="file"
                    class="hidden"
                    accept="image/*"
                    onchange={handleFileUpload}
                  />
                  <Plus
                    class="w-6 h-6 text-white/20 group-hover:text-indigo-400"
                  />
                  <span
                    class="text-[8px] font-black text-white/20 group-hover:text-white/40 uppercase"
                    >Upload New</span
                  >
                </label>

                {#each assets as asset}
                  <button
                    onclick={() => selectAsset(asset)}
                    class="aspect-square rounded-2xl border border-white/5 bg-white/5 overflow-hidden group relative hover:border-indigo-500 transition-all"
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      class="w-full h-full object-contain p-2"
                    />
                    <div
                      class="absolute inset-0 bg-indigo-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <Plus class="w-4 h-4 text-white" />
                    </div>
                  </button>
                {/each}
              </div>
            </section>
          </div>
        {:else if activeTab === "pages"}
          <div class="space-y-4">
            {#each layout.pages as page, idx}
              <div
                role="button"
                tabindex="0"
                onclick={() => {
                  activePageId = page.id;
                  selectedElementId = null;
                }}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    activePageId = page.id;
                    selectedElementId = null;
                  }
                }}
                class="relative group cursor-pointer outline-none"
              >
                <span
                  class="absolute -left-2 top-0 text-[8px] font-black {activePageId ===
                  page.id
                    ? 'text-indigo-400'
                    : 'text-white/10'} uppercase">P{idx + 1}</span
                >
                <div
                  class="aspect-[1/1.41] bg-white/5 rounded-xl border-2 transition-all relative overflow-hidden {activePageId ===
                  page.id
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/10'
                    : 'border-white/5 hover:border-white/20'}"
                >
                  <!-- Mini Canvas Preview (A4 ratio) -->
                  <div class="absolute inset-4 opacity-20 pointer-events-none">
                    {#each page.elements as el}
                      <div
                        class="absolute bg-white/40 rounded-sm"
                        style="left: {el.x}%; top: {el.y}%; width: {el.w /
                          2}%; height: {el.h / 4}%;"
                      ></div>
                    {/each}
                  </div>
                </div>
              </div>
            {/each}
            <button
              onclick={addPage}
              class="w-full py-4 rounded-xl border-2 border-dashed border-white/5 text-[9px] font-black uppercase text-white/20 hover:bg-white/5 hover:text-indigo-400 transition-all flex items-center justify-center gap-2"
            >
              <Plus class="w-4 h-4" />
              Add New Page
            </button>
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
        {#if showMargins}
          <div
            class="absolute inset-[20mm] border border-dashed border-indigo-500/10 pointer-events-none z-10 text-[8px] font-black text-indigo-500/30"
          >
            <span class="absolute -top-4 left-0 uppercase tracking-widest"
              >Margin (20mm)</span
            >
          </div>
        {/if}

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
            bind:activeCellId
            onSelect={() => {
              selectedElementId = el.id;
              activeCellId = null;
            }}
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
      class="w-80 border-l border-white/5 bg-[#1a1a1a] shrink-0 z-40 flex flex-col shadow-2xl {fullScreen
        ? 'hidden'
        : ''}"
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
                      for="prop-{field.id}"
                      class="text-[9px] font-black uppercase text-white/20 ml-1"
                      >{field.l} (mm)</label
                    >
                    <input
                      id="prop-{field.id}"
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
              <section class="pt-6 border-t border-white/5 space-y-6">
                <div>
                  <h3
                    class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
                  >
                    Typography
                  </h3>

                  <!-- Font Family -->
                  <div class="space-y-2 mb-4">
                    <label
                      for="font-family"
                      class="text-[9px] font-black uppercase text-white/20 ml-1"
                      >Font Family</label
                    >
                    <select
                      id="font-family"
                      bind:value={selectedElement.styles.fontFamily}
                      class="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-2.5 text-[10px] font-bold outline-none focus:border-indigo-500/50"
                    >
                      <option value="Inter, sans-serif"
                        >Sans Serif (Inter)</option
                      >
                      <option value="'Playfair Display', serif"
                        >Serif (Playfair)</option
                      >
                      <option value="'JetBrains Mono', monospace"
                        >Monospace</option
                      >
                      <option value="'Dancing Script', cursive"
                        >Handwriting</option
                      >
                    </select>
                  </div>

                  <!-- Size & Color -->
                  <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="space-y-2">
                      <label
                        for="font-size"
                        class="text-[9px] font-black uppercase text-white/20 ml-1"
                        >Size (px)</label
                      >
                      <input
                        id="font-size"
                        type="number"
                        bind:value={selectedElement.styles.fontSize}
                        class="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold"
                      />
                    </div>
                    <div class="space-y-2">
                      <label
                        for="font-color"
                        class="text-[9px] font-black uppercase text-white/20 ml-1"
                        >Color</label
                      >
                      <input
                        type="color"
                        bind:value={selectedElement.styles.color}
                        class="w-full h-8 bg-black/30 border border-white/5 rounded-xl px-1 py-1 cursor-pointer"
                      />
                    </div>
                  </div>

                  <!-- Formatting -->
                  <div class="flex gap-1 mb-6">
                    {#each [{ id: "bold", icon: Bold, action: () => (selectedElement.styles.fontWeight = selectedElement.styles.fontWeight === "bold" ? "normal" : "bold"), active: selectedElement.styles.fontWeight === "bold" }, { id: "italic", icon: Italic, action: () => (selectedElement.styles.fontStyle = selectedElement.styles.fontStyle === "italic" ? "normal" : "italic"), active: selectedElement.styles.fontStyle === "italic" }, { id: "underline", icon: UnderlineIcon, action: () => (selectedElement.styles.textDecoration = selectedElement.styles.textDecoration === "underline" ? "none" : "underline"), active: selectedElement.styles.textDecoration === "underline" }] as tool}
                      <button
                        onclick={tool.action}
                        class="flex-1 h-9 rounded-lg border transition-all flex items-center justify-center {tool.active
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-black/20 border-white/5 text-white/40 hover:text-white'}"
                      >
                        <tool.icon class="w-3.5 h-3.5" />
                      </button>
                    {/each}
                  </div>

                  <!-- Spacing -->
                  <div class="space-y-4 mb-6">
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <label
                          class="text-[9px] font-black uppercase text-white/20 ml-1"
                          >Line Height</label
                        >
                        <span class="text-[9px] font-black text-indigo-400"
                          >{selectedElement.styles.lineHeight}</span
                        >
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="3"
                        step="0.1"
                        bind:value={selectedElement.styles.lineHeight}
                        class="w-full accent-indigo-500"
                      />
                    </div>
                    <div class="space-y-2">
                      <div class="flex justify-between">
                        <label
                          class="text-[9px] font-black uppercase text-white/20 ml-1"
                          >Letter Spacing</label
                        >
                        <span class="text-[9px] font-black text-indigo-400"
                          >{selectedElement.styles.letterSpacing}px</span
                        >
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="10"
                        step="0.5"
                        bind:value={selectedElement.styles.letterSpacing}
                        class="w-full accent-indigo-500"
                      />
                    </div>
                  </div>

                  <!-- Alignment -->
                  <div class="flex gap-1">
                    {#each [{ id: "left", icon: AlignLeft }, { id: "center", icon: AlignCenter }, { id: "right", icon: AlignRight }, { id: "justify", icon: AlignJustify }] as align}
                      <button
                        onclick={() =>
                          (selectedElement.styles.textAlign = align.id)}
                        class="flex-1 h-9 rounded-lg border transition-all flex items-center justify-center {selectedElement
                          .styles.textAlign === align.id
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-black/20 border-white/5 text-white/40 hover:text-white'}"
                      >
                        <align.icon class="w-3.5 h-3.5" />
                      </button>
                    {/each}
                  </div>
                </div>
              </section>
            {/if}

            {#if selectedElement.type === "table"}
              <section class="pt-6 border-t border-white/5 space-y-6">
                <div>
                  <h3
                    class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
                  >
                    Table Controls
                  </h3>
                  <div class="grid grid-cols-2 gap-2 mb-4">
                    <button
                      onclick={() => addRow("above")}
                      class="py-2.5 px-3 bg-white/5 border border-white/5 rounded-xl text-[8px] font-black uppercase hover:bg-white/10 transition-all text-white/60 hover:text-white flex items-center justify-center gap-2"
                    >
                      <Plus class="w-2.5 h-2.5" /> Row Above
                    </button>
                    <button
                      onclick={() => addRow("below")}
                      class="py-2.5 px-3 bg-white/5 border border-white/5 rounded-xl text-[8px] font-black uppercase hover:bg-white/10 transition-all text-white/60 hover:text-white flex items-center justify-center gap-2"
                    >
                      <Plus class="w-2.5 h-2.5" /> Row Below
                    </button>
                    <button
                      onclick={() => addColumn("left")}
                      class="py-2.5 px-3 bg-white/5 border border-white/5 rounded-xl text-[8px] font-black uppercase hover:bg-white/10 transition-all text-white/60 hover:text-white flex items-center justify-center gap-2"
                    >
                      <Plus class="w-2.5 h-2.5" /> Col Left
                    </button>
                    <button
                      onclick={() => addColumn("right")}
                      class="py-2.5 px-3 bg-white/5 border border-white/5 rounded-xl text-[8px] font-black uppercase hover:bg-white/10 transition-all text-white/60 hover:text-white flex items-center justify-center gap-2"
                    >
                      <Plus class="w-2.5 h-2.5" /> Col Right
                    </button>
                  </div>

                  <div class="grid grid-cols-2 gap-2 mb-6">
                    <button
                      onclick={deleteRow}
                      class="py-2.5 px-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[8px] font-black uppercase text-red-400 hover:bg-red-500/10 transition-all"
                      >Delete Row</button
                    >
                    <button
                      onclick={deleteColumn}
                      class="py-2.5 px-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[8px] font-black uppercase text-red-400 hover:bg-red-500/10 transition-all"
                      >Delete Column</button
                    >
                  </div>

                  {#if activeCellId}
                    <div
                      class="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-5"
                    >
                      <div class="flex items-center justify-between">
                        <h4
                          class="text-[8px] font-black text-indigo-400 uppercase tracking-widest"
                        >
                          Cell Properties
                        </h4>
                        <span class="text-[8px] font-mono text-white/30"
                          >{activeCellId}</span
                        >
                      </div>

                      <!-- Merge Logic (Simplified Spanning) -->
                      <div class="space-y-2">
                        <label
                          class="text-[8px] font-black uppercase text-white/20"
                          >Cell Spanning</label
                        >
                        <div class="flex gap-2">
                          <button
                            onclick={() => {
                              const cell = getActiveCell(selectedElement);
                              if (cell) cell.colSpan++;
                            }}
                            class="flex-1 py-2 bg-black/20 border border-white/5 rounded-lg text-[8px] font-black uppercase text-white/40 hover:text-white transition-all"
                            >Expand Col</button
                          >
                          <button
                            onclick={() => {
                              const cell = getActiveCell(selectedElement);
                              if (cell && cell.colSpan > 1) cell.colSpan--;
                            }}
                            class="flex-1 py-2 bg-black/20 border border-white/5 rounded-lg text-[8px] font-black uppercase text-white/40 hover:text-white transition-all"
                            >Shrink Col</button
                          >
                        </div>
                      </div>

                      <!-- Alignment -->
                      <div class="space-y-2">
                        <label
                          class="text-[8px] font-black uppercase text-white/20"
                          >Cell Alignment</label
                        >
                        <div class="flex gap-1">
                          {#each [{ id: "left", icon: AlignLeft }, { id: "center", icon: AlignCenter }, { id: "right", icon: AlignRight }, { id: "justify", icon: AlignJustify }] as align}
                            <button
                              onclick={() => {
                                const cell = getActiveCell(selectedElement);
                                if (cell) cell.styles.textAlign = align.id;
                              }}
                              class="flex-1 h-9 rounded-lg border transition-all flex items-center justify-center {getActiveCell(
                                selectedElement,
                              )?.styles?.textAlign === align.id
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-black/20 border-white/5 text-white/40 hover:text-white'}"
                            >
                              <align.icon class="w-3.5 h-3.5" />
                            </button>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/if}
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
                  onclick={saveAsComponent}
                  class="col-span-2 p-3 bg-indigo-600/10 rounded-2xl border border-indigo-600/20 text-[10px] font-black uppercase hover:bg-indigo-600/20 transition-all text-indigo-400 mb-2 flex items-center justify-center gap-2"
                >
                  <History class="w-3.5 h-3.5" /> Save as Component
                </button>
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

<!-- Onboarding Overlay -->
{#if onboardingActive}
  <div
    class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
      in:fade={{ duration: 300, delay: 100 }}
    >
      <div class="h-1 bg-indigo-600 w-full">
        <div
          class="h-full bg-indigo-400 transition-all duration-500"
          style="width: {((onboardingStep + 1) / ONBOARDING_STEPS.length) *
            100}%"
        ></div>
      </div>

      <div class="p-8">
        <div class="flex items-center gap-4 mb-6">
          <div
            class="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400"
          >
            <Info class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-sm font-black uppercase tracking-widest text-white">
              {ONBOARDING_STEPS[onboardingStep].title}
            </h3>
            <p class="text-[10px] font-bold text-white/40 uppercase">
              Step {onboardingStep + 1} of {ONBOARDING_STEPS.length}
            </p>
          </div>
        </div>

        <p class="text-xs font-medium text-white/60 leading-relaxed mb-8">
          {ONBOARDING_STEPS[onboardingStep].description}
        </p>

        <div class="flex items-center justify-between">
          <button
            onclick={() => (onboardingActive = false)}
            class="text-[9px] font-black uppercase text-white/20 hover:text-white transition-colors"
          >
            Skip Tour
          </button>

          <div class="flex gap-2">
            {#if onboardingStep > 0}
              <button
                onclick={() => onboardingStep--}
                class="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white/40 hover:bg-white/5 transition-all"
              >
                Back
              </button>
            {/if}

            <button
              onclick={() => {
                if (onboardingStep < ONBOARDING_STEPS.length - 1) {
                  onboardingStep++;
                } else {
                  onboardingActive = false;
                  onboardingStep = 0;
                }
              }}
              class="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
            >
              {onboardingStep === ONBOARDING_STEPS.length - 1
                ? "Finish"
                : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    overflow: hidden;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
