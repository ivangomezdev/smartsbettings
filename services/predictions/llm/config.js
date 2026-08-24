export const FOOTBALL_PREDICTIONS_EXPLAINER_V1 = "football-predictions-explainer-v1";

export const LLM_CONFIG = Object.freeze({
  provider: "openai",
  model: "gpt-5.4-mini",
  timeoutMs: 20_000,
  maxOutputTokens: 3_500,
  maxContextCharacters: 42_000,
  cacheTtlMs: 24 * 60 * 60 * 1000,
  pricingPerMillionTokens: Object.freeze({
    "gpt-5-mini": Object.freeze({ input: 0.25, cachedInput: 0.025, output: 2 }),
    "gpt-5.4-mini": Object.freeze({ input: 0.75, cachedInput: 0.075, output: 4.5 }),
  }),
});

export function estimateLlmCost({ model, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 } = {}) {
  const pricing = LLM_CONFIG.pricingPerMillionTokens[model];
  if (!pricing) return null;
  const uncached = Math.max(0, inputTokens - cachedInputTokens);
  return (uncached * pricing.input + cachedInputTokens * pricing.cachedInput + outputTokens * pricing.output) / 1_000_000;
}
