# Assessment Template Guide

To ensure consistency and ease of development for new university templates, use the shared components located in `src/lib/components/assessments/shared/`.

## Core Components

### 1. `AssessmentEditable.svelte`
Used for any text or metadata field that should be editable in 'edit' mode.
- **Props**:
  - `value`: The text/HTML content.
  - `onUpdate`: Callback when focus is lost and content changed.
  - `isEditable`: Boolean to toggle editability.
  - `multiline`: Set to true for question bodies.

### 2. `AssessmentSlotSingle.svelte`
Standard single question row. Handles Sno, Actions (Swap/Delete), Text, and MCQ options.
- **Props**:
  - `slot`: The question object.
  - `qNumber`: The display number.
  - `isEditable`: Boolean.
  - `onSwap`, `onRemove`, `onUpdateText`.

### 3. `AssessmentSlotOrGroup.svelte`
Standard OR-choice question block. Handles Choice 1, "OR" separator, and Choice 2.
- **Props**:
  - `slot`: The OR-group object.
  - `qNumber`: Starting display number.
  - `onSwap1`, `onSwap2`, `onRemove`, etc.

### 4. `AssessmentMcqOptions.svelte`
Smart renderer for MCQ options. Prevents double-labeling (e.g., "(a) A. Option").

---

## Best Practices
- **Never hardcode Chaitanya or Crescent specific logic** in shared slots.
- **Use dynamic marks calculation** in headers:
  ```ts
  let totalMarks = $derived(questions.reduce((sum, q) => sum + (q.marks || 0), 0));
  ```
- **Ensure HTML safety**: Always use `{@html}` in the preview part of the editable if rendering rich text, but `AssessmentEditable` handles the raw innerHTML for you.
- **Responsive Borders**: Use `divide-x` and `border-black` for standard layouts.
