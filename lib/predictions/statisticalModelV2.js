import { applyMarketCalibrators } from "./calibration.js";
import { buildScoreMatrix, probabilitiesFromMatrix } from "./poisson.js";
import { estimateExpectedGoals, FOOTBALL_POISSON_V1_CONFIG } from "./statisticalModel.js";

export const FOOTBALL_POISSON_V2 = "football-poisson-v2";
export const FOOTBALL_POISSON_V2_CONFIG = Object.freeze({
  baseModelConfig: FOOTBALL_POISSON_V1_CONFIG,
  shrinkageK: 8,
  dixonColesRho: 0,
  homeAdvantageStrength: 0,
  homeAdvantage: Object.freeze({ globalRatio: 1, byCompetition: Object.freeze({}) }),
  lambdaBounds: Object.freeze({ minimum: 0.2, maximum: 4.5 }),
  calibrators: Object.freeze({}),
});

export const FOOTBALL_POISSON_V2_DATASET_VERSION = "bde4a15a4bf83d45441aec7331c9694e376aa64df1721f68e19f7246350bed54";
export const FOOTBALL_POISSON_V2_CONFIG_FINGERPRINT = "c53c0436785fe92b135cd732ef3232405d7ec7ec0f644c07063e37e65fb33bc4";
export const FOOTBALL_POISSON_V2_CANDIDATE_CONFIG = Object.freeze({
  baseModelConfig: FOOTBALL_POISSON_V1_CONFIG,
  shrinkageK: 8,
  dixonColesRho: 0,
  homeAdvantageStrength: 0.5,
  homeAdvantage: Object.freeze({
    globalRatio: 1.1901992147738838,
    byCompetition: Object.freeze({ E0: 1.1372950819672132, SP1: 1.2951612903225804, D1: 1.196319018404908, I1: 1.1295369211514392, F1: 1.2187254130605822 }),
  }),
  lambdaBounds: Object.freeze({ minimum: 0.2, maximum: 4.5 }),
  calibrators: Object.freeze({
    over_0_5: Object.freeze({ kind: "platt", a: 0.4252335820213103, b: 1.4959045937911497 }),
    over_1_5: Object.freeze({ kind: "platt", a: 0.7060590604567208, b: 0.3799993619637429 }),
    over_2_5: Object.freeze({ kind: "platt", a: 0.7352303534983319, b: 0.015348753241195353 }),
    under_1_5: Object.freeze({ kind: "platt", a: 0.7060590604567206, b: -0.37999936196374295 }),
    under_2_5: Object.freeze({ kind: "platt", a: 0.7352303534983321, b: -0.015348753241195182 }),
    btts: Object.freeze({ kind: "platt", a: 0.505647019522825, b: 0.056628466557007526 }),
    home: Object.freeze({ kind: "platt", a: 1.531466365790306, b: -0.042614613474123625 }),
    draw: Object.freeze({ kind: "platt", a: 0.8993094206301048, b: -0.08172014236337355 }),
    away: Object.freeze({ kind: "platt", a: 1.3727911275960085, b: 0.43171899030585853 }),
  }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function competitionKey(snapshot) {
  return String(snapshot?.event?.league?.id ?? snapshot?.event?.league?.name ?? snapshot?.competition ?? "global");
}

function shrink(value, target, sampleSize, strength) {
  if (!Number.isFinite(target) || !Number.isFinite(strength) || strength <= 0) return value;
  const alpha = Math.max(0, sampleSize) / (Math.max(0, sampleSize) + strength);
  return alpha * value + (1 - alpha) * target;
}

export function applyDixonColesCorrection(scoreMatrix, lambdaHome, lambdaAway, rho) {
  if (!Number.isFinite(rho) || rho === 0) return scoreMatrix;
  const factors = new Map([
    ["0:0", 1 - lambdaHome * lambdaAway * rho],
    ["0:1", 1 + lambdaHome * rho],
    ["1:0", 1 + lambdaAway * rho],
    ["1:1", 1 - rho],
  ]);
  const matrix = scoreMatrix.matrix.map((row) => row.map((cell) => ({
    ...cell,
    probability: cell.probability * Math.max(0.001, factors.get(`${cell.homeGoals}:${cell.awayGoals}`) ?? 1),
  })));
  const mass = matrix.flat().reduce((sum, cell) => sum + cell.probability, 0);
  return { ...scoreMatrix, matrix: matrix.map((row) => row.map((cell) => ({ ...cell, probability: cell.probability / mass }))) };
}

export function estimateExpectedGoalsV2(snapshot, config = FOOTBALL_POISSON_V2_CONFIG) {
  const base = estimateExpectedGoals(snapshot, config.baseModelConfig || FOOTBALL_POISSON_V1_CONFIG);
  if (base.kind !== "estimate") return base;
  const sampleSize = Math.min(base.metrics?.recent?.home?.selectedSampleSize || 0, base.metrics?.recent?.away?.selectedSampleSize || 0);
  const leagueHome = Number(snapshot?.leagueAverages?.homeGoals);
  const leagueAway = Number(snapshot?.leagueAverages?.awayGoals);
  const shrunkenHome = shrink(base.expectedGoals.home, leagueHome, sampleSize, config.shrinkageK);
  const shrunkenAway = shrink(base.expectedGoals.away, leagueAway, sampleSize, config.shrinkageK);
  const key = competitionKey(snapshot);
  const ratio = Number(config.homeAdvantage?.byCompetition?.[key] ?? config.homeAdvantage?.globalRatio ?? 1);
  const multiplier = Number.isFinite(ratio) && ratio > 0 ? ratio ** (Number(config.homeAdvantageStrength || 0) / 2) : 1;
  const minimum = Number(config.lambdaBounds?.minimum ?? 0.2);
  const maximum = Number(config.lambdaBounds?.maximum ?? 4.5);
  return {
    ...base,
    expectedGoals: {
      home: clamp(shrunkenHome * multiplier, minimum, maximum),
      away: clamp(shrunkenAway / multiplier, minimum, maximum),
    },
    v2Adjustments: {
      shrinkageK: config.shrinkageK,
      sampleSize,
      leagueTargets: { home: leagueHome, away: leagueAway },
      homeAdvantageRatio: ratio,
      homeAdvantageStrength: config.homeAdvantageStrength,
      lambdaBounds: { minimum, maximum },
    },
  };
}

export function runFootballPoissonV2(snapshot, config = FOOTBALL_POISSON_V2_CONFIG) {
  const estimate = estimateExpectedGoalsV2(snapshot, config);
  if (estimate.kind !== "estimate") return { modelVersion: FOOTBALL_POISSON_V2, ...estimate };
  let scoreMatrix = buildScoreMatrix(estimate.expectedGoals.home, estimate.expectedGoals.away);
  scoreMatrix = applyDixonColesCorrection(scoreMatrix, estimate.expectedGoals.home, estimate.expectedGoals.away, Number(config.dixonColesRho || 0));
  const rawProbabilities = probabilitiesFromMatrix(scoreMatrix);
  return {
    modelVersion: FOOTBALL_POISSON_V2,
    ...estimate,
    kind: "prediction",
    probabilities: applyMarketCalibrators(rawProbabilities, config.calibrators),
    uncalibratedProbabilities: rawProbabilities,
    matrix: {
      homeMaxGoals: scoreMatrix.homeDistribution.maxGoals,
      awayMaxGoals: scoreMatrix.awayDistribution.maxGoals,
      omittedMass: scoreMatrix.omittedMass,
      dixonColesRho: Number(config.dixonColesRho || 0),
    },
  };
}
