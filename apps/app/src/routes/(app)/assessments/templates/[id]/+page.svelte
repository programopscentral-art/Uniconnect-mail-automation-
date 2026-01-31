<script lang="ts">
  import { fade } from "svelte/transition";
  import { invalidateAll } from "$app/navigation";
  import DesignStudio from "$lib/components/assessments/design-studio/DesignStudio.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let template = $state(data.template || {});
  $effect(() => {
    template = data.template || {};
  });

  let isSaving = $state(false);

  async function saveTemplate() {
    isSaving = true;
    try {
      const resp = await fetch(`/api/assessments/templates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: template.id,
          name: template.name,
          exam_type: template.exam_type,
          config: template.config,
          layout_schema: template.layout_schema,
          status: template.status,
          version: (template.version || 1) + 1,
        }),
      });

      if (resp.ok) {
        invalidateAll();
      } else {
        const err = await resp.json();
        alert(`Failed to save template: ${err.message || "Unknown error"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error saving template");
    } finally {
      isSaving = false;
    }
  }
</script>

<div in:fade={{ duration: 200 }} class="h-screen bg-[#0a0a0a]">
  <DesignStudio
    bind:template
    universityId={template.university_id}
    role={data.user?.role}
    onSave={saveTemplate}
  />
</div>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
  }
</style>
