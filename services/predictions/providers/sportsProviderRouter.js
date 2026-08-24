import { PredictionFoundationError } from "../../../lib/predictions/errors.js";

const PROVIDER_USAGE_KEYS = Object.freeze({
  thesportsdb: "theSportsDb",
  "api-football": "apiFootball",
});

function emptyUsage() {
  return {
    theSportsDb: { providerCalls: 0, cacheHits: 0 },
    apiFootball: { providerCalls: 0, cacheHits: 0 },
  };
}

export function mergeProviderUsage(...items) {
  const merged = emptyUsage();
  for (const item of items) {
    for (const key of Object.keys(merged)) {
      merged[key].providerCalls += Number(item?.[key]?.providerCalls || 0);
      merged[key].cacheHits += Number(item?.[key]?.cacheHits || 0);
    }
  }
  return merged;
}

export function providerUsage(provider, { providerCalls = 0, cacheHits = 0 } = {}) {
  const usage = emptyUsage();
  const key = PROVIDER_USAGE_KEYS[provider];
  if (key) usage[key] = { providerCalls, cacheHits };
  return usage;
}

function responseIsEmpty(result) {
  const value = result?.data;
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}

function decorate(result, usage, metadata = {}) {
  return {
    ...result,
    meta: {
      ...(result?.meta || {}),
      ...metadata,
      providerUsage: usage,
    },
  };
}

export function createSportsProviderRouter({ primary, fallback = null } = {}) {
  if (!primary) throw new Error("createSportsProviderRouter requiere un proveedor primario.");
  const providers = new Map([[primary.name, primary]]);
  if (fallback && fallback.name !== primary.name) providers.set(fallback.name, fallback);

  async function call(method, args, context = {}) {
    const requested = context.provider ? providers.get(context.provider) : null;
    const selected = requested || primary;
    const allowFallback = !requested && context.allowFallback !== false && fallback && fallback.name !== selected.name;
    let selectedResult;
    let selectedError = null;
    try {
      selectedResult = await selected[method](...args);
      if (!responseIsEmpty(selectedResult) || !allowFallback) return selectedResult;
    } catch (error) {
      selectedError = error;
      if (!allowFallback) throw error;
    }

    try {
      const fallbackResult = await fallback[method](...args);
      const usage = mergeProviderUsage(selectedResult?.meta?.providerUsage, fallbackResult?.meta?.providerUsage);
      return decorate(fallbackResult, usage, {
        fallbackUsed: true,
        primaryProvider: selected.name,
        primaryError: selectedError instanceof PredictionFoundationError ? selectedError.code : null,
      });
    } catch (fallbackError) {
      if (selectedResult) {
        return decorate(selectedResult, selectedResult.meta?.providerUsage, {
          fallbackUsed: false,
          fallbackError: fallbackError instanceof PredictionFoundationError ? fallbackError.code : "SPORTS_FALLBACK_FAILED",
        });
      }
      throw selectedError || fallbackError;
    }
  }

  return {
    name: primary.name,
    primaryProviderName: primary.name,
    fallbackProviderName: fallback?.name || null,
    capabilities: primary.capabilities || {},
    getCapabilities(provider = primary.name) {
      return providers.get(provider)?.capabilities || {};
    },
    getResource(resource, params = {}, context = {}) {
      return call("getResource", [resource, params, context], context);
    },
    searchTeams(search, context = {}) {
      return call("searchTeams", [search], context);
    },
  };
}
