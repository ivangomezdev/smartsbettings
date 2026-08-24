import test from "node:test";
import assert from "node:assert/strict";
import { classifyV2Markets, decideV2Promotion } from "../../lib/predictions/historical/v2Benchmark.js";

function metric(brier, logLoss, calibrationError = 0.02) {
  return { n: 500, brier, logLoss, calibrationError };
}

function report(modelMetric, baselineMetric) {
  return {
    metrics: { over_0_5: modelMetric, one_x_two: modelMetric },
    byCompetition: {},
    baselines: { globalFrequency: { over_0_5: baselineMetric, one_x_two: baselineMetric }, recentForm: { over_0_5: baselineMetric, one_x_two: baselineMetric }, globalByCompetition: {}, recentByCompetition: {} },
  };
}

test("Over 0.5 queda WEAK si la mejora contra frecuencia global es inmaterial", () => {
  const fold = { name: "final-holdout", finalHoldout: true, v1: report(metric(0.060, 0.24), metric(0.061, 0.25)), v2: report(metric(0.0595, 0.235), metric(0.060, 0.24)) };
  const classification = classifyV2Markets([fold], ["over_0_5"]);
  assert.equal(classification.over_0_5.status, "WEAK_V2");
  assert.equal(classification.over_0_5.lowPredictiveValueWarning, true);
});

test("degradación importante de 1X2 impide promoción global", () => {
  const classification = {
    one_x_two: { status: "WEAK_V2", finalHoldout: { brierDeltaV1: 0.02, logLossDeltaV1: 0.03 } },
    btts: { status: "SUPPORTED_V2" },
    over_1_5: { status: "SUPPORTED_V2" },
    over_2_5: { status: "SUPPORTED_V2" },
    under_1_5: { status: "SUPPORTED_V2" },
  };
  assert.equal(decideV2Promotion(classification), "KEEP_V1");
});

