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

  function handleCellClick(id: string) {
    activeCellId = id;
  }

  function handleInput(e: Event, cell: Cell) {
    cell.content = (e.target as HTMLElement).innerText;
  }
</script>

<table class="w-full h-full border-collapse table-fixed bg-white">
  <tbody>
    {#each element.tableData.rows as row}
      <tr class="h-auto min-h-[40px]">
        {#each row.cells as cell}
          <td
            rowspan={cell.rowSpan}
            colspan={cell.colSpan}
            class="border-2 border-black p-2 relative group {activeCellId ===
            cell.id
              ? 'ring-2 ring-indigo-500 ring-inset'
              : ''}"
            style="
              text-align: {cell.styles.textAlign || 'left'};
              vertical-align: {cell.styles.verticalAlign || 'top'};
              background-color: {cell.styles.bg || 'transparent'};
              font-family: {cell.styles.fontFamily || 'inherit'};
              font-size: {cell.styles.fontSize || 'inherit'};
            "
            onclick={() => handleCellClick(cell.id)}
          >
            <div
              contenteditable={selected ? "true" : "false"}
              class="w-full h-full outline-none focus:bg-indigo-50/20 transition-colors cursor-text min-h-[1.5em]"
              oninput={(e) => handleInput(e, cell)}
            >
              {cell.content}
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
