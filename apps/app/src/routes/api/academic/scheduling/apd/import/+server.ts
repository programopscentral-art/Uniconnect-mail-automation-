import { parseAPDExcel, APDPlanningService } from '@uniconnect/shared';
import { db } from '@uniconnect/shared';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Normalize a university name for matching:
 * - lowercase, trim
 * - remove common suffixes/prefixes
 * - collapse whitespace
 */
function normalize(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, '') // remove punctuation
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate multiple match keys for a university name.
 * Returns an array of possible keys to match against.
 */
function generateMatchKeys(name: string): string[] {
    const keys: string[] = [];
    const norm = normalize(name);
    if (norm) keys.push(norm);

    // Without common words
    const stripped = norm
        .replace(/\b(university|college|institute|of|technology|the|and|for)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (stripped && stripped !== norm) keys.push(stripped);

    // Extract abbreviation (first letters of each word)
    const words = norm.split(/\s+/).filter(w => !['of', 'the', 'and', 'for'].includes(w));
    if (words.length >= 2) {
        const abbr = words.map(w => w[0]).join('');
        if (abbr.length >= 2) keys.push(abbr);
    }

    // Also add the slug-style version (words joined with hyphens)
    const slugStyle = norm.replace(/\s+/g, '-');
    if (slugStyle !== norm) keys.push(slugStyle);

    return keys;
}

// POST — upload and parse APD Excel, save plans
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
        const parseResult = await parseAPDExcel(buffer);

        if (parseResult.errors.length > 0 && parseResult.plans.length === 0) {
            return json({
                success: false,
                message: 'Failed to parse APD file',
                errors: parseResult.errors,
                warnings: parseResult.warnings
            }, { status: 400 });
        }

        // Build comprehensive university lookup from DB
        // Maps multiple keys (name, slug, abbreviation, etc.) → university id
        let uniLookup = new Map<string, string>();
        let dbUniversityNames: string[] = [];

        if (!universityId) {
            const uniRes = await db.query(`SELECT id, name, slug, COALESCE(aliases, '[]'::jsonb) as aliases FROM universities`);
            for (const u of uniRes.rows) {
                dbUniversityNames.push(u.name);

                // Add all match keys for this university's name
                for (const key of generateMatchKeys(u.name)) {
                    uniLookup.set(key, u.id);
                }

                // Also add slug directly
                if (u.slug) {
                    uniLookup.set(u.slug.toLowerCase(), u.id);
                    uniLookup.set(u.slug.toLowerCase().replace(/-/g, ' '), u.id);
                }

                // Add aliases (e.g., BITS, MRV, etc.)
                const aliases: string[] = Array.isArray(u.aliases) ? u.aliases : [];
                for (const alias of aliases) {
                    if (alias) {
                        for (const key of generateMatchKeys(alias)) {
                            uniLookup.set(key, u.id);
                        }
                    }
                }
            }

            // Debug: show all DB universities
            parseResult.warnings.push(`DB universities (${dbUniversityNames.length}): ${dbUniversityNames.join(', ')}`);
        }

        // Create import batch
        const batchUniversityId = universityId || locals.user?.university_id || null;
        const batch = await APDPlanningService.createImportBatch(
            batchUniversityId, file.name, buffer.length, userId
        );

        const savedPlans = [];
        const unmatchedUniversities: string[] = [];
        const matchLog: string[] = [];

        for (const plan of parseResult.plans) {
            let targetUniversityId = universityId;

            if (!targetUniversityId && plan.university_name) {
                const planName = plan.university_name.trim();
                const planKeys = generateMatchKeys(planName);

                // Try each key against the lookup
                for (const key of planKeys) {
                    if (uniLookup.has(key)) {
                        targetUniversityId = uniLookup.get(key)!;
                        matchLog.push(`"${planName}" → matched via key "${key}"`);
                        break;
                    }
                }

                // Try substring matching if no exact key match
                if (!targetUniversityId) {
                    const planNorm = normalize(planName);
                    for (const [key, id] of uniLookup.entries()) {
                        // Check if plan name contains DB key or vice versa (min 3 chars to avoid false matches)
                        if (key.length >= 3 && (planNorm.includes(key) || key.includes(planNorm))) {
                            targetUniversityId = id;
                            matchLog.push(`"${planName}" → fuzzy matched via "${key}"`);
                            break;
                        }
                    }
                }

                if (!targetUniversityId) {
                    unmatchedUniversities.push(planName);
                    matchLog.push(`"${planName}" → NO MATCH (keys tried: ${planKeys.join(', ')})`);
                    continue;
                }
            }

            if (!targetUniversityId) {
                targetUniversityId = locals.user?.university_id || '';
            }

            if (!targetUniversityId) {
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

        // Add match log to warnings for debugging
        if (matchLog.length > 0) {
            parseResult.warnings.push(`Match log: ${matchLog.join(' | ')}`);
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
