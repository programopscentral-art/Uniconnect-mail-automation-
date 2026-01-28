<script lang="ts">
    import AssessmentRowActions from './AssessmentRowActions.svelte';
    import AssessmentEditable from './AssessmentEditable.svelte';
    import AssessmentMcqOptions from './AssessmentMcqOptions.svelte';

    let { 
        slot, 
        qNumber, 
        isEditable, 
        onSwap1, 
        onSwap2,
        onRemove, 
        onUpdateText1,
        onUpdateText2,
        snoWidth = 40,
        borderClass = "divide-x-[1.5pt] divide-black",
        textClass = "text-sm",
        marksClass = "min-w-[50px] gap-1",
        class: className = ""
    } = $props();

    // Use direct access to avoid binding to derivation crash
</script>

<div class="flex flex-col border-black {className}">
    <!-- Choice 1 Row -->
    <div class="flex border-b border-black">
        <div class="w-10 border-r border-black flex items-center justify-center font-bold {textClass} tabular-nums" style="width: {snoWidth}px">
            {qNumber}.
        </div>
        <div class="flex-1 px-4 py-2 {textClass} relative group whitespace-pre-wrap">
            <AssessmentRowActions 
                {isEditable}
                onSwap={onSwap1}
                onDelete={onRemove}
            />
            {#if slot.choice1?.questions?.[0] || slot.choice1}
                {@const q1 = slot.choice1.questions?.[0] || slot.choice1}
                <AssessmentEditable 
                    value={q1.text || ''}
                    onUpdate={(v: string) => {
                        q1.text = v;
                        q1.question_text = v;
                        if (onUpdateText1) onUpdateText1(v, q1.id);
                    }}
                    multiline={true}
                    class="question-text-content"
                />
                <AssessmentMcqOptions options={q1.options} />
                {#if q1.image_url}
                    <div class="mt-2 max-w-full overflow-hidden">
                        <img src={q1.image_url} alt="Question" class="max-h-[300px] object-contain" />
                    </div>
                {/if}
            {/if}
        </div>
        <div class="flex items-center justify-center font-bold text-xs tabular-nums px-2 border-l border-black {marksClass}">
            <span>(</span>
            <AssessmentEditable 
                value={String(slot.choice1?.questions?.[0]?.marks || slot.choice1?.marks || slot.marks || '')} 
                onUpdate={(v: string) => { 
                    const q1 = slot.choice1?.questions?.[0] || slot.choice1;
                    if(q1) q1.marks = Number(v); 
                }} 
                class="inline-block min-w-[1ch] text-center" 
            />
            <span>)</span>
        </div>
    </div>

    <!-- OR Row -->
    <div class="flex {borderClass} border-y border-black bg-gray-50/10">
         <div style="width: {snoWidth}px" class="border-r border-black"></div>
         <div class="flex-1 text-center font-black uppercase text-[11px] tracking-[0.5em] py-0.5">OR</div>
         <div class="border-l border-black" style="width: 50px"></div>
    </div>

    <!-- Choice 2 Row -->
    <div class="flex">
        <div class="w-10 border-r border-black flex items-center justify-center font-bold {textClass} tabular-nums" style="width: {snoWidth}px">
            {qNumber + 1}.
        </div>
        <div class="flex-1 px-4 py-2 {textClass} relative group whitespace-pre-wrap">
            <AssessmentRowActions 
                {isEditable}
                onSwap={onSwap2}
                onDelete={onRemove}
            />
            {#if slot.choice2?.questions?.[0] || slot.choice2}
                {@const q2 = slot.choice2.questions?.[0] || slot.choice2}
                <AssessmentEditable 
                    value={q2.text || ''}
                    onUpdate={(v: string) => {
                        q2.text = v;
                        q2.question_text = v;
                        if (onUpdateText2) onUpdateText2(v, q2.id);
                    }}
                    multiline={true}
                    class="question-text-content"
                />
                <AssessmentMcqOptions options={q2.options} />
                {#if q2.image_url}
                    <div class="mt-2 max-w-full overflow-hidden">
                        <img src={q2.image_url} alt="Question" class="max-h-[300px] object-contain" />
                    </div>
                {/if}
            {/if}
        </div>
        <div class="flex items-center justify-center font-bold text-xs tabular-nums px-2 border-l border-black {marksClass}">
            <span>(</span>
            <AssessmentEditable 
                value={String(slot.choice2?.questions?.[0]?.marks || slot.choice2?.marks || slot.marks || '')} 
                onUpdate={(v: string) => { 
                    const q2 = slot.choice2?.questions?.[0] || slot.choice2;
                    if(q2) q2.marks = Number(v); 
                }} 
                class="inline-block min-w-[1ch] text-center" 
            />
            <span>)</span>
        </div>
    </div>
</div>
