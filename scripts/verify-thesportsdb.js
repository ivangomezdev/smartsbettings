import { toPublicPredictionError } from "../lib/predictions/errors.js";
import { createMatchService } from "../services/predictions/matchService.js";
import { getDefaultSportsServices } from "../services/predictions/sportsApi.js";

function utcDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function argumentsFrom(argv) {
  const options = Object.fromEntries(argv.filter((item) => item.startsWith("--") && item.includes("=")).map((item) => {
    const [key, ...value] = item.slice(2).split("=");
    return [key, value.join("=")];
  }));
  const query = argv.filter((item) => !item.startsWith("--")).join(" ").trim();
  const teams = query.split(/\s+(?:vs?\.?|contra)\s+/i).map((item) => item.trim()).filter(Boolean);
  if (teams.length !== 2) throw new Error('Usa el formato "Equipo local vs Equipo visitante".');
  const from = options.date || utcDate();
  return { teams, from, to: options.date ? options.date : utcDate(14) };
}

function sumUsage(usage, field) {
  return Object.values(usage || {}).reduce((sum, item) => sum + Number(item?.[field] || 0), 0);
}

try {
  const { teams, from, to } = argumentsFrom(process.argv.slice(2));
  const { sportsApi } = getDefaultSportsServices();
  const matchService = createMatchService({ sportsApi });
  const resolution = await matchService.resolveFixture({
    homeTeam: teams[0],
    awayTeam: teams[1],
    market: { code: "over_1_5", label: "Over 1.5 goles" },
    dateRange: { from, to, timeZone: "UTC" },
  });
  if (resolution.kind !== "resolved") {
    console.log(JSON.stringify({
      provider: { primary: sportsApi.primaryProviderName, fallback: sportsApi.fallbackProviderName },
      query: { homeTeam: teams[0], awayTeam: teams[1], from, to },
      resolution: {
        kind: resolution.kind,
        reason: resolution.reason,
        code: resolution.code || null,
        options: resolution.options || [],
      },
      providerUsage: resolution.providerUsage || null,
    }, null, 2));
    process.exitCode = 2;
  } else {
    const snapshot = await matchService.collectFixtureData(resolution);
    console.log(JSON.stringify({
      provider: { primary: sportsApi.primaryProviderName, fallback: sportsApi.fallbackProviderName, selected: resolution.provider },
      query: { homeTeam: teams[0], awayTeam: teams[1], from, to },
      event: snapshot.event,
      providerIds: {
        event: snapshot.providerIds,
        home: snapshot.homeTeam?.providerIds || null,
        away: snapshot.awayTeam?.providerIds || null,
      },
      coverage: snapshot.coverage,
      data: {
        homeRecent: snapshot.recentForm.home.sampleSize,
        awayRecent: snapshot.recentForm.away.sampleSize,
        homeLastSix: snapshot.lastSix.home.length,
        awayLastSix: snapshot.lastSix.away.length,
        matchStatistics: snapshot.matchStatistics.length,
        h2h: snapshot.h2h.length,
        injuries: snapshot.injuries.length,
        lineups: snapshot.lineups.length,
        timeline: snapshot.timeline.length,
        odds: snapshot.odds.length,
      },
      missingData: snapshot.missingData,
      providerUsage: snapshot.providerUsage,
      providerCalls: sumUsage(snapshot.providerUsage, "providerCalls"),
      cacheHits: sumUsage(snapshot.providerUsage, "cacheHits"),
      sources: snapshot.sources,
    }, null, 2));
  }
} catch (error) {
  const publicError = toPublicPredictionError(error);
  console.error(JSON.stringify({ error: publicError.error, code: publicError.code, retryable: publicError.retryable }, null, 2));
  process.exitCode = 1;
}
