import { estimateLlmCost, LLM_CONFIG } from "./config.js";
import { PREDICTION_EXPLANATION_SCHEMA, validatePredictionExplanation } from "./responseSchema.js";

export class LlmProviderError extends Error {
  constructor(message, { code = "LLM_PROVIDER_ERROR", status = null, retryable = false } = {}) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function httpError(status) {
  if (status === 401 || status === 403) return new LlmProviderError("OpenAI rechazó las credenciales del servidor.", { code: "LLM_AUTHENTICATION_FAILED", status });
  if (status === 429) return new LlmProviderError("OpenAI alcanzó temporalmente su cuota.", { code: "LLM_RATE_LIMITED", status, retryable: true });
  if (status >= 500) return new LlmProviderError("OpenAI no está disponible temporalmente.", { code: "LLM_UNAVAILABLE", status, retryable: true });
  return new LlmProviderError("OpenAI devolvió una respuesta HTTP no válida.", { code: "LLM_HTTP_ERROR", status });
}

function outputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) if (typeof content?.text === "string") return content.text;
  }
  return null;
}

export function createOpenAiProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.PREDICTIONS_LLM_MODEL || LLM_CONFIG.model,
  fetchImpl = globalThis.fetch,
  timeoutMs = LLM_CONFIG.timeoutMs,
} = {}) {
  const secret = String(apiKey || "").trim();
  return {
    name: "openai",
    model,
    configured: Boolean(secret),
    async generate({ instructions, input, fingerprint }) {
      if (!secret) throw new LlmProviderError("OpenAI no está configurado en el servidor.", { code: "LLM_NOT_CONFIGURED" });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            instructions,
            input,
            text: {
              verbosity: "medium",
              format: { type: "json_schema", name: "prediction_explanation", strict: true, schema: PREDICTION_EXPLANATION_SCHEMA },
            },
            reasoning: { effort: "low" },
            max_output_tokens: LLM_CONFIG.maxOutputTokens,
            prompt_cache_key: fingerprint,
            store: false,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (error) {
        if (error?.name === "AbortError") throw new LlmProviderError("OpenAI excedió el tiempo de espera.", { code: "LLM_TIMEOUT", retryable: true });
        throw new LlmProviderError("No fue posible conectar con OpenAI.", { code: "LLM_UNAVAILABLE", retryable: true });
      } finally {
        clearTimeout(timer);
      }
      if (!response?.ok) throw httpError(response?.status || 502);
      let payload;
      try {
        payload = JSON.parse(await response.text());
      } catch {
        throw new LlmProviderError("OpenAI devolvió JSON inválido.", { code: "LLM_INVALID_RESPONSE" });
      }
      const text = outputText(payload);
      let explanation;
      try {
        explanation = JSON.parse(text || "");
      } catch {
        throw new LlmProviderError("OpenAI no devolvió una explicación estructurada válida.", { code: "LLM_INVALID_RESPONSE" });
      }
      if (!validatePredictionExplanation(explanation)) throw new LlmProviderError("La explicación de OpenAI no cumple el schema.", { code: "LLM_INVALID_RESPONSE" });
      const usage = payload.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const cachedInputTokens = usage.input_tokens_details?.cached_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      return {
        explanation,
        responseId: payload.id || null,
        usage: {
          provider: "openai", model, inputTokens, outputTokens,
          totalTokens: usage.total_tokens || inputTokens + outputTokens,
          cachedInputTokens,
          estimatedCost: estimateLlmCost({ model, inputTokens, cachedInputTokens, outputTokens }),
        },
      };
    },
  };
}

