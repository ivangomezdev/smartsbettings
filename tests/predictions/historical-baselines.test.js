import test from "node:test";
import assert from "node:assert/strict";
import { fitGlobalFrequencyBaseline, recentFormBaseline } from "../../lib/predictions/historical/baselines.js";
import { buildHistoricalDataset } from "../../lib/predictions/historical/featureBuilder.js";
import { configurationHash, datasetVersion } from "../../lib/predictions/historical/reproducibility.js";
import { assignTemporalSplits } from "../../lib/predictions/historical/temporalSplit.js";
import { createHistoricalMatches } from "./fixtures/historical-dataset.js";

test("baseline global usa únicamente las filas entregadas como entrenamiento", () => {
  const records = buildHistoricalDataset(createHistoricalMatches()).slice(0, 4);
  const baseline = fitGlobalFrequencyBaseline(records);
  assert.equal(baseline.probabilities.over_0_5, records.reduce((sum, row) => sum + row.targets.over_0_5, 0) / records.length);
  assert.ok(Math.abs(baseline.probabilities.one_x_two.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test("baseline de forma reciente se deriva de features previas", () => {
  const record = buildHistoricalDataset(createHistoricalMatches()).at(-1);
  assert.ok(Number.isFinite(recentFormBaseline(record, "over_1_5")));
  assert.ok(Number.isFinite(recentFormBaseline(record, "under_1_5")));
  assert.ok(Math.abs(recentFormBaseline(record, "one_x_two").reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test("split automático y explícito conservan orden temporal", () => {
  const records = buildHistoricalDataset(createHistoricalMatches());
  const automatic = assignTemporalSplits(records);
  const latestTrain = Math.max(...automatic.filter((row) => row.split === "train").map((row) => Date.parse(row.match.matchDate)));
  const earliestTest = Math.min(...automatic.filter((row) => row.split === "test").map((row) => Date.parse(row.match.matchDate)));
  assert.ok(latestTrain < earliestTest);
  const explicit = assignTemporalSplits(records, { trainThrough: "2024-01-15", validationThrough: "2024-02-15" });
  assert.ok(explicit.some((row) => row.split === "train"));
  assert.ok(explicit.some((row) => row.split === "test"));
});

test("hashes reproducibles no dependen del orden de claves o partidos", () => {
  assert.equal(configurationHash({ b: 2, a: 1 }), configurationHash({ a: 1, b: 2 }));
  const matches = createHistoricalMatches();
  assert.equal(datasetVersion(matches), datasetVersion([...matches].reverse()));
  assert.notEqual(datasetVersion(matches), datasetVersion(matches.slice(1)));
  assert.notEqual(datasetVersion(matches), datasetVersion(matches.map((match, index) => index ? match : { ...match, homeGoals: match.homeGoals + 1 })));
});
