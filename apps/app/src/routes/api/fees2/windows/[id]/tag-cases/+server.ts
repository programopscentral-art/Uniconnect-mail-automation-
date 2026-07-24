/**
 * GET /api/fees2/windows/:id/tag-cases?university_id=&batches=
 *   → per-university tag-case breakdown for the Tag Cases tab.
 *
 * Returns one row per university with a `total` (students carrying any tag) and
 * a `breakdown` map keyed by the canonical TAG_CASES values. Any tag value that
 * isn't one of the canonical cases is rolled into `Other`.
 *
 * `batches` is an optional CSV of batch_period_ids (defaults to the whole
 * window); `university_id` optionally narrows to one university.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { checkFeeAccess } from '$lib/server/fee_access';
import { TAG_CASES } from '$lib/server/fee_sync_v2';

export const GET: RequestHandler = async ({ params, locals, url }) => {
    checkFeeAccess(locals, 'view');
    if (!params.id) throw error(400, 'id required');

    const universityId = url.searchParams.get('university_id') || '';
    const batchesCsv = (url.searchParams.get('batches') || '').trim();
    const batchIds = batchesCsv ? batchesCsv.split(',').map(s => s.trim()).filter(Boolean) : [];

    const conds = ['bp.window_id = $1', 'fsp.tag_case IS NOT NULL', "fsp.tag_case <> ''"];
    const args: unknown[] = [params.id];
    if (batchIds.length > 0) { args.push(batchIds); conds.push(`fsp.batch_period_id = ANY($${args.length}::uuid[])`); }
    if (universityId) { args.push(universityId); conds.push(`fsp.university_id = $${args.length}`); }

    const r = await db.query(
        `SELECT fsp.university_id,
                COALESCE(u.short_name, u.name) AS university_name,
                fsp.tag_case,
                COUNT(*)::int AS c
           FROM fee_student_payments fsp
           JOIN fee_batch_period bp ON bp.id = fsp.batch_period_id
           JOIN universities u ON u.id = fsp.university_id
          WHERE ${conds.join(' AND ')}
          GROUP BY fsp.university_id, COALESCE(u.short_name, u.name), fsp.tag_case
          ORDER BY university_name`,
        args,
    );

    const canonical = new Set<string>(TAG_CASES as readonly string[]);
    type UniAgg = { university_id: string; university_name: string; total: number; breakdown: Record<string, number> };
    const byUni = new Map<string, UniAgg>();
    for (const row of r.rows as Array<{ university_id: string; university_name: string; tag_case: string; c: number }>) {
        let agg = byUni.get(row.university_id);
        if (!agg) {
            agg = { university_id: row.university_id, university_name: row.university_name, total: 0, breakdown: {} };
            byUni.set(row.university_id, agg);
        }
        const key = canonical.has(row.tag_case) ? row.tag_case : 'Other';
        agg.breakdown[key] = (agg.breakdown[key] ?? 0) + Number(row.c);
        agg.total += Number(row.c);
    }

    const universities = Array.from(byUni.values()).sort((a, b) => b.total - a.total);
    // Window-wide totals per category, for the header row.
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    for (const u of universities) {
        for (const [k, v] of Object.entries(u.breakdown)) totals[k] = (totals[k] ?? 0) + v;
        grandTotal += u.total;
    }

    return json({
        categories: [...(TAG_CASES as readonly string[]), 'Other'],
        universities,
        totals,
        grand_total: grandTotal,
    });
};
