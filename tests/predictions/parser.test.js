import test from "node:test";
import assert from "node:assert/strict";
import { parsePredictionQuery } from "../../lib/predictions/parser.js";

const now = new Date("2026-08-23T18:00:00.000Z");
const parse = (query) => parsePredictionQuery(query, { now });

test("interpreta los ejemplos principales en español e inglés", () => {
  const cases = [
    ["Real Madrid vs Sevilla, Over 1.5", "Real Madrid", "Sevilla", "over_1_5"],
    ["Analiza Real Madrid vs Sevilla para Over 1.5 goles", "Real Madrid", "Sevilla", "over_1_5"],
    ["Barcelona contra Athletic, ambos marcan", "Barcelona", "Athletic", "btts"],
    ["Analyze Arsenal versus Chelsea, both teams to score", "Arsenal", "Chelsea", "btts"],
  ];

  for (const [query, home, away, market] of cases) {
    const result = parse(query);
    assert.equal(result.homeTeam, home);
    assert.equal(result.awayTeam, away);
    assert.equal(result.market.code, market);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.missingFields, []);
  }
});

test("soporta todos los mercados aprobados", () => {
  const cases = new Map([
    ["Over 0.5", "over_0_5"],
    ["Over 1,5", "over_1_5"],
    ["más de 2.5", "over_2_5"],
    ["Under 1.5", "under_1_5"],
    ["menos de 2,5", "under_2_5"],
    ["BTTS", "btts"],
    ["1 X 2", "one_x_two"],
  ]);

  for (const [marketText, code] of cases) {
    assert.equal(parse(`Equipo Uno vs Equipo Dos ${marketText}`).market.code, code);
  }
});

test("usa una ventana predeterminada de catorce días", () => {
  const result = parse("Real Madrid vs Sevilla Over 1.5");
  assert.deepEqual(result.dateRange, {
    kind: "default",
    from: "2026-08-23",
    to: "2026-09-06",
    timeZone: "America/Mexico_City",
    raw: null,
  });
});

test("interpreta fechas relativas, numéricas, por mes y día de semana", () => {
  assert.equal(parse("A vs B Over 1.5 mañana").dateRange.from, "2026-08-24");
  assert.equal(parse("A vs B Over 1.5 25/08/2026").dateRange.from, "2026-08-25");
  assert.equal(parse("A vs B Over 1.5 26 de agosto de 2026").dateRange.from, "2026-08-26");
  assert.equal(parse("A vs B Over 1.5 August 27, 2026").dateRange.from, "2026-08-27");
  assert.equal(parse("A vs B Over 1.5 next Monday").dateRange.from, "2026-08-24");
});

test("reporta fechas, deportes y mercados no soportados", () => {
  assert.equal(parse("A vs B Over 1.5 31/02/2026").errors[0].code, "INVALID_DATE");
  assert.equal(parse("Lakers vs Celtics NBA Over 1.5").errors[0].code, "UNSUPPORTED_SPORT");
  assert.equal(parse("A vs B Under 3.5").errors[0].code, "UNSUPPORTED_MARKET");
});

test("marca campos ausentes sin inventarlos", () => {
  const result = parse("Analiza Over 1.5");
  assert.equal(result.homeTeam, null);
  assert.equal(result.awayTeam, null);
  assert.deepEqual(result.missingFields, ["homeTeam", "awayTeam"]);
});
