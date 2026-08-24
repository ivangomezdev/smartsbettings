import test from "node:test";
import assert from "node:assert/strict";
import {
  binaryAccuracy,
  binaryLogLoss,
  brierScore,
  calibrationBins,
  impliedProbability,
  multiclassAccuracy,
  multiclassBrierScore,
  multiclassLogLoss,
  normalizeOverround,
} from "../../lib/predictions/historical/metrics.js";

test("calcula Brier, Log Loss y accuracy binarios", () => {
  const rows = [{ probability: 0.8, actual: 1 }, { probability: 0.3, actual: 0 }];
  assert.ok(Math.abs(brierScore(rows) - 0.065) < 1e-12);
  assert.ok(Math.abs(binaryLogLoss(rows) - 0.2899092476) < 1e-9);
  assert.equal(binaryAccuracy(rows), 1);
});

test("Log Loss protege probabilidades exactas 0 y 1", () => {
  assert.ok(Number.isFinite(binaryLogLoss([{ probability: 0, actual: 1 }, { probability: 1, actual: 0 }])));
});

test("genera diez bins de calibración e incluye probabilidad 1 en el último", () => {
  const bins = calibrationBins([{ probability: 0, actual: 0 }, { probability: 0.75, actual: 1 }, { probability: 1, actual: 1 }]);
  assert.equal(bins.length, 10);
  assert.equal(bins[0].count, 1);
  assert.equal(bins[7].count, 1);
  assert.equal(bins[9].count, 1);
});

test("calcula métricas multiclase y valida suma de probabilidades", () => {
  const rows = [{ probabilities: [0.7, 0.2, 0.1], actualIndex: 0 }, { probabilities: [0.2, 0.3, 0.5], actualIndex: 2 }];
  assert.ok(Math.abs(multiclassBrierScore(rows) - 0.26) < 1e-12);
  assert.ok(Number.isFinite(multiclassLogLoss(rows)));
  assert.equal(multiclassAccuracy(rows), 1);
  assert.throws(() => multiclassBrierScore([{ probabilities: [0.5, 0.4, 0.2], actualIndex: 0 }]), /sumar 1/);
});

test("calcula probabilidad implícita y normaliza el overround 1X2", () => {
  assert.equal(impliedProbability(2), 0.5);
  assert.equal(impliedProbability(1), null);
  const normalized = normalizeOverround([2, 3.5, 4]);
  assert.ok(normalized.overround > 1);
  assert.ok(Math.abs(normalized.probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});
