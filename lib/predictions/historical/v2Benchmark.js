export const V2_MARKET_STATUS = Object.freeze({
  supported: "SUPPORTED_V2",
  weak: "WEAK_V2",
  notRecommended: "NOT_RECOMMENDED_V2",
});

function valid(metric) {
  return metric?.n >= 50 && Number.isFinite(metric.brier) && Number.isFinite(metric.logLoss);
}

function beats(left, right) {
  return valid(left) && valid(right) && left.brier < right.brier && left.logLoss < right.logLoss;
}

function loses(left, right) {
  return valid(left) && valid(right) && left.brier > right.brier && left.logLoss > right.logLoss;
}

function segment(label, v2, v1, globalBaseline, recentBaseline) {
  if (![v2, v1, globalBaseline, recentBaseline].every(valid)) return null;
  return {
    label,
    n: v2.n,
    beatsBothBaselines: beats(v2, globalBaseline) && beats(v2, recentBaseline),
    losesBothBaselines: loses(v2, globalBaseline) && loses(v2, recentBaseline),
    brierDeltaV1: v2.brier - v1.brier,
    logLossDeltaV1: v2.logLoss - v1.logLoss,
    brierDeltaGlobal: v2.brier - globalBaseline.brier,
    brierDeltaRecent: v2.brier - recentBaseline.brier,
    logLossDeltaGlobal: v2.logLoss - globalBaseline.logLoss,
    logLossDeltaRecent: v2.logLoss - recentBaseline.logLoss,
    calibrationErrorDeltaV1: Number.isFinite(v2.calibrationError) && Number.isFinite(v1.calibrationError) ? v2.calibrationError - v1.calibrationError : null,
  };
}

export function classifyV2Markets(foldResults, markets = ["over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts", "one_x_two"]) {
  return Object.fromEntries(markets.map((market) => {
    const segments = [];
    for (const fold of foldResults) {
      const global = segment(
        `${fold.name}:global`,
        fold.v2.metrics[market],
        fold.v1.metrics[market],
        fold.v2.baselines.globalFrequency[market],
        fold.v2.baselines.recentForm[market],
      );
      if (global) segments.push(global);
      for (const competition of Object.keys(fold.v2.byCompetition || {})) {
        const competitionSegment = segment(
          `${fold.name}:${competition}`,
          fold.v2.byCompetition[competition]?.[market],
          fold.v1.byCompetition[competition]?.[market],
          fold.v2.baselines.globalByCompetition?.[competition]?.[market],
          fold.v2.baselines.recentByCompetition?.[competition]?.[market],
        );
        if (competitionSegment) segments.push(competitionSegment);
      }
    }
    const finalFold = foldResults.find((fold) => fold.finalHoldout) || foldResults.at(-1);
    const final = segments.find((item) => item.label === `${finalFold.name}:global`);
    const wins = segments.filter((item) => item.beatsBothBaselines).length;
    const losses = segments.filter((item) => item.losesBothBaselines).length;
    const winRate = segments.length ? wins / segments.length : 0;
    const lossRate = segments.length ? losses / segments.length : 0;
    const v1Degradation = final && final.brierDeltaV1 > 0.005 && final.logLossDeltaV1 > 0.005;
    const calibrationStable = final?.calibrationErrorDeltaV1 == null || final.calibrationErrorDeltaV1 <= 0.01;
    const lowPredictiveValue = market === "over_0_5" && final?.brierDeltaGlobal > -0.001;
    let status = V2_MARKET_STATUS.weak;
    if (final?.beatsBothBaselines && !v1Degradation && calibrationStable && winRate >= 0.6 && !lowPredictiveValue) status = V2_MARKET_STATUS.supported;
    else if ((final?.losesBothBaselines && lossRate >= 0.6) || (v1Degradation && lossRate >= 0.5)) status = V2_MARKET_STATUS.notRecommended;
    return [market, {
      status,
      evaluatedSegments: segments.length,
      winsAgainstBothBaselines: wins,
      lossesAgainstBothBaselines: losses,
      winRate,
      lossRate,
      finalHoldout: final,
      rule: "SUPPORTED_V2: holdout supera ambos baselines, no degrada V1 >0.005, calibración estable y gana >=60% de segmentos. NOT_RECOMMENDED_V2: pierde consistentemente o degrada V1; resto WEAK_V2.",
      lowPredictiveValueWarning: lowPredictiveValue,
      segments,
    }];
  }));
}

export function decideV2Promotion(classification) {
  const values = Object.values(classification);
  const supported = values.filter((item) => item.status === V2_MARKET_STATUS.supported).length;
  const notRecommended = values.filter((item) => item.status === V2_MARKET_STATUS.notRecommended).length;
  const oneXTwo = classification.one_x_two?.finalHoldout;
  if (oneXTwo?.brierDeltaV1 > 0.005 && oneXTwo?.logLossDeltaV1 > 0.005) return "KEEP_V1";
  if (supported >= 4 && notRecommended === 0) return "PROMOTE_V2";
  if (notRecommended >= 3 || supported === 0) return "NEEDS_ML";
  return "KEEP_V1";
}
