import { json, error } from '@sveltejs/kit';
import { StudentService, db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

const EDIT_ROLES = ['ADMIN', 'PROGRAM_OPS', 'UNIVERSITY_OPERATOR'];

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) throw error(401);

    const result = await db.query(
        `SELECT sp.*, u.name as student_name, u.email as student_email,
                prog.name as program_name, prog.code as program_code,
                t.name as term_name, sec.name as section_name,
                univ.name as university_name, univ.short_name as university_short_name,
                ab.name as batch_name
         FROM student_profiles sp
         LEFT JOIN users u ON sp.user_id = u.id
         LEFT JOIN programs prog ON sp.program_id = prog.id
         LEFT JOIN terms t ON sp.term_id = t.id
         LEFT JOIN sections sec ON sp.section_id = sec.id
         LEFT JOIN universities univ ON sp.university_id = univ.id
         LEFT JOIN academic_batches ab ON sp.batch_id = ab.id
         WHERE sp.id = $1`,
        [params.id]
    );

    if (!result.rows[0]) throw error(404, 'Student not found');
    return json(result.rows[0]);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401);

    if (!EDIT_ROLES.includes(locals.user.role as string)) {
        throw error(403, 'Insufficient permissions to edit student profile');
    }

    try {
        const body = await request.json();
        let changed = false;

        // Update student_profiles columns (plain fields)
        const profileFields: Record<string, any> = {};
        for (const key of ['niat_id', 'phone', 'father_name', 'mother_name', 'date_of_birth', 'gender', 'blood_group', 'admission_date', 'roll_number']) {
            if (body[key] !== undefined) profileFields[key] = body[key];
        }
        if (Object.keys(profileFields).length > 0) {
            await StudentService.updateProfile(params.id, profileFields as any);
            changed = true;
        }

        // Update user name/email (stored in users table, not student_profiles)
        if (body.student_name || body.student_email) {
            const sp = await db.query('SELECT user_id FROM student_profiles WHERE id = $1', [params.id]);
            const userId = sp.rows[0]?.user_id;
            if (userId) {
                if (body.student_name) {
                    await db.query('UPDATE users SET name = $1 WHERE id = $2', [body.student_name.trim(), userId]);
                    changed = true;
                }
                if (body.student_email) {
                    await db.query('UPDATE users SET email = $1 WHERE id = $2', [body.student_email.trim().toLowerCase(), userId]);
                    changed = true;
                }
            }
        }

        if (!changed) throw error(400, 'No valid fields to update');

        // Return the refreshed profile
        const refreshed = await db.query(
            `SELECT sp.*, u.name as student_name, u.email as student_email,
                    prog.name as program_name, prog.code as program_code,
                    t.name as term_name, sec.name as section_name,
                    ab.name as batch_name
             FROM student_profiles sp
             LEFT JOIN users u ON sp.user_id = u.id
             LEFT JOIN programs prog ON sp.program_id = prog.id
             LEFT JOIN terms t ON sp.term_id = t.id
             LEFT JOIN sections sec ON sp.section_id = sec.id
             LEFT JOIN academic_batches ab ON sp.batch_id = ab.id
             WHERE sp.id = $1`,
            [params.id]
        );

        return json({ success: true, student: refreshed.rows[0] });
    } catch (e: any) {
        if (e.status) throw e;
        throw error(500, e.message);
    }
};
