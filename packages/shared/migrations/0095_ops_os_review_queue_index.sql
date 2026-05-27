-- Speed up the PM Review Queue load.
--
-- The /ops-os/review server load runs listSubmissions(cadence, statuses,
-- period_start_from..to, optional campus_id, limit). Without a fitting
-- index Postgres falls back to a sequential scan of ops_os.submission +
-- in-memory sort on period_start DESC, which gets slow as the table grows
-- and is the most likely cause of the queue feeling laggy on filter
-- changes (each filter change re-runs the load).
--
-- This index has cadence as the leading column (always equality-filtered),
-- period_start DESC second so it satisfies the ORDER BY without a sort,
-- and includes status so the queue's IN ('SUBMITTED','PM_REVIEW','SENT_BACK')
-- predicate stays index-only. supersedes IS NULL is a partial filter that
-- excludes superseded amendment rows from the index.

CREATE INDEX IF NOT EXISTS idx_submission_queue_by_cadence_period
    ON ops_os.submission (cadence, period_start DESC, status)
    WHERE supersedes IS NULL;

-- Also helps the auto-sign-off and reminder workers which scan by
-- (cadence, status, period_end) for unsigned-off DAILY rows.
CREATE INDEX IF NOT EXISTS idx_submission_pending_pm
    ON ops_os.submission (cadence, status, period_end DESC)
    WHERE supersedes IS NULL
      AND status IN ('SUBMITTED', 'PM_REVIEW', 'SENT_BACK');
