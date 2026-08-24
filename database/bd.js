import pkg from 'pg';

const { Pool } = pkg;

function getDatabaseUrl() {
  // Railway peut fournir DATABASE_URL, DATABASE_PRIVATE_URL, POSTGRES_URL, etc.
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRIVATE_URL ||
    process.env.DATABASE_PUBLIC_URL
  );
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.error('❌ Aucune URL de DB trouvée !');
  console.error('Variables disponibles:', Object.keys(process.env).filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('postgres') || k.toLowerCase().includes('pg')));
  console.error('');
  console.error('Sur Railway, va dans:');
  console.error('1. Ton service BOT > Variables > Vérifie que DATABASE_URL existe et est résolue (pas ${{...}} en brut)');
  console.error('2. Si tu vois ${{Postgres.DATABASE_URL}} en brut, le nom du service est faux.');
  console.error('   Clique sur le service Postgres en haut, regarde son nom exact (ex: postgres, Postgres, postgresql)');
  console.error('   Puis dans ton service BOT > Variables > Edit DATABASE_URL > Reference > choisis le bon service > DATABASE_URL');
  console.error('3. Alternative: BOT > Variables > Add Reference > Service: Postgres > Variable: DATABASE_URL');
  throw new Error('DATABASE_URL manquant - voir logs ci-dessus');
}

console.log(`✅ DATABASE_URL trouvée: ${databaseUrl.split('@')[1]?.split('/')[0] || '***'}`); // log host sans password
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway exige SSL en prod, mais en local selon ta config ça peut être false
  // On met rejectUnauthorized: false car Railway utilise un cert auto-signé
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Erreur pool Postgres:', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('✅ Nouvelle connexion Postgres établie');
});

// Test au démarrage
try {
  const client = await pool.query('SELECT NOW() as now');
  console.log(`✅ Connecté à Postgres - ${client.rows[0].now}`);
} catch (err) {
  console.error('❌ Impossible de se connecter à Postgres:', err.message);
  console.error('Vérifie ton DATABASE_URL sur Railway');
}

export default pool;
