<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
  import AssessmentSlotSingle from "./shared/AssessmentSlotSingle.svelte";
  import AssessmentSlotOrGroup from "./shared/AssessmentSlotOrGroup.svelte";
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

  // Reordering (Move Up/Down) + Solutions Mode. Some questions render via the
  // shared slot components (Move + Solutions for free); the inline-rendered ones
  // wire Move + Solution blocks manually below.
  const { ui: paperUi, move: movePaper } = installPaperUi({
    getSet: () => currentSetData,
    persist: (s) => {
      currentSetData = s;
      onSwap?.($state.snapshot(currentSetData));
    },
  });

  // Mandatory Logic Reuse: Implementation mirrored from StandardTemplate
  function rebuildAnswerSheet() {
    if (!currentSetData || Array.isArray(currentSetData)) return;

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
    const qs = arr.filter((q: any) => q && q.part === part);
    return qs.reduce((s: number, slot: any) => {
      const marks = Number(
        slot.marks ||
          (slot.type === "OR_GROUP"
            ? slot.choice1?.questions?.[0]?.marks || 0
            : slot.questions?.[0]?.marks || 0),
      );
      return s + (slot.type === "OR_GROUP" ? marks * 2 : marks);
    }, 0);
  };

  const allQuestionsInSet = $derived(
    Array.isArray(currentSetData?.questions) ? currentSetData.questions : [],
  );

  function getQuestionsByPart(part: string | undefined | null) {
    if (!part) return [];
    const p = String(part).trim().toUpperCase();
    return (currentSetData?.questions || []).filter(
      (q: any) =>
        q &&
        String(q.part || "")
          .trim()
          .toUpperCase() === p,
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
      const part = String(pId || "")
        .trim()
        .toUpperCase();
      const partQs = qs.filter(
        (q: any) =>
          q &&
          String(q.part || "")
            .trim()
            .toUpperCase() === part,
      );
      if (partQs.length === 0) continue;

      if (part === "A") {
        // Count each slot in Part A separately
        partQs.forEach((s: any) => {
          count += s.type === "OR_GROUP" ? 2 : 1;
        });
      } else {
        partQs.forEach((s: any) => {
          count += s.type === "OR_GROUP" ? 2 : 1;
        });
      }
    }
    return count;
  }

  const getSubLabel = (idx: number) => String.fromCharCode(97 + idx) + ")"; // a), b), c)
  const getRomanLabel = (idx: number) => {
    const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
    return (roman[idx] || idx + 1) + ".";
  };

  function isMCQSlot(slot: any) {
    if (!slot) return false;
    // Check slot level
    const sType = String(slot.qType || slot.type || "").toUpperCase();
    if (sType === "MCQ") return true;

    // Check first question level
    const q = slot.questions?.[0];
    if (q) {
      const qType = String(q.qType || q.type || "").toUpperCase();
      if (qType === "MCQ") return true;
      // Also check options as a fallback
      if (Array.isArray(q.options) && q.options.length > 0) return true;
    }
    return false;
  }

  function getADYPUSN(
    slot: any,
    slotIndex: number,
    sectionQuestions: any[],
    sIdx: number,
  ) {
    const part = paperStructure[sIdx]?.part?.trim().toUpperCase();
    if (part === "A") {
      if (isMCQSlot(slot)) return 1;
      // Count non-MCQ slots before this one in Part A
      let nonMcqCount = 0;
      for (let i = 0; i < slotIndex; i++) {
        if (sectionQuestions[i] && !isMCQSlot(sectionQuestions[i]))
          nonMcqCount++;
      }
      return 2 + nonMcqCount;
    }
    if (part === "B") {
      // For Part B, SN should start from where Part A left off + 2
      // But based on user image, Section B starts with Q4
      // Let's count how many non-MCQ slots are in ALL previous sections if needed,
      // but usually Part A has Q1 (MCQ), Q2, Q3. So Q4 is correct.
      let partANonMcqCount = 0;
      const partAQuestions = getQuestionsByPart("A");
      for (const s of partAQuestions) {
        if (!isMCQSlot(s)) partANonMcqCount++;
      }
      return 2 + partANonMcqCount + slotIndex;
    }
    return getSN(sectionQuestions, slotIndex, sIdx);
  }

  function getADYPULabel(
    slot: any,
    qIdx: number,
    slotIndex: number,
    sectionQuestions: any[],
    isPartA: boolean,
  ) {
    if (isPartA && isMCQSlot(slot)) {
      let mcqCount = 0;
      for (let i = 0; i < slotIndex; i++) {
        const s = sectionQuestions[i];
        if (s && isMCQSlot(s)) {
          mcqCount += s.questions?.length || 1;
        }
      }
      return getSubLabel(mcqCount + qIdx);
    }
    const qCount =
      slot.questions?.length ||
      (slot.choice1 ? slot.choice1.questions?.length || 1 : 1);
    return qCount > 1 ? getRomanLabel(qIdx) : "";
  }

  function shouldShowADYPUSN(
    slot: any,
    slotIndex: number,
    sectionQuestions: any[],
  ) {
    if (!slot) return false;
    if (isMCQSlot(slot)) {
      // Only show SN for the very first MCQ slot in the section
      for (let i = 0; i < slotIndex; i++) {
        const s = sectionQuestions[i];
        if (s && isMCQSlot(s)) return false;
      }
    }
    return true;
  }
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="adypu-paper-actual"
      class="mx-auto bg-white p-[0.7in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      {#if isEditable}
        <div class="no-print absolute top-4 right-4 z-10">
          <AssessmentSolutionsToggle ui={paperUi} />
        </div>
      {/if}
      <!-- Header (Centered layout) -->
      <div class="text-center mb-6 space-y-1">
        <div
          class="text-[14pt] font-black uppercase tracking-tight leading-tight"
        >
          <AssessmentEditable
            value={paperMeta.univ_name || "AJEENKYA D. Y. PATIL UNIVERSITY"}
            onUpdate={(v: string) => updateText(v, "META", "univ_name")}
            class="w-full text-center"
          />
        </div>
        <div class="text-[11pt] font-bold uppercase leading-tight">
          <AssessmentEditable
            value={paperMeta.exam_title || "UNIT TEST – OCT-2025"}
            onUpdate={(v: string) => updateText(v, "META", "exam_title")}
            class="w-full text-center"
          />
        </div>
        <div
          class="text-[11pt] font-black uppercase text-red-600 print:text-[#dc2626] leading-tight"
        >
          <AssessmentEditable
            value={paperMeta.programme || "B.TECH(CSE) - I SEMESTER"}
            onUpdate={(v: string) => updateText(v, "META", "programme")}
            class="w-full text-center"
          />
        </div>
        <div
          class="text-[11pt] font-black uppercase text-red-600 print:text-[#dc2626] leading-tight"
        >
          <AssessmentEditable
            value={paperMeta.subject_name || "SUBJECT NAME"}
            onUpdate={(v: string) => updateText(v, "META", "subject_name")}
            class="w-full text-center"
          />
        </div>
      </div>

      <!-- Time & Max Marks Box -->
      <div
        class="border border-black flex justify-between px-6 py-1.5 mb-8 font-bold text-[10.5pt]"
      >
        <div class="flex items-center gap-1">
          <span>Time:</span>
          <AssessmentEditable
            value={paperMeta.duration_label || "1 Hrs"}
            onUpdate={(v: string) => updateText(v, "META", "duration_label")}
          />
        </div>
        <div class="flex items-center gap-1">
          <span>Max. Marks:</span>
          <AssessmentEditable
            value={paperMeta.max_marks || "20"}
            onUpdate={(v: string) => updateText(v, "META", "max_marks")}
          />
        </div>
      </div>

      <!-- Sections Iteration -->
      <div class="space-y-6">
        {#each paperStructure as section, sIdx}
          {@const sectionQuestions = getQuestionsByPart(section.part)}
          {@const sectionTotal = calcTotal(section.part)}
          {@const isPartA = section.part?.trim().toUpperCase() === "A"}

          {#if sectionQuestions.length > 0 || mode === "preview"}
            <div class="section-wrapper border border-black mb-4">
              <table class="w-full border-collapse">
                <thead>
                  <tr
                    class="bg-gray-50/20 italic font-bold border-b border-black"
                  >
                    <td colspan="2" class="px-4 py-1.5">
                      <div
                        class="flex justify-between items-center text-[10.5pt]"
                      >
                        <div class="italic">
                          <AssessmentEditable
                            value={section.title ||
                              `Attempt any ${section.answered_count || "all"}`}
                            onUpdate={(v: string) => {
                              section.title = v;
                              paperStructure = [...paperStructure];
                            }}
                          />
                        </div>
                        <div class="not-italic font-bold tabular-nums">
                          <AssessmentEditable
                            value={section.instructions_marks ||
                              `${section.answered_count || sectionQuestions.length} x ${section.marks_per_q} = ${sectionTotal}`}
                            onUpdate={(v: string) => {
                              section.instructions_marks = v;
                              paperStructure = [...paperStructure];
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                </thead>
                <tbody
                  use:dndzone={{
                    items: sectionQuestions,
                    flipDurationMs: 200,
                    dragDisabled: true,
                  }}
                  onconsider={(e: any) =>
                    handleDndSync(section.part, e.detail.items)}
                  onfinalize={(e: any) =>
                    handleDndSync(section.part, e.detail.items)}
                >
                  {#each sectionQuestions as slot, i (slot.id + activeSet)}
                    {@const sn = getSN(sectionQuestions, i, sIdx)}

                    {#if slot.type === "OR_GROUP"}
                      {@const q1 = slot.choice1.questions?.[0] || slot.choice1}
                      {@const q2 = slot.choice2.questions?.[0] || slot.choice2}
                      <!-- Choice 1 -->
                      <tr class="group/row">
                        <td
                          class="w-[40px] border-r border-black px-2 py-4 text-center align-top font-bold text-[11pt] bg-slate-100/50"
                        >
                          {sn}
                        </td>
                        <td class="px-5 py-4 align-top relative">
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(slot, section.part, "q1")}
                            onDelete={() => removeQuestion(slot)}
                            slotId={slot.id}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[11pt] leading-relaxed">
                            <AssessmentEditable
                              value={q1.text ||
                                q1.question_text ||
                                q1.question ||
                                q1.description ||
                                ""}
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
                          </div>
                        </td>
                      </tr>
                      <!-- OR Row -->
                      <tr>
                        <td
                          class="w-[40px] border-r border-black bg-slate-100/50"
                        ></td>
                        <td
                          class="px-5 py-1 text-center font-black uppercase text-[10pt] tracking-[0.4em] bg-gray-50/10 border-y border-black/40"
                          >OR</td
                        >
                      </tr>
                      <!-- Choice 2 -->
                      <tr
                        class="border-b border-black last:border-b-0 group/row"
                      >
                        <td
                          class="w-[40px] border-r border-black px-2 py-4 text-center align-top font-bold text-[11pt] bg-slate-100/50"
                        >
                          {sn + 1}
                        </td>
                        <td class="px-5 py-4 align-top relative">
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() =>
                              openSwapSidebar(slot, section.part, "q2")}
                            onDelete={() => removeQuestion(slot)}
                            class="!-left-10 !top-2 scale-75"
                          />
                          <div class="text-[11pt] leading-relaxed">
                            <AssessmentEditable
                              value={q2.text ||
                                q2.question_text ||
                                q2.question ||
                                q2.description ||
                                ""}
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
                          </div>
                        </td>
                      </tr>
                    {:else}
                      {@const questions =
                        slot.questions && slot.questions.length > 0
                          ? slot.questions
                          : [slot]}
                      {@const isNextMCQ =
                        isPartA &&
                        isMCQSlot(slot) &&
                        sectionQuestions[i + 1] &&
                        isMCQSlot(sectionQuestions[i + 1])}
                      <tr
                        class="border-b border-black last:border-b-0 group/row {isNextMCQ
                          ? '!border-b-0'
                          : ''}"
                      >
                        <td
                          class="w-[40px] border-r border-black px-2 py-4 text-center align-top font-bold text-[11pt] bg-slate-100/50"
                        >
                          {shouldShowADYPUSN(slot, i, sectionQuestions)
                            ? getADYPUSN(slot, i, sectionQuestions, sIdx)
                            : ""}
                        </td>
                        <td
                          class="px-5 py-4 align-top relative {isPartA &&
                          isMCQSlot(slot) &&
                          !shouldShowADYPUSN(slot, i, sectionQuestions)
                            ? 'pt-0'
                            : ''}"
                        >
                          <AssessmentRowActions
                            {isEditable}
                            onSwap={() => openSwapSidebar(slot, section.part)}
                            onDelete={() => removeQuestion(slot)}
                            slotId={slot.id}
                            class="!-left-10 !top-2 scale-75"
                          />

                          {#if isPartA && isMCQSlot(slot) && shouldShowADYPUSN(slot, i, sectionQuestions)}
                            <div class="mb-3 font-bold text-[11pt]">
                              Choose the correct answer:
                            </div>
                          {/if}

                          {#each questions as q, qIdx}
                            <div class="mb-4 last:mb-0">
                              <div class="flex gap-3 mb-2">
                                {#if isPartA || questions.length > 1}
                                  <span class="font-bold min-w-[20px]">
                                    {getADYPULabel(
                                      slot,
                                      qIdx,
                                      i,
                                      sectionQuestions,
                                      isPartA,
                                    )}
                                  </span>
                                {/if}
                                <div class="flex-1 text-[11pt] leading-relaxed">
                                  <AssessmentEditable
                                    value={q.text ||
                                      q.question_text ||
                                      q.question ||
                                      q.description ||
                                      ""}
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
                                {#if !isPartA && questions.length > 1}
                                  <div
                                    class="text-[9pt] font-bold opacity-40 italic tabular-nums"
                                  >
                                    ({q.marks || section.marks_per_q}M)
                                  </div>
                                {/if}
                              </div>

                              {#if q.options && q.options.length > 0}
                                <div
                                  class="grid grid-cols-2 gap-x-8 gap-y-1 ml-8 text-[10pt]"
                                >
                                  {#each q.options as opt, oIdx}
                                    <div class="flex gap-1.5 items-start">
                                      <span class="font-bold min-w-[20px]"
                                        >{String.fromCharCode(65 + oIdx)})</span
                                      >
                                      <span>{opt}</span>
                                    </div>
                                  {/each}
                                </div>
                              {/if}

                              {#if q.image_url}
                                <div class="mt-3 ml-8">
                                  <img
                                    src={q.image_url}
                                    alt="Question"
                                    class="max-h-[250px] object-contain border border-gray-100 rounded"
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
                            </div>
                          {/each}

                          {#if questions.length === 1 && !isSwapSidebarOpen && !isPartA}
                            <div
                              class="absolute right-4 top-4 opacity-0 group-hover/row:opacity-100 transition-opacity"
                            >
                              <div
                                class="text-[9pt] font-black text-indigo-500 bg-white px-2 py-0.5 rounded border border-indigo-100 shadow-sm print:hidden"
                              >
                                ({slot.marks || section.marks_per_q}M)
                              </div>
                            </div>
                          {/if}
                        </td>
                      </tr>
                    {/if}
                  {:else}
                    {#if mode === "preview"}
                      {#each Array(Number(section.count || 2)) as _, idx}
                        <tr
                          class="border-b border-black last:border-b-0 opacity-20 italic"
                        >
                          <td class="border-r border-black p-4 text-center"
                            >?</td
                          >
                          <td class="p-4"
                            >Standard Drafting Slot ({section.marks_per_q} Marks)</td
                          >
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

      <!-- Footer Sync ID (Subtle) -->
      <div
        class="mt-20 pt-2 border-t border-black/5 text-[7pt] text-gray-300 text-center uppercase tracking-[0.3em] no-print"
      >
        ADYPU-V.2.5.5-STABLE
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
  #adypu-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black;
    line-height: normal;
  }
  #adypu-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    line-height: normal;
  }
  @media print {
    #adypu-paper-actual {
      padding: 0.5in !important;
      box-shadow: none !important;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
