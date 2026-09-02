-- Two-level petty-cash approval.
--   SUBMITTED     → awaiting Level-1 (Pravalika) review
--   L1_APPROVED   → Level-1 done, awaiting Level-2 (Satish) budget check + final approval
--   APPROVED      → fully approved, ready to disburse
-- New flow: raise → L1 (Pravalika) → L2 (Satish) → disburse.
ALTER TYPE petty_cash_status ADD VALUE IF NOT EXISTS 'L1_APPROVED' AFTER 'SUBMITTED';
