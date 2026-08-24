import { randomUUID } from "node:crypto";
import { buildHistoricalDataset } from "../../../lib/predictions/historical/featureBuilder.js";
import { fitGlobalFrequencyBaseline, globalBaselinePrediction, recentFormBaseline } from "../../../lib/predictions/historical/baselines.js";
import { binaryMetricSummary, calibrationBins, multiclassMetricSummary } from "../../../lib/predictions/historical/metrics.js";
import { configurationHash, datasetVersion } from "../../../lib/predictions/historical/reproducibility.js";
import { assignTemporalSplits } from "../../../lib/predictions/historical/temporalSplit.js";
import { FOOTBALL_POISSON_V1, FOOTBALL_POISSON_V1_CONFIG, runFootballPoissonV1 } from "../../../lib/predictions/statisticalModel.js";
import { createHistoricalRepository } from "./historicalRepository.js";

export const BACKTEST_MARKETS = Object.freeze(["over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts", "one_x_two"]);

const oneXTwoSelections = ["home", "draw", "away"];
const oneXTwoTargets = ["home_win", "draw", "away_win"];

function fairOdds(probability) {
  return Number.isFinite(probability) && probability > 0 ? 1 / probability : null;
}

function marketOdds(match, market, selectionKey) {
  if (market === "one_x_two") return { home: match.oddsHome, draw: match.oddsDraw, away: match.oddsAway }[selectionKey] ?? null;
  return match.providerData?.marketOdds?.[market] ?? null;
}

function actualIndex(record) {
  return oneXTwoTargets.findIndex((target) => record.targets[target] === 1);
}

function summarizeEvaluations(evaluations) {
  const report = {};
  for (const market of BACKTEST_MARKETS) {
    const rows = evaluations.filter((row) => row.market === market);
    if (market === "one_x_two") {
      const bySelection = Object.fromEntries(oneXTwoSelections.map((selection, index) => [selection, binaryMetricSummary(rows.map((row) => ({
        probability: row.probabilities[index],
        actual: Number(row.actualIndex === index),
      })))]));
      report[market] = {
        ...multiclassMetricSummary(rows.map((row) => ({ probabilities: row.probabilities, actualIndex: row.actualIndex }))),
        calibrationError: oneXTwoSelections.reduce((sum, selection) => sum + (bySelection[selection].calibrationError || 0), 0) / oneXTwoSelections.length,
        bySelection,
      };
    } else {
      report[market] = binaryMetricSummary(rows.map((row) => ({ probability: row.probability, actual: row.actual })));
    }
  }
  return report;
}

function summarizeBreakdown(evaluations, property) {
  const values = [...new Set(evaluations.map((row) => row[property]))].sort();
  return Object.fromEntries(values.map((value) => [value, summarizeEvaluations(evaluations.filter((row) => row[property] === value))]));
}

function baselineEvaluations(records, markets, baseline, kind) {
  const result = [];
  for (const record of records) {
    for (const market of markets) {
      const prediction = kind === "global" ? globalBaselinePrediction(baseline, market) : recentFormBaseline(record, market);
      if (market === "one_x_two") {
        if (!Array.isArray(prediction) || prediction.some((value) => !Number.isFinite(value))) continue;
        result.push({ market, probabilities: prediction, actualIndex: actualIndex(record), competition: record.match.competition, season: record.match.season, matchId: record.match.id });
      } else if (Number.isFinite(prediction)) {
        result.push({ market, probability: prediction, actual: record.targets[market], competition: record.match.competition, season: record.match.season, matchId: record.match.id });
      }
    }
  }
  return result;
}

function comparison(model, baseline) {
  return Object.fromEntries(BACKTEST_MARKETS.map((market) => {
    const modelMetric = model[market];
    const baselineMetric = baseline[market];
    return [market, {
      modelN: modelMetric?.n || 0,
      baselineN: baselineMetric?.n || 0,
      brierDelta: Number.isFinite(modelMetric?.brier) && Number.isFinite(baselineMetric?.brier) ? modelMetric.brier - baselineMetric.brier : null,
      logLossDelta: Number.isFinite(modelMetric?.logLoss) && Number.isFinite(baselineMetric?.logLoss) ? modelMetric.logLoss - baselineMetric.logLoss : null,
    }];
  }));
}

function valueReport(predictions) {
  const thresholds = [0, 0.02, 0.05, 0.10];
  return Object.fromEntries(thresholds.map((threshold) => {
    const selections = predictions.filter((row) => Number.isFinite(row.edge) && row.edge > threshold && Number.isFinite(row.marketOdds));
    const returnOnStake = selections.length
      ? selections.reduce((sum, row) => sum + row.actualResult * row.marketOdds - 1, 0) / selections.length
      : null;
    return [`edge_gt_${Math.round(threshold * 100)}pct`, { selections: selections.length, historicalReturnOnStake: returnOnStake }];
  }));
}

function calibrationRows(evaluations) {
  const rows = [];
  for (const market of BACKTEST_MARKETS) {
    const selected = evaluations.filter((row) => row.market === market);
    if (market === "one_x_two") {
      for (const [index, selection] of oneXTwoSelections.entries()) {
        const bins = calibrationBins(selected.map((row) => ({ probability: row.probabilities[index], actual: Number(row.actualIndex === index) })));
        rows.push(...bins.map((bin) => ({ market: `one_x_two:${selection}`, ...bin })));
      }
    } else {
      const bins = calibrationBins(selected.map((row) => ({ probability: row.probability, actual: row.actual })));
      rows.push(...bins.map((bin) => ({ market, ...bin })));
    }
  }
  return rows;
}

function splitCounts(records) {
  return records.reduce((counts, record) => ({ ...counts, [record.split]: (counts[record.split] || 0) + 1 }), {});
}

export function createBacktestService({
  repository = createHistoricalRepository(),
  modelRunner = runFootballPoissonV1,
  modelVersion = FOOTBALL_POISSON_V1,
  modelConfig = FOOTBALL_POISSON_V1_CONFIG,
} = {}) {
  return {
    async run({ matches, markets = BACKTEST_MARKETS, split = {}, filters = {}, persist = true } = {}) {
      const invalidMarkets = markets.filter((market) => !BACKTEST_MARKETS.includes(market));
      if (invalidMarkets.length) throw new RangeError(`Mercados no soportados: ${invalidMarkets.join(", ")}`);
      const dataset = assignTemporalSplits(buildHistoricalDataset(matches), split);
      const train = dataset.filter((record) => record.split === "train");
      const evaluationRecords = dataset.filter((record) => ["validation", "test"].includes(record.split));
      const baseline = fitGlobalFrequencyBaseline(train);
      const version = datasetVersion(matches);
      const runConfig = { modelVersion, modelConfig, markets, split, filters };
      const runId = randomUUID();
      const configHash = configurationHash(runConfig);
      const competitions = [...new Set(matches.map((match) => match.competition))].sort();
      const seasons = [...new Set(matches.map((match) => match.season))].sort();
      const reuseCompletedRun = async (existing) => {
        if (!existing) return null;
        const predictions = await repository.listBacktestPredictions({ runId: existing.id });
        const bins = await repository.listBacktestCalibrationBins({ runId: existing.id });
        return {
          report: existing.report,
          calibrationBins: bins,
          predictions,
          persistence: { source: "existing", reused: true, runId: existing.id },
        };
      };
      if (persist && repository.findCompletedBacktestRun) {
        const existing = await repository.findCompletedBacktestRun({ modelVersion, datasetVersion: version, configHash });
        const reused = await reuseCompletedRun(existing);
        if (reused) return reused;
      }
      if (persist) {
        const created = await repository.createBacktestRun({
          id: runId,
          modelVersion,
          datasetVersion: version,
          configHash,
          filters,
          competitions,
          seasons,
          modelConfig,
          matchCount: matches.length,
        });
        if (created?.created === false) {
          const raced = repository.findCompletedBacktestRun
            ? await repository.findCompletedBacktestRun({ modelVersion, datasetVersion: version, configHash })
            : null;
          const reused = await reuseCompletedRun(raced);
          if (reused) return reused;
          throw Object.assign(new Error(`Ya existe un backtest idéntico en curso: ${created.id || "desconocido"}.`), { code: "BACKTEST_RUN_IN_PROGRESS" });
        }
      }

      const evaluations = [];
      const predictions = [];
      let insufficientData = 0;
      for (const record of evaluationRecords) {
        const model = modelRunner(record.snapshot);
        if (model.kind !== "prediction") {
          insufficientData += 1;
          continue;
        }
        for (const market of markets) {
          if (market === "one_x_two") {
            const probabilities = oneXTwoSelections.map((selection) => model.probabilities[selection]);
            const observedIndex = actualIndex(record);
            evaluations.push({ market, probabilities, actualIndex: observedIndex, competition: record.match.competition, season: record.match.season, split: record.split, matchId: record.match.id });
            for (const [index, selectionKey] of oneXTwoSelections.entries()) {
              const odds = marketOdds(record.match, market, selectionKey);
              predictions.push({
                runId,
                matchId: record.match.id,
                modelVersion,
                market,
                selectionKey,
                probability: probabilities[index],
                fairOdds: fairOdds(probabilities[index]),
                marketOdds: odds,
                actualResult: Number(observedIndex === index),
                predictedAtSimulated: new Date(Date.parse(record.match.matchDate) - 1).toISOString(),
                datasetSplit: record.split,
                competition: record.match.competition,
                season: record.match.season,
                edge: Number.isFinite(odds) ? probabilities[index] * odds - 1 : null,
              });
            }
          } else {
            const probability = model.probabilities[market];
            const observed = record.targets[market];
            const odds = marketOdds(record.match, market, market);
            evaluations.push({ market, probability, actual: observed, competition: record.match.competition, season: record.match.season, split: record.split, matchId: record.match.id });
            predictions.push({
              runId,
              matchId: record.match.id,
              modelVersion,
              market,
              selectionKey: market,
              probability,
              fairOdds: fairOdds(probability),
              marketOdds: odds,
              actualResult: observed,
              predictedAtSimulated: new Date(Date.parse(record.match.matchDate) - 1).toISOString(),
              datasetSplit: record.split,
              competition: record.match.competition,
              season: record.match.season,
              edge: Number.isFinite(odds) ? probability * odds - 1 : null,
            });
          }
        }
      }

      const testEvaluations = evaluations.filter((row) => row.split === "test");
      const testRecords = evaluationRecords.filter((record) => record.split === "test");
      const comparableTestIds = new Set(testEvaluations.map((row) => row.matchId));
      const comparableTestRecords = testRecords.filter((record) => comparableTestIds.has(record.match.id));
      const metrics = summarizeEvaluations(testEvaluations);
      const globalEvaluations = baselineEvaluations(comparableTestRecords, markets, baseline, "global");
      const recentEvaluations = baselineEvaluations(comparableTestRecords, markets, baseline, "recent");
      const globalMetrics = summarizeEvaluations(globalEvaluations);
      const recentMetrics = summarizeEvaluations(recentEvaluations);
      const bins = calibrationRows(testEvaluations);
      const report = {
        runId,
        modelVersion,
        datasetVersion: version,
        configHash,
        filters,
        competitions,
        seasons,
        matchCount: matches.length,
        splitCounts: splitCounts(dataset),
        evaluatedMatches: new Set(predictions.map((row) => row.matchId)).size,
        insufficientData,
        metrics,
        byCompetition: summarizeBreakdown(testEvaluations, "competition"),
        bySeason: summarizeBreakdown(testEvaluations, "season"),
        baselines: {
          globalFrequency: globalMetrics,
          recentForm: recentMetrics,
          comparisonToGlobal: comparison(metrics, globalMetrics),
          comparisonToRecent: comparison(metrics, recentMetrics),
          globalByCompetition: summarizeBreakdown(globalEvaluations, "competition"),
          globalBySeason: summarizeBreakdown(globalEvaluations, "season"),
          recentByCompetition: summarizeBreakdown(recentEvaluations, "competition"),
          recentBySeason: summarizeBreakdown(recentEvaluations, "season"),
        },
        historicalValue: {
          label: "Backtest histórico; no garantiza rentabilidad futura.",
          ...valueReport(predictions.filter((row) => row.datasetSplit === "test")),
        },
      };
      if (persist) {
        await repository.saveBacktestPredictions(predictions);
        await repository.completeBacktestRun({ runId, report, bins, predictionCount: predictions.length });
      }
      return { report, calibrationBins: bins, predictions, persistence: { source: persist ? "created" : "memory", reused: false, runId } };
    },
  };
}
