import { createWebResearchService } from "../services/predictions/web/webResearchService.js";
import { createWebSearchProviderFromEnvironment } from "../services/predictions/web/webSearchProvider.js";

const args = process.argv.slice(2);
const repeat = args.includes("--repeat");
const dateArgument = args.find((item) => item.startsWith("--date="))?.slice("--date=".length) || null;
const input = args.filter((item) => item !== "--repeat" && !item.startsWith("--date=")).join(" ").trim();
const [home = "Home team", away = "Away team"] = input.split(/\s+vs\.?\s+/i).map((item) => item.trim());
const now = new Date();
const fixtureDate = dateArgument && Number.isFinite(Date.parse(dateArgument))
  ? new Date(dateArgument).toISOString()
  : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
const snapshot = {
  event: {
    fixtureId: `manual:${home}:${away}:${fixtureDate.slice(0, 10)}`,
    date: fixtureDate,
    homeTeam: { name: home },
    awayTeam: { name: away },
  },
  homeTeam: { name: home },
  awayTeam: { name: away },
  recentForm: { home: { matches: [] }, away: { matches: [] } },
  injuries: [],
  lineups: [],
  missingData: [{ section: "injuries" }, { section: "lineups" }, { section: "recentForm" }],
};
const provider = createWebSearchProviderFromEnvironment();
const service = createWebResearchService({ provider });

function safeRun(context) {
  return {
    queriesExecuted: context.queryExecutions,
    sources: context.sources,
    evidence: context.evidence,
    conflicts: context.conflicts,
    requestSources: {
      provider: context.usage.providerCalls,
      cache: context.usage.cacheHits,
    },
    usage: context.usage,
    warnings: context.warnings,
  };
}

try {
  const runs = [];
  runs.push(safeRun(await service.research({ snapshot, explicitDeep: true })));
  if (repeat) runs.push(safeRun(await service.research({ snapshot, explicitDeep: true })));
  process.stdout.write(`${JSON.stringify({
    version: "football-web-enrichment-v1",
    provider: { name: provider.name, configured: provider.configured },
    fixture: { home, away, date: fixtureDate },
    runs,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.code || "WEB_RESEARCH_FAILED" })}\n`);
  process.exitCode = 1;
}

