import { EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { getData, updateData, insertData, deleteData } from '../database/bddFunction.js';

// --- Config ---
const QUEUE_SOLO_DUO = 420;
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DELAY_BETWEEN_PLAYERS_MS = 1200; // 1.2s entre chaque joueur pour respecter le rate limit Riot (20 req/s)
const MAX_RETRIES_429 = 3;

let isRunning = false;

// --- Helpers ---

function createMData() {
  return {
    pseudo: '', gameStatue: '', lp: 0, lpGeneral: 0, tier: '', rank: '', color: '',
    kills: 0, deaths: 0, assists: 0, champion: '', queue: '', wins: 0, losses: 0,
    gameID: '', win: false, promotion: 'no'
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeInt(val) {
  return (val === '' || val === undefined || val === null) ? null : Number(val);
}

// Axios wrapper avec retry automatique sur 429
async function fetchRiot(url, riotKey, retries = MAX_RETRIES_429) {
  try {
    // On ajoute api_key en param pour éviter de le logger dans l'URL complète
    const separator = url.includes('?') ? '&' : '?';
    const res = await axios.get(`${url}${separator}api_key=${riotKey}`, { timeout: 8000 });
    return res.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 429 && retries > 0) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '2', 10) * 1000;
      console.warn(`[Riot] 429 Rate limited, retry dans ${retryAfter}ms... (${retries} restants)`);
      await sleep(retryAfter + 200);
      return fetchRiot(url, riotKey, retries - 1);
    }
    // 404 = joueur pas trouvé ou pas de ranked, on ne retry pas
    if (status === 404) return null;
    throw error;
  }
}

// --- Core Logic ---

export default async function trackingLp(client, riotKey) {
  if (isRunning) {
    console.log('[LP Tracker] Une vérification est déjà en cours, skip.');
    return;
  }
  isRunning = true;

  try {
    console.log('[LP Tracker] Début vérification des games...');
    const accounts = await getData('lol_accounts');

    if (accounts.length === 0) {
      console.log('[LP Tracker] Aucun compte à tracker');
      return;
    }

    for (const item of accounts) {
      try {
        // 1. Vérifier si le PUUID a changé (changement de Riot ID)
        const currentPuuid = await verifPuuid(item.game_name, item.tag, item.puuid, riotKey);

        const m_data = createMData();

        // 2. Récupérer la dernière game soloQ
        const played = await getPlayerLastSoloDuo(riotKey, currentPuuid, item.last_game_id, m_data);

        if (!played) {
          await sleep(DELAY_BETWEEN_PLAYERS_MS);
          continue;
        }

        m_data.pseudo = `${item.game_name}#${item.tag}`;

        // 3. Récupérer le rank/LP actuel et calculer le gain/perte
        await getPlayerRankAndLp(currentPuuid, riotKey, item.lp, item.tier, item.rank, m_data);

        // 4. Mettre à jour la DB
        await updateLastGameID(currentPuuid, m_data.gameID, m_data.lpGeneral, m_data.rank, m_data.tier);

        // On garde un historique propre : on supprime l'ancien doublon si existe
        await deleteData('lol_matches', { puuid: currentPuuid, match_id: m_data.gameID });
        await insertData('lol_matches', {
          puuid: currentPuuid,
          match_id: m_data.gameID,
          queue_type: m_data.queue,
          champion: m_data.champion,
          kills: safeInt(m_data.kills),
          deaths: safeInt(m_data.deaths),
          assists: safeInt(m_data.assists),
          win: m_data.gameStatue === 'win',
          lp_change: safeInt(m_data.lp),
          tier: m_data.tier,
          rank: m_data.rank,
          played_at: new Date()
        });

        // 5. Envoyer dans tous les channels configurés
        const allChannels = await getData('lptracker_channels');
        for (const channelRow of allChannels) {
          await scheduleMessage(client, m_data, channelRow.channel_id);
          await sleep(500); // petit délai pour pas spam Discord
        }

      } catch (innerErr) {
        console.error(`[LP Tracker] Erreur pour ${item.game_name}#${item.tag}:`, innerErr.message);
        // On continue avec le joueur suivant, on ne bloque pas toute la boucle
      }

      await sleep(DELAY_BETWEEN_PLAYERS_MS);
    }

    console.log('[LP Tracker] Fin vérification');

  } catch (err) {
    console.error('[LP Tracker] Erreur globale:', err);
  } finally {
    isRunning = false;
    // Re-planifier
    setTimeout(() => trackingLp(client, riotKey), CHECK_INTERVAL_MS);
  }
}

async function verifPuuid(summonerName, tag, puuid, riotAPIKey) {
  try {
    const data = await fetchRiot(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(summonerName)}/${encodeURIComponent(tag)}`,
      riotAPIKey
    );
    if (!data) return puuid;

    const newPuuid = data.puuid;
    if (newPuuid === puuid) return puuid;

    console.log(`[LP Tracker] PUUID changé pour ${summonerName}#${tag}: ${puuid} -> ${newPuuid}`);
    await updateData('lol_accounts', { puuid: newPuuid }, { puuid: puuid });
    await updateData('lol_matches', { puuid: newPuuid }, { puuid: puuid });
    return newPuuid;
  } catch (error) {
    console.error('[verifPuuid] Erreur:', error.message);
    return puuid;
  }
}

async function getPlayerRankAndLp(puuid, riotKey, lastLp, lastTier, lastRank, m_data) {
  try {
    const leagueEntries = await fetchRiot(
      `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
      riotKey
    );
    if (!leagueEntries) return;

    const soloQueue = leagueEntries.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    if (!soloQueue) {
      m_data.tier = 'UNRANKED';
      m_data.rank = '';
      m_data.lpGeneral = 0;
      return;
    }

    m_data.queue = soloQueue.queueType;
    m_data.tier = soloQueue.tier;
    m_data.rank = soloQueue.rank;
    m_data.lpGeneral = soloQueue.leaguePoints;
    m_data.wins = soloQueue.wins;
    m_data.losses = soloQueue.losses;

    const tierChanged = lastTier !== m_data.tier;
    const rankChanged = lastRank !== m_data.rank;
    const lpDefined = lastLp !== undefined && lastLp !== null && m_data.lpGeneral !== undefined;

    if (!lpDefined) {
      m_data.lp = 0;
      m_data.promotion = 'no';
      return;
    }

    if (!tierChanged && !rankChanged) {
      // Même division : simple diff
      m_data.lp = m_data.lpGeneral - lastLp;
      m_data.promotion = 'no';
    } else if (m_data.gameStatue === 'win') {
      // Promotion : ex 90 LP -> 20 LP = (100-90)+20 = +30
      m_data.promotion = 'up';
      m_data.lp = (100 - lastLp) + m_data.lpGeneral;
    } else {
      // Relégation : ex 10 LP Gold -> 75 LP Silver = - (10 + (100-75)) = -35
      // BUG ORIGINAL CORRIGÉ ICI : il manquait le signe négatif
      m_data.promotion = 'down';
      m_data.lp = -((100 - m_data.lpGeneral) + lastLp);
    }

  } catch (error) {
    console.error('[getPlayerRankAndLp] Erreur:', error.message);
  }
}

async function getPlayerLastSoloDuo(riotKey, puuid, lastGameID, m_data) {
  try {
    // 1. Récupère le dernier match ID ranked
    const gameIDs = await fetchRiot(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&start=0&count=1`,
      riotKey
    );

    if (!Array.isArray(gameIDs) || gameIDs.length === 0) return false;

    const gameID = gameIDs[0];
    if (lastGameID && lastGameID === gameID) return false; // déjà traité

    // 2. Récupère les détails du match
    const matchDetails = await fetchRiot(
      `https://europe.api.riotgames.com/lol/match/v5/matches/${gameID}`,
      riotKey
    );
    if (!matchDetails) return false;

    // 3. Vérifie que c'est bien du Solo/Duo
    if (matchDetails.info.queueId !== QUEUE_SOLO_DUO) {
      // On met à jour le last_game_id même si c'est pas du soloQ pour ne pas le re-check en boucle
      m_data.gameID = gameID; // pour updateLastGameID plus tard ? Non, on ne veut pas si pas soloQ
      // En fait on ne veut PAS update si ce n'est pas du soloQ, sinon on raterait une vraie game soloQ après
      // Donc on return false sans update, mais on pourrait vouloir stocker quand même
      // Choix: on ne traite que soloQ, donc on ignore
      return false;
    }

    // 4. Trouve le participant
    const participant = matchDetails.info.participants.find(p => p.puuid === puuid);
    if (!participant) return false;

    // 5. Rempli m_data
    m_data.gameID = gameID;
    m_data.champion = participant.championName;
    m_data.kills = participant.kills;
    m_data.deaths = participant.deaths;
    m_data.assists = participant.assists;
    m_data.win = participant.win;
    m_data.gameStatue = participant.win ? 'win' : 'loss';
    m_data.color = participant.win ? '#00FF88' : '#FF4444';
    m_data.queue = 'RANKED_SOLO_5x5';

    return true;

  } catch (error) {
    console.error('[getPlayerLastSoloDuo] Erreur:', error.message);
    return false;
  }
}

// --- Discord ---

function createGameResultsEmbed(m_data) {
  const isWin = m_data.gameStatue === 'win';
  const lpText = m_data.lp > 0 ? `+${m_data.lp}` : `${m_data.lp}`;

  let description = '';
  if (m_data.promotion === 'up') {
    description = `**${m_data.pseudo}** a gagné **${lpText} LP** et a été promu **${m_data.tier} ${m_data.rank}** avec ${m_data.lpGeneral} LP ! 🎉`;
  } else if (m_data.promotion === 'down') {
    description = `**${m_data.pseudo}** a perdu **${lpText} LP** et a été relégué **${m_data.tier} ${m_data.rank}** avec ${m_data.lpGeneral} LP... 💀`;
  } else {
    description = `**${m_data.pseudo}** a ${isWin ? 'gagné' : 'perdu'} **${lpText} LP** et est maintenant **${m_data.tier} ${m_data.rank} ${m_data.lpGeneral} LP**`;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Pablo • LP Tracker', iconURL: 'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/29.png' })
    .setTitle(isWin ? '✅ Victory' : '❌ Defeat')
    .setDescription(description)
    .setColor(m_data.color || (isWin ? '#00FF88' : '#FF4444'))
    .setThumbnail(`https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/${m_data.champion}.png`)
    .addFields(
      { name: 'Score', value: `${m_data.kills}/${m_data.deaths}/${m_data.assists}`, inline: true },
      { name: 'Champion', value: m_data.champion || 'Inconnu', inline: true },
      { name: 'Queue', value: m_data.queue || 'Solo/Duo', inline: true },
    )
    .setTimestamp();

  return embed;
}

async function scheduleMessage(client, m_data, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error(`[scheduleMessage] Channel ${channelId} non textuel ou introuvable`);
      return;
    }
    await channel.send({ embeds: [createGameResultsEmbed(m_data)] });
  } catch (error) {
    console.error(`[scheduleMessage] Erreur envoi ${channelId}:`, error.message);
  }
}

async function updateLastGameID(puuid, newGameID, newLp, newRank, newTier) {
  try {
    await updateData('lol_accounts',
      { last_game_id: newGameID, lp: safeInt(newLp), rank: newRank, tier: newTier },
      { puuid: puuid }
    );
  } catch (error) {
    console.error('[updateLastGameID] Erreur:', error.message);
  }
}
