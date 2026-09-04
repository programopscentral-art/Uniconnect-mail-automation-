<script lang="ts">
  /**
   * GMRIT — Continuous Assessment (MID) question paper.
   *
   * LAYOUT-ONLY specialisation of CrescentMidTemplate. Every piece of behaviour
   * (slot iteration, OR-group handling, swap, delete, answer-sheet rebuild,
   * reordering) is the same code as CrescentMidTemplate; only the header,
   * the section tables and the question numbering are GMRIT-specific.
   *
   * Reused as-is (do not fork):
   *   - installPaperUi()          → reordering (handle drag) + Solutions Mode
   *   - AssessmentRowActions      → swap + drag grip + delete per slot
   *   - AssessmentEditable        → every editable field, meta and question
   *   - AssessmentMcqOptions      → MCQ option rendering
   *   - SwapQuestionSidebar       → the swap picker
   *   - rebuildAnswerSheet()      → identical to Standard/Crescent implementation
   *
   * GMRIT-specific (allowed customisation only):
   *   - 3-column letterhead, metadata grid, Part A / Part B table shells
   *   - Question numbering *presentation*: an OR group prints as two numbered
   *     questions (6 & 7), each carrying its own a/b sub-parts. Slot order and
   *     grouping are never recomputed — only how the number is displayed.
   */
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentMcqOptions from "./shared/AssessmentMcqOptions.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
  import AssessmentSolutionsToggle from "./shared/AssessmentSolutionsToggle.svelte";
  import SwapQuestionSidebar from "./shared/SwapQuestionSidebar.svelte";
  import { installPaperUi } from "./shared/paperUi.svelte";

  // Props contract — identical to every other university template.
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

  // Reordering (handle-based drag) + Solutions Mode. `drag` is only READ here so
  // rows can highlight as drop targets — the controller itself is the shared one.
  const { ui: paperUi, drag: paperDrag } = installPaperUi({
    getSet: () => currentSetData,
    persist: (s) => {
      currentSetData = s;
      if (onSwap) {
        rebuildAnswerSheet();
        onSwap($state.snapshot(currentSetData));
      }
    },
  });

  // Mirrors the canonical implementation in StandardTemplate/CrescentMidTemplate
  // verbatim, so MCQ indexing stays stable across reorders and swaps.
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
  const isEditable = $derived(mode === "edit" || mode === "preview");

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
          (slot.choice1?.questions || []).find((item: any) => item.id === qId) ||
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
      k_level: question.bloom_level || "",
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
          choice.questions[qIdx] = {
            ...nQ,
            sub_label: choice.questions[qIdx].sub_label,
          };
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

  // Slots for a section, in stored order — never regrouped or re-derived.
  const questionsByPart = $derived((part: string) => {
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData?.questions || [];
    return arr.filter((q: any) => q && q.part === part);
  });

  /**
   * Presentation-only numbering. GMRIT prints each OR choice as its own numbered
   * question (6 … OR … 7), so an OR group consumes two numbers while a plain slot
   * consumes one. Walks sections/slots in their stored order only.
   */
  const slotNumberStart = $derived((sIdx: number, slotIndex: number) => {
    let n = 1;
    for (let i = 0; i < sIdx; i++) {
      for (const s of questionsByPart(paperStructure[i]?.part)) {
        n += s?.type === "OR_GROUP" ? 2 : 1;
      }
    }
    const cur = questionsByPart(paperStructure[sIdx]?.part);
    for (let i = 0; i < slotIndex; i++) {
      n += cur[i]?.type === "OR_GROUP" ? 2 : 1;
    }
    return n;
  });

  const subLabel = (q: any, idx: number) =>
    q?.sub_label || String.fromCharCode(97 + idx); // a, b, c …

  const coOf = (q: any) => q?.target_co || q?.co_indicator || "CO1";
  const rbtOf = (q: any) => q?.k_level || q?.bloom_level || "";

  /**
   * Marks shown against one sub-question. `marks_per_q` is the mark for the whole
   * numbered question (10), so when it splits into a/b each part carries half —
   * printing 10 on both rows would double the paper's total.
   */
  const subMarks = (q: any, section: any, count: number) => {
    if (q?.marks !== undefined && q?.marks !== null && q?.marks !== "")
      return String(q.marks);
    const per = Number(section?.marks_per_q) || 0;
    if (!per) return "";
    return String(count > 1 ? per / count : per);
  };

  // Read-only drop-target highlight, driven by the shared drag controller.
  const isDropTarget = (slotId: string) =>
    !!paperDrag &&
    paperDrag.overId === slotId &&
    paperDrag.activeId !== slotId;

  /** First and last printed question number in a section (OR groups span two). */
  const sectionRange = $derived((sIdx: number) => {
    const qs = questionsByPart(paperStructure[sIdx]?.part);
    if (!qs.length) return null;
    const first = slotNumberStart(sIdx, 0);
    const lastSlot = qs[qs.length - 1];
    const last =
      slotNumberStart(sIdx, qs.length - 1) +
      (lastSlot?.type === "OR_GROUP" ? 1 : 0);
    return { first, last };
  });

  const NUM_WORDS = [
    "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE",
    "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
  ];
  const numWord = (n: number) => NUM_WORDS[n] || String(n);

  const sectionTitle = (section: any, qs: any[]) => {
    if (section?.title) return section.title;
    const count = qs.length;
    const per = Number(section?.marks_per_q) || 0;
    return `PART ${section?.part} (${count} X ${per}= ${count * per} Marks)`;
  };
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="gmrit-mid-paper-actual"
      class="mx-auto bg-white text-black relative shadow-lg transition-all duration-500 font-serif"
      style="width: 8.27in; min-height: 11.69in; padding: 0.6in;"
    >
      {#if isEditable}
        <div class="no-print absolute top-4 right-4 z-10">
          <AssessmentSolutionsToggle ui={paperUi} />
        </div>
      {/if}

      <!-- ══════════ LETTERHEAD (3 columns: spacer | name | logo) ══════════ -->
      <table class="w-full border-collapse gm-plain mb-1">
        <colgroup>
          <col style="width: 70px;" />
          <col />
          <col style="width: 110px;" />
        </colgroup>
        <tbody>
          <tr>
            <td class="align-middle"></td>
            <td class="text-center align-middle">
              <div
                class="font-bold text-[16pt] leading-tight text-[#1F3864] tracking-tight"
              >
                <AssessmentEditable
                  value={paperMeta.univ_line_1 || "GMRIT Deemed to be University"}
                  onUpdate={(v: string) => updateText(v, "META", "univ_line_1")}
                  class="w-full text-center"
                />
              </div>
              <div class="font-bold text-[10pt] leading-tight">
                <AssessmentEditable
                  value={paperMeta.univ_line_1_2 || "(Autonomous Batch)"}
                  onUpdate={(v: string) => updateText(v, "META", "univ_line_1_2")}
                  class="w-full text-center"
                />
              </div>
            </td>
            <td class="align-middle text-right">
              {#if paperMeta.logo_url !== ""}
                <img
                  src={paperMeta.logo_url || "/gmrit-logo.png"}
                  alt="GMRIT"
                  class="h-[52px] w-auto object-contain inline-block"
                  onerror={(e) =>
                    ((e.currentTarget as HTMLImageElement).style.display =
                      "none")}
                />
              {/if}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Paper title -->
      <div class="font-bold text-[11.5pt] mb-1.5">
        <AssessmentEditable
          value={paperMeta.exam_title || "Continuous Assessment Question Paper"}
          onUpdate={(v: string) => updateText(v, "META", "exam_title")}
        />
      </div>

      <!-- ══════════ METADATA GRID ══════════ -->
      <table class="w-full border-collapse gm-grid text-[9.5pt] mb-4">
        <colgroup>
          <col style="width: 13%;" />
          <col style="width: 12%;" />
          <col style="width: 11%;" />
          <col style="width: 12%;" />
          <col style="width: 10%;" />
          <col style="width: 11%;" />
          <col style="width: 14%;" />
          <col style="width: 17%;" />
        </colgroup>
        <tbody>
          <tr>
            <td class="p-1 font-bold">U.G.</td>
            <td class="p-1" colspan="3"></td>
            <td class="p-1 font-bold" colspan="2">Degree</td>
            <td class="p-1 font-bold" colspan="2">
              <AssessmentEditable
                value={paperMeta.degree || "Bachelor of Technology"}
                onUpdate={(v: string) => updateText(v, "META", "degree")}
              />
            </td>
          </tr>
          <tr>
            <td class="p-1 font-bold">Academic Year</td>
            <td class="p-1 font-bold text-center">
              <AssessmentEditable
                value={paperMeta.academic_year || "2026-27"}
                onUpdate={(v: string) => updateText(v, "META", "academic_year")}
              />
            </td>
            <td class="p-1 font-bold">Sem</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.semester || ""}
                onUpdate={(v: string) => updateText(v, "META", "semester")}
              />
            </td>
            <td class="p-1 font-bold">Test</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.test_no || "1 (2)"}
                onUpdate={(v: string) => updateText(v, "META", "test_no")}
              />
            </td>
            <td class="p-1 font-bold">Date of Exam</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.exam_date || ""}
                onUpdate={(v: string) => updateText(v, "META", "exam_date")}
              />
            </td>
          </tr>
          <tr>
            <td class="p-1 font-bold">Course Code</td>
            <td class="p-1 font-bold text-center">
              <AssessmentEditable
                value={paperMeta.course_code || ""}
                onUpdate={(v: string) => updateText(v, "META", "course_code")}
              />
            </td>
            <td class="p-1 font-bold" colspan="2">Course Title</td>
            <td class="p-1 font-bold text-center" colspan="4">
              <AssessmentEditable
                value={paperMeta.subject_name || paperMeta.course_title || ""}
                onUpdate={(v: string) => updateText(v, "META", "subject_name")}
              />
            </td>
          </tr>
          <tr>
            <td class="p-1 font-bold">Duration</td>
            <td class="p-1 font-bold text-center" colspan="3">
              <AssessmentEditable
                value={paperMeta.duration_minutes || "90 Minutes"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "duration_minutes")}
              />
            </td>
            <td class="p-1 font-bold" colspan="2">Maximum Marks</td>
            <td class="p-1 font-bold text-center" colspan="2">
              <AssessmentEditable
                value={paperMeta.max_marks_text || paperMeta.max_marks || ""}
                onUpdate={(v: string) => updateText(v, "META", "max_marks_text")}
              />
            </td>
          </tr>
          <tr>
            <td class="p-1 font-bold">Remember (%)</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.rbt_remember || ""}
                onUpdate={(v: string) => updateText(v, "META", "rbt_remember")}
              />
            </td>
            <td class="p-1 font-bold">Understand (%)</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.rbt_understand || ""}
                onUpdate={(v: string) => updateText(v, "META", "rbt_understand")}
              />
            </td>
            <td class="p-1 font-bold">Apply (%)</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.rbt_apply || ""}
                onUpdate={(v: string) => updateText(v, "META", "rbt_apply")}
              />
            </td>
            <td class="p-1 font-bold">Analyze (%)</td>
            <td class="p-1 text-center">
              <AssessmentEditable
                value={paperMeta.rbt_analyze || ""}
                onUpdate={(v: string) => updateText(v, "META", "rbt_analyze")}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ══════════ SECTIONS ══════════ -->
      {#each paperStructure as section, sIdx}
        {@const sectionQs = questionsByPart(section.part)}
        {@const isPartA = section.part === "A"}

        <!-- Section heading (centred, above the table — GMRIT house style) -->
        <div class="text-center font-bold text-[10.5pt] mt-4 mb-1">
          <AssessmentEditable
            value={sectionTitle(section, sectionQs)}
            onUpdate={(v: string) => {
              section.title = v;
              paperStructure = [...paperStructure];
            }}
            class="inline-block"
          />
          <span class="ml-1">
            <AssessmentEditable
              value={section.instruction ||
                (isPartA
                  ? "(Answer all the questions)"
                  : `Answer ${numWord(sectionQs.length)} questions`)}
              onUpdate={(v: string) => {
                section.instruction = v;
                paperStructure = [...paperStructure];
              }}
              class="inline-block"
            />
          </span>
        </div>

        <table
          class="w-full border-collapse gm-grid table-fixed text-[9.5pt] mb-2"
        >
          <colgroup>
            <col style="width: 34px;" />
            {#if !isPartA}<col style="width: 26px;" />{/if}
            <col />
            <col style="width: 74px;" />
            <col style="width: 48px;" />
            {#if !isPartA}<col style="width: 44px;" />{/if}
          </colgroup>
          <thead>
            <tr>
              <th class="p-1 font-bold text-center">No{isPartA ? "." : ""}</th>
              {#if !isPartA}<th class="p-1"></th>{/if}
              <th class="p-1 font-bold text-center">
                {#if isPartA}
                  Question (s)
                {:else}
                  {@const r = sectionRange(sIdx)}
                  Questions{r ? ` (${r.first} to ${r.last})` : ""}
                {/if}
              </th>
              <th class="p-1 font-bold text-center">RBT Level</th>
              <th class="p-1 font-bold text-center">COs</th>
              {#if !isPartA}<th class="p-1 font-bold text-center">Marks</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each sectionQs as slot, i (slot.id + activeSet + swapCounter)}
              {@const startNo = slotNumberStart(sIdx, i)}
              {@const drop = isDropTarget(slot.id)}

              {#if slot.type === "OR_GROUP"}
                {@const q1s = slot.choice1?.questions || []}
                {@const q2s = slot.choice2?.questions || []}

                <!-- ── Choice 1 → question {startNo} ── -->
                {#each q1s as q, qIdx}
                  <tr class="group/row {drop ? 'gm-drop' : ''}">
                    <td class="p-1.5 text-center align-top font-bold">
                      {#if qIdx === 0}{startNo}{/if}
                    </td>
                    {#if !isPartA}
                      <td class="p-1.5 text-center align-top font-bold">
                        {subLabel(q, qIdx)}
                      </td>
                    {/if}
                    <td class="p-1.5 align-top relative">
                      <AssessmentRowActions
                        {isEditable}
                        onSwap={() =>
                          openSwapSidebar(slot, section.part, "q1", q.id)}
                        onDelete={() => removeQuestion(slot)}
                        slotId={qIdx === 0 ? slot.id : null}
                        class="!-left-10 !top-1 scale-75"
                      />
                      <div class="leading-relaxed">
                        <AssessmentEditable
                          value={q.text || q.question_text || ""}
                          onUpdate={(v: string) =>
                            updateText(v, "QUESTION", "text", slot.id, q.id)}
                          multiline={true}
                        />
                        {#if q.options?.length > 0}
                          <div class="mt-1.5 pl-3">
                            <AssessmentMcqOptions options={q.options} />
                          </div>
                        {/if}
                        {#if q.image_url}
                          <div class="mt-1.5 max-w-full overflow-hidden">
                            <img
                              src={q.image_url}
                              alt="Question"
                              class="max-h-[240px] object-contain"
                            />
                          </div>
                        {/if}
                        {#if paperUi.showSolutions}
                          <div
                            class="no-print mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-blue-900"
                          >
                            <div
                              class="text-[7.5pt] font-bold uppercase tracking-wider mb-0.5 text-blue-600"
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
                              class="!text-[9pt]"
                            />
                          </div>
                        {/if}
                      </div>
                    </td>
                    <td class="p-1.5 text-center align-top">
                      <AssessmentEditable
                        value={rbtOf(q)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "k_level", slot.id, q.id)}
                        class="inline-block min-w-[3ch] text-center"
                      />
                    </td>
                    <td class="p-1.5 text-center align-top">
                      <AssessmentEditable
                        value={coOf(q)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "target_co", slot.id, q.id)}
                        class="inline-block min-w-[3ch] text-center"
                      />
                    </td>
                    {#if !isPartA}
                    <td class="p-1.5 text-center align-top font-bold">
                      <AssessmentEditable
                        value={subMarks(q, section, q1s.length)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "marks", slot.id, q.id)}
                        class="inline-block min-w-[1ch] text-center"
                      />
                    </td>
                    {/if}
                  </tr>
                {/each}

                <!-- ── OR separator ── -->
                <tr>
                  <td
                    colspan={isPartA ? 4 : 6}
                    class="p-0.5 text-center font-bold text-[9.5pt]"
                    >OR</td
                  >
                </tr>

                <!-- ── Choice 2 → question {startNo + 1} ── -->
                {#each q2s as q, qIdx}
                  <tr class="group/row {drop ? 'gm-drop' : ''}">
                    <td class="p-1.5 text-center align-top font-bold">
                      {#if qIdx === 0}{startNo + 1}{/if}
                    </td>
                    {#if !isPartA}
                      <td class="p-1.5 text-center align-top font-bold">
                        {subLabel(q, qIdx)}
                      </td>
                    {/if}
                    <td class="p-1.5 align-top relative">
                      <AssessmentRowActions
                        {isEditable}
                        onSwap={() =>
                          openSwapSidebar(slot, section.part, "q2", q.id)}
                        onDelete={() => removeQuestion(slot)}
                        slotId={null}
                        class="!-left-10 !top-1 scale-75"
                      />
                      <div class="leading-relaxed">
                        <AssessmentEditable
                          value={q.text || q.question_text || ""}
                          onUpdate={(v: string) =>
                            updateText(v, "QUESTION", "text", slot.id, q.id)}
                          multiline={true}
                        />
                        {#if q.options?.length > 0}
                          <div class="mt-1.5 pl-3">
                            <AssessmentMcqOptions options={q.options} />
                          </div>
                        {/if}
                        {#if q.image_url}
                          <div class="mt-1.5 max-w-full overflow-hidden">
                            <img
                              src={q.image_url}
                              alt="Question"
                              class="max-h-[240px] object-contain"
                            />
                          </div>
                        {/if}
                        {#if paperUi.showSolutions}
                          <div
                            class="no-print mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-blue-900"
                          >
                            <div
                              class="text-[7.5pt] font-bold uppercase tracking-wider mb-0.5 text-blue-600"
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
                              class="!text-[9pt]"
                            />
                          </div>
                        {/if}
                      </div>
                    </td>
                    <td class="p-1.5 text-center align-top">
                      <AssessmentEditable
                        value={rbtOf(q)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "k_level", slot.id, q.id)}
                        class="inline-block min-w-[3ch] text-center"
                      />
                    </td>
                    <td class="p-1.5 text-center align-top">
                      <AssessmentEditable
                        value={coOf(q)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "target_co", slot.id, q.id)}
                        class="inline-block min-w-[3ch] text-center"
                      />
                    </td>
                    {#if !isPartA}
                    <td class="p-1.5 text-center align-top font-bold">
                      <AssessmentEditable
                        value={subMarks(q, section, q2s.length)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "marks", slot.id, q.id)}
                        class="inline-block min-w-[1ch] text-center"
                      />
                    </td>
                    {/if}
                  </tr>
                {/each}
              {:else}
                <!-- ── Plain slot (Part A short answers, or a no-choice long answer) ── -->
                {@const qs = slot.questions || [slot]}
                {#each qs as q, qIdx}
                  <tr class="group/row {drop ? 'gm-drop' : ''}">
                    <td class="p-1.5 text-center align-top font-bold">
                      {#if qIdx === 0}{startNo}{/if}
                    </td>
                    {#if !isPartA}
                      <td class="p-1.5 text-center align-top font-bold">
                        {qs.length > 1 ? subLabel(q, qIdx) : ""}
                      </td>
                    {/if}
                    <td class="p-1.5 align-top relative">
                      <AssessmentRowActions
                        {isEditable}
                        onSwap={() =>
                          openSwapSidebar(slot, section.part, undefined, q.id)}
                        onDelete={() => removeQuestion(slot)}
                        slotId={qIdx === 0 ? slot.id : null}
                        class="!-left-10 !top-1 scale-75"
                      />
                      <div class="leading-relaxed">
                        {#if isPartA && qs.length > 1}
                          <span class="font-bold mr-1">({subLabel(q, qIdx)})</span
                          >
                        {/if}
                        <AssessmentEditable
                          value={q.text || q.question_text || ""}
                          onUpdate={(v: string) =>
                            updateText(v, "QUESTION", "text", slot.id, q.id)}
                          multiline={true}
                        />
                        {#if q.options?.length > 0}
                          <div class="mt-1.5 pl-3">
                            <AssessmentMcqOptions options={q.options} />
                          </div>
                        {/if}
                        {#if q.image_url}
                          <div class="mt-1.5 max-w-full overflow-hidden">
                            <img
                              src={q.image_url}
                              alt="Question"
                              class="max-h-[240px] object-contain"
                            />
                          </div>
                        {/if}
                        {#if paperUi.showSolutions}
                          <div
                            class="no-print mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-blue-900"
                          >
                            <div
                              class="text-[7.5pt] font-bold uppercase tracking-wider mb-0.5 text-blue-600"
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
                              class="!text-[9pt]"
                            />
                          </div>
                        {/if}
                      </div>
                    </td>
                    <td class="p-1.5 text-center align-top">
                      <AssessmentEditable
                        value={rbtOf(q)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "k_level", slot.id, q.id)}
                        class="inline-block min-w-[3ch] text-center"
                      />
                    </td>
                    <td class="p-1.5 text-center align-top">
                      <AssessmentEditable
                        value={coOf(q)}
                        onUpdate={(v: string) =>
                          updateText(v, "QUESTION", "target_co", slot.id, q.id)}
                        class="inline-block min-w-[3ch] text-center"
                      />
                    </td>
                    {#if !isPartA}
                      <td class="p-1.5 text-center align-top font-bold">
                        <AssessmentEditable
                          value={subMarks(q, section, qs.length)}
                          onUpdate={(v: string) =>
                            updateText(v, "QUESTION", "marks", slot.id, q.id)}
                          class="inline-block min-w-[1ch] text-center"
                        />
                      </td>
                    {/if}
                  </tr>
                {/each}
              {/if}
            {/each}
          </tbody>
        </table>
      {/each}

      <!-- ══════════ SIGNATURES ══════════ -->
      <div class="flex justify-between mt-10 text-[9.5pt] font-bold">
        <span>Course Coordinator/Instructor</span>
        <span>Head of the Department</span>
      </div>
    </div>
  </div>

  <SwapQuestionSidebar
    bind:isOpen={isSwapSidebarOpen}
    {questionPool}
    currentMark={swapContext?.currentMark}
    currentQuestionId={swapContext?.currentId}
    onSelect={selectAlternate}
    currentSetData={currentSetData}
  />
</div>

<style>
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #gmrit-mid-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Bordered grid tables (metadata + question sections) */
  #gmrit-mid-paper-actual :global(table.gm-grid),
  #gmrit-mid-paper-actual :global(table.gm-grid td),
  #gmrit-mid-paper-actual :global(table.gm-grid th) {
    border: 1px solid black !important;
    border-collapse: collapse !important;
    vertical-align: top;
  }
  /* Letterhead table carries no rules */
  #gmrit-mid-paper-actual :global(table.gm-plain),
  #gmrit-mid-paper-actual :global(table.gm-plain td) {
    border: none !important;
  }
  #gmrit-mid-paper-actual :global(tr.gm-drop > td) {
    background: rgba(16, 185, 129, 0.12) !important;
  }
  #gmrit-mid-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    color: black !important;
    border: none !important;
    background: transparent !important;
  }
  #gmrit-mid-paper-actual :global(.assessment-editable-input) {
    border: none !important;
    outline: none !important;
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
    :global(#gmrit-mid-paper-actual) {
      display: block !important;
      visibility: visible !important;
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 auto !important;
      padding: 1.4cm !important;
      box-shadow: none !important;
      border: none !important;
      background: white !important;
    }
    :global(.no-print),
    :global(.assessment-row-actions),
    :global(.assessment-set-switcher),
    :global(.assessment-sidebar),
    :global(nav),
    :global(header),
    :global(footer),
    :global(aside) {
      display: none !important;
    }
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
