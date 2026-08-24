import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getData, insertData, deleteData } from '../../database/bddFunction.js';
import pool from '../../database/bd.js';

export default {
  data: new SlashCommandBuilder()
    .setName('esport-setup')
    .setDescription('Configure les channels pour le calendrier et les résultats (séparés)')
    .addChannelOption(opt => 
      opt.setName('calendar_channel')
        .setDescription('Channel pour les calendriers du lundi (LCK/LEC/Majors)')
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('results_channel')
        .setDescription('Channel pour les résultats en live')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Mode de configuration')
        .setRequired(false)
        .addChoices(
          { name: 'Les deux séparés (recommandé)', value: 'both_separate' },
          { name: 'Même channel pour tout', value: 'same' },
          { name: 'Calendrier seulement', value: 'calendar_only' },
          { name: 'Résultats seulement', value: 'results_only' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const calendarChannel = interaction.options.getChannel('calendar_channel');
    const resultsChannel = interaction.options.getChannel('results_channel');
    const mode = interaction.options.getString('mode') || 'both_separate';
    const guildId = interaction.guildId;

    await interaction.deferReply({ ephemeral: true });

    try {
      // Assure que la table existe avec le nouveau champ type
      await pool.query(`
        CREATE TABLE IF NOT EXISTS esport_channels (
          channel_id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('calendar','results','both')),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE esport_channels ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'both';
      `);

      // Nettoie l'ancienne config du serveur si mode same
      if (mode === 'same' && calendarChannel) {
        // Supprime tout et met le même channel en mode both
        await pool.query('DELETE FROM esport_channels WHERE guild_id = $1', [guildId]);
        await insertData('esport_channels', {
          channel_id: calendarChannel.id,
          guild_id: guildId,
          type: 'both'
        });
        await interaction.editReply(`✅ **Mode même channel** : calendrier + résultats dans <#${calendarChannel.id}>\nChaque ligue aura son propre message avec son ping (ex: @LEC, @LCK)`);
        return;
      }

      let response = '';

      if (calendarChannel && (mode === 'both_separate' || mode === 'calendar_only' || mode === 'same')) {
        // Supprime ancien calendar
        await pool.query("DELETE FROM esport_channels WHERE guild_id = $1 AND type IN ('calendar','both')", [guildId]);
        if (mode === 'both_separate' || mode === 'calendar_only') {
          await insertData('esport_channels', {
            channel_id: calendarChannel.id,
            guild_id: guildId,
            type: 'calendar'
          });
          response += `📅 **Calendrier** : <#${calendarChannel.id}> (1 message par ligue : LEC, LCK, Worlds...)\n`;
        }
      }

      if (resultsChannel && (mode === 'both_separate' || mode === 'results_only')) {
        await pool.query("DELETE FROM esport_channels WHERE guild_id = $1 AND type = 'results' AND channel_id = $2", [guildId, resultsChannel.id]);
        // Pour results, on permet plusieurs channels, mais on nettoie d'abord les anciens results si both_separate
        if (mode === 'both_separate') {
          await pool.query("DELETE FROM esport_channels WHERE guild_id = $1 AND type = 'results'", [guildId]);
        }
        await insertData('esport_channels', {
          channel_id: resultsChannel.id,
          guild_id: guildId,
          type: 'results'
        });
        response += `🏆 **Résultats** : <#${resultsChannel.id}> (1 message par match avec ping @LEC/@LCK etc.)\n`;
      }

      // Si aucun channel fourni, affiche la config actuelle
      if (!calendarChannel && !resultsChannel) {
        const all = await getData('esport_channels', { guild_id: guildId });
        if (all.length === 0) {
          await interaction.editReply(
            `ℹ️ Aucun channel configuré.\n` +
            `Utilise :\n` +
            `\`/esport-setup calendar_channel:#calendrier results_channel:#resultats\` -> 2 channels séparés (recommandé)\n` +
            `\`/esport-setup calendar_channel:#esport mode:Même channel pour tout\` -> 1 seul channel\n`
          );
          return;
        }
        let desc = all.map(c => `- **${c.type}** : <#${c.channel_id}>`).join('\n');
        await interaction.editReply(`📋 Config actuelle:\n${desc}`);
        return;
      }

      if (response === '') response = '✅ Configuration mise à jour.';

      response += `\n💡 N'oublie pas de configurer les rôles à ping :\n\`/esport-roles set ligue:LEC role:@LEC\`\n\`/esport-roles set ligue:LCK role:@LCK\` etc.`;

      await interaction.editReply(response);

    } catch (err) {
      console.error('[esport-setup] Erreur:', err);
      await interaction.editReply(`❌ Erreur: ${err.message}\nSi table manquante, exécute database/schema_esport.sql sur Railway`);
    }
  }
};
