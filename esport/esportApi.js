import axios from 'axios';

const API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const BASE_URL = 'https://esports-api.lolesports.com/persisted/gw';

export const LEAGUES = {
  LEC: { id: '98767991302996019', name: 'LEC', slug: 'lec', type: 'regional', image: 'https://am-a.akamaihd.net/image?f=https://am-a.akamaihd.net/image?resize=60:60&f=http%3A%2F%2Fstatic.lolesports.com%2Fleagues%2FLEC.png' },
  LCK: { id: '98767991310872058', name: 'LCK', slug: 'lck', type: 'regional', image: 'https://am-a.akamaihd.net/image?f=https://am-a.akamaihd.net/image?resize=60:60&f=http%3A%2F%2Fstatic.lolesports.com%2Fleagues%2FLCK.png' },
  FIRST_STAND: { id: '113464388705111224', name: 'First Stand', slug: 'first_stand', type: 'international' },
  MSI: { id: '98767991325878492', name: 'MSI', slug: 'msi', type: 'international' },
  WORLDS: { id: '98767975604431411', name: 'Worlds', slug: 'worlds', type: 'international' },
  EWC: { id: null, name: 'Esports World Cup', slug: 'ewc', type: 'international' },
};

export const ALL_LEAGUE_IDS = Object.values(LEAGUES).map(l => l.id).filter(Boolean);

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'x-api-key': API_KEY },
  timeout: 10000,
});

export async function getSchedule(leagueIds = ALL_LEAGUE_IDS) {
  try {
    const validIds = leagueIds.filter(Boolean);
    if (validIds.length === 0) return [];
    const params = { hl: 'en-US', leagueId: validIds.join(',') };
    const res1 = await axiosInstance.get('/getSchedule', { params });
    const events1 = res1.data?.data?.schedule?.events || [];
    const olderToken = res1.data?.data?.schedule?.pages?.older;

    let events2 = [];
    if (olderToken) {
      try {
        const res2 = await axiosInstance.get('/getSchedule', { params: { ...params, pageToken: olderToken } });
        events2 = res2.data?.data?.schedule?.events || [];
      } catch {}
    }

    const allEvents = [...events1, ...events2];
    return allEvents.filter(e => e.match);
  } catch (err) {
    console.error('[EsportAPI] getSchedule error:', err.response?.status, err.message);
    throw err;
  }
}

export function getMatchesOfCurrentWeek(events) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return events.filter(e => {
    const start = new Date(e.startTime);
    return start >= monday && start <= sunday;
  });
}

export function getRecentCompletedMatches(events, hours = 2) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return events.filter(e => e.state === 'completed' && new Date(e.startTime) >= cutoff);
}

export function formatMatch(event) {
  const team1 = event.match.teams[0];
  const team2 = event.match.teams[1];

  return {
    id: event.match.id,
    leagueId: event.league?.id,
    leagueName: event.league?.name || 'Unknown',
    leagueImage: event.league?.image || LEAGUES[Object.keys(LEAGUES).find(k => LEAGUES[k].id === event.league?.id)]?.image || null,
    blockName: event.blockName || '',
    team1Code: team1?.code || 'TBD',
    team1Name: team1?.name || 'TBD',
    team1Image: team1?.image || null,
    team1Score: team1?.result?.gameWins ?? 0,
    team2Code: team2?.code || 'TBD',
    team2Name: team2?.name || 'TBD',
    team2Image: team2?.image || null,
    team2Score: team2?.result?.gameWins ?? 0,
    state: event.state,
    startTime: new Date(event.startTime),
    bestOf: event.match.strategy?.count || 1,
    leagueType: Object.values(LEAGUES).find(l => l.id === event.league?.id)?.type || 'unknown'
  };
}
