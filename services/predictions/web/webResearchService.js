import { FOOTBALL_WEB_ENRICHMENT_V1, WEB_RESEARCH_CONFIG } from "./config.js";
import { resolveEvidence } from "./conflictResolver.js";
import { extractEvidence } from "./evidenceExtractor.js";
import { createResearchPlan } from "./researchPlanner.js";
import { createWebCacheService } from "./webCacheService.js";
import { createWebSearchProviderFromEnvironment } from "./webSearchProvider.js";

const CATEGORY = Object.freeze({
  injury: "injuries", suspension: "suspensions", lineup_confirmed: "lineups", lineup_probable: "lineups",
  rotation: "rotations", player_return: "playerReturns", team_news: "teamNews", coach_statement: "coachStatements",
  weather: "weather", fixture_result: "fixtureResults", venue_change: "venueChanges", schedule_congestion: "scheduleCongestion",
});

function emptyContext({ provider, now, plan = [] }) {
  return {
    version: FOOTBALL_WEB_ENRICHMENT_V1,
    config: null,
    generatedAt: now.toISOString(),
    researchProvider: provider.name,
    researchPlan: plan,
    queryExecutions: [],
    usage: {
      searchesPlanned: 0,
      searchesExecuted: 0,
      resultsProcessed: 0,
      cacheHits: 0,
      providerCalls: 0,
    },
    injuries: [], suspensions: [], lineups: [], rotations: [], playerReturns: [], teamNews: [], coachStatements: [],
    weather: [], fixtureResults: [], venueChanges: [], scheduleCongestion: [], evidence: [], conflicts: [], warnings: [], sources: [],
  };
}

function hasSufficientEvidence(type, evidence) {
  const matching = evidence.filter((item) => item.type === type);
  if (matching.some((item) => item.source.tier === 1 && item.status !== "UNKNOWN")) return true;
  const reliable = matching.filter((item) => item.source.tier <= 2 && item.status !== "UNKNOWN");
  const corroborated = new Map();
  for (const item of reliable) {
    const key = `${item.subject.toLowerCase()}|${item.status}`;
    const urls = corroborated.get(key) || new Set();
    urls.add(item.source.url);
    corroborated.set(key, urls);
  }
  return [...corroborated.values()].some((urls) => urls.size >= 2);
}

function sourceFromEvidence(item) {
  return {
    name: item.source.name,
    url: item.source.url,
    sourceType: "web",
    tier: item.source.tier,
    publishedAt: item.source.publishedAt,
    retrievedAt: item.source.retrievedAt,
    usedFor: [item.type],
  };
}

function deduplicateSources(evidence) {
  const sources = new Map();
  for (const item of evidence) {
    const current = sources.get(item.source.url) || sourceFromEvidence(item);
    current.usedFor = [...new Set([...current.usedFor, item.type])];
    sources.set(item.source.url, current);
  }
  return [...sources.values()];
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Web research timeout"), { code: "WEB_RESEARCH_TIMEOUT" })), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

export function createWebResearchService({
  provider = createWebSearchProviderFromEnvironment(),
  cache = null,
  config = WEB_RESEARCH_CONFIG,
  now = () => new Date(),
} = {}) {
  const webCache = cache || (provider.configured ? createWebCacheService({ config }) : null);

  async function research({ snapshot, explicitDeep = false, structuredConflicts = [] } = {}) {
    const startedAt = now();
    const plan = createResearchPlan({ snapshot, explicitDeep, structuredConflicts, now: startedAt });
    const context = emptyContext({ provider, now: startedAt, plan });
    context.config = {
      maxSearchesPerAnalysis: config.maxSearchesPerAnalysis,
      maxResultsProcessed: config.maxResultsProcessed,
      maxResultsPerSearch: config.maxResultsPerSearch || 3,
      timeoutMs: config.timeoutMs,
      ttlMs: config.ttlMs,
      maxAgeMs: config.maxAgeMs,
      sourceTierPolicyVersion: "source-tiers-v1",
    };
    const tasks = plan.flatMap((section) => section.queries.map((query) => ({ type: section.type, query, reason: section.reason })));
    context.usage.searchesPlanned = tasks.length;
    if (!plan.length) return context;
    if (!provider.configured) {
      context.warnings.push({ code: "WEB_PROVIDER_NOT_CONFIGURED" });
      return context;
    }

    const rawEvidence = [];
    const completedTypes = new Set();
    let processed = 0;
    const deadline = Date.now() + config.timeoutMs;
    for (const task of tasks) {
      if (completedTypes.has(task.type)) continue;
      if (context.usage.searchesExecuted >= config.maxSearchesPerAnalysis) {
        context.warnings.push({
          code: "WEB_RESEARCH_BUDGET_EXHAUSTED",
          attempted: tasks.length,
          allowed: config.maxSearchesPerAnalysis,
        });
        break;
      }
      if (processed >= config.maxResultsProcessed) {
        context.warnings.push({ code: "WEB_RESEARCH_BUDGET_EXHAUSTED", processed, allowed: config.maxResultsProcessed });
        break;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        context.warnings.push({ code: "WEB_RESEARCH_TIMEOUT" });
        break;
      }
      const team = snapshot.homeTeam?.name || snapshot.event?.homeTeam?.name || null;
      const request = {
        query: task.query,
        type: task.type,
        maxResults: Math.min(config.maxResultsPerSearch || 3, config.maxResultsProcessed - processed),
      };
      context.usage.searchesExecuted += 1;
      try {
        const response = await withTimeout(webCache.search({
            provider: provider.name,
            fixtureId: snapshot.event?.fixtureId,
            team,
            type: task.type,
            query: task.query,
            date: String(snapshot.event?.date || startedAt.toISOString()).slice(0, 10),
            loader: () => {
              context.usage.providerCalls += 1;
              return provider.search(request);
            },
          }), remainingMs);
        if (response.meta?.source === "cache") context.usage.cacheHits += 1;
        context.queryExecutions.push({
          type: task.type,
          query: task.query,
          source: response.meta?.source || "provider",
          resultCount: Array.isArray(response.value) ? response.value.length : 0,
        });
        for (const result of (response.value || []).slice(0, config.maxResultsProcessed - processed)) {
          processed += 1;
          const extracted = extractEvidence({ result, type: task.type, team, now: startedAt, config });
          if (extracted.evidence) rawEvidence.push(extracted.evidence);
          else if (extracted.warning) context.warnings.push({ code: extracted.warning, type: task.type });
        }
        if (hasSufficientEvidence(task.type, rawEvidence)) completedTypes.add(task.type);
      } catch (error) {
        const timeout = error.code === "WEB_RESEARCH_TIMEOUT" || error.code === "BRAVE_SEARCH_TIMEOUT";
        context.queryExecutions.push({
          type: task.type,
          query: task.query,
          source: "error",
          resultCount: 0,
          errorCode: error.code || "WEB_RESEARCH_ERROR",
        });
        context.warnings.push({
          code: timeout ? "WEB_RESEARCH_TIMEOUT" : "WEB_RESEARCH_PARTIAL",
          type: task.type,
          providerCode: error.code || null,
        });
        if (timeout) {
          context.warnings.push({ code: "WEB_RESEARCH_PARTIAL", type: task.type });
          break;
        }
      }
    }
    context.usage.resultsProcessed = processed;
    const resolved = resolveEvidence(rawEvidence);
    context.evidence = resolved.evidence;
    context.conflicts = resolved.conflicts;
    context.warnings.push(...resolved.warnings);
    for (const item of resolved.evidence) (context[CATEGORY[item.type]] || context.teamNews).push(item);
    context.sources = deduplicateSources(resolved.evidence);
    return context;
  }

  return {
    research,
    async enrichSnapshot(input) {
      const webContext = await research(input);
      return { ...input.snapshot, enrichment: { ...(input.snapshot.enrichment || {}), web: webContext } };
    },
  };
}
