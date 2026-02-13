<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentSlotSingle from "./shared/AssessmentSlotSingle.svelte";
  import AssessmentSlotOrGroup from "./shared/AssessmentSlotOrGroup.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
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
  const isEditable = $derived(mode === "edit" || mode === "preview");

  function handleDndSync(part: string, items: any[]) {
    const arr = (
      Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData?.questions || []
    ).filter(Boolean);
    const otherQuestions = arr.filter((q: any) => q.part !== part);
    // Map items to ensure they keep leur part
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
      targetQuestion = slot.questions[0];
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
    let slot = arr[swapContext.slotIndex];
    const nQ = {
      id: question.id,
      text: question.question_text,
      question_text: question.question_text,
      marks: question.marks,
      options: question.options,
      part: swapContext.part,
      image_url: question.image_url,
    };

    if (swapContext.part === "A") {
      const nArr = [...arr];
      const oldSlot = nArr[swapContext.slotIndex];
      nArr[swapContext.slotIndex] = { ...oldSlot, questions: [nQ] };
      currentSetData = Array.isArray(currentSetData)
        ? [...nArr]
        : { ...currentSetData, questions: [...nArr] };
    } else {
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
            choice.questions[qIdx] = nQ;
          }
        } else {
          choice.questions = [nQ];
        }
        if (swapContext.subPart === "q1") nSlot.choice1 = choice;
        else nSlot.choice2 = choice;
      } else {
        nSlot.questions = [nQ];
      }
      nArr[swapContext.slotIndex] = nSlot;
      currentSetData = Array.isArray(currentSetData)
        ? [...nArr]
        : { ...currentSetData, questions: [...nArr] };
    }

    if (onSwap) {
      rebuildAnswerSheet();
      onSwap($state.snapshot(currentSetData));
    }

    swapCounter++;
    isSwapSidebarOpen = false;
  }

  function calcTotal(part: string) {
    if (mode === "preview" && paperStructure?.length) {
      const section = paperStructure.find((s: any) => s.part === part);
      if (!section) return 0;
      return section.slots.reduce(
        (s: number, slot: any) => s + (Number(slot.marks) || 0),
        0,
      );
    }
    const arr = (
      Array.isArray(currentSetData)
        ? currentSetData
        : currentSetData?.questions || []
    ).filter(Boolean);
    const qs = arr.filter((q: any) => q && q.part === part);
    return qs.reduce((s: number, slot: any) => {
      const m =
        slot.marks ||
        (slot.type === "OR_GROUP"
          ? slot.choice1?.questions?.[0]?.marks || 0
          : slot.questions?.[0]?.marks || 0);
      return s + (Number(m) || 0);
    }, 0);
  }

  const totalMarksA = $derived(calcTotal("A"));
  const totalMarksB = $derived(calcTotal("B"));
  const totalMarksC = $derived(calcTotal("C"));

  const allQuestions = $derived(
    (Array.isArray(currentSetData)
      ? currentSetData
      : currentSetData?.questions || []
    ).filter(Boolean),
  );
  const questionsA = $derived(
    allQuestions.filter((slot: any) => slot?.part === "A"),
  );
  const questionsB = $derived(
    allQuestions.filter((slot: any) => slot?.part === "B"),
  );
  const questionsC = $derived(
    allQuestions.filter((slot: any) => slot?.part === "C"),
  );
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="crescent-paper-actual"
      class="mx-auto bg-white p-[0.3in] shadow-2xl transition-all duration-500 font-serif text-black relative border border-black"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <!-- Header -->
      <div
        class="header-container flex flex-col items-center mb-1 pt-1 relative"
      >
        <div class="mb-4">
          <img
            src="/crescent-logo.png"
            alt="University Logo"
            class="h-20 mb-1"
          />
        </div>
        <div class="absolute top-0 right-0 flex flex-col items-end gap-1">
          <div class="flex items-center gap-2">
            <AssessmentEditable
              value={paperMeta.course_code}
              onUpdate={(v: string) => updateText(v, "META", "course_code")}
              class="font-bold px-1 min-w-[70px] text-right text-[10pt]"
            />
          </div>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-[8pt] font-bold text-right">RRN</span>
            <div class="flex border border-black">
              {#each Array(11) as _}
                <div
                  class="w-4 h-4 border-r border-black last:border-r-0"
                ></div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Title -->
      <div class="text-center my-6 font-bold uppercase text-[11pt] relative">
        <div
          class="absolute -top-12 left-0 text-[10pt] font-black border border-black px-2 py-0.5"
        >
          SET - {activeSet}
        </div>
        <AssessmentEditable
          value={paperMeta.exam_title}
          onUpdate={(v: string) => updateText(v, "META", "exam_title")}
          class="w-full text-center"
        />
      </div>

      <!-- Metadata Table -->
      <table class="w-full border-collapse border border-black text-[9pt] mb-4">
        <tbody>
          <tr>
            <td class="border border-black p-1 w-[20%] font-bold"
              >Programme & Branch</td
            >
            <td colspan="3" class="border border-black p-1 text-[9pt]">
              <div class="flex gap-2">
                <span>:</span>
                <AssessmentEditable
                  value={paperMeta.programme}
                  onUpdate={(v: string) => updateText(v, "META", "programme")}
                  class="flex-1"
                />
              </div>
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 font-bold">Semester</td>
            <td class="border border-black p-1 w-[30%]">
              <div class="flex gap-2">
                <span>:</span>
                <AssessmentEditable
                  value={paperMeta.semester}
                  onUpdate={(v: string) => updateText(v, "META", "semester")}
                />
              </div>
            </td>
            <td class="border border-black p-1 w-[20%] font-bold"
              >Date & Session</td
            >
            <td class="border border-black p-1 w-[30%]">
              <div class="flex gap-2">
                <span>:</span>
                <AssessmentEditable
                  value={paperMeta.paper_date}
                  onUpdate={(v: string) => updateText(v, "META", "paper_date")}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 font-bold">Course Code & Name</td
            >
            <td colspan="3" class="border border-black p-1">
              <div class="flex gap-2">
                <span>:</span>
                <AssessmentEditable
                  value={paperMeta.subject_name}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "subject_name")}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td class="border border-black p-1 font-bold">Duration</td>
            <td class="border border-black p-1">
              <div class="flex gap-2">
                <span>:</span>
                <AssessmentEditable
                  value={paperMeta.duration_minutes}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "duration_minutes")}
                />
              </div>
            </td>
            <td class="border border-black p-1 font-bold">Maximum Marks</td>
            <td class="border border-black p-1">
              <div class="flex gap-2">
                <span>:</span>
                <AssessmentEditable
                  value={paperMeta.max_marks}
                  onUpdate={(v: string) => updateText(v, "META", "max_marks")}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Instructions -->
      <div class="text-center font-bold italic py-1 text-[9.5pt]">
        <AssessmentEditable
          value={paperMeta.instructions || "ANSWER ALL QUESTIONS"}
          onUpdate={(v: string) => updateText(v, "META", "instructions")}
          class="w-full text-center"
        />
      </div>

      <!-- PART A -->
      <div
        class="border-b border-black py-0.5 text-center font-bold uppercase tracking-wider text-[9.5pt] flex items-center justify-center gap-1"
      >
        <AssessmentEditable
          value={paperMeta.partA_title || "PART A"}
          onUpdate={(v: string) => updateText(v, "META", "partA_title")}
          class="inline-block"
        />
        <span class="font-normal text-[8.5pt]">
          ( <AssessmentEditable
            value={paperMeta.partA_marks_label ||
              `${questionsA.length} X ${questionsA[0]?.marks || paperStructure.find((s: any) => s.part === "A")?.marks_per_q || 2} = ${totalMarksA}`}
            onUpdate={(v: string) => updateText(v, "META", "partA_marks_label")}
            class="inline-block"
          /> MARKS )
        </span>
      </div>
      <div
        class="border-x border-t border-black"
        use:dndzone={{ items: questionsA, flipDurationMs: 200 }}
        onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
        onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
      >
        {#key activeSet + swapCounter}
          {#each questionsA as slot, i (String(slot.questions?.[0]?.id || slot.id) + activeSet)}
            <AssessmentSlotSingle
              {slot}
              qNumber={i + 1}
              {isEditable}
              snoWidth={40}
              onUpdateText={(v: string, qid: string) =>
                updateText(v, "QUESTION", "text", slot.id, qid)}
              onSwap={() => openSwapSidebar(slot, "A")}
              onRemove={() => removeQuestion(slot)}
              textClass="text-[9pt]"
              marksClass="py-2"
            />
          {:else}
            {#if mode === "preview"}
              {@const secA = paperStructure.find((s: any) => s.part === "A")}
              {#if secA}
                {#each secA.slots as slot}
                  <div
                    class="border-b border-black min-h-[30px] flex opacity-40 bg-gray-50/20 italic font-bold"
                  >
                    <div
                      class="px-2 border-r border-black w-10 flex items-center justify-center text-[9pt]"
                    >
                      {slot.label}.
                    </div>
                    <div class="flex-1 px-4 flex items-center text-[9pt]">
                      [ {slot.qType || "ANY"} ] Question - {slot.marks} Marks
                    </div>
                  </div>
                {/each}
              {/if}
            {/if}
          {/each}
        {/key}
      </div>

      <!-- PART B -->
      <div
        class="mt-4 border-y border-black py-0.5 text-center font-bold uppercase tracking-wider text-[9.5pt] flex items-center justify-center gap-1"
      >
        <AssessmentEditable
          value={paperMeta.partB_title || "PART B"}
          onUpdate={(v: string) => updateText(v, "META", "partB_title")}
          class="inline-block"
        />
        <span class="font-normal text-[8.5pt]">
          ( <AssessmentEditable
            value={paperMeta.partB_marks_label ||
              `${questionsB.length} X ${questionsB[0]?.marks || paperStructure.find((s: any) => s.part === "B")?.marks_per_q || 5} = ${totalMarksB}`}
            onUpdate={(v: string) => updateText(v, "META", "partB_marks_label")}
            class="inline-block"
          /> MARKS )
        </span>
      </div>
      <div
        class="border-x border-black"
        use:dndzone={{ items: questionsB, flipDurationMs: 200 }}
        onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
        onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
      >
        {#key activeSet + swapCounter}
          {#each questionsB as slot, i (slot.id + activeSet)}
            {@const currentNum = questionsA.length + i * 2 + 1}
            <div class="border-b border-black">
              <div class="flex">
                <div
                  class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]"
                >
                  {currentNum}.
                </div>
                <div class="flex-1 px-4 py-2 relative group">
                  <AssessmentRowActions
                    {isEditable}
                    onSwap={() => openSwapSidebar(slot, "B", "q1")}
                    onDelete={() => removeQuestion(slot)}
                  />
                  {#if slot.choice1?.questions?.[0]}
                    <AssessmentEditable
                      value={slot.choice1.questions[0].text}
                      onUpdate={(v: string) =>
                        updateText(
                          v,
                          "QUESTION",
                          "text",
                          slot.id,
                          slot.choice1.questions[0].id,
                        )}
                      multiline={true}
                      class="text-[9pt]"
                    />
                    <AssessmentMcqOptions
                      options={slot.choice1.questions[0].options}
                    />
                  {/if}
                </div>
                <div
                  class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]"
                >
                  ( <AssessmentEditable
                    value={String(
                      slot.choice1?.questions?.[0]?.marks || slot.marks || 5,
                    )}
                    onUpdate={(v: string) => {
                      if (slot.choice1?.questions?.[0])
                        slot.choice1.questions[0].marks = Number(v);
                    }}
                    class="inline-block"
                  /> )
                </div>
              </div>
              <div
                class="text-center font-bold italic py-0.5 bg-gray-50/50 text-[8.5pt] border-y border-black uppercase"
              >
                (OR)
              </div>
              <div class="flex">
                <div
                  class="w-10 border-r border-black flex items-center justify-center font-bold text-[9pt]"
                >
                  {currentNum + 1}.
                </div>
                <div class="flex-1 px-4 py-2 relative group">
                  <AssessmentRowActions
                    {isEditable}
                    onSwap={() => openSwapSidebar(slot, "B", "q2")}
                    onDelete={() => removeQuestion(slot)}
                  />
                  {#if slot.choice2?.questions?.[0]}
                    <AssessmentEditable
                      value={slot.choice2.questions[0].text}
                      onUpdate={(v: string) =>
                        updateText(
                          v,
                          "QUESTION",
                          "text",
                          slot.id,
                          slot.choice2.questions[0].id,
                        )}
                      multiline={true}
                      class="text-[9pt]"
                    />
                    <AssessmentMcqOptions
                      options={slot.choice2.questions[0].options}
                    />
                  {/if}
                </div>
                <div
                  class="w-16 border-l border-black flex items-center justify-center font-bold text-[8.5pt]"
                >
                  ( <AssessmentEditable
                    value={String(
                      slot.choice2?.questions?.[0]?.marks || slot.marks || 5,
                    )}
                    onUpdate={(v: string) => {
                      if (slot.choice2?.questions?.[0])
                        slot.choice2.questions[0].marks = Number(v);
                    }}
                    class="inline-block"
                  /> )
                </div>
              </div>
            </div>
          {:else}
            {#if mode === "preview"}
              {@const secB = paperStructure.find((s: any) => s.part === "B")}
              {#if secB}
                {#each secB.slots as slot}
                  <div
                    class="border-b border-black opacity-40 bg-gray-50/20 font-bold"
                  >
                    <div class="flex border-b border-black/20 min-h-[40px]">
                      <div
                        class="w-10 border-r border-black flex items-center justify-center"
                      >
                        1.
                      </div>
                      <div class="flex-1 px-4 flex items-center text-[9pt]">
                        [ {slot.qType || "ANY"} ] Question - {slot.marks} Marks
                      </div>
                    </div>
                    <div
                      class="text-center text-[8pt] italic border-b border-black/20 font-bold"
                    >
                      (OR)
                    </div>
                    <div class="flex min-h-[40px]">
                      <div
                        class="w-10 border-r border-black flex items-center justify-center"
                      >
                        2.
                      </div>
                      <div class="flex-1 px-4 flex items-center text-[9pt]">
                        [ {slot.qType || "ANY"} ] Question - {slot.marks} Marks
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            {/if}
          {/each}
        {/key}
      </div>

      <!-- PART C -->
      {#if questionsC.length > 0 || (mode === "preview" && paperStructure.some((s: any) => s.part === "C"))}
        <div
          class="mt-4 border-y border-black py-0.5 text-center font-bold uppercase tracking-wider text-[9.5pt] flex items-center justify-center gap-1"
        >
          <AssessmentEditable
            value={paperMeta.partC_title || "PART C"}
            onUpdate={(v: string) => updateText(v, "META", "partC_title")}
            class="inline-block"
          />
          <span class="font-normal text-[8.5pt]">
            ( <AssessmentEditable
              value={paperMeta.partC_marks_label ||
                `${questionsC.length} X ${questionsC[0]?.marks || 8} = ${totalMarksC}`}
              onUpdate={(v: string) =>
                updateText(v, "META", "partC_marks_label")}
              class="inline-block"
            /> MARKS )
          </span>
        </div>
        <div class="border-x border-b border-black">
          <!-- C Loop logic here similar to B -->
        </div>
      {/if}

      <div class="mt-20 flex justify-between px-4 gap-8 mb-8 no-print-force">
        <div
          class="border border-black p-8 flex-1 text-center font-bold text-[9pt]"
        >
          Name & Signature <br /> of DAAC Member
        </div>
        <div
          class="border border-black p-8 flex-1 text-center font-bold text-[9pt]"
        >
          Name & Signature <br /> of DAAC Member
        </div>
      </div>
      <div
        class="border-t-2 border-black w-full mt-4 text-[8pt] text-center opacity-50"
      >
        V.2.3.0 - FINAL SYNC
      </div>
    </div>
    <div class="text-center mt-8 text-[10pt] font-bold text-black no-print">
      ***********
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
  #crescent-paper-actual {
    font-family: "Times New Roman", Times, serif;
    color: black;
  }
  #crescent-paper-actual * {
    box-sizing: border-box;
  }
  #crescent-paper-actual :global(.assessment-editable-container) {
    font-weight: 600;
  }

  /* Improve visibility of question text */
  :global(.question-text-content) {
    font-weight: 500 !important;
    color: #000 !important;
  }

  :global(.no-print) {
    display: block;
  }
  @media print {
    :global(.no-print) {
      display: none !important;
    }
    #crescent-paper-actual {
      color: black !important;
    }
  }
</style>
