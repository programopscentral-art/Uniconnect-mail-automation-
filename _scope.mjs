import pg from 'pg';
const c = new pg.Client({ connectionString: 'postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres' });
await c.connect();

console.log('=== campus_dim columns ===');
const cd = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='campus_dim' AND table_schema='ops_os' ORDER BY ordinal_position`);
cd.rows.forEach(r => console.log(`  ${r.column_name}  ${r.data_type}`));

console.log('\n=== cluster_dim columns ===');
const cl = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='cluster_dim' AND table_schema='ops_os' ORDER BY ordinal_position`);
cl.rows.forEach(r => console.log(`  ${r.column_name}  ${r.data_type}`));

console.log('\n=== user_campus_assignment columns ===');
const uca = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='user_campus_assignment' AND table_schema='ops_os' ORDER BY ordinal_position`);
uca.rows.forEach(r => console.log(`  ${r.column_name}  ${r.data_type}`));

console.log('\n=== Sample PM assignments → universities ===');
const sample = await c.query(`
  SELECT u.email, uca.role,
         array_agg(DISTINCT univ.name) AS universities
    FROM ops_os.user_campus_assignment uca
    JOIN public.users u ON u.id = uca.user_id
    JOIN ops_os.campus_dim cd ON cd.campus_id = uca.campus_id
    JOIN public.universities univ ON univ.id = cd.university_id
   WHERE uca.role IN ('PM','PMA','BOA','CMA') AND uca.revoked_at IS NULL
   GROUP BY u.email, uca.role
   ORDER BY uca.role, u.email
   LIMIT 5`);
sample.rows.forEach(r => console.log(`  ${r.role} · ${r.email} → ${r.universities.join(', ')}`));

console.log('\n=== Sample COS → cluster → universities ===');
const cosSample = await c.query(`
  SELECT u.email AS cos_email,
         array_agg(DISTINCT univ.name) AS universities
    FROM ops_os.cluster_dim cl
    JOIN public.users u ON u.id = cl.cos_user_id
    JOIN ops_os.campus_dim cd ON cd.cluster_id = cl.id
    JOIN public.universities univ ON univ.id = cd.university_id
   WHERE cl.cos_user_id IS NOT NULL
   GROUP BY u.email
   LIMIT 5`);
cosSample.rows.forEach(r => console.log(`  COS · ${r.cos_email} → ${r.universities.join(', ')}`));

await c.end();
