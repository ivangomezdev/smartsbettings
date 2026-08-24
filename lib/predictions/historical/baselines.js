const binaryMarkets = ["over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts"];

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export function fitGlobalFrequencyBaseline(records) {
  const probabilities = Object.fromEntries(binaryMarkets.map((market) => [market, mean(records.map((record) => record.targets[market]))]));
  probabilities.one_x_two = [
    mean(records.map((record) => record.targets.home_win)),
    mean(records.map((record) => record.targets.draw)),
    mean(records.map((record) => record.targets.away_win)),
  ];
  return { name: "global-frequency", probabilities };
}

export function recentFormBaseline(record, market) {
  const features = record.features;
  if (market === "one_x_two") {
    const homePoints = features.home_recent_points_last_5;
    const awayPoints = features.away_recent_points_last_5;
    if (!Number.isFinite(homePoints) || !Number.isFinite(awayPoints)) return null;
    const raw = [homePoints + 1, 4, awayPoints + 1];
    const total = raw.reduce((sum, value) => sum + value, 0);
    return raw.map((value) => value / total);
  }
  const sourceMarket = market.startsWith("under_") ? market.replace("under", "over") : market;
  const home = features[`home_${sourceMarket}_rate_last_10`];
  const away = features[`away_${sourceMarket}_rate_last_10`];
  const predicted = mean([home, away]);
  if (predicted === null) return null;
  return market.startsWith("under_") ? 1 - predicted : predicted;
}

export function globalBaselinePrediction(baseline, market) {
  return baseline.probabilities[market] ?? null;
}
