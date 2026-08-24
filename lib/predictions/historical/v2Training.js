import { fitMarketCalibrators } from "../calibration.js";
import { buildHistoricalDataset } from "./featureBuilder.js";
import { datasetVersion } from "./reproducibility.js";
import { runFootballPoissonV2, FOOTBALL_POISSON_V2, FOOTBALL_POISSON_V2_CONFIG } from "../statisticalModelV2.js";

export const V2_TUNING_GRID = Object.freeze({
  shrinkageK: Object.freeze([3, 8, 15]),
  dixonColesRho: Object.freeze([-0.08, 0, 0.08]),
  homeAdvantageStrength: Object.freeze([0, 0.5, 1]),
});

export function createRollingOriginFolds(seasons) {
  if (!Array.isArray(seasons) || seasons.length < 4) throw new RangeError("V2 requiere al menos cuatro temporadas ordenadas.");
  const ordered = [...seasons];
  return ordered.slice(2).map((testSeason, index) => ({
    name: index === ordered.length - 3 ? "final-holdout" : `rolling-${index + 1}`,
    trainSeasons: ordered.slice(0, index + 1),
    validationSeasons: [ordered[index + 1]],
    testSeasons: [testSeason],
    finalHoldout: index === ordered.length - 3,
  }));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Infinity;
}

function clip(probability) {
  return Math.min(1 - 1e-12, Math.max(1e-12, probability));
}

function candidateLoss(rows) {
  const losses = [];
  for (const row of rows) {
    for (const market of ["over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts"]) {
      const probability = clip(row.probabilities[market]);
      const actual = row.targets[market];
      losses.push((probability - actual) ** 2 + (-actual * Math.log(probability) - (1 - actual) * Math.log(1 - probability)) / 4);
    }
    const outcome = row.targets.home_win ? "home" : row.targets.draw ? "draw" : "away";
    const multiclassBrier = ["home", "draw", "away"].reduce((sum, key) => sum + (Number(key === outcome) - row.probabilities[key]) ** 2, 0) / 3;
    losses.push(multiclassBrier - Math.log(clip(row.probabilities[outcome])) / 4);
  }
  return average(losses);
}

function eligible(records, seasons) {
  const selected = new Set(seasons);
  return records.filter((record) => selected.has(record.match.season));
}

function predictionsFor(records, config) {
  return records.flatMap((record) => {
    const prediction = runFootballPoissonV2(record.snapshot, config);
    return prediction.kind === "prediction" ? [{ probabilities: prediction.uncalibratedProbabilities, targets: record.targets }] : [];
  });
}

export function estimateHistoricalHomeAdvantage(matches, trainSeasons) {
  const allowed = new Set(trainSeasons);
  const selected = matches.filter((match) => allowed.has(match.season));
  const summarize = (rows) => {
    const home = rows.reduce((sum, match) => sum + match.homeGoals, 0) / Math.max(1, rows.length);
    const away = rows.reduce((sum, match) => sum + match.awayGoals, 0) / Math.max(1, rows.length);
    return { matches: rows.length, homeGoals: home, awayGoals: away, ratio: Math.min(1.75, Math.max(0.75, home / Math.max(0.1, away))) };
  };
  const competitions = [...new Set(selected.map((match) => match.competition))];
  const global = summarize(selected);
  return {
    globalRatio: global.ratio,
    global,
    byCompetition: Object.fromEntries(competitions.map((competition) => {
      const summary = summarize(selected.filter((match) => match.competition === competition));
      return [competition, summary.matches >= 200 ? summary.ratio : global.ratio];
    })),
  };
}

function dates(records) {
  const timestamps = records.map((record) => Date.parse(record.match.matchDate)).filter(Number.isFinite);
  return { first: new Date(Math.min(...timestamps)).toISOString(), last: new Date(Math.max(...timestamps)).toISOString() };
}

export function assertNoCalibrationLeakage({ trainedTo, holdoutFrom }) {
  if (!(Date.parse(trainedTo) < Date.parse(holdoutFrom))) throw new Error("DATA_LEAKAGE: la calibración alcanza o supera el inicio del holdout.");
}

export function trainFootballPoissonV2({ matches, fold, grid = V2_TUNING_GRID, minimumCalibrationSamples = 50 }) {
  const records = buildHistoricalDataset(matches);
  const trainRecords = eligible(records, fold.trainSeasons);
  const validationRecords = eligible(records, fold.validationSeasons);
  const testRecords = eligible(records, fold.testSeasons);
  if (!trainRecords.length || !validationRecords.length || !testRecords.length) throw new RangeError(`Fold incompleto: ${fold.name}`);
  const homeAdvantage = estimateHistoricalHomeAdvantage(matches, fold.trainSeasons);
  const candidates = [];
  for (const shrinkageK of grid.shrinkageK) {
    for (const dixonColesRho of grid.dixonColesRho) {
      for (const homeAdvantageStrength of grid.homeAdvantageStrength) {
        const config = { ...FOOTBALL_POISSON_V2_CONFIG, shrinkageK, dixonColesRho, homeAdvantageStrength, homeAdvantage };
        const predictions = predictionsFor(validationRecords, config);
        candidates.push({ shrinkageK, dixonColesRho, homeAdvantageStrength, objective: candidateLoss(predictions), evaluatedMatches: predictions.length });
      }
    }
  }
  candidates.sort((left, right) => left.objective - right.objective
    || left.shrinkageK - right.shrinkageK
    || Math.abs(left.dixonColesRho) - Math.abs(right.dixonColesRho)
    || left.homeAdvantageStrength - right.homeAdvantageStrength);
  const selected = candidates[0];
  const uncalibratedConfig = { ...FOOTBALL_POISSON_V2_CONFIG, ...selected, homeAdvantage };
  delete uncalibratedConfig.objective;
  delete uncalibratedConfig.evaluatedMatches;
  const developmentRecords = [...trainRecords, ...validationRecords];
  const calibrators = fitMarketCalibrators(predictionsFor(developmentRecords, uncalibratedConfig), { minimumSamples: minimumCalibrationSamples });
  const trainedDates = dates(developmentRecords);
  const holdoutDates = dates(testRecords);
  assertNoCalibrationLeakage({ trainedTo: trainedDates.last, holdoutFrom: holdoutDates.first });
  return {
    modelVersion: FOOTBALL_POISSON_V2,
    datasetVersion: datasetVersion(matches),
    fold,
    config: { ...uncalibratedConfig, calibrators },
    selected,
    candidates,
    trainedFrom: trainedDates.first,
    trainedTo: trainedDates.last,
    holdoutFrom: holdoutDates.first,
    developmentMatches: developmentRecords.length,
    validationPredictions: selected.evaluatedMatches,
  };
}

export function modelParameterRows(training, configHash) {
  const common = {
    modelVersion: training.modelVersion,
    datasetVersion: training.datasetVersion,
    competition: null,
    configHash,
    trainedFrom: training.trainedFrom,
    trainedTo: training.trainedTo,
  };
  const rows = [{ ...common, market: null, parameterType: "structural", parameters: {
    shrinkageK: training.config.shrinkageK,
    dixonColesRho: training.config.dixonColesRho,
    homeAdvantageStrength: training.config.homeAdvantageStrength,
    homeAdvantage: training.config.homeAdvantage,
    lambdaBounds: training.config.lambdaBounds,
  } }];
  for (const [market, parameters] of Object.entries(training.config.calibrators)) {
    const persistedMarket = ["home", "draw", "away"].includes(market) ? `one_x_two:${market}` : market;
    rows.push({ ...common, market: persistedMarket, parameterType: "platt_calibration", parameters });
  }
  return rows;
}
