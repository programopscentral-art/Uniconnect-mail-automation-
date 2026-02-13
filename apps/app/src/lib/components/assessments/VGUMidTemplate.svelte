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

  const allQuestionsInSet = $derived(
    Array.isArray(currentSetData.questions) ? currentSetData.questions : [],
  );
  const questionsA = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "A"),
  );
  const questionsB = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "B"),
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
      <!-- VGU MID-TERM HEADER (EXACT LAYOUT) -->
      <div class="mb-6">
        <!-- University Name -->
        <div class="text-center mb-1">
          <div
            class="text-[17pt] font-black uppercase leading-tight font-serif"
          >
            VIVEKANANDA GLOBAL
          </div>
          <div
            class="text-[17pt] font-black uppercase leading-tight font-serif"
          >
            UNIVERSITY
          </div>
        </div>

        <!-- Department -->
        <div class="text-center mb-2">
          <div class="text-[10pt] font-bold uppercase leading-tight font-serif">
            COMPUTER SCIENCE
          </div>
        </div>

        <!-- Exam Title -->
        <div class="text-center mb-3">
          <div class="text-[10pt] font-bold uppercase leading-tight font-serif">
            <AssessmentEditable
              value={paperMeta.exam_title ||
                "I MID TERM EXAMINATION FEBRUARY 2026"}
              onUpdate={(v: string) => updateText(v, "META", "exam_title")}
              class="inline-block"
            />
          </div>
        </div>

        <!-- Horizontal Line -->
        <div class="border-t border-black w-full mb-3"></div>

        <!-- Metadata (Simple Format, No Table Borders) -->
        <div class="text-[9pt] font-serif space-y-0.5 mb-2">
          <!-- Course Code -->
          <div class="flex">
            <span class="font-bold" style="min-width: 110px;"
              >COURSE CODE :</span
            >
            <AssessmentEditable
              value={paperMeta.course_code}
              onUpdate={(v: string) => updateText(v, "META", "course_code")}
              class="flex-1 uppercase"
            />
          </div>

          <!-- Course Name -->
          <div class="flex">
            <span class="font-bold" style="min-width: 110px;"
              >COURSE NAME :</span
            >
            <AssessmentEditable
              value={paperMeta.subject_name}
              onUpdate={(v: string) => updateText(v, "META", "subject_name")}
              class="flex-1 uppercase"
            />
          </div>

          <!-- Semester -->
          <div class="flex">
            <span class="font-bold" style="min-width: 110px;">SEMESTER :</span>
            <AssessmentEditable
              value={paperMeta.semester}
              onUpdate={(v: string) => updateText(v, "META", "semester")}
              class="flex-1"
            />
          </div>

          <!-- Time and Max Marks (on same line) -->
          <div class="flex justify-between">
            <div class="flex">
              <span class="font-bold">Time : 90 Minutes</span>
            </div>
            <div class="flex">
              <span class="font-bold">Max. Marks : </span>
              <AssessmentEditable
                value={paperMeta.max_marks}
                onUpdate={(v: string) => updateText(v, "META", "max_marks")}
                class="inline-block ml-1"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Sections -->
      <div class="space-y-6">
        <!-- Section-I -->
        {#if questionsA.length > 0 || mode === "preview"}
          <div>
            <div
              class="flex justify-between items-center font-bold text-[11pt] mb-6 border-b-2 border-black pb-1"
            >
              <AssessmentEditable
                value={paperMeta.sectionI_title || "Section-I"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "sectionI_title")}
              />
              <AssessmentEditable
                value={paperMeta.sectionI_marks_label || "0.5x10 = 5"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "sectionI_marks_label")}
              />
            </div>

            <div class="mb-4">
              <div class="flex gap-2 font-bold text-[10pt] mb-4">
                <span>Q.1 :</span>
                <AssessmentEditable
                  value={paperMeta.q1_instruction ||
                    "Fill in the blanks/ Choose correct answer"}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "q1_instruction")}
                  class="flex-1"
                />
              </div>

              <div
                class="pl-6 space-y-4"
                use:dndzone={{ items: questionsA, flipDurationMs: 200 }}
                onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
                onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
              >
                {#each questionsA as q, idx (q.id + activeSet)}
                  <div class="flex gap-2 group relative">
                    <span class="font-bold min-w-[30px]"
                      >({String.fromCharCode(97 + idx)}).</span
                    >
                    <div class="flex-1 text-[10pt] relative">
                      <div
                        class="absolute -left-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                      >
                        <button
                          onclick={() => openSwapSidebar(q, "A")}
                          class="p-1 hover:bg-gray-100 rounded"
                          aria-label="Swap question"
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
                          aria-label="Remove question"
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
                      <AssessmentMcqOptions
                        options={q.questions?.[0]?.options || q.options}
                        class="mt-2 text-[9pt]"
                      />
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Section-II -->
        {#if questionsB.length > 0 || mode === "preview"}
          <div>
            <div
              class="flex justify-between items-center font-bold text-[11pt] mb-6 border-b-2 border-black pb-1"
            >
              <AssessmentEditable
                value={paperMeta.sectionII_title ||
                  "Section -II- Answer any 3 questions"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "sectionII_title")}
              />
              <AssessmentEditable
                value={paperMeta.sectionII_marks_label || "5x3 = 15"}
                onUpdate={(v: string) =>
                  updateText(v, "META", "sectionII_marks_label")}
              />
            </div>

            <div
              class="space-y-6"
              use:dndzone={{ items: questionsB, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
            >
              {#each questionsB as q, idx (q.id + activeSet)}
                <div class="flex gap-2 group relative">
                  <span class="font-bold min-w-[35px]">Q.{idx + 2} :</span>
                  <div class="flex-1 text-[10pt] relative">
                    <div
                      class="absolute -left-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                    >
                      <button
                        onclick={() => openSwapSidebar(q, "B")}
                        class="p-1 hover:bg-gray-100 rounded"
                        aria-label="Swap question"
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
                        aria-label="Remove question"
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
                        <!-- Choice 1 -->
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
                          <AssessmentMcqOptions
                            options={q.choice1?.questions?.[0]?.options}
                            class="mt-2 text-[9pt]"
                          />
                        </div>
                        <div
                          class="text-center font-bold italic py-2 text-[9pt]"
                        >
                          -- OR --
                        </div>
                        <!-- Choice 2 -->
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
                          <AssessmentMcqOptions
                            options={q.choice2?.questions?.[0]?.options}
                            class="mt-2 text-[9pt]"
                          />
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
                      <AssessmentMcqOptions
                        options={q.questions?.[0]?.options || q.options}
                        class="mt-2 text-[9pt]"
                      />
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="text-center mt-20 pt-8 no-print pb-16">
          <p class="text-[10pt] font-bold italic opacity-30 tracking-[0.5em]">
            ***********
          </p>
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
