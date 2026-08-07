<script lang="ts">
  import { getContext } from "svelte";
  import AssessmentRowActions from "./AssessmentRowActions.svelte";
  import AssessmentEditable from "./AssessmentEditable.svelte";
  import AssessmentMcqOptions from "./AssessmentMcqOptions.svelte";

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
    class: className = "",
  } = $props();

  // Reordering + Solutions Mode are provided by the parent template through
  // context so every template gets consistent behaviour without per-row wiring.
  const moveSlot = getContext<((id: string, dir: -1 | 1) => void) | undefined>("paper:move");
  const showSolutions = getContext<(() => boolean) | undefined>("paper:showSolutions");
  const onMoveUp = moveSlot ? () => moveSlot(slot.id, -1) : null;
  const onMoveDown = moveSlot ? () => moveSlot(slot.id, 1) : null;

  // Do NOT use $derived(slot.questions[0]) because Svelte 5 prohibits binding to derived properties.
  // Instead, we access slot.questions[0] directly in the template and use callbacks for updates.
</script>

<div class="flex border-b border-black {className}">
  <div
    class="w-10 border-r border-black flex items-center justify-center font-bold {textClass} tabular-nums no-print-border"
    style="width: {snoWidth}px"
  >
    {qNumber}.
  </div>
  <div class="flex-1 px-4 py-2 {textClass} relative group whitespace-pre-wrap">
    {#if slot.questions && slot.questions.length > 0}
      <div class="flex flex-col gap-4">
        {#each slot.questions as q, i}
          <div
            class="relative group/q {i > 0
              ? 'pt-4 border-t border-black/5'
              : ''}"
          >
            <AssessmentRowActions
              {isEditable}
              onSwap={() => onSwap(q.id)}
              onDelete={onRemove}
              onMoveUp={i === 0 ? onMoveUp : null}
              onMoveDown={i === 0 ? onMoveDown : null}
              class="-left-8 top-0 scale-75 opacity-0 group-hover/q:opacity-100 transition-opacity"
            />
            <div class="flex gap-2">
              {#if q.sub_label}
                <span class="font-bold text-gray-500 min-w-[1.2rem]"
                  >{q.sub_label})</span
                >
              {/if}
              <div class="flex-1">
                <AssessmentEditable
                  value={q.text || q.question_text || ""}
                  onUpdate={(v: string) => {
                    q.text = v;
                    q.question_text = v;
                    if (onUpdateText) onUpdateText(v, q.id);
                  }}
                  multiline={true}
                  class="question-text-content"
                />
                <AssessmentMcqOptions options={q.options} />
                {#if q.image_url}
                  <div class="mt-2 max-w-full overflow-hidden">
                    <img
                      src={q.image_url}
                      alt="Question"
                      class="max-h-[300px] object-contain"
                    />
                  </div>
                {/if}
                {#if showSolutions?.()}
                  <div
                    class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
                  >
                    <div class="text-[8pt] font-bold uppercase mb-1 text-blue-600">
                      Solution
                    </div>
                    <AssessmentEditable
                      value={q.answer_key || q.answer || ""}
                      onUpdate={(v: string) => {
                        q.answer_key = v;
                      }}
                      multiline={true}
                    />
                  </div>
                {/if}
              </div>
              {#if slot.questions.length > 1}
                <div
                  class="text-[9pt] font-bold text-gray-400 tabular-nums ml-2"
                >
                  (<AssessmentEditable
                    value={String(q.marks || "")}
                    onUpdate={(v: string) => {
                      q.marks = Number(v);
                    }}
                    class="inline-block min-w-[1ch] text-center"
                  />)
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <AssessmentRowActions
        {isEditable}
        {onSwap}
        onDelete={onRemove}
        {onMoveUp}
        {onMoveDown}
      />
      <AssessmentEditable
        value={slot.text || ""}
        onUpdate={(v: string) => {
          slot.text = v;
          if (onUpdateText) onUpdateText(v, slot.id);
        }}
        multiline={true}
        class="question-text-content"
      />
      <AssessmentMcqOptions options={slot.options} />
      {#if showSolutions?.()}
        <div
          class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
        >
          <div class="text-[8pt] font-bold uppercase mb-1 text-blue-600">
            Solution
          </div>
          <AssessmentEditable
            value={slot.answer_key || slot.answer || ""}
            onUpdate={(v: string) => {
              slot.answer_key = v;
            }}
            multiline={true}
          />
        </div>
      {/if}
    {/if}
  </div>
  <div
    class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt] tabular-nums px-2 gap-1 {marksClass}"
  >
    <span>(</span>
    <AssessmentEditable
      value={String(slot.marks || "")}
      onUpdate={(v: string) => {
        slot.marks = Number(v);
      }}
      class="inline-block min-w-[1ch] text-center"
    />
    <span>)</span>
  </div>
</div>
