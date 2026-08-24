import {
  FOOTBALL_CARDS_POISSON_V1,
  FOOTBALL_CORNERS_POISSON_V1,
} from "../../lib/predictions/countMarketModel.js";
import { FOOTBALL_POISSON_V1 } from "../../lib/predictions/statisticalModel.js";
import { FOOTBALL_POISSON_V2 } from "../../lib/predictions/statisticalModelV2.js";

export const FOOTBALL_MARKET_ROUTER_V2 = "football-market-router-v2";
export const FOOTBALL_MARKET_ROUTER_V2_CONFIG_FINGERPRINT = "1bbd32c77fcf9bc9dd7cad3af90d5a8e3508feaffd1a4bf19059a46310d801be";

export const MARKET_STATUSES = Object.freeze({
  supported: "SUPPORTED",
  weak: "WEAK",
  notRecommended: "NOT_RECOMMENDED",
});

const route = (modelVersion, marketStatus, reason) => Object.freeze({ modelVersion, marketStatus, reason });
const weakDerived = (modelVersion = FOOTBALL_POISSON_V2) => route(
  modelVersion,
  MARKET_STATUSES.weak,
  "Mercado derivado matemáticamente de un modelo existente; queda WEAK hasta completar benchmark y calibración propios.",
);
const weakCount = (modelVersion) => route(
  modelVersion,
  MARKET_STATUSES.weak,
  "Modelo de conteo V1 con prior histórico y muestra reciente; requiere benchmark específico antes de considerarse respaldado.",
);

const configuration = {
  over_0_5: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.weak, "V2 mejora calibración, pero Over 0.5 aporta poca señal adicional frente a la frecuencia global."),
  over_1_5: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.supported, "V2 mejoró Brier, Log Loss y calibración de Over 1.5 en el benchmark rolling-origin."),
  over_2_5: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.supported, "V2 mejoró Brier, Log Loss y calibración de Over 2.5 en el benchmark rolling-origin."),
  under_1_5: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.supported, "V2 mejoró las métricas del par complementario Over/Under 1.5."),
  under_2_5: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.supported, "V2 mejoró las métricas del par complementario Over/Under 2.5."),
  btts: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.supported, "V2 mejoró Brier, Log Loss y calibración de BTTS de forma consistente."),
  btts_no: route(FOOTBALL_POISSON_V2, MARKET_STATUSES.supported, "Es el complemento exacto del BTTS Sí calibrado y conserva su respaldo estadístico."),
  one_x_two: route(FOOTBALL_POISSON_V1, MARKET_STATUSES.supported, "V1 conserva mejor Brier y Log Loss para 1X2 que V2."),
};

for (const code of ["over_3_5", "over_4_5", "under_3_5", "under_4_5"]) configuration[code] = weakDerived();
for (const side of ["home", "away"]) {
  for (const direction of ["over", "under"]) {
    for (const line of ["0_5", "1_5", "2_5"]) configuration[`${side}_${direction}_${line}`] = weakDerived();
  }
}
for (const code of ["double_chance_1x", "double_chance_x2", "double_chance_12", "draw_no_bet_home", "draw_no_bet_away"]) {
  configuration[code] = weakDerived(FOOTBALL_POISSON_V1);
}
for (const direction of ["over", "under"]) {
  for (const line of ["3_5", "4_5", "5_5"]) configuration[`cards_${direction}_${line}`] = weakCount(FOOTBALL_CARDS_POISSON_V1);
  for (const line of ["8_5", "9_5", "10_5"]) configuration[`corners_${direction}_${line}`] = weakCount(FOOTBALL_CORNERS_POISSON_V1);
}

export const FOOTBALL_MARKET_ROUTER_V2_CONFIG = Object.freeze(configuration);

export function createModelRouter({
  version = FOOTBALL_MARKET_ROUTER_V2,
  configFingerprint = FOOTBALL_MARKET_ROUTER_V2_CONFIG_FINGERPRINT,
  configuration: selectedConfiguration = FOOTBALL_MARKET_ROUTER_V2_CONFIG,
} = {}) {
  return {
    version,
    resolve({ sport, market, dataAvailability = null } = {}) {
      if (sport !== "football") throw new RangeError(`Deporte no soportado por ${version}: ${sport || "missing"}`);
      const code = typeof market === "string" ? market : market?.code;
      const selectedRoute = selectedConfiguration[code];
      if (!selectedRoute) throw new RangeError(`Mercado no soportado por ${version}: ${code || "missing"}`);
      return {
        modelVersion: selectedRoute.modelVersion,
        reason: selectedRoute.reason,
        marketStatus: selectedRoute.marketStatus,
        routerVersion: version,
        routerConfigFingerprint: configFingerprint,
        dataAvailabilityConsidered: dataAvailability != null,
      };
    },
  };
}

export const modelRouter = createModelRouter();
