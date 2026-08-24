import { createBraveSearchProvider } from "./braveSearchProvider.js";

function sanitizedResult(result) {
  return {
    title: result.title || null,
    url: result.url || null,
    snippet: result.snippet || null,
    publishedAt: result.publishedAt || null,
    sourceName: result.sourceName || null,
    sourceTier: result.sourceTier || null,
    evidence: result.evidence || null,
  };
}

export function createUnconfiguredWebSearchProvider({ name = process.env.WEB_RESEARCH_PROVIDER || "unconfigured" } = {}) {
  return {
    name,
    configured: false,
    async search() {
      throw Object.assign(new Error("No hay proveedor de investigación web configurado."), { code: "WEB_PROVIDER_NOT_CONFIGURED" });
    },
  };
}

export function createMockWebSearchProvider({ name = "mock-web-search", responses = {}, delayMs = 0, error = null } = {}) {
  const calls = [];
  return {
    name,
    configured: true,
    calls,
    async search({ query, type }) {
      calls.push({ query, type });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (error) throw error;
      const result = typeof responses === "function" ? await responses({ query, type }) : responses[type] || responses[query] || [];
      return (result || []).map(sanitizedResult);
    },
  };
}

export function createWebSearchProviderFromEnvironment({ environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  const providerName = String(environment.WEB_RESEARCH_PROVIDER || "").trim().toLowerCase();
  if (providerName === "brave") {
    return createBraveSearchProvider({
      apiKey: environment.BRAVE_SEARCH_API_KEY,
      fetchImpl,
    });
  }
  return createUnconfiguredWebSearchProvider({ name: providerName || "unconfigured" });
}
