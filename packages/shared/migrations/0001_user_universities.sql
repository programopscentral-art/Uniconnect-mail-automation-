-- Migration: Add multi-university support for users
-- This creates a junction table to allow users to belong to multiple universities

-- Create the junction table
CREATE TABLE IF NOT EXISTS user_universities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, university_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_universities_user_id ON user_universities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_universities_university_id ON user_universities(university_id);

-- Migrate existing data from users.university_id to user_universities
INSERT INTO user_universities (user_id, university_id)
SELECT id, university_id 
FROM users 
WHERE university_id IS NOT NULL
ON CONFLICT (user_id, university_id) DO NOTHING;

-- Note: We're keeping the university_id column in users table for backward compatibility
-- It will store the "primary" university, but user_universities will be the source of truth
