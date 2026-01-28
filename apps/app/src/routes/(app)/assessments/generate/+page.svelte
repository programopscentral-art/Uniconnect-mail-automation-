<script lang="ts">
    import { page } from '$app/stores';
    import { slide, fade, fly } from 'svelte/transition';
    import { invalidateAll, goto } from '$app/navigation';
    import CrescentTemplate from '$lib/components/assessments/CrescentTemplate.svelte';
    import CDUTemplate from '$lib/components/assessments/CDUTemplate.svelte';
    import StandardTemplate from '$lib/components/assessments/StandardTemplate.svelte';

    let { data } = $props();

    let currentStep = $state(1);
    const steps = ['Context', 'Department', 'Question Bank', 'Preview', 'Sets', 'Generate'];

    // Selections
    let selectedUniversityId = $state('');
    let selectedBatchId = $state('');
    let selectedBranchId = $state('');
    let selectedSemester = $state(1);
    let selectedSubjectId = $state('');
    let universitySearch = $state('');
    let filteredUniversities = $derived(
        data.universities.filter(u => u.name.toLowerCase().includes(universitySearch.toLowerCase()))
    );
    let branchSearch = $state('');
    let filteredBranches = $derived(
        data.branches.filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase()) || b.code.toLowerCase().includes(branchSearch.toLowerCase()))
    );
    let selectedExamType = $state('MID1');
    let selectedUnitIds = $state<string[]>([]);

    let generationMode = $state('Standard');
    let selectedTemplate = $state('crescent');
    let partAType = $state('Normal'); 
    let paperStructure = $state<any[]>([]);
    let setsConfig = $state<Record<string, string[]>>({
        'A': ['L1', 'L2'],
        'B': ['L1', 'L3'],
        'C': ['L2', 'L3'],
        'D': ['L1', 'L2', 'L3']
    });

    // Metadata
    let examDate = $state(new Date().toISOString().split('T')[0]);
    let examTime = $state('10:00 AM');
    let examDuration = $state(90);
    let maxMarks = $state(50); // Default to 50 as suggested for Mid Exams
    let courseCodeManual = $state('');
    let examTitleHeader = $state('SEMESTER END EXAMINATIONS - NOV/DEC 2025');
    let paperInstructions = $state('ANSWER ALL QUESTIONS');

    // Dynamic Data
    let unitsWithTopics = $state<any[]>([]);
    let courseOutcomes = $state<any[]>([]);
    let availableTemplates = $state<any[]>([]);
    let isLoadingTopics = $state(false);
    let isGenerating = $state(false);

    function initializeStructure(force = false) {
        if (!force && paperStructure.length > 0) return; // Don't overwrite if already exists

        const is100 = Number(maxMarks) === 100;
        const structure = [];
        
        // Part A
        const isMCQ = partAType === 'MCQ';
        const countA = is100 ? (isMCQ ? 20 : 10) : (isMCQ ? 10 : 5);
        const marksA = isMCQ ? 1 : 2;
        const typeA = isMCQ ? 'MCQ' : 'NORMAL';

        const partA = { 
            title: 'PART A', 
            part: 'A',
            answered_count: countA,
            marks_per_q: marksA,
            slots: [] as any[] 
        };

        for(let i=1; i<=countA; i++) {
            partA.slots.push({ 
                id: `A-${i}-${Math.random()}`, 
                label: `${i}`, 
                part: 'A',
                type: 'SINGLE',
                marks: marksA, 
                unit: 'Auto', 
                qType: typeA,
                hasSubQuestions: false,
                bloom: 'ANY',
                marks_a: Number((marksA/2).toFixed(1)), 
                marks_b: Number((marksA/2).toFixed(1)) 
            });
        }
        structure.push(partA);
        
        // Part B
        const countB = is100 ? 5 : 8; 
        const marksB = is100 ? 16 : 5;
        const partB = { 
            title: 'PART B', 
            part: 'B',
            answered_count: countB,
            marks_per_q: marksB,
            slots: [] as any[] 
        };

        const startB = countA + 1;
        for(let i=0; i<countB; i++) {
            const qNum = startB + i;
            partB.slots.push({ 
                id: `B-${i}-${Math.random()}`, 
                label: `${qNum}`, 
                displayLabel: `${qNum} or ${qNum + 1}`,
                part: 'B',
                type: 'OR_GROUP',
                marks: marksB,
                choices: [
                    { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: marksB, bloom: 'ANY', marks_a: Number((marksB/2).toFixed(1)), marks_b: Number((marksB/2).toFixed(1)) },
                    { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: marksB, bloom: 'ANY', marks_a: Number((marksB/2).toFixed(1)), marks_b: Number((marksB/2).toFixed(1)) }
                ]
            });
        }
        structure.push(partB);
        
        if (generationMode === 'Chaitanya') {
            const partA = { 
                title: 'Section - A', 
                part: 'A',
                answered_count: 6,
                marks_per_q: 2,
                slots: [] as any[] 
            };
            for(let i=1; i<=10; i++) {
                partA.slots.push({ 
                    id: `A-${i}-${Math.random()}`, 
                    label: `${i}`, 
                    part: 'A',
                    type: 'SINGLE',
                    marks: 2, 
                    unit: 'Auto', 
                    qType: 'NORMAL',
                    hasSubQuestions: false,
                    bloom: 'ANY'
                });
            }
            structure.push(partA);

            const partB = { 
                title: 'Section - B', 
                part: 'B',
                answered_count: 2,
                marks_per_q: 4,
                slots: [] as any[] 
            };
            for(let i=0; i<2; i++) {
                const qNum = 11 + i*2;
                partB.slots.push({ 
                    id: `B-${i}-${Math.random()}`, 
                    label: `${qNum}`, 
                    displayLabel: `${qNum} or ${qNum + 1}`,
                    part: 'B',
                    type: 'OR_GROUP',
                    marks: 4,
                    choices: [
                        { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: 4, bloom: 'ANY' },
                        { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: 4, bloom: 'ANY' }
                    ]
                });
            }
            structure.push(partB);
            
            paperStructure = structure;
            refreshLabels();
            return;
        }

        if (activeUniversity?.name?.toLowerCase().includes('chaitanya')) {
            const partA = { 
                title: 'Section - A', 
                part: 'A',
                answered_count: 6,
                marks_per_q: 2,
                slots: [] as any[] 
            };
            for(let i=1; i<=10; i++) {
                partA.slots.push({ 
                    id: `A-${i}-${Math.random()}`, 
                    label: `${i}`, 
                    part: 'A',
                    type: 'SINGLE',
                    marks: 2, 
                    unit: 'Auto', 
                    qType: 'NORMAL',
                    hasSubQuestions: false,
                    bloom: 'ANY'
                });
            }
            structure.push(partA);

            const partB = { 
                title: 'Section - B', 
                part: 'B',
                answered_count: 2,
                marks_per_q: 4,
                slots: [] as any[] 
            };
            for(let i=0; i<2; i++) {
                const qNum = 11 + i*2;
                partB.slots.push({ 
                    id: `B-${i}-${Math.random()}`, 
                    label: `${qNum}`, 
                    displayLabel: `${qNum} or ${qNum + 1}`,
                    part: 'B',
                    type: 'OR_GROUP',
                    marks: 4,
                    choices: [
                        { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: 4, bloom: 'ANY' },
                        { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: 4, bloom: 'ANY' }
                    ]
                });
            }
            structure.push(partB);
            
            paperStructure = structure;
            refreshLabels();
            return;
        }

        if (is100) {
            const partC = {
                title: 'PART C',
                part: 'C',
                answered_count: 1,
                marks_per_q: 16,
                slots: [] as any[]
            };
            const startC = startB + countB;
            partC.slots.push({
                id: `C-1-${Math.random()}`,
                label: `${startC}`,
                displayLabel: `${startC} or ${startC + 1}`,
                part: 'C',
                type: 'OR_GROUP',
                marks: 16,
                choices: [
                    { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: 16, bloom: 'ANY', marks_a: 8, marks_b: 8 },
                    { label: ``, unit: 'Auto', qType: 'NORMAL', hasSubQuestions: false, marks: 16, bloom: 'ANY', marks_a: 8, marks_b: 8 }
                ]
            });
            structure.push(partC);
        }
        
        paperStructure = structure;
        refreshLabels(); 
    }

    // Derived
    let activeUniversity = $derived(data.universities.find(u => u.id === selectedUniversityId));
    let activeBatch = $derived(data.batches.find(b => b.id === selectedBatchId));
    let activeBranch = $derived(data.branches.find(b => b.id === selectedBranchId));
    let activeSubject = $derived(data.subjects.find((s: any) => s.id === selectedSubjectId));

    // Question Pool Validation
    let currentPool = $derived(() => {
        const pool: Record<number, number> = {};
        unitsWithTopics.forEach(u => {
            if (selectedUnitIds.includes(u.id)) {
                Object.entries(u.question_counts || {}).forEach(([marks, count]) => {
                    const m = Number(marks);
                    pool[m] = (pool[m] || 0) + (count as number);
                });
            }
        });
        return pool;
    });

    let poolDeficiency = $derived(() => {
        const pool = currentPool();
        let required: Record<number, number> = {};

        if (generationMode === 'Standard') {
            required = Number(maxMarks) === 100 
                ? { 2: 10, 16: 10 } // Part A (10x2), Part B (4x2x16), Part C (1x2x16)
                : { 2: 5, 5: 16 };  // Part A (5x2), Part B (8x2x5)
        } else {
            paperStructure.forEach(section => {
                section.slots.forEach((slot: any) => {
                    if (slot.type === 'SINGLE') {
                        if (slot.hasSubQuestions) {
                            required[slot.marks_a] = (required[slot.marks_a] || 0) + 1;
                            required[slot.marks_b] = (required[slot.marks_b] || 0) + 1;
                        } else {
                            required[slot.marks] = (required[slot.marks] || 0) + 1;
                        }
                    } else if (slot.choices) {
                        slot.choices.forEach((choice: any) => {
                            if (choice.hasSubQuestions) {
                                required[choice.marks_a] = (required[choice.marks_a] || 0) + 1;
                                required[choice.marks_b] = (required[choice.marks_b] || 0) + 1;
                            } else {
                                required[choice.marks] = (required[choice.marks] || 0) + 1;
                            }
                        });
                    }
                });
            });
        }
        
        const deficientMarks = [];
        for (const [m, count] of Object.entries(required)) {
            const marks = Number(m);
            if ((pool[marks] || 0) < count) {
                deficientMarks.push({ marks, has: pool[marks] || 0, needs: count });
            }
        }
        return deficientMarks;
    });

    async function fetchTopics() {
        if (!selectedSubjectId) return;
        isLoadingTopics = true;
        try {
            const [topicsRes, coRes] = await Promise.all([
                fetch(`/api/assessments/topics?subjectId=${selectedSubjectId}`),
                fetch(`/api/assessments/course-outcomes?subjectId=${selectedSubjectId}`)
            ]);
            
            if (topicsRes.ok) unitsWithTopics = await topicsRes.json();
            if (coRes.ok) courseOutcomes = await coRes.json();
        } finally {
            isLoadingTopics = false;
        }
    }

    function toggleUnit(unitId: string) {
        if (selectedUnitIds.includes(unitId)) {
            selectedUnitIds = selectedUnitIds.filter(id => id !== unitId);
        } else {
            selectedUnitIds = [...selectedUnitIds, unitId];
        }
    }

    function selectAllUnits() {
        selectedUnitIds = unitsWithTopics.map(u => u.id);
    }

    function selectUpToUnit(unitNum: number) {
        selectedUnitIds = unitsWithTopics
            .filter(u => u.unit_number <= unitNum)
            .map(u => u.id);
    }

    async function generateSets() {
        if (selectedUnitIds.length === 0) return alert('Select at least one unit');
        isGenerating = true;
        try {
            const res = await fetch('/api/assessments/generate', {
            method: 'POST',
            body: JSON.stringify({
                university_id: selectedUniversityId,
                batch_id: selectedBatchId,
                branch_id: selectedBranchId,
                subject_id: selectedSubjectId,
                exam_type: selectedExamType,
                semester: selectedSemester,
                unit_ids: selectedUnitIds,
                paper_date: examDate,
                exam_time: examTime,
                duration_minutes: examDuration,
                max_marks: maxMarks,
                course_code: courseCodeManual,
                exam_title: examTitleHeader,
                instructions: paperInstructions,
                generation_mode: generationMode,
                part_a_type: partAType,
                selected_template: activeUniversity?.name?.toLowerCase()?.includes('chaitanya') ? 'cdu' : selectedTemplate,
                template_config: generationMode === 'Modifiable' ? paperStructure : null,
                sets_config: setsConfig
            }),
            headers: { 'Content-Type': 'application/json' }
        });

            if (res.ok) {
                const paper = await res.json();
                window.location.href = `/assessments/papers/${paper.id}`;
            } else {
                const err = await res.json();
                alert(`Generation failed: ${err.message || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert('A network error occurred during generation.');
        } finally {
            isGenerating = false;
        }
    }

    async function saveAsTemplate() {
        const templateName = prompt('Enter a name for this template:', `${selectedExamType} Format - ${maxMarks}M`);
        if (!templateName) return;

        const res = await fetch('/api/assessments/templates', {
            method: 'POST',
            body: JSON.stringify({
                university_id: selectedUniversityId,
                name: templateName,
                exam_type: selectedExamType,
                config: paperStructure
            }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            alert('Template saved successfully!');
            fetchTemplates(); // Refresh list
        } else {
            alert('Failed to save template');
        }
    }

    async function fetchTemplates() {
        if (!selectedUniversityId || selectedUniversityId === 'undefined' || selectedUniversityId.length < 36) return;
        const res = await fetch(`/api/assessments/templates?universityId=${selectedUniversityId}`);
        if (res.ok) availableTemplates = await res.json();
    }

    function applyTemplate(templateId: string) {
        const template = availableTemplates.find(t => t.id === templateId);
        if (template && template.config) {
            paperStructure = JSON.parse(JSON.stringify(template.config));
            selectedExamType = template.exam_type;
            refreshLabels();
        }
    }

    function refreshLabels() {
        let currentNum = 1;
        paperStructure.forEach((section: any) => {
            section.slots.forEach((slot: any) => {
                if (slot.type === 'SINGLE') {
                    slot.label = `${currentNum}`;
                    currentNum++;
                } else if (slot.type === 'OR_GROUP') {
                    const n1 = currentNum;
                    const n2 = currentNum + 1;
                    slot.label = `${n1}`;
                    slot.displayLabel = `${n1} or ${n2}`;
                    if (slot.choices) {
                        slot.choices[0].label = `${n1}`;
                        slot.choices[1].label = `${n2}`;
                    }
                    currentNum += 2;
                }
            });
        });
        paperStructure = [...paperStructure];
    }

    function addSingleSlot(section: any) {
        section.slots.push({
            id: Math.random().toString(36).substr(2, 9),
            label: ``, // Will be refreshed
            type: 'SINGLE',
            marks: section.marks_per_q,
            unit: 'Auto',
            qType: 'NORMAL',
            bloom: 'ANY',
            hasSubQuestions: false,
            marks_a: Number((section.marks_per_q/2).toFixed(1)),
            marks_b: Number((section.marks_per_q/2).toFixed(1))
        });
        refreshLabels();
    }

    function addOrGroup(section: any) {
        section.slots.push({
            id: Math.random().toString(36).substr(2, 9),
            label: ``, // Will be refreshed
            displayLabel: ``, // Will be refreshed
            type: 'OR_GROUP',
            marks: section.marks_per_q,
            choices: [
                { label: ``, unit: 'Auto', qType: 'NORMAL', bloom: 'ANY', hasSubQuestions: false, marks: section.marks_per_q, marks_a: Number((section.marks_per_q/2).toFixed(1)), marks_b: Number((section.marks_per_q/2).toFixed(1)) },
                { label: ``, unit: 'Auto', qType: 'NORMAL', bloom: 'ANY', hasSubQuestions: false, marks: section.marks_per_q, marks_a: Number((section.marks_per_q/2).toFixed(1)), marks_b: Number((section.marks_per_q/2).toFixed(1)) }
            ]
        });
        refreshLabels();
    }

    function removeSlot(section: any, slotId: string) {
        section.slots = section.slots.filter((s: any) => s.id !== slotId);
        refreshLabels();
    }

    function addSection() {
        const char = String.fromCharCode(65 + paperStructure.length); // Next char
        paperStructure.push({
            title: `SECTION ${char}`,
            part: char,
            answered_count: 5,
            marks_per_q: 2,
            slots: []
        });
        paperStructure = [...paperStructure];
    }

    // Wizard Navigation
    function nextStep() { 
        if (currentStep === 1 && (!selectedUniversityId || !selectedBatchId)) return;
        if (currentStep === 2 && (!selectedBranchId || !selectedSemester)) return;
        if (currentStep === 3 && (!selectedSubjectId || selectedUnitIds.length === 0)) {
            return alert('Select a Subject and at least one unit');
        }
        if (currentStep === 3) {
            initializeStructure(); // Only initializes if empty
        }
        if (currentStep < 6) currentStep++; 
    }
    function prevStep() { if (currentStep > 1) currentStep--; }

    $effect(() => {
        if (data.selectedUniversityId && !selectedUniversityId) {
            selectedUniversityId = data.selectedUniversityId;
        }
    });

    $effect(() => {
        if (data.selectedBatchId && !selectedBatchId) {
            selectedBatchId = data.selectedBatchId;
        }
    });

    $effect(() => {
        if (data.selectedBranchId && !selectedBranchId) {
            selectedBranchId = data.selectedBranchId;
        }
    });

    $effect(() => {
        if (selectedUniversityId) {
            // Assuming fetchBatches() is defined elsewhere or will be added.
            // For this specific change, we only focus on fetchTemplates.
            fetchTemplates();
        }
    });

    $effect(() => {
        if (selectedSubjectId) {
            fetchTopics();
            const sub = data.subjects.find(s => s.id === selectedSubjectId);
            if (sub) courseCodeManual = sub.code || '';
        }
    });

    // Absolute Template Enforcement for Chaitanya
    const isChaitanya = $derived(
        activeUniversity?.name?.toLowerCase()?.includes('chaitanya') || 
        selectedUniversityId === '8e5403f9-505a-44d4-add4-aae3efaa9248' ||
        (typeof window !== 'undefined' && window.location.search.toLowerCase().includes('8e5403f9'))
    );
    const isCrescent = $derived(activeUniversity?.name?.toLowerCase()?.includes('crescent'));
    
    $effect(() => {
        if (isChaitanya) {
            selectedTemplate = 'cdu';
            maxMarks = 20; 
            examDuration = 90;
        } else if (isCrescent) {
            selectedTemplate = 'crescent';
            maxMarks = 50;
            examDuration = 90;
        } else {
            selectedTemplate = 'standard'; // Final fallback template
        }
    });

    // Determine the user-facing label for the "Standard" mode
    let universityLabel = $derived(isChaitanya ? 'Chaitanya (CDU)' : (isCrescent ? 'Crescent (IST)' : 'University Standard'));

    let previewPaperMeta = $state<any>({ 
        paper_date: '',
        duration_minutes: '90',
        max_marks: '50',
        course_code: 'CS-XXXX',
        exam_title: 'SEMESTER END EXAMINATIONS - NOV/DEC 2025',
        programme: 'B.Tech CSE',
        semester: '1',
        instructions: 'ANSWER ALL QUESTIONS',
        subject_name: 'Subject Name',
        univ_line_1: 'UNIVERSITY',
        univ_line_2: '',
        colWidths: { sno: 40 }
    });
    let previewSetData = $state({ questions: [] });

    $effect(() => {
        previewPaperMeta.paper_date = examDate;
        previewPaperMeta.duration_minutes = String(examDuration);
        previewPaperMeta.max_marks = String(maxMarks);
        previewPaperMeta.course_code = courseCodeManual || activeSubject?.code || 'CS-XXXX';
        previewPaperMeta.exam_title = examTitleHeader;
        previewPaperMeta.programme = activeBranch?.name || 'B.Tech CSE';
        previewPaperMeta.semester = String(selectedSemester);
        previewPaperMeta.instructions = paperInstructions;
        previewPaperMeta.subject_name = activeSubject?.name || 'Subject Name';
        previewPaperMeta.univ_line_1 = isChaitanya ? 'CHAITANYA DEEMED TO BE UNIVERSITY' : (isCrescent ? 'BS ABDUR RAHMAN' : 'UNIVERSITY');
        previewPaperMeta.univ_line_1_2 = isCrescent ? 'CRESCENT INSTITUTE OF SCIENCE & TECHNOLOGY' : '';
        previewPaperMeta.univ_line_2 = isChaitanya ? 'KISHANPURA, HANAMKONDA - 506001 (TS)' : (isCrescent ? 'Deemed to be University u/s 3 of the UGC Act, 1956' : '');
        previewPaperMeta.partA_title = previewPaperMeta.partA_title || 'PART A';
        previewPaperMeta.partB_title = previewPaperMeta.partB_title || 'PART B';
        previewPaperMeta.partC_title = previewPaperMeta.partC_title || 'PART C';
    });
</script>

<div class="max-w-6xl mx-auto space-y-8 pb-32">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
        <div class="flex items-center gap-6">
            <a 
                href="/assessments"
                class="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-100 dark:hover:border-indigo-900 transition-all active:scale-95"
                title="Back to Papers"
            >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
            </a>

            <div class="space-y-1">
                <div class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">
                    <div class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    Question Paper Engine
                </div>
                <h1 class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">Generate Assessment</h1>
            </div>
        </div>
    </div>

    <!-- Stepper (Wells Fargo Style) -->
    <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div class="relative flex justify-between">
            <div class="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 dark:bg-slate-800 -translate-y-1/2 z-0"></div>
            <div 
                class="absolute top-1/2 left-0 h-0.5 bg-indigo-600 -translate-y-1/2 z-0 transition-all duration-500"
                style="width: {(currentStep - 1) / (steps.length - 1) * 100}%"
            ></div>
            
            {#each steps as step, i}
                <div class="relative z-10 flex flex-col items-center">
                    <div 
                        class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 border-4
                        {currentStep > i + 1 ? 'bg-indigo-600 text-white border-indigo-600' : 
                         currentStep === i + 1 ? 'bg-white dark:bg-slate-900 text-indigo-600 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-900/20' : 
                         'bg-gray-50 dark:bg-slate-800 text-gray-300 dark:text-slate-600 border-gray-50 dark:border-slate-800'}"
                    >
                        {i + 1}
                    </div>
                    <span class="text-[10px] font-black uppercase tracking-widest mt-3 {currentStep === i + 1 ? 'text-indigo-600' : 'text-gray-400 dark:text-slate-500'}">{step}</span>
                </div>
            {/each}
        </div>
    </div>

    <!-- Step Content -->
    <div class="min-h-[500px]">
        {#if currentStep === 1}
            <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
                <div class="text-center">
                    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Institutional Context</h2>
                    <p class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Select the University and Academic Batch</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- University Selection -->
                    <div class="space-y-4">
                        <div class="flex items-center justify-between ml-1">
                            <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">University</h4>
                            <div class="relative min-w-[200px]">
                                <input 
                                    type="text" 
                                    bind:value={universitySearch}
                                    placeholder="Filter universities..."
                                    class="w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl px-4 py-2 text-[10px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                                <svg class="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {#each filteredUniversities as univ}
                                <button 
                                    onclick={() => {
                                        selectedUniversityId = univ.id;
                                        goto(`?universityId=${univ.id}${selectedBatchId ? `&batchId=${selectedBatchId}` : ''}`, { replaceState: true, noScroll: true });
                                    }}
                                    class="p-4 rounded-xl border-2 text-left transition-all
                                    {selectedUniversityId === univ.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-50 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                >
                                    <h4 class="text-[11px] font-black {selectedUniversityId === univ.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-200'}">{univ.name}</h4>
                                </button>
                            {:else}
                                <div class="p-8 border-2 border-dashed border-gray-50 dark:border-slate-800 rounded-2xl text-center text-gray-300 dark:text-slate-600 italic text-xs">
                                    No universities match your search.
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Batch Selection -->
                    <div class="space-y-4">
                        <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Academic Batch</h4>
                        <div class="grid grid-cols-1 gap-3">
                            {#each data.batches as batch}
                                <button 
                                    onclick={() => {
                                        selectedBatchId = batch.id;
                                        goto(`?universityId=${selectedUniversityId}&batchId=${batch.id}`, { replaceState: true, noScroll: true });
                                    }}
                                    class="p-5 rounded-2xl border-2 text-left transition-all
                                    {selectedBatchId === batch.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                >
                                    <h4 class="text-sm font-black {selectedBatchId === batch.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-200'}">{batch.name}</h4>
                                </button>
                            {:else}
                                <div class="p-8 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-3xl text-center text-gray-400 dark:text-slate-600 italic text-sm">
                                    No batches found for this university.
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        {:else if currentStep === 2}
             <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
                <div class="text-center">
                    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Department & Semester</h2>
                    <p class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Identify the stream and academic period</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Branch Selection -->
                    <div class="space-y-4">
                        <div class="flex items-center justify-between ml-1">
                            <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Branch / Department</h4>
                            <div class="relative min-w-[200px]">
                                <input 
                                    type="text" 
                                    bind:value={branchSearch}
                                    placeholder="Filter branches..."
                                    class="w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl px-4 py-2 text-[10px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                />
                                <svg class="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {#each filteredBranches as branch}
                                <button 
                                    onclick={() => { 
                                        selectedBranchId = branch.id;
                                        goto(`?universityId=${selectedUniversityId}&batchId=${selectedBatchId}&branchId=${branch.id}`, { replaceState: true, noScroll: true });
                                    }}
                                    class="p-4 rounded-xl border-2 text-left transition-all
                                    {selectedBranchId === branch.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-50 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                >
                                    <h4 class="text-[11px] font-black {selectedBranchId === branch.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-200'}">{branch.name}</h4>
                                    <span class="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{branch.code}</span>
                                </button>
                            {:else}
                                <div class="p-8 border-2 border-dashed border-gray-50 dark:border-slate-800 rounded-2xl text-center text-gray-300 dark:text-slate-600 italic text-xs">
                                    No branches match your search.
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- Semester Selection -->
                    <div class="space-y-4">
                        <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Semester</h4>
                        <div class="grid grid-cols-2 gap-3">
                            {#each [1,2,3,4,5,6,7,8] as sem}
                                <button 
                                    onclick={() => selectedSemester = sem}
                                    class="p-5 rounded-2xl border-2 text-center transition-all
                                    {selectedSemester === sem ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                >
                                    <h4 class="text-sm font-black {selectedSemester === sem ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-200'}">Sem {sem}</h4>
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        {:else if currentStep === 3}
            <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
                <div class="text-center">
                    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Question Bank Selection</h2>
                    <p class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Select the specific units for the assessment</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- Subject Selection -->
                    <div class="space-y-4">
                        <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Subject</h4>
                        <div class="grid grid-cols-1 gap-3">
                            {#each data.subjects.filter(s => s.semester === selectedSemester) as subject}
                                <button 
                                    onclick={() => selectedSubjectId = subject.id}
                                    class="p-5 rounded-2xl border-2 text-left transition-all
                                    {selectedSubjectId === subject.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                >
                                    <h4 class="text-sm font-black {selectedSubjectId === subject.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-200'}">{subject.name}</h4>
                                    <span class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{subject.code}</span>
                                </button>
                            {:else}
                                <p class="text-[10px] text-gray-400 dark:text-slate-500 font-bold italic text-center p-8 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">No subjects found for this semester.</p>
                            {/each}
                        </div>
                    </div>

                    <div class="lg:col-span-2 space-y-4">
                        <div class="flex flex-col gap-3">
                            <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Syllabus Coverage / Question Bank Units</h4>
                            <div class="flex flex-wrap gap-2">
                                <button onclick={selectAllUnits} class="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-lg border border-indigo-100 dark:border-indigo-800 uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">Full Syllabus</button>
                                {#each [1,2,3,4,5] as n}
                                    <button onclick={() => selectUpToUnit(n)} class="px-3 py-1.5 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-500 text-[10px] font-black rounded-lg border border-gray-100 dark:border-slate-800 uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all">Up to Unit {n}</button>
                                {/each}
                            </div>
                        </div>
                        
                        {#if isLoadingTopics}
                            <div class="p-20 flex justify-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800">
                                <div class="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                            </div>
                        {:else}
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {#each unitsWithTopics as unit}
                                    <button 
                                        onclick={() => toggleUnit(unit.id)}
                                        class="p-5 rounded-2xl border-2 text-left transition-all flex items-center justify-between
                                        {selectedUnitIds.includes(unit.id) ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                    >
                                        <div>
                                            <h4 class="text-[10px] font-black uppercase text-indigo-400 mb-1">Unit {unit.unit_number}</h4>
                                            <h3 class="text-xs font-black {selectedUnitIds.includes(unit.id) ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-slate-200'}">{unit.name}</h3>
                                        </div>
                                        <div class="w-6 h-6 rounded-lg border-2 flex items-center justify-center {selectedUnitIds.includes(unit.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 dark:border-slate-700'}">
                                            {#if selectedUnitIds.includes(unit.id)}
                                                <svg class="w-3" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"/></svg>
                                            {/if}
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Generation Strategy Choice -->
                <div class="mt-12 p-10 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2.5rem] border-2 border-dashed border-indigo-100 dark:border-indigo-800 flex flex-col items-center text-center space-y-6">
                    <div class="space-y-2">
                        <h3 class="text-xl font-black text-indigo-900 dark:text-indigo-400 tracking-tight">Generation Strategy</h3>
                        <p class="text-sm text-indigo-600 dark:text-indigo-300/70 font-bold max-w-lg">Standard logic distributes questions evenly. Modifiable mode allows you to specify exact units for each question position.</p>
                    </div>

                    <div class="flex bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-xl shadow-indigo-100/50 dark:shadow-indigo-950/50 border border-indigo-100 dark:border-indigo-800">
                        {#each ['Standard', 'Modifiable'] as mode}
                            <button 
                                onclick={() => {
                                    generationMode = mode;
                                    if (mode === 'Standard') initializeStructure(true);
                                }}
                                class="px-10 py-3 rounded-xl text-xs font-black transition-all uppercase tracking-widest
                                {generationMode === mode ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}"
                            >{mode}</button>
                        {/each}
                    </div>

                    <div class="flex flex-col items-center gap-3">
                        <span class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Part A Question Type</span>
                        <div class="flex bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-indigo-100 dark:border-indigo-800 shadow-sm">
                            {#each ['Normal', 'MCQ', 'Mixed'] as type}
                                <button 
                                    onclick={() => {
                                        partAType = type;
                                        if (generationMode === 'Modifiable') initializeStructure();
                                    }}
                                    class="px-6 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest
                                    {partAType === type ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
                                >{type}</button>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        {:else if currentStep === 4}
            {#if generationMode === 'Standard'}
                <div class="flex flex-col items-center justify-center space-y-6 py-20" in:fly={{ y: 20, duration: 400 }}>
                    <div class="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    </div>
                    <div class="text-center">
                        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Standard Distribution</h2>
                        <p class="text-sm text-gray-400 dark:text-slate-500 font-bold mt-2">Questions will be distributed evenly across all selected units.</p>
                    </div>
                    <button onclick={() => currentStep++} class="px-8 py-3 bg-indigo-600 text-white text-xs font-black rounded-xl uppercase tracking-widest shadow-xl shadow-indigo-100">Proceed to Preview</button>
                </div>
            {:else}
                <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
                    <div class="text-center">
                        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Paper Structure Configuration</h2>
                        <p class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Assign units and sub-question requirements for each position</p>
                    </div>

                    <div class="space-y-12">
                        {#each paperStructure as section}
                            <div class="space-y-4">
                                <div class="flex items-center justify-between gap-4 px-2">
                                    <h3 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-4 flex-1">
                                        {section.title}
                                        <div class="h-px flex-1 bg-gray-100 dark:bg-slate-800"></div>
                                    </h3>
                                    
                                    <div class="flex items-center gap-6">
                                        <div class="flex items-center gap-2">
                                            <span class="text-[9px] font-black text-gray-400 uppercase">Answer</span>
                                            <input 
                                                type="number" 
                                                bind:value={section.answered_count}
                                                class="w-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-1.5 text-[10px] font-black text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500/20"
                                            />
                                            <span class="text-[9px] font-black text-gray-400 uppercase">X</span>
                                            <input 
                                                type="number" 
                                                bind:value={section.marks_per_q}
                                                class="w-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-1.5 text-[10px] font-black text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500/20"
                                            />
                                            <span class="text-[9px] font-black text-gray-400 uppercase">Marks</span>
                                        </div>

                                         <div class="flex items-center gap-2">
                                            <button 
                                                onclick={() => initializeStructure(true)}
                                                class="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                            >Reset to Defaults</button>
                                            <button 
                                                onclick={() => addSingleSlot(section)}
                                                class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                            >+ Single Q</button>
                                            <button 
                                                onclick={() => addOrGroup(section)}
                                                class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                            >+ OR Pair</button>
                                        </div>
                                    </div>

                                    {#if generationMode === 'Modifiable'}
                                        <div class="flex justify-end mb-2 pr-2">
                                            <button 
                                                onclick={saveAsTemplate}
                                                class="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
                                            >
                                                <svg class="w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                                                Save Format as Repository Template
                                            </button>
                                        </div>
                                    {/if}
                                </div>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {#each section.slots as slot}
                                        {#if slot.type === 'SINGLE'}
                                            <div class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] shadow-sm hover:shadow-md transition-all space-y-4 relative group">
                                                <button 
                                                    onclick={() => removeSlot(section, slot.id)}
                                                    class="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-lg"
                                                    aria-label="Remove Slot"
                                                >
                                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>

                                                <div class="flex items-center justify-between">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">
                                                            {slot.label}
                                                        </div>
                                                        <div class="flex flex-col">
                                                            <div class="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                                                Question {slot.label}
                                                            </div>
                                                            <div class="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">
                                                                {slot.marks} Marks
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="space-y-4 pt-2">
                                                    <div class="space-y-2">
                                                        <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Question Category</div>
                                                        <select 
                                                            bind:value={slot.qType}
                                                            class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl p-2 text-[10px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        >
                                                            <option value="ANY" class="dark:bg-slate-800">Any Category</option>
                                                            <option value="NORMAL" class="dark:bg-slate-800">Normal</option>
                                                            <option value="SHORT" class="dark:bg-slate-800">Short</option>
                                                            <option value="LONG" class="dark:bg-slate-800">Long</option>
                                                            <option value="MCQ" class="dark:bg-slate-800">MCQ</option>
                                                            <option value="FILL_IN_BLANK" class="dark:bg-slate-800">Fill in Blanks</option>
                                                            <option value="PARAGRAPH" class="dark:bg-slate-800">Paragraph</option>
                                                        </select>
                                                    </div>

                                                    <div class="space-y-2">
                                                        <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Bloom's Level</div>
                                                        <div class="flex gap-1">
                                                            {#each ['ANY', 'L1', 'L2', 'L3'] as level}
                                                                <button 
                                                                    onclick={() => slot.bloom = level}
                                                                    class="flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                    {slot.bloom === level ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700'}"
                                                                >{level}</button>
                                                            {/each}
                                                        </div>
                                                    </div>

                                                    <div class="space-y-2">
                                                        <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Course Outcome</div>
                                                        <select 
                                                            bind:value={slot.co_id}
                                                            class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl p-2 text-[10px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        >
                                                            <option value={null} class="dark:bg-slate-800">Any CO</option>
                                                            {#each courseOutcomes as co}
                                                                <option value={co.id} class="dark:bg-slate-800">{co.code}</option>
                                                            {/each}
                                                        </select>
                                                    </div>

                                                    <div class="space-y-2">
                                                        <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Unit</div>
                                                        <div class="grid grid-cols-3 gap-1">
                                                            <button 
                                                                onclick={() => slot.unit = 'Auto'}
                                                                class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                {slot.unit === 'Auto' ? 'bg-slate-900 border-slate-900 dark:bg-indigo-500 dark:border-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'}"
                                                            >Auto</button>
                                                            {#each unitsWithTopics.filter(u => selectedUnitIds.includes(u.id)) as unit}
                                                                <button 
                                                                    onclick={() => slot.unit = unit.id}
                                                                    class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                    {slot.unit === unit.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-900'}"
                                                                >U{unit.unit_number}</button>
                                                            {/each}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        {:else}
                                            <!-- OR GROUP CARD -->
                                            <div class="p-6 bg-indigo-50/30 border border-indigo-100/50 rounded-[2.5rem] shadow-sm space-y-6 md:col-span-2 lg:col-span-3 relative group">
                                                <button 
                                                    onclick={() => removeSlot(section, slot.id)}
                                                    class="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-lg z-10"
                                                    aria-label="Remove Slot"
                                                >
                                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>

                                                <div class="flex items-center gap-4">
                                                    <div class="px-6 py-2 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 dark:shadow-indigo-950">
                                                        {slot.displayLabel}
                                                    </div>
                                                    <div class="h-px flex-1 bg-indigo-100 dark:bg-slate-800"></div>
                                                </div>

                                                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    {#each slot.choices as choice, idx}
                                                        <div class="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-white dark:border-slate-800 shadow-sm space-y-5">
                                                            <div class="flex items-center justify-between">
                                                                <div class="flex items-center gap-3">
                                                                    <div class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">
                                                                        {choice.label}
                                                                    </div>
                                                                    <div class="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                                                        {choice.marks} Marks
                                                                    </div>
                                                                </div>
                                                                
                                                                <button 
                                                                    onclick={() => choice.hasSubQuestions = !choice.hasSubQuestions}
                                                                    class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all
                                                                    {choice.hasSubQuestions ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-100 dark:border-slate-800 opacity-50'}"
                                                                >
                                                                    Sub-Qs (a,b)
                                                                </button>
                                                            </div>

                                                            {#if choice.hasSubQuestions}
                                                                <div class="grid grid-cols-2 gap-4 bg-amber-50/50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100/50 dark:border-amber-800/50" transition:slide>
                                                                    <div class="space-y-1">
                                                                        <span class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1">Marks (a)</span>
                                                                        <input 
                                                                            type="number" 
                                                                            step="0.5"
                                                                            bind:value={choice.marks_a} 
                                                                            class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm"
                                                                        />
                                                                    </div>
                                                                    <div class="space-y-1">
                                                                        <span class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1">Marks (b)</span>
                                                                        <input 
                                                                            type="number" 
                                                                            step="0.5"
                                                                            bind:value={choice.marks_b} 
                                                                            class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm"
                                                                        />
                                                                    </div>
                                                                    {#if (choice.marks_a + choice.marks_b) !== choice.marks}
                                                                        <div class="col-span-2 text-[9px] font-black text-red-500 bg-red-50 dark:bg-red-900/10 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/30 flex items-center gap-2">
                                                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                                                            Total must be {choice.marks} marks
                                                                        </div>
                                                                    {/if}
                                                                </div>
                                                            {/if}

                                                            <div class="grid grid-cols-2 gap-4">
                                                                <div class="space-y-2">
                                                                    <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</div>
                                                                     <select 
                                                                         bind:value={choice.qType}
                                                                         class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg p-1.5 text-[9px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                                                                     >
                                                                         <option value="NORMAL" class="dark:bg-slate-800">Normal</option>
                                                                         <option value="VERY_SHORT" class="dark:bg-slate-800">Very Short</option>
                                                                         <option value="SHORT" class="dark:bg-slate-800">Short</option>
                                                                         <option value="LONG" class="dark:bg-slate-800">Long</option>
                                                                         <option value="VERY_LONG" class="dark:bg-slate-800">Very Long</option>
                                                                         <option value="MCQ" class="dark:bg-slate-800">MCQ</option>
                                                                         <option value="FILL_IN_BLANK" class="dark:bg-slate-800">Fill in Blanks</option>
                                                                         <option value="PARAGRAPH" class="dark:bg-slate-800">Paragraph</option>
                                                                     </select>
                                                                </div>
                                                                <div class="space-y-2">
                                                                    <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Bloom's Level</div>
                                                                    <div class="flex gap-1">
                                                                        {#each ['ANY', 'L1', 'L2', 'L3'] as level}
                                                                            <button 
                                                                                onclick={() => choice.bloom = level}
                                                                                class="flex-1 py-1 px-1 rounded-lg text-[9px] font-black border transition-all
                                                                                {choice.bloom === level ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700'}"
                                                                            >{level}</button>
                                                                        {/each}
                                                                    </div>
                                                                </div>
                                                                <div class="space-y-2">
                                                                    <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">CO</div>
                                                                    <select 
                                                                        bind:value={choice.co_id}
                                                                        class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg p-1.5 text-[9px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                                                                    >
                                                                        <option value={null} class="dark:bg-slate-800">Any</option>
                                                                        {#each courseOutcomes as co}
                                                                            <option value={co.id} class="dark:bg-slate-800">{co.code}</option>
                                                                        {/each}
                                                                    </select>
                                                                </div>
                                                                <div class="space-y-2">
                                                                    <div class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit</div>
                                                                    <div class="grid grid-cols-3 gap-1">
                                                                        <button 
                                                                            onclick={() => choice.unit = 'Auto'}
                                                                            class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                            {choice.unit === 'Auto' ? 'bg-slate-900 border-slate-900 dark:bg-indigo-500 dark:border-indigo-500 text-white' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'}"
                                                                        >Auto</button>
                                                                        {#each unitsWithTopics.filter(u => selectedUnitIds.includes(u.id)) as unit}
                                                                            <button 
                                                                                onclick={() => choice.unit = unit.id}
                                                                                class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                                {choice.unit === unit.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-900'}"
                                                                            >U{unit.unit_number}</button>
                                                                        {/each}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {#if idx === 0}
                                                            <div class="lg:hidden flex items-center justify-center -my-3">
                                                                <div class="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm">OR</div>
                                                            </div>
                                                        {/if}
                                                    {/each}
                                                </div>
                                            </div>
                                        {/if}
                                    {/each}
                                </div>
                            </div>
                        {/each}
                        <div class="pt-8 border-t border-indigo-100 dark:border-slate-800 flex justify-center">
                            <button 
                                onclick={addSection}
                                class="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95 flex items-center gap-3"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/></svg>
                                Add Another Section
                            </button>
                        </div>
                    </div>
                </div>
            {/if}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-12" in:fly={{ y: 20, duration: 400 }}>
                <!-- Configuration Form -->
                <div class="space-y-8">
                    <div>
                        <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Metadata & Template</h2>
                        <p class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Fine-tune the output presentation</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-2">
                            <label for="exam-date" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Examination Date</label>
                            <input id="exam-date" type="date" bind:value={examDate} class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                        </div>
                        <div class="space-y-2">
                            <label for="exam-time" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Start Time</label>
                            <input id="exam-time" type="text" bind:value={examTime} placeholder="e.g. 10:00 AM" class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                        </div>
                        <div class="space-y-2">
                            <label for="exam-duration" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Duration (Mins)</label>
                            <input id="exam-duration" type="number" bind:value={examDuration} class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                        </div>
                        <div class="space-y-2">
                            <label for="max-marks" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Max Marks</label>
                            <input id="max-marks" type="number" bind:value={maxMarks} class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                        </div>
                        <div class="space-y-2 md:col-span-2">
                            <label for="course-override" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Course Code Override</label>
                            <input id="course-override" type="text" bind:value={courseCodeManual} placeholder={activeSubject?.code || 'CS-XXXX'} class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm uppercase placeholder:text-gray-300 dark:placeholder:text-slate-700" />
                        </div>
                        <div class="space-y-2 md:col-span-2">
                            <label for="exam-title" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Exam Title Header</label>
                            <input id="exam-title" type="text" bind:value={examTitleHeader} class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                        </div>
                        <div class="space-y-2 md:col-span-2">
                            <label for="instructions" class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Paper Instructions</label>
                            <input id="instructions" type="text" bind:value={paperInstructions} class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                        </div>
                    </div>

                    <div class="space-y-4">
                        <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1">Load Saved Format</h4>
                        <select 
                            onchange={(e: any) => applyTemplate(e.target.value)}
                            class="w-full bg-white dark:bg-slate-900 border-2 border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        >
                            <option value="" class="dark:bg-slate-800">-- Select a Format --</option>
                            {#each availableTemplates as template}
                                <option value={template.id} class="dark:bg-slate-800">{template.name} ({template.exam_type})</option>
                            {/each}
                        </select>
                    </div>

                    <div class="space-y-4">
                        <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Assessment Type</h4>
                        <div class="grid grid-cols-2 gap-3">
                            {#each ['MID1', 'MID2', 'SEM', 'INTERNAL_LAB', 'EXTERNAL_LAB'] as type}
                                <button 
                                    onclick={() => selectedExamType = type}
                                    class="p-4 rounded-xl border-2 text-[10px] font-black uppercase transition-all
                                    {selectedExamType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-indigo-950' : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-400 dark:text-slate-500 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                                >{type.replace('_', ' ')}</button>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Template Preview (Crescent Style) -->
                <div class="bg-gray-900 dark:bg-slate-950 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col">
                    <div class="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 blur-[60px] rounded-full"></div>
                    <div class="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/10 blur-[60px] rounded-full"></div>

                    <div class="flex-1 w-full overflow-y-auto overflow-x-hidden max-h-[650px] bg-slate-100/30 dark:bg-slate-900/50 rounded-[2rem] p-6 border border-indigo-100/20 custom-scrollbar">
                        <div class="scale-100 origin-top w-full mx-auto shadow-2xl">
                            <div class="mb-4 flex gap-2 justify-center">
                                <div class="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A9 9 0 112.182 17.82L3 21l3.18-.818A8.966 8.966 0 0012 21a9 9 0 008.94-6.94l1.1-3.32z"/></svg>
                                    Format: {universityLabel}
                                </div>
                            </div>

                            {#if selectedTemplate === 'cdu'}
                                <CDUTemplate 
                                    paperMeta={previewPaperMeta}
                                    paperStructure={paperStructure}
                                    currentSetData={previewSetData} 
                                    {courseOutcomes}
                                    mode="preview"
                                />
                            {:else if selectedTemplate === 'crescent'}
                                <CrescentTemplate 
                                    paperMeta={previewPaperMeta}
                                    paperStructure={paperStructure}
                                    currentSetData={previewSetData}
                                    {courseOutcomes}
                                    mode="preview"
                                />
                            {:else}
                                <StandardTemplate 
                                    paperMeta={previewPaperMeta}
                                    paperStructure={paperStructure}
                                    currentSetData={previewSetData}
                                    {courseOutcomes}
                                    mode="preview"
                                />
                            {/if}
                        </div>
                    </div>
                    
                    <div class="mt-4 flex flex-col items-center gap-2">
                        <div class="text-[10px] text-indigo-300 font-black uppercase tracking-widest">University Template Preview</div>
                        
                        {#if poolDeficiency().length > 0}
                            <div class="mt-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-left w-full" in:slide>
                                <div class="flex items-center gap-2 text-red-400 font-black text-[10px] uppercase tracking-widest mb-2">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                    Insufficient Questions Found
                                </div>
                                <ul class="space-y-1">
                                    {#each poolDeficiency() as deficiency}
                                        <li class="text-[10px] text-gray-400 dark:text-slate-500 font-bold">
                                            Need <span class="text-white dark:text-slate-200">{deficiency.needs}</span> questions of <span class="text-indigo-400">{deficiency.marks} Marks</span>, but only found <span class="text-red-400">{deficiency.has}</span>.
                                        </li>
                                    {/each}
                                </ul>
                                <p class="text-[9px] text-gray-500 dark:text-slate-600 mt-2 font-medium">Please select more units or adjust Max Marks to resolve the deficiency.</p>
                            </div>
                        {:else}
                             <div class="mt-2 flex items-center gap-2 text-green-400 font-black text-[10px] uppercase tracking-widest" in:fade>
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                Question Pool Sufficient
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {:else if currentStep === 5}
            <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
                <div class="text-center">
                    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Set Configuration</h2>
                    <p class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Assign difficulty profiles for each paper set</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {#each ['A', 'B', 'C', 'D'] as setName}
                        <div class="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm space-y-6">
                            <div class="flex items-center justify-between">
                                <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg">
                                    {setName}
                                </div>
                                <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Set {setName}</span>
                            </div>

                            <div class="space-y-4">
                                <h4 class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Quick Profile</h4>
                                <div class="grid grid-cols-2 gap-2">
                                     {#each [
                                         { name: 'Easy', levels: ['L1', 'L2'] },
                                         { name: 'Medium', levels: ['L2', 'L3'] },
                                         { name: 'Hard', levels: ['L3', 'L4'] },
                                         { name: 'Mixed', levels: ['L1', 'L2', 'L3'] }
                                     ] as profile}
                                         <button 
                                             onclick={() => setsConfig[setName] = [...profile.levels]}
                                             class="px-3 py-2 rounded-xl border border-gray-100 dark:border-slate-800 text-[9px] font-black uppercase text-gray-500 hover:border-indigo-500 hover:text-indigo-600 transition-all text-center"
                                         >
                                             {profile.name}
                                         </button>
                                     {/each}
                                </div>
                            </div>

                            <div class="space-y-4">
                                <h4 class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Difficulty Levels</h4>
                                <div class="flex flex-col gap-2">
                                    {#each (activeSubject?.difficulty_levels || ['L1', 'L2', 'L3', 'L4', 'L5']) as level}
                                        <button 
                                            onclick={() => {
                                                if (setsConfig[setName].includes(level)) {
                                                    setsConfig[setName] = setsConfig[setName].filter(l => l !== level);
                                                } else {
                                                    setsConfig[setName] = [...setsConfig[setName], level];
                                                }
                                                // Ensure at least one level is selected or "ANY"
                                                if (setsConfig[setName].length === 0) setsConfig[setName] = ['ANY'];
                                                else if (setsConfig[setName].includes('ANY') && setsConfig[setName].length > 1) {
                                                    setsConfig[setName] = setsConfig[setName].filter(l => l !== 'ANY');
                                                }
                                            }}
                                            class="flex items-center justify-between p-3 rounded-xl border-2 transition-all
                                            {setsConfig[setName].includes(level) ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-slate-800/50 border-transparent hover:border-gray-200 dark:hover:border-slate-700'}"
                                        >
                                            <span class="text-[10px] font-black {setsConfig[setName].includes(level) ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500'}">{level}</span>
                                            {#if setsConfig[setName].includes(level)}
                                                <svg class="w-3 h-3 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                            {/if}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {:else if currentStep === 6}
            <div class="flex flex-col items-center justify-center py-20 space-y-8" in:fly={{ y: 20, duration: 400 }}>
                <div class="w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2.5rem] flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-pulse relative">
                     <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.022.547l-2.387 2.387a2 2 0 001.414 3.414h15.828a2 2 0 001.414-3.414l-2.387-2.387zM12 9V3m0 0l-3 3m3-3l3 3"/></svg>
                     <div class="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg">READY</div>
                </div>

                <div class="text-center max-w-md">
                    <h2 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Generate Question Sets</h2>
                    <p class="text-sm text-gray-500 dark:text-slate-500 font-medium mt-2">The AI algorithm will create 4 unique sets (A, B, C, D) using questions from the {selectedUnitIds.length} selected units, ensuring variety and coverage.</p>
                </div>

                <div class="flex gap-4">
                        <button 
                            onclick={generateSets}
                            disabled={isGenerating}
                            class="px-10 py-4 bg-indigo-600 text-white text-sm font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-indigo-950/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                        >
                        {#if isGenerating}
                            <svg class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            GENERATING SETS...
                        {:else}
                            GENERATE ALL 4 SETS
                        {/if}
                    </button>
                </div>
            </div>
        {/if}
    </div>

    <!-- Navigation Buttons -->
    <div class="flex justify-between items-center pt-8 border-t border-gray-100">
        <button 
            onclick={prevStep}
            disabled={currentStep === 1}
            class="px-8 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-400 dark:text-slate-500 text-sm font-black rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
        >BACK</button>
        
        <button 
            onclick={nextStep}
            disabled={currentStep === 6}
            class="px-10 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40 uppercase tracking-widest active:scale-95 disabled:opacity-0"
        >CONTINUE</button>
    </div>
</div>

<style>
    :global(.tracking-widest) {
        letter-spacing: 0.15em;
    }

    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #e2e8f0;
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #cbd5e1;
    }
    input::-webkit-calendar-picker-indicator {
        filter: invert(0.5);
    }
</style>
