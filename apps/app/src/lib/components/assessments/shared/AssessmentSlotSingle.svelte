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
        class: className = ""
    } = $props();

    // Do NOT use $derived(slot.questions[0]) because Svelte 5 prohibits binding to derived properties.
    // Instead, we access slot.questions[0] directly in the template and use callbacks for updates.
</script>

<div class="flex divide-x-[1.5pt] divide-black min-h-[40px] {className}">
    <div class="flex items-center justify-center font-bold text-sm tabular-nums no-print print:border-none" style="width: {snoWidth}px">
        {qNumber}.
    </div>
    <div class="flex-1 px-2 py-2 text-sm leading-relaxed relative group">
        <AssessmentRowActions 
            {isEditable}
            onSwap={onSwap}
            onDelete={onRemove}
        />
        <AssessmentEditable 
            value={slot.questions[0].text}
            onUpdate={(v: string) => {
                slot.questions[0].text = v;
                slot.questions[0].question_text = v;
                if (onUpdateText) onUpdateText(v, slot.questions[0].id);
            }}
            multiline={true}
        />
        <AssessmentMcqOptions options={slot.questions[0].options} />
    </div>
    <div class="flex items-center justify-center font-bold text-xs tabular-nums px-2 border-l-[1.5pt] border-black min-w-[50px] print:border-l-[1.5pt]">
        ( {slot.questions[0].marks || slot.marks || ''} )
    </div>
</div>
