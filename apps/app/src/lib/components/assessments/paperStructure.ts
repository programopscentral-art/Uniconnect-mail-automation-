/**
 * Templates render a paper by iterating its sections (`template_config`), so a
 * paper saved with an EMPTY section list paints a header and nothing else — even
 * when the set holds real questions. Rebuild the sections from the questions.
 */

export interface DerivedSection {
	part: string;
	title: string;
	count: number;
	answered_count: number;
	marks_per_q: number;
	slots: { id: string | number; qType: string; marks: number }[];
}

/** Group a set's saved questions by `part` to reconstruct its sections. */
export function deriveStructureFromSet(setData: any): DerivedSection[] | null {
	const wrappers = Array.isArray(setData) ? setData : setData?.questions || [];
	if (!wrappers.length) return null;

	const byPart = new Map<string, any[]>();
	for (const w of wrappers) {
		const part = String(w?.part ?? "A").trim().toUpperCase();
		if (!byPart.has(part)) byPart.set(part, []);
		byPart.get(part)!.push(w);
	}

	return [...byPart.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([part, slots]) => {
			const marksPerQ = Number(slots[0]?.marks) || 0;
			return {
				part,
				title: `PART ${part}`,
				count: slots.length,
				answered_count: slots.length,
				marks_per_q: marksPerQ,
				slots: slots.map((w: any, i: number) => ({
					id: w?.slot_id ?? w?.id ?? i + 1,
					qType: w?.qType || "NORMAL",
					marks: Number(w?.marks) || marksPerQ,
				})),
			};
		});
}

/** The sections to render: the saved ones, or ones rebuilt from the questions. */
export function resolvePaperStructure(templateConfig: any, setData: any): any[] {
	if (Array.isArray(templateConfig) && templateConfig.length > 0) return templateConfig;
	return deriveStructureFromSet(setData) ?? [];
}
