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

  // --- Initialization Logic ---
  if (!template.layout_schema) template.layout_schema = { pages: [] };
  if (
    !template.layout_schema.pages ||
    template.layout_schema.pages.length === 0
  ) {
    template.layout_schema.pages = [{ id: "p1", elements: [] }];
  }

  let layout = $state(template.layout_schema);
  let activePageId = $state("");

  // Sync layout from template prop when it loads or changes
  $effect(() => {
    if (template.layout_schema && template.layout_schema.pages) {
      // Sync layout if current local layout is effectively empty
      if (
        (layout.pages.length === 0 ||
          (layout.pages.length === 1 &&
            layout.pages[0].elements.length === 0)) &&
        template.layout_schema.pages.length > 0
      ) {
        layout = template.layout_schema;
      }
    }
  });

  // Ensure activePageId is set when layout becomes available
  $effect(() => {
    if (layout.pages.length > 0 && !activePageId) {
      activePageId = layout.pages[0].id;
    }
  });

  // Keep template sync'd with local layout state for saving
  $effect(() => {
    template.layout_schema = layout;
    template.config = template.config || [];
  });

  // Recalculate zoom when fullScreen or zoomMode changes
  $effect(() => {
    if (fullScreen !== undefined || zoomMode !== undefined) {
      autoFit();
    }
  });

  // Derived state for selection
  let selectedElementId = $state<string | null>(null);
  let activeCellId = $state<string | null>(null);

  let selectedElement = $derived(
    layout.pages
      .find((p: any) => p.id === activePageId)
      ?.elements.find((e: any) => e.id === selectedElementId) || null,
  );

  // Helper to update styles safely (ensures reactivity)
  function updateStyle(key: string, value: any) {
    if (!selectedElement) return;
    if (!selectedElement.styles) selectedElement.styles = {};
    selectedElement.styles[key] = value;
  }

  let activeTab = $state("elements"); // elements | layers | assets | pages
  let zoomLevel = $state(0.75);
  let onboardingActive = $state(false);
  let onboardingStep = $state(0);

  // Viewport calculation
  let canvasContainer = $state<HTMLElement | null>(null);
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);

  function updateViewport() {
    if (canvasContainer) {
      viewportWidth = canvasContainer.clientWidth;
      viewportHeight = canvasContainer.clientHeight;
    }
  }

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
  let universityAssets = $state<any[]>([]);
  $effect(() => {
    universityAssets = assets;
  });

  // Combine base presets with university-specific assets
  let templateAssets = $derived.by(() => {
    const images: any[] = [];
    const seenUrls = new Set();

    // Add university assets first
    universityAssets.forEach((ast: any) => {
      images.push(ast);
      seenUrls.add(ast.url);
    });

    // Add images already in the layout
    layout.pages.forEach((page: any) => {
      page.elements.forEach((el: any) => {
        if (el.type === "image" && el.src && !seenUrls.has(el.src)) {
          images.push({
            id: el.id,
            name: el.content || "Template Image",
            url: el.src,
            type: "image",
          });
          seenUrls.add(el.src);
        }
      });
    });

    return images;
  });
  let library = $derived(template.assets_json || []);
  let isUploading = $state(false);
  let zoomMode = $state<"percent" | "fit-page" | "fit-width">("fit-page");
  let isSaving = $state(false);
  let showMargins = $state(true);
  let fullScreen = $state(false);
  // --- Canvas Settings (A4 Prototype) ---
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MM_TO_PX = 3.7795275591; // 1mm = 3.77px approx at 96dpi

  let currentPageIndex = $derived(
    layout.pages.findIndex((p: { id: string }) => p.id === activePageId) === -1
      ? 0
      : layout.pages.findIndex((p: { id: string }) => p.id === activePageId),
  );
  let currentPage = $derived(layout.pages[currentPageIndex]);
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

  async function publishTemplate() {
    if (role === "OPERATOR") {
      alert(
        "Access Denied: Operators cannot publish templates. Please contact an Administrator.",
      );
      return;
    }
    if (
      !confirm(
        "Are you sure you want to publish this template version? This will make it available for assessment generation.",
      )
    )
      return;

    isSaving = true;
    try {
      const res = await fetch(`/api/assessments/templates?id=${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
      if (!res.ok) throw new Error("Failed to publish");
      const data = await res.json();
      template = data.template;
      alert("Template published successfully!");
    } catch (err) {
      console.error(err);
      alert("Error publishing template");
    } finally {
      isSaving = false;
    }
  }

  let revisions = $state<any[]>([]);
  let isLoadingRevisions = $state(false);

  async function fetchRevisions() {
    if (!template?.id) return;
    isLoadingRevisions = true;
    try {
      const res = await fetch(
        `/api/assessments/templates/${template.id}/revisions`,
      );
      if (res.ok) {
        const data = await res.json();
        revisions = data.revisions || [];
      }
    } catch (err) {
      console.error("[DESIGN_STUDIO] Revision fetch failed:", err);
    } finally {
      isLoadingRevisions = false;
    }
  }

  $effect(() => {
    if (activeTab === "history") {
      fetchRevisions();
    }
  });

  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isUploading = true;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("university_id", universityId);
      formData.append("name", file.name);
      formData.append("type", "image");

      const res = await fetch("/api/assessments/assets", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to upload");
      }
      const { asset } = await res.json();

      universityAssets = [asset, ...universityAssets];
    } catch (err) {
      console.error("[DESIGN_STUDIO] Upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      isUploading = false;
    }
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
      layout.pages[pageIndex].elements.push(newEl);
      selectedElementId = id;
      // Trigger layout update
      layout = { ...layout };
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
      selectedElement.type.toUpperCase() + " Block",
    );
    if (!name) return;

    const newComp = {
      id: `comp-${crypto.randomUUID().split("-")[0]}`,
      name,
      elements: [JSON.parse(JSON.stringify(selectedElement))],
    };

    template.assets_json = template.assets_json || [];
    template.assets_json = [...template.assets_json, newComp];
  }

  function useComponent(comp: { elements: CanvasElement[] }) {
    const pageIndex = layout.pages.findIndex(
      (p: { id: string }) => p.id === activePageId,
    );
    if (pageIndex === -1) return;

    const copies = comp.elements.map((el: CanvasElement) => {
      const copy = JSON.parse(JSON.stringify(el));
      copy.id = `el-${Math.random().toString(36).substr(2, 9)}`;
      return copy;
    });

    layout.pages[pageIndex].elements = [
      ...layout.pages[pageIndex].elements,
      ...copies,
    ];
    layout = { ...layout };
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
    const pageIndex = layout.pages.findIndex((p: any) => p.id === activePageId);
    if (pageIndex === -1) return;

    const elIndex = layout.pages[pageIndex].elements.findIndex(
      (e: any) => e.id === selectedElementId,
    );
    if (elIndex === -1) return;

    const data = JSON.parse(
      JSON.stringify(layout.pages[pageIndex].elements[elIndex].tableData),
    );

    let rowIndex = -1;
    if (activeCellId) {
      rowIndex = data.rows.findIndex((r: any) =>
        r.cells.some((c: any) => c.id === activeCellId),
      );
    }

    if (rowIndex === -1) rowIndex = data.rows.length - 1;

    const insertAt = where === "below" ? rowIndex + 1 : rowIndex;
    const numCols = data.rows[0].cells.length;
    const newRow = {
      id: `r-${crypto.randomUUID().split("-")[0]}`,
      cells: Array.from({ length: numCols }, (_, i) => ({
        id: `c-${crypto.randomUUID().split("-")[0]}`,
        content: "",
        rowSpan: 1,
        colSpan: 1,
        styles: { verticalAlign: "middle" },
      })),
    };

    data.rows.splice(insertAt, 0, newRow);
    layout.pages[pageIndex].elements[elIndex].tableData = data;
    layout = { ...layout };
    template.layout_schema = layout;
  }

  function addColumn(where: "left" | "right") {
    if (!selectedElement || selectedElement.type !== "table") return;
    const pageIndex = layout.pages.findIndex((p: any) => p.id === activePageId);
    if (pageIndex === -1) return;

    const elIndex = layout.pages[pageIndex].elements.findIndex(
      (e: any) => e.id === selectedElementId,
    );
    if (elIndex === -1) return;

    const data = JSON.parse(
      JSON.stringify(layout.pages[pageIndex].elements[elIndex].tableData),
    );

    let colIndex = -1;
    if (activeCellId) {
      data.rows.forEach((r: any) => {
        const idx = r.cells.findIndex((c: any) => c.id === activeCellId);
        if (idx !== -1) colIndex = idx;
      });
    }

    if (colIndex === -1) colIndex = data.rows[0].cells.length - 1;

    const insertAt = where === "right" ? colIndex + 1 : colIndex;
    data.rows.forEach((r: any) => {
      r.cells.splice(insertAt, 0, {
        id: `c-${crypto.randomUUID().split("-")[0]}`,
        content: "",
        rowSpan: 1,
        colSpan: 1,
        styles: { verticalAlign: "middle" },
      });
    });

    layout.pages[pageIndex].elements[elIndex].tableData = data;
    layout = { ...layout };
    template.layout_schema = layout;
  }

  function deleteRow() {
    if (!selectedElement || selectedElement.type !== "table") return;
    const pageIndex = layout.pages.findIndex((p: any) => p.id === activePageId);
    if (pageIndex === -1) return;

    const elIndex = layout.pages[pageIndex].elements.findIndex(
      (e: any) => e.id === selectedElementId,
    );
    if (elIndex === -1) return;

    const data = JSON.parse(
      JSON.stringify(layout.pages[pageIndex].elements[elIndex].tableData),
    );
    if (data.rows.length <= 1) return;

    let rowIndex = -1;
    if (activeCellId) {
      rowIndex = data.rows.findIndex((r: any) =>
        r.cells.some((c: any) => c.id === activeCellId),
      );
    }

    if (rowIndex === -1) rowIndex = data.rows.length - 1;

    data.rows.splice(rowIndex, 1);
    layout.pages[pageIndex].elements[elIndex].tableData = data;
    layout = { ...layout };
    template.layout_schema = layout;
    activeCellId = null;
  }

  function deleteColumn() {
    if (!selectedElement || selectedElement.type !== "table") return;
    const pageIndex = layout.pages.findIndex((p: any) => p.id === activePageId);
    if (pageIndex === -1) return;

    const elIndex = layout.pages[pageIndex].elements.findIndex(
      (e: any) => e.id === selectedElementId,
    );
    if (elIndex === -1) return;

    const data = JSON.parse(
      JSON.stringify(layout.pages[pageIndex].elements[elIndex].tableData),
    );
    if (data.rows[0].cells.length <= 1) return;

    let colIndex = -1;
    if (activeCellId) {
      data.rows.forEach((r: any) => {
        const idx = r.cells.findIndex((c: any) => c.id === activeCellId);
        if (idx !== -1) colIndex = idx;
      });
    }

    if (colIndex === -1) colIndex = data.rows[0].cells.length - 1;

    data.rows.forEach((r: any) => {
      r.cells.splice(colIndex, 1);
    });

    layout.pages[pageIndex].elements[elIndex].tableData = data;
    layout = { ...layout };
    template.layout_schema = layout;
    activeCellId = null;
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
    const sidebarWidth = fullScreen ? 0 : 72 + 288 + 320; // rail + nav + properties
    const viewerWidth = window.innerWidth - sidebarWidth - 100;
    const viewerHeight = window.innerHeight - 56 - 100; // header height 56px

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

  function handleKeyDown(e: KeyboardEvent) {
    // Ignore if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement).isContentEditable
    ) {
      if (e.key === "Escape") {
        (e.target as HTMLElement).blur();
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedElementId) {
        deleteElement(selectedElementId);
      }
    }

    if (e.key === "Escape") {
      selectedElementId = null;
      activeCellId = null;
    }

    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      onSave();
    }
  }

  onMount(() => {
    autoFit();
    window.addEventListener("resize", autoFit);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", autoFit);
      window.removeEventListener("keydown", handleKeyDown);
    };
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
        onchange={(e: Event) => {
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
    <button
      onclick={publishTemplate}
      disabled={isSaving}
      class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl text-[10px] font-black transition-all shadow-xl shadow-green-600/20 active:scale-95 leading-none text-white"
    >
      <Share2 class="w-3.5 h-3.5" />
      {isSaving ? "..." : "PUBLISH"}
    </button>

    <button
      onclick={() => {
        onSave();
      }}
      disabled={isSaving}
      class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-[10px] font-black transition-all shadow-xl shadow-indigo-600/20 active:scale-95 leading-none text-white"
    >
      <Save class="w-3.5 h-3.5" />
      {isSaving ? "SAVING..." : "SAVE"}
    </button>
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
        {#each ["elements", "layers", "history", "library", "assets", "pages"] as tab}
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
        {#if activeTab === "layers"}
          <div class="space-y-4">
            <h3
              class="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-4"
            >
              Layers (Bottom to Top)
            </h3>
            <div class="space-y-1">
              {#each [...currentPage.elements].reverse() as el (el.id)}
                <div
                  role="button"
                  tabindex="0"
                  class="group flex items-center gap-3 p-2 rounded-xl transition-all {selectedElementId ===
                  el.id
                    ? 'bg-indigo-500/10 border border-indigo-500/20'
                    : 'hover:bg-white/5 border border-transparent'} cursor-pointer"
                  onclick={() => {
                    selectedElementId = el.id;
                    activePageId = currentPage.id;
                  }}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      selectedElementId = el.id;
                      activePageId = currentPage.id;
                    }
                  }}
                >
                  <div
                    class="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center text-white/20"
                  >
                    {#if el.type === "text"}<Type class="w-4 h-4" />
                    {:else if el.type === "table"}<TableIcon class="w-4 h-4" />
                    {:else if el.type === "image"}<ImageIcon class="w-4 h-4" />
                    {:else}<Square class="w-4 h-4" />{/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p
                      class="text-[10px] font-bold text-white/60 truncate uppercase tracking-wider"
                    >
                      {el.type === "text"
                        ? el.content
                            ?.replace(/<[^>]*>/g, "")
                            .substring(0, 15) || "Text"
                        : el.type}
                    </p>
                  </div>
                  <div
                    class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        el.hidden = !el.hidden;
                      }}
                      class="p-1.5 hover:text-indigo-400 {el.hidden
                        ? 'text-indigo-400'
                        : 'text-white/20'}"
                    >
                      <Play class="w-3 h-3 rotate-90" />
                    </button>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        el.locked = !el.locked;
                      }}
                      class="p-1.5 hover:text-indigo-400 {el.locked
                        ? 'text-indigo-400'
                        : 'text-white/20'}"
                    >
                      <HelpCircle class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else if activeTab === "history"}
          <div class="space-y-6">
            <h3
              class="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-4"
            >
              Revision History
            </h3>
            {#if isLoadingRevisions}
              <div class="flex justify-center p-10">
                <div
                  class="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"
                ></div>
              </div>
            {:else if revisions.length === 0}
              <p class="text-[9px] font-bold text-white/20 text-center py-10">
                No revisions yet.
              </p>
            {:else}
              <div class="space-y-3">
                {#each revisions as rev}
                  <div
                    class="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group"
                  >
                    <div class="flex justify-between items-start mb-2">
                      <span
                        class="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[8px] font-black uppercase rounded"
                        >v{rev.version}</span
                      >
                      <span class="text-[8px] font-bold text-white/20 uppercase"
                        >{new Date(rev.created_at).toLocaleString()}</span
                      >
                    </div>
                    <p
                      class="text-[9px] font-medium text-white/60 leading-relaxed mb-4"
                    >
                      {rev.comment || "Automatic snapshot before update."}
                    </p>
                    <button
                      class="w-full py-2 bg-white/5 rounded-lg text-[8px] font-black uppercase text-white/40 hover:text-white hover:bg-indigo-600 transition-all text-white"
                      onclick={() => {
                        if (
                          confirm(
                            "Restore this version? Unsaved changes will be lost.",
                          )
                        ) {
                          layout = rev.layout_schema;
                          template.config = rev.config;
                        }
                      }}>Restore Version</button
                    >
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === "elements"}
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
              class="text-[9px] font-black text-white/10 uppercase tracking-[0.2em] mb-4"
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

                {#each templateAssets as asset}
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
      onpointerdown={(e: PointerEvent) => {
        if (e.button !== 0) return;
        selectedElementId = null;
        activeCellId = null;
      }}
      onwheel={(e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault();
          zoomLevel = Math.min(Math.max(0.1, zoomLevel - e.deltaY * 0.001), 3);
        }
      }}
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

        {#each currentPage.elements as el, i (el.id)}
          {#if !el.hidden}
            <ElementWrapper
              bind:this={elementRefs[el.id]}
              bind:element={layout.pages[currentPageIndex].elements[i]}
              selected={selectedElementId === el.id}
              zoom={zoomLevel}
              bind:activeCellId
              onSelect={() => {
                selectedElementId = el.id;
                activeCellId = null;
              }}
            />
          {/if}
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
                      <option value="Inter, sans-serif">Sans (Inter)</option>
                      <option value="'Playfair Display', serif"
                        >Serif (Playfair)</option
                      >
                      <option value="'JetBrains Mono', monospace"
                        >Monospace</option
                      >
                      <option value="'Dancing Script', cursive"
                        >Handwriting</option
                      >
                      <option value="'Outfit', sans-serif"
                        >Modern (Outfit)</option
                      >
                      <option value="'Cinzel', serif">Antique (Cinzel)</option>
                      <option value="'Pacifico', cursive">Pacifico</option>
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
                        id="font-color"
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
                        <span
                          class="text-[9px] font-black uppercase text-white/20 ml-1"
                          >Line Height</span
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
                        <span
                          class="text-[9px] font-black uppercase text-white/20 ml-1"
                          >Letter Spacing</span
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
                      disabled={selectedElement.tableData?.rows.length <= 1}
                      class="py-2.5 px-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[8px] font-black uppercase text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20"
                      >Delete Row</button
                    >
                    <button
                      onclick={deleteColumn}
                      disabled={selectedElement.tableData?.rows[0].cells
                        .length <= 1}
                      class="py-2.5 px-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[8px] font-black uppercase text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-20"
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

                      <!-- Vertical Alignment (Table Only) -->
                      {#if selectedElement.type === "table"}
                        <div class="space-y-2 pt-2 border-t border-white/5">
                          <span
                            class="text-[9px] font-black text-white/40 uppercase tracking-widest"
                            >Cell Alignment</span
                          >
                          <div
                            class="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl"
                          >
                            {#each ["top", "middle", "bottom"] as val}
                              <button
                                onclick={() => {
                                  if (activeCellId) {
                                    selectedElement.tableData.rows.forEach(
                                      (r: any) => {
                                        const cell = r.cells.find(
                                          (c: any) => c.id === activeCellId,
                                        );
                                        if (cell) {
                                          if (!cell.styles) cell.styles = {};
                                          cell.styles.verticalAlign = val;
                                        }
                                      },
                                    );
                                  }
                                }}
                                class="py-1.5 rounded-lg text-[9px] font-black uppercase transition-all {selectedElement.tableData?.rows.some(
                                  (r: any) =>
                                    r.cells.some(
                                      (c: any) =>
                                        c.id === activeCellId &&
                                        c.styles?.verticalAlign === val,
                                    ),
                                )
                                  ? 'bg-indigo-500 text-white'
                                  : 'hover:bg-white/5 text-white/60'}"
                              >
                                {val}
                              </button>
                            {/each}
                          </div>
                        </div>
                      {/if}
                      <!-- Merge Logic (Simplified Spanning) -->
                      <div class="space-y-2">
                        <span
                          class="text-[8px] font-black uppercase text-white/20"
                          >Cell Spanning</span
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
                        <span
                          class="text-[8px] font-black uppercase text-white/20"
                          >Cell Alignment</span
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
