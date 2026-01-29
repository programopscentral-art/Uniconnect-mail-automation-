import { db, getAllUniversities, getAssessmentBatches, getAssessmentBranches, getAssessmentSubjects } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || url.searchParams.get('universityid') || locals.user.university_id;
    const batchId = url.searchParams.get('batchId') || url.searchParams.get('batchid');
    const branchId = url.searchParams.get('branchId') || url.searchParams.get('branchid');

    try {
        console.log('[GENERATE_LOAD] universityId:', universityId, 'batchId:', batchId);
        const [universities, batches, branches] = await Promise.all([
            locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' ? getAllUniversities() : Promise.resolve([]),
            universityId ? getAssessmentBatches(universityId) : Promise.resolve([]),
            universityId ? getAssessmentBranches(universityId, batchId || undefined) : Promise.resolve([])
        ]);

        console.log(`[GENERATE_LOAD] Found ${batches.length} batches and ${branches.length} branches for universityId:`, universityId);
        if (batches.length > 0) {
            console.log('[GENERATE_LOAD] Sample Batch:', batches[0]);
        }

        let subjects: any[] = [];
        let selectedUniversityName = '';

        if (universityId) {
            const { rows: uniDetails } = await db.query('SELECT name FROM universities WHERE id = $1', [universityId]);
            if (uniDetails[0]) selectedUniversityName = uniDetails[0].name;
        }

        if (branchId) {
            subjects = await getAssessmentSubjects(branchId, undefined, batchId || undefined);
        }

        return {
            universities,
            batches,
            branches,
            subjects,
            selectedUniversityId: universityId,
            selectedUniversityName,
            selectedBatchId: batchId,
            selectedBranchId: branchId
        };
    } catch (err: any) {
        console.error('[GENERATE_LOAD] Error:', err);
        throw error(500, err.message);
    }
};
