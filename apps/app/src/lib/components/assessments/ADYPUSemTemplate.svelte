<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
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

  // ── Mandatory Logic Reuse: mirrored from ADYPUTemplate / StandardTemplate ──

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

  // Question numbering: continuous across sections
  function getPreviousQuestionsCount(sIdx: number) {
    let count = 0;
    const qs = currentSetData?.questions || [];
    for (let i = 0; i < sIdx; i++) {
      const pId = paperStructure[i]?.part;
      if (!pId) continue;
      const part = String(pId).trim().toUpperCase();
      const partQs = qs.filter(
        (q: any) => q && String(q.part || "").trim().toUpperCase() === part,
      );
      partQs.forEach((s: any) => {
        count += s.type === "OR_GROUP" ? 2 : 1;
      });
    }
    return count;
  }

  function getSN(sectionQuestions: any[], slotIndex: number, sIdx: number) {
    const baseCount = 1 + getPreviousQuestionsCount(sIdx);
    let offset = 0;
    for (let i = 0; i < slotIndex; i++) {
      const s: any = sectionQuestions[i];
      offset += s.type === "OR_GROUP" ? 2 : 1;
    }
    return baseCount + offset;
  }

  const getSubLabel = (idx: number) => String.fromCharCode(97 + idx);
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="adypu-sem-paper-actual"
      class="mx-auto bg-white p-[0.6in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- ═══ HEADER ═══ -->
      <div class="flex items-start justify-between mb-3">
        <div class="w-[80px]">
          <img src="/adypu-logo.png" alt="University Logo" class="w-[70px] h-auto" onerror={(e: Event) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div class="flex-1 text-right italic text-[11pt] font-bold">
          <AssessmentEditable
            value={paperMeta.office_title || "Office of the Controller of Examinations."}
            onUpdate={(v: string) => updateText(v, "META", "office_title")}
            class="text-right"
          />
        </div>
      </div>

      <!-- Student URN -->
      <div class="flex items-center justify-end gap-2 mb-4">
        <span class="text-[10pt] font-bold border border-black px-2 py-0.5">Student URN →</span>
        <div class="flex border border-black">
          {#each Array(20) as _}
            <div class="w-[14px] h-[18px] border-r border-black last:border-r-0"></div>
          {/each}
        </div>
      </div>

      <!-- ═══ METADATA TABLE ═══ -->
      <table class="w-full border-collapse border border-black text-[10pt] mb-4">
        <tbody>
          <tr>
            <td class="border border-black p-1.5 font-bold" colspan="4">
              <span>School Name: </span>
              <AssessmentEditable
                value={paperMeta.school_name || "School of Engineering"}
                onUpdate={(v: string) => updateText(v, "META", "school_name")}
                class="inline-block font-normal"
              />
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1.5 font-bold w-[50%]">
              <span>Course: </span>
              <AssessmentEditable
                value={paperMeta.subject_name || ""}
                onUpdate={(v: string) => updateText(v, "META", "subject_name")}
                class="inline-block font-normal"
              />
            </td>
            <td class="border border-black p-1.5 font-bold w-[50%]">
              <span>Course Code: </span>
              <AssessmentEditable
                value={paperMeta.course_code || ""}
                onUpdate={(v: string) => updateText(v, "META", "course_code")}
                class="inline-block font-normal"
              />
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1.5 font-bold">
              <span>Program Code: </span>
              <AssessmentEditable
                value={paperMeta.programme || ""}
                onUpdate={(v: string) => updateText(v, "META", "programme")}
                class="inline-block font-normal"
              />
            </td>
            <td class="border border-black p-1.5 font-bold">
              <div class="flex gap-4">
                <span>Sem: <AssessmentEditable
                  value={paperMeta.semester || "V"}
                  onUpdate={(v: string) => updateText(v, "META", "semester")}
                  class="inline-block font-normal"
                /></span>
                <span>Course Type: <AssessmentEditable
                  value={paperMeta.course_type || "Major"}
                  onUpdate={(v: string) => updateText(v, "META", "course_type")}
                  class="inline-block font-normal italic"
                /></span>
              </div>
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1.5 font-bold">
              <span>Maximum Marks: </span>
              <AssessmentEditable
                value={paperMeta.max_marks || "50"}
                onUpdate={(v: string) => updateText(v, "META", "max_marks")}
                class="inline-block font-normal"
              />
            </td>
            <td class="border border-black p-1.5 font-bold">
              <span>Duration: </span>
              <AssessmentEditable
                value={paperMeta.duration_label || "02:00 Hours"}
                onUpdate={(v: string) => updateText(v, "META", "duration_label")}
                class="inline-block font-normal"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ═══ INSTRUCTIONS ═══ -->
      <div class="border border-black p-2 mb-4 text-[9.5pt]">
        <div class="font-bold mb-1">Instructions to Students:</div>
        <div class="pl-4">
          <AssessmentEditable
            value={paperMeta.instructions || "1. Attempt all the questions.\n2. Draw necessary diagram if required.\n3. Assume data as per question if required.\n4. Marked are indicated."}
            onUpdate={(v: string) => updateText(v, "META", "instructions")}
            multiline={true}
            class="whitespace-pre-line"
          />
        </div>
      </div>

      <!-- ═══ QUESTIONS TABLE ═══ -->
      <table class="w-full border-collapse border border-black text-[10pt]">
        <thead>
          <tr class="font-bold text-center">
            <th class="border border-black p-1.5 w-[40px]">Q.<br/>No.</th>
            <th class="border border-black p-1.5 w-[35px]">Sub<br/>Q.</th>
            <th class="border border-black p-1.5">Question</th>
            <th class="border border-black p-1.5 w-[50px]">Marks</th>
            <th class="border border-black p-1.5 w-[70px]">Bloom's<br/>Taxonom<br/>y Level</th>
            <th class="border border-black p-1.5 w-[35px]">C<br/>O</th>
          </tr>
        </thead>
        <tbody>
          {#each paperStructure as section, sIdx}
            {@const sectionQuestions = getQuestionsByPart(section.part)}

            {#if sectionQuestions.length > 0 || mode === "preview"}
              <!-- Section Header: "Attempt any one" / "Attempt any Two" -->
              <tr>
                <td colspan="6" class="border border-black p-1.5 text-center font-bold text-[10pt]">
                  <AssessmentEditable
                    value={section.title || `Attempt any ${section.answered_count || "all"}`}
                    onUpdate={(v: string) => {
                      section.title = v;
                      paperStructure = [...paperStructure];
                    }}
                    class="text-center"
                  />
                </td>
              </tr>

              <!-- DnD zone wrapping question rows -->
              <tr>
                <td colspan="6" class="p-0 border-0">
                  <table class="w-full border-collapse">
                    <tbody
                      use:dndzone={{
                        items: sectionQuestions,
                        flipDurationMs: 200,
                        dragDisabled: !isEditable,
                      }}
                      onconsider={(e: any) => handleDndSync(section.part, e.detail.items)}
                      onfinalize={(e: any) => handleDndSync(section.part, e.detail.items)}
                    >
                      {#each sectionQuestions as slot, i (slot.id + activeSet)}
                        {@const sn = getSN(sectionQuestions, i, sIdx)}
                        {@const questions = slot.type === "OR_GROUP" ? [] : (slot.questions && slot.questions.length > 0 ? slot.questions : [slot])}
                        {@const marks = slot.marks || slot.questions?.[0]?.marks || slot.choice1?.questions?.[0]?.marks || section.marks_per_q || ""}
                        {@const co = slot.co || slot.questions?.[0]?.co || section.co || paperStructure[sIdx]?.co || ""}
                        {@const bloom = slot.bloom || slot.questions?.[0]?.bloom || ""}

                        {#if slot.type === "OR_GROUP"}
                          {@const q1 = slot.choice1?.questions?.[0] || slot.choice1}
                          {@const q2 = slot.choice2?.questions?.[0] || slot.choice2}
                          <!-- Choice 1 -->
                          <tr class="group/row">
                            <td class="border border-black p-1.5 text-center align-top font-bold w-[40px]" rowspan="1">
                              {sn}
                            </td>
                            <td class="border border-black p-1.5 text-center align-top w-[35px]">a</td>
                            <td class="border border-black p-1.5 align-top relative">
                              <AssessmentRowActions
                                {isEditable}
                                onSwap={() => openSwapSidebar(slot, section.part, "q1")}
                                onDelete={() => removeQuestion(slot)}
                                class="!-left-10 !top-1 scale-75"
                              />
                              <AssessmentEditable
                                value={q1.text || q1.question_text || q1.question || q1.description || ""}
                                onUpdate={(v: string) => updateText(v, "QUESTION", "text", slot.id, q1.id)}
                                multiline={true}
                              />
                            </td>
                            <td class="border border-black p-1.5 text-center align-top w-[50px]">
                              <AssessmentEditable
                                value={String(q1.marks || marks)}
                                onUpdate={(v: string) => {
                                  q1.marks = Number(v) || v;
                                  if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
                                  else currentSetData.questions = [...currentSetData.questions];
                                }}
                                class="text-center"
                              />
                            </td>
                            <td class="border border-black p-1.5 text-center align-top w-[70px]"></td>
                            <td class="border border-black p-1.5 text-center align-top font-bold w-[35px]">
                              <AssessmentEditable
                                value={co || `CO${sIdx + 1}`}
                                onUpdate={(v: string) => {
                                  section.co = v;
                                  paperStructure = [...paperStructure];
                                }}
                                class="text-center"
                              />
                            </td>
                          </tr>
                          <!-- Choice 2 -->
                          <tr class="group/row">
                            <td class="border border-black p-1.5 text-center align-top font-bold w-[40px]"></td>
                            <td class="border border-black p-1.5 text-center align-top w-[35px]">b</td>
                            <td class="border border-black p-1.5 align-top relative">
                              <AssessmentRowActions
                                {isEditable}
                                onSwap={() => openSwapSidebar(slot, section.part, "q2")}
                                onDelete={() => removeQuestion(slot)}
                                class="!-left-10 !top-1 scale-75"
                              />
                              <AssessmentEditable
                                value={q2.text || q2.question_text || q2.question || q2.description || ""}
                                onUpdate={(v: string) => updateText(v, "QUESTION", "text", slot.id, q2.id)}
                                multiline={true}
                              />
                            </td>
                            <td class="border border-black p-1.5 text-center align-top w-[50px]">
                              <AssessmentEditable
                                value={String(q2.marks || marks)}
                                onUpdate={(v: string) => {
                                  q2.marks = Number(v) || v;
                                  if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
                                  else currentSetData.questions = [...currentSetData.questions];
                                }}
                                class="text-center"
                              />
                            </td>
                            <td class="border border-black p-1.5 text-center align-top w-[70px]"></td>
                            <td class="border border-black p-1.5 text-center align-top w-[35px]"></td>
                          </tr>
                        {:else}
                          <!-- Single question or multi-sub-question slot -->
                          {#each questions as q, qIdx}
                            <tr class="group/row">
                              <td class="border border-black p-1.5 text-center align-top font-bold w-[40px]">
                                {#if qIdx === 0}{sn}{/if}
                              </td>
                              <td class="border border-black p-1.5 text-center align-top w-[35px]">
                                {#if questions.length > 1}{getSubLabel(qIdx)}{/if}
                              </td>
                              <td class="border border-black p-1.5 align-top relative">
                                <AssessmentRowActions
                                  {isEditable}
                                  onSwap={() => openSwapSidebar(slot, section.part)}
                                  onDelete={() => removeQuestion(slot)}
                                  class="!-left-10 !top-1 scale-75"
                                />
                                <AssessmentEditable
                                  value={q.text || q.question_text || q.question || q.description || ""}
                                  onUpdate={(v: string) => updateText(v, "QUESTION", "text", slot.id, q.id)}
                                  multiline={true}
                                />
                                {#if q.options && q.options.length > 0}
                                  <div class="grid grid-cols-2 gap-x-6 gap-y-0.5 mt-2 text-[9.5pt]">
                                    {#each q.options as opt, oIdx}
                                      <div class="flex gap-1.5">
                                        <span class="font-bold">{String.fromCharCode(65 + oIdx)})</span>
                                        <span>{opt}</span>
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                                {#if q.image_url}
                                  <div class="mt-2">
                                    <img src={q.image_url} alt="Question" class="max-h-[200px] object-contain border border-gray-100 rounded" />
                                  </div>
                                {/if}
                              </td>
                              <td class="border border-black p-1.5 text-center align-top w-[50px]">
                                <AssessmentEditable
                                  value={String(q.marks || marks)}
                                  onUpdate={(v: string) => {
                                    q.marks = Number(v) || v;
                                    if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
                                    else currentSetData.questions = [...currentSetData.questions];
                                  }}
                                  class="text-center"
                                />
                              </td>
                              <td class="border border-black p-1.5 text-center align-top w-[70px]">
                                <AssessmentEditable
                                  value={q.bloom || bloom}
                                  onUpdate={(v: string) => {
                                    q.bloom = v;
                                    if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
                                    else currentSetData.questions = [...currentSetData.questions];
                                  }}
                                  class="text-center"
                                />
                              </td>
                              <td class="border border-black p-1.5 text-center align-top font-bold w-[35px]">
                                {#if qIdx === 0}
                                  <AssessmentEditable
                                    value={co || `CO${sIdx + 1}`}
                                    onUpdate={(v: string) => {
                                      section.co = v;
                                      paperStructure = [...paperStructure];
                                    }}
                                    class="text-center"
                                  />
                                {/if}
                              </td>
                            </tr>
                          {/each}
                        {/if}
                      {:else}
                        {#if mode === "preview"}
                          {#each Array(Number(section.count || 2)) as _, idx}
                            <tr class="opacity-20 italic">
                              <td class="border border-black p-1.5 text-center">?</td>
                              <td class="border border-black p-1.5"></td>
                              <td class="border border-black p-1.5">Drafting Slot ({section.marks_per_q} Marks)</td>
                              <td class="border border-black p-1.5 text-center">{section.marks_per_q}</td>
                              <td class="border border-black p-1.5"></td>
                              <td class="border border-black p-1.5"></td>
                            </tr>
                          {/each}
                        {/if}
                      {/each}
                    </tbody>
                  </table>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>

      <!-- ═══ BEST OF LUCK ═══ -->
      <div class="text-center font-bold text-[11pt] mt-8">
        ********Best of Luck********
      </div>

      <!-- ═══ FOOTER ═══ -->
      <div class="flex justify-between mt-6 text-[9pt] text-gray-500">
        <div>
          <span class="italic">Course Code: </span>
          <AssessmentEditable
            value={paperMeta.course_code || ""}
            onUpdate={(v: string) => updateText(v, "META", "course_code")}
            class="inline-block"
          />
        </div>
        <div>Page 1 of 2</div>
      </div>

      <!-- Sync Version -->
      <div class="mt-4 pt-2 border-t border-black/5 text-[7pt] text-gray-300 text-center uppercase tracking-[0.3em] no-print">
        ADYPU-SEM-V1.0.0-STABLE
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
  #adypu-sem-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black;
    line-height: normal;
  }
  #adypu-sem-paper-actual :global(.assessment-editable-container) {
    font-weight: inherit;
    line-height: normal;
  }
  @media print {
    #adypu-sem-paper-actual {
      padding: 0.5in !important;
      box-shadow: none !important;
    }
    .no-print {
      display: none !important;
    }
  }
</style>
