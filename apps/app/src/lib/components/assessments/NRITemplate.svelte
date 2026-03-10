<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import AssessmentEditable from "./shared/AssessmentEditable.svelte";
  import AssessmentRowActions from "./shared/AssessmentRowActions.svelte";
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
    currentSetData.answerSheet = { setId: activeSet, answers: newAnswers };
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
          (slot.choice1?.questions || []).find((item: any) => item.id === qId) ||
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
      question_id: question.id,
      text: question.question_text || question.text,
      question_text: question.question_text || question.text,
      marks: question.marks || swapContext.currentMark,
      options: question.options,
      co: question.target_co || question.co_indicator || "CO1",
      rbtl: question.bloom_level || question.k_level || "K1",
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
    const qs = arr.filter((q: any) => q && q.part?.toUpperCase() === part.toUpperCase());
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

  function getQuestionsByPart(part: string) {
    return (currentSetData?.questions || []).filter(
      (q: any) => q && q.part?.toUpperCase() === part.toUpperCase(),
    );
  }

  function getSnoStart(sectionIndex: number) {
    let count = 0;
    for (let i = 0; i < sectionIndex; i++) {
      const section = paperStructure[i];
      if (!section) continue;
      const sectionQs = getQuestionsByPart(section.part);
      sectionQs.forEach((s: any) => {
        count += (s.type === "OR_GROUP" ? 2 : (s.questions?.length || 1));
      });
    }
    return count + 1;
  }

  const alphabet = "abcdefghijklmnopqrstuvwxyz";
</script>

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-gray-100 dark:bg-slate-900/50">
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div id="nri-paper-actual" class="mx-auto bg-white p-[0.5in] shadow-2xl transition-all duration-500 font-serif relative" style="width: 8.27in; min-height: 11.69in; color: black;">
      
      <!-- NRI HEADER TABLE -->
      <table class="w-full mb-2">
        <tr>
          <td class="w-[20%] align-top">
            <img src="https://scontent.fhyd1-2.fna.fbcdn.net/v/t39.30808-6/294579151_444430584362976_5584277717608290735_n.jpg?_nc_cat=108&ccb=1-7&_nc_sid=1d70fc&_nc_ohc=D8xw9_T7KeIQ7kNvwFArnz4&_nc_oc=Adm1ucHqKtMN3-4w4uv7rpCfQHspvdzPo0BOVM40oQMtiiPzgdMGiifJ1CfCYqbn_wE&_nc_zt=23&_nc_ht=scontent.fhyd1-2.fna&_nc_gid=vK8MQa6t4WUz7gXY44nYEg&_nc_ss=8&oh=00_AfzajnHC_Qs5kbYlBlIGRHknPWeSf4rZM2GitOlpfHgySg&oe=69B58A53" alt="NRI Logo" class="h-20 w-auto object-contain" />
          </td>
          <td class="w-[60%] text-center">
            <h1 class="text-[#E31E24] text-[18pt] font-black leading-none mb-1">NRI INSTITUTE OF TECHNOLOGY</h1>
            <p class="text-[10pt] font-bold mb-1">(AUTONOMOUS)</p>
            <p class="text-[7pt] leading-tight">Approved by AICTE, New Delhi: Permanently Affiliated to JNTUK, Kakinada</p>
            <p class="text-[7pt] leading-tight">Accredited by NAAC with "A" GRADE, Accredited by NBA (CSE, ECE&EEE)</p>
            <p class="text-[7pt] leading-tight">An ISO 9001:2015 Certified Institution</p>
            <p class="text-[7pt] leading-tight font-medium">Pothavarappadu (V), Agiripalli (M), Eluru District, A.P., India, Pin: 521 212</p>
            <p class="text-[7pt] leading-tight font-bold">URL: www.nriit.edu.in, email: principal@nriit.edu.in, Mobile: + 91 8333882444</p>
          </td>
          <td class="w-[20%] text-right align-top">
             <div class="flex flex-col items-end gap-1">
                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTu4mLjm6VyLAjwI3gB6xo_CMGQnsMZl9IzRw&s" alt="NAAC A+" class="h-10 w-auto object-contain" />
                <img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgytWBPQsAV8x95nCwxVXkuw7yG5oSGD1UiqWT-yFtjgd-9aETkBJCszqCFSZZjBG53lPGvsi7p81XB-_et86IocKvyvq9CtHPi68FlQp9PepDghbJZFiHjoXjfZerAgG2-ndZGLvhM4PiR/w1200-h630-p-k-no-nu/1200px-National_Board_of_Accreditation.svg.png" alt="NBA" class="h-10 w-auto object-contain" />
             </div>
          </td>
        </tr>
      </table>

      <div class="border-b-2 border-black w-full mb-4"></div>

      <!-- METADATA SECTION -->
      <div class="flex justify-between items-center mb-4">
        <div class="font-black text-[12pt]">SET {activeSet}</div>
        <div class="flex-1 text-center">
          <h2 class="font-bold text-[11pt] uppercase">
             <AssessmentEditable value={paperMeta.exam_title || "II MID- TERM EXAMINATIONS"} onUpdate={(v) => updateText(v, "META", "exam_title")} />
          </h2>
        </div>
        <div class="text-[9pt] font-black flex gap-1">
           <span>ACADEMIC YEAR:</span>
           <AssessmentEditable value={paperMeta.academic_year || "2025-26"} onUpdate={(v) => updateText(v, "META", "academic_year")} />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-y-1 text-[10pt] mb-4">
        <div class="flex gap-1">
          <span class="font-black">CLASS:</span>
          <AssessmentEditable value={paperMeta.programme || "I B.Tech. I Semester (NRIA25)"} onUpdate={(v) => updateText(v, "META", "programme")} class="flex-1" />
        </div>
        <div class="flex gap-1 justify-end">
          <span class="font-black">DATE:</span>
          <AssessmentEditable value={paperMeta.paper_date || "19-12-2025"} onUpdate={(v) => updateText(v, "META", "paper_date")} />
        </div>
        
        <div class="col-span-2 text-center font-black underline mb-1">
           <AssessmentEditable value={paperMeta.exam_type || "SUBJECTIVE -II"} onUpdate={(v) => updateText(v, "META", "exam_type")} />
        </div>

        <div class="flex gap-1">
          <span class="font-black">BRANCH:</span>
          <AssessmentEditable value={paperMeta.branch || "CSE,AIML,IT,CSD"} onUpdate={(v) => updateText(v, "META", "branch")} class="flex-1" />
        </div>
        <div class="flex gap-1 justify-end">
          <span class="font-black">Max. Time:</span>
          <AssessmentEditable value={paperMeta.duration_label || "1 ½ Hour"} onUpdate={(v) => updateText(v, "META", "duration_label")} />
        </div>

        <div class="flex gap-1">
          <span class="font-black">SUBJECT:</span>
          <AssessmentEditable value={paperMeta.subject_name || "Communicative English Foundation (25A1100101)"} onUpdate={(v) => updateText(v, "META", "subject_name")} class="flex-1" />
        </div>
        <div class="flex gap-1 justify-end">
          <span class="font-black">Max. Marks:</span>
          <AssessmentEditable value={paperMeta.max_marks || "30 Marks"} onUpdate={(v) => updateText(v, "META", "max_marks")} />
        </div>
      </div>

      <div class="border-b-2 border-black w-full mb-2"></div>

      <!-- NOTE SECTION -->
      <div class="text-[8pt] mb-4 leading-normal">
        <p class="font-black">Note: This question paper contains two parts A and B.</p>
        <p>Part A consists of 3 Questions. Each question carries 2 marks. Answer All Questions. Part B consists of 3 Units. Answer any one full question from each unit. Each question carries 8 marks.</p>
      </div>

      <!-- SECTIONS ITERATION -->
      {#each paperStructure as section, sIdx}
        {@const sectionQuestions = getQuestionsByPart(section.part)}
        {@const totalPartMarks = calcTotal(section.part)}
        
        {#if sectionQuestions.length > 0 || mode === "preview"}
          <div class="mb-4">
            <div class="text-center font-black text-[10pt] uppercase flex justify-center items-center gap-4 mb-2">
              <AssessmentEditable value={section.title || `PART ${section.part}`} onUpdate={(v) => { section.title = v; paperStructure = [...paperStructure]; }} />
              <span>({sectionQuestions.length}X{section.marks_per_q}M={totalPartMarks}M)</span>
            </div>

            <table class="w-full border-collapse border border-black text-[9pt]">
              <thead>
                <tr class="font-black">
                  <td class="border border-black p-1 text-center w-[50px]">Q.NO</td>
                  <td class="border border-black p-1 text-center">Question</td>
                  <td class="border border-black p-1 text-center w-[50px]">Marks</td>
                  <td class="border border-black p-1 text-center w-[40px]">BTL</td>
                  <td class="border border-black p-1 text-center w-[40px]">CO</td>
                </tr>
              </thead>
              <tbody 
                use:dndzone={{ items: sectionQuestions, flipDurationMs: 200, dragDisabled: !isEditable }}
                onconsider={(e) => handleDndSync(section.part, e.detail.items)}
                onfinalize={(e) => handleDndSync(section.part, e.detail.items)}
              >
                {#each sectionQuestions as slot, i (slot.id + activeSet)}
                  <!-- Calculate the starting question number for this slot within this section -->
                  {@const baseSno = getSnoStart(sIdx)}
                  {@const slotOffset = sectionQuestions.slice(0, i).reduce((acc, s) => acc + (s.type === "OR_GROUP" ? 2 : (s.questions?.length || 1)), 0)}
                  {@const qNumber = baseSno + slotOffset}
                  
                  {#if slot.type === "OR_GROUP"}
                    <!-- CHOICE 1 -->
                    <tr class="group/row">
                      <td class="border border-black p-2 text-center align-top font-bold">{qNumber}</td>
                      <td class="border border-black p-2 align-top relative">
                        <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part, "q1")} onDelete={() => removeQuestion(slot)} class="!-left-10" />
                        {#if slot.choice1?.questions?.[0]}
                           <AssessmentEditable value={slot.choice1.questions[0].text || slot.choice1.questions[0].question_text} onUpdate={(v) => updateText(v, "QUESTION", "text", slot.id, slot.choice1.questions[0].id)} multiline={true} />
                        {/if}
                      </td>
                      <td class="border border-black p-2 text-center align-top font-bold">
                        <AssessmentEditable value={String(slot.choice1?.questions?.[0]?.marks || section.marks_per_q)} onUpdate={(v) => { if (slot.choice1?.questions?.[0]) slot.choice1.questions[0].marks = Number(v); }} />
                      </td>
                      <td class="border border-black p-2 text-center align-top tabular-nums uppercase">
                        <AssessmentEditable value={slot.choice1?.questions?.[0]?.rbtl || "K2"} onUpdate={(v) => { if (slot.choice1?.questions?.[0]) slot.choice1.questions[0].rbtl = v; }} />
                      </td>
                      <td class="border border-black p-2 text-center align-top tabular-nums uppercase">
                        <AssessmentEditable value={slot.choice1?.questions?.[0]?.co || "CO1"} onUpdate={(v) => { if (slot.choice1?.questions?.[0]) slot.choice1.questions[0].co = v; }} />
                      </td>
                    </tr>
                    
                    <!-- OR ROW -->
                    <tr>
                      <td class="border border-black p-1 text-center font-bold text-[8pt]" colspan="5">OR</td>
                    </tr>

                    <!-- CHOICE 2 -->
                    <tr class="group/row">
                      <td class="border border-black p-2 text-center align-top font-bold">{qNumber + 1}</td>
                      <td class="border border-black p-2 align-top relative">
                        <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part, "q2")} onDelete={() => removeQuestion(slot)} class="!-left-10" />
                        {#if slot.choice2?.questions?.[0]}
                           <AssessmentEditable value={slot.choice2.questions[0].text || slot.choice2.questions[0].question_text} onUpdate={(v) => updateText(v, "QUESTION", "text", slot.id, slot.choice2.questions[0].id)} multiline={true} />
                        {/if}
                      </td>
                      <td class="border border-black p-2 text-center align-top font-bold">
                        <AssessmentEditable value={String(slot.choice2?.questions?.[0]?.marks || section.marks_per_q)} onUpdate={(v) => { if (slot.choice2?.questions?.[0]) slot.choice2.questions[0].marks = Number(v); }} />
                      </td>
                      <td class="border border-black p-2 text-center align-top tabular-nums uppercase">
                        <AssessmentEditable value={slot.choice2?.questions?.[0]?.rbtl || "K3"} onUpdate={(v) => { if (slot.choice2?.questions?.[0]) slot.choice2.questions[0].rbtl = v; }} />
                      </td>
                      <td class="border border-black p-2 text-center align-top tabular-nums uppercase">
                        <AssessmentEditable value={slot.choice2?.questions?.[0]?.co || "CO2"} onUpdate={(v) => { if (slot.choice2?.questions?.[0]) slot.choice2.questions[0].co = v; }} />
                      </td>
                    </tr>
                  {:else}
                    {@const questions = slot.questions || [slot]}
                    {#each questions as q, qIdx}
                      <tr class="group/row">
                        <td class="border border-black p-2 text-center align-top font-bold">
                          {qNumber}{questions.length > 1 ? ` ${alphabet[qIdx]})` : ""}
                        </td>
                        <td class="border border-black p-2 align-top relative">
                          <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part)} onDelete={() => removeQuestion(slot)} class="!-left-10" />
                          <AssessmentEditable value={q.text || q.question_text} onUpdate={(v) => updateText(v, "QUESTION", "text", slot.id, q.id)} multiline={true} />
                          
                          {#if q.options?.length > 0}
                            <div class="mt-2 pl-4">
                               {#each q.options as opt, oIdx}
                                 <div>({alphabet[oIdx]}) {opt}</div>
                               {/each}
                            </div>
                          {/if}

                          {#if q.image_url}
                            <div class="mt-2">
                               <img src={q.image_url} alt="Question" class="max-h-[200px] object-contain" />
                            </div>
                          {/if}
                        </td>
                        <td class="border border-black p-2 text-center align-top font-bold tabular-nums">
                          <AssessmentEditable value={String(q.marks || section.marks_per_q)} onUpdate={(v) => { q.marks = Number(v); currentSetData = { ...currentSetData }; }} />
                        </td>
                        <td class="border border-black p-2 text-center align-top tabular-nums uppercase">
                          <AssessmentEditable value={q.rbtl || "K1"} onUpdate={(v) => { q.rbtl = v; currentSetData = { ...currentSetData }; }} />
                        </td>
                        <td class="border border-black p-2 text-center align-top tabular-nums uppercase">
                          <AssessmentEditable value={q.co || "CO1"} onUpdate={(v) => { q.co = v; currentSetData = { ...currentSetData }; }} />
                        </td>
                      </tr>
                    {/each}
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/each}

      <!-- FOOTER SIGNATURES -->
      <div class="mt-16 grid grid-cols-3 text-center text-[10pt] font-black">
         <div>Signature of the Faculty</div>
         <div>Exam Cell Co-ordinator</div>
         <div>Signature of HOD</div>
      </div>
    </div>
  </div>

  <SwapQuestionSidebar
    bind:isOpen={isSwapSidebarOpen}
    {questionPool}
    currentMark={swapContext?.currentMark}
    currentQuestionId={swapContext?.currentId}
    onSelect={selectAlternate}
    currentSetData={currentSetData} />
</div>

<style>
  @font-face {
    font-family: "Times New Roman";
    font-display: swap;
    src: local("Times New Roman");
  }
  #nri-paper-actual {
    font-family: "Times New Roman", Times, serif;
    line-height: 1.2;
  }
  #nri-paper-actual * {
    color: black !important;
  }
  table {
    border-collapse: collapse;
  }
  td {
    border: 1px solid black;
  }
  :global(.assessment-editable-container) {
    display: inline-block;
    min-width: 10px;
  }
  @media print {
    .bg-gray-100 { background: white !important; }
    #nri-paper-actual { box-shadow: none !important; }
  }
</style>
