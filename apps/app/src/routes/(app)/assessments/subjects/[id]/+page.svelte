<script lang="ts">
  import { page } from "$app/stores";
  import { slide, fade } from "svelte/transition";
  import { invalidateAll } from "$app/navigation";

  let { data } = $props();

  let expandedUnits = $state<string[]>([]);
  let unitTabs = $state<Record<string, "PORTION" | "QUESTIONS">>({});
  let newTopicNames = $state<Record<string, string>>({});

  function toggleUnit(unitId: string) {
    if (expandedUnits.includes(unitId)) {
      expandedUnits = expandedUnits.filter((id) => id !== unitId);
    } else {
      expandedUnits = [...expandedUnits, unitId];
    }
  }

  async function addUnit(unitNumber: number) {
    const res = await fetch("/api/assessments/units", {
      method: "POST",
      body: JSON.stringify({
        subject_id: data.subject.id,
        unit_number: unitNumber,
        name: `Unit ${unitNumber}`,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) invalidateAll();
  }

  async function deleteTopic(id: string) {
    if (!confirm("Are you sure you want to delete this topic?")) return;
    const res = await fetch(`/api/assessments/topics?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) invalidateAll();
  }

  async function deleteUnit(id: string) {
    if (
      !confirm("Are you sure you want to delete this unit and all its topics?")
    )
      return;
    const res = await fetch(`/api/assessments/units?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) invalidateAll();
  }

  async function addTopic(unitId: string) {
    const name = newTopicNames[unitId];
    if (!name) return;

    const res = await fetch("/api/assessments/topics", {
      method: "POST",
      body: JSON.stringify({ unit_id: unitId, name }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      newTopicNames[unitId] = "";
      invalidateAll();
    }
  }

  let fileInput: HTMLInputElement;
  let isUploading = $state(false);

  async function handleFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isUploading = true;
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/assessments/parse-pdf", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const { text } = await res.json();
        smartSyllabusText = text;
        showSmartParser = true;
      } else {
        const err = await res.json();
        alert(`Error: ${err.message || "Failed to parse file"}`);
      }
    } catch (err) {
      alert("Failed to parse file. Ensure it is a valid PDF.");
    } finally {
      isUploading = false;
      target.value = ""; // Reset input
    }
  }

  let qFileInput = $state<Record<string, HTMLInputElement>>({});
  let mcqFileInput = $state<Record<string, HTMLInputElement>>({});
  let isUploadingQuestions = $state<Record<string, boolean>>({});

  // Import Modal State
  let showImportModal = $state(false);
  let uploadFiles = $state<FileList | null>(null);
  let detectedSheets = $state<string[]>([]);
  let selectedSheet = $state("");
  let previewHeaders = $state<string[]>([]);
  let previewRows = $state<any[]>([]);
  let masterWorkbook: any = $state(null);
  let isExcelFile = $derived(
    uploadFiles &&
      uploadFiles.length > 0 &&
      (uploadFiles[0].name.toLowerCase().endsWith(".xlsx") ||
        uploadFiles[0].name.toLowerCase().endsWith(".xls")),
  );

  $effect(() => {
    if (uploadFiles && uploadFiles.length > 0) {
      if (isExcelFile) {
        loadWorkbook(uploadFiles[0]);
      } else {
        detectedSheets = [];
        masterWorkbook = null;
        previewHeaders = [];
        previewRows = [];
      }
    }
  });

  async function loadWorkbook(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/assessments/questions/analyze", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        detectedSheets = data.sheetNames;
        if (detectedSheets.length > 0) selectedSheet = detectedSheets[0];
        previewHeaders = data.headers;
        previewRows = data.previewRows;
      }
    } catch (err) {
      console.error("Analysis failed", err);
    }
  }

  async function updatePreview(workbook: any, sheetName: string) {
    if (!uploadFiles || uploadFiles.length === 0) return;
    const formData = new FormData();
    formData.append("file", uploadFiles[0]);
    formData.append("sheetName", sheetName);

    try {
      const res = await fetch("/api/assessments/questions/analyze", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        previewHeaders = data.headers;
        previewRows = data.previewRows;
      }
    } catch (err) {
      console.error("Preview update failed", err);
    }
  }

  async function confirmImport() {
    if (!uploadFiles || uploadFiles.length === 0) return;
    isUploadingQuestions["GLOBAL"] = true;
    const formData = new FormData();
    formData.append("file", uploadFiles[0]);
    formData.append("unitId", "GLOBAL");
    formData.append("subjectId", data.subject.id);
    if (selectedSheet) formData.append("sheetName", selectedSheet);

    try {
      const res = await fetch("/api/assessments/questions/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        alert(`Successfully imported ${result.count} questions!`);
        showImportModal = false;
        uploadFiles = null;
        detectedSheets = [];
        selectedSheet = "";
        previewHeaders = [];
        previewRows = [];
        masterWorkbook = null;
        await invalidateAll();
      } else {
        const err = await res.json();
        alert(`Error: ${err.message || "Upload failed"}`);
      }
    } catch (err) {
      alert("Upload failed. Please try again.");
    } finally {
      isUploadingQuestions["GLOBAL"] = false;
    }
  }

  async function handleQuestionUpload(
    unitId: string,
    event: Event,
    mode: "normal" | "mcq" = "normal",
  ) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isUploadingQuestions[unitId] = true;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("unitId", unitId);
    formData.append("subjectId", data.subject.id);
    formData.append("mode", mode);

    try {
      const res = await fetch("/api/assessments/questions/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        alert(`Successfully imported ${result.count} questions!`);
        await invalidateAll();
      } else {
        const err = await res.json();
        alert(`Error: ${err.message || "Failed to upload questions"}`);
      }
    } catch (err) {
      alert("Upload failed. Please try again.");
    } finally {
      isUploadingQuestions[unitId] = false;
      target.value = "";
    }
  }

  async function toggleImportant(qId: string, current: boolean) {
    const res = await fetch("/api/assessments/questions", {
      method: "PATCH",
      body: JSON.stringify({ id: qId, is_important: !current }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) invalidateAll();
  }

  let selectedQuestionIds = $state<string[]>([]);
  function toggleSelectAll(unitId: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const unitQs = getUnitQuestions(unitId).map((q) => q.id);
    if (checked) {
      selectedQuestionIds = [...new Set([...selectedQuestionIds, ...unitQs])];
    } else {
      selectedQuestionIds = selectedQuestionIds.filter(
        (id) => !unitQs.includes(id),
      );
    }
  }

  async function bulkDeleteQuestions() {
    if (
      !confirm(
        `Are you sure you want to delete ${selectedQuestionIds.length} questions?`,
      )
    )
      return;

    try {
      const results = await Promise.all(
        selectedQuestionIds.map((id) =>
          fetch(`/api/assessments/questions?id=${id}`, { method: "DELETE" }),
        ),
      );

      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        alert(
          `Warning: ${failed} deletions failed (likely because those questions are used in existing papers).`,
        );
      }
    } catch (err) {
      alert("Failed to delete some questions.");
    }

    selectedQuestionIds = [];
    invalidateAll();
  }

  async function deleteQuestion(qId: string) {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      const res = await fetch(`/api/assessments/questions?id=${qId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        invalidateAll();
      } else {
        const err = await res.json();
        alert(
          `Error: ${err.message || "Failed to delete. This question might be in use in a paper."}`,
        );
      }
    } catch (err) {
      alert("Failsafe: Network error during deletion.");
    }
  }

  let expandedQuestions = $state<string[]>([]);
  function toggleQuestion(qId: string) {
    if (expandedQuestions.includes(qId)) {
      expandedQuestions = expandedQuestions.filter((id) => id !== qId);
    } else {
      expandedQuestions = [...expandedQuestions, qId];
    }
  }

  let editingQuestion = $state<any>(null);
  let isSavingQuestion = $state(false);
  let activeEditor = $state<"question" | "answer" | null>(null);
  let qEditorEl = $state<HTMLDivElement | null>(null);
  let aEditorEl = $state<HTMLDivElement | null>(null);

  async function handlePaste(e: ClipboardEvent, type: "question" | "answer") {
    e.preventDefault();
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Try images first (take only the first one to avoid duplicates)
    const items = Array.from(clipboardData.items);
    const imageItem = items.find((item) => item.type.indexOf("image") !== -1);

    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imgHtml = `<img src="${event.target?.result}" class="max-w-full rounded-xl my-2 border border-blue-50/50 shadow-sm" style="display: block; margin: 0.5rem 0;" />`;
          document.execCommand("insertHTML", false, imgHtml);
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    // Try HTML (for tables and formatting)
    const html = clipboardData.getData("text/html");
    if (html) {
      document.execCommand("insertHTML", false, html);
      return;
    }

    // Fallback to plain text
    const text = clipboardData.getData("text/plain");
    if (text) {
      document.execCommand("insertText", false, text);
    }
  }

  async function saveQuestion() {
    if (!editingQuestion || isSavingQuestion) return;

    isSavingQuestion = true;
    try {
      const res = await fetch("/api/assessments/questions", {
        method: "PATCH",
        body: JSON.stringify(editingQuestion),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        editingQuestion = null;
        await invalidateAll();
      }
    } finally {
      isSavingQuestion = false;
    }
  }

  let showSmartParser = $state(false);
  let smartSyllabusText = $state("");
  let isImporting = $state(false);
  let syllabusFileInput = $state<HTMLInputElement | null>(null);

  async function handleSyllabusFileUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    isImporting = true;
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/assessments/parse-pdf", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const { text } = await res.json();
        smartSyllabusText = text;
      } else {
        const err = await res.json();
        alert(`Error: ${err.message || "Failed to parse file"}`);
      }
    } catch (err) {
      alert("Failed to parse file. Ensure it is a valid PDF/DOCX/XLSX.");
    } finally {
      isImporting = false;
      target.value = "";
    }
  }

  let showSettings = $state(false);
  let editedDifficultyLevels = $state<string[]>([]);

  // Tab control
  // Tab control
  let activeTab = $state<"SYLLABUS" | "CO" | "PRACTICALS" | "PAPERS">(
    "SYLLABUS",
  );

  // Course Outcomes state
  let courseOutcomes = $derived(data.courseOutcomes || []);
  let newCOCode = $state("");
  let newCODescription = $state("");
  let editingCOId = $state<string | null>(null);

  // Practicals state
  let practicals = $derived(data.practicals || []);
  let newPracticalName = $state("");
  let editingPracticalId = $state<string | null>(null);

  // Initialize difficulty levels from data
  $effect(() => {
    if (data.subject?.difficulty_levels) {
      editedDifficultyLevels = [...data.subject.difficulty_levels];
    } else {
      editedDifficultyLevels = ["L1", "L2", "L3"];
    }
  });

  async function saveCO() {
    if (!newCOCode || !newCODescription) return;
    const res = await fetch("/api/assessments/course-outcomes", {
      method: editingCOId ? "PATCH" : "POST",
      body: JSON.stringify({
        id: editingCOId,
        subject_id: data.subject.id,
        code: newCOCode,
        description: newCODescription,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      newCOCode = "";
      newCODescription = "";
      editingCOId = null;
      await invalidateAll();
    } else {
      const err = await res.json();
      alert(`Error saving Course Outcome: ${err.message || "Unknown error"}`);
    }
  }

  async function deleteCO(id: string) {
    if (!confirm("Are you sure? This will unlink this CO from any questions."))
      return;
    const res = await fetch(`/api/assessments/course-outcomes?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      invalidateAll();
    }
  }

  async function savePractical() {
    if (!newPracticalName) return;
    const res = await fetch("/api/assessments/practicals", {
      method: editingPracticalId ? "PATCH" : "POST",
      body: JSON.stringify({
        id: editingPracticalId,
        subject_id: data.subject.id,
        name: newPracticalName,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      newPracticalName = "";
      editingPracticalId = null;
      await invalidateAll();
    }
  }

  async function deletePractical(id: string) {
    if (!confirm("Are you sure?")) return;
    const res = await fetch(`/api/assessments/practicals?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) await invalidateAll();
  }

  async function deletePaper(id: string) {
    if (!confirm("Are you sure you want to delete this saved paper?")) return;
    const res = await fetch(`/api/assessments/papers/${id}`, {
      method: "DELETE",
    });
    if (res.ok) await invalidateAll();
  }

  function generateLevels(n: number) {
    if (!n || n < 1) return;
    editedDifficultyLevels = Array.from({ length: n }, (_, i) => `L${i + 1}`);
  }

  async function saveSettings() {
    if (editedDifficultyLevels.length === 0)
      return alert("At least one difficulty level is required.");

    const res = await fetch(`/api/assessments/subjects`, {
      method: "PATCH",
      body: JSON.stringify({
        id: data.subject.id,
        name: data.subject.name,
        difficulty_levels: editedDifficultyLevels.filter(
          (l) => l && l.trim().length > 0,
        ),
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      showSettings = false;
      await invalidateAll();
      alert(
        "Subject settings (Difficulty Levels) updated and saved successfully! 📏✅",
      );
    } else {
      const err = await res.json();
      alert(`Error saving settings: ${err.message || "Unknown error"}`);
    }
  }

  async function parseSmartSyllabus() {
    if (!smartSyllabusText || isImporting) return;

    isImporting = true;

    const text = smartSyllabusText;
    // Marker regex: stricter Unit/Module/Chapter detection
    // Anchored to start of line or followed by space/colon
    const markerRegex =
      /(?:^|\n)(?:Unit|Module|Chapter)[\s-]*(V|IV|III|II|I|1|2|3|4|5|One|Two|Three|Four|Five)[:\s]*([^\n]*)/gi;

    let modules: { num: number; name: string; content: string }[] = [];
    let match;
    let lastEnd = 0;
    let lastModule: any = null;

    const romanToNum: Record<string, number> = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };

    while ((match = markerRegex.exec(text)) !== null) {
      if (lastModule) {
        lastModule.content = text.substring(lastEnd, match.index).trim();
      }

      const val = match[1].toUpperCase();
      const num = romanToNum[val] || parseInt(val) || 0;
      const name = match[2].trim() || `Unit ${num}`;

      if (num >= 1 && num <= 8) {
        lastModule = { num, name, content: "" };
        modules.push(lastModule);
      }
      lastEnd = match.index + match[0].length;
    }

    if (lastModule) {
      let content = text.substring(lastEnd).trim();
      // Boundary detection: Stop parsing if we hit References, Textbooks, Practicals, etc.
      const boundaryMarkers = [
        /\n\s*(?:TEXT\s*BOOKS?|REFERENCES?|LIST\s*OF\s*EXPERIMENTS|PRACTICALS?|LAB|COURSE\s*OUTCOMES?|CO[1-9])[:\s]*/i,
        /\n\s*(?:L\s*T\s*P\s*C|Total\s*Hours|Credits)[:\s]*/i,
      ];

      let earliestBoundary = content.length;
      for (const marker of boundaryMarkers) {
        const bMatch = content.match(marker);
        if (
          bMatch &&
          bMatch.index !== undefined &&
          bMatch.index < earliestBoundary
        ) {
          earliestBoundary = bMatch.index;
        }
      }
      lastModule.content = content.substring(0, earliestBoundary).trim();
    }

    if (modules.length === 0) {
      alert(
        'No Unit/Module markers detected (e.g., "Module I" or "Unit 1"). Please ensure your text contains these markers (Units 1-5) and they start on new lines.',
      );
      isImporting = false;
      return;
    }

    for (const mod of modules) {
      // 1. Create/Ensure Unit exists
      let unit = data.units.find((u) => u.unit_number === mod.num);
      if (!unit) {
        const res = await fetch("/api/assessments/units", {
          method: "POST",
          body: JSON.stringify({
            subject_id: data.subject.id,
            unit_number: mod.num,
            name: mod.name,
          }),
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) unit = await res.json();
      }

      if (unit) {
        // 2. Add topics & sub-topics
        // Stricter filtering for noise (page numbers, Course Outcomes, etc.)
        const lines = mod.content
          .split(/[\n;]+|,\s*(?![^(]*\)|[a-z])/)
          .map((t) => t.trim())
          .filter((t) => {
            // Skip page numbers (e.g. "Page 5" or just "5" on its own line)
            if (t.match(/^(?:Page\s*)?\d+$/i)) return false;
            // Skip likely marker residuals
            if (t.match(/^(?:Unit|Module|Chapter)/i)) return false;
            // Skip likely Course Outcome blocks if they are inside unit content
            if (t.match(/^CO[1-9]/i)) return false;
            // Skip headers like "Course Outcomes:" or "SYLLABUS:"
            if (
              t.match(
                /^(?:Course\s*Outcomes|SYLLABUS|Course\s*Objectives)[:\s]*/i,
              )
            )
              return false;

            return t.length > 3;
          });

        for (const line of lines) {
          if (line.includes(":")) {
            const parts = line.split(":");
            const topicName = parts[0].trim();
            const subTopics = parts
              .slice(1)
              .join(":")
              .split(/[,]+/)
              .map((s) => s.trim())
              .filter((s) => s.length > 2);

            // Create parent topic
            const res = await fetch("/api/assessments/topics", {
              method: "POST",
              body: JSON.stringify({ unit_id: unit.id, name: topicName }),
              headers: { "Content-Type": "application/json" },
            });

            if (res.ok) {
              const parent = await res.json();
              for (const sub of subTopics) {
                await fetch("/api/assessments/topics", {
                  method: "POST",
                  body: JSON.stringify({
                    unit_id: unit.id,
                    name: sub,
                    parent_topic_id: parent.id,
                  }),
                  headers: { "Content-Type": "application/json" },
                });
              }
            }
          } else {
            await fetch("/api/assessments/topics", {
              method: "POST",
              body: JSON.stringify({ unit_id: unit.id, name: line }),
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    // 3. Extract Practicals / Experiments
    const practicalMarkers =
      /(?:LIST\s*OF\s*EXPERIMENTS|PRACTICALS?|LAB|LIST\s*OF\s*PRACTICALS|Practicals)[:\s]*([\s\S]*)/i;
    const practicalMatch = text.match(practicalMarkers);
    if (practicalMatch) {
      const practicalText = practicalMatch[1]
        .split(/(?:TEXT\s*BOOKS?|REFERENCES?|COURSE\s*OUTCOMES?|CO[1-9])/i)[0]
        .trim();
      const practicalLines = practicalText
        .split(/\n+/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 5);

      for (const line of practicalLines) {
        // Remove numbering (e.g. "1.", "1)")
        const cleanedName = line.replace(/^\d+[\.\)\s-]+/, "").trim();
        if (cleanedName) {
          await fetch("/api/assessments/practicals", {
            method: "POST",
            body: JSON.stringify({
              subject_id: data.subject.id,
              name: cleanedName,
            }),
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    // 4. Extract Course Outcomes (COs)
    const coMarkers = /(?:Course\s*Outcomes?|CO[1-9])[:\s]*([\s\S]*)/i;
    const coMatch = text.match(coMarkers);
    if (coMatch) {
      const coText = coMatch[1]
        .split(
          /(?:TEXT\s*BOOKS?|REFERENCES?|LIST\s*OF\s*EXPERIMENTS|PRACTICALS?|LAB)/i,
        )[0]
        .trim();
      const coLines = coText
        .split(/\n+/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 5);

      for (const line of coLines) {
        // Try to detect CO code like CO1, CO2
        const codeMatch = line.match(/^(CO[1-9])/i);
        const code = codeMatch
          ? codeMatch[1].toUpperCase()
          : `CO${data.courseOutcomes.length + 1}`;
        const desc = line.replace(/^(?:CO[1-9])[:\s-]*/i, "").trim();

        if (desc) {
          await fetch("/api/assessments/course-outcomes", {
            method: "POST",
            body: JSON.stringify({
              subject_id: data.subject.id,
              code,
              description: desc,
            }),
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    isImporting = false;
    showSmartParser = false;
    smartSyllabusText = "";
    await invalidateAll();
    alert("Syllabus and Course Outcomes imported successfully!");
  }

  // Helpers to get topics for a unit
  function getRootTopics(unitId: string) {
    return data.allTopics.filter(
      (t: any) => t.unit_id === unitId && !t.parent_topic_id,
    );
  }

  function getSubTopics(parentId: string) {
    return data.allTopics.filter((t: any) => t.parent_topic_id === parentId);
  }

  function getUnitQuestions(unitId: string) {
    return data.allQuestions.filter((q: any) => q.unit_id === unitId);
  }
</script>

<div class="space-y-8">
  <!-- Breadcrumbs & Header -->
  <div class="space-y-4">
    <div
      class="flex items-center gap-2 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest"
    >
      <a
        href="/assessments?universityId={data.subject.university_id}"
        class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >Assessments</a
      >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="3"
          d="M9 5l7 7-7 7"
        /></svg
      >
      <a
        href="/assessments?universityId={data.subject
          .university_id}&batchId={data.subject.batch_id}&branchId={data.subject
          .branch_id}"
        class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >{data.subject.branch_name}</a
      >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="3"
          d="M9 5l7 7-7 7"
        /></svg
      >
      <span class="text-indigo-600 dark:text-indigo-400">Syllabus</span>
    </div>

    <div
      class="flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div>
        <div class="flex items-center gap-4 mb-2">
          <a
            href="/assessments?universityId={data.subject
              .university_id}&batchId={data.subject.batch_id}&branchId={data
              .subject.branch_id}"
            class="inline-flex items-center gap-2 text-[9px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all uppercase tracking-widest border border-indigo-100 dark:border-indigo-800/50"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              /></svg
            >
            Back to Subjects
          </a>
        </div>
        <div class="flex items-center gap-3">
          <h1
            class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase"
          >
            {data.subject.name}
          </h1>
          <span
            class="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-lg border border-indigo-100 dark:border-indigo-800/50"
            >{data.subject.code || "CS-XXXX"}</span
          >
          <button
            onclick={() => (showSettings = true)}
            class="p-2 text-gray-300 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all"
            aria-label="Subject Settings"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              /><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              /></svg
            >
          </button>
        </div>
        <p
          class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
        >
          Syllabus Mapping & Topic Management • SEMESTER {data.subject.semester}
        </p>
      </div>

      <div class="flex gap-3">
        <button
          onclick={() => (showSmartParser = true)}
          class="inline-flex items-center px-4 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40 active:scale-95"
        >
          <svg
            class="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M12 4v16m8-8H4"
            /></svg
          >
          SMART PORTION
        </button>

        <button
          onclick={() => (showImportModal = true)}
          class="inline-flex items-center px-6 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40 active:scale-95 disabled:opacity-50"
        >
          <svg
            class="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            /></svg
          >
          IMPORT QUESTION BANK
        </button>
      </div>
    </div>
  </div>

  <div class="flex gap-4 border-b border-gray-100 dark:border-slate-800">
    <button
      onclick={() => (activeTab = "SYLLABUS")}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2
            {activeTab === 'SYLLABUS'
        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
        : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
      >Syllabus & Units</button
    >
    <button
      onclick={() => (activeTab = "PRACTICALS")}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2
            {activeTab === 'PRACTICALS'
        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
        : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
      >Practicals (Experiments)</button
    >
    <button
      onclick={() => (activeTab = "CO")}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2
            {activeTab === 'CO'
        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
        : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
      >Course Outcomes (CO)</button
    >
    <button
      onclick={() => (activeTab = "PAPERS")}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2
            {activeTab === 'PAPERS'
        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
        : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
      >Saved Papers</button
    >
  </div>

  {#if activeTab === "SYLLABUS"}
    <!-- Units Grid -->
    <div class="grid grid-cols-1 gap-6" in:fade>
      {#each [1, 2, 3, 4, 5] as unitNum}
        {@const unit = data.units.find((u) => u.unit_number === unitNum)}
        <div
          class="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden transition-all {unit &&
          expandedUnits.includes(unit.id)
            ? 'ring-2 ring-indigo-500/20'
            : ''}"
        >
          <div
            class="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-all"
            role="button"
            tabindex="0"
            onclick={() => unit && toggleUnit(unit.id)}
            onkeydown={(e) => e.key === "Enter" && unit && toggleUnit(unit.id)}
          >
            <div class="flex items-center gap-6">
              <div
                class="w-14 h-14 rounded-2xl {unit
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-300 dark:text-slate-600'} flex flex-col items-center justify-center shadow-lg shadow-indigo-100 dark:shadow-indigo-950 transition-all"
              >
                <span
                  class="text-[10px] font-black uppercase tracking-tighter opacity-70"
                  >Unit</span
                >
                <span class="text-xl font-black leading-none">{unitNum}</span>
              </div>
              <div>
                {#if unit}
                  <h3
                    class="text-lg font-black text-gray-900 dark:text-white leading-tight uppercase tracking-tight"
                  >
                    {unit.name || `Unit ${unitNum}`}
                  </h3>
                  <p
                    class="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mt-0.5"
                  >
                    {getRootTopics(unit.id).length} Primary Topics
                  </p>
                {:else}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      addUnit(unitNum);
                    }}
                    class="text-sm font-black text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors uppercase tracking-widest"
                    >+ Initialize unit structure</button
                  >
                {/if}
              </div>
            </div>

            <div class="flex items-center gap-4">
              {#if unit}
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    deleteUnit(unit.id);
                  }}
                  class="p-2 text-gray-300 dark:text-slate-700 hover:text-red-500 transition-all"
                  aria-label="Delete unit"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"
                    /></svg
                  >
                </button>
                <svg
                  class="w-5 h-5 text-gray-300 dark:text-slate-700 transition-transform {expandedUnits.includes(
                    unit.id,
                  )
                    ? 'rotate-180 text-indigo-500 dark:text-indigo-400'
                    : ''}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M19 9l-7 7-7-7"
                  /></svg
                >
              {/if}
            </div>
          </div>

          {#if unit && expandedUnits.includes(unit.id)}
            <div
              class="border-t border-gray-50 dark:border-slate-800 bg-gray-50/20 dark:bg-slate-900/20"
              transition:slide
            >
              <!-- Unit Sub-Tabs -->
              <div
                class="flex border-b border-gray-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 px-8"
              >
                <button
                  onclick={() => (unitTabs[unit.id] = "PORTION")}
                  class="px-6 py-3 text-[9px] font-black uppercase tracking-widest transition-all border-b-2
                                {unitTabs[unit.id] === 'PORTION' ||
                  !unitTabs[unit.id]
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
                  >Portion (Topics)</button
                >
                <button
                  onclick={() => (unitTabs[unit.id] = "QUESTIONS")}
                  class="px-6 py-3 text-[9px] font-black uppercase tracking-widest transition-all border-b-2
                                {unitTabs[unit.id] === 'QUESTIONS'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
                  >Question Bank</button
                >
              </div>

              <div class="p-8">
                {#if unitTabs[unit.id] === "PORTION" || !unitTabs[unit.id]}
                  <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    in:fade
                  >
                    {#each getRootTopics(unit.id) as topic}
                      {@const subs = getSubTopics(topic.id)}
                      <div
                        class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm group hover:border-indigo-200 dark:hover:border-indigo-500 transition-all flex flex-col justify-between h-full relative"
                      >
                        <div class="w-full">
                          <div class="flex justify-between items-start mb-3">
                            <h4
                              class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                            >
                              {topic.name}
                            </h4>
                            <button
                              onclick={() => deleteTopic(topic.id)}
                              class="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-300 dark:text-slate-600 hover:text-red-500"
                              aria-label="Delete topic"
                            >
                              <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2.5"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v2m3 4s.5 0 1 0m-4 0a1 1 0 110-2h4a1 1 0 110 2"
                                /></svg
                              >
                            </button>
                          </div>

                          {#if subs.length > 0}
                            <div
                              class="space-y-1.5 mb-4 pl-3 border-l-2 border-indigo-50 dark:border-indigo-900/30"
                            >
                              {#each subs as sub}
                                <div
                                  class="flex items-center justify-between group/sub"
                                >
                                  <span
                                    class="text-[9px] font-bold text-gray-500 dark:text-slate-400 uppercase flex items-center gap-1.5"
                                  >
                                    <span
                                      class="w-1 h-1 rounded-full bg-indigo-300 dark:bg-indigo-700"
                                    ></span>
                                    {sub.name}
                                  </span>
                                  <button
                                    onclick={() => deleteTopic(sub.id)}
                                    class="p-0.5 text-gray-200 dark:text-slate-700 hover:text-red-500 opacity-0 group-hover/sub:opacity-100 transition-opacity"
                                    aria-label="Delete sub-topic"
                                  >
                                    <svg
                                      class="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="3"
                                        d="M6 18L18 6M6 6l12 12"
                                      /></svg
                                    >
                                  </button>
                                </div>
                              {/each}
                            </div>
                          {/if}
                        </div>

                        <div
                          class="mt-4 border-t border-gray-50 dark:border-slate-800/50"
                        ></div>
                      </div>
                    {/each}

                    <div
                      class="bg-indigo-50/30 dark:bg-indigo-900/10 p-4 rounded-2xl border border-dashed border-indigo-200 dark:border-indigo-800/50 flex flex-col gap-3"
                    >
                      <input
                        type="text"
                        bind:value={newTopicNames[unit.id]}
                        placeholder="Topic/Concept Name"
                        class="w-full bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 rounded-xl text-[10px] font-bold focus:ring-2 focus:ring-indigo-500 py-2.5 text-gray-900 dark:text-white"
                      />
                      <button
                        onclick={() => addTopic(unit.id)}
                        class="w-full py-2 bg-indigo-600 text-white text-[9px] font-black rounded-lg hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-lg shadow-indigo-100 dark:shadow-indigo-950/40"
                        >ADD TOPIC</button
                      >
                    </div>
                  </div>
                {:else if unitTabs[unit.id] === "QUESTIONS"}
                  <div class="space-y-6" in:fade>
                    <div class="flex justify-between items-center">
                      {#if selectedQuestionIds.length > 0}
                        <div
                          class="flex items-center gap-4 bg-red-50 dark:bg-red-900/10 px-6 py-3 rounded-2xl border border-red-100 dark:border-red-900/30 animate-in fade-in slide-in-from-left-4 duration-300"
                        >
                          <span
                            class="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest"
                            >{selectedQuestionIds.length} SELECTED</span
                          >
                          <button
                            onclick={bulkDeleteQuestions}
                            class="bg-red-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 dark:shadow-red-950/40 flex items-center gap-2"
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              /></svg
                            >
                            DELETE SELECTED
                          </button>
                        </div>
                      {:else}
                        <div>
                          <h4
                            class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight"
                          >
                            Unit {unitNum} Question Bank
                          </h4>
                          <p
                            class="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-0.5"
                          >
                            {getUnitQuestions(unit.id).length} Questions available
                          </p>
                        </div>
                      {/if}
                      <div class="flex gap-3">
                        <!-- Unit-specific imports removed in favor of global import -->
                      </div>
                    </div>

                    <!-- Upload Guide -->
                    <div
                      class="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/50 rounded-2xl p-4 flex items-start gap-4"
                    >
                      <div
                        class="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0"
                      >
                        <svg
                          class="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          /></svg
                        >
                      </div>
                      <div>
                        <p
                          class="text-[10px] font-black text-amber-900 dark:text-amber-400 uppercase tracking-widest leading-tight"
                        >
                          Recognition Guide
                        </p>
                        <p
                          class="text-[9px] font-bold text-amber-700/70 dark:text-amber-500/70 mt-1"
                        >
                          To auto-detect types, use headers like <span
                            class="bg-white/50 dark:bg-slate-800 px-1 rounded"
                            >"MCQ QUESTIONS"</span
                          >,
                          <span
                            class="bg-white/50 dark:bg-slate-800 px-1 rounded"
                            >"SHORT QUESTIONS"</span
                          >
                          or
                          <span
                            class="bg-white/50 dark:bg-slate-800 px-1 rounded"
                            >"LONG QUESTIONS"</span
                          >
                          in your file. For MCQs, use
                          <span
                            class="bg-white/50 dark:bg-slate-800 px-1 rounded"
                            >(a), (b), (c), (d)</span
                          > on separate lines.
                        </p>
                      </div>
                    </div>

                    <div
                      class="overflow-hidden bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl shadow-sm"
                    >
                      <table class="w-full text-left border-collapse">
                        <thead class="bg-gray-50/50 dark:bg-slate-800/50">
                          <tr>
                            <th class="px-6 py-4 w-10">
                              <input
                                type="checkbox"
                                checked={getUnitQuestions(unit.id).every((q) =>
                                  selectedQuestionIds.includes(q.id),
                                ) && getUnitQuestions(unit.id).length > 0}
                                onchange={(e) => toggleSelectAll(unit.id, e)}
                                class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </th>
                            <th
                              class="px-6 py-4 text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest"
                              >Marks</th
                            >
                            <th
                              class="px-6 py-4 text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest"
                              >Question Details</th
                            >
                            <th
                              class="px-6 py-4 text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest text-center"
                              >CO</th
                            >
                            <th
                              class="px-6 py-4 text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest text-center"
                              >Level</th
                            >
                            <th
                              class="px-6 py-4 text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest text-center"
                              >Settings</th
                            >
                            <th
                              class="px-6 py-4 text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest text-right"
                              >Actions</th
                            >
                          </tr>
                        </thead>
                        <tbody
                          class="divide-y divide-gray-50 dark:divide-slate-800"
                        >
                          {#each getUnitQuestions(unit.id) as q}
                            <tr
                              class="group hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 transition-all cursor-pointer"
                              onclick={() => toggleQuestion(q.id)}
                            >
                              <td
                                class="px-6 py-4"
                                onclick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedQuestionIds.includes(q.id)}
                                  onchange={() => {
                                    if (selectedQuestionIds.includes(q.id))
                                      selectedQuestionIds =
                                        selectedQuestionIds.filter(
                                          (id) => id !== q.id,
                                        );
                                    else
                                      selectedQuestionIds = [
                                        ...selectedQuestionIds,
                                        q.id,
                                      ];
                                  }}
                                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </td>
                              <td class="px-6 py-4">
                                <span
                                  class="px-2 py-1 bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 text-[8px] font-black rounded-lg border border-gray-100 dark:border-slate-700 uppercase group-hover:bg-white dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:border-indigo-100 dark:group-hover:border-indigo-800/50 transition-all"
                                  >{q.marks}M</span
                                >
                              </td>
                              <td class="px-6 py-4">
                                <div class="flex flex-col gap-1.5">
                                  {#if q.image_url}
                                    <div class="mb-1">
                                      <img
                                        src={q.image_url}
                                        alt="Question Attachment"
                                        class="h-12 w-auto rounded-lg border border-gray-100 dark:border-slate-800 object-cover shadow-sm hover:scale-110 transition-transform cursor-zoom-in"
                                      />
                                    </div>
                                  {/if}
                                  <div
                                    class="text-[10px] font-bold text-gray-600 dark:text-slate-400 leading-relaxed group-hover:text-gray-900 dark:group-hover:text-slate-200 transition-colors line-clamp-2"
                                  >
                                    {@html q.question_text}
                                  </div>
                                  {#if q.type && q.type !== "NORMAL"}
                                    <div class="flex gap-2">
                                      <span
                                        class="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 text-[8px] font-black rounded uppercase border border-indigo-100/50 dark:border-indigo-800/50"
                                        >{q.type.replace(/_/g, " ")}</span
                                      >
                                    </div>
                                  {/if}
                                </div>
                              </td>
                              <td class="px-6 py-4 text-center">
                                <span
                                  class="text-[9px] font-black text-gray-300 dark:text-slate-700 uppercase tracking-widest group-hover:text-indigo-400 transition-colors"
                                  >{q.co_code || "-"}</span
                                >
                              </td>
                              <td class="px-6 py-4 text-center">
                                <span
                                  class="text-[9px] font-black text-gray-300 dark:text-slate-700 uppercase tracking-widest group-hover:text-amber-400 transition-colors"
                                  >{q.bloom_level || "-"}</span
                                >
                              </td>
                              <td class="px-6 py-4 text-center">
                                <button
                                  onclick={(e) => {
                                    e.stopPropagation();
                                    toggleImportant(q.id, q.is_important);
                                  }}
                                  class="p-2 transition-all {q.is_important
                                    ? 'text-amber-400'
                                    : 'text-gray-200 dark:text-slate-700 hover:text-gray-400 dark:hover:text-slate-500'}"
                                  title={q.is_important
                                    ? "Important Question"
                                    : "Mark as Important"}
                                >
                                  <svg
                                    class="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                                    /></svg
                                  >
                                </button>
                              </td>
                              <td class="px-6 py-4 text-right">
                                <div
                                  class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <button
                                    onclick={(e) => {
                                      e.stopPropagation();
                                      editingQuestion = { ...q };
                                    }}
                                    aria-label="Edit Question"
                                    class="p-2 text-gray-200 dark:text-slate-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
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
                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                      /></svg
                                    >
                                  </button>
                                  <button
                                    onclick={(e) => {
                                      e.stopPropagation();
                                      deleteQuestion(q.id);
                                    }}
                                    aria-label="Delete Question"
                                    class="p-2 text-gray-200 dark:text-slate-700 hover:text-red-400 dark:hover:text-red-500 transition-colors"
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
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      /></svg
                                    >
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {#if expandedQuestions.includes(q.id)}
                              <tr class="bg-indigo-50/50 dark:bg-indigo-900/10">
                                <td
                                  colspan="7"
                                  class="px-6 py-6 transition-all"
                                  transition:slide
                                >
                                  <div
                                    class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 shadow-sm"
                                  >
                                    <div
                                      class="flex justify-between items-center mb-4"
                                    >
                                      <h5
                                        class="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest"
                                      >
                                        Question Details & Solution
                                      </h5>
                                      <span
                                        class="text-[8px] font-bold text-gray-400 dark:text-slate-500 uppercase"
                                        >{q.type || "NORMAL"} • {q.marks} Marks •
                                        {q.co_code || "No CO"} • {q.bloom_level ||
                                          "No Level"}</span
                                      >
                                    </div>

                                    <div class="space-y-4">
                                      {#if q.type === "MCQ" && q.options && q.options.length > 0}
                                        <div
                                          class="grid grid-cols-2 gap-3 mb-6"
                                        >
                                          {#each q.options as opt}
                                            <div
                                              class="px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-bold text-gray-600 dark:text-slate-300"
                                            >
                                              {opt}
                                            </div>
                                          {/each}
                                        </div>
                                      {/if}

                                      <div
                                        class="bg-gray-50/50 dark:bg-slate-800/50 p-4 rounded-xl border border-dashed border-gray-200 dark:border-slate-700"
                                      >
                                        <div
                                          class="text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2"
                                        >
                                          Answer Key:
                                        </div>
                                        {#if q.answer_key}
                                          <div
                                            class="text-[10px] text-gray-700 dark:text-slate-300 leading-relaxed font-medium rich-preview"
                                          >
                                            {@html q.answer_key}
                                          </div>
                                        {:else}
                                          <div
                                            class="text-[9px] font-bold text-gray-400 dark:text-slate-700 italic"
                                          >
                                            No solution provided.
                                          </div>
                                        {/if}
                                      </div>
                                      <p
                                        class="text-[8px] font-bold text-gray-300 dark:text-slate-700 uppercase mt-2"
                                      >
                                        Extended technical schema metadata
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            {/if}
                          {:else}
                            <tr>
                              <td
                                colspan="7"
                                class="px-6 py-12 text-center text-[10px] font-black text-gray-300 dark:text-slate-700 uppercase tracking-widest"
                              >
                                No questions uploaded for this unit yet
                              </td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if activeTab === "PRACTICALS"}
    <!-- Practicals Tab -->
    <div class="space-y-6" in:fade>
      <div
        class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xl shadow-indigo-500/5 dark:shadow-indigo-950/20 space-y-6"
      >
        <div>
          <h3
            class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight"
          >
            List of Experiments / Practicals
          </h3>
          <p
            class="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-1"
          >
            Manage lab experiments for {data.subject.name}
          </p>
        </div>

        <div
          class="flex gap-4 bg-gray-50/50 dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 items-center"
        >
          <input
            type="text"
            bind:value={newPracticalName}
            placeholder="e.g. Study of Logic Gates"
            class="flex-1 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold text-gray-900 dark:text-white"
            onkeydown={(e) => e.key === "Enter" && savePractical()}
          />
          <button
            onclick={savePractical}
            class="bg-indigo-600 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-indigo-950/40"
          >
            {editingPracticalId ? "Update" : "Add Practical"}
          </button>
          {#if editingPracticalId}
            <button
              onclick={() => {
                editingPracticalId = null;
                newPracticalName = "";
              }}
              class="text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-widest hover:underline"
              >Cancel</button
            >
          {/if}
        </div>

        <div class="divide-y divide-gray-50 dark:divide-slate-800">
          {#each practicals as practical, i}
            <div
              class="flex items-center justify-between py-4 group hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10 px-4 rounded-xl transition-all"
            >
              <div class="flex items-center gap-6">
                <span
                  class="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black border border-indigo-100 dark:border-indigo-800/50"
                  >{i + 1}</span
                >
                <p
                  class="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-tight"
                >
                  {practical.name}
                </p>
              </div>
              <div
                class="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  onclick={() => {
                    editingPracticalId = practical.id;
                    newPracticalName = practical.name;
                  }}
                  class="p-2 text-gray-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  aria-label="Edit Practical"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    /></svg
                  >
                </button>
                <button
                  onclick={() => deletePractical(practical.id)}
                  class="p-2 text-gray-400 dark:text-slate-600 hover:text-red-500 transition-colors"
                  aria-label="Delete Practical"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    /></svg
                  >
                </button>
              </div>
            </div>
          {:else}
            <div class="text-center py-12">
              <p
                class="text-[10px] font-black text-gray-400 dark:text-slate-600 uppercase tracking-widest"
              >
                No Practicals Added Yet
              </p>
              <p
                class="text-[9px] text-gray-400 dark:text-slate-700 italic mt-1"
              >
                Use 'Smart Portion Import' to automatically detect experiments
              </p>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if activeTab === "CO"}
    <!-- Course Outcomes Tab -->
    <div class="space-y-6" in:fade>
      <div
        class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xl shadow-indigo-500/5 dark:shadow-indigo-950/20 space-y-6"
      >
        <div class="flex justify-between items-center">
          <div>
            <h3
              class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight"
            >
              Manage Course Outcomes
            </h3>
            <p
              class="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-1"
            >
              Define the learning objectives for {data.subject.name}
            </p>
          </div>
        </div>

        <div
          class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-gray-50/50 dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700"
        >
          <div class="space-y-2">
            <label
              for="co-code"
              class="text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest ml-1"
              >CO Code</label
            >
            <input
              id="co-code"
              type="text"
              bind:value={newCOCode}
              placeholder="CO1"
              class="w-full bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs font-black uppercase text-gray-900 dark:text-white"
            />
          </div>
          <div class="md:col-span-2 space-y-2">
            <label
              for="co-desc"
              class="text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest ml-1"
              >Description / mapping</label
            >
            <input
              id="co-desc"
              type="text"
              bind:value={newCODescription}
              placeholder="Master modern JavaScript concepts..."
              class="w-full bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium text-gray-900 dark:text-white"
            />
          </div>
          <button
            onclick={saveCO}
            class="bg-indigo-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 dark:shadow-indigo-950/40"
          >
            {editingCOId ? "Update CO" : "Add Outcome"}
          </button>
          {#if editingCOId}
            <button
              onclick={() => {
                editingCOId = null;
                newCOCode = "";
                newCODescription = "";
              }}
              class="text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-widest hover:underline mt-2"
              >Discard Edits</button
            >
          {/if}
        </div>

        <div class="space-y-3">
          {#each courseOutcomes as co}
            <div
              class="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl group hover:border-indigo-200 dark:hover:border-indigo-500 transition-all"
            >
              <div class="flex items-center gap-6">
                <span
                  class="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black border border-indigo-100 dark:border-indigo-800/50 uppercase"
                  >{co.code}</span
                >
                <p
                  class="text-xs font-semibold text-gray-600 dark:text-slate-400"
                >
                  {co.description}
                </p>
              </div>
              <div
                class="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  onclick={() => {
                    editingCOId = co.id;
                    newCOCode = co.code;
                    newCODescription = co.description;
                  }}
                  class="p-2 text-gray-400 dark:text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  title="Edit CO"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    /></svg
                  >
                </button>
                <button
                  onclick={() => deleteCO(co.id)}
                  class="p-2 text-gray-400 dark:text-slate-600 hover:text-red-500 transition-colors"
                  title="Delete CO"
                >
                  <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    /></svg
                  >
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else if activeTab === "PAPERS"}
    <!-- Saved Papers Tab -->
    <div class="space-y-6" in:fade>
      <div
        class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xl shadow-indigo-500/5 dark:shadow-indigo-950/20 space-y-6"
      >
        <div class="flex justify-between items-center">
          <div>
            <h3
              class="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight"
            >
              Saved Assessment Papers
            </h3>
            <p
              class="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-1"
            >
              Easily retrieve previously generated and saved papers
            </p>
          </div>
          <a
            href="/assessments/generate?subjectId={data.subject
              .id}&universityId={data.subject.university_id}&branchId={data
              .subject.branch_id}&batchId={data.subject.batch_id}"
            class="inline-flex items-center px-6 py-3 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            <svg
              class="w-4 h-4 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M12 4v16m8-8H4"
              /></svg
            >
            New Paper
          </a>
        </div>

        {#if data.papers && data.papers.length > 0}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each data.papers as paper}
              <div
                class="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all group flex flex-col"
              >
                <div class="p-8 space-y-6 flex-1">
                  <div class="flex justify-between items-start">
                    <div
                      class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm border border-indigo-100 dark:border-indigo-800/50 group-hover:scale-110 transition-transform"
                    >
                      {paper.exam_type?.substring(0, 3) || "MID"}
                    </div>
                    <div class="text-right">
                      <p
                        class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest"
                      >
                        {paper.exam_type || "ASSESSMENT"}
                      </p>
                      <p
                        class="text-[9px] font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-tighter"
                      >
                        {new Date(paper.paper_date).toLocaleDateString(
                          "en-US",
                          { day: "2-digit", month: "short", year: "numeric" },
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4
                      class="text-base font-black text-gray-900 dark:text-white leading-tight uppercase tracking-tight line-clamp-2"
                    >
                      {paper.title || "Untitled Assessment"}
                    </h4>
                    <p
                      class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-2"
                    >
                      {paper.max_marks} Marks • Generated {new Date(
                        paper.created_at,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div
                  class="p-6 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-4"
                >
                  <a
                    href="/assessments/papers/{paper.id}"
                    class="flex-1 py-3.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-700 text-center transition-all shadow-lg shadow-indigo-100 dark:shadow-indigo-950/40"
                    >View Paper</a
                  >
                  <button
                    onclick={() => deletePaper(paper.id)}
                    class="p-3.5 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-600 border border-gray-200 dark:border-slate-800 rounded-2xl hover:text-red-500 hover:border-red-500 transition-all"
                    aria-label="Delete saved paper"
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      /></svg
                    >
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div
            class="py-24 text-center space-y-6 bg-gray-50/50 dark:bg-slate-800/30 rounded-[3rem] border border-dashed border-gray-200 dark:border-slate-800"
          >
            <div
              class="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto shadow-sm text-gray-200 scale-110"
            >
              <svg
                class="w-10 h-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                /></svg
              >
            </div>
            <div class="space-y-1">
              <p
                class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest"
              >
                No Saved Papers
              </p>
              <p
                class="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]"
              >
                Generate and save papers to see them here
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

{#if showSmartParser}
  <div
    class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    transition:fade
  >
    <div
      class="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300 border border-white dark:border-slate-800"
      transition:slide
    >
      <div
        class="p-8 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-indigo-50/30 dark:bg-indigo-900/10"
      >
        <div>
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white leading-tight"
          >
            Smart Syllabus Import
          </h2>
          <p
            class="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mt-1"
          >
            AI-Powered Portion Detection
          </p>
        </div>
        <button
          onclick={() => (showSmartParser = false)}
          class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-400 dark:text-slate-600 hover:text-gray-900 dark:hover:text-white"
          aria-label="Close"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M6 18L18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>

      <div class="p-8 space-y-6">
        <div class="space-y-3">
          <p
            class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"
            ></span>
            Instructions
          </p>
          <div
            class="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 text-[11px] font-bold text-gray-600 dark:text-slate-400 border border-gray-100 dark:border-slate-800 leading-relaxed"
          >
            Paste your syllabus/portion below. The system will automatically
            detect <span
              class="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-1.5 rounded"
              >Unit 1-5</span
            >
            or
            <span
              class="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-1.5 rounded"
              >Module 1-5</span
            > markers and create topics for you. Use new lines or semicolons to separate
            topics within a unit.
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <label
              for="syllabusText"
              class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest ml-1"
              >Syllabus Text Chunk</label
            >
            <div class="flex gap-2">
              <input
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls"
                class="hidden"
                bind:this={syllabusFileInput}
                onchange={handleSyllabusFileUpload}
              />
              <button
                onclick={() => syllabusFileInput?.click()}
                disabled={isImporting}
                class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-800/50 rounded-xl text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase flex items-center gap-2 hover:bg-indigo-50 transition-all shadow-sm"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  /></svg
                >
                LOAD PORTION FILE
              </button>
            </div>
          </div>
          <textarea
            id="syllabusText"
            bind:value={smartSyllabusText}
            placeholder="e.g. Unit 1: Introduction to Web Design, HTML5 basics, CSS3 fundamentals...&#10;Unit 2: JavaScript basics, DOM manipulation..."
            class="w-full h-64 bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-3xl p-6 text-xs font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 shadow-inner resize-none transition-all text-gray-900 dark:text-white"
          ></textarea>
        </div>

        <div class="flex gap-4">
          <button
            onclick={() => (showSmartParser = false)}
            class="flex-1 py-4 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-xs font-black rounded-2xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-all uppercase tracking-widest"
            >CANCEL</button
          >
          <button
            onclick={parseSmartSyllabus}
            disabled={isImporting}
            class="flex-[2] py-4 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40 uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isImporting}
              <div
                class="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              ></div>
              IMPORTING PORTION...
            {:else}
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                /></svg
              >
              DETECTION & IMPORT
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showSettings}
  <div
    class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    transition:fade
  >
    <div
      class="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300 border border-white dark:border-slate-800"
      transition:slide
    >
      <div
        class="p-8 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-indigo-50/30 dark:bg-indigo-900/10"
      >
        <div>
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white leading-tight"
          >
            Subject Settings
          </h2>
          <p
            class="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mt-1"
          >
            Difficulty & Content Configuration
          </p>
        </div>
        <button
          onclick={() => (showSettings = false)}
          class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-400 dark:text-slate-600 hover:text-gray-900 dark:hover:text-white"
          aria-label="Close"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="3"
              d="M6 18L18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>

      <div class="p-8 space-y-6">
        <!-- Difficulty Levels -->
        <div class="space-y-4">
          <div
            class="bg-indigo-50/50 dark:bg-indigo-900/30 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-between gap-6"
          >
            <div class="flex-1">
              <label
                for="level-gen"
                class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-1"
                >Quick Generate Levels</label
              >
              <p class="text-[9px] text-indigo-400 dark:text-indigo-500 italic">
                Enter a number (e.g. 5) to auto-create L1 to L5
              </p>
            </div>
            <select
              id="level-gen"
              onchange={(e) => generateLevels(parseInt(e.currentTarget.value))}
              class="w-32 bg-white dark:bg-slate-800 border-indigo-100 dark:border-indigo-800/50 rounded-xl p-3 text-xs font-black focus:ring-2 focus:ring-indigo-500 shadow-sm appearance-none text-gray-900 dark:text-white"
            >
              <option value="" class="dark:bg-slate-800">Select</option>
              <option value="1" class="dark:bg-slate-800">1 Level</option>
              <option value="2" class="dark:bg-slate-800">2 Levels</option>
              <option value="3" class="dark:bg-slate-800">3 Levels</option>
              <option value="4" class="dark:bg-slate-800">4 Levels</option>
              <option value="5" class="dark:bg-slate-800">5 Levels</option>
            </select>
          </div>

          <div>
            <span
              class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
              >Configurable Difficulty Levels</span
            >
            <p
              class="text-[9px] text-gray-400 dark:text-slate-600 ml-1 mb-3 italic"
            >
              Define the Bloom's Taxonomy or difficulty levels (e.g., L1, L2,
              L3, Advanced)
            </p>

            <div class="flex flex-wrap gap-2 mb-4">
              {#each editedDifficultyLevels as level, i}
                <div
                  class="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-800/50"
                >
                  <input
                    type="text"
                    bind:value={editedDifficultyLevels[i]}
                    class="bg-transparent border-none p-0 text-xs font-black text-indigo-600 dark:text-indigo-400 focus:ring-0 w-20"
                  />
                  <button
                    onclick={() =>
                      (editedDifficultyLevels = editedDifficultyLevels.filter(
                        (_, idx) => idx !== i,
                      ))}
                    class="p-0.5 text-indigo-300 dark:text-indigo-700 hover:text-red-500 transition-colors"
                    title="Remove Level"
                  >
                    <svg
                      class="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="3"
                        d="M6 18L18 6M6 6l12 12"
                      /></svg
                    >
                  </button>
                </div>
              {/each}

              <button
                onclick={() =>
                  (editedDifficultyLevels = [...editedDifficultyLevels, ""])}
                class="px-3 py-1.5 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl text-[10px] font-black text-gray-400 dark:text-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-indigo-300 transition-all"
                >+ ADD LEVEL</button
              >
            </div>
          </div>
        </div>

        <div
          class="pt-6 border-t border-gray-50 dark:border-slate-800 flex justify-end gap-3"
        >
          <button
            onclick={() => (showSettings = false)}
            class="px-8 py-3 bg-white dark:bg-slate-900 text-gray-400 text-sm font-black rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
            >CANCEL</button
          >
          <button
            onclick={saveSettings}
            class="px-8 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40"
            >SAVE SETTINGS</button
          >
        </div>
      </div>
    </div>
  </div>
{/if}

{#if editingQuestion}
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    transition:fade
  >
    <div
      class="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-white dark:border-slate-800"
      transition:slide
    >
      <div
        class="p-8 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-800/50"
      >
        <div>
          <h3
            class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight"
          >
            Edit Question
          </h3>
          <p
            class="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-0.5"
          >
            Modify question details and answer
          </p>
        </div>
        <button
          onclick={() => (editingQuestion = null)}
          class="p-2 text-gray-400 dark:text-slate-600 hover:text-gray-600 dark:hover:text-white"
          aria-label="Close Edit Modal"
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
              d="M6 18L18 6M6 6l12 12"
            /></svg
          >
        </button>
      </div>

      <div class="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
        <div
          class="bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 flex gap-2 sticky top-0 z-10 backdrop-blur-sm"
        >
          <button
            onmousedown={(e) => {
              e.preventDefault();
              document.execCommand("bold", false);
            }}
            aria-label="Bold"
            title="Bold"
            class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[9px] font-black text-gray-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white transition-all uppercase shadow-sm"
            >Bold</button
          >
          <button
            onmousedown={(e) => {
              e.preventDefault();
              document.execCommand("insertUnorderedList", false);
            }}
            aria-label="List"
            title="List"
            class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[9px] font-black text-gray-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white transition-all uppercase shadow-sm"
            >List</button
          >
          <button
            onmousedown={(e) => {
              e.preventDefault();
              const rows = prompt("Number of rows?", "2");
              const cols = prompt("Number of columns?", "2");
              if (rows && cols) {
                let table =
                  '<table style="width:100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin: 1rem 0;">';
                for (let r = 0; r < parseInt(rows); r++) {
                  table += "<tr>";
                  for (let c = 0; c < parseInt(cols); c++) {
                    table +=
                      '<td style="border: 1px solid #e5e7eb; padding: 0.5rem; font-size: 10px; min-width: 50px;">Cell</td>';
                  }
                  table += "</tr>";
                }
                table += "</table>";
                document.execCommand("insertHTML", false, table);
              }
            }}
            aria-label="Insert Table"
            title="Insert Table"
            class="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[9px] font-black text-gray-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white transition-all uppercase shadow-sm"
            >Table+</button
          >
        </div>

        <div class="grid grid-cols-3 gap-6">
          <div>
            <label
              for="eq-marks"
              class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
              >Marks</label
            >
            <input
              id="eq-marks"
              type="number"
              bind:value={editingQuestion.marks}
              class="w-full bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-bold py-3 px-4 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label
              for="eq-co"
              class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
              >CO Code</label
            >
            <select
              id="eq-co"
              bind:value={editingQuestion.co_id}
              class="w-full bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-bold py-3 px-4 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-white"
            >
              <option value={null} class="dark:bg-slate-800">None</option>
              {#each data.courseOutcomes as co}
                <option value={co.id} class="dark:bg-slate-800"
                  >{co.code}</option
                >
              {/each}
              {#if data.courseOutcomes.length === 0}
                <option disabled>No COs defined</option>
              {/if}
            </select>
          </div>
          <div>
            <label
              for="eq-level"
              class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
              >Level</label
            >
            <select
              id="eq-level"
              bind:value={editingQuestion.bloom_level}
              class="w-full bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-bold py-3 px-4 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-white"
            >
              <option value="L1" class="dark:bg-slate-800">L1 - Remember</option
              >
              <option value="L2" class="dark:bg-slate-800"
                >L2 - Understand</option
              >
              <option value="L3" class="dark:bg-slate-800">L3 - Apply</option>
              <option value="L4" class="dark:bg-slate-800">L4 - Analysis</option
              >
            </select>
          </div>
          <div>
            <label
              for="eq-category"
              class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
              >Category</label
            >
            <select
              id="eq-category"
              bind:value={editingQuestion.type}
              class="w-full bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-bold py-3 px-4 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-white"
            >
              <option value="NORMAL" class="dark:bg-slate-800">Normal</option>
              <option value="VERY_SHORT" class="dark:bg-slate-800"
                >Very Short</option
              >
              <option value="SHORT" class="dark:bg-slate-800">Short</option>
              <option value="LONG" class="dark:bg-slate-800">Long</option>
              <option value="VERY_LONG" class="dark:bg-slate-800"
                >Very Long</option
              >
              <option value="MCQ" class="dark:bg-slate-800">MCQ</option>
              <option value="FILL_IN_BLANK" class="dark:bg-slate-800"
                >Fill in the Blank</option
              >
              <option value="PARAGRAPH" class="dark:bg-slate-800"
                >Paragraph</option
              >
            </select>
          </div>
        </div>

        <div>
          <label
            for="eq-image"
            class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
            >Image URL / Base64</label
          >
          <input
            id="eq-image"
            type="text"
            bind:value={editingQuestion.image_url}
            placeholder="data:image/png;base64,..."
            class="w-full bg-gray-50 dark:bg-slate-800 border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-bold py-3 px-4 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-white"
          />
          {#if editingQuestion.image_url}
            <div class="mt-3">
              <img
                src={editingQuestion.image_url}
                alt="Preview"
                class="max-h-32 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm"
              />
              <button
                onclick={() => (editingQuestion.image_url = null)}
                class="text-[8px] font-black text-red-500 uppercase mt-2 hover:underline"
                >Remove Image</button
              >
            </div>
          {/if}
        </div>

        {#if editingQuestion.type === "MCQ"}
          <div
            class="space-y-4 p-6 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-800/50"
          >
            <div class="flex justify-between items-center">
              <span
                class="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest"
                >MCQ Options</span
              >
              <button
                type="button"
                onclick={() =>
                  (editingQuestion.options = [...editingQuestion.options, ""])}
                class="px-2 py-1 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-800/50 rounded-lg text-[8px] font-black text-indigo-600 dark:text-indigo-400 uppercase"
                >+ Option</button
              >
            </div>
            <div class="grid grid-cols-1 gap-3">
              {#each editingQuestion.options || [] as opt, idx}
                <div class="flex gap-2">
                  <input
                    id="mcq-opt-{idx}"
                    type="text"
                    bind:value={editingQuestion.options[idx]}
                    class="flex-1 bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-xl text-[10px] font-bold py-2.5 px-4 focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-white"
                  />
                  <button
                    onclick={() =>
                      (editingQuestion.options = editingQuestion.options.filter(
                        (_: any, i: number) => i !== idx,
                      ))}
                    aria-label="Remove Option"
                    class="p-2 text-gray-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M6 18L18 6M6 6l12 12"
                      /></svg
                    >
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div>
          <label
            for="q-editor"
            class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
            >Question Text</label
          >
          <div
            id="q-editor"
            bind:this={qEditorEl}
            bind:innerHTML={editingQuestion.question_text}
            contenteditable="true"
            onfocus={() => (activeEditor = "question")}
            onpaste={(e) => handlePaste(e, "question")}
            role="textbox"
            tabindex="0"
            aria-multiline="true"
            class="w-full bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-medium py-3 px-4 leading-relaxed focus:ring-2 focus:ring-indigo-500/20 min-h-[100px] outline-none overflow-y-auto rich-editor text-gray-900 dark:text-white"
          ></div>
        </div>

        <div>
          <label
            for="a-editor"
            class="block text-[9px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-indigo-400 dark:text-indigo-500"
            >Answer / Solution</label
          >
          <div
            id="a-editor"
            bind:this={aEditorEl}
            bind:innerHTML={editingQuestion.answer_key}
            contenteditable="true"
            onfocus={() => (activeEditor = "answer")}
            onpaste={(e) => handlePaste(e, "answer")}
            role="textbox"
            tabindex="0"
            aria-multiline="true"
            class="w-full bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[10px] font-medium py-3 px-4 leading-relaxed focus:ring-2 focus:ring-indigo-500/20 min-h-[150px] outline-none overflow-y-auto rich-editor text-gray-900 dark:text-white"
          ></div>
          <p
            class="text-[8px] font-bold text-gray-300 dark:text-slate-700 uppercase mt-2"
          >
            Paste images directly or use buttons for tables and formatting
          </p>
        </div>
      </div>

      <div
        class="p-8 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-4"
      >
        <button
          onclick={() => (editingQuestion = null)}
          class="flex-1 py-4 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-500 text-[10px] font-black rounded-2xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-all uppercase tracking-widest border border-gray-200 dark:border-slate-800"
          >CANCEL</button
        >
        <button
          onclick={saveQuestion}
          disabled={isSavingQuestion}
          class="flex-[2] py-4 bg-indigo-600 text-white text-[10px] font-black rounded-2xl hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {#if isSavingQuestion}
            <div
              class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></div>
            SAVING...
          {:else}
            SAVE CHANGES
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showImportModal}
  <div
    class="fixed z-[70] inset-0 overflow-y-auto"
    aria-labelledby="modal-title"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0"
    >
      <div
        class="fixed inset-0 bg-gray-950/80 backdrop-blur-sm transition-opacity"
        onclick={() => (showImportModal = false)}
        onkeydown={(e) => e.key === "Escape" && (showImportModal = false)}
        role="button"
        tabindex="-1"
        aria-label="Close Modal"
      ></div>
      <span class="hidden sm:inline-block sm:align-middle sm:h-screen"
        >&#8203;</span
      >
      <div
        class="inline-block align-bottom glass dark:bg-slate-900/95 border-gray-100 dark:border-slate-800 rounded-[3rem] text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full animate-premium-scale"
      >
        <div class="px-8 pt-8 pb-6 sm:p-10 max-h-[85vh] overflow-y-auto">
          <h3
            class="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter mb-6"
          >
            Import Question Bank
          </h3>

          <div class="space-y-8">
            <!-- File Input -->
            <div
              class="border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-[2.5rem] p-10 text-center hover:border-indigo-500 dark:hover:border-indigo-400 transition-all bg-gray-50/50 dark:bg-slate-800/30 group"
            >
              <input
                type="file"
                id="import-upload"
                accept=".xlsx, .xls, .pdf, .docx, .doc"
                bind:files={uploadFiles}
                class="hidden"
              />
              <label for="import-upload" class="cursor-pointer block">
                <div
                  class="w-16 h-16 bg-white dark:bg-slate-800 rounded-3xl shadow-sm mx-auto mb-6 flex items-center justify-center group-hover:scale-110 transition-transform"
                >
                  <svg
                    class="w-8 h-8 text-indigo-600 dark:text-indigo-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    /></svg
                  >
                </div>
                <p
                  class="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest"
                >
                  Select Question Bank (PDF/DOCX/XLSX)
                </p>
                {#if uploadFiles && uploadFiles.length > 0}
                  <div
                    class="mt-4 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black rounded-xl inline-block shadow-lg"
                  >
                    LOADED: {uploadFiles[0].name}
                  </div>
                {/if}
              </label>
            </div>

            <!-- Sheet Selection -->
            {#if detectedSheets.length > 0}
              <div
                class="bg-indigo-50/50 dark:bg-indigo-900/20 p-6 rounded-[2rem] border border-indigo-100/50 dark:border-indigo-800/30"
              >
                <label
                  for="excel-sheet-select"
                  class="block text-[10px] font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest mb-3"
                  >Select Sheet:</label
                >
                <select
                  id="excel-sheet-select"
                  bind:value={selectedSheet}
                  onchange={() => updatePreview(null, selectedSheet)}
                  class="block w-full bg-white dark:bg-slate-950 border border-indigo-100 dark:border-indigo-800 text-sm font-bold rounded-2xl px-5 py-3 text-gray-900 dark:text-white"
                >
                  {#if detectedSheets.length > 1}
                    <option value="">Process All Sheets</option>
                  {/if}
                  {#each detectedSheets as sheet}
                    <option value={sheet}>{sheet}</option>
                  {/each}
                </select>
              </div>
            {/if}

            <!-- Preview -->
            {#if previewHeaders.length > 0 && selectedSheet}
              <div class="space-y-4">
                <h4
                  class="text-[10px] font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest"
                >
                  Data Preview
                </h4>
                <div
                  class="border border-gray-100 dark:border-slate-800 rounded-[2rem] overflow-hidden"
                >
                  <div class="overflow-x-auto">
                    <table
                      class="min-w-full divide-y divide-gray-100 dark:divide-gray-800"
                    >
                      <thead class="bg-gray-50/50 dark:bg-slate-800/50">
                        <tr>
                          {#each previewHeaders as header}
                            <th
                              class="px-6 py-3 text-left text-[9px] font-black text-gray-400 dark:text-gray-600 uppercase tracking-widest whitespace-nowrap"
                              >{header}</th
                            >
                          {/each}
                        </tr>
                      </thead>
                      <tbody
                        class="bg-white/50 dark:bg-slate-900/50 divide-y divide-gray-50 dark:divide-gray-800/50"
                      >
                        {#each previewRows as row}
                          <tr>
                            {#each previewHeaders as header, i}
                              <td
                                class="px-6 py-3 whitespace-nowrap text-[10px] font-bold text-gray-600 dark:text-gray-400"
                              >
                                {Array.isArray(row)
                                  ? row[i]
                                  : row[header] || "---"}
                              </td>
                            {/each}
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
        <div
          class="bg-gray-50/80 dark:bg-slate-800/50 backdrop-blur-md px-8 py-6 sm:px-10 sm:flex sm:flex-row-reverse border-t border-gray-100 dark:border-slate-800 rounded-b-[3rem]"
        >
          <button
            type="button"
            onclick={confirmImport}
            disabled={isUploadingQuestions["GLOBAL"] || !uploadFiles}
            class="w-full inline-flex justify-center rounded-2xl border border-transparent shadow-lg px-6 py-3 bg-indigo-600 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-indigo-700 transition-all sm:ml-4 sm:w-auto active:scale-95 disabled:opacity-30"
          >
            {isUploadingQuestions["GLOBAL"] ? "IMPORTING..." : "CONFIRM IMPORT"}
          </button>
          <button
            type="button"
            onclick={() => {
              showImportModal = false;
              uploadFiles = null;
            }}
            class="mt-3 w-full inline-flex justify-center rounded-2xl border border-gray-100 dark:border-slate-800 px-6 py-3 bg-white dark:bg-slate-900 text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all sm:mt-0 sm:w-auto active:scale-95 shadow-sm"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.tracking-widest) {
    letter-spacing: 0.15em;
  }
  :global(.rich-editor table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }
  :global(.rich-editor td) {
    border: 1px solid #e5e7eb;
    padding: 0.5rem;
  }
  :global(.rich-editor img) {
    max-width: 100%;
    border-radius: 0.5rem;
  }
</style>
