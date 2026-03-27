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
  // Hold-to-view: content is BLACK by default, only visible while holding the button
  let isHolding = $state(false);

  function reportScreenshotAttempt() {
    screenshotDetected = true;
    setTimeout(() => screenshotDetected = false, 5000);

    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname }
      })
    }).catch(() => {});
  }

  function startHold() {
    isHolding = true;
  }

  function endHold() {
    isHolding = false;
  }

  $effect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        isBlurred = true;
        isHolding = false; // Force release on tab switch
      } else {
        setTimeout(() => isBlurred = false, 800);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        isHolding = false;
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 4000);
      }
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        isHolding = false;
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 4000);
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        isHolding = false;
        reportScreenshotAttempt();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
      // Release hold on ANY meta/cmd key press (screenshot combos)
      if (e.metaKey || e.ctrlKey) {
        isHolding = false;
      }
    }

    // Release hold if mouse leaves the window entirely
    function handleMouseLeave() {
      isHolding = false;
    }

    // Release hold on any mouse up anywhere
    function handleGlobalMouseUp() {
      isHolding = false;
    }

    function detectScreenCapture() {
      if (navigator.mediaDevices) {
        const orig = (navigator.mediaDevices as any).getDisplayMedia;
        if (orig) {
          (navigator.mediaDevices as any).getDisplayMedia = function(...args: any[]) {
            reportScreenshotAttempt();
            isHolding = false;
            isBlurred = true;
            return orig.apply(navigator.mediaDevices, args);
          };
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchend', handleGlobalMouseUp);
    detectScreenCapture();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchend', handleGlobalMouseUp);
    };
  });
</script>

<div
  class="secure-content relative"
  oncontextmenu={(e) => { if (enabled) e.preventDefault(); }}
  style={enabled ? 'user-select: none; -webkit-user-select: none; -webkit-user-drag: none;' : ''}
>
  <!-- SOLID BLACK OVERLAY — always on top unless user is holding the view button -->
  {#if enabled && !isHolding}
    <div class="absolute inset-0 z-[60] bg-black flex items-center justify-center rounded-2xl">
      <div class="text-center">
        <div class="w-20 h-20 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mx-auto mb-4">
          <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
          </svg>
        </div>
        <p class="text-lg font-black text-red-400 mb-1">PROTECTED CONTENT</p>
        <p class="text-sm text-gray-400 mb-6">Screenshots are not allowed. Content is hidden by default.</p>

        <!-- Hold to view button -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="inline-flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-2xl cursor-pointer select-none transition-all active:scale-95"
          onmousedown={startHold}
          ontouchstart={startHold}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
          HOLD TO VIEW
        </div>
        <p class="text-[10px] text-gray-600 mt-3">Press and hold the button to reveal. Releasing hides content instantly.</p>
        <p class="text-[10px] text-red-400/60 mt-1">All access is monitored and logged</p>
      </div>
    </div>
  {/if}

  <!-- Screenshot detection full-screen alert -->
  {#if screenshotDetected && enabled}
    <div class="fixed inset-0 z-[200] bg-black flex items-center justify-center">
      <div class="text-center">
        <div class="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-6 animate-pulse">
          <svg class="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <p class="text-2xl font-black text-red-500">SCREENSHOT DETECTED</p>
        <p class="text-base text-red-300 mt-3 font-bold">This incident has been logged and reported to administrators</p>
        <p class="text-sm text-gray-400 mt-2">Your identity, IP address, and timestamp have been recorded</p>
      </div>
    </div>
  {/if}

  <!-- Watermark layer — visible even while holding (traces any screen recording) -->
  {#if enabled && watermarkText && isHolding}
    <div class="absolute inset-0 z-50 pointer-events-none overflow-hidden select-none" aria-hidden="true">
      <div class="wm-layer w-[300%] h-[300%] -translate-x-1/3 -translate-y-1/3">
        {#each Array(100) as _, i}
          <span class="wm-text">{watermarkText}</span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Actual content underneath -->
  <div class="relative z-10">
    {@render children()}
  </div>
</div>

<!-- Print protection -->
<div class="secure-print-placeholder hidden">
  <div class="flex items-center justify-center h-48 bg-black rounded-2xl">
    <div class="text-center">
      <p class="text-xl font-black text-red-500">PROTECTED CONTENT</p>
      <p class="text-sm text-red-400 mt-2">This content cannot be printed. This attempt has been logged.</p>
    </div>
  </div>
</div>

<style>
  .wm-layer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 20px;
    transform: rotate(-30deg);
    opacity: 0.30;
  }

  .wm-text {
    font-size: 13px;
    font-weight: 900;
    white-space: nowrap;
    color: #dc2626;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-shadow: 0 0 4px rgba(220,38,38,0.5);
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
