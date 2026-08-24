import test from "node:test";
import assert from "node:assert/strict";
import { createBacktestService } from "../../services/predictions/historical/backtestService.js";
import { createHistoricalMatches } from "./fixtures/historical-dataset.js";

test("ejecuta un backtest pequeño conocido sin acceder al resultado futuro", async () => {
  const matches = createHistoricalMatches();
  const result = await createBacktestService().run({ matches, persist: false });
  assert.equal(result.report.modelVersion, "football-poisson-v1");
  assert.equal(result.report.matchCount, 24);
  assert.ok(result.report.metrics.over_1_5.n > 0);
  assert.ok(Number.isFinite(result.report.metrics.over_1_5.brier));
  assert.ok(Number.isFinite(result.report.metrics.one_x_two.logLoss));
  assert.ok(Number.isFinite(result.report.metrics.one_x_two.bySelection.home.brier));
  assert.equal(result.report.metrics.one_x_two.n, result.report.metrics.over_1_5.n);
  assert.equal(result.report.baselines.globalFrequency.over_1_5.n, result.report.metrics.over_1_5.n);
  assert.equal(result.report.baselines.recentForm.over_1_5.n, result.report.metrics.over_1_5.n);
  assert.ok(result.calibrationBins.some((bin) => bin.market === "one_x_two:home"));
  for (const prediction of result.predictions) {
    const match = matches.find((item) => item.id === prediction.matchId);
    assert.ok(Date.parse(prediction.predictedAtSimulated) < Date.parse(match.matchDate));
  }
});

test("persiste metadata reproducible, predicciones y bins", async () => {
  const calls = [];
  const repository = {
    createBacktestRun: async (run) => calls.push(["run", run]),
    saveBacktestPredictions: async (rows) => calls.push(["predictions", rows]),
    completeBacktestRun: async (input) => calls.push(["complete", input]),
  };
  const result = await createBacktestService({ repository }).run({ matches: createHistoricalMatches(), markets: ["over_1_5", "one_x_two"] });
  assert.deepEqual(calls.map(([name]) => name), ["run", "predictions", "complete"]);
  assert.equal(calls[0][1].datasetVersion, result.report.datasetVersion);
  assert.ok(calls[1][1].length > 0);
  assert.ok(calls[2][1].bins.length > 0);
  assert.equal(result.persistence.source, "created");
});

test("reutiliza un backtest completado con identidad idéntica sin volver a persistir", async () => {
  const calls = [];
  const existing = { id: "canonical-run", report: { runId: "canonical-run", modelVersion: "football-poisson-v1" } };
  const repository = {
    findCompletedBacktestRun: async (identity) => { calls.push(["find", identity]); return existing; },
    listBacktestPredictions: async ({ runId }) => { calls.push(["predictions", runId]); return [{ runId }]; },
    listBacktestCalibrationBins: async ({ runId }) => { calls.push(["bins", runId]); return [{ market: "over_1_5" }]; },
    createBacktestRun: async () => { throw new Error("no debe crear"); },
  };
  const result = await createBacktestService({ repository }).run({ matches: createHistoricalMatches() });
  assert.equal(result.persistence.source, "existing");
  assert.equal(result.persistence.runId, "canonical-run");
  assert.equal(result.report.runId, "canonical-run");
  assert.deepEqual(calls.map(([name]) => name), ["find", "predictions", "bins"]);
});
