<script lang="ts">
    import AssessmentRowActions from './AssessmentRowActions.svelte';
    import AssessmentEditable from './AssessmentEditable.svelte';
    import AssessmentMcqOptions from './AssessmentMcqOptions.svelte';

    let { 
        slot, 
        qNumber, 
        isEditable, 
        onSwap, 
        onRemove, 
        onUpdateText,
        snoWidth = 40,
        borderClass = "divide-x-[1.5pt] divide-black",
        textClass = "text-sm",
        marksClass = "border-l-[1.5pt] border-black min-w-[50px] print:border-l-[1.5pt]",
        class: className = ""
    } = $props();

    // Do NOT use $derived(slot.questions[0]) because Svelte 5 prohibits binding to derived properties.
    // Instead, we access slot.questions[0] directly in the template and use callbacks for updates.
</script>

<div class="flex border-b border-black {className}">
    <div class="w-10 border-r border-black flex items-center justify-center font-bold {textClass} tabular-nums" style="width: {snoWidth}px">
        {qNumber}.
    </div>
    <div class="flex-1 px-4 py-2 {textClass} relative group whitespace-pre-wrap">
        <AssessmentRowActions 
            {isEditable}
            onSwap={onSwap}
            onDelete={onRemove}
        />
        <AssessmentEditable 
            value={slot.questions?.[0]?.text || slot.text || ''}
            onUpdate={(v: string) => {
                const target = slot.questions?.[0] || slot;
                target.text = v;
                target.question_text = v;
                if (onUpdateText) onUpdateText(v, target.id);
            }}
            multiline={true}
            class="question-text-content"
        />
        <AssessmentMcqOptions options={slot.questions?.[0]?.options || slot.options} />
        {#if (slot.questions?.[0]?.image_url || slot.image_url)}
            <div class="mt-2 max-w-full overflow-hidden">
                <img src={slot.questions?.[0]?.image_url || slot.image_url} alt="Question" class="max-h-[300px] object-contain" />
            </div>
        {/if}
    </div>
    <div class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt] tabular-nums px-2 gap-1 {marksClass}">
        <span>(</span>
        <AssessmentEditable 
            value={String(slot.questions?.[0]?.marks || slot.marks || '')} 
            onUpdate={(v: string) => { 
                const target = slot.questions?.[0] || slot;
                target.marks = Number(v); 
                slot.marks = Number(v);
            }} 
            class="inline-block min-w-[1ch] text-center" 
        />
        <span>)</span>
    </div>
</div>
