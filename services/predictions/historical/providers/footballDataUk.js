import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseCsv } from "../../../../lib/predictions/historical/csv.js";
import { canonicalMatchKey, normalizeSeason, resolveTeamName } from "../../../../lib/predictions/historical/teamNormalizer.js";

export const FOOTBALL_DATA_UK_SOURCE = "football-data-uk";
export const FOOTBALL_DATA_UK_BASE_URL = "https://www.football-data.co.uk/mmz4281";

function seasonCode(season) {
  const match = String(season || "").match(/^(\d{4})[-/](\d{2}|\d{4})$/);
  if (!match) throw new TypeError("La temporada debe usar el formato 2023-2024.");
  return `${match[1].slice(2)}${match[2].slice(-2)}`;
}

export function buildFootballDataUkUrl({ league, season, baseUrl = FOOTBALL_DATA_UK_BASE_URL }) {
  if (!/^[A-Za-z0-9]+$/.test(String(league || ""))) throw new TypeError("Código de competición inválido.");
  return `${baseUrl.replace(/\/$/, "")}/${seasonCode(season)}/${league}.csv`;
}

function parseDate(value, time = "") {
  const clean = String(value || "").trim();
  const parts = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  let isoDay;
  if (parts) {
    const year = parts[3].length === 2 ? Number(parts[3]) + (Number(parts[3]) >= 70 ? 1900 : 2000) : Number(parts[3]);
    isoDay = `${year}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    isoDay = clean;
  } else {
    return null;
  }
  const kickoff = /^\d{1,2}:\d{2}$/.test(String(time).trim()) ? String(time).trim().padStart(5, "0") : "12:00";
  const parsed = new Date(`${isoDay}T${kickoff}:00.000Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function integer(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function decimalOdds(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 1 && parsed <= 1000 ? parsed : null;
}

function firstOdds(row, columns) {
  for (const column of columns) {
    const value = decimalOdds(row[column]);
    if (value !== null) return value;
  }
  return null;
}

function cards(yellow, red) {
  const yellowCards = integer(yellow);
  const redCards = integer(red);
  if (yellowCards === null && redCards === null) return null;
  return (yellowCards || 0) + (redCards || 0);
}

function sourceId({ competition, season, matchDate, homeTeam, awayTeam }) {
  return createHash("sha256")
    .update([competition, season, matchDate, homeTeam, awayTeam].join("|"))
    .digest("hex");
}

function normalizeRow(row, { league, season, country = null, aliases = [] }) {
  const competition = String(row.Div || league || "").trim();
  const matchDate = parseDate(row.Date, row.Time);
  const homeGoals = integer(row.FTHG);
  const awayGoals = integer(row.FTAG);
  const home = resolveTeamName(row.HomeTeam, { competition, country }, aliases);
  const away = resolveTeamName(row.AwayTeam, { competition, country }, aliases);
  const problems = [];
  if (!competition) problems.push("competition");
  if (!matchDate) problems.push("date");
  if (home.kind !== "resolved") problems.push(`home_team_${home.kind}`);
  if (away.kind !== "resolved") problems.push(`away_team_${away.kind}`);
  if (homeGoals === null) problems.push("home_goals");
  if (awayGoals === null) problems.push("away_goals");
  if (problems.length) return { kind: "rejected", problems };

  const match = {
    source: FOOTBALL_DATA_UK_SOURCE,
    competition,
    country,
    season: normalizeSeason(season),
    matchDate,
    homeTeam: home.canonicalName,
    awayTeam: away.canonicalName,
    homeTeamNormalized: home.normalized,
    awayTeamNormalized: away.normalized,
    homeGoals,
    awayGoals,
    homeShots: integer(row.HS),
    awayShots: integer(row.AS),
    homeShotsOnTarget: integer(row.HST),
    awayShotsOnTarget: integer(row.AST),
    homeCorners: integer(row.HC),
    awayCorners: integer(row.AC),
    homeCards: cards(row.HY, row.HR),
    awayCards: cards(row.AY, row.AR),
    homeXg: null,
    awayXg: null,
    oddsHome: firstOdds(row, ["AvgH", "PSH", "B365H", "MaxH"]),
    oddsDraw: firstOdds(row, ["AvgD", "PSD", "B365D", "MaxD"]),
    oddsAway: firstOdds(row, ["AvgA", "PSA", "B365A", "MaxA"]),
    providerData: {
      result: row.FTR || null,
      halfTime: { home: integer(row.HTHG), away: integer(row.HTAG) },
      marketOdds: {
        over_2_5: firstOdds(row, ["Avg>2.5", "P>2.5", "B365>2.5", "Max>2.5"]),
        under_2_5: firstOdds(row, ["Avg<2.5", "P<2.5", "B365<2.5", "Max<2.5"]),
      },
    },
    rawPayload: row,
  };
  match.sourceMatchId = sourceId(match);
  match.matchKey = canonicalMatchKey(match);
  return { kind: "match", match };
}

export function normalizeFootballDataUkCsv(text, options = {}) {
  const parsed = parseCsv(text);
  const matches = [];
  const rejected = [];
  for (const row of parsed) {
    const normalized = normalizeRow(row.values, options);
    if (normalized.kind === "match") matches.push(normalized.match);
    else rejected.push({ rowNumber: row.rowNumber, problems: normalized.problems });
  }
  return { source: FOOTBALL_DATA_UK_SOURCE, matches, rejected, totalRows: parsed.length };
}

export async function loadFootballDataUk({ file = null, url = null, league, season, fetchImpl = fetch, aliases = [], country = null }) {
  let text;
  let origin;
  if (file) {
    text = await readFile(file, "utf8");
    origin = file;
  } else {
    origin = url || buildFootballDataUkUrl({ league, season });
    const response = await fetchImpl(origin, { headers: { accept: "text/csv" } });
    if (!response.ok) throw new Error(`Football-Data.co.uk respondió HTTP ${response.status}.`);
    text = await response.text();
  }
  return { ...normalizeFootballDataUkCsv(text, { league, season, aliases, country }), origin };
}
