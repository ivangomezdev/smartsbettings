import { normalizeSearchText } from "./markets.js";
import { poissonDistribution } from "./poisson.js";

export const FOOTBALL_CORNERS_POISSON_V1 = "football-corners-poisson-v1";
export const FOOTBALL_CARDS_POISSON_V1 = "football-cards-poisson-v1";
export const FOOTBALL_COUNT_POISSON_V1_CONFIG_FINGERPRINT = "fa6494023dfcafae31e2f404b4ecca834ab8b57333d9218a936b165aca70347b";
export const FOOTBALL_COUNT_POISSON_V1_DATASET_VERSION = "efc5022317a40ea12bf18fd88be99a375b7d7cb0bb6e7fcbadb0344d5fe6d2d9";

const HISTORICAL_PRIORS = Object.freeze({
  global: Object.freeze({ corners: 9.751312116136237, cards: 4.339810161920715, sampleSize: 8955 }),
  E0: Object.freeze({ corners: 10.452631578947368, cards: 3.591578947368421, sampleSize: 1900 }),
  SP1: Object.freeze({ corners: 9.259473684210526, cards: 5.152105263157894, sampleSize: 1900 }),
  D1: Object.freeze({ corners: 9.709803921568627, cards: 4.022222222222222, sampleSize: 1530 }),
  I1: Object.freeze({ corners: 9.783157894736842, cards: 4.808947368421053, sampleSize: 1900 }),
  F1: Object.freeze({ corners: 9.52231884057971, cards: 4.034202898550725, sampleSize: 1725 }),
});

const COMPETITION_ALIASES = Object.freeze({
  "39": "E0", "4328": "E0", "english premier league": "E0", "premier league": "E0",
  "140": "SP1", "4335": "SP1", "spanish la liga": "SP1", "la liga": "SP1",
  "78": "D1", "4331": "D1", "german bundesliga": "D1", bundesliga: "D1",
  "135": "I1", "4332": "I1", "italian serie a": "I1", "serie a": "I1",
  "61": "F1", "4334": "F1", "french ligue 1": "F1", "ligue 1": "F1",
});

export const FOOTBALL_COUNT_POISSON_V1_CONFIG = Object.freeze({
  version: "football-count-poisson-config-v1",
  recentLimitPerTeam: 6,
  minimumRecentMatchesPerTeam: 1,
  shrinkageK: 6,
  maximumCorners: 40,
  maximumCards: 30,
  historicalDatasetVersion: FOOTBALL_COUNT_POISSON_V1_DATASET_VERSION,
  historicalPriors: HISTORICAL_PRIORS,
});

function finiteCount(value, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function beforeFixture(item, fixtureDate) {
  const observedAt = Date.parse(item?.fixture?.date || "");
  const startsAt = Date.parse(fixtureDate || "");
  return Number.isFinite(observedAt) && Number.isFinite(startsAt) && observedAt < startsAt;
}

function blockValue(block, statistic, config) {
  if (statistic === "corners") return finiteCount(block?.values?.corners, config.maximumCorners);
  const yellow = finiteCount(block?.values?.yellowCards, config.maximumCards);
  if (yellow === null) return null;
  const red = finiteCount(block?.values?.redCards, config.maximumCards);
  return yellow + (red || 0);
}

function totalForFixture(item, statistic, config) {
  const blocks = item?.teams || [];
  if (blocks.length < 2) return null;
  const values = blocks.map((block) => blockValue(block, statistic, config));
  return values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null;
}

function sampleForTeam(snapshot, teamId, statistic, config) {
  const fixtureDate = snapshot?.event?.date;
  const seen = new Set();
  return (snapshot?.matchStatistics || [])
    .filter((item) => beforeFixture(item, fixtureDate))
    .filter((item) => (item.teams || []).some((block) => sameId(block?.team?.id, teamId)))
    .sort((left, right) => Date.parse(right.fixture.date) - Date.parse(left.fixture.date))
    .flatMap((item) => {
      const fixtureId = String(item?.fixture?.fixtureId ?? item?.fixture?.id ?? item?.fixture?.date ?? "");
      if (seen.has(fixtureId)) return [];
      seen.add(fixtureId);
      const total = totalForFixture(item, statistic, config);
      return total === null ? [] : [{ fixtureId, date: item.fixture.date, total }];
    })
    .slice(0, config.recentLimitPerTeam);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function variance(values) {
  if (values.length < 2) return null;
  const mean = average(values);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function competitionPrior(snapshot, statistic, config) {
  const candidates = [snapshot?.event?.league?.id, snapshot?.event?.league?.name, snapshot?.competition]
    .filter((value) => value != null)
    .map((value) => normalizeSearchText(value).trim());
  const key = candidates.map((value) => COMPETITION_ALIASES[value]).find(Boolean) || "global";
  const row = config.historicalPriors[key] || config.historicalPriors.global;
  return { competition: key, mean: row[statistic], sampleSize: row.sampleSize };
}

function countProbabilities(lambda, statistic, config) {
  const distribution = poissonDistribution(lambda, {
    minGoals: statistic === "corners" ? 20 : 12,
    maxGoals: statistic === "corners" ? config.maximumCorners : config.maximumCards,
  });
  const lines = statistic === "corners" ? [8.5, 9.5, 10.5] : [3.5, 4.5, 5.5];
  const probabilities = { mass: distribution.cumulative };
  for (const line of lines) {
    const suffix = String(line).replace(".", "_");
    const over = distribution.probabilities.reduce((sum, probability, count) => count > line ? sum + probability : sum, 0) / distribution.cumulative;
    probabilities[`${statistic}_over_${suffix}`] = over;
    probabilities[`${statistic}_under_${suffix}`] = 1 - over;
  }
  return { probabilities, distribution };
}

export function runFootballCountPoissonV1(snapshot, statistic, config = FOOTBALL_COUNT_POISSON_V1_CONFIG) {
  if (!["corners", "cards"].includes(statistic)) throw new RangeError(`Estadística de conteo no soportada: ${statistic}`);
  const home = sampleForTeam(snapshot, snapshot?.homeTeam?.id || snapshot?.event?.homeTeam?.id, statistic, config);
  const away = sampleForTeam(snapshot, snapshot?.awayTeam?.id || snapshot?.event?.awayTeam?.id, statistic, config);
  const modelVersion = statistic === "corners" ? FOOTBALL_CORNERS_POISSON_V1 : FOOTBALL_CARDS_POISSON_V1;
  if (home.length < config.minimumRecentMatchesPerTeam || away.length < config.minimumRecentMatchesPerTeam) {
    return {
      modelVersion,
      modelFamily: "count_totals",
      statistic,
      kind: "insufficient_data",
      code: "INSUFFICIENT_COUNT_DATA",
      reasons: [`Se requiere al menos ${config.minimumRecentMatchesPerTeam} partido con ${statistic} por equipo antes del fixture.`],
      metrics: { recent: { home: { sampleSize: home.length }, away: { sampleSize: away.length } } },
    };
  }

  const homeValues = home.map((item) => item.total);
  const awayValues = away.map((item) => item.total);
  const recentMean = average([average(homeValues), average(awayValues)]);
  const prior = competitionPrior(snapshot, statistic, config);
  const effectiveSample = Math.min(home.length, away.length);
  const recentWeight = effectiveSample / (effectiveSample + config.shrinkageK);
  const lambda = recentWeight * recentMean + (1 - recentWeight) * prior.mean;
  const count = countProbabilities(lambda, statistic, config);

  return {
    modelVersion,
    modelFamily: "count_totals",
    statistic,
    kind: "prediction",
    probabilities: count.probabilities,
    expectedCounts: { statistic, total: lambda },
    expectedGoals: null,
    sources: {
      recentStatistics: { mean: recentMean, weight: recentWeight },
      historicalPrior: { ...prior, weight: 1 - recentWeight, datasetVersion: config.historicalDatasetVersion },
    },
    weights: { recent: recentWeight, historicalPrior: 1 - recentWeight },
    metrics: {
      recent: {
        home: { sampleSize: home.length, average: average(homeValues), variance: variance(homeValues), matches: home },
        away: { sampleSize: away.length, average: average(awayValues), variance: variance(awayValues), matches: away },
      },
      distribution: { lambda, maxCount: count.distribution.maxGoals, omittedMass: count.distribution.tail },
    },
    matrix: null,
  };
}

export function runFootballCornersPoissonV1(snapshot, config = FOOTBALL_COUNT_POISSON_V1_CONFIG) {
  return runFootballCountPoissonV1(snapshot, "corners", config);
}

export function runFootballCardsPoissonV1(snapshot, config = FOOTBALL_COUNT_POISSON_V1_CONFIG) {
  return runFootballCountPoissonV1(snapshot, "cards", config);
}
