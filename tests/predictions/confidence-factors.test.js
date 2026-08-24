import test from "node:test";
import assert from "node:assert/strict";
import { assessConfidence } from "../../lib/predictions/confidence.js";
import { generateDeterministicFactors } from "../../lib/predictions/factors.js";
import { runFootballPoissonV1 } from "../../lib/predictions/statisticalModel.js";
import { createFullSnapshot, createPartialSnapshot } from "./fixtures/football-snapshots.js";

test("confidence depende de cobertura y muestra, no de probabilidad", () => {
  const fullSnapshot = createFullSnapshot();
  const fullModel = runFootballPoissonV1(fullSnapshot);
  const high = assessConfidence(fullModel, fullSnapshot);
  assert.equal(high.level, "high");
  assert.ok(high.score >= 0.75 && high.score <= 1);
  assert.ok(high.reasons.some((reason) => /xG/.test(reason)));

  const partialSnapshot = createPartialSnapshot();
  const partialModel = runFootballPoissonV1(partialSnapshot);
  const low = assessConfidence(partialModel, partialSnapshot);
  assert.equal(low.level, "low");
  assert.ok(low.score < high.score);
});

test("genera factores distintos para Over, Under, BTTS y 1X2", () => {
  const model = runFootballPoissonV1(createFullSnapshot());
  for (const code of ["over_1_5", "under_1_5", "btts", "one_x_two"]) {
    const factors = generateDeterministicFactors({ market: { code }, model });
    assert.ok(factors.positiveFactors.length + factors.negativeFactors.length > 0, `Sin factores para ${code}`);
    for (const item of [...factors.positiveFactors, ...factors.negativeFactors]) {
      assert.ok(item.code && item.description);
      assert.ok(Number.isFinite(item.value));
    }
  }
});
