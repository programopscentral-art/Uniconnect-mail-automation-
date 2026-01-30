<script lang="ts">
  import DesignStudio from "$lib/components/assessments/design-studio/DesignStudio.svelte";

  let mockTemplate = $state({
    id: "preview-id",
    name: "Semester End Examination Prototype",
    exam_type: "Semester",
    version: 1,
    layout_schema: {
      pages: [
        {
          id: "p1",
          elements: [
            {
              id: "el-1",
              type: "text",
              x: 20,
              y: 20,
              w: 170,
              h: 15,
              content: "<h1>UNIVERSITY OF TECHNOLOGY</h1>",
              styles: {},
            },
            {
              id: "el-2",
              type: "text",
              x: 20,
              y: 35,
              w: 170,
              h: 10,
              content:
                "<p style='text-align: center'>DEPARTMENT OF COMPUTER SCIENCE</p>",
              styles: {},
            },
          ],
        },
      ],
    },
  });
</script>

<DesignStudio
  bind:template={mockTemplate}
  universityId="mock-univ"
  onSave={() => alert("Saved!")}
/>
