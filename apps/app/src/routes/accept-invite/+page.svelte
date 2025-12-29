<script lang="ts">
        import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    // @ts-ignore
    let { data } = $props();
    const { invite } = data;

    // Store token in cookie when landing on this page to ensure callback can find it
    // even if the user logs in with a different email (e.g. alias)
    onMount(() => {
        if (invite?.token) {
            document.cookie = `invitation_token=${invite.token}; path=/; max-age=3600; SameSite=Lax`;
        }
    });
</script>

<svelte:head>
    <title>Accept Invitation | UniConnect</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8" in:fade>
    <div class="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-blue-200 mb-6">
            <span class="text-white text-3xl font-black">U</span>
        </div>
        <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome to UniConnect
        </h2>
        <p class="mt-2 text-sm text-slate-600">
            You've been invited to join the platform as a <span class="font-bold text-blue-600">{invite.role}</span>.
        </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div class="bg-white py-8 px-4 shadow-floating border border-slate-100 sm:rounded-[32px] sm:px-10">
            <div class="space-y-6">
                <div class="bg-blue-50/50 rounded-2xl p-6 border border-blue-100/50">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                            {invite.email[0].toUpperCase()}
                        </div>
                        <div>
                            <div class="text-sm font-bold text-slate-900">{invite.email}</div>
                            <div class="text-xs text-slate-500 uppercase tracking-widest font-medium mt-1">Invited Recipient</div>
                        </div>
                    </div>
                </div>

                <p class="text-sm text-slate-500 text-center leading-relaxed">
                    To complete your registration and claim your role, please log in with your Google account. Use the email address specified above.
                </p>

                <div>
                    <a 
                        href="/api/auth/google/start" 
                        class="w-full flex justify-center items-center gap-3 py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-blue-100 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all duration-200 transform hover:-translate-y-0.5"
                    >
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.928 4.176-1.12 1.12-2.88 2.336-6.032 2.336-4.816 0-8.624-3.888-8.624-8.712s3.808-8.712 8.624-8.712c2.608 0 4.544 1.024 5.952 2.32l2.32-2.32c-2.112-2.032-4.92-3.2-8.272-3.2-6.44 0-11.8 5.4-11.8 11.8s5.36 11.8 11.8 11.8c3.488 0 6.128-1.144 8.16-3.264 2.096-2.096 2.768-5.056 2.768-7.44 0-.704-.064-1.376-.192-2.016h-10.736z"/>
                        </svg>
                        Sign in with Google
                    </a>
                </div>

                <div class="flex items-center justify-center">
                    <span class="text-[10px] text-slate-400 font-medium uppercase tracking-[0.2em]">Secure Multi-Tenant Onboarding</span>
                </div>
            </div>
        </div>
        
        <div class="mt-8 text-center">
            <p class="text-xs text-slate-400">
                &copy; 2024 UniConnect. All rights reserved.
            </p>
        </div>
    </div>
</div>
