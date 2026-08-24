import { canonicalMatchKey, normalizeSeason, resolveTeamName } from "../../../../lib/predictions/historical/teamNormalizer.js";

export const STATSBOMB_SOURCE = "statsbomb-open-data";

export function summarizeStatsBombEvents(events, homeTeamId, awayTeamId) {
  const summary = {
    home: { shots: 0, xg: 0 },
    away: { shots: 0, xg: 0 },
  };
  for (const event of events || []) {
    if (event.type?.name !== "Shot") continue;
    const side = event.team?.id === homeTeamId ? "home" : event.team?.id === awayTeamId ? "away" : null;
    if (!side) continue;
    summary[side].shots += 1;
    if (Number.isFinite(event.shot?.statsbomb_xg) && event.shot.statsbomb_xg >= 0) summary[side].xg += event.shot.statsbomb_xg;
  }
  return summary;
}

export function normalizeStatsBombMatches(rows, { competition = null, season = null, country = null, aliases = [], eventsByMatch = {}, lineupsByMatch = {} } = {}) {
  const matches = [];
  const rejected = [];
  const details = [];
  for (const [index, row] of (rows || []).entries()) {
    const competitionName = competition || row.competition?.competition_name;
    const seasonName = season || row.season?.season_name;
    const home = resolveTeamName(row.home_team?.home_team_name, { competition: competitionName, country }, aliases);
    const away = resolveTeamName(row.away_team?.away_team_name, { competition: competitionName, country }, aliases);
    const matchDate = /^\d{4}-\d{2}-\d{2}$/.test(row.match_date || "") ? `${row.match_date}T${row.kick_off || "12:00:00.000"}Z` : null;
    if (!competitionName || !seasonName || !matchDate || home.kind !== "resolved" || away.kind !== "resolved" || !Number.isInteger(row.home_score) || !Number.isInteger(row.away_score)) {
      rejected.push({ rowNumber: index + 1, problems: ["required_match_fields"] });
      continue;
    }
    const events = eventsByMatch[row.match_id] || [];
    const stats = summarizeStatsBombEvents(events, row.home_team.home_team_id, row.away_team.away_team_id);
    const normalized = {
      source: STATSBOMB_SOURCE,
      sourceMatchId: String(row.match_id),
      competition: competitionName,
      country,
      season: normalizeSeason(seasonName),
      matchDate: new Date(matchDate).toISOString(),
      homeTeam: home.canonicalName,
      awayTeam: away.canonicalName,
      homeTeamNormalized: home.normalized,
      awayTeamNormalized: away.normalized,
      homeGoals: row.home_score,
      awayGoals: row.away_score,
      homeShots: events.length ? stats.home.shots : null,
      awayShots: events.length ? stats.away.shots : null,
      homeShotsOnTarget: null,
      awayShotsOnTarget: null,
      homeCorners: null,
      awayCorners: null,
      homeCards: null,
      awayCards: null,
      homeXg: events.length ? stats.home.xg : null,
      awayXg: events.length ? stats.away.xg : null,
      oddsHome: null,
      oddsDraw: null,
      oddsAway: null,
      providerData: { homeTeamId: row.home_team.home_team_id, awayTeamId: row.away_team.away_team_id, lineupsPrepared: true },
      rawPayload: row,
    };
    normalized.matchKey = canonicalMatchKey(normalized);
    matches.push(normalized);
    details.push({
      matchKey: normalized.matchKey,
      source: STATSBOMB_SOURCE,
      events,
      lineups: lineupsByMatch[row.match_id] || [],
    });
  }
  return { source: STATSBOMB_SOURCE, matches, details, rejected, totalRows: (rows || []).length };
}
