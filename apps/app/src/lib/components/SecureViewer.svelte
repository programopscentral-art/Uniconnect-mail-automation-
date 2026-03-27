<script lang="ts">
  let { children, watermarkText = '', enabled = true } = $props<{ children: any; watermarkText?: string; enabled?: boolean }>();

  let isBlurred = $state(false);

  $effect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      // Only blur when tab is actually hidden (not when clicking iframes/embeds)
      isBlurred = document.hidden;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Block common screenshot shortcuts
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        isBlurred = true;
        setTimeout(() => isBlurred = false, 2000);
      }
      // Cmd+Shift+3/4 (Mac screenshot)
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
        e.preventDefault();
        isBlurred = true;
        setTimeout(() => isBlurred = false, 2000);
      }
      // Ctrl+Shift+S (various screen capture)
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
      }
    }

    function handleContextMenu(e: Event) {
      e.preventDefault();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div
  class="secure-content relative"
  oncontextmenu={(e) => { if (enabled) e.preventDefault(); }}
  style={enabled ? 'user-select: none; -webkit-user-select: none; -webkit-user-drag: none;' : ''}
>
  {#if isBlurred && enabled}
    <div class="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex items-center justify-center rounded-2xl">
      <div class="text-center">
        <svg class="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p class="text-sm font-black text-gray-500">Content hidden for security</p>
        <p class="text-xs text-gray-400 mt-1">Click this window to reveal</p>
      </div>
    </div>
  {/if}

  <!-- Watermark overlay -->
  {#if enabled && watermarkText}
    <div class="absolute inset-0 z-30 pointer-events-none overflow-hidden select-none" aria-hidden="true">
      <div class="watermark-grid w-full h-full">
        {#each Array(12) as _, i}
          <span class="watermark-text">{watermarkText}</span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="relative z-10">
    {@render children()}
  </div>
</div>

<!-- Print protection placeholder -->
<div class="secure-print-placeholder hidden">
  <div class="flex items-center justify-center h-48 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300">
    <div class="text-center">
      <p class="text-lg font-black text-gray-500">PROTECTED CONTENT</p>
      <p class="text-sm text-gray-400">This content cannot be printed for security reasons.</p>
    </div>
  </div>
</div>

<style>
  .watermark-grid {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 40px;
    transform: rotate(-30deg);
    opacity: 0.06;
  }

  .watermark-text {
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
    color: currentColor;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  @media print {
    .secure-content {
      display: none !important;
    }
    .secure-print-placeholder {
      display: block !important;
    }
  }
</style>
