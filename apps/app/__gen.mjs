import { createServer } from 'vite';
import { createRequire } from 'module';
const pool = createRequire(import.meta.url)('./__db.cjs');
const APP = process.cwd();
const server = await createServer({ root: APP, configFile: APP + '/vite.config.ts',
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { POST } = await server.ssrLoadModule('/src/routes/api/assessments/generate/+server.ts');
const { rows } = await pool.query(`
  select distinct on (u.name, p.exam_type) u.name uni, p.university_id, p.batch_id, p.branch_id,
         p.subject_id, p.exam_type, p.max_marks, p.semester,
         p.sets_data->'metadata'->>'selected_template' as tmpl,
         p.sets_data->'metadata'->'template_config' as cfg
  from assessment_papers p join universities u on u.id=p.university_id
  where p.sets_data->'metadata'->'template_config' is not null
  order by u.name, p.exam_type, p.created_at desc`);
let ok = 0, broke = 0;
for (const r of rows) {
  const units = await pool.query(`select id from assessment_units where subject_id=$1 limit 20`, [r.subject_id]);
  const ev = { request: new Request('http://x/', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ university_id: r.university_id, batch_id: r.batch_id, branch_id: r.branch_id,
        subject_id: r.subject_id, exam_type: r.exam_type, semester: r.semester,
        unit_ids: units.rows.map(u => u.id), topic_ids: [], max_marks: r.max_marks,
        selected_template: r.tmpl, template_config: r.cfg, generation_mode: 'Standard', preview_only: true }) }),
    locals: { user: { id: '00000000-0000-0000-0000-000000000000', role: 'ADMIN' } } };
  try {
    const res = await POST(ev); const d = await res.json();
    if (res.status >= 400) throw new Error(d.message);
    ok++;
  } catch (e) { broke++; console.log(`❌ ${r.uni} ${r.exam_type}: ${e.message}`); }
}
console.log(`\n=== GENERATION: ${ok}/${rows.length} succeeded, ${broke} aborted ===`);
await server.close(); await pool.end();
