<script lang="ts">
  import { fade } from "svelte/transition";

  let { children } = $props();
</script>

<div in:fade>
  {@render children()}
</div>
