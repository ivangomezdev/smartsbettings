import { buildScoreMatrix, probabilitiesFromMatrix } from "./poisson.js";

export const FOOTBALL_POISSON_V1 = "football-poisson-v1";
export const FOOTBALL_POISSON_V1_CONFIG = Object.freeze({
  weights: Object.freeze({ season: 0.45, recent: 0.35, xg: 0.10, h2h: 0.10 }),
  recentLimit: 10,
  minimumRecentMatches: 3,
  minimumVenueMatches: 3,
  minimumXgMatches: 3,
  h2hLimit: 5,
  minimumH2hMatches: 3,
  maximumObservedGoals: 20,
  maximumObservedXg: 10,
});

function finiteInRange(value, minimum, maximum) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function beforeFixture(date, fixtureDate) {
  const observedAt = Date.parse(date || "");
  const startsAt = Date.parse(fixtureDate || "");
  return Number.isFinite(observedAt) && Number.isFinite(startsAt) && observedAt < startsAt;
}

function validRecentMatches(form, fixtureDate, config) {
  return (form?.matches || [])
    .filter((match) => beforeFixture(match.date, fixtureDate))
    .filter((match) => {
      const scored = finiteInRange(match?.result?.goalsFor, 0, config.maximumObservedGoals);
      const conceded = finiteInRange(match?.result?.goalsAgainst, 0, config.maximumObservedGoals);
      return scored !== null && conceded !== null;
    })
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .slice(0, config.recentLimit);
}

function recentMetrics(matches, preferredVenue, config) {
  const venueMatches = matches.filter((match) => match?.result?.venue === preferredVenue);
  const selected = venueMatches.length >= config.minimumVenueMatches ? venueMatches : matches;
  const goalsFor = selected.map((match) => finiteInRange(match.result.goalsFor, 0, config.maximumObservedGoals));
  const goalsAgainst = selected.map((match) => finiteInRange(match.result.goalsAgainst, 0, config.maximumObservedGoals));
  const frequencies = (sample) => ({
    over_0_5: sample.filter((match) => match.result.goalsFor + match.result.goalsAgainst > 0.5).length / sample.length,
    over_1_5: sample.filter((match) => match.result.goalsFor + match.result.goalsAgainst > 1.5).length / sample.length,
    over_2_5: sample.filter((match) => match.result.goalsFor + match.result.goalsAgainst > 2.5).length / sample.length,
    btts: sample.filter((match) => match.result.goalsFor > 0 && match.result.goalsAgainst > 0).length / sample.length,
  });

  return {
    sampleSize: matches.length,
    selectedSampleSize: selected.length,
    venueSampleSize: venueMatches.length,
    usedVenueSplit: selected === venueMatches,
    goalsFor: average(goalsFor),
    goalsAgainst: average(goalsAgainst),
    frequencies: frequencies(matches),
  };
}

function valueAt(object, path) {
  let current = object;
  for (const key of path) current = current?.[key];
  return finiteInRange(current, 0, 20);
}

function seasonEstimate(snapshot, fixtureDate) {
  const home = snapshot.seasonStatistics?.home;
  const away = snapshot.seasonStatistics?.away;
  const fixtureDay = String(fixtureDate || "").slice(0, 10);
  if ((home?.asOf && home.asOf > fixtureDay) || (away?.asOf && away.asOf > fixtureDay)) return null;
  const homeFor = valueAt(home, ["goals", "for", "average", "home"]);
  const homeAgainst = valueAt(home, ["goals", "against", "average", "home"]);
  const awayFor = valueAt(away, ["goals", "for", "average", "away"]);
  const awayAgainst = valueAt(away, ["goals", "against", "average", "away"]);
  const leagueHome = finiteInRange(snapshot.leagueAverages?.homeGoals, 0.01, 20);
  const leagueAway = finiteInRange(snapshot.leagueAverages?.awayGoals, 0.01, 20);

  let lambdaHome;
  let lambdaAway;
  let normalizedByLeague = false;
  if (leagueHome !== null && leagueAway !== null && [homeFor, homeAgainst, awayFor, awayAgainst].every((value) => value !== null)) {
    lambdaHome = leagueHome * average([homeFor / leagueHome, awayAgainst / leagueHome]);
    lambdaAway = leagueAway * average([awayFor / leagueAway, homeAgainst / leagueAway]);
    normalizedByLeague = true;
  } else {
    lambdaHome = average([homeFor, awayAgainst]);
    lambdaAway = average([awayFor, homeAgainst]);
  }

  return lambdaHome === null || lambdaAway === null
    ? null
    : { lambdaHome, lambdaAway, normalizedByLeague, inputs: { homeFor, homeAgainst, awayFor, awayAgainst } };
}

function recentEstimate(homeMetrics, awayMetrics) {
  const lambdaHome = average([homeMetrics.goalsFor, awayMetrics.goalsAgainst]);
  const lambdaAway = average([awayMetrics.goalsFor, homeMetrics.goalsAgainst]);
  return lambdaHome === null || lambdaAway === null ? null : { lambdaHome, lambdaAway };
}

function xgMetrics(snapshot, teamId, fixtureDate, config) {
  const own = [];
  const against = [];
  for (const item of snapshot.matchStatistics || []) {
    if (!beforeFixture(item?.fixture?.date, fixtureDate)) continue;
    const ownBlock = (item.teams || []).find((block) => block?.team?.id === teamId);
    if (!ownBlock) continue;
    const opponentBlock = (item.teams || []).find((block) => block?.team?.id !== teamId);
    const ownXg = finiteInRange(ownBlock?.values?.xg, 0, config.maximumObservedXg);
    const opponentXg = finiteInRange(opponentBlock?.values?.xg, 0, config.maximumObservedXg);
    if (ownXg !== null) own.push(ownXg);
    if (opponentXg !== null) against.push(opponentXg);
  }
  return { sampleSize: Math.min(own.length, against.length), xg: average(own), xga: average(against) };
}

function xgEstimate(snapshot, fixtureDate, config) {
  const home = xgMetrics(snapshot, snapshot.homeTeam?.id, fixtureDate, config);
  const away = xgMetrics(snapshot, snapshot.awayTeam?.id, fixtureDate, config);
  if (home.sampleSize < config.minimumXgMatches || away.sampleSize < config.minimumXgMatches) {
    return { estimate: null, metrics: { home, away } };
  }
  return {
    estimate: {
      lambdaHome: average([home.xg, away.xga]),
      lambdaAway: average([away.xg, home.xga]),
    },
    metrics: { home, away },
  };
}

function h2hEstimate(snapshot, fixtureDate, config) {
  const homeId = snapshot.homeTeam?.id;
  const awayId = snapshot.awayTeam?.id;
  const matches = (snapshot.h2h || [])
    .filter((match) => beforeFixture(match.date, fixtureDate))
    .filter((match) => [match.homeTeam?.id, match.awayTeam?.id].includes(homeId) && [match.homeTeam?.id, match.awayTeam?.id].includes(awayId))
    .filter((match) => finiteInRange(match.goals?.home, 0, config.maximumObservedGoals) !== null && finiteInRange(match.goals?.away, 0, config.maximumObservedGoals) !== null)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
    .slice(0, config.h2hLimit);
  if (matches.length < config.minimumH2hMatches) return { estimate: null, sampleSize: matches.length, averageTotalGoals: null };

  const homeGoals = [];
  const awayGoals = [];
  for (const match of matches) {
    const requestedHomeWasHome = match.homeTeam.id === homeId;
    homeGoals.push(requestedHomeWasHome ? match.goals.home : match.goals.away);
    awayGoals.push(requestedHomeWasHome ? match.goals.away : match.goals.home);
  }
  return {
    estimate: { lambdaHome: average(homeGoals), lambdaAway: average(awayGoals) },
    sampleSize: matches.length,
    averageTotalGoals: average(matches.map((match) => match.goals.home + match.goals.away)),
  };
}

function weightedLambda(sources, side, weights) {
  const available = Object.entries(sources).filter(([, source]) => source && Number.isFinite(source[side]));
  const totalWeight = available.reduce((sum, [name]) => sum + weights[name], 0);
  if (!totalWeight) return { value: null, weights: {} };
  const redistributed = Object.fromEntries(available.map(([name]) => [name, weights[name] / totalWeight]));
  return {
    value: available.reduce((sum, [name, source]) => sum + source[side] * redistributed[name], 0),
    weights: redistributed,
  };
}

export function estimateExpectedGoals(snapshot, config = FOOTBALL_POISSON_V1_CONFIG) {
  const fixtureDate = snapshot?.event?.date;
  const homeMatches = validRecentMatches(snapshot?.recentForm?.home, fixtureDate, config);
  const awayMatches = validRecentMatches(snapshot?.recentForm?.away, fixtureDate, config);
  if (homeMatches.length < config.minimumRecentMatches || awayMatches.length < config.minimumRecentMatches) {
    return {
      kind: "insufficient_data",
      code: "INSUFFICIENT_DATA",
      reasons: [`Se requieren al menos ${config.minimumRecentMatches} partidos recientes válidos por equipo anteriores al fixture.`],
      samples: { home: homeMatches.length, away: awayMatches.length },
    };
  }

  const recent = {
    home: recentMetrics(homeMatches, "home", config),
    away: recentMetrics(awayMatches, "away", config),
  };
  const season = seasonEstimate(snapshot, fixtureDate);
  const recentSource = recentEstimate(recent.home, recent.away);
  const xg = xgEstimate(snapshot, fixtureDate, config);
  const h2h = h2hEstimate(snapshot, fixtureDate, config);
  const sources = { season, recent: recentSource, xg: xg.estimate, h2h: h2h.estimate };
  const home = weightedLambda(sources, "lambdaHome", config.weights);
  const away = weightedLambda(sources, "lambdaAway", config.weights);
  if (![home.value, away.value].every((value) => Number.isFinite(value) && value >= 0)) {
    return { kind: "insufficient_data", code: "INSUFFICIENT_DATA", reasons: ["No fue posible construir lambdas válidos con los datos observados."] };
  }

  return {
    kind: "estimate",
    expectedGoals: { home: home.value, away: away.value },
    weights: { home: home.weights, away: away.weights },
    sources,
    metrics: { recent, xg: xg.metrics, h2h: { sampleSize: h2h.sampleSize, averageTotalGoals: h2h.averageTotalGoals } },
  };
}

export function runFootballPoissonV1(snapshot, config = FOOTBALL_POISSON_V1_CONFIG) {
  const estimate = estimateExpectedGoals(snapshot, config);
  if (estimate.kind !== "estimate") return { modelVersion: FOOTBALL_POISSON_V1, ...estimate };
  const scoreMatrix = buildScoreMatrix(estimate.expectedGoals.home, estimate.expectedGoals.away);
  return {
    modelVersion: FOOTBALL_POISSON_V1,
    ...estimate,
    kind: "prediction",
    probabilities: probabilitiesFromMatrix(scoreMatrix),
    matrix: {
      homeMaxGoals: scoreMatrix.homeDistribution.maxGoals,
      awayMaxGoals: scoreMatrix.awayDistribution.maxGoals,
      omittedMass: scoreMatrix.omittedMass,
    },
  };
}
