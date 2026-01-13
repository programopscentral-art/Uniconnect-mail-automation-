<script lang="ts">
    import { page } from '$app/stores';
    import { slide, fade } from 'svelte/transition';
    import { invalidateAll } from '$app/navigation';

    let { data } = $props();

    let showAddQuestion = $state(false);
    let showBulkAdd = $state(false);
    let bulkQuestionsText = $state('');
    
    let levels = $derived(data.topic?.difficulty_levels || ['L1', 'L2', 'L3']);
    let questions = $derived(data.questions || []);
    let courseOutcomes = $derived(data.courseOutcomes || []);
    
    let editingQuestionId = $state<string | null>(null);
    let newQuestionText = $state('');
    let newBloomLevel = $state('');
    let newMarks = $state(2);
    let newAnswerKey = $state('');
    let selectedCOId = $state<string | null>(null);
    let newIsImportant = $state(false);

    let bulkCount = $derived(bulkQuestionsText.match(/(?:^|\n|\r\n)\s*(?:[Qq](?:uestion)?\s*\d*[:\s.-]+|\d+[\s.:-]+)/gi)?.length || 0);

    // Helpers for Visual Editor (contenteditable)
    function mdToHtml(md: string) {
        if (!md) return '';
        
        // 1. Convert Images
        let html = md.replace(/!\[image\]\((data:image\/[^)]+)\)/g, '<img src="$1" class="max-h-32 rounded-lg my-2 border border-gray-100 shadow-sm" />');
        
        // 2. Convert Tables (Pipe Tables)
        // Detect blocks that look like | col1 | col2 | ...
        const lines = html.split('\n');
        let inTable = false;
        let tableHtml = '';
        let processedLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|') && line.endsWith('|')) {
                if (!inTable) {
                    inTable = true;
                    tableHtml = '<div class="table-container my-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md"><table class="w-full text-xs text-left border-collapse bg-white">';
                }
                
                const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                
                // Check for separator line |---|---|
                if (line.includes('---')) {
                    // Skip separator line
                    continue;
                }

                // If first row after starting table, use <thead>
                if (tableHtml.endsWith('bg-white">')) {
                    tableHtml += '<thead class="bg-gray-50/80 border-b border-gray-100"><tr class="divide-x divide-gray-100 font-black text-indigo-600 uppercase tracking-widest">';
                    cells.forEach(c => tableHtml += `<th class="p-3">${c.trim()}</th>`);
                    tableHtml += '</tr></thead><tbody class="divide-y divide-gray-50">';
                } else {
                    tableHtml += '<tr class="divide-x divide-gray-50 hover:bg-gray-50/50 transition-colors">';
                    cells.forEach(c => tableHtml += `<td class="p-3 text-gray-600 font-medium">${c.trim()}</td>`);
                    tableHtml += '</tr>';
                }
            } else {
                if (inTable) {
                    inTable = false;
                    tableHtml += '</tbody></table></div>';
                    processedLines.push(tableHtml);
                    tableHtml = '';
                }
                processedLines.push(lines[i]);
            }
        }
        if (inTable) {
            tableHtml += '</tbody></table></div>';
            processedLines.push(tableHtml);
        }

        return processedLines.join('\n');
    }

    function htmlToMd(el: HTMLElement) {
        const temp = el.cloneNode(true) as HTMLElement;
        
        // 1. Process Tables
        const tables = temp.querySelectorAll('table');
        tables.forEach(table => {
            let mdTable = '\n';
            const rows = table.querySelectorAll('tr');
            rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('th, td');
                mdTable += '| ' + Array.from(cells).map(c => (c as HTMLElement).innerText.trim()).join(' | ') + ' |\n';
                if (rowIndex === 0) {
                    mdTable += '| ' + Array.from(cells).map(() => '---').join(' | ') + ' |\n';
                }
            });
            table.replaceWith(document.createTextNode(mdTable + '\n'));
        });

        // 2. Process Images
        const imgs = temp.querySelectorAll('img');
        imgs.forEach(img => {
            const src = img.getAttribute('src');
            if (src?.startsWith('data:image')) {
                img.replaceWith(document.createTextNode(`\n![image](${src})\n`));
            }
        });

        return temp.innerText.trim();
    }

    // Action to initialize contenteditable without reactive loops
    function setupEditor(node: HTMLElement, content: string) {
        node.innerHTML = mdToHtml(content);
        return {
            update(newContent: string) {
                // If content is suddenly empty or heavily changed (from outside), sync it
                // But avoid syncing if the editor is just being typed in
                const currentMd = htmlToMd(node);
                if (newContent !== currentMd && (newContent === '' || Math.abs(newContent.length - currentMd.length) > 50)) {
                    node.innerHTML = mdToHtml(newContent);
                }
            }
        };
    }

    async function handlePaste(e: ClipboardEvent, target: 'question' | 'answer' | 'bulk') {
        const items = e.clipboardData?.items;
        if (!items) return;

        const targetEl = e.currentTarget as HTMLElement;
        const htmlData = e.clipboardData?.getData('text/html');

        // Priority 1: Handle HTML Tables/Structured content from clipboard
        if (htmlData && htmlData.includes('<table')) {
            e.preventDefault();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlData;
            
            // Clean up the HTML (remove classes/styles that might break our UI)
            const tables = tempDiv.querySelectorAll('table');
            tables.forEach(table => {
                table.className = "w-full text-xs text-left border-collapse bg-white";
                table.querySelectorAll('tr').forEach(tr => {
                    tr.className = "divide-x divide-gray-50 border-b border-gray-50";
                });
                table.querySelectorAll('th, td').forEach(cell => {
                    cell.className = "p-3 font-medium text-gray-600";
                    // If it was a header, give it a better style
                    if (cell.tagName === 'TH') {
                        cell.className = "p-3 font-black text-indigo-600 uppercase tracking-widest bg-gray-50/80";
                    }
                });
                
                // Wrap table for styling
                const wrapper = document.createElement('div');
                wrapper.className = "table-container my-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm";
                table.parentNode?.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            });

            // Insert at cursor
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                
                // Filter out non-table content if user just wanted the table
                // Or just insert the whole cleaned HTML
                const fragment = document.createDocumentFragment();
                while (tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild);
                }
                range.insertNode(fragment);
            }

            // Sync
            const md = htmlToMd(targetEl);
            if (target === 'question') newQuestionText = md;
            else if (target === 'answer') newAnswerKey = md;
            else if (target === 'bulk') bulkQuestionsText = md;
            return;
        }

        // Priority 2: Handle Images
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target?.result as string;
                    
                    // 1. Create Image element for visual feedback
                    const img = document.createElement('img');
                    img.src = base64;
                    img.className = "max-h-32 rounded-lg my-2 border border-blue-200 shadow-md ring-4 ring-blue-50";
                    
                    // 2. Insert at cursor
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(img);
                        
                        // Move cursor after image
                        range.setStartAfter(img);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        targetEl.appendChild(img);
                    }

                    // 3. Sync back to markdown state
                    const md = htmlToMd(targetEl);
                    if (target === 'question') newQuestionText = md;
                    else if (target === 'answer') newAnswerKey = md;
                    else if (target === 'bulk') bulkQuestionsText = md;
                };
                reader.readAsDataURL(file);
            }
        }
    }

    function handleInput(e: Event, target: 'question' | 'answer' | 'bulk') {
        const el = e.currentTarget as HTMLElement;
        const md = htmlToMd(el);
        if (target === 'question') newQuestionText = md;
        else if (target === 'answer') newAnswerKey = md;
        else if (target === 'bulk') bulkQuestionsText = md;
    }

    // Set default level when levels change
    $effect(() => {
        if (!newBloomLevel && levels.length > 0) {
            newBloomLevel = levels[0];
        }
    });

    function startEdit(q: any) {
        showAddQuestion = false; // Close top form if open
        editingQuestionId = q.id;
        newQuestionText = q.question_text;
        newBloomLevel = q.bloom_level;
        newMarks = q.marks;
        newAnswerKey = q.answer_key || '';
        selectedCOId = q.co_id || null;
        newIsImportant = q.is_important || false;
    }

    function resetForm() {
        editingQuestionId = null;
        newQuestionText = '';
        newBloomLevel = levels[0] || '';
        newMarks = 2;
        newAnswerKey = '';
        selectedCOId = null;
        newIsImportant = false;
    }

    async function handleBulkAdd() {
        if (!bulkQuestionsText) return;
        
        // Robust split: Handles Q1:, Question 1:, 1., etc. at the start of blocks
        // We look for markers at the start of lines.
        const blocks = bulkQuestionsText.trim()
            .split(/(?:\n|\r\n)\s*(?=[Qq](?:uestion)?\s*\d*[:\s.-]+|\d+[\s.:-]+)/i)
            .map(b => b.trim())
            .filter(b => b.length > 5);
        
        let count = 0;
        for (const block of blocks) {
            // Remove leading question marker (e.g., Q1:, Question 1:, 1.)
            const cleanBlock = block.replace(/^(?:[Qq](?:uestion)?\s*\d*[:\s.-]+|\d+[\s.:-]+)+/i, '').trim();
            
            // Split Question and Answer (Robust)
            // Look for "Ans:", "Answer:", "Ans -", etc.
            const parts = cleanBlock.split(/(?:\n|\r\n)\s*(?:A|Ans|Answer)[:\s.-]+/i);
            const qContent = parts[0].trim();
            const aContent = parts.length > 1 ? parts.slice(1).join('\n').trim() : '';
            
            if (!qContent) continue;

            const res = await fetch('/api/assessments/questions', {
                method: 'POST',
                body: JSON.stringify({ 
                    topic_id: data.topic.id,
                    question_text: qContent,
                    bloom_level: newBloomLevel || levels[0],
                    marks: newMarks,
                    answer_key: aContent,
                    is_important: false
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) count++;
            else {
                const err = await res.json();
                console.error('Bulk add error:', err);
            }
        }
        
        bulkQuestionsText = '';
        showBulkAdd = false;
        await invalidateAll();
        if (count > 0) alert(`${count} questions imported successfully!`);
        else alert('No questions were imported. Please check the format.');
    }

    async function saveQuestion() {
        if (!newQuestionText || !data.topic.id) return;
        
        const res = await fetch('/api/assessments/questions', {
            method: editingQuestionId ? 'PATCH' : 'POST',
            body: JSON.stringify({ 
                id: editingQuestionId,
                topic_id: data.topic.id,
                co_id: selectedCOId,
                question_text: newQuestionText,
                bloom_level: newBloomLevel,
                marks: newMarks,
                answer_key: newAnswerKey,
                is_important: newIsImportant
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (res.ok) {
            resetForm();
            showAddQuestion = false;
            await invalidateAll();
        } else {
            const err = await res.json();
            alert(`Error saving question: ${err.message || 'Unknown error'}`);
        }
    }

    async function deleteQuestion(id: string) {
        if (!confirm('Are you sure you want to delete this question?')) return;
        const res = await fetch(`/api/assessments/questions?id=${id}`, { method: 'DELETE' });
        if (res.ok) invalidateAll();
    }

    async function toggleImportance(q: any) {
        const res = await fetch('/api/assessments/questions', {
            method: 'PATCH',
            body: JSON.stringify({ 
                id: q.id,
                is_important: !q.is_important
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) invalidateAll();
    }

    const bloomColors: Record<string, string> = {
        L1: 'bg-green-50 text-green-700 border-green-100',
        L2: 'bg-blue-50 text-blue-700 border-blue-100',
        L3: 'bg-red-50 text-red-700 border-red-100',
        L4: 'bg-purple-50 text-purple-700 border-purple-100',
        L5: 'bg-amber-50 text-amber-700 border-amber-100',
        Default: 'bg-gray-50 text-gray-700 border-gray-100'
    };

    async function updateDifficultyLimit(count: number) {
        const newLevels = Array.from({length: count}, (_, i) => `L${i+1}`);
        const res = await fetch(`/api/assessments/subjects`, {
            method: 'PATCH',
            body: JSON.stringify({ 
                id: data.topic.subject_id,
                difficulty_levels: newLevels
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            await invalidateAll();
            newBloomLevel = newLevels[0];
            alert(`Difficulty limit updated to L${count} successfully! 📏✅`);
        }
    }
</script>

<div class="space-y-8">
    <!-- Breadcrumbs -->
    <div class="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
        <a href="/assessments" class="hover:text-indigo-600 transition-colors">Assessments</a>
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
        <a href="/assessments/subjects/{data.topic.subject_id}" class="hover:text-indigo-600 transition-colors">{data.topic.subject_name}</a>
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"/></svg>
        <span class="text-indigo-600">Question Bank</span>
    </div>

    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-black text-gray-900 tracking-tight uppercase">{data.topic.name}</h1>
            <p class="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest font-mono">Unit {data.topic.unit_number} • {data.questions.length} Questions in Repository</p>
        </div>
        
        <div class="flex gap-3">
            <button 
                onclick={() => showBulkAdd = !showBulkAdd}
                class="inline-flex items-center px-6 py-3 bg-white border border-gray-200 text-indigo-600 text-sm font-black rounded-2xl hover:bg-gray-50 transition-all shadow-xl shadow-indigo-500/5 active:scale-95"
            >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                SMART BULK ADD
            </button>

            <button 
                onclick={() => { 
                    if(!showAddQuestion) {
                        resetForm();
                        showAddQuestion = true;
                    } else {
                        showAddQuestion = false;
                    }
                }}
                class="inline-flex items-center px-6 py-3 bg-indigo-600 text-white text-sm font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
            >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                {showAddQuestion ? 'CLOSE FORM' : 'ADD NEW QUESTION'}
            </button>
        </div>
    </div>

    {#snippet questionForm()}
        <div class="bg-white p-8 rounded-3xl border border-indigo-100 shadow-xl shadow-indigo-500/5 space-y-6" transition:slide>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-4">
                    <h3 class="text-lg font-black text-gray-900 uppercase tracking-tight">{editingQuestionId ? 'Edit Question' : 'Add New Question'}</h3>
                    <button 
                        onclick={() => newIsImportant = !newIsImportant}
                        class="flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all
                        {newIsImportant ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-400'}"
                    >
                        <svg class="w-4 h-4 {newIsImportant ? 'fill-amber-500' : 'fill-none'}" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                        </svg>
                        <span class="text-[10px] font-black uppercase tracking-widest">Mark as Very Important</span>
                    </button>
                </div>
                {#if editingQuestionId}
                    <button onclick={resetForm} class="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline">Discard Edits / Close</button>
                {/if}
            </div>

            <div class="space-y-2">
                <div class="flex justify-between items-center ml-1">
                    <label for="q-text" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Question Content</label>
                    <span class="text-[9px] font-bold text-gray-400 italic">Visual Editor: Images will be rendered inline! 🎨🖼️</span>
                </div>
                <div 
                    id="q-text"
                    use:setupEditor={newQuestionText}
                    contenteditable="true"
                    data-placeholder="Enter the question text here... (Paste images directly at cursor!)"
                    onpaste={(e) => handlePaste(e, 'question')}
                    oninput={(e) => handleInput(e, 'question')}
                    class="w-full min-h-[120px] bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 p-4 outline-none overflow-y-auto editor-placeholder md-editor"
                ></div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                    <div class="flex justify-between items-center ml-1">
                        <label for="bloom-level" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Difficulty Level</label>
                        <select 
                            class="text-[9px] font-black text-indigo-500 bg-indigo-50 rounded-lg px-2 py-1 outline-none border-none"
                            onchange={(e) => updateDifficultyLimit(parseInt(e.currentTarget.value))}
                        >
                            <option value="">CHANGE LIMIT</option>
                            <option value="1">L1 Only</option>
                            <option value="2">Up to L2</option>
                            <option value="3">Up to L3</option>
                            <option value="4">Up to L4</option>
                            <option value="5">Up to L5</option>
                        </select>
                    </div>
                    <select 
                        id="bloom-level"
                        bind:value={newBloomLevel}
                        class="w-full bg-gray-50 border-gray-100 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 p-4 appearance-none hover:bg-white transition-colors"
                    >
                        {#each levels as level}
                            <option value={level}>{level}</option>
                        {/each}
                    </select>
                </div>
                <div class="space-y-2">
                    <label for="q-marks" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Assigned Marks</label>
                    <input 
                        id="q-marks"
                        type="number" 
                        bind:value={newMarks}
                        class="w-full bg-gray-50 border-gray-100 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 p-3"
                    />
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                    <div class="flex justify-between items-center ml-1">
                        <label for="q-ans" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Answer Key / Hints (Optional)</label>
                        <span class="text-[9px] font-bold text-gray-400 italic">Images supported 🖼️</span>
                    </div>
                    <div 
                        id="q-ans"
                        use:setupEditor={newAnswerKey}
                        contenteditable="true"
                        data-placeholder="Briefly describe the correct answer... (Paste images at cursor!)"
                        onpaste={(e) => handlePaste(e, 'answer')}
                        oninput={(e) => handleInput(e, 'answer')}
                        class="w-full min-h-[80px] bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 p-4 outline-none overflow-y-auto editor-placeholder md-editor"
                    ></div>
                </div>
                <div class="space-y-2">
                    <label for="q-co" class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Course Outcome (CO)</label>
                    <select 
                        id="q-co"
                        bind:value={selectedCOId}
                        class="w-full {selectedCOId ? 'bg-gray-50 text-indigo-600' : 'bg-red-50 text-red-500 border-red-100'} border-gray-100 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 p-4 appearance-none"
                    >
                        <option value={null}>⚠ NO COURSE OUTCOME MAPPED (REQUIRED)</option>
                        {#each data.courseOutcomes as co}
                            <option value={co.id}>{co.code}: {co.description.substring(0, 80)}...</option>
                        {/each}
                    </select>
                </div>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-gray-50">
                <button onclick={() => { resetForm(); showAddQuestion = false; }} class="px-8 py-3 bg-white text-gray-400 text-sm font-black rounded-xl border border-gray-200 hover:bg-gray-50 transition-all">CANCEL</button>
                <button onclick={saveQuestion} class="px-8 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
                    {editingQuestionId ? 'UPDATE QUESTION' : 'SAVE TO REPOSITORY'}
                </button>
            </div>
        </div>
    {/snippet}

    <!-- Add Question Form -->
    {#if showAddQuestion}
        {@render questionForm()}
    {/if}

    <!-- Questions list -->
                <div class="space-y-6">
                    {#each questions as q}
                        <div class="w-full">
                            {#if editingQuestionId === q.id}
                                <div class="mb-6" transition:slide>
                                    {@render questionForm()}
                                </div>
                            {:else}
                                <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm group hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all">
                                    <div class="flex justify-between items-start gap-6">
                                        <div class="flex-1 space-y-4">
                                            <div class="flex items-center gap-3">
                                                <span class="px-2 py-0.5 rounded-lg text-[9px] font-black border uppercase tracking-tighter {bloomColors[q.bloom_level] || bloomColors.Default}">
                                                    {q.bloom_level}
                                                </span>
                                                <span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">{q.marks} MARKS</span>
                                                {#if q.co_id}
                                                    {@const co = courseOutcomes.find(c => c.id === q.co_id)}
                                                    {#if co}
                                                        <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-tighter" title={co.description}>
                                                            {co.code}
                                                        </span>
                                                    {/if}
                                                {:else}
                                                    <span class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-red-50 text-red-500 border border-red-100 uppercase tracking-tighter flex items-center gap-1">
                                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                                        NOT MAPPED
                                                    </span>
                                                {/if}
                                                {#if q.is_important}
                                                    <span class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-tighter shadow-sm shadow-amber-500/10">
                                                        <svg class="w-3 h-3 fill-amber-500" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                                                        REQUIRED IN ALL SETS
                                                    </span>
                                                {/if}
                                            </div>
                                            <div class="text-sm font-semibold text-gray-900 leading-relaxed md-content">
                                                {@html mdToHtml(q.question_text)}
                                            </div>
                                            
                                            {#if q.answer_key}
                                                <div class="bg-gray-50/80 p-4 rounded-2xl border border-gray-100/50 space-y-4">
                                                    <div>
                                                        <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-2">Answer Key / Hints</span>
                                                        <div class="text-xs text-gray-600 leading-relaxed italic md-content">
                                                            {@html mdToHtml(q.answer_key || '')}
                                                        </div>
                                                    </div>
                                                </div>
                                            {/if}
                                        </div>

                                        <div class="flex flex-col gap-2">
                                            <button 
                                                onclick={() => toggleImportance(q)}
                                                class="p-2.5 {q.is_important ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-400 border-gray-100'} rounded-xl border hover:bg-amber-600 hover:text-white transition-all shadow-sm group/star"
                                                title={q.is_important ? 'Marked as Important' : 'Mark as Important'}
                                            >
                                                <svg class="w-4 h-4 {q.is_important ? 'fill-amber-500' : 'fill-none'}" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                                                </svg>
                                            </button>
                                            
                                            <div class="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                                                <button 
                                                    onclick={() => startEdit(q)}
                                                    class="p-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                                    title="Edit Question"
                                                >
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                                </button>
                                                <button 
                                                    onclick={() => deleteQuestion(q.id)}
                                                    class="p-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                                    title="Delete Question"
                                                >
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
        {:else}
            <div class="bg-white rounded-3xl border border-gray-100 p-20 text-center flex flex-col items-center shadow-sm">
                <div class="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-300 mb-6">
                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <h3 class="text-xl font-black text-gray-900 leading-tight">Your Question Bank is Empty</h3>
                <p class="text-sm text-gray-500 mt-2 max-w-xs font-medium">Add questions using the button above to start building your assessment repository for this topic.</p>
            </div>
        {/each}
    </div>
</div>

{#if showBulkAdd}
    <div class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" transition:fade>
        <div class="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300" transition:slide>
            <div class="p-8 border-b border-gray-100 flex justify-between items-center bg-indigo-50/30">
                <div>
                    <h2 class="text-2xl font-black text-gray-900 leading-tight">Smart Bulk Import</h2>
                    <p class="text-xs font-bold text-indigo-500 uppercase tracking-widest mt-1">Paste multiple questions at once</p>
                </div>
                <button 
                    onclick={() => showBulkAdd = false} 
                    class="p-2 hover:bg-white rounded-xl transition-colors text-gray-400 hover:text-gray-900"
                    aria-label="Close"
                >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <div class="p-8 space-y-6">
                <div class="grid grid-cols-2 gap-6 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                    <div class="space-y-2">
                        <div class="flex justify-between items-center ml-1">
                            <label for="bulk-bloom" class="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Default Difficulty</label>
                            <select 
                                class="text-[9px] font-black text-indigo-500 bg-white rounded-lg px-2 py-0.5 outline-none border border-indigo-100"
                                onchange={(e) => updateDifficultyLimit(parseInt(e.currentTarget.value))}
                            >
                                <option value="">LIMIT</option>
                                <option value="1">L1</option>
                                <option value="2">L2</option>
                                <option value="3">L3</option>
                                <option value="4">L4</option>
                                <option value="5">L5</option>
                            </select>
                        </div>
                        <select 
                            id="bulk-bloom"
                            bind:value={newBloomLevel}
                            class="w-full bg-white border-gray-100 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 p-3 appearance-none hover:shadow-sm transition-all"
                        >
                            {#each levels as level}
                                <option value={level}>{level}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label for="bulk-marks" class="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Default Marks</label>
                        <input 
                            id="bulk-marks"
                            type="number" 
                            bind:value={newMarks}
                            class="w-full bg-white border-gray-100 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500 p-3"
                        />
                    </div>
                </div>

                <div class="space-y-2">
                    <div class="flex justify-between items-center ml-1">
                        <label for="bulk-text" class="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paste Questions Here</label>
                        <span class="text-[9px] font-bold text-gray-400 italic">Images rendered inline! 🖼️</span>
                    </div>
                    <div 
                        id="bulk-text"
                        contenteditable="true"
                        data-placeholder="Q1: What is Inheritance? Ans: ...&#10;Q2: ..."
                        onpaste={(e) => handlePaste(e, 'bulk')}
                        oninput={(e) => handleInput(e, 'bulk')}
                        class="w-full h-80 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs font-medium focus:ring-2 focus:ring-indigo-500 font-mono outline-none overflow-y-auto editor-placeholder"
                    ></div>
                </div>

                <div class="pt-6 border-t border-gray-50 flex justify-end gap-3">
                    <button 
                        onclick={() => showBulkAdd = false}
                        class="px-8 py-3 bg-white text-gray-400 text-sm font-black rounded-xl border border-gray-200 hover:bg-gray-50 transition-all"
                    >CANCEL</button>
                    <button 
                        onclick={handleBulkAdd}
                        class="px-8 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                    >IMPORT {bulkCount} QUESTIONS</button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.tracking-widest) {
        letter-spacing: 0.15em;
    }
    .editor-placeholder:empty:before {
        content: attr(data-placeholder);
        color: #94a3b8;
        font-style: italic;
        cursor: text;
    }

    /* Professional Table Styles */
    :global(.md-content), :global(.md-editor) {
        @apply whitespace-pre-wrap;
    }
    :global(.md-content table), :global(.md-editor table) {
        @apply w-full text-xs text-left border-collapse bg-white;
    }
    :global(.md-content th), :global(.md-editor th) {
        @apply p-3 font-black text-indigo-600 uppercase tracking-widest bg-gray-50/80 border-b border-gray-100;
    }
    :global(.md-content td), :global(.md-editor td) {
        @apply p-3 text-gray-600 font-medium border-b border-gray-50;
    }
    :global(.md-content .table-container), :global(.md-editor .table-container) {
        @apply my-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm transition-all;
    }
</style>
