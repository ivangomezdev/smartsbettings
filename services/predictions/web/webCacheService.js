import { createCacheService } from "../cacheService.js";
import { WEB_RESEARCH_CONFIG } from "./config.js";

export function createWebCacheService({ cache = createCacheService(), config = WEB_RESEARCH_CONFIG } = {}) {
  return {
    search({ provider, fixtureId, team, type, query, date, loader }) {
      return cache.getOrLoad({
        provider: `web:${provider}`,
        resource: `web-research:${type}`,
        params: { fixtureId, team, type, query, date },
        ttlMs: config.ttlMs[type] || config.ttlMs.team_news,
        emptyTtlMs: Math.min(config.ttlMs[type] || config.ttlMs.team_news, 15 * 60 * 1000),
        loader,
      });
    },
  };
}

