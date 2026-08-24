import { canonicalMatchKey, normalizeTeamName } from "../../../lib/predictions/historical/teamNormalizer.js";

const teams = ["Alpha FC", "Bravo United", "Charlie Town", "Delta City"];
const rounds = [
  [[0, 1, 2, 1], [2, 3, 0, 0]],
  [[0, 2, 1, 1], [3, 1, 2, 0]],
  [[0, 3, 3, 1], [1, 2, 1, 2]],
  [[1, 0, 0, 2], [3, 2, 1, 1]],
  [[2, 0, 2, 2], [1, 3, 1, 0]],
  [[3, 0, 0, 1], [2, 1, 3, 1]],
  [[0, 1, 1, 0], [2, 3, 2, 1]],
  [[0, 2, 2, 0], [3, 1, 1, 1]],
  [[0, 3, 1, 2], [1, 2, 2, 2]],
  [[1, 0, 1, 3], [3, 2, 0, 2]],
  [[2, 0, 1, 0], [1, 3, 2, 1]],
  [[3, 0, 1, 1], [2, 1, 0, 1]],
];

export function createHistoricalMatches() {
  return rounds.flatMap((fixtures, roundIndex) => fixtures.map(([homeIndex, awayIndex, homeGoals, awayGoals], fixtureIndex) => {
    const homeTeam = teams[homeIndex];
    const awayTeam = teams[awayIndex];
    const match = {
      id: `history-${roundIndex + 1}-${fixtureIndex + 1}`,
      source: "test-fixture",
      sourceMatchId: `${roundIndex + 1}-${fixtureIndex + 1}`,
      competition: "TEST",
      country: "Testland",
      season: "2023-2024",
      matchDate: `2024-${String(Math.floor(roundIndex / 4) + 1).padStart(2, "0")}-${String((roundIndex % 4) * 7 + 1).padStart(2, "0")}T15:00:00.000Z`,
      homeTeam,
      awayTeam,
      homeTeamNormalized: normalizeTeamName(homeTeam),
      awayTeamNormalized: normalizeTeamName(awayTeam),
      homeGoals,
      awayGoals,
      homeShots: 8 + homeGoals * 2,
      awayShots: 7 + awayGoals * 2,
      homeShotsOnTarget: 2 + homeGoals,
      awayShotsOnTarget: 2 + awayGoals,
      homeCorners: 4,
      awayCorners: 3,
      homeCards: 2,
      awayCards: 2,
      homeXg: null,
      awayXg: null,
      oddsHome: 2.1,
      oddsDraw: 3.3,
      oddsAway: 3.5,
      providerData: { marketOdds: { over_2_5: 2.0, under_2_5: 1.85 } },
      rawPayload: {},
    };
    match.matchKey = canonicalMatchKey(match);
    return match;
  }));
}
