import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoricalDataset, buildTargets } from "../../lib/predictions/historical/featureBuilder.js";
import { createTeamAlias, normalizeTeamName, resolveTeamName } from "../../lib/predictions/historical/teamNormalizer.js";
import { createHistoricalMatches } from "./fixtures/historical-dataset.js";

test("normaliza equipos de forma conservadora y solo fusiona mediante aliases explícitos", () => {
  const alias = createTeamAlias({ canonicalName: "Manchester United", alias: "Man United", competition: "E0", country: "England" });
  assert.equal(normalizeTeamName("Mánchester  United FC"), "manchester united fc");
  assert.equal(resolveTeamName("Man United", { competition: "E0", country: "England" }, [alias]).canonicalName, "Manchester United");
  assert.equal(resolveTeamName("Manchester Utd", { competition: "E0", country: "England" }, [alias]).viaAlias, false);
  assert.equal(resolveTeamName("Man United", { competition: "E1", country: "England" }, [alias]).viaAlias, false);
});

test("deja ambiguo un alias que coincide con más de un nombre canónico aplicable", () => {
  const aliases = [
    createTeamAlias({ canonicalName: "United A", alias: "United" }),
    createTeamAlias({ canonicalName: "United B", alias: "United", competition: "TEST" }),
  ];
  assert.equal(resolveTeamName("United", { competition: "TEST" }, aliases).kind, "ambiguous");
});

test("genera targets binarios correctos", () => {
  const targets = buildTargets({ homeGoals: 2, awayGoals: 1, homeCorners: 6, awayCorners: 4, homeCards: 2, awayCards: 3 });
  assert.equal(targets.over_3_5, 0);
  assert.equal(targets.under_3_5, 1);
  assert.equal(targets.btts, 1);
  assert.equal(targets.btts_no, 0);
  assert.equal(targets.double_chance_1x, 1);
  assert.equal(targets.draw_no_bet_home, 1);
  assert.equal(targets.home_over_1_5, 1);
  assert.equal(targets.away_under_1_5, 1);
  assert.equal(targets.cards_over_4_5, 1);
  assert.equal(targets.corners_over_9_5, 1);
});

test("ordena cronológicamente y termina todas las ventanas estrictamente antes del partido", () => {
  const matches = createHistoricalMatches().reverse();
  const dataset = buildHistoricalDataset(matches);
  for (let index = 1; index < dataset.length; index += 1) {
    assert.ok(Date.parse(dataset[index - 1].match.matchDate) <= Date.parse(dataset[index].match.matchDate));
  }
  for (const record of dataset) {
    for (const side of ["home", "away"]) {
      for (const prior of record.snapshot.recentForm[side].matches) {
        assert.ok(Date.parse(prior.date) < Date.parse(record.match.matchDate));
      }
    }
    for (const prior of record.snapshot.h2h) assert.ok(Date.parse(prior.date) < Date.parse(record.match.matchDate));
  }
});

test("el resultado objetivo no cambia sus propias features y partidos simultáneos no se contaminan", () => {
  const original = createHistoricalMatches();
  const targetId = "history-2-1";
  const before = buildHistoricalDataset(original).find((record) => record.match.id === targetId);
  const mutated = original.map((match) => match.id === targetId ? { ...match, homeGoals: 9, awayGoals: 8 } : match);
  const after = buildHistoricalDataset(mutated).find((record) => record.match.id === targetId);
  assert.deepEqual(after.features, before.features);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.notDeepEqual(after.targets, before.targets);
  const firstRound = buildHistoricalDataset(original).filter((record) => record.match.matchDate === original[0].matchDate);
  assert.ok(firstRound.every((record) => record.features.home_prior_matches === 0 && record.features.away_prior_matches === 0));
});

test("calcula ventanas y descanso con información histórica disponible", () => {
  const record = buildHistoricalDataset(createHistoricalMatches()).find((item) => item.match.id === "history-4-1");
  assert.ok(Number.isFinite(record.features.home_goals_for_last_3));
  assert.ok(Number.isFinite(record.features.away_goals_against_last_3));
  assert.ok(record.features.home_rest_days > 0);
  assert.ok(record.features.home_prior_matches >= 3);
});
