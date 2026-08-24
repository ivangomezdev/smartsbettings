import { assessConfidence, assessCountConfidence } from "../../lib/predictions/confidence.js";
import {
  FOOTBALL_CARDS_POISSON_V1,
  FOOTBALL_CORNERS_POISSON_V1,
  FOOTBALL_COUNT_POISSON_V1_CONFIG_FINGERPRINT,
  FOOTBALL_COUNT_POISSON_V1_DATASET_VERSION,
  runFootballCardsPoissonV1,
  runFootballCornersPoissonV1,
} from "../../lib/predictions/countMarketModel.js";
import { deterministicConclusion, generateDeterministicFactors } from "../../lib/predictions/factors.js";
import { normalizeSearchText, SUPPORTED_MARKETS } from "../../lib/predictions/markets.js";
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
  [FOOTBALL_CORNERS_POISSON_V1, runFootballCornersPoissonV1],
  [FOOTBALL_CARDS_POISSON_V1, runFootballCardsPoissonV1],
]);

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
  if ([FOOTBALL_CORNERS_POISSON_V1, FOOTBALL_CARDS_POISSON_V1].includes(version)) {
    return {
      configFingerprint: FOOTBALL_COUNT_POISSON_V1_CONFIG_FINGERPRINT,
      calibrationConfigFingerprint: null,
      datasetVersion: FOOTBALL_COUNT_POISSON_V1_DATASET_VERSION,
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
  const definition = SUPPORTED_MARKETS[code];
  if (!definition) return [];
  let label = definition.label;
  if (definition.teamSide === "home") label = label.replace("Local", snapshot.homeTeam?.name || "Local");
  if (definition.teamSide === "away") label = label.replace("Visitante", snapshot.awayTeam?.name || "Visitante");
  if (code === "draw_no_bet_home") label = `Draw No Bet: ${snapshot.homeTeam?.name || "Local"}`;
  if (code === "draw_no_bet_away") label = `Draw No Bet: ${snapshot.awayTeam?.name || "Visitante"}`;
  return [{
    key: code,
    label,
    probabilityKey: code,
    ...(code.startsWith("draw_no_bet_") ? {
      pushProbabilityKey: "draw",
      unconditionalWinKey: code.endsWith("home") ? "home" : "away",
    } : {}),
  }];
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
  if (selectionKey.startsWith("cards_")) return /cards|bookings|tarjetas/.test(normalized);
  if (selectionKey.startsWith("corners_")) return /corners|esquinas/.test(normalized);
  if (/^(?:home|away)_(?:over|under)_/.test(selectionKey)) return /team total|team goals|total equipo|goles del equipo/.test(normalized);
  if (selectionKey.startsWith("over_") || selectionKey.startsWith("under_")) {
    return /over.?under|total goals|goals over/.test(normalized);
  }
  if (["btts", "btts_no"].includes(selectionKey)) return /both teams|btts|ambos/.test(normalized);
  if (selectionKey.startsWith("double_chance_")) return /double chance|doble oportunidad/.test(normalized);
  if (selectionKey.startsWith("draw_no_bet_")) return /draw no bet|dnb|empate no apuesta/.test(normalized);
  return /match winner|1x2|winner/.test(normalized);
}

function lineSelection(selectionKey) {
  const match = selectionKey.match(/(?:^|_)(over|under)_(\d+)_(\d+)$/);
  return match ? { side: match[1], line: `${match[2]}.${match[3]}` } : null;
}

function valueMatchesSelection(value, selectionKey, snapshot, betName = "") {
  const normalized = normalizeSearchText(value).replace(/\s+/g, " ").trim();
  const line = lineSelection(selectionKey);
  if (line) {
    const teamTotal = selectionKey.match(/^(home|away)_(?:over|under)_/);
    if (teamTotal) {
      const desiredSide = teamTotal[1];
      const context = normalizeSearchText(`${betName} ${value}`);
      const homeName = normalizeSearchText(snapshot.homeTeam?.name);
      const awayName = normalizeSearchText(snapshot.awayTeam?.name);
      const identifiesHome = /\b(?:home|local)\b/.test(context) || (homeName && context.includes(homeName));
      const identifiesAway = /\b(?:away|visitante)\b/.test(context) || (awayName && context.includes(awayName));
      if (desiredSide === "home" ? !identifiesHome || identifiesAway : !identifiesAway || identifiesHome) return false;
      return new RegExp(`\\b${line.side}\\s*${line.line.replace(".", "[.,]")}\\b`, "i").test(normalized);
    }
    return normalized === `${line.side} ${line.line}` || normalized === `${line.side} ${line.line.replace(".", ",")}`;
  }
  if (selectionKey === "btts") return ["yes", "si", "btts yes"].includes(normalized);
  if (selectionKey === "btts_no") return ["no", "btts no"].includes(normalized);
  if (selectionKey === "double_chance_1x") return ["home or draw", "1x", "local o empate"].includes(normalized);
  if (selectionKey === "double_chance_x2") return ["draw or away", "x2", "empate o visitante"].includes(normalized);
  if (selectionKey === "double_chance_12") return ["home or away", "12", "local o visitante"].includes(normalized);
  if (selectionKey === "draw_no_bet_home") return ["home", "1", normalizeSearchText(snapshot.homeTeam?.name)].includes(normalized);
  if (selectionKey === "draw_no_bet_away") return ["away", "2", normalizeSearchText(snapshot.awayTeam?.name)].includes(normalized);
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
        if (!valueMatchesSelection(value.label, selectionKey, snapshot, market.name)) continue;
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
  if (model.modelFamily === "count_totals") {
    if ((model.metrics?.recent?.home?.sampleSize || 0) < 3 || (model.metrics?.recent?.away?.sampleSize || 0) < 3) {
      warnings.push({ type: "COUNT_SAMPLE_SMALL", message: `La muestra reciente de ${model.statistic} es reducida.` });
    }
    warnings.push({ type: "COUNT_MODEL_WEAK", message: "El modelo de conteo todavía no tiene clasificación SUPPORTED." });
    return warnings;
  }
  if (!model.sources?.xg) warnings.push({ type: "XG_INSUFFICIENT", message: "xG/xGA no se incorporó por ausencia o muestra insuficiente." });
  if (!model.sources?.h2h) warnings.push({ type: "H2H_INSUFFICIENT", message: "H2H no se incorporó por tener menos de tres encuentros válidos." });
  return warnings;
}

function statisticsContext(snapshot, model = null) {
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
    usedByModel: model?.modelFamily === "count_totals",
    modeledStatistic: model?.modelFamily === "count_totals" ? model.statistic : null,
  };
}

function mergeMissingData(snapshot, model) {
  const missing = [...(snapshot.missingData || [])];
  const add = (section, reason) => {
    if (!missing.some((item) => item.section === section && item.reason === reason)) missing.push({ section, reason });
  };
  if (model.modelFamily === "count_totals") {
    if ((model.metrics?.recent?.home?.sampleSize || 0) < 3 || (model.metrics?.recent?.away?.sampleSize || 0) < 3) {
      add(model.statistic, "partial_recent_sample");
    }
  } else {
    if (!model.sources?.season) add("seasonStatistics", "not_used_by_model");
    if (!model.sources?.xg) add("xg", "minimum_sample_not_met");
    if (!model.sources?.h2h) add("h2h", "minimum_sample_not_met");
  }
  return missing;
}

function buildSelections(snapshot, market, probabilities) {
  const definitions = selectionDefinitions(market, snapshot);
  if (!definitions.length) throw new RangeError(`Mercado no soportado por el predictor: ${marketCode(market)}`);
  return definitions.map((definition) => {
    const probability = probabilities[definition.probabilityKey];
    const quote = findBestMarketOdds(snapshot, definition.key);
    const pushProbability = definition.pushProbabilityKey ? probabilities[definition.pushProbabilityKey] : null;
    const unconditionalWin = definition.unconditionalWinKey ? probabilities[definition.unconditionalWinKey] : null;
    const theoreticalEdge = definition.unconditionalWinKey && Number.isFinite(quote.marketOdds)
      ? unconditionalWin * quote.marketOdds + pushProbability - 1
      : calculateEdge(probability, quote.marketOdds);
    return {
      key: definition.key,
      label: definition.label,
      probability,
      fairOdds: calculateFairOdds(probability),
      marketOdds: quote.marketOdds,
      bookmaker: quote.bookmaker,
      oddsTimestamp: quote.oddsTimestamp,
      theoreticalEdge,
      pushProbability,
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
          expectedCounts: null,
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
        const confidence = predictionModel.modelFamily === "count_totals"
          ? assessCountConfidence(predictionModel, snapshot)
          : assessConfidence(predictionModel, snapshot);
        const factors = generateDeterministicFactors({ market, model: predictionModel });
        const warnings = [...contextualWarnings(snapshot, predictionModel), ...webResearchWarnings(snapshot)];
        result = {
          status: "completed",
          modelVersion,
          model: modelMetadata,
          expectedGoals: predictionModel.expectedGoals,
          expectedCounts: predictionModel.expectedCounts || null,
          market: marketCode(market),
          selections,
          confidence,
          edgePolicy: { status: "UNVALIDATED", meaning: "El theoreticalEdge es experimental y no constituye una recomendación." },
          ...factors,
          warnings,
          missingData: mergeMissingData(snapshot, predictionModel),
          context: {
            statistics: statisticsContext(snapshot, predictionModel),
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
