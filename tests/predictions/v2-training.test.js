import test from "node:test";
import assert from "node:assert/strict";
import { assertNoCalibrationLeakage, createRollingOriginFolds, estimateHistoricalHomeAdvantage, modelParameterRows } from "../../lib/predictions/historical/v2Training.js";
import { createHistoricalRepository } from "../../services/predictions/historical/historicalRepository.js";

test("rolling-origin reserva siempre la última temporada como holdout final", () => {
  const folds = createRollingOriginFolds(["2019", "2020", "2021", "2022", "2023"]);
  assert.equal(folds.length, 3);
  assert.deepEqual(folds[0], { name: "rolling-1", trainSeasons: ["2019"], validationSeasons: ["2020"], testSeasons: ["2021"], finalHoldout: false });
  assert.deepEqual(folds.at(-1).testSeasons, ["2023"]);
  assert.equal(folds.at(-1).finalHoldout, true);
  assert.ok(!folds.at(-1).trainSeasons.includes("2023"));
  assert.ok(!folds.at(-1).validationSeasons.includes("2023"));
});

test("protección de leakage exige calibración anterior al holdout", () => {
  assert.doesNotThrow(() => assertNoCalibrationLeakage({ trainedTo: "2022-05-30T00:00:00Z", holdoutFrom: "2023-08-01T00:00:00Z" }));
  assert.throws(() => assertNoCalibrationLeakage({ trainedTo: "2023-08-01T00:00:00Z", holdoutFrom: "2023-08-01T00:00:00Z" }), /DATA_LEAKAGE/);
});

test("ventaja local solo usa temporadas de entrenamiento", () => {
  const matches = [
    { season: "train", competition: "E0", homeGoals: 2, awayGoals: 1 },
    { season: "train", competition: "E0", homeGoals: 1, awayGoals: 1 },
    { season: "holdout", competition: "E0", homeGoals: 0, awayGoals: 20 },
  ];
  const result = estimateHistoricalHomeAdvantage(matches, ["train"]);
  assert.equal(result.global.matches, 2);
  assert.equal(result.global.homeGoals, 1.5);
  assert.equal(result.global.awayGoals, 1);
});

test("serializa parámetros estructurales y calibración por mercado", () => {
  const training = {
    modelVersion: "football-poisson-v2", datasetVersion: "dataset", trainedFrom: "2020-01-01", trainedTo: "2022-01-01",
    config: { shrinkageK: 8, dixonColesRho: -0.08, homeAdvantageStrength: 0.5, homeAdvantage: { globalRatio: 1.2 }, lambdaBounds: { minimum: 0.2, maximum: 4.5 }, calibrators: { btts: { kind: "platt", a: 1, b: 0 } } },
  };
  const rows = modelParameterRows(training, "hash");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].parameterType, "structural");
  assert.equal(rows[1].market, "btts");
  assert.equal(rows[1].configHash, "hash");
});

test("persiste parámetros V2 de forma aditiva e idempotente", async () => {
  const queries = [];
  const sql = { query: async (statement, values) => {
    queries.push({ statement, values });
    return { rows: [{ id: "saved" }] };
  } };
  const repository = createHistoricalRepository({ getSql: async () => sql });
  const result = await repository.saveModelParameters([{
    modelVersion: "football-poisson-v2", datasetVersion: "dataset", market: "btts", competition: null,
    parameterType: "platt_calibration", parameters: { a: 1, b: 0 }, configHash: "hash", trainedFrom: "2020-01-01", trainedTo: "2022-01-01",
  }]);
  assert.equal(result.inserted, 1);
  assert.match(queries[0].statement, /INSERT INTO sb_model_parameters/);
  assert.match(queries[0].statement, /ON CONFLICT DO NOTHING/);
  assert.equal(queries[0].values[1], "football-poisson-v2");
});
