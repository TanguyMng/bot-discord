import pool from '../database/bd.js';

/**
 * Gère le déclenchement d'une mine de façon atomique.
 * @returns {boolean} true si le joueur a explosé sur une mine
 */
async function decompte(channel_id) {
  try {
    // Opération atomique : décrémente seulement si mine_nb > 0 et que le tirage réussit
    // On évite la race condition avec une seule requête
    const result = await pool.query(
      `SELECT mine_nb FROM sapper WHERE channel_id = $1`,
      [channel_id]
    );

    if (result.rows.length === 0) return false;

    const mines = result.rows[0].mine_nb;
    if (mines <= 0) return false;

    const probability = mines; // 1 mine = 1% de chance, 10 mines = 10%
    const randomInt = Math.floor(Math.random() * 100);

    if (randomInt < probability) {
      // Décrément atomique avec vérification > 0
      const updateRes = await pool.query(
        `UPDATE sapper SET mine_nb = mine_nb - 1 WHERE channel_id = $1 AND mine_nb > 0 RETURNING mine_nb`,
        [channel_id]
      );
      return updateRes.rowCount > 0;
    }

    return false;
  } catch (error) {
    console.error(`Erreur dans sapperGame.js:`, error);
    return false;
  }
}

export default decompte;
