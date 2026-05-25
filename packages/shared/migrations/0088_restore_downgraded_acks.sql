-- ─────────────────────────────────────────────────────────────────────────
-- Restore campaign recipients whose ACK status was silently downgraded
-- ─────────────────────────────────────────────────────────────────────────
-- Bug: markRecipientOpen() in packages/shared/src/db/campaigns.ts
-- unconditionally set status='OPENED' on every tracking-pixel hit. Gmail
-- (and most clients) re-fire pixels when an email is re-rendered, so a
-- student who clicked "I Acknowledge" got silently downgraded to OPENED
-- the next time their email client refetched the pixel.
--
-- The acknowledged_at timestamp was NEVER touched by the open tracker, so
-- it remains in the row as the durable proof of acknowledgement. This
-- migration uses it to restore the correct status.
--
-- Idempotent: re-running this is a no-op (the UPDATE matches 0 rows once
-- corrected).
--
-- Companion to commit 6e0c877 which fixed the underlying bug going forward.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Restore status on the affected rows.
--    We exclude FAILED, CANCELLED, SKIPPED because those represent definite
--    states we shouldn't overwrite even if acknowledged_at happened to be
--    set (defensive — should never be the case in practice).
UPDATE campaign_recipients
SET status = 'ACKNOWLEDGED',
    updated_at = NOW()
WHERE acknowledged_at IS NOT NULL
  AND status NOT IN ('ACKNOWLEDGED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- 2. Recompute ack_count per campaign so the dashboard aggregate matches
--    the now-correct per-recipient state. Only updates campaigns that
--    actually have at least one acknowledged recipient — campaigns with
--    zero acks are left alone (don't silently zero out historical aggregates).
UPDATE campaigns c
SET ack_count = sub.cnt,
    updated_at = NOW()
FROM (
    SELECT campaign_id, COUNT(*)::int AS cnt
    FROM campaign_recipients
    WHERE status = 'ACKNOWLEDGED'
    GROUP BY campaign_id
) sub
WHERE c.id = sub.campaign_id
  AND c.ack_count <> sub.cnt;

COMMIT;
