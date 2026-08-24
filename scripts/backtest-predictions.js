import { BACKTEST_MARKETS, createBacktestService } from "../services/predictions/historical/backtestService.js";
import { createHistoricalRepository } from "../services/predictions/historical/historicalRepository.js";
import { commaList, parseCliArguments, positiveInteger } from "./historical-cli.js";

function compactMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([market, value]) => [market, {
    n: value.n,
    brier: value.brier,
    logLoss: value.logLoss,
    accuracy: value.accuracy,
    calibrationError: value.calibrationError,
  }]));
}

function compactBaselines(baselines) {
  return {
    globalFrequency: compactMetrics(baselines.globalFrequency),
    recentForm: compactMetrics(baselines.recentForm),
    comparisonToGlobal: baselines.comparisonToGlobal,
    comparisonToRecent: baselines.comparisonToRecent,
  };
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  const model = options.model || "football-poisson-v1";
  if (model !== "football-poisson-v1") throw new RangeError(`Modelo no disponible para 2C: ${model}`);
  const markets = commaList(options.market);
  const repository = createHistoricalRepository();
  const filters = {
    competition: options.competition || null,
    seasons: commaList(options.seasons),
    from: options.from || null,
    to: options.to || null,
    limit: positiveInteger(options.limit, 50000),
  };
  const matches = await repository.listMatches(filters);
  if (!matches.length) throw new Error("No hay partidos históricos para los filtros solicitados.");
  const split = {
    trainThrough: options.trainThrough || null,
    validationThrough: options.validationThrough || null,
    trainSeasons: commaList(options.trainSeasons),
    validationSeasons: commaList(options.validationSeasons),
    testSeasons: commaList(options.testSeasons),
  };
  const result = await createBacktestService({ repository }).run({
    matches,
    markets: markets.length ? markets : BACKTEST_MARKETS,
    split,
    filters,
    persist: options.persist !== false,
  });
  const nonEmptyBins = result.calibrationBins.filter((bin) => bin.count > 0);
  process.stdout.write(`${JSON.stringify({
    ...result.report,
    metrics: compactMetrics(result.report.metrics),
    baselines: compactBaselines(result.report.baselines),
    byCompetition: undefined,
    bySeason: undefined,
    calibrationBins: nonEmptyBins,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Backtest fallido: ${error.message}\n`);
  process.exitCode = 1;
});
