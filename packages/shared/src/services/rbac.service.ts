import { db } from '../db/client';

export interface RoleAssignmentInput {
    user_id: string;
    role_code: string;
    university_id: string;
    campus_id?: string;
    program_id?: string;
    section_id?: string;
    is_primary?: boolean;
}

export class RBACService {
    /**
     * Assigns a role to a user within a specific context.
     */
    static async assignRole(input: RoleAssignmentInput) {
        // 1. Get role ID from code
        const roleRes = await db.query('SELECT id FROM roles WHERE code = $1', [input.role_code]);
        if (roleRes.rows.length === 0) throw new Error(`Role ${input.role_code} not found.`);
        const roleId = roleRes.rows[0].id;

        // 2. Perform assignment
        await db.query(
            `INSERT INTO user_role_assignments (
                user_id, role_id, university_id, campus_id, program_id, section_id, is_primary
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id, role_id, university_id, campus_id, program_id, section_id) 
            DO UPDATE SET is_primary = $7, updated_at = NOW()`,
            [
                input.user_id,
                roleId,
                input.university_id,
                input.campus_id || null,
                input.program_id || null,
                input.section_id || null,
                input.is_primary || false
            ]
        );
    }

    /**
     * Gets all roles assigned to a user across all universities.
     */
    static async getUserRoles(userId: string) {
        const result = await db.query(
            `SELECT r.code as role_code, r.name as role_name, ura.*
             FROM user_role_assignments ura
             INNER JOIN roles r ON ura.role_id = r.id
             WHERE ura.user_id = $1`,
            [userId]
        );
        return result.rows;
    }

    /**
     * Checks if a user has a specific role in a specific university.
     */
    static async hasRole(userId: string, universityId: string, roleCode: string) {
        const result = await db.query(
            `SELECT 1 FROM user_role_assignments ura
             INNER JOIN roles r ON ura.role_id = r.id
             WHERE ura.user_id = $1 AND ura.university_id = $2 AND r.code = $3`,
            [userId, universityId, roleCode]
        );
        return result.rows.length > 0;
    }
}
