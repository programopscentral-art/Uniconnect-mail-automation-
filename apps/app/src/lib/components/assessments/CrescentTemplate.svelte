<script lang="ts">
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { fade, fly, slide } from "svelte/transition";
    import AssessmentEditable from './shared/AssessmentEditable.svelte';
    import AssessmentSlotSingle from './shared/AssessmentSlotSingle.svelte';
    import AssessmentSlotOrGroup from './shared/AssessmentSlotOrGroup.svelte';

    let { 
        paperMeta = $bindable({}), 
        currentSetData = $bindable({ questions: [] }),
        paperStructure = [],
        activeSet = 'A',
        courseOutcomes = [],
        questionPool = [],
        mode = 'view' 
    } = $props();

    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);
    const isEditable = $derived(mode === 'edit');

    let questionsA = $derived(safeFilter(currentSetData, 'A'));
    let questionsB = $derived(safeFilter(currentSetData, 'B'));
    let questionsC = $derived(safeFilter(currentSetData, 'C'));

    function safeFilter(data: any, part: string) {
        const arr = (Array.isArray(data) ? data : (data?.questions || [])).filter(Boolean);
        return arr.filter((s: any) => s.part === part);
    }

    function handleDndSync(part: string, items: any[]) {
        const otherQuestions = (Array.isArray(currentSetData) ? currentSetData : currentSetData.questions).filter((q: any) => q.part !== part);
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

    function openSwapSidebar(slot: any, part: string, subPart?: 'q1' | 'q2') {
        const cQ = slot.type === 'OR_GROUP' ? (subPart === 'q1' ? slot.choice1?.questions?.[0] : slot.choice2?.questions?.[0]) : (slot.questions?.[0] || slot);
        // NO HARDCODED MARKS: Use the question's actual marks or fallback to slot marks
        const marks = Number(cQ?.marks || slot.marks || (part === 'A' ? 2 : 16));
        const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        const index = arr.indexOf(slot);
        
        swapContext = { 
            slotIndex: index, 
            part, 
            subPart, 
            currentMark: marks,
            alternates: (questionPool || []).filter((q: any) => Number(q.marks || q.mark) === marks && q.id !== cQ?.id) 
        };
        isSwapSidebarOpen = true;
    }

    function selectAlternate(question: any) {
        if (!swapContext) return;
        const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        const slot = arr[swapContext.slotIndex];
        const nQ = { id: question.id, text: question.question_text, marks: question.marks, options: question.options };
        if (slot.type === 'OR_GROUP') { if(swapContext.subPart === 'q1') slot.choice1.questions = [nQ]; else slot.choice2.questions = [nQ]; }
        else slot.questions = [nQ];
        if(Array.isArray(currentSetData)) currentSetData = [...currentSetData]; else currentSetData.questions = [...currentSetData.questions];
        isSwapSidebarOpen = false;
    }

    const calcTotal = (qs: any[]) => qs.reduce((s, slot) => {
        const marks = Number(slot.marks || (slot.type === 'OR_GROUP' ? (slot.choice1?.questions?.[0]?.marks || 0) : (slot.questions?.[0]?.marks || 0)));
        return s + (slot.type === 'OR_GROUP' ? marks * 2 : marks);
    }, 0);

    let totalMarksA = $derived(calcTotal(questionsA));
    let totalMarksB = $derived(calcTotal(questionsB));
    let totalMarksC = $derived(calcTotal(questionsC));
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8">
        <div id="crescent-paper-actual" class="mx-auto bg-white p-[0.75in] shadow-2xl transition-all duration-500 font-serif text-black relative" style="width: 8.27in; min-height: 11.69in;">
            <div class="flex justify-between items-start mb-6">
                <img src="/crescent-logo.png" alt="Logo" class="h-16" />
                <div class="text-right">
                    <AssessmentEditable bind:value={paperMeta.course_code} onUpdate={(v: string) => updateText(v, 'META', 'course_code')} class="font-bold border px-1" />
                    <div class="text-[10px] mt-1">RRN: [ _ _ _ _ _ _ _ _ _ _ ]</div>
                </div>
            </div>

            <div class="text-center mb-8 border-y-2 border-black py-2">
                <AssessmentEditable bind:value={paperMeta.exam_title} onUpdate={(v: string) => updateText(v, 'META', 'exam_title')} class="text-xl font-black uppercase" />
                <div class="grid grid-cols-2 text-sm mt-4 text-left border-t border-black pt-2">
                    <div><b>Programme:</b> <AssessmentEditable bind:value={paperMeta.programme} onUpdate={(v: string) => updateText(v, 'META', 'programme')} /></div>
                    <div><b>Semester:</b> <AssessmentEditable bind:value={paperMeta.semester} onUpdate={(v: string) => updateText(v, 'META', 'semester')} /></div>
                </div>
            </div>

            <div class="space-y-12">
                <!-- PART A -->
                <div>
                    <div class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest">PART A ({questionsA.length} x 2 = {totalMarksA} Marks)</div>
                    <div use:dndzone={{ items: questionsA, flipDurationMs: 200 }} onconsider={(e) => handleDndSync('A', e.detail.items)} onfinalize={(e) => handleDndSync('A', e.detail.items)}>
                        {#each questionsA as q, i (q.id)}
                            <div animate:flip={{duration: 200}} class="border-b border-black last:border-b-0">
                                <AssessmentSlotSingle slot={q} qNumber={i+1} {isEditable} snoWidth={35} onSwap={() => openSwapSidebar(q, 'A')} onRemove={() => removeQuestion(q)} onUpdateText={(v: string, qid: string) => updateText(v, 'QUESTION', 'text', q.id, qid)} />
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- PART B -->
                <div>
                    <div class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest">PART B ({questionsB.length} x {questionsB[0]?.marks || 5} = {totalMarksB} Marks)</div>
                    <div use:dndzone={{ items: questionsB, flipDurationMs: 200 }} onconsider={(e) => handleDndSync('B', e.detail.items)} onfinalize={(e) => handleDndSync('B', e.detail.items)}>
                        {#each questionsB as q, i (q.id)}
                            <div animate:flip={{duration: 200}} class="border-2 border-black mb-6">
                                <AssessmentSlotOrGroup slot={q} qNumber={questionsA.length + (i*2) + 1} {isEditable} snoWidth={35}
                                    onSwap1={() => openSwapSidebar(q, 'B', 'q1')} onSwap2={() => openSwapSidebar(q, 'B', 'q2')}
                                    onRemove={() => removeQuestion(q)}
                                    onUpdateText1={(v: string, qid: string) => updateText(v, 'QUESTION', 'text', q.id, qid)}
                                    onUpdateText2={(v: string, qid: string) => updateText(v, 'QUESTION', 'text', q.id, qid)} />
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- PART C -->
                {#if questionsC.length > 0}
                <div>
                    <div class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest">PART C ({questionsC.length} x {questionsC[0]?.marks || 16} = {totalMarksC} Marks)</div>
                    <div use:dndzone={{ items: questionsC, flipDurationMs: 200 }} onconsider={(e) => handleDndSync('C', e.detail.items)} onfinalize={(e) => handleDndSync('C', e.detail.items)}>
                        {#each questionsC as q, i (q.id)}
                            <div animate:flip={{duration: 200}} class="border-2 border-black mb-6">
                                <AssessmentSlotOrGroup slot={q} qNumber={questionsA.length + (questionsB.length*2) + (i*2) + 1} {isEditable} snoWidth={35}
                                    onSwap1={() => openSwapSidebar(q, 'C', 'q1')} onSwap2={() => openSwapSidebar(q, 'C', 'q2')}
                                    onRemove={() => removeQuestion(q)}
                                    onUpdateText1={(v: string, qid: string) => updateText(v, 'QUESTION', 'text', q.id, qid)}
                                    onUpdateText2={(v: string, qid: string) => updateText(v, 'QUESTION', 'text', q.id, qid)} />
                            </div>
                        {/each}
                    </div>
                </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Swap Sidebar -->
    {#if isSwapSidebarOpen && isEditable}
         <div transition:slide={{ axis: 'x' }} class="w-96 bg-white border-l shadow-2xl p-6 overflow-y-auto no-print">
            <h3 class="font-black mb-4">SWAP QUESTION</h3>
            {#each swapContext?.alternates || [] as q}
                <button onclick={() => selectAlternate(q)} class="w-full text-left p-4 mb-2 bg-gray-50 rounded hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all">
                    <div class="text-xs font-bold mb-1">{q.marks}M</div>
                    <div class="text-xs line-clamp-3">{@html q.question_text}</div>
                </button>
            {/each}
         </div>
    {/if}
</div>
