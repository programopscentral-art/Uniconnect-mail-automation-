<script lang="ts">
  /**
   * Ajeenkya D. Y. Patil University — Unit Test (MID) question paper.
   *
   * LAYOUT-ONLY specialisation of CrescentMidTemplate, taken via its Subharti
   * sibling because that is the one Crescent-family template that already
   * renders a numbered question carrying lettered sub-parts — exactly ADYPU's
   * "1. Multiple Choice Questions: a) … e)". Every piece of behaviour is the
   * shared implementation, copied rather than re-derived.
   *
   * Reused as-is (do not fork):
   *   - installPaperUi()       → reordering (handle drag) + Solutions Mode
   *   - AssessmentRowActions   → swap + drag grip + delete per slot
   *   - AssessmentEditable     → every editable field, meta and question
   *   - AssessmentMcqOptions   → MCQ option rendering (labelFormat="close")
   *   - SwapQuestionSidebar    → the swap picker
   *   - buildSwappedQuestion() → the canonical swapped-question shape, so the
   *                              answer key travels with a swapped question
   *   - rebuildAnswerSheet()   → identical to Standard/Crescent implementation
   *
   * Two deliberate deltas from the Subharti copy, both behavioural fixes to
   * shared-shaped code rather than ADYPU logic:
   *   - selectAlternate builds the replacement with buildSwappedQuestion()
   *     instead of an inline object literal.
   *   - openSwapSidebar targets the sub-question that was clicked. The copied
   *     version always pointed the picker at sub-part (a), so swapping (d) of
   *     a five-part MCQ question highlighted the wrong "current" question.
   *
   * ADYPU-specific (allowed customisation only):
   *   - one ruled table: centred letterhead (two black lines, two red), a
   *     Time / Max. Marks row, blank spacer rows, and per-section bands
   *     "Attempt any two ……… 5 x 2 = 10"
   *   - question numbering presentation: 1. 2. 3. … continuous across
   *     sections, sub-parts and options as a) b) c)
   *   - fixed letterhead lines use adypu_* metadata keys, because the paper
   *     page force-fills univ_line_1 / univ_line_2 on every paper, so a plain
   *     `|| default` on those could never win. Each stays editable.
   */
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentMcqOptions from "./shared/AssessmentMcqOptions.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
  import AssessmentSolutionsToggle from "./shared/AssessmentSolutionsToggle.svelte";
  import SwapQuestionSidebar from "./shared/SwapQuestionSidebar.svelte";
  import { installPaperUi } from "./shared/paperUi.svelte";
  import { buildSwappedQuestion } from "./shared/swapQuestion";

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
      // The clicked sub-part, not always (a).
      targetQuestion =
        (subQuestionId &&
          slot.questions.find((q: any) => q?.id === subQuestionId)) ||
        slot.questions[0];
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
    const nQ = buildSwappedQuestion(question, {
      marks: question.marks ?? swapContext.currentMark,
      part: swapContext.part,
    });

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
   * Presentation-only numbering: 1. 2. 3. … one per slot, in stored order and
   * continuous across sections. An OR group consumes two numbers. Slot order is
   * never recomputed.
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

  // ── Presentation helpers (ADYPU sheet) ──────────────────────────────────

  // ADYPU prints sub-parts as a) b) c) …
  const subLabel = (q: any, idx: number) =>
    String(q?.sub_label || String.fromCharCode(97 + idx)).toLowerCase();

  const isMcq = (q: any) =>
    (Array.isArray(q?.options) && q.options.length > 0) ||
    String(q?.type || "").toUpperCase() === "MCQ";

  // A numbered question made only of MCQs carries the "Multiple Choice
  // Questions:" heading, as on the sheet.
  const isMcqGroup = (qs: any[]) => qs.length > 1 && qs.every(isMcq);

  const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six"];
  const bandTitle = (section: any) =>
    section?.title ||
    `Attempt any ${NUMBER_WORDS[Number(section?.answered_count)] || section?.answered_count || "two"}`;

  // "5 x 2 = 10" — read straight off the section's own marks and count.
  const bandFormula = (section: any) => {
    if (section?.marks_label) return section.marks_label;
    const per = Number(section?.marks_per_q) || 0;
    const count = Number(section?.answered_count) || 0;
    return per && count ? `${per} x ${count} = ${per * count}` : "";
  };

  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const romanSemester = (s: any) => {
    const n = parseInt(String(s ?? "").replace(/[^0-9]/g, ""), 10);
    return ROMAN[n] || String(s ?? "").toUpperCase();
  };

  // Programme code inside "B.TECH(CSE)". Keeps an explicit (CODE), maps the
  // Computer Science branches to CSE as the sheet prints them, otherwise uses
  // initials. Only the default — the whole line is editable.
  const branchCode = (programme: any) => {
    const p = String(programme || "").trim();
    const bracketed = p.match(/\(([A-Za-z&]{2,8})\)/);
    if (bracketed) return bracketed[1].toUpperCase();
    if (!p || /computer\s*science/i.test(p)) return "CSE";
    if (/^[A-Z&]{2,8}$/.test(p)) return p;
    const initials = p
      .split(/[\s\-/]+/)
      .filter((w) => w && !/^(and|&|of|in|the|b\.?tech)$/i.test(w))
      .map((w) => w[0].toUpperCase())
      .join("");
    return initials || "CSE";
  };

  const programmeLine = $derived(
    paperMeta.adypu_programme_line ||
      `B.TECH(${branchCode(paperMeta.programme)}) - ${romanSemester(paperMeta.semester)} SEMESTER`,
  );

  // "60" → "1 Hrs.", "90" → "1.5 Hrs."
  const hoursText = (mins: any) => {
    const m = parseFloat(String(mins ?? ""));
    if (!Number.isFinite(m) || m <= 0) return "1 Hrs.";
    const h = m / 60;
    return `${Number.isInteger(h) ? h : Number(h.toFixed(1))} Hrs.`;
  };

  // Read-only drop-target highlight, driven by the shared drag controller.
  const isDropTarget = (slotId: string) =>
    !!paperDrag &&
    paperDrag.overId === slotId &&
    paperDrag.activeId !== slotId;
</script>

<!-- One numbered question's body: optional MCQ heading, then each part. -->
{#snippet questionParts(
  slot: any,
  section: any,
  qs: any[],
  subPart: "q1" | "q2" | undefined,
  withGrip: boolean,
)}
  {#if isMcqGroup(qs)}
    <div class="adypu-mcq-head">
      <AssessmentEditable
        value={paperMeta.adypu_mcq_heading || "Multiple Choice Questions:"}
        onUpdate={(v: string) => updateText(v, "META", "adypu_mcq_heading")}
        class="inline-block"
      />
    </div>
  {/if}
  {#each qs as q, qIdx}
    <div class="relative group/row {qs.length > 1 ? 'adypu-part' : ''}">
      <AssessmentRowActions
        {isEditable}
        onSwap={() => openSwapSidebar(slot, section.part, subPart, q.id)}
        onDelete={() => removeQuestion(slot)}
        slotId={withGrip && qIdx === 0 ? slot.id : null}
        class="!-left-14 !top-0 scale-75"
      />
      <div class="flex items-baseline gap-1">
        {#if qs.length > 1}
          <span class="shrink-0 pl-[3px]">{subLabel(q, qIdx)})</span>
        {/if}
        <div class="flex-1 min-w-0 leading-snug">
          <AssessmentEditable
            value={q.text || q.question_text || ""}
            onUpdate={(v: string) =>
              updateText(v, "QUESTION", "text", slot.id, q.id)}
            multiline={true}
          />
        </div>
      </div>
      {#if q.options?.length > 0}
        <div class="adypu-options">
          <AssessmentMcqOptions
            options={q.options}
            labelFormat="close"
            class="!mt-0 !grid-cols-1 !gap-y-0 !gap-x-0 !opacity-100 !not-italic !text-[9.5pt] leading-snug"
          />
        </div>
      {/if}
      {#if q.image_url}
        <div class="mt-1.5 max-w-full overflow-hidden">
          <img src={q.image_url} alt="Question" class="max-h-[240px] object-contain" />
        </div>
      {/if}
      {#if paperUi.showSolutions}
        <div class="no-print mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-blue-900">
          <div class="text-[7.5pt] font-bold uppercase tracking-wider mb-0.5 text-blue-600">
            Solution / Answer Key
          </div>
          <AssessmentEditable
            value={q.answer_key || q.answer || ""}
            onUpdate={(v: string) =>
              updateText(v, "QUESTION", "answer_key", slot.id, q.id)}
            multiline={true}
            class="!text-[9pt]"
          />
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="adypu-mid-paper-actual"
      class="mx-auto bg-white text-black relative shadow-lg transition-all duration-500"
      style="width: 8.27in; min-height: 11.69in; padding: 0.6in 0.6in;"
    >
      {#if isEditable}
        <div class="no-print absolute top-4 right-4 z-10">
          <AssessmentSolutionsToggle ui={paperUi} />
        </div>
      {/if}

      <table class="w-full adypu-grid text-[9.5pt]">
        <colgroup>
          <col style="width: 5.5%;" />
          <col />
        </colgroup>
        <tbody>
          <!-- ══════════ LETTERHEAD ══════════ -->
          <tr>
            <td colspan="2" class="adypu-head text-center pt-6 pb-4">
              <div>
                <AssessmentEditable
                  value={paperMeta.adypu_univ_name || "AJEENKYA D. Y. PATIL UNIVERSITY"}
                  onUpdate={(v: string) => updateText(v, "META", "adypu_univ_name")}
                  class="w-full text-center"
                />
              </div>
              <div>
                <AssessmentEditable
                  value={paperMeta.exam_title || "UNIT TEST – FEB-2026"}
                  onUpdate={(v: string) => updateText(v, "META", "exam_title")}
                  class="w-full text-center"
                />
              </div>
              <div class="adypu-red">
                <AssessmentEditable
                  value={programmeLine}
                  onUpdate={(v: string) => updateText(v, "META", "adypu_programme_line")}
                  class="w-full text-center"
                />
              </div>
              <div class="adypu-red uppercase">
                <AssessmentEditable
                  value={paperMeta.subject_name || ""}
                  onUpdate={(v: string) => updateText(v, "META", "subject_name")}
                  class="w-full text-center"
                />
              </div>
            </td>
          </tr>

          <!-- ══════════ TIME / MAX. MARKS ══════════ -->
          <tr>
            <td colspan="2" class="adypu-head px-1.5 py-[3px]">
              <div class="flex items-start justify-between gap-4">
                <span class="whitespace-nowrap">
                  Time:
                  <AssessmentEditable
                    value={paperMeta.adypu_time_text || hoursText(paperMeta.duration_minutes)}
                    onUpdate={(v: string) => updateText(v, "META", "adypu_time_text")}
                    class="inline-block min-w-[4ch]"
                  />
                </span>
                <span class="whitespace-nowrap">
                  Max. Marks:
                  <AssessmentEditable
                    value={paperMeta.max_marks || "20"}
                    onUpdate={(v: string) => updateText(v, "META", "max_marks")}
                    class="inline-block min-w-[2ch]"
                  />
                </span>
              </div>
            </td>
          </tr>

          <!-- ══════════ SECTIONS ══════════ -->
          {#each paperStructure as section, sIdx}
            {@const sectionQs = questionsByPart(section.part)}

            <!-- blank ruled row before every band, as on the sheet -->
            <tr><td colspan="2" class="adypu-gap"></td></tr>

            <!-- band: "Attempt any two ………… 5 x 2 = 10" -->
            <tr>
              <td colspan="2" class="adypu-band px-1.5 py-[2px]">
                <div class="flex items-center justify-between gap-4">
                  <AssessmentEditable
                    value={bandTitle(section)}
                    onUpdate={(v: string) => {
                      section.title = v;
                      paperStructure = [...paperStructure];
                    }}
                    class="inline-block"
                  />
                  <span class="pr-3">
                    <AssessmentEditable
                      value={bandFormula(section)}
                      onUpdate={(v: string) => {
                        section.marks_label = v;
                        paperStructure = [...paperStructure];
                      }}
                      class="inline-block min-w-[6ch] text-right"
                    />
                  </span>
                </div>
              </td>
            </tr>

            {#each sectionQs as slot, i (slot.id + activeSet + swapCounter)}
              {@const qNo = slotNumberStart(sIdx, i)}
              {@const drop = isDropTarget(slot.id)}

              {#if slot.type === "OR_GROUP"}
                <tr class={drop ? "adypu-drop" : ""}>
                  <td class="adypu-num">{qNo}.</td>
                  <td class="adypu-body">
                    {@render questionParts(slot, section, slot.choice1?.questions || [], "q1", true)}
                  </td>
                </tr>
                <tr class={drop ? "adypu-drop" : ""}>
                  <td colspan="2" class="text-center font-bold py-[2px]">OR</td>
                </tr>
                <tr class={drop ? "adypu-drop" : ""}>
                  <td class="adypu-num">{qNo + 1}.</td>
                  <td class="adypu-body">
                    {@render questionParts(slot, section, slot.choice2?.questions || [], "q2", false)}
                  </td>
                </tr>
              {:else}
                <tr class={drop ? "adypu-drop" : ""}>
                  <td class="adypu-num">{qNo}.</td>
                  <td class="adypu-body">
                    {@render questionParts(slot, section, slot.questions || [slot], undefined, true)}
                  </td>
                </tr>
              {/if}
            {/each}
          {/each}
        </tbody>
      </table>
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
  #adypu-mid-paper-actual {
    /* The sheet is set in Calibri (letterhead) over Arial (questions). Carlito
       is Calibri's metric-compatible stand-in where Calibri isn't installed. */
    font-family: Arial, Helvetica, sans-serif;
    color: black !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Single ruled table, like the Word original */
  #adypu-mid-paper-actual :global(table.adypu-grid),
  #adypu-mid-paper-actual :global(table.adypu-grid td) {
    border: 1px solid black !important;
    border-collapse: collapse !important;
  }
  #adypu-mid-paper-actual :global(td.adypu-head) {
    font-family: Calibri, Carlito, Arial, Helvetica, sans-serif;
    font-weight: 700;
    font-size: 10.5pt;
    line-height: 1.3;
  }
  #adypu-mid-paper-actual :global(.adypu-red) {
    color: #ff0000 !important;
  }
  #adypu-mid-paper-actual :global(.adypu-red .assessment-editable-container) {
    color: #ff0000 !important;
  }
  #adypu-mid-paper-actual :global(td.adypu-gap) {
    height: 16px;
    padding: 0;
  }
  #adypu-mid-paper-actual :global(td.adypu-band) {
    font-family: Calibri, Carlito, Arial, Helvetica, sans-serif;
    font-weight: 700;
    font-style: italic;
    font-size: 10pt;
  }
  #adypu-mid-paper-actual :global(td.adypu-num) {
    text-align: center;
    vertical-align: top;
    padding: 3px 2px;
  }
  #adypu-mid-paper-actual :global(td.adypu-body) {
    vertical-align: top;
    padding: 3px 6px 6px 4px;
  }
  /* Q1-style multi-part question: heading, gap, part, gap, options, wider gap */
  #adypu-mid-paper-actual :global(.adypu-mcq-head) {
    margin-bottom: 14px;
  }
  #adypu-mid-paper-actual :global(.adypu-part + .adypu-part) {
    margin-top: 28px;
  }
  #adypu-mid-paper-actual :global(.adypu-options) {
    margin-top: 14px;
  }
  #adypu-mid-paper-actual :global(tr.adypu-drop > td) {
    background: rgba(16, 185, 129, 0.12) !important;
  }
  #adypu-mid-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    font-style: inherit;
    color: black !important;
    border: none !important;
    background: transparent !important;
  }
  #adypu-mid-paper-actual :global(.assessment-editable-input) {
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
    :global(#adypu-mid-paper-actual) {
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
