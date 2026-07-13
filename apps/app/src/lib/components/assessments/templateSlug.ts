/**
 * Pure template-routing logic — no Svelte imports, so it can be unit-tested and
 * reused on the server.
 *
 * Canonical slug format: `{universityKey}{examKind}` — e.g. `cdumid`, `cdusem`,
 * `ametmid`, `ametsem`. SGU is the one university whose end-sem has two variants
 * (50 / 75 marks), so it carries the marks: `sgusem50`, `sgusem75`.
 */

export type ExamKind = "mid" | "sem";
export type TemplateStatus = "ready" | "fallback" | "missing";

/** Every university the assessments module knows about, with display label. */
export const UNIVERSITIES: Record<string, string> = {
	cdu: "Chaitanya (CDU)",
	vgu: "Vivekananda Global University (VGU)",
	crescent: "Crescent (IST)",
	mrv: "Malla Reddy (MRTC)",
	takshashila: "Takshashila University",
	adypu: "Ajeenkya DY Patil University",
	svyasa: "S-VYASA University",
	amet: "AMET",
	annamacharya: "Annamacharya University",
	nri: "NRI Institute of Technology",
	sgu: "Sanjay Ghodawat University",
	aurora: "Aurora University",
	ciet: "CITY & CIET",
	chevella: "NIAT Chevella",
	nsrit: "NSRIT",
	noida: "Noida International University",
	yenepoya: "Yenepoya",
	kkh: "KKH Hyderabad",
};

/** Old `metadata.selected_template` values written by earlier builds. */
const LEGACY_TEMPLATE_TO_UNI: Record<string, string> = {
	cdu: "cdu",
	vgu: "vgu",
	"vgu-standard-mid-term": "vgu",
	crescent: "crescent",
	"crescent-mid": "crescent",
	malla: "mrv",
	mrv: "mrv",
	takshashila: "takshashila",
	adypu: "adypu",
	svyasa: "svyasa",
	amet: "amet",
	annamacharya: "annamacharya",
	nri: "nri",
	sgu50: "sgu",
	sgu75: "sgu",
};

/** Substrings that identify a university from its free-text name. */
const NAME_MATCHERS: [string, string[]][] = [
	["vgu", ["vgu", "vivekananda global"]],
	["cdu", ["cdu", "chaitanya"]],
	["crescent", ["crescent"]],
	["mrv", ["malla", "mrtc", "mrv"]],
	["takshashila", ["takshashila"]],
	["adypu", ["adypu", "ajeenkya", "dy patil"]],
	["svyasa", ["svyasa", "vyasa", "vivekananda yoga"]],
	["amet", ["amet", "maritime"]],
	["annamacharya", ["annamacharya"]],
	["nri", ["nri"]],
	["sgu", ["sgu", "sanjay ghodawat", "shivaji"]],
	["aurora", ["aurora"]],
	["ciet", ["ciet", "city&", "city &"]],
	["chevella", ["chevella"]],
	["nsrit", ["nsrit"]],
	["noida", ["noida"]],
	["yenepoya", ["yenepoya"]],
	["kkh", ["kkh"]],
];

const UNIVERSITY_ID_TO_KEY: Record<string, string> = {
	"8e5403f9-505a-44d1-add4-aae3efaa9248": "cdu",
	"c40ed15d-b3e4-49ba-b1c4-71a2a8526a6f": "vgu",
};

export interface TemplateInput {
	universityName?: string | null;
	universityId?: string | null;
	examType?: string | null;
	examTitle?: string | null;
	maxMarks?: number | string | null;
	metaTemplate?: string | null;
	layoutStyle?: string | null;
}

/** SEM unless the exam type or title says otherwise. */
export function resolveExamKind(examType?: string | null, examTitle?: string | null): ExamKind {
	const t = String(examType || "").toUpperCase();
	if (t.startsWith("SGU_SEM") || t.startsWith("SEM") || t === "END_SEM" || t === "EXTERNAL" || t === "EXTERNAL_LAB" || t === "SUPPLY") {
		return "sem";
	}
	if (t.startsWith("MID") || t === "INTERNAL" || t === "INTERNAL_LAB" || t === "CIA") return "mid";

	const title = String(examTitle || "").toLowerCase();
	if (/\bmid\b|mid[- ]?term|internal|\bcia\b/.test(title)) return "mid";
	return "sem";
}

/** `cdumid` / `ametsem` / `sgusem75` → `cdu` / `amet` / `sgu`. */
function uniKeyFromSlug(value?: string | null): string | null {
	const slug = String(value || "").toLowerCase();
	for (const key of Object.keys(UNIVERSITIES)) {
		if (slug === `${key}mid` || slug.startsWith(`${key}sem`)) return key;
	}
	return null;
}

export function resolveUniversityKey(opts: TemplateInput): string | null {
	// A canonical slug already carries its university, so trust it first. Papers
	// generated after the slug migration carry it in metaTemplate, older ones in
	// layoutStyle — check both.
	const fromSlug = uniKeyFromSlug(opts.layoutStyle) || uniKeyFromSlug(opts.metaTemplate);
	if (fromSlug) return fromSlug;

	const byId = UNIVERSITY_ID_TO_KEY[String(opts.universityId || "").toLowerCase()];
	if (byId) return byId;

	const legacy = LEGACY_TEMPLATE_TO_UNI[String(opts.metaTemplate || "").toLowerCase()];
	if (legacy) return legacy;

	const name = String(opts.universityName || "").toLowerCase();
	for (const [key, needles] of NAME_MATCHERS) {
		if (needles.some((n) => name.includes(n))) return key;
	}
	return null;
}

/** Canonical slug for a university + exam kind. SGU's end-sem splits on marks. */
export function buildSlug(uniKey: string, kind: ExamKind, maxMarks?: number | string | null): string {
	if (uniKey === "sgu" && kind === "sem") {
		return Number(maxMarks) === 75 ? "sgusem75" : "sgusem50";
	}
	return `${uniKey}${kind}`;
}

export interface TemplateMeta {
	/** Canonical slug this paper *should* use, e.g. `cdumid`. */
	slug: string;
	/** Slug actually rendered — differs from `slug` when falling back. */
	renderSlug: string;
	uniKey: string | null;
	universityLabel: string;
	examKind: ExamKind;
	status: TemplateStatus;
	/** Populated for `fallback` / `missing` — shown in the caution banner. */
	message: string;
}

/**
 * Decide which template renders a paper, given the set of slugs that actually
 * have a component built.
 *
 * - `ready`    — the university's template for this exam kind exists.
 * - `fallback` — this exam kind isn't built yet, but the university's *other*
 *                kind is, so we render that (the paper still looks like this
 *                university's paper) and warn.
 * - `missing`  — nothing exists for this university; render the standard format.
 */
export function resolveTemplateMeta(opts: TemplateInput, readySlugs: Set<string>): TemplateMeta {
	const uniKey = resolveUniversityKey(opts);
	const examKind = resolveExamKind(opts.examType, opts.examTitle);

	if (!uniKey) {
		return {
			slug: "standard",
			renderSlug: "standard",
			uniKey: null,
			universityLabel: opts.universityName || "Standard",
			examKind,
			status: "missing",
			message: "No university template is mapped for this paper — showing the standard format.",
		};
	}

	const label = UNIVERSITIES[uniKey] || opts.universityName || uniKey;

	// SGU's end-sem comes in a 50- and a 75-mark variant. Marks decide it, but an
	// explicitly stored 75 slug wins in case the marks field is missing/stale.
	const explicit = String(opts.layoutStyle || opts.metaTemplate || "").toLowerCase();
	const slug =
		uniKey === "sgu" && examKind === "sem" && (explicit === "sgusem75" || explicit === "sgu75")
			? "sgusem75"
			: buildSlug(uniKey, examKind, opts.maxMarks);
	if (readySlugs.has(slug)) {
		return { slug, renderSlug: slug, uniKey, universityLabel: label, examKind, status: "ready", message: "" };
	}

	// Fall back to the same university's other exam kind so the paper still
	// carries its own letterhead and layout family, and flag it loudly.
	const otherKind: ExamKind = examKind === "mid" ? "sem" : "mid";
	const otherSlug = [...readySlugs].find(
		(s) => s === `${uniKey}${otherKind}` || s.startsWith(`${uniKey}${otherKind}`),
	);
	const KIND = examKind.toUpperCase();
	if (otherSlug) {
		return {
			slug,
			renderSlug: otherSlug,
			uniKey,
			universityLabel: label,
			examKind,
			status: "fallback",
			message: `${label}'s ${KIND} template (${slug}) isn't added yet — showing their ${otherKind.toUpperCase()} layout instead. Upload the ${KIND} template to fix the format.`,
		};
	}

	return {
		slug,
		renderSlug: "standard",
		uniKey,
		universityLabel: label,
		examKind,
		status: "missing",
		message: `${label}'s ${KIND} template (${slug}) isn't added yet — showing the standard format. Upload this university's ${KIND} template.`,
	};
}
