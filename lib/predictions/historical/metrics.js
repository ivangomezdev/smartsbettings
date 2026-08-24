const EPSILON = 1e-15;

function probability(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("La probabilidad debe estar entre 0 y 1.");
  return value;
}

function actual(value) {
  if (value !== 0 && value !== 1) throw new RangeError("El resultado binario debe ser 0 o 1.");
  return value;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function brierScore(rows) {
  return mean(rows.map((row) => (probability(row.probability) - actual(row.actual)) ** 2));
}

export function binaryLogLoss(rows) {
  return mean(rows.map((row) => {
    const predicted = Math.min(1 - EPSILON, Math.max(EPSILON, probability(row.probability)));
    const observed = actual(row.actual);
    return -(observed * Math.log(predicted) + (1 - observed) * Math.log(1 - predicted));
  }));
}

export function binaryAccuracy(rows, threshold = 0.5) {
  return mean(rows.map((row) => Number(Number(row.probability >= threshold) === actual(row.actual))));
}

export function calibrationBins(rows, binCount = 10) {
  if (!Number.isInteger(binCount) || binCount <= 0) throw new RangeError("binCount debe ser positivo.");
  const buckets = Array.from({ length: binCount }, (_, index) => ({
    binStart: index / binCount,
    binEnd: (index + 1) / binCount,
    rows: [],
  }));
  for (const row of rows) {
    const predicted = probability(row.probability);
    buckets[Math.min(binCount - 1, Math.floor(predicted * binCount))].rows.push({ probability: predicted, actual: actual(row.actual) });
  }
  return buckets.map((bucket) => {
    const meanProbability = mean(bucket.rows.map((row) => row.probability));
    const observedFrequency = mean(bucket.rows.map((row) => row.actual));
    return {
      binStart: bucket.binStart,
      binEnd: bucket.binEnd,
      count: bucket.rows.length,
      meanProbability,
      observedFrequency,
      difference: meanProbability === null ? null : observedFrequency - meanProbability,
    };
  });
}

export function expectedCalibrationError(rows, binCount = 10) {
  if (!rows.length) return null;
  return calibrationBins(rows, binCount).reduce((sum, bin) => (
    sum + (bin.count / rows.length) * Math.abs(bin.difference || 0)
  ), 0);
}

function validateMulticlass(row) {
  if (!Array.isArray(row.probabilities) || !row.probabilities.length) throw new TypeError("Se requiere un vector de probabilidades.");
  const sum = row.probabilities.reduce((total, value) => total + probability(value), 0);
  if (Math.abs(sum - 1) > 1e-9) throw new RangeError("Las probabilidades multiclase deben sumar 1.");
  if (!Number.isInteger(row.actualIndex) || row.actualIndex < 0 || row.actualIndex >= row.probabilities.length) throw new RangeError("Clase real inválida.");
}

export function multiclassBrierScore(rows) {
  return mean(rows.map((row) => {
    validateMulticlass(row);
    return row.probabilities.reduce((sum, predicted, index) => sum + (predicted - Number(index === row.actualIndex)) ** 2, 0);
  }));
}

export function multiclassLogLoss(rows) {
  return mean(rows.map((row) => {
    validateMulticlass(row);
    return -Math.log(Math.min(1 - EPSILON, Math.max(EPSILON, row.probabilities[row.actualIndex])));
  }));
}

export function multiclassAccuracy(rows) {
  return mean(rows.map((row) => {
    validateMulticlass(row);
    const predictedIndex = row.probabilities.indexOf(Math.max(...row.probabilities));
    return Number(predictedIndex === row.actualIndex);
  }));
}

export function impliedProbability(odds) {
  return Number.isFinite(odds) && odds > 1 ? 1 / odds : null;
}

export function normalizeOverround(odds) {
  if (!Array.isArray(odds) || !odds.length) return null;
  const implied = odds.map(impliedProbability);
  if (implied.some((value) => value === null)) return null;
  const overround = implied.reduce((sum, value) => sum + value, 0);
  if (!(overround > 0)) return null;
  return { overround, probabilities: implied.map((value) => value / overround) };
}

export function binaryMetricSummary(rows) {
  return {
    n: rows.length,
    brier: brierScore(rows),
    logLoss: binaryLogLoss(rows),
    accuracy: binaryAccuracy(rows),
    calibrationError: expectedCalibrationError(rows),
    calibrationBins: calibrationBins(rows),
  };
}

export function multiclassMetricSummary(rows) {
  return {
    n: rows.length,
    brier: multiclassBrierScore(rows),
    logLoss: multiclassLogLoss(rows),
    accuracy: multiclassAccuracy(rows),
  };
}
