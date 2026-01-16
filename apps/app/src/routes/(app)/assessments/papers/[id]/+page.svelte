<script lang="ts">
    import { page } from '$app/stores';
    import { slide, fade, fly } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation';
    import CrescentTemplate from '$lib/components/assessments/CrescentTemplate.svelte';

    let { data } = $props();

    // Local state for editing
    let activeSet = $state('A');
    const availableSets = ['A', 'B', 'C', 'D'];
    
    // We deep clone paper data to allow local edits
    let editableSets = $state<any>({});
    let paperMeta = $state({
        paper_date: '',
        exam_time: '',
        duration_minutes: '180',
        max_marks: '100',
        course_code: 'CS-XXXX',
        exam_title: 'SEMESTER END EXAMINATIONS - NOV/DEC 2025',
        programme: 'B.Tech - COMPUTER SCIENCE AND ENGINEERING',
        semester: '1',
        instructions: 'ANSWER ALL QUESTIONS'
    });

    // Initialize state from data
    $effect(() => {
        const paper = data?.paper;
        if (!paper) return;

        const rawSetsData = paper.sets_data || paper.sets || paper.json_data || {};
        
        // Only initialize if we haven't already
        if (Object.keys(editableSets).length === 0) {
            const initial: any = {};
            availableSets.forEach(s => {
                const val = rawSetsData[s] || rawSetsData[s.toLowerCase()];
                initial[s] = val || { questions: [] };
            });
            editableSets = initial;

            const meta = rawSetsData.metadata || rawSetsData.editor_metadata || paper.meta || {};
            paperMeta = {
                paper_date: meta.paper_date || paper.paper_date?.split('T')[0] || new Date().toISOString().split('T')[0],
                exam_time: meta.exam_time || '',
                duration_minutes: String(meta.duration_minutes || paper.duration_minutes || 180),
                max_marks: String(meta.max_marks || paper.max_marks || 100),
                course_code: meta.course_code || paper.subject_code || 'CS-XXXX',
                exam_title: meta.exam_title || 'SEMESTER END EXAMINATIONS - NOV/DEC 2025',
                programme: meta.programme || paper.branch_name || 'B.Tech - COMPUTER SCIENCE AND ENGINEERING',
                semester: String(meta.semester || paper.semester || 1),
                instructions: meta.instructions || 'ANSWER ALL QUESTIONS'
            };
        }
    });

    // Helper to find paper structure based on marks
    let paperStructure = $derived.by(() => {
        const marks = Number(paperMeta.max_marks);
        const is100 = marks === 100;
        if (is100) {
            return [
                { title: 'PART A', marks_per_q: 2, count: 10, answered_count: 10 },
                { title: 'PART B', marks_per_q: 16, count: 5, answered_count: 4 },
                { title: 'PART C', marks_per_q: 16, count: 1, answered_count: 1 }
            ];
        } else {
            return [
                { title: 'PART A', marks_per_q: 2, count: 5, answered_count: 5 },
                { title: 'PART B', marks_per_q: 5, count: 8, answered_count: 8 }
            ];
        }
    });

    let isSaving = $state(false);

    async function saveChanges() {
        isSaving = true;
        try {
            const res = await fetch(`/api/assessments/papers/${data.paper.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    sets_data: { 
                        ...editableSets,
                        metadata: {
                            ...paperMeta,
                            max_marks: Number(paperMeta.max_marks),
                            duration_minutes: Number(paperMeta.duration_minutes)
                        }
                    },
                    ...paperMeta
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                alert('Changes saved successfully!');
                await invalidateAll();
            }
        } catch (err) {
            console.error(err);
            alert('Failed to save changes');
        } finally {
            isSaving = false;
        }
    }

    function downloadPDF() {
        window.print();
    }

    function downloadDOCX() {
        const content = document.getElementById('paper-content')?.innerHTML;
        if (!content) return;
        
        const header = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><title>Question Paper</title></head><body>`;
        const footer = "</body></html>";
        const sourceHTML = header + content + footer;
        
        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = source;
        fileDownload.download = `${data.paper.subject_name}_Paper.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
    }
</script>

<div class="max-w-6xl mx-auto space-y-8 pb-32 print:p-0 print:m-0 print:max-w-none">
    <!-- toolbar -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden px-4 md:px-0">
        <div class="space-y-1">
            <div class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Live Assessment Editor
            </div>
            <h1 class="text-3xl font-black text-gray-900 tracking-tight uppercase">{data.paper?.subject_name || 'Question Paper'}</h1>
        </div>
        
        <div class="flex flex-wrap gap-3">
            <button 
                onclick={saveChanges}
                disabled={isSaving}
                class="inline-flex items-center px-8 py-4 bg-green-600 text-white text-xs font-black rounded-2xl hover:bg-green-700 transition-all shadow-xl shadow-green-100 disabled:opacity-50 active:scale-95 text-center justify-center min-w-[200px]"
            >
                {#if isSaving}
                    <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    SAVING CHANGES...
                {:else}
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                    SAVE PAPER CHANGES
                {/if}
            </button>
            <div class="flex gap-2">
                <button 
                    onclick={downloadPDF}
                    class="inline-flex items-center px-6 py-3 bg-white border border-gray-200 text-gray-600 text-xs font-black rounded-2xl hover:bg-gray-50 transition-all shadow-sm"
                >
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    PDF / PRINT
                </button>
                <button 
                    onclick={downloadDOCX}
                    class="inline-flex items-center px-6 py-3 bg-white border border-gray-200 text-gray-600 text-xs font-black rounded-2xl hover:bg-gray-50 transition-all shadow-sm"
                >
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    DOCX (WORD)
                </button>
            </div>
        </div>
    </div>

    <!-- Set Selector -->
    <div class="bg-gray-100/50 p-2 rounded-[2rem] border border-gray-200 shadow-inner flex gap-2 print:hidden backdrop-blur-sm">
        {#each availableSets as set}
            <button 
                onclick={() => activeSet = set}
                class="flex-1 py-4 rounded-[1.5rem] text-sm font-black transition-all duration-300
                {activeSet === set ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 scale-102' : 'text-gray-400 hover:text-gray-600 hover:bg-white/80'}"
            >
                VIEW SET {set}
            </button>
        {/each}
    </div>

    <!-- Paper View (Crescent Template) -->
    <div id="paper-content" class="bg-white rounded-[1rem] shadow-2xl overflow-hidden print:shadow-none print:m-0 print:p-0 border border-gray-100">
        {#if editableSets[activeSet]}
            <CrescentTemplate 
                bind:paperMeta 
                bind:currentSetData={editableSets[activeSet]} 
                paperStructure={paperStructure}
                activeSet={activeSet}
                courseOutcomes={data.courseOutcomes}
                questionPool={data.questionPool}
                mode="edit"
            />
        {:else}
            <div class="p-20 text-center space-y-4">
                <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p class="text-gray-400 font-black uppercase tracking-widest text-xs">Loading Paper Content...</p>
            </div>
        {/if}
    </div>
</div>

<style>
    @media print {
        :global(body) {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        .print\:hidden {
            display: none !important;
        }
    }

    :global(.tracking-widest) {
        letter-spacing: 0.15em;
    }
</style>
