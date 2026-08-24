import test from "node:test";
import assert from "node:assert/strict";
import { createMatchService } from "../../services/predictions/matchService.js";

function apiResult(data, source = "provider") {
  return { data, results: Array.isArray(data) ? data.length : 1, paging: { current: 1, total: 1 }, meta: { source, stale: false } };
}

function fixture({ id, homeId = 541, awayId = 536, date = new Date(Date.now() + 60 * 60 * 1000).toISOString(), status = "NS", homeGoals = null, awayGoals = null, statistics = [] } = {}) {
  return {
    fixture: { id, date, timestamp: Math.floor(Date.parse(date) / 1000), timezone: "UTC", status: { short: status, long: status }, venue: { id: 1, name: "Estadio", city: "Madrid" } },
    league: { id: 140, name: "La Liga", country: "Spain", season: 2026, round: "Regular Season" },
    teams: {
      home: { id: homeId, name: homeId === 541 ? "Real Madrid" : "Sevilla", logo: null },
      away: { id: awayId, name: awayId === 536 ? "Sevilla" : "Real Madrid", logo: null },
    },
    goals: { home: homeGoals, away: awayGoals },
    score: { fulltime: { home: homeGoals, away: awayGoals } },
    statistics,
  };
}

function parsed() {
  return {
    homeTeam: "Real Madrid",
    awayTeam: "Sevilla",
    market: { code: "over_1_5" },
    dateRange: { from: "2026-08-23", to: "2026-09-06", timeZone: "America/Mexico_City" },
  };
}

test("resuelve equipos exactos y no asume el primer resultado", async () => {
  const sportsApi = {
    searchTeams: async (name) => apiResult(name === "Real Madrid"
      ? [{ team: { id: 999, name: "Real Madrid U19" } }, { team: { id: 541, name: "Real Madrid", country: "Spain" } }]
      : [{ team: { id: 536, name: "Sevilla", country: "Spain" } }]),
    getResource: async () => apiResult([fixture({ id: 100 })]),
  };
  const result = await createMatchService({ sportsApi }).resolveFixture(parsed());
  assert.equal(result.kind, "resolved");
  assert.equal(result.teams.home.id, 541);
  assert.equal(result.fixture.fixture.id, 100);
});

test("solicita aclaración para equipos ambiguos o fixture con orden inverso", async () => {
  const ambiguousApi = {
    searchTeams: async (name) => apiResult(name === "Real Madrid"
      ? [{ team: { id: 1, name: "Real Madrid U19" } }, { team: { id: 2, name: "Real Madrid W" } }]
      : [{ team: { id: 536, name: "Sevilla" } }]),
    getResource: async () => { throw new Error("no debe buscar fixtures"); },
  };
  const ambiguous = await createMatchService({ sportsApi: ambiguousApi }).resolveFixture(parsed());
  assert.equal(ambiguous.kind, "clarification");
  assert.equal(ambiguous.reason, "home_team_ambiguous");

  const reversedApi = {
    searchTeams: async (name) => apiResult([{ team: { id: name === "Real Madrid" ? 541 : 536, name } }]),
    getResource: async () => apiResult([fixture({ id: 101, homeId: 536, awayId: 541 })]),
  };
  const reversed = await createMatchService({ sportsApi: reversedApi }).resolveFixture(parsed());
  assert.equal(reversed.kind, "clarification");
  assert.equal(reversed.reason, "fixture_order_reversed");
});

test("valida la competición solicitada y no toma el primer evento coincidente", async () => {
  const wrongLeague = fixture({ id: 150 });
  wrongLeague.league = { ...wrongLeague.league, id: 999, name: "Friendly" };
  const correctLeague = fixture({ id: 151 });
  const sportsApi = {
    searchTeams: async (name) => apiResult([{ team: { id: name === "Real Madrid" ? 541 : 536, name } }]),
    getResource: async () => apiResult([wrongLeague, correctLeague]),
  };
  const result = await createMatchService({ sportsApi }).resolveFixture({ ...parsed(), competition: "La Liga" });
  assert.equal(result.kind, "resolved");
  assert.equal(result.fixture.fixture.id, 151);
});

test("recopila y normaliza todas las secciones disponibles", async () => {
  const target = fixture({ id: 200 });
  const recentHome = fixture({ id: 201, status: "FT", homeGoals: 2, awayGoals: 0 });
  const recentAway = fixture({ id: 202, homeId: 999, awayId: 536, status: "FT", homeGoals: 1, awayGoals: 1 });
  const calls = [];
  const sportsApi = {
    getResource: async (resource, params) => {
      calls.push([resource, params]);
      if (resource === "leagues") return apiResult([{ league: { id: 140 }, seasons: [{ year: 2026, coverage: { injuries: true, odds: true, fixtures: { lineups: true } } }] }]);
      if (resource === "fixtures" && params.last && params.team === 541) return apiResult([recentHome]);
      if (resource === "fixtures" && params.last && params.team === 536) return apiResult([recentAway]);
      if (resource === "fixtures" && params.ids) return apiResult([{ ...recentHome, statistics: [
        { team: recentHome.teams.home, statistics: [{ type: "Shots on Goal", value: 7 }, { type: "Corner Kicks", value: 5 }, { type: "expected_goals", value: "1.82" }] },
      ] }]);
      if (resource === "teams/statistics") return apiResult({ team: { id: params.team, name: params.team === 541 ? "Real Madrid" : "Sevilla" }, league: { id: 140, season: 2026 }, form: "WWDLW", goals: { for: { average: { total: "2.0" } } } });
      if (resource === "fixtures/headtohead") return apiResult([recentHome]);
      if (resource === "injuries") return apiResult([{ player: { id: 10, name: "Jugador", type: "Injury", reason: "Knee" }, team: target.teams.home, fixture: { id: 200 } }]);
      if (resource === "fixtures/lineups") return apiResult([{ team: target.teams.home, formation: "4-3-3", startXI: [{ player: { id: 1, name: "Titular", pos: "G" } }], substitutes: [{ player: { id: 2, name: "Suplente", pos: "D" } }] }]);
      if (resource === "odds") return apiResult([{ fixture: { id: 200 }, update: "2026-08-23", bookmakers: [{ id: 1, name: "Book", bets: [{ id: 5, name: "Goals Over/Under", values: [{ value: "Over 1.5", odd: "1.40" }] }] }] }]);
      throw new Error(`Recurso inesperado: ${resource}`);
    },
  };
  const service = createMatchService({ sportsApi });
  const snapshot = await service.collectFixtureData({
    kind: "resolved",
    fixture: target,
    teams: { home: { id: 541, name: "Real Madrid" }, away: { id: 536, name: "Sevilla" } },
    market: { code: "over_1_5" },
    sources: {},
  });

  assert.equal(snapshot.event.fixtureId, 200);
  assert.equal(snapshot.recentForm.home.sampleSize, 1);
  assert.equal(snapshot.recentForm.away.matches[0].result.venue, "away");
  assert.equal(snapshot.seasonStatistics.home.form, "WWDLW");
  assert.equal(snapshot.matchStatistics[0].teams[0].values.shotsOnTarget, 7);
  assert.equal(snapshot.matchStatistics[0].teams[0].values.xg, 1.82);
  assert.equal(snapshot.h2h.length, 1);
  assert.equal(snapshot.injuries[0].reason, "Knee");
  assert.equal(snapshot.lineups[0].startingEleven[0].name, "Titular");
  assert.equal(snapshot.odds[0].markets[0].values[0].odds, 1.4);
  assert.ok(calls.some(([resource]) => resource === "fixtures/headtohead"));
});

test("registra datos faltantes y evita endpoints sin cobertura", async () => {
  const target = fixture({ id: 300 });
  const called = [];
  const sportsApi = {
    getResource: async (resource, params) => {
      called.push(resource);
      if (resource === "leagues") return apiResult([{ league: { id: 140 }, seasons: [{ year: 2026, coverage: { injuries: false, odds: false, fixtures: { lineups: false } } }] }]);
      if (resource === "fixtures" && params.last) return apiResult([]);
      if (resource === "teams/statistics") return apiResult({});
      if (resource === "fixtures/headtohead") return apiResult([]);
      throw new Error(`No debía consultar ${resource}`);
    },
  };
  const snapshot = await createMatchService({ sportsApi }).collectFixtureData({
    kind: "resolved",
    fixture: target,
    teams: { home: { id: 541 }, away: { id: 536 } },
    market: { code: "over_1_5" },
    sources: {},
  });
  assert.ok(snapshot.missingData.some((item) => item.section === "injuries" && item.reason === "coverage_disabled"));
  assert.ok(snapshot.missingData.some((item) => item.section === "lineups" && item.reason === "coverage_disabled"));
  assert.ok(snapshot.missingData.some((item) => item.section === "odds" && item.reason === "coverage_disabled"));
  assert.ok(!called.includes("injuries"));
  assert.ok(!called.includes("fixtures/lineups"));
  assert.ok(!called.includes("odds"));
});
