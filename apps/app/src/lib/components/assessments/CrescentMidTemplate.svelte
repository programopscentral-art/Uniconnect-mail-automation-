<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentMcqOptions from "./shared/AssessmentMcqOptions.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
  import SwapQuestionSidebar from "./shared/SwapQuestionSidebar.svelte";
  import { installPaperUi } from "./shared/paperUi.svelte";

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

  // Move Up/Down reordering (replaces the broken table drag). This template
  // renders Solutions Mode itself, so we only take `move` here.
  const { move: movePaper } = installPaperUi({
    getSet: () => currentSetData,
    persist: (s) => {
      currentSetData = s;
      if (onSwap) {
        rebuildAnswerSheet();
        onSwap($state.snapshot(currentSetData));
      }
    },
  });

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
      count += partQs.length;
    }

    // Count numbers in current section up to slotIndex
    count += slotIndex;

    return count;
  };

  const getSubLabel = (idx: number) => String.fromCharCode(97 + idx); // a, b, c
  const getRomanLabel = (idx: number) => {
    const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
    return roman[idx] || idx + 1;
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
      id="crescent-mid-paper-actual"
      class="mx-auto space-y-4 p-8 bg-white text-black min-h-[1100px] relative shadow-lg transition-all duration-500 font-serif"
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"
              ></path><path d="m9 12 2 2 4-4"></path></svg
            >
            Solutions Mode: ON
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"
              ></path><path d="m9 9 6 6"></path></svg
            >
            Solutions Mode: OFF
          {/if}
        </button>
      </div>
      <!-- Header -->
      <div class="relative mb-4">
        <div class="flex justify-center">
          <img src="/crescent-logo.png" alt="University Logo" class="h-20" />
        </div>
        <div class="absolute top-0 right-0 font-bold text-[11pt]">
          <AssessmentEditable
            value={paperMeta.course_code || "COURSE CODE"}
            onUpdate={(v: string) => updateText(v, "META", "course_code")}
          />
        </div>
      </div>

      <!-- RRN Box -->
      <div class="flex justify-end mb-6 pr-4">
        <div class="flex items-center gap-2">
          <span class="font-bold text-[10.5pt]">RRN</span>
          <div class="flex border border-black h-8">
            {#each Array(12) as _}
              <div class="w-7 border-r border-black last:border-r-0"></div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Exam Titles -->
      <div class="text-center mb-6">
        <div class="font-bold uppercase text-[12pt] leading-tight mb-1">
          <AssessmentEditable
            value={paperMeta.exam_title || "CONTINUOUS ASSESSMENT TEST - 1"}
            onUpdate={(v: string) => updateText(v, "META", "exam_title")}
            class="w-full text-center"
          />
        </div>
        <div class="font-bold uppercase text-[11pt]">
          <AssessmentEditable
            value={paperMeta.exam_session || "OCTOBER 2025"}
            onUpdate={(v: string) => updateText(v, "META", "exam_session")}
            class="w-full text-center"
          />
        </div>
      </div>

      <!-- Metadata Table -->
      <div class="text-[10pt] mb-4">
        <table class="w-full border-collapse">
          <tbody>
            <tr>
              <td class="w-[25%] py-1 font-bold">Programme & Branch</td>
              <td class="w-[3%] py-1">:</td>
              <td class="py-1">
                <AssessmentEditable
                  value={paperMeta.programme || "B.Tech CSE (AI & ML)"}
                  onUpdate={(v: string) => updateText(v, "META", "programme")}
                />
              </td>
            </tr>
            <tr>
              <td class="py-1 font-bold">Semester</td>
              <td class="py-1">:</td>
              <td>
                <div class="flex justify-between items-center">
                  <div class="min-w-[50px]">
                    <AssessmentEditable
                      value={paperMeta.semester || "I"}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "semester")}
                    />
                  </div>
                  <div class="flex gap-4">
                    <span class="font-bold">Date & Session</span>
                    <span class="font-bold">:</span>
                    <AssessmentEditable
                      value={paperMeta.paper_date || "30/10/2025 & AN"}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "paper_date")}
                    />
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td class="py-1 font-bold">Course Code & Name</td>
              <td class="py-1">:</td>
              <td class="py-1">
                <AssessmentEditable
                  value={paperMeta.subject_name ||
                    "CSE 1161 & Introduction to Web Technologies"}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "subject_name")}
                />
              </td>
            </tr>
            <tr>
              <td class="py-1 font-bold">Duration</td>
              <td class="py-1">:</td>
              <td>
                <div class="flex justify-between items-center">
                  <div class="flex gap-1">
                    <AssessmentEditable
                      value={paperMeta.duration_minutes || "90"}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "duration_minutes")}
                    />
                    <span>minutes</span>
                  </div>
                  <div class="flex gap-4">
                    <span class="font-bold">Maximum Marks</span>
                    <span class="font-bold">:</span>
                    <AssessmentEditable
                      value={paperMeta.max_marks || "50"}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "max_marks")}
                    />
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Instructions -->
      <div class="text-center font-bold uppercase text-[10pt] py-4 mb-2">
        <AssessmentEditable
          value={paperMeta.instructions || "ANSWER ALL QUESTIONS"}
          onUpdate={(v: string) => updateText(v, "META", "instructions")}
          class="w-full text-center"
        />
      </div>

      <!-- Sections -->
      <div class="w-full overflow-hidden">
        {#each paperStructure as section, sIdx}
          {@const sectionQs = questionsByPart(section.part)}
          <div class="mb-0">
            <table
              class="w-full border-collapse border border-black table-fixed"
            >
              <colgroup>
                <col style="width: 45px;" />
                <col style="width: 40px;" />
                <col style="width: auto;" />
                <col style="width: 50px;" />
                <col style="width: 45px;" />
                <col style="width: 45px;" />
              </colgroup>
              <!-- Section Header -->
              <thead>
                <tr class="bg-white border-b border-black">
                  <th
                    colspan="6"
                    class="p-3 font-bold text-[10.5pt] uppercase text-center"
                  >
                    <AssessmentEditable
                      value={section.title && section.title.includes("MARKS")
                        ? section.title
                        : `PART ${section.part} (${sectionQs.length} X ${section.marks_per_q} = ${sectionQs.length * section.marks_per_q} MARKS)`}
                      onUpdate={(v: string) => {
                        section.title = v;
                        paperStructure = [...paperStructure];
                      }}
                    />
                  </th>
                </tr>
              </thead>

              <!-- Section Body -->
              <tbody
                use:dndzone={{
                  items: sectionQs,
                  flipDurationMs: 200,
                  dragDisabled: true,
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
                      <tr
                        class="group/row"
                        style={qIdx === q1s.length - 1
                          ? "border-bottom: none;"
                          : ""}
                      >
                        <td
                          class="border-r border-black p-3 w-[50px] align-top text-center text-[10pt] font-bold"
                        >
                          {#if qIdx === 0}{sn}.a{/if}
                        </td>
                        {#if q1s.length > 1}
                          <td
                            class="border-r border-black p-3 w-[40px] align-top text-center text-[10.5pt] font-bold"
                          >
                            ({getRomanLabel(qIdx)})
                          </td>
                        {/if}
                        <td
                          colspan={(q1s.length > 1 ? 1 : 2) +
                            (section.part === "A" ? 1 : 0)}
                          class="border-r border-black p-3 align-top relative"
                        >
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(slot, section.part, "q1", q.id)}
                            onDelete={() => removeQuestion(slot)}
                            onMoveUp={qIdx === 0 ? () => movePaper(slot.id, -1) : null}
                            onMoveDown={qIdx === 0 ? () => movePaper(slot.id, 1) : null}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[10.5pt] leading-relaxed text-black">
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
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase tracking-wider mb-1 text-blue-600"
                                >
                                  Solution / Answer Key
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
                                  class="!text-[9.5pt]"
                                />
                              </div>
                            {/if}
                          </div>
                        </td>
                        {#if section.part !== "A"}
                          <td
                            class="border-r border-black p-3 text-center align-top text-[10pt] font-bold whitespace-nowrap"
                            >(<AssessmentEditable
                              value={String(
                                q.marks || section.marks_per_q || "",
                              )}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "marks",
                                  slot.id,
                                  q.id,
                                )}
                              class="!inline-block min-w-[1ch] text-center"
                            />)</td
                          >
                        {/if}
                        <td
                          class="border-r border-black p-3 text-center align-top text-[9pt] font-bold"
                        >
                          <AssessmentEditable
                            value={q.target_co || "CO1"}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "target_co",
                                slot.id,
                                q.id,
                              )}
                            class="inline-block min-w-[3ch] text-center"
                          />
                        </td>
                        <td
                          class="p-3 text-center align-top text-[9pt] font-bold"
                        >
                          <AssessmentEditable
                            value={q.k_level || "KL1"}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "k_level",
                                slot.id,
                                q.id,
                              )}
                            class="inline-block min-w-[3ch] text-center"
                          />
                        </td>
                      </tr>
                    {/each}

                    <!-- (OR) -->
                    <tr>
                      <td
                        colspan="6"
                        class="p-1 text-center font-bold text-[9pt] uppercase"
                        style="border-top: none; border-bottom: none;">(OR)</td
                      >
                    </tr>

                    <!-- Choice B -->
                    {#each q2s as q, qIdx}
                      <tr
                        class="group/row border-b border-black last:border-b-0"
                        style={qIdx === 0 ? "border-top: none;" : ""}
                      >
                        <td
                          class="border-r border-black p-3 w-[50px] align-top text-center text-[10pt] font-bold"
                          style={qIdx === 0 ? "border-top: none;" : ""}
                        >
                          {#if qIdx === 0}b{/if}
                        </td>
                        {#if q2s.length > 1}
                          <td
                            class="border-r border-black p-3 w-[40px] align-top text-center text-[10.5pt] font-bold"
                          >
                            ({getRomanLabel(qIdx)})
                          </td>
                        {/if}
                        <td
                          colspan={(q2s.length > 1 ? 1 : 2) +
                            (section.part === "A" ? 1 : 0)}
                          class="border-r border-black p-3 align-top relative"
                        >
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(slot, section.part, "q2", q.id)}
                            onDelete={() => removeQuestion(slot)}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[10.5pt] leading-relaxed text-black">
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
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase tracking-wider mb-1 text-blue-600"
                                >
                                  Solution / Answer Key
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
                                  class="!text-[9.5pt]"
                                />
                              </div>
                            {/if}
                          </div>
                        </td>
                        {#if section.part !== "A"}
                          <td
                            class="border-r border-black p-3 text-center align-top text-[10pt] font-bold whitespace-nowrap"
                            >(<AssessmentEditable
                              value={String(
                                q.marks || section.marks_per_q || "",
                              )}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "marks",
                                  slot.id,
                                  q.id,
                                )}
                              class="!inline-block min-w-[1ch] text-center"
                            />)</td
                          >
                        {/if}
                        <td
                          class="border-r border-black p-3 text-center align-top text-[9pt] font-bold"
                        >
                          <AssessmentEditable
                            value={q.target_co || "CO1"}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "target_co",
                                slot.id,
                                q.id,
                              )}
                            class="inline-block min-w-[3ch] text-center"
                          />
                        </td>
                        <td
                          class="p-3 text-center align-top text-[9pt] font-bold"
                        >
                          <AssessmentEditable
                            value={q.k_level || "KL1"}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "k_level",
                                slot.id,
                                q.id,
                              )}
                            class="inline-block min-w-[3ch] text-center"
                          />
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
                          class="border-r border-black p-3 w-[50px] align-top text-center text-[10pt] font-bold"
                        >
                          {#if qIdx === 0}{sn}.{/if}
                        </td>
                        {#if qs.length > 1}
                          <td
                            class="border-r border-black p-3 w-[40px] align-top text-center text-[10.5pt] font-bold"
                          >
                            ({getRomanLabel(qIdx)})
                          </td>
                        {/if}
                        <td
                          colspan={(qs.length > 1 ? 1 : 2) +
                            (section.part === "A" ? 1 : 0)}
                          class="border-r border-black p-3 align-top relative"
                        >
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
                            onMoveUp={qIdx === 0 ? () => movePaper(slot.id, -1) : null}
                            onMoveDown={qIdx === 0 ? () => movePaper(slot.id, 1) : null}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[10.5pt] leading-relaxed text-black">
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
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase tracking-wider mb-1 text-blue-600"
                                >
                                  Solution / Answer Key
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
                                  class="!text-[9.5pt]"
                                />
                              </div>
                            {/if}
                          </div>
                        </td>
                        {#if section.part !== "A"}
                          <td
                            class="border-r border-black p-3 text-center align-top text-[10pt] font-bold whitespace-nowrap"
                            >(<AssessmentEditable
                              value={String(
                                q.marks || section.marks_per_q || "",
                              )}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "marks",
                                  slot.id,
                                  q.id,
                                )}
                              class="!inline-block min-w-[1ch] text-center"
                            />)</td
                          >
                        {/if}
                        <td
                          class="border-r border-black p-3 text-center align-top text-[9pt] font-bold"
                        >
                          <AssessmentEditable
                            value={q.target_co || "CO1"}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "target_co",
                                slot.id,
                                q.id,
                              )}
                            class="inline-block min-w-[3ch] text-center"
                          />
                        </td>
                        <td
                          class="p-3 text-center align-top text-[9pt] font-bold"
                        >
                          <AssessmentEditable
                            value={q.k_level || "KL1"}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "k_level",
                                slot.id,
                                q.id,
                              )}
                            class="inline-block min-w-[3ch] text-center"
                          />
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

      <!-- Signature Table (Image 3) -->
      <div class="mt-12 break-inside-avoid shadow-inner no-print-force">
        <table class="w-full border-collapse border border-black text-[9pt]">
          <tbody>
            <tr>
              <td
                rowspan="2"
                class="border border-black p-4 w-[40%] font-bold align-middle"
              >
                Course Teacher / Coordinator
              </td>
              <td class="border border-black p-2 w-[20%] font-bold">Name</td>
              <td class="border border-black p-2"></td>
            </tr>
            <tr>
              <td class="border border-black p-2 font-bold"
                >Signature with Date</td
              >
              <td class="border border-black p-2 h-10"></td>
            </tr>

            <tr>
              <td
                rowspan="2"
                class="border border-black p-4 font-bold align-middle"
              >
                DAAC Member - 1
              </td>
              <td class="border border-black p-2 font-bold">Name</td>
              <td class="border border-black p-2"></td>
            </tr>
            <tr>
              <td class="border border-black p-2 font-bold"
                >Signature with Date</td
              >
              <td class="border border-black p-2 h-10"></td>
            </tr>

            <tr>
              <td
                rowspan="2"
                class="border border-black p-4 font-bold align-middle"
              >
                DAAC Member - 2
              </td>
              <td class="border border-black p-2 font-bold">Name</td>
              <td class="border border-black p-2"></td>
            </tr>
            <tr>
              <td class="border border-black p-2 font-bold"
                >Signature with Date</td
              >
              <td class="border border-black p-2 h-10"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer Page Number -->
      <div class="absolute bottom-4 right-8 text-[9pt] font-bold">1/2</div>
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
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #crescent-mid-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #crescent-mid-paper-actual * {
    color: black !important;
    border-color: black !important;
  }
  #crescent-mid-paper-actual table,
  #crescent-mid-paper-actual tr,
  #crescent-mid-paper-actual td,
  #crescent-mid-paper-actual th {
    border: 1px solid black !important;
    border-collapse: collapse !important;
  }
  #crescent-mid-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    color: black !important;
    border: none !important;
    background: transparent !important;
  }
  #crescent-mid-paper-actual :global(.assessment-editable-input) {
    border: none !important;
    outline: none !important;
  }
  table th,
  table td {
    border-color: black !important;
  }
  @media print {
    @page {
      size: A4;
      margin: 0;
    }
    :global(body) {
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    :global(#crescent-mid-paper-actual) {
      display: block !important;
      visibility: visible !important;
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 auto !important;
      padding: 1.5cm !important;
      box-shadow: none !important;
      border: none !important;
      background: white !important;
    }
    /* Hide UI and non-essential elements */
    :global(.assessment-row-actions),
    :global(.assessment-set-switcher),
    :global(.assessment-sidebar),
    :global(nav),
    :global(header),
    :global(footer),
    :global(aside) {
      display: none !important;
    }
    /* Ensure containers don't hide the content */
    :global(.h-full),
    :global(.flex-1),
    :global(.overflow-auto),
    :global(.overflow-hidden) {
      overflow: visible !important;
      height: auto !important;
      display: block !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      box-shadow: none !important;
      background: white !important;
    }
  }
</style>
