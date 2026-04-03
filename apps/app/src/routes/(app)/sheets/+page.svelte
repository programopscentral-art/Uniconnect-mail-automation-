<script lang="ts">
    import { slide } from 'svelte/transition';

    let { data } = $props();

    // State
    let allConnections = $state<any[]>([]);
    let loading = $state(true);
    let selectedSheet = $state<any>(null);
    let selectedTab = $state('');
    let showLinkModal = $state(false);
    let showAiPanel = $state(false);
    let syncing = $state(false);
    let analyzing = $state(false);
    let connecting = $state(false);
    let linkingSheet = $state(false);
    let expandedSheets = $state<Record<string, boolean>>({});

    // Link form
    let linkUrl = $state('');
    let linkName = $state('');
    let linkError = $state('');

    // Sync & AI
    let syncData = $state<any>(null);
    let aiContent = $state('');
    let aiMode = $state<'analyze' | 'report'>('analyze');
    let reportType = $state('summary');
    let generatingReport = $state(false);

    // Derived
    const sheets = $derived(allConnections.filter((s: any) => !s.spreadsheet_id.startsWith('pending_')));
    const connectedAccount = $derived(allConnections.find((s: any) => s.spreadsheet_id.startsWith('pending_')));
    const hasAccount = $derived(connectedAccount || sheets.length > 0);

    $effect(() => { loadSheets(); });

    async function loadSheets() {
        loading = true;
        try {
            const res = await fetch('/api/sheets?action=list');
            const json = await res.json();
            allConnections = json.sheets || [];

            if (typeof window !== 'undefined' && window.location.search.includes('connected=true')) {
                window.history.replaceState({}, '', '/sheets');
                setTimeout(() => { showLinkModal = true; }, 300);
            }

            // Auto-expand first sheet
            if (sheets.length > 0 && Object.keys(expandedSheets).length === 0) {
                expandedSheets[sheets[0].id] = true;
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
            if (json.url) window.location.href = json.url;
        } catch (e) { console.error('Failed to get auth URL:', e); }
        connecting = false;
    }

    async function linkSheet() {
        linkError = '';
        if (!linkUrl.trim()) { linkError = 'Please enter a Google Sheets URL'; return; }
        if (!linkUrl.includes('docs.google.com/spreadsheets')) { linkError = 'Please enter a valid Google Sheets URL'; return; }

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
            if (json.connection) {
                expandedSheets[json.connection.id] = true;
                openSheet(json.connection, json.tabs?.[0] || '');
            }
        } catch (e: any) { linkError = e.message; }
        linkingSheet = false;
    }

    function openSheet(sheet: any, tab?: string) {
        selectedSheet = sheet;
        selectedTab = tab || getSheetTabs(sheet)[0] || '';
        syncData = null;
        aiContent = '';
        showAiPanel = false;
        // Auto-sync when opening
        syncSheet(selectedTab);
    }

    function getSheetTabs(sheet: any): string[] {
        if (!sheet) return [];
        if (Array.isArray(sheet.tabs) && sheet.tabs.length > 0) return sheet.tabs;
        // Try parsing if it's a JSON string
        if (typeof sheet.tabs === 'string') {
            try { return JSON.parse(sheet.tabs); } catch { return []; }
        }
        return [];
    }

    function toggleExpand(sheetId: string) {
        expandedSheets[sheetId] = !expandedSheets[sheetId];
    }

    async function syncSheet(tab?: string) {
        if (!selectedSheet) return;
        syncing = true;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync', sheetId: selectedSheet.id, tab: tab || selectedTab })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Sync failed');
            syncData = json;
            // Refresh sheet list to get updated tabs
            const listRes = await fetch('/api/sheets?action=list');
            const listJson = await listRes.json();
            allConnections = listJson.sheets || [];
        } catch (e: any) { console.error('Sync failed:', e); }
        syncing = false;
    }

    async function syncAllTabs() {
        if (!selectedSheet) return;
        syncing = true;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync-all', sheetId: selectedSheet.id })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Sync failed');
            syncData = json;
            // Refresh
            const listRes = await fetch('/api/sheets?action=list');
            const listJson = await listRes.json();
            allConnections = listJson.sheets || [];
        } catch (e: any) { console.error('Sync all failed:', e); }
        syncing = false;
    }

    async function analyzeWithAI() {
        if (!selectedSheet) return;
        analyzing = true;
        showAiPanel = true;
        aiMode = 'analyze';
        aiContent = '';
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ai-analyze', sheetId: selectedSheet.id, tab: selectedTab })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Analysis failed');
            aiContent = json.analysis;
        } catch (e: any) { aiContent = `Error: ${e.message}`; }
        analyzing = false;
    }

    async function generateReport(type: string) {
        if (!selectedSheet) return;
        generatingReport = true;
        showAiPanel = true;
        aiMode = 'report';
        reportType = type;
        aiContent = '';
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ai-report', sheetId: selectedSheet.id, tab: selectedTab, reportType: type })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Report failed');
            aiContent = json.report;
        } catch (e: any) { aiContent = `Error: ${e.message}`; }
        generatingReport = false;
    }

    async function disconnectSheet(sheetId: string) {
        if (!confirm('Remove this sheet from UniConnect?')) return;
        try {
            await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'disconnect', sheetId })
            });
            if (selectedSheet?.id === sheetId) { selectedSheet = null; syncData = null; }
            await loadSheets();
        } catch (e) { console.error('Failed to disconnect:', e); }
    }

    function getEditUrl(sheetUrl: string, tab?: string) {
        if (!sheetUrl) return '';
        const base = sheetUrl.replace(/\/edit.*$/, '').replace(/\/$/, '');
        // If tab specified, add gid parameter (tab index)
        return base + '/edit';
    }

    function formatDate(d: string) {
        if (!d) return 'Never';
        return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function renderMarkdown(text: string): string {
        return text
            .replace(/^## (.*$)/gm, '<h3 class="text-sm font-bold text-slate-800 dark:text-white mt-4 mb-2">$1</h3>')
            .replace(/^### (.*$)/gm, '<h4 class="text-xs font-bold text-slate-700 dark:text-slate-200 mt-3 mb-1">$1</h4>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^\|(.+)\|$/gm, (match) => {
                const cells = match.split('|').filter(c => c.trim()).map(c => `<td class="px-2 py-1 border border-slate-200 dark:border-slate-700 text-[11px]">${c.trim()}</td>`);
                return `<tr>${cells.join('')}</tr>`;
            })
            .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table class="w-full border-collapse my-2 text-xs">${match}</table>`)
            .replace(/^[\-]{3,}$/gm, '')
            .replace(/^\* (.*$)/gm, '<li class="ml-4 list-disc text-[11px] mb-0.5">$1</li>')
            .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-[11px] mb-0.5">$1</li>')
            .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal text-[11px] mb-0.5">$1</li>')
            .replace(/\n/g, '<br>');
    }
</script>

<svelte:head>
    <title>Smart Sheets — UniConnect</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
        <!-- Header -->
        <div class="flex items-center justify-between mb-3">
            <div>
                <h1 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg">
                        <svg class="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                    </div>
                    Smart Sheets
                </h1>
            </div>
            <div class="flex gap-2">
                {#if hasAccount}
                    <button onclick={() => showLinkModal = true}
                        class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        Add Sheet
                    </button>
                {:else}
                    <button onclick={connectGoogle} disabled={connecting}
                        class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50">
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
        {#if connectedAccount && sheets.length === 0}
            <div class="mb-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <p class="text-sm text-emerald-800 dark:text-emerald-300"><strong>Connected:</strong> {connectedAccount.google_email}</p>
                </div>
                <button onclick={() => showLinkModal = true}
                    class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all">
                    Add Sheet URL
                </button>
            </div>
        {/if}

        {#if loading}
            <div class="flex items-center justify-center py-20">
                <div class="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
            </div>
        {:else if !hasAccount}
            <!-- Empty State -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 flex items-center justify-center">
                    <svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Open Google Sheets Inside UniConnect</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                    Connect your Google account, paste any Sheet URL, and it opens right here. Edit, sync data, get AI reports.
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
            </div>
        {:else if sheets.length === 0}
            <!-- No sheets yet -->
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                <h2 class="text-lg font-bold text-slate-900 dark:text-white mb-2">Paste a Google Sheets URL</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto text-sm">Your account is connected. Add a sheet to start.</p>
                <button onclick={() => showLinkModal = true}
                    class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2 justify-center mx-auto">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    Add Sheet URL
                </button>
            </div>
        {:else}
            <!-- Main Layout -->
            <div class="flex gap-3" style="height: calc(100vh - {connectedAccount && sheets.length === 0 ? '180px' : '120px'});">
                <!-- Left: Sheet Tree with Sub-Tabs -->
                <div class="w-56 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                    <div class="p-3 border-b border-slate-100 dark:border-slate-800">
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sheets</p>
                    </div>
                    <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                        {#each sheets as sheet}
                            {@const tabs = getSheetTabs(sheet)}
                            {@const isExpanded = expandedSheets[sheet.id]}
                            <!-- Main Sheet -->
                            <div>
                                <div role="button" tabindex="0" onclick={() => { toggleExpand(sheet.id); if (!isExpanded) openSheet(sheet); }}
                                    onkeydown={(e) => { if (e.key === 'Enter') { toggleExpand(sheet.id); if (!isExpanded) openSheet(sheet); } }}
                                    class="w-full text-left px-2.5 py-2 rounded-lg transition-all group cursor-pointer flex items-center gap-2
                                        {selectedSheet?.id === sheet.id ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}">
                                    <!-- Expand arrow -->
                                    <svg class="w-3 h-3 text-slate-400 transition-transform shrink-0 {isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                    </svg>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs font-semibold text-slate-900 dark:text-white truncate">{sheet.sheet_name}</p>
                                        <p class="text-[9px] text-slate-400">{tabs.length} tab{tabs.length !== 1 ? 's' : ''} {#if sheet.last_synced_at}· {formatDate(sheet.last_synced_at)}{/if}</p>
                                    </div>
                                    <button onclick={(e) => { e.stopPropagation(); disconnectSheet(sheet.id); }}
                                        class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-all shrink-0">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    </button>
                                </div>

                                <!-- Sub-tabs (expandable) -->
                                {#if isExpanded && tabs.length > 0}
                                    <div class="ml-5 mt-0.5 space-y-0.5" transition:slide={{ duration: 150 }}>
                                        {#each tabs as tab}
                                            <button onclick={() => { selectedTab = tab; openSheet(sheet, tab); }}
                                                class="w-full text-left px-2.5 py-1.5 rounded-md text-[11px] transition-all flex items-center gap-1.5
                                                    {selectedSheet?.id === sheet.id && selectedTab === tab
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold'
                                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                                                <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586"/>
                                                </svg>
                                                <span class="truncate">{tab}</span>
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                    <div class="p-1.5 border-t border-slate-100 dark:border-slate-800">
                        <button onclick={() => showLinkModal = true}
                            class="w-full p-1.5 rounded-lg text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all flex items-center gap-1.5 justify-center">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            Add Sheet
                        </button>
                    </div>
                </div>

                <!-- Center: Google Sheets Editor -->
                <div class="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                    {#if selectedSheet}
                        <!-- Header Bar -->
                        <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <p class="text-sm font-bold text-slate-900 dark:text-white">{selectedSheet.sheet_name}</p>
                                {#if selectedTab}
                                    <span class="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500">{selectedTab}</span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-1.5">
                                <button onclick={() => syncSheet()} disabled={syncing}
                                    class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1 disabled:opacity-50">
                                    {#if syncing}
                                        <div class="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                                    {:else}
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                        </svg>
                                    {/if}
                                    Sync
                                </button>
                                <button onclick={syncAllTabs} disabled={syncing}
                                    class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1 disabled:opacity-50">
                                    Sync All Tabs
                                </button>
                                <button onclick={analyzeWithAI} disabled={analyzing || !syncData}
                                    class="px-2.5 py-1 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-[11px] font-bold text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-all flex items-center gap-1 disabled:opacity-50">
                                    {#if analyzing}
                                        <div class="w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin"></div>
                                    {:else}
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                                        </svg>
                                    {/if}
                                    Analyze
                                </button>
                                <!-- Report dropdown -->
                                <div class="relative group">
                                    <button disabled={!syncData}
                                        class="px-2.5 py-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-[11px] font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-1 disabled:opacity-50">
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                        </svg>
                                        Reports
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                        </svg>
                                    </button>
                                    <div class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl py-1 hidden group-hover:block z-10">
                                        <button onclick={() => generateReport('summary')}
                                            class="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                                            <strong>Executive Summary</strong><br><span class="text-[10px] text-slate-400">Key findings & metrics</span>
                                        </button>
                                        <button onclick={() => generateReport('comparison')}
                                            class="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                                            <strong>Comparison Report</strong><br><span class="text-[10px] text-slate-400">Side-by-side analysis</span>
                                        </button>
                                        <button onclick={() => generateReport('detailed')}
                                            class="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                                            <strong>Detailed Analysis</strong><br><span class="text-[10px] text-slate-400">Column-by-column deep dive</span>
                                        </button>
                                    </div>
                                </div>
                                <a href={selectedSheet.sheet_url} target="_blank" rel="noopener noreferrer"
                                    class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                                    </svg>
                                    Open
                                </a>
                            </div>
                        </div>

                        <!-- Sync Status -->
                        {#if syncData}
                            <div class="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-900/20 flex items-center gap-3 text-[10px] text-emerald-700 dark:text-emerald-400">
                                <span class="font-bold">{syncData.rowCount || syncData.totalTabs} {syncData.totalTabs ? 'tabs synced' : 'rows'}</span>
                                {#if syncData.headers}<span>{syncData.headers.length} columns</span>{/if}
                                <span>Data saved to UniConnect</span>
                            </div>
                        {/if}

                        <!-- Google Sheets iframe -->
                        <div class="flex-1">
                            <iframe
                                src={getEditUrl(selectedSheet.sheet_url, selectedTab)}
                                title={selectedSheet.sheet_name}
                                class="w-full h-full border-0"
                                allow="clipboard-read; clipboard-write"
                            ></iframe>
                        </div>
                    {:else}
                        <div class="flex-1 flex items-center justify-center">
                            <div class="text-center">
                                <svg class="w-14 h-14 mx-auto text-slate-200 dark:text-slate-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                </svg>
                                <p class="text-sm font-medium text-slate-400">Select a sheet or tab to open</p>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Right: AI Panel -->
                {#if showAiPanel}
                    <div class="w-80 shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col" transition:slide={{ axis: 'x', duration: 200 }}>
                        <div class="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                                    </svg>
                                </div>
                                <p class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {aiMode === 'report' ? `AI Report — ${reportType === 'summary' ? 'Executive Summary' : reportType === 'comparison' ? 'Comparison' : 'Detailed'}` : 'AI Analysis'}
                                </p>
                            </div>
                            <button onclick={() => showAiPanel = false}
                                class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4">
                            {#if analyzing || generatingReport}
                                <div class="flex flex-col items-center justify-center py-8">
                                    <div class="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-3"></div>
                                    <p class="text-xs text-slate-500">{generatingReport ? 'Generating report...' : 'Analyzing data...'}</p>
                                </div>
                            {:else if aiContent}
                                <div class="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                    {@html renderMarkdown(aiContent)}
                                </div>
                            {:else}
                                <div class="text-center py-8">
                                    <p class="text-xs text-slate-400">Click Analyze or Reports to get AI insights</p>
                                </div>
                            {/if}
                        </div>
                        {#if aiContent && !analyzing && !generatingReport}
                            <div class="p-2 border-t border-slate-100 dark:border-slate-800 flex gap-1.5">
                                <button onclick={analyzeWithAI}
                                    class="flex-1 px-2 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-lg text-[10px] font-bold hover:bg-violet-200 transition-all">
                                    Re-analyze
                                </button>
                                <button onclick={() => generateReport('summary')}
                                    class="flex-1 px-2 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-[10px] font-bold hover:shadow-md transition-all">
                                    Summary
                                </button>
                                <button onclick={() => generateReport('detailed')}
                                    class="flex-1 px-2 py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg text-[10px] font-bold hover:shadow-md transition-all">
                                    Detailed
                                </button>
                            </div>
                        {/if}
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
            <p class="text-sm text-slate-500">Paste the URL of any Google Sheet. It will open inside UniConnect with all its tabs visible in the sidebar.</p>
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
        </div>
    </div>
{/if}

<style>
    .border-3 { border-width: 3px; }
</style>
