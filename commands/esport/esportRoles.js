import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import pool from '../../database/bd.js';

export default {
  data: new SlashCommandBuilder()
    .setName('esport-roles')
    .setDescription('Configure les rôles à ping pour chaque ligue')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Définir le rôle à ping pour une ligue')
        .addStringOption(opt =>
          opt.setName('ligue')
            .setDescription('Ligue')
            .setRequired(true)
            .addChoices(
              { name: 'LEC', value: 'LEC' },
              { name: 'LCK', value: 'LCK' },
              { name: 'First Stand', value: 'First Stand' },
              { name: 'MSI', value: 'MSI' },
              { name: 'World', value: 'World' },
              { name: 'Worlds', value: 'Worlds' },
              { name: 'EWC', value: 'EWC' },
            )
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Rôle à ping')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Voir les rôles configurés')
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Supprimer le ping pour une ligue')
        .addStringOption(opt =>
          opt.setName('ligue')
            .setDescription('Ligue')
            .setRequired(true)
            .addChoices(
              { name: 'LEC', value: 'LEC' },
              { name: 'LCK', value: 'LCK' },
              { name: 'First Stand', value: 'First Stand' },
              { name: 'MSI', value: 'MSI' },
              { name: 'World', value: 'World' },
              { name: 'Worlds', value: 'Worlds' },
              { name: 'EWC', value: 'EWC' },
            )
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // Assure que la table existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS esport_roles (
        guild_id TEXT NOT NULL,
        league_name TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (guild_id, league_name)
      )
    `);

    if (sub === 'set') {
      const ligue = interaction.options.getString('ligue');
      const role = interaction.options.getRole('role');

      // Normalise World/Worlds
      const normalizedLigue = ligue.toLowerCase() === 'world' ? 'Worlds' : ligue;

      await pool.query(
        `INSERT INTO esport_roles (guild_id, league_name, role_id) VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, league_name) DO UPDATE SET role_id = $3`,
        [guildId, normalizedLigue, role.id]
      );

      await interaction.reply({
        content: `✅ Rôle ${role} sera ping pour **${normalizedLigue}**\nExemple: quand un match ${normalizedLigue} sera posté, je ferai <@&${role.id}>`,
        ephemeral: true,
        allowedMentions: { roles: [] } // ne ping pas pendant la config
      });

    } else if (sub === 'list') {
      const res = await pool.query('SELECT league_name, role_id FROM esport_roles WHERE guild_id = $1', [guildId]);
      if (res.rows.length === 0) {
        await interaction.reply({ content: 'Aucun rôle configuré. Utilise `/esport-roles set`', ephemeral: true });
        return;
      }

      let desc = res.rows.map(r => `**${r.league_name}** -> <@&${r.role_id}>`).join('\n');
      await interaction.reply({ content: `📋 Rôles configurés:\n${desc}`, ephemeral: true, allowedMentions: { roles: [] } });

    } else if (sub === 'remove') {
      const ligue = interaction.options.getString('ligue');
      const normalizedLigue = ligue.toLowerCase() === 'world' ? 'Worlds' : ligue;

      await pool.query('DELETE FROM esport_roles WHERE guild_id = $1 AND LOWER(league_name) = LOWER($2)', [guildId, normalizedLigue]);
      await interaction.reply({ content: `🗑️ Ping supprimé pour **${normalizedLigue}**`, ephemeral: true });
    }
  }
};
