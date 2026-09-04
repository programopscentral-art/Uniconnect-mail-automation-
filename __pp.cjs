const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.fpysgxqwdmrrevxspchx:Karthikeya.a1055@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=no-verify', ssl:{rejectUnauthorized:false}});
(async()=>{ await c.connect();
  const r=(await c.query(`SELECT id, subject_name, to_char(created_at AT TIME ZONE 'Asia/Kolkata','DD Mon HH24:MI') c, to_char(updated_at AT TIME ZONE 'Asia/Kolkata','DD Mon HH24:MI') u FROM assessment_papers WHERE id='755cf10a-d557-42e1-a5f2-c8cd92938674'`)).rows[0];
  console.log('paper:', JSON.stringify(r));
  await c.end(); })().catch(e=>console.error(e.message));
