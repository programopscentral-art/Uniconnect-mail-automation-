<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { dndzone } from 'svelte-dnd-action';
    import { flip } from 'svelte/animate';
    import AssessmentEditable from './shared/AssessmentEditable.svelte';
    import AssessmentSlotSingle from './shared/AssessmentSlotSingle.svelte';
    import AssessmentSlotOrGroup from './shared/AssessmentSlotOrGroup.svelte';

    let { 
        paperMeta = $bindable({}), 
        currentSetData = $bindable({ questions: [] }), 
        paperStructure = $bindable([]),
        courseOutcomes = [],
        questionPool = [],
        mode = 'view',
        activeSet = 'A'
    } = $props();

    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);

    let snoWidth = $derived(Number(paperMeta.colWidths?.sno || 40));
    let isResizing = $state<string | null>(null);

    $effect(() => {
        if (!paperMeta.colWidths) paperMeta.colWidths = { sno: 40 };
    });

    const isEditable = $derived(mode === 'edit');
    
    // We iterate over this derived list for UI logic
    const sectionKeys = $derived.by(() => {
        const keys = new Set<string>();
        if (mode === 'preview') {
            paperStructure.forEach((s: any) => keys.add(s.part));
        } else {
            const qs = (Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter(Boolean);
            qs.forEach((q: any) => keys.add(q.part || 'A'));
        }
        return Array.from(keys).sort();
    });

    function handleDndSync(section: string, items: any[]) {
        const otherQuestions = (currentSetData.questions || []).filter((q: any) => q.part !== section);
        const result: any[] = [];
        sectionKeys.forEach(s => {
            if (s === section) result.push(...items);
            else result.push(...otherQuestions.filter((q: any) => q.part === s));
        });
        currentSetData.questions = result;
    }

    function onResizeStart(col: string, e: MouseEvent) {
        if (!isEditable) return;
        isResizing = col;
        document.body.classList.add('cursor-col-resize');
        window.addEventListener('mousemove', onResizing);
        window.addEventListener('mouseup', onResizeEnd);
    }

    function onResizing(e: MouseEvent) {
        if (!isResizing) return;
        if (isResizing === 'sno') {
            paperMeta.colWidths.sno = Math.max(30, Math.min(100, (paperMeta.colWidths.sno || 40) + e.movementX));
        }
    }

    function onResizeEnd() {
        isResizing = null;
        document.body.classList.remove('cursor-col-resize');
        window.removeEventListener('mousemove', onResizing);
        window.removeEventListener('mouseup', onResizeEnd);
    }

    function getSectionConfig(partChar: string) {
        return paperStructure.find((s: any) => s.part === partChar);
    }

    function updateSectionTitle(partChar: string, newTitle: string) {
        const section = getSectionConfig(partChar);
        if (section) section.title = newTitle;
    }

    function updateInstructions(partChar: string, newText: string) {
        const section = getSectionConfig(partChar);
        if (section) section.instructions = newText;
    }

    function getInstructionsMarks(section: string) {
        const cfg = getSectionConfig(section);
        if (cfg?.instructions_marks && cfg.instructions_marks !== 'auto') return cfg.instructions_marks;
        const qs = (Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter((q: any) => q && q.part === section);
        if (qs.length === 0) return '[ 0 x 0 = 0 ]';
        const q0 = qs[0];
        const m = q0.type === 'OR_GROUP' ? (q0.choice1?.questions?.[0]?.marks || 0) : (q0.questions?.[0]?.marks || 0);
        return `[ ${qs.length} x ${m} = ${qs.length * m} ]`;
    }

    function updateTextValue(value: string, type: 'META' | 'QUESTION', field: string, slotId?: string, qId?: string, subPart?: 'choice1' | 'choice2') {
        if (!isEditable) return;
        if (type === 'META') {
            (paperMeta as any)[field] = value;
        } else {
            const slot = currentSetData.questions.find((s: any) => s.id === slotId);
            if (!slot) return;
            let q: any = null;
            if (slot.type === 'OR_GROUP') {
                 const choice = subPart === 'choice1' ? slot.choice1 : slot.choice2;
                 q = choice.questions.find((item: any) => item.id === qId);
            } else {
                 q = (slot.questions || [slot]).find((item: any) => item.id === qId);
            }
            if (q) { q.text = value; q.question_text = value; currentSetData.questions = [...currentSetData.questions]; }
        }
    }

    function removeQuestion(slot: any) {
        if (!confirm('Are you sure you want to delete this question?')) return;
        currentSetData.questions = (currentSetData.questions || []).filter((s: any) => s.id !== slot.id);
    }

    function openSwapSidebar(slot: any, part: string, subPart?: 'q1' | 'q2') {
        if (!slot) return;
        const index = currentSetData.questions.findIndex((s: any) => s.id === slot.id);
        if (index === -1) return;
        let cQ = slot.type === 'OR_GROUP' ? (subPart === 'q1' ? slot.choice1?.questions?.[0] : slot.choice2?.questions?.[0]) : (slot.questions?.[0] || slot);
        const marks = Number(cQ?.marks || slot.marks || (part === 'A' ? 2 : 4));
        const alternates = (questionPool || []).filter((q: any) => Number(q.marks || q.mark) === marks && q.id !== cQ?.id);
        swapContext = { slotIndex: index, part, subPart, currentMark: marks, alternates };
        isSwapSidebarOpen = true;
    }

    function selectAlternate(question: any) {
        if (!swapContext) return;
        const { slotIndex, subPart } = swapContext;
        const slot = currentSetData.questions[slotIndex];
        const nQ = { id: question.id, text: question.question_text, marks: question.marks, type: question.type, options: question.options, bloom: question.bloom_level };
        if (slot.type === 'OR_GROUP') {
            if (subPart === 'q1') slot.choice1.questions = [nQ];
            else slot.choice2.questions = [nQ];
        } else slot.questions = [nQ];
        currentSetData.questions = [...currentSetData.questions];
        isSwapSidebarOpen = false;
    }

    function getQuestionNumber(qId: string) {
        const qs = currentSetData.questions || [];
        let total = 0;
        for (const q of qs) {
            if (q.id === qId) return total + 1;
            total += (q.type === 'OR_GROUP' ? 2 : 1);
        }
        return 0;
    }
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-50 dark:bg-slate-950/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8 relative">
        <div id="crescent-paper-actual" class="mx-auto bg-white min-h-[297mm] p-[5mm] shadow-2xl transition-all duration-500 font-serif text-black relative" style="width: 210mm; box-sizing: border-box;">
            <div class="cdu-full-box border-[1.5pt] border-black -mx-[5mm] print:mx-0 flex flex-col bg-white">
                <div class="paper-header text-center font-bold pb-4 pt-2">
                    <div class="text-[10px] mb-1">Set - {activeSet}</div>
                    <AssessmentEditable bind:value={paperMeta.univ_line_1} onUpdate={(v: string) => updateTextValue(v, 'META', 'univ_line_1')} class="text-[17pt] font-black uppercase tracking-widest" />
                    <AssessmentEditable bind:value={paperMeta.univ_line_2} onUpdate={(v: string) => updateTextValue(v, 'META', 'univ_line_2')} class="text-[11pt] font-bold uppercase tracking-tight" />
                    <AssessmentEditable bind:value={paperMeta.exam_title} onUpdate={(v: string) => updateTextValue(v, 'META', 'exam_title')} class="text-[11pt] font-bold uppercase" />
                    <div class="py-1">
                        <AssessmentEditable bind:value={paperMeta.programme} onUpdate={(v: string) => updateTextValue(v, 'META', 'programme')} class="text-[11pt] font-bold uppercase text-[#dc2626] print-force-red" />
                        <AssessmentEditable bind:value={paperMeta.subject_name} onUpdate={(v: string) => updateTextValue(v, 'META', 'subject_name')} class="text-[11pt] font-black uppercase text-[#dc2626] print-force-red" />
                    </div>
                    <div class="mt-2 border-y-[1.2pt] border-black">
                        <div class="flex justify-between items-center py-0.5 px-2 font-bold text-[10.5pt]">
                            <div class="flex gap-1 items-center">
                                <span>Time:</span>
                                <AssessmentEditable value={String((Number(paperMeta.duration_minutes)/60).toFixed(1))} onUpdate={(v: string) => updateTextValue(String(Number(v)*60), 'META', 'duration_minutes')} class="px-2 border-b border-dotted border-gray-300" />
                                <span>Hrs.]</span>
                            </div>
                            <div class="flex gap-1 items-center">
                                <span>[Max. Marks:</span>
                                <AssessmentEditable bind:value={paperMeta.max_marks} onUpdate={(v: string) => updateTextValue(v, 'META', 'max_marks')} class="px-2 border-b border-dotted border-gray-300" />
                                <span>]</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col border-t-[1.5pt] border-black">
                {#each sectionKeys as section, sIdx}
                    {@const cfg = getSectionConfig(section)}
                    {#if cfg}
                        <div class="w-full text-center border-b border-black py-1 uppercase font-black italic tracking-[0.2em] text-sm {sIdx > 0 ? 'border-t-[1.5pt]' : ''}">
                            <AssessmentEditable bind:value={cfg.title} onUpdate={(v: string) => updateSectionTitle(section, v)} class="w-full" />
                        </div>
                        <div class="w-full flex items-center justify-between border-b border-black px-1 py-1 font-bold italic text-xs min-h-[22px] bg-white">
                             <div class="flex-1">
                                <AssessmentEditable bind:value={cfg.instructions} onUpdate={(v: string) => updateInstructions(section, v)} class="w-full" />
                             </div>
                             <div class="tabular-nums no-print text-right pl-4">
                                 <AssessmentEditable value={getInstructionsMarks(section)} onUpdate={(v: string) => { cfg.instructions_marks = v; }} class="text-right" />
                             </div>
                        </div>
                    {/if}
                    <div class="w-full flex flex-col min-h-[50px]" use:dndzone={{ items: (currentSetData?.questions || []).filter((q: any) => q && q.part === section), flipDurationMs: 200 }} onconsider={(e) => handleDndSync(section, (e.detail as any).items)} onfinalize={(e) => handleDndSync(section, (e.detail as any).items)}>
                        {#each (currentSetData?.questions || []) as q (q.id)}
                            {#if q && q.part === section}
                                <div class="w-full border-b border-black last:border-b-0 hover:bg-indigo-50/10 transition-colors">
                                    {#if q.type === 'OR_GROUP'}
                                        <AssessmentSlotOrGroup slot={q} qNumber={getQuestionNumber(q.id)} {isEditable} {snoWidth}
                                            onSwap1={() => openSwapSidebar(q, section, 'q1')}
                                            onSwap2={() => openSwapSidebar(q, section, 'q2')}
                                            onRemove={() => removeQuestion(q)}
                                            onUpdateText1={(v: string, qid: string) => updateTextValue(v, 'QUESTION', 'text', q.id, qid, 'choice1')}
                                            onUpdateText2={(v: string, qid: string) => updateTextValue(v, 'QUESTION', 'text', q.id, qid, 'choice2')}
                                        />
                                    {:else}
                                        <AssessmentSlotSingle slot={q} qNumber={getQuestionNumber(q.id)} {isEditable} {snoWidth}
                                            onSwap={() => openSwapSidebar(q, section)}
                                            onRemove={() => removeQuestion(q)}
                                            onUpdateText={(v: string, qid: string) => updateTextValue(v, 'QUESTION', 'text', q.id, qid)}
                                        />
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                        
                        {#if mode === 'preview' && cfg}
                            {#each cfg.slots as slot, idx}
                                <div class="w-full border-b border-black last:border-b-0 p-3 opacity-40 bg-gray-50/50 flex items-center gap-4">
                                     <div class="font-bold text-xs w-8 text-center">{slot.label}</div>
                                     <div class="flex-1 text-[10px] uppercase font-black tracking-widest text-gray-400">
                                         [ {slot.type === 'OR_GROUP' ? 'OR Pair' : 'Single Question'} ] - {slot.marks} Marks
                                     </div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/each}
                {#if isEditable}
                    <div class="absolute top-0 bottom-0 w-3 cursor-col-resize hover:bg-indigo-500/20 group transition-all no-print flex items-center justify-center p-0" style="left: {snoWidth}px; transform: translateX(-50%); z-index: 60;" onmousedown={(e) => onResizeStart('sno', e)} role="none">
                        <div class="h-8 w-1 bg-indigo-200 group-hover:bg-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                {/if}
                </div>
            </div>
        </div>
    </div>

    {#if isSwapSidebarOpen && isEditable}
        <div transition:slide={{ axis: 'x', duration: 350 }} class="w-96 bg-white dark:bg-slate-900 border-l border-gray-100 dark:border-slate-800 shadow-2xl flex flex-col no-print z-[80]">
            <div class="p-6 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
                <div>
                    <h3 class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Swap Question</h3>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Available Alternatives</p>
                </div>
                <button onclick={() => isSwapSidebarOpen = false} class="p-2 hover:bg-gray-100 rounded-xl transition-colors"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
                {#each swapContext?.alternates || [] as q}
                    <button onclick={() => selectAlternate(q)} class="w-full text-left p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-indigo-500 hover:bg-indigo-50/50 transition-all group">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[10px] font-black px-2 py-0.5 bg-white rounded text-gray-500 uppercase tracking-widest">{q.type || 'NORMAL'}</span>
                            <span class="text-[10px] font-black text-indigo-600">{q.marks} Marks</span>
                        </div>
                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 leading-relaxed italic line-clamp-3">{@html q.question_text}</div>
                    </button>
                {:else}
                    <div class="text-center py-20 text-gray-400 text-xs font-black uppercase tracking-widest">No matching questions found in pool.</div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    @font-face { font-family: 'Times New Roman'; font-display: swap; src: local('Times New Roman'); }
    #crescent-paper-actual { font-family: 'Times New Roman', Times, serif; }
    :global(img) { max-width: 100%; }
    .print-force-red { color: #dc2626 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
