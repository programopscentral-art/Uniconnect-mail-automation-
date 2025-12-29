-- Mailbox Access Permissions
CREATE TABLE mailbox_access_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES mailbox_connections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REVOKED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mailbox_id, user_id)
);

CREATE INDEX idx_mailbox_perms_user ON mailbox_access_permissions(user_id);
CREATE INDEX idx_mailbox_perms_mailbox ON mailbox_access_permissions(mailbox_id);
