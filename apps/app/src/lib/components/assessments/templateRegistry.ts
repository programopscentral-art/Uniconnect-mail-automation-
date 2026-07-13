/**
 * Maps canonical template slugs to their Svelte components.
 *
 * The routing rules live in `templateSlug.ts` (pure, unit-tested). This file is
 * only the slug → component table, so adding a university template is a one-line
 * change here plus the component itself.
 */

import ADYPUSemTemplate from "./ADYPUSemTemplate.svelte";
import ADYPUTemplate from "./ADYPUTemplate.svelte";
import AMETTemplate from "./AMETTemplate.svelte";
import AnnamacharyaTemplate from "./AnnamacharyaTemplate.svelte";
import CDUTemplate from "./CDUTemplate.svelte";
import CrescentMidTemplate from "./CrescentMidTemplate.svelte";
import CrescentTemplate from "./CrescentTemplate.svelte";
import MallareddyTemplate from "./MallareddyTemplate.svelte";
import NRITemplate from "./NRITemplate.svelte";
import SGU50SEMTemplate from "./SGU50SEMTemplate.svelte";
import SGU75SEMTemplate from "./SGU75SEMTemplate.svelte";
import StandardTemplate from "./StandardTemplate.svelte";
import SVYASATemplate from "./SVYASATemplate.svelte";
import TakshashilaTemplate from "./TakshashilaTemplate.svelte";
import VGUMidTemplate from "./VGUMidTemplate.svelte";
import VGUSemTemplate from "./VGUSemTemplate.svelte";
import {
	resolveTemplateMeta,
	UNIVERSITIES,
	type TemplateInput,
	type TemplateMeta,
} from "./templateSlug";

export * from "./templateSlug";
export { StandardTemplate };

/**
 * Templates that actually exist as components today, keyed by canonical slug.
 * A slug missing from here is "not added yet" and triggers the caution banner.
 */
export const TEMPLATE_REGISTRY: Record<string, any> = {
	cdumid: CDUTemplate,
	crescentmid: CrescentMidTemplate,
	crescentsem: CrescentTemplate,
	adypumid: ADYPUTemplate,
	adypusem: ADYPUSemTemplate,
	vgumid: VGUMidTemplate,
	vgusem: VGUSemTemplate,
	ametsem: AMETTemplate,
	annamacharyamid: AnnamacharyaTemplate,
	takshashilamid: TakshashilaTemplate,
	svyasamid: SVYASATemplate,
	nrimid: NRITemplate,
	mrvmid: MallareddyTemplate,
	sgusem50: SGU50SEMTemplate,
	sgusem75: SGU75SEMTemplate,
};

export const READY_SLUGS = new Set(Object.keys(TEMPLATE_REGISTRY));

export interface ResolvedTemplate extends TemplateMeta {
	component: any;
}

/** Resolve which component renders a paper. See `resolveTemplateMeta` for the rules. */
export function resolvePaperTemplate(opts: TemplateInput): ResolvedTemplate {
	const meta = resolveTemplateMeta(opts, READY_SLUGS);
	return {
		...meta,
		component: TEMPLATE_REGISTRY[meta.renderSlug] ?? StandardTemplate,
	};
}

/** Coverage report: which universities still need a MID / SEM template built. */
export function templateCoverage() {
	return Object.keys(UNIVERSITIES).flatMap((uniKey) =>
		(["mid", "sem"] as const).map((kind) => {
			const slugs =
				uniKey === "sgu" && kind === "sem" ? ["sgusem50", "sgusem75"] : [`${uniKey}${kind}`];
			return {
				uniKey,
				label: UNIVERSITIES[uniKey],
				kind,
				slugs,
				ready: slugs.every((s) => READY_SLUGS.has(s)),
			};
		}),
	);
}
