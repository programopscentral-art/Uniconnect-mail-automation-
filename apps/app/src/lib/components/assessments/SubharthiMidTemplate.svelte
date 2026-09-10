<script lang="ts">
  /**
   * Swami Vivekanand Subharti University — Sessional (MID) question paper.
   *
   * LAYOUT-ONLY specialisation of CrescentMidTemplate (via its GMRIT sibling,
   * which is the same code). Every piece of behaviour — slot iteration,
   * sub-question handling, swap, delete, answer-sheet rebuild, reordering — is
   * the shared implementation, copied verbatim rather than re-derived.
   *
   * Reused as-is (do not fork):
   *   - installPaperUi()      → reordering (handle drag) + Solutions Mode
   *   - AssessmentRowActions  → swap + drag grip + delete per slot
   *   - AssessmentEditable    → every editable field, meta and question
   *   - AssessmentMcqOptions  → MCQ option rendering
   *   - SwapQuestionSidebar   → the swap picker
   *   - rebuildAnswerSheet()  → identical to Standard/Crescent implementation
   *
   * Subharti-specific (allowed customisation only):
   *   - the bordered letterhead block + two-column metadata. Its fixed lines use
   *     sub_* metadata keys because the paper page force-fills univ_line_1 with
   *     the DB university name, univ_line_2 with "(DEEMED TO BE UNIVERSITY)" and
   *     instructions with "ANSWER ALL QUESTIONS" on EVERY paper - a plain
   *     `|| default` fallback here could never win. Each stays editable.
   *   - SECTION-A/B/C bands, each carrying one Qn row with its instruction and
   *     the Marks / COs / BTL column heads, then its (A)(B)(C) sub-part rows
   *   - question numbering *presentation* only: Q1, Q2, Q3 and (A)(B)(C)
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
   * Presentation-only numbering: Q1, Q2, Q3 … one per slot, in stored order.
   * An OR group would consume two numbers. Slot order is never recomputed.
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

  // Subharti prints sub-parts as (A) (B) (C) …
  const subLabel = (q: any, idx: number) =>
    String(q?.sub_label || String.fromCharCode(65 + idx)).toUpperCase();

  // Blank rather than a fabricated "CO1" — the Subharti sheet leaves COs empty
  // until the setter fills them in.
  const coOf = (q: any) => q?.target_co || q?.co_indicator || "";
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
    paperDrag.activeId !== slotId;</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="subharti-mid-paper-actual"
      class="mx-auto bg-white text-black relative shadow-lg transition-all duration-500 font-serif"
      style="width: 8.27in; min-height: 11.69in; padding: 0.55in;"
    >
      {#if isEditable}
        <div class="no-print absolute top-4 right-4 z-10">
          <AssessmentSolutionsToggle ui={paperUi} />
        </div>
      {/if}

      <!-- ══════════ FORMAT CAPTION (above the box) ══════════ -->
      <div class="text-center font-bold text-[8.5pt] tracking-wide mb-1.5">
        <AssessmentEditable
          value={paperMeta.format_caption ||
            "Format For Sessional Question Paper B.Tech. – I Year (ALL BRANCH)"}
          onUpdate={(v: string) => updateText(v, "META", "format_caption")}
          class="w-full text-center"
        />
      </div>

      <!-- ══════════ LETTERHEAD BOX ══════════ -->
      <div class="sub-box px-3 pt-2 pb-2.5">
        <div class="text-center font-bold text-[16pt] leading-tight tracking-wide">
          <AssessmentEditable
            value={paperMeta.sub_univ_name ||
              "SWAMI VIVEKANAND SUBHARTI UNIVERSITY"}
            onUpdate={(v: string) => updateText(v, "META", "sub_univ_name")}
            class="w-full text-center"
          />
        </div>
        <div class="text-center text-[6.5pt] leading-tight">
          <AssessmentEditable
            value={paperMeta.sub_univ_act ||
              "(Established under U.P. Govt. Act no. 29 of 2008 and approved under section 2(f) of UGC Act 1956)"}
            onUpdate={(v: string) => updateText(v, "META", "sub_univ_act")}
            class="w-full text-center"
          />
        </div>
        <div class="text-center font-bold text-[11.5pt] leading-tight mt-0.5">
          <AssessmentEditable
            value={paperMeta.faculty_line || "FACULTY OF ENGINEERING & TECHNOLOGY"}
            onUpdate={(v: string) => updateText(v, "META", "faculty_line")}
            class="w-full text-center"
          />
        </div>
        <div class="text-center font-bold text-[9.5pt] leading-tight mt-0.5">
          <AssessmentEditable
            value={paperMeta.sub_exam_line ||
              "I Sessional Examination Even Sem. 2025-26 (Feb. 2026)"}
            onUpdate={(v: string) => updateText(v, "META", "sub_exam_line")}
            class="w-full text-center"
          />
        </div>

        <!-- two-column metadata -->
        <table class="w-full border-collapse sub-plain text-[9pt] mt-2.5">
          <colgroup>
            <col style="width: 58%;" />
            <col style="width: 42%;" />
          </colgroup>
          <tbody>
            <tr>
              <td class="py-[3px] align-top">
                <span class="font-bold">Programme Name:</span>
                <AssessmentEditable
                  value={paperMeta.programme || "UG/B.Tech/Branch name"}
                  onUpdate={(v: string) => updateText(v, "META", "programme")}
                  class="inline-block min-w-[8ch]"
                />
              </td>
              <td class="py-[3px] align-top">
                <span class="font-bold">Year/Semester:</span>
                <AssessmentEditable
                  value={paperMeta.year_semester || "../…"}
                  onUpdate={(v: string) => updateText(v, "META", "year_semester")}
                  class="inline-block min-w-[6ch]"
                />
              </td>
            </tr>
            <tr>
              <td class="py-[3px] align-top">
                <span class="font-bold">Course/ Subject Code:</span>
                <AssessmentEditable
                  value={paperMeta.course_code || ""}
                  onUpdate={(v: string) => updateText(v, "META", "course_code")}
                  class="inline-block min-w-[8ch]"
                />
              </td>
              <td class="py-[3px] align-top">
                <span class="font-bold">Time:</span>
                <AssessmentEditable
                  value={paperMeta.duration_minutes || "90 Minutes"}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "duration_minutes")}
                  class="inline-block min-w-[6ch]"
                />
              </td>
            </tr>
            <tr>
              <td class="py-[3px] align-top">
                <span class="font-bold">Course/ Subject Name:</span>
                <AssessmentEditable
                  value={paperMeta.subject_name || ""}
                  onUpdate={(v: string) => updateText(v, "META", "subject_name")}
                  class="inline-block min-w-[8ch]"
                />
              </td>
              <td class="py-[3px] align-top">
                <span class="font-bold">Max. Marks:</span>
                <AssessmentEditable
                  value={paperMeta.max_marks_text || paperMeta.max_marks || "20"}
                  onUpdate={(v: string) => updateText(v, "META", "max_marks_text")}
                  class="inline-block min-w-[4ch]"
                />
              </td>
            </tr>
            <tr>
              <td class="py-[3px] align-top">
                <span class="font-bold">No. of Page(s):</span>
                <AssessmentEditable
                  value={paperMeta.page_count || "01"}
                  onUpdate={(v: string) => updateText(v, "META", "page_count")}
                  class="inline-block min-w-[3ch]"
                />
              </td>
              <td class="py-[3px]"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ══════════ GLOBAL INSTRUCTION ══════════ -->
      <div class="sub-box border-t-0 px-2 py-1 text-[9pt] font-semibold">
        <AssessmentEditable
          value={paperMeta.sub_instructions ||
            "All Sections are compulsory and attempt as per instruction."}
          onUpdate={(v: string) => updateText(v, "META", "sub_instructions")}
        />
      </div>

      <!-- ══════════ SECTIONS ══════════ -->
      {#each paperStructure as section, sIdx}
        {@const sectionQs = questionsByPart(section.part)}

        <table class="w-full border-collapse sub-grid text-[9pt] border-t-0">
          <colgroup>
            <col style="width: 44px;" />
            <col />
            <col style="width: 52px;" />
            <col style="width: 44px;" />
            <col style="width: 44px;" />
          </colgroup>
          <tbody>
            <!-- SECTION band -->
            <tr>
              <td colspan="5" class="text-center font-bold py-[3px] text-[9.5pt]">
                <AssessmentEditable
                  value={section.title || `SECTION-${section.part}`}
                  onUpdate={(v: string) => {
                    section.title = v;
                    paperStructure = [...paperStructure];
                  }}
                  class="inline-block"
                />
              </td>
            </tr>

            {#each sectionQs as slot, i (slot.id + activeSet + swapCounter)}
              {@const qNo = slotNumberStart(sIdx, i)}
              {@const drop = isDropTarget(slot.id)}
              {@const qs = slot.type === "OR_GROUP"
                ? [
                    ...(slot.choice1?.questions || []),
                    ...(slot.choice2?.questions || []),
                  ]
                : slot.questions || [slot]}

              <!-- Qn row: instruction + the Marks / COs / BTL column heads -->
              <tr class={drop ? "sub-drop" : ""}>
                <td class="text-center font-bold py-[3px] align-middle">
                  Q{qNo}
                </td>
                <td class="px-2 py-[3px] font-bold uppercase text-[8.5pt] align-middle">
                  <AssessmentEditable
                    value={section.instruction || "Attempt All Parts"}
                    onUpdate={(v: string) => {
                      section.instruction = v;
                      paperStructure = [...paperStructure];
                    }}
                    class="inline-block"
                  />
                </td>
                <td class="text-center font-bold py-[3px]">Marks</td>
                <td class="text-center font-bold py-[3px]">COs</td>
                <td class="text-center font-bold py-[3px]">BTL</td>
              </tr>

              <!-- one row per sub-part -->
              {#each qs as q, qIdx}
                <tr class="group/row {drop ? 'sub-drop' : ''}">
                  <td class="text-center font-bold py-[3px] align-top">
                    ({subLabel(q, qIdx)})
                  </td>
                  <td class="px-2 py-[3px] align-top relative">
                    <AssessmentRowActions
                      {isEditable}
                      onSwap={() =>
                        openSwapSidebar(
                          slot,
                          section.part,
                          slot.type === "OR_GROUP"
                            ? (slot.choice1?.questions || []).some(
                                (x: any) => x?.id === q.id,
                              )
                              ? "q1"
                              : "q2"
                            : undefined,
                          q.id,
                        )}
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
                  <td class="text-center align-top py-[3px] font-bold">
                    <AssessmentEditable
                      value={subMarks(q, section, qs.length)}
                      onUpdate={(v: string) =>
                        updateText(v, "QUESTION", "marks", slot.id, q.id)}
                      class="inline-block min-w-[1ch] text-center"
                    />
                  </td>
                  <td class="text-center align-top py-[3px]">
                    <AssessmentEditable
                      value={coOf(q)}
                      onUpdate={(v: string) =>
                        updateText(v, "QUESTION", "target_co", slot.id, q.id)}
                      class="inline-block min-w-[3ch] text-center"
                    />
                  </td>
                  <td class="text-center align-top py-[3px]">
                    <AssessmentEditable
                      value={rbtOf(q)}
                      onUpdate={(v: string) =>
                        updateText(v, "QUESTION", "k_level", slot.id, q.id)}
                      class="inline-block min-w-[3ch] text-center"
                    />
                  </td>
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      {/each}
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
  #subharti-mid-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Letterhead block + instruction bar share the outer rule */
  #subharti-mid-paper-actual :global(.sub-box) {
    border: 1px solid black !important;
    background: #f2f2f2;
  }
  /* Section tables: full grid */
  #subharti-mid-paper-actual :global(table.sub-grid),
  #subharti-mid-paper-actual :global(table.sub-grid td) {
    border: 1px solid black !important;
    border-collapse: collapse !important;
  }
  /* Metadata table inside the letterhead carries no rules */
  #subharti-mid-paper-actual :global(table.sub-plain),
  #subharti-mid-paper-actual :global(table.sub-plain td) {
    border: none !important;
    background: transparent;
  }
  #subharti-mid-paper-actual :global(tr.sub-drop > td) {
    background: rgba(16, 185, 129, 0.12) !important;
  }
  #subharti-mid-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    color: black !important;
    border: none !important;
    background: transparent !important;
  }
  #subharti-mid-paper-actual :global(.assessment-editable-input) {
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
    :global(#subharti-mid-paper-actual) {
      display: block !important;
      visibility: visible !important;
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 auto !important;
      padding: 1.3cm !important;
      box-shadow: none !important;
      border: none !important;
      background: white !important;
    }
    :global(.no-print),
    :global(.assessment-row-actions),
    :global(nav),
    :global(header),
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
