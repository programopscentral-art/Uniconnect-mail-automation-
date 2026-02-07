import { getAllUniversities, db } from '@uniconnect/shared';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
    if (!locals.user) throw error(401);

    const universityId = url.searchParams.get('universityId') || url.searchParams.get('universityid') || locals.user.university_id;
    const batchId = url.searchParams.get('batchId') || url.searchParams.get('batchid');
    const branchId = url.searchParams.get('branchId') || url.searchParams.get('branchid');

    try {
        console.log('[GENERATE_LOAD] universityId:', universityId, 'batchId:', batchId);
        const [universities, batchesResult, branchesResult] = await Promise.all([
            locals.user.role === 'ADMIN' || locals.user.role === 'PROGRAM_OPS' ? getAllUniversities() : Promise.resolve([]),
            universityId ? db.query('SELECT * FROM assessment_batches WHERE university_id = $1 ORDER BY name ASC', [universityId]) : Promise.resolve({ rows: [] }),
            universityId ? db.query(
                batchId
                    ? 'SELECT * FROM assessment_branches WHERE university_id = $1 AND batch_id = $2 ORDER BY name ASC'
                    : 'SELECT * FROM assessment_branches WHERE university_id = $1 ORDER BY name ASC',
                batchId ? [universityId, batchId] : [universityId]
            ) : Promise.resolve({ rows: [] })
        ]);

        const batches = batchesResult.rows || [];
        const branches = branchesResult.rows || [];

        console.log(`[GENERATE_LOAD] Found ${batches.length} batches and ${branches.length} branches for universityId:`, universityId);
        if (batches.length > 0) {
            console.log('[GENERATE_LOAD] Sample Batch:', batches[0]);
        }

        let subjects: any[] = [];
        if (branchId) {
            const subjectsResult = await db.query(
                batchId
                    ? 'SELECT * FROM assessment_subjects WHERE branch_id = $1 AND batch_id = $2 ORDER BY name ASC'
                    : 'SELECT * FROM assessment_subjects WHERE branch_id = $1 ORDER BY name ASC',
                batchId ? [branchId, batchId] : [branchId]
            );
            subjects = subjectsResult.rows;
        }

        return {
            universities,
            batches,
            branches,
            subjects,
            selectedUniversityId: universityId,
            selectedBatchId: batchId,
            selectedBranchId: branchId
        };
    } catch (err: any) {
        console.error('[GENERATE_LOAD] Error:', err);
        throw error(500, err.message);
    }
};
