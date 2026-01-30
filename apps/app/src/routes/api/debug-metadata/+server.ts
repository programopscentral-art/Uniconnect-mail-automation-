import { db } from '@uniconnect/shared';
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401);

    const email = url.searchParams.get('email');
    if (!email) throw error(400, 'Email required');

    const result = await db.query(
        'SELECT id, name, email, metadata FROM students WHERE email = $1 LIMIT 1',
        [email]
    );

    if (result.rows.length === 0) {
        return json({ error: 'Student not found' });
    }

    const student = result.rows[0];
    let metadata = student.metadata;

    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch (e) {
            return json({ error: 'Failed to parse metadata', raw: metadata });
        }
    }

    const keys = Object.keys(metadata);
    const keysWithNewlines = keys.filter(k => k.includes('\n') || k.includes('\r'));

    return json({
        student: {
            id: student.id,
            name: student.name,
            email: student.email
        },
        totalKeys: keys.length,
        keysWithNewlines: keysWithNewlines.length,
        problematicKeys: keysWithNewlines,
        allKeys: keys,
        sampleValues: {
            'Term 1 Fee adjustment (O/S +ve and Excess -Ve)': metadata['Term 1 Fee adjustment (O/S +ve and Excess -Ve)'],
            'Term 1 Fee adjustment\n(O/S +ve and Excess -Ve)': metadata['Term 1 Fee adjustment\n(O/S +ve and Excess -Ve)']
        }
    });
};
