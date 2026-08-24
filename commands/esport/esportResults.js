import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getSchedule, getRecentCompletedMatches, formatMatch, LEAGUES } from '../../esport/esportApi.js';

export default {
  data: new SlashCommandBuilder()
    .setName('esport-results')
    .setDescription('Affiche les derniers résultats LCK/LEC')
    .addIntegerOption(opt =>
      opt.setName('heures')
        .setDescription('Résultats des dernières X heures (défaut 24h)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(168)
    )
    .addStringOption(opt =>
      opt.setName('ligue')
        .setDescription('Filtrer')
        .setRequired(false)
        .addChoices(
          { name: 'LEC', value: 'LEC' },
          { name: 'LCK', value: 'LCK' },
          { name: 'Les deux', value: 'ALL' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const hours = interaction.options.getInteger('heures') || 24;
    const ligueChoice = interaction.options.getString('ligue') || 'ALL';

    let leagueIds = [LEAGUES.LEC.id, LEAGUES.LCK.id];
    if (ligueChoice === 'LEC') leagueIds = [LEAGUES.LEC.id];
    if (ligueChoice === 'LCK') leagueIds = [LEAGUES.LCK.id];

    try {
      const events = await getSchedule(leagueIds);
      const recent = getRecentCompletedMatches(events, hours);

      if (recent.length === 0) {
        await interaction.editReply(`Aucun résultat ${ligueChoice} dans les dernières ${hours}h.`);
        return;
      }

      const embeds = recent.slice(0, 10).map(event => {
        const m = formatMatch(event);
        const winner = m.team1Score > m.team2Score ? m.team1Code : m.team2Code;
        return new EmbedBuilder()
          .setTitle(`🏆 ${m.leagueName} - ${m.blockName}`)
          .setColor(m.leagueName === 'LEC' ? '#FFD700' : '#E60012')
          .setDescription(`**${m.team1Code} ${m.team1Score} - ${m.team2Score} ${m.team2Code}**\nVictoire **${winner}** en BO${m.bestOf}`)
          .setFooter({ text: `${m.startTime.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` })
          .setTimestamp();
      });

      await interaction.editReply({ embeds: embeds.slice(0, 10) });

    } catch (err) {
      console.error('[esport-results] Erreur:', err.message);
      await interaction.editReply('❌ Impossible de récupérer les résultats.');
    }
  }
};
