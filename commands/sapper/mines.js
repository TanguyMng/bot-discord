import { SlashCommandBuilder } from 'discord.js';
import pool from '../../database/bd.js';

const MAX_MINES = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('mines')
    .setDescription('Pose des mines dans le salon (fusion de /mine et /mines)')
    .addIntegerOption(option =>
      option.setName('nb_mines')
        .setDescription('Nombre de mines à poser (défaut: 1)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(MAX_MINES)
    ),

  async execute(interaction) {
    const channelId = interaction.channelId;
    const nbMinesToAdd = interaction.options.getInteger('nb_mines') ?? 1;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock la ligne pour éviter la race condition
      const currentRes = await client.query(
        'SELECT mine_nb FROM sapper WHERE channel_id = $1 FOR UPDATE',
        [channelId]
      );

      let current = 0;
      let exists = false;

      if (currentRes.rows.length > 0) {
        current = currentRes.rows[0].mine_nb;
        exists = true;
      }

      // Vérifie la limite
      if (current + nbMinesToAdd > MAX_MINES) {
        await client.query('ROLLBACK');
        const remaining = MAX_MINES - current;
        if (remaining <= 0) {
          await interaction.reply({
            content: `❌ Salon déjà plein : ${MAX_MINES}/${MAX_MINES} mines.`,
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: `❌ Tu veux poser ${nbMinesToAdd} mines mais il ne reste que ${remaining} place(s). Actuellement : ${current}/${MAX_MINES}`,
            ephemeral: true
          });
        }
        return;
      }

      // Insert ou Update atomique
      if (!exists) {
        await client.query(
          'INSERT INTO sapper (channel_id, mine_nb) VALUES ($1, $2)',
          [channelId, nbMinesToAdd]
        );
      } else {
        await client.query(
          'UPDATE sapper SET mine_nb = mine_nb + $1 WHERE channel_id = $2',
          [nbMinesToAdd, channelId]
        );
      }

      await client.query('COMMIT');

      const total = current + nbMinesToAdd;
      const verbe = nbMinesToAdd > 1 ? `posé ${nbMinesToAdd} mines` : 'posé 1 mine';
      await interaction.reply(`💣 Tu as ${verbe}. Il y a maintenant **${total}/${MAX_MINES}** mines dans ce salon !`);

    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[mines] Erreur:', error);

      // Si c'est l'erreur 42P10, explique à l'utilisateur
      if (error.code === '42P10') {
        console.error('💡 FIX: Ta table sapper n a pas de contrainte UNIQUE sur channel_id. Lance ce SQL sur Railway: ALTER TABLE sapper ADD CONSTRAINT sapper_channel_id_key UNIQUE (channel_id);');
      }

      const reply = { content: "❌ Erreur interne lors de la pose des mines.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } finally {
      client.release();
    }
  }
};
