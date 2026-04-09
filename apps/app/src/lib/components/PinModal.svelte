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
  let currentPin = $state('');
  let errorMsg = $state('');
  let loading = $state(false);
  let setupMode = $state(isSettingUp);
  let changePinMode = $state(false);
  let noAccess = $state(false);
  let pinChanged = $state(false);

  // Number challenge state
  let verifyMethod = $state<'pin' | 'email'>('pin');
  let challengeNumber = $state<number | null>(null);
  let challengeId = $state<string | null>(null);
  let challengeSent = $state(false);
  let challengePolling = $state(false);
  let pollTimer = $state<ReturnType<typeof setInterval> | null>(null);

  // Check if user has PIN on mount
  let hasCheckedPin = $state(false);

  $effect(() => {
    if (!hasCheckedPin) {
      hasCheckedPin = true;
      checkPinStatus();
    }
  });

  // Cleanup polling on destroy
  $effect(() => {
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  });

  async function checkPinStatus() {
    try {
      const res = await fetch('/api/auth/security-pin');
      if (res.ok) {
        const data = await res.json();
        if (!data.hasPinAccess) {
          noAccess = true;
          return;
        }
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

  async function handleChangePin() {
    errorMsg = '';
    if (!/^\d{6}$/.test(currentPin)) { errorMsg = 'Enter your current 6-digit PIN'; return; }
    if (!/^\d{6}$/.test(pin)) { errorMsg = 'New PIN must be exactly 6 digits'; return; }
    if (pin !== confirmPin) { errorMsg = 'New PINs do not match'; return; }
    if (pin === currentPin) { errorMsg = 'New PIN must be different from current PIN'; return; }

    loading = true;
    try {
      const res = await fetch('/api/auth/security-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, currentPin })
      });
      if (res.ok) {
        pinChanged = true;
        changePinMode = false;
        pin = ''; confirmPin = ''; currentPin = '';
        setTimeout(() => pinChanged = false, 3000);
      } else {
        const err = await res.json();
        errorMsg = err.message || 'Failed to change PIN';
      }
    } catch { errorMsg = 'Failed to change PIN'; }
    finally { loading = false; }
  }

  async function startEmailChallenge() {
    errorMsg = '';
    loading = true;
    try {
      const res = await fetch('/api/auth/number-challenge', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        challengeNumber = data.correctNumber;
        challengeId = data.challengeId;
        challengeSent = true;
        // Start polling for verification
        startPolling();
      } else {
        const err = await res.json();
        errorMsg = err.message || 'Failed to send verification email';
      }
    } catch { errorMsg = 'Failed to send verification email'; }
    finally { loading = false; }
  }

  function startPolling() {
    challengePolling = true;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/number-challenge');
        if (res.ok) {
          const data = await res.json();
          if (data.verified) {
            if (pollTimer) clearInterval(pollTimer);
            challengePolling = false;
            // Also set the PIN verification cookie so the PII/doc endpoints accept it
            await fetch('/api/auth/verify-pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ emailChallenge: true })
            });
            onVerified();
          }
        }
      } catch {}
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    setTimeout(() => {
      if (pollTimer) clearInterval(pollTimer);
      if (challengePolling) {
        challengePolling = false;
        errorMsg = 'Challenge expired. Please try again.';
        challengeSent = false;
        challengeNumber = null;
      }
    }, 300000);
  }

  function handleInput(e: Event, field: 'pin' | 'confirm' | 'current') {
    const input = e.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 6);
    if (field === 'pin') pin = value;
    else if (field === 'confirm') confirmPin = value;
    else currentPin = value;
    input.value = value;
  }
</script>

<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" transition:fade>
  <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm p-8 mx-4" in:fly={{ y: 20 }}>
    <div class="text-center mb-6">
      <div class="w-16 h-16 rounded-2xl {noAccess ? 'bg-red-50 dark:bg-red-500/20' : verifyMethod === 'email' && challengeSent ? 'bg-emerald-50 dark:bg-emerald-500/20' : 'bg-indigo-50 dark:bg-indigo-500/20'} flex items-center justify-center mx-auto mb-4">
        <svg class="w-8 h-8 {noAccess ? 'text-red-500' : verifyMethod === 'email' && challengeSent ? 'text-emerald-600' : 'text-indigo-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {#if noAccess}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
          {:else if verifyMethod === 'email' && challengeSent}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          {/if}
        </svg>
      </div>
      <h3 class="text-lg font-black text-gray-900 dark:text-white">
        {#if noAccess}
          Access Restricted
        {:else if changePinMode}
          Change PIN
        {:else if verifyMethod === 'email' && challengeSent}
          Check Your Email
        {:else}
          {setupMode ? 'Set Security PIN' : 'Verify Identity'}
        {/if}
      </h3>
      <p class="text-xs text-gray-500 mt-1">
        {#if noAccess}
          You don't have PIN access. Ask an administrator to grant you access.
        {:else if changePinMode}
          Enter your current PIN and choose a new one
        {:else if verifyMethod === 'email' && challengeSent}
          Tap the number below in the email we just sent you
        {:else if setupMode}
          Create a 6-digit PIN to protect sensitive data access
        {:else}
          Choose a verification method to continue
        {/if}
      </p>
      {#if pinChanged}
        <p class="text-xs font-bold text-emerald-500 mt-2">PIN changed successfully!</p>
      {/if}
    </div>

    {#if noAccess}
    <div class="flex justify-center">
      <button
        onclick={onCancel}
        class="px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all"
      >
        Close
      </button>
    </div>
    {:else if changePinMode}
    <!-- Change PIN View -->
    <div class="space-y-4">
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Current PIN</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" inputmode="numeric" maxlength="6" placeholder="••••••"
          value={currentPin} oninput={(e) => handleInput(e, 'current')}
          class="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 ring-indigo-500"
          autofocus />
      </div>
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">New PIN</label>
        <input type="password" inputmode="numeric" maxlength="6" placeholder="••••••"
          value={pin} oninput={(e) => handleInput(e, 'pin')}
          class="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 ring-indigo-500" />
      </div>
      <div>
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Confirm New PIN</label>
        <input type="password" inputmode="numeric" maxlength="6" placeholder="••••••"
          value={confirmPin} oninput={(e) => handleInput(e, 'confirm')}
          class="w-full px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 ring-indigo-500" />
      </div>
      {#if errorMsg}
        <p class="text-xs font-bold text-red-500 text-center">{errorMsg}</p>
      {/if}
      <div class="flex gap-3">
        <button onclick={handleChangePin}
          disabled={loading || currentPin.length !== 6 || pin.length !== 6 || confirmPin.length !== 6}
          class="flex-1 px-4 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
          {loading ? 'Changing...' : 'Change PIN'}
        </button>
        <button onclick={() => { changePinMode = false; pin = ''; confirmPin = ''; currentPin = ''; errorMsg = ''; }}
          class="px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all">
          Back
        </button>
      </div>
    </div>
    {:else if verifyMethod === 'email' && challengeSent}
    <!-- Number Challenge View -->
    <div class="space-y-4">
      <div class="flex justify-center">
        <div class="w-28 h-28 rounded-2xl bg-slate-900 dark:bg-slate-800 border-2 border-emerald-500 flex items-center justify-center">
          <span class="text-5xl font-black text-white">{challengeNumber}</span>
        </div>
      </div>
      <p class="text-center text-sm text-gray-600 dark:text-gray-400">
        Select <strong class="text-emerald-600">{challengeNumber}</strong> in the email sent to your inbox
      </p>
      {#if challengePolling}
        <div class="flex items-center justify-center gap-2 text-xs text-gray-400">
          <div class="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          Waiting for email confirmation...
        </div>
      {/if}
      {#if errorMsg}
        <p class="text-xs font-bold text-red-500 text-center">{errorMsg}</p>
      {/if}
      <div class="flex gap-3">
        <button
          onclick={startEmailChallenge}
          disabled={loading}
          class="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-slate-200 transition-all"
        >
          Resend
        </button>
        <button
          onclick={() => { if (pollTimer) clearInterval(pollTimer); challengeSent = false; verifyMethod = 'pin'; }}
          class="flex-1 px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all"
        >
          Use PIN Instead
        </button>
      </div>
      <button
        onclick={onCancel}
        class="w-full px-4 py-2 text-gray-400 text-xs font-bold hover:text-gray-600 transition-all"
      >
        Cancel
      </button>
    </div>
    {:else}
    <!-- PIN / Method Selection View -->
    <div class="space-y-4">
      {#if !setupMode}
        <!-- Method selector tabs -->
        <div class="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
          <button
            onclick={() => verifyMethod = 'pin'}
            class="flex-1 py-2 text-xs font-bold rounded-lg transition-all {verifyMethod === 'pin' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-gray-500'}"
          >
            PIN Code
          </button>
          <button
            onclick={() => verifyMethod = 'email'}
            class="flex-1 py-2 text-xs font-bold rounded-lg transition-all {verifyMethod === 'email' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-gray-500'}"
          >
            Email Verification
          </button>
        </div>
      {/if}

      {#if verifyMethod === 'pin' || setupMode}
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
            {setupMode ? 'New PIN' : 'Security PIN'}
          </label>
          <!-- svelte-ignore a11y_autofocus -->
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
            <!-- svelte-ignore a11y_label_has_associated_control -->
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
      {:else}
        <!-- Email verification method -->
        <div class="text-center py-4">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            We'll send a verification email with number options.<br>
            Select the matching number to verify your identity.
          </p>
          {#if errorMsg}
            <p class="text-xs font-bold text-red-500 mb-4">{errorMsg}</p>
          {/if}
          <div class="flex gap-3">
            <button
              onclick={startEmailChallenge}
              disabled={loading}
              class="flex-1 px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              {loading ? 'Sending...' : 'Send Verification Email'}
            </button>
            <button
              onclick={onCancel}
              class="px-4 py-3 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}

      {#if !setupMode && verifyMethod === 'pin'}
        <button onclick={() => { changePinMode = true; pin = ''; confirmPin = ''; currentPin = ''; errorMsg = ''; }}
          class="w-full text-[10px] text-indigo-500 font-bold hover:text-indigo-700 transition-colors text-center">
          Change PIN
        </button>
      {/if}
      <p class="text-[9px] text-gray-400 text-center">
        {verifyMethod === 'pin' ? 'PIN verification is cached for 5 minutes.' : 'Email verification is valid for 5 minutes.'}
      </p>
    </div>
    {/if}
  </div>
</div>
