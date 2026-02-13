<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentSlotSingle from "./shared/AssessmentSlotSingle.svelte";
  import AssessmentSlotOrGroup from "./shared/AssessmentSlotOrGroup.svelte";
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
  const isEditable = $derived(mode === "edit" || mode === "preview");

  // DO NOT use derived filtered lists for iterations in Svelte 5 if deep binding/mutation is needed.
  // Instead, iterate over the main list and use #if for filtering.

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

  let totalMarksA = $derived(calcTotal("A"));
  let totalMarksB = $derived(calcTotal("B"));
  let totalMarksC = $derived(calcTotal("C"));

  const allQuestionsInSet = $derived(
    Array.isArray(currentSetData.questions) ? currentSetData.questions : [],
  );
  const questionsA = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "A"),
  );
  const questionsB = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "B"),
  );
  const questionsC = $derived(
    allQuestionsInSet.filter((q: any) => q && q.part === "C"),
  );
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="standard-paper-actual"
      class="mx-auto bg-white p-[0.75in] shadow-2xl transition-all duration-500 font-serif text-black relative"
      style="width: 8.27in; min-height: 11.69in;"
    >
      <div class="text-center mb-8 border-b-2 border-black pb-4">
        <h1 class="text-2xl font-black uppercase tracking-tighter mb-1">
          Assessment Report
        </h1>
        <p
          class="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none"
        >
          Institutional Quality Assurance
        </p>
      </div>

      <div
        class="grid grid-cols-2 gap-y-4 text-sm mb-8 border-b-2 border-black pb-4"
      >
        <div>
          <b>Course:</b>
          <AssessmentEditable
            value={paperMeta.course_code}
            onUpdate={(v: string) => updateText(v, "META", "course_code")}
          />
        </div>
        <div>
          <b>Subject:</b>
          <AssessmentEditable
            value={paperMeta.subject_name}
            onUpdate={(v: string) => updateText(v, "META", "subject_name")}
          />
        </div>
        <div>
          <b>Programme:</b>
          <AssessmentEditable
            value={paperMeta.programme}
            onUpdate={(v: string) => updateText(v, "META", "programme")}
          />
        </div>
        <div>
          <b>Semester:</b>
          <AssessmentEditable
            value={paperMeta.semester}
            onUpdate={(v: string) => updateText(v, "META", "semester")}
          />
        </div>
        <div>
          <b>Duration:</b>
          <AssessmentEditable
            value={paperMeta.duration_minutes}
            onUpdate={(v: string) => updateText(v, "META", "duration_minutes")}
            style="display: inline-block;"
          />
        </div>
        <div><b>Max Marks:</b> {paperMeta.max_marks}</div>
      </div>

      <div class="space-y-12">
        {#if questionsA.length > 0 || (mode === "preview" && paperStructure.some((s: any) => s.part === "A"))}
          <div>
            <div
              class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest bg-gray-50 flex items-center justify-center gap-1"
            >
              <AssessmentEditable
                value={paperMeta.partA_title || "PART A"}
                onUpdate={(v: string) => updateText(v, "META", "partA_title")}
                class="inline-block font-bold"
              />
              <div class="flex items-center gap-1">
                <span>(</span>
                <AssessmentEditable
                  value={paperMeta.totalMarksA_text ||
                    `${questionsA.length} x ${questionsA[0]?.marks || paperStructure.find((s: any) => s.part === "A")?.marks_per_q || 2} = ${totalMarksA} Marks`}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "totalMarksA_text")}
                  class="inline-block"
                />
                <span>)</span>
              </div>
            </div>
            <div
              use:dndzone={{ items: questionsA, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("A", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("A", (e.detail as any).items)}
            >
              {#each currentSetData.questions || [] as q, i (q.id + activeSet)}
                {#if q && q.part === "A"}
                  <div class="border-b border-black">
                    <AssessmentSlotSingle
                      slot={q}
                      qNumber={questionsA.findIndex((x) => x.id === q.id) + 1}
                      {isEditable}
                      snoWidth={35}
                      onSwap={() => openSwapSidebar(q, "A")}
                      onRemove={() => removeQuestion(q)}
                      onUpdateText={(v: string, qid: string) =>
                        updateText(v, "QUESTION", "text", q.id, qid)}
                    />
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        {#if questionsB.length > 0 || (mode === "preview" && paperStructure.some((s: any) => s.part === "B"))}
          <div>
            <div
              class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest bg-gray-50 flex items-center justify-center gap-1"
            >
              <AssessmentEditable
                value={paperMeta.partB_title || "PART B"}
                onUpdate={(v: string) => updateText(v, "META", "partB_title")}
                class="inline-block font-bold"
              />
              <div class="flex items-center gap-1">
                <span>(</span>
                <AssessmentEditable
                  value={paperMeta.totalMarksB_text ||
                    `${questionsB.length} x ${questionsB[0]?.marks || paperStructure.find((s: any) => s.part === "B")?.marks_per_q || 5} = ${totalMarksB} Marks`}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "totalMarksB_text")}
                  class="inline-block"
                />
                <span>)</span>
              </div>
            </div>
            <div
              use:dndzone={{ items: questionsB, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("B", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("B", (e.detail as any).items)}
            >
              {#each currentSetData.questions || [] as q, i (q.id + activeSet)}
                {#if q && q.part === "B"}
                  {@const bIdx = questionsB.findIndex((x) => x.id === q.id)}
                  <div class="border-2 border-black mb-6 shadow-sm">
                    <AssessmentSlotOrGroup
                      slot={q}
                      qNumber={questionsA.length + bIdx * 2 + 1}
                      {isEditable}
                      snoWidth={35}
                      onSwap1={() => openSwapSidebar(q, "B", "q1")}
                      onSwap2={() => openSwapSidebar(q, "B", "q2")}
                      onRemove={() => removeQuestion(q)}
                      onUpdateText1={(v: string, qid: string) =>
                        updateText(v, "QUESTION", "text", q.id, qid)}
                      onUpdateText2={(v: string, qid: string) =>
                        updateText(v, "QUESTION", "text", q.id, qid)}
                    />
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        {#if questionsC.length > 0 || (mode === "preview" && paperStructure.some((s: any) => s.part === "C"))}
          <div>
            <div
              class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest bg-gray-50 flex items-center justify-center gap-1"
            >
              <AssessmentEditable
                value={paperMeta.partC_title || "PART C"}
                onUpdate={(v: string) => updateText(v, "META", "partC_title")}
                class="inline-block font-bold"
              />
              <div class="flex items-center gap-1">
                <span>(</span>
                <AssessmentEditable
                  value={paperMeta.totalMarksC_text ||
                    `${questionsC.length} x ${questionsC[0]?.marks || paperStructure.find((s: any) => s.part === "C")?.marks_per_q || 0} = ${totalMarksC} Marks`}
                  onUpdate={(v: string) =>
                    updateText(v, "META", "totalMarksC_text")}
                  class="inline-block"
                />
                <span>)</span>
              </div>
            </div>
            <div
              use:dndzone={{ items: questionsC, flipDurationMs: 200 }}
              onconsider={(e) => handleDndSync("C", (e.detail as any).items)}
              onfinalize={(e) => handleDndSync("C", (e.detail as any).items)}
            >
              {#each currentSetData.questions || [] as q, i (q.id + activeSet)}
                {#if q && q.part === "C"}
                  {@const cIdx = questionsC.findIndex((x) => x.id === q.id)}
                  <div class="border-2 border-black mb-6 shadow-sm">
                    <AssessmentSlotOrGroup
                      slot={q}
                      qNumber={questionsA.length +
                        questionsB.length * 2 +
                        cIdx * 2 +
                        1}
                      {isEditable}
                      snoWidth={35}
                      onSwap1={() => openSwapSidebar(q, "C", "q1")}
                      onSwap2={() => openSwapSidebar(q, "C", "q2")}
                      onRemove={() => removeQuestion(q)}
                      onUpdateText1={(v: string, qid: string) =>
                        updateText(v, "QUESTION", "text", q.id, qid)}
                      onUpdateText2={(v: string, qid: string) =>
                        updateText(v, "QUESTION", "text", q.id, qid)}
                    />
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
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
  #standard-paper-actual {
    font-family: "Times New Roman", Times, serif;
  }
</style>
