<script lang="ts">
  import { fade, fly } from 'svelte/transition';

  let {
    onVerified,
    onCancel,
    isSettingUp = false
  } = $props<{
    onVerified: () => void;
    onCancel: () => void;
    isSettingUp?: boolean;
  }>();

  let pin = $state('');
  let confirmPin = $state('');
  let errorMsg = $state('');
  let loading = $state(false);
  let setupMode = $state(isSettingUp);

  // Check if user has PIN on mount
  let hasCheckedPin = $state(false);

  $effect(() => {
    if (!hasCheckedPin) {
      hasCheckedPin = true;
      checkPinStatus();
    }
  });

  async function checkPinStatus() {
    try {
      const res = await fetch('/api/auth/security-pin');
      if (res.ok) {
        const data = await res.json();
        setupMode = !data.hasPin;
      }
    } catch {}
  }

  async function handleSetup() {
    errorMsg = '';
    if (!/^\d{6}$/.test(pin)) { errorMsg = 'PIN must be exactly 6 digits'; return; }
    if (pin !== confirmPin) { errorMsg = 'PINs do not match'; return; }

    loading = true;
    try {
      const res = await fetch('/api/auth/security-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (res.ok) {
        // Now verify it to get the cookie
        await verifyPin(pin);
      } else {
        const err = await res.json();
        errorMsg = err.message || 'Failed to set PIN';
      }
    } catch { errorMsg = 'Failed to set PIN'; }
    finally { loading = false; }
  }

  async function handleVerify() {
    errorMsg = '';
    if (!/^\d{6}$/.test(pin)) { errorMsg = 'PIN must be exactly 6 digits'; return; }
    loading = true;
    await verifyPin(pin);
    loading = false;
  }

  async function verifyPin(pinValue: string) {
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue })
      });
      if (res.ok) {
        onVerified();
      } else {
        const err = await res.json();
        errorMsg = err.message || 'Incorrect PIN';
        pin = '';
      }
    } catch { errorMsg = 'Verification failed'; }
  }

  function handleInput(e: Event, field: 'pin' | 'confirm') {
    const input = e.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 6);
    if (field === 'pin') pin = value;
    else confirmPin = value;
    input.value = value;
  }
</script>

<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" transition:fade>
  <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm p-8 mx-4" in:fly={{ y: 20 }}>
    <div class="text-center mb-6">
      <div class="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
      </div>
      <h3 class="text-lg font-black text-gray-900 dark:text-white">
        {setupMode ? 'Set Security PIN' : 'Verify Identity'}
      </h3>
      <p class="text-xs text-gray-500 mt-1">
        {setupMode
          ? 'Create a 6-digit PIN to protect sensitive data access'
          : 'Enter your 6-digit security PIN to continue'}
      </p>
    </div>

    <div class="space-y-4">
      <div>
        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
          {setupMode ? 'New PIN' : 'Security PIN'}
        </label>
        <input
          type="password"
          inputmode="numeric"
          maxlength="6"
          placeholder="••••••"
          value={pin}
          oninput={(e) => handleInput(e, 'pin')}
          class="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 ring-indigo-500"
          autofocus
        />
      </div>

      {#if setupMode}
        <div>
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Confirm PIN</label>
          <input
            type="password"
            inputmode="numeric"
            maxlength="6"
            placeholder="••••••"
            value={confirmPin}
            oninput={(e) => handleInput(e, 'confirm')}
            class="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 ring-indigo-500"
          />
        </div>
      {/if}

      {#if errorMsg}
        <p class="text-xs font-bold text-red-500 text-center">{errorMsg}</p>
      {/if}

      <div class="flex gap-3">
        <button
          onclick={setupMode ? handleSetup : handleVerify}
          disabled={loading || pin.length !== 6 || (setupMode && confirmPin.length !== 6)}
          class="flex-1 px-4 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {loading ? 'Verifying...' : setupMode ? 'Set PIN & Continue' : 'Verify'}
        </button>
        <button
          onclick={onCancel}
          class="px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all"
        >
          Cancel
        </button>
      </div>

      <p class="text-[9px] text-gray-400 text-center">
        PIN verification is cached for 5 minutes. You won't need to re-enter it for subsequent requests.
      </p>
    </div>
  </div>
</div>
