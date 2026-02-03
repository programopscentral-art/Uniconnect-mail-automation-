<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import { flip } from "svelte/animate";
  import { fade, fly, slide } from "svelte/transition";
  import { Plus } from "lucide-svelte";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentSlotSingle from "./shared/AssessmentSlotSingle.svelte";
  import AssessmentSlotOrGroup from "./shared/AssessmentSlotOrGroup.svelte";

  let {
    paperMeta = $bindable({}),
    currentSetData = $bindable({ questions: [] }),
    paperStructure = $bindable([]),
    layoutSchema = $bindable({}),
    activeSet = "A",
    questionPool = [],
    mode = "view",
  } = $props();

  let isSwapSidebarOpen = $state(false);
  let swapContext = $state<any>(null);
  const isEditable = $derived(mode === "edit" || mode === "preview");

  // Default Layout Settings
  const layout = $derived({
    universityName:
      layoutSchema?.universityName ||
      paperMeta?.univ_line_1 ||
      "UNIVERSITY NAME",
    universitySubName:
      layoutSchema?.universitySubName || paperMeta?.univ_line_1_2 || "",
    universityAddress:
      layoutSchema?.universityAddress || paperMeta?.univ_line_2 || "",
    logoUrl: layoutSchema?.logoUrl || "",
    fontFamily: layoutSchema?.fontFamily || "serif",
    primaryColor: layoutSchema?.primaryColor || "#000000",
    headerStyle: layoutSchema?.headerStyle || "centered", // 'centered' | 'split'
    showRRN: layoutSchema?.showRRN ?? true,
    courseCodeLabel: layoutSchema?.courseCodeLabel || "Course Code",
    style: layoutSchema?.style || "standard", // 'standard' | 'crescent' | 'cdu'
    watermarkText: layoutSchema?.watermarkText || "",
    showBorder: layoutSchema?.showBorder ?? false,
    pageMargin: layoutSchema?.pageMargin || "normal", // 'narrow' | 'normal' | 'wide'
  });

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
      alternates: (questionPool || []).filter(
        (q: any) => Number(q.marks || q.mark) === marks && q.id !== cQ?.id,
      ),
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

  const getQuestionsByPart = (part: string) => {
    const all = Array.isArray(currentSetData.questions)
      ? currentSetData.questions
      : [];
    return all.filter((q: any) => q && q.part === part);
  };

  const getSnoStart = (part: string) => {
    let count = 0;
    for (const section of paperStructure) {
      if (section.part === part) break;
      const qs = getQuestionsByPart(section.part);
      count += section.slots.length; // Approximate or use actual count
    }
    return count + 1;
  };

  let activeTab = $state("components"); // 'components' | 'properties'

  function resetTemplate() {
    if (
      !confirm(
        "Are you sure you want to reset the template? This action cannot be undone.",
      )
    )
      return;
    paperStructure = [];
    currentSetData.questions = [];
    paperMeta = {};
    layoutSchema = {};
  }
</script>

<div
  class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50"
>
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div
      id="generic-paper-actual"
      class="mx-auto bg-white shadow-2xl transition-all duration-300 text-black relative {layout.showBorder
        ? 'border-[4pt] border-double'
        : ''}"
      style="width: 8.27in; min-height: 11.69in; font-family: {layout.fontFamily}, serif; padding: {layout.pageMargin ===
      'narrow'
        ? '0.4in'
        : layout.pageMargin === 'wide'
          ? '1in'
          : '0.75in'}; border-color: {layout.showBorder
        ? layout.primaryColor + '33'
        : 'transparent'}; background: {layoutSchema?.debugImage
        ? `url(${layoutSchema.debugImage})`
        : 'white'}; background-size: 100% 100%;"
    >
      <!-- Watermark -->
      {#if layout.watermarkText}
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden opacity-[0.04] z-0"
        >
          <div
            class="text-[120px] font-black uppercase -rotate-[35deg] whitespace-nowrap"
            style="color: {layout.primaryColor}"
          >
            {layout.watermarkText}
          </div>
        </div>
      {/if}

      <!-- Dynamic Header & Metadata (V16 Image-As-Template Support) -->
      {#if !layoutSchema?.debugImage}
        {#if layout.style === "cdu"}
          <div
            class="text-center pb-4 pt-1 border-b-[1.5pt] border-black relative"
          >
            <div class="flex flex-col items-center mb-1">
              <div class="font-bold text-[11pt] mb-1 italic">
                Set - {activeSet}
              </div>
              <AssessmentEditable
                value={layout.universityName}
                onUpdate={(v: string) => {
                  layoutSchema.universityName = v;
                }}
                class="text-[12pt] font-black tracking-[0.2em] leading-none mb-1 uppercase px-2"
              />
              {#if layout.universitySubName || isEditable}
                <AssessmentEditable
                  value={layout.universitySubName}
                  onUpdate={(v: string) => {
                    layoutSchema.universitySubName = v;
                  }}
                  class="text-[10pt] font-bold leading-none mb-2 uppercase"
                  placeholder="(SUB-HEADER)"
                />
              {/if}
            </div>

            <div class="text-[11pt] font-bold uppercase mt-1">
              <AssessmentEditable
                value={paperMeta.exam_title}
                onUpdate={(v: string) => updateText(v, "META", "exam_title")}
              />
            </div>

            <div class="mt-1 flex flex-col items-center">
              <AssessmentEditable
                value={paperMeta.programme}
                onUpdate={(v: string) => updateText(v, "META", "programme")}
                class="text-[11pt] font-bold uppercase text-red-600 print:text-[#dc2626]"
              />
              <AssessmentEditable
                value={paperMeta.subject_name}
                onUpdate={(v: string) => updateText(v, "META", "subject_name")}
                class="text-[11pt] font-bold uppercase text-red-600 print:text-[#dc2626]"
              />
            </div>

            <div
              class="mt-2 border-t-[1.5pt] border-black flex justify-between px-2 py-0.5 font-bold text-[10.5pt]"
            >
              <div>
                Time: {paperMeta.duration_label ||
                  paperMeta.duration_minutes + " Mins"}
              </div>
              <div>[Max. Marks: {paperMeta.max_marks || "20"}]</div>
            </div>
          </div>
        {:else if layout.style === "crescent"}
          <div
            class="header-container flex flex-col items-center mb-1 pt-1 relative text-center"
          >
            <div class="absolute top-0 right-0 flex flex-col items-end gap-1">
              <div class="flex items-center gap-2">
                <span class="text-[8pt] font-black uppercase text-gray-400"
                  >COURSE CODE</span
                >
                <div
                  class="border border-black px-2 py-0.5 min-w-[60px] text-[9pt] font-bold"
                >
                  {paperMeta.course_code || ""}
                </div>
              </div>
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[8pt] font-bold text-right">RRN</span>
                <div class="flex border border-black">
                  {#each Array(11) as _}
                    <div
                      class="w-3.5 h-3.5 border-r border-black last:border-r-0"
                    ></div>
                  {/each}
                </div>
              </div>
            </div>

            <div class="mb-4">
              {#if layout.logoUrl}
                <img
                  src={layout.logoUrl}
                  alt="University Logo"
                  class="h-20 mx-auto mb-1"
                />
              {/if}
            </div>
            <AssessmentEditable
              value={layout.universityName}
              onUpdate={(v: string) => {
                layoutSchema.universityName = v;
              }}
              class="text-xl font-black uppercase tracking-tight"
            />
            {#if layout.universitySubName || isEditable}
              <AssessmentEditable
                value={layout.universitySubName}
                onUpdate={(v: string) => {
                  layoutSchema.universitySubName = v;
                }}
                class="text-lg font-bold uppercase tracking-tight"
                placeholder="(SUB-HEADER)"
              />
            {/if}
            <div
              class="mt-6 font-bold uppercase text-[11pt] border-y border-black py-2 w-full"
            >
              <AssessmentEditable
                value={paperMeta.exam_title}
                onUpdate={(v: string) => updateText(v, "META", "exam_title")}
              />
            </div>
          </div>
        {:else}
          <div class="text-center mb-8 border-b-2 border-black pb-4">
            {#if layout.logoUrl}
              <img
                src={layout.logoUrl}
                alt="University Logo"
                class="h-16 mx-auto mb-2"
              />
            {/if}
            <AssessmentEditable
              value={layout.universityName}
              onUpdate={(v: string) => {
                layoutSchema.universityName = v;
              }}
              class="text-xl font-black uppercase tracking-tight"
              style="color: {layout.primaryColor}"
            />
            {#if layout.universitySubName || isEditable}
              <AssessmentEditable
                value={layout.universitySubName}
                onUpdate={(v: string) => {
                  layoutSchema.universitySubName = v;
                }}
                class="text-lg font-bold uppercase tracking-tight"
                placeholder="(SUB-HEADER)"
              />
            {/if}
            {#if layout.universityAddress || isEditable}
              <AssessmentEditable
                value={layout.universityAddress}
                onUpdate={(v: string) => {
                  layoutSchema.universityAddress = v;
                }}
                class="text-[10px] font-bold text-gray-600 uppercase tracking-widest leading-none mt-1"
                placeholder="ADDRESS / TAGLINE"
              />
            {/if}
            <div class="mt-4 py-1 border-y border-black/10">
              <AssessmentEditable
                value={paperMeta.exam_title}
                onUpdate={(v: string) => updateText(v, "META", "exam_title")}
                class="text-sm font-black uppercase"
              />
            </div>
          </div>
        {/if}

        <!-- Paper Metadata -->
        {#if layoutSchema?.showMetadataTable}
          <table
            class="w-full border-collapse border border-black text-[9pt] mb-8"
          >
            <tbody>
              <tr>
                <td
                  class="border border-black p-2 w-[20%] font-bold bg-gray-50/10"
                  >Programme & Branch</td
                >
                <td colspan="3" class="border border-black p-2">
                  <div class="flex gap-2">
                    <span>:</span>
                    <AssessmentEditable
                      value={paperMeta.programme}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "programme")}
                      class="flex-1"
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td class="border border-black p-2 font-bold bg-gray-50/10"
                  >Semester</td
                >
                <td class="border border-black p-2 w-[30%]">
                  <div class="flex gap-2">
                    <span>:</span>
                    <AssessmentEditable
                      value={paperMeta.semester}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "semester")}
                    />
                  </div>
                </td>
                <td
                  class="border border-black p-2 w-[20%] font-bold bg-gray-50/10"
                  >Date & Session</td
                >
                <td class="border border-black p-2 w-[30%]">
                  <div class="flex gap-2">
                    <span>:</span>
                    <AssessmentEditable
                      value={paperMeta.paper_date}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "paper_date")}
                    />
                  </div>
                </td>
              </tr>
              <tr>
                <td class="border border-black p-2 font-bold bg-gray-50/10"
                  >Course Code & Name</td
                >
                <td colspan="3" class="border border-black p-2">
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
                <td class="border border-black p-2 font-bold bg-gray-50/10"
                  >Duration</td
                >
                <td class="border border-black p-2">
                  <div class="flex gap-2">
                    <span>:</span>
                    <AssessmentEditable
                      value={paperMeta.duration_minutes}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "duration_minutes")}
                    />
                    <span>minutes</span>
                  </div>
                </td>
                <td class="border border-black p-2 font-bold bg-gray-50/10"
                  >Maximum Marks</td
                >
                <td class="border border-black p-2">
                  <div class="flex gap-2">
                    <span>:</span>
                    <AssessmentEditable
                      value={paperMeta.max_marks}
                      onUpdate={(v: string) =>
                        updateText(v, "META", "max_marks")}
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        {:else}
          <div
            class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-8 border-b-2 border-black pb-4"
          >
            <div class="flex justify-between border-b border-black/10 pb-1">
              <span class="font-bold">Course Code:</span>
              <AssessmentEditable
                value={paperMeta.course_code}
                onUpdate={(v: string) => updateText(v, "META", "course_code")}
              />
            </div>
            <div class="flex justify-between border-b border-black/10 pb-1">
              <span class="font-bold">Semester:</span>
              <AssessmentEditable
                value={paperMeta.semester}
                onUpdate={(v: string) => updateText(v, "META", "semester")}
              />
            </div>
            <div class="flex justify-between border-b border-black/10 pb-1">
              <span class="font-bold">Subject Name:</span>
              <AssessmentEditable
                value={paperMeta.subject_name}
                onUpdate={(v: string) => updateText(v, "META", "subject_name")}
              />
            </div>
            <div class="flex justify-between border-b border-black/10 pb-1">
              <span class="font-bold">Max Marks:</span>
              <span>{paperMeta.max_marks}</span>
            </div>
            <div class="flex justify-between border-b border-black/10 pb-1">
              <span class="font-bold">Programme:</span>
              <AssessmentEditable
                value={paperMeta.programme}
                onUpdate={(v: string) => updateText(v, "META", "programme")}
              />
            </div>
            <div class="flex justify-between border-b border-black/10 pb-1">
              <span class="font-bold">Duration:</span>
              <span>{paperMeta.duration_minutes} Mins</span>
            </div>
          </div>
        {/if}
      {/if}

      <!-- V16 Field Overlays (for previews/thumbnails) -->
      {#if layoutSchema?.debugImage && layoutSchema.pages?.[0]?.elements}
        {#each layoutSchema.pages[0].elements.filter((el: any) => el.type === "field") as el}
          <div
            class="absolute pointer-events-none"
            style="
              left: {el.x * 100}%; 
              top: {el.y * 100}%; 
              width: {el.width * 100}%; 
              height: {el.height * 100}%;
              font-size: {Math.min(
              22,
              Math.max(8, el.height * 11.69 * 72 * 0.55),
            )}px;
              text-align: {el.is_header ? 'center' : 'left'};
              font-weight: {el.is_header ? '700' : '400'};
              color: #000;
              font-family: {el.is_header ? 'Inter, sans-serif' : 'monospace'};
              white-space: pre-wrap;
              overflow: hidden;
            "
          >
            {el.value}
          </div>
        {/each}
      {/if}

      <!-- Dynamic Sections -->
      <div class="space-y-[1cm] relative z-10">
        {#if (paperStructure || []).length === 0}
          <div
            class="py-20 flex flex-col items-center justify-center text-center opacity-30 select-none"
          >
            <div
              class="w-32 h-32 rounded-[40px] border-4 border-dashed border-slate-300 flex items-center justify-center mb-6"
            >
              <Plus class="w-12 h-12 text-slate-300" />
            </div>
            <h2
              class="text-2xl font-black uppercase tracking-widest text-slate-400"
            >
              Your Canvas is Empty
            </h2>
            <p class="text-sm font-medium text-slate-400 mt-2">
              Add components from the library to start designing.
            </p>
          </div>
        {/if}

        {#each paperStructure || [] as section, idx}
          {@const questions = getQuestionsByPart(section.part)}
          {#if questions.length > 0 || mode === "preview"}
            <div>
              <div
                class="text-center font-bold border-b-2 border-black mb-4 py-1 uppercase italic tracking-widest bg-gray-50 flex items-center justify-center gap-2"
              >
                <AssessmentEditable
                  value={section.title}
                  onUpdate={(v: string) => {
                    section.title = v;
                    paperStructure = [...paperStructure];
                  }}
                  class="inline-block font-bold"
                />
                <span class="text-xs">
                  ({section.answered_count} x {section.marks_per_q} = {section.answered_count *
                    section.marks_per_q} Marks)
                </span>
              </div>

              <div
                use:dndzone={{ items: questions, flipDurationMs: 200 }}
                onconsider={(e) =>
                  handleDndSync(section.part, (e.detail as any).items)}
                onfinalize={(e) =>
                  handleDndSync(section.part, (e.detail as any).items)}
              >
                {#each Array.isArray(currentSetData.questions) ? currentSetData.questions : [] as q, i (q.id + activeSet)}
                  {#if q && q.part === section.part}
                    {@const qNum =
                      (Array.isArray(currentSetData.questions)
                        ? currentSetData.questions
                        : []
                      )
                        .filter((x) => x && x.part === section.part)
                        .findIndex((x) => x.id === q.id) + 1}
                    <div
                      class={section.part === "A"
                        ? "border-b border-black"
                        : "border-2 border-black mb-6 shadow-sm"}
                    >
                      {#if q.type === "OR_GROUP"}
                        <AssessmentSlotOrGroup
                          slot={q}
                          qNumber={getSnoStart(section.part) + (qNum - 1) * 2}
                          {isEditable}
                          snoWidth={35}
                          onSwap1={() => openSwapSidebar(q, section.part, "q1")}
                          onSwap2={() => openSwapSidebar(q, section.part, "q2")}
                          onRemove={() => removeQuestion(q)}
                          onUpdateText1={(v: string, qid: string) =>
                            updateText(v, "QUESTION", "text", q.id, qid)}
                          onUpdateText2={(v: string, qid: string) =>
                            updateText(v, "QUESTION", "text", q.id, qid)}
                        />
                      {:else}
                        <AssessmentSlotSingle
                          slot={q}
                          qNumber={getSnoStart(section.part) + (qNum - 1)}
                          {isEditable}
                          snoWidth={35}
                          onSwap={() => openSwapSidebar(q, section.part)}
                          onRemove={() => removeQuestion(q)}
                          onUpdateText={(v: string, qid: string) =>
                            updateText(v, "QUESTION", "text", q.id, qid)}
                        />
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <!-- Footer / Instructions -->
      {#if paperMeta.instructions}
        <div class="mt-12 pt-4 border-t border-black text-[10px] italic">
          <p><b>Instructions:</b> {paperMeta.instructions}</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Swap Sidebar -->
  {#if isSwapSidebarOpen && isEditable}
    <div
      transition:slide={{ axis: "x" }}
      class="w-96 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 shadow-2xl p-6 overflow-y-auto no-print z-[100]"
    >
      <div class="flex items-center justify-between mb-6">
        <h3
          class="font-black text-gray-900 dark:text-white uppercase tracking-tight"
        >
          SWAP QUESTION
        </h3>
        <button
          onclick={() => (isSwapSidebarOpen = false)}
          class="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          aria-label="Close Swap Sidebar"
        >
          <svg
            class="w-6 h-6 text-gray-600 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>

      {#each swapContext?.alternates || [] as q}
        <button
          onclick={() => selectAlternate(q)}
          class="w-full text-left p-4 mb-3 bg-gray-50 dark:bg-slate-800/50 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group"
        >
          <div class="flex items-center justify-between mb-2">
            <span
              class="text-[10px] font-black text-indigo-600 dark:text-indigo-400"
              >{q.marks}M</span
            >
            <span class="text-[9px] font-black text-gray-400 uppercase"
              >{q.type || "SHORT"}</span
            >
          </div>
          <div
            class="text-xs font-medium text-gray-700 dark:text-slate-300 leading-relaxed line-clamp-3"
          >
            {@html q.question_text || q.text}
          </div>
        </button>
      {:else}
        <div
          class="text-center py-20 text-gray-400 text-xs font-black uppercase tracking-widest"
        >
          No matching questions found in pool.
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #generic-paper-actual {
    font-family: "Times New Roman", Times, serif;
  }
</style>
