<script lang="ts">
    import { fade, slide } from 'svelte/transition';

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

    // Custom action for robust contenteditable management
    function editable(node: HTMLElement, params: { value: string, onUpdate: (v: string) => void }) {
        let { value, onUpdate } = params;
        node.innerHTML = value || '';
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
    const safeQuestions: any[] = $derived(currentSetData.questions || []);

    // Helper to get section configuration from paperStructure
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

    // Filter questions by part (CDU uses Sections A, B, C...)
    const sections = $derived.by(() => {
        const map: Record<string, any[]> = {};
        safeQuestions.forEach((q: any) => {
            const part = q.part || 'A';
            if (!map[part]) map[part] = [];
            map[part].push(q);
        });
        return Object.entries(map).sort(([k1], [k2]) => k1.localeCompare(k2));
    });

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
                // Force reactivity
                if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
                else currentSetData.questions = [...currentSetData.questions];
            }
        }
    }

    function updateCO(slotId: string, qId: string, coId: string, subPart?: 'choice1' | 'choice2') {
        if (!isEditable) return;
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
            q.co_id = coId;
            q.course_outcome_id = coId;
            // Force reactivity
            if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
            else currentSetData.questions = [...currentSetData.questions];
        }
    }

    function removeQuestion(slot: any) {
        if (!confirm('Are you sure you want to delete this question?')) return;
        let targetArr = Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || []);
        const filtered = targetArr.filter((s: any) => s.id !== slot.id);
        if (Array.isArray(currentSetData)) currentSetData = [...filtered];
        else currentSetData.questions = [...filtered];
    }

    function openSwapSidebar(slot: any, part: string, subPart?: 'q1' | 'q2') {
        if (!slot) return;
        const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
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
        
        if (unitId) {
            alternates = [
                ...alternates.filter(q => q.unit_id === unitId),
                ...alternates.filter(q => q.unit_id !== unitId)
            ];
        }

        swapContext = {
            slotIndex: index,
            part,
            subPart,
            currentMark: marks,
            currentUnit: unitId,
            alternates
        };
        isSwapSidebarOpen = true;
    }

    function selectAlternate(question: any) {
        if (!swapContext) return;
        const { slotIndex, subPart } = swapContext;
        const targetArr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        const slot = targetArr[slotIndex];
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

        if (slot.type === 'SINGLE' || !slot.type) {
            slot.questions = [newQData];
        } else if (slot.type === 'OR_GROUP') {
            if (subPart === 'q1') slot.choice1.questions = [newQData];
            else slot.choice2.questions = [newQData];
        }

        if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
        else currentSetData.questions = [...currentSetData.questions];
        isSwapSidebarOpen = false;
    }

    function getCOCode(id: string) {
        return courseOutcomes.find((c: any) => c.id === id)?.code || '';
    }

    // Calculate dynamic numbering across sections
    function getQuestionNumber(sectionIndex: number, qIndex: number, type?: 'OR_A' | 'OR_B') {
        let total = 0;
        for(let i=0; i<sectionIndex; i++) {
            const qs = sections[i][1];
            qs.forEach(q => {
                total += (q.type === 'OR_GROUP' ? 2 : 1);
            });
        }
        
        const currentSectionQs = sections[sectionIndex][1];
        let sectionOffset = 0;
        for(let i=0; i<qIndex; i++) {
            sectionOffset += (currentSectionQs[i].type === 'OR_GROUP' ? 2 : 1);
        }

        if (type === 'OR_A') return total + sectionOffset + 1;
        if (type === 'OR_B') return total + sectionOffset + 2;
        return total + sectionOffset + 1;
    }
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-50 dark:bg-slate-950/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8 relative">
        <div id="crescent-paper-actual" class="mx-auto bg-white min-h-[297mm] p-[5mm] shadow-2xl print:shadow-none print:p-0 transition-all duration-500 font-serif text-black relative border-[1.5pt] border-black" style="width: 210mm; box-sizing: border-box;">
            
            <!-- Header Section -->
            <header class="text-center font-bold mb-4">
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
            </header>

            <!-- Table Structure for Content -->
            <div class="border-t-[1.5pt] border-black -mx-[5mm] print:mx-0">
                <table class="w-full border-collapse border-b-[1.5pt] border-black">
                    <tbody>
                        {#each sections as [part, questions], sIdx}
                            <!-- Section Row -->
                            <tr>
                                <td colspan="3" class="text-center border-b border-black py-1 uppercase font-black italic tracking-[0.2em] text-sm cursor-text hover:bg-slate-50" use:editable={{ value: getSectionConfig(part)?.title || `Section - ${part}`, onUpdate: (v) => updateSectionTitle(part, v) }}>
                                    {getSectionConfig(part)?.title || `Section - ${part}`}
                                </td>
                            </tr>
                            
                            <!-- Instructions Row -->
                            <tr>
                                <td colspan="3" class="border-b border-black">
                                    <div class="flex justify-between items-center px-1 italic font-bold text-xs min-h-[1.5rem]">
                                        <div class="flex-1 cursor-text transition-colors hover:bg-slate-50" use:editable={{ value: getSectionConfig(part)?.instructions || (part === 'A' ? 'Answer any six Questions.' : 'Answer the following Questions.'), onUpdate: (v) => updateInstructions(part, v) }}>
                                            {getSectionConfig(part)?.instructions || (part === 'A' ? 'Answer any six Questions.' : 'Answer the following Questions.')}
                                        </div>
                                        <div class="no-print tabular-nums">
                                        {#if part === 'A'}
                                            <span class="pl-4">6 x 2 = 12</span>
                                        {:else if part === 'B'}
                                            <span class="pl-4">2 x 4 = 8</span>
                                        {/if}
                                        </div>
                                    </div>
                                </td>
                            </tr>

                            <!-- Questions -->
                            {#each questions as q, qIdx}
                                {#if q.type === 'OR_GROUP'}
                                    <!-- Choice 1 Row -->
                                    <tr class="group relative hover:bg-slate-50/50">
                                        <td class="w-[30pt] border-r border-black font-bold text-center align-top py-2 text-sm tabular-nums">
                                            {getQuestionNumber(sIdx, qIdx, 'OR_A')}.
                                        </td>
                                        <td class="px-2 py-2 text-sm leading-relaxed align-top relative">
                                            {#if isEditable}
                                                <div class="absolute -left-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                    <button onclick={() => openSwapSidebar(q, part, 'q1')} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="outline-none cursor-text min-h-[1.5em]" use:editable={{ value: q.choice1?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice1?.questions?.[0]?.id, 'choice1') }}>
                                                {@html q.choice1?.questions?.[0]?.text || ''}
                                            </div>
                                        </td>
                                        <td class="w-[40pt] border-l border-black text-center align-top py-2 font-bold text-sm tabular-nums">
                                            [{q.choice1?.questions?.[0]?.marks || 4}]
                                        </td>
                                    </tr>

                                    <!-- OR Row -->
                                    <tr>
                                        <td class="w-[30pt] border-r border-black"></td>
                                        <td class="text-center font-black uppercase text-[11px] tracking-[0.5em] py-1 border-y border-black">OR</td>
                                        <td class="w-[40pt] border-l border-black"></td>
                                    </tr>

                                    <!-- Choice 2 Row -->
                                    <tr class="group relative hover:bg-slate-50/50 border-b border-black">
                                        <td class="w-[30pt] border-r border-black font-bold text-center align-top py-2 text-sm tabular-nums">
                                            {getQuestionNumber(sIdx, qIdx, 'OR_B')}.
                                        </td>
                                        <td class="px-2 py-2 text-sm leading-relaxed align-top relative">
                                            {#if isEditable}
                                                <div class="absolute -left-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                    <button onclick={() => openSwapSidebar(q, part, 'q2')} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="outline-none cursor-text min-h-[1.5em]" use:editable={{ value: q.choice2?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice2?.questions?.[0]?.id, 'choice2') }}>
                                                {@html q.choice2?.questions?.[0]?.text || ''}
                                            </div>
                                        </td>
                                        <td class="w-[40pt] border-l border-black text-center align-top py-2 font-bold text-sm tabular-nums">
                                            [{q.choice2?.questions?.[0]?.marks || 4}]
                                        </td>
                                    </tr>
                                {:else}
                                    <!-- Single Question Row -->
                                    <tr class="group relative hover:bg-slate-50/50 border-b border-black last:border-b-0">
                                        <td class="w-[30pt] border-r border-black font-bold text-center align-top py-2 text-sm tabular-nums">
                                            {getQuestionNumber(sIdx, qIdx)}.
                                        </td>
                                        <td class="px-2 py-2 text-sm leading-relaxed align-top relative">
                                            {#if isEditable}
                                                <div class="absolute -left-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                    <button onclick={() => openSwapSidebar(q, part)} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700 animate-in fade-in"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                    <button onclick={() => removeQuestion(q)} title="Delete Question" class="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center shadow hover:bg-red-600 animate-in fade-in"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="outline-none cursor-text min-h-[1.5em]" use:editable={{ value: q.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.questions?.[0]?.id) }}>
                                                {@html q.questions?.[0]?.text || ''}
                                            </div>
                                        </td>
                                        <td class="w-[40pt] border-l border-black text-center align-top py-2 group/mark relative tabular-nums">
                                            <div 
                                                role="button"
                                                tabindex="0"
                                                class="cursor-pointer hover:bg-indigo-50 px-1 rounded transition-colors font-bold text-sm {isEditable ? 'border-b border-dotted border-gray-300' : ''}"
                                                onclick={(e) => { if (!isEditable) return; e.stopPropagation(); activeMenuId = (activeMenuId === q.id ? null : q.id); }}
                                                onkeydown={(e) => e.key === 'Enter' && isEditable && (activeMenuId = (activeMenuId === q.id ? null : q.id))}
                                            >
                                                [{q.questions?.[0]?.marks || 2}]
                                        </div>
                                            {#if activeMenuId === q.id && isEditable}
                                                <div transition:fade={{ duration: 100 }} onclick={(e) => e.stopPropagation()} role="none" class="absolute right-0 top-10 w-32 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-50 no-print">
                                                    <div class="text-[9px] font-black uppercase text-gray-400 mb-2 px-1">Map Outcome</div>
                                                    <select value={q.questions?.[0]?.co_id} onchange={(e: any) => updateCO(q.id, q.questions?.[0]?.id, e.target.value)} class="w-full text-[10px] font-bold border-none bg-gray-50 focus:ring-0 rounded-lg">
                                                        <option value="">No CO</option>
                                                        {#each courseOutcomes as co}<option value={co.id}>{co.code}</option>{/each}
                                                    </select>
                                                </div>
                                            {/if}
                                        </td>
                                    </tr>
                                {/if}
                            {/each}
                        {/each}
                    </tbody>
                </table>
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
    table { table-layout: fixed; }
</style>
