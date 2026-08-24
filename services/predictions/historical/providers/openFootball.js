import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalMatchKey, normalizeSeason, resolveTeamName } from "../../../../lib/predictions/historical/teamNormalizer.js";

export const OPEN_FOOTBALL_SOURCE = "openfootball";

function matchId(match, fallback) {
  return String(match.id || match.match_id || createHash("sha256").update(fallback).digest("hex"));
}

export function normalizeOpenFootballJson(payload, { competition = null, season, country = null, aliases = [] } = {}) {
  const document = typeof payload === "string" ? JSON.parse(payload) : payload;
  const competitionName = String(competition || document?.name || "").trim();
  const matches = [];
  const rejected = [];
  for (const [index, row] of (document?.matches || []).entries()) {
    const home = resolveTeamName(row.team1 || row.home, { competition: competitionName, country }, aliases);
    const away = resolveTeamName(row.team2 || row.away, { competition: competitionName, country }, aliases);
    const score = row.score?.ft || row.score;
    const matchDate = /^\d{4}-\d{2}-\d{2}$/.test(row.date || "") ? `${row.date}T12:00:00.000Z` : null;
    const homeGoals = Array.isArray(score) && Number.isInteger(score[0]) && score[0] >= 0 ? score[0] : null;
    const awayGoals = Array.isArray(score) && Number.isInteger(score[1]) && score[1] >= 0 ? score[1] : null;
    const problems = [];
    if (!competitionName) problems.push("competition");
    if (!matchDate) problems.push("date");
    if (home.kind !== "resolved") problems.push(`home_team_${home.kind}`);
    if (away.kind !== "resolved") problems.push(`away_team_${away.kind}`);
    if (homeGoals === null || awayGoals === null) problems.push("full_time_score");
    if (problems.length) {
      rejected.push({ rowNumber: index + 1, problems });
      continue;
    }
    const normalized = {
      source: OPEN_FOOTBALL_SOURCE,
      competition: competitionName,
      country,
      season: normalizeSeason(season),
      matchDate,
      homeTeam: home.canonicalName,
      awayTeam: away.canonicalName,
      homeTeamNormalized: home.normalized,
      awayTeamNormalized: away.normalized,
      homeGoals,
      awayGoals,
      homeShots: null,
      awayShots: null,
      homeShotsOnTarget: null,
      awayShotsOnTarget: null,
      homeCorners: null,
      awayCorners: null,
      homeCards: null,
      awayCards: null,
      homeXg: null,
      awayXg: null,
      oddsHome: null,
      oddsDraw: null,
      oddsAway: null,
      providerData: { round: row.round || null },
      rawPayload: row,
    };
    normalized.sourceMatchId = matchId(row, [competitionName, season, matchDate, home.normalized, away.normalized].join("|"));
    normalized.matchKey = canonicalMatchKey(normalized);
    matches.push(normalized);
  }
  return { source: OPEN_FOOTBALL_SOURCE, matches, rejected, totalRows: (document?.matches || []).length };
}

export async function loadOpenFootball({ file = null, url = null, fetchImpl = fetch, ...options }) {
  if (!file && !url) throw new TypeError("OpenFootball requiere file o url.");
  let text;
  if (file) text = await readFile(file, "utf8");
  else {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`OpenFootball respondió HTTP ${response.status}.`);
    text = await response.text();
  }
  return { ...normalizeOpenFootballJson(text, options), origin: file || url };
}
