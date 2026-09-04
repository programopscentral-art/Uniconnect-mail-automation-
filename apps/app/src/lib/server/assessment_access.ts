/**
 * Access rules for the Examinations (assessments) module.
 *
 * SMEs are examinations-only but NOT university-scoped: a subject-matter expert
 * reviews and edits papers across every campus, and they carry no university_id.
 * Gating them with the usual `user.university_id === x` check silently locked
 * them out of templates, generation and paper assets while BOAs/operators got
 * through on their campus. Treat SME alongside ADMIN / PROGRAM_OPS here.
 */
export const EXAM_GLOBAL_ROLES = ['ADMIN', 'PROGRAM_OPS', 'SME'] as const;

/** Sees every university's exam content (templates, subjects, generation). */
export function isExamGlobal(user: any): boolean {
	return (EXAM_GLOBAL_ROLES as readonly string[]).includes(user?.role);
}
