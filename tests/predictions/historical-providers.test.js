import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeFootballDataUkCsv } from "../../services/predictions/historical/providers/footballDataUk.js";
import { normalizeOpenFootballJson } from "../../services/predictions/historical/providers/openFootball.js";
import { normalizeStatsBombMatches, summarizeStatsBombEvents } from "../../services/predictions/historical/providers/statsBomb.js";
import { createHistoricalDataService } from "../../services/predictions/historical/historicalDataService.js";

const csvPath = fileURLToPath(new URL("./fixtures/football-data-small.csv", import.meta.url));

test("importa CSV de Football-Data.co.uk con columnas opcionales y rechaza filas corruptas", async () => {
  const result = normalizeFootballDataUkCsv(await readFile(csvPath, "utf8"), { league: "E0", season: "2023-2024" });
  assert.equal(result.totalRows, 3);
  assert.equal(result.matches.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.matches[0].homeTeam, "Team, United");
  assert.equal(result.matches[0].homeShots, 14);
  assert.equal(result.matches[1].homeShots, null);
  assert.equal(result.matches[0].providerData.marketOdds.over_2_5, 1.95);
});

test("normaliza OpenFootball sin exigir estadísticas avanzadas", () => {
  const result = normalizeOpenFootballJson({ name: "Premier League", matches: [{ date: "2024-01-01", team1: "Alpha", team2: "Bravo", score: { ft: [2, 0] } }] }, { season: "2023-2024" });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].homeShots, null);
  assert.equal(result.matches[0].homeGoals, 2);
});

test("prepara StatsBomb con xG explícito derivado únicamente de eventos Shot", () => {
  const events = [
    { type: { name: "Shot" }, team: { id: 1 }, shot: { statsbomb_xg: 0.25 } },
    { type: { name: "Pass" }, team: { id: 1 } },
    { type: { name: "Shot" }, team: { id: 2 }, shot: { statsbomb_xg: 0.1 } },
  ];
  assert.deepEqual(summarizeStatsBombEvents(events, 1, 2), { home: { shots: 1, xg: 0.25 }, away: { shots: 1, xg: 0.1 } });
  const result = normalizeStatsBombMatches([{
    match_id: 10,
    match_date: "2024-01-01",
    kick_off: "12:00:00.000",
    competition: { competition_name: "League" },
    season: { season_name: "2023/2024" },
    home_team: { home_team_id: 1, home_team_name: "Alpha" },
    away_team: { away_team_id: 2, away_team_name: "Bravo" },
    home_score: 1,
    away_score: 0,
  }], { eventsByMatch: { 10: events } });
  assert.equal(result.matches[0].homeXg, 0.25);
  assert.equal(result.details[0].events.length, 3);
});

test("deduplica por matchKey antes de persistir y la segunda ingesta es idempotente", async () => {
  const stored = new Set();
  const repository = {
    insertMatches: async (matches) => {
      let inserted = 0;
      for (const match of matches) if (!stored.has(match.matchKey)) { stored.add(match.matchKey); inserted += 1; }
      return { inserted, duplicates: matches.length - inserted };
    },
  };
  const normalized = normalizeOpenFootballJson({ name: "League", matches: [{ date: "2024-01-01", team1: "Alpha", team2: "Bravo", score: { ft: [1, 0] } }] }, { season: "2023" });
  normalized.matches.push({ ...normalized.matches[0] });
  const service = createHistoricalDataService({ repository });
  const first = await service.importNormalized(normalized);
  const second = await service.importNormalized(normalized);
  assert.equal(first.inserted, 1);
  assert.equal(first.duplicates, 1);
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 2);
});
