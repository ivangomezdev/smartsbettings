import { assessConfidence } from "../../lib/predictions/confidence.js";
import { deterministicConclusion, generateDeterministicFactors } from "../../lib/predictions/factors.js";
import { normalizeSearchText } from "../../lib/predictions/markets.js";
import { FOOTBALL_POISSON_V1, runFootballPoissonV1 } from "../../lib/predictions/statisticalModel.js";
import {
  FOOTBALL_POISSON_V2,
  FOOTBALL_POISSON_V2_CANDIDATE_CONFIG,
  FOOTBALL_POISSON_V2_CONFIG_FINGERPRINT,
  FOOTBALL_POISSON_V2_DATASET_VERSION,
  runFootballPoissonV2,
} from "../../lib/predictions/statisticalModelV2.js";
import { createHistoryService } from "./historyService.js";
import { modelRouter } from "./modelRouter.js";

// El router elige el default por mercado; ambos modelos permanecen disponibles para override explícito.
const modelRegistry = new Map([
  [FOOTBALL_POISSON_V1, runFootballPoissonV1],
  [FOOTBALL_POISSON_V2, (snapshot) => runFootballPoissonV2(snapshot, FOOTBALL_POISSON_V2_CANDIDATE_CONFIG)],
]);

const singleMarkets = {
  over_0_5: { key: "over_0_5", label: "Over 0.5 goles", probabilityKey: "over_0_5" },
  over_1_5: { key: "over_1_5", label: "Over 1.5 goles", probabilityKey: "over_1_5" },
  over_2_5: { key: "over_2_5", label: "Over 2.5 goles", probabilityKey: "over_2_5" },
  under_1_5: { key: "under_1_5", label: "Under 1.5 goles", probabilityKey: "under_1_5" },
  under_2_5: { key: "under_2_5", label: "Under 2.5 goles", probabilityKey: "under_2_5" },
  btts: { key: "btts", label: "Ambos equipos marcan: Sí", probabilityKey: "btts" },
};

function marketCode(market) {
  return typeof market === "string" ? market : market?.code;
}

function snapshotDataAvailability(snapshot) {
  return {
    recentForm: Boolean(snapshot?.recentForm?.home?.matches?.length && snapshot?.recentForm?.away?.matches?.length),
    seasonStatistics: Boolean(snapshot?.seasonStatistics?.home && snapshot?.seasonStatistics?.away),
    xg: Boolean(snapshot?.matchStatistics?.length),
    h2h: Boolean(snapshot?.h2h?.length),
    injuries: Boolean(snapshot?.injuries?.length),
    lineups: Boolean(snapshot?.lineups?.length),
    odds: Boolean(snapshot?.odds?.length),
    webEvidence: Boolean(snapshot?.enrichment?.web?.evidence?.length),
    webInjuries: Boolean(snapshot?.enrichment?.web?.injuries?.length),
    webLineups: Boolean(snapshot?.enrichment?.web?.lineups?.length),
  };
}

function webResearchWarnings(snapshot) {
  const web = snapshot?.enrichment?.web || {};
  return [
    ...(web.warnings || []).map((warning) => ({ type: warning.code || "WEB_RESEARCH_PARTIAL", message: `Contexto web: ${warning.code || "resultado parcial"}.`, details: warning })),
    ...(web.conflicts || []).map((conflict) => ({ type: "CONFLICTING_SOURCES", message: `Hay fuentes contradictorias sobre ${conflict.subject || "un dato relevante"}.`, details: conflict })),
  ];
}

function auditMetadata(version) {
  if (version === FOOTBALL_POISSON_V2) {
    return {
      configFingerprint: FOOTBALL_POISSON_V2_CONFIG_FINGERPRINT,
      calibrationConfigFingerprint: FOOTBALL_POISSON_V2_CONFIG_FINGERPRINT,
      datasetVersion: FOOTBALL_POISSON_V2_DATASET_VERSION,
    };
  }
  return { configFingerprint: null, calibrationConfigFingerprint: null, datasetVersion: null };
}

function selectionDefinitions(market, snapshot) {
  const code = marketCode(market);
  if (code === "one_x_two") {
    return [
      { key: "home", label: snapshot.homeTeam?.name || "Local", probabilityKey: "home" },
      { key: "draw", label: "Empate", probabilityKey: "draw" },
      { key: "away", label: snapshot.awayTeam?.name || "Visitante", probabilityKey: "away" },
    ];
  }
  return singleMarkets[code] ? [singleMarkets[code]] : [];
}

export function calculateFairOdds(probability) {
  return Number.isFinite(probability) && probability > 0 && probability <= 1 ? 1 / probability : null;
}

export function calculateEdge(probability, odds) {
  return Number.isFinite(probability) && probability >= 0 && probability <= 1 && Number.isFinite(odds) && odds > 1
    ? probability * odds - 1
    : null;
}

function validDecimalOdds(value) {
  const odds = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(odds) && odds > 1 && odds <= 1000 ? odds : null;
}

function betSupportsSelection(betName, selectionKey) {
  const normalized = normalizeSearchText(betName);
  if (selectionKey.startsWith("over_") || selectionKey.startsWith("under_")) {
    return /over.?under|total goals|goals over/.test(normalized);
  }
  if (selectionKey === "btts") return /both teams|btts|ambos/.test(normalized);
  return /match winner|1x2|winner/.test(normalized);
}

function valueMatchesSelection(value, selectionKey, snapshot) {
  const normalized = normalizeSearchText(value).replace(/\s+/g, " ").trim();
  if (selectionKey.startsWith("over_") || selectionKey.startsWith("under_")) {
    const [side, integer, decimal] = selectionKey.split("_");
    return normalized === `${side} ${integer}.${decimal}` || normalized === `${side} ${integer},${decimal}`;
  }
  if (selectionKey === "btts") return ["yes", "si", "btts yes"].includes(normalized);
  if (selectionKey === "home") return ["home", "1", normalizeSearchText(snapshot.homeTeam?.name)].includes(normalized);
  if (selectionKey === "draw") return ["draw", "empate", "x"].includes(normalized);
  if (selectionKey === "away") return ["away", "2", normalizeSearchText(snapshot.awayTeam?.name)].includes(normalized);
  return false;
}

export function findBestMarketOdds(snapshot, selectionKey) {
  let best = null;
  for (const bookmaker of snapshot.odds || []) {
    for (const market of bookmaker.markets || []) {
      if (!betSupportsSelection(market.name, selectionKey)) continue;
      for (const value of market.values || []) {
        if (!valueMatchesSelection(value.label, selectionKey, snapshot)) continue;
        const odds = validDecimalOdds(value.odds);
        if (odds !== null && (!best || odds > best.marketOdds)) {
          best = {
            marketOdds: odds,
            bookmaker: bookmaker.bookmaker?.name || null,
            oddsTimestamp: bookmaker.updatedAt || null,
          };
        }
      }
    }
  }
  return best || { marketOdds: null, bookmaker: null, oddsTimestamp: null };
}

function contextualWarnings(snapshot, model) {
  const warnings = [];
  for (const absence of snapshot.injuries || []) {
    if (!absence.player?.name) continue;
    warnings.push({
      type: "PLAYER_UNAVAILABLE",
      message: `${absence.player.name} figura como no disponible${absence.reason ? `: ${absence.reason}` : "."}`,
      playerId: absence.player.id,
      teamId: absence.team?.id ?? null,
    });
  }
  if (!(snapshot.lineups || []).length) {
    warnings.push({ type: "LINEUPS_UNAVAILABLE", message: "No hay alineaciones confirmadas disponibles para este fixture." });
  }
  if (!model.sources?.xg) warnings.push({ type: "XG_INSUFFICIENT", message: "xG/xGA no se incorporó por ausencia o muestra insuficiente." });
  if (!model.sources?.h2h) warnings.push({ type: "H2H_INSUFFICIENT", message: "H2H no se incorporó por tener menos de tres encuentros válidos." });
  return warnings;
}

function statisticsContext(snapshot) {
  const keys = ["shotsOnTarget", "shotsOffTarget", "totalShots", "corners", "yellowCards", "redCards", "possession"];
  const values = Object.fromEntries(keys.map((key) => [key, []]));
  for (const fixture of snapshot.matchStatistics || []) {
    for (const team of fixture.teams || []) {
      for (const key of keys) if (Number.isFinite(team.values?.[key])) values[key].push(team.values[key]);
    }
  }
  return {
    fixtureSamples: (snapshot.matchStatistics || []).length,
    averages: Object.fromEntries(keys.map((key) => [
      key,
      values[key].length ? values[key].reduce((sum, value) => sum + value, 0) / values[key].length : null,
    ])),
    usedByModel: false,
  };
}

function mergeMissingData(snapshot, model) {
  const missing = [...(snapshot.missingData || [])];
  const add = (section, reason) => {
    if (!missing.some((item) => item.section === section && item.reason === reason)) missing.push({ section, reason });
  };
  if (!model.sources?.season) add("seasonStatistics", "not_used_by_model");
  if (!model.sources?.xg) add("xg", "minimum_sample_not_met");
  if (!model.sources?.h2h) add("h2h", "minimum_sample_not_met");
  return missing;
}

function buildSelections(snapshot, market, probabilities) {
  const definitions = selectionDefinitions(market, snapshot);
  if (!definitions.length) throw new RangeError(`Mercado no soportado por el predictor: ${marketCode(market)}`);
  return definitions.map((definition) => {
    const probability = probabilities[definition.probabilityKey];
    const quote = findBestMarketOdds(snapshot, definition.key);
    const theoreticalEdge = calculateEdge(probability, quote.marketOdds);
    return {
      key: definition.key,
      label: definition.label,
      probability,
      fairOdds: calculateFairOdds(probability),
      marketOdds: quote.marketOdds,
      bookmaker: quote.bookmaker,
      oddsTimestamp: quote.oddsTimestamp,
      theoreticalEdge,
      edgeStatus: "UNVALIDATED",
      // Alias conservado para consumidores internos anteriores; nunca implica recomendación.
      edge: theoreticalEdge,
    };
  });
}

export function createPredictionService({
  historyService = createHistoryService(),
  models = modelRegistry,
  router = modelRouter,
  now = () => new Date(),
} = {}) {
  return {
    async predict({ snapshot, market, analysisId = null, modelVersion: manualModelVersion = null, sport = "football", dataAvailability = null }) {
      const route = router.resolve({ sport, market, dataAvailability: dataAvailability || snapshotDataAvailability(snapshot) });
      const modelVersion = manualModelVersion || route.modelVersion;
      const modelRunner = models.get(modelVersion);
      if (!modelRunner) throw new Error(`Modelo no registrado: ${modelVersion}`);
      const selectedBy = manualModelVersion ? "manual-override" : "market-router";
      const modelMetadata = {
        version: modelVersion,
        selectedBy,
        reason: manualModelVersion ? `Override manual de ${route.modelVersion} a ${modelVersion}. ${route.reason}` : route.reason,
        marketStatus: route.marketStatus,
        routerVersion: route.routerVersion,
        routerConfigFingerprint: route.routerConfigFingerprint,
        ...auditMetadata(modelVersion),
      };
      const predictionModel = modelRunner(snapshot);
      let result;

      if (predictionModel.kind !== "prediction") {
        result = {
          status: "insufficient_data",
          code: "INSUFFICIENT_DATA",
          modelVersion,
          model: modelMetadata,
          market: marketCode(market),
          expectedGoals: null,
          selections: [],
          confidence: { level: "low", score: 0, reasons: predictionModel.reasons || [] },
          edgePolicy: { status: "UNVALIDATED", meaning: "El theoreticalEdge es experimental y no constituye una recomendación." },
          positiveFactors: [],
          negativeFactors: [],
          warnings: webResearchWarnings(snapshot),
          missingData: snapshot.missingData || [],
          context: { web: snapshot.enrichment?.web || null },
          generatedAt: now().toISOString(),
        };
      } else {
        const selections = buildSelections(snapshot, market, predictionModel.probabilities);
        const confidence = assessConfidence(predictionModel, snapshot);
        const factors = generateDeterministicFactors({ market, model: predictionModel });
        const warnings = [...contextualWarnings(snapshot, predictionModel), ...webResearchWarnings(snapshot)];
        result = {
          status: "completed",
          modelVersion,
          model: modelMetadata,
          expectedGoals: predictionModel.expectedGoals,
          market: marketCode(market),
          selections,
          confidence,
          edgePolicy: { status: "UNVALIDATED", meaning: "El theoreticalEdge es experimental y no constituye una recomendación." },
          ...factors,
          warnings,
          missingData: mergeMissingData(snapshot, predictionModel),
          context: {
            statistics: statisticsContext(snapshot),
            injuries: snapshot.injuries || [],
            lineups: snapshot.lineups || [],
            web: snapshot.enrichment?.web || null,
          },
          diagnostics: {
            weights: predictionModel.weights,
            sourceEstimates: predictionModel.sources,
            samples: predictionModel.metrics,
            matrix: predictionModel.matrix,
          },
          conclusion: deterministicConclusion({ market, selections, confidence, ...factors }),
          generatedAt: now().toISOString(),
        };
      }

      if (analysisId) await historyService.updateAnalysisPrediction({ analysisId, result });
      return result;
    },
  };
}

export function registerPredictionModel(version, runner) {
  if (!version || typeof runner !== "function") throw new TypeError("La versión y el runner del modelo son obligatorios.");
  modelRegistry.set(version, runner);
}
