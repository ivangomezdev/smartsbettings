import { parsePredictionQuery } from "../lib/predictions/parser.js";
import { toPublicPredictionError } from "../lib/predictions/errors.js";
import { getDefaultSportsServices } from "../services/predictions/sportsApi.js";

const query = process.argv.slice(2).join(" ").trim() || "Real Madrid vs Sevilla Over 1.5";
const parsed = parsePredictionQuery(query);

console.log(JSON.stringify({ query, parsed }, null, 2));

if (parsed.errors.length || parsed.missingFields.length) {
  console.log(JSON.stringify({ liveCheck: { skipped: true, reason: "La consulta necesita corrección o aclaración." } }, null, 2));
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL || !process.env.API_FOOTBALL_KEY) {
  const missing = [
    !process.env.DATABASE_URL ? "DATABASE_URL" : null,
    !process.env.API_FOOTBALL_KEY ? "API_FOOTBALL_KEY" : null,
  ].filter(Boolean);
  console.log(JSON.stringify({
    liveCheck: {
      skipped: true,
      reason: `Configura ${missing.join(" y ")} en .env.local para probar proveedor, caché y cuota.`,
    },
  }, null, 2));
} else {
  try {
    const { sportsApi, quotaService } = getDefaultSportsServices();
    const [home, away] = await Promise.all([
      sportsApi.searchTeams(parsed.homeTeam),
      sportsApi.searchTeams(parsed.awayTeam),
    ]);
    const summarize = (result) => ({
      source: result.meta.source,
      stale: result.meta.stale,
      results: result.results,
      teams: result.data.slice(0, 5).map((item) => ({
        id: item.team?.id ?? null,
        name: item.team?.name ?? null,
        country: item.team?.country ?? null,
      })),
    });

    console.log(JSON.stringify({
      liveCheck: {
        skipped: false,
        home: summarize(home),
        away: summarize(away),
        quota: await quotaService.getStatus(),
      },
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ liveCheck: { skipped: false, ...toPublicPredictionError(error) } }, null, 2));
    process.exitCode = 1;
  }
}
