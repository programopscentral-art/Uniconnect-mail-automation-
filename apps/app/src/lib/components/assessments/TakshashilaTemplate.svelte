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

  const normalizePart = (q: any) => {
    const p = (q.part || q.section || "").toUpperCase();
    if (p.includes("A")) return "A";
    if (p.includes("B")) return "B";
    if (p.includes("C")) return "C";
    return p;
  };

  const getQuestionText = (slot: any): string => {
    if (!slot) return "";
    // If it's a choice object from an OR group
    const q = slot.questions?.[0] || slot;
    return (
      q.question_text ||
      q.text ||
      q.question ||
      q.content ||
      (q.questions && q.questions[0] ? getQuestionText(q.questions[0]) : "") ||
      ""
    );
  };

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

  const calcTotalMarks = (part: string) => {
    const arr = (
      Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData.questions || []
    ).filter(Boolean);
    const qs = arr.filter((q: any) => q && normalizePart(q) === part);
    let total = 0;
    qs.forEach((slot: any) => {
      const marks = Number(
        slot.marks ||
          (slot.type === "OR_GROUP"
            ? slot.choice1?.questions?.[0]?.marks || 0
            : slot.questions?.[0]?.marks || 0),
      );
      if (!isNaN(marks)) total += marks;
    });
    return total;
  };

  const allQuestionsInSet = $derived(
    Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData?.questions || [],
  );

  const questionsA = $derived(
    allQuestionsInSet.filter((q: any) => q && normalizePart(q) === "A"),
  );
  const questionsB = $derived(
    allQuestionsInSet.filter((q: any) => q && normalizePart(q) === "B"),
  );
  const questionsC = $derived(
    allQuestionsInSet.filter((q: any) => q && normalizePart(q) === "C"),
  );

  const totalA = $derived(calcTotalMarks("A"));
  const totalB = $derived(calcTotalMarks("B"));
  const totalC = $derived(calcTotalMarks("C"));

  function getCoCode(id: string) {
    if (!id) return "";
    const co = (courseOutcomes || []).find((c: any) => c.id === id);
    return co ? co.code : id;
  }
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <style>
    #takshashila-paper-actual {
      font-family: "Times New Roman", Times, serif !important;
    }
    #takshashila-paper-actual h1 {
      font-family: inherit;
    }
  </style>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="takshashila-paper-actual"
      class="mx-auto bg-white p-[0.5in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- HEADER -->
      <div class="mb-4">
        <table class="w-full border-collapse border-none">
          <tbody>
            <tr>
              <!-- Logo column -->
              <td class="w-[150px] align-middle">
                <img
                  src="https://media.licdn.com/dms/image/v2/C4D0BAQEn2ipthDvaeA/company-logo_200_200/company-logo_200_200/0/1657190027778?e=2147483647&v=beta&t=wN3xsb19OvSBfcDMjaHQdtOsCWoMDwPczektN7oSCAs"
                  alt="Takshashila University Logo"
                  class="w-[135px] h-auto object-contain mx-auto"
                />
              </td>

              <!-- Center info column -->
              <td class="text-center px-4 border-r border-black relative">
                <h1
                  class="text-[24pt] font-black uppercase leading-[1] m-0 tracking-tighter"
                >
                  TAKSHASHILA
                </h1>
                <h1
                  class="text-[24pt] font-black uppercase leading-[1] m-0 tracking-tighter"
                >
                  UNIVERSITY
                </h1>
                <p
                  class="text-[7.2pt] leading-tight mt-1 px-10 font-medium"
                  style="font-family: 'Times New Roman', serif;"
                >
                  (Established under Tamil Nadu State Private Universities Act,
                  2019<br />
                  & Recognised by UGC u/s 2(f) the UGC Act, 1956)
                </p>
                <div
                  class="inline-block border border-black rounded-full px-5 py-0.5 mt-1 text-[8pt] font-bold"
                >
                  (Office of the Controller of Examinations)
                </div>
              </td>

              <!-- Right contact column -->
              <td class="w-[200px] pl-4 align-middle">
                <div class="text-[7.2pt] leading-[1.3] font-medium text-left">
                  <p class="font-bold m-0">
                    Ompur (PO), Tindivanam Taluk, Villupuram District,
                  </p>
                  <p class="m-0">Tamil Nadu - 604 305, India.</p>
                  <p class="m-0">04147-234567 | +91 8925829070</p>
                  <p class="m-0">+91 9150377919</p>
                  <p class="m-0">coeoffice@takshashilauniv.ac.in |</p>
                  <p class="m-0">www.takshashilauniv.ac.in</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="border-b-[1.5pt] border-black w-full mt-4"></div>
      </div>

      <!-- Institutional Info Table -->
      <div class="border border-black mb-4 text-[10pt]">
        <div class="grid grid-cols-[120px_1fr]">
          <div class="font-bold p-1 border-r border-black">Faculty</div>
          <div class="p-1">
            : <AssessmentEditable
              value={paperMeta.faculty ||
                "Faculty of Engineering and Technology"}
              onUpdate={(v: string) => updateText(v, "META", "faculty")}
              class="inline-block"
            />
          </div>
        </div>
        <div class="grid grid-cols-[120px_1fr]">
          <div class="font-bold p-1 border-r border-black">School</div>
          <div class="p-1">
            : <AssessmentEditable
              value={paperMeta.school || "School of Computational Engineering"}
              onUpdate={(v: string) => updateText(v, "META", "school")}
              class="inline-block"
            />
          </div>
        </div>
        <div
          class="grid grid-cols-[120px_1fr_120px] items-center border-t border-black"
        >
          <div class="font-bold p-1 border-r border-black">Programme</div>
          <div class="p-1 border-r border-black">
            : <AssessmentEditable
              value={paperMeta.programme || "B.Tech-CSE-DS"}
              onUpdate={(v: string) => updateText(v, "META", "programme")}
              class="inline-block"
            />
          </div>
          <div class="p-1 text-right font-bold whitespace-nowrap">
            Regulation : <AssessmentEditable
              value={paperMeta.regulation || "25"}
              onUpdate={(v: string) => updateText(v, "META", "regulation")}
              class="inline-block"
            />
          </div>
        </div>
        <div class="grid grid-cols-[120px_1fr]">
          <div class="font-bold p-1 border-r border-black">Year / Semester</div>
          <div class="p-1">
            : <AssessmentEditable
              value={paperMeta.year_semester || "I / I"}
              onUpdate={(v: string) => updateText(v, "META", "year_semester")}
              class="inline-block"
            />
          </div>
        </div>
      </div>

      <!-- Subject Centerpiece -->
      <div class="text-center mb-4">
        <div class="text-[12pt] font-bold">
          <AssessmentEditable
            value={paperMeta.course_code || "U25CD021"}
            onUpdate={(v: string) => updateText(v, "META", "course_code")}
            class="inline-block"
          />
          –
          <AssessmentEditable
            value={paperMeta.subject_name || "Web Development"}
            onUpdate={(v: string) => updateText(v, "META", "subject_name")}
            class="inline-block"
          />
        </div>
        <div class="text-[10pt] font-bold uppercase mt-1">
          <AssessmentEditable
            value={paperMeta.exam_title || "CAT / Model: CAT -1"}
            onUpdate={(v: string) => updateText(v, "META", "exam_title")}
            class="inline-block"
          />
        </div>
      </div>

      <!-- Time / Marks Row -->
      <div class="flex justify-between items-center font-bold text-[10pt] mb-4">
        <div>
          Time: <AssessmentEditable
            value={paperMeta.duration_text || "1.30 Hrs"}
            onUpdate={(v: string) => updateText(v, "META", "duration_text")}
            class="inline-block"
          />
        </div>
        <div>
          Marks: <AssessmentEditable
            value={paperMeta.max_marks || "40"}
            onUpdate={(v: string) => updateText(v, "META", "max_marks")}
            class="inline-block"
          />
        </div>
      </div>

      <!-- Course Outcomes & Legends -->
      <div class="text-[8pt] space-y-1 mb-4 leading-relaxed">
        {#if paperMeta.course_outcomes}
          <AssessmentEditable
            value={paperMeta.course_outcomes}
            onUpdate={(v: string) => updateText(v, "META", "course_outcomes")}
            multiline={true}
          />
        {:else}
          <p>
            • Course Outcomes: Understand the fundamentals of programming,
            including variables, data types, and operators, and be able to apply
            them in real-world scenarios.
          </p>
          <p>
            • Develop problem-solving skills using conditional statements,
            loops, and functions.
          </p>
        {/if}
        <p class="font-bold">
          Knowledge Level: K1-Remember, K2-Understand, K3-Apply, K4-Analyze
          K5-Evaluate & K6-Create.
        </p>
      </div>

      <!-- QUESTIONS CONTAINER -->
      <div class="space-y-6">
        <!-- PART A -->
        {#if questionsA.length > 0 || mode === "preview"}
          <div>
            <div class="text-center mb-2">
              <div
                class="font-bold underline decoration-1 underline-offset-4 text-[11pt] uppercase"
              >
                PART – A ({questionsA.length} X {Number(
                  questionsA[0]?.marks ||
                    questionsA[0]?.questions?.[0]?.marks ||
                    2,
                )} = {totalA}
                Marks)
              </div>
              <div class="font-bold text-[10pt] mt-1 italic">
                Answer Any Five Questions
              </div>
            </div>

            <div
              use:dndzone={{ items: questionsA, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
              class="border-t border-l border-r border-black"
            >
              <table class="w-full border-collapse">
                <thead>
                  <tr class="text-[9pt] font-bold">
                    <th
                      class="border-b border-r border-black p-1 w-[50px] text-center"
                      >Q. No</th
                    >
                    <th class="border-b border-r border-black p-1 text-center"
                      >Question</th
                    >
                    <th
                      class="border-b border-r border-black p-1 w-[70px] text-center"
                      >Blooms Level</th
                    >
                    <th class="border-b border-black p-1 w-[60px] text-center"
                      >CO's</th
                    >
                  </tr>
                </thead>
                <tbody>
                  {#each questionsA as slot, idx (slot.id + activeSet)}
                    <tr class="group relative text-[9pt]">
                      <td
                        class="border-b border-r border-black p-2 text-center align-middle relative"
                      >
                        {idx + 1}.
                        {#if isEditable}
                          <div
                            class="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                          >
                            <button
                              onclick={() => openSwapSidebar(slot, "A")}
                              class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                              title="Swap Question"
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
                            <button
                              onclick={() => removeQuestion(slot)}
                              class="p-1 hover:bg-gray-100 rounded text-red-500 bg-white shadow-sm border"
                              title="Remove"
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
                                  d="M6 18L18 6M6 6l12 12"
                                /></svg
                              >
                            </button>
                          </div>
                        {/if}
                      </td>
                      <td
                        class="border-b border-r border-black p-2 align-top text-[10pt]"
                      >
                        {#if slot.type === "OR_GROUP"}
                          <div class="space-y-4">
                            <div class="flex gap-2">
                              <span class="font-bold whitespace-nowrap"
                                >(a)</span
                              >
                              <AssessmentEditable
                                value={getQuestionText(slot.choice1)}
                                onUpdate={(v) =>
                                  updateText(
                                    v,
                                    "QUESTION",
                                    "text",
                                    slot.id,
                                    slot.choice1.questions?.[0]?.id ||
                                      slot.choice1.id,
                                  )}
                                multiline={true}
                              />
                            </div>
                            <div class="text-center italic text-[8pt]">
                              (or)
                            </div>
                            <div class="flex gap-2">
                              <span class="font-bold whitespace-nowrap"
                                >(b)</span
                              >
                              <AssessmentEditable
                                value={getQuestionText(slot.choice2)}
                                onUpdate={(v: string) =>
                                  updateText(
                                    v,
                                    "QUESTION",
                                    "text",
                                    slot.id,
                                    slot.choice2.questions?.[0]?.id ||
                                      slot.choice2.id,
                                  )}
                                multiline={true}
                              />
                            </div>
                          </div>
                        {:else}
                          <AssessmentEditable
                            value={getQuestionText(slot)}
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
                        class="border-b border-r border-black p-2 text-center align-middle"
                      >
                        {slot.type === "OR_GROUP"
                          ? slot.choice1?.questions?.[0]?.bloom_level || "K1"
                          : slot.questions?.[0]?.bloom_level || "K2"}
                      </td>
                      <td
                        class="border-b border-black p-2 text-center align-middle"
                      >
                        {slot.type === "OR_GROUP"
                          ? getCoCode(slot.choice1?.questions?.[0]?.co_id)
                          : getCoCode(slot.questions?.[0]?.co_id)}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- PART B -->
        {#if questionsB.length > 0 || mode === "preview"}
          <div>
            <div class="text-center mb-2">
              <div
                class="font-bold underline decoration-1 underline-offset-4 text-[11pt] uppercase"
              >
                PART – B ({questionsB.length} X {Number(
                  questionsB[0]?.marks ||
                    questionsB[0]?.questions?.[0]?.marks ||
                    4,
                )} = {totalB}
                Marks)
              </div>
              <div class="font-bold text-[10pt] mt-1 italic">
                Answer Any Five Questions
              </div>
            </div>

            <div
              use:dndzone={{ items: questionsB, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
              class="border-t border-l border-r border-black"
            >
              <table class="w-full border-collapse">
                <thead>
                  <tr class="text-[9pt] font-bold">
                    <th
                      class="border-b border-r border-black p-1 w-[50px] text-center"
                      >Q. No</th
                    >
                    <th class="border-b border-r border-black p-1 text-center"
                      >Question</th
                    >
                    <th
                      class="border-b border-r border-black p-1 w-[70px] text-center"
                      >Blooms Level</th
                    >
                    <th class="border-b border-black p-1 w-[60px] text-center"
                      >CO's</th
                    >
                  </tr>
                </thead>
                <tbody>
                  {#each questionsB as slot, idx (slot.id + activeSet)}
                    {#if slot.type === "OR_GROUP"}
                      <!-- TWO ROWS for OR_GROUP -->
                      <!-- ROW 1: Choice A -->
                      <tr class="group relative text-[9pt]">
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle relative"
                        >
                          {questionsA.length + idx * 2 + 1}.
                          {#if isEditable}
                            <div
                              class="absolute -left-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                            >
                              <button
                                onclick={() => openSwapSidebar(slot, "B", "q1")}
                                class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                                title="Swap Choice A"
                              >
                                <svg
                                  class="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
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
                                title="Remove Full Question"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  /></svg
                                >
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td
                          class="border-b border-r border-black p-2 align-top"
                        >
                          <div class="flex gap-2">
                            <span class="font-bold whitespace-nowrap">(a)</span>
                            <AssessmentEditable
                              value={getQuestionText(slot.choice1)}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  slot.choice1.questions?.[0]?.id ||
                                    slot.choice1.id,
                                )}
                              multiline={true}
                            />
                          </div>
                        </td>
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle"
                        >
                          {slot.symbols?.choice1?.bloom ||
                            slot.choice1?.questions?.[0]?.bloom_level ||
                            "K3"}
                        </td>
                        <td
                          class="border-b border-black p-2 text-center align-middle"
                        >
                          {getCoCode(slot.choice1?.questions?.[0]?.co_id)}
                        </td>
                      </tr>
                      <!-- OR Row -->
                      <tr class="text-[8pt] italic">
                        <td
                          class="border-b border-r border-black font-bold text-center p-1"
                          >(or)</td
                        >
                        <td colspan="3" class="border-b border-black"></td>
                      </tr>
                      <!-- ROW 2: Choice B -->
                      <tr class="group relative text-[9pt]">
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle relative"
                        >
                          {questionsA.length + idx * 2 + 2}.
                          {#if isEditable}
                            <div
                              class="absolute -left-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                            >
                              <button
                                onclick={() => openSwapSidebar(slot, "B", "q2")}
                                class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                                title="Swap Choice B"
                              >
                                <svg
                                  class="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2.5"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  /></svg
                                >
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td
                          class="border-b border-r border-black p-2 align-top"
                        >
                          <div class="flex gap-2">
                            <span class="font-bold whitespace-nowrap">(b)</span>
                            <AssessmentEditable
                              value={getQuestionText(slot.choice2)}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  slot.choice2.questions?.[0]?.id ||
                                    slot.choice2.id,
                                )}
                              multiline={true}
                            />
                          </div>
                        </td>
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle"
                        >
                          {slot.symbols?.choice2?.bloom ||
                            slot.choice2?.questions?.[0]?.bloom_level ||
                            "K3"}
                        </td>
                        <td
                          class="border-b border-black p-2 text-center align-middle"
                        >
                          {getCoCode(slot.choice2?.questions?.[0]?.co_id)}
                        </td>
                      </tr>
                    {:else}
                      <tr class="group relative text-[9pt]">
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle relative"
                        >
                          {questionsA.length + idx + 1}.
                          {#if isEditable}
                            <div
                              class="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                            >
                              <button
                                onclick={() => openSwapSidebar(slot, "B")}
                                class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                                title="Swap Question"
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
                              <button
                                onclick={() => removeQuestion(slot)}
                                class="p-1 hover:bg-gray-100 rounded text-red-500 bg-white shadow-sm border"
                                title="Remove"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  /></svg
                                >
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td
                          class="border-b border-r border-black p-2 align-top"
                        >
                          <AssessmentEditable
                            value={getQuestionText(slot)}
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
                        </td>
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle"
                        >
                          {slot.questions?.[0]?.bloom_level || "K3"}
                        </td>
                        <td
                          class="border-b border-black p-2 text-center align-middle"
                        >
                          {getCoCode(slot.questions?.[0]?.co_id)}
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- PART C -->
        {#if questionsC.length > 0 || mode === "preview"}
          <div>
            <div class="text-center mb-2">
              <div
                class="font-bold underline decoration-1 underline-offset-4 text-[11pt] uppercase"
              >
                PART – C ({questionsC.length} X {Number(
                  questionsC[0]?.marks ||
                    questionsC[0]?.questions?.[0]?.marks ||
                    10,
                )} = {totalC}
                Marks)
              </div>
              <div class="font-bold text-[10pt] mt-1 italic">
                Answer All Questions
              </div>
            </div>

            <div
              use:dndzone={{ items: questionsC, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("C", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("C", (e.detail as any).items)}
              class="border-t border-l border-r border-black"
            >
              <table class="w-full border-collapse">
                <thead>
                  <tr class="text-[9pt] font-bold">
                    <th
                      class="border-b border-r border-black p-1 w-[50px] text-center"
                      >Q. No</th
                    >
                    <th class="border-b border-r border-black p-1 text-center"
                      >Question</th
                    >
                    <th
                      class="border-b border-r border-black p-1 w-[70px] text-center"
                      >Blooms Level</th
                    >
                    <th class="border-b border-black p-1 w-[60px] text-center"
                      >CO's</th
                    >
                  </tr>
                </thead>
                <tbody>
                  {#each questionsC as slot, idx (slot.id + activeSet)}
                    {#if slot.type === "OR_GROUP"}
                      <!-- TWO ROWS for OR_GROUP -->
                      <!-- ROW 1: Choice A -->
                      <tr class="group relative text-[9pt]">
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle relative"
                        >
                          {questionsA.length +
                            questionsB.length * 2 +
                            idx * 2 +
                            1}.
                          {#if isEditable}
                            <div
                              class="absolute -left-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                            >
                              <button
                                onclick={() => openSwapSidebar(slot, "C", "q1")}
                                class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                                title="Swap Choice A"
                              >
                                <svg
                                  class="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
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
                                title="Remove Full Question"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  /></svg
                                >
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td
                          class="border-b border-r border-black p-2 align-top"
                        >
                          <div class="flex gap-2">
                            <span class="font-bold whitespace-nowrap">(a)</span>
                            <AssessmentEditable
                              value={getQuestionText(slot.choice1)}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  slot.choice1.questions?.[0]?.id ||
                                    slot.choice1.id,
                                )}
                              multiline={true}
                            />
                          </div>
                        </td>
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle"
                        >
                          {slot.symbols?.choice1?.bloom ||
                            slot.choice1?.questions?.[0]?.bloom_level ||
                            "K3"}
                        </td>
                        <td
                          class="border-b border-black p-2 text-center align-middle"
                        >
                          {getCoCode(slot.choice1?.questions?.[0]?.co_id)}
                        </td>
                      </tr>
                      <!-- OR Row -->
                      <tr class="text-[8pt] italic">
                        <td
                          class="border-b border-r border-black font-bold text-center p-1"
                          >(or)</td
                        >
                        <td colspan="3" class="border-b border-black"></td>
                      </tr>
                      <!-- ROW 2: Choice B -->
                      <tr class="group relative text-[9pt]">
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle relative"
                        >
                          {questionsA.length +
                            questionsB.length * 2 +
                            idx * 2 +
                            2}.
                          {#if isEditable}
                            <div
                              class="absolute -left-10 top-0 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                            >
                              <button
                                onclick={() => openSwapSidebar(slot, "C", "q2")}
                                class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                                title="Swap Choice B"
                              >
                                <svg
                                  class="w-3 h-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2.5"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  /></svg
                                >
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td
                          class="border-b border-r border-black p-2 align-top"
                        >
                          <div class="flex gap-2">
                            <span class="font-bold whitespace-nowrap">(b)</span>
                            <AssessmentEditable
                              value={getQuestionText(slot.choice2)}
                              onUpdate={(v: string) =>
                                updateText(
                                  v,
                                  "QUESTION",
                                  "text",
                                  slot.id,
                                  slot.choice2.questions?.[0]?.id ||
                                    slot.choice2.id,
                                )}
                              multiline={true}
                            />
                          </div>
                        </td>
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle"
                        >
                          {slot.symbols?.choice2?.bloom ||
                            slot.choice2?.questions?.[0]?.bloom_level ||
                            "K3"}
                        </td>
                        <td
                          class="border-b border-black p-2 text-center align-middle"
                        >
                          {getCoCode(slot.choice2?.questions?.[0]?.co_id)}
                        </td>
                      </tr>
                    {:else}
                      <tr class="group relative text-[9pt]">
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle relative"
                        >
                          {questionsA.length + questionsB.length * 2 + idx + 1}.
                          {#if isEditable}
                            <div
                              class="absolute -left-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex flex-col gap-1"
                            >
                              <button
                                onclick={() => openSwapSidebar(slot, "C")}
                                class="p-1 hover:bg-gray-100 rounded text-indigo-600 bg-white shadow-sm border"
                                title="Swap Question"
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
                              <button
                                onclick={() => removeQuestion(slot)}
                                class="p-1 hover:bg-gray-100 rounded text-red-500 bg-white shadow-sm border"
                                title="Remove"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  /></svg
                                >
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td
                          class="border-b border-r border-black p-2 align-top"
                        >
                          <AssessmentEditable
                            value={getQuestionText(slot)}
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
                        </td>
                        <td
                          class="border-b border-r border-black p-2 text-center align-middle"
                        >
                          {slot.questions?.[0]?.bloom_level || "K3"}
                        </td>
                        <td
                          class="border-b border-black p-2 text-center align-middle"
                        >
                          {getCoCode(slot.questions?.[0]?.co_id)}
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </div>

      <!-- FOOTER -->
      <div class="mt-12 text-center text-[10pt] font-bold">
        ------------------End------------------
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
  #takshashila-paper-actual {
    font-family: "Times New Roman", Times, serif;
  }
  table th {
    background-color: #f9fafb;
  }
  :global(.no-print) {
    @media print {
      display: none !important;
    }
  }
</style>
