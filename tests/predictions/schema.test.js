import test from "node:test";
import assert from "node:assert/strict";
import { schemaStatements } from "../../db/schema.js";

test("incluye el esquema aditivo de Fundación sin reemplazar picks", () => {
  const ddl = schemaStatements.join("\n");
  for (const table of [
    "sb_predictions",
    "sb_prediction_conversations",
    "sb_prediction_messages",
    "sb_prediction_analyses",
    "sb_sports_cache",
    "sb_sports_api_usage",
    "sb_prediction_request_usage",
    "sb_team_aliases",
    "sb_historical_matches",
    "sb_historical_match_details",
    "sb_model_backtest_runs",
    "sb_model_backtests",
    "sb_model_calibration_bins",
    "sb_model_parameters",
  ]) {
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(ddl, /REFERENCES sb_users\(id\) ON DELETE CASCADE/);
  assert.match(ddl, /sb_sports_cache_expiry_idx/);
  assert.match(ddl, /predicted_at TIMESTAMPTZ/);
  assert.match(ddl, /match_key CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(ddl, /sb_team_aliases_context_unique_idx/);
  for (const column of ["model_selected_by", "market_status", "router_version", "router_config_fingerprint", "model_config_fingerprint", "theoretical_edge", "edge_status"]) {
    assert.match(ddl, new RegExp(column));
  }
  for (const column of ["web_context", "web_evidence", "web_sources", "web_conflicts", "web_research_provider", "web_enrichment_version", "web_researched_at"]) assert.match(ddl, new RegExp(column));
  for (const column of ["request_id", "explanation", "explanation_context", "explanation_fingerprint", "prompt_version", "llm_metadata", "cost_metadata"]) assert.match(ddl, new RegExp(column));
  assert.match(ddl, /sb_prediction_messages_request_unique_idx/);
  assert.match(ddl, /sb_model_backtest_runs_identity_idx/);
});
