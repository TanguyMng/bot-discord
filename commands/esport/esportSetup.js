import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getData, insertData, deleteData } from '../../database/bddFunction.js';
import pool from '../../database/bd.js';

export default {
  data: new SlashCommandBuilder()
    .setName('esport-setup')
    .setDescription('Configure le channel pour le calendrier LCK/LEC')
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel où poster').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const guildId = interaction.guildId;

    try {
      // Vérifie que la table existe, sinon la crée
      await pool.query(`
        CREATE TABLE IF NOT EXISTS esport_channels (
          channel_id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      const existing = await getData('esport_channels', { channel_id: channel.id });
      if (existing.length > 0) {
        await interaction.reply({ content: `✅ Ce channel <#${channel.id}> est déjà configuré pour l'esport.`, ephemeral: true });
        return;
      }

      await insertData('esport_channels', {
        channel_id: channel.id,
        guild_id: guildId
      });

      await interaction.reply(`✅ Calendrier LCK/LEC configuré dans <#${channel.id}> !\n- Calendrier chaque lundi 9h\n- Résultats en live toutes les 30 min`);

    } catch (err) {
      console.error('[esport-setup] Erreur:', err);
      await interaction.reply({ content: '❌ Erreur lors de la config.', ephemeral: true });
    }
  }
};
