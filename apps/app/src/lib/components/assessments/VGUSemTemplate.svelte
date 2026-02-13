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
      text: question.question_text || question.text,
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

  const allQuestionsInSet = $derived(() => {
    if (Array.isArray(currentSetData)) return currentSetData;
    if (currentSetData && Array.isArray(currentSetData.questions))
      return currentSetData.questions;
    return [];
  });
  const questionsA = $derived(
    allQuestionsInSet().filter((q: any) => q && q.part === "A"),
  );
  const questionsB = $derived(
    allQuestionsInSet().filter((q: any) => q && q.part === "B"),
  );
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="vgu-mid-paper-actual"
      class="mx-auto bg-white p-[0.75in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- VGU SEMESTER HIGH FIDELITY HEADER -->
      <div class="mb-2">
        <div
          class="flex items-start justify-between border-b border-black pb-2"
        >
          <!-- Left Logo -->
          <div class="w-16 h-16">
            <img
              src="/vgu-logo.png"
              alt="VGU Logo"
              class="w-full h-full object-contain"
            />
          </div>

          <!-- Center Text -->
          <div class="flex-1 text-center px-1">
            <div
              class="text-[14pt] font-black uppercase leading-[1.1] font-serif tracking-tight"
            >
              VIVEKANANDA GLOBAL
            </div>
            <div
              class="text-[14pt] font-black uppercase leading-[1.1] font-serif tracking-tight"
            >
              UNIVERSITY, JAIPUR
            </div>
            <div
              class="text-[7pt] font-medium leading-tight mt-1 italic font-serif opacity-80"
            >
              (Established by Act 11/2012 of Rajasthan Govt. Covered u/s22 of
              UGC Act, 1956)
            </div>
          </div>

          <!-- Right Badge (NAAC) -->
          <div class="text-right flex flex-col items-center">
            <div class="text-[6pt] font-bold leading-tight">NAAC</div>
            <div class="text-[6pt] font-bold leading-tight uppercase">
              Accredited
            </div>
            <div class="text-[12pt] font-black leading-none py-0.5">A+</div>
            <div class="text-[6pt] font-bold leading-tight uppercase">
              University
            </div>
          </div>
        </div>

        <!-- Exam Title Row -->
        <div class="text-center py-2">
          <div class="text-[11pt] font-black uppercase font-serif">
            <AssessmentEditable
              value={paperMeta.exam_title ||
                "II MID TERM EXAMINATIONS (THEORY), December 2025"}
              onUpdate={(v: string) => updateText(v, "META", "exam_title")}
              class="inline-block"
            />
          </div>
        </div>

        <!-- Metadata Section -->
        <div class="grid grid-cols-2 gap-x-8 text-[8.5pt] font-serif mb-2">
          <div class="space-y-0.5">
            <div class="flex">
              <span class="font-bold w-[130px]">Programme & Batch :</span>
              <AssessmentEditable
                value={paperMeta.programme || "B.Tech-Software Engineering"}
                onUpdate={(v: string) => updateText(v, "META", "programme")}
                class="flex-1"
              />
            </div>
            <div class="flex">
              <span class="font-bold w-[130px]">Course Name :</span>
              <AssessmentEditable
                value={paperMeta.subject_name || "Computer Programming"}
                onUpdate={(v: string) => updateText(v, "META", "subject_name")}
                class="flex-1"
              />
            </div>
            <div class="flex">
              <span class="font-bold w-[130px]">Duration :</span>
              <AssessmentEditable
                value={paperMeta.duration_minutes || "1Hr"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "duration_minutes")}
                class="w-12"
              />
            </div>
          </div>
          <div class="space-y-0.5 text-right">
            <div class="flex justify-end">
              <span class="font-bold">Semester :</span>
              <AssessmentEditable
                value={paperMeta.semester || "I"}
                onUpdate={(v: string) => updateText(v, "META", "semester")}
                class="ml-2 w-8 text-right"
              />
            </div>
            <div class="flex justify-end">
              <span class="font-bold">Course Code :</span>
              <AssessmentEditable
                value={paperMeta.course_code || "UQSC103"}
                onUpdate={(v: string) => updateText(v, "META", "course_code")}
                class="ml-2 w-20 text-right uppercase"
              />
            </div>
            <div class="flex justify-end">
              <span class="font-bold">M.M. :</span>
              <AssessmentEditable
                value={paperMeta.max_marks || "20"}
                onUpdate={(v: string) => updateText(v, "META", "max_marks")}
                class="ml-2 w-8 text-right"
              />
            </div>
          </div>
        </div>

        <!-- Instructions -->
        <div class="text-[8.5pt] font-serif mb-3">
          <div class="font-bold">Instructions :</div>
          <AssessmentEditable
            value={paperMeta.instructions ||
              "Instructions: Before attempting any question, be sure that you get the correct question paper."}
            onUpdate={(v: string) => updateText(v, "META", "instructions")}
            class="text-[8.5pt]"
          />
        </div>

        <!-- Course Outcomes -->
        <div class="text-[8.5pt] font-serif mb-4">
          <div class="font-bold mb-1">Course Outcomes:</div>
          <div class="space-y-0.5 pl-2">
            {#each courseOutcomes as co, i}
              <div class="flex gap-2">
                <span class="font-bold min-w-[35px]">CO{i + 1}:</span>
                <span class="text-[8pt]"
                  >{co.description || "CO DESCRIPTION TEXT"}</span
                >
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Main Question Table -->
      <table
        class="w-full border-collapse border border-black text-[9pt] font-serif"
      >
        <thead>
          <tr class="bg-white">
            <th class="border border-black p-1 text-center w-[5%]">Question</th>
            <th class="border border-black p-1 text-center w-[65%]">Question</th
            >
            <th class="border border-black p-1 text-center w-[10%]">Mark</th>
            <th class="border border-black p-1 text-center w-[10%]"
              >K Level (K1/K6)</th
            >
            <th class="border border-black p-1 text-center w-[10%]"
              >CO Indicators</th
            >
          </tr>
        </thead>

        <!-- Section A Container -->
        <tbody
          use:dndzone={{ items: questionsA, flipDurationMs: 200 }}
          onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
          onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
        >
          <tr class="bg-gray-50/50">
            <td colspan="5" class="border border-black p-1 font-bold">
              <AssessmentEditable
                value={paperMeta.sectionA_label ||
                  "Section A (1*10=10 Marks) Answer all Question No- 1-10"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "sectionA_label")}
              />
            </td>
          </tr>
          {#each questionsA as q, idx (q.id + activeSet)}
            <tr class="group relative">
              <td class="border border-black p-2 text-center align-top"
                >{idx + 1}.</td
              >
              <td
                class="border border-black p-2 align-top text-[10pt] relative"
              >
                <!-- Hover actions -->
                <div
                  class="absolute -left-12 top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                >
                  <button
                    onclick={() => openSwapSidebar(q, "A")}
                    class="p-1 hover:bg-gray-100 rounded text-indigo-600"
                    aria-label="Swap"
                  >
                    <svg
                      class="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      /></svg
                    >
                  </button>
                  <button
                    onclick={() => removeQuestion(q)}
                    class="p-1 hover:bg-gray-100 rounded text-red-500"
                    aria-label="Remove"
                  >
                    <svg
                      class="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      /></svg
                    >
                  </button>
                </div>

                <AssessmentEditable
                  value={q.text ||
                    q.question_text ||
                    q.questions?.[0]?.question_text ||
                    q.questions?.[0]?.text ||
                    ""}
                  onUpdate={(v: string) =>
                    updateText(
                      v,
                      "QUESTION",
                      "text",
                      q.id,
                      q.questions?.[0]?.id || q.id,
                    )}
                  multiline={true}
                />

                {#if q.questions?.[0]?.options || q.options}
                  <AssessmentMcqOptions
                    options={q.questions?.[0]?.options || q.options}
                    class="mt-2 text-[9pt]"
                  />
                {/if}
              </td>
              <td class="border border-black p-2 text-center align-top"
                >{q.marks || q.mark || 1}</td
              >
              <td class="border border-black p-2 text-center align-top"
                >{q.k_level ||
                  q.bloom_level ||
                  "K" + (Math.floor(Math.random() * 6) + 1)}</td
              >
              <td class="border border-black p-2 text-center align-top"
                >{q.co_indicator ||
                  "CO" + (Math.floor(Math.random() * 4) + 1)}</td
              >
            </tr>
          {/each}
        </tbody>

        <!-- Section B Container -->
        <tbody
          use:dndzone={{ items: questionsB, flipDurationMs: 200 }}
          onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
          onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
        >
          <tr class="bg-gray-50/50">
            <td colspan="5" class="border border-black p-1 font-bold">
              <AssessmentEditable
                value={paperMeta.sectionB_label ||
                  "Section B (5*3=15 Marks) Attempt any three questions"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "sectionB_label")}
              />
            </td>
          </tr>
          {#each questionsB as q, idx (q.id + activeSet)}
            <tr class="group relative">
              <td class="border border-black p-2 text-center align-top"
                >Q.{idx + 11}</td
              >
              <td
                class="border border-black p-2 align-top text-[10pt] relative"
              >
                <!-- Hover actions -->
                <div
                  class="absolute -left-12 top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                >
                  <button
                    onclick={() => openSwapSidebar(q, "B")}
                    class="p-1 hover:bg-gray-100 rounded text-indigo-600"
                    aria-label="Swap"
                  >
                    <svg
                      class="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      /></svg
                    >
                  </button>
                  <button
                    onclick={() => removeQuestion(q)}
                    class="p-1 hover:bg-gray-100 rounded text-red-500"
                    aria-label="Remove"
                  >
                    <svg
                      class="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      /></svg
                    >
                  </button>
                </div>

                {#if q.type === "OR_GROUP"}
                  <div class="space-y-4">
                    <div>
                      <AssessmentEditable
                        value={q.choice1?.questions?.[0]?.question_text ||
                          q.choice1?.questions?.[0]?.text ||
                          ""}
                        onUpdate={(v: string) =>
                          updateText(
                            v,
                            "QUESTION",
                            "text",
                            q.id,
                            q.choice1.questions[0].id,
                          )}
                        multiline={true}
                      />
                      {#if q.choice1?.questions?.[0]?.options}
                        <AssessmentMcqOptions
                          options={q.choice1.questions[0].options}
                          class="mt-2 text-[9pt]"
                        />
                      {/if}
                    </div>
                    <div class="text-center font-bold italic py-1 text-[9pt]">
                      -- OR --
                    </div>
                    <div>
                      <AssessmentEditable
                        value={q.choice2?.questions?.[0]?.question_text ||
                          q.choice2?.questions?.[0]?.text ||
                          ""}
                        onUpdate={(v: string) =>
                          updateText(
                            v,
                            "QUESTION",
                            "text",
                            q.id,
                            q.choice2.questions[0].id,
                          )}
                        multiline={true}
                      />
                      {#if q.choice2?.questions?.[0]?.options}
                        <AssessmentMcqOptions
                          options={q.choice2.questions[0].options}
                          class="mt-2 text-[9pt]"
                        />
                      {/if}
                    </div>
                  </div>
                {:else}
                  <AssessmentEditable
                    value={q.text ||
                      q.question_text ||
                      q.questions?.[0]?.question_text ||
                      q.questions?.[0]?.text ||
                      ""}
                    onUpdate={(v: string) =>
                      updateText(
                        v,
                        "QUESTION",
                        "text",
                        q.id,
                        q.questions?.[0]?.id || q.id,
                      )}
                    multiline={true}
                  />
                  {#if q.questions?.[0]?.options || q.options}
                    <AssessmentMcqOptions
                      options={q.questions?.[0]?.options || q.options}
                      class="mt-2 text-[9pt]"
                    />
                  {/if}
                {/if}
              </td>
              <td class="border border-black p-2 text-center align-top"
                >{q.marks || q.mark || 5}</td
              >
              <td class="border border-black p-2 text-center align-top"
                >{q.k_level ||
                  q.bloom_level ||
                  "K" + (Math.floor(Math.random() * 6) + 1)}</td
              >
              <td class="border border-black p-2 text-center align-top"
                >{q.co_indicator ||
                  "CO" + (Math.floor(Math.random() * 4) + 1)}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="text-center mt-12 no-print">
        <p class="text-[10pt] font-bold italic opacity-20 tracking-[1em]">
          ***********
        </p>
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
  #vgu-mid-paper-actual {
    font-family: "Times New Roman", Times, serif;
    line-height: 1.4;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Ensure AssessmentEditable fits well in dot-bordered lines */
  :global(#vgu-mid-paper-actual .assessment-editable-container) {
    display: inline-block;
    min-width: 50px;
  }

  @media print {
    .no-print {
      display: none !important;
    }
    #vgu-mid-paper-actual {
      padding: 0.5in !important;
      margin: 0 !important;
      box-shadow: none !important;
      width: 210mm !important;
    }
  }
</style>
