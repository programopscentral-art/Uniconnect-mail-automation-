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
    let editableSets = $state<any>(initializeSets());
    let paperMeta = $state(initializeMeta());

    function initializeSets() {
        const paper = data?.paper;
        if (!paper) return { 'A': { questions: [] }, 'B': { questions: [] }, 'C': { questions: [] }, 'D': { questions: [] } };

        let rawSetsData = paper.sets_data || paper.sets || paper.json_data || {};
        if (typeof rawSetsData === 'string') {
            try { rawSetsData = JSON.parse(rawSetsData); } catch (e) { rawSetsData = {}; }
        }

        const initial: any = {};
        availableSets.forEach(s => {
            const val = rawSetsData[s] || rawSetsData[s.toLowerCase()];
            initial[s] = val ? JSON.parse(JSON.stringify(val)) : { questions: [] };
        });
        return initial;
    }

    function initializeMeta() {
        const paper = data?.paper;
        if (!paper) return {
            paper_date: '', exam_time: '', duration_minutes: '180', max_marks: '100',
            course_code: 'CS-XXXX', subject_name: 'Question Paper',
            exam_title: 'SEMESTER END EXAMINATIONS - NOV/DEC 2025',
            programme: 'B.Tech - COMPUTER SCIENCE AND ENGINEERING',
            semester: '1', instructions: 'ANSWER ALL QUESTIONS'
        };

        let rawSetsData = paper.sets_data || paper.sets || paper.json_data || {};
        if (typeof rawSetsData === 'string') {
            try { rawSetsData = JSON.parse(rawSetsData); } catch (e) { rawSetsData = {}; }
        }

        const meta = rawSetsData.metadata || rawSetsData.editor_metadata || paper.meta || {};
        return {
            paper_date: meta.paper_date || paper.paper_date?.split('T')[0] || new Date().toISOString().split('T')[0],
            exam_time: meta.exam_time || '',
            duration_minutes: String(meta.duration_minutes || paper.duration_minutes || 180),
            max_marks: String(meta.max_marks || paper.max_marks || 100),
            course_code: meta.course_code || paper.subject_code || 'CS-XXXX',
            subject_name: meta.subject_name || paper.subject_name || 'Question Paper',
            exam_title: meta.exam_title || paper.exam_title || 'SEMESTER END EXAMINATIONS - NOV/DEC 2025',
            programme: meta.programme || paper.branch_name || 'B.Tech - COMPUTER SCIENCE AND ENGINEERING',
            semester: String(meta.semester || paper.semester || 1),
            instructions: meta.instructions || paper.instructions || 'ANSWER ALL QUESTIONS'
        };
    }

    // Handle data changes from server (rare but good for safety)
    $effect(() => {
        if (data.paper?.id) {
             // In Svelte 5, we might not need to do anything here if we reset state on navigation
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

<div class="max-w-6xl mx-auto space-y-6 pb-32 print:p-0 print:m-0 print:max-w-none">
    <!-- Top Bar with Set Selector Integrated -->
    <div class="bg-gray-900 text-white rounded-[2rem] p-4 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 print:hidden">
        <div class="flex items-center gap-6 px-4">
            <a 
                href="/assessments"
                class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                title="Back to Papers"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
            </a>

             <div class="space-y-0.5">
                <div class="flex items-center gap-2 text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]">
                    <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    Editor State: Ready
                </div>
                <h1 class="text-xl font-black tracking-tight uppercase leading-none">{data.paper?.subject_name || 'Question Paper'}</h1>
            </div>
            
            <div class="h-8 w-px bg-white/10 hidden md:block"></div>

            <!-- Set Selector -->
            <div class="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
                {#each availableSets as set}
                    <button 
                        onclick={() => activeSet = set}
                        class="px-5 py-2.5 rounded-lg text-[10px] font-black tracking-tighter transition-all duration-300 uppercase
                        {activeSet === set ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}"
                    >
                        SET {set}
                    </button>
                {/each}
            </div>
        </div>

        <div class="flex items-center gap-3 px-4">
            <a 
                href="/assessments/generate"
                class="inline-flex items-center px-4 py-3 bg-white/5 text-indigo-400 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-indigo-500/30"
            >
                GENERATE NEW
            </a>

            <button 
                onclick={saveChanges}
                disabled={isSaving}
                class="inline-flex items-center px-6 py-3 bg-green-600 text-white text-[10px] font-black rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-900/20 disabled:opacity-50 active:scale-95"
            >
                {#if isSaving}
                    <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    SAVING...
                {:else}
                    <svg class="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                    SAVE CHANGES
                {/if}
            </button>
            <button 
                onclick={downloadPDF}
                aria-label="Download as PDF or Print"
                class="inline-flex items-center px-4 py-3 bg-white/5 text-gray-300 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            </button>
            <button 
                onclick={downloadDOCX}
                aria-label="Download as DOCX (MS Word)"
                class="inline-flex items-center px-4 py-3 bg-white/5 text-gray-300 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </button>
        </div>
    </div>

    <!-- Paper View (Crescent Template) -->
    <div id="paper-content" class="bg-white rounded-[1rem] shadow-2xl overflow-hidden print:shadow-none print:m-0 print:p-0 border border-gray-100 min-h-screen">
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
            <div class="p-32 text-center space-y-6">
                <div class="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div class="space-y-1">
                    <p class="text-gray-900 font-black uppercase tracking-[0.3em] text-sm">INITIALIZING PAPER</p>
                    <p class="text-gray-400 text-[10px] font-bold">PLEASE WAIT WHILE WE COMPILE THE DATA</p>
                </div>
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
