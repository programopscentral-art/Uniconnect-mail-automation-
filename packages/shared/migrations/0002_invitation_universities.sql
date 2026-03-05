-- Migration: Add multi-university support for invitations

-- Create the junction table for invitations
CREATE TABLE IF NOT EXISTS invitation_universities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(invitation_id, university_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_invitation_universities_invitation_id ON invitation_universities(invitation_id);
CREATE INDEX IF NOT EXISTS idx_invitation_universities_university_id ON invitation_universities(university_id);

-- Migrate existing data
INSERT INTO invitation_universities (invitation_id, university_id)
SELECT id, university_id 
FROM invitations 
WHERE university_id IS NOT NULL
ON CONFLICT (invitation_id, university_id) DO NOTHING;
