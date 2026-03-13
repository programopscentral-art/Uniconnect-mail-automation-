import { parseAPDExcel, APDPlanningService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — upload and parse APD Excel, save plans
// Supports two modes:
// 1. Single university: universityId provided → all plans saved under that university
// 2. All universities: no universityId → match each plan's university_name to DB
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const universityId = (formData.get('universityId') as string) || '';
    const termId = formData.get('termId') as string;
    const programId = formData.get('programId') as string;
    const userId = locals.user?.id || '';

    if (!file) {
        throw error(400, 'file is required');
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Parse the file first
        const parseResult = await parseAPDExcel(buffer);

        if (parseResult.errors.length > 0 && parseResult.plans.length === 0) {
            return json({
                success: false,
                message: 'Failed to parse APD file',
                errors: parseResult.errors,
                warnings: parseResult.warnings
            }, { status: 400 });
        }

        // Build university name → id lookup from DB
        let uniLookup = new Map<string, string>();
        if (!universityId) {
            const uniRes = await db.query(`SELECT id, name FROM universities`);
            for (const u of uniRes.rows) {
                const name = u.name.trim();
                uniLookup.set(name.toLowerCase(), u.id);
                // Also store without common suffixes for flexible matching
                const simplified = name.replace(/\s*(university|college|institute|of technology)\s*/gi, ' ').trim().toLowerCase();
                if (simplified) uniLookup.set(simplified, u.id);
            }
        }

        // Create a single import batch
        const batchUniversityId = universityId || locals.user?.university_id || userId;
        const batch = await APDPlanningService.createImportBatch(
            batchUniversityId, file.name, buffer.length, userId
        );

        // Save each plan
        const savedPlans = [];
        const unmatchedUniversities: string[] = [];

        for (const plan of parseResult.plans) {
            let targetUniversityId = universityId;

            if (!targetUniversityId && plan.university_name) {
                // Try to match university by name
                const planUniName = plan.university_name.trim().toLowerCase();
                targetUniversityId = uniLookup.get(planUniName) || '';

                // Try partial/fuzzy match if exact match fails
                if (!targetUniversityId) {
                    for (const [key, id] of uniLookup.entries()) {
                        if (planUniName.includes(key) || key.includes(planUniName)) {
                            targetUniversityId = id;
                            break;
                        }
                    }
                }

                if (!targetUniversityId) {
                    unmatchedUniversities.push(plan.university_name);
                    parseResult.warnings.push(
                        `Could not match university "${plan.university_name}" to any university in the system. Skipped.`
                    );
                    continue;
                }
            }

            if (!targetUniversityId) {
                // Fallback to user's university
                targetUniversityId = locals.user?.university_id || '';
            }

            if (!targetUniversityId) {
                parseResult.warnings.push(
                    `No university ID for plan "${plan.university_name || 'unknown'}". Skipped.`
                );
                continue;
            }

            try {
                const saved = await APDPlanningService.savePlan(targetUniversityId, plan, {
                    importBatchId: batch.id,
                    termId: termId || undefined,
                    programId: programId || undefined,
                    createdBy: userId
                });
                savedPlans.push({ ...saved, matched_university_name: plan.university_name });
            } catch (planErr: any) {
                parseResult.errors.push({
                    row: 0,
                    field: 'save',
                    message: `Failed to save plan for "${plan.university_name || 'unknown'}": ${planErr.message}`
                });
            }
        }

        await APDPlanningService.updateImportBatch(batch.id, {
            import_status: savedPlans.length > 0 ? 'COMPLETED' : 'FAILED',
            row_count: parseResult.totalRows,
            error_count: parseResult.errors.length,
            error_details: parseResult.errors
        });

        return json({
            success: savedPlans.length > 0,
            batchId: batch.id,
            plansCreated: savedPlans.length,
            plans: savedPlans,
            unmatchedUniversities,
            parseResult: {
                totalRows: parseResult.totalRows,
                errors: parseResult.errors,
                warnings: parseResult.warnings
            }
        });
    } catch (e: any) {
        console.error('[POST /api/academic/scheduling/apd/import]', e);
        return json({ success: false, message: e.message || 'Failed to import APD file' }, { status: 500 });
    }
};
