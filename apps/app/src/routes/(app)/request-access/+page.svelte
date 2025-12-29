<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';

    export let data;
    const { universities, existingRequests } = data;

    let selectedUniversities: string[] = [];
    let submitting = false;
    let message = '';
    let error = '';

    async function handleSubmit() {
        if (selectedUniversities.length === 0) {
            error = 'Please select at least one college';
            return;
        }

        submitting = true;
        error = '';
        message = '';

        try {
            const res = await fetch('/api/users/request-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ universityIds: selectedUniversities })
            });

            if (res.ok) {
                message = 'Access request sent successfully! You will be notified once admin approves.';
                selectedUniversities = [];
            } else {
                const d = await res.json();
                error = d.message || 'Failed to send request';
            }
        } catch (err) {
            error = 'An error occurred. Please try again.';
        } finally {
            submitting = false;
        }
    }

    function toggleUniversity(id: string) {
        if (selectedUniversities.includes(id)) {
            selectedUniversities = selectedUniversities.filter(i => i !== id);
        } else {
            selectedUniversities = [...selectedUniversities, id];
        }
    }
</script>

<div class="max-w-4xl mx-auto p-6" in:fade>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-8 border-bottom border-slate-100 bg-slate-50">
            <h1 class="text-2xl font-bold text-slate-900 mb-2">Request College Access</h1>
            <p class="text-slate-600">Select the colleges you need access to. Your request will be sent to the admin for approval.</p>
        </div>

        <div class="p-8">
            {#if message}
                <div class="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 flex items-center gap-3">
                    <span class="text-xl">✓</span> {message}
                </div>
            {/if}

            {#if error}
                <div class="mb-6 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 flex items-center gap-3">
                    <span class="text-xl">⚠</span> {error}
                </div>
            {/if}

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {#each universities as univ}
                    <button 
                        on:click={() => toggleUniversity(univ.id)}
                        class="p-4 rounded-xl border text-left transition-all duration-200 flex items-center justify-between {selectedUniversities.includes(univ.id) ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300 bg-white'}"
                    >
                        <div>
                            <div class="font-semibold {selectedUniversities.includes(univ.id) ? 'text-blue-700' : 'text-slate-700'}">{univ.name}</div>
                            <div class="text-xs text-slate-500 uppercase tracking-wider mt-1">{univ.slug}</div>
                        </div>
                        {#if selectedUniversities.includes(univ.id)}
                            <div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                                </svg>
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>

            <button 
                on:click={handleSubmit}
                disabled={submitting || selectedUniversities.length === 0}
                class="w-full md:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {submitting ? 'Sending Request...' : 'Submit Access Request'}
            </button>
        </div>

        {#if existingRequests.length > 0}
            <div class="p-8 border-t border-slate-100 bg-slate-50/50">
                <h3 class="font-bold text-slate-900 mb-4">Your Recent Requests</h3>
                <div class="space-y-3">
                    {#each existingRequests as req}
                        <div class="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                                <div class="text-sm font-medium text-slate-600">Requested {new Date(req.created_at).toLocaleDateString()}</div>
                                <div class="text-xs text-slate-400 mt-1">{req.university_ids.length} Universities</div>
                            </div>
                            <div class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider 
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
    </div>
</div>
