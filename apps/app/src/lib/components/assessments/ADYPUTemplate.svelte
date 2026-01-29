<script lang="ts">
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { fade, fly, slide } from "svelte/transition";
    import AssessmentEditable from './shared/AssessmentEditable.svelte';
    import AssessmentSlotSingle from './shared/AssessmentSlotSingle.svelte';
    import AssessmentSlotOrGroup from './shared/AssessmentSlotOrGroup.svelte';
    import AssessmentRowActions from './shared/AssessmentRowActions.svelte';
    import AssessmentMcqOptions from './shared/AssessmentMcqOptions.svelte';

    let { 
        paperMeta = $bindable({}), 
        currentSetData = $bindable({ questions: [] }),
        paperStructure = $bindable([]),
        activeSet = 'A',
        courseOutcomes = [],
        questionPool = [],
        mode = 'view' 
    } = $props();

    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);
    let swapCounter = $state(0);
    const isEditable = $derived(mode === 'edit' || mode === 'preview');

    function handleDndSync(part: string, items: any[]) {
        const arr = (Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter(Boolean);
        const otherQuestions = arr.filter((q: any) => q.part !== part);
        const result = [...otherQuestions, ...items.map(i => ({...i, part}))];
        if (Array.isArray(currentSetData)) currentSetData = result;
        else currentSetData.questions = result;
    }

    function updateText(val: string, type: 'META' | 'QUESTION', key: string, slotId?: string, qId?: string) {
        if (!isEditable) return;
        if (type === 'META') (paperMeta as any)[key] = val;
        else {
            const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
            const slot = arr.find((s: any) => s.id === slotId);
            if (!slot) return;
            
            let q: any = null;
            if (slot.type === 'OR_GROUP') {
                 q = (slot.choice1?.questions || []).find((item: any) => item.id === qId) || 
                     (slot.choice2?.questions || []).find((item: any) => item.id === qId);
            } else {
                 q = (slot.questions || [slot]).find((item: any) => item.id === qId);
            }
            
            if (q) { 
                q.text = val; 
                q.question_text = val; 
                if(Array.isArray(currentSetData)) currentSetData = [...currentSetData]; 
                else currentSetData.questions = [...currentSetData.questions]; 
            }
        }
    }

    function removeQuestion(slot: any) {
        if (!confirm('Are you sure?')) return;
        if (Array.isArray(currentSetData)) currentSetData = currentSetData.filter((s: any) => s.id !== slot.id);
        else currentSetData.questions = currentSetData.questions.filter((s: any) => s.id !== slot.id);
    }

    function openSwapSidebar(slot: any, part: string, subPart?: 'q1' | 'q2', subQuestionId?: string) {
        let targetQuestion = slot;
        if (slot.type === 'OR_GROUP') {
            const choice = subPart === 'q1' ? slot.choice1 : slot.choice2;
            if (subQuestionId) {
                targetQuestion = (choice.questions || []).find((q: any) => q.id === subQuestionId);
            } else {
                targetQuestion = choice.questions?.[0] || slot;
            }
        } else if (slot.questions?.length) {
             targetQuestion = slot.questions[0];
        }

        const marks = Number(targetQuestion?.marks || slot.marks || paperStructure.find((s: any)=>s.part===part)?.marks_per_q || 0);
        const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        const index = arr.findIndex((s: any) => s.id === slot.id);
        
        swapContext = { 
            slotIndex: index, 
            part, 
            subPart, 
            subQuestionId,
            currentMark: marks,
            alternates: (questionPool || []).filter((q: any) => Number(q.marks || q.mark) === marks && q.id !== targetQuestion?.id) 
        };
        isSwapSidebarOpen = true;
    }

    function selectAlternate(question: any) {
        if (!swapContext) return;
        const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        let slot = arr[swapContext.slotIndex];
        const nQ = { 
            id: question.id, 
            text: question.question_text, 
            question_text: question.question_text, 
            marks: question.marks, 
            options: question.options, 
            part: swapContext.part,
            image_url: question.image_url
        };
        
        if (swapContext.part === 'A') {
            const nArr = [...arr];
            const oldSlot = nArr[swapContext.slotIndex];
            nArr[swapContext.slotIndex] = { ...oldSlot, questions: [nQ] };
            currentSetData = Array.isArray(currentSetData) ? [...nArr] : { ...currentSetData, questions: [...nArr] };
        } else {
            const nArr = [...arr];
            let nSlot = { ...nArr[swapContext.slotIndex] };
            if (nSlot.type === 'OR_GROUP') {
                const choice = swapContext.subPart === 'q1' ? { ...nSlot.choice1 } : { ...nSlot.choice2 };
                if (swapContext.subQuestionId) {
                    const qIdx = choice.questions.findIndex((q: any) => q.id === swapContext.subQuestionId);
                    if (qIdx !== -1) {
                        choice.questions = [...choice.questions];
                        choice.questions[qIdx] = nQ;
                    }
                } else {
                    choice.questions = [nQ];
                }
                if (swapContext.subPart === 'q1') nSlot.choice1 = choice;
                else nSlot.choice2 = choice;
            } else {
                nSlot.questions = [nQ];
            }
            nArr[swapContext.slotIndex] = nSlot;
            currentSetData = Array.isArray(currentSetData) ? [...nArr] : { ...currentSetData, questions: [...nArr] };
        }
        
        swapCounter++;
        isSwapSidebarOpen = false;
    }

    function calcTotal(part: string) {
        if (mode === 'preview' && paperStructure?.length) {
            const section = paperStructure.find((s: any) => s.part === part);
            if (!section) return 0;
            return section.slots.reduce((s: number, slot: any) => s + (Number(slot.marks) || 0), 0);
        }
        const arr = (Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter(Boolean);
        const qs = arr.filter((q: any) => q && q.part === part);
        return qs.reduce((s: number, slot: any) => {
            const m = slot.marks || (slot.type === 'OR_GROUP' ? (slot.choice1?.questions?.[0]?.marks || 0) : (slot.questions?.[0]?.marks || 0));
            return s + (Number(m) || 0);
        }, 0);
    }

    const totalMarksA = $derived(calcTotal('A'));
    const totalMarksB = $derived(calcTotal('B'));
    
    const allQuestions = $derived((Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter(Boolean));
    const questionsA = $derived(allQuestions.filter((slot: any) => slot?.part === 'A'));
    const questionsB = $derived(allQuestions.filter((slot: any) => slot?.part === 'B'));
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50 pt-20">
    <div class="flex-1 overflow-auto p-4 sm:p-8">
        <div id="adypu-paper-actual" class="mx-auto bg-white p-[0.4in] shadow-2xl transition-all duration-500 font-sans text-black relative border border-black" style="width: 8.27in; min-height: 11.69in;">
            
            <!-- ADYPU Header -->
            <div class="border border-black mb-4">
                <div class="text-center font-bold text-[14pt] leading-tight pt-2">
                    <AssessmentEditable value={paperMeta.university_name || 'AJEENKYA D. Y. PATIL UNIVERSITY'} onUpdate={(v: string) => updateText(v, 'META', 'university_name')} class="w-full text-center" />
                </div>
                <div class="text-center font-bold text-[11pt] leading-tight">
                    <AssessmentEditable value={paperMeta.exam_title || 'UNIT TEST – OCT-2025'} onUpdate={(v: string) => updateText(v, 'META', 'exam_title')} class="w-full text-center" />
                </div>
                <div class="text-center font-bold text-[10pt] text-red-600 leading-tight">
                    <AssessmentEditable value={paperMeta.programme_semester || 'B.TECH(CSE) - I SEMESTER'} onUpdate={(v: string) => updateText(v, 'META', 'programme_semester')} class="w-full text-center" />
                </div>
                <div class="text-center font-bold text-[11pt] text-red-600 pb-2">
                    <AssessmentEditable value={paperMeta.subject_name} onUpdate={(v: string) => updateText(v, 'META', 'subject_name')} class="w-full text-center" />
                </div>
                
                <!-- Time and Marks Row -->
                <div class="border-t border-black p-1 px-2 flex justify-between text-[10pt] font-bold">
                    <div class="flex gap-1">
                        <span>Time:</span>
                        <AssessmentEditable value={paperMeta.time_limit || '1 Hrs.'} onUpdate={(v: string) => updateText(v, 'META', 'time_limit')} />
                    </div>
                    <div class="flex gap-1">
                        <span>Max. Marks:</span>
                        <AssessmentEditable value={String(paperMeta.max_marks || '20')} onUpdate={(v: string) => updateText(v, 'META', 'max_marks')} />
                    </div>
                </div>
            </div>

            <!-- SECTION A -->
            <div class="section-container mb-6">
                <div class="flex justify-between items-center text-[10pt] font-bold italic mb-1 border-b border-black pb-1">
                    <AssessmentEditable value={paperMeta.secA_title || 'Attempt any two'} onUpdate={(v: string) => updateText(v, 'META', 'secA_title')} />
                    <AssessmentEditable value={paperMeta.secA_marks_label || '5 x 2 = 10'} onUpdate={(v: string) => updateText(v, 'META', 'secA_marks_label')} />
                </div>
                
                <div class="questions-list space-y-4" use:dndzone={{ items: questionsA, flipDurationMs: 200 }} onconsider={(e) => handleDndSync('A', (e.detail as any).items)} onfinalize={(e) => handleDndSync('A', (e.detail as any).items)}>
                    {#key activeSet + swapCounter}
                        {#each questionsA as slot, i (String(slot.questions?.[0]?.id || slot.id) + activeSet)}
                            <div class="relative group">
                                <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, 'A')} onDelete={() => removeQuestion(slot)} />
                                <div class="flex items-start">
                                    <div class="w-6 text-[10pt] font-bold">{i + 1}.</div>
                                    <div class="flex-1">
                                        <div class="text-[10pt] font-medium min-h-[1.2rem]">
                                            <AssessmentEditable 
                                                value={slot.questions?.[0]?.text || slot.text} 
                                                onUpdate={(v: string) => updateText(v, 'QUESTION', 'text', slot.id, slot.questions?.[0]?.id || slot.id)} 
                                                multiline={true} 
                                                class="w-full text-left" 
                                            />
                                        </div>
                                        
                                        <!-- MCQ Options -->
                                        {#if slot.questions?.[0]?.options || slot.options}
                                            <div class="mt-2 ml-4">
                                                <AssessmentMcqOptions options={slot.questions?.[0]?.options || slot.options} />
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="w-12 text-right text-[10pt] font-bold mr-2">
                                        ({slot.marks || 5}M)
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/key}
                </div>
            </div>

            <!-- BLUE HEADER DIVIDER (As seen in image) -->
            <div class="bg-[#b4c7e7] border-y border-black h-4 mb-4"></div>

            <!-- SECTION B -->
            <div class="section-container">
                <div class="flex justify-between items-center text-[10pt] font-bold italic mb-1 border-b border-black pb-1">
                    <AssessmentEditable value={paperMeta.secB_title || 'Attempt any two'} onUpdate={(v: string) => updateText(v, 'META', 'secB_title')} />
                    <AssessmentEditable value={paperMeta.secB_marks_label || '5 x 2 = 10'} onUpdate={(v: string) => updateText(v, 'META', 'secB_marks_label')} />
                </div>
                
                <div class="questions-list space-y-6 mt-4" use:dndzone={{ items: questionsB, flipDurationMs: 200 }} onconsider={(e) => handleDndSync('B', (e.detail as any).items)} onfinalize={(e) => handleDndSync('B', (e.detail as any).items)}>
                    {#key activeSet + swapCounter}
                        {#each questionsB as slot, i (String(slot.questions?.[0]?.id || slot.id) + activeSet)}
                            <div class="relative group border-b border-gray-100 pb-4 last:border-0">
                                <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, 'B')} onDelete={() => removeQuestion(slot)} />
                                <div class="flex items-start">
                                    <div class="w-6 text-[10pt] font-bold">{questionsA.length + i + 1}.</div>
                                    <div class="flex-1">
                                        <div class="text-[10pt] font-medium leading-relaxed">
                                            <AssessmentEditable 
                                                value={slot.questions?.[0]?.text || slot.text} 
                                                onUpdate={(v: string) => updateText(v, 'QUESTION', 'text', slot.id, slot.questions?.[0]?.id || slot.id)} 
                                                multiline={true} 
                                                class="w-full text-left" 
                                            />
                                        </div>
                                    </div>
                                    <div class="w-12 text-right text-[10pt] font-bold mr-2">
                                        ({slot.marks || 5}M)
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/key}
                </div>
            </div>

            <!-- Footer -->
            <div class="absolute bottom-10 left-0 right-0 text-center text-[8pt] text-gray-400 opacity-50 border-t border-gray-100 pt-2">
                © {new Date().getFullYear()} Ajeenkya D. Y. Patil University - Internal Assessment System
            </div>
        </div>
    </div>

    <!-- Swap Sidebar -->
    {#if isSwapSidebarOpen && isEditable}
         <div transition:slide={{ axis: 'x' }} class="w-96 bg-white border-l border-gray-200 shadow-2xl p-6 overflow-y-auto no-print z-[100] fixed right-0 top-0 bottom-0">
            <div class="flex items-center justify-between mb-6">
                <h3 class="font-black text-gray-900 uppercase tracking-tight">SWAP QUESTION</h3>
                <button onclick={() => isSwapSidebarOpen = false} class="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                    <svg class="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            {#each swapContext?.alternates || [] as q}
                <button onclick={() => selectAlternate(q)} class="w-full text-left p-4 mb-3 bg-gray-50 rounded-2xl hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all group">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-black text-indigo-600">{q.marks}M</span>
                        <span class="text-[9px] font-black text-gray-400 uppercase">{q.type || 'SHORT'}</span>
                    </div>
                    <div class="text-xs font-medium text-gray-700 leading-relaxed line-clamp-3">{@html q.question_text || q.text}</div>
                </button>
            {:else}
                <div class="text-center py-20 text-gray-400 text-xs font-black uppercase tracking-widest">No matching questions found in pool.</div>
            {/each}
         </div>
    {/if}
</div>

<style>
    @font-face { font-family: 'Inter'; font-display: swap; src: local('Inter'); }
    #adypu-paper-actual { font-family: 'Inter', sans-serif; color: black; }
    #adypu-paper-actual * { box-sizing: border-box; }
    
    :global(.no-print) { display: block; }
    @media print {
        :global(.no-print) { display: none !important; }
        #adypu-paper-actual { color: black !important; border: none !important; margin: 0 !important; width: 100% !important; }
        .pt-20 { padding-top: 0 !important; }
    }
</style>
