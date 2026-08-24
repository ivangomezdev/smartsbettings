import { createHash } from "node:crypto";
import { createCacheService, stableStringify } from "../cacheService.js";
import { buildDeterministicExplanation } from "./deterministicFallback.js";
import { FOOTBALL_PREDICTIONS_EXPLAINER_V1, LLM_CONFIG } from "./config.js";
import { createLlmProviderFromEnvironment } from "./llmProvider.js";
import { buildPredictionPrompt } from "./promptBuilder.js";
import { validatePredictionExplanation } from "./responseSchema.js";

export function explanationFingerprint({ analysisId, prediction, webContext, explanationContext, provider, model } = {}) {
  return createHash("sha256").update(stableStringify({ analysisId, prediction, webContext, explanationContext, promptVersion: FOOTBALL_PREDICTIONS_EXPLAINER_V1, provider, model })).digest("hex");
}

export function createLlmService({ provider = createLlmProviderFromEnvironment(), cache = createCacheService(), logger = null } = {}) {
  return {
    async explain({ analysisId, prediction, webContext, explanationContext, language = "es" } = {}) {
      const fingerprint = explanationFingerprint({ analysisId, prediction, webContext, explanationContext, provider: provider.name, model: provider.model });
      const fallback = (code) => ({
        explanation: buildDeterministicExplanation({ context: explanationContext, language }),
        fingerprint,
        llm: { used: false, provider: provider.name, model: provider.model, fallbackUsed: true, code: "LLM_FALLBACK_USED", warning: code, promptVersion: FOOTBALL_PREDICTIONS_EXPLAINER_V1 },
        usage: { provider: provider.name, model: provider.model, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, cached: false, providerCalls: 0, cacheHits: 0 },
      });
      if (!provider.configured) return fallback("LLM_NOT_CONFIGURED");
      const prompt = buildPredictionPrompt({ explanationContext, language });
      try {
        const cached = await cache.getOrLoad({
          provider: `llm:${provider.name}`,
          resource: "prediction-explanation",
          params: { fingerprint },
          ttlMs: LLM_CONFIG.cacheTtlMs,
          emptyTtlMs: 15 * 60 * 1000,
          loader: () => provider.generate({ instructions: prompt.instructions, input: prompt.input, fingerprint }),
        });
        if (!validatePredictionExplanation(cached.value?.explanation)) return fallback("LLM_INVALID_RESPONSE");
        const cacheHit = cached.meta?.source === "cache";
        return {
          explanation: cached.value.explanation,
          fingerprint,
          llm: { used: true, provider: provider.name, model: provider.model, fallbackUsed: false, promptVersion: FOOTBALL_PREDICTIONS_EXPLAINER_V1, responseId: cached.value.responseId || null },
          usage: { ...(cached.value.usage || {}), estimatedCost: cacheHit ? 0 : (cached.value.usage?.estimatedCost ?? null), cached: cacheHit, providerCalls: cacheHit ? 0 : 1, cacheHits: cacheHit ? 1 : 0 },
        };
      } catch (error) {
        logger?.({ phase: "llm", code: error.code || "LLM_ERROR", fallback: true });
        return fallback(error.code || "LLM_ERROR");
      }
    },
  };
}
