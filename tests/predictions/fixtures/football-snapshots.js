const HOME_ID = 541;
const AWAY_ID = 536;
const EVENT_DATE = "2024-05-20T19:00:00.000Z";

function recentMatch({ id, date, teamId, opponentId, venue, goalsFor, goalsAgainst }) {
  const home = venue === "home";
  return {
    fixtureId: id,
    date,
    status: { short: "FT" },
    homeTeam: { id: home ? teamId : opponentId, name: home ? `Team ${teamId}` : `Team ${opponentId}` },
    awayTeam: { id: home ? opponentId : teamId, name: home ? `Team ${opponentId}` : `Team ${teamId}` },
    goals: { home: home ? goalsFor : goalsAgainst, away: home ? goalsAgainst : goalsFor },
    result: {
      venue,
      outcome: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
      goalsFor,
      goalsAgainst,
    },
  };
}

function recentSeries(teamId, rows) {
  return rows.map(([goalsFor, goalsAgainst, venue], index) => recentMatch({
    id: teamId * 100 + index,
    date: `2024-05-${String(18 - index).padStart(2, "0")}T18:00:00.000Z`,
    teamId,
    opponentId: 9000 + index,
    venue,
    goalsFor,
    goalsAgainst,
  }));
}

function xgFixture(id, date, teamId, ownXg, opponentXg) {
  return {
    fixture: { fixtureId: id, date },
    teams: [
      { team: { id: teamId, name: `Team ${teamId}` }, values: { xg: ownXg, shotsOnTarget: 6, totalShots: 13, corners: 5, yellowCards: 2, possession: 54 } },
      { team: { id: 8000 + id, name: "Opponent" }, values: { xg: opponentXg, shotsOnTarget: 4, totalShots: 9, corners: 3, yellowCards: 3, possession: 46 } },
    ],
  };
}

function h2hMatch(index, homeGoals, awayGoals) {
  const requestedHomeAtHome = index % 2 === 0;
  return {
    fixtureId: 7000 + index,
    date: `2024-04-${String(20 - index).padStart(2, "0")}T18:00:00.000Z`,
    homeTeam: { id: requestedHomeAtHome ? HOME_ID : AWAY_ID, name: requestedHomeAtHome ? "Real Madrid" : "Sevilla" },
    awayTeam: { id: requestedHomeAtHome ? AWAY_ID : HOME_ID, name: requestedHomeAtHome ? "Sevilla" : "Real Madrid" },
    goals: { home: homeGoals, away: awayGoals },
    status: { short: "FT" },
  };
}

export function createFullSnapshot() {
  return {
    event: {
      fixtureId: 1000,
      date: EVENT_DATE,
      league: { id: 140, name: "La Liga", season: 2023 },
      homeTeam: { id: HOME_ID, name: "Real Madrid" },
      awayTeam: { id: AWAY_ID, name: "Sevilla" },
    },
    homeTeam: { id: HOME_ID, name: "Real Madrid" },
    awayTeam: { id: AWAY_ID, name: "Sevilla" },
    recentForm: {
      home: { matches: recentSeries(HOME_ID, [[2, 0, "home"], [3, 1, "home"], [2, 1, "home"], [1, 0, "home"], [4, 1, "home"], [2, 2, "home"], [1, 1, "away"], [2, 0, "away"], [0, 1, "away"], [3, 1, "away"]]) },
      away: { matches: recentSeries(AWAY_ID, [[1, 1, "away"], [2, 1, "away"], [0, 1, "away"], [1, 2, "away"], [2, 2, "away"], [1, 0, "away"], [2, 1, "home"], [0, 0, "home"], [1, 3, "home"], [2, 0, "home"]]) },
    },
    seasonStatistics: {
      home: {
        asOf: "2024-05-20",
        goals: { for: { average: { home: "2.35", away: "1.70", total: "2.02" } }, against: { average: { home: "0.82", away: "1.10", total: "0.96" } } },
      },
      away: {
        asOf: "2024-05-20",
        goals: { for: { average: { home: "1.55", away: "1.18", total: "1.36" } }, against: { average: { home: "1.10", away: "1.62", total: "1.36" } } },
      },
    },
    matchStatistics: [
      xgFixture(1, "2024-05-18T18:00:00.000Z", HOME_ID, 2.1, 0.7),
      xgFixture(2, "2024-05-12T18:00:00.000Z", HOME_ID, 1.8, 0.9),
      xgFixture(3, "2024-05-05T18:00:00.000Z", HOME_ID, 2.4, 1.0),
      xgFixture(4, "2024-05-17T18:00:00.000Z", AWAY_ID, 1.2, 1.5),
      xgFixture(5, "2024-05-11T18:00:00.000Z", AWAY_ID, 1.5, 1.4),
      xgFixture(6, "2024-05-04T18:00:00.000Z", AWAY_ID, 1.0, 1.8),
    ],
    h2h: [
      h2hMatch(0, 2, 1),
      h2hMatch(1, 1, 2),
      h2hMatch(2, 3, 1),
      h2hMatch(3, 0, 1),
      h2hMatch(4, 2, 0),
    ],
    injuries: [{ player: { id: 77, name: "Jugador lesionado" }, team: { id: AWAY_ID, name: "Sevilla" }, type: "Injury", reason: "Lesión muscular" }],
    lineups: [],
    odds: [
      {
        updatedAt: "2024-05-20T10:00:00.000Z",
        bookmaker: { id: 1, name: "Book A" },
        markets: [
          { name: "Goals Over/Under", values: [{ label: "Over 1.5", odds: 1.42 }, { label: "Under 1.5", odds: 2.8 }, { label: "Over 2.5", odds: 1.9 }, { label: "Under 2.5", odds: 1.95 }] },
          { name: "Both Teams Score", values: [{ label: "Yes", odds: 1.72 }] },
          { name: "Match Winner", values: [{ label: "Home", odds: 1.55 }, { label: "Draw", odds: 4.2 }, { label: "Away", odds: 6.5 }] },
        ],
      },
      {
        updatedAt: "2024-05-20T11:00:00.000Z",
        bookmaker: { id: 2, name: "Book B" },
        markets: [
          { name: "Goals Over/Under", values: [{ label: "Over 1.5", odds: 1.5 }, { label: "Under 1.5", odds: 2.7 }] },
          { name: "Both Teams Score", values: [{ label: "Yes", odds: 1.8 }] },
          { name: "Match Winner", values: [{ label: "Home", odds: 1.6 }, { label: "Draw", odds: 4.0 }, { label: "Away", odds: 6.8 }] },
        ],
      },
    ],
    coverage: { injuries: true, odds: true, fixtures: { lineups: true, statistics_fixtures: true } },
    missingData: [{ section: "lineups", reason: "not_yet_available" }],
    sources: {},
  };
}

export function createPartialSnapshot() {
  const snapshot = createFullSnapshot();
  snapshot.recentForm.home.matches = snapshot.recentForm.home.matches.slice(0, 3);
  snapshot.recentForm.away.matches = snapshot.recentForm.away.matches.slice(0, 3);
  snapshot.seasonStatistics = { home: null, away: null };
  snapshot.matchStatistics = [];
  snapshot.h2h = snapshot.h2h.slice(0, 2);
  snapshot.odds = [];
  snapshot.injuries = [];
  snapshot.missingData = [
    { section: "seasonStatistics", reason: "not_available" },
    { section: "matchStatistics", reason: "not_available" },
    { section: "h2h", reason: "not_available" },
    { section: "odds", reason: "not_available" },
  ];
  return snapshot;
}
