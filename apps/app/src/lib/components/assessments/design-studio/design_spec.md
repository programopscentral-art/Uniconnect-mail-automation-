# UniConnect Design Studio: System Specification

This document outlines the systemic overhaul of the Template Editor to reach a "Word + Canva + Figma" professional baseline.

## 1. UX Architecture (The Four-Zone System)

The editor will be redesigned into four distinct interactive zones:

- **Zone A: Navigation & Discovery (Left Rail)**
  - `Assets`: University-specific logo library and image uploads.
  - `Library`: Reusable "Figma-like" components (Headers, Question Blocks, Metadata Tables).
  - `Pages`: Thumbnail sidebar for multi-page document management.
- **Zone B: Dynamic Workspace (Center Canvas)**
  - High-precision A4 viewport with **"Fit to Page"** as default.
  - No horizontal scrolling; intelligent vertical paging.
  - Visual margin guides and snapping points.
- **Zone C: Contextual Manipulation (Right Panel)**
  - `Design`: Advanced Typography (Font pairing, Line height, Paragraph spacing).
  - `Table`: Word-level controls (Merge, split, resize, stroke management).
  - `Arrange`: Precision coordinates, alignment tools, and layering.
- **Zone D: Control & Context (Top Header)**
  - Clear breadcrumbs: `University > Template Name > Version (Status)`.
  - Zoom Engine: `50% | 75% | 100% | Fit Page | Fit Width`.
  - Global Actions: `Publish`, `Export PDF`, `Back to Templates`.

## 2. Component System (The Primitive Model)

Every element on the canvas will follow a unified `StudioElement` model:

### Standard Primitives:
1. **Text**: Pro-level typography support including handwriting fonts and paragraph styles.
2. **Table**: Word-level complexity with individual cell styling and structural manipulation.
3. **Image**: Linked to the Asset Library with aspect-ratio locking and replacement flow.
4. **Dynamic Block**: Placeholders that link directly to the Question Generator (e.g., "Part A Block").
5. **Section Header**: Pre-styled university-conforming headers.

## 3. Data Model (The Layout Schema V2)

```typescript
interface LayoutSchemaV2 {
  version: "2.0";
  globalStyles: {
    fontFamily: string; // Serif | Sans | Handwriting
    primaryColor: string;
    margins: number; // mm
  };
  pages: {
    id: string;
    elements: Array<StudioElement>;
  }[];
  usedAssets: string[]; // IDs of images from university library
}

type StudioElement = 
  | TextElement 
  | TableElement 
  | ImageElement 
  | ComponentInstance;

interface TableElement {
  rows: number;
  cols: number;
  cells: {
    id: string;
    content: string;
    rowSpan: number;
    colSpan: number;
    styles: CellStyles;
  }[];
  columnWidths: number[]; // Percentage or mm
}
```

## 4. Delivery Roadmap

### Stage 1: The Precision Viewport & Navigation (Current Priority)
- Implement Fullscreen "Fit to Page" viewport.
- Add Breadcrumbs and Template Status context.
- Build the "Back to Templates" and "Editing Context" UI.

### Stage 2: Typography & Asset Flow
- Integrate Google Fonts (Handwriting + Serif/Sans pairs).
- Implement File Picker + Asset Library (Per-university assets).
- Build the Image controls (Lock ratio, replace image).

### Stage 3: Word-Level Tables
- Implement insertRow/insertCol/mergeCells logic.
- Add cell-level vertical and horizontal alignment.
- Implement draggable row/column resizing.

### Stage 4: Component Library & Reuse
- "Save as Component" functionality.
- Drag-and-drop from local/global university libraries.
- Clean removal of all legacy form-based logic.

## 5. Acceptance Baseline
A "Done" state requires:
1. Creating a university header with a logo and metadata table in < 2 minutes.
2. Adding a 5x4 table, merging two cells, and styling the borders.
3. Changing the global font to "Handwriting" and seeing all text update instantly.
4. Saving, Publishing, and Generating a real assessment from the new canvas.
