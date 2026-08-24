const EPSILON = 1e-6;
const BINARY_MARKETS = Object.freeze(["over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts"]);
const OUTCOME_MARKETS = Object.freeze(["home", "draw", "away"]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function logit(probability) {
  const clipped = clamp(probability, EPSILON, 1 - EPSILON);
  return Math.log(clipped / (1 - clipped));
}

export const IDENTITY_CALIBRATOR = Object.freeze({ kind: "identity", a: 1, b: 0, sampleSize: 0 });

export function fitPlattCalibrator(rows, { minimumSamples = 50, l2 = 1e-3, maximumIterations = 100 } = {}) {
  const valid = rows
    .map((row) => ({ probability: Number(row.probability), actual: Number(row.actual) }))
    .filter((row) => Number.isFinite(row.probability) && row.probability >= 0 && row.probability <= 1 && (row.actual === 0 || row.actual === 1));
  const positives = valid.reduce((sum, row) => sum + row.actual, 0);
  if (valid.length < minimumSamples || positives === 0 || positives === valid.length) {
    return { ...IDENTITY_CALIBRATOR, sampleSize: valid.length, positiveRate: valid.length ? positives / valid.length : null, reason: "INSUFFICIENT_CALIBRATION_SAMPLE" };
  }

  let a = 1;
  let b = 0;
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    let gradientA = l2 * (a - 1);
    let gradientB = l2 * b;
    let hessianAA = l2;
    let hessianAB = 0;
    let hessianBB = l2;
    for (const row of valid) {
      const x = logit(row.probability);
      const fitted = sigmoid(a * x + b);
      const residual = fitted - row.actual;
      const weight = Math.max(EPSILON, fitted * (1 - fitted));
      gradientA += residual * x;
      gradientB += residual;
      hessianAA += weight * x * x;
      hessianAB += weight * x;
      hessianBB += weight;
    }
    const determinant = hessianAA * hessianBB - hessianAB * hessianAB;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) break;
    const deltaA = (hessianBB * gradientA - hessianAB * gradientB) / determinant;
    const deltaB = (-hessianAB * gradientA + hessianAA * gradientB) / determinant;
    a = clamp(a - deltaA, -20, 20);
    b = clamp(b - deltaB, -20, 20);
    if (Math.max(Math.abs(deltaA), Math.abs(deltaB)) < 1e-8) break;
  }

  return { kind: "platt", a, b, sampleSize: valid.length, positiveRate: positives / valid.length };
}

export function applyCalibrator(probability, calibrator = IDENTITY_CALIBRATOR) {
  const value = clamp(Number(probability), 0, 1);
  if (calibrator?.kind !== "platt") return value;
  return clamp(sigmoid(Number(calibrator.a) * logit(value) + Number(calibrator.b)), 0, 1);
}

export function fitMarketCalibrators(rows, options = {}) {
  const targetKey = (market) => ({ home: "home_win", away: "away_win" })[market] || market;
  const fit = (market) => fitPlattCalibrator(rows.map((row) => ({ probability: row.probabilities?.[market], actual: row.targets?.[targetKey(market)] })), options);
  return Object.fromEntries([...BINARY_MARKETS, ...OUTCOME_MARKETS].map((market) => [market, fit(market)]));
}

function normalizedPair(first, second) {
  const total = first + second;
  return total > 0 ? [first / total, second / total] : [0.5, 0.5];
}

export function applyMarketCalibrators(probabilities, calibrators = {}) {
  const result = { ...probabilities };
  [result.over_1_5, result.under_1_5] = normalizedPair(
    applyCalibrator(probabilities.over_1_5, calibrators.over_1_5),
    applyCalibrator(probabilities.under_1_5, calibrators.under_1_5),
  );
  [result.over_2_5, result.under_2_5] = normalizedPair(
    applyCalibrator(probabilities.over_2_5, calibrators.over_2_5),
    applyCalibrator(probabilities.under_2_5, calibrators.under_2_5),
  );
  result.over_0_5 = applyCalibrator(probabilities.over_0_5, calibrators.over_0_5);
  result.btts = applyCalibrator(probabilities.btts, calibrators.btts);
  result.btts_no = 1 - result.btts;
  const outcomes = OUTCOME_MARKETS.map((market) => applyCalibrator(probabilities[market], calibrators[market]));
  const outcomeTotal = outcomes.reduce((sum, probability) => sum + probability, 0);
  OUTCOME_MARKETS.forEach((market, index) => {
    result[market] = outcomeTotal > 0 ? outcomes[index] / outcomeTotal : 1 / 3;
  });
  result.double_chance_1x = result.home + result.draw;
  result.double_chance_x2 = result.draw + result.away;
  result.double_chance_12 = result.home + result.away;
  const decisiveMass = result.home + result.away;
  result.draw_no_bet_home = decisiveMass > 0 ? result.home / decisiveMass : 0.5;
  result.draw_no_bet_away = decisiveMass > 0 ? result.away / decisiveMass : 0.5;
  result.mass = 1;
  return result;
}
