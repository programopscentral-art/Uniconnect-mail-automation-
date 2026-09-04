import { setContext } from "svelte";

/**
 * Shared reordering + Solutions-Mode plumbing for every paper template.
 *
 * Reordering is handle-based drag-and-drop. (It previously used
 * svelte-dnd-action on <tbody> rows, which broke on OR-groups — one question
 * slot renders several <tr> rows, so the library mis-mapped items to rows
 * mid-drag and stacked the text on itself.) Now each question slot exposes a
 * grip (AssessmentDragHandle); dragging a grip and dropping it on another slot's
 * grip reorders the set array directly within the same section. This is
 * deterministic and works identically on table and non-table templates.
 *
 * A template calls `installPaperUi()` once. It publishes on context:
 *   - "paper:drag"         — the drag controller the grips read (start/over/drop).
 *   - "paper:move"         — move(slotId, dir), kept for any programmatic reorder.
 *   - "paper:showSolutions"— a getter so shared slots render answer blocks.
 * and returns `{ ui, move, drag }` for inline templates that wire grips directly.
 */
export function installPaperUi(opts: {
	/** Returns the live current-set value (object with .questions, or a bare array). */
	getSet: () => any;
	/** Persist a reordered set: assign it back to currentSetData and trigger save. */
	persist: (nextSet: any) => void;
}) {
	const ui = $state({ showSolutions: false });
	// Which slot is being dragged / hovered — reactive so grips can highlight.
	const drag = $state<{ id: string | null; overId: string | null }>({ id: null, overId: null });

	function reorder(sourceId: string, targetId: string) {
		if (!sourceId || sourceId === targetId) return;
		const set = opts.getSet();
		const isArr = Array.isArray(set);
		const arr: any[] = (isArr ? set : set?.questions) ?? [];
		const from = arr.findIndex((s) => s?.id === sourceId);
		const to = arr.findIndex((s) => s?.id === targetId);
		if (from < 0 || to < 0) return;
		// Only reorder within the same section/part.
		if ((arr[from]?.part ?? null) !== (arr[to]?.part ?? null)) return;

		const copy = arr.slice();
		const [item] = copy.splice(from, 1);
		const insertAt = copy.findIndex((s) => s?.id === targetId);
		copy.splice(insertAt < 0 ? copy.length : insertAt, 0, item);
		opts.persist(isArr ? copy : { ...set, questions: copy });
	}

	function move(slotId: string, dir: -1 | 1) {
		const set = opts.getSet();
		const isArr = Array.isArray(set);
		const arr: any[] = (isArr ? set : set?.questions) ?? [];
		const idx = arr.findIndex((s) => s?.id === slotId);
		if (idx < 0) return;
		const part = arr[idx]?.part ?? null;
		const siblings: number[] = [];
		for (let i = 0; i < arr.length; i++) {
			if ((arr[i]?.part ?? null) === part) siblings.push(i);
		}
		const pos = siblings.indexOf(idx);
		const swapPos = pos + dir;
		if (swapPos < 0 || swapPos >= siblings.length) return;
		const j = siblings[swapPos];
		const copy = arr.slice();
		[copy[idx], copy[j]] = [copy[j], copy[idx]];
		opts.persist(isArr ? copy : { ...set, questions: copy });
	}

	const dragCtl = {
		get activeId() {
			return drag.id;
		},
		get overId() {
			return drag.overId;
		},
		start(id: string) {
			drag.id = id;
			drag.overId = null;
		},
		setOver(id: string) {
			if (drag.id && id !== drag.overId) drag.overId = id;
		},
		drop(targetId: string) {
			const src = drag.id;
			drag.id = null;
			drag.overId = null;
			if (src) reorder(src, targetId);
		},
		cancel() {
			drag.id = null;
			drag.overId = null;
		},
	};

	/**
	 * Re-save the current set without changing it. Shared leaf components (e.g.
	 * the MCQ option editor) mutate a question in place and then call this so the
	 * edit is persisted, without every call site having to thread a callback.
	 */
	function touch() {
		opts.persist(opts.getSet());
	}

	setContext("paper:drag", dragCtl);
	setContext("paper:move", move);
	setContext("paper:showSolutions", () => ui.showSolutions);
	setContext("paper:touch", touch);

	return { ui, move, drag: dragCtl, touch };
}
