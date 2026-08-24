import { randomUUID } from "node:crypto";
import { ensureSchema } from "../../../lib/db.js";

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMatch(row) {
  return {
    id: row.id,
    matchKey: row.match_key,
    source: row.source,
    sourceMatchId: row.source_match_id,
    competition: row.competition,
    country: row.country,
    season: row.season,
    matchDate: new Date(row.match_date).toISOString(),
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeTeamNormalized: row.home_team_normalized,
    awayTeamNormalized: row.away_team_normalized,
    homeGoals: Number(row.home_goals),
    awayGoals: Number(row.away_goals),
    homeShots: numberOrNull(row.home_shots),
    awayShots: numberOrNull(row.away_shots),
    homeShotsOnTarget: numberOrNull(row.home_shots_on_target),
    awayShotsOnTarget: numberOrNull(row.away_shots_on_target),
    homeCorners: numberOrNull(row.home_corners),
    awayCorners: numberOrNull(row.away_corners),
    homeCards: numberOrNull(row.home_cards),
    awayCards: numberOrNull(row.away_cards),
    homeXg: numberOrNull(row.home_xg),
    awayXg: numberOrNull(row.away_xg),
    oddsHome: numberOrNull(row.odds_home),
    oddsDraw: numberOrNull(row.odds_draw),
    oddsAway: numberOrNull(row.odds_away),
    providerData: row.provider_data || {},
  };
}

function mapBacktestPrediction(row) {
  return {
    runId: row.run_id,
    matchId: row.match_id,
    modelVersion: row.model_version,
    market: row.market,
    selectionKey: row.selection_key,
    probability: Number(row.probability),
    fairOdds: numberOrNull(row.fair_odds),
    marketOdds: numberOrNull(row.market_odds),
    actualResult: Number(row.actual_result),
    predictedAtSimulated: new Date(row.predicted_at_simulated).toISOString(),
    datasetSplit: row.dataset_split,
    competition: row.competition,
    season: row.season,
    edge: numberOrNull(row.edge),
  };
}

function mapCalibrationBin(row) {
  return {
    market: row.market,
    binStart: Number(row.bin_start),
    binEnd: Number(row.bin_end),
    count: Number(row.prediction_count),
    meanProbability: numberOrNull(row.mean_probability),
    observedFrequency: numberOrNull(row.observed_frequency),
    difference: numberOrNull(row.calibration_difference),
  };
}

const matchColumns = [
  "id", "match_key", "source", "source_match_id", "competition", "country", "season", "match_date",
  "home_team", "away_team", "home_team_normalized", "away_team_normalized", "home_goals", "away_goals",
  "home_shots", "away_shots", "home_shots_on_target", "away_shots_on_target", "home_corners", "away_corners",
  "home_cards", "away_cards", "home_xg", "away_xg", "odds_home", "odds_draw", "odds_away", "provider_data", "raw_payload",
];

function matchValues(match) {
  return [
    match.id || randomUUID(), match.matchKey, match.source, match.sourceMatchId, match.competition, match.country,
    match.season, match.matchDate, match.homeTeam, match.awayTeam, match.homeTeamNormalized, match.awayTeamNormalized,
    match.homeGoals, match.awayGoals, match.homeShots, match.awayShots, match.homeShotsOnTarget, match.awayShotsOnTarget,
    match.homeCorners, match.awayCorners, match.homeCards, match.awayCards, match.homeXg, match.awayXg,
    match.oddsHome, match.oddsDraw, match.oddsAway, JSON.stringify(match.providerData || {}), JSON.stringify(match.rawPayload || {}),
  ];
}

async function insertMatchChunk(sql, matches) {
  const values = matches.flatMap(matchValues);
  const tuples = matches.map((_, rowIndex) => {
    const offset = rowIndex * matchColumns.length;
    const parameters = matchColumns.map((column, columnIndex) => {
      const placeholder = `$${offset + columnIndex + 1}`;
      return ["provider_data", "raw_payload"].includes(column) ? `${placeholder}::jsonb` : placeholder;
    });
    return `(${parameters.join(", ")})`;
  });
  return rowsFrom(await sql.query(
    `INSERT INTO sb_historical_matches (${matchColumns.join(", ")}) VALUES ${tuples.join(", ")}
     ON CONFLICT DO NOTHING RETURNING id, match_key`,
    values,
  ));
}

export function createHistoricalRepository({ getSql = ensureSchema } = {}) {
  return {
    async listAliases() {
      const sql = await getSql();
      return rowsFrom(await sql.query(
        `SELECT id, canonical_name, canonical_name_normalized, alias, alias_normalized, competition, country, source
         FROM sb_team_aliases ORDER BY alias_normalized`,
      )).map((row) => ({
        id: row.id,
        canonicalName: row.canonical_name,
        canonicalNameNormalized: row.canonical_name_normalized,
        alias: row.alias,
        aliasNormalized: row.alias_normalized,
        competition: row.competition,
        country: row.country,
        source: row.source,
      }));
    },

    async saveAlias(alias) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `INSERT INTO sb_team_aliases (
          id, canonical_name, canonical_name_normalized, alias, alias_normalized, competition, country, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
        RETURNING id`,
        [alias.id, alias.canonicalName, alias.canonicalNameNormalized, alias.alias, alias.aliasNormalized, alias.competition, alias.country, alias.source],
      ));
      return { inserted: rows.length === 1, id: rows[0]?.id || null };
    },

    async insertMatches(matches, { chunkSize = 100 } = {}) {
      const sql = await getSql();
      const insertedKeys = [];
      for (let index = 0; index < matches.length; index += chunkSize) {
        const inserted = await insertMatchChunk(sql, matches.slice(index, index + chunkSize));
        insertedKeys.push(...inserted.map((row) => row.match_key));
      }
      return { inserted: insertedKeys.length, duplicates: matches.length - insertedKeys.length, insertedKeys };
    },

    async saveMatchDetails(details) {
      if (!details.length) return { saved: 0 };
      const sql = await getSql();
      let saved = 0;
      for (const detail of details) {
        const rows = rowsFrom(await sql.query(
          `INSERT INTO sb_historical_match_details (match_key, source, events_payload, lineups_payload)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)
           ON CONFLICT (match_key) DO UPDATE SET
             source = EXCLUDED.source,
             events_payload = EXCLUDED.events_payload,
             lineups_payload = EXCLUDED.lineups_payload,
             updated_at = NOW()
           RETURNING match_key`,
          [detail.matchKey, detail.source, JSON.stringify(detail.events || []), JSON.stringify(detail.lineups || [])],
        ));
        saved += rows.length;
      }
      return { saved };
    },

    async listMatches({ competition = null, seasons = [], from = null, to = null, limit = 50000 } = {}) {
      const sql = await getSql();
      const conditions = [];
      const parameters = [];
      const add = (condition, value) => {
        parameters.push(value);
        conditions.push(condition.replace("?", `$${parameters.length}`));
      };
      if (competition) add("competition = ?", competition);
      if (seasons.length) add("season = ANY(?::text[])", seasons);
      if (from) add("match_date >= ?::timestamptz", from);
      if (to) add("match_date <= ?::timestamptz", to);
      parameters.push(limit);
      const rows = rowsFrom(await sql.query(
        `SELECT ${matchColumns.filter((column) => column !== "raw_payload").join(", ")}
         FROM sb_historical_matches
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY match_date ASC, id ASC LIMIT $${parameters.length}`,
        parameters,
      ));
      return rows.map(mapMatch);
    },

    async findCompletedBacktestRun({ modelVersion, datasetVersion, configHash }) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `SELECT id, report, prediction_count, completed_at
         FROM sb_model_backtest_runs
         WHERE model_version = $1 AND dataset_version = $2 AND config_hash = $3 AND completed_at IS NOT NULL
         ORDER BY completed_at DESC, id DESC LIMIT 1`,
        [modelVersion, datasetVersion, configHash],
      ));
      if (!rows[0]) return null;
      return {
        id: rows[0].id,
        report: rows[0].report || {},
        predictionCount: Number(rows[0].prediction_count || 0),
        completedAt: new Date(rows[0].completed_at).toISOString(),
      };
    },

    async listBacktestPredictions({ runId }) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `SELECT run_id, match_id, model_version, market, selection_key, probability, fair_odds, market_odds,
                actual_result, predicted_at_simulated, dataset_split, competition, season, edge
         FROM sb_model_backtests WHERE run_id = $1
         ORDER BY predicted_at_simulated, match_id, market, selection_key`,
        [runId],
      ));
      return rows.map(mapBacktestPrediction);
    },

    async listBacktestCalibrationBins({ runId }) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `SELECT market, bin_start, bin_end, prediction_count, mean_probability, observed_frequency, calibration_difference
         FROM sb_model_calibration_bins WHERE run_id = $1 ORDER BY market, bin_start`,
        [runId],
      ));
      return rows.map(mapCalibrationBin);
    },

    async createBacktestRun(run) {
      const sql = await getSql();
      const inserted = rowsFrom(await sql.query(
        `INSERT INTO sb_model_backtest_runs (
          id, model_version, dataset_version, config_hash, filters, competitions, seasons, model_config, match_count
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)
        ON CONFLICT (model_version, dataset_version, config_hash) DO NOTHING
        RETURNING id`,
        [run.id, run.modelVersion, run.datasetVersion, run.configHash, JSON.stringify(run.filters), JSON.stringify(run.competitions), JSON.stringify(run.seasons), JSON.stringify(run.modelConfig), run.matchCount],
      ));
      if (inserted[0]) return { created: true, id: inserted[0].id };
      const existing = rowsFrom(await sql.query(
        `SELECT id, completed_at FROM sb_model_backtest_runs
         WHERE model_version = $1 AND dataset_version = $2 AND config_hash = $3 LIMIT 1`,
        [run.modelVersion, run.datasetVersion, run.configHash],
      ));
      return { created: false, id: existing[0]?.id || null, completed: Boolean(existing[0]?.completed_at) };
    },

    async saveBacktestPredictions(predictions, { chunkSize = 200 } = {}) {
      if (!predictions.length) return { inserted: 0 };
      const sql = await getSql();
      const columns = ["id", "run_id", "match_id", "model_version", "market", "selection_key", "probability", "fair_odds", "market_odds", "actual_result", "predicted_at_simulated", "dataset_split", "competition", "season", "edge"];
      let inserted = 0;
      for (let index = 0; index < predictions.length; index += chunkSize) {
        const chunk = predictions.slice(index, index + chunkSize);
        const values = chunk.flatMap((prediction) => [randomUUID(), prediction.runId, prediction.matchId, prediction.modelVersion, prediction.market, prediction.selectionKey, prediction.probability, prediction.fairOdds, prediction.marketOdds, prediction.actualResult, prediction.predictedAtSimulated, prediction.datasetSplit, prediction.competition, prediction.season, prediction.edge]);
        const tuples = chunk.map((_, rowIndex) => `(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`);
        const rows = rowsFrom(await sql.query(
          `INSERT INTO sb_model_backtests (${columns.join(", ")}) VALUES ${tuples.join(", ")}
           ON CONFLICT DO NOTHING RETURNING id`,
          values,
        ));
        inserted += rows.length;
      }
      return { inserted };
    },

    async completeBacktestRun({ runId, report, bins, predictionCount }) {
      const sql = await getSql();
      for (const bin of bins) {
        await sql.query(
          `INSERT INTO sb_model_calibration_bins (
            run_id, market, bin_start, bin_end, prediction_count, mean_probability, observed_frequency, calibration_difference
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (run_id, market, bin_start) DO UPDATE SET
            prediction_count = EXCLUDED.prediction_count,
            mean_probability = EXCLUDED.mean_probability,
            observed_frequency = EXCLUDED.observed_frequency,
            calibration_difference = EXCLUDED.calibration_difference`,
          [runId, bin.market, bin.binStart, bin.binEnd, bin.count, bin.meanProbability, bin.observedFrequency, bin.difference],
        );
      }
      await sql.query(
        `UPDATE sb_model_backtest_runs SET prediction_count = $2, report = $3::jsonb, completed_at = NOW() WHERE id = $1`,
        [runId, predictionCount, JSON.stringify(report)],
      );
    },

    async updateBacktestReport({ runId, report }) {
      const sql = await getSql();
      await sql.query(
        `UPDATE sb_model_backtest_runs SET report = $2::jsonb WHERE id = $1`,
        [runId, JSON.stringify(report)],
      );
    },

    async saveModelParameters(rows) {
      if (!rows.length) return { inserted: 0 };
      const sql = await getSql();
      let inserted = 0;
      for (const row of rows) {
        const saved = rowsFrom(await sql.query(
          `INSERT INTO sb_model_parameters (
            id, model_version, dataset_version, market, competition, parameter_type,
            parameters, config_hash, trained_from, trained_to
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
          ON CONFLICT DO NOTHING RETURNING id`,
          [randomUUID(), row.modelVersion, row.datasetVersion, row.market || null, row.competition || null, row.parameterType, JSON.stringify(row.parameters), row.configHash, row.trainedFrom, row.trainedTo],
        ));
        inserted += saved.length;
      }
      return { inserted };
    },
  };
}
