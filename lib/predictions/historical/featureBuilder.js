function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function rate(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : null;
}

function outcome(goalsFor, goalsAgainst) {
  return goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";
}

function perspective(match, team) {
  const home = match.homeTeamNormalized === team;
  const goalsFor = home ? match.homeGoals : match.awayGoals;
  const goalsAgainst = home ? match.awayGoals : match.homeGoals;
  return {
    match,
    date: match.matchDate,
    venue: home ? "home" : "away",
    goalsFor,
    goalsAgainst,
    points: goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0,
  };
}

function teamKey(match, team) {
  return `${match.competition}|${team}`;
}

function seasonTeamKey(match, team) {
  return `${match.competition}|${match.season}|${team}`;
}

function pairKey(match) {
  return `${match.competition}|${[match.homeTeamNormalized, match.awayTeamNormalized].sort().join("|")}`;
}

function aggregate() {
  return { count: 0, goalsFor: 0, goalsAgainst: 0 };
}

function addAggregate(target, goalsFor, goalsAgainst) {
  target.count += 1;
  target.goalsFor += goalsFor;
  target.goalsAgainst += goalsAgainst;
}

function divide(total, count) {
  return count ? total / count : null;
}

function formFeatures(rows, prefix) {
  const result = {};
  for (const window of [3, 5, 10]) {
    const selected = rows.slice(-window);
    result[`${prefix}_goals_for_last_${window}`] = average(selected.map((row) => row.goalsFor));
    result[`${prefix}_goals_against_last_${window}`] = average(selected.map((row) => row.goalsAgainst));
    result[`${prefix}_over_0_5_rate_last_${window}`] = rate(selected, (row) => row.goalsFor + row.goalsAgainst > 0.5);
    result[`${prefix}_over_1_5_rate_last_${window}`] = rate(selected, (row) => row.goalsFor + row.goalsAgainst > 1.5);
    result[`${prefix}_over_2_5_rate_last_${window}`] = rate(selected, (row) => row.goalsFor + row.goalsAgainst > 2.5);
    result[`${prefix}_btts_rate_last_${window}`] = rate(selected, (row) => row.goalsFor > 0 && row.goalsAgainst > 0);
    result[`${prefix}_recent_points_last_${window}`] = selected.length ? selected.reduce((sum, row) => sum + row.points, 0) : null;
  }
  return result;
}

function daysBetween(later, earlier) {
  if (!earlier) return null;
  return (Date.parse(later) - Date.parse(earlier)) / 86_400_000;
}

export function buildTargets(match) {
  const total = match.homeGoals + match.awayGoals;
  return {
    over_0_5: Number(total > 0.5),
    over_1_5: Number(total > 1.5),
    over_2_5: Number(total > 2.5),
    under_1_5: Number(total < 1.5),
    under_2_5: Number(total < 2.5),
    btts: Number(match.homeGoals > 0 && match.awayGoals > 0),
    home_win: Number(match.homeGoals > match.awayGoals),
    draw: Number(match.homeGoals === match.awayGoals),
    away_win: Number(match.homeGoals < match.awayGoals),
  };
}

function recentSnapshot(rows, requestedTeam) {
  return rows.slice(-10).reverse().map(({ match, venue, goalsFor, goalsAgainst }) => ({
    fixtureId: match.id || match.matchKey,
    date: match.matchDate,
    status: { short: "FT" },
    homeTeam: { id: match.homeTeamNormalized, name: match.homeTeam },
    awayTeam: { id: match.awayTeamNormalized, name: match.awayTeam },
    goals: { home: match.homeGoals, away: match.awayGoals },
    result: { venue, outcome: outcome(goalsFor, goalsAgainst), goalsFor, goalsAgainst },
    requestedTeam,
  }));
}

function statsBlock(state) {
  const home = state?.home || aggregate();
  const away = state?.away || aggregate();
  const totalCount = home.count + away.count;
  return {
    asOf: null,
    goals: {
      for: { average: { home: divide(home.goalsFor, home.count), away: divide(away.goalsFor, away.count), total: divide(home.goalsFor + away.goalsFor, totalCount) } },
      against: { average: { home: divide(home.goalsAgainst, home.count), away: divide(away.goalsAgainst, away.count), total: divide(home.goalsAgainst + away.goalsAgainst, totalCount) } },
    },
  };
}

function xgStatistics(rows) {
  return rows.slice(-10).reverse().flatMap(({ match }) => {
    if (!Number.isFinite(match.homeXg) || !Number.isFinite(match.awayXg)) return [];
    return [{
      fixture: { fixtureId: match.id || match.matchKey, date: match.matchDate },
      teams: [
        { team: { id: match.homeTeamNormalized, name: match.homeTeam }, values: { xg: match.homeXg } },
        { team: { id: match.awayTeamNormalized, name: match.awayTeam }, values: { xg: match.awayXg } },
      ],
    }];
  });
}

export function createHistoricalFeatureBuilder() {
  const histories = new Map();
  const seasonTeams = new Map();
  const leagueSeasons = new Map();
  const h2h = new Map();

  function getHistory(match, team) {
    return histories.get(teamKey(match, team)) || [];
  }

  return {
    build(match) {
      const homeHistory = getHistory(match, match.homeTeamNormalized);
      const awayHistory = getHistory(match, match.awayTeamNormalized);
      const homeSeason = seasonTeams.get(seasonTeamKey(match, match.homeTeamNormalized));
      const awaySeason = seasonTeams.get(seasonTeamKey(match, match.awayTeamNormalized));
      const league = leagueSeasons.get(`${match.competition}|${match.season}`);
      const priorH2h = h2h.get(pairKey(match)) || [];
      const homeVenue = homeSeason?.home || aggregate();
      const awayVenue = awaySeason?.away || aggregate();
      const features = {
        ...formFeatures(homeHistory, "home"),
        ...formFeatures(awayHistory, "away"),
        home_home_goals_average: divide(homeVenue.goalsFor, homeVenue.count),
        home_home_goals_against_average: divide(homeVenue.goalsAgainst, homeVenue.count),
        away_away_goals_average: divide(awayVenue.goalsFor, awayVenue.count),
        away_away_goals_against_average: divide(awayVenue.goalsAgainst, awayVenue.count),
        over_1_5_rate_last_10: average([
          rate(homeHistory.slice(-10), (row) => row.goalsFor + row.goalsAgainst > 1.5),
          rate(awayHistory.slice(-10), (row) => row.goalsFor + row.goalsAgainst > 1.5),
        ]),
        over_2_5_rate_last_10: average([
          rate(homeHistory.slice(-10), (row) => row.goalsFor + row.goalsAgainst > 2.5),
          rate(awayHistory.slice(-10), (row) => row.goalsFor + row.goalsAgainst > 2.5),
        ]),
        btts_rate_last_10: average([
          rate(homeHistory.slice(-10), (row) => row.goalsFor > 0 && row.goalsAgainst > 0),
          rate(awayHistory.slice(-10), (row) => row.goalsFor > 0 && row.goalsAgainst > 0),
        ]),
        home_rest_days: daysBetween(match.matchDate, homeHistory.at(-1)?.date),
        away_rest_days: daysBetween(match.matchDate, awayHistory.at(-1)?.date),
        home_prior_matches: homeHistory.length,
        away_prior_matches: awayHistory.length,
      };
      const homeStats = statsBlock(homeSeason);
      const awayStats = statsBlock(awaySeason);
      const fixtureDay = match.matchDate.slice(0, 10);
      homeStats.asOf = fixtureDay;
      awayStats.asOf = fixtureDay;
      const combinedHistory = [...new Map([...homeHistory, ...awayHistory]
        .map((row) => [row.match.matchKey, row])).values()]
        .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
      const snapshot = {
        event: {
          fixtureId: match.id || match.matchKey,
          date: match.matchDate,
          league: { id: match.competition, name: match.competition, season: match.season },
          homeTeam: { id: match.homeTeamNormalized, name: match.homeTeam },
          awayTeam: { id: match.awayTeamNormalized, name: match.awayTeam },
        },
        homeTeam: { id: match.homeTeamNormalized, name: match.homeTeam },
        awayTeam: { id: match.awayTeamNormalized, name: match.awayTeam },
        recentForm: {
          home: { matches: recentSnapshot(homeHistory, match.homeTeamNormalized) },
          away: { matches: recentSnapshot(awayHistory, match.awayTeamNormalized) },
        },
        seasonStatistics: { home: homeStats, away: awayStats },
        leagueAverages: league?.count ? { homeGoals: league.homeGoals / league.count, awayGoals: league.awayGoals / league.count } : null,
        matchStatistics: xgStatistics(combinedHistory),
        h2h: priorH2h.slice(-5).reverse().map((prior) => ({
          fixtureId: prior.id || prior.matchKey,
          date: prior.matchDate,
          homeTeam: { id: prior.homeTeamNormalized, name: prior.homeTeam },
          awayTeam: { id: prior.awayTeamNormalized, name: prior.awayTeam },
          goals: { home: prior.homeGoals, away: prior.awayGoals },
          status: { short: "FT" },
        })),
        injuries: [],
        lineups: [],
        odds: [],
        coverage: {},
        missingData: [
          ...(combinedHistory.some(({ match: prior }) => Number.isFinite(prior.homeXg) && Number.isFinite(prior.awayXg)) ? [] : [{ section: "xg", reason: "not_available" }]),
          { section: "injuries", reason: "not_in_historical_dataset" },
          { section: "lineups", reason: "not_in_historical_dataset" },
        ],
        sources: { historical: match.source },
      };
      return { match, features, targets: buildTargets(match), snapshot };
    },

    add(match) {
      for (const team of [match.homeTeamNormalized, match.awayTeamNormalized]) {
        const key = teamKey(match, team);
        const rows = histories.get(key) || [];
        rows.push(perspective(match, team));
        histories.set(key, rows.slice(-50));
      }
      const updateSeason = (team, venue, goalsFor, goalsAgainst) => {
        const key = seasonTeamKey(match, team);
        const current = seasonTeams.get(key) || { home: aggregate(), away: aggregate() };
        addAggregate(current[venue], goalsFor, goalsAgainst);
        seasonTeams.set(key, current);
      };
      updateSeason(match.homeTeamNormalized, "home", match.homeGoals, match.awayGoals);
      updateSeason(match.awayTeamNormalized, "away", match.awayGoals, match.homeGoals);
      const leagueKey = `${match.competition}|${match.season}`;
      const league = leagueSeasons.get(leagueKey) || { count: 0, homeGoals: 0, awayGoals: 0 };
      league.count += 1;
      league.homeGoals += match.homeGoals;
      league.awayGoals += match.awayGoals;
      leagueSeasons.set(leagueKey, league);
      const pair = pairKey(match);
      h2h.set(pair, [...(h2h.get(pair) || []), match].slice(-5));
    },
  };
}

export function buildHistoricalDataset(matches) {
  const ordered = [...matches].sort((left, right) => Date.parse(left.matchDate) - Date.parse(right.matchDate) || String(left.id || left.matchKey).localeCompare(String(right.id || right.matchKey)));
  const builder = createHistoricalFeatureBuilder();
  const records = [];
  for (let index = 0; index < ordered.length;) {
    const timestamp = Date.parse(ordered[index].matchDate);
    const sameKickoff = [];
    while (index < ordered.length && Date.parse(ordered[index].matchDate) === timestamp) {
      sameKickoff.push(ordered[index]);
      index += 1;
    }
    records.push(...sameKickoff.map((match) => builder.build(match)));
    for (const match of sameKickoff) builder.add(match);
  }
  return records;
}
