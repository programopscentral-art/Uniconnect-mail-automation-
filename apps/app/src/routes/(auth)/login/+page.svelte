<script>
  import { fade, fly } from 'svelte/transition';
</script>

<div class="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4 relative overflow-hidden">
  <!-- Decorative background elements -->
  <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-600"></div>
  <div class="absolute -top-24 -left-24 w-96 h-96 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
  <div class="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50"></div>

  <div 
    class="w-full max-w-[440px] bg-white border border-gray-100 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] p-10 relative z-10"
    in:fly={{ y: 20, duration: 800, delay: 100 }}
  >
    <div class="text-center mb-10">
      <div class="flex justify-center mb-10">
        <div class="p-5 bg-white rounded-3xl border border-gray-100 shadow-xl shadow-indigo-500/5 transition-transform hover:scale-105 active:scale-95">
           <img src="/nxtwave-logo.png" alt="NxtWave" class="h-14 object-contain">
        </div>
      </div>
     <h1 class="text-4xl font-black text-gray-900 tracking-tight mb-3">
        UniConnect
      </h1>
      <p class="text-gray-500 font-medium text-sm">Internal ProgramOps & University Portal</p>
    </div>

    <div class="space-y-6">
      <div class="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 text-sm text-indigo-700 font-semibold leading-relaxed">
        <div class="flex items-start gap-3">
            <svg class="h-5 w-5 text-indigo-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p>Access is restricted to authorized NxtWave personnel and institutional partners only.</p>
        </div>
      </div>

      <a 
        href="/api/auth/google/start"
        class="flex items-center justify-center gap-3 w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 active:scale-[0.98]"
      >
        <svg class="h-5 w-5 text-indigo-200" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
        </svg>
        <span>Sign in with Google</span>
      </a>

      <div class="relative py-2">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-100"></div></div>
          <div class="relative flex justify-center text-xs uppercase tracking-widest font-black text-gray-300 bg-white px-4">Secure Portal</div>
      </div>

      <div class="text-center text-[11px] font-bold text-gray-400">
        By continuing, you agree to the <a href="https://nxtwave.in/terms" target="_blank" class="text-indigo-400 hover:underline">Internal Usage Policy</a> and data governance guidelines.
      </div>
    </div>
  </div>

  <div class="mt-8 text-center text-gray-400 text-xs font-bold relative z-10" in:fade={{ delay: 1000 }}>
    &copy; 2025 NxtWave Disruptive Technologies Pvt. Ltd.
  </div>
</div>
