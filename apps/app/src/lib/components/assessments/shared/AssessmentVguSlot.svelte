<script lang="ts">
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
    class: className = "",
  } = $props();

  const target = $derived(slot.questions?.[0] || slot);
</script>

<tr class="border-b border-black group/row {className}">
  <td
    class="w-[85px] border-r border-black p-2 text-center align-top font-bold text-[10pt] relative"
  >
    <AssessmentRowActions
      {isEditable}
      {onSwap}
      onDelete={onRemove}
      class="-left-2 top-2"
    />
    {slot.part !== "A" ? "Q." : ""}{qNumber}{slot.part === "A" ? "." : ""}
  </td>
  <td
    class="relative p-2 text-[11pt] group whitespace-pre-wrap align-top border-r border-black min-h-[80px]"
  >
    {#each slot.questions && slot.questions.length > 0 ? slot.questions : [slot] as q, qidx}
      <div class="pr-2 {qidx > 0 ? 'mt-4 pt-4 border-t border-black/10' : ''}">
        <div class="flex gap-2">
          {#if q.sub_label}
            <span class="font-bold min-w-[20px]">{q.sub_label}</span>
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
              class="question-text-content italic font-medium"
            />
          </div>
        </div>

        <!-- Render subQuestions (a, b, c) if present -->
        {#if q.subQuestions && q.subQuestions.length > 0}
          <div class="mt-4 space-y-3 pl-6">
            {#each q.subQuestions as sub}
              <div class="flex gap-3">
                <span class="font-bold">({sub.label})</span>
                <div class="flex-1">
                  <AssessmentEditable
                    value={sub.text || ""}
                    onUpdate={(v: string) => {
                      sub.text = v;
                      if (onUpdateText) onUpdateText(v, q.id);
                    }}
                    multiline={true}
                    class="italic font-medium"
                  />
                </div>
                {#if sub.marks}
                  <span class="text-[9pt] opacity-50">[{sub.marks}M]</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
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
    {/each}
  </td>
  <td
    class="w-[60px] border-r border-black text-center align-top p-2 text-[10pt] font-bold"
  >
    <!-- VGU Marks Logic: Prioritize structural slot marks over question pool marks -->
    <AssessmentEditable
      value={String(
        slot.marks || target.marks || slot.mark || target.mark || "",
      )}
      onUpdate={(v: string) => {
        const m = Number(v);
        slot.marks = m;
        if (target) {
          target.marks = m;
          target.mark = m;
        }
      }}
      class="inline-block min-w-[1ch] text-center"
    />
  </td>
  <td
    class="w-[80px] border-r border-black text-center align-top p-2 text-[10pt] font-medium"
  >
    <AssessmentEditable
      value={target.bloomLevel || target.k_level || "K1"}
      onUpdate={(v: string) => {
        target.bloomLevel = v;
        target.k_level = v;
      }}
      class="inline-block min-w-[2ch] text-center"
    />
  </td>
  <td
    class="w-[100px] text-center align-top p-2 text-[10pt] font-medium border-r border-black last:border-r-0"
  >
    <AssessmentEditable
      value={target.co || target.co_indicator || target.target_co || "CO1"}
      onUpdate={(v: string) => {
        target.co = v;
        target.target_co = v;
      }}
      class="inline-block min-w-[3ch] text-center"
    />
  </td>
</tr>
