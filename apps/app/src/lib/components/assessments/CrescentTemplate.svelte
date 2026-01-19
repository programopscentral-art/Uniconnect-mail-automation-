<script lang="ts">
    import { dndzone } from "svelte-dnd-action";
    import { flip } from "svelte/animate";
    import { fade, fly } from "svelte/transition";
    let { 
        paperMeta = $bindable({
            paper_date: '',
            duration_minutes: '180',
            max_marks: '100',
            course_code: 'CS-XXXX',
            exam_title: 'SEMESTER END EXAMINATIONS - NOV/DEC 2025',
            programme: 'B.Tech - COMPUTER SCIENCE AND ENGINEERING',
            semester: '1',
            instructions: 'ANSWER ALL QUESTIONS'
        }),
        currentSetData = $bindable({ questions: [] }),
        paperStructure = [],
        activeSet = 'A',
        courseOutcomes = [],
        questionPool = [],
        mode = 'view' 
    } = $props();

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
                // ONLY update the DOM if the value changed from an OUTSIDE source
                // This prevents Svelte from resetting the DOM during focus/composition
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

    // Sidebar state
    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);

    // CRITICAL: Greedy ID Injection
    // Ensures every item in currentSetData has a permanent ID
    $effect(() => {
        const raw = currentSetData;
        let arr = Array.isArray(raw) ? raw : (raw?.questions || []);
        let changed = false;

        const ensureId = (obj: any, prefix = 'id-') => {
            if (!obj.id) {
                obj.id = prefix + Math.random().toString(36).substr(2, 9);
                changed = true;
            }
        };

        arr.forEach((item: any) => {
            if (item) {
                ensureId(item, 'slot-');
                if (item.questions) item.questions.forEach((q: any) => ensureId(q, 'q-'));
                if (item.choice1?.questions) item.choice1.questions.forEach((q: any) => ensureId(q, 'q-'));
                if (item.choice2?.questions) item.choice2.questions.forEach((q: any) => ensureId(q, 'q-'));
            }
        });

        // ONLY trigger a re-assignment if we actually had to add new IDs
        // This prevents infinite loops and UI flickers during drags
        if (changed) {
            if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
            else currentSetData.questions = [...currentSetData.questions];
        }
    });

    // Unified resolver for questions array
    // Uses the permanent IDs injected by the effect above
    let safeQuestions = $derived.by(() => {
        const raw = currentSetData;
        let arr = (Array.isArray(raw) ? raw : (raw?.questions || [])).filter(Boolean);
        
        return arr.map((item: any) => {
            const stableId = item.id;
            
            let mappedSlot = { 
                ...item, 
                _raw: item, 
                id: stableId
            };
            
            const getTxt = (q: any) => q.text || q.question_text || 'Click to add question text...';
            const getMarks = (q: any) => Number(q.marks || q.mark || 0);

            if (item.type === 'SINGLE' || !item.type) {
                const qList = item.questions || [item];
                mappedSlot.questions = qList.map((q: any) => ({
                    ...q,
                    text: getTxt(q),
                    marks: getMarks(q)
                }));
            } else if (item.type === 'OR_GROUP' || item.choices) {
                const choice1 = item.choice1 || (item.choices?.[0] ? { questions: [item.choices[0]] } : { questions: [] });
                const choice2 = item.choice2 || (item.choices?.[1] ? { questions: [item.choices[1]] } : { questions: [] });
                
                mappedSlot.choice1 = {
                    ...choice1,
                    questions: (choice1.questions || []).map((q: any) => ({
                        ...q,
                        text: getTxt(q),
                        marks: getMarks(q)
                    }))
                };
                mappedSlot.choice2 = {
                    ...choice2,
                    questions: (choice2.questions || []).map((q: any) => ({
                        ...q,
                        text: getTxt(q),
                        marks: getMarks(q)
                    }))
                };
            }
            return mappedSlot;
        });
    });

    // DND Reliability: Stable local buffers
    // This prevents "not able to place" bugs caused by derived state thrashing
    let dndItemsA = $state([]);
    let dndItemsB = $state([]);
    let dndItemsC = $state([]);
    let isDragging = $state(false);

    // Sync buffers when data changes, UNLESS we are dragging
    $effect(() => {
        if (!isDragging) {
            dndItemsA = questionsA;
            dndItemsB = questionsB;
            dndItemsC = questionsC;
        }
    });

    function removeQuestion(slot: any) {
        if (!confirm('Are you sure you want to delete this question?')) return;
        
        let targetArr = Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || []);
        if (!targetArr) return;

        // Use the raw reference if possible for absolute accuracy
        const rawItem = slot?._raw || slot;
        const filtered = targetArr.filter((s: any) => s !== rawItem && s.id !== slot.id);
        
        if (Array.isArray(currentSetData)) {
            currentSetData = [...filtered];
        } else {
            currentSetData.questions = [...filtered];
        }
    }

    function openSwapSidebar(slot: any, part: 'A' | 'B' | 'C', subPart?: 'q1' | 'q2') {
        if (!slot) return;
        const index = safeQuestions.findIndex((s: any) => s.id === slot.id);
        if (index === -1) return;

        let currentQ: any = null;
        if (slot.type === 'SINGLE') {
            currentQ = slot.questions?.[0];
        } else if (slot.type === 'OR_GROUP') {
            currentQ = subPart === 'q1' ? slot.choice1?.questions?.[0] : slot.choice2?.questions?.[0];
        }

        const marks = Number(currentQ?.marks || slot.marks || (part === 'A' ? 2 : 16));
        const unitId = currentQ?.unit_id || slot.unit_id;

        // Filter by marks first
        let alternates = (questionPool || []).filter((q: any) => Number(q.marks || q.mark) === marks && q.id !== currentQ?.id);
        
        // Group or sort by unit consistency if requested by context
        if (unitId) {
            // Prioritize questions from the same unit
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

    let isSetsSidebarOpen = $state(false);
    let isOutlineSidebarOpen = $state(false);


    function selectAlternate(question: any) {
        if (!swapContext) return;
        const { slotIndex, subPart } = swapContext;
        
        // We must update the ORIGINAL bound state
        const targetArr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
        if (!targetArr) return;
        
        const slot = targetArr[slotIndex];
        if (!slot) return;

        const newQData = {
            id: question.id,
            text: question.question_text,
            marks: question.marks,
            type: question.type,
            options: question.options,
            co_id: question.co_id,
            bloom: question.bloom_level
        };

        // If the slot itself is raw, we replace it entirely or wrap it
        if (!slot.type || slot.type === 'SINGLE') {
            if (slot.questions) {
                slot.questions = [newQData];
            } else {
                // Replace raw question
                targetArr[slotIndex] = newQData;
            }
        } else if (slot.type === 'OR_GROUP') {
            if (subPart === 'q1') slot.choice1.questions = [newQData];
            else slot.choice2.questions = [newQData];
        }

        // Trigger reactivity
        if (Array.isArray(currentSetData)) {
            currentSetData = [...currentSetData];
        } else {
            currentSetData.questions = [...currentSetData.questions];
        }
        isSwapSidebarOpen = false;
    }

    // DND Handlers
    const dndFlipDurationMs = 300;

    function handleDndConsider(e: any, part: 'A' | 'B' | 'C') {
        isDragging = true;
        const { items } = e.detail;
        if (part === 'A') dndItemsA = items;
        else if (part === 'B') dndItemsB = items;
        else if (part === 'C') dndItemsC = items;
    }

    function handleDndFinalize(e: any, part: 'A' | 'B' | 'C') {
        const { items } = e.detail;
        if (part === 'A') dndItemsA = items;
        else if (part === 'B') dndItemsB = items;
        else if (part === 'C') dndItemsC = items;
        
        updateQuestionsFromDnd(items, part);
        isDragging = false;
    }

    function updateQuestionsFromDnd(items: any[], part: 'A' | 'B' | 'C') {
        const masterList = Array.isArray(currentSetData) ? [...currentSetData] : [...currentSetData.questions];
        
        // 1. Get source objects from the DND items, tagging them with the destination part
        const updatedZoneItems = items.map(item => {
            const base = item._raw || item;
            return { ...base, part };
        });

        const updatedIds = new Set(updatedZoneItems.map(i => i.id));

        // 2. Separate the master list, EXCLUDING items that are now managed by this zone
        const others = masterList.filter(s => !updatedIds.has(s.id));
        
        const otherA = others.filter(s => s.part === 'A');
        const otherB = others.filter(s => s.part === 'B');
        const otherC = others.filter(s => s.part === 'C');
        const remainder = others.filter(s => !['A', 'B', 'C'].includes(s.part));

        // 3. Reconstruct in the correct sequence
        let newList;
        if (part === 'A') newList = [...updatedZoneItems, ...otherB, ...otherC, ...remainder];
        else if (part === 'B') newList = [...otherA, ...updatedZoneItems, ...otherC, ...remainder];
        else if (part === 'C') newList = [...otherA, ...otherB, ...updatedZoneItems, ...remainder];
        else newList = [...others, ...updatedZoneItems];

        // 4. Update the source state once
        if (Array.isArray(currentSetData)) {
            currentSetData = newList;
        } else {
            currentSetData.questions = newList;
        }
    }

    function addQuestion(part: 'A' | 'B' | 'C') {
        const isPartA = part === 'A';
        const marks = isPartA ? (Number(paperMeta.max_marks) === 100 ? 2 : 2) : (Number(paperMeta.max_marks) === 100 ? 16 : 5);
        
        let newSlot;
        if (isPartA) {
            newSlot = {
                id: 'manual-' + Math.random().toString(36).substr(2, 9),
                part,
                type: 'SINGLE',
                label: 'New',
                marks: marks,
                unit: 'Auto',
                questions: [{
                    id: 'q-' + Math.random().toString(36).substr(2, 9),
                    text: 'Click to edit question text...',
                    marks: marks,
                    co_id: null,
                    bloom_level: 'L2',
                    type: 'NORMAL'
                }]
            };
        } else {
            // Parts B & C use OR_GROUPs in Crescent template
            newSlot = {
                id: 'manual-' + Math.random().toString(36).substr(2, 9),
                part,
                type: 'OR_GROUP',
                label: 'New',
                marks: marks,
                choice1: {
                    questions: [{
                        id: 'q1-' + Math.random().toString(36).substr(2, 9),
                        text: 'Click to edit option A...',
                        marks: marks,
                        co_id: null,
                        bloom_level: 'L3'
                    }]
                },
                choice2: {
                    questions: [{
                        id: 'q2-' + Math.random().toString(36).substr(2, 9),
                        text: 'Click to edit option B...',
                        marks: marks,
                        co_id: null,
                        bloom_level: 'L3'
                    }]
                }
            };
        }
        
        // Insert it into the master list at the relative end of its part
        let targetArr = Array.isArray(currentSetData) ? currentSetData : (currentSetData?.questions || []);
        let newList = [...targetArr];

        if (part === 'A') {
            const lastAIdx = newList.findLastIndex(s => s.part === 'A');
            newList.splice(lastAIdx + 1, 0, newSlot);
        } else if (part === 'B') {
            const lastBIdx = newList.findLastIndex(s => s.part === 'B');
            if (lastBIdx === -1) {
                // Insert after Part A
                const lastAIdx = newList.findLastIndex(s => s.part === 'A');
                newList.splice(lastAIdx + 1, 0, newSlot);
            } else {
                newList.splice(lastBIdx + 1, 0, newSlot);
            }
        } else {
            newList.push(newSlot);
        }

        if (Array.isArray(currentSetData)) {
            currentSetData = newList;
        } else {
            currentSetData.questions = newList;
        }
    }

    function getCOCode(coId: string | undefined) {
        if (!coId) return '';
        return courseOutcomes.find((c: any) => c.id === coId)?.code || '';
    }

    function updateText(e: Event, type: 'META' | 'QUESTION', key: string, slotId?: string, questionId?: string, subPart?: 'choice1' | 'choice2') {
        const target = e.target as HTMLElement;
        let value = type === 'QUESTION' ? target.innerHTML : target.innerText;

        if (type === 'QUESTION') value = value.trim();
        
        if (type === 'META') {
            if ((paperMeta as any)[key] === value) return;
            (paperMeta as any)[key] = value;
        } else if (type === 'QUESTION') {
            const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
            
            // Find slot by ID
            let slot = arr.find((s: any) => s.id === slotId);
            if (!slot) return;

            let q: any = null;
            if (slot.type === 'SINGLE' || !slot.type) {
                const subArr = slot.questions || [slot];
                q = subArr.find((item: any) => item.id === questionId);
            } else if (slot.type === 'OR_GROUP') {
                 const choice = subPart === 'choice1' ? slot.choice1 : slot.choice2;
                 q = choice.questions.find((item: any) => item.id === questionId);
            }

            if (q && q.text !== value) {
                q.text = value;
                // Force reactivity on the bound prop
                if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
                else currentSetData.questions = [...currentSetData.questions];
            }
        }
    }

    const isEditable = $derived(mode === 'edit');

    // Part-Based filtering: Dynamic Label Calculation
    let questionsA = $derived.by(() => {
        const slots = safeQuestions.filter((s: any) => s.part === 'A');
        return slots.map((s: any, idx: number) => ({ ...s, n1: idx + 1 }));
    });

    let questionsB = $derived.by(() => {
        const slots = safeQuestions.filter((s: any) => s.part === 'B');
        let currentNum = questionsA.length + 1;
        return slots.map((s: any) => {
            if (s.type === 'OR_GROUP') {
                const n1 = currentNum++;
                const n2 = currentNum++;
                return { ...s, n1, n2 };
            } else {
                const n1 = currentNum++;
                return { ...s, n1 };
            }
        });
    });

    let questionsC = $derived.by(() => {
        const slots = safeQuestions.filter((s: any) => s.part === 'C');
        
        let currentNum = questionsA.length + 1;
        questionsB.forEach((s: any) => {
            currentNum += (s.type === 'OR_GROUP' ? 2 : 1);
        });

        return slots.map((s: any) => {
            if (s.type === 'OR_GROUP') {
                const n1 = currentNum++;
                const n2 = currentNum++;
                return { ...s, n1, n2 };
            } else {
                const n1 = currentNum++;
                return { ...s, n1 };
            }
        });
    });

    // Dynamic Marks calculation based on actual questions
    let totalMarksA = $derived(questionsA.length * (paperStructure[0]?.marks_per_q || 2));
    let totalMarksB = $derived(questionsB.length * (paperStructure[1]?.marks_per_q || 5));
    let totalMarksC = $derived(questionsC.length * (paperStructure[2]?.marks_per_q || 16));

    // Stats
    let partACount = $derived(questionsA.length);
    let partBCount = $derived(questionsB.length);
    let partCCount = $derived(questionsC.length);
    let is100m = $derived(Number(paperMeta.max_marks) === 100);
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative">
    
    <div class="paper-container-scroll flex-1 overflow-auto p-4 sm:p-8 bg-gray-50 dark:bg-slate-950/50 relative">
        <div class="paper-container relative mx-auto bg-white dark:bg-gray-100 text-black shadow-2xl transition-all duration-500 {mode === 'preview' ? 'scale-[0.5] origin-top' : ''}" style="width: 8.27in; min-height: 11.69in; padding: 0.75in;">
    
    {#if isEditable}
        <!-- Sets Sidebar - Responsive Toggle -->
        <button 
            onclick={() => isSetsSidebarOpen = !isSetsSidebarOpen}
            class="xl:hidden fixed left-4 bottom-24 w-12 h-12 bg-white dark:bg-slate-900 rounded-full shadow-2xl border border-gray-100 dark:border-slate-800 flex items-center justify-center z-[60] text-indigo-600 animate-bounce-subtle"
        >
            <span class="text-xs font-black">{activeSet}</span>
        </button>

        <div class="{isSetsSidebarOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0'} fixed xl:left-4 xl:top-24 left-0 top-0 bottom-0 xl:bottom-auto xl:w-16 w-64 bg-white/95 dark:bg-slate-900/95 xl:bg-white/70 xl:dark:bg-gray-900/70 backdrop-blur-md xl:rounded-2xl shadow-2xl xl:border border-gray-100 dark:border-gray-800 p-4 xl:p-2 flex flex-col gap-2 z-[70] xl:z-40 transition-transform duration-300 xl:duration-0 no-print">
            <div class="flex items-center justify-between xl:justify-center mb-4 xl:mb-1">
                <div class="text-[10px] xl:text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase">Sets</div>
                <button onclick={() => isSetsSidebarOpen = false} class="xl:hidden p-1 text-gray-400">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div class="flex xl:flex-col gap-2">
                {#each ['A', 'B', 'C', 'D'] as s}
                    <button 
                        onclick={() => {
                            const event = new CustomEvent('changeSet', { detail: s });
                            window.dispatchEvent(event);
                            if (window.innerWidth < 1280) isSetsSidebarOpen = false;
                        }}
                        class="flex-1 xl:w-12 h-12 rounded-xl text-[11px] font-black transition-all flex items-center justify-center 
                        {activeSet === s ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-100 dark:border-slate-800 xl:border-0'}"
                    >
                        {s}
                    </button>
                {/each}
            </div>
        </div>

        <!-- Navigation Sidebar - Responsive Toggle -->
        <button 
            onclick={() => isOutlineSidebarOpen = !isOutlineSidebarOpen}
            class="xl:hidden fixed right-4 bottom-24 w-12 h-12 bg-white dark:bg-slate-900 rounded-full shadow-2xl border border-gray-100 dark:border-slate-800 flex items-center justify-center z-[60] text-indigo-600"
        >
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
        </button>

        <div class="{isOutlineSidebarOpen ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'} fixed xl:left-24 xl:top-24 right-0 top-0 bottom-0 xl:bottom-auto xl:w-48 w-80 bg-white/95 dark:bg-slate-900/95 xl:bg-white/70 xl:dark:bg-gray-900/70 backdrop-blur-md xl:rounded-2xl shadow-2xl xl:border border-gray-100 dark:border-gray-800 p-6 xl:p-4 z-[70] xl:z-40 transition-transform duration-300 xl:duration-0 no-print">
            <div class="flex items-center justify-between mb-6 xl:mb-4">
                <div class="text-[10px] xl:text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Paper Outline</div>
                <button onclick={() => isOutlineSidebarOpen = false} class="xl:hidden p-1 text-gray-400">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div class="space-y-6 xl:space-y-4 h-[calc(100vh-100px)] xl:h-auto overflow-y-auto">
                {#if questionsA.length > 0}
                    <div>
                        <div class="text-[10px] xl:text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-3 xl:mb-2">Part A</div>
                        <div class="grid grid-cols-5 xl:grid-cols-4 gap-2 xl:gap-1">
                            {#each questionsA as q}
                                <button 
                                    onclick={() => {
                                        document.getElementById(`slot-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        if (window.innerWidth < 1280) isOutlineSidebarOpen = false;
                                    }}
                                    class="w-10 h-10 xl:w-8 xl:h-8 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] xl:text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-mono border border-gray-100 dark:border-slate-800 xl:border-0"
                                >
                                    {q.n1}
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
                {#if questionsB.length > 0}
                    <div>
                        <div class="text-[10px] xl:text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-3 xl:mb-2">Part B</div>
                        <div class="grid grid-cols-5 xl:grid-cols-4 gap-2 xl:gap-1">
                            {#each questionsB as q}
                                <button 
                                    onclick={() => {
                                        document.getElementById(`slot-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        if (window.innerWidth < 1280) isOutlineSidebarOpen = false;
                                    }}
                                    class="w-10 h-10 xl:w-8 xl:h-8 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] xl:text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-mono border border-gray-100 dark:border-slate-800 xl:border-0"
                                >
                                    {q.n1}
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
                {#if questionsC.length > 0}
                    <div>
                        <div class="text-[10px] xl:text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-3 xl:mb-2">Part C</div>
                        <div class="grid grid-cols-5 xl:grid-cols-4 gap-2 xl:gap-1">
                            {#each questionsC as q}
                                <button 
                                    onclick={() => {
                                        document.getElementById(`slot-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        if (window.innerWidth < 1280) isOutlineSidebarOpen = false;
                                    }}
                                    class="w-10 h-10 xl:w-8 xl:h-8 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] xl:text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-mono border border-gray-100 dark:border-slate-800 xl:border-0"
                                >
                                    {q.n1}
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Exact Crescent Header -->
    <div class="relative flex flex-col items-center">
        <!-- Refined Header based on uploaded images -->
        <div class="w-full flex justify-between items-start mb-2">
            <!-- Left: Exact Crescent Logo Image -->
            <div class="w-[300px]">
                <img 
                    src="/crescent-logo.png" 
                    alt="Crescent Logo" 
                    class="h-auto w-full object-contain"
                />
            </div>

            <!-- Right: Course Code & RRN Box -->
            <div class="flex flex-col items-end gap-2 mt-4">
                <div class="text-[12px] font-black text-gray-900 uppercase tracking-tighter">
                    &lt;<span 
                        contenteditable="true" 
                        onblur={(e) => updateText(e, 'META', 'course_code')}
                        class={isEditable ? '' : 'pointer-events-none outline-none'}
                    >{paperMeta.course_code}</span>&gt;
                </div>
                
                <div class="flex items-center gap-2">
                    <span class="text-[11px] font-black text-gray-900 border border-black px-1">RRN</span>
                    <div class="flex border border-black">
                        {#each Array(10) as _}
                            <div class="w-4 h-5 border-r border-black last:border-r-0 bg-white"></div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>

        <!-- Exam Title -->
        <div class="w-full text-center mb-4">
            <h3 
                contenteditable="true" 
                onblur={(e) => updateText(e, 'META', 'exam_title')}
                class="text-[14px] font-black uppercase tracking-wide border-b border-white hover:border-gray-200 outline-none inline-block pb-0.5 {isEditable ? '' : 'pointer-events-none'}"
                style="color: black !important;"
            >
                {paperMeta.exam_title}
            </h3>
        </div>

        <!-- Metadata Table (4-row layout as per images) -->
        <div class="w-full mb-6">
            <table class="w-full border-collapse border-2 border-gray-900 text-[10px] leading-tight text-left">
                <tbody>
                    <!-- Row 1: Programme & Branch -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter">Programme & Branch</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black uppercase" colspan="4">
                            <div 
                                contenteditable="true" 
                                onblur={(e) => updateText(e, 'META', 'programme')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.programme}</div>
                        </td>
                    </tr>
                    <!-- Row 2: Semester & Date/Session -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold uppercase tracking-tighter">Semester</td>
                        <td class="border border-gray-900 p-2 text-center font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black w-[15%]">
                            <div 
                                contenteditable="true" 
                                onblur={(e) => updateText(e, 'META', 'semester')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.semester}</div>
                        </td>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter border-l-2">Date & Session</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black uppercase">
                            <span 
                                use:editable={{ value: paperMeta.paper_date, onUpdate: (v) => updateText({target: {innerText: v}} as any, 'META', 'paper_date') }}
                                contenteditable="true" 
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            ></span>
                            {#if paperMeta.exam_time}
                                <span class="ml-2 text-[9px] font-bold text-gray-500">[{paperMeta.exam_time}]</span>
                            {/if}
                        </td>
                    </tr>
                    <!-- Row 3: Course Code & Name -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold uppercase tracking-tighter">Course Code & Name</td>
                        <td class="border border-gray-900 p-2 text-center font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black uppercase" colspan="4">
                            <span 
                                use:editable={{ value: paperMeta.course_code, onUpdate: (v) => updateText({target: {innerText: v}} as any, 'META', 'course_code') }}
                                contenteditable="true" 
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            ></span> - <span 
                                use:editable={{ value: paperMeta.subject_name, onUpdate: (v) => updateText({target: {innerText: v}} as any, 'META', 'subject_name') }}
                                contenteditable="true" 
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            ></span>
                        </td>
                    </tr>
                    <!-- Row 4: Duration & Max Marks -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold uppercase tracking-tighter">Duration</td>
                        <td class="border border-gray-900 p-2 text-center font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black w-[15%]">
                            <div 
                                use:editable={{ value: paperMeta.duration_minutes, onUpdate: (v) => updateText({target: {innerText: v}} as any, 'META', 'duration_minutes') }}
                                contenteditable="true" 
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            ></div>
                        </td>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter border-l-2">Maximum Marks</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black">
                            <div 
                                use:editable={{ value: paperMeta.max_marks, onUpdate: (v) => updateText({target: {innerText: v}} as any, 'META', 'max_marks') }}
                                contenteditable="true" 
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            ></div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Instructions -->
        <div class="w-full text-center mb-6">
            <div 
                use:editable={{ value: paperMeta.instructions, onUpdate: (v) => updateText({target: {innerText: v}} as any, 'META', 'instructions') }}
                contenteditable="true"
                class="text-[11px] font-black uppercase text-gray-900 tracking-[0.2em] border-b-2 border-gray-900 inline-block pb-0.5 {isEditable ? 'outline-none focus:bg-indigo-50/50' : 'pointer-events-none'}"
                style="color: black !important;"
            >
            </div>
        </div>
    </div>

    <!-- Part A -->
    <div class="mt-8 section-part-a">
        <div 
            contenteditable="true"
            class="w-full text-center font-black text-xs uppercase mb-4 border border-black p-1 {isEditable ? '' : 'pointer-events-none'}"
        >
            {paperStructure[0]?.title || 'PART A'} 
            ({partACount} X {paperStructure[0]?.marks_per_q || 2} = {totalMarksA} MARKS)
        </div>
        <div 
            class="w-full border border-black dark:border-gray-800 divide-y divide-black dark:divide-gray-800"
            use:dndzone={{items: dndItemsA, flipDurationMs: dndFlipDurationMs, dragDisabled: !isEditable}}
            onconsider={(e) => handleDndConsider(e, 'A')}
            onfinalize={(e) => handleDndFinalize(e, 'A')}
        >
            {#if dndItemsA.length > 0}
                {#each dndItemsA as slot, i (slot.id)}
                    <div animate:flip={{duration: dndFlipDurationMs}} id="slot-{slot.id}">
                    {#if slot.type === 'SINGLE'}
                        {#each slot.questions || [] as q (q.id)}
                            <div class="flex min-h-[40px] page-break-avoid relative group border-b border-black last:border-b-0">
                                {#if isEditable}
                                    <div class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden cursor-grab active:cursor-grabbing">
                                        <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                                    </div>
                                {/if}

                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {i + 1}.
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                    <div class="flex justify-between items-start gap-4">
                                        <div class="flex-1">
                                            <div 
                                                use:editable={{ value: q.text, onUpdate: (v) => updateText({target: {innerHTML: v}} as any, 'QUESTION', 'text', slot.id, q.id) }}
                                                contenteditable="true" 
                                                class="w-full block {isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}"
                                            ></div>
                                        </div>
                                        {#if q.type === 'MCQ'}
                                            <div class="flex-shrink-0 font-black text-[11px] whitespace-nowrap">[&nbsp;&nbsp;&nbsp;&nbsp;]</div>
                                        {/if}
                                    </div>
                                    
                                    {#if q.options && q.options.length > 0}
                                        <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                            {#each q.options as opt}
                                                <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                            {/each}
                                        </div>
                                    {/if}

                                    {#if isEditable}
                                        <div class="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 print:hidden">
                                            <button 
                                                onclick={() => openSwapSidebar(slot, 'A')}
                                                class="bg-indigo-600 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-indigo-700 active:scale-95"
                                            >
                                                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                                SWAP
                                            </button>
                                            <button 
                                                onclick={() => removeQuestion(slot)}
                                                class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                            >
                                                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                                DEL
                                            </button>
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black p-2 text-center text-[8px] font-black text-gray-400 flex flex-col justify-center gap-1">
                                    <span class="uppercase">({getCOCode(q.co_id) || ''})</span>
                                    <span class="text-black font-black">({q.marks})</span>
                                </div>
                            </div>
                        {/each}
                    {:else}
                        <!-- OR GROUP in Part A -->
                        <div class="p-2 bg-gray-50/50 relative group">
                             <div class="text-[10px] font-bold text-center">Slot {i+1} (OR Question Support)</div>
                             {#if isEditable}
                                <button 
                                    onclick={() => removeQuestion(slot)}
                                    class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95 print:hidden"
                                >
                                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    DEL
                                </button>
                             {/if}
                        </div>
                    {/if}
                    </div>
                {/each}
            {:else}
                {#each Array(Number(paperMeta.max_marks || 100) === 50 ? 5 : 10) as _, i}
                    <div class="flex h-[40px] items-center">
                        <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold">{i + 1}.</div>
                        <div class="flex-1 p-2 text-[10px] italic text-gray-300">Question Text Placeholder</div>
                        <div class="w-20 border-l border-black bg-gray-50/10 h-full"></div>
                    </div>
                {/each}
            {/if}
        </div>
        {#if isEditable}
            <button 
                onclick={() => addQuestion('A')}
                class="w-full py-3 border-2 border-dashed border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 text-[10px] font-black uppercase tracking-widest hover:border-indigo-200 dark:hover:border-indigo-800 hover:text-indigo-400 dark:hover:text-indigo-500 transition-all rounded-xl mt-2 print:hidden"
            >
                + Add Question to Part A
            </button>
        {/if}
    </div>

    <!-- Part B -->
    <div class="mt-12 section-page-break section-part-b">
        <div 
            contenteditable="true"
            class="w-full text-center font-black text-xs uppercase mb-4 border border-black dark:border-gray-800 p-1 {isEditable ? '' : 'pointer-events-none'}"
        >
            {paperStructure[1]?.title || 'PART B'} 
            ({partBCount} X {paperStructure[1]?.marks_per_q || 5} = {totalMarksB} MARKS)
        </div>
        <div 
            class="space-y-6"
            use:dndzone={{items: dndItemsB, flipDurationMs: dndFlipDurationMs, dragDisabled: !isEditable}}
            onconsider={(e) => handleDndConsider(e, 'B')}
            onfinalize={(e) => handleDndFinalize(e, 'B')}
        >
            {#if dndItemsB.length > 0}
                {#each dndItemsB as slot, idx (slot.id)}
                    <div animate:flip={{duration: dndFlipDurationMs}} id="slot-{slot.id}">
                    {#if slot.type === 'OR_GROUP'}
                        <div class="border-2 border-black dark:border-gray-800 page-break-avoid mb-6 relative group">
                            {#if isEditable}
                                <div class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden cursor-grab active:cursor-grabbing">
                                    <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                                </div>
                                <div class="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 print:hidden">
                                     <button 
                                        onclick={() => removeQuestion(slot)}
                                        class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                    >
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        DEL
                                    </button>
                                </div>
                            {/if}
                            <!-- Choice 1 -->
                            {#each slot.choice1?.questions || [] as q, subIdx (q.id)}
                                <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n1 + '.' : ''}
                                </div>
                                    <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                        {q.sub_label || ''}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                        <div class="w-full">
                                            <div 
                                                use:editable={{ value: q.text, onUpdate: (v) => updateText({target: {innerHTML: v}} as any, 'QUESTION', 'text', slot.id, q.id, 'choice1') }}
                                                contenteditable="true" 
                                                class="w-full block {isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}"
                                            ></div>
                                        </div>
                                        {#if isEditable}
                                            <button 
                                                onclick={() => openSwapSidebar(slot, 'B', 'q1')}
                                                class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white px-2 py-1 rounded-md shadow-lg transition-all z-20 print:hidden text-[9px] font-black tracking-widest leading-none flex items-center gap-1"
                                            >
                                                <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                                SWAP
                                            </button>
                                        {/if}
                                    </div>
                                    <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1">
                                        <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                        <span class="text-[10px] font-black">({q.marks})</span>
                                    </div>
                                </div>
                            {/each}
                            
                            <!-- OR Separator -->
                            <div class="w-full text-center text-[10px] font-black uppercase py-1 border-b border-black dark:border-gray-800 bg-gray-50/20 dark:bg-gray-800/20 italic tracking-[0.2em]">
                                (OR)
                            </div>

                            <!-- Choice 2 -->
                            {#each slot.choice2?.questions || [] as q, subIdx (q.id)}
                                <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n2 + '.' : ''}
                                </div>
                                    <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                        {q.sub_label || ''}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                        <div class="w-full">
                                            <div 
                                                use:editable={{ value: q.text, onUpdate: (v) => updateText({target: {innerHTML: v}} as any, 'QUESTION', 'text', slot.id, q.id, 'choice2') }}
                                                contenteditable="true" 
                                                class="w-full block {isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}"
                                            ></div>
                                        </div>
                                        {#if isEditable}
                                            <button 
                                                onclick={() => openSwapSidebar(slot, 'B', 'q2')}
                                                class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white px-2 py-1 rounded-md shadow-lg transition-all z-20 print:hidden text-[9px] font-black tracking-widest leading-none flex items-center gap-1"
                                            >
                                                <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                                SWAP
                                            </button>
                                        {/if}
                                    </div>
                                    <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1">
                                        <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                        <span class="text-[10px] font-black">({q.marks})</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <!-- SINGLE in Part B -->
                        <div class="border-2 border-black page-break-avoid mb-6 relative group">
                            {#if isEditable}
                                <div class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden cursor-grab active:cursor-grabbing">
                                    <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                                </div>
                                <div class="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 print:hidden">
                                     <button 
                                        onclick={() => removeQuestion(slot)}
                                        class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                    >
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        DEL
                                    </button>
                                </div>
                            {/if}
                            {#each slot.questions || [] as q (q.id)}
                                <div class="flex min-h-[50px]">
                                    <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                        {slot.n1 + '.'}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                            <div 
                                                use:editable={{ value: q.text, onUpdate: (v) => updateText({target: {innerHTML: v}} as any, 'QUESTION', 'text', slot.id, q.id) }}
                                                contenteditable="true" 
                                                class="w-full block {isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}"
                                            ></div>
                                        {#if isEditable}
                                            <button 
                                                onclick={() => openSwapSidebar(slot, 'B')}
                                                class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white px-2 py-1 rounded-md shadow-lg transition-all z-20 print:hidden text-[9px] font-black tracking-widest leading-none flex items-center gap-1"
                                            >
                                                <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                                SWAP
                                            </button>
                                        {/if}
                                    </div>
                                    <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1">
                                        <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                        <span class="text-[10px] font-black">({q.marks})</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                    </div>
                {/each}
            {:else}
                <div class="border border-dashed border-gray-200 p-10 text-center text-[10px] text-gray-300 italic">
                    Part B Questions will appear here
                </div>
            {/if}
        </div>
        {#if isEditable}
            <button 
                onclick={() => addQuestion('B')}
                class="w-full py-4 border-2 border-dashed border-gray-100 text-gray-300 text-[10px] font-black uppercase tracking-widest hover:border-indigo-200 hover:text-indigo-400 transition-all rounded-xl mt-4 print:hidden"
            >
                + Add Question to Part B
            </button>
        {/if}
    </div>

    {#if is100m}
        <div class="mt-12 section-page-break section-part-c">
             <div 
                contenteditable="true"
                class="w-full text-center font-black text-xs uppercase mb-4 border border-black dark:border-gray-800 p-1 {isEditable ? '' : 'pointer-events-none'}"
            >
                {#if paperStructure[2]}
                    {paperStructure[2].title} ({partCCount} X {paperStructure[2].marks_per_q} = {totalMarksC} MARKS)
                {:else}
                    PART C ({partCCount} X 16 = {totalMarksC} MARKS)
                {/if}
            </div>
        <div 
            class="space-y-6"
            use:dndzone={{items: dndItemsC, flipDurationMs: dndFlipDurationMs, dragDisabled: !isEditable}}
            onconsider={(e) => handleDndConsider(e, 'C')}
            onfinalize={(e) => handleDndFinalize(e, 'C')}
        >
                {#each dndItemsC as slot, idx (slot.id)}
                    <div animate:flip={{duration: dndFlipDurationMs}} id="slot-{slot.id}">
                    <div class="border-2 border-black dark:border-gray-800 page-break-avoid relative group">
                        {#if isEditable}
                                <div class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden cursor-grab active:cursor-grabbing">
                                    <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                                </div>
                                <div class="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 print:hidden">
                                     <button 
                                        onclick={() => removeQuestion(slot)}
                                        class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                    >
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        DEL
                                    </button>
                                </div>
                        {/if}
                        <!-- Choice 1 -->
                        {#each slot.choice1.questions as q, subIdx (q.id)}
                            <div class="flex border-b border-black dark:border-gray-800 last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black dark:border-gray-800 p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n1 + '.' : ''}
                                </div>
                                <div class="w-10 border-r border-black dark:border-gray-800 p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                    {q.sub_label || ''}
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed">
                                    <div class="w-full">
                                        <div 
                                            use:editable={{ value: q.text, onUpdate: (v) => updateText({target: {innerHTML: v}} as any, 'QUESTION', 'text', slot.id, q.id, 'choice1') }}
                                            contenteditable="true" 
                                            class="w-full block {isEditable ? 'outline-none focus:bg-gray-50 dark:focus:bg-gray-800/50' : 'pointer-events-none'}"
                                        ></div>
                                    </div>
                                    
                                    {#if q.options && q.options.length > 0}
                                        <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                            {#each q.options as opt}
                                                <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black dark:border-gray-800 p-2 text-center flex flex-col items-center justify-center gap-1 group/btn relative">
                                    <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                    <span class="text-[10px] font-black">({q.marks})</span>
                                    {#if isEditable}
                                        <button 
                                            onclick={() => openSwapSidebar(slot, 'C', 'q1')}
                                            class="absolute -right-2 top-0 opacity-0 group-hover/btn:opacity-100 bg-indigo-600 text-white px-2 py-1 rounded-md shadow-lg transition-all z-20 print:hidden text-[9px] font-black tracking-widest leading-none flex items-center gap-1"
                                        >
                                            <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                            SWAP
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                        
                        <!-- OR Separator -->
                        <div class="w-full text-center text-[10px] font-black uppercase py-1 border-b border-black dark:border-gray-800 bg-gray-50/20 dark:bg-gray-800/20 italic tracking-[0.2em]">
                            (OR)
                        </div>

                        <!-- Choice 2 -->
                        {#each slot.choice2?.questions || [] as q, subIdx (q.id)}
                            <div class="flex border-b border-black dark:border-gray-800 last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black dark:border-gray-800 p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n2 + '.' : ''}
                                </div>
                                <div class="w-10 border-r border-black dark:border-gray-800 p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                    {q.sub_label || ''}
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                    <div class="w-full">
                                        <div 
                                            use:editable={{ value: q.text, onUpdate: (v) => updateText({target: {innerHTML: v}} as any, 'QUESTION', 'text', slot.id, q.id, 'choice2') }}
                                            contenteditable="true" 
                                            class="w-full block {isEditable ? 'outline-none focus:bg-gray-50 dark:focus:bg-gray-800/50' : 'pointer-events-none'} "
                                        ></div>
                                    </div>
                                    {#if isEditable}
                                        <button 
                                            onclick={() => openSwapSidebar(slot, 'C', 'q2')}
                                            class="absolute -right-2 top-0 opacity-0 group-hover/btn:opacity-100 bg-indigo-600 text-white px-2 py-1 rounded-md shadow-lg transition-all z-20 print:hidden text-[9px] font-black tracking-widest leading-none flex items-center gap-1"
                                        >
                                            <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                            SWAP
                                        </button>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black dark:border-gray-800 p-2 text-center flex flex-col items-center justify-center gap-1 group/btn relative">
                                    <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                    <span class="text-[10px] font-black">({q.marks})</span>
                                </div>
                            </div>
                        {/each}
                    </div>
                    </div>
                {/each}
            </div>
            {#if isEditable}
                <button 
                    onclick={() => addQuestion('C')}
                    class="w-full py-4 border-2 border-dashed border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 text-[10px] font-black uppercase tracking-widest hover:border-indigo-200 dark:hover:border-indigo-800 hover:text-indigo-400 dark:hover:text-indigo-500 transition-all rounded-xl mt-4 print:hidden"
                >
                    + Add Question to Part C
                </button>
            {/if}
        </div>
    {/if}

    <!-- Bottom Signatures -->
    <div class="mt-20 grid grid-cols-2 gap-20">
        <div class="border-t border-black dark:border-gray-800 pt-2 text-center">
            <p class="text-[9px] font-black uppercase text-gray-900 dark:text-gray-500">Name & Signature of DAAC Member</p>
        </div>
        <div class="border-t border-black dark:border-gray-800 pt-2 text-center">
            <p class="text-[9px] font-black uppercase text-gray-900 dark:text-gray-500">Name & Signature of DAAC Member</p>
        </div>
    </div>
</div>
</div>

{#if isSwapSidebarOpen && swapContext}
    <div 
        class="fixed inset-0 z-[100] flex justify-end"
        transition:fade={{duration: 200}}
    >
        <!-- Overlay -->
        <button 
            class="absolute inset-0 bg-black/60 backdrop-blur-md w-full h-full border-none cursor-default"
            onclick={() => isSwapSidebarOpen = false}
            aria-label="Close Sidebar"
        ></button>

        <!-- Sidebar -->
        <div 
            class="relative w-[450px] bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl h-full shadow-2xl flex flex-col border-l border-white/20 dark:border-gray-800/30"
            transition:fly={{x: 450, duration: 400, opacity: 1}}
        >
            <div class="p-8 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-center justify-between">
                    <div class="space-y-1">
                        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Alternate Questions</h2>
                        <div class="flex items-center gap-3">
                            <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-full">
                                {swapContext.currentMark} Marks
                            </span>
                            <span class="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                {swapContext.currentUnit ? `Unit ${swapContext.currentUnit.split('-').pop()}` : 'System Recommended'}
                            </span>
                        </div>
                    </div>
                    <button 
                        onclick={() => isSwapSidebarOpen = false} 
                        aria-label="Close Sidebar"
                        class="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-all active:scale-90 hover:rotate-90"
                    >
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-transparent">
                {#if swapContext.alternates.length === 0}
                    <div class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 text-center space-y-4 animate-premium-fade">
                        <div class="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <p class="text-[11px] font-black uppercase tracking-[0.2em] leading-loose">
                            No alternative questions found<br/>in the question bank for {swapContext.currentMark} marks.
                        </p>
                    </div>
                {:else}
                    <div class="grid grid-cols-1 gap-4">
                        {#each swapContext.alternates as q, i}
                            <button 
                                onclick={() => selectAlternate(q)}
                                class="w-full text-left bg-white dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/50 transition-all group relative overflow-hidden animate-premium-slide"
                                style="animation-delay: {i * 50}ms;"
                            >
                                <div class="flex justify-between items-start gap-4 mb-4">
                                    <span class="px-2.5 py-1 bg-gray-900 dark:bg-white text-white dark:text-black text-[9px] font-black rounded-lg uppercase tracking-tighter italic">
                                        {q.bloom_level}
                                    </span>
                                    <span class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">
                                        {getCOCode(q.co_id) || 'General'}
                                    </span>
                                </div>

                                <p class="text-xs leading-relaxed text-gray-800 dark:text-gray-200 font-medium">
                                    {q.question_text}
                                </p>

                                <div class="mt-6 pt-4 border-t border-gray-50 dark:border-gray-800/50 flex items-center justify-between">
                                    <span class="text-[10px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-tighter">{q.marks} Marks</span>
                                    <span class="opacity-0 group-hover:opacity-100 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1 translate-x-4 group-hover:translate-x-0">
                                        Select This
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                    </span>
                                </div>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            
            <div class="p-8 bg-gray-50/50 dark:bg-gray-950/50 backdrop-blur-md border-t border-gray-100 dark:border-gray-800">
                 <p class="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">
                    System Integrity: Optimal Question Selection Active
                 </p>
            </div>
        </div>
    </div>
{/if}
</div>

<style>
    .paper-container {
        font-family: 'Times New Roman', Times, serif;
    }

    @media print {
        @page {
            size: A4;
            margin: 0;
        }

        :global(body) {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .paper-container {
            width: 210mm !important;
            margin: 0 auto !important;
            padding: 20mm !important;
            border: none !important;
            box-shadow: none !important;
            position: relative !important;
            display: block !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
        }

        /* Prevent individual questions or headers from being cut halved */
        .page-break-avoid, :global(.question-container), :global(.part-header-row) {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
        }

        .section-page-break {
            break-before: auto !important;
            page-break-before: auto !important;
            margin-top: 25pt !important;
        }

        :global(.no-print) {
            display: none !important;
        }
    }

    [contenteditable="true"]:hover {
        background: rgba(99, 102, 241, 0.05);
        cursor: text;
    }
    
    [contenteditable="true"]:focus {
        background: rgba(99, 102, 241, 0.1);
        outline: none;
    }

    :global(.tracking-widest) {
        letter-spacing: 0.15em;
    }

    /* Transition backdrop */
    :global(.fixed) {
        transition: all 0.3s ease;
    }
</style>
