export const V1_STABILITY_MARKETS = Object.freeze(["over_1_5", "over_2_5", "btts", "one_x_two"]);

export const V1_MARKET_STATUS = Object.freeze({
  supported: "SUPPORTED_V1",
  weak: "WEAK_V1",
  notRecommended: "NOT_RECOMMENDED_V1",
});

function hasMetrics(metric) {
  return metric?.n >= 50 && Number.isFinite(metric.brier) && Number.isFinite(metric.logLoss);
}

function beats(model, baseline) {
  return hasMetrics(model) && hasMetrics(baseline) && model.brier < baseline.brier && model.logLoss < baseline.logLoss;
}

function loses(model, baseline) {
  return hasMetrics(model) && hasMetrics(baseline) && model.brier > baseline.brier && model.logLoss > baseline.logLoss;
}

function segment(label, model, globalBaseline, recentBaseline) {
  if (![model, globalBaseline, recentBaseline].every(hasMetrics)) return null;
  return {
    label,
    n: model.n,
    beatsBoth: beats(model, globalBaseline) && beats(model, recentBaseline),
    losesBoth: loses(model, globalBaseline) && loses(model, recentBaseline),
    brierDeltaGlobal: model.brier - globalBaseline.brier,
    brierDeltaRecent: model.brier - recentBaseline.brier,
    logLossDeltaGlobal: model.logLoss - globalBaseline.logLoss,
    logLossDeltaRecent: model.logLoss - recentBaseline.logLoss,
  };
}

export function classifyV1Markets({ globalReport, leagueReports }) {
  return Object.fromEntries(V1_STABILITY_MARKETS.map((market) => {
    const segments = [];
    const overall = segment(
      "global",
      globalReport.metrics[market],
      globalReport.baselines.globalFrequency[market],
      globalReport.baselines.recentForm[market],
    );
    if (overall) segments.push(overall);
    for (const [competition, report] of Object.entries(leagueReports)) {
      const league = segment(
        `competition:${competition}`,
        report.metrics[market],
        report.baselines.globalFrequency[market],
        report.baselines.recentForm[market],
      );
      if (league) segments.push(league);
      for (const [season, metrics] of Object.entries(report.bySeason || {})) {
        const seasonSegment = segment(
          `competition:${competition}:season:${season}`,
          metrics[market],
          report.baselines.globalBySeason?.[season]?.[market],
          report.baselines.recentBySeason?.[season]?.[market],
        );
        if (seasonSegment) segments.push(seasonSegment);
      }
    }
    const wins = segments.filter((item) => item.beatsBoth).length;
    const losses = segments.filter((item) => item.losesBoth).length;
    const winRate = segments.length ? wins / segments.length : 0;
    const lossRate = segments.length ? losses / segments.length : 0;
    let status = V1_MARKET_STATUS.weak;
    if (overall?.beatsBoth && winRate >= 0.6 && lossRate <= 0.25) status = V1_MARKET_STATUS.supported;
    else if (overall?.losesBoth && lossRate >= 0.6) status = V1_MARKET_STATUS.notRecommended;
    return [market, {
      status,
      evaluatedSegments: segments.length,
      winsAgainstBoth: wins,
      lossesAgainstBoth: losses,
      winRate,
      lossRate,
      rule: "SUPPORTED si el global supera ambos baselines y >=60% de segmentos también; NOT_RECOMMENDED si el global pierde contra ambos y >=60% de segmentos también; resto WEAK.",
      segments,
    }];
  }));
}
