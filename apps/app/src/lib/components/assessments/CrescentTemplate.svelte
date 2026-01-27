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
        paperMeta = {}, 
        currentSetData = { questions: [] },
        paperStructure = [],
        activeSet = 'A',
        courseOutcomes = [],
        questionPool = [],
        mode = 'view' 
    } = $props();

    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);
    const isEditable = $derived(mode === 'edit' || mode === 'preview');

    // DO NOT iterate over derived filtered lists in Svelte 5 if you need to bind/mutate deeply.
    // Instead, iterate over the main list and use #if for part filtering.

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

        const marks = Number(targetQuestion?.marks || slot.marks || (part === 'A' ? 2 : 16));
        const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        const index = arr.indexOf(slot);
        
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
        const nQ = { id: question.id, text: question.question_text, question_text: question.question_text, marks: question.marks, options: question.options, part: swapContext.part };
        
        if (swapContext.part === 'A') {
            const result = [...arr];
            result[swapContext.slotIndex] = nQ;
            if (Array.isArray(currentSetData)) {
                // This shouldn't happen with our normalization but for safety:
                Object.assign(currentSetData, result);
            } else {
                currentSetData.questions = result;
            }
        } else {
            if (slot.type === 'OR_GROUP') {
                const choice = swapContext.subPart === 'q1' ? slot.choice1 : slot.choice2;
                if (swapContext.subQuestionId) {
                    const idx = choice.questions.findIndex((q: any) => q.id === swapContext.subQuestionId);
                    if (idx !== -1) choice.questions[idx] = nQ;
                } else {
                    choice.questions = [nQ];
                }
            } else {
                slot.questions = [nQ];
            }
        }
        
        if (Array.isArray(currentSetData)) {
             // Not recommended anymore
        } else {
            currentSetData.questions = [...currentSetData.questions];
        }
        isSwapSidebarOpen = false;
    }

    const calcTotal = (part: string) => {
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
    };

    const totalMarksA = $derived(calcTotal('A'));
    const totalMarksB = $derived(calcTotal('B'));
    const totalMarksC = $derived(calcTotal('C'));
    const allTotalMarks = $derived(totalMarksA + totalMarksB + totalMarksC);
    
    function toRoman(n: number) {
        return ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n] || String(n + 1);
    }

    const allQuestions = $derived((Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter(Boolean));
    
    // CRITICAL FIX: Filter by slot.part, not q.part, because questions are nested inside slots
    const questionsA = $derived(allQuestions.filter((slot: any) => slot?.part === 'A'));
    const questionsB = $derived(allQuestions.filter((slot: any) => slot?.part === 'B'));
    const questionsC = $derived(allQuestions.filter((slot: any) => slot?.part === 'C'));
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8">
        <div id="crescent-paper-actual" class="mx-auto bg-white p-[0.3in] shadow-2xl transition-all duration-500 font-serif text-black relative border border-black" style="width: 8.27in; min-height: 11.69in;">
            
            <!-- Header -->
            <div class="header-container flex flex-col items-center mb-1 pt-1 relative">
                 <div class="absolute top-0 left-0 text-[10pt] font-black border border-black px-2 py-0.5">SET - {activeSet}</div>
                 <img src="/crescent-logo.png" alt="Crescent Logo" class="h-14 mb-1" />
                 
                 <!-- RRN & Course Code Header (Top Right) -->
                  <div class="absolute top-0 right-0 flex flex-col items-end gap-1">
                    <div class="flex items-center gap-2">
                        <AssessmentEditable value={paperMeta.course_code} onUpdate={(v: string) => updateText(v, 'META', 'course_code')} class="font-bold px-1 min-w-[70px] text-right text-[10pt]" />
                    </div>
                    <div class="flex items-center gap-1 mt-1">
                        <span class="text-[8pt] font-bold text-right">RRN</span>
                        <div class="flex border border-black">
                            {#each Array(11) as _, i}
                                <div class="w-4 h-4 border-r border-black last:border-r-0"></div>
                            {/each}
                        </div>
                    </div>
                 </div>
            </div>

            <!-- Title -->
            <div class="text-center my-6 font-bold uppercase text-[11pt]">
                <AssessmentEditable value={paperMeta.exam_title} onUpdate={(v: string) => updateText(v, 'META', 'exam_title')} class="w-full text-center" />
            </div>

            <!-- Metadata Table (Exact Match) -->
            <table class="w-full border-collapse border border-black text-[9pt] mb-4">
                <tbody>
                    <tr>
                        <td class="border border-black p-1 w-[20%] font-bold">Programme & Branch</td>
                        <td colspan="3" class="border border-black p-1 text-[9pt]">
                            <div class="flex gap-2">
                                <span>:</span>
                                <AssessmentEditable value={paperMeta.programme} onUpdate={(v: string) => updateText(v, 'META', 'programme')} class="flex-1" />
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td class="border border-black p-1 font-bold">Semester</td>
                        <td class="border border-black p-1 w-[30%]">
                            <div class="flex gap-2">
                                <span>:</span>
                                <AssessmentEditable value={paperMeta.semester} onUpdate={(v: string) => updateText(v, 'META', 'semester')} />
                            </div>
                        </td>
                        <td class="border border-black p-1 w-[20%] font-bold">Date & Session</td>
                        <td class="border border-black p-1 w-[30%]">
                            <div class="flex gap-2">
                                <span>:</span>
                                <AssessmentEditable value={paperMeta.paper_date} onUpdate={(v: string) => updateText(v, 'META', 'paper_date')} />
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td class="border border-black p-1 font-bold">Course Code & Name</td>
                        <td colspan="3" class="border border-black p-1">
                            <div class="flex gap-2">
                                <span>:</span>
                                <AssessmentEditable value={paperMeta.subject_name} onUpdate={(v: string) => updateText(v, 'META', 'subject_name')} />
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td class="border border-black p-1 font-bold">Duration</td>
                        <td class="border border-black p-1">
                            <div class="flex gap-2">
                                <span>:</span>
                                <AssessmentEditable value={paperMeta.duration_minutes} onUpdate={(v: string) => updateText(v, 'META', 'duration_minutes')} />
                                <span>minutes</span>
                            </div>
                        </td>
                        <td class="border border-black p-1 font-bold">Maximum Marks</td>
                        <td class="border border-black p-1">
                            <div class="flex gap-2">
                                <span>:</span>
                                <AssessmentEditable value={paperMeta.max_marks} onUpdate={(v: string) => updateText(v, 'META', 'max_marks')} />
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <!-- Instructions -->
            <div class="text-center font-bold italic py-1 text-[9.5pt]">
                <AssessmentEditable value={paperMeta.instructions} onUpdate={(v: string) => updateText(v, 'META', 'instructions')} class="w-full text-center" />
            </div>


                <!-- PART A -->
                <div class="border-b border-black py-0.5 text-center font-bold uppercase tracking-wider text-[9.5pt] flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden">
                    <AssessmentEditable value={paperMeta.partA_title || 'PART A'} onUpdate={(v: string) => updateText(v, 'META', 'partA_title')} class="inline-block font-bold" /> 
                    <div class="flex items-center gap-1 no-print">
                        <span>(</span>
                        <AssessmentEditable value={paperMeta.totalMarksA_text || `${questionsA.length} X ${questionsA[0]?.marks || 2} = ${totalMarksA} MARKS`} onUpdate={(v) => updateText(v, 'META', 'totalMarksA_text')} class="inline-block" />
                        <span>)</span>
                    </div>
                </div>
                <div class="border-x border-b border-black">
                    {#each questionsA as q, i (q.id)}
                        <div class="border-b border-black min-h-[30px] flex group relative">
                            <div class="px-2 py-1 border-r border-black w-10 text-center font-bold text-[9pt] flex items-center justify-center">{i + 1}.</div>
                            <div class="flex-1 px-4 py-1 relative min-h-[30px] flex flex-col justify-center">
                                <AssessmentRowActions 
                                    {isEditable}
                                    onSwap={() => openSwapSidebar(q, 'A')}
                                    onDelete={() => removeQuestion(q)}
                                />
                                <div class="w-full">
                                    <AssessmentEditable 
                                        value={q.text || q.question_text || ''} 
                                        onUpdate={(v: string) => {
                                            q.text = v;
                                            q.question_text = v;
                                            updateText(v, 'QUESTION', 'text', q.id, q.id);
                                        }}
                                        multiline={true} 
                                        class="text-[9pt] w-full block min-h-[1.2em]"
                                    />
                                    <AssessmentMcqOptions options={q.options} />
                                </div>
                            </div>
                            <div class="w-16 border-l border-black text-center py-1 font-bold text-[8.5pt] flex items-center justify-center gap-1">
                                <span>(</span>
                                <AssessmentEditable value={String(q.marks || 2)} onUpdate={(v: string) => { q.marks = Number(v); updateText(v, 'QUESTION', 'marks', q.id, q.id); }} class="inline-block min-w-[8px] text-center" />
                                <span>)</span>
                            </div>
                        </div>
                    {/each}

                    {#if mode === 'preview' && questionsA.length === 0}
                        {@const sectionA = paperStructure.find(s => s.part === 'A')}
                        {#if sectionA}
                            {#each sectionA.slots as slot}
                                <div class="border-b border-black last:border-b-0 min-h-[30px] flex opacity-40 bg-gray-50/30">
                                    <div class="px-2 py-1 border-r border-black w-10 text-center font-bold text-[9pt] flex items-center justify-center">{slot.label}.</div>
                                    <div class="flex-1 px-4 py-1 flex items-center text-[9pt] italic text-gray-400 uppercase tracking-widest font-black">
                                        [ {slot.qType || 'ANY'} ] Question - Generated per Set
                                    </div>
                                    <div class="w-16 border-l border-black text-center py-1 font-bold text-[8.5pt] flex items-center justify-center">
                                        ( {slot.marks} )
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    {:else if questionsA.length === 0}
                         <div class="p-8 text-center text-gray-400 italic text-sm">No questions available for Part A. Use Swap to add or check data.</div>
                    {/if}
                </div>

                <!-- PART B -->
                <div class="border-y border-black py-0.5 text-center font-bold uppercase tracking-wider text-[9.5pt] flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden">
                    <AssessmentEditable value={paperMeta.partB_title || 'PART B'} onUpdate={(v: string) => updateText(v, 'META', 'partB_title')} class="inline-block font-bold" />
                    <div class="flex items-center gap-1 no-print">
                        <span>(</span>
                        <AssessmentEditable value={paperMeta.totalMarksB_text || `${questionsB.length} X ${questionsB[0]?.marks || 16} = ${totalMarksB} MARKS`} onUpdate={(v) => updateText(v, 'META', 'totalMarksB_text')} class="inline-block" />
                        <span>)</span>
                    </div>
                </div>
                <div class="border-x border-black">
                    {#each questionsB as slot, i (slot.id)}
                        {@const currentNum = questionsA.length + (i * 2) + 1}
                        <div class="border-b border-black">
                            <!-- Choice 1 -->
                            <div class="flex group relative">
                                <div class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]">{currentNum}.</div>
                                <div class="flex-1 px-4 py-2 relative">
                                    <AssessmentRowActions 
                                        {isEditable}
                                        onSwap={() => openSwapSidebar(slot, 'B', 'q1')}
                                        onDelete={() => removeQuestion(slot)}
                                    />
                                    {#if slot.choice1?.questions}
                                        <div class="space-y-3">
                                            {#each slot.choice1.questions as q, subIdx}
                                                <div class="flex gap-2 group/sub relative">
                                                    {#if slot.choice1.questions.length > 1}
                                                        <span class="font-bold min-w-[25px] text-[9pt]">{String.fromCharCode(97 + subIdx)}.</span>
                                                    {/if}
                                                    <div class="flex-1 relative">
                                                        <div class="absolute -left-10 top-0 opacity-0 group-hover/sub:opacity-100 transition-opacity no-print">
                                                            <button onclick={() => openSwapSidebar(slot, 'B', 'q1', q.id)} class="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Swap sub-question">
                                                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                                            </button>
                                                        </div>
                                                        <AssessmentEditable 
                                                            value={q.text || q.question_text || ''}
                                                            onUpdate={(v: string) => {
                                                                q.text = v;
                                                                q.question_text = v;
                                                                updateText(v, 'QUESTION', 'text', slot.id, q.id);
                                                            }}
                                                            multiline={true}
                                                            class="text-[9pt] w-full block min-h-[1.5em]"
                                                        />
                                                        <AssessmentMcqOptions options={q.options} />
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]">
                                    ( <AssessmentEditable value={String(slot.choice1?.questions?.[0]?.marks || slot.marks || 16)} onUpdate={(v: string) => { if(slot.choice1?.questions?.[0]) slot.choice1.questions[0].marks = Number(v); }} class="inline-block min-w-0" /> )
                                </div>
                            </div>
                            <!-- OR -->
                            <div class="text-center font-bold italic py-0.5 bg-gray-50/50 text-[8.5pt] border-y border-black">(OR)</div>
                            <!-- Choice 2 -->
                            <div class="flex group relative">
                                <div class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]">{currentNum + 1}.</div>
                                <div class="flex-1 px-4 py-2 relative">
                                    <AssessmentRowActions 
                                        {isEditable}
                                        onSwap={() => openSwapSidebar(slot, 'B', 'q2')}
                                        onDelete={() => removeQuestion(slot)}
                                    />
                                    {#if slot.choice2?.questions}
                                        <div class="space-y-3">
                                            {#each slot.choice2.questions as q, subIdx}
                                                <div class="flex gap-2 group/sub relative">
                                                    {#if slot.choice2.questions.length > 1}
                                                        <span class="font-bold min-w-[25px] text-[9pt]">{String.fromCharCode(97 + subIdx)}.</span>
                                                    {/if}
                                                    <div class="flex-1 relative">
                                                        <div class="absolute -left-10 top-0 opacity-0 group-hover/sub:opacity-100 transition-opacity no-print">
                                                            <button onclick={() => openSwapSidebar(slot, 'B', 'q2', q.id)} class="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Swap sub-question">
                                                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                                            </button>
                                                        </div>
                                                        <AssessmentEditable 
                                                            value={q.text || q.question_text || ''}
                                                            onUpdate={(v: string) => {
                                                                q.text = v;
                                                                q.question_text = v;
                                                                updateText(v, 'QUESTION', 'text', slot.id, q.id);
                                                            }}
                                                            multiline={true}
                                                            class="text-[9pt] w-full block min-h-[1.5em]"
                                                        />
                                                        <AssessmentMcqOptions options={q.options} />
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]">
                                    ( <AssessmentEditable value={String(slot.choice2?.questions?.[0]?.marks || slot.marks || 16)} onUpdate={(v: string) => { if(slot.choice2?.questions?.[0]) slot.choice2.questions[0].marks = Number(v); }} class="inline-block min-w-0" /> )
                                </div>
                            </div>
                        </div>
                    {/each}

                    {#if mode === 'preview' && questionsB.length === 0}
                        {@const sectionB = paperStructure.find(s => s.part === 'B')}
                        {#if sectionB}
                            {#each sectionB.slots as slot}
                                <div class="border-b border-black last:border-b-0 opacity-40 bg-gray-50/30">
                                    {#each slot.choices || [slot] as choice, idx}
                                        <div class="flex min-h-[40px]">
                                            <div class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]">{choice.label || slot.label}.</div>
                                            <div class="flex-1 px-4 py-2 flex items-center text-[9pt] italic text-gray-400 uppercase tracking-widest font-black">
                                                [ {choice.qType || slot.qType || 'ANY'} ] {choice.hasSubQuestions ? 'Part (a) & (b)' : 'Question'} - Generated per Set
                                            </div>
                                            <div class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]">
                                                ( {choice.marks || slot.marks} )
                                            </div>
                                        </div>
                                        {#if idx === 0 && slot.type === 'OR_GROUP'}
                                            <div class="text-center font-bold italic py-0.5 bg-gray-50/50 text-[8.5pt] border-y border-black">(OR)</div>
                                        {/if}
                                    {/each}
                                </div>
                            {/each}
                        {/if}
                    {/if}
                </div>

                <!-- PART C -->
                {#if questionsC.length > 0 || (mode === 'preview' && paperStructure.some(s => s.part === 'C'))}
                <div class="border-y border-black py-0.5 text-center font-bold uppercase tracking-wider text-[9.5pt] flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden">
                    <AssessmentEditable value={paperMeta.partC_title || 'PART C'} onUpdate={(v: string) => updateText(v, 'META', 'partC_title')} class="inline-block font-bold" />
                    <span>({questionsC.length} X {questionsC[0]?.marks || 8} = {totalMarksC} MARKS)</span>
                </div>
                <div class="border-x border-b border-black">
                    {#each questionsC as slot, i (slot.id)}
                        {@const currentNum = questionsA.length + (questionsB.length * 2) + (i * 2) + 1}
                        <div class="border-b border-black">
                            <div class="flex group relative">
                                <div class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]">{currentNum}.</div>
                                <div class="flex-1 px-4 py-2 relative">
                                    <AssessmentRowActions 
                                        {isEditable}
                                        onSwap={() => openSwapSidebar(slot, 'C', 'q1')}
                                        onDelete={() => removeQuestion(slot)}
                                    />
                                    {#if slot.choice1?.questions}
                                        <div class="space-y-3">
                                            {#each slot.choice1.questions as q, subIdx}
                                                <div class="flex gap-2">
                                                    {#if slot.choice1.questions.length > 1}
                                                        <span class="font-bold min-w-[25px] text-[9pt]">{String.fromCharCode(97 + subIdx)}.</span>
                                                    {/if}
                                                    <div class="flex-1">
                                                        <AssessmentEditable 
                                                            value={q.text || q.question_text || ''}
                                                            onUpdate={(v: string) => {
                                                                q.text = v;
                                                                q.question_text = v;
                                                                updateText(v, 'QUESTION', 'text', slot.id, q.id);
                                                            }}
                                                            multiline={true}
                                                            class="text-[9pt]"
                                                        />
                                                        <AssessmentMcqOptions options={q.options} />
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]">
                                    ( {slot.choice1?.questions?.[0]?.marks || slot.marks || 8} )
                                </div>
                            </div>
                            <div class="text-center font-bold italic py-0.5 bg-gray-50/50 text-[8.5pt] border-y border-black">(OR)</div>
                            <div class="flex group relative">
                                <div class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]">{currentNum + 1}.</div>
                                <div class="flex-1 px-4 py-2 relative">
                                    <AssessmentRowActions 
                                        {isEditable}
                                        onSwap={() => openSwapSidebar(slot, 'C', 'q2')}
                                        onDelete={() => removeQuestion(slot)}
                                    />
                                    {#if slot.choice2?.questions}
                                        <div class="space-y-3">
                                            {#each slot.choice2.questions as q, subIdx}
                                                <div class="flex gap-2">
                                                    {#if slot.choice2.questions.length > 1}
                                                        <span class="font-bold min-w-[25px] text-[9pt]">{String.fromCharCode(97 + subIdx)}.</span>
                                                    {/if}
                                                    <div class="flex-1">
                                                        <AssessmentEditable 
                                                            value={q.text || q.question_text || ''}
                                                            onUpdate={(v: string) => {
                                                                    q.text = v;
                                                                    q.question_text = v;
                                                                    updateText(v, 'QUESTION', 'text', slot.id, q.id);
                                                                }}
                                                            multiline={true}
                                                            class="text-[9pt]"
                                                        />
                                                        <AssessmentMcqOptions options={q.options} />
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]">
                                    ( {slot.choice2?.questions?.[0]?.marks || slot.marks || 8} )
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
                {/if}

             <!-- Signature Boxes (Exact Match) -->
            <div class="mt-20 flex justify-between px-4 gap-8 mb-8">
                 <div class="border border-black p-8 flex-1 text-center font-bold text-[9pt]">
                    Name & Signature <br/> of DAAC Member
                 </div>
                 <div class="border border-black p-8 flex-1 text-center font-bold text-[9pt]">
                    Name & Signature <br/> of DAAC Member
                 </div>
            </div>
            
            <!-- Bottom Border Closure (Exact Match to Page Width) -->
            <div class="border-t-2 border-black w-full mt-4"></div>
        </div>
        <div class="text-center mt-8 text-[10pt] font-bold text-black no-print">***********</div>
    </div>

    <!-- Swap Sidebar (Fixed Right Overlay) -->
    {#if isSwapSidebarOpen && isEditable}
                 <div class="fixed inset-0 bg-black/20 z-[90] no-print" role="presentation" onclick={() => isSwapSidebarOpen = false}></div>
                 <div transition:slide={{ axis: 'x' }} class="fixed right-0 top-0 bottom-0 w-96 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 shadow-2xl p-6 overflow-y-auto no-print z-[100]">
                    <div class="flex items-center justify-between mb-6 sticky top-0 bg-white dark:bg-slate-900 pb-4 z-10">
                        <h3 class="font-black text-gray-900 dark:text-white uppercase tracking-tight">SWAP QUESTION</h3>
                        <button onclick={() => isSwapSidebarOpen = false} aria-label="Close" class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                            <svg class="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    
                    <div class="space-y-3">
                        {#each swapContext?.alternates || [] as q}
                            <button onclick={() => selectAlternate(q)} class="w-full text-left p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400">{q.marks}M</span>
                                    <span class="text-[9px] font-black text-gray-400 uppercase">{q.type || 'SHORT'}</span>
                                </div>
                                <div class="text-xs font-medium text-gray-700 dark:text-slate-300 leading-relaxed line-clamp-3">{@html q.question_text || q.text}</div>
                            </button>
                        {/each}
                        {#if !swapContext?.alternates?.length}
                            <div class="text-center py-10">
                                <p class="text-sm text-gray-400 font-bold uppercase tracking-widest">No alternates found</p>
                            </div>
                        {/if}
                    </div>
                 </div>
    {/if}
</div>

<style>
    @font-face { font-family: 'Times New Roman'; font-display: swap; src: local('Times New Roman'); }
    #crescent-paper-actual { font-family: 'Times New Roman', Times, serif; }
    #crescent-paper-actual * { box-sizing: border-box; }
    
    td { line-height: 1.4; vertical-align: top; }
    
    :global(.no-print) { display: block; }
    @media print {
        :global(.no-print) { display: none !important; }
    }
</style>
