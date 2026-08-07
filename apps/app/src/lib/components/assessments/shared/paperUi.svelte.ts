import { setContext } from "svelte";

/**
 * Shared reordering + Solutions-Mode plumbing for every paper template.
 *
 * Question reordering used to rely on svelte-dnd-action (`use:dndzone`) on
 * <tbody> rows. That broke on OR-groups — one question slot renders several
 * <tr> rows, so the library mis-mapped items to rows mid-drag and stacked the
 * text on top of itself. We replaced it with deterministic Move Up / Move Down
 * buttons that reorder the set array directly.
 *
 * A template calls `installPaperUi()` once. It:
 *   - exposes `move(slotId, dir)` (also published on context "paper:move" so the
 *     shared slot components can render Move buttons with zero per-row wiring), and
 *   - exposes reactive `ui.showSolutions` (published on context
 *     "paper:showSolutions" as a getter so shared slots can render answer blocks).
 */
export function installPaperUi(opts: {
	/** Returns the live current-set value (object with .questions, or a bare array). */
	getSet: () => any;
	/** Persist a reordered set: assign it back to currentSetData and trigger save. */
	persist: (nextSet: any) => void;
}) {
	const ui = $state({ showSolutions: false });

	function move(slotId: string, dir: -1 | 1) {
		const set = opts.getSet();
		const isArr = Array.isArray(set);
		const arr: any[] = (isArr ? set : set?.questions) ?? [];
		const idx = arr.findIndex((s) => s?.id === slotId);
		if (idx < 0) return;

		// Reorder only within the same section/part so a Part-A question can't
		// jump into Part B. Slots with no `part` are treated as one group.
		const part = arr[idx]?.part ?? null;
		const siblings: number[] = [];
		for (let i = 0; i < arr.length; i++) {
			if ((arr[i]?.part ?? null) === part) siblings.push(i);
		}
		const pos = siblings.indexOf(idx);
		const swapPos = pos + dir;
		if (swapPos < 0 || swapPos >= siblings.length) return; // at a boundary

		const j = siblings[swapPos];
		const copy = arr.slice();
		[copy[idx], copy[j]] = [copy[j], copy[idx]];
		opts.persist(isArr ? copy : { ...set, questions: copy });
	}

	setContext("paper:move", move);
	setContext("paper:showSolutions", () => ui.showSolutions);

	return { ui, move };
}
