import test from "node:test";
import assert from "node:assert/strict";
import { buildScoreMatrix, poissonDistribution, poissonPmf, probabilitiesFromMatrix } from "../../lib/predictions/poisson.js";

const closeTo = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} no está cerca de ${expected}`);

test("calcula la PMF Poisson", () => {
  closeTo(poissonPmf(2, 0), Math.exp(-2));
  closeTo(poissonPmf(2, 1), 2 * Math.exp(-2));
  assert.equal(poissonPmf(-1, 2), null);
});

test("la distribución conserva masa suficiente", () => {
  const distribution = poissonDistribution(2.4);
  closeTo(distribution.probabilities.reduce((sum, value) => sum + value, 0), distribution.cumulative, 1e-12);
  assert.ok(distribution.tail < 1e-10);
  assert.ok(distribution.maxGoals >= 10);
});

test("la matriz normalizada suma uno", () => {
  const scoreMatrix = buildScoreMatrix(1.5, 1.0);
  const mass = scoreMatrix.matrix.flat().reduce((sum, cell) => sum + cell.probability, 0);
  closeTo(mass, 1, 1e-12);
  assert.ok(scoreMatrix.omittedMass < 1e-9);
});

test("calcula Over, Under, BTTS y 1X2", () => {
  const lambdaHome = 1.5;
  const lambdaAway = 1;
  const lambdaTotal = lambdaHome + lambdaAway;
  const probabilities = probabilitiesFromMatrix(buildScoreMatrix(lambdaHome, lambdaAway));
  closeTo(probabilities.over_0_5, 1 - Math.exp(-lambdaTotal));
  closeTo(probabilities.over_1_5, 1 - Math.exp(-lambdaTotal) * (1 + lambdaTotal));
  closeTo(probabilities.over_2_5, 1 - Math.exp(-lambdaTotal) * (1 + lambdaTotal + lambdaTotal ** 2 / 2));
  closeTo(probabilities.under_1_5, 1 - probabilities.over_1_5);
  closeTo(probabilities.under_2_5, 1 - probabilities.over_2_5);
  closeTo(probabilities.btts, (1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway)));
  closeTo(probabilities.home + probabilities.draw + probabilities.away, 1, 1e-12);
});

test("maneja lambdas cero y extremos sin NaN o Infinity", () => {
  for (const [home, away] of [[0, 0], [0, 5], [20, 18]]) {
    const matrix = buildScoreMatrix(home, away);
    const probabilities = probabilitiesFromMatrix(matrix);
    for (const value of Object.values(probabilities)) assert.ok(Number.isFinite(value));
    assert.ok(matrix.omittedMass < 1e-9);
  }
});
