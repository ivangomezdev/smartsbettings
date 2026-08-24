import { FOOTBALL_POISSON_V1 } from "../../lib/predictions/statisticalModel.js";
import { FOOTBALL_POISSON_V2 } from "../../lib/predictions/statisticalModelV2.js";

export const FOOTBALL_MARKET_ROUTER_V1 = "football-market-router-v1";
export const FOOTBALL_MARKET_ROUTER_V1_CONFIG_FINGERPRINT = "6547d765c4e84c43f6345bca137bc8f2e082bd835602ef1eecd9bf01570f517e";

export const MARKET_STATUSES = Object.freeze({
  supported: "SUPPORTED",
  weak: "WEAK",
  notRecommended: "NOT_RECOMMENDED",
});

export const FOOTBALL_MARKET_ROUTER_V1_CONFIG = Object.freeze({
  over_0_5: Object.freeze({ modelVersion: FOOTBALL_POISSON_V2, marketStatus: MARKET_STATUSES.weak, reason: "V2 mejora calibración, pero Over 0.5 aporta poca señal adicional frente a la frecuencia global." }),
  over_1_5: Object.freeze({ modelVersion: FOOTBALL_POISSON_V2, marketStatus: MARKET_STATUSES.supported, reason: "V2 mejoró Brier, Log Loss y calibración de Over 1.5 en el benchmark rolling-origin." }),
  over_2_5: Object.freeze({ modelVersion: FOOTBALL_POISSON_V2, marketStatus: MARKET_STATUSES.supported, reason: "V2 mejoró Brier, Log Loss y calibración de Over 2.5 en el benchmark rolling-origin." }),
  under_1_5: Object.freeze({ modelVersion: FOOTBALL_POISSON_V2, marketStatus: MARKET_STATUSES.supported, reason: "V2 mejoró las métricas del par complementario Over/Under 1.5." }),
  under_2_5: Object.freeze({ modelVersion: FOOTBALL_POISSON_V2, marketStatus: MARKET_STATUSES.supported, reason: "V2 mejoró las métricas del par complementario Over/Under 2.5." }),
  btts: Object.freeze({ modelVersion: FOOTBALL_POISSON_V2, marketStatus: MARKET_STATUSES.supported, reason: "V2 mejoró Brier, Log Loss y calibración de BTTS de forma consistente." }),
  one_x_two: Object.freeze({ modelVersion: FOOTBALL_POISSON_V1, marketStatus: MARKET_STATUSES.supported, reason: "V1 conserva mejor Brier y Log Loss para 1X2 que V2." }),
});

function marketCode(market) {
  return typeof market === "string" ? market : market?.code;
}

export function createModelRouter({ version = FOOTBALL_MARKET_ROUTER_V1, configFingerprint = FOOTBALL_MARKET_ROUTER_V1_CONFIG_FINGERPRINT, configuration = FOOTBALL_MARKET_ROUTER_V1_CONFIG } = {}) {
  return {
    version,
    resolve({ sport, market, dataAvailability = null } = {}) {
      if (sport !== "football") throw new RangeError(`Deporte no soportado por ${version}: ${sport || "missing"}`);
      const code = marketCode(market);
      const route = configuration[code];
      if (!route) throw new RangeError(`Mercado no soportado por ${version}: ${code || "missing"}`);
      return {
        modelVersion: route.modelVersion,
        reason: route.reason,
        marketStatus: route.marketStatus,
        routerVersion: version,
        routerConfigFingerprint: configFingerprint,
        dataAvailabilityConsidered: dataAvailability != null,
      };
    },
  };
}

export const modelRouter = createModelRouter();
