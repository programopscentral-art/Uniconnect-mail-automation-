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
        class: className = ""
    } = $props();

    // Use direct access to avoid binding to derivation crash
</script>

<div class="flex flex-col border-black {className}">
    <!-- Choice 1 Row -->
    <div class="flex divide-x-[1.5pt] divide-black min-h-[40px]">
        <div class="flex items-center justify-center font-bold text-sm tabular-nums" style="width: {snoWidth}px">
            {qNumber}.
        </div>
        <div class="flex-1 px-2 py-2 text-sm leading-relaxed relative group whitespace-pre-wrap">
            <AssessmentRowActions 
                {isEditable}
                onSwap={onSwap1}
                onDelete={onRemove}
            />
            {#if slot.choice1?.questions?.[0]}
                <AssessmentEditable 
                    value={slot.choice1.questions[0].text}
                    onUpdate={(v: string) => {
                        slot.choice1.questions[0].text = v;
                        slot.choice1.questions[0].question_text = v;
                        if (onUpdateText1) onUpdateText1(v, slot.choice1.questions[0].id);
                    }}
                    multiline={true}
                />
                <AssessmentMcqOptions options={slot.choice1.questions[0].options} />
            {/if}
        </div>
        <div class="flex items-center justify-center font-bold text-xs tabular-nums px-2 min-w-[50px] gap-1">
            <span>(</span>
            <AssessmentEditable 
                value={String(slot.choice1?.questions?.[0]?.marks || slot.marks || '')} 
                onUpdate={(v: string) => { if(slot.choice1?.questions?.[0]) slot.choice1.questions[0].marks = Number(v); }} 
                class="inline-block min-w-[1ch] text-center" 
            />
            <span>)</span>
        </div>
    </div>

    <!-- OR Row -->
    <div class="flex divide-x-[1.5pt] divide-black border-y border-black bg-gray-50/10">
         <div style="width: {snoWidth}px"></div>
         <div class="flex-1 text-center font-black uppercase text-[11px] tracking-[0.5em] py-0.5">OR</div>
    </div>

    <!-- Choice 2 Row -->
    <div class="flex divide-x-[1.5pt] divide-black min-h-[40px]">
        <div class="flex items-center justify-center font-bold text-sm tabular-nums" style="width: {snoWidth}px">
            {qNumber + 1}.
        </div>
        <div class="flex-1 px-2 py-2 text-sm leading-relaxed relative group whitespace-pre-wrap">
            <AssessmentRowActions 
                {isEditable}
                onSwap={onSwap2}
                onDelete={onRemove}
            />
            {#if slot.choice2?.questions?.[0]}
                <AssessmentEditable 
                    value={slot.choice2.questions[0].text}
                    onUpdate={(v: string) => {
                        slot.choice2.questions[0].text = v;
                        slot.choice2.questions[0].question_text = v;
                        if (onUpdateText2) onUpdateText2(v, slot.choice2.questions[0].id);
                    }}
                    multiline={true}
                />
                <AssessmentMcqOptions options={slot.choice2.questions[0].options} />
            {/if}
        </div>
        <div class="flex items-center justify-center font-bold text-xs tabular-nums px-2 min-w-[50px] gap-1">
            <span>(</span>
            <AssessmentEditable 
                value={String(slot.choice2?.questions?.[0]?.marks || slot.marks || '')} 
                onUpdate={(v: string) => { if(slot.choice2?.questions?.[0]) slot.choice2.questions[0].marks = Number(v); }} 
                class="inline-block min-w-[1ch] text-center" 
            />
            <span>)</span>
        </div>
    </div>
</div>
