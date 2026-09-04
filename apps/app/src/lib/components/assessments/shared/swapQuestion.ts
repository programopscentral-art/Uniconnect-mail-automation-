/**
 * Canonical shape for a question placed into a paper slot by the swap picker.
 *
 * Every university template used to build this object inline, and most of them
 * dropped fields on the way — `answer_key` above all, which is why solutions
 * disappeared from a paper as soon as a question was replaced. Templates now call
 * `buildSwappedQuestion()` so a swap preserves everything the generator produced.
 *
 * Keep this the single source of truth: add a field here, not in a template.
 */
export function buildSwappedQuestion(
	question: any,
	opts: {
		/** Marks the SLOT carries; falls back to the question's own marks. */
		marks?: number | string | null;
		/** Section tag ('A' | 'B' | 'C') the slot belongs to. */
		part?: string;
		/** Existing a/b/i/ii label to keep on a sub-question. */
		subLabel?: string | null;
	} = {},
) {
	const text = question?.question_text ?? question?.text ?? '';
	const bloom = question?.bloom_level ?? question?.bloom ?? null;

	// "K2" / "KL2" style level used by the CO/RBT columns.
	const kLevel = question?.k_level
		? String(question.k_level)
		: bloom
			? `K${String(bloom).replace(/[^0-9]/g, '') || '1'}`
			: '';

	const co = question?.target_co ?? question?.co_code ?? question?.co_indicator ?? 'CO1';

	return {
		// identity — question_id is what the answer sheet keys on
		id: question?.id,
		question_id: question?.id,

		// content (both spellings; templates read either)
		text,
		question_text: text,
		options: Array.isArray(question?.options) ? [...question.options] : question?.options ?? null,
		image_url: question?.image_url ?? null,

		// THE fix: the solution travels with the question
		answer_key: question?.answer_key ?? question?.answer ?? '',
		answer: question?.answer ?? question?.answer_key ?? '',
		explanation: question?.explanation ?? '',

		// weighting + classification
		marks: opts.marks ?? question?.marks ?? question?.mark ?? 0,
		bloom_level: bloom,
		k_level: kLevel,
		target_co: co,
		co_indicator: co,
		co_id: question?.co_id ?? null,
		// AMET / SVYASA / NRI render these two column names directly.
		co: question?.co ?? co,
		rbtl: question?.rbtl ?? bloom ?? kLevel ?? '',
		unit_id: question?.unit_id ?? null,
		topic_id: question?.topic_id ?? null,
		topic_name: question?.topic_name ?? null,
		type: question?.type ?? 'NORMAL',

		// slot placement
		part: opts.part,
		sub_label: opts.subLabel ?? null,
	};
}
