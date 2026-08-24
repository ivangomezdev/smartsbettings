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

test("normaliza Dep. La Coruña al nombre canónico del proveedor", async () => {
  const searches = [];
  const sportsApi = {
    searchTeams: async (name) => {
      searches.push(name);
      return apiResult([{ team: { id: name === "Málaga" ? "home" : "away", name, provider: "thesportsdb" } }]);
    },
    getResource: async () => apiResult([{
      ...fixture({ id: "malaga-depor", homeId: "home", awayId: "away" }),
      teams: { home: { id: "home", name: "Málaga" }, away: { id: "away", name: "Deportivo de A Coruña" } },
    }]),
  };
  const result = await createMatchService({ sportsApi }).resolveFixture({
    ...parsed(),
    homeTeam: "Málaga",
    awayTeam: "dep la coruna",
  });
  assert.equal(result.kind, "resolved");
  assert.deepEqual(searches, ["Málaga", "Deportivo de A Coruña"]);
  assert.equal(result.teams.away.name, "Deportivo de A Coruña");
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

test("TheSportsDB completa datos críticos y últimos seis mediante fallback mapeado", async () => {
  const target = fixture({ id: "tsdb-event" });
  target.fixture.provider = "thesportsdb";
  target.fixture.providerIds = { apiFootball: { eventId: "9000" } };
  target.provider = "thesportsdb";
  target.teams.home = { id: "ts-home", name: "Real Madrid", provider: "thesportsdb" };
  target.teams.away = { id: "ts-away", name: "Sevilla", provider: "thesportsdb" };
  target.league = { id: "ts-league", name: "La Liga", season: "2026-2027" };

  const apiTarget = fixture({ id: 9000, homeId: 541, awayId: 536 });
  const recent = (teamId, opponentBase) => Array.from({ length: 6 }, (_, index) => fixture({
    id: opponentBase + index,
    homeId: teamId,
    awayId: opponentBase + 100 + index,
    date: `2026-08-${String(20 - index).padStart(2, "0")}T18:00:00.000Z`,
    status: "FT",
    homeGoals: 2,
    awayGoals: 1,
  }));
  const calls = [];
  const sportsApi = {
    fallbackProviderName: "api-football",
    getCapabilities: (provider) => provider === "thesportsdb"
      ? { seasonStatistics: false, injuries: false, eventLineups: false, odds: false }
      : { seasonStatistics: true, injuries: true, eventLineups: true, odds: true },
    getResource: async (resource, params, context = {}) => {
      calls.push({ resource, params, provider: context.provider });
      if (resource === "fixtures" && params.id === "9000" && context.provider === "api-football") return apiResult([apiTarget]);
      if (resource === "fixtures" && params.last && context.provider === "thesportsdb") {
        const teamId = params.team === "ts-home" ? "ts-home" : "ts-away";
        return apiResult([fixture({ id: `ts-${teamId}`, homeId: teamId, awayId: "opponent", status: "FT", homeGoals: 1, awayGoals: 0 })]);
      }
      if (resource === "fixtures" && params.last && context.provider === "api-football") return apiResult(recent(params.team, params.team === 541 ? 1000 : 2000));
      if (resource === "teams/statistics") return apiResult({ team: { id: params.team }, league: { id: 140, season: 2026 }, form: "WWDWL", goals: { for: { average: { total: "1.8" } } } });
      if (resource === "fixtures/headtohead" && context.provider === "thesportsdb") return apiResult([]);
      if (resource === "fixtures/headtohead" && context.provider === "api-football") return apiResult([recent(541, 3000)[0]]);
      if (resource === "fixtures/statistics") return apiResult([]);
      if (resource === "injuries") return apiResult([{ player: { id: 1, name: "Jugador", type: "Injury" }, team: apiTarget.teams.home, fixture: { id: 9000 } }]);
      if (resource === "fixtures/lineups") return apiResult([{ team: apiTarget.teams.home, startXI: [], substitutes: [] }]);
      if (resource === "odds") return apiResult([{ fixture: { id: 9000 }, bookmakers: [] }]);
      if (resource === "fixtures/timeline") return apiResult([]);
      throw new Error(`Recurso inesperado: ${resource}`);
    },
  };

  const snapshot = await createMatchService({ sportsApi }).collectFixtureData({
    kind: "resolved",
    provider: "thesportsdb",
    fixture: target,
    teams: {
      home: { id: "ts-home", name: "Real Madrid", provider: "thesportsdb" },
      away: { id: "ts-away", name: "Sevilla", provider: "thesportsdb" },
    },
    market: { code: "over_1_5" },
    sources: {},
  });

  assert.equal(snapshot.recentForm.home.sampleSize, 6);
  assert.equal(snapshot.recentForm.away.sampleSize, 6);
  assert.equal(snapshot.lastSix.home.length, 6);
  assert.equal(snapshot.lastSix.away.length, 6);
  assert.ok(snapshot.seasonStatistics.home);
  assert.equal(snapshot.h2h.length, 1);
  assert.equal(snapshot.injuries.length, 1);
  assert.equal(snapshot.lineups.length, 1);
  assert.ok(calls.some((call) => call.resource === "fixtures" && call.params.id === "9000" && call.provider === "api-football"));
  assert.ok(!snapshot.missingData.some((item) => ["homeSeasonStatistics", "awaySeasonStatistics", "h2h", "injuries", "lineups"].includes(item.section)));
});
