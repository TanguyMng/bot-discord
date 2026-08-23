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
    // Si l'utilisateur ne met rien, on pose 1 mine -> compatible avec l'ancien /mine
    const nbMinesToAdd = interaction.options.getInteger('nb_mines') ?? 1;

    try {
      // Requête atomique : on insère ou on incrémente, mais seulement si on ne dépasse pas MAX
      const query = `
        INSERT INTO sapper (channel_id, mine_nb) VALUES ($1, $2)
        ON CONFLICT (channel_id) DO UPDATE 
        SET mine_nb = sapper.mine_nb + EXCLUDED.mine_nb
        WHERE sapper.mine_nb + EXCLUDED.mine_nb <= $3
        RETURNING mine_nb;
      `;

      const result = await pool.query(query, [channelId, nbMinesToAdd, MAX_MINES]);

      // Succès : on a posé les mines
      if (result.rows.length > 0) {
        const total = result.rows[0].mine_nb;
        const verbe = nbMinesToAdd > 1 ? `posé ${nbMinesToAdd} mines` : 'posé 1 mine';
        await interaction.reply(`💣 Tu as ${verbe}. Il y a maintenant **${total}/${MAX_MINES}** mines dans ce salon !`);
        return;
      }

      // Échec : on aurait dépassé la limite, on informe l'utilisateur
      const currentRes = await pool.query('SELECT mine_nb FROM sapper WHERE channel_id = $1', [channelId]);
      const current = currentRes.rows[0]?.mine_nb || 0;
      const remaining = MAX_MINES - current;

      if (remaining <= 0) {
        await interaction.reply({
          content: `❌ Salon déjà plein : ${MAX_MINES}/${MAX_MINES} mines. Fais attention où tu mets les pieds !`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌ Tu veux poser ${nbMinesToAdd} mines mais il ne reste que ${remaining} place(s). Actuellement : ${current}/${MAX_MINES}`,
          ephemeral: true
        });
      }

    } catch (error) {
      console.error('[mines] Erreur:', error);
      const reply = { content: "❌ Erreur interne lors de la pose des mines.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }
};
