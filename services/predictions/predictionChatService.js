import { randomUUID } from "node:crypto";
import { buildExplanationContext } from "../../lib/predictions/explanationContext.js";
import { SUPPORTED_MARKETS } from "../../lib/predictions/markets.js";
import { parsePredictionQuery } from "../../lib/predictions/parser.js";
import { PredictionFoundationError, PredictionValidationError, toPublicPredictionError } from "../../lib/predictions/errors.js";
import { createAnalysisDataService } from "./analysisDataService.js";
import { createConversationService } from "./conversationService.js";
import { createHistoryService } from "./historyService.js";
import { createLlmService } from "./llm/llmService.js";
import { createMatchService } from "./matchService.js";
import { createPredictionService } from "./predictionService.js";
import { createPredictionRequestLimitService } from "./requestLimitService.js";
import { getDefaultSportsServices } from "./sportsApi.js";

const MARKET_OPTIONS = Object.values(SUPPORTED_MARKETS).map((market) => ({ type: "market", id: market.code, label: market.label }));

function languageOf(message) {
  return /\b(?:please|analyze|prediction|goals?|both teams|match)\b/i.test(message) ? "en" : "es";
}

function publicMessage(item) {
  return { id: item.id, role: item.role, type: item.type, content: item.content, createdAt: item.createdAt };
}

function selectionFromClarification(parsed, clarification, selection) {
  const resumed = structuredClone(parsed || {});
  resumed.resolutions ||= {};
  if (selection.type === "market") {
    const market = SUPPORTED_MARKETS[selection.id];
    if (!market) throw new PredictionValidationError("El mercado seleccionado no está soportado.");
    resumed.market = market;
    resumed.missingFields = (resumed.missingFields || []).filter((field) => field !== "market");
  } else if (selection.type === "fixture") {
    resumed.resolutions.fixtureId = selection.id;
  } else if (selection.type === "team") {
    const key = String(clarification.reason || "").startsWith("away") ? "awayTeamId" : "homeTeamId";
    resumed.resolutions[key] = selection.id;
  }
  return resumed;
}

function clarificationText(reason, language) {
  const english = language === "en";
  if (reason === "market_missing") return english ? "Which market would you like to analyze?" : "¿Qué mercado quieres analizar?";
  if (reason.includes("team_ambiguous")) return english ? "Which team did you mean?" : "¿A cuál equipo te refieres?";
  if (reason.includes("fixture")) return english ? "Which fixture should I analyze?" : "¿Cuál de estos partidos quieres analizar?";
  return english ? "I need the two teams and a supported market." : "Necesito los dos equipos y un mercado soportado.";
}

function responseFromStored(message) {
  const result = message?.payload?.result;
  return result ? { ...result, message: publicMessage(message), idempotent: true } : null;
}

export function createPredictionChatService({
  conversationService = createConversationService(),
  requestLimitService = createPredictionRequestLimitService(),
  analysisDataService = null,
  predictionService = createPredictionService(),
  historyService = createHistoryService(),
  llmService = createLlmService(),
  logger = (entry) => console.info(JSON.stringify({ scope: "predictions", ...entry })),
} = {}) {
  if (!analysisDataService) {
    const { sportsApi } = getDefaultSportsServices();
    analysisDataService = createAnalysisDataService({ matchService: createMatchService({ sportsApi }), historyService });
  }

  async function saveClarification({ conversationId, requestId, parsed, reason, options, language }) {
    const content = clarificationText(reason, language);
    const base = { kind: "clarification", conversationId, clarification: { reason, options } };
    const assistant = await conversationService.addMessage({
      conversationId, role: "assistant", type: "clarification", content,
      payload: { requestId, state: { parsed }, result: base },
    });
    return { ...base, message: publicMessage(assistant) };
  }

  return {
    async process({ userId, conversationId, message, selection = null, requestId = randomUUID() }) {
      const started = Date.now();
      const existing = await conversationService.findAssistantByRequest({ userId, conversationId, requestId });
      if (existing) return responseFromStored(existing);
      await requestLimitService.reserve(userId);
      const reservation = await conversationService.reserveUserMessage({ userId, conversationId, content: message, requestId });
      if (reservation.duplicate) throw new PredictionFoundationError("La misma solicitud todavía se está procesando.", { code: "PREDICTION_REQUEST_IN_PROGRESS", status: 409, retryable: true });
      const language = languageOf(message);
      const phaseDurations = {};
      let phaseStarted = Date.now();
      try {
        let parsed;
        if (selection) {
        const previous = await conversationService.lastClarification({ conversationId });
        if (!previous?.payload?.state?.parsed) throw new PredictionValidationError("No hay una aclaración pendiente para esta selección.");
        parsed = selectionFromClarification(previous.payload.state.parsed, previous.payload.result?.clarification || {}, selection);
        } else {
          parsed = parsePredictionQuery(message);
        }
        if (parsed.errors?.length) throw new PredictionValidationError(parsed.errors[0].message, parsed.errors[0]);
        if (parsed.missingFields?.includes("market")) return saveClarification({ conversationId, requestId, parsed, reason: "market_missing", options: MARKET_OPTIONS, language });
        if (parsed.missingFields?.length) return saveClarification({ conversationId, requestId, parsed, reason: "event_incomplete", options: [], language });
        phaseDurations.parseMs = Date.now() - phaseStarted;

      phaseStarted = Date.now();
      const prepared = await analysisDataService.prepareSnapshot({ parsed, userId, conversationId });
      phaseDurations.dataAndWebMs = Date.now() - phaseStarted;
      if (prepared.kind !== "snapshot") {
        const reason = prepared.reason || (prepared.kind === "not_found" ? "fixture_not_found" : "fixture_ambiguous");
        const options = (prepared.options || []).map((option) => ({ type: reason.includes("team") ? "team" : "fixture", id: String(option.id), label: option.label || option.name, date: option.date || null, league: option.league || null }));
        return saveClarification({ conversationId, requestId, parsed, reason, options, language });
      }
      phaseStarted = Date.now();
      const prediction = await predictionService.predict({ snapshot: prepared.snapshot, market: prepared.market, analysisId: prepared.analysisId });
      phaseDurations.predictionMs = Date.now() - phaseStarted;
      const explanationContext = buildExplanationContext({ snapshot: prepared.snapshot, prediction });
      phaseStarted = Date.now();
      const explained = await llmService.explain({ analysisId: prepared.analysisId, prediction, webContext: prepared.snapshot.enrichment?.web, explanationContext, language });
      phaseDurations.explanationMs = Date.now() - phaseStarted;
      const costMetadata = {
        sports: prepared.snapshot.providerUsage || null,
        web: { providerCalls: prepared.snapshot.enrichment?.web?.usage?.providerCalls || 0, cacheHits: prepared.snapshot.enrichment?.web?.usage?.cacheHits || 0 },
        llm: explained.usage,
      };
      const analysis = {
        id: prepared.analysisId,
        status: prediction.status,
        event: prepared.fixture,
        market: prepared.market,
        prediction: {
          selections: prediction.selections,
          confidence: prediction.confidence,
          expectedGoals: prediction.expectedGoals,
          edgeStatus: prediction.edgePolicy?.status,
          marketStatus: prediction.model?.marketStatus,
        },
        model: { version: prediction.modelVersion, ...prediction.model },
        explanation: explained.explanation,
        recentForm: explanationContext.lastSix,
        homeAwayStats: explanationContext.homeAwayStats,
        stats: explanationContext.statsSummary,
        h2h: explanationContext.h2h,
        injuries: explanationContext.injuries,
        suspensions: explanationContext.suspensions,
        lineups: explanationContext.lineups,
        rotations: explanationContext.rotations,
        news: explanationContext.news,
        factors: { positive: explanationContext.positiveFactors, negative: explanationContext.negativeFactors },
        missingData: explanationContext.missingData,
        conflicts: explanationContext.conflicts,
        sources: explanationContext.sources,
        llm: explained.llm,
        llmUsage: explained.usage,
        costMetadata,
      };
      phaseStarted = Date.now();
      const base = { kind: "analysis", conversationId, analysis };
      const assistant = await conversationService.addMessage({ conversationId, role: "assistant", type: "analysis", content: explained.explanation.summary.conclusion, payload: { requestId, result: base } });
      await historyService.completeAnalysis({ analysisId: prepared.analysisId, assistantMessageId: assistant.id, explanation: explained.explanation, explanationContext, fingerprint: explained.fingerprint, llm: explained.llm, costMetadata });
      const title = `${prepared.fixture.homeTeam?.name || "Local"} vs ${prepared.fixture.awayTeam?.name || "Visitante"} — ${prepared.market.label}`;
      await conversationService.updateTitle({ userId, conversationId, title });
      phaseDurations.persistenceMs = Date.now() - phaseStarted;
      logger({ requestId, analysisId: prepared.analysisId, conversationId, durationMs: Date.now() - started, phaseDurations, webProviderCalls: costMetadata.web.providerCalls, webCacheHits: costMetadata.web.cacheHits, model: prediction.modelVersion, llmModel: explained.llm.model, fallback: explained.llm.fallbackUsed });
        return { ...base, message: publicMessage(assistant) };
      } catch (error) {
        const publicError = toPublicPredictionError(error);
        await conversationService.addMessage({
          conversationId,
          role: "assistant",
          type: "error",
          content: publicError.error,
          payload: { requestId, result: { kind: "error", conversationId, ...publicError } },
        }).catch(() => null);
        logger({ requestId, conversationId, durationMs: Date.now() - started, phaseDurations, errorCode: publicError.code });
        throw error;
      }
    },
  };
}
