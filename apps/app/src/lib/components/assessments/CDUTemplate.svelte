<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentMcqOptions from "./shared/AssessmentMcqOptions.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
  import SwapQuestionSidebar from "./shared/SwapQuestionSidebar.svelte";

  let {
    paperMeta = $bindable({}),
    currentSetData = $bindable({ questions: [] }),
    paperStructure = $bindable([]),
    activeSet = "A",
    courseOutcomes = [],
    questionPool = [],
    mode = "view",
    onSwap = null,
  } = $props();

  function rebuildAnswerSheet() {
    if (Array.isArray(currentSetData)) return;

    const arr = currentSetData.questions || [];
    const newAnswers: any[] = [];

    arr.forEach((slot: any) => {
      const qs = [];
      if (slot.type === "OR_GROUP") {
        if (slot.choice1?.questions) qs.push(...slot.choice1.questions);
        if (slot.choice2?.questions) qs.push(...slot.choice2.questions);
      } else {
        if (slot.questions) qs.push(...slot.questions);
        else qs.push(slot);
      }

      qs.forEach((q) => {
        if (q && (q.options?.length > 0 || q.answer_key || q.answer)) {
          newAnswers.push({
            questionId: q.question_id || q.id,
            correctOption: q.answer_key || q.answer || "",
            explanation: q.explanation || "",
          });
        }
      });
    });

    currentSetData.answerSheet = {
      setId: activeSet,
      answers: newAnswers,
    };
  }

  let isSwapSidebarOpen = $state(false);
  let swapContext = $state<any>(null);
  let swapCounter = $state(0);
  let showSolutions = $state(false);
  const isEditable = $derived(mode === "edit" || mode === "preview");

  function handleDndSync(part: string, items: any[]) {
    const arr = (
      Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData?.questions || []
    ).filter(Boolean);
    const otherQuestions = arr.filter((q: any) => q.part !== part);
    const result = [...otherQuestions, ...items.map((i) => ({ ...i, part }))];
    if (Array.isArray(currentSetData)) currentSetData = result;
    else currentSetData.questions = result;

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }
  }

  function updateText(
    val: string,
    type: "META" | "QUESTION",
    key: string,
    slotId?: string,
    qId?: string,
  ) {
    if (!isEditable) return;
    if (type === "META") (paperMeta as any)[key] = val;
    else {
      const arr = Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData.questions;
      const slot = arr.find((s: any) => s.id === slotId);
      if (!slot) return;

      let q: any = null;
      if (slot.type === "OR_GROUP") {
        q =
          (slot.choice1?.questions || []).find(
            (item: any) => item.id === qId,
          ) ||
          (slot.choice2?.questions || []).find((item: any) => item.id === qId);
      } else {
        q = (slot.questions || [slot]).find((item: any) => item.id === qId);
      }

      if (q) {
        if (key === "marks" || key === "mark") {
          q[key] = Number(val);
        } else {
          q[key] = val;
          if (key === "text") q.question_text = val;
          if (key === "question_text") q.text = val;
        }

        if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
        else currentSetData.questions = [...currentSetData.questions];

        if (onSwap) {
          rebuildAnswerSheet();
          onSwap($state.snapshot(currentSetData));
        }
      }
    }
  }

  function removeQuestion(slot: any) {
    if (!confirm("Are you sure?")) return;
    if (Array.isArray(currentSetData))
      currentSetData = currentSetData.filter((s: any) => s.id !== slot.id);
    else
      currentSetData.questions = currentSetData.questions.filter(
        (s: any) => s.id !== slot.id,
      );

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }
  }

  function openSwapSidebar(
    slot: any,
    part: string,
    subPart?: "q1" | "q2",
    subQuestionId?: string,
  ) {
    let targetQuestion = slot;
    if (slot.type === "OR_GROUP") {
      const choice = subPart === "q1" ? slot.choice1 : slot.choice2;
      if (subQuestionId) {
        targetQuestion = (choice.questions || []).find(
          (q: any) => q.id === subQuestionId,
        );
      } else {
        targetQuestion = choice.questions?.[0] || slot;
      }
    } else if (slot.questions?.length) {
      targetQuestion = slot.questions[0];
    }

    const marks = Number(
      targetQuestion?.marks ||
        slot.marks ||
        paperStructure.find((s: any) => s.part === part)?.marks_per_q ||
        0,
    );
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData.questions;
    const index = arr.findIndex((s: any) => s.id === slot.id);

    swapContext = {
      slotIndex: index,
      part,
      subPart,
      subQuestionId,
      currentMark: marks,
      currentId: targetQuestion?.id,
    };
    isSwapSidebarOpen = true;
  }

  function selectAlternate(question: any) {
    if (!swapContext) return;
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData.questions;
    let slot = arr[swapContext.slotIndex];
    const nQ = {
      id: question.id,
      question_id: question.id,
      text: question.question_text,
      question_text: question.question_text,
      marks: question.marks,
      options: question.options,
      answer_key: question.answer_key || "",
      explanation: question.explanation || "",
      part: swapContext.part,
      image_url: question.image_url,
      target_co: question.target_co || "CO1",
      k_level: question.bloom_level || "KL1",
    };

    const nArr = [...arr];
    let nSlot = { ...nArr[swapContext.slotIndex] };
    if (nSlot.type === "OR_GROUP") {
      const choice =
        swapContext.subPart === "q1"
          ? { ...nSlot.choice1 }
          : { ...nSlot.choice2 };
      if (swapContext.subQuestionId) {
        const qIdx = choice.questions.findIndex(
          (q: any) => q.id === swapContext.subQuestionId,
        );
        if (qIdx !== -1) {
          choice.questions = [...choice.questions];
          choice.questions[qIdx] = nQ;
        }
      } else {
        choice.questions = [nQ];
      }
      if (swapContext.subPart === "q1") nSlot.choice1 = choice;
      else nSlot.choice2 = choice;
    } else {
      if (swapContext.subQuestionId && nSlot.questions) {
        const qIdx = nSlot.questions.findIndex(
          (q: any) => q.id === swapContext.subQuestionId,
        );
        if (qIdx !== -1) {
          nSlot.questions = [...nSlot.questions];
          nSlot.questions[qIdx] = {
            ...nQ,
            sub_label: nSlot.questions[qIdx].sub_label,
          };
        }
      } else {
        nSlot.questions = [nQ];
      }
    }
    nArr[swapContext.slotIndex] = nSlot;
    currentSetData = Array.isArray(currentSetData)
      ? [...nArr]
      : { ...currentSetData, questions: [...nArr] };

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }

    swapCounter++;
    isSwapSidebarOpen = false;
  }

  const getSN = (sectionQuestions: any[], slotIndex: number, sIdx: number) => {
    let count = 1;
    const allQs = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData?.questions || [];

    // Count numbers in previous sections
    for (let i = 0; i < sIdx; i++) {
      const section = paperStructure[i];
      const partQs = allQs.filter((q: any) => q.part === section.part);
      partQs.forEach((q: any) => {
        count += q.type === "OR_GROUP" ? 2 : 1;
      });
    }

    // Count numbers in current section up to slotIndex
    const currentPart = paperStructure[sIdx].part;
    const currentPartQs = allQs.filter((q: any) => q.part === currentPart);
    for (let i = 0; i < slotIndex; i++) {
      count += currentPartQs[i]?.type === "OR_GROUP" ? 2 : 1;
    }

    return count;
  };

  const questionsByPart = $derived((part: string) => {
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData?.questions || [];
    return arr.filter((q: any) => q && q.part === part);
  });
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="cdu-paper-actual"
      class="mx-auto space-y-4 p-12 bg-white text-black min-h-[1100px] relative shadow-lg transition-all duration-500 font-serif"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <div class="no-print absolute top-4 right-4 z-10 flex gap-2">
        <button
          onclick={() => (showSolutions = !showSolutions)}
          class="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all {showSolutions
            ? 'bg-blue-600 text-white border-blue-700'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
        >
          {#if showSolutions}
            Solutions Mode: ON
          {:else}
            Solutions Mode: OFF
          {/if}
        </button>
      </div>

      <!-- Header (Centered per image) -->
      <div class="mb-6">
        <div class="text-center font-bold text-[11pt] mb-1">
          Set - {activeSet}
        </div>
        <div
          class="text-center font-bold uppercase text-[15.5pt] leading-tight mb-0.5 mt-2"
        >
          <AssessmentEditable
            value={paperMeta.university_name || "CHAITANYA"}
            onUpdate={(v: string) => updateText(v, "META", "university_name")}
            class="w-full text-center"
          />
        </div>
        <div class="text-center font-bold text-[10.5pt] uppercase mb-1">
          (DEEMED TO BE UNIVERSITY)
        </div>
        <div class="text-center font-bold text-[11.5pt] uppercase mb-2">
          <AssessmentEditable
            value={paperMeta.exam_title || "I INTERNAL EXAMINATIONS-NOV -2024"}
            onUpdate={(v: string) => updateText(v, "META", "exam_title")}
            class="w-full text-center"
          />
        </div>
        <div
          class="text-center font-bold uppercase text-[11.5pt] text-red-600 mb-0.5"
        >
          <AssessmentEditable
            value={paperMeta.programme_semester || "B.Tech(CSE) - I SEMESTER"}
            onUpdate={(v: string) =>
              updateText(v, "META", "programme_semester")}
            class="w-full text-center"
          />
        </div>
        <div
          class="text-center font-bold uppercase text-[12pt] text-red-600 mb-6"
        >
          <AssessmentEditable
            value={paperMeta.subject_name || "SUBJECT NAME"}
            onUpdate={(v: string) => updateText(v, "META", "subject_name")}
            class="w-full text-center"
          />
        </div>
      </div>

      <div class="border-t border-black mb-2"></div>

      <!-- Time & Marks Row -->
      <div
        class="flex justify-between items-center font-bold text-[11.5pt] py-0.5 px-1"
      >
        <div class="flex gap-1 items-baseline">
          <span>Time:</span>
          <AssessmentEditable
            value={paperMeta.duration_text || "1 ½ Hrs.]"}
            onUpdate={(v: string) => updateText(v, "META", "duration_text")}
          />
        </div>
        <div class="flex gap-1 items-baseline">
          <span>[Max. Marks:</span>
          <AssessmentEditable
            value={String(paperMeta.max_marks || "20")}
            onUpdate={(v: string) => updateText(v, "META", "max_marks")}
          />
        </div>
      </div>

      <div class="border-t border-black mt-2 mb-4"></div>

      <!-- Sections -->
      <div class="w-full space-y-8">
        {#each paperStructure as section, sIdx}
          {@const sectionQs = questionsByPart(section.part)}
          <div class="mb-4">
            <!-- Section Title with border boxes like image -->
            <div class="flex justify-center mb-3">
              <div
                class="border border-black px-10 py-1 italic font-bold text-[11pt]"
              >
                Section - {section.part}
              </div>
            </div>

            <table
              class="w-full border-collapse border border-black table-fixed"
            >
              <colgroup>
                <col style="width: 50px;" />
                <col style="width: auto;" />
              </colgroup>
              <thead>
                <tr class="border-b border-black italic text-[11pt]">
                  <th class="p-2.5 text-left font-normal" colspan="2">
                    <div class="flex justify-between items-center w-full">
                      <AssessmentEditable
                        value={section.instructions ||
                          "Answer any six Questions."}
                        onUpdate={(v: string) => {
                          section.instructions = v;
                          paperStructure = [...paperStructure];
                        }}
                      />
                      <div class="font-bold not-italic">
                        <AssessmentEditable
                          value={section.marks_summary ||
                            `${section.answered_count || 6} x ${section.marks_per_q || 2} = ${section.total_marks || 12}`}
                          onUpdate={(v: string) => {
                            section.marks_summary = v;
                            paperStructure = [...paperStructure];
                          }}
                        />
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody
                use:dndzone={{
                  items: sectionQs,
                  flipDurationMs: 200,
                  dragDisabled: !isEditable,
                }}
                onconsider={(e) => handleDndSync(section.part, e.detail.items)}
                onfinalize={(e) => handleDndSync(section.part, e.detail.items)}
              >
                {#each sectionQs as slot, i (slot.id + activeSet + swapCounter)}
                  {@const sn = getSN(sectionQs, i, sIdx)}

                  {#if slot.type === "OR_GROUP"}
                    {@const q1s = slot.choice1?.questions || []}
                    {@const q2s = slot.choice2?.questions || []}

                    <!-- Choice A -->
                    {#each q1s as q, qIdx}
                      <tr class="group/row border-b border-black">
                        <td
                          class="border-r border-black p-3 align-top text-center text-[11pt] font-medium"
                        >
                          {#if qIdx === 0}{sn}.{/if}
                        </td>
                        <td class="p-3 align-top relative">
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(slot, section.part, "q1", q.id)}
                            onDelete={() => removeQuestion(slot)}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[11pt] leading-relaxed">
                            <AssessmentEditable
                              value={q.text || q.question_text || ""}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  q.id,
                                )}
                              multiline={true}
                            />
                            {#if showSolutions}
                              <div
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase mb-1 text-blue-600"
                                >
                                  Solution
                                </div>
                                <AssessmentEditable
                                  value={q.answer_key || q.answer || ""}
                                  onUpdate={(v: string) =>
                                    updateText(
                                      v,
                                      "QUESTION",
                                      "answer_key",
                                      slot.id,
                                      q.id,
                                    )}
                                  multiline={true}
                                />
                              </div>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/each}

                    <!-- OR Row -->
                    <tr>
                      <td
                        class="border-r border-black p-2 border-b border-black bg-gray-50/50"
                      ></td>
                      <td
                        class="p-2 text-center font-bold text-[10pt] uppercase border-b border-black italic tracking-[0.2em] bg-gray-50/50"
                      >
                        OR
                      </td>
                    </tr>

                    <!-- Choice B -->
                    {#each q2s as q, qIdx}
                      <tr
                        class="group/row border-b border-black last:border-b-0"
                      >
                        <td
                          class="border-r border-black p-3 align-top text-center text-[11pt] font-medium"
                        >
                          {#if qIdx === 0}{sn + 1}.{/if}
                        </td>
                        <td class="p-3 align-top relative">
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(slot, section.part, "q2", q.id)}
                            onDelete={() => removeQuestion(slot)}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[11pt] leading-relaxed">
                            <AssessmentEditable
                              value={q.text || q.question_text || ""}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  q.id,
                                )}
                              multiline={true}
                            />
                            {#if showSolutions}
                              <div
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase mb-1 text-blue-600"
                                >
                                  Solution
                                </div>
                                <AssessmentEditable
                                  value={q.answer_key || q.answer || ""}
                                  onUpdate={(v: string) =>
                                    updateText(
                                      v,
                                      "QUESTION",
                                      "answer_key",
                                      slot.id,
                                      q.id,
                                    )}
                                  multiline={true}
                                />
                              </div>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/each}
                  {:else}
                    <!-- Single Question Slot -->
                    {@const qs = slot.questions || [slot]}
                    {#each qs as q, qIdx}
                      <tr
                        class="group/row border-b border-black last:border-b-0"
                      >
                        <td
                          class="border-r border-black p-3 align-top text-center text-[11pt] font-medium"
                        >
                          {#if qIdx === 0}{sn}.{/if}
                        </td>
                        <td class="p-3 align-top relative">
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(
                                slot,
                                section.part,
                                undefined,
                                q.id,
                              )}
                            onDelete={() => removeQuestion(slot)}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[11pt] leading-relaxed">
                            <AssessmentEditable
                              value={q.text || q.question_text || ""}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  q.id,
                                )}
                              multiline={true}
                            />
                            {#if q.options?.length > 0}
                              <div class="mt-2 pl-4">
                                <AssessmentMcqOptions options={q.options} />
                              </div>
                            {/if}
                            {#if showSolutions}
                              <div
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase mb-1 text-blue-600"
                                >
                                  Solution
                                </div>
                                <AssessmentEditable
                                  value={q.answer_key || q.answer || ""}
                                  onUpdate={(v: string) =>
                                    updateText(
                                      v,
                                      "QUESTION",
                                      "answer_key",
                                      slot.id,
                                      q.id,
                                    )}
                                  multiline={true}
                                />
                              </div>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <SwapQuestionSidebar
    bind:isOpen={isSwapSidebarOpen}
    {questionPool}
    currentMark={swapContext?.currentMark}
    currentQuestionId={swapContext?.currentId}
    onSelect={selectAlternate}
   currentSetData={currentSetData} />
</div>

<style>
  #cdu-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black !important;
  }
  #cdu-paper-actual * {
    border-color: black !important;
  }
  .text-red-600 {
    color: #dc2626 !important;
  }
</style>
