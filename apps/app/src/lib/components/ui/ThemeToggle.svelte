<script lang="ts">
    import { onMount, flushSync } from 'svelte';
    import { fade, scale, fly } from 'svelte/transition';

    let { currentTheme = $bindable('light') } = $props<{ currentTheme: 'light' | 'dark' }>();

    function toggleTheme(e: MouseEvent) {
        // Use flushSync to ensure the UI updates immediately
        flushSync(() => {
            currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        });
        
        // Persist in cookie
        document.cookie = `theme=${currentTheme}; path=/; max-age=31536000; SameSite=Lax`;
    }

    $effect(() => {
        const root = document.documentElement;
        if (currentTheme === 'dark') {
            root.classList.add('dark');
            root.style.colorScheme = 'dark';
        } else {
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }
    });
</script>

<button
    onmousedown={toggleTheme}
    class="relative w-16 h-9 rounded-full bg-gray-100 dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 transition-all duration-500 hover:scale-105 active:scale-95 focus:outline-none group overflow-hidden shadow-inner"
    aria-label="Toggle Theme"
>
    <!-- Background Track -->
    <div class="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
    
    <!-- Moving Glow -->
    <div 
        class="absolute inset-0 transition-transform duration-700 ease-out {currentTheme === 'dark' ? 'translate-x-0' : '-translate-x-full'}"
        style="background: radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%);"
    ></div>

    <!-- Toggle Knob -->
    <div 
        class="absolute top-1 left-1 w-6 h-6 rounded-full shadow-lg transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center {currentTheme === 'dark' ? 'translate-x-7 bg-indigo-600 rotate-[360deg]' : 'bg-white rotate-0'}"
    >
        {#key currentTheme}
            <div in:scale={{ duration: 400, start: 0.5 }} out:scale={{ duration: 200, start: 1.2 }} class="flex items-center justify-center">
                {#if currentTheme === 'light'}
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                    </svg>
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                    </svg>
                {/if}
            </div>
        {/key}
    </div>

    <!-- Text Hint (Optional) -->
    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-tighter transition-opacity duration-300 {currentTheme === 'dark' ? 'opacity-0' : 'opacity-100'}">Light</span>
    <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-indigo-400 uppercase tracking-tighter transition-opacity duration-300 {currentTheme === 'dark' ? 'opacity-100' : 'opacity-0'}">Dark</span>
</button>
