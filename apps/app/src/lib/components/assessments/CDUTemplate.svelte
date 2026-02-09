<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentSlotSingle from "./shared/AssessmentSlotSingle.svelte";
  import AssessmentSlotOrGroup from "./shared/AssessmentSlotOrGroup.svelte";

  let {
    paperMeta = $bindable({}),
    currentSetData = $bindable({ questions: [] }),
    paperStructure = $bindable([]),
    courseOutcomes = [],
    questionPool = [],
    mode = "view",
    activeSet = "A",
    onSwap = null,
  } = $props();

  function rebuildAnswerSheet() {
    if (Array.isArray(currentSetData)) return; // Only for object-based sets

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

  let snoWidth = $derived(Number(paperMeta.colWidths?.sno || 35));
  let isResizing = $state<string | null>(null);

  $effect(() => {
    if (!paperMeta.colWidths) paperMeta.colWidths = { sno: 35 };
  });

  const isEditable = $derived(mode === "edit" || mode === "preview");

  const sectionKeys = $derived.by(() => {
    const keys = new Set<string>();
    if (mode === "preview" || mode === "edit") {
      (paperStructure || []).forEach((s: any) => {
        if (s.part) keys.add(s.part);
      });
    }
    const qs = (
      Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData?.questions || []
    ).filter(Boolean);
    qs.forEach((q: any) => {
      if (q.part) keys.add(q.part);
    });

    if (keys.size === 0) return ["A", "B"];
    return Array.from(keys).sort();
  });

  function handleDndSync(section: string, items: any[]) {
    const otherQuestions = (currentSetData.questions || []).filter(
      (q: any) => q.part !== section,
    );
    const result: any[] = [];
    sectionKeys.forEach((s) => {
      if (s === section) result.push(...items);
      else result.push(...otherQuestions.filter((q: any) => q.part === s));
    });
    currentSetData.questions = result;
  }

  function onResizeStart(col: string, e: MouseEvent) {
    if (!isEditable) return;
    isResizing = col;
    document.body.classList.add("cursor-col-resize");
    window.addEventListener("mousemove", onResizing);
    window.addEventListener("mouseup", onResizeEnd);
  }

  function onResizing(e: MouseEvent) {
    if (!isResizing) return;
    if (isResizing === "sno") {
      paperMeta.colWidths.sno = Math.max(
        25,
        Math.min(80, (paperMeta.colWidths.sno || 35) + e.movementX),
      );
    }
  }

  function onResizeEnd() {
    isResizing = null;
    document.body.classList.remove("cursor-col-resize");
    window.removeEventListener("mousemove", onResizing);
    window.removeEventListener("mouseup", onResizeEnd);
  }

  function getSectionConfig(partChar: string) {
    return paperStructure.find((s: any) => s.part === partChar);
  }

  function updateSectionTitle(partChar: string, newTitle: string) {
    const section = getSectionConfig(partChar);
    if (section) section.title = newTitle;
  }

  function updateInstructions(partChar: string, newText: string) {
    const section = getSectionConfig(partChar);
    if (section) section.instructions = newText;
  }

  function getInstructionsMarks(section: string) {
    const cfg = getSectionConfig(section);
    if (cfg?.instructions_marks && cfg.instructions_marks !== "auto")
      return cfg.instructions_marks;
    const m = cfg?.marks_per_q || 2;
    const count = cfg?.answered_count || 6;
    return `${count} x ${m} = ${count * m}`;
  }

  function updateTextValue(
    value: string,
    type: "META" | "QUESTION",
    field: string,
    slotId?: string,
    qId?: string,
    subPart?: "choice1" | "choice2",
  ) {
    if (!isEditable) return;
    if (type === "META") {
      (paperMeta as any)[field] = value;
    } else {
      const slot = currentSetData.questions.find((s: any) => s.id === slotId);
      if (!slot) return;
      let q: any = null;
      if (slot.type === "OR_GROUP") {
        const choice = subPart === "choice1" ? slot.choice1 : slot.choice2;
        q = choice.questions.find((item: any) => item.id === qId);
      } else {
        q = (slot.questions || [slot]).find((item: any) => item.id === qId);
      }
      if (q) {
        q.text = value;
        q.question_text = value;
        currentSetData.questions = [...currentSetData.questions];
        if (onSwap) {
          rebuildAnswerSheet();
          onSwap($state.snapshot(currentSetData));
        }
      }
    }
  }

  function removeQuestion(slot: any) {
    if (!confirm("Are you sure?")) return;
    currentSetData.questions = (currentSetData.questions || []).filter(
      (s: any) => s.id !== slot.id,
    );
    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }
  }

  function openSwapSidebar(slot: any, part: string, subPart?: "q1" | "q2") {
    if (!slot) return;
    const index = currentSetData.questions.findIndex(
      (s: any) => s.id === slot.id,
    );
    if (index === -1) return;
    let cQ =
      slot.type === "OR_GROUP"
        ? subPart === "q1"
          ? slot.choice1?.questions?.[0]
          : slot.choice2?.questions?.[0]
        : slot.questions?.[0] || slot;
    const marks = Number(
      cQ?.marks || slot.marks || getSectionConfig(part)?.marks_per_q || 0,
    );
    let alternates = (questionPool || []).filter((q: any) => q.id !== cQ?.id);

    // If Part A (1-2 Marks), include MCQs and Fill-ins regardless of exact mark match if marks are close
    if (part === "A" && marks <= 2) {
      alternates = alternates.filter(
        (q: any) =>
          Number(q.marks || q.mark) <= marks &&
          (["MCQ", "FILL_IN_BLANK", "VERY_SHORT", "SHORT"].includes(q.type) ||
            (q.question_text || "").includes("___")),
      );
    } else {
      alternates = alternates.filter(
        (q: any) => Number(q.marks || q.mark) === marks,
      );
    }

    swapContext = {
      slotIndex: index,
      part,
      subPart,
      currentMark: marks,
      alternates,
    };
    isSwapSidebarOpen = true;
  }

  function selectAlternate(question: any) {
    if (!swapContext) return;
    const { slotIndex, subPart } = swapContext;
    const nArr = [...currentSetData.questions];
    let nSlot = { ...nArr[slotIndex] };

    const nQ = {
      id: question.id,
      text: question.question_text,
      marks: question.marks,
      type: question.type,
      options: question.options,
      bloom: question.bloom_level,
      part: swapContext.part,
      image_url: question.image_url,
    };

    if (nSlot.type === "OR_GROUP") {
      const choice =
        subPart === "q1" ? { ...nSlot.choice1 } : { ...nSlot.choice2 };
      choice.questions = [nQ];
      if (subPart === "q1") nSlot.choice1 = choice;
      else nSlot.choice2 = choice;
    } else {
      nSlot.questions = [nQ];
    }

    nArr[slotIndex] = nSlot;
    currentSetData = { ...currentSetData, questions: [...nArr] };

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }

    swapCounter++;
    isSwapSidebarOpen = false;
  }

  function getQuestionNumber(qId: string) {
    const qs = currentSetData.questions || [];
    let total = 0;
    for (const q of qs) {
      if (q.id === qId) return total + 1;
      total += q.type === "OR_GROUP" ? 2 : 1;
    }
    return 0;
  }
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-[#f8fafc] dark:bg-slate-950/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8 flex justify-center">
    <div
      id="cdu-paper-container"
      class="bg-white min-h-[297mm] p-[5mm] shadow-2xl font-serif text-black relative"
      style="width: 210mm;"
    >
      <!-- Main Border Box -->
      <div class="border-[1.5pt] border-black flex flex-col h-full bg-white">
        <!-- Header -->
        <div
          class="text-center pb-4 pt-1 border-b-[1.5pt] border-black relative"
        >
          <div class="flex flex-col items-center mb-1">
            <div class="font-bold text-[11pt] mb-1">Set - {activeSet}</div>
            <div
              class="text-[12pt] font-black text-black tracking-[0.2em] leading-none mb-1 uppercase"
            >
              CHAITANYA
            </div>
            <div
              class="text-[10pt] font-bold text-black leading-none mb-2 uppercase"
            >
              (DEEMED TO BE UNIVERSITY)
            </div>
          </div>

          <AssessmentEditable
            value={paperMeta.exam_title || "I INTERNAL EXAMINATIONS-NOV -2024"}
            onUpdate={(v: string) => updateTextValue(v, "META", "exam_title")}
            class="text-[11pt] font-bold uppercase mt-1"
          />

          <div class="mt-1 flex flex-col items-center">
            <AssessmentEditable
              value={paperMeta.programme || "B.Tech(CSE) - I SEMESTER"}
              onUpdate={(v: string) => updateTextValue(v, "META", "programme")}
              class="text-[11pt] font-bold uppercase !text-red-600 print:!text-[#dc2626]"
            />
            <AssessmentEditable
              value={paperMeta.subject_name || "SUBJECT NAME"}
              onUpdate={(v: string) =>
                updateTextValue(v, "META", "subject_name")}
              class="text-[11pt] font-bold uppercase !text-red-600 print:!text-[#dc2626]"
            />
          </div>

          <!-- Time & Marks Row -->
          <div
            class="mt-2 border-t-[1.5pt] border-black flex justify-between px-2 py-0.5 font-bold text-[10.5pt]"
          >
            <div class="flex items-center gap-1 group relative">
              <span
                class="text-[8pt] text-gray-400 opacity-0 group-hover:opacity-100 absolute -top-4 left-0 transition-opacity"
                >V.2.3.1</span
              >
              <span>Time:</span>
              <AssessmentEditable
                value={paperMeta.duration_label || "1 ½ Hrs."}
                onUpdate={(v: string) =>
                  updateTextValue(v, "META", "duration_label")}
                class="min-w-[40px] border-b border-dotted"
              />
              <span>]</span>
            </div>
            <div class="flex items-center gap-1">
              <span>[Max. Marks:</span>
              <AssessmentEditable
                value={paperMeta.max_marks || "20"}
                onUpdate={(v: string) =>
                  updateTextValue(v, "META", "max_marks")}
                class="min-w-[20px] border-b border-dotted text-center"
              />
              <span>]</span>
            </div>
          </div>
        </div>

        <!-- Sections -->
        <div class="flex-1 flex flex-col">
          {#each sectionKeys as section, sIdx}
            {@const cfg = getSectionConfig(section)}
            <!-- Section Header Bar -->
            <div
              class="bg-white border-b border-black py-0.5 text-center font-bold italic text-[10.5pt]"
            >
              <AssessmentEditable
                value={cfg?.title || `Section - ${section}`}
                onUpdate={(v: string) => updateSectionTitle(section, v)}
                class="w-full text-center"
              />
            </div>

            <!-- Instruction Bar -->
            <div
              class="flex justify-between items-center px-2 py-0.5 border-b border-black font-bold italic text-[10.5pt] bg-white"
            >
              <AssessmentEditable
                value={cfg?.instructions ||
                  (section === "B"
                    ? "Answer the following Questions."
                    : "Answer any six Questions.")}
                onUpdate={(v: string) => updateInstructions(section, v)}
                class="flex-1"
              />
              <AssessmentEditable
                value={cfg?.instructions_marks || getInstructionsMarks(section)}
                onUpdate={(v: string) => {
                  if (cfg) {
                    cfg.instructions_marks = v;
                    paperStructure = [...paperStructure];
                  }
                }}
                class="text-right"
              />
            </div>

            <!-- Questions -->
            <div
              class="flex flex-col min-h-[50px]"
              use:dndzone={{
                items: (currentSetData?.questions || []).filter(
                  (q: any) => q && q.part === section,
                ),
                flipDurationMs: 200,
              }}
              onconsider={(e) =>
                handleDndSync(section, (e.detail as any).items)}
              onfinalize={(e) =>
                handleDndSync(section, (e.detail as any).items)}
            >
              {#key activeSet + swapCounter}
                {#each currentSetData?.questions || [] as q (q.id + activeSet)}
                  {#if q && q.part === section}
                    <div class="border-b border-black">
                      {#if q.type === "OR_GROUP"}
                        <AssessmentSlotOrGroup
                          slot={q}
                          qNumber={getQuestionNumber(q.id)}
                          {isEditable}
                          {snoWidth}
                          onSwap1={() => openSwapSidebar(q, section, "q1")}
                          onSwap2={() => openSwapSidebar(q, section, "q2")}
                          onRemove={() => removeQuestion(q)}
                          onUpdateText1={(v: string, qid: string) =>
                            updateTextValue(
                              v,
                              "QUESTION",
                              "text",
                              q.id,
                              qid,
                              "choice1",
                            )}
                          onUpdateText2={(v: string, qid: string) =>
                            updateTextValue(
                              v,
                              "QUESTION",
                              "text",
                              q.id,
                              qid,
                              "choice2",
                            )}
                        />
                      {:else}
                        <AssessmentSlotSingle
                          slot={q}
                          qNumber={getQuestionNumber(q.id)}
                          {isEditable}
                          {snoWidth}
                          onSwap={() => openSwapSidebar(q, section)}
                          onRemove={() => removeQuestion(q)}
                          onUpdateText={(v: string, qid: string) =>
                            updateTextValue(v, "QUESTION", "text", q.id, qid)}
                        />
                      {/if}
                    </div>
                  {/if}
                {:else}
                  {#if mode === "preview" && cfg}
                    {#each cfg.slots as slot}
                      <div
                        class="flex border-b border-black min-h-[30px] opacity-40 italic text-gray-400 font-bold bg-gray-50/20"
                      >
                        <div
                          class="border-r border-black flex items-center justify-center font-bold"
                          style="width: {snoWidth}px"
                        >
                          {slot.label}.
                        </div>
                        <div class="px-2 py-1 flex-1">
                          [ {slot.type === "OR_GROUP"
                            ? "OR Pair"
                            : "Single Question"} ] - {slot.marks} Marks
                        </div>
                      </div>
                    {/each}
                  {/if}
                {/each}
              {/key}
            </div>
          {/each}
        </div>

        <div
          class="mt-4 border-t border-black/10 pt-1 text-[8pt] text-center opacity-50 no-print"
        >
          V.2.3.1 - FINAL SYNC
        </div>
      </div>

      {#if isEditable}
        <div
          class="absolute top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 transition-colors z-[100] no-print"
          style="left: {snoWidth + 19}px;"
          onmousedown={(e) => onResizeStart("sno", e)}
          role="none"
        ></div>
      {/if}
    </div>
  </div>

  <!-- Swap Sidebar -->
  {#if isSwapSidebarOpen && isEditable}
    <div
      class="fixed inset-0 bg-black/20 z-[200] no-print"
      role="none"
      onclick={() => (isSwapSidebarOpen = false)}
    ></div>
    <div
      transition:slide={{ axis: "x" }}
      class="fixed right-0 top-0 bottom-0 w-[500px] bg-white dark:bg-slate-900 border-l border-gray-200 shadow-2xl p-4 overflow-y-auto no-print z-[210]"
    >
      <div class="flex items-center justify-between mb-4 border-b pb-4">
        <h3 class="font-black text-sm uppercase tracking-widest">
          SWAP QUESTION ({swapContext.currentMark}M)
        </h3>
        <button
          onclick={() => (isSwapSidebarOpen = false)}
          class="p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Close Swap Sidebar"
          ><svg
            class="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            /></svg
          ></button
        >
      </div>
      <div class="grid grid-cols-2 gap-3">
        {#each swapContext?.alternates || [] as q}
          <button
            onclick={() => selectAlternate(q)}
            class="text-left p-2 bg-gray-50 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 rounded-xl transition-all min-h-[100px] flex flex-col gap-2 overflow-hidden text-black"
          >
            <div class="text-[10px] font-bold text-gray-700 line-clamp-3">
              {@html q.question_text}
            </div>
            {#if q.image_url}
              <img
                src={q.image_url}
                alt="Preview"
                class="h-12 w-full object-contain bg-white rounded border border-gray-100"
              />
            {/if}
            <div class="flex items-center justify-between mt-auto">
              <span
                class="text-[8px] font-black uppercase text-indigo-600 bg-white px-1 rounded"
                >{q.type}</span
              >
            </div>
          </button>
        {/each}
        {#if !swapContext?.alternates?.length}
          <div
            class="col-span-2 text-center py-20 text-gray-400 text-[10px] font-black uppercase tracking-widest"
          >
            No Alternates Found
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #cdu-paper-container {
    font-family: "Times New Roman", Times, serif;
    color: black;
  }

  /* Improve visibility of question text */
  :global(.question-text-content) {
    font-weight: 500 !important;
    color: #000 !important;
  }

  @media print {
    .no-print {
      display: none !important;
    }
    #cdu-paper-container {
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      box-shadow: none !important;
      color: black !important;
    }
  }
</style>
