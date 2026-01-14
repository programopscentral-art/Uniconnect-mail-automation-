import { db } from './client';

export async function ensurePermissionsTableExists(): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS role_permissions (
            role VARCHAR(50) PRIMARY KEY,
            features JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);
}

export interface RolePermission {
    role: string;
    features: string[];
    created_at: Date;
    updated_at: Date;
}

export async function getAllRolePermissions(): Promise<RolePermission[]> {
    const result = await db.query(`SELECT * FROM role_permissions ORDER BY role ASC`);
    return result.rows;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    'ADMIN': ["dashboard", "tasks", "universities", "students", "users", "analytics", "mailboxes", "templates", "campaigns", "assessments", "mail-logs", "permissions"],
    'PROGRAM_OPS': ["dashboard", "tasks", "universities", "students", "users", "analytics", "mailboxes", "templates", "campaigns", "assessments", "mail-logs", "permissions"],
    'UNIVERSITY_OPERATOR': ["dashboard", "tasks", "students", "analytics", "mailboxes", "templates", "campaigns", "assessments"],
    'COS': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"],
    'PM': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"],
    'PMA': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"],
    'BOA': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments"]
};

export async function seedDefaultPermissions(): Promise<void> {
    for (const [role, features] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        await updateRolePermissions(role, features);
    }
}

export async function getRolePermissions(role: string): Promise<string[]> {
    const result = await db.query(`SELECT features FROM role_permissions WHERE role = $1`, [role]);
    if (result.rows.length === 0) {
        return [];
    }
    return result.rows[0].features;
}

export async function updateRolePermissions(role: string, features: string[]): Promise<void> {
    try {
        await db.query(
            `INSERT INTO role_permissions (role, features, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (role) DO UPDATE SET 
                features = EXCLUDED.features,
                updated_at = NOW()`,
            [role, JSON.stringify(features)]
        );
    } catch (e) {
        console.error(`[DB_PERMISSIONS_ERROR] Failed to update role ${role}:`, e);
        throw e;
    }
}
