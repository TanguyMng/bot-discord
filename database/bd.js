import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL manquant dans le .env');
  console.error('Va sur Railway > Postgres > Variables > copie DATABASE_URL');
  throw new Error('DATABASE_URL manquant');
}

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
