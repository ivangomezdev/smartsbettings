import test from "node:test";
import assert from "node:assert/strict";
import { applyCalibrator, applyMarketCalibrators, fitPlattCalibrator } from "../../lib/predictions/calibration.js";
import { buildScoreMatrix, probabilitiesFromMatrix } from "../../lib/predictions/poisson.js";
import { runFootballPoissonV1 } from "../../lib/predictions/statisticalModel.js";
import { applyDixonColesCorrection, estimateExpectedGoalsV2, runFootballPoissonV2 } from "../../lib/predictions/statisticalModelV2.js";
import { createFullSnapshot } from "./fixtures/football-snapshots.js";

test("Dixon-Coles modifica baja anotación, conserva masa y probabilidades válidas", () => {
  const base = buildScoreMatrix(1.5, 1.1);
  const corrected = applyDixonColesCorrection(base, 1.5, 1.1, -0.08);
  const mass = corrected.matrix.flat().reduce((sum, cell) => sum + cell.probability, 0);
  assert.ok(Math.abs(mass - 1) < 1e-12);
  assert.notEqual(corrected.matrix[0][0].probability, base.matrix[0][0].probability);
  assert.notEqual(corrected.matrix[1][1].probability, base.matrix[1][1].probability);
  const probabilities = probabilitiesFromMatrix(corrected);
  for (const value of Object.values(probabilities)) assert.ok(value >= 0 && value <= 1 + 1e-12);
});

test("shrinkage acerca lambdas al promedio y aplica límites documentados", () => {
  const snapshot = createFullSnapshot();
  snapshot.leagueAverages = { homeGoals: 1.4, awayGoals: 1.1 };
  const weak = estimateExpectedGoalsV2(snapshot, { shrinkageK: 0, dixonColesRho: 0, homeAdvantageStrength: 0, lambdaBounds: { minimum: 0.2, maximum: 4.5 }, homeAdvantage: { globalRatio: 1, byCompetition: {} } });
  const strong = estimateExpectedGoalsV2(snapshot, { shrinkageK: 1000, dixonColesRho: 0, homeAdvantageStrength: 0, lambdaBounds: { minimum: 0.2, maximum: 4.5 }, homeAdvantage: { globalRatio: 1, byCompetition: {} } });
  assert.ok(Math.abs(strong.expectedGoals.home - 1.4) < Math.abs(weak.expectedGoals.home - 1.4));
  assert.ok(Math.abs(strong.expectedGoals.away - 1.1) < Math.abs(weak.expectedGoals.away - 1.1));
});

test("ventaja local se aplica por competición sin romper extremos", () => {
  const snapshot = createFullSnapshot();
  const neutral = estimateExpectedGoalsV2(snapshot, { shrinkageK: 0, homeAdvantageStrength: 0, homeAdvantage: { globalRatio: 1.3, byCompetition: { 140: 1.5 } }, lambdaBounds: { minimum: 0.2, maximum: 4.5 } });
  const adjusted = estimateExpectedGoalsV2(snapshot, { shrinkageK: 0, homeAdvantageStrength: 1, homeAdvantage: { globalRatio: 1.3, byCompetition: { 140: 1.5 } }, lambdaBounds: { minimum: 0.2, maximum: 4.5 } });
  assert.ok(adjusted.expectedGoals.home > neutral.expectedGoals.home);
  assert.ok(adjusted.expectedGoals.away < neutral.expectedGoals.away);
  const prediction = runFootballPoissonV2(snapshot, { shrinkageK: 0, dixonColesRho: -0.08, homeAdvantageStrength: 1, homeAdvantage: { globalRatio: 1.3, byCompetition: { 140: 1.5 } }, lambdaBounds: { minimum: 0.2, maximum: 4.5 }, calibrators: {} });
  assert.equal(prediction.modelVersion, "football-poisson-v2");
  assert.ok(Math.abs(prediction.probabilities.home + prediction.probabilities.draw + prediction.probabilities.away - 1) < 1e-12);
  assert.ok(Math.abs(prediction.probabilities.over_1_5 + prediction.probabilities.under_1_5 - 1) < 1e-12);
});

test("Platt es determinista, estable y cae a identidad con muestra insuficiente", () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({ probability: index < 100 ? 0.2 : 0.8, actual: index < 100 ? Number(index % 5 === 0) : Number(index % 5 !== 0) }));
  const first = fitPlattCalibrator(rows);
  const second = fitPlattCalibrator(rows);
  assert.deepEqual(first, second);
  assert.equal(first.kind, "platt");
  assert.ok(applyCalibrator(0.8, first) > applyCalibrator(0.2, first));
  assert.equal(fitPlattCalibrator(rows.slice(0, 10)).kind, "identity");
});

test("calibración conserva complementos y simplex 1X2", () => {
  const calibrated = applyMarketCalibrators({ over_0_5: 0.9, over_1_5: 0.7, under_1_5: 0.3, over_2_5: 0.55, under_2_5: 0.45, btts: 0.52, home: 0.5, draw: 0.25, away: 0.25, mass: 1 }, {
    over_1_5: { kind: "platt", a: 0.8, b: -0.1 }, under_1_5: { kind: "platt", a: 1.2, b: 0.1 },
    home: { kind: "platt", a: 1.1, b: 0.05 }, draw: { kind: "platt", a: 0.9, b: 0 }, away: { kind: "platt", a: 1, b: -0.05 },
  });
  assert.ok(Math.abs(calibrated.over_1_5 + calibrated.under_1_5 - 1) < 1e-12);
  assert.ok(Math.abs(calibrated.home + calibrated.draw + calibrated.away - 1) < 1e-12);
});

test("V2 no altera la salida determinista de V1", () => {
  const before = runFootballPoissonV1(createFullSnapshot());
  runFootballPoissonV2(createFullSnapshot());
  const after = runFootballPoissonV1(createFullSnapshot());
  assert.deepEqual(after, before);
});

test("V2 es reproducible y no emite NaN o Infinity en lambdas extremas", () => {
  const snapshot = createFullSnapshot();
  snapshot.leagueAverages = { homeGoals: 20, awayGoals: 0.01 };
  const config = { shrinkageK: 1000, dixonColesRho: 0.08, homeAdvantageStrength: 1, homeAdvantage: { globalRatio: 1.75, byCompetition: {} }, lambdaBounds: { minimum: 0.2, maximum: 4.5 }, calibrators: {} };
  const first = runFootballPoissonV2(snapshot, config);
  const second = runFootballPoissonV2(snapshot, config);
  assert.deepEqual(second, first);
  assert.ok(first.expectedGoals.home <= 4.5 && first.expectedGoals.away >= 0.2);
  for (const value of Object.values(first.probabilities)) assert.ok(Number.isFinite(value));
});
