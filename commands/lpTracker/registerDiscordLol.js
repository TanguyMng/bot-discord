import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import { getData, insertData } from '../../database/bddFunction.js';

const riotAPIKey = process.env.riotAPIKey;

export default {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Lie ton compte Discord à un compte League of Legends')
    .addStringOption(option =>
      option.setName('playername')
        .setDescription('Riot ID - Nom (ex: Faker)')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(16)
    )
    .addStringOption(option =>
      option.setName('tag')
        .setDescription('Riot ID - Tag (ex: EUW, 1234)')
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(5)
    ),

  async execute(interaction) {
    // On defer pour avoir le temps d'appeler Riot (peut prendre 2-3 sec)
    await interaction.deferReply({ ephemeral: true });

    const summonerName = interaction.options.getString('playername').trim();
    const summonerTag = interaction.options.getString('tag').trim();
    const discordId = interaction.user.id;
    const discordName = interaction.user.username;

    try {
      if (!riotAPIKey) {
        await interaction.editReply('❌ Configuration serveur incomplète: clé Riot manquante.');
        return;
      }

      // 1. Récupérer les infos Riot d'abord (pour avoir le PUUID)
      const summonerInfo = await getSummonerInfo(summonerName, summonerTag);
      if (!summonerInfo) {
        await interaction.editReply(`❌ Impossible de trouver le joueur **${summonerName}#${summonerTag}**. Vérifie l'orthographe.`);
        return;
      }

      // 2. Vérifier si ce compte LoL est déjà enregistré
      const existingAccount = await getData('lol_accounts', { puuid: summonerInfo.puuid });
      if (existingAccount.length > 0) {
        await interaction.editReply(`⚠️ Le compte **${summonerInfo.gameName}#${summonerInfo.tagLine}** est déjà lié à un compte Discord.`);
        return;
      }

      // 3. Récupérer / créer l'utilisateur Discord en base
      let users = await getData('discord_users', { discord_id: discordId });
      let discordUserId;
      if (users.length === 0) {
        const inserted = await insertData('discord_users', {
          discord_id: discordId,
          discord_name: discordName
        });
        discordUserId = inserted.id;
      } else {
        discordUserId = users[0].id;
      }

      // 4. Récupérer Rank + LP + Last Game (en parallèle pour aller plus vite)
      const [rankData, lastGameId] = await Promise.all([
        getPlayerRankAndLp(summonerInfo.puuid),
        getLastGameID(summonerInfo.puuid)
      ]);

      // 5. Insérer dans lol_accounts
      const lolAccount = {
        discord_user_id: discordUserId,
        game_name: summonerInfo.gameName,
        tag: summonerInfo.tagLine,
        puuid: summonerInfo.puuid,
        last_game_id: lastGameId || '',
        lp: rankData.lp,
        rank: rankData.rank,
        tier: rankData.tier
      };

      await insertData('lol_accounts', lolAccount);

      await interaction.editReply(
        `✅ Compte lié ! **${lolAccount.game_name}#${lolAccount.tag}** (${lolAccount.tier} ${lolAccount.rank} ${lolAccount.lp ?? 0} LP) est maintenant suivi.`
      );

    } catch (error) {
      console.error('[register] Erreur:', error);
      // Erreur de contrainte unique Postgres
      if (error.code === '23505') {
        await interaction.editReply('⚠️ Ce compte est déjà enregistré.');
      } else {
        await interaction.editReply('❌ Une erreur est survenue lors de l\'association du compte.');
      }
    }
  }
};

// --- Fonctions pures, sans état global ---

async function getSummonerInfo(summonerName, tag) {
  try {
    const response = await axios.get(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tag)}`,
      { params: { api_key: riotAPIKey }, timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    console.error('[getSummonerInfo] Riot API error:', error.response?.status, error.message);
    return null;
  }
}

async function getPlayerRankAndLp(puuid) {
  try {
    const url = `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const response = await axios.get(url, { params: { api_key: riotAPIKey }, timeout: 5000 });
    const soloQueue = response.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');

    if (soloQueue) {
      return {
        lp: soloQueue.leaguePoints,
        rank: soloQueue.rank,
        tier: soloQueue.tier
      };
    }
    return { lp: null, rank: '', tier: 'UNRANKED' };
  } catch (error) {
    console.error('[getPlayerRankAndLp] error:', error.message);
    return { lp: null, rank: '', tier: 'UNRANKED' };
  }
}

async function getLastGameID(puuid) {
  try {
    const response = await axios.get(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`,
      {
        params: { type: 'ranked', start: 0, count: 1, api_key: riotAPIKey },
        timeout: 5000
      }
    );
    const gameIDs = response.data;
    return Array.isArray(gameIDs) && gameIDs.length > 0 ? gameIDs[0] : '';
  } catch (error) {
    console.error('[getLastGameID] error:', error.message);
    return '';
  }
}
