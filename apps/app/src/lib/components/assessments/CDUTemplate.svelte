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

    let snoWidth = $derived(Number(paperMeta.colWidths?.sno || 35));
    let isResizing = $state<string | null>(null);

    $effect(() => {
        if (!paperMeta.colWidths) paperMeta.colWidths = { sno: 35 };
    });

    const isEditable = $derived(mode === 'edit' || mode === 'preview');
    
    const sectionKeys = $derived.by(() => {
        const keys = new Set<string>();
        if (mode === 'preview' || mode === 'edit') {
            (paperStructure || []).forEach((s: any) => { if(s.part) keys.add(s.part); });
        }
        const qs = (Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || [])).filter(Boolean);
        qs.forEach((q: any) => { if(q.part) keys.add(q.part); });
        
        if (keys.size === 0) return ['A', 'B'];
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
            paperMeta.colWidths.sno = Math.max(25, Math.min(80, (paperMeta.colWidths.sno || 35) + e.movementX));
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
        const count = cfg?.answered_count || qs.length || 0;
        const m = cfg?.marks_per_q || 0;
        return `${count} x ${m} = ${count * m}`;
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
        if (!confirm('Are you sure?')) return;
        currentSetData.questions = (currentSetData.questions || []).filter((s: any) => s.id !== slot.id);
    }

    function openSwapSidebar(slot: any, part: string, subPart?: 'q1' | 'q2') {
        if (!slot) return;
        const index = currentSetData.questions.findIndex((s: any) => s.id === slot.id);
        if (index === -1) return;
        let cQ = slot.type === 'OR_GROUP' ? (subPart === 'q1' ? slot.choice1?.questions?.[0] : slot.choice2?.questions?.[0]) : (slot.questions?.[0] || slot);
        let alternates = (questionPool || []).filter((q: any) => q.id !== cQ?.id);
        
        // If Part A (1-2 Marks), include MCQs and Fill-ins regardless of exact mark match if marks are close
        if (part === 'A' && marks <= 2) {
            alternates = alternates.filter((q: any) => 
                (Number(q.marks || q.mark) <= marks) && 
                (['MCQ', 'FILL_IN_BLANK', 'VERY_SHORT', 'SHORT'].includes(q.type) || (q.question_text || '').includes('___'))
            );
        } else {
            alternates = alternates.filter((q: any) => Number(q.marks || q.mark) === marks);
        }

        swapContext = { slotIndex: index, part, subPart, currentMark: marks, alternates };
        isSwapSidebarOpen = true;
    }

    function selectAlternate(question: any) {
        if (!swapContext) return;
        const { slotIndex, subPart } = swapContext;
        const slot = currentSetData.questions[slotIndex];
        const nQ = { id: question.id, text: question.question_text, marks: question.marks, type: question.type, options: question.options, bloom: question.bloom_level, part: swapContext.part };
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

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-[#f8fafc] dark:bg-slate-950/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8 flex justify-center">
        <div id="cdu-paper-container" class="bg-white min-h-[297mm] p-[5mm] shadow-2xl font-serif text-black relative" style="width: 210mm;">
            <!-- Main Border Box -->
            <div class="border-[1.5pt] border-black flex flex-col h-full bg-white">
                <!-- Header -->
                <div class="text-center pb-4 pt-2 border-b-[1.5pt] border-black">
                    <div class="mb-2">
                        <div class="text-[28pt] font-black text-blue-800 tracking-tighter leading-none mb-1">CHAITANYA</div>
                    </div>
                    <AssessmentEditable value={paperMeta.univ_line_1 || 'CHAITANYA DEEMED TO BE UNIVERSITY'} onUpdate={(v: string) => updateTextValue(v, 'META', 'univ_line_1')} class="text-[14pt] font-bold uppercase tracking-[0.1em]" />
                    <AssessmentEditable value={paperMeta.univ_line_2 || '(DEEMED TO BE UNIVERSITY)'} onUpdate={(v: string) => updateTextValue(v, 'META', 'univ_line_2')} class="text-[11pt] font-bold uppercase" />
                    
                    <div class="mt-1 flex flex-col items-center">
                        <AssessmentEditable value={paperMeta.programme || 'B.Tech(CSE) - I SEMESTER'} onUpdate={(v: string) => updateTextValue(v, 'META', 'programme')} class="text-[11pt] font-bold uppercase text-red-600 print-red" />
                        <AssessmentEditable value={paperMeta.subject_name || 'SUBJECT NAME'} onUpdate={(v: string) => updateTextValue(v, 'META', 'subject_name')} class="text-[11pt] font-bold uppercase text-red-600 print-red" />
                    </div>

                    <!-- Time & Marks Row -->
                    <div class="mt-2 border-t-[1.5pt] border-black flex justify-between px-2 py-0.5 font-bold text-[10.5pt]">
                        <div class="flex items-center gap-1">
                            <span>Time:</span>
                            <AssessmentEditable value={paperMeta.duration_label || '1 ½ Hrs.'} onUpdate={(v: string) => updateTextValue(v, 'META', 'duration_label')} class="min-w-[40px] border-b border-dotted" />
                            <span>]</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span>[Max. Marks:</span>
                            <AssessmentEditable value={paperMeta.max_marks || '20'} onUpdate={(v: string) => updateTextValue(v, 'META', 'max_marks')} class="min-w-[20px] border-b border-dotted text-center" />
                            <span>]</span>
                        </div>
                    </div>
                </div>

                <!-- Sections -->
                <div class="flex-1 flex flex-col">
                    {#each sectionKeys as section, sIdx}
                        {@const cfg = getSectionConfig(section)}
                        <!-- Section Header Bar -->
                        <div class="bg-white border-b border-black py-0.5 text-center font-bold italic text-[10.5pt]">
                            <AssessmentEditable value={cfg?.title || `Section - ${section}`} onUpdate={(v: string) => updateSectionTitle(section, v)} class="w-full text-center" />
                        </div>

                        <!-- Instruction Bar -->
                        <div class="flex justify-between items-center px-2 py-0.5 border-b border-black font-bold italic text-[10.5pt] bg-white">
                            <AssessmentEditable value={cfg?.instructions || 'Answer any six Questions.'} onUpdate={(v: string) => updateInstructions(section, v)} class="flex-1" />
                            <AssessmentEditable value={cfg?.instructions_marks || getInstructionsMarks(section)} onUpdate={(v: string) => { if(cfg) { cfg.instructions_marks = v; paperStructure = [...paperStructure]; } }} class="text-right" />
                        </div>

                        <!-- Questions -->
                        <div class="flex flex-col min-h-[50px]" use:dndzone={{ items: (currentSetData?.questions || []).filter((q: any) => q && q.part === section), flipDurationMs: 200 }} onconsider={(e) => handleDndSync(section, (e.detail as any).items)} onfinalize={(e) => handleDndSync(section, (e.detail as any).items)}>
                            {#each (currentSetData?.questions || []) as q (q.id)}
                                {#if q && q.part === section}
                                    <div class="border-b border-black">
                                        {#if q.type === 'OR_GROUP'}
                                            <AssessmentSlotOrGroup slot={q} qNumber={getQuestionNumber(q.id)} {isEditable} snoWidth={snoWidth}
                                                onSwap1={() => openSwapSidebar(q, section, 'q1')}
                                                onSwap2={() => openSwapSidebar(q, section, 'q2')}
                                                onRemove={() => removeQuestion(q)}
                                                onUpdateText1={(v: string, qid: string) => updateTextValue(v, 'QUESTION', 'text', q.id, qid, 'choice1')}
                                                onUpdateText2={(v: string, qid: string) => updateTextValue(v, 'QUESTION', 'text', q.id, qid, 'choice2')}
                                            />
                                        {:else}
                                            <AssessmentSlotSingle slot={q} qNumber={getQuestionNumber(q.id)} {isEditable} snoWidth={snoWidth}
                                                onSwap={() => openSwapSidebar(q, section)}
                                                onRemove={() => removeQuestion(q)}
                                                onUpdateText={(v: string, qid: string) => updateTextValue(v, 'QUESTION', 'text', q.id, qid)}
                                            />
                                        {/if}
                                    </div>
                                {/if}
                            {:else}
                                {#if mode === 'preview' && cfg}
                                    {#each cfg.slots as slot}
                                        <div class="flex border-b border-black min-h-[30px] opacity-40 italic text-gray-400 font-bold bg-gray-50/20">
                                            <div class="border-r border-black flex items-center justify-center font-bold" style="width: {snoWidth}px">{slot.label}.</div>
                                            <div class="px-2 py-1 flex-1">[ {slot.type === 'OR_GROUP' ? 'OR Pair' : 'Single Question'} ] - {slot.marks} Marks</div>
                                        </div>
                                    {/each}
                                {/if}
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
            
            {#if isEditable}
                <div class="absolute top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 transition-colors z-[100] no-print" 
                     style="left: {snoWidth + 19}px;" 
                     onmousedown={(e) => onResizeStart('sno', e)} role="none"></div>
            {/if}
        </div>
    </div>

    <!-- Swap Sidebar -->
    {#if isSwapSidebarOpen && isEditable}
        <div transition:slide={{ axis: 'x', duration: 300 }} class="w-96 bg-white dark:bg-slate-900 border-l border-gray-100 dark:border-slate-800 shadow-2xl flex flex-col no-print z-[200]">
            <div class="p-6 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
                <div>
                    <h3 class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Swap Question</h3>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Available Alternatives ({swapContext.currentMark}M)</p>
                </div>
                <button onclick={() => isSwapSidebarOpen = false} class="p-2 hover:bg-gray-100 rounded-xl transition-colors"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
                {#each swapContext?.alternates || [] as q}
                    <button onclick={() => selectAlternate(q)} class="w-full text-left p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-indigo-500 hover:bg-indigo-50/50 transition-all">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[10px] font-black px-2 py-0.5 bg-white rounded text-gray-500 uppercase">{q.type || 'NORMAL'}</span>
                            <span class="text-[10px] font-black text-indigo-600">{q.marks} Marks</span>
                        </div>
                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 leading-relaxed italic line-clamp-3">{@html q.question_text}</div>
                    </button>
                {:else}
                    <div class="text-center py-20 text-gray-400 text-xs font-black uppercase tracking-widest leading-loose">No {swapContext.currentMark}M questions<br/>found in units.</div>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    @font-face { font-family: 'Times New Roman'; font-display: swap; src: local('Times New Roman'); }
    #cdu-paper-container { font-family: 'Times New Roman', Times, serif; }
    
    :global(.print-red) { color: #dc2626 !important; }
    
    @media print {
        .no-print { display: none !important; }
        #cdu-paper-container { padding: 0 !important; margin: 0 !important; width: 100% !important; box-shadow: none !important; }
        .print-red { color: #dc2626 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
</style>
