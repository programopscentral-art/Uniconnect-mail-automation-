<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentSlotSingle from "./shared/AssessmentSlotSingle.svelte";
  import AssessmentSlotOrGroup from "./shared/AssessmentSlotOrGroup.svelte";
  import AssessmentMcqOptions from "./shared/AssessmentMcqOptions.svelte";
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

  const allQuestionsInSet = $derived(
    Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData?.questions || [],
  );

  const questionsA = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "A"),
  );
  const questionsB = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "B"),
  );

  const displayNumbersA = $derived.by(() => {
    let current = 1;
    return questionsA.map((q: any) => {
      const numInfo = { start: current, end: current };
      if (q.type === "OR_GROUP") {
        numInfo.end = current + 1;
        current += 2;
      } else {
        current += 1;
      }
      return numInfo;
    });
  });

  const displayNumbersB = $derived.by(() => {
    const lastA = displayNumbersA[displayNumbersA.length - 1];
    let current = lastA ? lastA.end + 1 : 1;
    return questionsB.map((q: any) => {
      const numInfo = { start: current, end: current };
      if (q.type === "OR_GROUP") {
        numInfo.end = current + 1;
        current += 2;
      } else {
        current += 1;
      }
      return numInfo;
    });
  });

  function getCoCode(id: string) {
    if (!id) return "";
    const co = (courseOutcomes || []).find((c: any) => c.id === id);
    return co ? co.code : id;
  }

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
    const index = arr.findIndex((s: any) => s.id === slot.id);

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
      bloom_level: question.bloom_level,
      co_id: question.co_id,
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
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="mallareddy-paper-actual"
      class="mx-auto bg-white p-[0.75in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- MALLAREDDY HEADER -->
      <div class="mb-4">
        <div class="flex items-start justify-between">
          <!-- Left Logo -->
          <div
            class="w-[70px] h-[70px] bg-no-repeat"
            style="background-image: url('https://mrtc.edu.in/wp-content/uploads/2025/05/MRV-MRTC-LOGOS.png'); background-size: 210% auto; background-position: left center;"
          ></div>

          <!-- Center Text -->
          <div class="flex-1 text-center px-2 pt-1">
            <div
              class="text-[17pt] font-black uppercase leading-tight text-indigo-900"
              style="font-family: 'Times New Roman', Times, serif;"
            >
              MALLA REDDY TECHNICAL CAMPUS
            </div>
            <div class="text-[9pt] font-bold uppercase mt-1">
              A Constituent Unit of MALLA REDDY VISHWAVIDYAPEETH
            </div>
            <div class="text-[8pt] italic">Deemed to be University</div>
            <div class="text-[8pt]">
              Approved by UGC u/s 2(f) AICTE New Delhi
            </div>
            <div class="text-[8pt]">
              Maisammaguda, Medchal (Dist), Hyderabad - 500100, Telangana
            </div>
          </div>

          <!-- Right Logo -->
          <div
            class="w-[70px] h-[70px] bg-no-repeat"
            style="background-image: url('https://mrtc.edu.in/wp-content/uploads/2025/05/MRV-MRTC-LOGOS.png'); background-size: 210% auto; background-position: right center;"
          ></div>
        </div>

        <div class="border-b-2 border-black w-full my-2"></div>

        <!-- Exam Title Row -->
        <div class="text-center mb-2">
          <div class="text-[11pt] font-bold underline">
            <AssessmentEditable
              value={paperMeta.academic_year || "A.Y:2025-2026"}
              onUpdate={(v: string) => updateText(v, "META", "academic_year")}
              class="inline-block"
            />
          </div>
          <div class="text-[11pt] font-bold underline uppercase mt-1">
            <AssessmentEditable
              value={paperMeta.exam_title ||
                "DESCRIPTIVE QUESTION PAPER FOR INTERNAL EXAMINATIONS"}
              onUpdate={(v: string) => updateText(v, "META", "exam_title")}
              class="inline-block"
            />
          </div>
        </div>

        <!-- Metadata Section -->
        <div class="text-[9pt] space-y-1">
          <div class="flex justify-between">
            <div class="flex">
              <span class="font-bold mr-2">Program :</span>
              <AssessmentEditable
                value={paperMeta.programme || "B.TECH/M.TECH/BBA"}
                onUpdate={(v: string) => updateText(v, "META", "programme")}
                class="min-w-[100px]"
              />
            </div>
            <div class="flex">
              <span class="font-bold mr-2">Date :</span>
              <AssessmentEditable
                value={paperMeta.exam_date || "18/09/2025(AN)"}
                onUpdate={(v: string) => updateText(v, "META", "exam_date")}
              />
            </div>
          </div>

          <div class="flex">
            <span class="font-bold mr-2">Branch :</span>
            <AssessmentEditable
              value={paperMeta.branch ||
                "CSE/CSM/CSD/ECE/IOT/R&AI/CSE(AI),CSE(AI&DS),CSE(CS),CSIT"}
              onUpdate={(v: string) => updateText(v, "META", "branch")}
              class="flex-1"
            />
          </div>

          <div class="flex items-center gap-6">
            <div class="flex">
              <span class="font-bold mr-2">Branch :</span>
              <AssessmentEditable
                value={paperMeta.year_branch || "I/II/III/IV"}
                onUpdate={(v: string) => updateText(v, "META", "year_branch")}
              />
            </div>
            <div class="flex">
              <span class="font-bold mr-2">SEM:</span>
              <AssessmentEditable
                value={paperMeta.semester || "I/II"}
                onUpdate={(v: string) => updateText(v, "META", "semester")}
              />
            </div>
            <div class="flex">
              <span class="font-bold mr-2">MID:</span>
              <AssessmentEditable
                value={paperMeta.mid_term || "I/II"}
                onUpdate={(v: string) => updateText(v, "META", "mid_term")}
              />
            </div>
            <div class="flex">
              <span class="font-bold mr-2">Regulation:</span>
              <AssessmentEditable
                value={paperMeta.regulation || "MRV-25"}
                onUpdate={(v: string) => updateText(v, "META", "regulation")}
              />
            </div>
          </div>

          <div class="flex justify-between">
            <div class="flex">
              <span class="font-bold mr-2">Subject name:</span>
              <AssessmentEditable
                value={paperMeta.subject_name || "-"}
                onUpdate={(v: string) => updateText(v, "META", "subject_name")}
              />
            </div>
            <div class="flex">
              <span class="font-bold mr-2">Subject Code:</span>
              <AssessmentEditable
                value={paperMeta.course_code || "-"}
                onUpdate={(v: string) => updateText(v, "META", "course_code")}
              />
            </div>
          </div>

          <div class="flex justify-between">
            <div class="flex">
              <span class="font-bold mr-2">Max Marks:</span>
              <AssessmentEditable
                value={paperMeta.max_marks || "25"}
                onUpdate={(v: string) => updateText(v, "META", "max_marks")}
              />
            </div>
            <div class="flex">
              <span class="font-bold mr-2">Duration:</span>
              <AssessmentEditable
                value={paperMeta.duration_text || "1 Hour 30 Min"}
                onUpdate={(v: string) => updateText(v, "META", "duration_text")}
              />
            </div>
          </div>

          <div class="mt-2 space-y-1">
            <div class="flex items-end w-fit">
              <span class="font-bold mr-2">Name Of the student:</span>
              <div class="min-w-[250px] border-b border-black h-4"></div>
            </div>
            <div class="flex items-end w-fit">
              <span class="font-bold mr-2">Hall Ticket No:</span>
              <div class="min-w-[200px] border-b border-black h-4"></div>
            </div>
          </div>
        </div>

        <!-- Bloom's Legend Table -->
        <table
          class="w-full border-collapse border border-gray-400 mt-4 text-[7.5pt]"
        >
          <tbody>
            <tr>
              <td class="border border-gray-400 p-1 w-1/6 font-bold"
                >Remember</td
              >
              <td class="border border-gray-400 p-1 w-[30px] text-center">L1</td
              >
              <td class="border border-gray-400 p-1 w-1/6 font-bold">Apply</td>
              <td class="border border-gray-400 p-1 w-[30px] text-center">L3</td
              >
              <td class="border border-gray-400 p-1 w-1/6 font-bold"
                >Evaluate</td
              >
              <td class="border border-gray-400 p-1 w-[30px] text-center">L5</td
              >
            </tr>
            <tr>
              <td class="border border-gray-400 p-1 font-bold">Understand</td>
              <td class="border border-gray-400 p-1 text-center">L2</td>
              <td class="border border-gray-400 p-1 font-bold">Analyze</td>
              <td class="border border-gray-400 p-1 text-center">L4</td>
              <td class="border border-gray-400 p-1 font-bold">Create</td>
              <td class="border border-gray-400 p-1 text-center">L6</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- MAIN QUESTION SECTIONS -->
      <div class="space-y-8">
        <!-- PART-A -->
        <div>
          <div class="text-center font-bold text-[11pt] mb-2 uppercase">
            PART-A
          </div>
          <table
            class="w-full border-collapse border-2 border-black text-[9pt]"
          >
            <thead>
              <tr>
                <th class="border border-black p-1 w-[30px]" rowspan="2"></th>
                <th
                  class="border border-black p-1 text-left uppercase"
                  colspan="1">PART-1 QUESTIONS</th
                >
                <th class="border border-black p-1 text-center" colspan="3"
                  >Course Outcomes</th
                >
                <th
                  class="border border-black p-1 text-center w-[80px]"
                  rowspan="2">Blooms level</th
                >
                <th
                  class="border border-black p-1 text-center w-[60px]"
                  rowspan="2">Marks</th
                >
              </tr>
              <tr>
                <th class="border border-black p-4 text-center">
                  <div class="font-bold">ANSWER ALL</div>
                  <div class="font-bold mt-1">
                    <AssessmentEditable
                      value={paperMeta.partA_marks_label || "5*2=10 Marks"}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "partA_marks_label")}
                    />
                  </div>
                </th>
                <th
                  class="border border-black p-1 text-center font-bold text-[7.5pt] w-[40px]"
                  >CO</th
                >
                <th
                  class="border border-black p-1 text-center font-bold text-[7.5pt] w-[40px]"
                  >PO</th
                >
                <th
                  class="border border-black p-1 text-center font-bold text-[7.5pt] w-[40px]"
                  >PSO</th
                >
              </tr>
            </thead>
            <tbody
              use:dndzone={{ items: questionsA, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
            >
              {#each questionsA as slot, idx (slot.id + activeSet)}
                {@const qNum = displayNumbersA[idx]}
                <tr class="group relative">
                  <td
                    class="border border-black p-2 font-bold text-center align-top whitespace-nowrap"
                  >
                    {#if slot.type === "OR_GROUP"}
                      {qNum.start} or {qNum.end}
                    {:else}
                      {qNum.start}
                    {/if}
                  </td>
                  <td
                    class="border border-black p-2 align-top relative min-h-[60px]"
                  >
                    {#if slot.type === "OR_GROUP"}
                      <div class="space-y-2">
                        <!-- Choice 1 -->
                        <div class="relative group/choice1">
                          <div
                            class="absolute -left-10 top-0 opacity-0 group-hover/choice1:opacity-100 transition-opacity no-print flex flex-col gap-1"
                          >
                            <button
                              onclick={() => openSwapSidebar(slot, "A", "q1")}
                              class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                              title="Swap Part 1"
                            >
                              <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2.5"
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                /></svg
                              >
                            </button>
                          </div>
                          <AssessmentEditable
                            value={slot.choice1?.questions?.[0]
                              ?.question_text ||
                              slot.choice1?.questions?.[0]?.text ||
                              ""}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "text",
                                slot.id,
                                slot.choice1.questions[0].id,
                              )}
                            multiline={true}
                          />
                          {#if slot.choice1?.questions?.[0]?.options}
                            <AssessmentMcqOptions
                              options={slot.choice1.questions[0].options}
                              class="mt-2 text-[8pt]"
                            />
                          {/if}
                        </div>

                        <div
                          class="text-center font-bold italic py-1 text-[9pt] border-y border-gray-100 my-2"
                        >
                          -- OR --
                        </div>

                        <!-- Choice 2 -->
                        <div class="relative group/choice2">
                          <div
                            class="absolute -left-10 top-0 opacity-0 group-hover/choice2:opacity-100 transition-opacity no-print flex flex-col gap-1"
                          >
                            <button
                              onclick={() => openSwapSidebar(slot, "A", "q2")}
                              class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                              title="Swap Part 2"
                            >
                              <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2.5"
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                /></svg
                              >
                            </button>
                          </div>
                          <AssessmentEditable
                            value={slot.choice2?.questions?.[0]
                              ?.question_text ||
                              slot.choice2?.questions?.[0]?.text ||
                              ""}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "text",
                                slot.id,
                                slot.choice2.questions[0].id,
                              )}
                            multiline={true}
                          />
                          {#if slot.choice2?.questions?.[0]?.options}
                            <AssessmentMcqOptions
                              options={slot.choice2.questions[0].options}
                              class="mt-2 text-[8pt]"
                            />
                          {/if}
                        </div>
                      </div>
                    {:else}
                      <!-- Standard Swapping Tools -->
                      <div
                        class="absolute -left-12 top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                      >
                        <button
                          onclick={() => openSwapSidebar(slot, "A")}
                          class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                          title="Swap Question"
                        >
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2.5"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            /></svg
                          >
                        </button>
                        <button
                          onclick={() => removeQuestion(slot)}
                          class="p-1 hover:bg-gray-100 rounded text-red-500 bg-white shadow-sm border"
                          title="Remove"
                        >
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2.5"
                              d="M6 18L18 6M6 6l12 12"
                            /></svg
                          >
                        </button>
                      </div>

                      <AssessmentEditable
                        value={slot.text ||
                          slot.question_text ||
                          slot.questions?.[0]?.question_text ||
                          slot.questions?.[0]?.text ||
                          ""}
                        onUpdate={(v: string) =>
                          updateText(
                            v,
                            "QUESTION",
                            "text",
                            slot.id,
                            slot.questions?.[0]?.id || slot.id,
                          )}
                        multiline={true}
                      />
                      {#if slot.questions?.[0]?.options || slot.options}
                        <AssessmentMcqOptions
                          options={slot.questions?.[0]?.options || slot.options}
                          class="mt-2 text-[8pt]"
                        />
                      {/if}
                    {/if}
                  </td>
                  <td
                    class="border border-black p-1 text-center align-top font-bold text-[9pt]"
                  >
                    {getCoCode(
                      slot.questions?.[0]?.co_id ||
                        slot.co_id ||
                        slot.choice1?.questions?.[0]?.co_id ||
                        "",
                    )}
                  </td>
                  <td
                    class="border border-black p-1 text-center align-top text-[8pt]"
                  ></td>
                  <td
                    class="border border-black p-1 text-center align-top text-[8pt]"
                  ></td>
                  <td
                    class="border border-black p-1 text-center align-top font-medium uppercase text-[9pt]"
                  >
                    {slot.questions?.[0]?.bloom_level ||
                      slot.bloom_level ||
                      slot.choice1?.questions?.[0]?.bloom_level ||
                      ""}
                  </td>
                  <td
                    class="border border-black p-1 text-center align-top font-bold text-[9pt]"
                  >
                    {slot.questions?.[0]?.marks ||
                      slot.marks ||
                      slot.choice1?.questions?.[0]?.marks ||
                      ""}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- PART-B -->
        <div>
          <div class="text-center font-bold text-[11pt] mb-2 uppercase">
            PART-B
          </div>
          <table
            class="w-full border-collapse border-2 border-black text-[9pt]"
          >
            <thead>
              <tr>
                <th class="border border-black p-1 w-[30px]" rowspan="2"></th>
                <th
                  class="border border-black p-1 text-left uppercase"
                  colspan="1">PART-1 QUESTIONS</th
                >
                <th class="border border-black p-1 text-center" colspan="3"
                  >Course Outcomes</th
                >
                <th
                  class="border border-black p-1 text-center w-[80px]"
                  rowspan="2">Blooms level</th
                >
                <th
                  class="border border-black p-1 text-center w-[60px]"
                  rowspan="2">Marks</th
                >
              </tr>
              <tr>
                <th class="border border-black p-4 text-center">
                  <div class="font-bold">ANSWER ALL</div>
                  <div class="font-bold mt-1">
                    <AssessmentEditable
                      value={paperMeta.partB_marks_label || "5*2=10 Marks"}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "partB_marks_label")}
                    />
                  </div>
                </th>
                <th
                  class="border border-black p-1 text-center font-bold text-[7.5pt] w-[40px]"
                  >CO</th
                >
                <th
                  class="border border-black p-1 text-center font-bold text-[7.5pt] w-[40px]"
                  >PO</th
                >
                <th
                  class="border border-black p-1 text-center font-bold text-[7.5pt] w-[40px]"
                  >PSO</th
                >
              </tr>
            </thead>
            <tbody
              use:dndzone={{ items: questionsB, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
            >
              {#each questionsB as slot, idx (slot.id + activeSet)}
                {@const qNum = displayNumbersB[idx]}
                <tr class="group relative">
                  <td
                    class="border border-black p-2 font-bold text-center align-top whitespace-nowrap"
                  >
                    {#if slot.type === "OR_GROUP"}
                      {qNum.start} or {qNum.end}
                    {:else}
                      {qNum.start}
                    {/if}
                  </td>
                  <td
                    class="border border-black p-2 align-top relative min-h-[60px]"
                  >
                    {#if slot.type === "OR_GROUP"}
                      <div class="space-y-4">
                        <!-- Choice 1 -->
                        <div class="relative group/choice1">
                          <div
                            class="absolute -left-10 top-0 opacity-0 group-hover/choice1:opacity-100 transition-opacity no-print flex flex-col gap-1"
                          >
                            <button
                              onclick={() => openSwapSidebar(slot, "B", "q1")}
                              class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                              title="Swap Part 1"
                            >
                              <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2.5"
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                /></svg
                              >
                            </button>
                          </div>
                          <AssessmentEditable
                            value={slot.choice1?.questions?.[0]
                              ?.question_text ||
                              slot.choice1?.questions?.[0]?.text ||
                              ""}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "text",
                                slot.id,
                                slot.choice1.questions[0].id,
                              )}
                            multiline={true}
                          />
                        </div>

                        <div
                          class="text-center font-bold italic py-1 text-[9pt] border-y border-gray-100 my-2"
                        >
                          -- OR --
                        </div>

                        <!-- Choice 2 -->
                        <div class="relative group/choice2">
                          <div
                            class="absolute -left-10 top-0 opacity-0 group-hover/choice2:opacity-100 transition-opacity no-print flex flex-col gap-1"
                          >
                            <button
                              onclick={() => openSwapSidebar(slot, "B", "q2")}
                              class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                              title="Swap Part 2"
                            >
                              <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2.5"
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                /></svg
                              >
                            </button>
                          </div>
                          <AssessmentEditable
                            value={slot.choice2?.questions?.[0]
                              ?.question_text ||
                              slot.choice2?.questions?.[0]?.text ||
                              ""}
                            onUpdate={(v: string) =>
                              updateText(
                                v,
                                "QUESTION",
                                "text",
                                slot.id,
                                slot.choice2.questions[0].id,
                              )}
                            multiline={true}
                          />
                        </div>
                      </div>
                    {:else}
                      <!-- Standard Swapping Tools -->
                      <div
                        class="absolute -left-12 top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                      >
                        <button
                          onclick={() => openSwapSidebar(slot, "B")}
                          class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                          title="Swap Question"
                        >
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2.5"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            /></svg
                          >
                        </button>
                        <button
                          onclick={() => removeQuestion(slot)}
                          class="p-1 hover:bg-gray-100 rounded text-red-500 bg-white shadow-sm border"
                          title="Remove"
                        >
                          <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            ><path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2.5"
                              d="M6 18L18 6M6 6l12 12"
                            /></svg
                          >
                        </button>
                      </div>

                      <AssessmentEditable
                        value={slot.text ||
                          slot.question_text ||
                          slot.questions?.[0]?.question_text ||
                          slot.questions?.[0]?.text ||
                          ""}
                        onUpdate={(v: string) =>
                          updateText(
                            v,
                            "QUESTION",
                            "text",
                            slot.id,
                            slot.questions?.[0]?.id || slot.id,
                          )}
                        multiline={true}
                      />
                    {/if}
                  </td>
                  <td
                    class="border border-black p-1 text-center align-top font-bold text-[9pt]"
                  >
                    {getCoCode(
                      slot.questions?.[0]?.co_id ||
                        slot.co_id ||
                        slot.choice1?.questions?.[0]?.co_id ||
                        "",
                    )}
                  </td>
                  <td
                    class="border border-black p-1 text-center align-top text-[8pt]"
                  ></td>
                  <td
                    class="border border-black p-1 text-center align-top text-[8pt]"
                  ></td>
                  <td
                    class="border border-black p-1 text-center align-top font-medium uppercase text-[9pt]"
                  >
                    {slot.questions?.[0]?.bloom_level ||
                      slot.bloom_level ||
                      slot.choice1?.questions?.[0]?.bloom_level ||
                      ""}
                  </td>
                  <td
                    class="border border-black p-1 text-center align-top font-bold text-[9pt]"
                  >
                    {slot.questions?.[0]?.marks ||
                      slot.marks ||
                      slot.choice1?.questions?.[0]?.marks ||
                      ""}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <SwapQuestionSidebar
    bind:isOpen={isSwapSidebarOpen}
    {questionPool}
    currentMark={swapContext?.currentMark}
    currentQuestionId={swapContext?.currentId}
    onSelect={selectAlternate}
  />
</div>

<style>
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #mallareddy-paper-actual {
    font-family: "Times New Roman", Times, serif;
    line-height: 1.3;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  :global(#mallareddy-paper-actual .assessment-editable-container) {
    display: inline-block;
    min-width: 20px;
  }

  @media print {
    .no-print {
      display: none !important;
    }
    #mallareddy-paper-actual {
      padding: 0.5in !important;
      margin: 0 !important;
      box-shadow: none !important;
      width: 210mm !important;
      height: 297mm !important;
    }
  }
</style>
