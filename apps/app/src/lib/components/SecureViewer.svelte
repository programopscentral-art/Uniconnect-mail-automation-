<script lang="ts">
  let { children, watermarkText = '', enabled = true, studentId = '', studentName = '' } = $props<{
    children: any;
    watermarkText?: string;
    enabled?: boolean;
    studentId?: string;
    studentName?: string;
  }>();

  let isBlurred = $state(false);
  let screenshotDetected = $state(false);

  function reportScreenshotAttempt() {
    screenshotDetected = true;
    setTimeout(() => screenshotDetected = false, 5000);

    // Fire-and-forget API call to alert admins
    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          studentId,
          studentName,
          page: window.location.pathname
        }
      })
    }).catch(() => {});
  }

  $effect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        isBlurred = true;
      } else {
        // Small delay before revealing — prevents quick alt-tab screenshot
        setTimeout(() => isBlurred = false, 500);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 3000);
      }
      // Cmd+Shift+3/4/5 (Mac screenshot)
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 3000);
      }
      // Ctrl+Shift+S (various screen capture)
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        reportScreenshotAttempt();
      }
      // Cmd+S / Ctrl+S (save page)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
      }
      // Cmd+P / Ctrl+P (print)
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
      }
      // F12 (dev tools)
      if (e.key === 'F12') {
        e.preventDefault();
      }
    }

    // Detect screen capture API / screen sharing
    function detectScreenCapture() {
      if (navigator.mediaDevices) {
        const origGetDisplayMedia = (navigator.mediaDevices as any).getDisplayMedia;
        if (origGetDisplayMedia) {
          (navigator.mediaDevices as any).getDisplayMedia = function(...args: any[]) {
            reportScreenshotAttempt();
            isBlurred = true;
            return origGetDisplayMedia.apply(navigator.mediaDevices, args);
          };
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown);
    detectScreenCapture();

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
    <div class="absolute inset-0 z-[60] bg-white dark:bg-slate-900 flex items-center justify-center rounded-2xl">
      <div class="text-center">
        <svg class="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
        <p class="text-sm font-black text-gray-500">Content hidden for security</p>
        <p class="text-xs text-gray-400 mt-1">Return to this tab to reveal</p>
      </div>
    </div>
  {/if}

  {#if screenshotDetected && enabled}
    <div class="fixed top-4 right-4 z-[100] bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-pulse">
      <p class="text-sm font-black">Screenshot attempt detected & reported to admin</p>
    </div>
  {/if}

  <!-- Heavy watermark overlay — visible in any screenshot -->
  {#if enabled && watermarkText}
    <div class="absolute inset-0 z-40 pointer-events-none overflow-hidden select-none" aria-hidden="true">
      <div class="watermark-grid w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4">
        {#each Array(40) as _, i}
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
    gap: 30px;
    transform: rotate(-25deg);
    opacity: 0.15;
  }

  .watermark-text {
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
    color: #ef4444;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-shadow: 0 0 2px rgba(239,68,68,0.3);
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
