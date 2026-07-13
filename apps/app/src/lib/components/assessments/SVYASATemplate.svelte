<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
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

  /**
   * Older papers saved sections without a `part` (only title/slots/marks), which
   * used to crash this template on render. Fall back to `section`, then position.
   */
  const partOf = (section: any, index: number) =>
    String(
      section?.part ?? section?.section ?? String.fromCharCode(65 + (index ?? 0)),
    )
      .trim()
      .toUpperCase();


  // Mandatory Logic Reuse: Mirroring StandardTemplate / ADYPUTemplate
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
        q.text = val;
        q.question_text = val;
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

  function openSwapSidebar(slot: any, part: string, subPart?: "q1" | "q2") {
    const cQ =
      slot.type === "OR_GROUP"
        ? subPart === "q1"
          ? slot.choice1?.questions?.[0]
          : slot.choice2?.questions?.[0]
        : slot.questions?.[0] || slot;
    const marks = Number(
      cQ?.marks ||
        slot.marks ||
        paperStructure.find((s: any) => s.part === part)?.marks_per_q ||
        0,
    );
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData.questions;
    const index = arr.indexOf(slot);

    swapContext = {
      slotIndex: index,
      part,
      subPart,
      currentMark: marks,
      currentId: cQ?.id,
    };
    isSwapSidebarOpen = true;
  }

  function selectAlternate(question: any) {
    if (!swapContext) return;
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData.questions;
    const slot = arr[swapContext.slotIndex];
    const nQ = {
      id: question.id,
      text: question.question_text,
      marks: question.marks,
      options: question.options,
      co: question.co,
      rbtl: question.rbtl,
    };
    if (slot.type === "OR_GROUP") {
      if (swapContext.subPart === "q1") slot.choice1.questions = [nQ];
      else slot.choice2.questions = [nQ];
    } else slot.questions = [nQ];
    if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
    else currentSetData.questions = [...currentSetData.questions];

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }

    isSwapSidebarOpen = false;
  }

  const calcTotal = (part: string) => {
    const arr = (
      Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData.questions || []
    ).filter(Boolean);
    const qs = arr.filter(
      (q: any) =>
        q && q.part?.trim().toUpperCase() === String(part ?? "").trim().toUpperCase(),
    );
    return qs.reduce((s: number, slot: any) => {
      const marks = Number(
        slot.marks ||
          (slot.type === "OR_GROUP"
            ? slot.choice1?.questions?.[0]?.marks || 0
            : slot.questions?.[0]?.marks || 0),
      );
      return s + marks;
    }, 0);
  };

  function getQuestionsByPart(part: string) {
    const p = String(part ?? "").trim().toUpperCase();
    return (currentSetData?.questions || []).filter(
      (q: any) => q && q.part?.trim().toUpperCase() === p,
    );
  }

  function getSN(sectionQuestions: any[], slotIndex: number, sIdx: number) {
    const baseCount = 1 + getPreviousQuestionsCount(sIdx);
    let offset = 0;
    for (let i = 0; i < slotIndex; i++) {
      const s: any = sectionQuestions[i];
      if (s.type === "OR_GROUP") {
        offset += 2;
      } else {
        offset += 1;
      }
    }
    return baseCount + offset;
  }

  function getPreviousQuestionsCount(sIdx: number) {
    let count = 0;
    const qs = currentSetData?.questions || [];
    for (let i = 0; i < sIdx; i++) {
      const pId = paperStructure[i]?.part;
      if (!pId) continue;
      const part = pId.trim().toUpperCase();
      const partQs = qs.filter(
        (q: any) => q && q.part?.trim().toUpperCase() === part,
      );
      if (partQs.length === 0) continue;

      partQs.forEach((s: any) => {
        count += s.type === "OR_GROUP" ? 2 : 1;
      });
    }
    return count;
  }

  const getSubLabel = (idx: number) => String.fromCharCode(97 + idx) + ")"; // a), b), c)
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="svyasa-paper-actual"
      class="mx-auto bg-white p-[0.7in] shadow-2xl transition-all duration-500 font-sans text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- Top Logo Section -->
      <div class="flex justify-center mb-4">
        <img
          src="https://play-lh.googleusercontent.com/F0Cs4ynL1gXgREKijpnRqrj6oGlvSF6vsMhNLcSoUx8n6ZNvyfZQXfdKgzaLY4RWtc3s63XKr-Vy1opOi1eqWA"
          alt="S-VYASA Logo"
          class="h-28 w-auto object-contain"
        />
      </div>

      <!-- USN BOX -->
      <div class="flex justify-center items-center gap-2 mb-6">
        <span class="font-bold text-sm">USN</span>
        <div class="flex gap-0">
          {#each Array(10) as _}
            <div class="w-7 h-7 border border-black"></div>
          {/each}
        </div>
      </div>

      <!-- Headers Table -->
      <table class="w-full border-collapse border border-black text-sm mb-4">
        <tbody>
          <tr>
            <td
              class="border border-black p-1 px-2 font-bold bg-gray-50/50 w-[30%]"
              >Month & Year of Examination</td
            >
            <td class="border border-black p-1 px-2 uppercase min-w-[120px]">
              <AssessmentEditable
                value={paperMeta.exam_month_year || "JULY 2025"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "exam_month_year")}
              />
            </td>
            <td
              class="border border-black p-1 px-2 font-bold bg-gray-50/50 w-[20%] text-center"
              >Academic year</td
            >
            <td class="border border-black p-1 px-2 text-center">
              <AssessmentEditable
                value={paperMeta.academic_year || "2024-25"}
                onUpdate={(v: string) => updateText(v, "META", "academic_year")}
              />
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 px-2 font-bold bg-gray-50/50"
              >Program</td
            >
            <td class="border border-black p-1 px-2 uppercase">
              <AssessmentEditable
                value={paperMeta.programme || "B. TECH"}
                onUpdate={(v: string) => updateText(v, "META", "programme")}
              />
            </td>
            <td
              class="border border-black p-1 px-2 font-bold bg-gray-50/50 text-center"
              >Specialization</td
            >
            <td class="border border-black p-1 px-2 uppercase text-center">
              <AssessmentEditable
                value={paperMeta.specialization || "All"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "specialization")}
              />
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 px-2 font-bold bg-gray-50/50"
              >Semester</td
            >
            <td class="border border-black p-1 px-2">
              <AssessmentEditable
                value={paperMeta.semester || "I"}
                onUpdate={(v: string) => updateText(v, "META", "semester")}
              />
            </td>
            <td
              class="border border-black p-1 px-2 font-bold bg-gray-50/50 text-center"
              >Date of Examination</td
            >
            <td class="border border-black p-1 px-2 text-center">
              <AssessmentEditable
                value={paperMeta.paper_date || ""}
                onUpdate={(v: string) => updateText(v, "META", "paper_date")}
              />
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 px-2 font-bold bg-gray-50/50"
              >Course Code</td
            >
            <td colspan="3" class="border border-black p-1 px-2 uppercase">
              <AssessmentEditable
                value={paperMeta.course_code || "ENGL105"}
                onUpdate={(v: string) => updateText(v, "META", "course_code")}
              />
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 px-2 font-bold bg-gray-50/50"
              >Course Name</td
            >
            <td colspan="3" class="border border-black p-1 px-2 uppercase">
              <AssessmentEditable
                value={paperMeta.course_name || "English LSRW"}
                onUpdate={(v: string) => updateText(v, "META", "course_name")}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Max Duration and Marks -->
      <div
        class="flex justify-between items-center font-bold text-sm mb-2 px-1"
      >
        <div>
          Maximum Duration:
          <AssessmentEditable
            value={paperMeta.duration_label || "3 Hours"}
            onUpdate={(v: string) => updateText(v, "META", "duration_label")}
            class="inline-block"
          />
        </div>
        <div>
          Maximum Marks:
          <AssessmentEditable
            value={paperMeta.max_marks || "100"}
            onUpdate={(v: string) => updateText(v, "META", "max_marks")}
            class="inline-block"
          />
        </div>
      </div>

      <!-- Permitted Section -->
      <div class="text-sm border-b border-black/10 pb-4 mb-8">
        Use of <span
          class="inline-block border-b border-black min-w-[300px] text-center italic"
        >
          <AssessmentEditable
            value={paperMeta.permitted_items || ""}
            placeholder="..."
            onUpdate={(v: string) => updateText(v, "META", "permitted_items")}
          />
        </span> Permitted.
      </div>

      <!-- Sections Iteration -->
      <div class="space-y-12">
        {#each paperStructure as section, sIdx}
          {@const sectionQuestions = getQuestionsByPart(partOf(section, sIdx))}
          {@const sectionTotal = calcTotal(partOf(section, sIdx))}
          {@const baseSN = getPreviousQuestionsCount(sIdx)}

          {#if sectionQuestions.length > 0 || mode === "preview"}
            <div>
              <!-- Section Title Header -->
              <h3
                class="text-center font-extrabold text-xl mb-3 tracking-tighter"
              >
                Part - {partOf(section, sIdx)}
              </h3>
              <div
                class="flex justify-between items-center text-sm font-bold mb-3 px-1"
              >
                <div class="italic">
                  <AssessmentEditable
                    value={section.title || "Answer all the questions"}
                    onUpdate={(v: string) => {
                      section.title = v;
                      paperStructure = [...paperStructure];
                    }}
                  />
                </div>
                <div class="tabular-nums">
                  <AssessmentEditable
                    value={section.instructions_marks ||
                      `${sectionQuestions.length} Q x ${section.marks_per_q} M = ${sectionTotal}`}
                    onUpdate={(v: string) => {
                      section.instructions_marks = v;
                      paperStructure = [...paperStructure];
                    }}
                  />
                </div>
              </div>

              <!-- Questions Table -->
              <table
                class="w-full border-collapse border border-black text-[10.5pt]"
              >
                <thead>
                  <tr class="bg-gray-50/20 text-[9pt] uppercase tracking-tight">
                    <td
                      class="border border-black p-2 text-center font-bold w-[50px]"
                      >Q No.</td
                    >
                    <td class="border border-black p-2 text-center font-bold"
                      >Questions</td
                    >
                    <td
                      class="border border-black p-2 text-center font-bold w-[50px]"
                      >CO</td
                    >
                    <td
                      class="border border-black p-2 text-center font-bold w-[50px]"
                      >RBTL</td
                    >
                    <td
                      class="border border-black p-2 text-center font-bold w-[50px]"
                      >Marks</td
                    >
                  </tr>
                </thead>
                <tbody
                  use:dndzone={{
                    items: sectionQuestions,
                    flipDurationMs: 200,
                    dragDisabled: !isEditable,
                  }}
                  onconsider={(e: any) =>
                    handleDndSync(partOf(section, sIdx), e.detail.items)}
                  onfinalize={(e: any) =>
                    handleDndSync(partOf(section, sIdx), e.detail.items)}
                >
                  {#each sectionQuestions as slot, i (slot.id + activeSet)}
                    {#if slot.type === "OR_GROUP"}
                      {@const q1s = slot.choice1.questions || [slot.choice1]}
                      {@const q2s = slot.choice2.questions || [slot.choice2]}
                      {@const sn1 = getSN(sectionQuestions, i, sIdx)}
                      {@const sn2 = sn1 + 1}

                      <!-- Choice A Row -->
                      {#each q1s as q1, q1Idx}
                        <tr class="group/row">
                          <td
                            class="border border-black p-3 px-2 text-center align-middle font-bold tabular-nums"
                          >
                            {q1Idx === 0 ? sn1 : ""}{q1s.length > 1
                              ? getSubLabel(q1Idx)
                              : "."}
                          </td>
                          <td
                            class="border border-black p-3 px-4 align-top relative"
                          >
                            {#if q1Idx === 0}
                              <AssessmentRowActions
                                {isEditable}
                                onSwap={() =>
                                  openSwapSidebar(slot, partOf(section, sIdx), "q1")}
                                onDelete={() => removeQuestion(slot)}
                                class="!-left-10 !top-2 scale-75"
                              />
                            {/if}
                            <div class="leading-relaxed">
                              <AssessmentEditable
                                value={q1.text || q1.question_text || ""}
                                onUpdate={(v: string) =>
                                  updateText(
                                    v,
                                    "QUESTION",
                                    "text",
                                    slot.id,
                                    q1.id,
                                  )}
                                multiline={true}
                              />
                            </div>
                            {#if q1.options?.length > 0}
                              <div
                                class="grid grid-cols-2 gap-x-4 mt-2 text-sm ml-2 font-medium"
                              >
                                {#each q1.options as opt, oIdx}
                                  <div>
                                    {String.fromCharCode(65 + oIdx)}) {opt}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q1.co || "5")}
                              onUpdate={(v: string) => {
                                q1.co = v;
                                if (Array.isArray(currentSetData))
                                  currentSetData = [...currentSetData];
                                else
                                  currentSetData.questions = [
                                    ...currentSetData.questions,
                                  ];
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q1.rbtl || "2")}
                              onUpdate={(v: string) => {
                                q1.rbtl = v;
                                if (Array.isArray(currentSetData))
                                  currentSetData = [...currentSetData];
                                else
                                  currentSetData.questions = [
                                    ...currentSetData.questions,
                                  ];
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center font-bold tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q1.marks || section.marks_per_q)}
                              onUpdate={(v: string) => {
                                q1.marks = Number(v);
                                if (Array.isArray(currentSetData))
                                  currentSetData = [...currentSetData];
                                else
                                  currentSetData.questions = [
                                    ...currentSetData.questions,
                                  ];
                              }}
                            />
                          </td>
                        </tr>
                      {/each}

                      <!-- OR Row -->
                      <tr class="bg-gray-100/10">
                        <td
                          class="border-x border-black h-8 text-center align-middle font-black text-[10pt] uppercase tracking-[0.8em]"
                          colspan="5">OR</td
                        >
                      </tr>

                      <!-- Choice B Row -->
                      {#each q2s as q2, q2Idx}
                        <tr class="group/row">
                          <td
                            class="border border-black p-3 px-2 text-center align-middle font-bold tabular-nums"
                          >
                            {q2Idx === 0 ? sn2 : ""}{q2s.length > 1
                              ? getSubLabel(q2Idx)
                              : "."}
                          </td>
                          <td
                            class="border border-black p-3 px-4 align-top relative"
                          >
                            {#if q2Idx === 0}
                              <AssessmentRowActions
                                {isEditable}
                                onSwap={() =>
                                  openSwapSidebar(slot, partOf(section, sIdx), "q2")}
                                onDelete={() => removeQuestion(slot)}
                                class="!-left-10 !top-2 scale-75"
                              />
                            {/if}
                            <div class="leading-relaxed">
                              <AssessmentEditable
                                value={q2.text || q2.question_text || ""}
                                onUpdate={(v: string) =>
                                  updateText(
                                    v,
                                    "QUESTION",
                                    "text",
                                    slot.id,
                                    q2.id,
                                  )}
                                multiline={true}
                              />
                            </div>
                            {#if q2.options?.length > 0}
                              <div
                                class="grid grid-cols-2 gap-x-4 mt-2 text-sm ml-2 font-medium"
                              >
                                {#each q2.options as opt, oIdx}
                                  <div>
                                    {String.fromCharCode(65 + oIdx)}) {opt}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q2.co || "5")}
                              onUpdate={(v: string) => {
                                q2.co = v;
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q2.rbtl || "2")}
                              onUpdate={(v: string) => {
                                q2.rbtl = v;
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center font-bold tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q2.marks || section.marks_per_q)}
                              onUpdate={(v: string) => {
                                q2.marks = Number(v);
                              }}
                            />
                          </td>
                        </tr>
                      {/each}
                    {:else}
                      {@const questions =
                        slot.questions && slot.questions.length > 0
                          ? slot.questions
                          : [slot]}
                      {#each questions as q, qIdx}
                        <tr class="group/row">
                          <td
                            class="border border-black p-3 px-2 text-center align-middle font-bold tabular-nums"
                          >
                            {qIdx === 0
                              ? getSN(sectionQuestions, i, sIdx)
                              : ""}{questions.length > 1
                              ? getSubLabel(qIdx)
                              : "."}
                          </td>
                          <td
                            class="border border-black p-3 px-4 align-top relative"
                          >
                            <AssessmentRowActions
                              {isEditable}
                              onSwap={() => openSwapSidebar(slot, partOf(section, sIdx))}
                              onDelete={() => removeQuestion(slot)}
                              class="!-left-10 !top-2 scale-75"
                            />
                            <div class="leading-relaxed">
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
                            </div>
                            {#if q.options?.length > 0}
                              <div
                                class="grid grid-cols-2 gap-x-4 mt-2 text-sm ml-2 font-medium"
                              >
                                {#each q.options as opt, oIdx}
                                  <div>
                                    {String.fromCharCode(65 + oIdx)}) {opt}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                            {#if q.image_url}
                              <div class="mt-3">
                                <img
                                  src={q.image_url}
                                  alt="Question"
                                  class="max-h-[250px] object-contain border border-gray-100 rounded"
                                />
                              </div>
                            {/if}
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q.co || "1")}
                              onUpdate={(v: string) => {
                                q.co = v;
                                if (Array.isArray(currentSetData))
                                  currentSetData = [...currentSetData];
                                else
                                  currentSetData.questions = [
                                    ...currentSetData.questions,
                                  ];
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q.rbtl || "1")}
                              onUpdate={(v: string) => {
                                q.rbtl = v;
                                if (Array.isArray(currentSetData))
                                  currentSetData = [...currentSetData];
                                else
                                  currentSetData.questions = [
                                    ...currentSetData.questions,
                                  ];
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-3 px-2 text-center font-bold tabular-nums"
                          >
                            <AssessmentEditable
                              value={String(q.marks || section.marks_per_q)}
                              onUpdate={(v: string) => {
                                q.marks = Number(v);
                                if (Array.isArray(currentSetData))
                                  currentSetData = [...currentSetData];
                                else
                                  currentSetData.questions = [
                                    ...currentSetData.questions,
                                  ];
                              }}
                            />
                          </td>
                        </tr>
                      {/each}
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/each}
      </div>

      <!-- Sync ID Footer -->
      <div
        class="mt-20 pt-2 border-t border-black/5 text-[7pt] text-gray-300 text-center uppercase tracking-[0.3em] no-print"
      >
        SVYASA-V.1.0.0-PROD
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
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #svyasa-paper-actual {
    font-family: "Inter", "Segoe UI", Arial, sans-serif;
    color: black;
    line-height: 1.4;
  }
  #svyasa-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    line-height: normal;
  }
  @media print {
    #svyasa-paper-actual {
      padding: 0.5in !important;
      box-shadow: none !important;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
