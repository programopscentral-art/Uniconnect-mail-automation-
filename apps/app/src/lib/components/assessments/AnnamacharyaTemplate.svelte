<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
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

  const isEditable = $derived(mode === "edit" || mode === "preview");

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

  let isSwapSidebarOpen = $state(false);
  let swapContext = $state<any>(null);

  function openSwapSidebar(
    slot: any,
    part: string,
    subPart?: "q1" | "q2",
    questionId?: string,
  ) {
    const arr = Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData.questions;
    const index = arr.indexOf(slot);

    let targetQuestion = null;
    if (slot.type === "OR_GROUP") {
      const choice = subPart === "q1" ? slot.choice1 : slot.choice2;
      targetQuestion = questionId
        ? choice.questions?.find((q: any) => q.id === questionId)
        : choice.questions?.[0];
    } else {
      targetQuestion = questionId
        ? slot.questions?.find((q: any) => q.id === questionId)
        : slot.questions?.[0] || slot;
    }

    const marks = Number(
      targetQuestion?.marks ||
        slot.marks ||
        paperStructure.find((s: any) => s.part === part)?.marks_per_q ||
        0,
    );

    swapContext = {
      slotIndex: index,
      part,
      subPart,
      questionId,
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
    const slot = arr[swapContext.slotIndex];
    const nQ = {
      id: question.id,
      text: question.question_text || question.text,
      marks: question.marks || swapContext.currentMark,
      options: question.options,
      bloom_level: question.bloom_level,
      co_id: question.co_id,
      image_url: question.image_url,
    };

    if (slot.type === "OR_GROUP") {
      const choice = swapContext.subPart === "q1" ? slot.choice1 : slot.choice2;
      if (swapContext.questionId) {
        const qIdx = choice.questions.findIndex(
          (q: any) => q.id === swapContext.questionId,
        );
        if (qIdx !== -1) choice.questions[qIdx] = nQ;
      } else {
        choice.questions = [nQ];
      }
    } else {
      if (swapContext.questionId && slot.questions) {
        const qIdx = slot.questions.findIndex(
          (q: any) => q.id === swapContext.questionId,
        );
        if (qIdx !== -1) slot.questions[qIdx] = nQ;
      } else {
        slot.questions = [nQ];
        slot.text = nQ.text;
      }
    }

    if (Array.isArray(currentSetData)) currentSetData = [...currentSetData];
    else currentSetData.questions = [...currentSetData.questions];

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }

    isSwapSidebarOpen = false;
  }

  const allQuestionsInSet = $derived(
    Array.isArray(currentSetData.questions) ? currentSetData.questions : [],
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

  const alphabet = "abcdefghijklmnopqrstuvwxyz";
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="annamacharya-paper-actual"
      class="mx-auto bg-white p-[0.3in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- Header Section -->
      <div class="text-center mb-1 pt-3 w-full text-black">
        <!-- University Name -->
        <div
          class="text-[23.5pt] font-black uppercase tracking-tight mb-2 leading-none w-full"
          style="font-family: 'Arial Black', Arial, sans-serif;"
        >
          ANNAMACHARYA UNIVERSITY
        </div>

        <!-- Info Line -->
        <div
          class="text-[12.5pt] text-center w-full tracking-[-0.2px] leading-tight mt-1 mb-1"
          style="font-family: 'Century Gothic', Calibri, sans-serif;"
        >
          II <AssessmentEditable
            value={paperMeta.programme || "B.Tech"}
            onUpdate={(v: string) => updateText(v, "META", "programme")}
            class="inline-block"
          />
          <AssessmentEditable
            value={paperMeta.semester || "I"}
            onUpdate={(v: string) => updateText(v, "META", "semester")}
            class="inline-block"
          /> Semester<span
            class="font-extrabold underline decoration-[1.5px] mx-0"
            style="text-underline-offset:2px;"
            ><AssessmentEditable
              value={paperMeta.branch || "CSE & Allied Branches"}
              onUpdate={(v: string) => updateText(v, "META", "branch")}
              class="inline-block"
            /></span
          ><AssessmentEditable
            value={paperMeta.exam_instance || "1st Mid Examination"}
            onUpdate={(v: string) => updateText(v, "META", "exam_instance")}
            class="inline-block"
          />
        </div>

        <!-- Subject Line -->
        <div
          class="font-[800] text-[13.5pt] text-center w-full mt-0 mb-3 tracking-[-0.1px]"
          style="font-family: 'Century Gothic', Arial, sans-serif;"
        >
          <AssessmentEditable
            value={paperMeta.course_code || "24ACSE33T"}
            onUpdate={(v: string) => updateText(v, "META", "course_code")}
            class="inline-block"
          />-- <AssessmentEditable
            value={paperMeta.subject_name ||
              "Digital Logic Design& Computer Organization"}
            onUpdate={(v: string) => updateText(v, "META", "subject_name")}
            class="inline-block"
          />
        </div>
      </div>

      <!-- Hall Ticket & AU24 Box Row -->
      <div
        class="flex justify-between items-end mb-[10px] px-1 w-full relative"
      >
        <!-- Left: HT Box -->
        <div class="flex items-center">
          <table class="border-collapse">
            <tbody>
              <tr>
                <td class="border border-black px-[6px] py-[1px] align-middle">
                  <span
                    class="text-[12pt] font-extrabold tracking-tight"
                    style="font-family: 'Century Gothic', sans-serif;"
                    >H.T. No:-</span
                  >
                </td>
                {#each Array(10) as _}
                  <td class="border border-black w-[30px] h-[34px]"></td>
                {/each}
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Right: AU24 Box -->
        <div
          class="border border-black px-[10px] py-[3px] flex items-center justify-center min-w-[75px] shadow-[1px_1px_1px_rgba(0,0,0,0.4)]"
        >
          <span
            class="font-extrabold text-[14pt]"
            style="font-family: 'Times New Roman', serif;">AU24</span
          >
        </div>
      </div>

      <div
        class="border-t-[1.5px] border-dotted border-gray-400 opacity-60 w-full mb-1 mt-2"
      ></div>

      <!-- Metadata Row -->
      <div
        class="flex items-end text-[13.5pt] font-bold px-0 mb-2 w-full text-left"
        style="font-family: 'Times New Roman', serif; letter-spacing: -0.2px;"
      >
        <span class=""
          >Date:-<AssessmentEditable
            value={paperMeta.paper_date || "28-08-2025"}
            onUpdate={(v: string) => updateText(v, "META", "paper_date")}
            class="inline-block ml-[2px]"
          /></span
        >
        <span class="ml-[10px] mr-[2px]">Duration:</span>
        <span class=""
          ><AssessmentEditable
            value={paperMeta.duration_text || "2Hrs."}
            onUpdate={(v: string) => updateText(v, "META", "duration_text")}
            class="inline-block"
          /></span
        ><span class="ml-[10px]">Max.Marks:</span><AssessmentEditable
          value={paperMeta.max_marks || "30"}
          onUpdate={(v: string) => updateText(v, "META", "max_marks")}
          class="inline-block ml-[2px]"
        />
      </div>

      <!-- Notes Section -->
      <div
        class="text-[11.5pt] mb-6 px-1 tracking-tight leading-snug"
        style="font-family: 'Times New Roman', serif; letter-spacing: -0.1px;"
      >
        <p>
          Note: 1. Question Paper consists of two parts (<span class="font-bold"
            >Part-A</span
          >
          and <span class="font-bold">Part-B</span>)
        </p>
        <p class="pl-0">
          2. In Part-A, each question carries <span class="font-bold"
            >one mark</span
          >.
        </p>
        <p class="pl-[12px]">
          3. <span class="font-bold">30 marks</span> in
          <span class="font-bold">Part-B</span>
          will be condensed to <span class="font-bold">25 marks</span>.
        </p>
        <p class="pl-[12px]">
          4. Answer <span class="font-bold uppercase">all</span> the questions
          in <span class="font-bold">Part-A</span>and
          <span class="font-bold">Part-B</span>
        </p>
      </div>

      <!-- Question Area -->
      <div class="w-full border border-black overflow-hidden bg-white">
        <!-- PART A HEADER -->
        <div
          class="text-center font-bold text-[11pt] border-b border-black py-1 uppercase bg-white"
        >
          PART-A
        </div>

        <!-- Part A Questions -->
        <table class="w-full border-collapse text-[9pt]">
          <thead>
            <tr class="font-bold border-b border-black leading-tight">
              <th
                colspan="2"
                class="border-r border-black p-1 pt-2 pb-2 text-left align-middle px-3"
              >
                Answer all the following short answer questions
                <AssessmentEditable
                  value={paperMeta.partA_marks_label || "5X1=5M"}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "partA_marks_label")}
                  class="inline-block"
                />
              </th>
              <th
                class="border-r border-black p-1 w-[60px] text-center uppercase text-[7pt]"
                >Course<br />Outcome</th
              >
              <th class="p-1 w-[50px] text-center uppercase text-[7pt]"
                >Bloom's<br />Level</th
              >
            </tr>
          </thead>
          <tbody
            use:dndzone={{
              items: questionsA,
              flipDurationMs: 200,
              dragDisabled: !isEditable,
            }}
            onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
            onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
          >
            {#each questionsA as slot, idx (slot.id + activeSet)}
              {@const qNum = displayNumbersA[idx]}
              {#if slot.questions && slot.questions.length > 0}
                {#each slot.questions as q, qidx}
                  <tr
                    class="group relative border-b border-black last:border-b-0"
                  >
                    {#if qidx === 0}
                      <td
                        rowspan={slot.questions.length}
                        class="border-r border-black p-1 w-[35px] font-bold text-center align-top pt-2"
                      >
                        {qNum.start}
                      </td>
                    {/if}
                    <td
                      class="border-r border-black p-1 px-2 align-top relative"
                    >
                      <div class="flex gap-2 min-h-[1.2in]">
                        <span class="font-bold min-w-[20px]"
                          >{alphabet[qidx]})</span
                        >
                        <div class="flex-1 relative">
                          <!-- Controls (Hidden on Print) -->
                          <div
                            class="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex gap-1 z-20"
                          >
                            <button
                              onclick={() =>
                                openSwapSidebar(slot, "A", undefined, q.id)}
                              class="p-1 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100"
                              title="Swap Question"
                            >
                              <svg
                                class="w-3 h-3 text-blue-600"
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
                            value={q.text || q.question_text || ""}
                            onUpdate={(v: string) =>
                              updateText(v, "QUESTION", "text", slot.id, q.id)}
                            multiline={true}
                          />
                          <AssessmentMcqOptions
                            options={q.options}
                            class="mt-1 text-[8pt]"
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      class="border-r border-black p-1 text-center font-bold px-2"
                      >{getCoCode(q.co_id || q.target_co)}</td
                    >
                    <td class="p-1 text-center font-bold px-2 pt-2"
                      >{q.bloom_level || q.bloom || ""}</td
                    >
                  </tr>
                {/each}
              {:else}
                <tr
                  class="group relative border-b border-black last:border-b-0"
                >
                  <td
                    class="border-r border-black p-1 w-[35px] font-bold text-center align-top pt-2"
                  >
                    {qNum.start}
                  </td>
                  <td class="border-r border-black p-1 px-2 align-top relative">
                    <div class="flex gap-2 min-h-[0.5in]">
                      <div class="flex-1 relative">
                        <div
                          class="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex gap-1 z-20"
                        >
                          <button
                            onclick={() => openSwapSidebar(slot, "A")}
                            class="p-1 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100"
                            title="Swap Question"
                          >
                            <svg
                              class="w-3 h-3 text-blue-600"
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
                          value={slot.text || slot.question_text || ""}
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
                        <AssessmentMcqOptions
                          options={slot.options}
                          class="mt-1 text-[8pt]"
                        />
                      </div>
                    </div>
                  </td>
                  <td
                    class="border-r border-black p-1 text-center font-bold px-2"
                    >{getCoCode(slot.co_id || slot.target_co)}</td
                  >
                  <td class="p-1 text-center font-bold px-2 pt-2"
                    >{slot.bloom_level || slot.bloom || ""}</td
                  >
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>

        <!-- PART B HEADER -->
        <div
          class="text-center font-bold text-[11pt] border-y border-black py-1 uppercase bg-white"
        >
          PART-B
        </div>

        <!-- Part B Questions -->
        <table class="w-full border-collapse text-[9pt]">
          <thead>
            <tr class="font-bold border-b border-black leading-tight">
              <th
                colspan="3"
                class="border-r border-black p-1 pt-2 pb-2 text-left align-middle px-3"
              >
                Answer all the following questions.
                <AssessmentEditable
                  value={paperMeta.partB_marks_label || "3X10=30M"}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "partB_marks_label")}
                  class="inline-block"
                />
              </th>
              <th
                class="border-r border-black p-1 w-[50px] text-center uppercase text-[7pt]"
                >Marks</th
              >
              <th
                class="border-r border-black p-1 w-[60px] text-center uppercase text-[7pt]"
                >Course<br />Outcome</th
              >
              <th class="p-1 w-[50px] text-center uppercase text-[7pt]"
                >Bloom's<br />Level</th
              >
            </tr>
          </thead>
          <tbody
            use:dndzone={{
              items: questionsB,
              flipDurationMs: 200,
              dragDisabled: !isEditable,
            }}
            onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
            onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
          >
            {#each questionsB as slot, idx (slot.id + activeSet)}
              {@const qNum = displayNumbersB[idx]}
              {#if slot.type === "OR_GROUP"}
                <!-- Choice 1 -->
                {#each slot.choice1.questions || [] as q, qidx}
                  <tr class="group relative border-b border-black">
                    {#if qidx === 0}
                      <td
                        rowspan={slot.choice1.questions.length}
                        class="border-r border-black p-1 w-[35px] font-bold text-center align-top pt-2"
                      >
                        {qNum.start}
                      </td>
                    {/if}
                    <td
                      colspan="2"
                      class="border-r border-black p-1 px-2 align-top relative"
                    >
                      <div class="flex gap-2 min-h-[0.8in]">
                        <span class="font-bold min-w-[20px]"
                          >{slot.choice1.questions.length > 1
                            ? alphabet[qidx]
                            : "a"}</span
                        >
                        <div class="flex-1 relative">
                          <div
                            class="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex gap-1 z-20"
                          >
                            <button
                              onclick={() =>
                                openSwapSidebar(slot, "B", "q1", q.id)}
                              class="p-1 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100"
                              title="Swap Question"
                            >
                              <svg
                                class="w-3 h-3 text-blue-600"
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
                            value={q.text || q.question_text || ""}
                            onUpdate={(v: string) =>
                              updateText(v, "QUESTION", "text", slot.id, q.id)}
                            multiline={true}
                          />
                          <AssessmentMcqOptions
                            options={q.options}
                            class="mt-1 text-[8pt]"
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                      >{q.marks || ""}</td
                    >
                    <td
                      class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                      >{getCoCode(q.co_id || q.target_co)}</td
                    >
                    <td class="p-1 text-center font-bold px-2 pt-2"
                      >{q.bloom_level || q.bloom || ""}</td
                    >
                  </tr>
                {/each}

                <!-- (OR) Row -->
                <tr class="border-b border-black bg-gray-50/20">
                  <td
                    colspan="6"
                    class="p-0.5 text-center font-bold text-[9.5pt] italic tracking-tight uppercase"
                  >
                    (OR)
                  </td>
                </tr>

                <!-- Choice 2 -->
                {#each slot.choice2.questions || [] as q, qidx}
                  <tr
                    class="group relative border-b border-black last:border-b-0"
                  >
                    {#if qidx === 0}
                      <td
                        rowspan={slot.choice2.questions.length}
                        class="border-r border-black p-1 w-[35px] font-bold text-center align-top pt-2"
                      >
                        {qNum.end}
                      </td>
                    {/if}
                    <td
                      colspan="2"
                      class="border-r border-black p-1 px-2 align-top relative"
                    >
                      <div class="flex gap-2 min-h-[0.8in]">
                        <span class="font-bold min-w-[20px]"
                          >{slot.choice2.questions.length > 1
                            ? alphabet[qidx]
                            : "a"}</span
                        >
                        <div class="flex-1 relative">
                          <div
                            class="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex gap-1 z-20"
                          >
                            <button
                              onclick={() =>
                                openSwapSidebar(slot, "B", "q2", q.id)}
                              class="p-1 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100"
                              title="Swap Question"
                            >
                              <svg
                                class="w-3 h-3 text-blue-600"
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
                            value={q.text || q.question_text || ""}
                            onUpdate={(v: string) =>
                              updateText(v, "QUESTION", "text", slot.id, q.id)}
                            multiline={true}
                          />
                          <AssessmentMcqOptions
                            options={q.options}
                            class="mt-1 text-[8pt]"
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                      >{q.marks || ""}</td
                    >
                    <td
                      class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                      >{getCoCode(q.co_id || q.target_co)}</td
                    >
                    <td class="p-1 text-center font-bold px-2 pt-2"
                      >{q.bloom_level || q.bloom || ""}</td
                    >
                  </tr>
                {/each}
              {:else}
                <tr
                  class="group relative border-b border-black last:border-b-0"
                >
                  <td
                    class="border-r border-black p-1 w-[35px] font-bold text-center align-top pt-2"
                  >
                    {qNum.start}
                  </td>
                  <td
                    colspan="2"
                    class="border-r border-black p-1 px-2 align-top relative"
                  >
                    <div class="flex gap-2 min-h-[1in]">
                      <div class="flex-1 relative">
                        <div
                          class="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity no-print flex gap-1 z-20"
                        >
                          <button
                            onclick={() => openSwapSidebar(slot, "B")}
                            class="p-1 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-100"
                            title="Swap Question"
                          >
                            <svg
                              class="w-3 h-3 text-blue-600"
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
                          value={slot.text || slot.question_text || ""}
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
                        <AssessmentMcqOptions
                          options={slot.options}
                          class="mt-1 text-[8pt]"
                        />
                      </div>
                    </div>
                  </td>
                  <td
                    class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                    >{slot.marks || ""}</td
                  >
                  <td
                    class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                    >{getCoCode(slot.co_id || slot.target_co)}</td
                  >
                  <td class="p-1 text-center font-bold px-2 pt-2"
                    >{slot.bloom_level || slot.bloom || ""}</td
                  >
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  {#if isSwapSidebarOpen}
    <SwapQuestionSidebar
      bind:isOpen={isSwapSidebarOpen}
      {questionPool}
      currentMark={swapContext?.currentMark}
      currentQuestionId={swapContext?.currentId}
      onSelect={selectAlternate}
    />
  {/if}
</div>

<style>
  #annamacharya-paper-actual {
    font-family: serif;
    line-height: 1.25;
  }
  :global(.dark #annamacharya-paper-actual) {
    color: black !important;
  }
</style>
