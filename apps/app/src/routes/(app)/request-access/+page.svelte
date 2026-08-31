<script lang="ts">
    import { fade, slide } from 'svelte/transition';

    let { data } = $props();
    const { universities, existingRequests } = data;

    // Step state
    let step = $state(1); // 1 = university, 2 = role, 3 = subjects (optional), 4 = confirm

    // Selections
    let selectedUniversities: string[] = $state([]);
    let roleIntent = $state('');
    let selectedSubjectIds: string[] = $state([]);
    let selectedSubjectNames: string[] = $state([]);

    const roleOptions = [
        { id: 'FACULTY', label: 'Faculty / Instructor', desc: 'I teach courses and manage student assessments', icon: 'book', needsSubjects: true },
        { id: 'CMA', label: 'CMA (Campus Manager Associate)', desc: 'I manage campus operations and coordinate activities', icon: 'campus' },
        { id: 'CMA_MANAGER', label: 'CMA Manager', desc: 'I oversee CMA teams across campuses', icon: 'campus' },
        { id: 'COS', label: 'COS (Chief of Staff)', desc: 'I lead operational strategy and execution', icon: 'lead' },
        { id: 'PM', label: 'PM (Program Manager)', desc: 'I manage program delivery and outcomes', icon: 'manage' },
        { id: 'PMA', label: 'PMA (Program Manager Associate)', desc: 'I assist in program delivery and coordination', icon: 'manage' },
        { id: 'BOA', label: 'BOA (Business Operations Associate)', desc: 'I handle business operations and analytics', icon: 'analytics' },
        { id: 'PROGRAM_OPS', label: 'Program Operations', desc: 'I handle day-to-day program operations', icon: 'ops' },
        { id: 'UNIVERSITY_OPERATOR', label: 'University Operator', desc: 'I manage university-level operations', icon: 'campus' },
        { id: 'SET_REVIEWER', label: 'SET Reviewer', desc: 'I review student evaluation and assessments', icon: 'review' },
        { id: 'PROPOSER', label: 'Proposer', desc: 'I create and submit budget proposals', icon: 'budget' },
        { id: 'FACILITIES', label: 'Facilities (Finance Ops)', desc: 'I disburse petty cash, verify bills and settle payments', icon: 'budget' },
        { id: 'STAKEHOLDER', label: 'Stakeholder', desc: 'I need view access for monitoring and oversight', icon: 'view' },
    ];

    const selectedRoleNeedsSubjects = $derived(roleOptions.find(r => r.id === roleIntent)?.needsSubjects ?? false);

    const stepList = $derived(selectedRoleNeedsSubjects
        ? [{ n: 1, label: 'Institution', display: 1 }, { n: 2, label: 'Role', display: 2 }, { n: 3, label: 'Subjects', display: 3 }, { n: 4, label: 'Confirm', display: 4 }]
        : [{ n: 1, label: 'Institution', display: 1 }, { n: 2, label: 'Role', display: 2 }, { n: 4, label: 'Confirm', display: 3 }]
    );

    // Subjects for selected universities
    let availableSubjects: any[] = $state([]);
    let subjectSearch = $state('');
    let loadingSubjects = $state(false);

    // Submit
    let submitting = $state(false);
    let submitted = $state(false);
    let submitError = $state('');

    const selectedUnivNames = $derived(
        universities.filter((u: any) => selectedUniversities.includes(u.id)).map((u: any) => u.name)
    );

    const filteredSubjects = $derived(
        subjectSearch.trim()
            ? availableSubjects.filter(s =>
                s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                s.code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
                s.program_name.toLowerCase().includes(subjectSearch.toLowerCase())
              )
            : availableSubjects
    );

    // Group subjects by program
    const subjectsByProgram = $derived(
        filteredSubjects.reduce((acc: Record<string, any[]>, s: any) => {
            const key = s.program_name;
            if (!acc[key]) acc[key] = [];
            acc[key].push(s);
            return acc;
        }, {} as Record<string, any[]>)
    );

    async function loadSubjects() {
        if (!selectedUniversities.length) return;
        loadingSubjects = true;
        try {
            const all: any[] = [];
            for (const uid of selectedUniversities) {
                const res = await fetch(`/api/academic/subjects/by-university?universityId=${uid}`);
                if (res.ok) {
                    const data = await res.json();
                    all.push(...data);
                }
            }
            // Deduplicate by subject id
            const seen = new Set<string>();
            availableSubjects = all.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
        } catch { /* silently fail */ } finally {
            loadingSubjects = false;
        }
    }

    function toggleUniversity(id: string) {
        if (selectedUniversities.includes(id)) {
            selectedUniversities = selectedUniversities.filter(i => i !== id);
        } else {
            selectedUniversities = [...selectedUniversities, id];
        }
    }

    function toggleSubject(s: any) {
        if (selectedSubjectIds.includes(s.id)) {
            selectedSubjectIds = selectedSubjectIds.filter(i => i !== s.id);
            selectedSubjectNames = selectedSubjectNames.filter(n => n !== s.name);
        } else {
            selectedSubjectIds = [...selectedSubjectIds, s.id];
            selectedSubjectNames = [...selectedSubjectNames, s.name];
        }
    }

    function goToStep(n: number) {
        step = n;
    }

    async function nextFromUniversity() {
        if (!selectedUniversities.length) return;
        step = 2;
    }

    async function nextFromRole() {
        if (!roleIntent) return;
        if (selectedRoleNeedsSubjects) {
            await loadSubjects();
            step = 3;
        } else {
            step = 4;
        }
    }

    function nextFromSubjects() {
        step = 4;
    }

    // Total steps depends on whether subjects step is needed
    const totalSteps = $derived(selectedRoleNeedsSubjects ? 4 : 3);
    // Map logical step to display step number (for non-faculty, step 4 becomes step 3)
    function displayStep(s: number) {
        if (!selectedRoleNeedsSubjects && s === 4) return 3;
        return s;
    }

    async function handleSubmit() {
        submitting = true;
        submitError = '';
        try {
            const res = await fetch('/api/users/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    universityIds: selectedUniversities,
                    roleIntent,
                    subjectIds: selectedSubjectIds,
                    subjectNames: selectedSubjectNames
                })
            });

            if (res.ok) {
                submitted = true;
                selectedUniversities = [];
                roleIntent = '';
                selectedSubjectIds = [];
                selectedSubjectNames = [];
                step = 1;
            } else {
                const d = await res.json().catch(() => ({}));
                submitError = d.message || 'Failed to send request. Please try again.';
            }
        } catch {
            submitError = 'An error occurred. Please try again.';
        } finally {
            submitting = false;
        }
    }
</script>

<div class="max-w-2xl mx-auto p-6" in:fade>

    {#if submitted}
        <div class="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 text-center" in:fade>
            <div class="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <h2 class="text-xl font-black text-slate-900 mb-2">Request Sent!</h2>
            <p class="text-sm text-slate-500 mb-6">Your access request has been sent to the admin. You'll be notified once it's reviewed.</p>
            <button
                onclick={() => submitted = false}
                class="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
            >
                Make Another Request
            </button>
        </div>
    {:else}
        <!-- Header + Progress -->
        <div class="mb-6">
            <h1 class="text-xl font-black text-slate-900 mb-1">Request Institution Access</h1>
            <p class="text-sm text-slate-500">Complete the steps below to request access</p>

            <!-- Step Indicators -->
            <div class="flex items-center gap-2 mt-4">
                {#each stepList as s, i}
                    {#if i > 0}
                        <div class="flex-1 h-0.5 {step >= s.n ? 'bg-indigo-400' : 'bg-slate-200'} rounded-full"></div>
                    {/if}
                    <div class="flex items-center gap-1.5 shrink-0">
                        <div class="w-7 h-7 rounded-full text-xs font-black flex items-center justify-center transition-all
                            {step === s.n ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' :
                             step > s.n ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}">
                            {#if step > s.n}
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                </svg>
                            {:else}
                                {s.display}
                            {/if}
                        </div>
                        <span class="text-[10px] font-black uppercase tracking-widest hidden sm:block
                            {step === s.n ? 'text-indigo-600' : step > s.n ? 'text-emerald-600' : 'text-slate-400'}">
                            {s.label}
                        </span>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Card -->
        <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">

            <!-- STEP 1: Select University -->
            {#if step === 1}
                <div in:slide>
                    <div class="p-6 border-b border-slate-100">
                        <h2 class="font-black text-slate-900">Select Institution(s)</h2>
                        <p class="text-xs text-slate-500 mt-1">Choose the institution(s) you need access to</p>
                    </div>
                    <div class="p-6">
                        <div class="grid grid-cols-1 gap-3 mb-6">
                            {#each universities as univ}
                                {@const selected = selectedUniversities.includes(univ.id)}
                                <button
                                    onclick={() => toggleUniversity(univ.id)}
                                    class="p-4 rounded-2xl border-2 text-left transition-all duration-200 flex items-center justify-between
                                        {selected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}"
                                >
                                    <div>
                                        <div class="font-bold text-sm {selected ? 'text-indigo-700' : 'text-slate-700'}">{univ.name}</div>
                                        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{univ.slug}</div>
                                    </div>
                                    {#if selected}
                                        <div class="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                            </svg>
                                        </div>
                                    {:else}
                                        <div class="w-6 h-6 rounded-full border-2 border-slate-300 flex-shrink-0"></div>
                                    {/if}
                                </button>
                            {/each}
                        </div>
                        <button
                            onclick={nextFromUniversity}
                            disabled={!selectedUniversities.length}
                            class="w-full py-3 bg-indigo-600 text-white rounded-2xl text-sm font-black tracking-wide hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-100"
                        >
                            Continue →
                        </button>
                    </div>
                </div>

            <!-- STEP 2: Role Selection -->
            {:else if step === 2}
                <div in:slide>
                    <div class="p-6 border-b border-slate-100">
                        <button onclick={() => goToStep(1)} class="text-xs font-bold text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1">
                            ← Back
                        </button>
                        <h2 class="font-black text-slate-900">What's your role?</h2>
                        <p class="text-xs text-slate-500 mt-1">Select the role that best describes how you'll use the platform</p>
                    </div>
                    <div class="p-6">
                        <div class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                            {#each roleOptions as role}
                                {@const selected = roleIntent === role.id}
                                <button
                                    onclick={() => { roleIntent = role.id; }}
                                    class="w-full p-4 rounded-2xl border-2 text-left transition-all duration-200
                                        {selected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}"
                                >
                                    <div class="flex items-center gap-3">
                                        <div class="w-9 h-9 rounded-xl {selected ? 'bg-indigo-500' : 'bg-slate-100'} flex items-center justify-center flex-shrink-0 transition-colors">
                                            <svg class="w-4.5 h-4.5 {selected ? 'text-white' : 'text-slate-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {#if role.icon === 'book'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                                                {:else if role.icon === 'campus'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                                                {:else if role.icon === 'lead'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                                {:else if role.icon === 'manage'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                                                {:else if role.icon === 'analytics'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                                                {:else if role.icon === 'ops'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                                {:else if role.icon === 'review'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                                {:else if role.icon === 'budget'}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                                {:else}
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                                {/if}
                                            </svg>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-bold text-sm {selected ? 'text-indigo-700' : 'text-slate-800'}">{role.label}</div>
                                            <div class="text-xs text-slate-500 mt-0.5">{role.desc}</div>
                                        </div>
                                        {#if selected}
                                            <div class="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
                                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                                </svg>
                                            </div>
                                        {/if}
                                    </div>
                                </button>
                            {/each}
                        </div>

                        <button
                            onclick={nextFromRole}
                            disabled={!roleIntent}
                            class="w-full py-3 bg-indigo-600 text-white rounded-2xl text-sm font-black tracking-wide hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-100 mt-4"
                        >
                            {selectedRoleNeedsSubjects ? 'Continue — Select Subjects →' : 'Continue →'}
                        </button>
                    </div>
                </div>

            <!-- STEP 3: Subject Selection (Faculty only) -->
            {:else if step === 3}
                <div in:slide>
                    <div class="p-6 border-b border-slate-100">
                        <button onclick={() => goToStep(2)} class="text-xs font-bold text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1">
                            ← Back
                        </button>
                        <div class="flex items-center justify-between">
                            <div>
                                <h2 class="font-black text-slate-900">Which subjects do you teach?</h2>
                                <p class="text-xs text-slate-500 mt-1">Select all subjects that apply — admin will verify</p>
                            </div>
                            {#if selectedSubjectIds.length > 0}
                                <div class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-black">
                                    {selectedSubjectIds.length} selected
                                </div>
                            {/if}
                        </div>
                    </div>

                    <div class="p-6">
                        <!-- Search -->
                        <div class="relative mb-4">
                            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                            <input
                                bind:value={subjectSearch}
                                type="text"
                                placeholder="Search subjects, codes, or programs..."
                                class="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                            />
                        </div>

                        {#if loadingSubjects}
                            <div class="py-10 text-center">
                                <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                <p class="text-xs text-slate-400">Loading subjects...</p>
                            </div>
                        {:else if availableSubjects.length === 0}
                            <div class="py-10 text-center">
                                <p class="text-sm text-slate-400">No subjects found for the selected institution(s).</p>
                                <p class="text-xs text-slate-400 mt-1">The admin will assign subjects after approval.</p>
                            </div>
                        {:else}
                            <div class="space-y-4 max-h-80 overflow-y-auto pr-1">
                                {#each Object.entries(subjectsByProgram) as [program, subjects]}
                                    <div>
                                        <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{program}</div>
                                        <div class="space-y-1.5">
                                            {#each subjects as s}
                                                {@const sel = selectedSubjectIds.includes(s.id)}
                                                <button
                                                    onclick={() => toggleSubject(s)}
                                                    class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                                                        {sel ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 bg-white'}"
                                                >
                                                    <div class="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all
                                                        {sel ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}">
                                                        {#if sel}
                                                            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                                            </svg>
                                                        {/if}
                                                    </div>
                                                    <div class="flex-1 min-w-0">
                                                        <div class="text-xs font-bold {sel ? 'text-indigo-700' : 'text-slate-700'} truncate">{s.name}</div>
                                                        <div class="text-[10px] text-slate-400 font-mono">{s.code} · {s.term_name}</div>
                                                    </div>
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}

                        <button
                            onclick={nextFromSubjects}
                            class="w-full py-3 bg-indigo-600 text-white rounded-2xl text-sm font-black tracking-wide hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100 mt-5"
                        >
                            {selectedSubjectIds.length ? `Continue with ${selectedSubjectIds.length} subject${selectedSubjectIds.length > 1 ? 's' : ''} →` : 'Skip — I\'ll confirm later →'}
                        </button>
                    </div>
                </div>

            <!-- STEP 4: Confirm + Submit -->
            {:else if step === 4}
                <div in:slide>
                    <div class="p-6 border-b border-slate-100">
                        <button onclick={() => goToStep(selectedRoleNeedsSubjects ? 3 : 2)} class="text-xs font-bold text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1">
                            ← Back
                        </button>
                        <h2 class="font-black text-slate-900">Review Your Request</h2>
                        <p class="text-xs text-slate-500 mt-1">Confirm the details below before submitting</p>
                    </div>

                    <div class="p-6 space-y-4">
                        <!-- Summary rows -->
                        <div class="space-y-3">
                            <!-- Institutions -->
                            <div class="p-4 bg-slate-50 rounded-2xl">
                                <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Institution(s)</div>
                                <div class="flex flex-wrap gap-2">
                                    {#each selectedUnivNames as name}
                                        <span class="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700 shadow-sm">{name}</span>
                                    {/each}
                                </div>
                            </div>

                            <!-- Role -->
                            <div class="p-4 bg-slate-50 rounded-2xl flex items-center justify-between">
                                <div>
                                    <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Role</div>
                                    <div class="text-sm font-bold text-slate-800">
                                        {roleOptions.find(r => r.id === roleIntent)?.label || roleIntent}
                                    </div>
                                </div>
                                <div class="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                                    <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                    </svg>
                                </div>
                            </div>

                            <!-- Subjects (Faculty only) -->
                            {#if selectedRoleNeedsSubjects}
                                <div class="p-4 bg-slate-50 rounded-2xl">
                                    <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Subjects to Teach</div>
                                    {#if selectedSubjectNames.length}
                                        <div class="flex flex-wrap gap-1.5">
                                            {#each selectedSubjectNames as name}
                                                <span class="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold">{name}</span>
                                            {/each}
                                        </div>
                                    {:else}
                                        <p class="text-xs text-slate-400 italic">Not specified — admin will assign after approval</p>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        {#if submitError}
                            <div class="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-medium flex items-center gap-2">
                                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                {submitError}
                            </div>
                        {/if}

                        <button
                            onclick={handleSubmit}
                            disabled={submitting}
                            class="w-full py-3.5 bg-indigo-600 text-white rounded-2xl text-sm font-black tracking-wide hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                        >
                            {#if submitting}
                                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Submitting...
                            {:else}
                                Submit Access Request
                            {/if}
                        </button>
                    </div>
                </div>
            {/if}
        </div>

        <!-- Existing Requests -->
        {#if existingRequests.length > 0}
            <div class="mt-6 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden" in:fade>
                <div class="p-5 border-b border-slate-100">
                    <h3 class="font-black text-slate-900 text-sm">Your Previous Requests</h3>
                </div>
                <div class="divide-y divide-slate-50">
                    {#each existingRequests as req}
                        <div class="p-4 flex items-center gap-4">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-xs font-bold text-slate-700">
                                        {req.university_ids?.length ?? 0} Institution{(req.university_ids?.length ?? 0) !== 1 ? 's' : ''}
                                    </span>
                                    {#if req.role_intent}
                                        <span class="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-wider">
                                            {req.role_intent === 'FACULTY' ? 'Faculty' : 'Staff'}
                                        </span>
                                    {/if}
                                    {#if req.requested_subject_ids?.length}
                                        <span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold">
                                            {req.requested_subject_ids.length} subject{req.requested_subject_ids.length !== 1 ? 's' : ''}
                                        </span>
                                    {/if}
                                </div>
                                <div class="text-[10px] text-slate-400 mt-0.5">{new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                            </div>
                            <div class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex-shrink-0
                                {req.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                 req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                 'bg-rose-100 text-rose-700'}">
                                {req.status}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
</div>
