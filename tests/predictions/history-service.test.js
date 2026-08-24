import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryService } from "../../services/predictions/historyService.js";
import { createAnalysisDataService } from "../../services/predictions/analysisDataService.js";

test("persiste un snapshot sin generar predicción", async () => {
  let captured;
  const history = createHistoryService({
    getSql: async () => ({
      query: async (query, params) => {
        captured = { query, params };
        return [{ id: params[0], fixture_id: params[4], market: params[5] }];
      },
    }),
  });
  const web = {
    version: "football-web-enrichment-v1",
    generatedAt: "2026-08-23T12:00:00Z",
    researchProvider: "mock",
    usage: { searchesPlanned: 2, searchesExecuted: 1, resultsProcessed: 3, cacheHits: 0, providerCalls: 1 },
    evidence: [{ id: "e1" }],
    sources: [{ url: "https://example.com" }],
    conflicts: [],
  };
  const snapshot = { event: { fixtureId: 123, homeTeam: { id: 1 }, awayTeam: { id: 2 } }, missingData: [], enrichment: { web } };
  const saved = await history.saveAnalysisSnapshot({ userId: "user-1", market: { code: "btts" }, snapshot });
  assert.equal(saved.fixture_id, 123);
  assert.equal(saved.market, "btts");
  assert.match(captured.query, /prediction, web_context/);
  assert.equal(captured.params[7], JSON.stringify(snapshot));
  assert.deepEqual(JSON.parse(captured.params[8]), web);
  assert.equal(JSON.parse(captured.params[8]).usage.providerCalls, 1);
  assert.deepEqual(JSON.parse(captured.params[9]), web.evidence);
  assert.deepEqual(JSON.parse(captured.params[10]), web.sources);
  assert.equal(captured.params[12], "mock");
  assert.equal(captured.params[13], "football-web-enrichment-v1");
  assert.doesNotMatch(captured.query, /model_version\s*\)/);
});

test("orquesta resolución, normalización y persistencia", async () => {
  const calls = [];
  const matchService = {
    resolveFixture: async () => ({ kind: "resolved", market: { code: "over_1_5" }, fixture: {} }),
    collectFixtureData: async () => ({ event: { fixtureId: 44 }, missingData: [] }),
  };
  const historyService = {
    saveAnalysisSnapshot: async (input) => { calls.push(input); return { id: "analysis-1" }; },
  };
  const result = await createAnalysisDataService({ matchService, historyService }).prepareSnapshot({ parsed: {}, userId: "user-1" });
  assert.equal(result.kind, "snapshot");
  assert.equal(result.analysisId, "analysis-1");
  assert.equal(calls[0].snapshot.event.fixtureId, 44);
});

test("no persiste cuando la resolución requiere aclaración", async () => {
  let persisted = false;
  const result = await createAnalysisDataService({
    matchService: {
      resolveFixture: async () => ({ kind: "clarification", reason: "fixture_ambiguous", options: [] }),
      collectFixtureData: async () => { throw new Error("no debe ejecutarse"); },
    },
    historyService: { saveAnalysisSnapshot: async () => { persisted = true; } },
  }).prepareSnapshot({ parsed: {}, userId: "user-1" });
  assert.equal(result.kind, "clarification");
  assert.equal(persisted, false);
});

test("actualiza columnas auditables sin sobrescribir data_used", async () => {
  let captured;
  const history = createHistoryService({
    getSql: async () => ({
      query: async (query, params) => {
        captured = { query, params };
        return [{ id: params[0], model_version: params[1], predicted_at: new Date() }];
      },
    }),
  });
  const result = {
    modelVersion: "football-poisson-v1",
    model: { selectedBy: "market-router", marketStatus: "SUPPORTED", routerVersion: "football-market-router-v1", routerConfigFingerprint: "b".repeat(64), configFingerprint: "a".repeat(64) },
    selections: [{ key: "over_1_5", probability: 0.7, fairOdds: 1 / 0.7, marketOdds: 1.5, bookmaker: "Book", oddsTimestamp: "2024-01-01", theoreticalEdge: 0.05, edgeStatus: "UNVALIDATED" }],
    edgePolicy: { status: "UNVALIDATED" },
    confidence: { level: "medium", score: 0.6, reasons: [] },
  };
  await history.updateAnalysisPrediction({ analysisId: "analysis-1", result });
  assert.match(captured.query, /predicted_at = NOW\(\)/);
  assert.doesNotMatch(captured.query, /data_used\s*=/);
  assert.equal(captured.params[1], "football-poisson-v1");
  assert.equal(captured.params[2], "market-router");
  assert.equal(captured.params[3], "SUPPORTED");
  assert.equal(captured.params[4], "football-market-router-v1");
  assert.equal(captured.params[5], "b".repeat(64));
  assert.equal(captured.params[6], "a".repeat(64));
  assert.equal(JSON.parse(captured.params[7]).over_1_5, 0.7);
  assert.equal(JSON.parse(captured.params[10]).over_1_5, 0.05);
  assert.equal(captured.params[11], "UNVALIDATED");
  assert.equal(captured.params[12], "medium");
  assert.match(captured.query, /theoretical_edge = \$11::jsonb/);
});
