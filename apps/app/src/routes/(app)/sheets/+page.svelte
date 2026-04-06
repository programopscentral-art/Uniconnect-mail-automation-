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

    // Rename, sharing, confirm
    let renamingSheetId = $state<string | null>(null);
    let renameValue = $state('');
    let sharingInfo = $state<any>(null);
    let showSharingFor = $state<string | null>(null);
    let showSyncConfirm = $state(false);
    let pendingSyncTab = $state<string | undefined>(undefined);
    let pendingSyncAll = $state(false);

    // Column mapping / import
    let showMappingPanel = $state(false);
    let mappingResult = $state<any>(null);
    let mappingLoading = $state(false);
    let importingTarget = $state<string | null>(null);
    let importResult = $state<any>(null);

    // Inline data editor
    let showDataEditor = $state(false);
    let editorData = $state<{ headers: string[]; rows: any[][] } | null>(null);
    let editorLoading = $state(false);
    let editorSaving = $state(false);
    let editorDirty = $state(false);
    let editorMsg = $state('');

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
                const firstTab = json.tabs?.[0];
                openSheet(json.connection, typeof firstTab === 'string' ? firstTab : firstTab?.name || '');
            }
        } catch (e: any) { linkError = e.message; }
        linkingSheet = false;
    }

    function openSheet(sheet: any, tab?: string) {
        selectedSheet = sheet;
        selectedTab = tab || getSheetTabs(sheet)[0]?.name || '';
        syncData = null;
        aiContent = '';
        showAiPanel = false;
    }

    function getSheetTabs(sheet: any): { name: string; gid: number }[] {
        if (!sheet) return [];
        let tabs: any[] = [];
        if (Array.isArray(sheet.tabs)) tabs = sheet.tabs;
        else if (typeof sheet.tabs === 'string') {
            try { tabs = JSON.parse(sheet.tabs); } catch { return []; }
        }
        // Normalize: support both old string[] format and new {name, gid}[] format
        return tabs.map((t: any) => {
            if (typeof t === 'string') return { name: t, gid: 0 };
            return { name: t.name || 'Sheet1', gid: t.gid ?? 0 };
        });
    }

    function getTabGid(sheet: any, tabName: string): number {
        const tabs = getSheetTabs(sheet);
        const found = tabs.find(t => t.name === tabName);
        return found?.gid ?? 0;
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
        if (!confirm('Are you sure you want to permanently delete this sheet from UniConnect? All synced data will be removed. This cannot be undone.')) return;
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

    async function renameSheet(sheetId: string) {
        if (!renameValue.trim()) return;
        try {
            await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename', sheetId, newName: renameValue.trim() })
            });
            renamingSheetId = null;
            renameValue = '';
            await loadSheets();
        } catch (e) { console.error('Failed to rename:', e); }
    }

    async function loadSharingInfo(sheetId: string) {
        showSharingFor = sheetId;
        sharingInfo = null;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sharing-info', sheetId })
            });
            sharingInfo = await res.json();
        } catch { sharingInfo = { error: 'Failed to load sharing info' }; }
    }

    async function loadDataForEditor() {
        if (!selectedSheet) return;
        editorLoading = true;
        editorMsg = '';
        try {
            const params = new URLSearchParams({ action: 'sync-data', sheetId: selectedSheet.id, tab: selectedTab });
            const res = await fetch(`/api/sheets?${params}`);
            const json = await res.json();
            if (json.data) {
                editorData = { headers: json.data.headers || [], rows: (json.data.rows || []).map((r: any[]) => [...r]) };
                showDataEditor = true;
                editorDirty = false;
            } else {
                editorMsg = 'No synced data. Sync first, then edit.';
            }
        } catch { editorMsg = 'Failed to load data'; }
        editorLoading = false;
    }

    function updateCell(rowIdx: number, colIdx: number, value: string) {
        if (!editorData) return;
        // Ensure row has enough columns
        while (editorData.rows[rowIdx].length <= colIdx) editorData.rows[rowIdx].push('');
        editorData.rows[rowIdx][colIdx] = value;
        editorDirty = true;
    }

    function addEditorRow() {
        if (!editorData) return;
        editorData.rows = [...editorData.rows, new Array(editorData.headers.length).fill('')];
        editorDirty = true;
    }

    function deleteEditorRow(idx: number) {
        if (!editorData) return;
        editorData.rows = editorData.rows.filter((_, i) => i !== idx);
        editorDirty = true;
    }

    async function saveEditorData() {
        if (!selectedSheet || !editorData) return;
        editorSaving = true;
        editorMsg = '';
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update-data',
                    sheetId: selectedSheet.id,
                    tab: selectedTab,
                    headers: editorData.headers,
                    rows: editorData.rows
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Save failed');
            editorDirty = false;
            editorMsg = 'Data saved to database successfully!';
            // Refresh sync data
            syncData = { ...syncData, rowCount: editorData.rows.length, headers: editorData.headers };
        } catch (e: any) { editorMsg = `Error: ${e.message}`; }
        editorSaving = false;
    }

    async function analyzeColumnsForMapping() {
        if (!selectedSheet) return;
        mappingLoading = true;
        mappingResult = null;
        importResult = null;
        showMappingPanel = true;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'analyze-columns', sheetId: selectedSheet.id, tab: selectedTab })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Analysis failed');
            mappingResult = json;
        } catch (e: any) { mappingResult = { error: e.message }; }
        mappingLoading = false;
    }

    async function importMappedData(target: string, mappings: any[]) {
        if (!selectedSheet) return;
        importingTarget = target;
        importResult = null;
        try {
            const res = await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'import-mapped',
                    sheetId: selectedSheet.id,
                    tab: selectedTab,
                    target,
                    mappings
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Import failed');
            importResult = { target, ...json };
        } catch (e: any) { importResult = { target, error: e.message }; }
        importingTarget = null;
    }

    function confirmSync(tab?: string, all = false) {
        pendingSyncTab = tab;
        pendingSyncAll = all;
        showSyncConfirm = true;
    }

    async function executeSyncAfterConfirm() {
        showSyncConfirm = false;
        if (pendingSyncAll) {
            await syncAllTabs();
        } else {
            await syncSheet(pendingSyncTab);
        }
    }

    function getEditUrl(sheetUrl: string, tab?: string) {
        if (!sheetUrl) return '';
        const base = sheetUrl.replace(/\/edit.*$/, '').replace(/\/$/, '');
        const gid = tab && selectedSheet ? getTabGid(selectedSheet, tab) : 0;
        return base + '/edit#gid=' + gid;
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
                                {#if renamingSheetId === sheet.id}
                                    <div class="px-2 py-1.5 flex items-center gap-1">
                                        <input type="text" bind:value={renameValue} class="flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-emerald-400 rounded text-slate-900 dark:text-white focus:outline-none" onkeydown={(e) => { if (e.key === 'Enter') renameSheet(sheet.id); if (e.key === 'Escape') renamingSheetId = null; }} />
                                        <button onclick={() => renameSheet(sheet.id)} class="text-emerald-500 hover:text-emerald-600 p-0.5">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                        </button>
                                        <button onclick={() => renamingSheetId = null} class="text-slate-400 hover:text-slate-500 p-0.5">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                        </button>
                                    </div>
                                {:else}
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
                                        <!-- Action buttons on hover -->
                                        <div class="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                                            <button onclick={(e) => { e.stopPropagation(); renameValue = sheet.sheet_name; renamingSheetId = sheet.id; }}
                                                class="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-all" title="Rename sheet">
                                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                            </button>
                                            <button onclick={(e) => { e.stopPropagation(); loadSharingInfo(sheet.id); }}
                                                class="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition-all" title="View sharing info">
                                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                            </button>
                                            <button onclick={(e) => { e.stopPropagation(); disconnectSheet(sheet.id); }}
                                                class="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-all" title="Delete sheet">
                                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                {/if}

                                <!-- Sub-tabs (expandable) -->
                                {#if isExpanded && tabs.length > 0}
                                    <div class="ml-5 mt-0.5 space-y-0.5" transition:slide={{ duration: 150 }}>
                                        {#each tabs as tab}
                                            <button onclick={() => { selectedTab = tab.name; openSheet(sheet, tab.name); }}
                                                class="w-full text-left px-2.5 py-1.5 rounded-md text-[11px] transition-all flex items-center gap-1.5
                                                    {selectedSheet?.id === sheet.id && selectedTab === tab.name
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold'
                                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                                                <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586"/>
                                                </svg>
                                                <span class="truncate">{tab.name}</span>
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
                                <button onclick={() => confirmSync(selectedTab)} disabled={syncing}
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
                                <button onclick={() => confirmSync(undefined, true)} disabled={syncing}
                                    class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-1 disabled:opacity-50">
                                    Sync All Tabs
                                </button>
                                <button onclick={analyzeColumnsForMapping} disabled={mappingLoading || !syncData}
                                    class="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all flex items-center gap-1 disabled:opacity-50">
                                    {#if mappingLoading}
                                        <div class="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                                    {:else}
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                                        </svg>
                                    {/if}
                                    Map & Import
                                </button>
                                <button onclick={loadDataForEditor} disabled={editorLoading}
                                    class="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all flex items-center gap-1 disabled:opacity-50">
                                    {#if editorLoading}
                                        <div class="w-3 h-3 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin"></div>
                                    {:else}
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                        </svg>
                                    {/if}
                                    Edit Data
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

                        <!-- Google Sheets iframe / Data Editor -->
                        {#if showDataEditor && editorData}
                            <div class="flex-1 flex flex-col overflow-hidden">
                                <!-- Editor toolbar -->
                                <div class="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
                                    <span class="text-[11px] font-bold text-amber-700 dark:text-amber-400">Editing: {selectedTab}</span>
                                    <span class="text-[10px] text-amber-600 dark:text-amber-500">{editorData.rows.length} rows x {editorData.headers.length} cols</span>
                                    <div class="flex-1"></div>
                                    {#if editorMsg}
                                        <span class="text-[10px] {editorMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}">{editorMsg}</span>
                                    {/if}
                                    {#if editorDirty}
                                        <span class="text-[10px] px-1.5 py-0.5 bg-amber-200 dark:bg-amber-800 rounded text-amber-800 dark:text-amber-200 font-bold">Unsaved changes</span>
                                    {/if}
                                    <button onclick={addEditorRow} class="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50">+ Add Row</button>
                                    <button onclick={saveEditorData} disabled={editorSaving || !editorDirty}
                                        class="px-2.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold disabled:opacity-50 hover:bg-emerald-700">
                                        {editorSaving ? 'Saving...' : 'Save to DB'}
                                    </button>
                                    <button onclick={() => { showDataEditor = false; editorData = null; }}
                                        class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-300">
                                        Close Editor
                                    </button>
                                </div>
                                <!-- Scrollable table -->
                                <div class="flex-1 overflow-auto">
                                    <table class="w-full text-[11px] border-collapse">
                                        <thead class="sticky top-0 z-10">
                                            <tr class="bg-slate-100 dark:bg-slate-800">
                                                <th class="px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-500 font-semibold w-8">#</th>
                                                {#each editorData.headers as header}
                                                    <th class="px-2 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-left min-w-[100px]">{header}</th>
                                                {/each}
                                                <th class="px-2 py-1.5 border border-slate-200 dark:border-slate-700 w-8"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {#each editorData.rows as row, rowIdx}
                                                <tr class="hover:bg-amber-50/50 dark:hover:bg-amber-900/10">
                                                    <td class="px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-center text-slate-400 font-mono">{rowIdx + 1}</td>
                                                    {#each editorData.headers as _, colIdx}
                                                        <td class="px-0 py-0 border border-slate-200 dark:border-slate-700">
                                                            <input type="text" value={row[colIdx] ?? ''}
                                                                oninput={(e) => updateCell(rowIdx, colIdx, (e.target as HTMLInputElement).value)}
                                                                class="w-full px-2 py-1 bg-transparent text-slate-900 dark:text-white text-[11px] border-0 focus:outline-none focus:bg-amber-50 dark:focus:bg-amber-900/20" />
                                                        </td>
                                                    {/each}
                                                    <td class="px-1 py-0.5 border border-slate-200 dark:border-slate-700 text-center">
                                                        <button onclick={() => deleteEditorRow(rowIdx)} class="text-red-400 hover:text-red-600 p-0.5" title="Delete row">
                                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            {/each}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        {:else}
                            <div class="flex-1">
                                <iframe
                                    src={getEditUrl(selectedSheet.sheet_url, selectedTab)}
                                    title={selectedSheet.sheet_name}
                                    class="w-full h-full border-0"
                                    allow="clipboard-read; clipboard-write"
                                ></iframe>
                            </div>
                        {/if}
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

<!-- Column Mapping & Import Panel -->
{#if showMappingPanel}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <!-- Header -->
            <div class="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-base font-bold text-slate-900 dark:text-white">Smart Column Recognition</h3>
                        <p class="text-[11px] text-slate-500">Auto-detects data types and maps to UniConnect features</p>
                    </div>
                </div>
                <button onclick={() => { showMappingPanel = false; mappingResult = null; importResult = null; }}
                    class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-5 space-y-4">
                {#if mappingLoading}
                    <div class="flex flex-col items-center justify-center py-12">
                        <div class="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                        <p class="text-sm text-slate-500">Analyzing column headers...</p>
                    </div>
                {:else if mappingResult?.error}
                    <div class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                        <p class="text-sm text-red-600 dark:text-red-400">{mappingResult.error}</p>
                    </div>
                {:else if mappingResult}
                    <!-- Stats bar -->
                    <div class="flex items-center gap-4 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-2">
                        <span><strong class="text-slate-700 dark:text-slate-300">{mappingResult.totalColumns}</strong> columns</span>
                        <span><strong class="text-slate-700 dark:text-slate-300">{mappingResult.totalRows}</strong> rows</span>
                        <span><strong class="text-blue-600">{mappingResult.suggestions?.length || 0}</strong> data types detected</span>
                        {#if mappingResult.unmappedHeaders?.length > 0}
                            <span><strong class="text-amber-600">{mappingResult.unmappedHeaders.length}</strong> unmapped columns</span>
                        {/if}
                    </div>

                    <!-- Import result banner -->
                    {#if importResult}
                        <div class="p-3 rounded-xl border {importResult.error ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'}">
                            {#if importResult.error}
                                <p class="text-sm text-red-600 dark:text-red-400 font-semibold">Import failed: {importResult.error}</p>
                            {:else}
                                <div class="flex items-center gap-2">
                                    <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                    </svg>
                                    <div>
                                        <p class="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                            Successfully imported {importResult.imported || importResult.stored || 0} records into {importResult.target}
                                        </p>
                                        {#if importResult.skipped > 0}
                                            <p class="text-xs text-amber-600">{importResult.skipped} rows skipped</p>
                                        {/if}
                                        {#if importResult.errors?.length > 0}
                                            <details class="mt-1">
                                                <summary class="text-xs text-red-500 cursor-pointer">{importResult.errors.length} warnings</summary>
                                                <ul class="text-xs text-red-400 mt-1 space-y-0.5">
                                                    {#each importResult.errors.slice(0, 10) as err}
                                                        <li>{err}</li>
                                                    {/each}
                                                </ul>
                                            </details>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- Suggestions -->
                    {#if mappingResult.suggestions?.length > 0}
                        <div class="space-y-3">
                            {#each mappingResult.suggestions as suggestion}
                                {@const isImporting = importingTarget === suggestion.target}
                                <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                    <!-- Suggestion header -->
                                    <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-9 h-9 rounded-lg bg-gradient-to-br {suggestion.target === 'students' ? 'from-blue-500 to-cyan-500' : suggestion.target === 'attendance' ? 'from-green-500 to-emerald-500' : suggestion.target === 'events' ? 'from-purple-500 to-violet-500' : suggestion.target === 'tasks' ? 'from-orange-500 to-amber-500' : suggestion.target === 'ops_daily' ? 'from-indigo-500 to-blue-500' : suggestion.target === 'budget' ? 'from-yellow-500 to-orange-500' : 'from-slate-500 to-slate-600'} flex items-center justify-center shadow-sm">
                                                <svg class="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={suggestion.icon}/>
                                                </svg>
                                            </div>
                                            <div>
                                                <div class="flex items-center gap-2">
                                                    <h4 class="text-sm font-bold text-slate-900 dark:text-white">{suggestion.label}</h4>
                                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold
                                                        {suggestion.confidence >= 0.7 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                                         suggestion.confidence >= 0.4 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                         'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}">
                                                        {Math.round(suggestion.confidence * 100)}% match
                                                    </span>
                                                </div>
                                                <p class="text-[11px] text-slate-500">{suggestion.description}</p>
                                            </div>
                                        </div>
                                        <button
                                            onclick={() => importMappedData(suggestion.target, suggestion.matchedColumns)}
                                            disabled={!suggestion.canImport || isImporting}
                                            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5
                                                {suggestion.canImport
                                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:shadow-md disabled:opacity-50'
                                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}">
                                            {#if isImporting}
                                                <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                Importing...
                                            {:else if !suggestion.canImport}
                                                Missing required fields
                                            {:else}
                                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                                </svg>
                                                Import to {suggestion.label}
                                            {/if}
                                        </button>
                                    </div>

                                    <!-- Column mappings -->
                                    <div class="px-4 py-2.5">
                                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Column Mappings</p>
                                        <div class="grid grid-cols-2 gap-1.5">
                                            {#each suggestion.matchedColumns as col}
                                                <div class="flex items-center gap-2 px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                                    <span class="text-[11px] text-slate-500 truncate flex-1" title={col.sheetHeader}>{col.sheetHeader}</span>
                                                    <svg class="w-3 h-3 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                                                    </svg>
                                                    <span class="text-[11px] font-semibold truncate flex-1 {col.required ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}" title={col.targetField}>
                                                        {col.targetField}{#if col.required}<span class="text-red-400">*</span>{/if}
                                                    </span>
                                                    <span class="text-[9px] px-1 py-0.5 rounded {col.confidence >= 0.8 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}">{Math.round(col.confidence * 100)}%</span>
                                                </div>
                                            {/each}
                                        </div>
                                        {#if suggestion.requiredMissing?.length > 0}
                                            <div class="mt-2 px-2 py-1.5 bg-red-50 dark:bg-red-900/10 rounded-lg">
                                                <p class="text-[10px] text-red-600 dark:text-red-400 font-semibold">
                                                    Missing required: {suggestion.requiredMissing.join(', ')}
                                                </p>
                                            </div>
                                        {/if}
                                        {#if suggestion.unmatchedColumns?.length > 0}
                                            <details class="mt-2">
                                                <summary class="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">{suggestion.unmatchedColumns.length} unmapped columns (stored as metadata)</summary>
                                                <div class="flex flex-wrap gap-1 mt-1">
                                                    {#each suggestion.unmatchedColumns as col}
                                                        <span class="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500">{col}</span>
                                                    {/each}
                                                </div>
                                            </details>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <!-- No patterns detected -->
                        <div class="text-center py-8">
                            <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <svg class="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                                </svg>
                            </div>
                            <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No Known Patterns Detected</h4>
                            <p class="text-xs text-slate-500 max-w-sm mx-auto">The column headers don't match any known UniConnect data types. The data is stored as-is and accessible via the inline editor and AI analysis.</p>
                        </div>
                    {/if}

                    <!-- Always-visible: Custom data note -->
                    <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                        <div class="flex items-start gap-2">
                            <svg class="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <div class="text-[11px] text-blue-700 dark:text-blue-400">
                                <p class="font-semibold mb-0.5">All data is always stored</p>
                                <p class="text-blue-600 dark:text-blue-500">Regardless of mapping, all {mappingResult.totalRows} rows and {mappingResult.totalColumns} columns are saved in UniConnect's database. Import copies data into specific features (Students, Events, Tasks) for deeper integration. Unmapped columns are preserved as flexible metadata.</p>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

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

<!-- Sync Confirmation Modal -->
{#if showSyncConfirm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl space-y-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                </div>
                <div>
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white">Confirm Data Sync</h3>
                    <p class="text-sm text-slate-500">Please verify before syncing</p>
                </div>
            </div>
            <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300 space-y-2">
                <p><strong>Before syncing, please check:</strong></p>
                <ul class="list-disc ml-4 space-y-1 text-xs">
                    <li>All data in the sheet is correct and up to date</li>
                    <li>Column headers are properly labeled</li>
                    <li>No empty or duplicate rows that shouldn't be there</li>
                    <li>Numbers, dates, and text are formatted correctly</li>
                </ul>
            </div>
            <p class="text-xs text-slate-500">
                {pendingSyncAll
                    ? `This will sync ALL tabs of "${selectedSheet?.sheet_name}" to UniConnect.`
                    : `This will sync the "${pendingSyncTab || selectedTab}" tab to UniConnect.`}
                Synced data will be stored in the database.
            </p>
            <div class="flex gap-2">
                <button onclick={() => showSyncConfirm = false}
                    class="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                    Cancel
                </button>
                <button onclick={executeSyncAfterConfirm}
                    class="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all">
                    Yes, Sync Now
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Sharing Info Modal -->
{#if showSharingFor}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-xl space-y-4">
            <div class="flex items-center justify-between">
                <h3 class="text-lg font-bold text-slate-900 dark:text-white">Sheet Sharing Info</h3>
                <button onclick={() => { showSharingFor = null; sharingInfo = null; }}
                    class="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            {#if !sharingInfo}
                <div class="flex items-center justify-center py-6">
                    <div class="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
                    <span class="ml-2 text-sm text-slate-500">Loading sharing info...</span>
                </div>
            {:else}
                {#if sharingInfo.connectedAs}
                    <div class="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-sm">
                        <p class="text-emerald-800 dark:text-emerald-300"><strong>Connected via:</strong> {sharingInfo.connectedAs}</p>
                    </div>
                {/if}
                {#if sharingInfo.permissions?.length > 0}
                    <div class="space-y-2">
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Shared With</p>
                        {#each sharingInfo.permissions as perm}
                            <div class="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-xs">
                                    {(perm.displayName || perm.emailAddress || perm.type || '?')[0].toUpperCase()}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{perm.displayName || perm.emailAddress || perm.type}</p>
                                    {#if perm.emailAddress}<p class="text-xs text-slate-500 truncate">{perm.emailAddress}</p>{/if}
                                </div>
                                <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold
                                    {perm.role === 'owner' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                     perm.role === 'writer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                     'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}">
                                    {perm.role}
                                </span>
                            </div>
                        {/each}
                    </div>
                {:else if sharingInfo.error}
                    <p class="text-sm text-slate-500">{sharingInfo.error}</p>
                {:else}
                    <p class="text-sm text-slate-500">No sharing information available. The sheet is accessed via the connected Google account.</p>
                {/if}
            {/if}
        </div>
    </div>
{/if}

<style>
    .border-3 { border-width: 3px; }
</style>
