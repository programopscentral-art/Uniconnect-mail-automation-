<script lang="ts">
  import { onMount } from "svelte";

  interface Cell {
    id: string;
    content: string;
    rowSpan: number;
    colSpan: number;
    styles: any;
  }

  interface Row {
    id: string;
    cells: Cell[];
  }

  let {
    element = $bindable(),
    selected = false,
    activeCellId = $bindable(),
    selectedCell = $bindable(),
  } = $props();

  if (!element.tableData) {
    // Initialize default 2x2 table if missing
    element.tableData = {
      rows: [
        {
          id: "r1",
          cells: [
            {
              id: "c1-1",
              content: "Cell 1",
              rowSpan: 1,
              colSpan: 1,
              styles: {},
            },
            {
              id: "c1-2",
              content: "Cell 2",
              rowSpan: 1,
              colSpan: 1,
              styles: {},
            },
          ],
        },
        {
          id: "r2",
          cells: [
            {
              id: "c2-1",
              content: "Cell 3",
              rowSpan: 1,
              colSpan: 1,
              styles: {},
            },
            {
              id: "c2-2",
              content: "Cell 4",
              rowSpan: 1,
              colSpan: 1,
              styles: {},
            },
          ],
        },
      ],
    };
  }

  function handleCellSelection(id: string, rowIndex: number, colIndex: number) {
    activeCellId = id;
    selectedCell = { rowIndex, colIndex };
  }

  function handleInput(e: Event, cell: Cell) {
    cell.content = (e.target as HTMLElement).innerText;
  }
</script>

<table class="w-full h-full border-collapse table-fixed bg-white">
  <tbody>
    {#each element.tableData.rows as row, rowIndex (row.id)}
      <tr class="h-auto min-h-[40px]">
        {#each row.cells as cell, colIndex (cell.id)}
          <td
            rowspan={cell.rowSpan}
            colspan={cell.colSpan}
            class="border-2 border-black p-0 relative group transition-all {activeCellId ===
            cell.id
              ? 'ring-2 ring-indigo-500 ring-inset z-10'
              : ''}"
            style="
              text-align: {cell.styles?.textAlign || 'left'};
              vertical-align: {cell.styles?.verticalAlign || 'middle'};
              background-color: {cell.styles?.bg || 'transparent'};
              font-family: {cell.styles?.fontFamily || 'inherit'};
              font-size: {cell.styles?.fontSize || 'inherit'};
              color: {cell.styles?.color || 'inherit'};
              font-weight: {cell.styles?.fontWeight || 'inherit'};
            "
            onclick={(e) => {
              e.stopPropagation();
              handleCellSelection(cell.id, rowIndex, colIndex);
            }}
          >
            <div
              contenteditable={selected ? "true" : "false"}
              class="w-full h-full outline-none p-2 focus:bg-indigo-50/10 transition-colors cursor-text min-h-[1.5em] overflow-hidden"
              oninput={(e) => {
                cell.content = (e.target as HTMLElement).innerHTML;
              }}
              onfocus={() => handleCellSelection(cell.id, rowIndex, colIndex)}
            >
              {@html cell.content || ""}
            </div>
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    user-select: none;
  }
  [contenteditable="true"] {
    user-select: text;
  }
</style>
