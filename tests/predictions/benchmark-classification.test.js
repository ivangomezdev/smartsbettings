import test from "node:test";
import assert from "node:assert/strict";
import { classifyV1Markets, V1_MARKET_STATUS } from "../../lib/predictions/historical/benchmark.js";

function metric(brier, logLoss) {
  return { n: 100, brier, logLoss, accuracy: 0.6 };
}

function metrics(over15, over25, btts, oneXTwo) {
  return { over_1_5: over15, over_2_5: over25, btts, one_x_two: oneXTwo };
}

function report(modelMetrics, globalMetrics, recentMetrics, seasons = {}) {
  return {
    metrics: modelMetrics,
    bySeason: seasons,
    baselines: {
      globalFrequency: globalMetrics,
      recentForm: recentMetrics,
      globalBySeason: Object.fromEntries(Object.keys(seasons).map((season) => [season, globalMetrics])),
      recentBySeason: Object.fromEntries(Object.keys(seasons).map((season) => [season, recentMetrics])),
    },
  };
}

test("clasifica mercados con una regla explícita de estabilidad contra ambos baselines", () => {
  const model = metrics(metric(0.1, 0.3), metric(0.15, 0.4), metric(0.3, 0.8), metric(0.4, 0.9));
  const globalBaseline = metrics(metric(0.2, 0.5), metric(0.2, 0.5), metric(0.2, 0.6), metric(0.5, 1.0));
  const recentBaseline = metrics(metric(0.18, 0.45), metric(0.18, 0.45), metric(0.22, 0.65), metric(0.48, 0.98));
  const winningLeague = report(model, globalBaseline, recentBaseline, { "2022-2023": model, "2023-2024": model });
  const mixedModel = metrics(metric(0.1, 0.3), metric(0.25, 0.6), metric(0.3, 0.8), metric(0.4, 0.9));
  const mixedLeague = report(mixedModel, globalBaseline, recentBaseline, { "2022-2023": mixedModel, "2023-2024": model });
  const classification = classifyV1Markets({
    globalReport: report(model, globalBaseline, recentBaseline),
    leagueReports: { E0: winningLeague, SP1: mixedLeague },
  });
  assert.equal(classification.over_1_5.status, V1_MARKET_STATUS.supported);
  assert.equal(classification.over_2_5.status, V1_MARKET_STATUS.weak);
  assert.equal(classification.btts.status, V1_MARKET_STATUS.notRecommended);
  assert.equal(classification.one_x_two.status, V1_MARKET_STATUS.supported);
  assert.ok(classification.over_1_5.evaluatedSegments >= 5);
});
