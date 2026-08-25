import { EmbedBuilder } from 'discord.js';
import { getData } from '../database/bddFunction.js';
import pool from '../database/bd.js';
import { getSchedule, getRecentCompletedMatches, getMatchesOfCurrentWeek, formatMatch, LEAGUES, ALL_LEAGUE_IDS } from './esportApi.js';

let isRunningResults = false;
let isRunningCalendar = false;

const CRENEAU_1 = { start: 9, end: 14 };  // LCK
const CRENEAU_2 = { start: 17, end: 22 }; // LEC + Majors
const DELAY_MATCH = 10 * 60 * 1000;
const DELAY_NIGHT = 60 * 60 * 1000;
const RESULT_LOOKBACK_HOURS = 2;
const RESULT_LOOKBACK_STARTUP = 24;

export default function startEsportTracker(client) {
  console.log('🎮 Esport Tracker V5 - 2 channels séparés (calendrier / résultats) + ping rôles');
  ensureTables();
  setTimeout(() => { 
    checkAndPostCalendar(client); 
    checkAndPostResults(client, RESULT_LOOKBACK_STARTUP); // 24h au démarrage pour rattraper hier
  }, 10000);
  setInterval(() => {
    const nowParis = getParisTime();
    if (nowParis.day === 1 && nowParis.hour === 9 && !isRunningCalendar) checkAndPostCalendar(client);
  }, 60 * 60 * 1000);
  scheduleNextResultsCheck(client);
}

function getParisTime() {
  const now = new Date();
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return { hour: paris.getHours(), day: paris.getDay() };
}
function isInMatchWindow() {
  const { hour } = getParisTime();
  return (hour >= CRENEAU_1.start && hour <= CRENEAU_1.end) || (hour >= CRENEAU_2.start && hour <= CRENEAU_2.end);
}
function getNextDelay() { return isInMatchWindow() ? DELAY_MATCH : DELAY_NIGHT; }
function scheduleNextResultsCheck(client) {
  const delay = getNextDelay();
  setTimeout(async () => {
    await checkAndPostResults(client);
    scheduleNextResultsCheck(client);
  }, delay);
}
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS esport_channels (channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('calendar','results','both')), created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS esport_posted_results (match_id TEXT PRIMARY KEY, league_name TEXT, posted_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS esport_roles (guild_id TEXT NOT NULL, league_name TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (guild_id, league_name));
      CREATE TABLE IF NOT EXISTS esport_posted_calendars (week_id TEXT NOT NULL, league_name TEXT NOT NULL, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, posted_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (week_id, league_name, guild_id));
      ALTER TABLE esport_channels ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'both';
    `);
  } catch {}
}
function extractWeekLabel(matches) {
  for (const m of matches) {
    if (m.blockName && m.blockName.toLowerCase().includes('week')) {
      const match = m.blockName.match(/Week\s*\d+/i);
      if (match) return match[0];
      return m.blockName;
    }
  }
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `Week ${weekNum}`;
}
function getWeekId() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum}`;
}
async function getRoleMentions(guildId, leagueNames) {
  try {
    const res = await pool.query(`SELECT league_name, role_id FROM esport_roles WHERE guild_id = $1`, [guildId]);
    const mentions = [];
    const lowerWanted = leagueNames.map(n => n.toLowerCase());
    for (const row of res.rows) {
      const rowLower = row.league_name.toLowerCase();
      const isWanted = lowerWanted.some(w => rowLower === w || rowLower.includes(w) || w.includes(rowLower) || (w === 'world' && rowLower === 'worlds') || (w === 'worlds' && rowLower === 'world'));
      if (isWanted) mentions.push(`<@&${row.role_id}>`);
    }
    return [...new Set(mentions)].join(' ');
  } catch { return ''; }
}
function getRoleIdsFromMentions(str) {
  if (!str) return [];
  return [...str.matchAll(/<@&(\d+)>/g)].map(m => m[1]);
}

// Récupère les channels par type (calendar / results) + compatibilité ancienne version (both)
async function getChannelsByType(type) {
  try {
    const all = await getData('esport_channels');
    return all.filter(c => c.type === type || c.type === 'both' || !c.type);
  } catch {
    return [];
  }
}

// --- vérifie si calendrier déjà posté cette semaine ---
async function isCalendarAlreadyPosted(weekId, leagueName, guildId) {
  try {
    const res = await pool.query(
      'SELECT 1 FROM esport_posted_calendars WHERE week_id = $1 AND league_name = $2 AND guild_id = $3',
      [weekId, leagueName, guildId]
    );
    return res.rows.length > 0;
  } catch { return false; }
}
async function markCalendarAsPosted(weekId, leagueName, guildId, channelId) {
  try {
    await pool.query(
      `INSERT INTO esport_posted_calendars (week_id, league_name, guild_id, channel_id) 
       VALUES ($1, $2, $3, $4) ON CONFLICT (week_id, league_name, guild_id) DO NOTHING`,
      [weekId, leagueName, guildId, channelId]
    );
  } catch {}
}

// --- CALENDRIER SÉPARÉ PAR LIGUE, DANS CHANNELS CALENDAR UNIQUEMENT ---

// --- CALENDRIER avec anti-doublon ---
async function checkAndPostCalendar(client, checkIfAlreadyPosted = false) {
  if (isRunningCalendar) return;
  isRunningCalendar = true;
  try {
    console.log(`[Esport] Calendrier hebdo (check doublon: ${checkIfAlreadyPosted})...`);
    const events = await getSchedule(ALL_LEAGUE_IDS);
    const weekMatches = getMatchesOfCurrentWeek(events);
    if (weekMatches.length === 0) return;

    const calendarChannels = await getChannelsByType('calendar');
    if (calendarChannels.length === 0) return;

    const byLeague = {};
    weekMatches.forEach(e => {
      const fmt = formatMatch(e);
      if (!byLeague[fmt.leagueName]) byLeague[fmt.leagueName] = [];
      byLeague[fmt.leagueName].push(fmt);
    });

    const weekId = getWeekId(); // ex: 2026-W34

    for (const channelRow of calendarChannels) {
      try {
        const channel = await client.channels.fetch(channelRow.channel_id);
        if (!channel?.isTextBased()) continue;

        for (const [leagueName, matches] of Object.entries(byLeague)) {
          // Si on est au redémarrage, on vérifie si déjà posté cette semaine
          if (checkIfAlreadyPosted) {
            const already = await isCalendarAlreadyPosted(weekId, leagueName, channelRow.guild_id);
            if (already) {
              console.log(`[Esport] Calendrier ${leagueName} ${weekId} déjà posté pour guild ${channelRow.guild_id}, skip`);
              continue;
            }
          }

          const weekLabel = extractWeekLabel(matches);
          const leagueInfo = Object.values(LEAGUES).find(l => l.name === leagueName);
          const roleMentions = await getRoleMentions(channelRow.guild_id, [leagueName]);

          const embed = new EmbedBuilder()
            .setTitle(`🏆 ${leagueName} - ${weekLabel} - Cette semaine`)
            .setColor(leagueName === 'LEC' ? '#00BFFF' : leagueName === 'LCK' ? '#E60012' : '#FFD700')
            .setThumbnail(leagueInfo?.image || null)
            .setTimestamp();

          let desc = '';
          const sorted = matches.sort((a,b) => a.startTime - b.startTime).slice(0, 10);
          for (const m of sorted) {
            const d = m.startTime.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' });
            const s = m.state === 'completed' ? '✅' : m.state === 'inProgress' ? '🔴 LIVE' : '⏳';
            desc += `${s} \`${d}\` **${m.team1Code} vs ${m.team2Code} (BO${m.bestOf})**\n`;
          }
          embed.setDescription(desc || 'Aucun match');

          await channel.send({
            content: roleMentions ? `${roleMentions} 📅 Calendrier ${leagueName} !` : undefined,
            embeds: [embed],
            allowedMentions: { roles: getRoleIdsFromMentions(roleMentions) }
          });

          // Marque comme posté
          await markCalendarAsPosted(weekId, leagueName, channelRow.guild_id, channelRow.channel_id);

          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err) {
        console.error(`[Esport] Calendrier ${channelRow.channel_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Esport] Calendrier:', err.message);
  } finally { isRunningCalendar = false; }
}

// --- RESULTATS DANS CHANNELS RESULTS UNIQUEMENT ---

async function checkAndPostResults(client, hours = RESULT_LOOKBACK_HOURS) {
  if (isRunningResults) return;
  isRunningResults = true;
  try {
    const events = await getSchedule(ALL_LEAGUE_IDS);
    const recent = getRecentCompletedMatches(events, hours);
    if (recent.length === 0) return;

    const resultsChannels = await getChannelsByType('results');
    if (resultsChannels.length === 0) {
      console.log('[Esport] Aucun channel results configuré. Utilise /esport-setup results_channel:#xxx');
      return;
    }

    for (const event of recent) {
      const fmt = formatMatch(event);
      if (await isAlreadyPosted(fmt.id)) continue;

      for (const channelRow of resultsChannels) {
        try {
          const channel = await client.channels.fetch(channelRow.channel_id);
          if (!channel?.isTextBased()) continue;
          const roleMentions = await getRoleMentions(channelRow.guild_id, [fmt.leagueName]);
          const embed = createResultEmbedWithLogos(fmt);
          await channel.send({
            content: roleMentions || undefined,
            embeds: [embed],
            allowedMentions: { roles: getRoleIdsFromMentions(roleMentions) }
          });
        } catch {}
      }
      await markAsPosted(fmt.id, fmt.leagueName);
    }
    await cleanupOldPosted();
  } catch (err) {
    console.error('[Esport] Résultats:', err.message);
  } finally { isRunningResults = false; }
}

async function isAlreadyPosted(matchId) {
  try {
    const res = await pool.query('SELECT 1 FROM esport_posted_results WHERE match_id = $1', [matchId]);
    return res.rows.length > 0;
  } catch { return false; }
}
async function markAsPosted(matchId, leagueName) {
  try {
    await pool.query('INSERT INTO esport_posted_results (match_id, league_name) VALUES ($1, $2) ON CONFLICT (match_id) DO NOTHING', [matchId, leagueName]);
  } catch {}
}
async function cleanupOldPosted() {
  try { await pool.query("DELETE FROM esport_posted_results WHERE posted_at < NOW() - INTERVAL '30 days'"); } catch {}
}

function createResultEmbedWithLogos(m) {
  const winner = m.team1Score > m.team2Score ? m.team1Code : m.team2Code;
  const isInternational = m.leagueType === 'international';
  const color = isInternational ? '#FFD700' : (m.leagueName === 'LEC' ? '#00BFFF' : '#E60012');

  return new EmbedBuilder()
    .setAuthor({ name: `${m.leagueName}`, iconURL: m.leagueImage || undefined })
    .setTitle(`${m.team1Code} ${m.team1Score} - ${m.team2Score} ${m.team2Code}`)
    .setColor(color)
    .setDescription(`**Victoire ${winner} (BO${m.bestOf})**\n📅 ${m.startTime.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`)
    .setThumbnail(m.leagueImage || null)
    .addFields(
      { name: `${m.team1Code}`, value: `${m.team1Name}`, inline: true },
      { name: 'VS', value: `**${m.team1Score} - ${m.team2Score}**`, inline: true },
      { name: `${m.team2Code}`, value: `${m.team2Name}`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: `${m.leagueName} • ID: ${m.id}`, iconURL: m.leagueImage || undefined });
}

export { checkAndPostCalendar, checkAndPostResults };
