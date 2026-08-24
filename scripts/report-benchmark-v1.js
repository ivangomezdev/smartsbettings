import { ensureSchema } from "../lib/db.js";
import { classifyV1Markets, V1_STABILITY_MARKETS } from "../lib/predictions/historical/benchmark.js";

function selectMetrics(metrics) {
  return Object.fromEntries(V1_STABILITY_MARKETS.map((market) => {
    const value = metrics?.[market] || {};
    return [market, {
      n: value.n ?? 0,
      brier: value.brier ?? null,
      logLoss: value.logLoss ?? null,
      accuracy: value.accuracy ?? null,
      calibrationError: value.calibrationError ?? null,
      bySelection: market === "one_x_two" ? Object.fromEntries(Object.entries(value.bySelection || {}).map(([selection, item]) => [selection, {
        n: item.n,
        brier: item.brier,
        logLoss: item.logLoss,
        accuracy: item.accuracy,
        calibrationError: item.calibrationError,
      }])) : undefined,
    }];
  }));
}

function compact(report) {
  return {
    runId: report.runId,
    datasetVersion: report.datasetVersion,
    matchCount: report.matchCount,
    splitCounts: report.splitCounts,
    insufficientData: report.insufficientData,
    metrics: selectMetrics(report.metrics),
    baselines: {
      globalFrequency: selectMetrics(report.baselines.globalFrequency),
      recentForm: selectMetrics(report.baselines.recentForm),
    },
    seasons: Object.fromEntries(Object.entries(report.bySeason || {}).map(([season, metrics]) => [season, selectMetrics(metrics)])),
    historicalValue: report.historicalValue,
  };
}

async function main() {
  const sql = await ensureSchema();
  const rows = await sql.query(
    `SELECT DISTINCT ON (filters->>'benchmark', COALESCE(filters->>'competition', 'global'))
       id, filters, report
     FROM sb_model_backtest_runs
     WHERE completed_at IS NOT NULL
       AND filters->>'benchmark' IN ('checkpoint-2d', 'checkpoint-2d-global')
     ORDER BY filters->>'benchmark', COALESCE(filters->>'competition', 'global'), completed_at DESC`,
  );
  const globalRow = rows.find((row) => row.filters?.benchmark === "checkpoint-2d-global");
  const leagueRows = rows.filter((row) => row.filters?.benchmark === "checkpoint-2d");
  if (!globalRow || leagueRows.length !== 5) throw new Error("No se encontraron las seis ejecuciones completas de Checkpoint 2D.");
  const leagueReports = Object.fromEntries(leagueRows.map((row) => [row.filters.competition, row.report]));
  const classification = classifyV1Markets({ globalReport: globalRow.report, leagueReports });
  await sql.query(
    `UPDATE sb_model_backtest_runs SET report = $2::jsonb WHERE id = $1`,
    [globalRow.id, JSON.stringify({ ...globalRow.report, marketClassification: classification })],
  );
  process.stdout.write(`${JSON.stringify({
    global: compact(globalRow.report),
    leagues: Object.fromEntries(Object.entries(leagueReports).map(([competition, report]) => [competition, compact(report)])),
    classification,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Reporte fallido: ${error.message}\n`);
  process.exitCode = 1;
});
