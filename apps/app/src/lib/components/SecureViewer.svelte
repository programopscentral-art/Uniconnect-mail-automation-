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

  // NOT reactive — plain variable to avoid re-renders
  let timerRef: ReturnType<typeof setInterval> | null = null;

  const VIEW_DURATION = 20;

  function stopTimer() {
    if (timerRef) { clearInterval(timerRef); timerRef = null; }
  }

  function reportScreenshotAttempt() {
    screenshotDetected = true;
    isRevealed = false;
    countdown = 0;
    stopTimer();
    setTimeout(() => screenshotDetected = false, 5000);

    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname }
      })
    }).catch(() => {});
  }

  function revealContent() {
    stopTimer();
    countdown = VIEW_DURATION;
    isRevealed = true;

    // Log the view
    fetch('/api/auth/screenshot-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { studentId, studentName, page: window.location.pathname, action: 'DOCUMENT_VIEW' }
      })
    }).catch(() => {});

    timerRef = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        isRevealed = false;
        countdown = 0;
        stopTimer();
      }
    }, 1000);
  }

  function hideContent() {
    isRevealed = false;
    countdown = 0;
    stopTimer();
  }

  $effect(() => {
    if (!enabled) return;

    // Only visibilitychange — NOT window.blur (blur fires on button clicks and causes instant hide)
    function handleVisibilityChange() {
      if (document.hidden) {
        hideContent();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        reportScreenshotAttempt();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyDown);
      stopTimer();
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="secure-content relative h-full"
  oncontextmenu={(e) => { if (enabled) e.preventDefault(); }}
  style={enabled ? 'user-select: none; -webkit-user-select: none; -webkit-user-drag: none;' : ''}
>
  <!-- BLACK OVERLAY — shown when content is hidden -->
  {#if enabled && !isRevealed}
    <div class="absolute inset-0 z-[60] bg-black flex items-center justify-center">
      <div class="text-center px-4">
        <div class="w-14 h-14 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mx-auto mb-3">
          <svg class="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <p class="text-sm font-black text-red-400 mb-1">PROTECTED CONTENT</p>
        <p class="text-[11px] text-gray-500 mb-4">Tap to view for {VIEW_DURATION} seconds</p>
        <button
          onclick={revealContent}
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl select-none transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
          TAP TO VIEW
        </button>
        <p class="text-[9px] text-gray-600 mt-2">All views are logged</p>
      </div>
    </div>
  {/if}

  <!-- Countdown bar when revealed -->
  {#if enabled && isRevealed && countdown > 0}
    <div class="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-3 py-1 bg-black/70 backdrop-blur-sm">
      <div class="flex items-center gap-2">
        <div class="w-20 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-red-500 rounded-full transition-all duration-1000 ease-linear" style="width: {(countdown / VIEW_DURATION) * 100}%"></div>
        </div>
        <span class="text-[9px] font-black text-red-400">{countdown}s</span>
      </div>
      <button onclick={hideContent} class="text-[9px] font-black text-gray-400 hover:text-white px-2 py-0.5 rounded transition-colors">
        HIDE
      </button>
    </div>
  {/if}

  <!-- Screenshot alert -->
  {#if screenshotDetected && enabled}
    <div class="fixed inset-0 z-[200] bg-black flex items-center justify-center">
      <div class="text-center">
        <div class="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <p class="text-xl font-black text-red-500">SCREENSHOT DETECTED</p>
        <p class="text-sm text-red-300 mt-2 font-bold">Reported to administrators</p>
      </div>
    </div>
  {/if}

  <!-- Content -->
  <div class="relative z-10 h-full">
    {@render children()}
  </div>
</div>

<div class="secure-print-placeholder hidden">
  <div class="flex items-center justify-center h-48 bg-black rounded-2xl">
    <p class="text-lg font-black text-red-500">PROTECTED CONTENT</p>
  </div>
</div>

<style>
  @media print {
    .secure-content { display: none !important; }
    .secure-print-placeholder { display: block !important; }
  }
</style>
