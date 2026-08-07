<script lang="ts">
  /**
   * SGU50SEMTemplate.svelte
   * SGU End Semester Examination — 50 Marks variant
   *
   * Layout-only specialization based on ADYPUSemTemplate.svelte.
   * All rendering/DnD/answer-sheet logic is reused verbatim.
   *
   * Paper structure (50M):
   *   Q1 : SINGLE slot, 1 sub-question (a) × 10M   — "Attempt the following Question."
   *   Q2–Q5 : OR_GROUP slots, 2 choices (a / b) × 10M — "Attempt the following Question."
   */
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

  const { ui: paperUi, move: movePaper } = installPaperUi({
    getSet: () => currentSetData,
    persist: (s) => {
      currentSetData = s;
      onSwap?.($state.snapshot(currentSetData));
    },
  });

  // ── Reused verbatim from ADYPUSemTemplate ──────────────────────────────────

  function rebuildAnswerSheet() {
    if (!currentSetData || Array.isArray(currentSetData)) return;
    const arr = currentSetData.questions || [];
    const newAnswers: any[] = [];
    arr.forEach((slot: any) => {
      const qs: any[] = [];
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

  function updateText(val: string, type: "META" | "QUESTION", key: string, slotId?: string, qId?: string) {
    if (!isEditable) return;
    if (type === "META") (paperMeta as any)[key] = val;
    else {
      const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
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
        q.text = val;
        q.question_text = val;
        if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
        else currentSetData.questions = [...currentSetData.questions];
        if (onSwap) { rebuildAnswerSheet(); onSwap($state.snapshot(currentSetData)); }
      }
    }
  }

  function removeQuestion(slot: any) {
    if (!confirm("Are you sure?")) return;
    if (Array.isArray(currentSetData))
      currentSetData = currentSetData.filter((s: any) => s.id !== slot.id);
    else
      currentSetData.questions = currentSetData.questions.filter((s: any) => s.id !== slot.id);
    if (onSwap) { rebuildAnswerSheet(); onSwap($state.snapshot(currentSetData)); }
  }

  function openSwapSidebar(slot: any, part: string, subPart?: "q1" | "q2") {
    const cQ =
      slot.type === "OR_GROUP"
        ? subPart === "q1"
          ? slot.choice1?.questions?.[0]
          : slot.choice2?.questions?.[0]
        : slot.questions?.[0] || slot;
    const marks = Number(cQ?.marks || slot.marks || paperStructure.find((s: any) => s.part === part)?.marks_per_q || 0);
    const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
    const index = arr.indexOf(slot);
    swapContext = { slotIndex: index, part, subPart, currentMark: marks, currentId: cQ?.id };
    isSwapSidebarOpen = true;
  }

  function selectAlternate(question: any) {
    if (!swapContext) return;
    const arr = Array.isArray(currentSetData) ? currentSetData : currentSetData.questions;
    const slot = arr[swapContext.slotIndex];
    const nQ = { id: question.id, text: question.question_text, marks: question.marks, options: question.options };
    if (slot.type === "OR_GROUP") {
      if (swapContext.subPart === "q1") slot.choice1.questions = [nQ];
      else slot.choice2.questions = [nQ];
    } else slot.questions = [nQ];
    if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
    else currentSetData.questions = [...currentSetData.questions];
    if (onSwap) { rebuildAnswerSheet(); onSwap($state.snapshot(currentSetData)); }
    isSwapSidebarOpen = false;
  }

  // ── Section/slot helpers ───────────────────────────────────────────────────

  function getQuestionsByPart(part: string | undefined | null) {
    if (!part) return [];
    const p = String(part).trim().toUpperCase();
    return (currentSetData?.questions || []).filter(
      (q: any) => q && String(q.part || "").trim().toUpperCase() === p,
    );
  }

  function getPreviousQuestionsCount(sIdx: number) {
    let count = 0;
    const qs = currentSetData?.questions || [];
    for (let i = 0; i < sIdx; i++) {
      const pId = paperStructure[i]?.part;
      if (!pId) continue;
      const part = String(pId).trim().toUpperCase();
      const partQs = qs.filter((q: any) => q && String(q.part || "").trim().toUpperCase() === part);
      partQs.forEach((s: any) => { count += s.type === "OR_GROUP" ? 1 : 1; });
    }
    return count;
  }

  function getSN(sectionQuestions: any[], slotIndex: number, sIdx: number) {
    const baseCount = 1 + getPreviousQuestionsCount(sIdx);
    return baseCount + slotIndex;
  }

  const getSubLabel = (idx: number) => String.fromCharCode(97 + idx);
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50">
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="sgu50-sem-paper-actual"
      class="mx-auto bg-white shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in; padding: 0.5in 0.6in;"
    >
      {#if isEditable}
        <div class="no-print absolute top-4 right-4 z-10">
          <AssessmentSolutionsToggle ui={paperUi} />
        </div>
      {/if}

      <!-- ═══ HEADER ═══ -->
      <!-- PRN box (left) | Course Code box (right) -->
      <table class="w-full border-collapse mb-2 text-[10pt]">
        <tbody>
          <tr>
            <td class="w-[50%] align-middle">
              <div class="flex items-center gap-2">
                <span class="font-bold border border-black px-2 py-0.5 whitespace-nowrap">PRN:</span>
                <div class="flex border border-black">
                  {#each Array(12) as _}
                    <div class="w-[18px] h-[18px] border-r border-black last:border-r-0"></div>
                  {/each}
                </div>
              </div>
            </td>
            <td class="w-[50%] align-middle text-right">
              <div class="flex items-center justify-end gap-2">
                <span class="font-bold border border-black px-2 py-0.5 whitespace-nowrap">Course Code :</span>
                <AssessmentEditable
                  value={paperMeta.course_code || ""}
                  onUpdate={(v: string) => updateText(v, "META", "course_code")}
                  class="font-bold text-[10pt] border border-black px-2 py-0.5 min-w-[80px] text-center"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Exam type line (italic) -->
      <div class="text-center italic text-[10pt] mb-1">
        <AssessmentEditable
          value={paperMeta.exam_title || "First Year B. Tech End Semester Examination Summer 2024"}
          onUpdate={(v: string) => updateText(v, "META", "exam_title")}
          class="text-center w-full"
        />
      </div>

      <!-- Subject name (bold centered large) -->
      <div class="text-center font-bold text-[14pt] mb-2">
        <AssessmentEditable
          value={paperMeta.subject_name || "Subject Name"}
          onUpdate={(v: string) => updateText(v, "META", "subject_name")}
          class="text-center w-full"
        />
      </div>

      <!-- Day/Date | Max Marks  and  Time | Duration -->
      <table class="w-full text-[10pt] mb-1">
        <tbody>
          <tr>
            <td class="w-[50%]">
              <span class="font-bold">Day and Date:</span>
              <AssessmentEditable
                value={paperMeta.paper_date || ""}
                onUpdate={(v: string) => updateText(v, "META", "paper_date")}
                class="inline-block ml-1"
              />
            </td>
            <td class="w-[50%] text-right">
              <span class="font-bold">Max Marks:</span>
              <AssessmentEditable
                value={paperMeta.max_marks || "50"}
                onUpdate={(v: string) => updateText(v, "META", "max_marks")}
                class="inline-block font-bold ml-1 min-w-[30px]"
              />
            </td>
          </tr>
          <tr>
            <td>
              <span class="font-bold">Time :</span>
              <AssessmentEditable
                value={paperMeta.exam_time || ""}
                onUpdate={(v: string) => updateText(v, "META", "exam_time")}
                class="inline-block ml-1"
              />
            </td>
            <td class="text-right">
              <span class="font-bold">Duration:</span>
              <AssessmentEditable
                value={paperMeta.duration_label || "02 hrs"}
                onUpdate={(v: string) => updateText(v, "META", "duration_label")}
                class="inline-block font-bold ml-1"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Instructions -->
      <div class="text-[9.5pt] mb-3 mt-1">
        <div class="font-normal mb-1">Instructions:</div>
        <AssessmentEditable
          value={paperMeta.instructions || "1. All questions are compulsory.\n2. Assume suitable data wherever necessary and mention it clearly."}
          onUpdate={(v: string) => updateText(v, "META", "instructions")}
          multiline={true}
          class="whitespace-pre-line pl-4"
        />
      </div>

      <!-- ═══ QUESTIONS TABLE ═══ -->
      <table class="w-full border-collapse border border-black text-[10pt]">
        <thead>
          <tr class="text-center font-bold">
            <th class="border border-black p-1 w-[45px]">Q.No</th>
            <th class="border border-black p-1 w-[35px]">Sub</th>
            <th class="border border-black p-1">Question</th>
            <th class="border border-black p-1 w-[50px]">Marks</th>
            <th class="border border-black p-1 w-[65px]">Bloom's<br/>Level</th>
            <th class="border border-black p-1 w-[35px]">CO</th>
          </tr>
        </thead>
        <tbody>
          {#each paperStructure as section, sIdx}
            {@const sectionQuestions = getQuestionsByPart(section.part)}

            {#if sectionQuestions.length > 0}
                {#each sectionQuestions as slot, i (slot.id + activeSet)}
                  {@const sn = getSN(sectionQuestions, i, sIdx)}
                  <!-- Prioritize section marks_per_q so bank question marks don't override the configured slot marks -->
                  {@const marks = section.marks_per_q || slot.marks || slot.questions?.[0]?.marks || slot.choice1?.questions?.[0]?.marks || ""}
                  {@const co = slot.co || slot.questions?.[0]?.co || section.co || `CO${sIdx + 1}`}
                  {@const bloom = slot.bloom || slot.questions?.[0]?.bloom || ""}

                  {#if slot.type === "OR_GROUP"}
                    {@const q1 = slot.choice1?.questions?.[0] || slot.choice1}
                    {@const q2 = slot.choice2?.questions?.[0] || slot.choice2}

                    <!-- Section header row for this Q -->
                    <tr>
                      <td colspan="6" class="border border-black p-1 font-bold text-[10pt]">
                        <AssessmentEditable
                          value={section.title || "Attempt the following Question."}
                          onUpdate={(v: string) => { section.title = v; paperStructure = [...paperStructure]; }}
                          class="w-full"
                        />
                      </td>
                    </tr>
                    <!-- choice a -->
                    <tr class="group/row">
                      <td class="border border-black p-1 text-center align-top font-bold">{sn}</td>
                      <td class="border border-black p-1 text-center align-top">a</td>
                      <td class="border border-black p-1 align-top relative">
                        <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part, "q1")} onDelete={() => removeQuestion(slot)} slotId={slot.id} class="!-left-10 !top-1 scale-75" />
                        <AssessmentEditable value={q1?.text || q1?.question_text || ""} onUpdate={(v: string) => updateText(v, "QUESTION", "text", slot.id, q1?.id)} multiline={true} />
                        {#if paperUi.showSolutions}
                          <div class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]">
                            <div class="text-[8pt] font-bold uppercase mb-1 text-blue-600">Solution</div>
                            <AssessmentEditable value={q1?.answer_key || q1?.answer || ""} onUpdate={(v: string) => { if (q1) q1.answer_key = v; }} multiline={true} />
                          </div>
                        {/if}
                      </td>
                      <td class="border border-black p-1 text-center align-top">
                        <AssessmentEditable value={String(marks)} onUpdate={(v: string) => { section.marks_per_q = Number(v) || v; paperStructure = [...paperStructure]; }} class="text-center" />
                      </td>
                      <td class="border border-black p-1 text-center align-top">
                        <AssessmentEditable value={String(q1?.bloom_level || bloom || "")} onUpdate={(v: string) => { if (q1) q1.bloom_level = v; }} class="text-center" />
                      </td>
                      <td class="border border-black p-1 text-center align-top font-bold">
                        <AssessmentEditable value={co} onUpdate={(v: string) => { section.co = v; paperStructure = [...paperStructure]; }} class="text-center" />
                      </td>
                    </tr>
                    <!-- OR divider -->
                    <tr>
                      <td class="border border-black p-1 text-center align-top font-bold"></td>
                      <td colspan="5" class="border border-black p-1 text-center italic font-bold text-[9pt]">OR</td>
                    </tr>
                    <!-- choice b -->
                    <tr class="group/row">
                      <td class="border border-black p-1 text-center align-top font-bold"></td>
                      <td class="border border-black p-1 text-center align-top">b</td>
                      <td class="border border-black p-1 align-top relative">
                        <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part, "q2")} onDelete={() => removeQuestion(slot)} class="!-left-10 !top-1 scale-75" />
                        <AssessmentEditable value={q2?.text || q2?.question_text || ""} onUpdate={(v: string) => updateText(v, "QUESTION", "text", slot.id, q2?.id)} multiline={true} />
                        {#if paperUi.showSolutions}
                          <div class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]">
                            <div class="text-[8pt] font-bold uppercase mb-1 text-blue-600">Solution</div>
                            <AssessmentEditable value={q2?.answer_key || q2?.answer || ""} onUpdate={(v: string) => { if (q2) q2.answer_key = v; }} multiline={true} />
                          </div>
                        {/if}
                      </td>
                      <td class="border border-black p-1 text-center align-top">
                        <AssessmentEditable value={String(marks)} onUpdate={(v: string) => { section.marks_per_q = Number(v) || v; paperStructure = [...paperStructure]; }} class="text-center" />
                      </td>
                      <td class="border border-black p-1 text-center align-top">
                        <AssessmentEditable value={String(q2?.bloom_level || bloom || "")} onUpdate={(v: string) => { if (q2) q2.bloom_level = v; }} class="text-center" />
                      </td>
                      <td class="border border-black p-1 text-center align-top"></td>
                    </tr>

                  {:else}
                    <!-- SINGLE slot (Q1 — plain single question, no sub-questions for 50M) -->
                    {@const questions = slot.questions && slot.questions.length > 0 ? slot.questions : [slot]}

                    <!-- Section header row -->
                    <tr>
                      <td colspan="6" class="border border-black p-1 font-bold text-[10pt]">
                        <AssessmentEditable
                          value={section.title || "Attempt the following Question."}
                          onUpdate={(v: string) => { section.title = v; paperStructure = [...paperStructure]; }}
                          class="w-full"
                        />
                      </td>
                    </tr>

                    {#each questions as q, qIdx}
                      <tr class="group/row">
                        <td class="border border-black p-1 text-center align-top font-bold">{#if qIdx === 0}{sn}{/if}</td>
                        <td class="border border-black p-1 text-center align-top">
                          {#if questions.length > 1}{getSubLabel(qIdx)}{/if}
                        </td>
                        <td class="border border-black p-1 align-top relative">
                          <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part)} onDelete={() => removeQuestion(slot)} slotId={qIdx === 0 ? slot.id : null} class="!-left-10 !top-1 scale-75" />
                          <AssessmentEditable value={q.text || q.question_text || ""} onUpdate={(v: string) => updateText(v, "QUESTION", "text", slot.id, q.id)} multiline={true} />
                          {#if paperUi.showSolutions}
                            <div class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-900 text-[10pt]">
                              <div class="text-[8pt] font-bold uppercase mb-1 text-blue-600">Solution</div>
                              <AssessmentEditable value={q.answer_key || q.answer || ""} onUpdate={(v: string) => { q.answer_key = v; }} multiline={true} />
                            </div>
                          {/if}
                        </td>
                        <td class="border border-black p-1 text-center align-top">
                          <AssessmentEditable value={String(marks)} onUpdate={(v: string) => { section.marks_per_q = Number(v) || v; paperStructure = [...paperStructure]; }} class="text-center" />
                        </td>
                        <td class="border border-black p-1 text-center align-top">
                          <AssessmentEditable value={String(q.bloom_level || bloom || "")} onUpdate={(v: string) => { q.bloom_level = v; }} class="text-center" />
                        </td>
                        <td class="border border-black p-1 text-center align-top font-bold">
                          {#if qIdx === 0}
                            <AssessmentEditable value={co} onUpdate={(v: string) => { section.co = v; paperStructure = [...paperStructure]; }} class="text-center" />
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  {/if}

                {/each}
            {/if}

            <!-- Preview placeholders when no questions generated yet -->
            {#if sectionQuestions.length === 0 && mode === "preview"}
              {#each section.slots || [] as slot, i}
                <tr>
                  <td colspan="6" class="border border-black p-1 font-bold">{section.title || "Attempt the following Question."}</td>
                </tr>
                <tr class="opacity-40">
                  <td class="border border-black p-1 text-center">{i + 1 + getPreviousQuestionsCount(sIdx)}</td>
                  <td class="border border-black p-1 text-center">a</td>
                  <td class="border border-black p-1 italic text-[9pt]">[ {slot.qType || "NORMAL"} ] Question — {slot.marks || section.marks_per_q} Marks</td>
                  <td class="border border-black p-1 text-center">{slot.marks || section.marks_per_q}</td>
                  <td class="border border-black p-1"></td>
                  <td class="border border-black p-1"></td>
                </tr>
              {/each}
            {/if}
          {/each}
        </tbody>
      </table>

      <!-- Footer -->
      <div class="mt-4 text-center text-[9pt]">**********</div>
      <div class="mt-2 text-[9pt] italic">
        Note: <AssessmentEditable
          value={paperMeta.footer_note || "It is sample question paper only. Combination of questions from unit 2 to 5 may be changed as per Examiner's choice in question No. 2 to 5."}
          onUpdate={(v: string) => updateText(v, "META", "footer_note")}
          class="inline"
        />
      </div>
      <div class="absolute bottom-[0.4in] right-[0.6in] text-[9pt]">Page 1 of 1</div>
    </div>
  </div>

  {#if isSwapSidebarOpen && swapContext}
    <SwapQuestionSidebar
      isOpen={isSwapSidebarOpen}
      context={swapContext}
      {questionPool}
      onSelect={selectAlternate}
      onClose={() => (isSwapSidebarOpen = false)}
    />
  {/if}
</div>
