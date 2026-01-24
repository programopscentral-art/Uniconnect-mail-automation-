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
    const safeQuestions = $derived(currentSetData.questions || []);

    // Filter questions by part (CDU uses Sections A and B)
    const partAQuestions = $derived(safeQuestions.filter(q => q.part === 'A'));
    const partBQuestions = $derived(safeQuestions.filter(q => q.part === 'B'));

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

    function openSwapSidebar(slot: any, part: 'A' | 'B', subPart?: 'q1' | 'q2') {
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
        return courseOutcomes.find(c => c.id === id)?.code || '';
    }
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-50 dark:bg-slate-950/50">
    <div class="flex-1 overflow-auto p-4 sm:p-8 relative">
        <div id="crescent-paper-actual" class="mx-auto bg-white min-h-[297mm] p-[15mm] shadow-2xl print:shadow-none print:p-0 transition-all duration-500 font-serif text-black relative" style="width: 210mm;">
            
            <!-- Watermark (Subtle) -->
            <div class="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] rotate-[-45deg] overflow-hidden select-none">
                <span class="text-[120px] font-black tracking-tighter uppercase whitespace-nowrap">CDU ASSESSMENT</span>
            </div>

            <!-- Header Section -->
            <header class="text-center space-y-2 border-b-2 border-black pb-4 mb-4 relative z-10">
                <h3 class="text-sm font-bold uppercase tracking-widest">Set - {activeSet}</h3>
                <h1 class="text-2xl font-black uppercase tracking-tight">CHAITANYA</h1>
                <h2 class="text-lg font-bold uppercase tracking-tighter">(DEEMED TO BE UNIVERSITY)</h2>
                <h3 class="text-md font-bold uppercase" use:editable={{ value: paperMeta.exam_title, onUpdate: (v) => updateTextValue(v, 'META', 'exam_title') }}>{paperMeta.exam_title || 'I INTERNAL EXAMINATIONS'}</h3>
                <h4 class="text-md font-bold uppercase text-red-600 print:text-black" use:editable={{ value: paperMeta.programme, onUpdate: (v) => updateTextValue(v, 'META', 'programme') }}>{paperMeta.programme || 'BS(CS) & II SEMESTER'}</h4>
                <h4 class="text-md font-black uppercase underline decoration-2 underline-offset-4" use:editable={{ value: paperMeta.subject_name, onUpdate: (v) => updateTextValue(v, 'META', 'subject_name') }}>{paperMeta.subject_name || 'SUBJECT NAME'}</h4>
                
                <div class="flex justify-between items-end mt-6 px-1">
                    <div class="text-left font-bold underline decoration-1 underline-offset-4 flex gap-1">
                        <span>Time:</span>
                        <span use:editable={{ value: String((Number(paperMeta.duration_minutes)/60).toFixed(1)), onUpdate: (v) => updateTextValue(String(Number(v)*60), 'META', 'duration_minutes') }}>{(Number(paperMeta.duration_minutes)/60).toFixed(1)}</span>
                        <span>Hrs.]</span>
                    </div>
                    <div class="text-right font-bold underline decoration-1 underline-offset-4 flex gap-1">
                        <span>[Max. Marks:</span>
                        <span use:editable={{ value: paperMeta.max_marks, onUpdate: (v) => updateTextValue(v, 'META', 'max_marks') }}>{paperMeta.max_marks}</span>
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
                            <div class="group relative py-3 px-1 flex gap-4 min-h-[50px] hover:bg-slate-50/50 transition-colors">
                                <!-- Swap/Delete Buttons -->
                                {#if isEditable}
                                    <div class="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                        <button 
                                            onclick={() => openSwapSidebar(q, 'A')}
                                            class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                                            title="Swap Question"
                                        >
                                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        </button>
                                        <button 
                                            onclick={() => removeQuestion(q)}
                                            class="w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-red-600 active:scale-95 transition-all"
                                            title="Delete Question"
                                        >
                                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                {/if}

                                <span class="font-bold min-w-[24px]">{i + 1}.</span>
                                <div class="flex-1 space-y-2">
                                    <div 
                                        use:editable={{ value: q.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.questions?.[0]?.id) }}
                                        class="text-sm leading-relaxed outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 whitespace-pre-wrap"
                                    >
                                        {q.questions?.[0]?.text || ''}
                                    </div>
                                </div>

                                <!-- Marks & CO Holder -->
                                <div class="min-w-[60px] flex flex-col items-end pt-1 group/mark relative">
                                    <div 
                                        role="button"
                                        tabindex="0"
                                        class="text-xs font-bold cursor-pointer hover:bg-indigo-50 px-1 rounded transition-colors {isEditable ? 'border-b border-dotted border-gray-300 pr-1' : ''}"
                                        onclick={(e) => { 
                                            if (!isEditable) return;
                                            e.stopPropagation(); 
                                            activeMenuId = (activeMenuId === q.id ? null : q.id); 
                                        }}
                                        onkeydown={(e) => e.key === 'Enter' && isEditable && (activeMenuId = (activeMenuId === q.id ? null : q.id))}
                                    >
                                        [{q.questions?.[0]?.marks || 2}]
                                        {#if getCOCode(q.questions?.[0]?.co_id)}
                                            <span class="ml-1 text-[10px] text-indigo-600 print:text-black">({getCOCode(q.questions?.[0]?.co_id)})</span>
                                        {/if}
                                    </div>

                                    <!-- Edit Menu -->
                                    {#if activeMenuId === q.id && isEditable}
                                        <div 
                                            transition:fade={{ duration: 100 }}
                                            onclick={(e) => e.stopPropagation()}
                                            role="none"
                                            class="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50 space-y-3 no-print"
                                        >
                                            <div class="space-y-1">
                                                <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned CO</div>
                                                <select 
                                                    value={q.questions?.[0]?.co_id}
                                                    onchange={(e: any) => updateCO(q.id, q.questions?.[0]?.id, e.target.value)}
                                                    class="w-full bg-gray-50 border-none rounded-lg p-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="">No CO</option>
                                                    {#each courseOutcomes as co}
                                                        <option value={co.id}>{co.code}</option>
                                                    {/each}
                                                </select>
                                            </div>
                                        </div>
                                    {/if}
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
                                    {#if isEditable}
                                        <div class="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                            <button 
                                                onclick={() => openSwapSidebar(q, 'B', 'q1')}
                                                class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                                            >
                                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </button>
                                        </div>
                                    {/if}
                                    <span class="font-bold min-w-[24px]">{11 + i*2}.</span>
                                    <div class="flex-1 space-y-2">
                                        <div 
                                            use:editable={{ value: q.choice1?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice1?.questions?.[0]?.id, 'choice1') }}
                                            class="text-sm leading-relaxed outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 whitespace-pre-wrap"
                                        >
                                            {q.choice1?.questions?.[0]?.text || ''}
                                        </div>
                                    </div>
                                    <div class="min-w-[60px] flex flex-col items-end pt-1 group/mark relative">
                                        <div 
                                            role="button"
                                            tabindex="0"
                                            class="text-xs font-bold cursor-pointer hover:bg-indigo-50 px-1 rounded transition-colors {isEditable ? 'border-b border-dotted border-gray-300 pr-1' : ''}"
                                            onclick={(e) => { 
                                                if (!isEditable) return;
                                                e.stopPropagation(); 
                                                activeMenuId = (activeMenuId === q.id + '-c1' ? null : q.id + '-c1'); 
                                            }}
                                        >
                                            [{q.choice1?.questions?.[0]?.marks || 4}]
                                            {#if getCOCode(q.choice1?.questions?.[0]?.co_id)}
                                                <span class="ml-1 text-[10px] text-indigo-600 print:text-black">({getCOCode(q.choice1?.questions?.[0]?.co_id)})</span>
                                            {/if}
                                        </div>

                                        {#if activeMenuId === q.id + '-c1' && isEditable}
                                            <div 
                                                transition:fade={{ duration: 100 }}
                                                onclick={(e) => e.stopPropagation()}
                                                role="none"
                                                class="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50 space-y-3 no-print"
                                            >
                                                <div class="space-y-1">
                                                    <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned CO</div>
                                                    <select 
                                                        value={q.choice1?.questions?.[0]?.co_id}
                                                        onchange={(e: any) => updateCO(q.id, q.choice1?.questions?.[0]?.id, e.target.value, 'choice1')}
                                                        class="w-full bg-gray-50 border-none rounded-lg p-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="">No CO</option>
                                                        {#each courseOutcomes as co}
                                                            <option value={co.id}>{co.code}</option>
                                                        {/each}
                                                    </select>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                </div>

                                <!-- OR separator -->
                                <div class="relative py-4">
                                    <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-black/5"></div></div>
                                    <div class="relative flex justify-center text-xs font-black uppercase tracking-[0.5em] bg-white px-4">OR</div>
                                </div>

                                <!-- Question Choice 2 -->
                                <div class="group relative py-2 px-1 flex gap-4 hover:bg-slate-50 transition-colors">
                                    {#if isEditable}
                                        <div class="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                            <button 
                                                onclick={() => openSwapSidebar(q, 'B', 'q2')}
                                                class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                                            >
                                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </button>
                                        </div>
                                    {/if}
                                    <span class="font-bold min-w-[24px]">{11 + i*2 + 1}.</span>
                                    <div class="flex-1 space-y-2">
                                        <div 
                                            use:editable={{ value: q.choice2?.questions?.[0]?.text || '', onUpdate: (v) => updateTextValue(v, 'QUESTION', 'text', q.id, q.choice2?.questions?.[0]?.id, 'choice2') }}
                                            class="text-sm leading-relaxed outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 whitespace-pre-wrap"
                                        >
                                            {q.choice2?.questions?.[0]?.text || ''}
                                        </div>
                                    </div>
                                    <div class="min-w-[60px] flex flex-col items-end pt-1 group/mark relative">
                                        <div 
                                            role="button"
                                            tabindex="0"
                                            class="text-xs font-bold cursor-pointer hover:bg-indigo-50 px-1 rounded transition-colors {isEditable ? 'border-b border-dotted border-gray-300 pr-1' : ''}"
                                            onclick={(e) => { 
                                                if (!isEditable) return;
                                                e.stopPropagation(); 
                                                activeMenuId = (activeMenuId === q.id + '-c2' ? null : q.id + '-c2'); 
                                            }}
                                        >
                                            [{q.choice2?.questions?.[0]?.marks || 4}]
                                            {#if getCOCode(q.choice2?.questions?.[0]?.co_id)}
                                                <span class="ml-1 text-[10px] text-indigo-600 print:text-black">({getCOCode(q.choice2?.questions?.[0]?.co_id)})</span>
                                            {/if}
                                        </div>

                                        {#if activeMenuId === q.id + '-c2' && isEditable}
                                            <div 
                                                transition:fade={{ duration: 100 }}
                                                onclick={(e) => e.stopPropagation()}
                                                role="none"
                                                class="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50 space-y-3 no-print"
                                            >
                                                <div class="space-y-1">
                                                    <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned CO</div>
                                                    <select 
                                                        value={q.choice2?.questions?.[0]?.co_id}
                                                        onchange={(e: any) => updateCO(q.id, q.choice2?.questions?.[0]?.id, e.target.value, 'choice2')}
                                                        class="w-full bg-gray-50 border-none rounded-lg p-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="">No CO</option>
                                                        {#each courseOutcomes as co}
                                                            <option value={co.id}>{co.code}</option>
                                                        {/each}
                                                    </select>
                                                </div>
                                            </div>
                                        {/if}
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
    </div>

    <!-- Swap Sidebar -->
    {#if isSwapSidebarOpen && isEditable}
        <div 
            transition:slide={{ axis: 'x', duration: 300 }}
            class="w-96 bg-white dark:bg-slate-900 border-l border-gray-100 dark:border-slate-800 shadow-2xl flex flex-col no-print z-[80]"
        >
            <div class="p-6 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between">
                <div>
                    <h3 class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Swap Question</h3>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Pool Substitutes</p>
                </div>
                <button 
                    onclick={() => isSwapSidebarOpen = false}
                    class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <div class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {#each swapContext?.alternates || [] as q}
                    <button 
                        onclick={() => selectAlternate(q)}
                        class="w-full text-left p-4 rounded-2xl bg-gray-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all group"
                    >
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[10px] font-black px-2 py-0.5 bg-white dark:bg-slate-900 rounded-md text-gray-500 uppercase tracking-widest">{q.type || 'NORMAL'}</span>
                            <span class="text-[10px] font-black text-indigo-600">{q.marks} Marks</span>
                        </div>
                        <p class="text-xs font-medium text-gray-700 dark:text-gray-300 leading-relaxed mb-3 line-clamp-3 italic">"{q.question_text}"</p>
                        <div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-800">
                             <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest">UNIT {q.unit_number || '?'}</div>
                             <span class="text-[9px] font-black text-indigo-500 group-hover:translate-x-1 transition-transform uppercase italic">Pick →</span>
                        </div>
                    </button>
                {:else}
                    <div class="text-center py-20 px-8 space-y-4">
                        <div class="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-gray-300">
                             <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                        </div>
                        <p class="text-xs font-black text-gray-400 uppercase tracking-widest leading-loose">No equivalent questions found in the pool for this mark category.</p>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
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

    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #e2e8f0;
        border-radius: 10px;
    }

    @media print {
        h4.text-red-600 {
            color: black !important;
        }
        .no-print {
            display: none !important;
        }
    }
</style>
