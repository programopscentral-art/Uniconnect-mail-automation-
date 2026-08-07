<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
  import SwapQuestionSidebar from "./shared/SwapQuestionSidebar.svelte";
  import { installPaperUi } from "./shared/paperUi.svelte";
  import AssessmentSolutionsToggle from "./shared/AssessmentSolutionsToggle.svelte";

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

  // Move Up/Down reordering (replaces the broken table drag) + Solutions Mode.
  const { ui: paperUi, move: movePaper } = installPaperUi({
    getSet: () => currentSetData,
    persist: (s) => {
      currentSetData = s;
      if (onSwap) {
        rebuildAnswerSheet();
        onSwap($state.snapshot(currentSetData));
      }
    },
  });

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


  // Mandatory Logic Reuse: Mirroring StandardTemplate / SVYASATemplate
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
    currentSetData.answerSheet = { setId: activeSet, answers: newAnswers };
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
      if (s.type === "OR_GROUP") offset += 2;
      else offset += 1;
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
      partQs.forEach((s: any) => {
        count += s.type === "OR_GROUP" ? 2 : 1;
      });
    }
    return count;
  }

  const getSubLabel = (idx: number) => String.fromCharCode(97 + idx); // a, b, c
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="amet-paper-actual"
      class="mx-auto bg-white p-[0.7in] shadow-2xl transition-all duration-500 font-sans relative"
      style="width: 8.27in; min-height: 11.69in; color: black !important; background-color: white !important;"
    >
      {#if isEditable}
        <div class="no-print absolute top-4 right-4 z-10">
          <AssessmentSolutionsToggle ui={paperUi} />
        </div>
      {/if}

      <!-- Top Logo Section -->
      <div class="flex justify-center mb-6">
        <img
          src="https://admission-kerala.ametuniv.ac.in/public/logo/amet_logo.png"
          alt="AMET Logo"
          class="h-24 w-auto object-contain"
        />
      </div>

      <!-- Exam Title -->
      <div class="text-center mb-6">
        <h1
          class="text-xl font-extrabold uppercase tracking-tight"
          style="color: black !important;"
        >
          <AssessmentEditable
            value={paperMeta.exam_title || "MODEL EXAMINATIONS - DECEMBER 2025"}
            onUpdate={(v: string) => updateText(v, "META", "exam_title")}
          />
        </h1>
      </div>

      <!-- Headers Grid -->
      <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-[10pt] mb-6 px-1">
        <div class="flex gap-2">
          <span class="font-bold whitespace-nowrap">Programme & Batch:</span>
          <AssessmentEditable
            value={paperMeta.programme || "B.E. Cyber Security-I"}
            onUpdate={(v: string) => updateText(v, "META", "programme")}
            class="flex-1"
          />
        </div>
        <div class="flex gap-2">
          <span class="font-bold whitespace-nowrap">Semester:</span>
          <AssessmentEditable
            value={paperMeta.semester || "V"}
            onUpdate={(v: string) => updateText(v, "META", "semester")}
          />
        </div>
        <div class="flex gap-2">
          <span class="font-bold whitespace-nowrap">Course Name:</span>
          <AssessmentEditable
            value={paperMeta.course_name || "Digital Forensics"}
            onUpdate={(v: string) => updateText(v, "META", "course_name")}
            class="flex-1"
          />
        </div>
        <div class="flex gap-2">
          <span class="font-bold whitespace-nowrap">Course Code:</span>
          <AssessmentEditable
            value={paperMeta.course_code || "232CS1A54TF"}
            onUpdate={(v: string) => updateText(v, "META", "course_code")}
          />
        </div>
        <div class="flex gap-2">
          <span class="font-bold whitespace-nowrap">Duration:</span>
          <AssessmentEditable
            value={paperMeta.duration_label || "3 hours"}
            onUpdate={(v: string) => updateText(v, "META", "duration_label")}
          />
        </div>
        <div class="flex gap-2">
          <span class="font-bold whitespace-nowrap">Maximum Marks:</span>
          <AssessmentEditable
            value={paperMeta.max_marks || "100 marks"}
            onUpdate={(v: string) => updateText(v, "META", "max_marks")}
          />
        </div>
      </div>

      <!-- Instructions -->
      <div class="text-[10pt] mb-6 space-y-1" style="color: black !important;">
        <h2 class="font-bold" style="color: black !important;">
          Instructions:
        </h2>
        <ul class="list-none space-y-0.5">
          <li>
            Before attempting any question paper, ensure that you have received
            correct question paper.
          </li>
          <li>The missing data, if any, may be assumed suitably.</li>
          <li>Use the sketches whenever necessary.</li>
          <li class="flex items-center gap-2">
            <span class="border-b border-black w-24 block">
              <AssessmentEditable
                value={paperMeta.permitted_items || ""}
                placeholder="..."
                onUpdate={(v: string) =>
                  updateText(v, "META", "permitted_items")}
              />
            </span> Codes / Tables / Charts / Data book is permitted.
          </li>
        </ul>
      </div>

      <!-- Sections Iteration -->
      <div class="space-y-10">
        {#each paperStructure as section, sIdx}
          {@const sectionQuestions = getQuestionsByPart(partOf(section, sIdx))}
          {@const sectionTotal = calcTotal(partOf(section, sIdx))}
          {@const baseSN = getPreviousQuestionsCount(sIdx)}

          {#if sectionQuestions.length > 0 || mode === "preview"}
            <div>
              <!-- Section Title Header -->
              <div class="text-center mb-4 px-1">
                <h3
                  class="font-extrabold text-[11pt] uppercase tracking-normal py-2"
                  style="color: black !important;"
                >
                  PART {partOf(section, sIdx)}
                  ({sectionQuestions.length} x {section.marks_per_q} = {sectionTotal}
                  Marks)
                  <AssessmentEditable
                    value={section.title || "Answer all the Questions"}
                    onUpdate={(v: string) => {
                      section.title = v;
                      paperStructure = [...paperStructure];
                    }}
                    class="inline-block px-1"
                  />
                </h3>
                {#if section.instructions}
                  <div class="text-[9pt] font-medium leading-relaxed mt-1">
                    <AssessmentEditable
                      value={section.instructions}
                      onUpdate={(v: string) => {
                        section.instructions = v;
                        paperStructure = [...paperStructure];
                      }}
                      multiline={true}
                    />
                  </div>
                {/if}
              </div>

              <table
                class="w-full border-collapse border border-black text-[10pt]"
                style="color: black !important;"
              >
                <thead>
                  <tr class="bg-gray-100/30 text-[9pt] font-bold">
                    <td
                      class="border border-black p-2 text-center w-[65px]"
                      style="color: black !important;">Question No</td
                    >
                    <td
                      class="border border-black p-2 text-center"
                      style="color: black !important;">Question</td
                    >
                    <td
                      class="border border-black p-2 text-center w-[50px]"
                      style="color: black !important;">Mark</td
                    >
                    <td
                      class="border border-black p-2 text-center w-[50px]"
                      style="color: black !important;">BTL</td
                    >
                    <td
                      class="border border-black p-2 text-center w-[50px]"
                      style="color: black !important;">CO</td
                    >
                  </tr>
                </thead>
                <tbody
                  use:dndzone={{
                    items: sectionQuestions,
                    flipDurationMs: 200,
                    dragDisabled: true,
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
                      {@const sn = getSN(sectionQuestions, i, sIdx)}

                      <!-- Choice A Row -->
                      {#each q1s as q1, q1Idx}
                        <tr class="group/row">
                          <td
                            class="border border-black p-2 text-center align-top font-bold tabular-nums"
                            style="color: black !important;"
                          >
                            {sn}{q1s.length > 1 ? getSubLabel(q1Idx) : ""}
                          </td>
                          <td
                            class="border border-black p-2 px-4 align-top relative"
                            style="color: black !important;"
                          >
                            {#if q1Idx === 0}
                              <AssessmentRowActions
                                {isEditable}
                                onSwap={() =>
                                  openSwapSidebar(slot, partOf(section, sIdx), "q1")}
                                onDelete={() => removeQuestion(slot)}
                                slotId={slot.id}
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
                                class="grid grid-cols-2 gap-x-4 mt-2 text-[9pt] ml-2"
                              >
                                {#each q1.options as opt, oIdx}
                                  <div>
                                    {String.fromCharCode(97 + oIdx)}) {opt}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                            {#if paperUi.showSolutions}
                              <div
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase mb-1 text-blue-600"
                                >
                                  Solution
                                </div>
                                <AssessmentEditable
                                  value={q1.answer_key || q1.answer || ""}
                                  onUpdate={(v: string) => {
                                    q1.answer_key = v;
                                  }}
                                  multiline={true}
                                />
                              </div>
                            {/if}
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q1.marks || section.marks_per_q)}
                              onUpdate={(v: string) => {
                                q1.marks = Number(v);
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums uppercase"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q1.rbtl || "K2")}
                              onUpdate={(v: string) => {
                                q1.rbtl = v;
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q1.co || "CO1")}
                              onUpdate={(v: string) => {
                                q1.co = v;
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                        </tr>
                      {/each}

                      <!-- OR Row -->
                      <tr>
                        <td
                          class="border-x border-black h-8 text-center align-middle font-bold text-[9pt]"
                          colspan="5">(OR)</td
                        >
                      </tr>

                      <!-- Choice B Row -->
                      {#each q2s as q2, q2Idx}
                        <tr class="group/row">
                          <td
                            class="border border-black p-2 text-center align-top font-bold tabular-nums"
                            style="color: black !important;"
                          >
                            {sn + 1}{q2s.length > 1 ? getSubLabel(q2Idx) : ""}
                          </td>
                          <td
                            class="border border-black p-2 px-4 align-top relative"
                            style="color: black !important;"
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
                            {#if paperUi.showSolutions}
                              <div
                                class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]"
                              >
                                <div
                                  class="text-[8pt] font-bold uppercase mb-1 text-blue-600"
                                >
                                  Solution
                                </div>
                                <AssessmentEditable
                                  value={q2.answer_key || q2.answer || ""}
                                  onUpdate={(v: string) => {
                                    q2.answer_key = v;
                                  }}
                                  multiline={true}
                                />
                              </div>
                            {/if}
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q2.marks || section.marks_per_q)}
                              onUpdate={(v: string) => {
                                q2.marks = Number(v);
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums uppercase"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q2.rbtl || "K3")}
                              onUpdate={(v: string) => {
                                q2.rbtl = v;
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q2.co || "CO2")}
                              onUpdate={(v: string) => {
                                q2.co = v;
                                currentSetData = { ...currentSetData };
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
                      {@const sn = getSN(sectionQuestions, i, sIdx)}
                      {#each questions as q, qIdx}
                        <tr class="group/row">
                          <td
                            class="border border-black p-2 text-center align-top font-bold tabular-nums"
                            style="color: black !important;"
                          >
                            {sn}{questions.length > 1 ? getSubLabel(qIdx) : ""}
                          </td>
                          <td
                            class="border border-black p-2 px-4 align-top relative"
                            style="color: black !important;"
                          >
                            <AssessmentRowActions
                              {isEditable}
                              onSwap={() => openSwapSidebar(slot, partOf(section, sIdx))}
                              onDelete={() => removeQuestion(slot)}
                              slotId={qIdx === 0 ? slot.id : null}
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
                                class="grid grid-cols-2 gap-x-4 mt-2 text-[9pt] ml-2"
                              >
                                {#each q.options as opt, oIdx}
                                  <div>
                                    {String.fromCharCode(97 + oIdx)}) {opt}
                                  </div>
                                {/each}
                              </div>
                            {/if}
                            {#if q.image_url}
                              <div class="mt-3">
                                <img
                                  src={q.image_url}
                                  alt="Question"
                                  class="max-h-[200px] object-contain border border-gray-100 rounded"
                                />
                              </div>
                            {/if}
                            {#if paperUi.showSolutions}
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
                                  onUpdate={(v: string) => {
                                    q.answer_key = v;
                                  }}
                                  multiline={true}
                                />
                              </div>
                            {/if}
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q.marks || section.marks_per_q)}
                              onUpdate={(v: string) => {
                                q.marks = Number(v);
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums uppercase"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q.rbtl || "K1")}
                              onUpdate={(v: string) => {
                                q.rbtl = v;
                                currentSetData = { ...currentSetData };
                              }}
                            />
                          </td>
                          <td
                            class="border border-black p-2 text-center align-top tabular-nums"
                            style="color: black !important;"
                          >
                            <AssessmentEditable
                              value={String(q.co || "CO1")}
                              onUpdate={(v: string) => {
                                q.co = v;
                                currentSetData = { ...currentSetData };
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

      <!-- Footer Keys -->
      <div class="mt-10 border-t border-black pt-4 text-center">
        <p class="text-[9pt] font-bold mb-2">
          Knowledge Level as per Bloom Taxonomy
        </p>
        <p class="text-[8pt] text-gray-700">
          K1- Remember; K2- Understand; K3- Apply; K4- Analyze; K5 - Evaluate;
          K6- Create
        </p>
      </div>

      <!-- Sync ID Footer -->
      <div
        class="mt-12 pt-2 border-t border-black/5 text-[7pt] text-gray-300 text-center uppercase tracking-[0.3em] no-print"
      >
        AMET-V.1.0.0-PROD
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
  #amet-paper-actual {
    font-family: Arial, Helvetica, sans-serif;
    color: black !important;
    line-height: normal;
    background-color: white !important;
  }
  #amet-paper-actual * {
    color: black !important;
  }
  #amet-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    color: black !important;
  }
  #amet-paper-actual :global(input),
  #amet-paper-actual :global(textarea) {
    color: black !important;
  }
  @media print {
    #amet-paper-actual {
      padding: 0.5in !important;
      box-shadow: none !important;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
