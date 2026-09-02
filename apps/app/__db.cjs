const fs = require('fs');
const { Pool } = require('pg');
const txt = fs.readFileSync('/Users/karthikeyaalla/Downloads/uniconnect-mail-automation/.env','utf8');
let url = null;
for (const raw of txt.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line.startsWith('DATABASE_URL')) continue;
  const i = line.indexOf('=');
  if (i < 0) continue;
  url = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  break;
}
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const u = new URL(url);
u.searchParams.delete('sslmode');
module.exports = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
