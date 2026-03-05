import * as fs from 'fs';
import { db } from '../packages/shared/src/db/client';

async function debug() {
    try {
        let output = '';
        const univs = await db.query('SELECT id, name FROM universities WHERE name ILIKE \'%AMET%\'');
        for (const univ of univs.rows) {
            output += `--- University: ${univ.name} (${univ.id}) ---\n`;
            const students = await db.query('SELECT * FROM students WHERE university_id = $1 ORDER BY created_at DESC LIMIT 1', [univ.id]);
            if (students.rows.length > 0) {
                const s = students.rows[0];
                output += `STUDENT_NAME_IN_DB: "${s.name}"\n`;
                output += `STUDENT_METADATA: ${JSON.stringify(s.metadata, null, 2)}\n`;
            } else {
                output += 'NO STUDENTS FOUND\n';
            }
        }
        fs.writeFileSync('debug_output_final.txt', output);
        console.log('Output written to debug_output_final.txt');
    } catch (e) {
        console.error(e);
    } finally {
        await db.pool.end();
    }
}

debug();
