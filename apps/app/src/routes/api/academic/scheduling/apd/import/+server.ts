import { parseAPDExcel, APDPlanningService } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST — upload and parse APD Excel, save plans
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!['ADMIN', 'PROGRAM_OPS'].includes(locals.user?.role || '')) {
        throw error(403, 'Forbidden');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const universityId = formData.get('universityId') as string;
    const termId = formData.get('termId') as string;
    const programId = formData.get('programId') as string;

    if (!file || !universityId) {
        throw error(400, 'file and universityId are required');
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());

        // Create import batch
        const batch = await APDPlanningService.createImportBatch(
            universityId, file.name, buffer.length, locals.user.id
        );

        // Parse the file
        const parseResult = await parseAPDExcel(buffer);

        if (parseResult.errors.length > 0 && parseResult.plans.length === 0) {
            await APDPlanningService.updateImportBatch(batch.id, {
                import_status: 'FAILED',
                error_count: parseResult.errors.length,
                error_details: parseResult.errors
            });
            return json({
                success: false,
                batchId: batch.id,
                message: 'Failed to parse APD file',
                errors: parseResult.errors,
                warnings: parseResult.warnings
            }, { status: 400 });
        }

        // Save each plan
        const savedPlans = [];
        for (const plan of parseResult.plans) {
            const saved = await APDPlanningService.savePlan(universityId, plan, {
                importBatchId: batch.id,
                termId: termId || undefined,
                programId: programId || undefined,
                createdBy: locals.user.id
            });
            savedPlans.push(saved);
        }

        await APDPlanningService.updateImportBatch(batch.id, {
            import_status: 'COMPLETED',
            row_count: parseResult.totalRows,
            error_count: parseResult.errors.length,
            error_details: parseResult.errors
        });

        return json({
            success: true,
            batchId: batch.id,
            plansCreated: savedPlans.length,
            plans: savedPlans,
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
