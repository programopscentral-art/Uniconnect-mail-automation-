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

<div class="h-full overflow-hidden flex flex-col xl:flex-row relative bg-white">
  <div class="flex-1 overflow-auto p-4 sm:p-8">
    <div id="nri-paper-actual" class="mx-auto bg-white p-[0.4in] transition-all duration-500 relative" style="width: 8.27in; min-height: 11.69in; color: black; font-family: 'Times New Roman', Times, serif;">
      
      <!-- NRI HEADER TABLE -->
      <table class="w-full mb-2 no-border-table">
        <tbody>
          <tr>
            <td class="w-[18%] align-middle border-none">
              <img src="https://scontent.fhyd1-2.fna.fbcdn.net/v/t39.30808-6/294579151_444430584362976_5584277717608290735_n.jpg?_nc_cat=108&ccb=1-7&_nc_sid=1d70fc&_nc_ohc=D8xw9_T7KeIQ7kNvwFArnz4&_nc_oc=Adm1ucHqKtMN3-4w4uv7rpCfQHspvdzPo0BOVM40oQMtiiPzgdMGiifJ1CfCYqbn_wE&_nc_zt=23&_nc_ht=scontent.fhyd1-2.fna&_nc_gid=vK8MQa6t4WUz7gXY44nYEg&_nc_ss=8&oh=00_AfzajnHC_Qs5kbYlBlIGRHknPWeSf4rZM2GitOlpfHgySg&oe=69B58A53" alt="NRI Logo" class="h-28 w-auto object-contain" />
            </td>
            <td class="w-[64%] text-center align-middle border-none">
              <h1 class="text-[#E31E24] text-[20pt] font-black leading-none mb-1">NRI INSTITUTE OF TECHNOLOGY</h1>
              <p class="text-[11pt] font-bold mb-1">(AUTONOMOUS)</p>
              <p class="text-[8pt] leading-tight">Approved by AICTE, New Delhi: Permanently Affiliated to JNTUK, Kakinada</p>
              <p class="text-[8pt] leading-tight">Accredited by NAAC with "A" GRADE, Accredited by NBA (CSE, ECE&EEE)</p>
              <p class="text-[8pt] leading-tight">An ISO 9001:2015 Certified Institution</p>
              <p class="text-[8pt] leading-tight font-medium">Pothavarappadu (V), Agiripalli (M), Eluru District, A.P., India, Pin: 521 212</p>
              <p class="text-[8pt] leading-tight font-bold">URL: www.nriit.edu.in, email: principal@nriit.edu.in, Mobile: + 91 8333882444</p>
            </td>
            <td class="w-[18%] text-right align-middle border-none">
               <div class="flex flex-col items-end gap-2">
                  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTu4mLjm6VyLAjwI3gB6xo_CMGQnsMZl9IzRw&s" alt="NAAC A+" class="h-14 w-auto object-contain" />
                  <img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgytWBPQsAV8x95nCwxVXkuw7yG5oSGD1UiqWT-yFtjgd-9aETkBJCszqCFSZZjBG53lPGvsi7p81XB-_et86IocKvyvq9CtHPi68FlQp9PepDghbJZFiHjoXjfZerAgG2-ndZGLvhM4PiR/w1200-h630-p-k-no-nu/1200px-National_Board_of_Accreditation.svg.png" alt="NBA" class="h-14 w-auto object-contain" />
               </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="border-b-2 border-black w-full mb-3"></div>

      <!-- METADATA SECTION -->
      <div class="mb-4">
        <!-- FIRST ROW: SET 1 -->
        <div class="font-bold text-[11pt] mb-2">SET {activeSet}</div>

        <!-- SECOND ROW: EXAM TITLE & ACADEMIC YEAR -->
        <div class="flex justify-between items-end mb-1">
          <div class="w-[220px]"></div> 
          <div class="flex-1 text-center">
            <h2 class="font-bold text-[13pt] uppercase leading-none">
               <AssessmentEditable value={paperMeta.exam_title || "II MID- TERM EXAMINATIONS"} onUpdate={(v) => updateText(v, "META", "exam_title")} />
            </h2>
          </div>
          <div class="w-[220px] text-[10pt] font-bold flex justify-end items-center gap-1 whitespace-nowrap">
             <span>ACADEMIC YEAR:</span>
             <AssessmentEditable value={paperMeta.academic_year || "2025-26"} onUpdate={(v) => updateText(v, "META", "academic_year")} />
          </div>
        </div>

        <!-- THIRD ROW: CLASS & DATE -->
        <div class="flex justify-between items-end text-[10pt] font-bold mb-3 min-h-[1.2rem]">
          <div class="flex-1 flex gap-1 overflow-hidden">
            <span class="whitespace-nowrap">CLASS:</span>
            <AssessmentEditable value={paperMeta.class_name || paperMeta.programme || "I B.Tech. I Semester (NRIA25)"} onUpdate={(v) => updateText(v, "META", "class_name")} class="flex-1" />
          </div>
          <div class="w-[220px] text-[10pt] font-bold flex justify-end items-center gap-1 whitespace-nowrap">
            <span>DATE:</span>
            <AssessmentEditable value={paperMeta.paper_date || "19-12-2025"} onUpdate={(v) => updateText(v, "META", "paper_date")} />
          </div>
        </div>

        <!-- FOURTH ROW: SUBJECTIVE -II -->
        <div class="flex justify-between items-end mb-3">
          <div class="w-[220px]"></div>
          <div class="flex-1 text-center font-bold underline uppercase text-[12pt]">
             <AssessmentEditable value={paperMeta.exam_type || "SUBJECTIVE -II"} onUpdate={(v) => updateText(v, "META", "exam_type")} />
          </div>
          <div class="w-[220px]"></div>
        </div>

        <!-- FIFTH ROW: BRANCH & TIME -->
        <div class="flex justify-between items-end text-[10pt] font-bold mb-1 min-h-[1.2rem]">
          <div class="flex-1 flex gap-1 overflow-hidden">
            <span class="whitespace-nowrap">BRANCH:</span>
            <AssessmentEditable value={paperMeta.branch || "CSE,AIML,IT,CSD"} onUpdate={(v) => updateText(v, "META", "branch")} class="flex-1" />
          </div>
          <div class="w-[220px] text-[10pt] font-bold flex justify-end items-center gap-1 whitespace-nowrap">
            <span>Max. Time:</span>
            <AssessmentEditable value={paperMeta.duration_label || "1 ½ Hour"} onUpdate={(v) => updateText(v, "META", "duration_label")} />
          </div>
        </div>

        <!-- SIXTH ROW: SUBJECT & MARKS -->
        <div class="flex justify-between items-end text-[10pt] font-bold min-h-[1.2rem]">
          <div class="flex-1 flex gap-1 overflow-hidden">
            <span class="whitespace-nowrap">SUBJECT:</span>
            <AssessmentEditable value={paperMeta.subject_name || "Communicative English Foundation (25A1100101)"} onUpdate={(v) => updateText(v, "META", "subject_name")} class="flex-1" />
          </div>
          <div class="w-[220px] text-[10pt] font-bold flex justify-end items-center gap-1 whitespace-nowrap">
            <span>Max. Marks:</span>
            <AssessmentEditable value={paperMeta.max_marks || "30 Marks"} onUpdate={(v) => updateText(v, "META", "max_marks")} />
          </div>
        </div>
      </div>

      <div class="border-b-[1.5pt] border-black w-full mb-1"></div>
      <div class="border-b-[0.5pt] border-black w-full mb-3"></div>

      <!-- NOTE SECTION -->
      <div class="text-[9pt] mb-6 leading-tight italic text-justify px-1">
        <p class="font-bold mb-1 not-italic flex gap-1 items-center">
          <span>Note:</span>
          <AssessmentEditable value={paperMeta.note_header || "This question paper contains two parts A and B."} onUpdate={(v) => updateText(v, "META", "note_header")} class="flex-1" />
        </p>
        <AssessmentEditable value={paperMeta.instructions || "Part A consists of 3 Questions. Each question carries 2 marks. Answer All Questions. Part B consists of 3 Units. Answer any one full question from each unit. Each question carries 8 marks."} onUpdate={(v) => updateText(v, "META", "instructions")} multiline={true} />
      </div>

      <!-- SECTIONS ITERATION -->
      {#each paperStructure as section, sIdx}
        {@const sectionQuestions = getQuestionsByPart(section.part)}
        {@const totalPartMarks = calcTotal(section.part)}
        
        {#if sectionQuestions.length > 0 || mode === "preview"}
          <div class="mb-8">
            <div class="text-center font-bold text-[11pt] uppercase flex justify-center items-center gap-10 mb-3">
              <span class="font-bold">
                <AssessmentEditable value={section.title || `PART ${section.part}`} onUpdate={(v) => { section.title = v; paperStructure = [...paperStructure]; }} />
              </span>
              <span class="font-bold flex items-center gap-0">
                (<AssessmentEditable value={String(section.answered_count || sectionQuestions.length)} onUpdate={(v) => { section.answered_count = Number(v); paperStructure = [...paperStructure]; }} />
                X
                <AssessmentEditable value={String(section.marks_per_q)} onUpdate={(v) => { section.marks_per_q = Number(v); paperStructure = [...paperStructure]; }} />
                M =
                <AssessmentEditable value={String(section.total_marks || totalPartMarks)} onUpdate={(v) => { section.total_marks = Number(v); paperStructure = [...paperStructure]; }} />
                M)
              </span>
            </div>

            <table class="w-full border-collapse border-[1.5pt] border-black text-[10pt] question-table">
              <thead>
                <tr class="font-bold text-center h-10 bg-gray-50/5">
                  <td class="w-[60px] border border-black p-1">Q.NO</td>
                  <td class="border border-black p-1 px-4">Question</td>
                  <td class="w-[60px] border border-black p-1">Marks</td>
                  <td class="w-[50px] border border-black p-1">BTL</td>
                  <td class="w-[50px] border border-black p-1">CO</td>
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
                    <tr class="group/row min-h-[40px]">
                      <td class="text-center align-top font-bold border border-black p-2 text-[11pt]">{qNumber}</td>
                      <td class="align-top relative text-justify leading-relaxed border border-black p-3">
                        <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part, "q1")} onDelete={() => removeQuestion(slot)} class="!-left-10" />
                        {#if slot.choice1?.questions?.[0]}
                           <AssessmentEditable value={slot.choice1.questions[0].text || slot.choice1.questions[0].question_text} onUpdate={(v) => updateText(v, "QUESTION", "text", slot.id, slot.choice1.questions[0].id)} multiline={true} />
                        {/if}
                      </td>
                      <td class="text-center align-top font-bold tabular-nums border border-black p-2">
                        <AssessmentEditable value={String(slot.choice1?.questions?.[0]?.marks || section.marks_per_q)} onUpdate={(v) => { if (slot.choice1?.questions?.[0]) slot.choice1.questions[0].marks = Number(v); }} />
                      </td>
                      <td class="text-center align-top tabular-nums uppercase font-bold border border-black p-2">
                        <AssessmentEditable value={slot.choice1?.questions?.[0]?.rbtl || "2"} onUpdate={(v) => { if (slot.choice1?.questions?.[0]) slot.choice1.questions[0].rbtl = v; }} />
                      </td>
                      <td class="text-center align-top tabular-nums uppercase font-bold border border-black p-2">
                        <AssessmentEditable value={slot.choice1?.questions?.[0]?.co || "2"} onUpdate={(v) => { if (slot.choice1?.questions?.[0]) slot.choice1.questions[0].co = v; }} />
                      </td>
                    </tr>
                    
                    <!-- OR ROW -->
                    <tr>
                      <td class="text-center font-bold text-[10pt] uppercase tracking-widest italic bg-gray-50/10 border border-black p-1" colspan="5">OR</td>
                    </tr>

                    <!-- CHOICE 2 -->
                    <tr class="group/row min-h-[40px]">
                      <td class="text-center align-top font-bold border border-black p-2 text-[11pt]">{qNumber + 1}</td>
                      <td class="align-top relative text-justify leading-relaxed border border-black p-3">
                        <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part, "q2")} onDelete={() => removeQuestion(slot)} class="!-left-10" />
                        {#if slot.choice2?.questions?.[0]}
                           <AssessmentEditable value={slot.choice2.questions[0].text || slot.choice2.questions[0].question_text} onUpdate={(v) => updateText(v, "QUESTION", "text", slot.id, slot.choice2.questions[0].id)} multiline={true} />
                        {/if}
                      </td>
                      <td class="text-center align-top font-bold tabular-nums border border-black p-2">
                        <AssessmentEditable value={String(slot.choice2?.questions?.[0]?.marks || section.marks_per_q)} onUpdate={(v) => { if (slot.choice2?.questions?.[0]) slot.choice2.questions[0].marks = Number(v); }} />
                      </td>
                      <td class="text-center align-top tabular-nums uppercase font-bold border border-black p-2">
                        <AssessmentEditable value={slot.choice2?.questions?.[0]?.rbtl || "3"} onUpdate={(v) => { if (slot.choice2?.questions?.[0]) slot.choice2.questions[0].rbtl = v; }} />
                      </td>
                      <td class="text-center align-top tabular-nums uppercase font-bold border border-black p-2">
                        <AssessmentEditable value={slot.choice2?.questions?.[0]?.co || "2"} onUpdate={(v) => { if (slot.choice2?.questions?.[0]) slot.choice2.questions[0].co = v; }} />
                      </td>
                    </tr>
                  {:else}
                    {@const questions = slot.questions || [slot]}
                    {#each questions as q, qIdx}
                      <tr class="group/row min-h-[60px]">
                        <td class="text-center align-top font-bold border border-black p-2 text-[11pt]">
                          {qNumber}{questions.length > 1 ? ` ${alphabet[qIdx]})` : ""}
                        </td>
                        <td class="align-top relative text-justify leading-relaxed border border-black p-3">
                          <AssessmentRowActions {isEditable} onSwap={() => openSwapSidebar(slot, section.part)} onDelete={() => removeQuestion(slot)} class="!-left-10" />
                          <AssessmentEditable value={q.text || q.question_text} onUpdate={(v) => updateText(v, "QUESTION", "text", slot.id, q.id)} multiline={true} />
                          
                          {#if q.options?.length > 0}
                            <div class="mt-3 pl-4 space-y-1">
                               {#each q.options as opt, oIdx}
                                 <div>({alphabet[oIdx]}) {opt}</div>
                               {/each}
                            </div>
                          {/if}

                          {#if q.image_url}
                            <div class="mt-4">
                               <img src={q.image_url} alt="Question" class="max-h-[300px] object-contain border border-black/5 rounded shadow-sm" />
                            </div>
                          {/if}
                        </td>
                        <td class="text-center align-top font-bold tabular-nums border border-black p-2">
                          <AssessmentEditable value={String(q.marks || section.marks_per_q)} onUpdate={(v) => { q.marks = Number(v); currentSetData = { ...currentSetData }; }} />
                        </td>
                        <td class="text-center align-top tabular-nums uppercase font-bold border border-black p-2">
                          <AssessmentEditable value={q.rbtl || "2"} onUpdate={(v) => { q.rbtl = v; currentSetData = { ...currentSetData }; }} />
                        </td>
                        <td class="text-center align-top tabular-nums uppercase font-bold border border-black p-2">
                          <AssessmentEditable value={q.co || "2"} onUpdate={(v) => { q.co = v; currentSetData = { ...currentSetData }; }} />
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
      <div class="mt-24 grid grid-cols-3 text-center text-[10pt] font-bold pb-10">
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
    font-family: "Times New Roman", Times, serif !important;
    line-height: normal;
    color: black !important;
  }

  #nri-paper-actual :global(*) {
    font-family: "Times New Roman", Times, serif !important;
    color: black !important;
  }

  .no-border-table td {
    border: none !important;
  }

  .question-table td {
    border: 1.5pt solid black !important;
  }

  #nri-paper-actual :global(.assessment-editable-container) {
    display: inline-block;
    min-width: 5px;
    font-weight: inherit;
    font-family: inherit;
  }

  #nri-paper-actual :global(.assessment-editable-container:focus-within) {
    outline: none !important;
    background: rgba(0,0,0,0.02);
  }

  @media print {
    .bg-white { background: white !important; }
    #nri-paper-actual { box-shadow: none !important; padding: 0.4in !important; border: none !important; }
  }
</style>
