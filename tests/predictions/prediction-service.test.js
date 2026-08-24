import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateEdge,
  calculateFairOdds,
  createPredictionService,
  findBestMarketOdds,
} from "../../services/predictions/predictionService.js";
import { createFullSnapshot, createPartialSnapshot } from "./fixtures/football-snapshots.js";

const fixedNow = () => new Date("2024-05-20T12:00:00.000Z");

test("calcula fair odds y edge teórico", () => {
  assert.equal(calculateFairOdds(0.75), 4 / 3);
  assert.equal(calculateFairOdds(0), null);
  assert.equal(calculateEdge(0.75, 1.5), 0.125);
  assert.equal(calculateEdge(0.75, 0), null);
});

test("selecciona la mejor cuota decimal válida", () => {
  const snapshot = createFullSnapshot();
  snapshot.odds.push({
    updatedAt: "2024-05-20T12:00:00.000Z",
    bookmaker: { name: "Inválida" },
    markets: [{ name: "Goals Over/Under", values: [{ label: "Over 1.5", odds: 0 }, { label: "Over 1.5", odds: "texto" }] }],
  });
  assert.deepEqual(findBestMarketOdds(snapshot, "over_1_5"), {
    marketOdds: 1.5,
    bookmaker: "Book B",
    oddsTimestamp: "2024-05-20T11:00:00.000Z",
  });
});

test("no mezcla cuotas de totales del equipo local y visitante", () => {
  const snapshot = createFullSnapshot();
  snapshot.odds = [{
    bookmaker: { name: "Book" },
    markets: [
      { name: "Home Team Total Goals", values: [{ label: "Over 1.5", odds: 1.8 }] },
      { name: "Away Team Total Goals", values: [{ label: "Over 1.5", odds: 2.4 }] },
    ],
  }];
  assert.equal(findBestMarketOdds(snapshot, "home_over_1_5").marketOdds, 1.8);
  assert.equal(findBestMarketOdds(snapshot, "away_over_1_5").marketOdds, 2.4);
});

test("genera una selección uniforme para Over y no usa odds como predictor", async () => {
  const snapshot = createFullSnapshot();
  const service = createPredictionService({ historyService: {}, now: fixedNow });
  const first = await service.predict({ snapshot, market: { code: "over_1_5" } });
  const changedOdds = structuredClone(snapshot);
  changedOdds.odds[0].markets[0].values[0].odds = 20;
  const second = await service.predict({ snapshot: changedOdds, market: { code: "over_1_5" } });

  assert.equal(first.status, "completed");
  assert.equal(first.selections.length, 1);
  assert.equal(first.selections[0].key, "over_1_5");
  assert.equal(first.selections[0].marketOdds, 1.5);
  assert.equal(first.selections[0].bookmaker, "Book B");
  assert.equal(first.selections[0].edge, first.selections[0].probability * 1.5 - 1);
  assert.equal(first.selections[0].probability, second.selections[0].probability);
  assert.notEqual(first.selections[0].marketOdds, second.selections[0].marketOdds);
});

test("genera tres selecciones 1X2 que suman uno", async () => {
  const result = await createPredictionService({ historyService: {}, now: fixedNow }).predict({ snapshot: createFullSnapshot(), market: { code: "one_x_two" } });
  assert.deepEqual(result.selections.map((selection) => selection.key), ["home", "draw", "away"]);
  const total = result.selections.reduce((sum, selection) => sum + selection.probability, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.equal(result.selections[2].bookmaker, "Book B");
});

test("router selecciona V2 para goles y V1 para 1X2 conservando overrides", async () => {
  const service = createPredictionService({ historyService: {}, now: fixedNow });
  const automaticOver = await service.predict({ snapshot: createFullSnapshot(), market: { code: "over_1_5" } });
  const automaticOneXTwo = await service.predict({ snapshot: createFullSnapshot(), market: { code: "one_x_two" } });
  const v1 = await service.predict({ snapshot: createFullSnapshot(), market: { code: "over_1_5" }, modelVersion: "football-poisson-v1" });
  const v2 = await service.predict({ snapshot: createFullSnapshot(), market: { code: "over_1_5" }, modelVersion: "football-poisson-v2" });
  assert.equal(automaticOver.modelVersion, "football-poisson-v2");
  assert.equal(automaticOver.model.selectedBy, "market-router");
  assert.equal(automaticOver.model.marketStatus, "SUPPORTED");
  assert.equal(automaticOver.model.routerVersion, "football-market-router-v2");
  assert.equal(automaticOver.model.configFingerprint.length, 64);
  assert.ok(["high", "medium", "low"].includes(automaticOver.confidence.level));
  assert.equal(automaticOneXTwo.modelVersion, "football-poisson-v1");
  assert.equal(automaticOneXTwo.model.configFingerprint, null);
  assert.equal(v1.modelVersion, "football-poisson-v1");
  assert.equal(v2.modelVersion, "football-poisson-v2");
  assert.equal(v1.model.selectedBy, "manual-override");
  assert.equal(v2.model.selectedBy, "manual-override");
  assert.equal(v1.status, "completed");
  assert.equal(v2.status, "completed");
  assert.notEqual(v1.selections[0].probability, v2.selections[0].probability);
});

test("rechaza un override de modelo inexistente", async () => {
  await assert.rejects(
    createPredictionService({ historyService: {}, now: fixedNow }).predict({ snapshot: createFullSnapshot(), market: { code: "over_1_5" }, modelVersion: "football-poisson-v99" }),
    /Modelo no registrado/,
  );
});

test("expone edge únicamente como cálculo teórico no validado", async () => {
  const result = await createPredictionService({ historyService: {}, now: fixedNow }).predict({ snapshot: createFullSnapshot(), market: { code: "over_1_5" } });
  assert.equal(result.edgePolicy.status, "UNVALIDATED");
  assert.equal(result.selections[0].edgeStatus, "UNVALIDATED");
  assert.equal(result.selections[0].theoreticalEdge, result.selections[0].edge);
  assert.doesNotMatch(JSON.stringify(result), /VALUE BET|RECOMMENDED BET|GOOD BET/i);
});

test("maneja snapshots parciales y ausencia de odds", async () => {
  const result = await createPredictionService({ historyService: {}, now: fixedNow }).predict({ snapshot: createPartialSnapshot(), market: { code: "btts" } });
  assert.equal(result.status, "completed");
  assert.equal(result.confidence.level, "low");
  assert.equal(result.selections[0].marketOdds, null);
  assert.equal(result.selections[0].edge, null);
  assert.ok(result.missingData.some((item) => item.section === "xg"));
});

test("devuelve INSUFFICIENT_DATA sin probabilidad falsa", async () => {
  const snapshot = createPartialSnapshot();
  snapshot.recentForm.home.matches = snapshot.recentForm.home.matches.slice(0, 2);
  const result = await createPredictionService({ historyService: {}, now: fixedNow }).predict({ snapshot, market: { code: "under_2_5" } });
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.code, "INSUFFICIENT_DATA");
  assert.deepEqual(result.selections, []);
  assert.equal(result.expectedGoals, null);
});

test("lesiones y lineups no alteran las probabilidades", async () => {
  const snapshot = createFullSnapshot();
  const withoutContext = structuredClone(snapshot);
  withoutContext.injuries = [];
  withoutContext.lineups = [{ team: snapshot.homeTeam, startingEleven: [] }];
  const service = createPredictionService({ historyService: {}, now: fixedNow });
  const withContext = await service.predict({ snapshot, market: { code: "over_2_5" } });
  const without = await service.predict({ snapshot: withoutContext, market: { code: "over_2_5" } });
  assert.equal(withContext.selections[0].probability, without.selections[0].probability);
  assert.ok(withContext.warnings.some((warning) => warning.type === "PLAYER_UNAVAILABLE"));
  assert.ok(!withContext.warnings.some((warning) => /clave/i.test(warning.message)));
});

test("webContext no altera probability, fair odds ni expected goals", async () => {
  const snapshot = createFullSnapshot();
  const enriched = structuredClone(snapshot);
  enriched.enrichment = { web: { version: "football-web-enrichment-v1", evidence: [{ type: "injury", claim: "Contexto" }], injuries: [{ claim: "Contexto" }], warnings: [], conflicts: [], sources: [] } };
  const service = createPredictionService({ historyService: {}, now: fixedNow });
  const base = await service.predict({ snapshot, market: { code: "over_1_5" }, modelVersion: "football-poisson-v2" });
  const withWeb = await service.predict({ snapshot: enriched, market: { code: "over_1_5" }, modelVersion: "football-poisson-v2" });
  assert.equal(withWeb.expectedGoals.home, base.expectedGoals.home);
  assert.equal(withWeb.expectedGoals.away, base.expectedGoals.away);
  assert.equal(withWeb.selections[0].probability, base.selections[0].probability);
  assert.equal(withWeb.selections[0].fairOdds, base.selections[0].fairOdds);
  assert.equal(withWeb.context.web.version, "football-web-enrichment-v1");
});

test("genera factores, contexto y conclusión sin lenguaje de garantía", async () => {
  const result = await createPredictionService({ historyService: {}, now: fixedNow }).predict({ snapshot: createFullSnapshot(), market: { code: "over_1_5" } });
  assert.ok(result.positiveFactors.length + result.negativeFactors.length > 0);
  assert.equal(result.context.statistics.usedByModel, false);
  assert.ok(result.conclusion.length > 20);
  assert.doesNotMatch(result.conclusion, /apuesta segura|garantizado|va a salir|imposible perder/i);
});

test("persiste el resultado cuando recibe analysisId", async () => {
  let persisted;
  const historyService = { updateAnalysisPrediction: async (input) => { persisted = input; } };
  const result = await createPredictionService({ historyService, now: fixedNow }).predict({
    snapshot: createFullSnapshot(),
    market: { code: "over_1_5" },
    analysisId: "analysis-1",
  });
  assert.equal(persisted.analysisId, "analysis-1");
  assert.equal(persisted.result, result);
  assert.equal(persisted.result.model.routerVersion, "football-market-router-v2");
});

test("deriva BTTS No, doble oportunidad, DNB y totales de equipo de forma consistente", async () => {
  const service = createPredictionService({ historyService: {}, now: fixedNow });
  const snapshot = createFullSnapshot();
  const [yes, no, oneXTwo, chance, dnb, teamTotal] = await Promise.all([
    service.predict({ snapshot, market: { code: "btts" } }),
    service.predict({ snapshot, market: { code: "btts_no" } }),
    service.predict({ snapshot, market: { code: "one_x_two" } }),
    service.predict({ snapshot, market: { code: "double_chance_1x" } }),
    service.predict({ snapshot, market: { code: "draw_no_bet_home" } }),
    service.predict({ snapshot, market: { code: "home_over_1_5" } }),
  ]);
  assert.ok(Math.abs(yes.selections[0].probability + no.selections[0].probability - 1) < 1e-12);
  assert.ok(Math.abs(chance.selections[0].probability - (oneXTwo.selections[0].probability + oneXTwo.selections[1].probability)) < 1e-12);
  assert.ok(dnb.selections[0].probability > 0 && dnb.selections[0].probability < 1);
  assert.equal(dnb.selections[0].pushProbability, oneXTwo.selections[1].probability);
  assert.ok(teamTotal.selections[0].probability > 0 && teamTotal.selections[0].probability < 1);
});

test("usa modelos independientes y datos estructurados para tarjetas y corners", async () => {
  const service = createPredictionService({ historyService: {}, now: fixedNow });
  const snapshot = createFullSnapshot();
  const cards = await service.predict({ snapshot, market: { code: "cards_over_4_5" } });
  const corners = await service.predict({ snapshot, market: { code: "corners_under_9_5" } });
  assert.equal(cards.modelVersion, "football-cards-poisson-v1");
  assert.equal(corners.modelVersion, "football-corners-poisson-v1");
  assert.equal(cards.model.marketStatus, "WEAK");
  assert.equal(corners.model.marketStatus, "WEAK");
  assert.equal(cards.expectedCounts.statistic, "cards");
  assert.equal(corners.expectedCounts.statistic, "corners");
  assert.ok(cards.expectedCounts.total > 0);
  assert.ok(corners.expectedCounts.total > 0);
  assert.equal(cards.context.statistics.usedByModel, true);
  assert.equal(corners.context.statistics.usedByModel, true);
});
