import test from "node:test";
import assert from "node:assert/strict";
import {
  FOOTBALL_MARKET_ROUTER_V1,
  FOOTBALL_MARKET_ROUTER_V1_CONFIG_FINGERPRINT,
  FOOTBALL_MARKET_ROUTER_V1_CONFIG,
  MARKET_STATUSES,
  modelRouter,
} from "../../services/predictions/modelRouter.js";

const resolve = (market) => modelRouter.resolve({ sport: "football", market, dataAvailability: { recentForm: true } });

test("router versionado centraliza la selección por mercado", () => {
  for (const market of ["over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts"]) {
    assert.equal(resolve(market).modelVersion, "football-poisson-v2");
  }
  assert.equal(resolve("one_x_two").modelVersion, "football-poisson-v1");
  assert.equal(resolve("over_1_5").routerVersion, FOOTBALL_MARKET_ROUTER_V1);
  assert.equal(resolve("over_1_5").routerConfigFingerprint, FOOTBALL_MARKET_ROUTER_V1_CONFIG_FINGERPRINT);
  assert.deepEqual(Object.keys(FOOTBALL_MARKET_ROUTER_V1_CONFIG).sort(), ["btts", "one_x_two", "over_0_5", "over_1_5", "over_2_5", "under_1_5", "under_2_5"]);
});

test("Over 0.5 es WEAK y los demás mercados iniciales son SUPPORTED", () => {
  assert.equal(resolve("over_0_5").marketStatus, MARKET_STATUSES.weak);
  for (const market of ["over_1_5", "over_2_5", "under_1_5", "under_2_5", "btts", "one_x_two"]) {
    assert.equal(resolve(market).marketStatus, MARKET_STATUSES.supported);
  }
});

test("rechaza deporte y mercado inexistentes", () => {
  assert.throws(() => modelRouter.resolve({ sport: "basketball", market: "over_1_5" }), /Deporte no soportado/);
  assert.throws(() => modelRouter.resolve({ sport: "football", market: "corners" }), /Mercado no soportado/);
});
