<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { fade, fly, slide } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation';

    let { data } = $props();

    let showAddBatch = $state(false);
    let showAddBranch = $state(false);
    let newBatchName = $state('');
    let newBranchName = $state('');
    let newBranchCode = $state('');

    let selectedBatchId = $state<string | null>(null);
    let selectedBranchId = $state<string | null>(null);
    let branches = $state<any[]>([]);
    let isLoadingBranches = $state(false);
    let subjects = $state<any[]>([]);
    let isLoadingSubjects = $state(false);
    let showAddSubject = $state(false);
    let newSubjectName = $state('');
    let newSubjectCode = $state('');
    let newSubjectSemester = $state(1);
    
    // Edit States
    let showEditBatch = $state(false);
    let editingBatch = $state<any>(null);
    let isSavingBatch = $state(false);

    let showEditBranch = $state(false);
    let editingBranch = $state<any>(null);
    let isSavingBranch = $state(false);

    let showEditSubject = $state(false);
    let editingSubject = $state<any>(null);
    let isSavingSubject = $state(false);

    // Bulk Deletion state
    let selectedSubjectIds = $state<string[]>([]);
    let isDeletingBulk = $state(false);

    // Universal Sync state
    let showSyncModal = $state(false);
    let syncSourceSubjectId = $state('');
    let syncTargetBatchName = $state('');
    let syncTargetUniIds = $state<string[]>([]);
    let isSyncing = $state(false);
    let syncSearchQuery = $state('');

    let activeUniversity = $derived(data.universities?.find(u => u.id === data.selectedUniversityId) || data.universities?.[0]);

    // Derived sync data
    let filteredSyncUnis = $derived(
        data.universities?.filter(u => u.id !== activeUniversity?.id) || []
    );
    let allSubjectsList = $derived(
        subjects // For now, allow picking from current branch. We can expand to search all if needed.
    );

    let activeBatch = $derived(data.batches?.find(b => b.id === selectedBatchId));

    async function loadBranches(batchId: string) {
        isLoadingBranches = true;
        try {
            const res = await fetch(`/api/assessments/branches?universityId=${activeUniversity?.id}&batchId=${batchId}`);
            if (res.ok) {
                branches = await res.json();
            }
        } finally {
            isLoadingBranches = false;
        }
    }

    async function loadSubjects(branchId: string) {
        selectedBranchId = branchId;
        isLoadingSubjects = true;
        try {
            const res = await fetch(`/api/assessments/subjects?branchId=${branchId}${selectedBatchId ? `&batchId=${selectedBatchId}` : ''}`);
            if (res.ok) {
                subjects = await res.json();
            }
        } finally {
            isLoadingSubjects = false;
        }
    }

    async function addBatch() {
        if (!newBatchName || !activeUniversity?.id) {
            alert('University context is missing. Please refresh or select a university.');
            return;
        }
        const res = await fetch('/api/assessments/batches', {
            method: 'POST',
            body: JSON.stringify({ 
                university_id: activeUniversity.id,
                name: newBatchName
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            newBatchName = '';
            showAddBatch = false;
            invalidateAll();
        } else {
            const err = await res.json();
            alert(`Failed to save batch: ${err.message || 'Unknown error'}`);
        }
    }

    async function addBranch() {
        if (!newBranchName || !activeUniversity?.id || !selectedBatchId) return;
        const res = await fetch('/api/assessments/branches', {
            method: 'POST',
            body: JSON.stringify({ 
                university_id: activeUniversity.id,
                batch_id: selectedBatchId,
                name: newBranchName,
                code: newBranchCode
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            newBranchName = '';
            newBranchCode = '';
            showAddBranch = false;
            loadBranches(selectedBatchId);
        } else {
            const err = await res.json();
            alert(`Failed to save department: ${err.message || 'Unknown error'}`);
        }
    }

    async function addSubject() {
        if (!newSubjectName || !selectedBranchId || !newSubjectSemester) return;
        const res = await fetch('/api/assessments/subjects', {
            method: 'POST',
            body: JSON.stringify({ 
                branch_id: selectedBranchId,
                batch_id: selectedBatchId,
                name: newSubjectName,
                code: newSubjectCode,
                semester: newSubjectSemester
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            newSubjectName = '';
            newSubjectCode = '';
            showAddSubject = false;
            loadSubjects(selectedBranchId);
        } else {
            const err = await res.json();
            alert(`Failed to save subject: ${err.message || 'Unknown error'}`);
        }
    }
    async function deleteBatch(id: string) {
        if (!confirm('Are you sure you want to delete this batch?')) return;
        const res = await fetch(`/api/assessments/batches?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            if (selectedBatchId === id) {
                selectedBatchId = null;
                branches = [];
                selectedBranchId = null;
                subjects = [];
            }
            invalidateAll();
        }
    }

    async function deleteBranch(id: string) {
        if (!confirm('Are you sure you want to delete this department?')) return;
        const res = await fetch(`/api/assessments/branches?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            if (selectedBranchId === id) {
                selectedBranchId = null;
                subjects = [];
            }
            if (selectedBatchId) loadBranches(selectedBatchId);
        }
    }

    async function deleteSubject(id: string) {
        if (!confirm('Are you sure you want to delete this subject?')) return;
        const res = await fetch(`/api/assessments/subjects?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            selectedSubjectIds = selectedSubjectIds.filter(sid => sid !== id);
            if (selectedBranchId) loadSubjects(selectedBranchId);
        }
    }

    async function bulkDeleteSubjects() {
        if (selectedSubjectIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedSubjectIds.length} subjects?`)) return;
        
        isDeletingBulk = true;
        try {
            for (const id of selectedSubjectIds) {
                await fetch(`/api/assessments/subjects?id=${id}`, { method: 'DELETE' });
            }
            selectedSubjectIds = [];
            if (selectedBranchId) loadSubjects(selectedBranchId);
        } finally {
            isDeletingBulk = false;
        }
    }

    function toggleSubjectSelection(id: string) {
        if (selectedSubjectIds.includes(id)) {
            selectedSubjectIds = selectedSubjectIds.filter(sid => sid !== id);
        } else {
            selectedSubjectIds = [...selectedSubjectIds, id];
        }
    }

    async function runUniversalSync() {
        if (!syncSourceSubjectId || !syncTargetBatchName || syncTargetUniIds.length === 0) {
            alert('Please fill all fields');
            return;
        }

        isSyncing = true;
        try {
            const res = await fetch('/api/assessments/sync-power', {
                method: 'POST',
                body: JSON.stringify({
                    sourceSubjectId: syncSourceSubjectId,
                    targetBatchName: syncTargetBatchName,
                    targetUniversityIds: syncTargetUniIds
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (res.ok) {
                const data = await res.json();
                alert(`Sync Complete! Successfully synced to ${data.results.filter((r: any) => r.status === 'success').length} universities.`);
                showSyncModal = false;
                syncTargetUniIds = [];
            } else {
                const err = await res.json();
                alert(`Sync Failed: ${err.message || 'Unknown error'}`);
            }
        } finally {
            isSyncing = false;
        }
    }

    // Edit Logic
    function openEditBatch(batch: any) {
        editingBatch = { ...batch };
        showEditBatch = true;
    }
    async function updateBatch() {
        if (!editingBatch?.name) return;
        isSavingBatch = true;
        try {
            const res = await fetch('/api/assessments/batches', {
                method: 'PATCH',
                body: JSON.stringify(editingBatch),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showEditBatch = false;
                invalidateAll();
            } else {
                const err = await res.json();
                alert(`Failed to update batch: ${err.message || 'Unknown error'}`);
            }
        } finally {
            isSavingBatch = false;
        }
    }

    function openEditBranch(branch: any) {
        editingBranch = { ...branch };
        showEditBranch = true;
    }
    async function updateBranch() {
        if (!editingBranch?.name) return;
        isSavingBranch = true;
        try {
            const res = await fetch('/api/assessments/branches', {
                method: 'PATCH',
                body: JSON.stringify(editingBranch),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showEditBranch = false;
                if (selectedBatchId) loadBranches(selectedBatchId);
            } else {
                const err = await res.json();
                alert(`Failed to update department: ${err.message || 'Unknown error'}`);
            }
        } finally {
            isSavingBranch = false;
        }
    }

    function openEditSubject(subject: any) {
        editingSubject = { ...subject };
        showEditSubject = true;
    }
    async function updateSubject() {
        if (!editingSubject?.name) return;
        isSavingSubject = true;
        try {
            const res = await fetch('/api/assessments/subjects', {
                method: 'PATCH',
                body: JSON.stringify(editingSubject),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showEditSubject = false;
                if (selectedBranchId) loadSubjects(selectedBranchId);
            } else {
                const err = await res.json();
                alert(`Failed to update subject: ${err.message || 'Unknown error'}`);
            }
        } finally {
            isSavingSubject = false;
        }
    }

    onMount(async () => {
        const batchId = $page.url.searchParams.get('batchId');
        const branchId = $page.url.searchParams.get('branchId');

        if (batchId) {
            selectedBatchId = batchId;
            await loadBranches(batchId);
            if (branchId) {
                await loadSubjects(branchId);
            }
        }
    });
</script>

<div class="space-y-8 animate-premium-fade">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="animate-premium-slide">
            <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Assessments <span class="text-indigo-600 dark:text-indigo-400">&</span> Question Papers</h1>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">Manage academic architecture, syllabus catalog, and automated intelligence-driven generation.</p>
        </div>
        
        <div class="flex gap-4 animate-premium-slide" style="animation-delay: 100ms;">
            {#if data.user?.role === 'ADMIN' || data.user?.role === 'PROGRAM_OPS'}
                <button 
                    onclick={() => {
                        showSyncModal = true;
                        syncTargetBatchName = activeBatch?.name || '';
                    }}
                    class="inline-flex items-center px-6 py-3 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:border-indigo-600 transition-all shadow-lg shadow-indigo-500/5 active:scale-95"
                >
                    <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                    Universal Sync
                </button>
            {/if}
            <a 
                href="/assessments/generate" 
                class="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
            >
                <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                Generate Blueprint
            </a>
        </div>
    </div>

    <!-- University Context (Full Width) -->
    {#if data.universities.length > 0}
        <div class="glass p-6 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 animate-premium-slide" style="animation-delay: 200ms;">
            <div class="flex items-center gap-5">
                <div class="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-black border border-indigo-500 shadow-lg shadow-indigo-500/20 uppercase">
                    {activeUniversity?.name?.[0] || 'U'}
                </div>
                <div>
                    <h3 class="text-xl font-black text-gray-900 dark:text-white leading-tight uppercase tracking-tighter">{activeUniversity?.name || 'Select Entity'}</h3>
                    <p class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] mt-1">Active Institutional Pipeline</p>
                </div>
            </div>
            
            <div class="flex items-center gap-4 bg-white/50 dark:bg-slate-900/50 p-2 rounded-2xl border border-gray-100 dark:border-slate-800">
                <span class="text-[9px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest ml-3">Switch Node</span>
                <select 
                    class="bg-white dark:bg-slate-800 border-none text-[11px] font-black text-gray-900 dark:text-white rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    onchange={(e) => {
                        const params = new URLSearchParams();
                        params.set('universityId', e.currentTarget.value);
                        window.location.href = `/assessments?${params.toString()}`;
                    }}
                >
                    {#each data.universities as univ}
                        <option value={univ.id} selected={univ.id === data.selectedUniversityId}>{univ.name}</option>
                    {/each}
                </select>
            </div>
        </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Batches & Branches Column -->
        <div class="space-y-6">
            <!-- Batches -->
            <div class="glass overflow-hidden rounded-[2.5rem] animate-premium-slide" style="animation-delay: 300ms;">
                <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
                    <div>
                        <h3 class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-[0.2em]">Academic Batches</h3>
                        <p class="text-[9px] text-gray-400 dark:text-gray-600 font-bold mt-1 italic">Enrollment Cohorts</p>
                    </div>
                    <button 
                        onclick={() => showAddBatch = !showAddBatch}
                        aria-label="Toggle Add Batch Form"
                        class="p-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm active:scale-95"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                    </button>
                </div>
                <div class="p-4 space-y-3 max-h-[250px] overflow-y-auto">
                    {#if showAddBatch}
                        <div class="p-5 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 space-y-4 shadow-inner" transition:slide>
                            <input 
                                type="text" 
                                bind:value={newBatchName}
                                placeholder="e.g. 2022-2026 Batch"
                                class="w-full bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all text-gray-900 dark:text-white"
                            />
                            <div class="flex gap-2">
                                <button 
                                    onclick={addBatch}
                                    class="flex-1 py-2.5 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
                                >SAVE</button>
                                <button 
                                    onclick={() => showAddBatch = false}
                                    class="flex-1 py-2.5 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                >CANCEL</button>
                            </div>
                        </div>
                    {/if}

                    {#each data.batches as batch}
                        <div 
                            onclick={() => { 
                                if (selectedBatchId === batch.id) {
                                    selectedBatchId = null;
                                    selectedBranchId = null;
                                    branches = [];
                                    subjects = [];
                                } else {
                                    selectedBatchId = batch.id;
                                    selectedBranchId = null;
                                    subjects = [];
                                    loadBranches(batch.id);
                                }
                            }}
                            onkeydown={(e) => e.key === 'Enter' && (selectedBatchId = selectedBatchId === batch.id ? null : batch.id)}
                            role="button"
                            tabindex="0"
                            class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer group
                            {selectedBatchId === batch.id ? 'bg-indigo-600 border-indigo-600 shadow-xl shadow-indigo-500/20 text-white' : 'bg-white/50 dark:bg-slate-800/30 border-gray-100 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500'}"
                        >
                            <span class="text-xs font-bold {selectedBatchId === batch.id ? 'text-white' : 'text-gray-900 dark:text-white'}">{batch.name}</span>
                            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                    onclick={(e) => { e.stopPropagation(); deleteBatch(batch.id); }}
                                    aria-label="Delete Batch"
                                    class="{selectedBatchId === batch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-red-500'} transition-colors"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                </button>
                                <button 
                                    onclick={(e) => { e.stopPropagation(); openEditBatch(batch); }}
                                    aria-label="Edit Batch"
                                    class="{selectedBatchId === batch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-indigo-500'} transition-colors"
                                >
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                </button>
                                {#if selectedBatchId === batch.id}
                                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <p class="text-[9px] text-gray-400 dark:text-gray-600 font-bold text-center py-10 uppercase tracking-widest italic">Node Empty</p>
                    {/each}
                </div>
            </div>

            <!-- Branches -->
            <div class="glass overflow-hidden rounded-[2.5rem] animate-premium-slide" style="animation-delay: 400ms;">
                <div class="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50">
                    <div>
                        <h3 class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-[0.2em]">Academic Departments</h3>
                        <p class="text-[9px] text-gray-400 dark:text-gray-600 font-bold mt-1 italic">Streams of Study</p>
                    </div>
                    <button 
                        onclick={() => showAddBranch = !showAddBranch}
                        aria-label="Toggle Add Department Form"
                        class="p-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm active:scale-95"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                    </button>
                </div>
                <div class="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                    {#if !selectedBatchId}
                        <div class="py-16 flex flex-col items-center justify-center text-center opacity-30">
                            <svg class="w-10 h-10 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <p class="text-[9px] font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">Batch selection required</p>
                        </div>
                    {:else}
                        {#if showAddBranch}
                            <div class="p-5 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 space-y-4 shadow-inner" transition:slide>
                                <input 
                                    type="text" 
                                    bind:value={newBranchName}
                                    placeholder="Branch Name (e.g. Computer Science)"
                                    class="w-full bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all text-gray-900 dark:text-white"
                                />
                                <input 
                                    type="text" 
                                    bind:value={newBranchCode}
                                    placeholder="Code (e.g. CSE)"
                                    class="w-full bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all text-gray-900 dark:text-white"
                                />
                                <div class="flex gap-2">
                                    <button 
                                        onclick={addBranch}
                                        class="flex-1 py-2.5 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-500/20"
                                    >SAVE</button>
                                    <button 
                                        onclick={() => showAddBranch = false}
                                        class="flex-1 py-2.5 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                    >CANCEL</button>
                                </div>
                            </div>
                        {/if}

                        {#each branches as branch}
                            <div 
                                onclick={() => loadSubjects(branch.id)}
                                onkeydown={(e) => e.key === 'Enter' && loadSubjects(branch.id)}
                                role="button"
                                tabindex="0"
                                class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer group
                                {selectedBranchId === branch.id ? 'bg-indigo-600 border-indigo-600 shadow-xl shadow-indigo-500/20 text-white' : 'bg-white/50 dark:bg-slate-800/30 border-gray-100 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500'}"
                            >
                                <div class="flex flex-col">
                                    <span class="text-xs font-bold {selectedBranchId === branch.id ? 'text-white' : 'text-gray-900 dark:text-white'}">{branch.name}</span>
                                    <span class="text-[9px] font-black {selectedBranchId === branch.id ? 'text-indigo-100' : 'text-indigo-400'} uppercase tracking-[0.1em] mt-1 italic">{branch.code}</span>
                                </div>
                                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); deleteBranch(branch.id); }}
                                        aria-label="Delete Department"
                                        class="{selectedBranchId === branch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-red-500'} transition-colors"
                                    >
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                    </button>
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); openEditBranch(branch); }}
                                        aria-label="Edit Department"
                                        class="{selectedBranchId === branch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-indigo-500'} transition-colors"
                                    >
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </button>
                                    {#if selectedBranchId === branch.id}
                                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
                                    {/if}
                                </div>
                            </div>
                        {:else}
                            {#if isLoadingBranches}
                                <div class="flex items-center justify-center py-10">
                                    <div class="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent shadow-sm"></div>
                                </div>
                            {:else}
                                <p class="text-[9px] text-gray-400 dark:text-gray-600 font-bold text-center py-10 uppercase tracking-widest italic">Stream Empty</p>
                            {/if}
                        {/each}
                    {/if}
                </div>
            </div>
        </div>

        <!-- Subjects & Syllabus Column (Main) -->
        <div class="lg:col-span-2 space-y-6">
            <div class="bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[600px] flex flex-col">
                <div class="p-8 border-b border-gray-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-gray-50/30 dark:bg-slate-800/20">
                    <div>
                        <h2 class="text-2xl font-black text-gray-900 dark:text-white leading-tight uppercase tracking-tighter">Syllabus <span class="text-indigo-600 dark:text-indigo-400">&</span> Catalog</h2>
                        {#if selectedBatchId && selectedBranchId}
                            <p class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] mt-2"> 
                                <span class="text-gray-400 dark:text-slate-400">{activeBatch?.name}</span> • 
                                {branches.find(b => b.id === selectedBranchId)?.name}
                            </p>
                        {:else}
                            <p class="text-[10px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em] mt-2 italic">Awaiting structural context</p>
                        {/if}
                    </div>

                    {#if selectedBranchId}
                        <div class="flex items-center gap-4">
                            {#if selectedSubjectIds.length > 0}
                                <button 
                                    onclick={bulkDeleteSubjects}
                                    disabled={isDeletingBulk}
                                    class="inline-flex items-center px-5 py-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-all border border-red-100 dark:border-red-900/30 active:scale-95 disabled:opacity-50 shadow-sm"
                                >
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                    Purge Selected ({selectedSubjectIds.length})
                                </button>
                            {/if}
                            <button 
                                onclick={() => showAddSubject = true}
                                class="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                            >
                                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                                Mapping Subject
                            </button>
                        </div>
                    {/if}
                </div>

                <div class="flex-1 p-8">
                    {#if !selectedBatchId || !selectedBranchId}
                        <div class="h-full flex flex-col items-center justify-center text-center py-24 animate-premium-fade">
                            <div class="w-24 h-24 glass rounded-[2.5rem] flex items-center justify-center text-indigo-500 mb-8 border border-white dark:border-slate-800 shadow-xl shadow-indigo-500/10">
                                <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                            </div>
                            <h3 class="text-2xl font-black text-gray-900 dark:text-white leading-tight uppercase tracking-tighter">Initialize Catalog</h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-4 max-w-sm font-medium leading-relaxed">Map institutional subjects by selecting a <span class="text-indigo-600 dark:text-indigo-400 font-black">Cohort Cluster</span> and then an <span class="text-indigo-600 dark:text-indigo-400 font-black">Academic Stream</span>.</p>
                        </div>
                    {:else if isLoadingSubjects}
                         <div class="h-full flex items-center justify-center py-20">
                            <div class="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                         </div>
                    {:else}
                        <!-- Subjects List Organized by Semester -->
                        {#if showAddSubject}
                            <div class="mb-10 p-8 glass rounded-[2.5rem] border border-white dark:border-slate-800 shadow-xl shadow-indigo-500/5" transition:slide>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                    <div class="space-y-2">
                                        <label for="subjectName" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Subject Identity</label>
                                        <input id="subjectName" type="text" bind:value={newSubjectName} placeholder="e.g. Data Structures" class="w-full bg-white dark:bg-slate-800 border-gray-100 dark:border-gray-700 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3 text-gray-900 dark:text-white"/>
                                    </div>
                                    <div class="space-y-2">
                                        <label for="subjectCode" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Mapping Code</label>
                                        <input id="subjectCode" type="text" bind:value={newSubjectCode} placeholder="e.g. CS201" class="w-full bg-white dark:bg-slate-800 border-gray-100 dark:border-gray-700 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3 text-gray-900 dark:text-white"/>
                                    </div>
                                    <div class="space-y-2">
                                        <label for="subjectSemester" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Academic Phase</label>
                                        <select id="subjectSemester" bind:value={newSubjectSemester} class="w-full bg-white dark:bg-slate-800 border-gray-100 dark:border-gray-700 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3 text-gray-900 dark:text-white">
                                            {#each [1,2,3,4,5,6,7,8] as sem}
                                                <option value={sem}>Semester {sem}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </div>
                                <div class="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-slate-800">
                                    <button onclick={() => showAddSubject = false} class="px-6 py-3 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">CANCEL</button>
                                    <button onclick={addSubject} class="px-8 py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">COMMIT SUBJECT</button>
                                </div>
                            </div>
                        {/if}

                        <div class="space-y-10">
                            {#each [1,2,3,4,5,6,7,8] as sem}
                                {#if subjects.filter(s => s.semester === sem).length > 0}
                                    <div class="space-y-6 animate-premium-slide" style="animation-delay: {sem * 50}ms;">
                                        <div class="flex items-center gap-5">
                                            <div class="px-4 py-1.5 bg-gray-900 dark:bg-slate-800 text-white text-[11px] font-black rounded-xl shadow-lg border border-gray-800 dark:border-gray-700 uppercase tracking-widest">Phase {sem}</div>
                                            <div class="h-px flex-1 bg-gradient-to-r from-gray-100 dark:from-gray-800 to-transparent"></div>
                                        </div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            {#each subjects.filter(s => s.semester === sem) as subject}
                                                <div 
                                                    class="group p-6 rounded-[2rem] border transition-all cursor-pointer relative overflow-hidden
                                                    {selectedSubjectIds.includes(subject.id) ? 'bg-indigo-600 border-indigo-500 shadow-xl shadow-indigo-500/20 text-white' : 'bg-white dark:bg-slate-800/40 border-gray-100 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-xl hover:shadow-indigo-500/5'}"
                                                    onclick={() => toggleSubjectSelection(subject.id)}
                                                    onkeydown={(e) => e.key === 'Enter' && toggleSubjectSelection(subject.id)}
                                                    role="button"
                                                    tabindex="0"
                                                >
                                                    <div class="flex justify-between items-start mb-4 relative z-10">
                                                        <div class="flex items-start gap-4">
                                                            <div 
                                                                class="w-6 h-6 rounded-lg border flex items-center justify-center transition-all mt-0.5
                                                                {selectedSubjectIds.includes(subject.id) ? 'bg-white border-white shadow-lg' : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-gray-700'}"
                                                            >
                                                                {#if selectedSubjectIds.includes(subject.id)}
                                                                    <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"/></svg>
                                                                {/if}
                                                            </div>
                                                            <div>
                                                                <h4 class="text-base font-black leading-tight uppercase tracking-tight {selectedSubjectIds.includes(subject.id) ? 'text-white' : 'text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'} transition-colors">{subject.name}</h4>
                                                                <p class="text-[10px] font-black uppercase tracking-widest mt-1 {selectedSubjectIds.includes(subject.id) ? 'text-indigo-200' : 'text-indigo-500 dark:text-indigo-400'}">{subject.code || 'UNMAPPED-ID'}</p>
                                                            </div>
                                                        </div>
                                                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                            <button 
                                                                onclick={(e) => { e.stopPropagation(); deleteSubject(subject.id); }}
                                                                aria-label="Delete Subject"
                                                                class="p-2 rounded-xl {selectedSubjectIds.includes(subject.id) ? 'text-white hover:bg-white/10' : 'text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'} transition-all"
                                                            >
                                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                                            </button>
                                                            <button 
                                                                onclick={(e) => { e.stopPropagation(); openEditSubject(subject); }}
                                                                aria-label="Edit Subject"
                                                                class="p-2 rounded-xl {selectedSubjectIds.includes(subject.id) ? 'text-white hover:bg-white/10' : 'text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'} transition-all"
                                                            >
                                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div class="mt-4 flex items-center justify-between relative z-10">
                                                        <div class="flex -space-x-2 overflow-hidden">
                                                            {#each [1,2,3,4,5] as unit}
                                                                <div class="inline-block h-7 w-7 rounded-xl ring-4 ring-white dark:ring-gray-800 bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-gray-700 text-[10px] font-black flex items-center justify-center text-gray-400 dark:text-slate-400 shadow-sm">U{unit}</div>
                                                            {/each}
                                                        </div>
                                                        <a 
                                                            href="/assessments/subjects/{subject.id}"
                                                            class="text-[11px] font-black uppercase tracking-widest {selectedSubjectIds.includes(subject.id) ? 'text-white hover:underline' : 'text-indigo-600 dark:text-indigo-400 hover:underline'}"
                                                        >
                                                            Portion Analysis
                                                        </a>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center py-24 opacity-30 animate-premium-fade">
                                    <div class="w-20 h-20 bg-gray-50 dark:bg-slate-900 rounded-[2rem] flex items-center justify-center text-gray-300 mb-6 border border-gray-100 dark:border-slate-800 shadow-inner">
                                        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                    </div>
                                    <h3 class="text-sm font-black text-gray-700 dark:text-white uppercase tracking-[0.2em]">Resource Void</h3>
                                    <p class="text-[10px] text-gray-400 dark:text-slate-400 font-bold mt-2 uppercase tracking-widest italic">No subjects mapped to current stream node</p>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>


{#if showEditBatch && editingBatch}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" transition:fade>
        <div class="glass rounded-[3rem] w-full max-w-md p-10 shadow-2xl border border-white dark:border-slate-800" transition:fly={{ y: 30, duration: 500 }}>
            <h3 class="text-2xl font-black text-gray-900 dark:text-white mb-8 uppercase tracking-tighter">Edit Cluster</h3>
            <div class="space-y-6">
                <div class="space-y-2">
                    <label for="editBatchName" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Cohort Label</label>
                    <input id="editBatchName" type="text" bind:value={editingBatch.name} class="w-full bg-white dark:bg-slate-800/50 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white"/>
                </div>
                <div class="flex gap-4 pt-4">
                    <button onclick={() => showEditBatch = false} class="flex-1 py-4 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] border border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">CANCEL</button>
                    <button 
                        onclick={updateBatch} 
                        disabled={isSavingBatch}
                        class="flex-1 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50"
                    >
                        {isSavingBatch ? 'SYNCING...' : 'SAVE CHANGES'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if showEditBranch && editingBranch}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" transition:fade>
        <div class="glass rounded-[3rem] w-full max-w-md p-10 shadow-2xl border border-white dark:border-slate-800" transition:fly={{ y: 30, duration: 500 }}>
            <h3 class="text-2xl font-black text-gray-900 dark:text-white mb-8 uppercase tracking-tighter">Edit Stream</h3>
            <div class="space-y-6">
                <div class="space-y-2">
                    <label for="editBranchName" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Stream Identity</label>
                    <input id="editBranchName" type="text" bind:value={editingBranch.name} class="w-full bg-white dark:bg-slate-800/50 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white"/>
                </div>
                <div class="space-y-2">
                    <label for="editBranchCode" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Mapping Code</label>
                    <input id="editBranchCode" type="text" bind:value={editingBranch.code} class="w-full bg-white dark:bg-slate-800/50 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white"/>
                </div>
                <div class="flex gap-4 pt-4">
                    <button onclick={() => showEditBranch = false} class="flex-1 py-4 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] border border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">CANCEL</button>
                    <button 
                        onclick={updateBranch} 
                        disabled={isSavingBranch}
                        class="flex-1 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50"
                    >
                        {isSavingBranch ? 'SYNCING...' : 'SAVE CHANGES'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if showEditSubject && editingSubject}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" transition:fade>
        <div class="glass rounded-[3rem] w-full max-w-2xl p-10 shadow-2xl border border-white dark:border-slate-800" transition:fly={{ y: 30, duration: 500 }}>
            <h3 class="text-2xl font-black text-gray-900 dark:text-white mb-8 uppercase tracking-tighter">Subject Architecture</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-2">
                    <label for="editSubjectName" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Nomenclature</label>
                    <input id="editSubjectName" type="text" bind:value={editingSubject.name} class="w-full bg-white dark:bg-slate-800/50 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white"/>
                </div>
                <div class="space-y-2">
                    <label for="editSubjectCode" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Schema Code</label>
                    <input id="editSubjectCode" type="text" bind:value={editingSubject.code} class="w-full bg-white dark:bg-slate-800/50 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white"/>
                </div>
                <div class="space-y-2">
                    <label for="editSubjectSemester" class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-[0.2em] ml-2">Phase Vector</label>
                    <select id="editSubjectSemester" bind:value={editingSubject.semester} class="w-full bg-white dark:bg-slate-800/50 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white">
                        {#each [1,2,3,4,5,6,7,8] as sem}
                            <option value={sem}>Semester {sem}</option>
                        {/each}
                    </select>
                </div>
            </div>
            <div class="flex gap-4 pt-10 mt-6 border-t border-gray-100 dark:border-slate-800">
                <button onclick={() => showEditSubject = false} class="flex-1 py-4 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">CANCEL</button>
                <button 
                    onclick={updateSubject} 
                    disabled={isSavingSubject}
                    class="flex-1 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-[1.5rem] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50"
                >
                    {isSavingSubject ? 'SYNCING...' : 'SAVE CHANGES'}
                </button>
            </div>
        </div>
    </div>
{/if}


{#if showSyncModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md" transition:fade>
        <div class="glass rounded-[3rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-white dark:border-slate-800" transition:fly={{ y: 30, duration: 500 }}>
            <div class="bg-indigo-600 p-10 text-white relative">
                <h3 class="text-3xl font-black uppercase tracking-tighter">Universal Sync Pipeline</h3>
                <p class="text-indigo-100 text-xs font-bold uppercase tracking-[0.2em] mt-2 opacity-80">Autonomous syllabus replication across institution nodes</p>
                <button onclick={() => showSyncModal = false} class="absolute top-10 right-10 text-white/50 hover:text-white transition-all transform hover:rotate-90" aria-label="Terminate Connection">
                    <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <div class="p-10 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <!-- Step 1: Source Subject -->
                <div class="space-y-4">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-100 dark:border-indigo-800/50">01</span>
                        <h4 class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">Select Source Subject Authority</h4>
                    </div>
                    <select bind:value={syncSourceSubjectId} class="w-full bg-white dark:bg-slate-800 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white">
                        <option value="">-- Choose subject node --</option>
                        {#each subjects as s}
                            <option value={s.id}>{s.name} ({s.code || 'NO-REF'})</option>
                        {/each}
                    </select>
                </div>

                <!-- Step 2: Target Batch -->
                <div class="space-y-4">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-100 dark:border-indigo-800/50">02</span>
                        <h4 class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">Target Cohort Designation</h4>
                    </div>
                    <input 
                        type="text" 
                        bind:value={syncTargetBatchName} 
                        placeholder="e.g. 2024-2028 Cluster" 
                        class="w-full bg-white dark:bg-slate-800 border-gray-100 dark:border-gray-700 rounded-[1.5rem] text-xs font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all px-5 py-4 text-gray-900 dark:text-white"
                    />
                </div>

                <!-- Step 3: Target Universities -->
                <div class="space-y-4">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-100 dark:border-indigo-800/50">03</span>
                        <h4 class="text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">Target Institution Clusters</h4>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800/50">
                        {#each filteredSyncUnis as uni}
                            <label class="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500 transition-all group shadow-sm">
                                <input 
                                    type="checkbox" 
                                    value={uni.id} 
                                    checked={syncTargetUniIds.includes(uni.id)}
                                    onchange={(e) => {
                                        if (e.currentTarget.checked) {
                                            syncTargetUniIds = [...syncTargetUniIds, uni.id];
                                        } else {
                                            syncTargetUniIds = syncTargetUniIds.filter(id => id !== uni.id);
                                        }
                                    }}
                                    class="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500 dark:bg-slate-900 border-gray-300 dark:border-gray-600"
                                />
                                <span class="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{uni.name}</span>
                            </label>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="p-10 bg-gray-50/50 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div class="flex items-center gap-3 bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    <p class="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                        Selected: <span class="text-indigo-600 dark:text-indigo-400">{syncTargetUniIds.length} Nodes</span>
                    </p>
                </div>
                <div class="flex gap-4 w-full sm:w-auto">
                    <button onclick={() => showSyncModal = false} class="flex-1 sm:flex-none px-8 py-4 bg-white dark:bg-slate-900 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">ABORT</button>
                    <button 
                        onclick={runUniversalSync} 
                        disabled={isSyncing || !syncSourceSubjectId || !syncTargetBatchName || syncTargetUniIds.length === 0}
                        class="flex-1 sm:flex-none px-10 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-500/30 disabled:opacity-50"
                    >
                        {isSyncing ? 'EXECUTING SYNC...' : 'INITIALIZE UNIVERSAL SYNC'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Custom spacing for heavy tracking */
    :global(.tracking-widest) {
        letter-spacing: 0.15em;
    }

    .glass {
        @apply bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-gray-200/50 dark:border-white/10 shadow-glass dark:shadow-2xl;
    }

    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    
    .custom-scrollbar::-webkit-scrollbar-track {
        @apply bg-transparent;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb {
        @apply bg-gray-200 dark:bg-slate-800 rounded-full;
    }
    
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        @apply bg-gray-300 dark:bg-slate-950;
    }

    :global(.dark) .glass {
        background: linear-gradient(135deg, rgba(17, 24, 39, 0.4) 0%, rgba(10, 15, 25, 0.6) 100%);
    }

    /* Transition refinements */
    :global(.animate-premium-slide) {
        animation: premium-slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    :global(.animate-premium-fade) {
        animation: premium-fade-in 0.8s ease-out forwards;
    }
</style>
