<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let status: 'loading' | 'success' | 'error' = 'loading';
  
  onMount(async () => {
      const token = $page.params.token;
      if (!token) {
          status = 'error';
          return;
      }

      try {
          const res = await fetch(`/api/track/ack/${token}`, { method: 'POST' });
          if (res.ok) {
              status = 'success';
          } else {
              status = 'error';
          }
      } catch {
          status = 'error';
      }
  });
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
  <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md text-center">
    {#if status === 'loading'}
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <h2 class="mt-4 text-xl font-medium text-gray-900">Confirming...</h2>
    {:else if status === 'success'}
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
        </div>
        <h2 class="mt-4 text-3xl font-extrabold text-gray-900">Thank You!</h2>
        <p class="mt-2 text-gray-600">Your response has been recorded.</p>
    {:else}
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </div>
        <h2 class="mt-4 text-xl font-bold text-gray-900">Error</h2>
        <p class="mt-2 text-gray-600">Could not record acknowledgment. The link may be invalid or expired.</p>
    {/if}
  </div>
</div>
