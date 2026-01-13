<script lang="ts">
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
        currentSetData = { questions: [] as any[] },
        paperStructure = [] as any[],
        activeSet = 'A',
        courseOutcomes = [],
        questionPool = [] as any[],
        mode = 'view' // 'view', 'edit', 'preview'
    } = $props();

    function replaceQuestion(index: number, part: 'A' | 'B' | 'C', subPart?: 'q1' | 'q2') {
        const slot = currentSetData.questions[index];
        if (!slot) return;

        // Determine which specific question object we are replacing
        let currentQ: any = null;
        if (slot.type === 'SINGLE') {
            currentQ = slot.questions?.[0];
        } else if (slot.type === 'OR_GROUP') {
            currentQ = subPart === 'q1' ? slot.choice1.questions[0] : slot.choice2.questions[0];
        }

        const marks = currentQ?.marks || slot.marks || (part === 'A' ? 2 : 16);
        
        // Find other questions with same marks
        const alternates = questionPool.filter(q => q.marks === marks && q.id !== currentQ?.id);
        if (alternates.length === 0) return alert('No other questions found in the pool for this mark.');
        
        const randomQ = alternates[Math.floor(Math.random() * alternates.length)];
        
        const newQData = {
            id: randomQ.id,
            text: randomQ.question_text,
            marks: randomQ.marks,
            type: randomQ.type,
            options: randomQ.options,
            co_id: randomQ.co_id,
            bloom: randomQ.bloom_level
        };

        if (slot.type === 'SINGLE') {
            slot.questions = [newQData];
            // Backward compatibility
            slot.text = randomQ.question_text;
            slot.id = randomQ.id;
        } else if (slot.type === 'OR_GROUP') {
            if (subPart === 'q1') slot.choice1.questions = [newQData];
            else slot.choice2.questions = [newQData];
        }
        
        // Trigger reactivity
        currentSetData.questions = [...currentSetData.questions];
    }

    function addQuestion(part: 'A' | 'B' | 'C') {
        const marks = part === 'A' ? 2 : (part === 'B' ? (Number(paperMeta.max_marks) === 50 ? 5 : 16) : 16);
        const newQ = {
            id: 'manual-' + Math.random().toString(36).substr(2, 9),
            text: 'Click to edit question text...',
            marks: marks,
            type: 'SINGLE',
            co_id: null
        };
        currentSetData.questions = [...currentSetData.questions, newQ];
    }

    function getCOCode(coId: string | undefined) {
        if (!coId) return null;
        return courseOutcomes.find((c: any) => c.id === coId)?.code || null;
    }

    const isEditable = $derived(mode === 'edit');

    // Helper to determine if a slot is MCQ-oriented
    const isMCQSlot = (slot: any) => {
        if (!slot) return false;
        if (slot.type === 'SINGLE') {
            return slot.questions?.[0]?.type === 'MCQ';
        }
        return slot.choice1?.questions?.[0]?.type === 'MCQ';
    };

    // Smart Partitioning: All MCQs to Part A, everything else to Part B/C
    let mcqSlots = $derived(currentSetData.questions.filter(isMCQSlot));
    let nonMcqSlots = $derived(currentSetData.questions.filter((s: any) => !isMCQSlot(s)));

    let questionsA = $derived(mcqSlots);
    let partACount = $derived(mcqSlots.length);

    let is100m = $derived(Number(paperMeta.max_marks) === 100);
    
    let slotsB = $derived(is100m ? nonMcqSlots.slice(0, nonMcqSlots.length - 1) : nonMcqSlots);
    let slotsC = $derived(is100m ? nonMcqSlots.slice(nonMcqSlots.length - 1) : []);

    let numberedSections = $derived(() => {
        let current = mcqSlots.length + 1;
        const b = slotsB.map((s: any) => {
            if (s.type === 'OR_GROUP') {
                const n1 = current;
                const n2 = current + 1;
                current += 2;
                return { ...s, n1, n2 };
            } else {
                const n1 = current;
                current += 1;
                return { ...s, n1 };
            }
        });
        const c = slotsC.map((s: any) => {
            if (s.type === 'OR_GROUP') {
                const n1 = current;
                const n2 = current + 1;
                current += 2;
                return { ...s, n1, n2 };
            } else {
                const n1 = current;
                current += 1;
                return { ...s, n1 };
            }
        });
        return { b, c, totalB: slotsB.length };
    });

    let questionsB = $derived(numberedSections().b);
    let questionsC = $derived(numberedSections().c);
    let partBCount = $derived(numberedSections().totalB);
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
                    &lt;<span contenteditable="true" bind:innerHTML={paperMeta.course_code} class={isEditable ? '' : 'pointer-events-none'}></span>&gt;
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
                bind:innerHTML={paperMeta.exam_title} 
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
                            <div contenteditable="true" bind:innerHTML={paperMeta.programme} class={isEditable ? '' : 'pointer-events-none'}></div>
                        </td>
                    </tr>
                    <!-- Row 2: Semester & Date/Session -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold uppercase tracking-tighter">Semester</td>
                        <td class="border border-gray-900 p-2 text-center font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black w-[15%]">
                            <div contenteditable="true" bind:innerHTML={paperMeta.semester} class={isEditable ? '' : 'pointer-events-none'}></div>
                        </td>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter border-l-2">Date & Session</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black uppercase">
                            <span contenteditable="true" bind:innerHTML={paperMeta.paper_date} class={isEditable ? '' : 'pointer-events-none'}>{paperMeta.paper_date}</span>
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
                            <span contenteditable="true" bind:innerHTML={paperMeta.course_code} class={isEditable ? '' : 'pointer-events-none'}></span> - <span contenteditable="true" bind:innerHTML={paperMeta.subject_name} class={isEditable ? '' : 'pointer-events-none'}></span>
                        </td>
                    </tr>
                    <!-- Row 4: Duration & Max Marks -->
                    <tr>
                        <td class="border border-gray-900 p-2 font-bold uppercase tracking-tighter">Duration</td>
                        <td class="border border-gray-900 p-2 text-center font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black w-[15%]">
                            <div contenteditable="true" bind:innerHTML={paperMeta.duration_minutes} class={isEditable ? '' : 'pointer-events-none'}>{paperMeta.duration_minutes} Minutes</div>
                        </td>
                        <td class="border border-gray-900 p-2 font-bold w-[25%] uppercase tracking-tighter border-l-2">Maximum Marks</td>
                        <td class="border border-gray-900 p-2 text-center w-[2%] font-bold">:</td>
                        <td class="border border-gray-900 p-2 font-black">
                            <div contenteditable="true" bind:innerHTML={paperMeta.max_marks} class={isEditable ? '' : 'pointer-events-none'}>{paperMeta.max_marks}</div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Instructions -->
        <div class="w-full text-center mb-6">
            <p 
                contenteditable="true" 
                bind:innerHTML={paperMeta.instructions} 
                class="text-[9px] font-black uppercase tracking-[0.3em] font-serif italic mb-2 {isEditable ? '' : 'pointer-events-none'}"
            >
                &lt; {paperMeta.instructions} &gt;
            </p>
            <div class="text-[11px] font-black uppercase text-gray-900 tracking-[0.2em] border-b-2 border-gray-900 inline-block pb-0.5">
                ANSWER ALL QUESTIONS
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
            ({partACount} X {paperStructure[0]?.marks_per_q || (is100m ? 2 : 2)} = {partACount * (paperStructure[0]?.marks_per_q || 2)} MARKS)
        </div>
        <div class="w-full border border-black divide-y divide-black">
            {#if questionsA.length > 0}
                {#each questionsA as slot, i}
                    {#if slot.type === 'SINGLE'}
                        {#each slot.questions || [] as q}
                            <div class="flex min-h-[40px] page-break-avoid">
                                <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold">
                                    {i + 1}.
                                </div>
                                <div class="flex-1 p-2 text-[10px] leading-relaxed group relative">
                                    <div class="flex justify-between items-start gap-4">
                                        <div contenteditable="true" bind:innerHTML={q.text} class="flex-1 {isEditable ? '' : 'pointer-events-none'}"></div>
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
                                        <button 
                                            onclick={() => replaceQuestion(currentSetData.questions.indexOf(slot), 'A')}
                                            class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full shadow-lg transition-all z-20 print:hidden"
                                            title="Replace Question"
                                        >
                                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                        </button>
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
                        <div class="p-2 bg-gray-50/50">
                             <div class="text-[10px] font-bold text-center">Slot {i+1} (OR Question Support)</div>
                        </div>
                    {/if}
                {/each}
            {:else}
                {#each Array(Number(paperMeta.max_marks) === 50 ? 5 : 10) as _, i}
                    <div class="flex h-[40px]">
                        <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold">{i + 1}.</div>
                        <div class="flex-1 p-2 text-[10px] italic text-gray-300">Question Text Placeholder</div>
                        <div class="w-20 border-l border-black bg-gray-50/20"></div>
                    </div>
                {/each}
            {/if}
        </div>
    </div>

    <!-- Part B -->
    <div class="mt-12 section-page-break section-part-b">
        <div 
            contenteditable="true"
            class="w-full text-center font-black text-xs uppercase mb-4 border border-black p-1 {isEditable ? '' : 'pointer-events-none'}"
        >
            {paperStructure[1]?.title || 'PART B'} 
            ({partBCount} X {paperStructure[1]?.marks_per_q || 5} = {partBCount * (paperStructure[1]?.marks_per_q || 5)} MARKS)
        </div>
        <div class="space-y-6">
                {#each questionsB as slot, idx}
                    {#if slot.type === 'OR_GROUP'}
                        <div class="border-2 border-black page-break-avoid mb-6">
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
                                        <div contenteditable="true" bind:innerHTML={q.text} class={isEditable ? '' : 'pointer-events-none'}></div>
                                        
                                        {#if q.options && q.options.length > 0}
                                            <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                                {#each q.options as opt}
                                                    <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group relative">
                                        <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                        <span class="text-[10px] font-black">({q.marks})</span>
                                        {#if isEditable}
                                            <button 
                                                onclick={() => replaceQuestion(currentSetData.questions.indexOf(slot), 'B', 'q1')}
                                                class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full shadow-lg transition-all z-20 print:hidden"
                                                title="Replace Question"
                                            >
                                                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                            
                            <!-- OR Separator -->
                            <div class="w-full text-center text-[11px] font-black uppercase py-1.5 border-b border-black bg-gray-50/50 italic tracking-[0.3em]">
                                (OR)
                            </div>

                            <!-- Choice 2 -->
                            {#each slot.choice2.questions as q, subIdx}
                                <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n2 + '.' : ''}
                                </div>
                                    <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                        {q.sub_label || ''}
                                    </div>
                                    <div class="flex-1 p-3 text-[11px] leading-relaxed">
                                        <div contenteditable="true" bind:innerHTML={q.text} class={isEditable ? '' : 'pointer-events-none'}></div>
                                        
                                        {#if q.options && q.options.length > 0}
                                            <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                                {#each q.options as opt}
                                                    <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                                {/each}
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group relative">
                                        <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                        <span class="text-[10px] font-black">({q.marks})</span>
                                        {#if isEditable}
                                            <button 
                                                onclick={() => replaceQuestion(currentSetData.questions.indexOf(slot), 'B', 'q2')}
                                                class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full shadow-lg transition-all z-20 print:hidden"
                                                title="Replace Question"
                                            >
                                                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                    <!-- SINGLE in Part B -->
                    <div class="border-2 border-black page-break-avoid mb-6">
                        {#each slot.questions || [] as q}
                            <div class="flex min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {slot.n1 + '.'}
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed group relative">
                                    <div contenteditable="true" bind:innerHTML={q.text} class="flex-1 {isEditable ? '' : 'pointer-events-none'}"></div>
                                    
                                    {#if q.options && q.options.length > 0}
                                        <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                            {#each q.options as opt}
                                                <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group relative">
                                    <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                    <span class="text-[10px] font-black">({q.marks})</span>
                                    {#if isEditable}
                                        <button 
                                            onclick={() => replaceQuestion(currentSetData.questions.indexOf(slot), 'B')}
                                            class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full shadow-lg transition-all z-20 print:hidden"
                                            title="Replace Question"
                                        >
                                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            {:else}
                <div class="border border-dashed border-gray-200 p-10 text-center text-[10px] text-gray-300 italic">
                    Part B Questions will appear here
                </div>
            {/each}
        </div>
    </div>

    {#if is100m}
        <div class="mt-12 section-page-break section-part-c">
             <div 
                contenteditable="true"
                class="w-full text-center font-black text-xs uppercase mb-4 border border-black p-1 {isEditable ? '' : 'pointer-events-none'}"
            >
                {#if paperStructure[2]}
                    {paperStructure[2].title} ({paperStructure[2].answered_count} X {paperStructure[2].marks_per_q} = {paperStructure[2].answered_count * paperStructure[2].marks_per_q} MARKS)
                {:else}
                    PART C (1 X 16 = 16 MARKS)
                {/if}
            </div>
            <div class="space-y-6">
                {#each questionsC as slot, idx}
                    <div class="border-2 border-black page-break-avoid">
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
                                    <div contenteditable="true" bind:innerHTML={q.text} class={isEditable ? '' : 'pointer-events-none'}></div>
                                    
                                    {#if q.options && q.options.length > 0}
                                        <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                            {#each q.options as opt}
                                                <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group relative">
                                    <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                    <span class="text-[10px] font-black">({q.marks})</span>
                                    {#if isEditable}
                                        <button 
                                            onclick={() => replaceQuestion(currentSetData.questions.indexOf(slot), 'C', 'q1')}
                                            class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full shadow-lg transition-all z-20 print:hidden"
                                            title="Replace Question"
                                        >
                                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                        
                        <!-- OR Separator -->
                        <div class="w-full text-center text-[11px] font-black uppercase py-1.5 border-b border-black bg-gray-50/50 italic tracking-[0.3em]">
                            (OR)
                        </div>

                        <!-- Choice 2 -->
                        {#each slot.choice2.questions as q, subIdx}
                            <div class="flex border-b border-black last:border-b-0 min-h-[50px]">
                                <div class="w-12 border-r border-black p-2 text-center text-[11px] font-black">
                                    {subIdx === 0 ? slot.n2 + '.' : ''}
                                </div>
                                <div class="w-10 border-r border-black p-2 text-center text-[10px] font-bold flex items-center justify-center">
                                    {q.sub_label || ''}
                                </div>
                                <div class="flex-1 p-3 text-[11px] leading-relaxed">
                                    <div contenteditable="true" bind:innerHTML={q.text} class={isEditable ? '' : 'pointer-events-none'}></div>
                                    
                                    {#if q.options && q.options.length > 0}
                                        <div class="grid grid-cols-2 gap-x-8 gap-y-1 mt-3 pl-8">
                                            {#each q.options as opt}
                                                <div class="text-[10px] font-medium leading-tight">{opt}</div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <div class="w-20 border-l border-black p-2 text-center flex flex-col items-center justify-center gap-1 group relative">
                                    <span class="text-[8px] font-black text-gray-400 uppercase">({getCOCode(q.co_id) || ''})</span>
                                    <span class="text-[10px] font-black">({q.marks})</span>
                                    {#if isEditable}
                                        <button 
                                            onclick={() => replaceQuestion(currentSetData.questions.indexOf(slot), 'C', 'q2')}
                                            class="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-1 rounded-full shadow-lg transition-all z-20 print:hidden"
                                            title="Replace Question"
                                        >
                                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/each}
            </div>
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

<style>
    .paper-container {
        font-family: 'Times New Roman', Times, serif;
    }

    @media print {
        .section-page-break {
            break-before: page;
            -webkit-column-break-before: always;
            page-break-before: always;
            margin-top: 0 !important;
        }

        .page-break-avoid {
            break-inside: avoid;
            -webkit-column-break-inside: avoid;
            page-break-inside: avoid;
        }

        /* Ensure header doesn't get pushed to new page alone */
        .paper-container {
            padding: 0.5in !important;
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
</style>
