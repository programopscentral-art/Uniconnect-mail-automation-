<script lang="ts">
  import { page } from "$app/stores";
  import { slide, fade, fly } from "svelte/transition";
  import { invalidateAll, goto } from "$app/navigation";
  import AssessmentPaperRenderer from "$lib/components/assessments/AssessmentPaperRenderer.svelte";
  import TemplateCautionBanner from "$lib/components/assessments/TemplateCautionBanner.svelte";
  import { resolvePaperTemplate } from "$lib/components/assessments/templateRegistry";

  let { data } = $props();

  let currentStep = $state(1);
  const steps = [
    "Context",
    "Department",
    "Question Bank",
    "Preview",
    "Sets",
    "Generate",
  ];

  // Selections
  let selectedUniversityId = $state<string | null>(null);
  let selectedBatchId = $state<string | null>(null);
  let selectedBranchId = $state<string | null>(null);
  let selectedSemester = $state(1);
  let selectedSubjectId = $state("");
  let universitySearch = $state("");
  let filteredUniversities = $derived(
    data.universities.filter((u) =>
      u.name.toLowerCase().includes(universitySearch.toLowerCase()),
    ),
  );
  let branchSearch = $state("");
  let filteredBranches = $derived(
    data.branches.filter(
      (b) =>
        b.name.toLowerCase().includes(branchSearch.toLowerCase()) ||
        b.code.toLowerCase().includes(branchSearch.toLowerCase()),
    ),
  );
  let selectedExamType = $state("MID1");
  let selectedUnitIds = $state<string[]>([]);
  let selectedTopicIds = $state<string[]>([]);
  let expandedUnitId = $state<string | null>(null);

  let generationMode = $state("Standard");
  let selectedTemplate = $state("standard");
  let lastLoadedLayout = $state<any>({}); // Track the layout of the loaded template
  let partAType = $state("Normal");
  let paperStructure = $state<any[]>([]);
  let setsConfig = $state<Record<string, string[]>>({
    A: ["L1", "L2"],
    B: ["L1", "L3"],
    C: ["L2", "L3"],
    D: ["L1", "L2", "L3"],
  });

  // Metadata
  let examDate = $state(new Date().toISOString().split("T")[0]);
  let examTime = $state("10:00 AM");
  let examDuration = $state(90);
  let maxMarks = $state(50); // Default to 50 as suggested for Mid Exams
  let courseCodeManual = $state("");
  let examTitleHeader = $state("I MID TERM EXAMINATION FEBRUARY");
  let paperInstructions = $state("ANSWER ALL QUESTIONS");

  // Update SGU template/marks when exam type changes
  $effect(() => {
    if (!isSGU) return;
    if (selectedExamType === "SGU_SEM_75") {
      selectedTemplate = "sgu75";
      maxMarks = 75;
      examDuration = 180;
      paperInstructions = "1. All questions are compulsory.\n2. Figures to the right indicate full marks.\n3. Assume suitable data wherever necessary and mention it clearly.";
      paperStructure = [];
    } else if (selectedExamType === "SGU_SEM_50") {
      selectedTemplate = "sgu50";
      maxMarks = 50;
      examDuration = 120;
      paperInstructions = "1. All questions are compulsory.\n2. Assume suitable data wherever necessary and mention it clearly.";
      paperStructure = [];
    }
  });

  // Update exam title when exam type changes
  $effect(() => {
    // For VGU, use simple headers
    if (isVGU) {
      if (selectedExamType === "MID1") {
        examTitleHeader = "I MID TERM EXAMINATION FEBRUARY";
      } else if (selectedExamType === "MID2") {
        examTitleHeader = "II MID TERM EXAMINATION APRIL";
      } else if (selectedExamType === "SEM") {
        examTitleHeader = "SEMESTER END EXAMINATION";
      }
    } else {
      // For other universities, use detailed headers
      if (selectedExamType === "MID1") {
        examTitleHeader = "I MID TERM EXAMINATION FEBRUARY";
      } else if (selectedExamType === "MID2") {
        examTitleHeader = "II MID TERM EXAMINATION APRIL";
      } else if (selectedExamType === "SEM") {
        examTitleHeader = "SEMESTER END EXAMINATIONS - NOV/DEC 2025";
      }
    }
  });

  // Dynamic Data
  let unitsWithTopics = $state<any[]>([]);
  let courseOutcomes = $state<any[]>([]);
  let availableTemplates = $state<any[]>([]);
  let selectedTemplateId = $state<string | null>(null);
  let isLoadingTopics = $state(false);
  let isGenerating = $state(false);

  function initializeStructure(force = false) {
    if (!force && paperStructure.length > 0) return; // Don't overwrite if already exists

    const is100 = Number(maxMarks) === 100;
    const structure = [];

    if (isADYPU) {
      // Matches the original ADYPU Sem template format exactly:
      // Each Q gets its own "Attempt any one/two" header
      // Q1(a,b), Q2(a,b): 4 marks each sub-q, attempt any one
      // Q3(a,b,c), Q4(a,b,c), Q5(a,b,c): 7 marks each sub-q, attempt any two
      // Q6(a,b): 5 marks each sub-q, attempt any one (long answer)
      // Uses SINGLE + hasSubQuestions so each sub-q is independently picked
      const partA = {
        title: "Attempt any one",
        part: "A",
        answered_count: 1,
        marks_per_q: 4,
        numSubQuestions: 2,
        co: "CO1",
        slots: [
          {
            id: `A-1-${Math.random()}`,
            label: "1",
            part: "A",
            type: "SINGLE",
            marks: 4,
            unit: "Auto",
            qType: "NORMAL",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 2,
            marks_a: 4,
            marks_b: 4,
          },
        ],
      };
      structure.push(partA);

      const partB = {
        title: "Attempt any one",
        part: "B",
        answered_count: 1,
        marks_per_q: 4,
        numSubQuestions: 2,
        co: "CO2",
        slots: [
          {
            id: `B-2-${Math.random()}`,
            label: "2",
            part: "B",
            type: "SINGLE",
            marks: 4,
            unit: "Auto",
            qType: "NORMAL",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 2,
            marks_a: 4,
            marks_b: 4,
          },
        ],
      };
      structure.push(partB);

      const partC = {
        title: "Attempt any Two",
        part: "C",
        answered_count: 2,
        marks_per_q: 7,
        numSubQuestions: 3,
        co: "CO3",
        slots: [
          {
            id: `C-3-${Math.random()}`,
            label: "3",
            part: "C",
            type: "SINGLE",
            marks: 7,
            unit: "Auto",
            qType: "NORMAL",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 3,
            marks_a: 7,
            marks_b: 7,
            marks_c: 7,
          },
        ],
      };
      structure.push(partC);

      const partD = {
        title: "Attempt any Two",
        part: "D",
        answered_count: 2,
        marks_per_q: 7,
        numSubQuestions: 3,
        co: "CO4",
        slots: [
          {
            id: `D-4-${Math.random()}`,
            label: "4",
            part: "D",
            type: "SINGLE",
            marks: 7,
            unit: "Auto",
            qType: "NORMAL",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 3,
            marks_a: 7,
            marks_b: 7,
            marks_c: 7,
          },
        ],
      };
      structure.push(partD);

      const partE = {
        title: "Attempt any Two",
        part: "E",
        answered_count: 2,
        marks_per_q: 7,
        numSubQuestions: 3,
        co: "CO5",
        slots: [
          {
            id: `E-5-${Math.random()}`,
            label: "5",
            part: "E",
            type: "SINGLE",
            marks: 7,
            unit: "Auto",
            qType: "NORMAL",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 3,
            marks_a: 7,
            marks_b: 7,
            marks_c: 7,
          },
        ],
      };
      structure.push(partE);

      const partF = {
        title: "Attempt any one",
        part: "F",
        answered_count: 1,
        marks_per_q: 5,
        numSubQuestions: 2,
        co: "CO1",
        slots: [
          {
            id: `F-6-${Math.random()}`,
            label: "6",
            part: "F",
            type: "SINGLE",
            marks: 5,
            unit: "Auto",
            qType: "LONG",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 2,
            marks_a: 5,
            marks_b: 5,
          },
        ],
      };
      structure.push(partF);

      paperStructure = structure;
      refreshLabels();
      return;
    }

    if (isSGU) {
      const parts = ["A", "B", "C", "D", "E"];
      if (selectedExamType === "SGU_SEM_75") {
        // Q1: 5 sub-questions (a–e) × 3M = 15M
        structure.push({
          title: "Attempt the following Questions.",
          part: "A",
          answered_count: 5,
          marks_per_q: 3,
          numSubQuestions: 5,
          co: "CO1",
          slots: [
            {
              id: `A-1-${Math.random()}`,
              label: "1",
              part: "A",
              type: "SINGLE",
              marks: 3,
              unit: "Auto",
              qType: "NORMAL",
              bloom: "ANY",
              hasSubQuestions: true,
              numSubQuestions: 5,
              marks_a: 3,
              marks_b: 3,
              marks_c: 3,
            },
          ],
        });
        // Q2–Q5: 4 sub-questions (a–d) × 5M, attempt any 3
        ["B", "C", "D", "E"].forEach((part, idx) => {
          structure.push({
            title: "Attempt any three of the following Questions.",
            part,
            answered_count: 3,
            marks_per_q: 5,
            numSubQuestions: 4,
            co: `CO${idx + 2}`,
            slots: [
              {
                id: `${part}-${idx + 2}-${Math.random()}`,
                label: `${idx + 2}`,
                part,
                type: "SINGLE",
                marks: 5,
                unit: "Auto",
                qType: "NORMAL",
                bloom: "ANY",
                hasSubQuestions: true,
                numSubQuestions: 4,
                marks_a: 5,
                marks_b: 5,
                marks_c: 5,
              },
            ],
          });
        });
      } else {
        // SGU_SEM_50: Q1 SINGLE 10M, Q2-Q5 OR_GROUP 10M each
        structure.push({
          title: "Attempt the following Question.",
          part: "A",
          answered_count: 1,
          marks_per_q: 10,
          co: "CO1",
          slots: [
            {
              id: `A-1-${Math.random()}`,
              label: "1",
              part: "A",
              type: "SINGLE",
              marks: 10,
              unit: "Auto",
              qType: "NORMAL",
              bloom: "ANY",
              hasSubQuestions: false,
            },
          ],
        });
        ["B", "C", "D", "E"].forEach((part, idx) => {
          structure.push({
            title: "Attempt the following Question.",
            part,
            answered_count: 1,
            marks_per_q: 10,
            co: `CO${idx + 2}`,
            slots: [
              {
                id: `${part}-${idx + 2}-${Math.random()}`,
                label: `${idx + 2}`,
                part,
                type: "OR_GROUP",
                marks: 10,
                choices: [
                  { label: "", unit: "Auto", qType: "NORMAL", marks: 10, bloom: "ANY" },
                  { label: "", unit: "Auto", qType: "NORMAL", marks: 10, bloom: "ANY" },
                ],
              },
            ],
          });
        });
      }
      paperStructure = structure;
      refreshLabels();
      return;
    }

    if (isTakshashila) {
      // PART A: 10 MCQ (1M each)
      const partA = {
        title: "PART – A (10 X 1 = 10 Marks)",
        part: "A",
        answered_count: 10,
        marks_per_q: 1,
        slots: Array.from({ length: 10 }, (_, i) => ({
          id: `A-${i}-${Math.random()}`,
          label: `${i + 1}`,
          part: "A",
          type: "SINGLE",
          marks: 1,
          unit: "Auto",
          qType: "MCQ",
          bloom: "ANY",
        })),
      };
      structure.push(partA);

      // PART B: 5 OR groups (4M each)
      const partB = {
        title: "PART – B (5 X 4 = 20 Marks)",
        part: "B",
        answered_count: 5,
        marks_per_q: 4,
        slots: Array.from({ length: 5 }, (_, i) => ({
          id: `B-${i}-${Math.random()}`,
          label: `${11 + i * 2}`,
          displayLabel: `${11 + i * 2} or ${11 + i * 2 + 1}`,
          part: "B",
          type: "OR_GROUP",
          marks: 4,
          choices: [
            {
              label: `${11 + i * 2}`,
              unit: "Auto",
              qType: "SHORT",
              marks: 4,
              bloom: "ANY",
            },
            {
              label: `${11 + i * 2 + 1}`,
              unit: "Auto",
              qType: "SHORT",
              marks: 4,
              bloom: "ANY",
            },
          ],
        })),
      };
      structure.push(partB);

      // PART C: 2 OR groups (10M each)
      const partC = {
        title: "PART – C (2 X 10 = 20 Marks)",
        part: "C",
        answered_count: 2,
        marks_per_q: 10,
        slots: Array.from({ length: 2 }, (_, i) => ({
          id: `C-${i}-${Math.random()}`,
          label: `${21 + i * 2}`,
          displayLabel: `${21 + i * 2} or ${21 + i * 2 + 1}`,
          part: "C",
          type: "OR_GROUP",
          marks: 10,
          choices: [
            {
              label: `${21 + i * 2}`,
              unit: "Auto",
              qType: "LONG",
              marks: 10,
              bloom: "ANY",
            },
            {
              label: `${21 + i * 2 + 1}`,
              unit: "Auto",
              qType: "LONG",
              marks: 10,
              bloom: "ANY",
            },
          ],
        })),
      };
      structure.push(partC);

      paperStructure = structure;
      return;
    }

    if (isVGU) {
      // FORCE VGU RIGID STRUCTURE (10x1 + 3/4x5)
      const partA = {
        title: "SECTION A (1*10=10 Marks) Answer all Question No- 1-10",
        part: "A",
        answered_count: 10,
        marks_per_q: 1,
        slots: [] as any[],
      };
      for (let i = 1; i <= 10; i++) {
        partA.slots.push({
          id: `A-${i}-${Math.random()}`,
          label: `${i}`,
          part: "A",
          type: "SINGLE",
          marks: 1,
          unit: "Auto",
          qType: "MCQ",
          bloom: "ANY",
          target_co: "CO1",
        });
      }
      structure.push(partA);

      const partB = {
        title: "SECTION B (5*3=15 Marks) Attempt any three questions",
        part: "B",
        answered_count: 3,
        marks_per_q: 5,
        slots: [] as any[],
      };
      for (let i = 1; i <= 4; i++) {
        partB.slots.push({
          id: `B-${i}-${Math.random()}`,
          label: `Q.${10 + i}`,
          slot_id: `Q_${10 + i}`,
          part: "B",
          type: "SINGLE",
          marks: 5,
          unit: "Auto",
          qType: "LONG",
          bloom: "ANY",
          target_co: "CO1",
        });
      }
      structure.push(partB);

      paperStructure = structure;
      return;
    }

    if (isCrescent) {
      const is100 = Number(maxMarks) === 100;
      const countA = 10;
      const marksA = is100 ? 2 : 1;
      const partA = {
        title: `PART A (10 X ${marksA} = ${10 * marksA} Marks)`,
        part: "A",
        answered_count: 10,
        marks_per_q: marksA,
        slots: [] as any[],
      };
      for (let i = 1; i <= 10; i++) {
        partA.slots.push({
          id: `A-${i}-${Math.random()}`,
          label: `${i}`,
          part: "A",
          type: "SINGLE",
          marks: marksA,
          unit: "Auto",
          qType: "MCQ",
          bloom: "ANY",
        });
      }
      structure.push(partA);

      const countB = 5;
      const marksB = is100 ? 16 : 8;
      const partB = {
        title: `PART B (5 X ${marksB} = ${5 * marksB} Marks)`,
        part: "B",
        answered_count: 5,
        marks_per_q: marksB,
        slots: [] as any[],
      };
      for (let i = 0; i < 5; i++) {
        const qNum = 11 + i * 2;
        partB.slots.push({
          id: `B-${i}-${Math.random()}`,
          label: `${qNum}`,
          displayLabel: `${qNum} or ${qNum + 1}`,
          part: "B",
          type: "OR_GROUP",
          marks: marksB,
          choices: [
            {
              label: "",
              unit: "Auto",
              qType: "NORMAL",
              marks: marksB,
              bloom: "ANY",
            },
            {
              label: "",
              unit: "Auto",
              qType: "NORMAL",
              marks: marksB,
              bloom: "ANY",
            },
          ],
        });
      }
      structure.push(partB);
      paperStructure = structure;
      return;
    }

    if (isNRI) {
      // PART A: 3 Questions X 2M = 6M
      const partA = {
        title: "PART A (3X2M=6M)",
        part: "A",
        answered_count: 3,
        marks_per_q: 2,
        slots: Array.from({ length: 3 }, (_, i) => ({
          id: `A-${i}-${Math.random()}`,
          label: `${i + 1}`,
          part: "A",
          type: "SINGLE",
          marks: 2,
          unit: "Auto",
          qType: "NORMAL",
          bloom: "ANY",
        })),
      };
      structure.push(partA);

      // PART B: 3 OR groups X 8M = 24M
      const partB = {
        title: "PART B (3X8M=24M)",
        part: "B",
        answered_count: 3,
        marks_per_q: 8,
        slots: Array.from({ length: 3 }, (_, i) => ({
          id: `B-${i}-${Math.random()}`,
          label: `${4 + i * 2}`,
          displayLabel: `${4 + i * 2} or ${4 + i * 2 + 1}`,
          part: "B",
          type: "OR_GROUP",
          marks: 8,
          choices: [
            {
              label: `${4 + i * 2}`,
              unit: "Auto",
              qType: "NORMAL",
              marks: 8,
              bloom: "ANY",
            },
            {
              label: `${4 + i * 2 + 1}`,
              unit: "Auto",
              qType: "NORMAL",
              marks: 8,
              bloom: "ANY",
            },
          ],
        })),
      };
      structure.push(partB);

      paperStructure = structure;
      return;
    }

    // Part A
    const isMCQ = partAType === "MCQ";
    const countA = is100 ? (isMCQ ? 20 : 10) : isMCQ ? 10 : 5;
    const marksA = isMCQ ? 1 : 2;
    const typeA = isMCQ ? "MCQ" : "NORMAL";

    const partA = {
      title: "PART A",
      part: "A",
      answered_count: countA,
      marks_per_q: marksA,
      slots: [] as any[],
    };

    for (let i = 1; i <= countA; i++) {
      partA.slots.push({
        id: `A-${i}-${Math.random()}`,
        label: `${i}`,
        part: "A",
        type: "SINGLE",
        marks: marksA,
        unit: "Auto",
        qType: typeA,
        hasSubQuestions: false,
        bloom: "ANY",
        marks_a: Number((marksA / 2).toFixed(1)),
        marks_b: Number((marksA / 2).toFixed(1)),
      });
    }
    structure.push(partA);

    // Part B
    const countB = is100 ? 5 : 8;
    const marksB = is100 ? 16 : 5;
    const partB = {
      title: "PART B",
      part: "B",
      answered_count: countB,
      marks_per_q: marksB,
      slots: [] as any[],
    };

    const startB = countA + 1;
    for (let i = 0; i < countB; i++) {
      const qNum = startB + i;
      partB.slots.push({
        id: `B-${i}-${Math.random()}`,
        label: `${qNum}`,
        displayLabel: `${qNum} or ${qNum + 1}`,
        part: "B",
        type: "OR_GROUP",
        marks: marksB,
        choices: [
          {
            label: ``,
            unit: "Auto",
            qType: "NORMAL",
            hasSubQuestions: false,
            marks: marksB,
            bloom: "ANY",
            marks_a: Number((marksB / 2).toFixed(1)),
            marks_b: Number((marksB / 2).toFixed(1)),
          },
          {
            label: ``,
            unit: "Auto",
            qType: "NORMAL",
            hasSubQuestions: false,
            marks: marksB,
            bloom: "ANY",
            marks_a: Number((marksB / 2).toFixed(1)),
            marks_b: Number((marksB / 2).toFixed(1)),
          },
        ],
      });
    }
    structure.push(partB);

    if (generationMode === "Chaitanya") {
      const partA = {
        title: "Section - A",
        part: "A",
        answered_count: 6,
        marks_per_q: 2,
        slots: [] as any[],
      };
      for (let i = 1; i <= 10; i++) {
        partA.slots.push({
          id: `A-${i}-${Math.random()}`,
          label: `${i}`,
          part: "A",
          type: "SINGLE",
          marks: 2,
          unit: "Auto",
          qType: "NORMAL",
          hasSubQuestions: false,
          bloom: "ANY",
        });
      }
      structure.push(partA);

      const partB = {
        title: "Section - B",
        part: "B",
        answered_count: 2,
        marks_per_q: 4,
        slots: [] as any[],
      };
      for (let i = 0; i < 2; i++) {
        const qNum = 11 + i * 2;
        partB.slots.push({
          id: `B-${i}-${Math.random()}`,
          label: `${qNum}`,
          displayLabel: `${qNum} or ${qNum + 1}`,
          part: "B",
          type: "OR_GROUP",
          marks: 4,
          choices: [
            {
              label: ``,
              unit: "Auto",
              qType: "NORMAL",
              hasSubQuestions: false,
              marks: 4,
              bloom: "ANY",
            },
            {
              label: ``,
              unit: "Auto",
              qType: "NORMAL",
              hasSubQuestions: false,
              marks: 4,
              bloom: "ANY",
            },
          ],
        });
      }
      structure.push(partB);

      paperStructure = structure;
      refreshLabels();
      return;
    }

    if (activeUniversity?.name?.toLowerCase().includes("chaitanya")) {
      const partA = {
        title: "Section - A",
        part: "A",
        answered_count: 6,
        marks_per_q: 2,
        slots: [] as any[],
      };
      for (let i = 1; i <= 10; i++) {
        partA.slots.push({
          id: `A-${i}-${Math.random()}`,
          label: `${i}`,
          part: "A",
          type: "SINGLE",
          marks: 2,
          unit: "Auto",
          qType: "NORMAL",
          hasSubQuestions: false,
          bloom: "ANY",
        });
      }
      structure.push(partA);

      const partB = {
        title: "Section - B",
        part: "B",
        answered_count: 2,
        marks_per_q: 4,
        slots: [] as any[],
      };
      for (let i = 0; i < 2; i++) {
        const qNum = 11 + i * 2;
        partB.slots.push({
          id: `B-${i}-${Math.random()}`,
          label: `${qNum}`,
          displayLabel: `${qNum} or ${qNum + 1}`,
          part: "B",
          type: "OR_GROUP",
          marks: 4,
          choices: [
            {
              label: ``,
              unit: "Auto",
              qType: "NORMAL",
              hasSubQuestions: false,
              marks: 4,
              bloom: "ANY",
            },
            {
              label: ``,
              unit: "Auto",
              qType: "NORMAL",
              hasSubQuestions: false,
              marks: 4,
              bloom: "ANY",
            },
          ],
        });
      }
      structure.push(partB);

      paperStructure = structure;
      refreshLabels();
      return;
    }

    if (is100) {
      const partC = {
        title: "PART C",
        part: "C",
        answered_count: 1,
        marks_per_q: 16,
        slots: [] as any[],
      };
      const startC = startB + countB;
      partC.slots.push({
        id: `C-1-${Math.random()}`,
        label: `${startC}`,
        displayLabel: `${startC} or ${startC + 1}`,
        part: "C",
        type: "OR_GROUP",
        marks: 16,
        choices: [
          {
            label: ``,
            unit: "Auto",
            qType: "NORMAL",
            hasSubQuestions: false,
            marks: 16,
            bloom: "ANY",
            marks_a: 8,
            marks_b: 8,
          },
          {
            label: ``,
            unit: "Auto",
            qType: "NORMAL",
            hasSubQuestions: false,
            marks: 16,
            bloom: "ANY",
            marks_a: 8,
            marks_b: 8,
          },
        ],
      });
      structure.push(partC);
    }

    paperStructure = structure;
    refreshLabels();
  }

  // Derived
  let activeUniversity = $derived(
    data.universities.find((u) => u.id === selectedUniversityId),
  );
  let activeBatch = $derived(
    data.batches.find((b) => b.id === selectedBatchId),
  );
  let activeBranch = $derived(
    data.branches.find((b) => b.id === selectedBranchId),
  );
  let activeSubject = $derived(
    data.subjects.find((s: any) => s.id === selectedSubjectId),
  );

  // Question Pool Validation
  let currentPool = $derived(() => {
    const pool: Record<number, number> = {};
    unitsWithTopics.forEach((u) => {
      if (selectedUnitIds.includes(u.id)) {
        // If specific topics are selected in this unit, use only their counts
        const unitTopicsSelected = u.topics.filter((t: any) =>
          selectedTopicIds.includes(t.id),
        );

        if (unitTopicsSelected.length > 0) {
          unitTopicsSelected.forEach((t: any) => {
            Object.entries(t.question_counts || {}).forEach(
              ([marks, count]) => {
                const m = Number(marks);
                pool[m] = (pool[m] || 0) + (count as number);
              },
            );
          });
        } else {
          // Otherwise use full unit counts
          Object.entries(u.question_counts || {}).forEach(([marks, count]) => {
            const m = Number(marks);
            pool[m] = (pool[m] || 0) + (count as number);
          });
        }
      }
    });
    return pool;
  });

  let poolDeficiency = $derived(() => {
    const pool = currentPool();
    let required: Record<number, number> = {};

    if (generationMode === "Standard") {
      required =
        Number(maxMarks) === 100
          ? { 2: 10, 16: 10 } // Part A (10x2), Part B (4x2x16), Part C (1x2x16)
          : { 2: 5, 5: 16 }; // Part A (5x2), Part B (8x2x5)
    } else {
      paperStructure.forEach((section) => {
        section.slots.forEach((slot: any) => {
          if (slot.type === "SINGLE") {
            if (slot.hasSubQuestions) {
              required[slot.marks_a] = (required[slot.marks_a] || 0) + 1;
              required[slot.marks_b] = (required[slot.marks_b] || 0) + 1;
            } else {
              required[slot.marks] = (required[slot.marks] || 0) + 1;
            }
          } else if (slot.choices) {
            slot.choices.forEach((choice: any) => {
              if (choice.hasSubQuestions) {
                required[choice.marks_a] = (required[choice.marks_a] || 0) + 1;
                required[choice.marks_b] = (required[choice.marks_b] || 0) + 1;
              } else {
                required[choice.marks] = (required[choice.marks] || 0) + 1;
              }
            });
          }
        });
      });
    }

    const deficientMarks = [];
    for (const [m, count] of Object.entries(required)) {
      const marks = Number(m);
      if ((pool[marks] || 0) < count) {
        deficientMarks.push({ marks, has: pool[marks] || 0, needs: count });
      }
    }
    return deficientMarks;
  });

  let availableBloomLevels = $derived(() => {
    const levels = new Set<string>();
    unitsWithTopics.forEach((u) => {
      if (selectedUnitIds.includes(u.id)) {
        // If question_counts has bloom info, extract it
        // Assuming the API returns bloom distribution. Let's check.
        if (u.bloom_counts) {
          Object.keys(u.bloom_counts).forEach((l) => levels.add(l));
        } else {
          // Fallback: If no bloom counts, assume standard L1-L3 as often available
          ["L1", "L2", "L3"].forEach((l) => levels.add(l));
        }
      }
    });
    return Array.from(levels).sort();
  });

  async function fetchTopics() {
    if (!selectedSubjectId) return;
    isLoadingTopics = true;
    try {
      const [topicsRes, coRes] = await Promise.all([
        fetch(`/api/assessments/topics?subjectId=${selectedSubjectId}`),
        fetch(
          `/api/assessments/course-outcomes?subjectId=${selectedSubjectId}`,
        ),
      ]);

      if (topicsRes.ok) unitsWithTopics = await topicsRes.json();
      if (coRes.ok) courseOutcomes = await coRes.json();
    } finally {
      isLoadingTopics = false;
    }
  }

  function toggleUnit(unitId: string) {
    if (selectedUnitIds.includes(unitId)) {
      selectedUnitIds = selectedUnitIds.filter((id) => id !== unitId);
      // Also unselect all topics for this unit
      const unit = unitsWithTopics.find((u) => u.id === unitId);
      if (unit?.topics) {
        const topicIds = unit.topics.map((t: any) => t.id);
        selectedTopicIds = selectedTopicIds.filter(
          (id) => !topicIds.includes(id),
        );
      }
    } else {
      selectedUnitIds = [...selectedUnitIds, unitId];
    }
  }

  async function fetchTopicsForSubject() {
    if (
      !selectedSubjectId ||
      selectedSubjectId === "" ||
      selectedSubjectId === "undefined"
    ) {
      unitsWithTopics = [];
      return;
    }

    isLoadingTopics = true;
    try {
      const res = await fetch(
        `/api/assessments/topics?subjectId=${selectedSubjectId}`,
      );
      if (res.ok) {
        unitsWithTopics = await res.json();
      } else {
        console.error("Failed to fetch topics");
        unitsWithTopics = [];
      }
    } catch (e) {
      console.error("Error fetching topics:", e);
      unitsWithTopics = [];
    } finally {
      isLoadingTopics = false;
    }
  }

  // Reactive: fetch topics when subject changes
  $effect(() => {
    if (selectedSubjectId) {
      fetchTopicsForSubject();
    }
  });

  function toggleTopic(topic: any, unitId: string) {
    if (!selectedUnitIds.includes(unitId)) {
      selectedUnitIds = [...selectedUnitIds, unitId];
    }

    const tids = topic.all_ids || [topic.id];
    const allSelected = tids.every((id: string) =>
      selectedTopicIds.includes(id),
    );

    if (allSelected) {
      selectedTopicIds = selectedTopicIds.filter((id) => !tids.includes(id));
    } else {
      selectedTopicIds = [...new Set([...selectedTopicIds, ...tids])];
    }
  }

  /**
   * Sessions sit under a topic inside a module. Selecting one narrows generation
   * to just that session's questions; selecting the parent topic still selects
   * everything beneath it (topic.all_ids includes its session ids).
   */
  function toggleSession(session: any, unitId: string) {
    if (!selectedUnitIds.includes(unitId)) {
      selectedUnitIds = [...selectedUnitIds, unitId];
    }
    const sids = session.all_ids?.length ? session.all_ids : [session.id];
    const allSelected = sids.every((id: string) => selectedTopicIds.includes(id));
    if (allSelected) {
      selectedTopicIds = selectedTopicIds.filter((id) => !sids.includes(id));
    } else {
      selectedTopicIds = [...new Set([...selectedTopicIds, ...sids])];
    }
  }

  function selectAllUnits() {
    selectedUnitIds = unitsWithTopics.map((u) => u.id);
    selectedTopicIds = []; // Reset topic filters to use full units
  }

  function selectUpToUnit(unitNum: number) {
    selectedUnitIds = unitsWithTopics
      .filter((u) => u.unit_number <= unitNum)
      .map((u) => u.id);
    selectedTopicIds = []; // Reset topic filters
  }

  async function generateSets() {
    if (selectedUnitIds.length === 0) return alert("Select at least one unit");
    isGenerating = true;
    try {
      const res = await fetch("/api/assessments/generate", {
        method: "POST",
        body: JSON.stringify({
          university_id: selectedUniversityId,
          batch_id: selectedBatchId,
          branch_id: selectedBranchId,
          subject_id: selectedSubjectId,
          exam_type: selectedExamType,
          semester: selectedSemester,
          unit_ids: selectedUnitIds,
          topic_ids: selectedTopicIds,
          paper_date: examDate,
          exam_time: examTime,
          duration_minutes: examDuration,
          max_marks: maxMarks,
          template_id: selectedTemplateId,
          course_code: courseCodeManual,
          exam_title: examTitleHeader,
          instructions: paperInstructions,
          generation_mode: generationMode,
          part_a_type: partAType,
          selected_template: isChaitanya ? "cdu" : selectedTemplate,
          template_config: paperStructure.map((section) => ({
            ...section,
            slots: section.slots.map((slot: any) => ({
              ...slot,
              // Ensure backend gets the full context
              qType: slot.qType,
              marks: slot.marks,
              bloom: slot.bloom,
              co_id: slot.co_id,
              choices: slot.choices?.map((c: any) => ({
                ...c,
                qType: c.qType,
                marks: c.marks,
                bloom: c.bloom,
                co_id: c.co_id,
              })),
            })),
          })),
          sets_config: setsConfig,
        }),
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const paper = await res.json();
        unfilledSlots = paper.unfilled || [];
        generationWarnings = paper.warnings || [];

        // The paper is saved either way — but if the bank couldn't fill every
        // slot, say so plainly instead of dropping the user onto a paper with
        // silent placeholder questions in it.
        if (unfilledSlots.length > 0) {
          const detail = unfilledSlots
            .slice(0, 8)
            .map(
              (u: any) =>
                `• Set ${u.set} · ${u.section || "Section"} Q${u.slot ?? "?"} — needs a ${u.type || "question"} (${u.marks ?? "?"}M)`,
            )
            .join("\n");
          const more =
            unfilledSlots.length > 8
              ? `\n…and ${unfilledSlots.length - 8} more.`
              : "";
          alert(
            `Paper generated, but ${unfilledSlots.length} slot(s) could not be filled from the question bank.\n\n${detail}${more}\n\nThese appear as placeholders in the paper. Add matching questions to the bank, then regenerate or swap them in.`,
          );
        }
        window.location.href = `/assessments/papers/${paper.id}`;
      } else {
        const err = await res.json();
        alert(`Generation failed: ${err.message || "Unknown error"}`);
      }
    } catch (e) {
      console.error(e);
      alert("A network error occurred during generation.");
    } finally {
      isGenerating = false;
    }
  }

  async function saveAsTemplate() {
    const templateName = prompt(
      "Enter a name for this template:",
      `${selectedExamType} Format - ${maxMarks}M`,
    );
    if (!templateName) return;

    const res = await fetch("/api/assessments/templates", {
      method: "POST",
      body: JSON.stringify({
        university_id: selectedUniversityId,
        name: templateName,
        exam_type: selectedExamType,
        config: paperStructure,
      }),
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) {
      alert("Template saved successfully!");
      fetchTemplates(); // Refresh list
    } else {
      alert("Failed to save template");
    }
  }

  async function fetchTemplates() {
    if (
      !selectedUniversityId ||
      selectedUniversityId === "undefined" ||
      selectedUniversityId.length < 36
    )
      return;
    const res = await fetch(
      `/api/assessments/templates?universityId=${selectedUniversityId}`,
    );
    if (res.ok) availableTemplates = await res.json();
  }

  function applyTemplate(templateId: string) {
    const template = availableTemplates.find((t) => t.id === templateId);
    if (!template) return;

    selectedTemplateId = template.id;
    if (
      template.config &&
      Array.isArray(template.config) &&
      template.config.length > 0
    ) {
      paperStructure = JSON.parse(JSON.stringify(template.config));
    } else {
      initializeStructure(true);
    }

    // Resolve Course Outcomes (mapping target_co code to co_id)
    paperStructure.forEach((section: any) => {
      section.slots.forEach((slot: any) => {
        if (slot.target_co && courseOutcomes.length > 0) {
          const foundCo = courseOutcomes.find(
            (co: any) => co.code === slot.target_co,
          );
          if (foundCo) slot.co_id = foundCo.id;
        }
      });
    });

    selectedExamType = template.exam_type;
    lastLoadedLayout = template.layout_schema || {};

    // Auto-detect template type or use generic
    if (template.layout_schema?.style) {
      selectedTemplate = template.layout_schema.style;
    } else if (
      template.layout_schema &&
      Object.keys(template.layout_schema).length > 0
    ) {
      selectedTemplate = "generic";
    } else if (template.name.toLowerCase().includes("vgu") || isVGU) {
      selectedTemplate = "vgu";
    } else if (template.name.toLowerCase().includes("crescent")) {
      selectedTemplate = "crescent";
    } else if (
      template.name.toLowerCase().includes("chaitanya") ||
      template.name.toLowerCase().includes("cdu")
    ) {
      selectedTemplate = "cdu";
    } else {
      selectedTemplate = "standard";
    }

    refreshLabels();
  }

  function refreshLabels() {
    let currentNum = 1;
    paperStructure.forEach((section: any) => {
      section.slots.forEach((slot: any) => {
        if (slot.type === "SINGLE") {
          slot.label = `${currentNum}`;
          currentNum++;
        } else if (slot.type === "OR_GROUP") {
          const n1 = currentNum;
          const n2 = currentNum + 1;
          slot.label = `${n1}`;
          slot.displayLabel = `${n1} or ${n2}`;
          if (slot.choices) {
            slot.choices[0].label = `${n1}`;
            slot.choices[1].label = `${n2}`;
          }
          currentNum += 2;
        }
      });
    });
    paperStructure = [...paperStructure];
  }

  function addSingleSlot(section: any) {
    const numSub = section.numSubQuestions || (isADYPU ? 2 : 0);
    const m = section.marks_per_q;
    section.slots.push({
      id: Math.random().toString(36).substr(2, 9),
      label: ``, // Will be refreshed
      type: "SINGLE",
      marks: m,
      unit: "Auto",
      qType: "NORMAL",
      bloom: "ANY",
      hasSubQuestions: isADYPU ? true : false,
      numSubQuestions: numSub || 2,
      marks_a: isADYPU ? m : Number((m / 2).toFixed(1)),
      marks_b: isADYPU ? m : Number((m / 2).toFixed(1)),
      marks_c: numSub >= 3 ? m : undefined,
    });
    refreshLabels();
  }

  function addOrGroup(section: any) {
    section.slots.push({
      id: Math.random().toString(36).substr(2, 9),
      label: ``, // Will be refreshed
      displayLabel: ``, // Will be refreshed
      type: "OR_GROUP",
      marks: section.marks_per_q,
      choices: [
        {
          label: ``,
          unit: "Auto",
          qType: "NORMAL",
          bloom: "ANY",
          hasSubQuestions: false,
          marks: section.marks_per_q,
          marks_a: Number((section.marks_per_q / 2).toFixed(1)),
          marks_b: Number((section.marks_per_q / 2).toFixed(1)),
        },
        {
          label: ``,
          unit: "Auto",
          qType: "NORMAL",
          bloom: "ANY",
          hasSubQuestions: false,
          marks: section.marks_per_q,
          marks_a: Number((section.marks_per_q / 2).toFixed(1)),
          marks_b: Number((section.marks_per_q / 2).toFixed(1)),
        },
      ],
    });
    refreshLabels();
  }

  function removeSlot(section: any, slotId: string) {
    section.slots = section.slots.filter((s: any) => s.id !== slotId);
    refreshLabels();
  }

  function addSection() {
    const char = String.fromCharCode(65 + paperStructure.length); // Next char
    const nextQNum = paperStructure.length + 1;
    if (isADYPU) {
      // ADYPU: default to "Attempt any one" with 2 sub-questions
      paperStructure.push({
        title: "Attempt any one",
        part: char,
        answered_count: 1,
        marks_per_q: 4,
        numSubQuestions: 2,
        co: `CO${nextQNum}`,
        slots: [
          {
            id: `${char}-${nextQNum}-${Math.random()}`,
            label: `${nextQNum}`,
            part: char,
            type: "SINGLE",
            marks: 4,
            unit: "Auto",
            qType: "NORMAL",
            bloom: "ANY",
            hasSubQuestions: true,
            numSubQuestions: 2,
            marks_a: 4,
            marks_b: 4,
          },
        ],
      });
    } else {
      paperStructure.push({
        title: `SECTION ${char}`,
        part: char,
        answered_count: 5,
        marks_per_q: 2,
        slots: [],
      });
    }
    paperStructure = [...paperStructure];
    refreshLabels();
  }

  // Wizard Navigation
  async function nextStep() {
    if (currentStep === 1 && (!selectedUniversityId || !selectedBatchId))
      return;
    if (currentStep === 2 && (!selectedBranchId || !selectedSemester)) return;
    if (
      currentStep === 3 &&
      (!selectedSubjectId || selectedUnitIds.length === 0)
    ) {
      return alert("Select a Subject and at least one unit");
    }
    if (currentStep === 3) {
      initializeStructure();
      // Fetch preview data
      fetchPreview();
    }
    if (currentStep < 6) currentStep++;
  }

  async function fetchPreview() {
    try {
      const res = await fetch("/api/assessments/generate", {
        method: "POST",
        body: JSON.stringify({
          university_id: selectedUniversityId,
          batch_id: selectedBatchId,
          branch_id: selectedBranchId,
          subject_id: selectedSubjectId,
          unit_ids: selectedUnitIds,
          max_marks: maxMarks,
          template_config: paperStructure.map((section: any) => ({
            ...section,
            slots: section.slots.map((slot: any) => ({
              ...slot,
              choices: slot.choices?.map((c: any) => ({
                ...c,
              })),
            })),
          })),
          exam_type: selectedExamType,
          selected_template: isVGU ? "vgu-standard-mid-term" : selectedTemplate,
          generation_mode: "Standard", // Use standard for preview to get 1 set
          preview_only: true,
        }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        previewSetData = data.sets.A; // API returns { sets: { A: ... } }
        unfilledSlots = data.unfilled || [];
        generationWarnings = data.warnings || [];
      }
    } catch (e) {
      console.error("Preview fetch failed", e);
    }
  }
  function prevStep() {
    if (currentStep > 1) currentStep--;
  }

  $effect(() => {
    if (data.selectedUniversityId && !selectedUniversityId) {
      selectedUniversityId = data.selectedUniversityId;
    }
  });

  $effect(() => {
    if (data.selectedBatchId && !selectedBatchId) {
      selectedBatchId = data.selectedBatchId;
    }
  });

  $effect(() => {
    if (data.selectedBranchId && !selectedBranchId) {
      selectedBranchId = data.selectedBranchId;
    }
  });

  $effect(() => {
    if (selectedUniversityId) {
      // Assuming fetchBatches() is defined elsewhere or will be added.
      // For this specific change, we only focus on fetchTemplates.
      fetchTemplates();
    }
  });

  $effect(() => {
    if (selectedSubjectId) {
      fetchTopics();
      const sub = data.subjects.find((s) => s.id === selectedSubjectId);
      if (sub) courseCodeManual = sub.code || "";
    }
  });

  // Absolute Template Enforcement for Chaitanya
  const isChaitanya = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("chaitanya") ||
      activeUniversity?.name?.toLowerCase()?.includes("cdu") ||
      String(selectedUniversityId).toLowerCase() ===
        "8e5403f9-505a-44d4-add4-aae3efaa9248" ||
      (typeof window !== "undefined" &&
        window.location.search.toLowerCase().includes("8e5403f9")),
  );
  const isCrescent = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("crescent"),
  );
  const isVGU = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("viv") ||
      activeUniversity?.name?.toLowerCase()?.includes("vgu") ||
      activeUniversity?.slug?.includes("vgu") ||
      String(selectedUniversityId).toLowerCase().startsWith("c40ed15d") ||
      (typeof window !== "undefined" &&
        window.location.search.toLowerCase().includes("c40ed15d")),
  );
  const isTakshashila = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("takshashila") ||
      String(selectedUniversityId).toLowerCase().includes("taksha"),
  );
  const isADYPU = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("ajeenkya") ||
      activeUniversity?.name?.toLowerCase()?.includes("adypu") ||
      activeUniversity?.name?.toLowerCase()?.includes("patil"),
  );
  const isNRI = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("nri") ||
      activeUniversity?.slug?.includes("nri"),
  );
  const isSGU = $derived(
    activeUniversity?.name?.toLowerCase()?.includes("sgu") ||
      activeUniversity?.name?.toLowerCase()?.includes("shivaji") ||
      activeUniversity?.slug?.includes("sgu"),
  );

  $effect(() => {
    if (!selectedUniversityId) return;

    // Only trigger defaults if the university actually changed
    // We use a local tracking variable or just check the last processed ID
    if (isChaitanya) {
      selectedTemplate = "cdu";
      maxMarks = 20;
      examDuration = 90;
    } else if (isCrescent) {
      selectedTemplate = "crescent";
      maxMarks = 50;
      examDuration = 90;
    } else if (isTakshashila) {
      selectedTemplate = "takshashila";
      maxMarks = 50;
      examDuration = 90;
      paperStructure = []; // Clear to force re-init
    } else if (isVGU) {
      selectedTemplate = "vgu-standard-mid-term";
      paperStructure = []; // Clear current structure to force VGU rigid initialization
      // Auto-apply VGU template if found in availableTemplates
      const vguT = availableTemplates.find(
        (t: any) =>
          t.slug === "vgu-standard-mid-term" ||
          t.name.toLowerCase().includes("vgu"),
      );
      if (vguT) {
        applyTemplate(vguT.id);
        maxMarks = 25; // VGU Design shows 25 (10+15)
        examDuration = 60; // Design shows 1 Hr
      }
    } else if (isADYPU) {
      selectedTemplate = "adypu";
      maxMarks = 50;
      examDuration = 120;
      paperInstructions = "1. Attempt all the questions.\n2. Draw necessary diagram if required.\n3. Assume data as per question if required.\n4. Marked are indicated.";
      paperStructure = []; // Clear to force re-init
    } else if (isNRI) {
      selectedTemplate = "nri";
      maxMarks = 30;
      examDuration = 90;
      paperStructure = []; // Clear to force re-init
    } else if (isSGU) {
      selectedTemplate = "sgu50";
      selectedExamType = "SGU_SEM_50";
      maxMarks = 50;
      examDuration = 120;
      paperInstructions = "1. All questions are compulsory.\n2. Assume suitable data wherever necessary and mention it clearly.";
      paperStructure = []; // Clear to force re-init
    } else {
      selectedTemplate = "standard";
    }
  });

  // Determine the user-facing label for the "Standard" mode
  let universityLabel = $derived(
    isChaitanya
      ? "Chaitanya"
      : isCrescent
        ? "Crescent"
        : isVGU
          ? "VGU University"
          : isADYPU
            ? "ADYPU Sem Template"
            : isNRI
              ? "NRI Institute of Technology"
              : isSGU
                ? "SGU Sem Template"
                : "University Standard",
  );

  let previewPaperMeta = $state<any>({
    paper_date: "",
    duration_minutes: "90",
    max_marks: "50",
    course_code: "CS-XXXX",
    exam_title: "I MID TERM EXAMINATION FEBRUARY",
    programme: "B.Tech CSE",
    semester: "1",
    instructions: "ANSWER ALL QUESTIONS",
    subject_name: "Subject Name",
    univ_line_1: "UNIVERSITY",
    univ_line_2: "",
    colWidths: { sno: 40 },
  });
  let previewSetData = $state({ questions: [] });

  /**
   * Slots the generator could not fill from the question bank, and any non-fatal
   * problems it hit. Generation no longer aborts on a thin bank — it inserts a
   * placeholder and reports the gap here, so the user sees exactly what to add.
   */
  let unfilledSlots = $state<any[]>([]);
  let generationWarnings = $state<string[]>([]);

  /** Which university template this paper will use — same resolver as the viewer. */
  let previewResolved = $derived(
    resolvePaperTemplate({
      universityName: data.universities?.find(
        (u: any) => u.id === selectedUniversityId,
      )?.name,
      universityId: selectedUniversityId,
      examType: selectedExamType,
      examTitle: examTitleHeader,
      maxMarks,
      metaTemplate: selectedTemplate,
    }),
  );
  const PreviewTemplate = $derived(previewResolved.component);
  let previewQuestionPool = $derived(
    unitsWithTopics.flatMap((u: any) =>
      (u.topics || []).flatMap((t: any) => t.questions || []),
    ),
  );

  $effect(() => {
    previewPaperMeta.paper_date = examDate;
    previewPaperMeta.duration_minutes = String(examDuration);
    previewPaperMeta.max_marks = String(maxMarks);
    previewPaperMeta.course_code =
      courseCodeManual || activeSubject?.code || "CS-XXXX";
    previewPaperMeta.exam_title = examTitleHeader;
    previewPaperMeta.programme = activeBranch?.name || "B.Tech CSE";
    previewPaperMeta.semester = String(selectedSemester);
    previewPaperMeta.instructions = paperInstructions;
    previewPaperMeta.subject_name = activeSubject?.name || "Subject Name";
    previewPaperMeta.univ_line_1 = isChaitanya
      ? "CHAITANYA DEEMED TO BE UNIVERSITY"
      : isCrescent
        ? "BS ABDUR RAHMAN"
        : "UNIVERSITY";
    previewPaperMeta.univ_line_1_2 = isCrescent
      ? "CRESCENT INSTITUTE OF SCIENCE & TECHNOLOGY"
      : "";
    previewPaperMeta.univ_line_2 = isChaitanya
      ? "KISHANPURA, HANAMKONDA - 506001 (TS)"
      : isCrescent
        ? "Deemed to be University u/s 3 of the UGC Act, 1956"
        : "";
    previewPaperMeta.partA_title = previewPaperMeta.partA_title || "PART A";
    previewPaperMeta.partB_title = previewPaperMeta.partB_title || "PART B";
    previewPaperMeta.partC_title = previewPaperMeta.partC_title || "PART C";
  });
</script>

<div class="max-w-6xl mx-auto space-y-8 pb-32">
  <!-- Header -->
  <div
    class="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4"
  >
    <div class="flex items-center gap-6">
      <button
        type="button"
        onclick={() => (currentStep > 1 ? prevStep() : goto("/assessments"))}
        class="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-100 dark:hover:border-indigo-900 transition-all active:scale-95"
        title={currentStep > 1 ? "Back to previous step" : "Back to Papers"}
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
            d="M15 19l-7-7 7-7"
          /></svg
        >
      </button>

      <div class="space-y-1">
        <div
          class="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]"
        >
          <div class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          Question Paper Engine
        </div>
        <h1
          class="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase"
        >
          Generate Assessment
        </h1>
      </div>
    </div>
  </div>

  <!-- Stepper (Wells Fargo Style) -->
  <div
    class="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm"
  >
    <div class="relative flex justify-between">
      <div
        class="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 dark:bg-slate-800 -translate-y-1/2 z-0"
      ></div>
      <div
        class="absolute top-1/2 left-0 h-0.5 bg-indigo-600 -translate-y-1/2 z-0 transition-all duration-500"
        style="width: {((currentStep - 1) / (steps.length - 1)) * 100}%"
      ></div>

      {#each steps as step, i}
        <div class="relative z-10 flex flex-col items-center">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 border-4
                        {currentStep > i + 1
              ? 'bg-indigo-600 text-white border-indigo-600'
              : currentStep === i + 1
                ? 'bg-white dark:bg-slate-900 text-indigo-600 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-900/20'
                : 'bg-gray-50 dark:bg-slate-800 text-gray-300 dark:text-slate-600 border-gray-50 dark:border-slate-800'}"
          >
            {i + 1}
          </div>
          <span
            class="text-[10px] font-black uppercase tracking-widest mt-3 {currentStep ===
            i + 1
              ? 'text-indigo-600'
              : 'text-gray-400 dark:text-slate-500'}">{step}</span
          >
        </div>
      {/each}
    </div>
  </div>

  <!-- Step Content -->
  <div class="min-h-[500px]">
    {#if currentStep === 1}
      <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
        <div class="text-center">
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
          >
            Institutional Context
          </h2>
          <p
            class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
          >
            Select the University and Academic Batch
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- University Selection -->
          <div class="space-y-4">
            <div class="flex items-center justify-between ml-1">
              <h4
                class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest"
              >
                University
              </h4>
              <div class="relative min-w-[200px]">
                <input
                  type="text"
                  bind:value={universitySearch}
                  placeholder="Filter universities..."
                  class="w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl px-4 py-2 text-[10px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
                <svg
                  class="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  /></svg
                >
              </div>
            </div>
            <div
              class="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"
            >
              {#each filteredUniversities as univ}
                <button
                  onclick={() => {
                    selectedUniversityId = univ.id;
                    goto(
                      `?universityId=${univ.id}${selectedBatchId ? `&batchId=${selectedBatchId}` : ""}`,
                      { replaceState: true, noScroll: true },
                    );
                  }}
                  class="p-4 rounded-xl border-2 text-left transition-all
                                    {selectedUniversityId === univ.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-indigo-950'
                    : 'bg-white dark:bg-slate-900 border-gray-50 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                >
                  <h4
                    class="text-[11px] font-black {selectedUniversityId ===
                    univ.id
                      ? 'text-indigo-700 dark:text-indigo-400'
                      : 'text-gray-900 dark:text-slate-200'}"
                  >
                    {univ.name}
                  </h4>
                </button>
              {:else}
                <div
                  class="p-8 border-2 border-dashed border-gray-50 dark:border-slate-800 rounded-2xl text-center text-gray-300 dark:text-slate-600 italic text-xs"
                >
                  No universities match your search.
                </div>
              {/each}
            </div>
          </div>

          <!-- Batch Selection -->
          <div class="space-y-4">
            <h4
              class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
            >
              Academic Batch
            </h4>
            <div class="grid grid-cols-1 gap-3">
              {#each data.batches as batch}
                <button
                  onclick={() => {
                    selectedBatchId = batch.id;
                    goto(
                      `?universityId=${selectedUniversityId}&batchId=${batch.id}`,
                      { replaceState: true, noScroll: true },
                    );
                  }}
                  class="p-5 rounded-2xl border-2 text-left transition-all
                                    {selectedBatchId === batch.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950'
                    : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                >
                  <h4
                    class="text-sm font-black {selectedBatchId === batch.id
                      ? 'text-indigo-700 dark:text-indigo-400'
                      : 'text-gray-900 dark:text-slate-200'}"
                  >
                    {batch.name}
                  </h4>
                </button>
              {:else}
                <div
                  class="p-8 border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-3xl text-center text-gray-400 dark:text-slate-600 italic text-sm"
                >
                  No batches found for this university.
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Exam Type Selection (shown once a university is selected) -->
        {#if selectedUniversityId}
          <div class="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800" in:slide>
            <div class="text-center">
              <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                Exam Type
              </h4>
              <p class="text-[10px] text-gray-300 dark:text-slate-600 mt-1">Select the assessment type — the paper format will adjust automatically</p>
            </div>
            <div class="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {#if isSGU}
                {#each [{ value: "SGU_SEM_50", label: "Sem\n(50 Marks)" }, { value: "SGU_SEM_75", label: "Sem\n(75 Marks)" }] as type}
                  <button
                    onclick={() => (selectedExamType = type.value)}
                    class="p-4 rounded-xl border-2 text-[10px] font-black uppercase transition-all whitespace-pre-line
                      {selectedExamType === type.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-indigo-950'
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-400 dark:text-slate-500 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                  >{type.label}</button>
                {/each}
              {:else}
                {#each ["MID1", "MID2", "SEM", "SUPPLY", "INTERNAL_LAB", "EXTERNAL_LAB"] as type}
                  <button
                    onclick={() => (selectedExamType = type)}
                    class="p-4 rounded-xl border-2 text-[10px] font-black uppercase transition-all
                      {selectedExamType === type
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 dark:shadow-indigo-950'
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-400 dark:text-slate-500 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                  >{type.replace(/_/g, " ")}</button>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {:else if currentStep === 2}
      <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
        <div class="text-center">
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
          >
            Department & Semester
          </h2>
          <p
            class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
          >
            Identify the stream and academic period
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- Branch Selection -->
          <div class="space-y-4">
            <div class="flex items-center justify-between ml-1">
              <h4
                class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest"
              >
                Branch / Department
              </h4>
              <div class="relative min-w-[200px]">
                <input
                  type="text"
                  bind:value={branchSearch}
                  placeholder="Filter branches..."
                  class="w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl px-4 py-2 text-[10px] font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
                <svg
                  class="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  /></svg
                >
              </div>
            </div>
            <div
              class="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"
            >
              {#each filteredBranches as branch}
                <button
                  onclick={() => {
                    selectedBranchId = branch.id;
                    goto(
                      `?universityId=${selectedUniversityId}&batchId=${selectedBatchId}&branchId=${branch.id}`,
                      { replaceState: true, noScroll: true },
                    );
                  }}
                  class="p-4 rounded-xl border-2 text-left transition-all
                                    {selectedBranchId === branch.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-indigo-950'
                    : 'bg-white dark:bg-slate-900 border-gray-50 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                >
                  <h4
                    class="text-[11px] font-black {selectedBranchId ===
                    branch.id
                      ? 'text-indigo-700 dark:text-indigo-400'
                      : 'text-gray-900 dark:text-slate-200'}"
                  >
                    {branch.name}
                  </h4>
                  <span
                    class="text-[9px] font-bold text-indigo-400 uppercase tracking-widest"
                    >{branch.code}</span
                  >
                </button>
              {:else}
                <div
                  class="p-8 border-2 border-dashed border-gray-50 dark:border-slate-800 rounded-2xl text-center text-gray-300 dark:text-slate-600 italic text-xs"
                >
                  No branches match your search.
                </div>
              {/each}
            </div>
          </div>

          <!-- Semester Selection -->
          <div class="space-y-4">
            <h4
              class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
            >
              Semester
            </h4>
            <div class="grid grid-cols-2 gap-3">
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as sem}
                <button
                  onclick={() => (selectedSemester = sem)}
                  class="p-5 rounded-2xl border-2 text-center transition-all
                                    {selectedSemester === sem
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950'
                    : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                >
                  <h4
                    class="text-sm font-black {selectedSemester === sem
                      ? 'text-indigo-700 dark:text-indigo-400'
                      : 'text-gray-900 dark:text-slate-200'}"
                  >
                    Sem {sem}
                  </h4>
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if currentStep === 3}
      <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
        <div class="text-center">
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
          >
            Question Bank Selection
          </h2>
          <p
            class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
          >
            Select the specific units for the assessment
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Subject Selection -->
          <div class="space-y-4">
            <h4
              class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
            >
              Subject
            </h4>
            <div class="grid grid-cols-1 gap-3">
              {#each data.subjects.filter((s) => s.semester === selectedSemester) as subject}
                <button
                  onclick={() => (selectedSubjectId = subject.id)}
                  class="p-5 rounded-2xl border-2 text-left transition-all
                                    {selectedSubjectId === subject.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-950'
                    : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-indigo-100 dark:hover:border-indigo-900'}"
                >
                  <h4
                    class="text-sm font-black {selectedSubjectId === subject.id
                      ? 'text-indigo-700 dark:text-indigo-400'
                      : 'text-gray-900 dark:text-slate-200'}"
                  >
                    {subject.name}
                  </h4>
                  <span
                    class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest"
                    >{subject.code}</span
                  >
                </button>
              {:else}
                <p
                  class="text-[10px] text-gray-400 dark:text-slate-500 font-bold italic text-center p-8 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800"
                >
                  No subjects found for this semester.
                </p>
              {/each}
            </div>
          </div>

          <div class="lg:col-span-2 space-y-4">
            <div class="flex flex-col gap-3">
              <h4
                class="text-xs font-black text-gray-400 uppercase tracking-widest ml-1"
              >
                Syllabus Coverage / Question Bank Units
              </h4>
              <div class="flex flex-wrap gap-2">
                <button
                  onclick={selectAllUnits}
                  class="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-lg border border-indigo-100 dark:border-indigo-800 uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
                  >Full Syllabus</button
                >
                {#each [1, 2, 3, 4, 5] as n}
                  <button
                    onclick={() => selectUpToUnit(n)}
                    class="px-3 py-1.5 bg-white dark:bg-slate-900 text-gray-400 dark:text-slate-500 text-[10px] font-black rounded-lg border border-gray-100 dark:border-slate-800 uppercase tracking-widest hover:border-indigo-600 hover:text-indigo-600 transition-all"
                    >Up to Unit {n}</button
                  >
                {/each}
              </div>
            </div>

            {#if isLoadingTopics}
              <div
                class="p-20 flex justify-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800"
              >
                <div
                  class="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"
                ></div>
              </div>
            {:else}
              <div class="flex flex-col gap-4">
                {#each unitsWithTopics as unit}
                  <div
                    class="flex flex-col bg-white dark:bg-slate-900 rounded-2xl border-2 transition-all overflow-hidden
                                     {selectedUnitIds.includes(unit.id)
                      ? 'border-indigo-600 shadow-xl'
                      : 'border-gray-100 dark:border-slate-800'}"
                  >
                    <div
                      role="button"
                      tabindex="0"
                      class="p-5 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"
                      onclick={() => toggleUnit(unit.id)}
                      onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleUnit(unit.id);
                        }
                      }}
                    >
                      <div class="flex items-center gap-4">
                        <button
                          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          aria-label="Toggle unit expansion"
                          onclick={(e) => {
                            e.stopPropagation();
                            expandedUnitId =
                              expandedUnitId === unit.id ? null : unit.id;
                          }}
                        >
                          <svg
                            class="w-4 h-4 transition-transform {expandedUnitId ===
                            unit.id
                              ? 'rotate-180'
                              : ''}"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2.5"
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                        <div>
                          <h4
                            class="text-[10px] font-black uppercase text-indigo-400 mb-0.5"
                          >
                            Unit {unit.unit_number}
                          </h4>
                          <h3
                            class="text-xs font-black {selectedUnitIds.includes(
                              unit.id,
                            )
                              ? 'text-indigo-700 dark:text-indigo-400'
                              : 'text-gray-900 dark:text-slate-200'}"
                          >
                            {unit.name}
                          </h3>
                        </div>
                      </div>

                      <div class="flex items-center gap-4">
                        <!-- Count Summary -->
                        <div class="hidden sm:flex items-center gap-2">
                          {#each Object.entries(unit.question_counts || {}) as [m, count]}
                            <span
                              class="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 rounded text-[9px] font-bold text-gray-500"
                              >{count}×{m}M</span
                            >
                          {/each}
                        </div>

                        <div
                          class="w-7 h-7 rounded-xl border-2 flex items-center justify-center {selectedUnitIds.includes(
                            unit.id,
                          )
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'border-gray-200 dark:border-slate-700'}"
                        >
                          {#if selectedUnitIds.includes(unit.id)}
                            <svg
                              class="w-4"
                              fill="none"
                              stroke="white"
                              viewBox="0 0 24 24"
                              ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="4"
                                d="M5 13l4 4L19 7"
                              /></svg
                            >
                          {/if}
                        </div>
                      </div>
                    </div>

                    {#if expandedUnitId === unit.id}
                      <div
                        class="px-5 pb-5 pt-2 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50"
                        transition:slide
                      >
                        <div class="grid grid-cols-1 gap-2">
                          <div class="flex items-center justify-between mb-2">
                            <h5
                              class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
                            >
                              Select Specific Topics
                            </h5>
                            <button
                              class="text-[9px] font-black text-indigo-600 uppercase tracking-tighter"
                              onclick={(e) => {
                                e.stopPropagation();
                                const allTopicIdsInUnit = (
                                  unit.topics || []
                                ).flatMap((t: any) => t.all_ids || [t.id]);
                                selectedTopicIds = [
                                  ...new Set([
                                    ...selectedTopicIds,
                                    ...allTopicIdsInUnit,
                                  ]),
                                ];
                              }}>Select All</button
                            >
                          </div>

                          {#each unit.topics || [] as topic}
                            <button
                              class="flex items-center justify-between p-3 rounded-xl border-2 transition-all
                                     {topic.all_ids.every((tid: string) =>
                                selectedTopicIds.includes(tid),
                              )
                                ? 'bg-white dark:bg-slate-800 border-indigo-400 shadow-sm'
                                : 'bg-white/50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800'}"
                              onclick={(e) => {
                                e.stopPropagation();
                                toggleTopic(topic, unit.id);
                              }}
                            >
                              <div class="flex items-center gap-3">
                                <div
                                  class="w-4 h-4 rounded border flex items-center justify-center {topic.all_ids.every(
                                    (tid: string) =>
                                      selectedTopicIds.includes(tid),
                                  )
                                    ? 'bg-indigo-500 border-indigo-500'
                                    : 'border-gray-300'}"
                                >
                                  {#if topic.all_ids.every( (tid: string) => selectedTopicIds.includes(tid), )}
                                    <svg
                                      class="w-2.5"
                                      fill="none"
                                      stroke="white"
                                      viewBox="0 0 24 24"
                                      ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="5"
                                        d="M5 13l4 4L19 7"
                                      ></path></svg
                                    >
                                  {/if}
                                </div>
                                <span
                                  class="text-[10px] font-bold {topic.all_ids.every(
                                    (tid: string) =>
                                      selectedTopicIds.includes(tid),
                                  )
                                    ? 'text-gray-900 dark:text-white'
                                    : 'text-gray-500'}">{topic.name}</span
                                >
                              </div>
                              <div class="flex gap-1">
                                {#each Object.entries(topic.question_counts || {}) as [m, count]}
                                  <span
                                    class="text-[8px] font-black text-indigo-400/70"
                                    >{count}×{m}M</span
                                  >
                                {/each}
                              </div>
                            </button>

                            <!-- Sessions inside this topic (portion: Module → Topic → Session) -->
                            {#if topic.sessions?.length}
                              <div class="ml-7 mt-1 mb-2 space-y-0.5 border-l border-gray-200 dark:border-slate-700 pl-3">
                                {#each topic.sessions as session}
                                  {@const sids = session.all_ids?.length ? session.all_ids : [session.id]}
                                  {@const on = sids.every((sid: string) => selectedTopicIds.includes(sid))}
                                  <button
                                    type="button"
                                    class="w-full flex items-center justify-between py-1 pr-1 text-left group/sess"
                                    onclick={(e) => {
                                      e.stopPropagation();
                                      toggleSession(session, unit.id);
                                    }}
                                  >
                                    <div class="flex items-center gap-2.5 min-w-0">
                                      <div
                                        class="w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 {on
                                          ? 'bg-indigo-500 border-indigo-500'
                                          : 'border-gray-300 dark:border-slate-600'}"
                                      >
                                        {#if on}
                                          <svg class="w-2" fill="none" stroke="white" viewBox="0 0 24 24"
                                            ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="6" d="M5 13l4 4L19 7" /></svg
                                          >
                                        {/if}
                                      </div>
                                      <span
                                        class="text-[9.5px] font-semibold truncate {on
                                          ? 'text-gray-900 dark:text-white'
                                          : 'text-gray-400'}">{session.name}</span
                                      >
                                    </div>
                                    <div class="flex gap-1 shrink-0">
                                      {#each Object.entries(session.question_counts || {}) as [m, count]}
                                        <span class="text-[8px] font-black text-indigo-400/60">{count}×{m}M</span>
                                      {/each}
                                    </div>
                                  </button>
                                {/each}
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Generation Strategy Choice -->
        <div
          class="mt-12 p-10 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-[2.5rem] border-2 border-dashed border-indigo-100 dark:border-indigo-800 flex flex-col items-center text-center space-y-6"
        >
          <div class="space-y-2">
            <h3
              class="text-xl font-black text-indigo-900 dark:text-indigo-400 tracking-tight"
            >
              Generation Strategy
            </h3>
            <p
              class="text-sm text-indigo-600 dark:text-indigo-300/70 font-bold max-w-lg"
            >
              Standard logic distributes questions evenly. Modifiable mode
              allows you to specify exact units for each question position.
            </p>
          </div>

          <div
            class="flex bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-xl shadow-indigo-100/50 dark:shadow-indigo-950/50 border border-indigo-100 dark:border-indigo-800"
          >
            {#each ["Standard", "Modifiable"] as mode}
              <button
                onclick={() => {
                  generationMode = mode;
                  if (mode === "Standard") initializeStructure(true);
                }}
                class="px-10 py-3 rounded-xl text-xs font-black transition-all uppercase tracking-widest
                                {generationMode === mode
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}"
                >{mode}</button
              >
            {/each}
          </div>

          <div class="flex flex-col items-center gap-3">
            <span
              class="text-[10px] font-black text-indigo-400 uppercase tracking-widest"
              >Part A Question Type</span
            >
            <div
              class="flex bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-indigo-100 dark:border-indigo-800 shadow-sm"
            >
              {#each ["Normal", "MCQ", "Mixed"] as type}
                <button
                  onclick={() => {
                    partAType = type;
                    if (generationMode === "Modifiable") initializeStructure();
                  }}
                  class="px-6 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest
                                    {partAType === type
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}"
                  >{type}</button
                >
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if currentStep === 4}
      {#if generationMode === "Standard"}
        <div
          class="flex flex-col items-center justify-center space-y-6 py-20"
          in:fly={{ y: 20, duration: 400 }}
        >
          <div
            class="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-600"
          >
            <svg
              class="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M5 13l4 4L19 7"
              /></svg
            >
          </div>
          <div class="text-center">
            <h2
              class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
            >
              Standard Distribution
            </h2>
            <p class="text-sm text-gray-400 dark:text-slate-500 font-bold mt-2">
              Questions will be distributed evenly across all selected units.
            </p>
          </div>
          <button
            onclick={() => currentStep++}
            class="px-8 py-3 bg-indigo-600 text-white text-xs font-black rounded-xl uppercase tracking-widest shadow-xl shadow-indigo-100"
            >Proceed to Preview</button
          >
        </div>
      {:else}
        <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
          <div class="text-center">
            <h2
              class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
            >
              Paper Structure Configuration
            </h2>
            <p
              class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
            >
              Assign units and sub-question requirements for each position
            </p>
          </div>

          <div class="space-y-12">
            {#each paperStructure as section}
              <div class="space-y-4">
                <div class="flex flex-col gap-3 px-2">
                  <div class="flex items-center justify-between gap-4">
                    {#if isADYPU}
                      <div class="flex items-center gap-3 flex-1">
                        <select
                          value={section.answered_count === 1 ? "one" : section.answered_count === 2 ? "two" : section.answered_count === 3 ? "three" : "custom"}
                          onchange={(e) => {
                            const val = e.currentTarget.value;
                            if (val === "one") {
                              section.answered_count = 1;
                              section.title = "Attempt any one";
                              section.numSubQuestions = 2;
                              section.slots.forEach((s) => { s.numSubQuestions = 2; s.hasSubQuestions = true; });
                            } else if (val === "two") {
                              section.answered_count = 2;
                              section.title = "Attempt any Two";
                              section.numSubQuestions = 3;
                              section.slots.forEach((s) => {
                                s.numSubQuestions = 3; s.hasSubQuestions = true;
                                if (!s.marks_c) s.marks_c = s.marks_a || s.marks;
                              });
                            } else if (val === "three") {
                              section.answered_count = 3;
                              section.title = "Attempt any Three";
                              section.numSubQuestions = 4;
                              section.slots.forEach((s) => {
                                s.numSubQuestions = 4; s.hasSubQuestions = true;
                                if (!s.marks_c) s.marks_c = s.marks_a || s.marks;
                                if (!s.marks_d) s.marks_d = s.marks_a || s.marks;
                              });
                            }
                            paperStructure = [...paperStructure];
                          }}
                          class="bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest focus:ring-2 focus:ring-amber-500/20"
                        >
                          <option value="one">Attempt any One (2 sub-Qs: a,b)</option>
                          <option value="two">Attempt any Two (3 sub-Qs: a,b,c)</option>
                          <option value="three">Attempt any Three (4 sub-Qs: a,b,c,d)</option>
                        </select>
                        <div class="h-px flex-1 bg-amber-100 dark:bg-amber-800/50"></div>
                      </div>
                    {:else}
                      <h3
                        class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-4 flex-1"
                      >
                        {section.title}
                        <div class="h-px flex-1 bg-gray-100 dark:bg-slate-800"></div>
                      </h3>
                    {/if}

                    <button
                      onclick={() => {
                        paperStructure = paperStructure.filter((s) => s !== section);
                        refreshLabels();
                      }}
                      class="px-2 py-1.5 bg-red-50 text-red-500 rounded-lg text-[9px] font-black uppercase hover:bg-red-600 hover:text-white transition-all"
                      title="Remove Section"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div class="flex items-center gap-6">
                    <div class="flex items-center gap-2">
                      <span
                        class="text-[9px] font-black text-gray-400 uppercase"
                        >Answer</span
                      >
                      <input
                        type="number"
                        bind:value={section.answered_count}
                        class="w-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-1.5 text-[10px] font-black text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <span
                        class="text-[9px] font-black text-gray-400 uppercase"
                        >X</span
                      >
                      <input
                        type="number"
                        bind:value={section.marks_per_q}
                        oninput={() => {
                          const m = Number(section.marks_per_q || 0);
                          section.slots.forEach((s: any) => {
                            s.marks = m;
                            if (s.choices)
                              s.choices.forEach((c: any) => (c.marks = m));
                          });
                        }}
                        class="w-12 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-1.5 text-[10px] font-black text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <span
                        class="text-[9px] font-black text-gray-400 uppercase"
                        >Marks</span
                      >
                    </div>

                    <div class="flex items-center gap-2">
                      <button
                        onclick={() => initializeStructure(true)}
                        class="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                        >Reset to Defaults</button
                      >
                      <button
                        onclick={() => addSingleSlot(section)}
                        class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >+ Single Q</button
                      >
                      <button
                        onclick={() => addOrGroup(section)}
                        class="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >+ OR Pair</button
                      >
                    </div>
                  </div>

                  {#if generationMode === "Modifiable"}
                    <div class="flex justify-end mb-2 pr-2">
                      <button
                        onclick={saveAsTemplate}
                        class="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
                      >
                        <svg
                          class="w-3"
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
                        Save Format as Repository Template
                      </button>
                    </div>
                  {/if}
                </div>

                <div
                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {#each section.slots as slot}
                    {#if slot.type === "SINGLE"}
                      <div
                        class="p-6 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-[2rem] shadow-sm hover:shadow-md transition-all space-y-4 relative group"
                      >
                        <button
                          onclick={() => removeSlot(section, slot.id)}
                          class="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-lg"
                          aria-label="Remove Slot"
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

                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-3">
                            <div
                              class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black"
                            >
                              {slot.label}
                            </div>
                            <div class="flex flex-col">
                              <div
                                class="text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                              >
                                Question {slot.label}
                              </div>
                              <div
                                class="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase"
                              >
                                {slot.marks} Marks
                              </div>
                            </div>
                          </div>

                          <button
                            onclick={() => {
                              slot.hasSubQuestions = !slot.hasSubQuestions;
                              if (slot.hasSubQuestions && !slot.numSubQuestions) {
                                slot.numSubQuestions = 2;
                                slot.marks_a = slot.marks_a || Math.round(slot.marks / 2);
                                slot.marks_b = slot.marks_b || Math.round(slot.marks / 2);
                              }
                            }}
                            class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all
                                                              {slot.hasSubQuestions
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-100 dark:border-slate-800 opacity-50'}"
                          >
                            Sub-Qs ({#if slot.numSubQuestions >= 3}a,b,c{:else}a,b{/if})
                          </button>
                        </div>

                        {#if slot.hasSubQuestions}
                          <div
                            class="bg-amber-50/50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100/50 dark:border-amber-800/50 space-y-3"
                            transition:slide
                          >
                            <div class="flex items-center gap-3">
                              <span class="text-[9px] font-black text-amber-500 uppercase tracking-widest">Sub-Questions:</span>
                              <div class="flex gap-1">
                                {#each [2, 3] as n}
                                  <button
                                    onclick={() => {
                                      slot.numSubQuestions = n;
                                      if (n >= 3 && !slot.marks_c) slot.marks_c = slot.marks_a || Math.round(slot.marks / n);
                                    }}
                                    class="px-3 py-1 rounded-lg text-[10px] font-black border transition-all
                                      {(slot.numSubQuestions || 2) === n
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-white dark:bg-slate-900 text-amber-600 border-amber-200 dark:border-amber-800'}"
                                  >{n} ({#if n === 2}a,b{:else}a,b,c{/if})</button>
                                {/each}
                              </div>
                            </div>
                            <div class="grid gap-4" style="grid-template-columns: repeat({slot.numSubQuestions || 2}, 1fr);">
                              <div class="space-y-1">
                                <span class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1">Marks (a)</span>
                                <input type="number" step="0.5" bind:value={slot.marks_a}
                                  class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm" />
                              </div>
                              <div class="space-y-1">
                                <span class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1">Marks (b)</span>
                                <input type="number" step="0.5" bind:value={slot.marks_b}
                                  class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm" />
                              </div>
                              {#if (slot.numSubQuestions || 2) >= 3}
                                <div class="space-y-1">
                                  <span class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1">Marks (c)</span>
                                  <input type="number" step="0.5" bind:value={slot.marks_c}
                                    class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm" />
                                </div>
                              {/if}
                            </div>
                          </div>
                        {/if}

                        <div class="space-y-4 pt-2">
                          <div class="space-y-2">
                            <div
                              class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                            >
                              Question Category
                            </div>
                            <select
                              bind:value={slot.qType}
                              onchange={() => {
                                if (
                                  slot.qType === "SHORT" &&
                                  slot.marks === 5
                                ) {
                                  slot.marks = 2;
                                } else if (
                                  slot.qType === "MCQ" ||
                                  slot.qType === "FILL_IN_BLANK"
                                ) {
                                  slot.marks = 1;
                                }
                              }}
                              class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl p-2 text-[10px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value="ANY" class="dark:bg-slate-800"
                                >Any Category</option
                              >
                              <option value="NORMAL" class="dark:bg-slate-800"
                                >Normal</option
                              >
                              <option
                                value="VERY_SHORT"
                                class="dark:bg-slate-800">Very Short</option
                              >
                              <option value="SHORT" class="dark:bg-slate-800"
                                >Short</option
                              >
                              <option value="LONG" class="dark:bg-slate-800"
                                >Long</option
                              >
                              <option
                                value="VERY_LONG"
                                class="dark:bg-slate-800">Very Long</option
                              >
                              <option value="MCQ" class="dark:bg-slate-800"
                                >MCQ</option
                              >
                              <option
                                value="FILL_IN_BLANK"
                                class="dark:bg-slate-800">Fill in Blanks</option
                              >
                              <option
                                value="PARAGRAPH"
                                class="dark:bg-slate-800">Paragraph</option
                              >
                            </select>
                          </div>

                          <div class="space-y-2">
                            <div
                              class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                            >
                              Bloom's Level
                            </div>
                            <div class="flex gap-1">
                              {#each ["ANY", "L1", "L2", "L3"] as level}
                                <button
                                  onclick={() => (slot.bloom = level)}
                                  class="flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                    {slot.bloom ===
                                  level
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700'}"
                                  >{level}</button
                                >
                              {/each}
                            </div>
                          </div>

                          <div class="space-y-2">
                            <div
                              class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                            >
                              Course Outcome
                            </div>
                            <select
                              bind:value={slot.co_id}
                              class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl p-2 text-[10px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value={null} class="dark:bg-slate-800"
                                >Any CO</option
                              >
                              {#each courseOutcomes as co}
                                <option value={co.id} class="dark:bg-slate-800"
                                  >{co.code}</option
                                >
                              {/each}
                            </select>
                          </div>

                          <div class="space-y-2">
                            <div
                              class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                            >
                              Assigned Unit
                            </div>
                            <div class="grid grid-cols-3 gap-1">
                              <button
                                onclick={() => (slot.unit = "Auto")}
                                class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                {slot.unit ===
                                'Auto'
                                  ? 'bg-slate-900 border-slate-900 dark:bg-indigo-500 dark:border-indigo-500 text-white'
                                  : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'}"
                                >Auto</button
                              >
                              {#each unitsWithTopics.filter( (u) => selectedUnitIds.includes(u.id), ) as unit}
                                <button
                                  onclick={() => (slot.unit = unit.id)}
                                  class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                    {slot.unit ===
                                  unit.id
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-900'}"
                                  >U{unit.unit_number}</button
                                >
                              {/each}
                            </div>
                          </div>
                        </div>
                      </div>
                    {:else}
                      <!-- OR GROUP CARD -->
                      <div
                        class="p-6 bg-indigo-50/30 border border-indigo-100/50 rounded-[2.5rem] shadow-sm space-y-6 md:col-span-2 lg:col-span-3 relative group"
                      >
                        <button
                          onclick={() => removeSlot(section, slot.id)}
                          class="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-lg z-10"
                          aria-label="Remove Slot"
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

                        <div class="flex items-center gap-4">
                          <div
                            class="px-6 py-2 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 dark:shadow-indigo-950"
                          >
                            {slot.displayLabel}
                          </div>
                          <div
                            class="h-px flex-1 bg-indigo-100 dark:bg-slate-800"
                          ></div>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {#each slot.choices as choice, idx}
                            <div
                              class="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-white dark:border-slate-800 shadow-sm space-y-5"
                            >
                              <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                  <div
                                    class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-black"
                                  >
                                    {choice.label}
                                  </div>
                                  <div
                                    class="text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                                  >
                                    {choice.marks} Marks
                                  </div>
                                </div>

                                <button
                                  onclick={() =>
                                    (choice.hasSubQuestions =
                                      !choice.hasSubQuestions)}
                                  class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all
                                                                    {choice.hasSubQuestions
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                    : 'bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border border-gray-100 dark:border-slate-800 opacity-50'}"
                                >
                                  Sub-Qs (a,b)
                                </button>
                              </div>

                              {#if choice.hasSubQuestions}
                                <div
                                  class="grid grid-cols-2 gap-4 bg-amber-50/50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100/50 dark:border-amber-800/50"
                                  transition:slide
                                >
                                  <div class="space-y-1">
                                    <span
                                      class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1"
                                      >Marks (a)</span
                                    >
                                    <input
                                      type="number"
                                      step="0.5"
                                      bind:value={choice.marks_a}
                                      class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm"
                                    />
                                  </div>
                                  <div class="space-y-1">
                                    <span
                                      class="text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest ml-1"
                                      >Marks (b)</span
                                    >
                                    <input
                                      type="number"
                                      step="0.5"
                                      bind:value={choice.marks_b}
                                      class="w-full bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl p-2 text-xs font-black text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm"
                                    />
                                  </div>
                                  {#if choice.marks_a + choice.marks_b !== choice.marks}
                                    <div
                                      class="col-span-2 text-[9px] font-black text-red-500 bg-red-50 dark:bg-red-900/10 px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/30 flex items-center gap-2"
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
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        /></svg
                                      >
                                      Total must be {choice.marks} marks
                                    </div>
                                  {/if}
                                </div>
                              {/if}

                              <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-2">
                                  <div
                                    class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                                  >
                                    Category
                                  </div>
                                  <select
                                    bind:value={choice.qType}
                                    onchange={() => {
                                      if (
                                        choice.qType === "MCQ" ||
                                        choice.qType === "FILL_IN_BLANK"
                                      ) {
                                        choice.marks = 1;
                                      }
                                    }}
                                    class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg p-1.5 text-[9px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                                  >
                                    <option
                                      value="NORMAL"
                                      class="dark:bg-slate-800">Normal</option
                                    >
                                    <option
                                      value="VERY_SHORT"
                                      class="dark:bg-slate-800"
                                      >Very Short</option
                                    >
                                    <option
                                      value="SHORT"
                                      class="dark:bg-slate-800">Short</option
                                    >
                                    <option
                                      value="LONG"
                                      class="dark:bg-slate-800">Long</option
                                    >
                                    <option
                                      value="VERY_LONG"
                                      class="dark:bg-slate-800"
                                      >Very Long</option
                                    >
                                    <option
                                      value="MCQ"
                                      class="dark:bg-slate-800">MCQ</option
                                    >
                                    <option
                                      value="FILL_IN_BLANK"
                                      class="dark:bg-slate-800"
                                      >Fill in Blanks</option
                                    >
                                    <option
                                      value="PARAGRAPH"
                                      class="dark:bg-slate-800"
                                      >Paragraph</option
                                    >
                                  </select>
                                </div>
                                <div class="space-y-2">
                                  <div
                                    class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                                  >
                                    Bloom's Level
                                  </div>
                                  <div class="flex gap-1">
                                    {#each ["ANY", "L1", "L2", "L3"] as level}
                                      <button
                                        onclick={() => (choice.bloom = level)}
                                        class="flex-1 py-1 px-1 rounded-lg text-[9px] font-black border transition-all
                                                                                {choice.bloom ===
                                        level
                                          ? 'bg-indigo-600 text-white border-indigo-600'
                                          : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700'}"
                                        >{level}</button
                                      >
                                    {/each}
                                  </div>
                                </div>
                                <div class="space-y-2">
                                  <div
                                    class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                                  >
                                    CO
                                  </div>
                                  <select
                                    bind:value={choice.co_id}
                                    class="w-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-lg p-1.5 text-[9px] font-black text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                                  >
                                    <option
                                      value={null}
                                      class="dark:bg-slate-800">Any</option
                                    >
                                    {#each courseOutcomes as co}
                                      <option
                                        value={co.id}
                                        class="dark:bg-slate-800"
                                        >{co.code}</option
                                      >
                                    {/each}
                                  </select>
                                </div>
                                <div class="space-y-2">
                                  <div
                                    class="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1"
                                  >
                                    Unit
                                  </div>
                                  <div class="grid grid-cols-3 gap-1">
                                    <button
                                      onclick={() => (choice.unit = "Auto")}
                                      class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                            {choice.unit ===
                                      'Auto'
                                        ? 'bg-slate-900 border-slate-900 dark:bg-indigo-500 dark:border-indigo-500 text-white'
                                        : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'}"
                                      >Auto</button
                                    >
                                    {#each unitsWithTopics.filter( (u) => selectedUnitIds.includes(u.id), ) as unit}
                                      <button
                                        onclick={() => (choice.unit = unit.id)}
                                        class="px-2 py-1.5 rounded-lg text-[10px] font-black border transition-all
                                                                                {choice.unit ===
                                        unit.id
                                          ? 'bg-indigo-600 text-white border-indigo-600'
                                          : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-900'}"
                                        >U{unit.unit_number}</button
                                      >
                                    {/each}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {#if idx === 0}
                              <div
                                class="lg:hidden flex items-center justify-center -my-3"
                              >
                                <div
                                  class="px-4 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-sm"
                                >
                                  OR
                                </div>
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
            <div
              class="pt-8 border-t border-indigo-100 dark:border-slate-800 flex justify-center"
            >
              <button
                onclick={addSection}
                class="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95 flex items-center gap-3"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M12 4v16m8-8H4"
                  /></svg
                >
                Add Another Section
              </button>
            </div>
          </div>
        </div>
      {/if}
      <div
        class="grid grid-cols-1 lg:grid-cols-2 gap-12"
        in:fly={{ y: 20, duration: 400 }}
      >
        <!-- Configuration Form -->
        <div class="space-y-8">
          <div>
            <h2
              class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
            >
              Metadata & Template
            </h2>
            <p
              class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
            >
              Fine-tune the output presentation
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label
                for="exam-date"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Examination Date</label
              >
              <input
                id="exam-date"
                type="date"
                bind:value={examDate}
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
            <div class="space-y-2">
              <label
                for="exam-time"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Start Time</label
              >
              <input
                id="exam-time"
                type="text"
                bind:value={examTime}
                placeholder="e.g. 10:00 AM"
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
            <div class="space-y-2">
              <label
                for="exam-duration"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Duration (Mins)</label
              >
              <input
                id="exam-duration"
                type="number"
                bind:value={examDuration}
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
            <div class="space-y-2">
              <label
                for="max-marks"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Max Marks</label
              >
              <input
                id="max-marks"
                type="number"
                bind:value={maxMarks}
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
            <div class="space-y-2 md:col-span-2">
              <label
                for="course-override"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Course Code Override</label
              >
              <input
                id="course-override"
                type="text"
                bind:value={courseCodeManual}
                placeholder={activeSubject?.code || "CS-XXXX"}
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm uppercase placeholder:text-gray-300 dark:placeholder:text-slate-700"
              />
            </div>
            <div class="space-y-2 md:col-span-2">
              <label
                for="exam-title"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Exam Title Header</label
              >
              <input
                id="exam-title"
                type="text"
                bind:value={examTitleHeader}
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
            <div class="space-y-2 md:col-span-2">
              <label
                for="instructions"
                class="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
                >Paper Instructions</label
              >
              <input
                id="instructions"
                type="text"
                bind:value={paperInstructions}
                class="w-full bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
          </div>

          <div class="space-y-4">
            <h4
              class="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest ml-1"
            >
              Load Saved Format
            </h4>
            <select
              onchange={(e: any) => applyTemplate(e.target.value)}
              class="w-full bg-white dark:bg-slate-900 border-2 border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl p-4 text-xs font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 shadow-sm"
            >
              <option value="" class="dark:bg-slate-800"
                >-- Select a Format --</option
              >
              {#each availableTemplates.filter((t) => {
                if (t.slug?.includes("vgu") || t.name
                    ?.toLowerCase()
                    .includes("vgu")) {
                  return isVGU;
                }
                return true;
              }) as template}
                <option value={template.id} class="dark:bg-slate-800"
                  >{template.name} ({template.exam_type})</option
                >
              {/each}
            </select>
          </div>

          <div class="space-y-4">
            <h4 class="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Assessment Type</h4>
            <div class="flex flex-wrap gap-2">
              {#if isSGU}
                {#each [{ value: "SGU_SEM_50", label: "Sem (50 Marks)" }, { value: "SGU_SEM_75", label: "Sem (75 Marks)" }] as type}
                  <button
                    onclick={() => (selectedExamType = type.value)}
                    class="px-4 py-2 rounded-xl border-2 text-[10px] font-black uppercase transition-all
                      {selectedExamType === type.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg'
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-400 dark:text-slate-500 hover:border-indigo-100'}"
                  >{type.label}</button>
                {/each}
              {:else}
                {#each ["MID1", "MID2", "SEM", "SUPPLY", "INTERNAL_LAB", "EXTERNAL_LAB"] as type}
                  <button
                    onclick={() => (selectedExamType = type)}
                    class="px-4 py-2 rounded-xl border-2 text-[10px] font-black uppercase transition-all
                      {selectedExamType === type
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg'
                        : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 text-gray-400 dark:text-slate-500 hover:border-indigo-100'}"
                  >{type.replace(/_/g, " ")}</button>
                {/each}
              {/if}
            </div>
          </div>
        </div>

        <!-- Template Preview (Crescent Style) -->
        <div
          class="bg-gray-900 dark:bg-slate-950 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col"
        >
          <div
            class="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 blur-[60px] rounded-full"
          ></div>
          <div
            class="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/10 blur-[60px] rounded-full"
          ></div>

          <div
            class="flex-1 w-full overflow-y-auto overflow-x-hidden max-h-[650px] bg-slate-100/30 dark:bg-slate-900/50 rounded-[2rem] p-6 border border-indigo-100/20 custom-scrollbar"
          >
            <div class="scale-100 origin-top w-full mx-auto shadow-2xl">
              <div class="mb-4 flex gap-2 justify-center">
                <div
                  class="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2"
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
              </div>

              {#if unfilledSlots.length > 0 || generationWarnings.length > 0}
                <div
                  class="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-left print:hidden"
                >
                  <div
                    class="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-800"
                  >
                    <span class="text-sm">⚠️</span>
                    Question bank gaps — {unfilledSlots.length} slot(s) not filled
                  </div>
                  <ul
                    class="mt-2 space-y-1 text-[11px] font-semibold text-amber-900"
                  >
                    {#each unfilledSlots.slice(0, 6) as u}
                      <li>
                        • <b>Set {u.set} · {u.section || "Section"} Q{u.slot ??
                            "?"}</b>
                        — no <b>{u.type || "question"}</b> available for
                        {u.marks ?? "?"} marks
                      </li>
                    {/each}
                    {#if unfilledSlots.length > 6}
                      <li class="italic">
                        …and {unfilledSlots.length - 6} more.
                      </li>
                    {/if}
                    {#each generationWarnings as w}
                      <li>• {w}</li>
                    {/each}
                  </ul>
                  <p class="mt-2 text-[10px] font-bold text-amber-700">
                    These slots show a placeholder. Add matching questions to the
                    bank for this subject, then regenerate — or swap them in
                    manually on the paper.
                  </p>
                </div>
              {/if}

              {#if previewResolved.status === "missing"}
                <!-- No university template exists — the renderer falls back to the
                     standard format and raises its own caution. -->
                <AssessmentPaperRenderer
                  paperMeta={previewPaperMeta}
                  {paperStructure}
                  bind:currentSetData={previewSetData}
                  layoutSchema={lastLoadedLayout}
                  {courseOutcomes}
                  questionPool={previewQuestionPool}
                  mode="preview"
                  onSwap={(updated: any) => (previewSetData = updated)}
                />
              {:else}
                <TemplateCautionBanner resolved={previewResolved} />
                <PreviewTemplate
                  paperMeta={previewPaperMeta}
                  {paperStructure}
                  bind:currentSetData={previewSetData}
                  {courseOutcomes}
                  questionPool={previewQuestionPool}
                  mode="preview"
                  onSwap={(updated: any) => (previewSetData = updated)}
                />
              {/if}
            </div>
          </div>

          <div class="mt-4 flex flex-col items-center gap-2">
            <div
              class="text-[10px] text-indigo-300 font-black uppercase tracking-widest"
            >
              University Template Preview
            </div>

            {#if poolDeficiency().length > 0}
              <div
                class="mt-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-left w-full"
                in:slide
              >
                <div
                  class="flex items-center gap-2 text-red-400 font-black text-[10px] uppercase tracking-widest mb-2"
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
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    /></svg
                  >
                  Insufficient Questions Found
                </div>
                <ul class="space-y-1">
                  {#each poolDeficiency() as deficiency}
                    <li
                      class="text-[10px] text-gray-400 dark:text-slate-500 font-bold"
                    >
                      Need <span class="text-white dark:text-slate-200"
                        >{deficiency.needs}</span
                      >
                      questions of
                      <span class="text-indigo-400"
                        >{deficiency.marks} Marks</span
                      >, but only found
                      <span class="text-red-400">{deficiency.has}</span>.
                    </li>
                  {/each}
                </ul>
                <p
                  class="text-[9px] text-gray-500 dark:text-slate-600 mt-2 font-medium"
                >
                  Please select more units or adjust Max Marks to resolve the
                  deficiency.
                </p>
              </div>
            {:else}
              <div
                class="mt-2 flex items-center gap-2 text-green-400 font-black text-[10px] uppercase tracking-widest"
                in:fade
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  /></svg
                >
                Question Pool Sufficient
              </div>
            {/if}
          </div>
        </div>
      </div>
    {:else if currentStep === 5}
      <div class="space-y-8" in:fly={{ y: 20, duration: 400 }}>
        <div class="text-center">
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
          >
            Set Configuration
          </h2>
          <p
            class="text-sm font-bold text-gray-400 dark:text-slate-500 mt-1 uppercase tracking-widest"
          >
            Assign difficulty profiles for each paper set
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {#each ["A", "B", "C", "D"] as setName}
            <div
              class="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-sm space-y-6"
            >
              <div class="flex items-center justify-between">
                <div
                  class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg"
                >
                  {setName}
                </div>
                <span
                  class="text-[10px] font-black text-gray-400 uppercase tracking-widest"
                  >Set {setName}</span
                >
              </div>

              <div class="space-y-4">
                <h4
                  class="text-[10px] font-black text-indigo-500 uppercase tracking-widest"
                >
                  Quick Profile
                </h4>
                <div class="grid grid-cols-2 gap-2">
                  {#each [{ name: "Easy", levels: ["L1", "L2"] }, { name: "Medium", levels: ["L2", "L3"] }, { name: "Hard", levels: ["L3", "L4"] }, { name: "Mixed", levels: ["L1", "L2", "L3"] }] as profile}
                    <button
                      onclick={() =>
                        (setsConfig[setName] = [...profile.levels])}
                      class="px-3 py-2 rounded-xl border border-gray-100 dark:border-slate-800 text-[9px] font-black uppercase text-gray-500 hover:border-indigo-500 hover:text-indigo-600 transition-all text-center"
                    >
                      {profile.name}
                    </button>
                  {/each}
                </div>
              </div>

              <div class="space-y-4">
                <h4
                  class="text-[10px] font-black text-indigo-500 uppercase tracking-widest"
                >
                  Difficulty Levels
                </h4>
                <div class="flex flex-col gap-2">
                  {#each activeSubject?.difficulty_levels || ["L1", "L2", "L3", "L4", "L5"] as level}
                    <button
                      onclick={() => {
                        if (setsConfig[setName].includes(level)) {
                          setsConfig[setName] = setsConfig[setName].filter(
                            (l) => l !== level,
                          );
                        } else {
                          setsConfig[setName] = [...setsConfig[setName], level];
                        }
                        // Ensure at least one level is selected or "ANY"
                        if (setsConfig[setName].length === 0)
                          setsConfig[setName] = ["ANY"];
                        else if (
                          setsConfig[setName].includes("ANY") &&
                          setsConfig[setName].length > 1
                        ) {
                          setsConfig[setName] = setsConfig[setName].filter(
                            (l) => l !== "ANY",
                          );
                        }
                      }}
                      class="flex items-center justify-between p-3 rounded-xl border-2 transition-all
                                            {setsConfig[setName].includes(level)
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-slate-800/50 border-transparent hover:border-gray-200 dark:hover:border-slate-700'}"
                    >
                      <span
                        class="text-[10px] font-black {setsConfig[
                          setName
                        ].includes(level)
                          ? 'text-indigo-700 dark:text-indigo-400'
                          : 'text-gray-400 dark:text-slate-500'}">{level}</span
                      >
                      {#if setsConfig[setName].includes(level)}
                        <svg
                          class="w-3 h-3 text-indigo-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          ><path
                            fill-rule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clip-rule="evenodd"
                          /></svg
                        >
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if currentStep === 6}
      <div
        class="flex flex-col items-center justify-center py-20 space-y-8"
        in:fly={{ y: 20, duration: 400 }}
      >
        <div
          class="w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-[2.5rem] flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-pulse relative"
        >
          <svg
            class="w-16 h-16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            ><path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.022.547l-2.387 2.387a2 2 0 001.414 3.414h15.828a2 2 0 001.414-3.414l-2.387-2.387zM12 9V3m0 0l-3 3m3-3l3 3"
            /></svg
          >
          <div
            class="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg"
          >
            READY
          </div>
        </div>

        <div class="text-center max-w-md">
          <h2
            class="text-2xl font-black text-gray-900 dark:text-white tracking-tight"
          >
            Generate Question Sets
          </h2>
          <p class="text-sm text-gray-500 dark:text-slate-500 font-medium mt-2">
            The AI algorithm will create 4 unique sets (A, B, C, D) using
            questions from the {selectedUnitIds.length} selected units, ensuring
            variety and coverage.
          </p>
        </div>

        <div class="flex gap-4">
          <button
            onclick={generateSets}
            disabled={isGenerating}
            class="px-10 py-4 bg-indigo-600 text-white text-sm font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 dark:shadow-indigo-950/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
          >
            {#if isGenerating}
              <svg class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24"
                ><circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                  fill="none"
                ></circle><path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path></svg
              >
              GENERATING SETS...
            {:else}
              GENERATE ALL 4 SETS
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Navigation Buttons -->
  <div class="flex justify-between items-center pt-8 border-t border-gray-100">
    <button
      onclick={prevStep}
      disabled={currentStep === 1}
      class="px-8 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-400 dark:text-slate-500 text-sm font-black rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
      >BACK</button
    >

    <button
      onclick={nextStep}
      disabled={currentStep === 6}
      class="px-10 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 dark:shadow-indigo-950/40 uppercase tracking-widest active:scale-95 disabled:opacity-0"
      >CONTINUE</button
    >
  </div>
</div>

<style>
  :global(.tracking-widest) {
    letter-spacing: 0.15em;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #cbd5e1;
  }
  input::-webkit-calendar-picker-indicator {
    filter: invert(0.5);
  }
</style>
