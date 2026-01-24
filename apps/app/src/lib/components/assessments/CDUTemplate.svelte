<script lang="ts">
    import { fade, slide } from 'svelte/transition';

    let { 
        paperMeta = $bindable({}), 
        currentSetData = $bindable({ questions: [] }), 
        paperStructure = [],
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
        <div id="crescent-paper-actual" class="mx-auto bg-white min-h-[297mm] p-[10mm] shadow-2xl print:shadow-none print:p-0 transition-all duration-500 font-serif text-black relative" style="width: 210mm;">
            
            <!-- Header Section -->
            <header class="text-center space-y-1 mb-4 relative z-10 font-bold">
                <div class="text-sm font-bold mb-1">Set - {activeSet}</div>
                <div class="text-xl font-black uppercase tracking-widest">CHAITANYA</div>
                <div class="text-lg font-bold uppercase tracking-tight">(DEEMED TO BE UNIVERSITY)</div>
                <div class="text-md font-bold uppercase" use:editable={{ value: paperMeta.exam_title, onUpdate: (v) => updateTextValue(v, 'META', 'exam_title') }}>{paperMeta.exam_title || 'I INTERNAL EXAMINATIONS'}</div>
                <div class="text-md font-bold uppercase text-red-600 print:text-black" use:editable={{ value: paperMeta.programme, onUpdate: (v) => updateTextValue(v, 'META', 'programme') }}>{paperMeta.programme || 'B.Tech(CSE) - I SEMESTER'}</div>
                <div class="text-md font-black uppercase text-red-600 print:text-black" use:editable={{ value: paperMeta.subject_name || 'SUBJECT NAME', onUpdate: (v) => updateTextValue(v, 'META', 'subject_name') }}>{paperMeta.subject_name || 'SUBJECT NAME'}</div>
                
                <div class="flex justify-between items-center mt-4 border-y border-black py-1 px-1">
                    <div class="flex gap-1 items-center">
                        <span>Time:</span>
                        <span class="px-1" use:editable={{ value: String((Number(paperMeta.duration_minutes)/60).toFixed(1)), onUpdate: (v) => updateTextValue(String(Number(v)*60), 'META', 'duration_minutes') }}>{(Number(paperMeta.duration_minutes)/60).toFixed(1)}</span>
                        <span>Hrs.]</span>
                    </div>
                    <div class="flex gap-1 items-center">
                        <span>[Max. Marks:</span>
                        <span class="px-1" use:editable={{ value: paperMeta.max_marks, onUpdate: (v) => updateTextValue(v, 'META', 'max_marks') }}>{paperMeta.max_marks}</span>
                    </div>
                </div>
            </header>

            <!-- Content -->
            <main class="space-y-4 relative z-10">
                {#each sections as [part, questions], sIdx}
                    <section class="space-y-2">
                        <!-- Section Divider -->
                        <div class="text-center border-y border-black py-1 uppercase font-black italic tracking-[0.2em] text-sm">
                            Section - {part}
                        </div>
                        
                        <!-- Instructions (Only for A and B defaults, but configurable) -->
                        <div class="flex justify-between items-center px-1 italic font-bold border-b border-black text-xs">
                          {#if part === 'A'}
                            <span>Answer any six Questions.</span>
                            <span>6 x 2 = 12</span>
                          {:else if part === 'B'}
                            <span>Answer the following Questions.</span>
                            <span>2 x 4 = 8</span>
                          {:else}
                            <span>Answer the following questions.</span>
                          {/if}
                        </div>

                        <div class="space-y-1">
                            {#each questions as q, qIdx}
                                {#if q.type === 'OR_GROUP'}
                                    <div class="space-y-3 pt-2">
                                        <!-- Choice 1 -->
                                        <div class="group relative flex gap-4 hover:bg-slate-50 transition-colors">
                                            {#if isEditable}
                                                <div class="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                    <button onclick={() => openSwapSidebar(q, part, 'q1')} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="flex flex-col items-center">
                                                <span class="font-bold min-w-[20px] text-sm">{getQuestionNumber(sIdx, qIdx, 'OR_A')}.</span>
                                            </div>
                                            <div class="flex-1 text-sm leading-relaxed outline-none min-h-[1.5em] px-1" use:editable={{ value: q.choice1?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice1?.questions?.[0]?.id, 'choice1') }}>
                                                {@html q.choice1?.questions?.[0]?.text || ''}
                                            </div>
                                            <div class="min-w-[30px] text-right font-bold text-xs pt-1">[{q.choice1?.questions?.[0]?.marks || 4}]</div>
                                        </div>

                                        <!-- OR separator -->
                                        <div class="text-center font-black uppercase text-[10px] tracking-[0.5em] py-1">OR</div>

                                        <!-- Choice 2 -->
                                        <div class="group relative flex gap-4 hover:bg-slate-50 transition-colors">
                                            {#if isEditable}
                                                <div class="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                    <button onclick={() => openSwapSidebar(q, part, 'q2')} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                </div>
                                            {/if}
                                            <div class="flex flex-col items-center">
                                                <span class="font-bold min-w-[20px] text-sm">{getQuestionNumber(sIdx, qIdx, 'OR_B')}.</span>
                                            </div>
                                            <div class="flex-1 text-sm leading-relaxed outline-none min-h-[1.5em] px-1" use:editable={{ value: q.choice2?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice2?.questions?.[0]?.id, 'choice2') }}>
                                                {@html q.choice2?.questions?.[0]?.text || ''}
                                            </div>
                                            <div class="min-w-[30px] text-right font-bold text-xs pt-1">[{q.choice2?.questions?.[0]?.marks || 4}]</div>
                                        </div>
                                    </div>
                                    <div class="border-b border-black/10 my-2"></div>
                                {:else}
                                    <div class="group relative flex gap-4 min-h-[40px] hover:bg-slate-50 transition-colors border-b border-black/10 py-2 last:border-0 items-start">
                                        {#if isEditable}
                                            <div class="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                                <button onclick={() => openSwapSidebar(q, part)} title="Swap Question" class="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow hover:bg-indigo-700 animate-in fade-in"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                <button onclick={() => removeQuestion(q)} title="Delete Question" class="w-7 h-7 bg-red-500 text-white rounded-lg flex items-center justify-center shadow hover:bg-red-600 animate-in fade-in"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        {/if}
                                        <div class="flex flex-col items-center">
                                            <span class="font-bold min-w-[20px] text-sm">{getQuestionNumber(sIdx, qIdx)}.</span>
                                        </div>
                                        <div class="flex-1 text-sm leading-relaxed outline-none min-h-[1.5em] px-1" use:editable={{ value: q.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.questions?.[0]?.id) }}>
                                            {@html q.questions?.[0]?.text || ''}
                                        </div>
                                        <div class="min-w-[30px] text-right font-bold text-xs pt-1 group/mark relative">
                                            <div 
                                                role="button"
                                                tabindex="0"
                                                class="cursor-pointer hover:bg-indigo-50 px-1 rounded transition-colors {isEditable ? 'border-b border-dotted border-gray-300' : ''}"
                                                onclick={(e) => { if (!isEditable) return; e.stopPropagation(); activeMenuId = (activeMenuId === q.id ? null : q.id); }}
                                                onkeydown={(e) => e.key === 'Enter' && isEditable && (activeMenuId = (activeMenuId === q.id ? null : q.id))}
                                            >
                                                [{q.questions?.[0]?.marks || 2}]
                                            </div>
                                            {#if activeMenuId === q.id && isEditable}
                                                <div transition:fade={{ duration: 100 }} onclick={(e) => e.stopPropagation()} role="none" class="absolute right-0 top-6 w-32 bg-white rounded-lg shadow-xl border border-gray-100 p-2 z-50 no-print">
                                                    <select value={q.questions?.[0]?.co_id} onchange={(e: any) => updateCO(q.id, q.questions?.[0]?.id, e.target.value)} class="w-full text-[10px] font-bold border-none bg-gray-50 focus:ring-0">
                                                        <option value="">No CO</option>
                                                        {#each courseOutcomes as co}<option value={co.id}>{co.code}</option>{/each}
                                                    </select>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    </section>
                {/each}
            </main>
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
</style>
