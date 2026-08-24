import pkg from 'pg';
const { Pool } = pkg;

function maskUrl(url) {
  if (!url) return 'vide';
  try {
    // Masque le password : postgresql://postgres:xxx@host -> postgresql://postgres:***@host
    return url.replace(/:([^:@]+)@/, ':***@');
  } catch { return '***'; }
}

function getDatabaseUrl() {
  const candidates = [
    'DATABASE_URL',
    'DATABASE_PRIVATE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRIVATE_URL',
    'DATABASE_PUBLIC_URL',
    'RAILWAY_SERVICE_POSTGRES_URL',
    'RAILWAY_SERVICE_POSTGRES_DATABASE_URL',
    'POSTGRESQL_URL'
  ];

  console.log('🔍 Recherche URL DB parmi:', candidates.join(', '));

  for (const key of candidates) {
    const val = process.env[key];
    if (!val) {
      console.log(`   - ${key}: non défini`);
      continue;
    }
    const trimmed = val.trim();
    if (trimmed === '') {
      console.log(`   - ${key}: défini mais VIDE (length 0) -> ignoré`);
      continue;
    }
    if (trimmed.includes('${{')) {
      console.log(`   - ${key}: contient \${{...}} non résolu -> ignoré: ${trimmed.slice(0,50)}...`);
      continue;
    }
    if (!trimmed.startsWith('postgres')) {
      console.log(`   - ${key}: ne commence pas par postgres -> ignoré: ${trimmed.slice(0,30)}`);
      continue;
    }
    console.log(`   ✅ ${key} trouvé: ${maskUrl(trimmed)}`);
    return trimmed;
  }
  return null;
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('');
  console.error('❌ Aucune URL valide trouvée !');
  console.error('Toutes les vars contenant database/postgres/pg:');
  Object.keys(process.env)
    .filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('postgres') || k === 'DATABASE_URL')
    .forEach(k => {
      const v = process.env[k];
      console.error(`   ${k} = ${v ? `"${v.slice(0,20)}... (len=${v.length})"` : 'VIDE'}`);
    });
  console.error('');
  console.error('💡 FIX RAILWAY:');
  console.error('1. Va dans ton service BOT (pas Shared) > Variables');
  console.error('2. Supprime DATABASE_URL s il existe');
  console.error('3. Clique Add Variable > Add Reference > Service: Postgres > Variable: DATABASE_URL');
  console.error('4. Railway va créer DATABASE_URL = ${{Postgres.DATABASE_URL}} résolu automatiquement');
  throw new Error('DATABASE_URL manquant');
}

console.log(`✅ URL finale utilisée: ${maskUrl(databaseUrl)}`);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Erreur pool:', err);
  process.exit(-1);
});

pool.query('SELECT NOW() as now')
  .then(r => console.log(`✅ Connecté à Postgres - ${r.rows[0].now}`))
  .catch(err => console.error('❌ Connexion échouée:', err.message, '- Vérifie que Postgres est bien démarré'));

export default pool;
