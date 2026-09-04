<script lang="ts">
  import { page } from "$app/stores";
  import { slide, fade, fly } from "svelte/transition";
  import { invalidateAll } from "$app/navigation";
  import TemplateCautionBanner from "$lib/components/assessments/TemplateCautionBanner.svelte";
  import { resolvePaperTemplate } from "$lib/components/assessments/templateRegistry";
  import { deriveStructureFromSet } from "$lib/components/assessments/paperStructure";

  let { data } = $props();

  // Local state for editing
  let activeSet = $state("A");
  const availableSets = $state(["A", "B", "C", "D"]);
  let showSaveModal = $state(false);

  /**
   * Template routing — one source of truth, shared with the generate preview.
   * Resolves the canonical {uni}mid / {uni}sem slug from the university + exam
   * type, so a MID paper can never silently render the SEM layout (and vice
   * versa), and a university with no template for that kind raises a caution.
   */
  let resolved = $derived(
    resolvePaperTemplate({
      universityName: data?.paper?.university_name,
      universityId: data?.paper?.university_id,
      examType: data?.paper?.exam_type,
      examTitle: data?.paper?.sets_data?.metadata?.exam_title,
      maxMarks: data?.paper?.max_marks,
      metaTemplate: data?.paper?.sets_data?.metadata?.selected_template,
      layoutStyle: data?.paper?.layout_schema?.style,
    }),
  );

  /** Legacy family key, kept only for the structure fallbacks further down. */
  let selectedTemplate = $derived.by(() => {
    const key = resolved.uniKey;
    if (!key) return "standard";
    if (key === "mrv") return "malla";
    if (key === "sgu") return Number(data?.paper?.max_marks) === 75 ? "sgu75" : "sgu50";
    return key;
  });

  let universityLabel = $derived(resolved.universityLabel);
  const PaperTemplate = $derived(resolved.component);


  // We deep clone paper data to allow local edits
  let editableSets = $state<any>(initializeSets());
  let paperMeta = $state(initializeMeta());

  /* ─────────── Set similarity ───────────
     Sets are meant to be different papers. This surfaces how many questions any
     two sets actually share, so an overlap is visible before the paper goes out
     rather than being discovered in the exam hall. */
  let showSimilarity = $state(false);

  function questionIdsOf(set: any): Set<string> {
    const ids = new Set<string>();
    const arr = Array.isArray(set) ? set : set?.questions || [];
    for (const slot of arr) {
      if (!slot) continue;
      const qs: any[] = [];
      if (slot.type === "OR_GROUP") {
        qs.push(
          ...(slot.choice1?.questions || []),
          ...(slot.choice2?.questions || []),
        );
      } else if (slot.questions) qs.push(...slot.questions);
      else qs.push(slot);
      for (const q of qs) {
        const id = q?.question_id || q?.id;
        // Placeholders for unfilled slots aren't real questions.
        if (id && !String(id).startsWith("missing-")) ids.add(String(id));
      }
    }
    return ids;
  }

  const setPairs = $derived.by(() => {
    const present = availableSets.filter((s) => editableSets?.[s]);
    const idMap = new Map<string, Set<string>>(
      present.map((s) => [s, questionIdsOf(editableSets[s])]),
    );
    const out: Array<{ a: string; b: string; shared: number; pct: number }> = [];
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const A = idMap.get(present[i])!;
        const B = idMap.get(present[j])!;
        if (!A.size || !B.size) continue;
        let shared = 0;
        A.forEach((id) => { if (B.has(id)) shared++; });
        // % of the smaller set that is duplicated in the other.
        const pct = Math.round((shared / Math.min(A.size, B.size)) * 100);
        out.push({ a: present[i], b: present[j], shared, pct });
      }
    }
    return out.sort((x, y) => y.pct - x.pct);
  });

  /**
   * Questions already placed in the OTHER sets of this paper.
   *
   * The swap picker only ever knew about the set being edited, so replacing a
   * question in Set B could hand you one that is already in Set A - which is how
   * duplicates appeared across sets even though the generator de-duplicates.
   * Narrowing the pool here fixes it for every template at once, with no prop
   * threading through the 16 university templates.
   */
  const idsUsedInOtherSets = $derived.by(() => {
    const out = new Set<string>();
    for (const k of availableSets) {
      if (k === activeSet || !editableSets?.[k]) continue;
      questionIdsOf(editableSets[k]).forEach((id) => out.add(id));
    }
    return out;
  });

  const poolForActiveSet = $derived(
    (data.questionPool || []).filter(
      (q: any) => !idsUsedInOtherSets.has(String(q.question_id ?? q.id)),
    ),
  );

  const maxSimilarity = $derived(
    setPairs.length ? setPairs[0].pct : 0,
  );
  const simTone = (pct: number) =>
    pct === 0
      ? "text-emerald-400"
      : pct <= 20
        ? "text-amber-400"
        : "text-red-400";

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

    // Resolve structure early.
    // Templates render by iterating sections, so an EMPTY template_config paints a
    // header and nothing else — even when the set holds real questions. Some papers
    // were saved with `template_config: []`, which is truthy and slipped past the
    // old `!structure` check. Rebuild the sections from the saved questions so every
    // stored question is rendered.
    let structure = meta.template_config;
    if (Array.isArray(structure) && structure.length === 0) {
      structure = deriveStructureFromSet(rawSetsData.A) || null;
    }
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
      } else if (selectedTemplate === "malla") {
        structure = [
          {
            title: "PART-A (5*2=10 Marks) ANSWER ALL",
            marks_per_q: 2,
            count: 5,
            answered_count: 5,
            part: "A",
          },
          {
            title: "PART-B (5*3=15 Marks) ANSWER ALL",
            marks_per_q: 3,
            count: 5,
            answered_count: 5,
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
      } else if (selectedTemplate === "takshashila") {
        structure = [
          {
            title: "PART – A (5 X 2 = 10 Marks)",
            marks_per_q: 2,
            count: 5,
            answered_count: 5,
            part: "A",
          },
          {
            title: "PART – B (5 X 4 = 20 Marks)",
            marks_per_q: 4,
            count: 5,
            answered_count: 5,
            part: "B",
          },
          {
            title: "PART – C (2 X 10 = 20 Marks)",
            marks_per_q: 10,
            count: 2,
            answered_count: 2,
            part: "C",
          },
        ];
      } else if (selectedTemplate === "svyasa") {
        structure = [
          {
            title: "Answer all the questions",
            marks_per_q: 3,
            count: 10,
            answered_count: 10,
            part: "A",
          },
          {
            title: "Answer all the questions",
            marks_per_q: 14,
            count: 5,
            answered_count: 5,
            part: "B",
          },
        ];
      } else if (selectedTemplate === "amet") {
        structure = [
          {
            title: "Answer all the Questions",
            instructions:
              "(Multiple Choice Questions) (Lower / Intermediate cognitive type Questions)",
            marks_per_q: 1,
            count: 20,
            answered_count: 20,
            part: "A",
          },
          {
            title: "Answer all the Questions",
            instructions:
              "Detailed Answer Type Question (Either or choice) (Both subdivision to have same / Intermediate / Higher order cognitive type Questions)",
            marks_per_q: 14,
            count: 5,
            answered_count: 5,
            part: "B",
          },
          {
            title: "Answer the Question",
            instructions:
              "(Application / Analysis / Evaluation / Design / Creativity / Case Study Type Question)",
            marks_per_q: 10,
            count: 1,
            answered_count: 1,
            part: "C",
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

  // Exam-papers Drive sync state
  let driveConnected = $state(false);
  let driveEmail = $state<string | null>(null);
  let driveMsg = $state<{ text: string; ok: boolean } | null>(null);

  async function refreshDriveStatus() {
    try {
      const r = await fetch("/api/assessments/drive/status");
      if (r.ok) {
        const j = await r.json();
        driveConnected = !!j.connected;
        driveEmail = j.email ?? null;
      }
    } catch { /* ignore */ }
  }

  let driveStatusLoaded = false;
  $effect(() => {
    if (!driveStatusLoaded) { driveStatusLoaded = true; refreshDriveStatus(); }
  });

  // ── Approval workflow ──────────────────────────────────────────────
  let approvalStatus = $state<string>((data as any).paper?.approval_status || "draft");
  let approvalBusy = $state(false);
  const myRole = (data as any).role as string;
  const isReviewer = myRole === "SME" || myRole === "ADMIN" || myRole === "PROGRAM_OPS";
  const isSme = myRole === "SME";

  // Human label for the exam type (MID1 → "Mid 1", SEM → "Semester", …), used
  // in the "Approved for …" badge + banner.
  function examLabel(examType: string | null | undefined): string {
    const map: Record<string, string> = {
      MID1: "Mid 1", MID2: "Mid 2", SEM: "Semester",
      INTERNAL_LAB: "Internal Lab", EXTERNAL_LAB: "External Lab",
    };
    return map[String(examType || "").toUpperCase()] || String(examType || "Exam");
  }
  const examTypeLabel = examLabel((data as any).paper?.exam_type);
  const statusLabel = $derived(
    approvalStatus === "approved" ? `APPROVED · ${examTypeLabel.toUpperCase()}`
    : approvalStatus === "pending_review" ? "PENDING REVIEW"
    : "DRAFT",
  );

  async function sendForApproval() {
    approvalBusy = true;
    try {
      const r = await fetch(`/api/assessments/papers/${data.paper.id}/approval`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const d = await r.json();
      if (!r.ok) { driveMsg = { text: d.message || "Failed to send for approval", ok: false }; return; }
      approvalStatus = "pending_review";
      driveMsg = { text: `Sent for review — notified ${d.sme_count} ${d.scoped ? "subject SME(s)" : "SME(s)"}${d.emailed ? `, emailed ${d.emailed}` : ""}.`, ok: true };
    } catch (e: any) {
      driveMsg = { text: e?.message || "Failed to send for approval", ok: false };
    } finally { approvalBusy = false; }
  }

  async function reviewAction(action: "approve" | "request_changes") {
    approvalBusy = true;
    try {
      let note = "";
      if (action === "request_changes") note = window.prompt("What needs to change? (optional)") || "";
      const r = await fetch(`/api/assessments/papers/${data.paper.id}/approval`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const d = await r.json();
      if (!r.ok) { driveMsg = { text: d.message || "Failed", ok: false }; return; }
      approvalStatus = d.approval_status;
      driveMsg = { text: action === "approve" ? "Paper approved." : "Sent back for changes.", ok: true };
    } catch (e: any) {
      driveMsg = { text: e?.message || "Failed", ok: false };
    } finally { approvalBusy = false; }
  }

  // Client-side capture of the rendered paper → PDF (works for every paper
  // format, incl. the non-deterministic ones that only exist as browser HTML).
  const PAPER_EL_IDS = [
    "vgu-mid-paper-actual", "crescent-paper-actual", "generic-paper-actual",
    "svyasa-paper-actual", "amet-paper-actual", "annamacharya-paper-actual",
    "cdu-paper-actual", "adypu-sem-paper-actual",
  ];
  function getPaperEl(): HTMLElement | null {
    for (const id of PAPER_EL_IDS) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return document.getElementById("paper-content");
  }
  const settle = () =>
    new Promise((r) => requestAnimationFrame(() => setTimeout(() => r(null), 350)));

  // Render a DOM element to a multi-page A4 PDF, EXCLUDING UI controls
  // (anything marked no-print / a <button>) and breaking pages at question-row
  // boundaries so a question is never split across two pages.
  async function elementToPdfBlob(el: HTMLElement | null): Promise<Blob | null> {
    if (!el) return null;
    const { toCanvas } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");
    try { await (document as any).fonts?.ready; } catch { /* ignore */ }
    await settle();

    const filter = (node: any) => {
      if (!(node instanceof HTMLElement)) return true;
      const cls = typeof node.className === "string" ? node.className : "";
      if (/(^|\s)(no-print|no-print-force)(\s|$)/.test(cls) || cls.includes("print:hidden")) return false;
      if (node.tagName === "BUTTON") return false;
      return true;
    };
    const canvas = await toCanvas(el, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true, filter });
    const cw = canvas.width, ch = canvas.height;
    const rect = el.getBoundingClientRect();
    const ratio = ch / rect.height;              // canvas px per screen px
    const pageMaxPx = (297 / 210) * cw;          // A4 page height in canvas px

    // Break candidates = the bottom edge of each question row.
    const rows = Array.from(el.querySelectorAll("tr")) as HTMLElement[];
    let cands = rows
      .map((r) => Math.round((r.getBoundingClientRect().bottom - rect.top) * ratio))
      .filter((y) => y > 0 && y < ch);
    cands = Array.from(new Set(cands)).sort((a, b) => a - b);
    cands.push(ch);

    const slices: Array<[number, number]> = [];
    let start = 0;
    for (let i = 0; i < cands.length; i++) {
      if (cands[i] - start > pageMaxPx) {
        const prev = i > 0 ? cands[i - 1] : start;
        if (prev > start) { slices.push([start, prev]); start = prev; i--; }
        else { slices.push([start, start + pageMaxPx]); start += pageMaxPx; } // row taller than a page
      }
    }
    if (start < ch) slices.push([start, ch]);

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = 210;
    const tmp = document.createElement("canvas");
    const tctx = tmp.getContext("2d")!;
    slices.forEach(([y0, y1], i) => {
      const h = Math.max(1, y1 - y0);
      tmp.width = cw; tmp.height = h;
      tctx.fillStyle = "#ffffff"; tctx.fillRect(0, 0, cw, h);
      tctx.drawImage(canvas, 0, y0, cw, h, 0, 0, cw, h);
      const url = tmp.toDataURL("image/jpeg", 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(url, "JPEG", 0, 0, pageW, (h / cw) * pageW, undefined, "FAST");
    });
    return pdf.output("blob");
  }

  function findSolutionsToggle(): HTMLButtonElement | null {
    return (Array.from(document.querySelectorAll("button")).find((b) =>
      /solutions\s*mode/i.test(b.textContent || "")) as HTMLButtonElement) || null;
  }

  async function uploadOne(blob: Blob, kind: "paper" | "answer_key"): Promise<any> {
    const fd = new FormData();
    fd.set("file", blob, kind === "answer_key" ? "answer-key.pdf" : "paper.pdf");
    fd.set("set", activeSet);
    fd.set("kind", kind);
    const r = await fetch(`/api/assessments/papers/${data.paper.id}/drive-upload`, { method: "POST", body: fd });
    return r.json().catch(() => ({}));
  }

  async function uploadActiveSetToDrive(): Promise<{ ok: boolean; msg: string }> {
    try {
      const toggle = findSolutionsToggle();
      // 1) Paper (Solutions OFF) — ensure it's off first.
      if (toggle && /Solutions\s*Mode:\s*ON/i.test(toggle.textContent || "")) { toggle.click(); await settle(); }
      const paperBlob = await elementToPdfBlob(getPaperEl());
      if (!paperBlob) return { ok: false, msg: "Could not capture the paper to a PDF." };
      const d = await uploadOne(paperBlob, "paper");
      if (!d.ok) {
        const reasons: Record<string, string> = {
          not_connected: "Drive isn't connected — click Connect Drive.",
          no_university: "Paper has no university set, so it couldn't be routed to a folder.",
          paper_not_found: "Paper not found.",
        };
        return { ok: false, msg: reasons[d?.reason] || d?.message || "Drive upload failed." };
      }

      // 2) Answer key (Solutions ON), if this template supports it.
      let ansMsg = "";
      if (toggle) {
        toggle.click(); await settle();                         // turn ON
        const ansBlob = await elementToPdfBlob(getPaperEl());
        toggle.click(); await settle();                         // restore OFF
        if (ansBlob) {
          const da = await uploadOne(ansBlob, "answer_key");
          ansMsg = da.ok ? " + answer key" : " (answer key failed)";
        }
      } else {
        ansMsg = " (no answer-key mode for this template)";
      }
      return { ok: true, msg: `Saved to Drive → ${d.folder_path} (Set ${activeSet})${ansMsg}` };
    } catch (e: any) {
      return { ok: false, msg: e?.message || "Drive capture failed." };
    }
  }

  async function saveChanges(syncDrive = false) {
    isSaving = true;
    if (syncDrive) driveMsg = null;
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
        // On an explicit Save, capture the rendered paper to PDF in the browser
        // and upload it to Drive (before invalidateAll re-renders the DOM).
        if (syncDrive) {
          if (!driveConnected) {
            driveMsg = { text: "Saved. Drive isn't connected — click Connect Drive.", ok: false };
          } else {
            driveMsg = { text: "Uploading to Drive…", ok: true };
            const u = await uploadActiveSetToDrive();
            driveMsg = { text: u.ok ? u.msg : "Saved. " + u.msg, ok: u.ok };
          }
        }
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
      document.getElementById("vgu-mid-paper-actual") ||
      document.getElementById("crescent-paper-actual") ||
      document.getElementById("generic-paper-actual") ||
      document.getElementById("svyasa-paper-actual") ||
      document.getElementById("amet-paper-actual") ||
      document.getElementById("annamacharya-paper-actual") ||
      document.getElementById("cdu-paper-actual") ||
      document.getElementById("adypu-sem-paper-actual");

    if (!el) {
      const content = document.getElementById("paper-content")?.innerHTML;
      if (!content) return;
      printPaper(content);
      return;
    }

    // V101: Ensure relative image URLs work in about:blank print window
    const htmlWithAbsoluteUrls = el.outerHTML.replace(
      /src="\//g,
      `src="${window.location.origin}/`,
    );

    // Use outerHTML to preserve container styles (padding, etc.)
    printPaper(htmlWithAbsoluteUrls);
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
                    <base href="${window.location.origin}/">
                    ${styles}
                    <style>
                        * { box-sizing: border-box !important; }
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
                                align-items: flex-start !important;
                            }
                            #vgu-mid-paper-actual, #crescent-paper-actual, #generic-paper-actual, #svyasa-paper-actual, #cdu-paper-actual, #annamacharya-paper-actual, #adypu-sem-paper-actual, .paper-container {
                                width: 210mm !important; 
                                margin: 0 !important; 
                                border: none !important; 
                                box-sizing: border-box !important;
                                min-height: 297mm !important;
                                background: white !important;
                                box-shadow: none !important;
                                position: relative !important;
                                left: 0 !important;
                                top: 0 !important;
                                padding: 0.5in !important;
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
                        #vgu-mid-paper-actual, #crescent-paper-actual, #generic-paper-actual, #svyasa-paper-actual, #cdu-paper-actual, #annamacharya-paper-actual, #adypu-sem-paper-actual, .paper-container {
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
                            }, 2000);
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
    const slots = currentSet.questions || []; // Renamed to slots for clarity

    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      alert("Please allow popups to download the answer sheet");
      return;
    }

    let answersHtml = "";
    const romans = [
      "i",
      "ii",
      "iii",
      "iv",
      "v",
      "vi",
      "vii",
      "viii",
      "ix",
      "x",
    ];
    const getRoman = (idx: number) => romans[idx] || String(idx + 1);

    // Helper to find question from pool (as a fallback for answer_key)
    const findQInPool = (id: string) =>
      (data.questionPool || []).find((q: any) => q.id === id);

    const renderEntry = (q: any, label: string) => {
      const poolQ = findQInPool(q.question_id || q.id);
      const questionText =
        q.question_text ||
        q.text ||
        poolQ?.question_text ||
        poolQ?.text ||
        "No question text";
      // Priority: direct answer_key on q → pool answer_key → q.answer → pool.answer
      const ans =
        q.answer_key || poolQ?.answer_key || q.answer || poolQ?.answer || "";
      const options = q.options || poolQ?.options;
      const hasAnswer = !!ans;
      return `
        <div style="margin-bottom:20px;page-break-inside:avoid;border-bottom:1px solid #f0f0f0;padding-bottom:16px;">
          <div style="font-weight:800;font-size:11pt;color:#1e293b;margin-bottom:6px;">${label} ${questionText}</div>
          <div style="background:${hasAnswer ? "#f8fafc" : "#fff7ed"};border:1px solid ${hasAnswer ? "#e2e8f0" : "#fed7aa"};padding:12px;border-radius:8px;margin-top:6px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="background:${hasAnswer ? "#4338ca" : "#ea580c"};color:white;padding:2px 8px;border-radius:4px;font-size:8pt;font-weight:900;text-transform:uppercase;">${hasAnswer ? "Correct Solution" : "No Answer in Bank"}</span>
            </div>
            ${hasAnswer ? `<div style="font-size:10pt;line-height:1.6;color:#334155;font-family:'Segoe UI',system-ui;white-space:pre-wrap;">${ans}</div>` : `<div style="font-size:9pt;color:#9a3412;font-style:italic;">Answer not stored in question bank for this question.</div>`}
            ${
              options && Array.isArray(options) && options.length > 0
                ? `<div style="margin-top:8px;font-size:9pt;color:#64748b;border-top:1px dotted #cbd5e1;padding-top:6px;"><strong>Options:</strong> ${options.join(" | ")}</div>`
                : ""
            }
          </div>
        </div>`;
    };

    // Separate slots by part to render Part A first, then Part B, etc.
    const partA = slots.filter((s: any) => s.part === "A");
    const partB = slots.filter((s: any) => s.part === "B");
    const partC = slots.filter((s: any) => s.part === "C");
    const otherParts = slots.filter(
      (s: any) => !["A", "B", "C"].includes(s.part),
    );

    const renderPart = (
      partSlots: any[],
      partLabel: string,
      startNum: number,
    ) => {
      if (partSlots.length === 0) return { html: "", nextNum: startNum };
      let html = `<div style="margin:24px 0 12px;padding:8px 14px;background:#1e293b;color:white;font-weight:900;font-size:10pt;text-transform:uppercase;letter-spacing:0.08em;border-radius:6px;">PART ${partLabel}</div>`;
      let qNum = startNum;

      partSlots.forEach((slot: any) => {
        if (slot.type === "OR_GROUP") {
          const q1s = slot.choice1?.questions || [];
          const q2s = slot.choice2?.questions || [];
          // Choice A
          if (q1s.length > 0) {
            html += `<div style="font-weight:900;font-size:9pt;color:#4338ca;margin:12px 0 3px;text-transform:uppercase;letter-spacing:0.05em;">Q.${qNum} — Choice A</div>`;
            q1s.forEach((q: any, qi: number) => {
              const label =
                q1s.length > 1 ? `Q.${qNum}a.(${getRoman(qi)})` : `Q.${qNum}a.`;
              html += renderEntry(q, label);
            });
          }
          // Choice B (OR)
          if (q2s.length > 0) {
            html += `<div style="font-weight:900;font-size:9pt;color:#7c3aed;margin:12px 0 3px;text-transform:uppercase;letter-spacing:0.05em;">Q.${qNum} — Choice B (OR)</div>`;
            q2s.forEach((q: any, qi: number) => {
              const label =
                q2s.length > 1 ? `Q.${qNum}b.(${getRoman(qi)})` : `Q.${qNum}b.`;
              html += renderEntry(q, label);
            });
          }
          qNum++;
        } else {
          // Single slot — may have multiple sub-questions
          const qs = slot.questions?.length ? slot.questions : [slot];
          if (qs.length > 1) {
            html += `<div style="font-weight:900;font-size:9pt;color:#4338ca;margin:12px 0 3px;text-transform:uppercase;letter-spacing:0.05em;">Q.${qNum}</div>`;
            qs.forEach((q: any, qi: number) => {
              html += renderEntry(q, `Q.${qNum}.(${getRoman(qi)})`);
            });
          } else if (qs[0]) {
            html += renderEntry(qs[0], `Q.${qNum}.`);
          }
          qNum++;
        }
      });

      return { html, nextNum: qNum };
    };

    const resA = renderPart(partA, "A", 1);
    answersHtml += resA.html;
    const resB = renderPart(partB, "B", resA.nextNum);
    answersHtml += resB.html;
    const resC = renderPart(partC, "C", resB.nextNum);
    answersHtml += resC.html;
    if (otherParts.length > 0) {
      const resOther = renderPart(otherParts, "", resC.nextNum);
      answersHtml += resOther.html;
    }

    if (!answersHtml) {
      answersHtml = `<p style="color:#94a3b8;font-style:italic;text-align:center;padding:40px;">No questions found in this set.</p>`;
    }

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
          <div class="no-print" style="background:#fff7ed; border:1px solid #fed7aa; padding:12px; margin-bottom:20px; border-radius:8px; font-size:9pt; color:#9a3412;">
            <strong>Pro Tip:</strong> You can edit any text below directly. Click on a question or solution to change it before printing. 
            <em>(Note: Edits here are for this print only and won't be saved back to the database).</em>
            <button onclick="window.print()" style="margin-left:15px; background:#4338ca; color:white; border:none; padding:5px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">Print to PDF</button>
          </div>
          <div class="meta-grid">
             <div class="meta-item">
               <span class="meta-label">Subject & Course Code</span>
               <span class="meta-value" contenteditable="true">${meta.subject_name || "N/A"} (${meta.course_code || "N/A"})</span>
             </div>
             <div class="meta-item">
               <span class="meta-label">Set / Date</span>
               <span class="meta-value" contenteditable="true">SET ${activeSet} • ${meta.paper_date || new Date().toLocaleDateString()}</span>
             </div>
          </div>
          <div class="content" contenteditable="true" style="outline: none;">
             ${answersHtml}
          </div>
          <script>
            // No auto-print to allow editing
            console.log("Answer sheet ready for editing");
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

    <div class="flex flex-wrap items-center justify-end gap-2 gap-y-2 px-4">
      <!-- Set Selector -->
      <div
        class="flex items-center gap-1 bg-white/10 p-1.5 rounded-2xl mr-2 border border-white/5"
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

      <!-- Set similarity: how much overlap between any two sets -->
      {#if setPairs.length}
        <div class="relative mr-2">
          <button
            onclick={() => (showSimilarity = !showSimilarity)}
            title="How many questions the sets share"
            class="inline-flex items-center gap-2 px-4 py-3 bg-white/5 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-white/10 uppercase tracking-tight"
          >
            <span class="text-gray-400">Overlap</span>
            <span class={simTone(maxSimilarity)}>{maxSimilarity}%</span>
          </button>

          {#if showSimilarity}
            <div
              class="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-4 z-50"
            >
              <p
                class="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3"
              >
                Questions shared between sets
              </p>
              <div class="space-y-1.5">
                {#each setPairs as p}
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold text-gray-300"
                      >Set {p.a} ↔ Set {p.b}</span
                    >
                    <span class="flex items-center gap-2">
                      <span class="text-gray-500">{p.shared} shared</span>
                      <span class="font-black tabular-nums {simTone(p.pct)}"
                        >{p.pct}%</span
                      >
                    </span>
                  </div>
                {/each}
              </div>
              <p class="text-[9px] text-gray-500 mt-3 leading-relaxed">
                {maxSimilarity === 0
                  ? "No overlap — every set is unique."
                  : "Overlap means the bank was too thin to give each set its own question. Add more questions and regenerate."}
              </p>
            </div>
          {/if}
        </div>
      {/if}

      <a
        href="/assessments/generate"
        class="inline-flex items-center px-4 py-3 bg-white/5 text-indigo-400 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-indigo-500/30"
      >
        GENERATE NEW
      </a>

      <!-- Approval status + actions -->
      <span
        class="inline-flex items-center px-3 py-3 text-[10px] font-black rounded-xl border flex-shrink-0
          {approvalStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
           : approvalStatus === 'pending_review' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
           : 'bg-white/5 text-gray-400 border-white/10'}"
        title="Approval status"
      >{statusLabel}</span>

      {#if !isSme && approvalStatus !== 'pending_review'}
        <button
          onclick={sendForApproval}
          disabled={approvalBusy}
          class="inline-flex items-center px-4 py-3 bg-blue-600 text-white text-[10px] font-black rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex-shrink-0"
          title="Notify the SMEs to review this paper"
        >{approvalBusy ? "SENDING…" : "SEND FOR APPROVAL"}</button>
      {/if}

      {#if isReviewer && approvalStatus === 'pending_review'}
        <button
          onclick={() => reviewAction('approve')}
          disabled={approvalBusy}
          class="inline-flex items-center px-4 py-3 bg-emerald-600 text-white text-[10px] font-black rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 flex-shrink-0"
        >{approvalBusy ? "…" : "APPROVE"}</button>
        <button
          onclick={() => reviewAction('request_changes')}
          disabled={approvalBusy}
          class="inline-flex items-center px-4 py-3 bg-white/5 text-amber-300 text-[10px] font-black rounded-xl border border-amber-500/30 hover:bg-white/10 transition-all disabled:opacity-50 flex-shrink-0"
        >REQUEST CHANGES</button>
      {/if}

      {#if driveConnected}
        <span
          class="inline-flex items-center gap-1.5 px-3 py-3 bg-white/5 text-emerald-300 text-[10px] font-black rounded-xl border border-emerald-500/30 flex-shrink-0"
          title={`Exam papers auto-save to Google Drive as ${driveEmail ?? "connected account"}`}
        >☁ DRIVE ON</span>
      {:else}
        <a
          href="/api/assessments/drive/connect"
          class="inline-flex items-center px-3 py-3 bg-white/5 text-amber-300 text-[10px] font-black rounded-xl hover:bg-white/10 transition-all border border-amber-500/30 flex-shrink-0"
          title="Admin: connect the exam-papers Google Drive so Save also uploads the PDF"
        >☁ CONNECT DRIVE</a>
      {/if}

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
          <span class="tracking-widest uppercase"
            >{approvalStatus === "approved" ? "Save Changes" : "Save as Draft"}</span
          >
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
          <!-- Approval status — lives in this bar rather than as a full-width
               banner over the paper, which dominated the page. -->
          <div
            class="px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border
            {approvalStatus === 'approved'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : approvalStatus === 'pending_review'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-slate-500/10 text-slate-300 border-slate-500/30'}"
            title={approvalStatus === 'approved'
              ? 'This is the approved paper for this assessment'
              : approvalStatus === 'pending_review'
                ? 'Sent for approval — awaiting SME review'
                : 'Draft — not yet sent for approval'}
          >
            <div
              class="w-1.5 h-1.5 rounded-full {approvalStatus === 'approved'
                ? 'bg-emerald-400'
                : approvalStatus === 'pending_review'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-400'}"
            ></div>
            {approvalStatus === "approved"
              ? `Approved · ${examTypeLabel}`
              : approvalStatus === "pending_review"
                ? "Pending Review"
                : "Draft"}
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

        <TemplateCautionBanner {resolved} />

        <!-- The university's own MID/SEM template. One resolver decides which,
             so the viewer and the generate preview can never disagree. -->
        <PaperTemplate
          bind:paperMeta
          bind:currentSetData={editableSets[activeSet]}
          bind:paperStructure={paperMeta.template_config}
          {activeSet}
          courseOutcomes={data.courseOutcomes}
          questionPool={poolForActiveSet}
          mode="edit"
          onSwap={handleSetUpdate}
        />
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
            for="assessment-title"
            class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2"
            >Assessment Title (Internal Tracking)</label
          >
          <input
            id="assessment-title"
            type="text"
            bind:value={paperMeta.assessment_title}
            class="w-full bg-white/5 border border-white/10 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all px-5 py-4 text-white"
            placeholder="e.g. Mid Term Exam Nov 2025"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <label
              for="exam-type-select"
              class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2"
              >Exam Type</label
            >
            <select
              id="exam-type-select"
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
              {#if selectedTemplate === "vgu"}
                <option value="INTERNAL_LAB" class="bg-slate-900 text-white"
                  >INTERNAL LAB</option
                >
                <option value="EXTERNAL_LAB" class="bg-slate-900 text-white"
                  >EXTERNAL LAB</option
                >
              {/if}
            </select>
          </div>
          <div class="space-y-2">
            <label
              for="exam-date-input"
              class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2"
              >Exam Date</label
            >
            <input
              id="exam-date-input"
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
              await saveChanges(true);
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

{#if driveMsg}
  <div class="fixed bottom-6 right-6 z-[60] max-w-sm">
    <div
      class="flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-bold shadow-2xl backdrop-blur
             {driveMsg.ok ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100' : 'bg-amber-950/90 border-amber-500/40 text-amber-100'}"
    >
      <span class="text-base leading-none">{driveMsg.ok ? '☁' : 'ⓘ'}</span>
      <span class="flex-1 leading-snug">{driveMsg.text}</span>
      <button onclick={() => (driveMsg = null)} class="text-white/50 hover:text-white" aria-label="Dismiss">✕</button>
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
