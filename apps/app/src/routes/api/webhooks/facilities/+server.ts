/**
 * Webhook receiver: Facilities OS → UniConnect
 *
 * Receives status updates from Facilities OS when procurement progresses.
 * Updates the budget_proposal_reports and creates tracking entries
 * so users see Amazon-style live tracking in their proposal detail page.
 *
 * POST /api/webhooks/facilities
 * No auth required (public webhook) — validated by shared secret.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '@uniconnect/shared';
import { env } from '$env/dynamic/private';

const WEBHOOK_SECRET = () => (env.FACILITIES_WEBHOOK_SECRET || process.env.FACILITIES_WEBHOOK_SECRET || 'facilities-webhook-key').trim();

export const POST: RequestHandler = async ({ request }) => {
    // Validate webhook secret
    const authHeader = request.headers.get('x-webhook-secret') || '';
    if (authHeader !== WEBHOOK_SECRET()) {
        console.warn('[WEBHOOK] Invalid facilities webhook secret');
        throw error(401, 'Invalid webhook secret');
    }

    const body = await request.json();
    const { action, budget_proposal_id, requirement_id } = body;

    if (!budget_proposal_id && !requirement_id) {
        throw error(400, 'budget_proposal_id or requirement_id required');
    }

    try {
        switch (action) {
            case 'status_update': {
                const { status, message, updated_by_name, updated_by_email, attachment_urls, items_summary, vendor_details } = body;
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, updated_by_name, updated_by_email, attachment_urls, source, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'facilities', $8)`,
                    [
                        budget_proposal_id,
                        status,
                        mapStatusToTitle(status),
                        message || null,
                        updated_by_name || 'Facilities Team',
                        updated_by_email || null,
                        attachment_urls || null,
                        (items_summary || vendor_details) ? JSON.stringify({ items_summary, vendor_details }) : null
                    ]
                );
                return json({ success: true, action: 'status_update' });
            }

            case 'vendor_assigned': {
                const { vendor_name, vendor_email, quoted_price, estimated_delivery_date, message } = body;
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, updated_by_name, source, metadata)
                     VALUES ($1, 'vendor_assigned', $2, $3, 'Facilities Team', 'facilities', $4)`,
                    [
                        budget_proposal_id,
                        `Vendor Assigned — ${vendor_name}`,
                        message || `${vendor_name} has been assigned. Quoted price: ₹${quoted_price || 'TBD'}`,
                        JSON.stringify({ vendor_name, vendor_email, quoted_price, estimated_delivery_date })
                    ]
                );
                return json({ success: true, action: 'vendor_assigned' });
            }

            case 'vendor_confirmed': {
                const { vendor_name, confirmed_price, delivery_date, message } = body;
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, updated_by_name, source, metadata)
                     VALUES ($1, 'vendor_confirmed', $2, $3, 'Facilities Team', 'facilities', $4)`,
                    [
                        budget_proposal_id,
                        `Vendor Confirmed — ₹${confirmed_price}`,
                        message || `${vendor_name} confirmed at ₹${confirmed_price}. Delivery by ${delivery_date || 'TBD'}.`,
                        JSON.stringify({ vendor_name, confirmed_price, delivery_date })
                    ]
                );
                return json({ success: true, action: 'vendor_confirmed' });
            }

            case 'sample_ready': {
                const { vendor_name, attachment_urls: samples, message } = body;
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, updated_by_name, attachment_urls, source)
                     VALUES ($1, 'sample_ready', $2, $3, 'Facilities Team', $4, 'facilities')`,
                    [
                        budget_proposal_id,
                        `Sample Ready — Review Required`,
                        message || `${vendor_name || 'Vendor'} has shared a sample for your review.`,
                        samples || null
                    ]
                );
                return json({ success: true, action: 'sample_ready' });
            }

            case 'in_production': {
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, source)
                     VALUES ($1, 'in_production', 'In Production', $2, 'facilities')`,
                    [budget_proposal_id, body.message || 'Your order is being produced.']
                );
                return json({ success: true, action: 'in_production' });
            }

            case 'in_transit': {
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, source, metadata)
                     VALUES ($1, 'in_transit', 'In Transit', $2, 'facilities', $3)`,
                    [
                        budget_proposal_id,
                        body.message || 'Your order is on its way.',
                        JSON.stringify({ estimated_delivery: body.estimated_delivery_date, tracking_info: body.tracking_info })
                    ]
                );
                return json({ success: true, action: 'in_transit' });
            }

            case 'delivered': {
                const { actual_cost, delivery_date, attachment_urls: proofs, message } = body;
                // Update budget_proposal_reports with actual cost
                if (actual_cost) {
                    await db.query(
                        `INSERT INTO budget_proposal_reports (proposal_id, actual_budget_used)
                         VALUES ($1, $2)
                         ON CONFLICT (proposal_id) DO UPDATE SET
                            actual_budget_used = EXCLUDED.actual_budget_used`,
                        [budget_proposal_id, actual_cost]
                    );
                }
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, attachment_urls, source, metadata)
                     VALUES ($1, 'delivered', 'Order Delivered', $2, $3, 'facilities', $4)`,
                    [
                        budget_proposal_id,
                        message || `Your order has been delivered.${actual_cost ? ` Final cost: ₹${actual_cost}` : ''}`,
                        proofs || null,
                        JSON.stringify({ actual_cost, delivery_date })
                    ]
                );
                return json({ success: true, action: 'delivered' });
            }

            case 'completed': {
                const { actual_cost, savings, message } = body;
                if (actual_cost) {
                    await db.query(
                        `INSERT INTO budget_proposal_reports (proposal_id, actual_budget_used)
                         VALUES ($1, $2)
                         ON CONFLICT (proposal_id) DO UPDATE SET
                            actual_budget_used = EXCLUDED.actual_budget_used`,
                        [budget_proposal_id, actual_cost]
                    );
                }
                await db.query(
                    `INSERT INTO budget_proposal_tracking
                        (proposal_id, status, title, description, source, metadata)
                     VALUES ($1, 'completed', 'Request Completed', $2, 'facilities', $3)`,
                    [
                        budget_proposal_id,
                        message || `Procurement complete.${savings ? ` You saved ₹${savings}!` : ''}`,
                        JSON.stringify({ actual_cost, savings })
                    ]
                );
                // Update proposal status to EVENT_COMPLETED
                await db.query(
                    `UPDATE budget_proposals SET status = 'EVENT_COMPLETED' WHERE id = $1`,
                    [budget_proposal_id]
                );
                return json({ success: true, action: 'completed' });
            }

            default:
                throw error(400, `Unknown action: ${action}`);
        }
    } catch (e: any) {
        console.error('[WEBHOOK] Facilities webhook error:', e);
        if (e.status) throw e;
        return json({ success: false, error: e.message }, { status: 500 });
    }
};

function mapStatusToTitle(status: string): string {
    const map: Record<string, string> = {
        received: 'Received by Facilities',
        vendor_search: 'Finding Best Vendor',
        vendor_assigned: 'Vendor Assigned',
        vendor_confirmed: 'Vendor Confirmed',
        in_production: 'In Production',
        sample_ready: 'Sample Ready for Review',
        in_transit: 'In Transit',
        delivered: 'Delivered',
        completed: 'Completed'
    };
    return map[status] || status;
}
