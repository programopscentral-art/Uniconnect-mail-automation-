<script lang="ts">
    import { slide } from 'svelte/transition';

    let { data } = $props();

    // State
    let allConnections = $state<any[]>([]);
    let loading = $state(true);
    let selectedSheet = $state<any>(null);
    let showLinkModal = $state(false);
    let showAiPanel = $state(false);
    let syncing = $state(false);
    let analyzing = $state(false);
    let connecting = $state(false);
    let linkingSheet = $state(false);

    // Link form
    let linkUrl = $state('');
    let linkName = $state('');
    let linkError = $state('');

    // Sync data
    let syncData = $state<any>(null);
    let syncTabs = $state<string[]>([]);
    let selectedTab = $state('');
    let aiAnalysis = $state('');

    // Derived: separate linked sheets from pending (just-connected) accounts
    const sheets = $derived(allConnections.filter((s: any) => !s.spreadsheet_id.startsWith('pending_')));
    const connectedAccount = $derived(allConnections.find((s: any) => s.spreadsheet_id.startsWith('pending_')));
    const hasAccount = $derived(connectedAccount || sheets.length > 0);

    // Load sheets on mount + detect ?connected=true
    $effect(() => {
        loadSheets();
    });

    async function loadSheets() {
        loading = true;
        try {
            const res = await fetch('/api/sheets?action=list');
            const json = await res.json();
            allConnections = json.sheets || [];

            // If just connected (?connected=true in URL), auto-open link modal
            if (typeof window !== 'undefined' && window.location.search.includes('connected=true')) {
                // Clean URL
                window.history.replaceState({}, '', '/sheets');
                // Auto-open link modal after a brief delay
                setTimeout(() => { showLinkModal = true; }, 300);
            }
        } catch (e) {
            console.error('Failed to load sheets:', e);
        }
        loading = false;
    }

    async function connectGoogle() {
        connecting = true;
        try {
            const res = await fetch('/api/sheets?action=auth-url');
            const json = await res.json();
            if (json.url) {
                window.location.href = json.url;
            }
        } catch (e) {
            console.error('Failed to get auth URL:', e);
        }
        connecting = false;
    }

    async function linkSheet() {
        linkError = '';
        if (!linkUrl.trim()) {
            linkError = 'Please enter a Google Sheets URL';
            return;
        }
        if (!linkUrl.includes('docs.google.com/spreadsheets')) {
            linkError = 'Please enter a valid Google Sheets URL';
            return;
        }

        linkingSheet = true;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'link-sheet', sheetUrl: linkUrl, sheetName: linkName })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Failed to link sheet');

            showLinkModal = false;
            linkUrl = '';
            linkName = '';
            await loadSheets();
            // Auto-select the new sheet
            if (json.connection) {
                selectSheet(json.connection);
            }
        } catch (e: any) {
            linkError = e.message;
        }
        linkingSheet = false;
    }

    async function selectSheet(sheet: any) {
        selectedSheet = sheet;
        syncData = null;
        aiAnalysis = '';
        showAiPanel = false;
        // Auto-sync on select
        await syncSheet();
    }

    async function syncSheet(tab?: string) {
        if (!selectedSheet) return;
        syncing = true;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync', sheetId: selectedSheet.id, tab })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Sync failed');

            syncData = json;
            syncTabs = json.tabs || [];
            if (!selectedTab && syncTabs.length > 0) selectedTab = syncTabs[0];
        } catch (e: any) {
            console.error('Sync failed:', e);
        }
        syncing = false;
    }

    async function analyzeWithAI() {
        if (!selectedSheet) return;
        analyzing = true;
        showAiPanel = true;
        aiAnalysis = '';
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ai-analyze', sheetId: selectedSheet.id, tab: selectedTab })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Analysis failed');
            aiAnalysis = json.analysis;
        } catch (e: any) {
            aiAnalysis = `Error: ${e.message}`;
        }
        analyzing = false;
    }

    async function disconnectSheet(sheetId: string) {
        if (!confirm('Disconnect this sheet?')) return;
        try {
            await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'disconnect', sheetId })
            });
            if (selectedSheet?.id === sheetId) {
                selectedSheet = null;
                syncData = null;
            }
            await loadSheets();
        } catch (e) {
            console.error('Failed to disconnect:', e);
        }
    }

    function getEditUrl(sheetUrl: string) {
        // Keep the /edit URL so users can edit directly inside the iframe
        if (!sheetUrl) return '';
        // Ensure it ends with /edit for full editor mode
        const base = sheetUrl.replace(/\/edit.*$/, '').replace(/\/$/, '');
        return base + '/edit?rm=minimal';
    }

    function formatDate(d: string) {
        if (!d) return 'Never';
        return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function renderAnalysis(text: string): string {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^\* /gm, '<li>')
            .replace(/^- /gm, '<li>')
            .replace(/\n/g, '<br>')
            .replace(/<li>/g, '<li class="ml-4 list-disc">')
    }
</script>

<svelte:head>
    <title>Smart Sheets — UniConnect</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
            <div>
                <h1 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                    </div>
                    Smart Sheets
                </h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Open Google Sheets inside UniConnect, sync data, get AI insights</p>
            </div>
            <div class="flex gap-2">
                {#if hasAccount}
                    <button onclick={() => showLinkModal = true}
                        class="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        Add Sheet
                    </button>
                {/if}
                {#if !hasAccount}
                    <button onclick={connectGoogle} disabled={connecting}
                        class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50">
                        {#if connecting}
                            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        {:else}
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                            </svg>
                        {/if}
                        Connect Google Account
                    </button>
                {/if}
            </div>
        </div>

        <!-- Connected Account Badge -->
        {#if connectedAccount}
            <div class="mb-4 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Google Account Connected</p>
                        <p class="text-xs text-emerald-600 dark:text-emerald-400">{connectedAccount.google_email} — paste a Google Sheets URL to open it here</p>
                    </div>
                </div>
                <button onclick={() => showLinkModal = true}
                    class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all">
                    Add Sheet URL
                </button>
            </div>
        {/if}

        {#if loading}
            <div class="flex items-center justify-center py-20">
                <div class="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
            </div>
        {:else if !hasAccount}
            <!-- Empty State — No Google Account Connected -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center">
                    <svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Open Google Sheets Inside UniConnect</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                    Connect your Google account, paste any Sheet URL, and it opens right here — no more switching tabs. Edit directly, sync data to backend, and get AI insights.
                </p>
                <button onclick={connectGoogle} disabled={connecting}
                    class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2 justify-center mx-auto disabled:opacity-50">
                    {#if connecting}
                        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Connecting...
                    {:else}
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                        </svg>
                        Connect Google Account
                    {/if}
                </button>
                <div class="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2 mx-auto">
                            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </div>
                        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">Edit Inside App</p>
                        <p class="text-[10px] text-slate-500">Full Google Sheets editor, no tab switching</p>
                    </div>
                    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-2 mx-auto">
                            <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                        </div>
                        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">Sync to Backend</p>
                        <p class="text-[10px] text-slate-500">Pull data into UniConnect database</p>
                    </div>
                    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div class="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-2 mx-auto">
                            <svg class="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                            </svg>
                        </div>
                        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">AI Insights</p>
                        <p class="text-[10px] text-slate-500">Get suggestions, errors, and patterns</p>
                    </div>
                </div>
            </div>
        {:else if sheets.length === 0}
            <!-- Account connected but no sheets linked yet -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center">
                    <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                    </svg>
                </div>
                <h2 class="text-lg font-bold text-slate-900 dark:text-white mb-2">Paste a Google Sheets URL</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto text-sm">
                    Your Google account is connected. Now paste any Google Sheets URL to open it right here inside UniConnect.
                </p>
                <button onclick={() => showLinkModal = true}
                    class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2 justify-center mx-auto">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    Add Sheet URL
                </button>
            </div>
        {:else}
            <!-- Main Layout: Sheet List + Viewer + AI Panel -->
            <div class="flex gap-4" style="height: calc(100vh - {connectedAccount ? '200px' : '150px'});">
                <!-- Left: Sheet List -->
                <div class="w-60 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                    <div class="p-3 border-b border-slate-100 dark:border-slate-800">
                        <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Your Sheets</p>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 space-y-1">
                        {#each sheets as sheet}
                            <div role="button" tabindex="0" onclick={() => selectSheet(sheet)} onkeydown={(e) => { if (e.key === 'Enter') selectSheet(sheet); }}
                                class="w-full text-left p-3 rounded-xl transition-all group cursor-pointer {selectedSheet?.id === sheet.id ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'}">
                                <div class="flex items-start justify-between">
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">{sheet.sheet_name}</p>
                                        <p class="text-[10px] text-slate-400 mt-0.5">
                                            {#if sheet.last_synced_at}
                                                Synced {formatDate(sheet.last_synced_at)}
                                            {:else}
                                                Not synced yet
                                            {/if}
                                        </p>
                                    </div>
                                    <button onclick={(e) => { e.stopPropagation(); disconnectSheet(sheet.id); }}
                                        class="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-all">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    </button>
                                </div>
                                {#if sheet.status === 'ERROR'}
                                    <div class="mt-1 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 rounded text-[10px] text-red-600 dark:text-red-400">Sync Error</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <div class="p-2 border-t border-slate-100 dark:border-slate-800">
                        <button onclick={() => showLinkModal = true}
                            class="w-full p-2 rounded-xl text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all flex items-center gap-2 justify-center">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            Add Sheet
                        </button>
                    </div>
                </div>

                <!-- Center: Sheet Viewer (iframe — full Google Sheets editor) -->
                <div class="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                    {#if selectedSheet}
                        <!-- Sheet Header -->
                        <div class="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <svg class="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                    </svg>
                                </div>
                                <p class="text-sm font-bold text-slate-900 dark:text-white">{selectedSheet.sheet_name}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                {#if syncTabs.length > 1}
                                    <select bind:value={selectedTab} onchange={() => syncSheet(selectedTab)}
                                        class="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                        {#each syncTabs as tab}
                                            <option value={tab}>{tab}</option>
                                        {/each}
                                    </select>
                                {/if}
                                <button onclick={() => syncSheet(selectedTab)} disabled={syncing}
                                    class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5 disabled:opacity-50">
                                    {#if syncing}
                                        <div class="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                                    {:else}
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                        </svg>
                                    {/if}
                                    Sync
                                </button>
                                <button onclick={analyzeWithAI} disabled={analyzing || !syncData}
                                    class="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50">
                                    {#if analyzing}
                                        <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    {:else}
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                                        </svg>
                                    {/if}
                                    AI Analyze
                                </button>
                                <a href={selectedSheet.sheet_url} target="_blank" rel="noopener noreferrer"
                                    class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                    </svg>
                                    Open in Tab
                                </a>
                            </div>
                        </div>

                        <!-- Sync Info Bar -->
                        {#if syncData}
                            <div class="px-4 py-1.5 bg-emerald-50 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-900/20 flex items-center gap-4 text-xs text-emerald-700 dark:text-emerald-400">
                                <span class="font-semibold">{syncData.rowCount} rows</span>
                                <span>{syncData.headers?.length || 0} columns</span>
                                <span>Data synced to UniConnect</span>
                            </div>
                        {/if}

                        <!-- Google Sheets Editor (full edit mode in iframe) -->
                        {#if selectedSheet.sheet_url}
                            <div class="flex-1">
                                <iframe
                                    src={getEditUrl(selectedSheet.sheet_url)}
                                    title={selectedSheet.sheet_name}
                                    class="w-full h-full border-0"
                                    allow="clipboard-read; clipboard-write"
                                ></iframe>
                            </div>
                        {:else}
                            <div class="flex-1 flex items-center justify-center text-slate-400">
                                <p>No sheet URL configured</p>
                            </div>
                        {/if}
                    {:else}
                        <!-- No sheet selected -->
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-center">
                                <svg class="w-16 h-16 mx-auto text-slate-200 dark:text-slate-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                </svg>
                                <p class="text-sm font-medium text-slate-400">Select a sheet from the left to open it</p>
                                <p class="text-xs text-slate-300 mt-1">You can edit directly inside UniConnect</p>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Right: AI Panel -->
                {#if showAiPanel}
                    <div class="w-80 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col" transition:slide={{ axis: 'x', duration: 200 }}>
                        <div class="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                                    </svg>
                                </div>
                                <p class="text-xs font-bold text-slate-700 dark:text-slate-300">AI Assistant</p>
                            </div>
                            <button onclick={() => showAiPanel = false}
                                class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4">
                            {#if analyzing}
                                <div class="flex flex-col items-center justify-center py-8">
                                    <div class="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-3"></div>
                                    <p class="text-xs text-slate-500">Analyzing sheet data...</p>
                                </div>
                            {:else if aiAnalysis}
                                <div class="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                    {@html renderAnalysis(aiAnalysis)}
                                </div>
                            {:else}
                                <div class="text-center py-8">
                                    <p class="text-xs text-slate-400">Click "AI Analyze" to get insights</p>
                                </div>
                            {/if}
                        </div>
                        <div class="p-3 border-t border-slate-100 dark:border-slate-800">
                            <button onclick={analyzeWithAI} disabled={analyzing || !syncData}
                                class="w-full px-3 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl text-xs font-bold hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-2 justify-center">
                                {#if analyzing}
                                    <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Analyzing...
                                {:else}
                                    Re-analyze
                                {/if}
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<!-- Link Sheet Modal -->
{#if showLinkModal}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div class="flex items-center justify-between">
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">Open a Google Sheet</h3>
                <button onclick={() => { showLinkModal = false; linkError = ''; }}
                    class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <p class="text-sm text-slate-500 dark:text-slate-400">
                Paste the URL of any Google Sheet. It will open directly inside UniConnect for editing.
            </p>

            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Google Sheets URL *</label>
                <input type="url" bind:value={linkUrl} placeholder="https://docs.google.com/spreadsheets/d/..."
                    class="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"/>
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Display Name (optional)</label>
                <input type="text" bind:value={linkName} placeholder="Auto-detected from sheet title"
                    class="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"/>
            </div>

            {#if linkError}
                <div class="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 dark:text-red-400">{linkError}</div>
            {/if}

            <div class="flex gap-2 pt-2">
                <button onclick={() => { showLinkModal = false; linkError = ''; }}
                    class="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                    Cancel
                </button>
                <button onclick={linkSheet} disabled={linkingSheet}
                    class="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 justify-center">
                    {#if linkingSheet}
                        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Opening...
                    {:else}
                        Open Sheet
                    {/if}
                </button>
            </div>

            <p class="text-[10px] text-slate-400 text-center">
                The sheet must be accessible by your connected Google account.
            </p>
        </div>
    </div>
{/if}

<style>
    .border-3 { border-width: 3px; }
</style>
