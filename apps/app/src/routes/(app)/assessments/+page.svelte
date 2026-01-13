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

<div class="space-y-8">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-black text-gray-900 tracking-tight">Assessments & Question Papers</h1>
            <p class="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">Manage Syllabus, Questions, and Automated Generation</p>
        </div>
        
        <div class="flex gap-3">
            {#if data.user?.role === 'ADMIN' || data.user?.role === 'PROGRAM_OPS'}
                <button 
                    onclick={() => {
                        showSyncModal = true;
                        syncTargetBatchName = activeBatch?.name || '';
                    }}
                    class="inline-flex items-center px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-100 text-sm font-black rounded-2xl hover:border-indigo-600 transition-all shadow-xl shadow-indigo-100 active:scale-95"
                >
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                    UNIVERSAL SYNC
                </button>
            {/if}
            <a 
                href="/assessments/generate" 
                class="inline-flex items-center px-6 py-3 bg-indigo-600 text-white text-sm font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
            >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                GENERATE QUESTION PAPER
            </a>
        </div>
    </div>

    <!-- University Context (Full Width) -->
    {#if data.universities.length > 0}
        <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-xl font-black text-indigo-600 border border-indigo-100 uppercase">
                    {activeUniversity?.name?.[0] || 'U'}
                </div>
                <div>
                    <h3 class="text-lg font-black text-gray-900 leading-tight">{activeUniversity?.name || 'Select University'}</h3>
                    <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-0.5">Active Institution Context</p>
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-gray-400 mr-2">Switch:</span>
                <select 
                    class="bg-gray-50 border-none text-xs font-bold text-gray-900 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500"
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
            <div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div class="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 class="text-sm font-black text-gray-900 uppercase tracking-widest">Academic Batches</h3>
                        <p class="text-[10px] text-gray-400 font-bold mt-0.5">Enrollment Cohorts</p>
                    </div>
                    <button 
                        onclick={() => showAddBatch = !showAddBatch}
                        aria-label="Add new academic batch"
                        class="p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                    </button>
                </div>
                <div class="p-4 space-y-2 max-h-[250px] overflow-y-auto">
                    {#if showAddBatch}
                        <div class="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 space-y-3" transition:slide>
                            <input 
                                type="text" 
                                bind:value={newBatchName}
                                placeholder="e.g. 2022-2026 Batch"
                                class="w-full bg-white border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                            />
                            <div class="flex gap-2">
                                <button 
                                    onclick={addBatch}
                                    class="flex-1 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all"
                                >SAVE</button>
                                <button 
                                    onclick={() => showAddBatch = false}
                                    class="flex-1 py-2 bg-white text-gray-400 text-[10px] font-black rounded-xl border border-gray-200 hover:bg-gray-50 transition-all"
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
                            class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer
                            {selectedBatchId === batch.id ? 'bg-indigo-600 border-indigo-600 shadow-xl shadow-indigo-100 text-white' : 'bg-gray-50/50 border-gray-100 group hover:border-indigo-100'}"
                        >
                            <span class="text-xs font-black {selectedBatchId === batch.id ? 'text-white' : 'text-gray-700'}">{batch.name}</span>
                            <div class="flex items-center gap-2">
                                <button 
                                    onclick={(e) => { e.stopPropagation(); deleteBatch(batch.id); }}
                                    aria-label="Delete batch" 
                                    class="{selectedBatchId === batch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-300 hover:text-red-500'} transition-colors"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                </button>
                                <button 
                                    onclick={(e) => { e.stopPropagation(); openEditBatch(batch); }}
                                    aria-label="Edit batch" 
                                    class="{selectedBatchId === batch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-300 hover:text-indigo-500'} transition-colors"
                                >
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                </button>
                                {#if selectedBatchId === batch.id}
                                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <p class="text-[10px] text-gray-400 font-bold text-center py-8 italic">No batches created yet</p>
                    {/each}
                </div>
            </div>

            <!-- Branches -->
            <div class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div class="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 class="text-sm font-black text-gray-900 uppercase tracking-widest">Departments / Branches</h3>
                        <p class="text-[10px] text-gray-400 font-bold mt-0.5">Streams of Study</p>
                    </div>
                    <button 
                        onclick={() => showAddBranch = !showAddBranch}
                        aria-label="Add new department or branch"
                        class="p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm active:scale-95"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                    </button>
                </div>
                <div class="p-4 space-y-2 max-h-[400px] overflow-y-auto">
                    {#if !selectedBatchId}
                        <div class="py-12 flex flex-col items-center justify-center text-center opacity-40">
                            <svg class="w-8 h-8 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <p class="text-[10px] font-black text-gray-900 uppercase tracking-widest">Select Batch First</p>
                        </div>
                    {:else}
                        {#if showAddBranch}
                            <div class="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 space-y-3" transition:slide>
                                <input 
                                    type="text" 
                                    bind:value={newBranchName}
                                    placeholder="Branch Name (e.g. Computer Science)"
                                    class="w-full bg-white border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                                />
                                <input 
                                    type="text" 
                                    bind:value={newBranchCode}
                                    placeholder="Code (e.g. CSE)"
                                    class="w-full bg-white border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                                />
                                <div class="flex gap-2">
                                    <button 
                                        onclick={addBranch}
                                        class="flex-1 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl hover:bg-indigo-700 transition-all"
                                    >SAVE</button>
                                    <button 
                                        onclick={() => showAddBranch = false}
                                        class="flex-1 py-2 bg-white text-gray-400 text-[10px] font-black rounded-xl border border-gray-200 hover:bg-gray-50 transition-all"
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
                                class="w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer
                                {selectedBranchId === branch.id ? 'bg-indigo-600 border-indigo-600 shadow-xl shadow-indigo-100 text-white' : 'bg-gray-50/50 border-gray-100 group hover:border-indigo-100'}"
                            >
                                <div class="flex flex-col">
                                    <span class="text-xs font-black {selectedBranchId === branch.id ? 'text-white' : 'text-gray-700'}">{branch.name}</span>
                                    <span class="text-[9px] font-bold {selectedBranchId === branch.id ? 'text-indigo-200' : 'text-indigo-400'} uppercase tracking-tighter">{branch.code}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); deleteBranch(branch.id); }}
                                        aria-label="Delete department"
                                        class="{selectedBranchId === branch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-300 hover:text-red-500'} transition-colors"
                                    >
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                    </button>
                                    <button 
                                        onclick={(e) => { e.stopPropagation(); openEditBranch(branch); }}
                                        aria-label="Edit branch" 
                                        class="{selectedBranchId === branch.id ? 'text-indigo-200 hover:text-white' : 'text-gray-300 hover:text-indigo-500'} transition-colors"
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
                                <div class="flex items-center justify-center py-8">
                                    <div class="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent"></div>
                                </div>
                            {:else}
                                <p class="text-[10px] text-gray-400 font-bold text-center py-8 italic">No branches created for this batch yet</p>
                            {/if}
                        {/each}
                    {/if}
                </div>
            </div>
        </div>

        <!-- Subjects & Syllabus Column (Main) -->
        <div class="lg:col-span-2 space-y-6">
            <div class="bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[600px] flex flex-col">
                <div class="p-8 border-b border-gray-50 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-black text-gray-900 leading-tight">Syllabus & Course Catalog</h2>
                        {#if selectedBatchId && selectedBranchId}
                            <p class="text-xs font-bold text-indigo-500 uppercase tracking-widest mt-1"> 
                                <span class="text-gray-400">{activeBatch?.name}</span> • 
                                {branches.find(b => b.id === selectedBranchId)?.name}
                            </p>
                        {:else}
                            <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Select Batch & Branch to manage portions</p>
                        {/if}
                    </div>

                    {#if selectedBranchId}
                        <div class="flex items-center gap-3">
                            {#if selectedSubjectIds.length > 0}
                                <button 
                                    onclick={bulkDeleteSubjects}
                                    disabled={isDeletingBulk}
                                    class="inline-flex items-center px-4 py-2 bg-red-50 text-red-600 text-[10px] font-black rounded-xl hover:bg-red-100 transition-all border border-red-100 active:scale-95 disabled:opacity-50"
                                >
                                    <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                    DELETE SELECTED ({selectedSubjectIds.length})
                                </button>
                            {/if}
                            <button 
                                onclick={() => showAddSubject = true}
                                class="inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-xl hover:bg-indigo-100 transition-all border border-indigo-100 active:scale-95"
                            >
                                <svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                                ADD SUBJECT
                            </button>
                        </div>
                    {/if}
                </div>

                <div class="flex-1 p-8">
                    {#if !selectedBatchId || !selectedBranchId}
                        <div class="h-full flex flex-col items-center justify-center text-center py-20">
                            <div class="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-400 mb-6">
                                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                            </div>
                            <h3 class="text-lg font-black text-gray-900 leading-tight">Ready to map subjects?</h3>
                            <p class="text-sm text-gray-500 mt-2 max-w-xs font-medium">Please select a <b>Batch</b> and then a <b>Department</b> from the left panel to begin managing subjects.</p>
                        </div>
                    {:else if isLoadingSubjects}
                         <div class="h-full flex items-center justify-center py-20">
                            <div class="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                         </div>
                    {:else}
                        <!-- Subjects List Organized by Semester -->
                        {#if showAddSubject}
                            <div class="mb-8 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 shadow-sm" transition:slide>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div class="space-y-1">
                                        <label for="subjectName" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Subject Name</label>
                                        <input id="subjectName" type="text" bind:value={newSubjectName} placeholder="e.g. Data Structures" class="w-full bg-white border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"/>
                                    </div>
                                    <div class="space-y-1">
                                        <label for="subjectCode" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Course Code</label>
                                        <input id="subjectCode" type="text" bind:value={newSubjectCode} placeholder="e.g. CS201" class="w-full bg-white border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500"/>
                                    </div>
                                    <div class="space-y-1">
                                        <label for="subjectSemester" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Semester</label>
                                        <select id="subjectSemester" bind:value={newSubjectSemester} class="w-full bg-white border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 px-4 py-2">
                                            {#each [1,2,3,4,5,6,7,8] as sem}
                                                <option value={sem}>Semester {sem}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </div>
                                <div class="flex justify-end gap-3 pt-2 border-t border-indigo-100">
                                    <button onclick={() => showAddSubject = false} class="px-6 py-2 bg-white text-gray-400 text-xs font-black rounded-xl border border-gray-200 hover:bg-gray-50 transition-all">CANCEL</button>
                                    <button onclick={addSubject} class="px-6 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">CREATE SUBJECT</button>
                                </div>
                            </div>
                        {/if}

                        <div class="space-y-8">
                            {#each [1,2,3,4,5,6,7,8] as sem}
                                {#if subjects.filter(s => s.semester === sem).length > 0}
                                    <div class="space-y-4">
                                        <div class="flex items-center gap-4">
                                            <div class="px-3 py-1 bg-gray-900 text-white text-[10px] font-black rounded-lg">SEM {sem}</div>
                                            <div class="h-px flex-1 bg-gray-100"></div>
                                        </div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {#each subjects.filter(s => s.semester === sem) as subject}
                                                <div 
                                                    class="group bg-white p-5 rounded-2xl border transition-all cursor-pointer relative
                                                    {selectedSubjectIds.includes(subject.id) ? 'border-indigo-500 bg-indigo-50/30' : 'border-gray-100 shadow-sm hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5'}"
                                                    onclick={() => toggleSubjectSelection(subject.id)}
                                                    onkeydown={(e) => e.key === 'Enter' && toggleSubjectSelection(subject.id)}
                                                    role="button"
                                                    tabindex="0"
                                                >
                                                    <div class="flex justify-between items-start mb-2">
                                                        <div class="flex items-start gap-3">
                                                            <div 
                                                                class="w-5 h-5 rounded-md border flex items-center justify-center transition-all
                                                                {selectedSubjectIds.includes(subject.id) ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white border-gray-200'}"
                                                            >
                                                                {#if selectedSubjectIds.includes(subject.id)}
                                                                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"/></svg>
                                                                {/if}
                                                            </div>
                                                            <div>
                                                                <h4 class="text-sm font-black text-gray-900 leading-tight group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{subject.name}</h4>
                                                                <p class="text-[10px] font-black text-indigo-400 mt-0.5">{subject.code || 'NO-CODE'}</p>
                                                            </div>
                                                        </div>
                                                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onclick={(e) => { e.stopPropagation(); deleteSubject(subject.id); }}
                                                                aria-label="Delete subject" 
                                                                class="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                                                            >
                                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"/></svg>
                                                            </button>
                                                            <button 
                                                                onclick={(e) => { e.stopPropagation(); openEditSubject(subject); }}
                                                                aria-label="Edit subject" 
                                                                class="p-1.5 text-gray-300 hover:text-indigo-500 transition-colors"
                                                            >
                                                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div class="mt-4 flex items-center justify-between">
                                                        <div class="flex -space-x-1.5 overflow-hidden">
                                                            {#each [1,2,3,4,5] as unit}
                                                                <div class="inline-block h-6 w-6 rounded-lg ring-2 ring-white bg-gray-50 border border-gray-100 text-[9px] font-black flex items-center justify-center text-gray-400 uppercase">U{unit}</div>
                                                            {/each}
                                                        </div>
                                                        <a 
                                                            href="/assessments/subjects/{subject.id}"
                                                            class="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-tighter"
                                                        >
                                                            View Portion
                                                        </a>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {:else}
                                <div class="h-full flex flex-col items-center justify-center text-center py-20 opacity-50">
                                    <div class="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-300 mb-4">
                                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                    </div>
                                    <h3 class="text-xs font-black text-gray-700 uppercase tracking-widest">No subjects mapped yet</h3>
                                    <p class="text-[10px] text-gray-400 font-bold mt-1">Start adding subjects for this department using the "Add Subject" button.</p>
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
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" transition:fade>
        <div class="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-gray-100" transition:fly={{ y: 20 }}>
            <h3 class="text-2xl font-black text-gray-900 mb-6 uppercase tracking-tight">Edit Academic Batch</h3>
            <div class="space-y-4">
                <div class="space-y-1">
                    <label for="editBatchName" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Batch Name</label>
                    <input id="editBatchName" type="text" bind:value={editingBatch.name} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3"/>
                </div>
                <div class="flex gap-3 pt-4">
                    <button onclick={() => showEditBatch = false} class="flex-1 py-3 bg-white text-gray-400 text-xs font-black rounded-2xl border border-gray-100 hover:bg-gray-50 transition-all">CANCEL</button>
                    <button 
                        onclick={updateBatch} 
                        disabled={isSavingBatch}
                        class="flex-1 py-3 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
                    >
                        {isSavingBatch ? 'SAVING...' : 'SAVE CHANGES'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if showEditBranch && editingBranch}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" transition:fade>
        <div class="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-gray-100" transition:fly={{ y: 20 }}>
            <h3 class="text-2xl font-black text-gray-900 mb-6 uppercase tracking-tight">Edit Department</h3>
            <div class="space-y-4">
                <div class="space-y-1">
                    <label for="editBranchName" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Department Name</label>
                    <input id="editBranchName" type="text" bind:value={editingBranch.name} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3"/>
                </div>
                <div class="space-y-1">
                    <label for="editBranchCode" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Code</label>
                    <input id="editBranchCode" type="text" bind:value={editingBranch.code} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3"/>
                </div>
                <div class="flex gap-3 pt-4">
                    <button onclick={() => showEditBranch = false} class="flex-1 py-3 bg-white text-gray-400 text-xs font-black rounded-2xl border border-gray-100 hover:bg-gray-50 transition-all">CANCEL</button>
                    <button 
                        onclick={updateBranch} 
                        disabled={isSavingBranch}
                        class="flex-1 py-3 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
                    >
                        {isSavingBranch ? 'SAVING...' : 'SAVE CHANGES'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

{#if showEditSubject && editingSubject}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" transition:fade>
        <div class="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl border border-gray-100" transition:fly={{ y: 20 }}>
            <h3 class="text-2xl font-black text-gray-900 mb-6 uppercase tracking-tight">Edit Subject Details</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-1">
                    <label for="editSubjectName" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Subject Name</label>
                    <input id="editSubjectName" type="text" bind:value={editingSubject.name} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3"/>
                </div>
                <div class="space-y-1">
                    <label for="editSubjectCode" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Course Code</label>
                    <input id="editSubjectCode" type="text" bind:value={editingSubject.code} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3"/>
                </div>
                <div class="space-y-1">
                    <label for="editSubjectSemester" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Semester</label>
                    <select id="editSubjectSemester" bind:value={editingSubject.semester} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3">
                        {#each [1,2,3,4,5,6,7,8] as sem}
                            <option value={sem}>Semester {sem}</option>
                        {/each}
                    </select>
                </div>
            </div>
            <div class="flex gap-3 pt-8 mt-4 border-t border-gray-50">
                <button onclick={() => showEditSubject = false} class="flex-1 py-3 bg-white text-gray-400 text-xs font-black rounded-2xl border border-gray-200 hover:bg-gray-50 transition-all">CANCEL</button>
                <button 
                    onclick={updateSubject} 
                    disabled={isSavingSubject}
                    class="flex-1 py-3 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
                >
                    {isSavingSubject ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Custom spacing for heavy tracking */
    :global(.tracking-widest) {
        letter-spacing: 0.15em;
    }
</style>

{#if showSyncModal}
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md" transition:fade>
        <div class="bg-white rounded-[3rem] w-full max-w-2xl overflow-hidden shadow-2xl border border-white" transition:fly={{ y: 20 }}>
            <div class="bg-indigo-600 p-8 text-white relative">
                <h3 class="text-2xl font-black uppercase tracking-tight">Universal Syllabus Sync</h3>
                <p class="text-indigo-100 text-xs font-bold uppercase tracking-widest mt-1 opacity-80">Replicate portions across multiple institutions</p>
                <button onclick={() => showSyncModal = false} class="absolute top-8 right-8 text-white/50 hover:text-white transition-colors" aria-label="Close Sync Modal">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <div class="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <!-- Step 1: Source Subject -->
                <div class="space-y-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black">1</span>
                        <h4 class="text-xs font-black text-gray-900 uppercase tracking-widest">Select Source Subject</h4>
                    </div>
                    <select bind:value={syncSourceSubjectId} class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3">
                        <option value="">-- Choose a subject to sync from --</option>
                        {#each subjects as s}
                            <option value={s.id}>{s.name} ({s.code || 'No Code'})</option>
                        {/each}
                    </select>
                </div>

                <!-- Step 2: Target Batch -->
                <div class="space-y-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black">2</span>
                        <h4 class="text-xs font-black text-gray-900 uppercase tracking-widest">Target Batch Name</h4>
                    </div>
                    <input 
                        type="text" 
                        bind:value={syncTargetBatchName} 
                        placeholder="e.g. 2024-2028" 
                        class="w-full bg-gray-50 border-gray-100 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all px-4 py-3"
                    />
                </div>

                <!-- Step 3: Target Universities -->
                <div class="space-y-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black">3</span>
                        <h4 class="text-xs font-black text-gray-900 uppercase tracking-widest">Target Universities</h4>
                    </div>
                    <div class="grid grid-cols-2 gap-2 bg-gray-50 p-4 rounded-3xl border border-gray-100">
                        {#each filteredSyncUnis as uni}
                            <label class="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 cursor-pointer hover:border-indigo-300 transition-all group">
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
                                    class="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span class="text-[10px] font-black text-gray-700 uppercase tracking-tight group-hover:text-indigo-600">{uni.name}</span>
                            </label>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Selected: <span class="text-indigo-600">{syncTargetUniIds.length} Universities</span>
                </p>
                <div class="flex gap-3">
                    <button onclick={() => showSyncModal = false} class="px-6 py-3 bg-white text-gray-400 text-xs font-black rounded-2xl border border-gray-200 hover:bg-gray-100 transition-all">CANCEL</button>
                    <button 
                        onclick={runUniversalSync} 
                        disabled={isSyncing || !syncSourceSubjectId || !syncTargetBatchName || syncTargetUniIds.length === 0}
                        class="px-8 py-3 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:opacity-50"
                    >
                        {isSyncing ? 'SYNCING DATA...' : 'START UNIVERSAL SYNC'}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}
