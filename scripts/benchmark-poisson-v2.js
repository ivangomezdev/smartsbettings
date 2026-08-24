import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { configurationHash } from "../lib/predictions/historical/reproducibility.js";
import { classifyV2Markets, decideV2Promotion } from "../lib/predictions/historical/v2Benchmark.js";
import { createRollingOriginFolds, modelParameterRows, trainFootballPoissonV2 } from "../lib/predictions/historical/v2Training.js";
import { FOOTBALL_POISSON_V1, FOOTBALL_POISSON_V1_CONFIG, runFootballPoissonV1 } from "../lib/predictions/statisticalModel.js";
import { FOOTBALL_POISSON_V2, runFootballPoissonV2 } from "../lib/predictions/statisticalModelV2.js";
import { createBacktestService } from "../services/predictions/historical/backtestService.js";
import { createHistoricalRepository } from "../services/predictions/historical/historicalRepository.js";
import { commaList, parseCliArguments } from "./historical-cli.js";

const DEFAULT_SEASONS = ["2019-2020", "2020-2021", "2021-2022", "2022-2023", "2023-2024"];
const DEFAULT_COMPETITIONS = ["E0", "SP1", "D1", "I1", "F1"];

function assertComparable(v1, v2) {
  for (const market of Object.keys(v1.metrics)) {
    if (v1.metrics[market].n !== v2.metrics[market].n) {
      throw new Error(`COMPARABILITY_ERROR ${market}: V1=${v1.metrics[market].n}, V2=${v2.metrics[market].n}`);
    }
  }
}

function metricSummary(report) {
  return Object.fromEntries(Object.entries(report.metrics).map(([market, metric]) => [market, {
    n: metric.n,
    brier: metric.brier,
    logLoss: metric.logLoss,
    accuracy: metric.accuracy,
    calibrationError: metric.calibrationError ?? null,
    brierDeltaGlobal: report.baselines.comparisonToGlobal[market]?.brierDelta,
    brierDeltaRecent: report.baselines.comparisonToRecent[market]?.brierDelta,
  }]));
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  const seasons = commaList(options.seasons).length ? commaList(options.seasons) : DEFAULT_SEASONS;
  const competitions = commaList(options.competitions).length ? commaList(options.competitions) : DEFAULT_COMPETITIONS;
  const folds = createRollingOriginFolds(seasons);
  const repository = createHistoricalRepository();
  const matches = (await Promise.all(competitions.map((competition) => repository.listMatches({ competition, seasons })))).flat();
  if (!matches.length) throw new Error("No hay partidos históricos para ejecutar V2.");
  const foldResults = [];

  for (const fold of folds) {
    process.stderr.write(`V2 ${fold.name}: selección train/validation...\n`);
    const training = trainFootballPoissonV2({ matches, fold });
    const split = { trainSeasons: fold.trainSeasons, validationSeasons: fold.validationSeasons, testSeasons: fold.testSeasons };
    const filters = { competitions, seasons, benchmark: "checkpoint-2e", fold: fold.name, finalHoldout: fold.finalHoldout };
    process.stderr.write(`V2 ${fold.name}: backtests V1/V2 sobre ${fold.testSeasons.join(", ")}...\n`);
    const [{ report: v1 }, { report: v2 }] = await Promise.all([
      createBacktestService({ repository, modelRunner: runFootballPoissonV1, modelVersion: FOOTBALL_POISSON_V1, modelConfig: FOOTBALL_POISSON_V1_CONFIG }).run({ matches, split, filters: { ...filters, comparator: "v1" }, persist: options.persist !== false }),
      createBacktestService({ repository, modelRunner: (snapshot) => runFootballPoissonV2(snapshot, training.config), modelVersion: FOOTBALL_POISSON_V2, modelConfig: training.config }).run({ matches, split, filters: { ...filters, comparator: "v2" }, persist: options.persist !== false }),
    ]);
    assertComparable(v1, v2);
    foldResults.push({ ...fold, training, v1, v2 });
  }

  const classification = classifyV2Markets(foldResults);
  const decision = decideV2Promotion(classification);
  const final = foldResults.find((fold) => fold.finalHoldout);
  const parameterConfigHash = configurationHash({ modelVersion: FOOTBALL_POISSON_V2, datasetVersion: final.training.datasetVersion, fold: final.fold, config: final.training.config });
  let persistedParameters = { inserted: 0 };
  if (options.persist !== false) {
    persistedParameters = await repository.saveModelParameters(modelParameterRows(final.training, parameterConfigHash));
    await repository.updateBacktestReport({
      runId: final.v2.runId,
      report: { ...final.v2, marketClassification: classification, modelDecision: decision, training: { ...final.training, candidates: final.training.candidates.slice(0, 10) } },
    });
  }

  const report = {
    benchmark: "checkpoint-2e",
    generatedAt: new Date().toISOString(),
    modelVersion: FOOTBALL_POISSON_V2,
    comparatorVersion: FOOTBALL_POISSON_V1,
    datasetVersion: final.training.datasetVersion,
    matches: matches.length,
    competitions,
    seasons,
    dataLeakageProtection: "Cada fold ajusta estructura con train/validation, calibra solo hasta validation y evalúa la temporada test posterior; el holdout final no participa en selección.",
    folds: foldResults.map((fold) => ({
      name: fold.name,
      finalHoldout: fold.finalHoldout,
      trainSeasons: fold.trainSeasons,
      validationSeasons: fold.validationSeasons,
      testSeasons: fold.testSeasons,
      training: {
        selected: fold.training.selected,
        trainedFrom: fold.training.trainedFrom,
        trainedTo: fold.training.trainedTo,
        holdoutFrom: fold.training.holdoutFrom,
        baseWeights: fold.training.config.baseModelConfig.weights,
        lambdaBounds: fold.training.config.lambdaBounds,
        homeAdvantage: fold.training.config.homeAdvantage,
        calibrators: fold.training.config.calibrators,
      },
      v1: fold.v1,
      v2: fold.v2,
    })),
    finalHoldout: {
      season: final.testSeasons[0],
      v1: metricSummary(final.v1),
      v2: metricSummary(final.v2),
      byCompetitionV1: final.v1.byCompetition,
      byCompetitionV2: final.v2.byCompetition,
      historicalValueV1: final.v1.historicalValue,
      historicalValueV2: final.v2.historicalValue,
    },
    classification,
    decision,
    parameterConfigHash,
    persistedParameters,
    caveat: "El value/ROI histórico es secundario, no fue objetivo de optimización y no garantiza rentabilidad futura.",
  };
  const artifactDirectory = resolve("artifacts", "predictions");
  const artifactPath = resolve(artifactDirectory, "football-poisson-v2-benchmark.json");
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    artifactPath,
    datasetVersion: report.datasetVersion,
    matches: report.matches,
    competitions,
    seasons,
    folds: report.folds.map((fold) => ({ name: fold.name, trainSeasons: fold.trainSeasons, validationSeasons: fold.validationSeasons, testSeasons: fold.testSeasons, selected: fold.training.selected, v1: metricSummary(fold.v1), v2: metricSummary(fold.v2) })),
    classification,
    decision,
    persistedParameters,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Benchmark V2 fallido: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
