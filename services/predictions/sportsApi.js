import { PredictionValidationError, SportsApiPlanRestrictionError } from "../../lib/predictions/errors.js";
import { createApiFootballClient } from "./apiFootballClient.js";
import { createCacheService, createPostgresCacheStore } from "./cacheService.js";
import { createPostgresQuotaStore, createQuotaService } from "./quotaService.js";
import { createSportsProviderRouter, providerUsage } from "./providers/sportsProviderRouter.js";
import { createTheSportsDbProvider } from "./providers/theSportsDbProvider.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SPORTS_CACHE_TTL = Object.freeze({
  teams: 30 * DAY,
  coverage: 24 * HOUR,
  fixtures: 5 * MINUTE,
  recentForm: 6 * HOUR,
  seasonStatistics: 12 * HOUR,
  h2h: 24 * HOUR,
  injuries: 4 * HOUR,
  lineupsNearKickoff: 10 * MINUTE,
  lineupsPrematch: HOUR,
  lineupsCompleted: 30 * DAY,
  odds: 3 * HOUR,
  completedStatistics: 30 * DAY,
  empty: 15 * MINUTE,
});

export function cachePolicyFor(resource, context = {}) {
  if (resource === "teams") return { ttlMs: SPORTS_CACHE_TTL.teams, emptyTtlMs: HOUR };
  if (resource === "leagues") return { ttlMs: SPORTS_CACHE_TTL.coverage, emptyTtlMs: HOUR };
  if (resource === "fixtures/headtohead") return { ttlMs: SPORTS_CACHE_TTL.h2h, emptyTtlMs: SPORTS_CACHE_TTL.empty };
  if (resource === "injuries") return { ttlMs: SPORTS_CACHE_TTL.injuries, emptyTtlMs: SPORTS_CACHE_TTL.empty };
  if (resource === "odds") return { ttlMs: SPORTS_CACHE_TTL.odds, emptyTtlMs: SPORTS_CACHE_TTL.empty };
  if (resource === "teams/statistics") return { ttlMs: SPORTS_CACHE_TTL.seasonStatistics, emptyTtlMs: SPORTS_CACHE_TTL.empty };
  if (resource === "fixtures/statistics") {
    return {
      ttlMs: context.completed ? SPORTS_CACHE_TTL.completedStatistics : MINUTE,
      emptyTtlMs: SPORTS_CACHE_TTL.empty,
    };
  }
  if (resource === "fixtures/lineups") {
    const ttlMs = context.completed
      ? SPORTS_CACHE_TTL.lineupsCompleted
      : context.nearKickoff
        ? SPORTS_CACHE_TTL.lineupsNearKickoff
        : SPORTS_CACHE_TTL.lineupsPrematch;
    return { ttlMs, emptyTtlMs: SPORTS_CACHE_TTL.empty };
  }
  if (resource === "fixtures") {
    return {
      ttlMs: context.completed
        ? SPORTS_CACHE_TTL.completedStatistics
        : context.recentForm
          ? SPORTS_CACHE_TTL.recentForm
          : SPORTS_CACHE_TTL.fixtures,
      emptyTtlMs: SPORTS_CACHE_TTL.fixtures,
    };
  }
  return { ttlMs: SPORTS_CACHE_TTL.fixtures, emptyTtlMs: SPORTS_CACHE_TTL.empty };
}

export function createSportsApi({ client, cache, providerName = client?.name || "api-football" } = {}) {
  if (!client || !cache) throw new Error("createSportsApi requiere client y cache.");

  async function getResource(resource, params = {}, context = {}) {
    const policy = cachePolicyFor(resource, context);
    const cached = await cache.getOrLoad({
      provider: providerName,
      resource,
      params,
      ...policy,
      loader: async () => {
        try {
          return await client.request(resource, params);
        } catch (error) {
          if (error instanceof SportsApiPlanRestrictionError) {
            return {
              data: [],
              results: 0,
              paging: { current: 1, total: 1 },
              meta: {
                provider: providerName,
                providerCalls: 1,
                providerError: error.code,
              },
            };
          }
          throw error;
        }
      },
    });

    const providerCalls = cached.meta.source === "provider" ? Number(cached.value?.meta?.providerCalls || 1) : 0;
    const cacheHits = cached.meta.source === "cache" ? 1 : 0;
    return {
      ...cached.value,
      meta: {
        ...(cached.value.meta || {}),
        source: cached.meta.source,
        stale: cached.meta.stale,
        cacheFetchedAt: cached.meta.fetchedAt?.toISOString?.() || cached.meta.fetchedAt || null,
        warning: cached.meta.warning || null,
        provider: providerName,
        providerCalls,
        cacheHits,
        providerUsage: providerUsage(providerName, { providerCalls, cacheHits }),
        providerError: cached.value?.meta?.providerError || null,
      },
    };
  }

  return {
    name: providerName,
    capabilities: client.capabilities || {},
    getResource,
    async searchTeams(search) {
      const query = typeof search === "string" ? search.trim() : "";
      if (query.length < 3 || query.length > 100) {
        throw new PredictionValidationError("El nombre del equipo debe tener entre 3 y 100 caracteres.");
      }
      return getResource("teams", { search: query });
    },
  };
}

let defaults;

export function getDefaultSportsServices() {
  if (!defaults) {
    const quotaStore = createPostgresQuotaStore();
    const quotaService = createQuotaService({ store: quotaStore });
    const theSportsDbQuotaService = createQuotaService({
      store: quotaStore,
      provider: "thesportsdb",
      budgets: {
        daily: Math.max(1, Number.parseInt(process.env.THESPORTSDB_DAILY_BUDGET || "10000", 10) || 10000),
        minute: Math.min(100, Math.max(1, Number.parseInt(process.env.THESPORTSDB_MINUTE_BUDGET || "90", 10) || 90)),
      },
      remainingReserve: 0,
    });
    const cache = createCacheService({ store: createPostgresCacheStore() });
    const apiFootballClient = createApiFootballClient({ quotaService });
    const theSportsDbClient = createTheSportsDbProvider({ quotaService: theSportsDbQuotaService });
    const apiFootball = createSportsApi({ client: apiFootballClient, cache });
    const theSportsDb = createSportsApi({ client: theSportsDbClient, cache });
    const providerMap = new Map([
      ["api-football", apiFootball],
      ["apifootball", apiFootball],
      ["thesportsdb", theSportsDb],
    ]);
    const requestedPrimary = String(process.env.SPORTS_CURRENT_PROVIDER || "thesportsdb").trim().toLowerCase();
    const requestedFallback = String(process.env.SPORTS_FALLBACK_PROVIDER || "api-football").trim().toLowerCase();
    const primary = providerMap.get(requestedPrimary) || theSportsDb;
    const fallback = providerMap.get(requestedFallback) || apiFootball;
    defaults = {
      quotaService,
      theSportsDbQuotaService,
      cache,
      client: apiFootballClient,
      apiFootballClient,
      theSportsDbClient,
      providers: { apiFootball, theSportsDb },
      sportsApi: createSportsProviderRouter({ primary, fallback }),
    };
  }
  return defaults;
}
