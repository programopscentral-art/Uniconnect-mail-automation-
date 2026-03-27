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

    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname }
      })
    }).catch(() => {});
  }

  $effect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        isBlurred = true;
      } else {
        setTimeout(() => isBlurred = false, 800);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 4000);
      }
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        isBlurred = true;
        reportScreenshotAttempt();
        setTimeout(() => isBlurred = false, 4000);
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
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
  {#if isBlurred && enabled}
    <div class="absolute inset-0 z-[60] bg-black flex items-center justify-center rounded-2xl">
      <div class="text-center">
        <svg class="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
        </svg>
        <p class="text-lg font-black text-red-400">SCREENSHOTS NOT ALLOWED</p>
        <p class="text-sm text-red-300 mt-2 font-bold">This attempt has been reported to administration</p>
        <p class="text-xs text-gray-500 mt-3">Content will reappear shortly</p>
      </div>
    </div>
  {/if}

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

  <!-- LAYER 1: Massive diagonal watermark grid — very dense -->
  {#if enabled && watermarkText}
    <div class="absolute inset-0 z-40 pointer-events-none overflow-hidden select-none" aria-hidden="true">
      <div class="wm-layer-1 w-[300%] h-[300%] -translate-x-1/3 -translate-y-1/3">
        {#each Array(120) as _, i}
          <span class="wm-text-heavy">{watermarkText}</span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- LAYER 2: Large CONFIDENTIAL stamps -->
  {#if enabled && watermarkText}
    <div class="absolute inset-0 z-41 pointer-events-none overflow-hidden select-none" aria-hidden="true">
      <div class="wm-layer-2 w-[250%] h-[250%] -translate-x-1/4 -translate-y-1/4">
        {#each Array(30) as _, i}
          <span class="wm-text-stamp">CONFIDENTIAL</span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- LAYER 3: Horizontal banding lines -->
  {#if enabled}
    <div class="absolute inset-0 z-42 pointer-events-none select-none" aria-hidden="true">
      <div class="wm-bands">
        {#each Array(20) as _, i}
          <div class="wm-band"></div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- LAYER 4: Border frame warning -->
  {#if enabled}
    <div class="absolute inset-0 z-43 pointer-events-none select-none border-[6px] border-red-500/40 rounded-2xl" aria-hidden="true">
      <div class="absolute top-0 left-0 right-0 bg-red-600/30 text-center py-1">
        <span class="text-[9px] font-black text-red-800 tracking-[0.3em] uppercase">PROTECTED DOCUMENT — UNAUTHORIZED REPRODUCTION PROHIBITED</span>
      </div>
      <div class="absolute bottom-0 left-0 right-0 bg-red-600/30 text-center py-1">
        <span class="text-[9px] font-black text-red-800 tracking-[0.3em] uppercase">PROTECTED DOCUMENT — UNAUTHORIZED REPRODUCTION PROHIBITED</span>
      </div>
    </div>
  {/if}

  <div class="relative z-10">
    {@render children()}
  </div>
</div>

<!-- Print protection placeholder -->
<div class="secure-print-placeholder hidden">
  <div class="flex items-center justify-center h-48 bg-black rounded-2xl">
    <div class="text-center">
      <p class="text-xl font-black text-red-500">PROTECTED CONTENT</p>
      <p class="text-sm text-red-400 mt-2">This content cannot be printed. This attempt has been logged.</p>
    </div>
  </div>
</div>

<style>
  /* Layer 1: Dense diagonal watermark */
  .wm-layer-1 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 15px;
    transform: rotate(-30deg);
    opacity: 0.35;
  }

  .wm-text-heavy {
    font-size: 14px;
    font-weight: 900;
    white-space: nowrap;
    color: #dc2626;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-shadow: 0 0 4px rgba(220,38,38,0.6), 0 0 8px rgba(220,38,38,0.3);
  }

  /* Layer 2: Large CONFIDENTIAL stamps */
  .wm-layer-2 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 60px;
    transform: rotate(-45deg);
    opacity: 0.25;
  }

  .wm-text-stamp {
    font-size: 32px;
    font-weight: 900;
    white-space: nowrap;
    color: #991b1b;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    text-shadow: 0 0 6px rgba(153,27,27,0.5);
    border: 3px solid rgba(153,27,27,0.4);
    padding: 4px 16px;
    border-radius: 8px;
  }

  /* Layer 3: Horizontal interference bands */
  .wm-bands {
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: space-between;
    opacity: 0.08;
  }

  .wm-band {
    height: 2px;
    background: repeating-linear-gradient(
      90deg,
      #dc2626 0px,
      #dc2626 4px,
      transparent 4px,
      transparent 8px
    );
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
