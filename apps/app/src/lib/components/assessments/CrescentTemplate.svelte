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

    // Sidebar state
    let isSwapSidebarOpen = $state(false);
    let swapContext = $state<any>(null);

    // Unified resolver for questions array
    // This ensures even raw question objects from DB are wrapped into the "slot" structure expected by the UI
    let safeQuestions = $derived.by(() => {
        const raw = currentSetData;
        
        let arr = (Array.isArray(raw) ? raw : (raw?.questions || [])).filter(Boolean);
        
        let currentLabelNum = 1;
        
        const mapped = arr.map((item: any) => {
            const getTxt = (q: any) => q.text || q.question_text || 'Click to add question text...';
            const getMarks = (q: any) => Number(q.marks || q.mark || 0);

            // Store original reference for easy deletion/updates
            let mappedSlot = { ...item, _raw: item };
            
            // Assign labels and tracking numbers
            if (item.type === 'SINGLE' || item.type === 'OR_GROUP') {
                 if (item.type === 'SINGLE') {
                    mappedSlot.n1 = currentLabelNum;
                    currentLabelNum++;
                 } else {
                    mappedSlot.n1 = currentLabelNum;
                    mappedSlot.n2 = currentLabelNum + 1;
                    currentLabelNum += 2;
                 }

                if (item.type === 'SINGLE' && item.questions) {
                    mappedSlot.questions = item.questions.map((q: any, qi: number) => ({ 
                        ...q, 
                        id: q.id || `q-${item.id || Math.random()}-${qi}`,
                        text: getTxt(q), 
                        marks: getMarks(q) 
                    }));
                } else if (item.type === 'OR_GROUP') {
                    if (mappedSlot.choice1) {
                        mappedSlot.choice1.questions = (mappedSlot.choice1.questions || []).map((q: any, qi: number) => ({
                            ...q,
                            id: q.id || `q1-${item.id || Math.random()}-${qi}`,
                            text: getTxt(q),
                            marks: getMarks(q)
                        }));
                    }
                    if (mappedSlot.choice2) {
                        mappedSlot.choice2.questions = (mappedSlot.choice2.questions || []).map((q: any, qi: number) => ({
                            ...q,
                            id: q.id || `q2-${item.id || Math.random()}-${qi}`,
                            text: getTxt(q),
                            marks: getMarks(q)
                        }));
                    }
                }
                return { ...mappedSlot, id: item.id || `slot-${activeSet}-${Math.random()}` };
            }
            
            // Fallback for raw questions without slots
            const n = currentLabelNum;
            currentLabelNum++;
            return {
                ...mappedSlot,
                id: item.id || `q-raw-${activeSet}-${Math.random()}`,
                type: 'SINGLE',
                n1: n,
                questions: [{ ...item, id: item.id || `qi-raw-${Math.random()}`, text: getTxt(item), marks: getMarks(item) }]
            };
        });

        return mapped;
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
        const { items } = e.detail;
        updateQuestionsFromDnd(items, part);
    }

    function handleDndFinalize(e: any, part: 'A' | 'B' | 'C') {
        const { items } = e.detail;
        updateQuestionsFromDnd(items, part);
    }

    function updateQuestionsFromDnd(items: any[], part: 'A' | 'B' | 'C') {
        // Find indices for start/end of each part in the master list
        // const partAIds = questionsA.map(q => q.id);
        // const partBIds = questionsB.map(q => q.id);
        // const partCIds = questionsC.map(q => q.id);

        let masterList = [...safeQuestions];
        
        // Update PART property of moved items if they switched parts? 
        // For now let's assume DND is only within parts.
        
        if (part === 'A') {
            const bAndC = masterList.filter(s => s.part !== 'A');
            masterList = [...items.map(it => ({ ...it, part: 'A'})), ...bAndC];
        } else if (part === 'B') {
            const aItems = masterList.filter(s => s.part === 'A');
            const cItems = masterList.filter(s => s.part === 'C');
            masterList = [...aItems, ...items.map(it => ({ ...it, part: 'B'})), ...cItems];
        } else if (part === 'C') {
            const aAndB = masterList.filter(s => s.part !== 'C');
            masterList = [...aAndB, ...items.map(it => ({ ...it, part: 'C'}))];
        }

        if (Array.isArray(currentSetData)) {
            currentSetData = masterList;
        } else {
            currentSetData.questions = masterList;
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

    // UPDATED: Text update helper to avoid state_unsafe_mutation on derived state
    function updateText(e: Event, type: 'META' | 'QUESTION', key: string, slotId?: string, questionId?: string, subPart?: 'choice1' | 'choice2') {
        const value = (e.target as HTMLElement).innerText;
        
        if (type === 'META') {
            (paperMeta as any)[key] = value;
        } else if (type === 'QUESTION') {
            const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
            const slot = arr.find((s: any) => s.id === slotId);
            if (!slot) return;

            if (slot.type === 'SINGLE') {
                const q = slot.questions.find((q: any) => q.id === questionId);
                if (q) q.text = value;
            } else if (slot.type === 'OR_GROUP') {
                 const choice = subPart === 'choice1' ? slot.choice1 : slot.choice2;
                 const q = choice.questions.find((q: any) => q.id === questionId);
                 if (q) q.text = value;
            }
        }
    }

    const isEditable = $derived(mode === 'edit');

    // Part-Based filtering: NO INDEX SLICING
    let questionsA = $derived.by(() => {
        return safeQuestions.filter(s => s.part === 'A').map((s: any, idx: number) => ({ ...s, n1: idx + 1 }));
    });

    let questionsB = $derived.by(() => {
        const slots = safeQuestions.filter(s => s.part === 'B');
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
        const slots = safeQuestions.filter(s => s.part === 'C');
        
        // Calculate starting number
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

<div class="paper-container relative p-[1in] bg-white text-black shadow-none border border-gray-100 {mode === 'preview' ? 'scale-[0.5] origin-top' : ''}">
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
                        oninput={(e) => updateText(e, 'META', 'course_code')}
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
                oninput={(e) => updateText(e, 'META', 'exam_title')}
                class="text-[14px] font-black uppercase tracking-wide border-b border-white hover:border-gray-200 outline-none inline-block pb-0.5 {isEditable ? '' : 'pointer-events-none'}"
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
                                oninput={(e) => updateText(e, 'META', 'programme')}
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
                                oninput={(e) => updateText(e, 'META', 'semester')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.semester}</div>
                        </td>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter border-l-2">Date & Session</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black uppercase">
                            <span 
                                contenteditable="true" 
                                oninput={(e) => updateText(e, 'META', 'paper_date')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.paper_date}</span>
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
                                contenteditable="true" 
                                oninput={(e) => updateText(e, 'META', 'course_code')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.course_code}</span> - <span 
                                contenteditable="true" 
                                oninput={(e) => updateText(e, 'META', 'subject_name')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.subject_name}</span>
                        </td>
                    </tr>
                    <!-- Row 4: Duration & Max Marks -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold uppercase tracking-tighter">Duration</td>
                        <td class="border border-gray-900 p-2 text-center font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black w-[15%]">
                            <div 
                                contenteditable="true" 
                                oninput={(e) => updateText(e, 'META', 'duration_minutes')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.duration_minutes} Minutes</div>
                        </td>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter border-l-2">Maximum Marks</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black">
                            <div 
                                contenteditable="true" 
                                oninput={(e) => updateText(e, 'META', 'max_marks')}
                                class={isEditable ? 'outline-none' : 'pointer-events-none'}
                            >{paperMeta.max_marks}</div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Instructions -->
        <div class="w-full text-center mb-6">
            <div 
                contenteditable="true"
                oninput={(e) => updateText(e, 'META', 'instructions')}
                class="text-[11px] font-black uppercase text-gray-900 tracking-[0.2em] border-b-2 border-gray-900 inline-block pb-0.5 {isEditable ? 'outline-none focus:bg-indigo-50/50' : 'pointer-events-none'}"
            >
                {paperMeta.instructions || 'ANSWER ALL QUESTIONS'}
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
            class="w-full border border-black divide-y divide-black"
            use:dndzone={{items: questionsA, flipDurationMs: dndFlipDurationMs, dragDisabled: !isEditable}}
            onconsider={(e) => handleDndConsider(e, 'A')}
            onfinalize={(e) => handleDndFinalize(e, 'A')}
        >
            {#if questionsA.length > 0}
                {#each questionsA as slot, i (slot.id)}
                    <div animate:flip={{duration: dndFlipDurationMs}}>
                    {#if slot.type === 'SINGLE'}
                        {#each slot.questions || [] as q}
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
                                        <div 
                                            contenteditable="true" 
                                            oninput={(e) => updateText(e, 'QUESTION', 'text', slot.id, q.id)}
                                            class="flex-1 {isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}"
                                        >{@html q.text}</div>
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
                class="w-full py-3 border-2 border-dashed border-gray-100 text-gray-300 text-[10px] font-black uppercase tracking-widest hover:border-indigo-200 hover:text-indigo-400 transition-all rounded-xl mt-2 print:hidden"
            >
                + Add Question to Part A
            </button>
        {/if}
    </div>

    <!-- Part B -->
    <div class="mt-12 section-page-break section-part-b">
        <div 
            contenteditable="true"
            class="w-full text-center font-black text-xs uppercase mb-4 border border-black p-1 {isEditable ? '' : 'pointer-events-none'}"
        >
            {paperStructure[1]?.title || 'PART B'} 
            ({partBCount} X {paperStructure[1]?.marks_per_q || 5} = {totalMarksB} MARKS)
        </div>
        <div 
            class="space-y-6"
            use:dndzone={{items: questionsB, flipDurationMs: dndFlipDurationMs, dragDisabled: !isEditable}}
            onconsider={(e) => handleDndConsider(e, 'B')}
            onfinalize={(e) => handleDndFinalize(e, 'B')}
        >
            {#if questionsB.length > 0}
                {#each questionsB as slot, idx (slot.id)}
                    <div animate:flip={{duration: dndFlipDurationMs}}>
                    {#if slot.type === 'OR_GROUP'}
                        <div class="border-2 border-black page-break-avoid mb-6 relative group">
                            {#if isEditable}
                                <div class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden cursor-grab active:cursor-grabbing">
                                    <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                                </div>
                                <div class="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 print:hidden">
                                     <button 
                                        onclick={() => removeQuestion(slot.id)}
                                        class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                    >
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        DEL
                                    </button>
                                </div>
                            {/if}
                            <!-- Choice 1 -->
                            {#each slot.choice1?.questions || [] as q, subIdx}
                                <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n1 + '.' : ''}
                                </div>
                                    <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                        {q.sub_label || ''}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                        <div 
                                            contenteditable="true" 
                                            oninput={(e) => updateText(e, 'QUESTION', 'text', slot.id, q.id, 'choice1')}
                                            class={isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}
                                        >{@html q.text}</div>
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
                            <div class="w-full text-center text-[10px] font-black uppercase py-1 border-b border-black bg-gray-50/20 italic tracking-[0.2em]">
                                (OR)
                            </div>

                            <!-- Choice 2 -->
                            {#each slot.choice2?.questions || [] as q, subIdx}
                                <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n2 + '.' : ''}
                                </div>
                                    <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                        {q.sub_label || ''}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                        <div 
                                            contenteditable="true" 
                                            oninput={(e) => updateText(e, 'QUESTION', 'text', slot.id, q.id, 'choice2')}
                                            class={isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}
                                        >{@html q.text}</div>
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
                                        onclick={() => removeQuestion(slot.id)}
                                        class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                    >
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        DEL
                                    </button>
                                </div>
                            {/if}
                            {#each slot.questions || [] as q}
                                <div class="flex min-h-[50px]">
                                    <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                        {slot.n1 + '.'}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                        <div 
                                            contenteditable="true" 
                                            oninput={(e) => updateText(e, 'QUESTION', 'text', slot.id, q.id)}
                                            class="flex-1 {isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}"
                                        >{q.text}</div>
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
                class="w-full text-center font-black text-xs uppercase mb-4 border border-black p-1 {isEditable ? '' : 'pointer-events-none'}"
            >
                {#if paperStructure[2]}
                    {paperStructure[2].title} ({partCCount} X {paperStructure[2].marks_per_q} = {totalMarksC} MARKS)
                {:else}
                    PART C ({partCCount} X 16 = {totalMarksC} MARKS)
                {/if}
            </div>
        <div 
            class="space-y-6"
            use:dndzone={{items: questionsC, flipDurationMs: dndFlipDurationMs, dragDisabled: !isEditable}}
            onconsider={(e) => handleDndConsider(e, 'C')}
            onfinalize={(e) => handleDndFinalize(e, 'C')}
        >
                {#each questionsC as slot, idx (slot.id)}
                    <div animate:flip={{duration: dndFlipDurationMs}}>
                    <div class="border-2 border-black page-break-avoid relative group">
                        {#if isEditable}
                                <div class="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden cursor-grab active:cursor-grabbing">
                                    <svg class="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                                </div>
                                <div class="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 print:hidden">
                                     <button 
                                        onclick={() => removeQuestion(slot.id)}
                                        class="bg-red-500 text-white p-1.5 rounded-md shadow-lg text-[9px] font-black tracking-widest flex items-center gap-1 hover:bg-red-600 active:scale-95"
                                    >
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        DEL
                                    </button>
                                </div>
                        {/if}
                        <!-- Choice 1 -->
                        {#each slot.choice1.questions as q, subIdx}
                            <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n1 + '.' : ''}
                                </div>
                                <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                    {q.sub_label || ''}
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed">
                                    <div 
                                        contenteditable="true" 
                                        oninput={(e) => updateText(e, 'QUESTION', 'text', slot.id, q.id, 'choice1')}
                                        class={isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}
                                    >{q.text}</div>
                                    
                                    {#if q.options && q.options.length > 0}
                                        <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                            {#each q.options as opt}
                                                <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group/btn relative">
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
                        <div class="w-full text-center text-[10px] font-black uppercase py-1 border-b border-black bg-gray-50/20 italic tracking-[0.2em]">
                            (OR)
                        </div>

                        <!-- Choice 2 -->
                        {#each slot.choice2?.questions || [] as q, subIdx}
                            <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n2 + '.' : ''}
                                </div>
                                <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                    {q.sub_label || ''}
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                    <div 
                                        contenteditable="true" 
                                        oninput={(e) => updateText(e, 'QUESTION', 'text', slot.id, q.id, 'choice2')}
                                        class={isEditable ? 'outline-none focus:bg-gray-50' : 'pointer-events-none'}
                                    >{q.text}</div>
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
                                <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group/btn relative">
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
                    class="w-full py-4 border-2 border-dashed border-gray-100 text-gray-300 text-[10px] font-black uppercase tracking-widest hover:border-indigo-200 hover:text-indigo-400 transition-all rounded-xl mt-4 print:hidden"
                >
                    + Add Question to Part C
                </button>
            {/if}
        </div>
    {/if}

    <!-- Bottom Signatures -->
    <div class="mt-20 grid grid-cols-2 gap-20">
        <div class="border-t border-black pt-2 text-center">
            <p class="text-[9px] font-black uppercase">Name & Signature of DAAC Member</p>
        </div>
        <div class="border-t border-black pt-2 text-center">
            <p class="text-[9px] font-black uppercase">Name & Signature of DAAC Member</p>
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
            class="absolute inset-0 bg-black/40 backdrop-blur-sm w-full h-full border-none cursor-default"
            onclick={() => isSwapSidebarOpen = false}
            aria-label="Close Sidebar"
        ></button>

        <!-- Sidebar -->
        <div 
            class="relative w-[400px] bg-white h-full shadow-2xl flex flex-col"
            transition:fly={{x: 400, duration: 300}}
        >
            <div class="p-6">
                <div class="flex items-center justify-between mb-8">
                    <div class="space-y-1">
                        <h2 class="text-xl font-black text-gray-900 tracking-tight uppercase">Alternate Questions</h2>
                        <p class="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                            {swapContext.currentMark} Marks • {swapContext.currentUnit ? `Unit ${swapContext.currentUnit.split('-').pop()}` : 'System Recommended'}
                        </p>
                    </div>
                    <button 
                        onclick={() => isSwapSidebarOpen = false} 
                        aria-label="Close Sidebar"
                        class="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-all active:scale-90"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                {#if swapContext.alternates.length === 0}
                    <div class="flex flex-col items-center justify-center h-64 text-gray-400 text-center space-y-4">
                        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <p class="text-xs font-bold uppercase tracking-widest leading-loose">
                            No alternative questions found<br/>in the question bank for {swapContext.currentMark} marks.
                        </p>
                    </div>
                {:else}
                    {#each swapContext.alternates as q}
                        <button 
                            onclick={() => selectAlternate(q)}
                            class="w-full text-left bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all group relative overflow-hidden"
                        >
                            <!-- Selection Overlay -->
                            <div class="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/[0.02] transition-colors"></div>
                            
                            <div class="flex justify-between items-start gap-4 mb-3">
                                <span class="px-2 py-0.5 bg-gray-900 text-white text-[9px] font-black rounded-md uppercase tracking-tighter italic">
                                    {q.bloom_level}
                                </span>
                                <span class="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                                    {getCOCode(q.co_id) || 'General'}
                                </span>
                            </div>

                            <p class="text-xs leading-relaxed text-gray-800 font-medium">
                                {q.question_text}
                            </p>

                            <div class="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
                                <span class="text-[10px] text-gray-400 font-black uppercase tracking-tighter">{q.marks} Marks</span>
                                <span class="opacity-0 group-hover:opacity-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest transition-opacity flex items-center gap-1">
                                    Select This
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                </span>
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}

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
