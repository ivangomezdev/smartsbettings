import test from "node:test";
import assert from "node:assert/strict";
import { SportsApiPlanRestrictionError, toPublicPredictionError } from "../../lib/predictions/errors.js";
import { createCacheService } from "../../services/predictions/cacheService.js";
import { createSportsProviderRouter } from "../../services/predictions/providers/sportsProviderRouter.js";
import {
  createTheSportsDbProvider,
  normalizeTheSportsDbEvent,
} from "../../services/predictions/providers/theSportsDbProvider.js";
import { createSportsApi } from "../../services/predictions/sportsApi.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function memoryCache() {
  const rows = new Map();
  return createCacheService({
    store: {
      get: async (key) => rows.get(key) || null,
      acquireLease: async ({ cacheKey, token }) => {
        const row = rows.get(cacheKey);
        if (row?.lockToken) return false;
        rows.set(cacheKey, { ...(row || {}), lockToken: token });
        return true;
      },
      write: async ({ cacheKey, token, payload, ttlMs }) => {
        const current = rows.get(cacheKey);
        assert.equal(current.lockToken, token);
        const row = { payload, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttlMs), lockToken: null };
        rows.set(cacheKey, row);
        return row;
      },
      release: async (key) => rows.delete(key),
    },
  });
}

test("TheSportsDB V2 autentica por header, normaliza equipos e IDs anidados", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    if (String(url).includes("/search/team/")) return jsonResponse({ search: [{ idTeam: 133738, strTeam: "Real Madrid", idLeague: 4335, strLeague: "Spanish La Liga", strSport: "Soccer" }] });
    return jsonResponse({ lookup: [{ idTeam: "133738", idAPIfootball: "541", strTeam: "Real Madrid", idLeague: "4335", strLeague: "Spanish La Liga", strSport: "Soccer" }] });
  };
  const provider = createTheSportsDbProvider({ apiKey: "private-key", fetchImpl });
  const result = await provider.request("teams", { search: "Real Madrid" });
  assert.equal(result.data[0].team.name, "Real Madrid");
  assert.equal(result.data[0].team.providerIds.theSportsDb.teamId, "133738");
  assert.equal(result.data[0].team.providerIds.apiFootball.teamId, "541");
  assert.equal(result.meta.providerCalls, 2);
  assert.ok(calls.every((call) => call.headers["X-API-KEY"] === "private-key"));
  assert.ok(calls.every((call) => !call.url.includes("private-key")));
});

test("normaliza eventos sin mezclar IDs y conserva status desconocido", () => {
  const event = normalizeTheSportsDbEvent({
    idEvent: "900", idAPIfootball: "1000", idHomeTeam: "1", idAwayTeam: "2",
    strHomeTeam: "Local", strAwayTeam: "Visitante", idLeague: "7", strLeague: "Liga",
    strTimestamp: "2026-08-24T20:00:00", strStatus: null,
  });
  assert.equal(event.fixture.providerIds.theSportsDb.eventId, "900");
  assert.equal(event.fixture.providerIds.apiFootball.eventId, "1000");
  assert.equal(event.fixture.status.short, "UNKNOWN");
  assert.equal(event.teams.home.providerIds.theSportsDb.teamId, "1");
});

test("normaliza stats, lineups UNKNOWN y timeline sin inferir confirmación", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("event_stats")) return jsonResponse({ lookup: [{ idEvent: "9", strEvent: "A vs B", strStat: "expected_goals", intHome: "1.25", intAway: "0.80" }] });
    if (String(url).includes("event_lineup")) return jsonResponse({ lookup: [{ idEvent: "9", idTeam: "1", strTeam: "A", idPlayer: "11", strPlayer: "Jugador", strSubstitute: "No", strHome: "Yes" }] });
    return jsonResponse({ lookup: [{ idTimeline: "1", idEvent: "9", strTimeline: "Goal", strHome: "Yes", intTime: "22", idTeam: "1", strTeam: "A", strPlayer: "Jugador" }] });
  };
  const provider = createTheSportsDbProvider({ apiKey: "key", fetchImpl });
  const stats = await provider.request("fixtures/statistics", { fixture: 9, homeTeamId: 1, awayTeamId: 2 });
  const lineups = await provider.request("fixtures/lineups", { fixture: 9 });
  const timeline = await provider.request("fixtures/timeline", { fixture: 9 });
  assert.equal(stats.data[0].statistics[0].type, "expected_goals");
  assert.equal(lineups.data[0].lineupStatus, "UNKNOWN");
  assert.equal(lineups.data[0].startXI[0].player.name, "Jugador");
  assert.equal(timeline.data[0].minute, 22);
});

test("acepta cero resultados oficiales y rechaza envelopes inválidos", async () => {
  const empty = createTheSportsDbProvider({ apiKey: "key", fetchImpl: async () => jsonResponse({ Message: "No data found" }) });
  assert.deepEqual((await empty.request("teams", { search: "Unknown Team" })).data, []);

  const invalid = createTheSportsDbProvider({ apiKey: "key", fetchImpl: async () => jsonResponse({ lookup: "bad" }) });
  await assert.rejects(() => invalid.request("fixtures", { id: 1 }), (error) => error.code === "THESPORTSDB_INVALID_RESPONSE");
});

test("clasifica 401, 429 y timeout sin filtrar la key", async () => {
  for (const [status, code] of [[401, "THESPORTSDB_AUTH_ERROR"], [429, "THESPORTSDB_RATE_LIMIT"]]) {
    const provider = createTheSportsDbProvider({ apiKey: "secret-value", fetchImpl: async () => jsonResponse({}, status) });
    await assert.rejects(() => provider.request("fixtures", { id: 1 }), (error) => {
      assert.equal(error.code, code);
      assert.ok(!JSON.stringify(toPublicPredictionError(error)).includes("secret-value"));
      return true;
    });
  }
  const timeoutProvider = createTheSportsDbProvider({
    apiKey: "secret-value",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
  });
  await assert.rejects(() => timeoutProvider.request("fixtures", { id: 1 }), (error) => error.code === "THESPORTSDB_TIMEOUT");
});

test("caché separada evita la segunda llamada al provider", async () => {
  let calls = 0;
  const client = {
    name: "thesportsdb",
    capabilities: {},
    request: async () => {
      calls += 1;
      return { data: [{ team: { id: "1", name: "Team" } }], results: 1, paging: { current: 1, total: 1 }, meta: { providerCalls: 1 } };
    },
  };
  const api = createSportsApi({ client, cache: memoryCache() });
  const first = await api.searchTeams("Team");
  const second = await api.searchTeams("Team");
  assert.equal(first.meta.source, "provider");
  assert.equal(second.meta.source, "cache");
  assert.equal(first.meta.providerUsage.theSportsDb.providerCalls, 1);
  assert.equal(second.meta.providerUsage.theSportsDb.providerCalls, 0);
  assert.equal(second.meta.providerUsage.theSportsDb.cacheHits, 1);
  assert.equal(calls, 1);
});

test("router usa fallback controlado y respeta provider fijado", async () => {
  const primary = {
    name: "thesportsdb", capabilities: {},
    searchTeams: async () => ({ data: [], meta: { providerUsage: { theSportsDb: { providerCalls: 1, cacheHits: 0 } } } }),
    getResource: async () => ({ data: [], meta: { providerUsage: { theSportsDb: { providerCalls: 1, cacheHits: 0 } } } }),
  };
  let fallbackCalls = 0;
  const fallback = {
    name: "api-football", capabilities: {},
    searchTeams: async () => { fallbackCalls += 1; return { data: [{ team: { id: 2 } }], meta: { providerUsage: { apiFootball: { providerCalls: 1, cacheHits: 0 } } } }; },
    getResource: async () => { fallbackCalls += 1; return { data: [{ fixture: { id: 2 } }], meta: { providerUsage: { apiFootball: { providerCalls: 1, cacheHits: 0 } } } }; },
  };
  const router = createSportsProviderRouter({ primary, fallback });
  const routed = await router.searchTeams("Team");
  assert.equal(routed.meta.fallbackUsed, true);
  assert.equal(routed.meta.providerUsage.theSportsDb.providerCalls, 1);
  assert.equal(routed.meta.providerUsage.apiFootball.providerCalls, 1);
  const fixed = await router.getResource("fixtures", { team: 1 }, { provider: "thesportsdb" });
  assert.deepEqual(fixed.data, []);
  assert.equal(fallbackCalls, 1);
});

test("cachea una restricción de plan de API-Football y no la reintenta", async () => {
  let calls = 0;
  const api = createSportsApi({
    client: {
      name: "api-football",
      capabilities: {},
      request: async () => {
        calls += 1;
        throw new SportsApiPlanRestrictionError();
      },
    },
    cache: memoryCache(),
  });
  const first = await api.getResource("fixtures/headtohead", { h2h: "1-2" });
  const second = await api.getResource("fixtures/headtohead", { h2h: "1-2" });
  assert.equal(first.meta.providerError, "SPORTS_API_PLAN_RESTRICTION");
  assert.equal(first.meta.providerUsage.apiFootball.providerCalls, 1);
  assert.equal(second.meta.providerUsage.apiFootball.providerCalls, 0);
  assert.equal(second.meta.providerUsage.apiFootball.cacheHits, 1);
  assert.equal(calls, 1);
});
