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
  // Toggle view: content is BLACK by default, click button to reveal
  let isRevealed = $state(false);

  function reportScreenshotAttempt() {
    screenshotDetected = true;
    isRevealed = false; // Hide content on screenshot attempt
    setTimeout(() => screenshotDetected = false, 5000);

    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname }
      })
    }).catch(() => {});
  }

  function toggleView() {
    isRevealed = !isRevealed;
  }

  $effect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        isBlurred = true;
        isRevealed = false; // Hide on tab switch
      } else {
        setTimeout(() => isBlurred = false, 800);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        isRevealed = false;
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 4000);
      }
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        isRevealed = false;
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 4000);
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        isRevealed = false;
        reportScreenshotAttempt();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
    }

    function detectScreenCapture() {
      if (navigator.mediaDevices) {
        const orig = (navigator.mediaDevices as any).getDisplayMedia;
        if (orig) {
          (navigator.mediaDevices as any).getDisplayMedia = function(...args: any[]) {
            reportScreenshotAttempt();
            isRevealed = false;
            isBlurred = true;
            return orig.apply(navigator.mediaDevices, args);
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
  <!-- SOLID BLACK OVERLAY — covers content unless revealed -->
  {#if enabled && !isRevealed}
    <div class="absolute inset-0 z-[60] bg-black flex items-center justify-center rounded-b-2xl">
      <div class="text-center">
        <div class="w-16 h-16 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
          </svg>
        </div>
        <p class="text-base font-black text-red-400 mb-1">PROTECTED CONTENT</p>
        <p class="text-xs text-gray-500 mb-5">Screenshots are blocked. Content is hidden by default.</p>

        <button
          onclick={toggleView}
          class="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl cursor-pointer select-none transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
          TAP TO VIEW
        </button>
        <p class="text-[10px] text-gray-600 mt-3">Tap to reveal document. It will hide on tab switch or screenshot attempt.</p>
      </div>
    </div>
  {/if}

  <!-- Screenshot detection full-screen alert -->
  {#if screenshotDetected && enabled}
    <div class="fixed inset-0 z-[200] bg-black flex items-center justify-center">
      <div class="text-center">
        <div class="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-5 animate-pulse">
          <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <p class="text-2xl font-black text-red-500">SCREENSHOT DETECTED</p>
        <p class="text-sm text-red-300 mt-3 font-bold">This incident has been logged and reported to administrators</p>
        <p class="text-xs text-gray-400 mt-2">Your identity, IP address, and timestamp have been recorded</p>
      </div>
    </div>
  {/if}

  <!-- Actual content -->
  <div class="relative z-10">
    {@render children()}
  </div>
</div>

<!-- Print protection -->
<div class="secure-print-placeholder hidden">
  <div class="flex items-center justify-center h-48 bg-black rounded-2xl">
    <div class="text-center">
      <p class="text-xl font-black text-red-500">PROTECTED CONTENT</p>
      <p class="text-sm text-red-400 mt-2">This content cannot be printed.</p>
    </div>
  </div>
</div>

<style>
  @media print {
    .secure-content {
      display: none !important;
    }
    .secure-print-placeholder {
      display: block !important;
    }
  }
</style>
