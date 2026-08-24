import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSchedule, getMatchesOfCurrentWeek, formatMatch, LEAGUES } from '../../esport/esportApi.js';

export default {
  data: new SlashCommandBuilder()
    .setName('esport-calendar')
    .setDescription('Affiche le calendrier LCK/LEC de la semaine')
    .addStringOption(opt =>
      opt.setName('ligue')
        .setDescription('Filtrer par ligue')
        .setRequired(false)
        .addChoices(
          { name: 'LEC', value: 'LEC' },
          { name: 'LCK', value: 'LCK' },
          { name: 'Les deux', value: 'ALL' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const ligueChoice = interaction.options.getString('ligue') || 'ALL';

    let leagueIds = [LEAGUES.LEC.id, LEAGUES.LCK.id];
    if (ligueChoice === 'LEC') leagueIds = [LEAGUES.LEC.id];
    if (ligueChoice === 'LCK') leagueIds = [LEAGUES.LCK.id];

    try {
      const events = await getSchedule(leagueIds);
      const weekMatches = getMatchesOfCurrentWeek(events);

      if (weekMatches.length === 0) {
        await interaction.editReply('📅 Aucun match LCK/LEC prévu cette semaine.');
        return;
      }

      // Groupe par ligue
      const byLeague = {};
      weekMatches.forEach(e => {
        const fmt = formatMatch(e);
        if (!byLeague[fmt.leagueName]) byLeague[fmt.leagueName] = [];
        byLeague[fmt.leagueName].push(fmt);
      });

      const embed = new EmbedBuilder()
        .setTitle(`📅 Calendrier ${ligueChoice} - Semaine en cours`)
        .setColor('#00BFFF')
        .setTimestamp();

      let desc = '';
      for (const [leagueName, matches] of Object.entries(byLeague)) {
        desc += `\n**${leagueName}**\n`;
        matches.sort((a, b) => a.startTime - b.startTime);
        for (const m of matches.slice(0, 15)) {
          const dateStr = m.startTime.toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris',
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          const status = m.state === 'completed' ? '✅' : m.state === 'inProgress' ? '🔴' : '⏳';
          desc += `${status} \`${dateStr}\` **${m.team1Code}** vs **${m.team2Code}** (BO${m.bestOf})\n`;
        }
      }

      embed.setDescription(desc.slice(0, 4000));
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[esport-calendar] Erreur:', err.message);
      await interaction.editReply('❌ Impossible de récupérer le calendrier (API lolesports indisponible).');
    }
  }
};
