<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, scale } from 'svelte/transition';

    let { currentTheme = $bindable('light') } = $props<{ currentTheme: 'light' | 'dark' }>();

    function toggleTheme() {
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        currentTheme = newTheme;
        
        // Apply class to document
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Persist in cookie
        document.cookie = `theme=${newTheme}; path=/; max-age=31536000`; // 1 year
    }
</script>

<button
    onclick={toggleTheme}
    class="relative w-14 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all duration-500 hover:ring-4 hover:ring-indigo-500/10 focus:outline-none group overflow-hidden"
    aria-label="Toggle Theme"
>
    <!-- Background Gradient -->
    <div class="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

    <!-- Toggle Knob -->
    <div 
        class="absolute top-1 left-1 w-6 h-6 rounded-full bg-white dark:bg-indigo-600 shadow-sm transition-all duration-500 flex items-center justify-center {currentTheme === 'dark' ? 'translate-x-6 rotate-[360deg]' : ''}"
    >
        {#if currentTheme === 'light'}
            <div in:scale={{ duration: 300 }} out:scale={{ duration: 300 }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
            </div>
        {:else}
            <div in:scale={{ duration: 300 }} out:scale={{ duration: 300 }}>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-indigo-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
            </div>
        {/if}
    </div>
</button>
