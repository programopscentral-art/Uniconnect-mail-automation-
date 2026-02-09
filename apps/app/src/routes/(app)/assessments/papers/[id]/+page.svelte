<script lang="ts">
  import { page } from "$app/stores";
  import { slide, fade, fly } from "svelte/transition";
  import { invalidateAll } from "$app/navigation";
  import CrescentTemplate from "$lib/components/assessments/CrescentTemplate.svelte";
  import CDUTemplate from "$lib/components/assessments/CDUTemplate.svelte";
  import StandardTemplate from "$lib/components/assessments/StandardTemplate.svelte";
  import AssessmentPaperRenderer from "$lib/components/assessments/AssessmentPaperRenderer.svelte";

  let { data } = $props();

  // Local state for editing
  let activeSet = $state("A");
  const availableSets = $state(["A", "B", "C", "D"]);
  let showSaveModal = $state(false);

  // Absolute Template Enforcement
  // The university name and ID are the ultimate source of truth
  let selectedTemplate = $derived.by(() => {
    const uniName = data?.paper?.university_name?.toLowerCase() || "";
    const uniId = data?.paper?.university_id;
    const metaTemplate = data?.paper?.sets_data?.metadata?.selected_template;

    if (
      String(metaTemplate).toLowerCase().includes("vgu") ||
      uniName.includes("vgu") ||
      uniName.includes("vivekananda") ||
      String(uniId).toLowerCase().startsWith("c40ed15d") ||
      data?.paper?.layout_schema?.style === "vgu"
    ) {
      return "vgu";
    }
    if (
      metaTemplate === "cdu" ||
      uniName.includes("chaitanya") ||
      uniId === "8e5403f9-505a-44d4-add4-aae3efaa9248"
    ) {
      return "cdu";
    }
    if (metaTemplate === "crescent" || uniName.includes("crescent")) {
      return "crescent";
    }

    return metaTemplate || "standard";
  });

  let universityLabel = $derived(
    selectedTemplate === "vgu"
      ? "Vivekananda Global University (VGU)"
      : selectedTemplate === "cdu"
        ? "Chaitanya (CDU)"
        : selectedTemplate === "crescent"
          ? "Crescent (IST)"
          : "University Standard",
  );

  // We deep clone paper data to allow local edits
  let editableSets = $state<any>(initializeSets());
  let paperMeta = $state(initializeMeta());

  function initializeSets() {
    const paper = data?.paper;
    if (!paper)
      return {
        A: { questions: [] },
        B: { questions: [] },
        C: { questions: [] },
        D: { questions: [] },
      };

    let rawSetsData = paper.sets_data || paper.sets || paper.json_data || {};
    if (typeof rawSetsData === "string") {
      try {
        rawSetsData = JSON.parse(rawSetsData);
      } catch (e) {
        rawSetsData = {};
      }
    }

    const initial: any = {};
    availableSets.forEach((s) => {
      const val = rawSetsData[s] || rawSetsData[s.toLowerCase()];

      // Normalize: Ensure val is an object with a questions array
      let setObj: any;
      if (Array.isArray(val)) {
        setObj = { questions: JSON.parse(JSON.stringify(val)) };
      } else if (val && typeof val === "object") {
        setObj = JSON.parse(JSON.stringify(val));
        if (!setObj.questions) setObj.questions = [];
      } else {
        setObj = { questions: [] };
      }

      // CRITICAL: Ensure every slot and question has a stable ID at the source
      // This prevents dndzone from crashing if IDs are missing
      if (setObj.questions && Array.isArray(setObj.questions)) {
        setObj.questions = setObj.questions
          .filter(Boolean)
          .map((q: any, idx: number) => {
            const qId =
              q.id || `q-${s}-${idx}-${Math.random().toString(36).slice(2, 7)}`;
            q.id = qId;

            if (q.questions && Array.isArray(q.questions)) {
              q.questions = q.questions.map((subQ: any, subIdx: number) => {
                if (!subQ.id) subQ.id = `${qId}-sub-${subIdx}`;
                return subQ;
              });
            }
            if (q.choice1?.questions) {
              q.choice1.questions = q.choice1.questions.map(
                (subQ: any, subIdx: number) => {
                  if (!subQ.id) subQ.id = `${qId}-c1-${subIdx}`;
                  return subQ;
                },
              );
            }
            if (q.choice2?.questions) {
              q.choice2.questions = q.choice2.questions.map(
                (subQ: any, subIdx: number) => {
                  if (!subQ.id) subQ.id = `${qId}-c2-${subIdx}`;
                  return subQ;
                },
              );
            }
            return q;
          });
      }

      initial[s] = setObj;
    });
    return initial;
  }

  function initializeMeta() {
    const paper = data?.paper;

    const defaultMeta = {
      assessment_title: "New Assessment",
      exam_type: "MID1",
      paper_date: "",
      exam_time: "",
      duration_minutes: "180",
      max_marks: "100",
      course_code: "CS-XXXX",
      subject_name: "Question Paper",
      exam_title: "SEMESTER END EXAMINATIONS - NOV/DEC 2025",
      programme: "B.Tech - COMPUTER SCIENCE AND ENGINEERING",
      semester: "1",
      instructions: "ANSWER ALL QUESTIONS",
      univ_line_1: "CHAITANYA",
      univ_line_2: "(DEEMED TO BE UNIVERSITY)",
      colWidths: { sno: 40 },
      template_config: null,
    };

    if (!paper) return defaultMeta;

    let rawSetsData = paper.sets_data || paper.sets || paper.json_data || {};
    if (typeof rawSetsData === "string") {
      try {
        rawSetsData = JSON.parse(rawSetsData);
      } catch (e) {
        rawSetsData = {};
      }
    }

    const meta =
      rawSetsData.metadata || rawSetsData.editor_metadata || paper.meta || {};

    // Resolve structure early
    let structure = meta.template_config;
    if (!structure) {
      const marks = Number(meta.max_marks || paper.max_marks || 100);
      const is100 = marks === 100;
      const isMCQ = meta.part_a_type === "MCQ";
      if (selectedTemplate === "vgu") {
        structure = [
          {
            title: "SECTION A (1*10=10 Marks) Answer all Question No- 1-10",
            marks_per_q: 1,
            count: 10,
            answered_count: 10,
            part: "A",
          },
          {
            title: "SECTION B (5*3=15 Marks) Attempt any three questions",
            marks_per_q: 5,
            count: 4,
            answered_count: 3,
            part: "B",
          },
        ];
      } else if (is100) {
        structure = [
          {
            title: "PART A",
            marks_per_q: isMCQ ? 1 : 2,
            count: isMCQ ? 20 : 10,
            answered_count: isMCQ ? 20 : 10,
            section: "A",
          },
          {
            title: "PART B",
            marks_per_q: 16,
            count: 5,
            answered_count: 5,
            section: "B",
          },
        ];
      } else {
        structure = [
          {
            title: "PART A",
            marks_per_q: 2,
            count: 10,
            answered_count: 6,
            section: "A",
          },
          {
            title: "PART B",
            marks_per_q: 4,
            count: 2,
            answered_count: 2,
            section: "B",
          },
        ];
      }
    }

    return {
      assessment_title:
        meta.assessment_title ||
        `Assessment for ${paper.subject_name || "Subject"}`,
      exam_type: paper.exam_type || meta.exam_type || "MID1",
      paper_date:
        meta.paper_date ||
        (typeof paper.paper_date === "string"
          ? paper.paper_date.split("T")[0]
          : paper.paper_date?.toISOString?.().split("T")[0]) ||
        new Date().toISOString().split("T")[0],
      exam_time: meta.exam_time || "",
      duration_minutes: String(
        meta.duration_minutes || paper.duration_minutes || 180,
      ),
      max_marks: String(meta.max_marks || paper.max_marks || 100),
      course_code: meta.course_code || paper.subject_code || "CS-XXXX",
      subject_name: meta.subject_name || paper.subject_name || "Question Paper",
      exam_title:
        meta.exam_title ||
        paper.exam_title ||
        "I INTERNAL EXAMINATIONS - NOV 2024",
      programme:
        meta.programme || paper.branch_name || "B.Tech(CSE) - I SEMESTER",
      semester: String(meta.semester || paper.semester || 1),
      instructions:
        meta.instructions || paper.instructions || "ANSWER ALL QUESTIONS",
      univ_line_1:
        meta.univ_line_1 || paper.university_name || "UNIVERSITY NAME",
      univ_line_2: meta.univ_line_2 || "(DEEMED TO BE UNIVERSITY)",
      colWidths: meta.colWidths || { sno: 40 },
      template_config: structure,
    };
  }

  // Handle data changes from server (rare but good for safety)
  $effect(() => {
    const handler = (e: any) => {
      activeSet = e.detail;
    };
    window.addEventListener("changeSet", handler);
    return () => window.removeEventListener("changeSet", handler);
  });

  // Helper to find paper structure from metadata
  let paperStructure = $derived(paperMeta.template_config || []);

  let isSaving = $state(false);

  async function saveChanges() {
    isSaving = true;
    try {
      const res = await fetch(`/api/assessments/papers/${data.paper.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sets_data: {
            ...editableSets,
            metadata: {
              ...paperMeta,
              selected_template: selectedTemplate,
              template_config: paperStructure,
              max_marks: Number(paperMeta.max_marks),
              duration_minutes: Number(paperMeta.duration_minutes),
            },
          },
          paper_date: paperMeta.paper_date,
          exam_type: paperMeta.exam_type,
          duration_minutes: Number(paperMeta.duration_minutes),
          max_marks: Number(paperMeta.max_marks),
        }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        // Refresh local data from server for standard SvelteKit state
        await invalidateAll();
        // NOTE: We used to re-run initializeSets() here, but in Svelte 5 with deep state,
        // re-initializing while the user might be making subsequent edits causes race conditions.
        // The local editableSets is already the source of truth sent to the server.
        console.log("[PERSISTENCE] Sync complete.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save changes");
    } finally {
      isSaving = false;
    }
  }

  async function handleSetUpdate(updatedSet: any) {
    console.log("[PERSISTENCE] handleSetUpdate called for Set", activeSet);
    editableSets[activeSet] = updatedSet;
    // Auto-save the paper to ensure persistence of the swap
    await saveChanges();
  }

  async function downloadPDF() {
    const paper = data?.paper;
    const meta = paperMeta;

    // V94: Check if this paper uses a Deterministic Template
    const hasDeterministicTemplate =
      paper?.layout_schema?.slots && !Array.isArray(paper.layout_schema.slots);

    if (hasDeterministicTemplate) {
      try {
        const response = await fetch(
          `/api/assessments/papers/${paper.id}/render?set=${activeSet}`,
        );
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${paper.subject_name || "Assessment"}_Set_${activeSet}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          return;
        }
      } catch (err) {
        console.error(
          "[V94_PDF] ❌ Server-side render failed, falling back to browser print:",
          err,
        );
      }
    }

    const el =
      document.getElementById("crescent-paper-actual") ||
      document.getElementById("generic-paper-actual") ||
      document.getElementById("cdu-paper-actual");
    if (!el) {
      const content = document.getElementById("paper-content")?.innerHTML;
      if (!content) return;
      printPaper(content);
      return;
    }

    // Use outerHTML to preserve container styles (padding, etc.)
    printPaper(el.outerHTML);
  }

  function printPaper(htmlContent: string) {
    const styles = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]'),
    )
      .map((el) => el.outerHTML)
      .join("\n");

    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      alert("Please allow popups to print the paper");
      return;
    }

    printWindow.document.write(`
            <html>
                <head>
                    <title>Assessment Paper</title>
                    ${styles}
                    <style>
                        @media print {
                            @page { size: A4; margin: 0; }
                            html, body { 
                                margin: 0 !important; 
                                padding: 0 !important; 
                                background: white !important;
                                width: 210mm !important;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            body {
                                display: flex !important;
                                justify-content: center !important;
                            }
                            #crescent-paper-actual, .paper-container { 
                                width: 210mm !important; 
                                margin: 0 !important; 
                                border: none !important; 
                                box-sizing: border-box !important;
                                min-height: 297mm !important;
                                background: white !important;
                                box-shadow: none !important;
                            }
                            .no-print, nav, header, sidebar, .print\\:hidden, .fixed, button { display: none !important; }
                        }
                        body { 
                            margin: 0; 
                            background: #eee; 
                            display: flex;
                            justify-content: center;
                            padding: 20px;
                        }
                        #crescent-paper-actual, .paper-container { 
                            background: white; 
                            width: 210mm; 
                            min-height: 297mm;
                            box-shadow: 0 0 20px rgba(0,0,0,0.2); 
                            box-sizing: border-box;
                        }
                    </style>
                </head>
                <body>
                    <div class="paper-container">
                        ${htmlContent}
                    </div>
                    <script>
                        window.onload = () => {
                            setTimeout(() => { 
                                window.focus();
                                window.print(); 
                            }, 1200);
                        };
                    </${"script"}>
                </body>
            </html>
        `);
    printWindow.document.close();
  }

  function downloadDOCX() {
    const meta = paperMeta;
    const currentSetQuestions = (
      editableSets[activeSet] ||
      editableSets["A"] || { questions: [] }
    ).questions;

    const fetchCO = (q: any) => {
      if (!q.co_id) return "";
      const code = data.courseOutcomes.find((c: any) => c.id === q.co_id)?.code;
      return code && code !== "0" ? code : "";
    };

    const cleanOption = (txt: string) => {
      if (!txt) return "";
      // Strip common prefixes like (a), a), a. carefully to avoid double-prefixing
      return txt.replace(/^\s*[\(\[]?[a-dA-D][\.\)\s\]-]+\s*/i, "").trim();
    };

    const cleanQuestionText = (txt: string) => {
      if (!txt) return "";
      return txt.trim();
    };

    let html = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <style>
                    @page { margin: 0.6in; mso-header-margin: 0.5in; mso-footer-margin: 0.5in; }
                    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: black; line-height: 1.25; }
                    table { border-collapse: collapse; width: 100%; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
                    td { vertical-align: top; border: 1pt solid black; padding: 6pt; }
                    .no-border td { border: none !important; padding: 1pt; }
                    .metadata-table td { font-weight: bold; border: 1pt solid black; padding: 4pt 6pt; text-transform: uppercase; font-size: 9.5pt; }
                    .part-header-row { 
                        text-align: center; 
                        font-weight: bold; 
                        padding: 10pt; 
                        background-color: #f2f2f2;
                        font-size: 11.5pt;
                        text-transform: uppercase;
                    }
                    .or-row td {
                        text-align: center;
                        font-weight: bold;
                        font-style: italic;
                        padding: 6pt;
                        border-top: none !important;
                        border-bottom: none !important;
                    }
                </style>
            </head>
            <body>
        `;

    // 1. HEADER
    html += `
            <table class="no-border" style="margin-bottom: 5pt; border-collapse: collapse;">
                <tr>
                    <td style="width: 15%; text-align: left; vertical-align: middle;">
                        <img src="https://uniconnect-app.up.railway.app/crescent-logo.png" width="95" height="95" />
                    </td>
                    <td style="width: 55%; text-align: center; vertical-align: middle;">
                        <div style="font-size: 19pt; font-weight: bold; color: #003366; font-family: Arial, sans-serif;">BS Abdur Rahman</div>
                        <div style="font-size: 15.5pt; font-weight: bold; color: #003366; font-family: Arial, sans-serif;">Crescent Institute of Science & Technology</div>
                        <div style="font-size: 7.5pt; color: #555; margin-top: 2pt;">Deemed to be University u/s 3 of the UGC Act, 1956</div>
                    </td>
                    <td style="width: 30%; text-align: right; vertical-align: bottom; padding-bottom: 2pt;">
                        <div style="font-weight: bold; margin-bottom: 12pt; font-size: 11pt;">&lt;${meta.course_code || ""}&gt;</div>
                        <table border="0" align="right" style="width: auto; border-collapse: collapse;">
                            <tr>
                                <td style="border: 1pt solid black; font-size: 8.5pt; padding: 4pt 6pt; font-weight: bold; background: #eee;">RRN</td>
                                ${Array(10).fill('<td style="border: 1pt solid black; width: 17pt; height: 18pt;">&nbsp;</td>').join("")}
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <div style="text-align: center; font-weight: bold; font-size: 13.5pt; margin: 12pt 0; text-transform: uppercase; letter-spacing: 0.5pt;">
                ${meta.exam_title || "SEMESTER END EXAMINATIONS - NOV/DEC 2025"}
            </div>

            <table class="metadata-table">
                <tr>
                    <td style="width: 25%; background: #f4f4f4;">PROGRAMME & BRANCH</td>
                    <td colspan="3" style="font-weight: normal;">: ${meta.programme || ""}</td>
                </tr>
                <tr>
                    <td style="width: 25%; background: #f4f4f4;">SEMESTER</td>
                    <td style="width: 25%; text-align: center; font-weight: normal;">: ${meta.semester || ""}</td>
                    <td style="width: 25%; background: #f4f4f4; border-left: 1pt solid black;">DATE & SESSION</td>
                    <td style="width: 25%; text-align: center; font-weight: normal; font-size: 9pt;">: ${meta.paper_date || ""} ${meta.exam_time ? `[${meta.exam_time}]` : ""}</td>
                </tr>
                <tr>
                    <td style="width: 25%; background: #f4f4f4;">COURSE CODE & NAME</td>
                    <td colspan="3" style="font-weight: normal;">: ${meta.course_code || ""} - ${meta.subject_name || ""}</td>
                </tr>
                <tr>
                    <td style="width: 25%; background: #f4f4f4;">DURATION</td>
                    <td style="width: 25%; text-align: center; font-weight: normal;">: ${meta.duration_minutes || ""} Minutes</td>
                    <td style="width: 25%; background: #f4f4f4; border-left: 1pt solid black;">MAXIMUM MARKS</td>
                    <td style="width: 25%; text-align: center; font-weight: normal;">: ${meta.max_marks || ""}</td>
                </tr>
            </table>

            <div style="text-align: center; font-weight: bold; font-size: 10pt; margin: 15pt 0; text-decoration: underline;">
                ${meta.instructions || "ANSWER ALL QUESTIONS"}
            </div>
        `;

    const config = paperStructure;
    const setsA = currentSetQuestions.filter((q: any) => q.part === "A");
    const setsB = currentSetQuestions.filter((q: any) => q.part === "B");
    const setsC = currentSetQuestions.filter((q: any) => q.part === "C");

    const buildBlock = (
      title: string,
      slots: any[],
      startNum: number,
      marksPerQ: number,
    ) => {
      if (slots.length === 0) return "";

      // Calculate total marks for header
      let total = 0;
      slots.forEach((s) => {
        const marks = Number(s.marks || marksPerQ);
        total += s.type === "OR_GROUP" ? marks * 2 : marks;
      });

      let blockHtml = `<table style="width: 100%; border: 1pt solid black; margin-top: 15pt;">`;
      blockHtml += `<tr><td colspan="3" class="part-header-row">${title} (${slots.length} x ${marksPerQ} = ${total} MARKS)</td></tr>`;

      let currentNum = startNum;
      slots.forEach((s) => {
        if (s.type === "OR_GROUP") {
          const n1 = currentNum++;
          const n2 = currentNum++;
          const q1s = s.choice1?.questions || [];
          const q2s = s.choice2?.questions || [];

          // Choice 1
          q1s.forEach((q: any, qi: number) => {
            blockHtml += `
                            <tr>
                                <td style="width: 45pt; text-align: center; font-weight: bold; border-bottom: ${qi === q1s.length - 1 ? "1pt solid black" : "none"} !important;">
                                    ${qi === 0 ? n1 + "." : ""}
                                </td>
                                <td style="width: auto; border-bottom: ${qi === q1s.length - 1 ? "1pt solid black" : "none"} !important; padding: 8pt;">
                                    <div style="display: flex; gap: 8pt;">
                                        ${q.sub_label ? `<div style="width: 25pt; font-weight: bold;">${q.sub_label}</div>` : ""}
                                        <div style="flex: 1;">${q.text || ""}</div>
                                    </div>
                                </td>
                                <td style="width: 80pt; text-align: center; border-left: 1pt solid black; border-bottom: ${qi === q1s.length - 1 ? "1pt solid black" : "none"} !important; font-size: 10pt; vertical-align: middle;">
                                    ${fetchCO(q) ? `<div>(${fetchCO(q)})</div>` : ""}
                                    <div style="font-weight: bold;">(${q.marks || s.marks || marksPerQ})</div>
                                </td>
                            </tr>
                        `;
          });

          // OR Row
          blockHtml += `
                        <tr class="or-row">
                            <td colspan="3" style="text-align: center; font-weight: bold; background: #fafafa; padding: 4pt;">(OR)</td>
                        </tr>
                    `;

          // Choice 2
          q2s.forEach((q: any, qi: number) => {
            blockHtml += `
                            <tr>
                                <td style="width: 45pt; text-align: center; font-weight: bold; border-top: none !important;">
                                    ${qi === 0 ? n2 + "." : ""}
                                </td>
                                <td style="width: auto; border-top: none !important; padding: 8pt;">
                                    <div style="display: flex; gap: 8pt;">
                                        ${q.sub_label ? `<div style="width: 25pt; font-weight: bold;">${q.sub_label}</div>` : ""}
                                        <div style="flex: 1;">${q.text || ""}</div>
                                    </div>
                                </td>
                                <td style="width: 80pt; text-align: center; border-left: 1pt solid black; border-top: none !important; font-size: 10pt; vertical-align: middle;">
                                    ${fetchCO(q) ? `<div>(${fetchCO(q)})</div>` : ""}
                                    <div style="font-weight: bold;">(${q.marks || s.marks || marksPerQ})</div>
                                </td>
                            </tr>
                        `;
          });
        } else {
          const qs = s.questions || [s];
          qs.forEach((q: any, qi: number) => {
            blockHtml += `
                            <tr>
                                <td style="width: 45pt; text-align: center; font-weight: bold; border-bottom: ${qi === qs.length - 1 ? "1pt solid black" : "none"} !important;">
                                    ${qi === 0 ? currentNum + "." : ""}
                                </td>
                                <td style="width: auto; border-bottom: ${qi === qs.length - 1 ? "1pt solid black" : "none"} !important; padding: 8pt;">
                                    <div style="margin-bottom: 4pt; font-size: 11pt;">${q.text || ""}</div>
                                    ${
                                      q.type === "MCQ"
                                        ? `
                                        <div style="text-align: right; font-weight: bold; margin-bottom: 2pt;">[&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]</div>
                                    `
                                        : ""
                                    }
                                    ${
                                      q.options && q.options.length > 0
                                        ? `
                                        <table border="0" style="margin-top: 5pt; margin-left: 20pt; width: 95%; border-collapse: collapse;">
                                            <tr>
                                                <td style="width: 50%; border: none !important; padding: 2pt; font-size: 10.5pt;">(a) ${cleanOption(q.options[0])}</td>
                                                <td style="width: 50%; border: none !important; padding: 2pt; font-size: 10.5pt;">(b) ${cleanOption(q.options[1])}</td>
                                            </tr>
                                            <tr>
                                                <td style="width: 50%; border: none !important; padding: 2pt; font-size: 10.5pt;">(c) ${cleanOption(q.options[2])}</td>
                                                <td style="width: 50%; border: none !important; padding: 2pt; font-size: 10.5pt;">(d) ${cleanOption(q.options[3])}</td>
                                            </tr>
                                        </table>
                                    `
                                        : ""
                                    }
                                </td>
                                <td style="width: 80pt; text-align: center; border-left: 1pt solid black; border-bottom: ${qi === qs.length - 1 ? "1pt solid black" : "none"} !important; font-size: 10pt; vertical-align: middle;">
                                    ${fetchCO(q) ? `<div>(${fetchCO(q)})</div>` : ""}
                                    <div style="font-weight: bold;">(${q.marks || s.marks || marksPerQ})</div>
                                </td>
                            </tr>
                        `;
          });
          currentNum++;
        }
      });
      blockHtml += `</table>`;
      return blockHtml;
    };

    html += buildBlock(
      config[0]?.title || "PART A",
      setsA,
      1,
      config[0]?.marks_per_q || 2,
    );

    let startB = setsA.length + 1;
    html += buildBlock(
      config[1]?.title || "PART B",
      setsB,
      startB,
      config[1]?.marks_per_q || 5,
    );

    let startC = startB;
    setsB.forEach((s: any) => (startC += s.type === "OR_GROUP" ? 2 : 1));

    if (setsC.length > 0) {
      html += buildBlock(
        config[2]?.title || "PART C",
        setsC,
        startC,
        config[2]?.marks_per_q || 16,
      );
    }

    html += `
            <table class="no-border" style="margin-top: 60pt; border-collapse: collapse;">
                <tr>
                    <td style="width: 50%; text-align: left; padding-top: 30pt; font-size: 11pt; font-weight: bold; border-top: 1pt solid black;">Name & Signature of DAAC Member</td>
                    <td style="width: 50%; text-align: right; padding-top: 30pt; font-size: 11pt; font-weight: bold; border-top: 1pt solid black;">Name & Signature of DAAC Member</td>
                </tr>
            </table>
            </body></html>
        `;

    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meta.subject_name || "Paper"}_Question_Paper.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function downloadAnswerSheet(format = "csv") {
    const paperId = data?.paper?.id;
    if (!paperId) return;

    try {
      // Re-save current state to ensure answer sheet is populated in DB before export
      await saveChanges();

      const response = await fetch(
        `/api/assessments/generate?paperId=${paperId}&set=${activeSet}&format=${format}`,
      );
      if (!response.ok)
        throw new Error("Failed to fetch answer sheet from server");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Answer_Sheet_Set_${activeSet}.${format === "csv" ? "csv" : "json"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(
        "Failed to download answer sheet via API. Try the PDF version instead.",
      );
    }
  }

  function downloadAnswerSheetPDF() {
    const currentSet = editableSets[activeSet];
    if (!currentSet) return;

    const meta = paperMeta;
    const questions = currentSet.questions || [];

    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      alert("Please allow popups to download the answer sheet");
      return;
    }

    let answersHtml = "";
    let qNum = 1;

    // Helper to find question from pool or local list
    const findQ = (id: string) =>
      data.questionPool.find((q: any) => q.id === id);

    questions.forEach((slot: any) => {
      const qs: any[] = [];
      if (slot.type === "OR_GROUP") {
        if (slot.choice1?.questions?.[0]) qs.push(slot.choice1.questions[0]);
        if (slot.choice2?.questions?.[0]) qs.push(slot.choice2.questions[0]);
      } else {
        const q = slot.questions?.[0] || slot;
        if (q) qs.push(q);
      }

      qs.forEach((q) => {
        const poolQ = findQ(q.question_id || q.id);
        const ans = q.answer_key || q.answer || poolQ?.answer_key || "";

        answersHtml += `
            <div style="margin-bottom: 25px; page-break-inside: avoid; border-bottom: 1px solid #f0f0f0; padding-bottom: 20px;">
               <div style="font-weight: 800; font-size: 11pt; color: #1e293b; margin-bottom: 8px;">Q.${qNum++}. ${q.question_text || q.text || "No question text"}</div>
               <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; margin-top: 10px;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="background: #4338ca; color: white; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 900; text-transform: uppercase;">Correct Solution</span>
                  </div>
                  <div style="font-size: 10pt; line-height: 1.6; color: #334155; font-family: 'Segoe UI', system-ui; white-space: pre-wrap;">${ans || "No solution provided in question bank."}</div>
                  ${
                    q.options &&
                    Array.isArray(q.options) &&
                    q.options.length > 0
                      ? `<div style="margin-top: 12px; font-size: 9pt; color: #64748b; border-top: 1px dotted #cbd5e1; pt-8px; margin-top: 8px;">
                      <strong>Options:</strong> ${q.options.join(", ")}
                    </div>`
                      : ""
                  }
               </div>
            </div>
         `;
      });
    });

    const html = `
      <html>
        <head>
          <title>Answer Key - ${meta.subject_name || "Assessment"} - Set ${activeSet}</title>
          <style>
             @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
             body { font-family: 'Inter', sans-serif; padding: 50px; color: #0f172a; line-height: 1.5; background: white; }
             .header { text-align: center; border-bottom: 3px solid #0f172a; margin-bottom: 30px; padding-bottom: 20px; }
             h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase; }
             h2 { margin: 8px 0 0; font-size: 14px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
             .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 40px; font-size: 10pt; background: #f1f5f9; padding: 15px; border-radius: 10px; }
             .meta-item { border-left: 3px solid #4338ca; padding-left: 10px; }
             .meta-label { font-weight: 800; color: #64748b; font-size: 8pt; text-transform: uppercase; display: block; }
             .meta-value { font-weight: 700; color: #1e293b; }
             @media print {
               @page { size: A4; margin: 20mm; }
               body { padding: 0; }
               .no-print { display: none; }
             }
          </style>
        </head>
        <body>
          <div class="header">
             <h1>ANSWER KEY & SOLUTIONS</h1>
             <h2>FOR FACULTY USE ONLY</h2>
          </div>
          <div class="meta-grid">
             <div class="meta-item">
               <span class="meta-label">Subject & Course Code</span>
               <span class="meta-value">${meta.subject_name || "N/A"} (${meta.course_code || "N/A"})</span>
             </div>
             <div class="meta-item">
               <span class="meta-label">Set / Date</span>
               <span class="meta-value">SET ${activeSet} • ${meta.paper_date || new Date().toLocaleDateString()}</span>
             </div>
          </div>
          <div class="content">
             ${answersHtml}
          </div>
          <script>
            window.onload = () => {
               setTimeout(() => { 
                 window.focus();
                 window.print(); 
               }, 800);
            }
          </${"script"}>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }
</script>

<div
  class="max-w-6xl mx-auto space-y-6 pb-32 print:p-0 print:m-0 print:max-w-none"
>
  <!-- Top Bar with Set Selector Integrated -->
  <div
    class="bg-gray-900 text-white rounded-[2rem] p-4 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 print:hidden no-print"
  >
    <div class="flex items-center gap-6 px-4 no-print">
      <a
        href="/assessments/subjects/{data.paper.subject_id}?activeTab=PAPERS"
        class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
        title="Back to Papers"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M15 19l-7-7 7-7"
          /></svg
        >
      </a>

      <div class="space-y-0.5">
        <div
          class="flex items-center gap-2 text-[8px] font-black text-indigo-400 uppercase tracking-[0.3em]"
        >
          <div
            class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
          ></div>
          Editor State: Ready
        </div>
        <h1 class="text-xl font-black tracking-tight uppercase leading-none">
          {paperMeta.subject_name ||
            data.paper?.subject_name ||
            "Question Paper"}
        </h1>
      </div>

      <div class="h-8 w-px bg-white/10 hidden md:block"></div>

      <!-- Left empty for balance or future use -->
    </div>

    <div class="flex items-center gap-3 px-4">
      <!-- Set Selector -->
      <div
        class="flex items-center gap-1 bg-white/10 p-1.5 rounded-2xl mr-4 border border-white/5"
      >
        {#each availableSets as set}
          <button
            onclick={() => (activeSet = set)}
            class="px-4 py-2 rounded-xl text-[10px] font-black tracking-tighter transition-all duration-300 uppercase
                        {activeSet === set
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-white/10'}"
          >
            {set}
          </button>
        {/each}
      </div>

      <a
        href="/assessments/generate"
        class="inline-flex items-center px-4 py-3 bg-white/5 text-indigo-400 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-indigo-500/30"
      >
        GENERATE NEW
      </a>

      <button
        onclick={() => (showSaveModal = true)}
        disabled={isSaving}
        class="inline-flex items-center px-6 py-3 bg-green-600 text-white text-[11px] font-black rounded-xl hover:bg-green-700 transition-all shadow-lg shadow-green-900/40 disabled:opacity-50 active:scale-95 flex-shrink-0"
      >
        {#if isSaving}
          <div
            class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"
          ></div>
          <span class="tracking-widest">SAVING...</span>
        {:else}
          <svg
            class="w-4 h-4 mr-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            /></svg
          >
          <span class="tracking-widest uppercase">Save Changes</span>
        {/if}
      </button>
      <button
        onclick={downloadPDF}
        aria-label="Download as PDF or Print"
        class="inline-flex items-center px-4 py-3 bg-white/5 text-gray-300 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all"
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
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          /></svg
        >
      </button>
      <button
        onclick={downloadDOCX}
        aria-label="Download as DOCX (MS Word)"
        class="inline-flex items-center px-4 py-3 bg-white/5 text-gray-300 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all"
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          /></svg
        >
      </button>

      <button
        onclick={() => downloadAnswerSheetPDF()}
        class="inline-flex items-center px-4 py-3 bg-white/5 text-amber-400 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-amber-500/20 shadow-lg shadow-amber-900/10"
      >
        <svg
          class="w-3.5 h-3.5 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          /></svg
        >
        ANS PDF
      </button>

      <button
        onclick={() => downloadAnswerSheet("csv")}
        class="inline-flex items-center px-4 py-3 bg-white/5 text-gray-500 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-white/10"
      >
        CSV
      </button>
    </div>
  </div>

  <!-- Paper View (Crescent Template) -->
  <div
    id="paper-content"
    class="bg-white rounded-[1rem] shadow-2xl overflow-hidden print:shadow-none print:m-0 print:p-0 border border-gray-100 min-h-screen"
  >
    {#if editableSets[activeSet]}
      <!-- Paper Preview -->
      <div class="lg:col-span-3 space-y-6">
        <!-- Template Info -->
        <div
          class="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm print:hidden"
        >
          <span
            class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4"
            >Paper Format:</span
          >
          <div
            class="px-6 py-2 rounded-xl text-[10px] font-black bg-indigo-600 text-white uppercase tracking-widest flex items-center gap-2 shadow-sm"
          >
            <svg
              class="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M9 12l2 2 4-4m5.618-4.016A9 9 0 112.182 17.82L3 21l3.18-.818A8.966 8.966 0 0012 21a9 9 0 008.94-6.94l1.1-3.32z"
              /></svg
            >
            {universityLabel}
          </div>
          <!-- Version Tag -->
          <div
            class="ml-auto px-4 py-1.5 rounded-lg text-[9px] font-black bg-green-100 text-green-700 border border-green-200 uppercase tracking-[0.2em] flex items-center gap-2"
          >
            <div
              class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
            ></div>
            V2.2.7 - ANS KEY READY
          </div>
        </div>

        {#if selectedTemplate === "vgu"}
          <AssessmentPaperRenderer
            bind:paperMeta
            bind:currentSetData={editableSets[activeSet]}
            bind:paperStructure={paperMeta.template_config}
            layoutSchema={data.paper.layout_schema || { style: "vgu" }}
            {activeSet}
            courseOutcomes={data.courseOutcomes}
            questionPool={data.questionPool}
            mode="edit"
            onSwap={handleSetUpdate}
          />
        {:else if selectedTemplate === "cdu"}
          <CDUTemplate
            bind:paperMeta
            bind:currentSetData={editableSets[activeSet]}
            bind:paperStructure={paperMeta.template_config}
            {activeSet}
            courseOutcomes={data.courseOutcomes}
            questionPool={data.questionPool}
            mode="edit"
            onSwap={handleSetUpdate}
          />
        {:else if selectedTemplate === "crescent"}
          <CrescentTemplate
            bind:paperMeta
            bind:currentSetData={editableSets[activeSet]}
            {paperStructure}
            {activeSet}
            courseOutcomes={data.courseOutcomes}
            questionPool={data.questionPool}
            mode="edit"
            onSwap={handleSetUpdate}
          />
        {:else}
          <StandardTemplate
            bind:paperMeta
            bind:currentSetData={editableSets[activeSet]}
            {paperStructure}
            {activeSet}
            courseOutcomes={data.courseOutcomes}
            questionPool={data.questionPool}
            mode="edit"
            onSwap={handleSetUpdate}
          />
        {/if}
      </div>
    {:else}
      <div class="p-32 text-center space-y-6">
        <div
          class="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"
        ></div>
        <div class="space-y-1">
          <p
            class="text-gray-900 font-black uppercase tracking-[0.3em] text-sm"
          >
            INITIALIZING PAPER
          </p>
          <p class="text-gray-400 text-[10px] font-bold">
            PLEASE WAIT WHILE WE COMPILE THE DATA
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showSaveModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    transition:fade
  >
    <div
      class="glass rounded-[3rem] w-full max-w-lg p-10 shadow-2xl border border-white/10"
      transition:fly={{ y: 30, duration: 500 }}
    >
      <div class="flex items-center gap-4 mb-8">
        <div
          class="w-12 h-12 rounded-2xl bg-green-600 text-white flex items-center justify-center shadow-lg shadow-green-500/20"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            /></svg
          >
        </div>
        <div>
          <h3 class="text-2xl font-black text-white uppercase tracking-tighter">
            Save Assessment
          </h3>
          <p
            class="text-[10px] font-black text-green-500 uppercase tracking-widest mt-1"
          >
            Finalize and Label Paper
          </p>
        </div>
      </div>

      <div class="space-y-6">
        <div class="space-y-2 text-white">
          <label
            class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2"
            >Assessment Title (Internal Tracking)</label
          >
          <input
            type="text"
            bind:value={paperMeta.assessment_title}
            class="w-full bg-white/5 border border-white/10 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all px-5 py-4 text-white"
            placeholder="e.g. Mid Term Exam Nov 2025"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2"
              >Exam Type</label
            >
            <select
              bind:value={paperMeta.exam_type}
              class="w-full bg-white/5 border border-white/10 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all px-5 py-4 text-white"
            >
              <option value="MID1" class="bg-slate-900 text-white">MID-1</option
              >
              <option value="MID2" class="bg-slate-900 text-white">MID-2</option
              >
              <option value="SEM" class="bg-slate-900 text-white"
                >SEMESTER</option
              >
              <option value="SUPPLY" class="bg-slate-900 text-white"
                >SUPPLEMENTARY</option
              >
              <option value="PRACTICAL" class="bg-slate-900 text-white"
                >PRACTICAL</option
              >
            </select>
          </div>
          <div class="space-y-2">
            <label
              class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2"
              >Exam Date</label
            >
            <input
              type="date"
              bind:value={paperMeta.paper_date}
              class="w-full bg-white/5 border border-white/10 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all px-5 py-4 text-white"
            />
          </div>
        </div>

        <div class="flex gap-4 pt-4">
          <button
            onclick={() => (showSaveModal = false)}
            class="flex-1 py-4 bg-white/5 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-white/5 hover:bg-white/10 transition-all"
            >CANCEL</button
          >
          <button
            onclick={async () => {
              await saveChanges();
              showSaveModal = false;
            }}
            disabled={isSaving}
            class="flex-[2] py-4 bg-green-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-green-700 transition-all shadow-xl shadow-green-500/20 disabled:opacity-50"
          >
            {isSaving ? "PERSISTING..." : "SAVE & PERSIST"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @media print {
    :global(body) {
      background: white !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .print\:hidden {
      display: none !important;
    }
  }

  :global(.tracking-widest) {
    letter-spacing: 0.15em;
  }
</style>
