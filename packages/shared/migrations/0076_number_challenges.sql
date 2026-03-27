-- Number matching verification challenges (Google-style auth)
CREATE TABLE IF NOT EXISTS number_challenges (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    correct_number INTEGER NOT NULL,
    hmac TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_number_challenges_user_verified
    ON number_challenges (user_id, verified, verified_at);

-- Auto-cleanup: delete expired challenges older than 1 hour
CREATE INDEX IF NOT EXISTS idx_number_challenges_expires
    ON number_challenges (expires_at);
