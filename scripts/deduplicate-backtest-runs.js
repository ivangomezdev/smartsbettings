import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { getDatabase } from "../lib/db.js";

const apply = process.argv.includes("--apply");
const sql = getDatabase();
const gzipAsync = promisify(gzip);
const predictionColumns = [
  "match_id", "model_version", "market", "selection_key", "probability", "fair_odds", "market_odds",
  "actual_result", "predicted_at_simulated", "dataset_split", "competition", "season", "edge",
];
const binColumns = [
  "market", "bin_start", "bin_end", "prediction_count", "mean_probability", "observed_frequency", "calibration_difference",
];

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reportDifferencePaths(left, right, current = "", output = []) {
  if (output.length >= 200 || Object.is(left, right)) return output;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) {
    output.push(current || "$");
    return output;
  }
  if (Array.isArray(left)) {
    if (left.length !== right.length) output.push(`${current}.length`);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      reportDifferencePaths(left[index], right[index], `${current}[${index}]`, output);
    }
    return output;
  }
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    reportDifferencePaths(left[key], right[key], current ? `${current}.${key}` : key, output);
  }
  return output;
}

async function relationSnapshot() {
  const rows = await sql.query(
    `SELECT pg_database_size(current_database())::bigint AS database_bytes,
            pg_total_relation_size('sb_model_backtests')::bigint AS backtests_bytes,
            pg_total_relation_size('sb_model_backtest_runs')::bigint AS runs_bytes,
            pg_total_relation_size('sb_model_calibration_bins')::bigint AS bins_bytes,
            (SELECT count(*)::bigint FROM sb_model_backtests) AS prediction_rows,
            (SELECT count(*)::int FROM sb_model_backtest_runs) AS run_rows,
            (SELECT count(*)::bigint FROM sb_model_calibration_bins) AS bin_rows,
            (SELECT count(*)::bigint FROM sb_users) AS user_rows,
            (SELECT count(*)::bigint FROM sb_prediction_conversations) AS conversation_rows,
            (SELECT count(*)::bigint FROM sb_historical_matches) AS historical_match_rows`,
  );
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]));
}

async function validatePair(canonicalId, duplicateId) {
  const predictionList = predictionColumns.join(", ");
  const binList = binColumns.join(", ");
  const rows = await sql.query(
    `SELECT
       NOT EXISTS (
         SELECT 1 FROM (
           (SELECT ${predictionList} FROM sb_model_backtests WHERE run_id = $1
            EXCEPT SELECT ${predictionList} FROM sb_model_backtests WHERE run_id = $2)
           UNION ALL
           (SELECT ${predictionList} FROM sb_model_backtests WHERE run_id = $2
            EXCEPT SELECT ${predictionList} FROM sb_model_backtests WHERE run_id = $1)
         ) prediction_differences
       ) AS predictions_equal,
       NOT EXISTS (
         SELECT 1 FROM (
           (SELECT ${binList} FROM sb_model_calibration_bins WHERE run_id = $1
            EXCEPT SELECT ${binList} FROM sb_model_calibration_bins WHERE run_id = $2)
           UNION ALL
           (SELECT ${binList} FROM sb_model_calibration_bins WHERE run_id = $2
            EXCEPT SELECT ${binList} FROM sb_model_calibration_bins WHERE run_id = $1)
         ) bin_differences
       ) AS calibration_bins_equal,
       (SELECT count(*)::bigint FROM sb_model_backtests WHERE run_id = $2) AS duplicate_prediction_rows,
       (SELECT count(*)::bigint FROM sb_model_calibration_bins WHERE run_id = $2) AS duplicate_bin_rows`,
    [canonicalId, duplicateId],
  );
  return {
    predictionsEqual: rows[0].predictions_equal,
    calibrationBinsEqual: rows[0].calibration_bins_equal,
    duplicatePredictionRows: Number(rows[0].duplicate_prediction_rows),
    duplicateBinRows: Number(rows[0].duplicate_bin_rows),
  };
}

const before = await relationSnapshot();
const duplicateRuns = await sql.query(
  `SELECT r.id, r.model_version, r.dataset_version, r.config_hash, r.filters, r.competitions, r.seasons,
          r.model_config, r.match_count, r.prediction_count, r.report, r.started_at, r.completed_at
   FROM sb_model_backtest_runs r
   JOIN (
     SELECT model_version, dataset_version, config_hash
     FROM sb_model_backtest_runs
     GROUP BY model_version, dataset_version, config_hash
     HAVING count(*) > 1
   ) duplicates USING (model_version, dataset_version, config_hash)
   ORDER BY r.model_version, r.dataset_version, r.config_hash,
            r.completed_at DESC NULLS LAST, r.started_at DESC, r.id DESC`,
);

const grouped = Map.groupBy(duplicateRuns, (run) => `${run.model_version}|${run.dataset_version}|${run.config_hash}`);
const groups = [];
for (const runs of grouped.values()) {
  const [canonical, ...duplicates] = runs;
  const duplicateEntries = [];
  for (const duplicate of duplicates) {
    const validation = await validatePair(canonical.id, duplicate.id);
    const reportDifferences = reportDifferencePaths(canonical.report, duplicate.report);
    duplicateEntries.push({
      run: duplicate,
      validation: {
        ...validation,
        identityEqual: ["model_version", "dataset_version", "config_hash", "filters", "competitions", "seasons", "model_config", "match_count"]
          .every((key) => JSON.stringify(canonical[key]) === JSON.stringify(duplicate[key])),
        reportEqual: sha256(canonical.report) === sha256(duplicate.report),
        reportDifferencePaths: reportDifferences,
        reportArchivedInManifest: true,
      },
    });
  }
  groups.push({
    identity: { modelVersion: canonical.model_version, datasetVersion: canonical.dataset_version, configHash: canonical.config_hash },
    canonicalRun: canonical,
    duplicates: duplicateEntries,
  });
}

const candidates = groups.flatMap((group) => group.duplicates.map((entry) => ({
  canonicalId: group.canonicalRun.id,
  duplicateId: entry.run.id,
  ...entry.validation,
})));
const eligible = candidates.filter((candidate) => candidate.identityEqual && candidate.predictionsEqual && candidate.calibrationBinsEqual);
const totals = {
  duplicateIdentityGroups: groups.length,
  canonicalRuns: groups.length,
  duplicateRuns: candidates.length,
  eligibleDuplicateRuns: eligible.length,
  duplicatePredictionRows: eligible.reduce((sum, item) => sum + item.duplicatePredictionRows, 0),
  duplicateCalibrationBins: eligible.reduce((sum, item) => sum + item.duplicateBinRows, 0),
};
const estimatedRecoverableBytes = Math.round(
  Number(before.backtests_bytes) * totals.duplicatePredictionRows / Math.max(1, Number(before.prediction_rows))
  + Number(before.runs_bytes) * totals.duplicateRuns / Math.max(1, Number(before.run_rows))
  + Number(before.bins_bytes) * totals.duplicateCalibrationBins / Math.max(1, Number(before.bin_rows)),
);

const generatedAt = new Date().toISOString();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = path.join(root, "artifacts", "storage");
const fileStamp = generatedAt.replaceAll(":", "-").replace(".", "-");
const manifestPath = path.join(artifactDirectory, `backtest-duplicate-manifest-${fileStamp}.json`);
const archivePath = path.join(artifactDirectory, `backtest-duplicate-archive-${fileStamp}.json.gz`);
const manifest = {
  version: "backtest-deduplication-manifest-v1",
  generatedAt,
  mode: apply ? "apply-requested" : "dry-run",
  canonicalSelection: "latest completed_at, then latest started_at, then id",
  equivalencePolicy: {
    identity: "model_version + dataset_version + config_hash and exact identity metadata",
    predictions: `bidirectional SQL EXCEPT over ${predictionColumns.join(", ")}`,
    calibrationBins: `bidirectional SQL EXCEPT over ${binColumns.join(", ")}`,
    reports: "full JSONB archived here; differences do not authorize deletion without equal prediction facts and bins",
  },
  before,
  totals: { ...totals, estimatedRecoverableBytes },
  groups,
};
const summarizeRun = ({ report, ...run }) => ({
  ...run,
  reportSha256: sha256(report),
  reportBytes: Buffer.byteLength(JSON.stringify(report)),
});
const summaryManifest = {
  ...manifest,
  groups: groups.map((group) => ({
    identity: group.identity,
    canonicalRun: summarizeRun(group.canonicalRun),
    duplicates: group.duplicates.map((entry) => ({ run: summarizeRun(entry.run), validation: entry.validation })),
  })),
  fullArchive: path.relative(root, archivePath).replaceAll("\\", "/"),
};
await mkdir(artifactDirectory, { recursive: true });
await writeFile(archivePath, await gzipAsync(Buffer.from(`${JSON.stringify(manifest)}\n`)), { flag: "wx" });
await writeFile(manifestPath, `${JSON.stringify(summaryManifest, null, 2)}\n`, { flag: "wx" });

let outcome = { applied: false };
if (apply) {
  if (eligible.length !== candidates.length) {
    throw new Error(`Manifiesto creado, pero ${candidates.length - eligible.length} runs no cumplen equivalencia; no se eliminó nada.`);
  }
  const parameters = eligible.flatMap((entry) => [entry.canonicalId, entry.duplicateId]);
  const pairs = eligible.map((_, index) => `($${index * 2 + 1}::text, $${index * 2 + 2}::text)`).join(", ");
  const deleted = eligible.length ? await sql.query(
    `WITH pairs(canonical_id, duplicate_id) AS (VALUES ${pairs}),
     validated AS (
       SELECT pairs.* FROM pairs
       WHERE NOT EXISTS (
         SELECT 1 FROM (
           (SELECT ${predictionColumns.join(", ")} FROM sb_model_backtests b WHERE b.run_id = pairs.canonical_id
            EXCEPT SELECT ${predictionColumns.join(", ")} FROM sb_model_backtests b WHERE b.run_id = pairs.duplicate_id)
           UNION ALL
           (SELECT ${predictionColumns.join(", ")} FROM sb_model_backtests b WHERE b.run_id = pairs.duplicate_id
            EXCEPT SELECT ${predictionColumns.join(", ")} FROM sb_model_backtests b WHERE b.run_id = pairs.canonical_id)
         ) prediction_differences
       )
       AND NOT EXISTS (
         SELECT 1 FROM (
           (SELECT ${binColumns.join(", ")} FROM sb_model_calibration_bins b WHERE b.run_id = pairs.canonical_id
            EXCEPT SELECT ${binColumns.join(", ")} FROM sb_model_calibration_bins b WHERE b.run_id = pairs.duplicate_id)
           UNION ALL
           (SELECT ${binColumns.join(", ")} FROM sb_model_calibration_bins b WHERE b.run_id = pairs.duplicate_id
            EXCEPT SELECT ${binColumns.join(", ")} FROM sb_model_calibration_bins b WHERE b.run_id = pairs.canonical_id)
         ) bin_differences
       )
     ), deleted AS (
       DELETE FROM sb_model_backtest_runs runs
       USING validated
       WHERE runs.id = validated.duplicate_id
       RETURNING runs.id
     ) SELECT id FROM deleted ORDER BY id`,
    parameters,
  ) : [];
  if (deleted.length !== eligible.length) {
    throw new Error(`Solo se eliminaron ${deleted.length} de ${eligible.length} runs validados; no se creó el índice preventivo.`);
  }
  await sql.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS sb_model_backtest_runs_identity_idx ON sb_model_backtest_runs (model_version, dataset_version, config_hash)",
  );
  const after = await relationSnapshot();
  outcome = {
    applied: true,
    deletedRunIds: deleted.map((row) => row.id),
    deletedRuns: deleted.length,
    deletedPredictionRows: totals.duplicatePredictionRows,
    deletedCalibrationBins: totals.duplicateCalibrationBins,
    runsRemaining: Number(after.run_rows),
    estimatedRecoverableBytes,
    physicalRewriteExecuted: false,
    before,
    after,
  };
  const outcomePath = manifestPath.replace("manifest-", "outcome-");
  await writeFile(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`, { flag: "wx" });
  outcome.outcomePath = path.relative(root, outcomePath).replaceAll("\\", "/");
}

process.stdout.write(`${JSON.stringify({
  manifestPath: path.relative(root, manifestPath).replaceAll("\\", "/"),
  archivePath: path.relative(root, archivePath).replaceAll("\\", "/"),
  totals: { ...totals, estimatedRecoverableBytes },
  outcome,
}, null, 2)}\n`);
