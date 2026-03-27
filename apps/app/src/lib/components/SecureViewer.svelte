<script lang="ts">
  let { children, watermarkText = '', enabled = true, studentId = '', studentName = '' } = $props<{
    children: any;
    watermarkText?: string;
    enabled?: boolean;
    studentId?: string;
    studentName?: string;
  }>();

  let screenshotDetected = $state(false);
  let isRevealed = $state(false);
  let countdown = $state(0);
  let countdownTimer = $state<ReturnType<typeof setInterval> | null>(null);

  const VIEW_DURATION = 20; // seconds before auto-hide

  function reportScreenshotAttempt() {
    screenshotDetected = true;
    isRevealed = false;
    clearCountdown();
    setTimeout(() => screenshotDetected = false, 5000);

    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname }
      })
    }).catch(() => {});
  }

  function clearCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    countdown = 0;
  }

  function revealContent() {
    isRevealed = true;
    countdown = VIEW_DURATION;

    // Log the view access (every reveal = logged)
    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname, action: 'DOCUMENT_VIEW' }
      })
    }).catch(() => {});

    // Start countdown
    clearCountdown();
    countdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        isRevealed = false;
        clearCountdown();
      }
    }, 1000);
  }

  function hideContent() {
    isRevealed = false;
    clearCountdown();
  }

  $effect(() => {
    if (!enabled) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        hideContent();
      }
    }

    // Window blur = hide content (covers screenshot tools, screen recording, alt-tab)
    function handleWindowBlur() {
      if (isRevealed) {
        hideContent();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        reportScreenshotAttempt();
      }
      // Any meta/cmd key combo while content is visible = suspicious, hide immediately
      if (isRevealed && (e.metaKey || e.ctrlKey)) {
        hideContent();
        // If it's a known screenshot combo, report it
        if (e.shiftKey && ['3', '4', '5'].includes(e.key)) {
          reportScreenshotAttempt();
        }
        if (e.shiftKey && (e.key === 'S' || e.key === 's')) {
          reportScreenshotAttempt();
        }
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
            return orig.apply(navigator.mediaDevices, args);
          };
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('keydown', handleKeyDown);
    detectScreenCapture();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('keydown', handleKeyDown);
      clearCountdown();
    };
  });
</script>

<div
  class="secure-content relative h-full"
  oncontextmenu={(e) => { if (enabled) e.preventDefault(); }}
  style={enabled ? 'user-select: none; -webkit-user-select: none; -webkit-user-drag: none;' : ''}
>
  <!-- SOLID BLACK OVERLAY -->
  {#if enabled && !isRevealed}
    <div class="absolute inset-0 z-[60] bg-black flex items-center justify-center">
      <div class="text-center px-4">
        <div class="w-16 h-16 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <p class="text-base font-black text-red-400 mb-1">PROTECTED CONTENT</p>
        <p class="text-xs text-gray-500 mb-5">Document is hidden. Tap below to view for {VIEW_DURATION} seconds.</p>

        <button
          onclick={revealContent}
          class="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl select-none transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
          TAP TO VIEW
        </button>
        <p class="text-[10px] text-gray-600 mt-3">Auto-hides after {VIEW_DURATION}s. All views are logged and reported.</p>
      </div>
    </div>
  {/if}

  <!-- Countdown bar + hide button when revealed -->
  {#if enabled && isRevealed}
    <div class="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-3 py-1.5 bg-black/80 backdrop-blur-sm">
      <div class="flex items-center gap-2">
        <div class="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-red-500 rounded-full transition-all duration-1000" style="width: {(countdown / VIEW_DURATION) * 100}%"></div>
        </div>
        <span class="text-[10px] font-black text-red-400">{countdown}s</span>
      </div>
      <button onclick={hideContent} class="text-[10px] font-black text-gray-400 hover:text-white px-2 py-1 rounded transition-colors">
        HIDE
      </button>
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
  <div class="relative z-10 h-full">
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
