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
    'ADMIN': ["dashboard", "tasks", "universities", "students", "users", "analytics", "mailboxes", "templates", "campaigns", "assessments", "mail-logs", "communication-tasks", "permissions", "budget-proposals", "academic-operations", "meetings", "sheets", "ops-dashboard"],
    'PROGRAM_OPS': ["dashboard", "tasks", "universities", "students", "users", "analytics", "mailboxes", "templates", "campaigns", "assessments", "mail-logs", "communication-tasks", "permissions", "budget-proposals", "academic-operations", "meetings", "sheets", "ops-dashboard"],
    'UNIVERSITY_OPERATOR': ["dashboard", "tasks", "students", "analytics", "mailboxes", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals", "meetings", "sheets"],
    'COS': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals", "meetings", "sheets"],
    'PM': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals", "meetings"],
    'PMA': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals"],
    'BOA': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals"],
    'CMA': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals"],
    'CMA_MANAGER': ["dashboard", "tasks", "students", "analytics", "templates", "campaigns", "assessments", "communication-tasks", "budget-proposals"],
    'SET_REVIEWER': ["dashboard", "budget-proposals", "universities", "students"],
    'PROPOSER': ["dashboard", "budget-proposals"],
    'FACULTY': ["dashboard", "academic-operations", "tasks"],
    'STUDENT': ["dashboard", "academic-operations"],
    'STAKEHOLDER': ["dashboard", "academic-operations", "analytics"],
    'SUPPORT': ["dashboard", "academic-operations", "tasks"]
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

/**
 * Ensures ALL existing roles in role_permissions have 'tasks' in their features.
 * This is the programmatic equivalent of migration 0070.
 * Called at boot to guarantee tasks work for every role without manual SQL.
 */
export async function ensureCorePermissions(): Promise<void> {
    try {
        // Add 'tasks' to every role that doesn't already have it
        await db.query(`
            UPDATE role_permissions
            SET features = features || '["tasks"]'::jsonb, updated_at = NOW()
            WHERE NOT (features @> '["tasks"]'::jsonb)
        `);

        // Add 'dashboard' to every role that doesn't already have it
        await db.query(`
            UPDATE role_permissions
            SET features = features || '["dashboard"]'::jsonb, updated_at = NOW()
            WHERE NOT (features @> '["dashboard"]'::jsonb)
        `);

        // Insert rows for roles that don't have ANY row yet
        const roles = ['BOA', 'UNIVERSITY_OPERATOR', 'COS', 'PM', 'PMA', 'CMA', 'CMA_MANAGER', 'FACULTY', 'SUPPORT'];
        for (const role of roles) {
            await db.query(`
                INSERT INTO role_permissions (role, features)
                SELECT $1, '["dashboard", "tasks", "students"]'::jsonb
                WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = $1)
            `, [role]);
        }

        // Fix orphaned tasks: tasks with NULL university_id should inherit from their creator
        await db.query(`
            UPDATE tasks t
            SET university_id = u.university_id
            FROM users u
            WHERE t.assigned_by = u.id
              AND t.university_id IS NULL
              AND u.university_id IS NOT NULL
        `);

        console.log('[PERMISSIONS] Core permissions (tasks, dashboard) ensured for all roles');
    } catch (e: any) {
        console.error('[PERMISSIONS] Failed to ensure core permissions:', e?.message);
    }
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
