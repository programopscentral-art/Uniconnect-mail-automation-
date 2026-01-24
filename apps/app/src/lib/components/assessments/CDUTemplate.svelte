<script lang="ts">
    import { fade } from 'svelte/transition';

    let { 
        paperMeta = $bindable({}), 
        currentSetData = $bindable({ questions: [] }), 
        courseOutcomes = [],
        isEditable = false,
        activeSet = 'A'
    } = $props();

    let activeMenuId = $state<string | null>(null);

    // Global click listener for closing menus
    $effect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.group\\/mark') && !target.closest('.group\\/btn')) {
                activeMenuId = null;
            }
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    });

    const safeQuestions = $derived(currentSetData.questions || []);

    // Filter questions by part (CDU uses Sections A and B)
    const partAQuestions = $derived(safeQuestions.filter(q => q.part === 'A'));
    const partBQuestions = $derived(safeQuestions.filter(q => q.part === 'B'));

    function updateText(e: any, type: 'META' | 'QUESTION', field: string, slotId?: string, qId?: string) {
        if (!isEditable) return;
        const val = e.target.innerText;
        window.dispatchEvent(new CustomEvent('updateText', {
            detail: { type, field, slotId, qId, value: val }
        }));
    }

    function updateCO(slotId: string, qId: string, coId: string) {
        if (!isEditable) return;
        window.dispatchEvent(new CustomEvent('updateCO', {
            detail: { slotId, qId, coId }
        }));
    }

    function getCOCode(id: string) {
        return courseOutcomes.find(c => c.id === id)?.code || '';
    }
</script>

<div id="crescent-paper-actual" class="w-full max-w-[210mm] mx-auto bg-white min-h-[297mm] p-[15mm] shadow-2xl print:shadow-none print:p-0 transition-all duration-500 font-serif text-black relative">
    
    <!-- Watermark (Subtle) -->
    <div class="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] rotate-[-45deg] overflow-hidden select-none">
        <span class="text-[120px] font-black tracking-tighter uppercase whitespace-nowrap">CDU ASSESSMENT</span>
    </div>

    <!-- Header Section -->
    <header class="text-center space-y-2 border-b-2 border-black pb-4 mb-4 relative z-10">
        <h3 class="text-sm font-bold uppercase tracking-widest">Set - {activeSet}</h3>
        <h1 class="text-2xl font-black uppercase tracking-tight">CHAITANYA</h1>
        <h2 class="text-lg font-bold uppercase tracking-tighter">(DEEMED TO BE UNIVERSITY)</h2>
        <h3 class="text-md font-bold uppercase">{paperMeta.exam_title || 'I INTERNAL EXAMINATIONS'}</h3>
        <h4 class="text-md font-bold uppercase text-red-600 print:text-black">{paperMeta.programme || 'BS(CS) & II SEMESTER'}</h4>
        <h4 class="text-md font-black uppercase underline decoration-2 underline-offset-4">{paperMeta.subject_name || 'SUBJECT NAME'}</h4>
        
        <div class="flex justify-between items-end mt-6 px-1">
            <div class="text-left">
                <span class="font-bold underline decoration-1 underline-offset-4">Time: {paperMeta.duration_minutes ? (Number(paperMeta.duration_minutes)/60).toFixed(1) : '1.5'} Hrs.]</span>
            </div>
            <div class="text-right">
                <span class="font-bold underline decoration-1 underline-offset-4">[Max. Marks: {paperMeta.max_marks || '20'}</span>
            </div>
        </div>
    </header>

    <!-- Content -->
    <main class="space-y-6 relative z-10">
        
        <!-- Section A -->
        <section class="space-y-4">
            <div class="flex items-center justify-between border-y-2 border-black py-1 px-2">
                <h2 class="text-lg font-black uppercase tracking-widest italic">Section - A</h2>
            </div>
            
            <div class="flex justify-between items-center px-2 py-1 italic font-bold border-b border-black">
                <span>Answer any six Questions.</span>
                <span>6 x 2 = 12</span>
            </div>

            <div class="divide-y divide-black/10">
                {#each partAQuestions as q, i}
                    <div class="group relative py-3 px-1 flex gap-4 min-h-[50px] hover:bg-slate-50 transition-colors">
                        <span class="font-bold min-w-[24px]">{i + 1}.</span>
                        <div class="flex-1 space-y-2">
                            <div 
                                contenteditable={isEditable}
                                onblur={(e) => updateText(e, 'QUESTION', 'text', q.id, q.questions?.[0]?.id)}
                                class="text-sm leading-relaxed outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 whitespace-pre-wrap"
                            >
                                {q.questions?.[0]?.text || ''}
                            </div>
                        </div>

                        <!-- Marks Holder -->
                        <div class="min-w-[40px] flex items-start justify-end pt-1">
                            <span class="text-xs font-bold">[2]</span>
                        </div>
                    </div>
                {/each}
            </div>
        </section>

        <!-- Section B -->
        <section class="space-y-4">
            <div class="flex items-center justify-between border-y-2 border-black py-1 px-2">
                <h2 class="text-lg font-black uppercase tracking-widest italic">Section - B</h2>
            </div>
            
            <div class="flex justify-between items-center px-2 py-1 italic font-bold border-b border-black">
                <span>Answer the following Questions.</span>
                <span>2 x 4 = 8</span>
            </div>

            <div class="space-y-12 mt-4">
                {#each partBQuestions as q, i}
                    <div class="space-y-6">
                        <!-- Question Choice 1 -->
                        <div class="group relative py-2 px-1 flex gap-4 hover:bg-slate-50 transition-colors">
                            <span class="font-bold min-w-[24px]">{11 + i*2}.</span>
                            <div class="flex-1 space-y-2">
                                <div 
                                    contenteditable={isEditable}
                                    onblur={(e) => updateText(e, 'QUESTION', 'text', q.id, q.choice1?.questions?.[0]?.id)}
                                    class="text-sm leading-relaxed outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 whitespace-pre-wrap"
                                >
                                    {q.choice1?.questions?.[0]?.text || ''}
                                </div>
                            </div>
                            <div class="min-w-[40px] flex items-start justify-end pt-1">
                                <span class="text-xs font-bold">[4]</span>
                            </div>
                        </div>

                        <!-- OR separator -->
                        <div class="relative py-4">
                            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-black/5"></div></div>
                            <div class="relative flex justify-center text-xs font-black uppercase tracking-[0.5em] bg-white px-4">OR</div>
                        </div>

                        <!-- Question Choice 2 -->
                        <div class="group relative py-2 px-1 flex gap-4 hover:bg-slate-50 transition-colors">
                            <span class="font-bold min-w-[24px]">{11 + i*2 + 1}.</span>
                            <div class="flex-1 space-y-2">
                                <div 
                                    contenteditable={isEditable}
                                    onblur={(e) => updateText(e, 'QUESTION', 'text', q.id, q.choice2?.questions?.[0]?.id)}
                                    class="text-sm leading-relaxed outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 whitespace-pre-wrap"
                                >
                                    {q.choice2?.questions?.[0]?.text || ''}
                                </div>
                            </div>
                            <div class="min-w-[40px] flex items-start justify-end pt-1">
                                <span class="text-xs font-bold">[4]</span>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    </main>

    <!-- Footer Meta -->
    <footer class="mt-20 pt-4 border-t border-black/10 flex justify-between items-center text-[10px] font-bold text-black/30 print:hidden uppercase tracking-widest">
        <span>Automatic Question Generation System</span>
        <span>CDU-LAYOUT-V1</span>
    </footer>
</div>

<style>
    @font-face {
        font-family: 'Times New Roman';
        font-display: swap;
    }
    
    :global(.print-mode) #crescent-paper-actual {
        box-shadow: none !important;
        padding: 0 !important;
    }

    #crescent-paper-actual {
        font-family: 'Times New Roman', Times, serif;
    }

    [contenteditable]:empty:before {
        content: attr(placeholder);
        color: #cbd5e1;
        font-style: italic;
    }

    @media print {
        h4.text-red-600 {
            color: black !important;
        }
    }
</style>
