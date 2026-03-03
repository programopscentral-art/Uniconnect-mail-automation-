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
      <div class="text-center mb-4">
        <h1 class="text-[14pt] font-black uppercase tracking-tight">
          ANNAMACHARYA UNIVERSITY
        </h1>
        <div class="text-[9.5pt] mt-1 space-y-0.5 font-medium">
          <p>
            II <AssessmentEditable
              value={paperMeta.programme || "B.Tech"}
              onUpdate={(v: string) => updateText(v, "META", "programme")}
            />
            Semester <AssessmentEditable
              value={paperMeta.semester || "I"}
              onUpdate={(v: string) => updateText(v, "META", "semester")}
            />
            <AssessmentEditable
              value={paperMeta.branch || "CSE & Allied Branches"}
              onUpdate={(v: string) => updateText(v, "META", "branch")}
            />
            1<sup>st</sup> Mid Examination
          </p>
          <p class="font-bold">
            <AssessmentEditable
              value={paperMeta.course_code || "24AC5E33T"}
              onUpdate={(v: string) => updateText(v, "META", "course_code")}
            /> --
            <AssessmentEditable
              value={paperMeta.subject_name ||
                "Digital Logic Design & Computer Organization"}
              onUpdate={(v: string) => updateText(v, "META", "subject_name")}
            />
          </p>
        </div>
      </div>

      <!-- Hall Ticket & AU24 Box -->
      <div class="flex justify-between items-end mb-3 px-1">
        <div class="flex items-center gap-1 border border-black p-0.5">
          <span class="text-[8pt] font-bold px-1 whitespace-nowrap"
            >H.T. No:-</span
          >
          <div class="flex border-l border-black">
            {#each Array(10) as _}
              <div class="w-5 h-5 border-r border-black last:border-r-0"></div>
            {/each}
          </div>
        </div>
        <div class="border border-black px-3 py-1 font-bold text-[10pt]">
          AU24
        </div>
      </div>

      <div class="border-t border-black w-full mb-2"></div>

      <!-- Metadata Row -->
      <div class="flex justify-between text-[9pt] font-bold px-4 mb-2">
        <div class="flex">
          <span>Date:-</span>
          <AssessmentEditable
            value={paperMeta.paper_date || "28-08-2025"}
            onUpdate={(v: string) => updateText(v, "META", "paper_date")}
            class="ml-1"
          />
        </div>
        <div class="flex">
          <span>Duration:</span>
          <AssessmentEditable
            value={paperMeta.duration_text || "2Hrs"}
            onUpdate={(v: string) => updateText(v, "META", "duration_text")}
            class="ml-1"
          />
        </div>
        <div class="flex">
          <span>Max.Marks:</span>
          <AssessmentEditable
            value={paperMeta.max_marks || "30"}
            onUpdate={(v: string) => updateText(v, "META", "max_marks")}
            class="ml-1"
          />
        </div>
      </div>

      <div class="border-t border-black w-full mb-3"></div>

      <!-- Notes Section -->
      <div class="text-[8.5pt] mb-3 px-2 leading-tight">
        <p>
          Note: 1. Question Paper consists of two parts (<b>Part-A</b> and
          <b>Part-B</b>)
        </p>
        <p class="pl-8">2. In Part-A, each question carries <b>one mark</b>.</p>
        <p class="pl-8">
          3. <b>30 marks</b> in <b>Part-B</b> will be condensed to
          <b>25 marks</b>.
        </p>
        <p class="pl-8">
          4. Answer <b>ALL</b> the questions in <b>Part-A</b> and <b>Part-B</b>
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
                <!-- Single Question Slot -->
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
                    <div class="flex gap-2 min-h-[0.8in]">
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
                          options={slot.options || slot.questions?.[0]?.options}
                          class="mt-1 text-[8pt]"
                        />
                      </div>
                    </div>
                  </td>
                  <td
                    class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                    >{slot.marks || slot.questions?.[0]?.marks || ""}</td
                  >
                  <td
                    class="border-r border-black p-1 text-center font-bold px-2 pt-2"
                    >{getCoCode(
                      slot.co_id ||
                        slot.target_co ||
                        slot.questions?.[0]?.co_id,
                    )}</td
                  >
                  <td class="p-1 text-center font-bold px-2 pt-2"
                    >{slot.bloom_level ||
                      slot.bloom ||
                      slot.questions?.[0]?.bloom_level ||
                      ""}</td
                  >
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Prepared By Footer -->
      <div class="mt-8 flex justify-end px-2">
        <div class="text-[9pt] font-bold flex gap-1">
          <span>Prepared by:-</span>
          <AssessmentEditable
            value={paperMeta.prepared_by ||
              "Mr S Nyamathulla Asst. Professor, Dept. of CSE"}
            onUpdate={(v: string) => updateText(v, "META", "prepared_by")}
          />
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
  #annamacharya-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black;
  }
  #annamacharya-paper-actual * {
    box-sizing: border-box;
  }

  /* Tables */
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    border: 1px solid black;
  }

  /* Printing */
  @media print {
    .no-print {
      display: none !important;
    }
    #annamacharya-paper-actual {
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: none !important;
      width: 100% !important;
    }
  }

  :global(.assessment-editable-container) {
    display: inline-block;
    min-width: 20px;
  }
</style>
