<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { dndzone, SOURCES, TRIGGERS } from 'svelte-dnd-action';
    import { flip } from 'svelte/animate';

    let { 
        paperMeta = $bindable({}), 
        currentSetData = $bindable({ questions: [] }), 
        paperStructure = $bindable([]),
        courseOutcomes = [],
        questionPool = [],
        mode = 'view',
        activeSet = 'A'
    } = $props();

    let activeMenuId = $state<string | null>(null);
    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);

    // Column Widths (State-backed, persistent in meta)
    let snoWidth = $derived(Number(paperMeta.colWidths?.sno || 40));
    let isResizing = $state<null | 'sno'>(null);

    // Initialize colWidths in meta if missing
    $effect(() => {
        if (!paperMeta.colWidths) {
            paperMeta.colWidths = { sno: 40 };
        }
    });

    // Custom action for robust contenteditable management
    function editable(node: HTMLElement, params: { value: string, onUpdate: (v: string) => void }) {
        let { value, onUpdate } = params;
        node.innerHTML = value || '';
        node.contentEditable = isEditable ? "true" : "false";
        let lastValue = value;

        const handleBlur = () => {
            const current = node.innerHTML;
            if (current !== lastValue) {
                lastValue = current;
                onUpdate(current);
            }
        };

        node.addEventListener('blur', handleBlur);

        return {
            update(newParams: { value: string }) {
                node.contentEditable = isEditable ? "true" : "false";
                if (newParams.value !== lastValue) {
                    lastValue = newParams.value;
                    node.innerHTML = newParams.value || '';
                }
            },
            destroy() {
                node.removeEventListener('blur', handleBlur);
            }
        };
    }

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

    const isEditable = $derived(mode === 'edit');
    
    // Sort sections for consistent layout
    const sectionKeys = $derived.by(() => {
        const keys = new Set<string>();
        (currentSetData.questions || []).forEach((q: any) => keys.add(q.part || 'A'));
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

    function handleDndConsider(section: string, e: any) {
        const { items } = e.detail;
        handleDndSync(section, items);
    }

    function handleDndFinalize(section: string, e: any) {
        const { items } = e.detail;
        handleDndSync(section, items);
    }

    // Resizing Logics
    function onResizeStart(col: 'sno', e: MouseEvent) {
        if (!isEditable) return;
        isResizing = col;
        document.body.classList.add('cursor-col-resize');
        window.addEventListener('mousemove', onResizing);
        window.addEventListener('mouseup', onResizeEnd);
    }

    function onResizing(e: MouseEvent) {
        if (!isResizing) return;
        const delta = e.movementX;
        if (isResizing === 'sno') {
            paperMeta.colWidths.sno = Math.max(30, Math.min(100, (paperMeta.colWidths.sno || 40) + delta));
        }
    }

    function onResizeEnd() {
        isResizing = null;
        document.body.classList.remove('cursor-col-resize');
        window.removeEventListener('mousemove', onResizing);
        window.removeEventListener('mouseup', onResizeEnd);
    }

    // Terminology terminators
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

    function updateTextValue(value: string, type: 'META' | 'QUESTION', field: string, slotId?: string, qId?: string, subPart?: 'choice1' | 'choice2') {
        if (!isEditable) return;
        
        if (type === 'META') {
            (paperMeta as any)[field] = value;
        } else {
            const targetArr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
            let slot = targetArr.find((s: any) => s.id === slotId);
            if (!slot) return;

            let q: any = null;
            if (slot.type === 'SINGLE' || !slot.type) {
                const subArr = slot.questions || [slot];
                q = subArr.find((item: any) => item.id === qId);
            } else if (slot.type === 'OR_GROUP') {
                const choice = subPart === 'choice1' ? slot.choice1 : slot.choice2;
                q = choice.questions.find((item: any) => item.id === qId);
            }

            if (q) {
                q.text = value;
                q.question_text = value;
                currentSetData.questions = [...currentSetData.questions];
            }
        }
    }

    function updateCO(slotId: string, qId: string, coId: string, subPart?: 'choice1' | 'choice2') {
        if (!isEditable) return;
        const targetArr = currentSetData.questions;
        let slot = targetArr.find((s: any) => s.id === slotId);
        if (!slot) return;

        let q: any = null;
        if (slot.type === 'SINGLE' || !slot.type) {
            const subArr = slot.questions || [slot];
            q = subArr.find((item: any) => item.id === qId);
        } else if (slot.type === 'OR_GROUP') {
            const choice = subPart === 'choice1' ? slot.choice1 : slot.choice2;
            q = choice.questions.find((item: any) => item.id === qId);
        }

        if (q) {
            q.co_id = coId;
            q.course_outcome_id = coId;
            currentSetData.questions = [...currentSetData.questions];
        }
    }

    function removeQuestion(slot: any) {
        if (!confirm('Are you sure you want to delete this question?')) return;
        currentSetData.questions = (currentSetData.questions || []).filter((s: any) => s.id !== slot.id);
    }

    function openSwapSidebar(slot: any, part: string, subPart?: 'q1' | 'q2') {
        if (!slot) return;
        const arr = currentSetData.questions;
        const index = arr.findIndex((s: any) => s.id === slot.id);
        if (index === -1) return;

        let currentQ: any = null;
        if (slot.type === 'SINGLE') {
            currentQ = slot.questions?.[0];
        } else if (slot.type === 'OR_GROUP') {
            currentQ = subPart === 'q1' ? slot.choice1?.questions?.[0] : slot.choice2?.questions?.[0];
        }

        const marks = Number(currentQ?.marks || slot.marks || (part === 'A' ? 2 : 4));
        const unitId = currentQ?.unit_id || slot.unit_id;

        let alternates = (questionPool || []).filter((q: any) => {
            const qMarks = Number(q.marks || q.mark);
            return qMarks === marks && q.id !== currentQ?.id;
        });
        
        swapContext = { slotIndex: index, part, subPart, currentMark: marks, currentUnit: unitId, alternates };
        isSwapSidebarOpen = true;
    }

    function selectAlternate(question: any) {
        if (!swapContext) return;
        const { slotIndex, subPart } = swapContext;
        const slot = currentSetData.questions[slotIndex];
        if (!slot) return;

        const newQData = {
            id: question.id,
            text: question.question_text,
            marks: question.marks,
            type: question.type,
            options: question.options,
            co_id: question.co_id || question.course_outcome_id,
            course_outcome_id: question.co_id || question.course_outcome_id,
            bloom: question.bloom_level
        };

        if (slot.type === 'SINGLE' || !slot.type) slot.questions = [newQData];
        else if (slot.type === 'OR_GROUP') {
            if (subPart === 'q1') slot.choice1.questions = [newQData];
            else slot.choice2.questions = [newQData];
        }

        currentSetData.questions = [...currentSetData.questions];
        isSwapSidebarOpen = false;
    }

    // Dynamic Numbering
    function getQuestionNumber(qId: string) {
        const questions = currentSetData.questions || [];
        let total = 0;
        for (const q of questions) {
            if (q.id === qId) return total + 1;
            total += (q.type === 'OR_GROUP' ? 2 : 1);
        }
        return 0;
    }
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-50 dark:bg-slate-950/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8 relative">
        <div id="crescent-paper-actual" class="mx-auto bg-white min-h-[297mm] p-[5mm] shadow-2xl print:shadow-none print:p-0 transition-all duration-500 font-serif text-black relative border-[1.5pt] border-black" style="width: 210mm; box-sizing: border-box;">
            
            <!-- University Header (Using div to avoid global print:hide on <header>) -->
            <div class="paper-header text-center font-bold mb-4">
                <div class="text-[10px] mb-1">Set - {activeSet}</div>
                <div class="text-[17pt] font-black uppercase tracking-widest cursor-text hover:bg-slate-50 transition-colors" use:editable={{ value: paperMeta.univ_line_1 || 'CHAITANYA', onUpdate: (v) => updateTextValue(v, 'META', 'univ_line_1') }}>{paperMeta.univ_line_1 || 'CHAITANYA'}</div>
                <div class="text-[11pt] font-bold uppercase tracking-tight cursor-text hover:bg-slate-50 transition-colors" use:editable={{ value: paperMeta.univ_line_2 || '(DEEMED TO BE UNIVERSITY)', onUpdate: (v) => updateTextValue(v, 'META', 'univ_line_2') }}>{paperMeta.univ_line_2 || '(DEEMED TO BE UNIVERSITY)'}</div>
                <div class="text-[11pt] font-bold uppercase cursor-text transition-colors hover:bg-slate-50" use:editable={{ value: paperMeta.exam_title || 'I INTERNAL EXAMINATIONS - NOV 2024', onUpdate: (v) => updateTextValue(v, 'META', 'exam_title') }}>{paperMeta.exam_title || 'I INTERNAL EXAMINATIONS - NOV 2024'}</div>
                <div class="text-[11pt] font-bold uppercase text-red-600 print:text-black cursor-text transition-colors hover:bg-slate-50" use:editable={{ value: paperMeta.programme || 'B.Tech(CSE) - I SEMESTER', onUpdate: (v) => updateTextValue(v, 'META', 'programme') }}>{paperMeta.programme || 'B.Tech(CSE) - I SEMESTER'}</div>
                <div class="text-[11pt] font-black uppercase text-red-600 print:text-black cursor-text transition-colors hover:bg-slate-50" use:editable={{ value: paperMeta.subject_name || 'SUBJECT NAME', onUpdate: (v) => updateTextValue(v, 'META', 'subject_name') }}>{paperMeta.subject_name || 'SUBJECT NAME'}</div>
                
                <div class="mt-2 border-y-[1.2pt] border-black">
                    <div class="flex justify-between items-center py-0.5 px-0.5 font-bold text-[10.5pt]">
                        <div class="flex gap-1 items-center">
                            <span>Time:</span>
                            <span class="px-2 cursor-text transition-colors hover:bg-slate-50 border-b border-dotted border-gray-300" use:editable={{ value: String((Number(paperMeta.duration_minutes)/60).toFixed(1)), onUpdate: (v) => updateTextValue(String(Number(v)*60), 'META', 'duration_minutes') }}>{(Number(paperMeta.duration_minutes)/60).toFixed(1)}</span>
                            <span>Hrs.]</span>
                        </div>
                        <div class="flex gap-1 items-center">
                            <span>[Max. Marks:</span>
                            <span class="px-2 cursor-text transition-colors hover:bg-slate-50 border-b border-dotted border-gray-300" use:editable={{ value: paperMeta.max_marks || '20', onUpdate: (v) => updateTextValue(v, 'META', 'max_marks') }}>{paperMeta.max_marks || '20'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Interactive Content (Div-Grid based) -->
            <div class="flex flex-col border-t-[1.5pt] border-x-[1.5pt] border-b-[1.5pt] border-black -mx-[5mm] print:mx-0">
                {#each sectionKeys as section}
                    <!-- Section Header Row -->
                    <div class="w-full text-center border-b border-black py-1 uppercase font-black italic tracking-[0.2em] text-sm cursor-text hover:bg-slate-50" use:editable={{ value: getSectionConfig(section)?.title?.replace('PART', 'SECTION') || `SECTION - ${section}`, onUpdate: (v) => updateSectionTitle(section, v) }}>
                        {getSectionConfig(section)?.title?.replace('PART', 'SECTION') || `SECTION - ${section}`}
                    </div>

                    <!-- Instructions Row -->
                    <div class="w-full flex items-center justify-between border-b border-black px-1 py-1 font-bold italic text-xs min-h-[22px] bg-white">
                         <div class="flex-1 cursor-text hover:bg-slate-50 mr-4" use:editable={{ value: getSectionConfig(section)?.instructions || 'Answer the following Questions.', onUpdate: (v) => updateInstructions(section, v) }}>
                            {getSectionConfig(section)?.instructions || 'Answer the following Questions.'}
                         </div>
                         <div class="tabular-nums cursor-text hover:bg-slate-50 no-print text-right pl-4" use:editable={{ value: getSectionConfig(section)?.instructions_marks || '6 x 2 = 12', onUpdate: (v) => { const cfg = getSectionConfig(section); if(cfg) cfg.instructions_marks = v; } }}>
                             {getSectionConfig(section)?.instructions_marks || '6 x 2 = 12'}
                         </div>
                    </div>

                    <!-- Question Draggable Container -->
                    <div 
                        class="w-full flex flex-col min-h-[50px]"
                        use:dndzone={{ items: (currentSetData.questions || []).filter((q: any) => q.part === section), flipDurationMs: 200, dropTargetStyle: { outline: '2px dashed #6366f1' } }}
                        onconsider={(e) => handleDndConsider(section, e)}
                        onfinalize={(e) => handleDndFinalize(section, e)}
                    >
                        {#each (currentSetData.questions || []).filter((q: any) => q.part === section) as q (q.id)}
                            <div animate:flip={{ duration: 200 }} class="w-full group/row relative flex flex-col border-b border-black last:border-b-0 hover:bg-indigo-50/10 transition-colors">
                                
                                {#if q.type === 'OR_GROUP'}
                                    <!-- Choice 1 Row -->
                                    <div class="flex divide-x-[1.5pt] divide-black min-h-[40px]">
                                        <div class="flex items-center justify-center font-bold text-sm tabular-nums" style="width: {snoWidth}px">
                                            {getQuestionNumber(q.id)}.
                                        </div>
                                        <div class="flex-1 px-2 py-2 text-sm leading-relaxed relative cursor-grab active:cursor-grabbing">
                                            {#if isEditable}
                                                <div class="absolute -left-12 top-1 flex flex-col gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity no-print z-50">
                                                    <button onclick={() => openSwapSidebar(q, section, 'q1')} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700 active:scale-95"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                    <button onclick={(e) => e.stopPropagation()} title="Drag to reorder" class="w-7 h-7 bg-slate-800 text-white rounded-lg flex items-center justify-center shadow cursor-grab active:grabbing"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="outline-none cursor-text focus:bg-white rounded transition-colors" use:editable={{ value: q.choice1?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice1?.questions?.[0]?.id, 'choice1') }}>
                                                {@html q.choice1?.questions?.[0]?.text || ''}
                                            </div>
                                            {#if q.choice1?.questions?.[0]?.options?.length > 0}
                                                <div class="mt-1 text-xs grid grid-cols-2 gap-x-4 opacity-80 italic">
                                                    {#each q.choice1.questions[0].options as opt, i}
                                                        <span>({String.fromCharCode(97 + i)}) {opt}</span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>

                                    <!-- OR Row -->
                                    <div class="flex divide-x-[1.5pt] divide-black border-y border-black">
                                         <div style="width: {snoWidth}px"></div>
                                         <div class="flex-1 text-center font-black uppercase text-[11px] tracking-[0.5em] py-0.5">OR</div>
                                    </div>

                                    <!-- Choice 2 Row -->
                                    <div class="flex divide-x-[1.5pt] divide-black min-h-[40px]">
                                        <div class="flex items-center justify-center font-bold text-sm tabular-nums" style="width: {snoWidth}px">
                                            {getQuestionNumber(q.id) + 1}.
                                        </div>
                                        <div class="flex-1 px-2 py-2 text-sm leading-relaxed">
                                            <div class="outline-none cursor-text focus:bg-white rounded transition-colors" use:editable={{ value: q.choice2?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice2?.questions?.[0]?.id, 'choice2') }}>
                                                {@html q.choice2?.questions?.[0]?.text || ''}
                                            </div>
                                            {#if q.choice2?.questions?.[0]?.options?.length > 0}
                                                <div class="mt-1 text-xs grid grid-cols-2 gap-x-4 opacity-80 italic">
                                                    {#each q.choice2.questions[0].options as opt, i}
                                                        <span>({String.fromCharCode(97 + i)}) {opt}</span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {:else}
                                    <!-- Single Question Row -->
                                    <div class="flex divide-x-[1.5pt] divide-black min-h-[40px]">
                                        <div class="flex items-center justify-center font-bold text-sm tabular-nums" style="width: {snoWidth}px">
                                            {getQuestionNumber(q.id)}.
                                        </div>
                                        <div class="flex-1 px-2 py-2 text-sm leading-relaxed relative cursor-grab">
                                            {#if isEditable}
                                                <div class="absolute -left-12 top-1 flex flex-col gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity no-print z-50">
                                                    <button onclick={() => openSwapSidebar(q, section)} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700 active:scale-95"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                    <button onclick={(e) => e.stopPropagation()} title="Drag to reorder" class="w-7 h-7 bg-slate-800 text-white rounded-lg flex items-center justify-center shadow cursor-grab active:grabbing"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg></button>
                                                    <button onclick={() => removeQuestion(q)} title="Delete Question" class="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center shadow hover:bg-red-600 active:scale-95"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="outline-none cursor-text focus:bg-white rounded transition-colors" use:editable={{ value: q.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.questions?.[0]?.id) }}>
                                                {@html q.questions?.[0]?.text || ''}
                                            </div>
                                            {#if q.questions?.[0]?.options?.length > 0}
                                                <div class="mt-1 text-xs grid grid-cols-2 gap-x-4 opacity-80 italic">
                                                    {#each q.questions[0].options as opt, i}
                                                        <span>({String.fromCharCode(97 + i)}) {opt}</span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/each}

                <!-- Persistent Resize Handles (Floating Over Boarders) -->
                {#if isEditable}
                    <div 
                        class="absolute top-0 bottom-0 w-3 cursor-col-resize hover:bg-indigo-500/20 group transition-all no-print flex items-center justify-center p-0" 
                        style="left: {snoWidth}px; transform: translateX(-50%); z-index: 60;"
                        onmousedown={(e) => onResizeStart('sno', e)}
                        role="none"
                    >
                        <div class="h-8 w-1 bg-indigo-200 group-hover:bg-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Swap Sidebar -->
    {#if isSwapSidebarOpen && isEditable}
        <div transition:slide={{ axis: 'x', duration: 350 }} class="w-96 bg-white dark:bg-slate-900 border-l border-gray-100 dark:border-slate-800 shadow-2xl flex flex-col no-print z-[80]">
            <div class="p-6 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
                <div>
                    <h3 class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Swap Question</h3>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Available Alternatives</p>
                </div>
                <button onclick={() => isSwapSidebarOpen = false} title="Close Sidebar" class="p-2 hover:bg-gray-100 rounded-xl transition-colors"><svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
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
    @font-face {
        font-family: 'Times New Roman';
        font-display: swap;
        src: local('Times New Roman');
    }
    #crescent-paper-actual {
        font-family: 'Times New Roman', Times, serif;
    }
    :global(img) {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 10px 0;
    }
    .cursor-text { cursor: text; }
    #crescent-paper-actual { overflow: visible !important; }
    .paper-header { display: block !important; }
</style>
