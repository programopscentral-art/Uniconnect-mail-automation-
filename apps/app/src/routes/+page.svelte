<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/dashboard');
  });
</script>

<div class="flex items-center justify-center h-screen">
  <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
</div>
