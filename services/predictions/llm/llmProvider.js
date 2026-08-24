import { createOpenAiProvider } from "./openaiProvider.js";
import { LLM_CONFIG } from "./config.js";

export function createUnconfiguredLlmProvider({ name = "unconfigured", model = null } = {}) {
  return { name, model, configured: false, async generate() { throw Object.assign(new Error("LLM no configurado."), { code: "LLM_NOT_CONFIGURED" }); } };
}

export function createMockLlmProvider({ response, error = null, name = "mock", model = "mock-model" } = {}) {
  const calls = [];
  return {
    name, model, configured: true, calls,
    async generate(input) {
      calls.push(input);
      if (error) throw error;
      return typeof response === "function" ? response(input) : response;
    },
  };
}

export function createLlmProviderFromEnvironment({ environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  const name = String(environment.PREDICTIONS_LLM_PROVIDER || "").toLowerCase().trim();
  if (name === "openai") return createOpenAiProvider({ apiKey: environment.OPENAI_API_KEY, model: environment.PREDICTIONS_LLM_MODEL || LLM_CONFIG.model, fetchImpl });
  return createUnconfiguredLlmProvider({ name: name || "unconfigured", model: environment.PREDICTIONS_LLM_MODEL || null });
}
