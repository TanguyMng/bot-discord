import pool from './bd.js';

// Whitelist des tables autorisées - PROTECTION ANTI-INJECTION SQL
const ALLOWED_TABLES = [
  'lol_accounts',
  'discord_users',
  'lptracker_channels',
  'sapper',
  'lol_matches'
];

// Regex pour valider les noms de colonnes (lettres, chiffres, underscore)
const COLUMN_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertAllowedTable(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Table non autorisée: ${tableName}. Tables autorisées: ${ALLOWED_TABLES.join(', ')}`);
  }
}

function assertValidColumns(columns) {
  for (const col of columns) {
    if (!COLUMN_REGEX.test(col)) {
      throw new Error(`Nom de colonne invalide: ${col}`);
    }
  }
}

/**
 * Insère des données dans une table.
 * @returns {Object} la ligne insérée
 */
export async function insertData(tableName, data) {
  assertAllowedTable(tableName);
  const keys = Object.keys(data);
  const values = Object.values(data);

  if (keys.length === 0) throw new Error('Aucune donnée à insérer');
  assertValidColumns(keys);

  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const query = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error(`[DB] Erreur INSERT INTO ${tableName}:`, err.message);
    throw err; // On propage pour que l'appelant puisse gérer (ex: duplicate key)
  }
}

/**
 * Supprime des données
 * @returns {number} nombre de lignes supprimées
 */
export async function deleteData(tableName, criteria) {
  assertAllowedTable(tableName);
  const keys = Object.keys(criteria);
  const values = Object.values(criteria);

  if (keys.length === 0) throw new Error('Criteria vide pour DELETE - refusé par sécurité');
  assertValidColumns(keys);

  const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
  const query = `DELETE FROM ${tableName} WHERE ${whereClause}`;

  try {
    const result = await pool.query(query, values);
    return result.rowCount;
  } catch (err) {
    console.error(`[DB] Erreur DELETE FROM ${tableName}:`, err.message);
    throw err;
  }
}

/**
 * Récupère des données
 * @returns {Array} rows
 */
export async function getData(tableName, criteria = {}) {
  assertAllowedTable(tableName);
  const keys = Object.keys(criteria);
  const values = Object.values(criteria);

  if (keys.length > 0) assertValidColumns(keys);

  const whereClause = keys.length > 0
    ? ' WHERE ' + keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ')
    : '';

  const query = `SELECT * FROM ${tableName}${whereClause}`;

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (err) {
    console.error(`[DB] Erreur SELECT FROM ${tableName}:`, err.message);
    throw err;
  }
}

/**
 * Met à jour des données
 * @returns {number} nombre de lignes affectées
 */
export async function updateData(table, updates, criteria) {
  assertAllowedTable(table);
  const updateKeys = Object.keys(updates);
  const criteriaKeys = Object.keys(criteria);

  if (updateKeys.length === 0) throw new Error('Aucune colonne à mettre à jour');
  if (criteriaKeys.length === 0) throw new Error('Criteria vide pour UPDATE - refusé par sécurité');

  assertValidColumns([...updateKeys, ...criteriaKeys]);

  const updateFields = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
  const whereClauses = criteriaKeys.map((key, i) => `${key} = $${i + 1 + updateKeys.length}`).join(' AND ');

  const query = `UPDATE ${table} SET ${updateFields} WHERE ${whereClauses}`;
  const values = [...Object.values(updates), ...Object.values(criteria)];

  try {
    const res = await pool.query(query, values);
    return res.rowCount;
  } catch (err) {
    console.error(`[DB] Erreur UPDATE ${table}:`, err.message);
    throw err;
  }
}

/**
 * Upsert sécurisé
 */
export async function upsertData(table, data, conflictColumn) {
  assertAllowedTable(table);
  if (!COLUMN_REGEX.test(conflictColumn)) {
    throw new Error(`Colonne de conflit invalide: ${conflictColumn}`);
  }

  const columns = Object.keys(data);
  const values = Object.values(data);

  assertValidColumns(columns);

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateClause = columns.map((col, i) => `${col} = $${i + 1 + columns.length}`).join(', ');

  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${conflictColumn})
    DO UPDATE SET ${updateClause}
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [...values, ...values]);
    return result.rows[0];
  } catch (err) {
    console.error(`[DB] Erreur UPSERT ${table}:`, err.message);
    throw err;
  }
}
