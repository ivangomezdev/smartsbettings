import test from "node:test";
import assert from "node:assert/strict";
import { createPredictionChatService } from "../../services/predictions/predictionChatService.js";

const fixedExplanation = {
  summary: { conclusion: "Conclusión estadística.", headline: "Lectura", mainReason: "Forma", mainRisk: "Muestra" },
  positiveFactors: [], negativeFactors: [], recentFormCommentary: { home: "", away: "" }, homeAwayCommentary: "", statsCommentary: "", h2hCommentary: "", injuriesCommentary: "", lineupCommentary: "", newsCommentary: "", missingDataCommentary: "", finalAssessment: "",
};

function harness({ preparedKind = "snapshot", existing = null, rateError = null, webWarnings = [] } = {}) {
  const messages = [];
  let lastClarification = null;
  let completed = null;
  const event = { fixtureId: 10, date: "2026-08-30T18:00:00Z", league: { name: "Liga" }, homeTeam: { id: 1, name: "Alpha" }, awayTeam: { id: 2, name: "Beta" } };
  const snapshot = { event, homeTeam: event.homeTeam, awayTeam: event.awayTeam, recentForm: { home: { matches: [] }, away: { matches: [] } }, seasonStatistics: null, matchStatistics: [], h2h: [], injuries: [], lineups: [], missingData: [], enrichment: { web: { usage: { providerCalls: 1, cacheHits: 0 }, warnings: webWarnings, conflicts: [], sources: [] } } };
  const conversationService = {
    findAssistantByRequest: async () => existing,
    reserveUserMessage: async () => ({ duplicate: false }),
    addMessage: async (item) => { const saved = { id: `m${messages.length + 1}`, ...item, createdAt: new Date().toISOString() }; messages.push(saved); if (item.type === "clarification") lastClarification = saved; return saved; },
    lastClarification: async () => lastClarification,
    updateTitle: async () => ({}),
  };
  const analysisDataService = { prepareSnapshot: async ({ parsed }) => preparedKind === "snapshot"
    ? { kind: "snapshot", analysisId: "analysis-1", fixture: event, market: parsed.market, snapshot }
    : preparedKind === "not_found"
      ? { kind: "not_found", reason: "fixture_not_found", options: [] }
      : { kind: "clarification", reason: "fixture_ambiguous", options: [{ id: 10, label: "Alpha vs Beta" }] } };
  const predictionService = { predict: async ({ market }) => ({ status: "completed", modelVersion: market.code === "one_x_two" ? "football-poisson-v1" : "football-poisson-v2", model: { marketStatus: "SUPPORTED" }, market: market.code, selections: [{ key: "over_1_5", label: "Over 1.5", probability: 0.72, fairOdds: 1.39, marketOdds: 1.5, theoreticalEdge: 0.08 }], confidence: { level: "medium" }, expectedGoals: { home: 1.5, away: 1.1 }, edgePolicy: { status: "UNVALIDATED" }, positiveFactors: [], negativeFactors: [] }) };
  const historyService = { completeAnalysis: async (value) => { completed = value; } };
  const service = createPredictionChatService({ conversationService, requestLimitService: { reserve: async () => { if (rateError) throw rateError; } }, analysisDataService, predictionService, historyService, llmService: { explain: async () => ({ explanation: fixedExplanation, fingerprint: "f".repeat(64), llm: { model: "mock", promptVersion: "football-predictions-explainer-v1", fallbackUsed: false }, usage: { providerCalls: 1 } }) }, logger: () => {} });
  return { service, messages, getCompleted: () => completed };
}

test("pipeline POST interno conserva números, modelo y contexto Brave", async () => {
  const h = harness();
  const result = await h.service.process({ userId: "u1", conversationId: "c1", message: "Alpha vs Beta Over 1.5 August 30 2026", requestId: "req-1" });
  assert.equal(result.kind, "analysis");
  assert.equal(result.analysis.model.version, "football-poisson-v2");
  assert.equal(result.analysis.prediction.selections[0].probability, 0.72);
  assert.equal(result.analysis.prediction.selections[0].fairOdds, 1.39);
  assert.equal(result.analysis.costMetadata.web.providerCalls, 1);
  assert.equal(result.message.content, "Conclusión estadística.");
  assert.equal(h.getCompleted().fingerprint, "f".repeat(64));
});

test("1X2 conserva el router V1 y una falla Brave no impide responder", async () => {
  const h = harness({ webWarnings: [{ code: "WEB_RESEARCH_PARTIAL" }] });
  const result = await h.service.process({ userId: "u1", conversationId: "c1", message: "Alpha vs Beta 1X2 August 30 2026", requestId: "req-v1" });
  assert.equal(result.analysis.model.version, "football-poisson-v1");
  assert.ok(result.analysis.missingData.includes("WEB_RESEARCH_PARTIAL"));
  assert.equal(result.kind, "analysis");
});

test("una resolución ambigua devuelve opciones sin ejecutar predictor", async () => {
  const h = harness({ preparedKind: "clarification" });
  const result = await h.service.process({ userId: "u1", conversationId: "c1", message: "Alpha vs Beta Over 1.5 August 30 2026", requestId: "ambiguous" });
  assert.equal(result.kind, "clarification");
  assert.equal(result.clarification.reason, "fixture_ambiguous");
  assert.equal(result.clarification.options[0].type, "fixture");
});

test("solicita mercado faltante y reanuda desde una selección estructurada", async () => {
  const h = harness();
  const clarification = await h.service.process({ userId: "u1", conversationId: "c1", message: "Alpha vs Beta August 30 2026", requestId: "req-a" });
  assert.equal(clarification.kind, "clarification");
  assert.ok(clarification.clarification.options.some((item) => item.id === "over_1_5"));
  const result = await h.service.process({ userId: "u1", conversationId: "c1", message: "Over 1.5", selection: { type: "market", id: "over_1_5" }, requestId: "req-b" });
  assert.equal(result.kind, "analysis");
});

test("una consulta incompleta prioriza los equipos y un fixture inexistente no ofrece opciones vacías", async () => {
  const incomplete = harness();
  const missingTeams = await incomplete.service.process({ userId: "u1", conversationId: "c1", message: "Barcelona", requestId: "missing-teams" });
  assert.equal(missingTeams.clarification.reason, "event_incomplete");
  assert.deepEqual(missingTeams.clarification.options, []);
  assert.equal(missingTeams.message.content, "Necesito los dos equipos y un mercado soportado.");

  const notFound = harness({ preparedKind: "not_found" });
  const result = await notFound.service.process({ userId: "u1", conversationId: "c1", message: "Málaga vs Deportivo La Coruña Over 2.5", requestId: "not-found" });
  assert.equal(result.clarification.reason, "fixture_not_found");
  assert.deepEqual(result.clarification.options, []);
  assert.match(result.message.content, /No encontré ese partido/);
  assert.doesNotMatch(result.message.content, /Cuál de estos partidos/);
});

test("persiste un error público y aplica rate limit antes de reservar mensaje", async () => {
  const rateError = Object.assign(new Error("Demasiadas solicitudes"), { code: "PREDICTIONS_RATE_LIMITED", status: 429 });
  const h = harness({ rateError });
  await assert.rejects(() => h.service.process({ userId: "u1", conversationId: "c1", message: "Alpha vs Beta Over 1.5", requestId: "rate" }), /Demasiadas/);
  assert.equal(h.messages.length, 0);
  const broken = harness();
  broken.service = createPredictionChatService({ conversationService: {
    findAssistantByRequest: async () => null, reserveUserMessage: async () => ({ duplicate: false }), addMessage: async (item) => { broken.messages.push(item); return { id: "error", ...item }; }, lastClarification: async () => null,
  }, requestLimitService: { reserve: async () => {} }, analysisDataService: { prepareSnapshot: async () => { throw new Error("secret internal detail"); } }, logger: () => {} });
  await assert.rejects(() => broken.service.process({ userId: "u", conversationId: "c", message: "Alpha vs Beta Over 1.5", requestId: "err" }));
  assert.equal(broken.messages.at(-1).type, "error");
  assert.doesNotMatch(broken.messages.at(-1).content, /secret internal detail/);
});

test("idempotencia devuelve el assistant persistido sin consumir cuota", async () => {
  const existing = { id: "m1", role: "assistant", type: "analysis", content: "Listo", createdAt: "2026-08-23", payload: { result: { kind: "analysis", conversationId: "c1", analysis: { id: "a1" } } } };
  let reserved = false;
  const service = createPredictionChatService({ conversationService: { findAssistantByRequest: async () => existing }, requestLimitService: { reserve: async () => { reserved = true; } }, analysisDataService: {} });
  const result = await service.process({ userId: "u", conversationId: "c1", message: "x", requestId: "same" });
  assert.equal(result.idempotent, true);
  assert.equal(reserved, false);
});

test("la búsqueda idempotente queda ligada al usuario propietario", async () => {
  let lookup;
  const service = createPredictionChatService({
    conversationService: {
      findAssistantByRequest: async (input) => {
        lookup = input;
        return { id: "m", role: "assistant", content: "ok", payload: { result: { kind: "analysis" } } };
      },
    },
    requestLimitService: { reserve: async () => {} },
    analysisDataService: {},
  });
  await service.process({ userId: "owner", conversationId: "c1", message: "x", requestId: "same" });
  assert.deepEqual(lookup, { userId: "owner", conversationId: "c1", requestId: "same" });
});
