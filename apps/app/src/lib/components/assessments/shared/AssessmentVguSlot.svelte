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

<tr class="border-b border-black {className}">
  <td
    class="w-[60px] border-r border-black p-2 text-center align-top font-bold text-[10pt]"
  >
    {slot.part !== "A" ? "Q." : ""}{qNumber}{slot.part === "A" ? "." : ""}
  </td>
  <td
    class="relative p-2 text-[11pt] group whitespace-pre-wrap align-top border-r border-black min-h-[80px]"
  >
    <AssessmentRowActions {isEditable} {onSwap} onDelete={onRemove} />
    <div class="pr-8">
      <AssessmentEditable
        value={target.text || ""}
        onUpdate={(v: string) => {
          target.text = v;
          target.question_text = v;
          if (onUpdateText) onUpdateText(v, target.id);
        }}
        multiline={true}
        class="question-text-content italic font-medium"
      />
    </div>
    <AssessmentMcqOptions options={target.options} />
    {#if target.image_url}
      <div class="mt-2 max-w-full overflow-hidden">
        <img
          src={target.image_url}
          alt="Question"
          class="max-h-[300px] object-contain"
        />
      </div>
    {/if}
  </td>
  <td
    class="w-[60px] border-r border-black text-center align-top p-2 text-[10pt] font-bold"
  >
    <AssessmentEditable
      value={String(target.marks || "")}
      onUpdate={(v: string) => {
        target.marks = Number(v);
        slot.marks = Number(v);
      }}
      class="inline-block min-w-[1ch] text-center"
    />
  </td>
  <td
    class="w-[80px] border-r border-black text-center align-top p-2 text-[10pt] font-medium"
  >
    <AssessmentEditable
      value={target.k_level || "K1"}
      onUpdate={(v: string) => {
        target.k_level = v;
      }}
      class="inline-block min-w-[2ch] text-center"
    />
  </td>
  <td class="w-[100px] text-center align-top p-2 text-[10pt] font-medium">
    <AssessmentEditable
      value={target.co_indicator || target.target_co || "CO1"}
      onUpdate={(v: string) => {
        target.co_indicator = v;
      }}
      class="inline-block min-w-[3ch] text-center"
    />
  </td>
</tr>
