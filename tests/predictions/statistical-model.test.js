import test from "node:test";
import assert from "node:assert/strict";
import { estimateExpectedGoals, runFootballPoissonV1 } from "../../lib/predictions/statisticalModel.js";
import { createFullSnapshot, createPartialSnapshot } from "./fixtures/football-snapshots.js";

test("produce un resultado versionado usando las cuatro fuentes válidas", () => {
  const model = runFootballPoissonV1(createFullSnapshot());
  assert.equal(model.kind, "prediction");
  assert.equal(model.modelVersion, "football-poisson-v1");
  assert.ok(model.expectedGoals.home > model.expectedGoals.away);
  assert.deepEqual(Object.keys(model.weights.home).sort(), ["h2h", "recent", "season", "xg"]);
  assert.ok(model.matrix.omittedMass < 1e-9);
});

test("redistribuye proporcionalmente pesos de fuentes ausentes", () => {
  const estimate = estimateExpectedGoals(createPartialSnapshot());
  assert.equal(estimate.kind, "estimate");
  assert.deepEqual(estimate.weights.home, { recent: 1 });
  assert.deepEqual(estimate.weights.away, { recent: 1 });

  const snapshot = createFullSnapshot();
  snapshot.matchStatistics = [];
  snapshot.h2h = [];
  const withoutOptional = estimateExpectedGoals(snapshot);
  assert.ok(Math.abs(withoutOptional.weights.home.season - 0.5625) < 1e-12);
  assert.ok(Math.abs(withoutOptional.weights.home.recent - 0.4375) < 1e-12);
});

test("omite xG con menos de tres observaciones y H2H insuficiente", () => {
  const snapshot = createFullSnapshot();
  snapshot.matchStatistics = snapshot.matchStatistics.slice(0, 2);
  snapshot.h2h = snapshot.h2h.slice(0, 2);
  const estimate = estimateExpectedGoals(snapshot);
  assert.equal(estimate.sources.xg, null);
  assert.equal(estimate.sources.h2h, null);
  assert.equal(estimate.metrics.xg.home.sampleSize, 2);
  assert.equal(estimate.metrics.h2h.sampleSize, 2);
});

test("no emite probabilidades con menos de tres partidos por equipo", () => {
  const snapshot = createPartialSnapshot();
  snapshot.recentForm.away.matches = snapshot.recentForm.away.matches.slice(0, 2);
  const model = runFootballPoissonV1(snapshot);
  assert.equal(model.kind, "insufficient_data");
  assert.equal(model.code, "INSUFFICIENT_DATA");
  assert.equal(model.probabilities, undefined);
});

test("ignora partidos, H2H, xG y temporada posteriores al fixture", () => {
  const base = createFullSnapshot();
  const withoutSeason = structuredClone(base);
  withoutSeason.seasonStatistics = { home: null, away: null };
  const future = structuredClone(base);
  future.recentForm.home.matches.unshift({
    ...future.recentForm.home.matches[0],
    date: "2024-05-21T18:00:00.000Z",
    result: { venue: "home", goalsFor: 20, goalsAgainst: 0 },
  });
  future.h2h.unshift({ ...future.h2h[0], date: "2024-05-21T18:00:00.000Z", goals: { home: 20, away: 20 } });
  future.matchStatistics.unshift({ ...future.matchStatistics[0], fixture: { ...future.matchStatistics[0].fixture, date: "2024-05-21T18:00:00.000Z" } });
  future.seasonStatistics.home.asOf = "2024-05-21";
  future.seasonStatistics.away.asOf = "2024-05-21";

  const futureEstimate = estimateExpectedGoals(future);
  const expectedWithoutSeason = estimateExpectedGoals(withoutSeason);
  assert.equal(futureEstimate.sources.season, null);
  assert.deepEqual(futureEstimate.sources.recent, expectedWithoutSeason.sources.recent);
  assert.deepEqual(futureEstimate.sources.h2h, expectedWithoutSeason.sources.h2h);
  assert.deepEqual(futureEstimate.sources.xg, expectedWithoutSeason.sources.xg);
});

test("rechaza observaciones imposibles sin producir NaN", () => {
  const snapshot = createFullSnapshot();
  snapshot.matchStatistics[0].teams[0].values.xg = Infinity;
  snapshot.recentForm.home.matches[0].result.goalsFor = NaN;
  const model = runFootballPoissonV1(snapshot);
  assert.equal(model.kind, "prediction");
  assert.ok(Number.isFinite(model.expectedGoals.home));
  for (const value of Object.values(model.probabilities)) assert.ok(Number.isFinite(value));
});
