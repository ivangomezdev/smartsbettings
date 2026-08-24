import { loadFootballDataUk } from "../services/predictions/historical/providers/footballDataUk.js";
import { createHistoricalDataService } from "../services/predictions/historical/historicalDataService.js";
import { createHistoricalRepository } from "../services/predictions/historical/historicalRepository.js";
import { createBacktestService } from "../services/predictions/historical/backtestService.js";
import { classifyV1Markets } from "../lib/predictions/historical/benchmark.js";
import { commaList, parseCliArguments } from "./historical-cli.js";

const DEFAULT_SEASONS = ["2019-2020", "2020-2021", "2021-2022", "2022-2023", "2023-2024"];
const COMPETITIONS = Object.freeze([
  { code: "E0", name: "Premier League", country: "England" },
  { code: "SP1", name: "La Liga", country: "Spain" },
  { code: "D1", name: "Bundesliga", country: "Germany" },
  { code: "I1", name: "Serie A", country: "Italy" },
  { code: "F1", name: "Ligue 1", country: "France" },
]);

function compactMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([market, value]) => [market, {
    n: value.n,
    brier: value.brier,
    logLoss: value.logLoss,
    accuracy: value.accuracy,
    calibrationError: value.calibrationError ?? null,
    bySelection: market === "one_x_two" ? Object.fromEntries(Object.entries(value.bySelection || {}).map(([selection, item]) => [selection, {
      n: item.n,
      brier: item.brier,
      logLoss: item.logLoss,
      accuracy: item.accuracy,
      calibrationError: item.calibrationError,
    }])) : undefined,
  }]));
}

function compactReport(report) {
  return {
    runId: report.runId,
    datasetVersion: report.datasetVersion,
    matchCount: report.matchCount,
    splitCounts: report.splitCounts,
    insufficientData: report.insufficientData,
    metrics: compactMetrics(report.metrics),
    baselines: {
      globalFrequency: compactMetrics(report.baselines.globalFrequency),
      recentForm: compactMetrics(report.baselines.recentForm),
    },
    bySeason: Object.fromEntries(Object.entries(report.bySeason || {}).map(([season, metrics]) => [season, compactMetrics(metrics)])),
    historicalValue: report.historicalValue,
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  const seasons = commaList(options.seasons).length ? commaList(options.seasons) : DEFAULT_SEASONS;
  if (seasons.length < 3) throw new RangeError("El benchmark requiere al menos tres temporadas cronológicas.");
  const selectedCodes = commaList(options.competitions);
  const competitions = selectedCodes.length ? COMPETITIONS.filter((item) => selectedCodes.includes(item.code)) : COMPETITIONS;
  if (!competitions.length) throw new RangeError("No se seleccionó ninguna competición soportada.");
  const repository = createHistoricalRepository();
  const aliases = await repository.listAliases();
  const imports = [];
  if (options.skipImport !== true) {
    const requests = competitions.flatMap((competition) => seasons.map((season) => ({ competition, season })));
    const service = createHistoricalDataService({ repository });
    const imported = await mapWithConcurrency(requests, 3, async ({ competition, season }) => {
      const normalized = await loadFootballDataUk({ league: competition.code, season, country: competition.country, aliases });
      const result = await service.importNormalized(normalized, { dryRun: options.dryRun === true, chunkSize: 100 });
      return { competition: competition.code, season, ...result };
    });
    imports.push(...imported);
  }
  if (options.dryRun === true) {
    process.stdout.write(`${JSON.stringify({ imports }, null, 2)}\n`);
    return;
  }

  const split = {
    trainSeasons: [seasons[0]],
    validationSeasons: [seasons[1]],
    testSeasons: seasons.slice(2),
  };
  const leagueReports = {};
  const allMatches = [];
  for (const competition of competitions) {
    const matches = await repository.listMatches({ competition: competition.code, seasons });
    allMatches.push(...matches);
    const { report } = await createBacktestService({ repository }).run({
      matches,
      split,
      filters: { competition: competition.code, seasons, benchmark: "checkpoint-2d" },
      persist: options.persist !== false,
    });
    leagueReports[competition.code] = report;
  }
  const { report: globalReport, calibrationBins } = await createBacktestService({ repository }).run({
    matches: allMatches,
    split,
    filters: { competitions: competitions.map((item) => item.code), seasons, benchmark: "checkpoint-2d-global" },
    persist: options.persist !== false,
  });
  const classification = classifyV1Markets({ globalReport, leagueReports });
  if (options.persist !== false) {
    await repository.updateBacktestReport({
      runId: globalReport.runId,
      report: { ...globalReport, marketClassification: classification },
    });
  }
  process.stdout.write(`${JSON.stringify({
    imports,
    competitions: competitions.map((item) => ({ code: item.code, name: item.name })),
    seasons,
    totalMatches: allMatches.length,
    global: compactReport(globalReport),
    leagues: Object.fromEntries(Object.entries(leagueReports).map(([code, report]) => [code, compactReport(report)])),
    classification,
    nonEmptyCalibrationBins: calibrationBins.filter((bin) => bin.count > 0),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Benchmark fallido: ${error.message}\n`);
  process.exitCode = 1;
});
