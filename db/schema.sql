CREATE TABLE IF NOT EXISTS sb_users (
  id TEXT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  display_name VARCHAR(80),
  email VARCHAR(254),
  password_hash TEXT NOT NULL,
  selected_plan VARCHAR(32),
  plan_status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS display_name VARCHAR(80);
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS plan_status VARCHAR(20) NOT NULL DEFAULT 'inactive';
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;
ALTER TABLE sb_users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sb_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_predictions (
  id TEXT PRIMARY KEY,
  sport VARCHAR(60) NOT NULL,
  league VARCHAR(100),
  event_name VARCHAR(180) NOT NULL,
  pick_text VARCHAR(220) NOT NULL,
  bookmaker VARCHAR(100),
  odds NUMERIC(8, 3),
  analysis TEXT,
  ticket_image_url TEXT,
  bet_link TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published',
  allowed_plans JSONB NOT NULL DEFAULT '["starter", "predicciones"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sb_predictions ADD COLUMN IF NOT EXISTS bookmaker VARCHAR(100);
ALTER TABLE sb_predictions ADD COLUMN IF NOT EXISTS ticket_image_url TEXT;
ALTER TABLE sb_predictions ADD COLUMN IF NOT EXISTS bet_link TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sb_users_email_unique_idx ON sb_users (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS sb_sessions_user_id_idx ON sb_sessions(user_id);
CREATE INDEX IF NOT EXISTS sb_sessions_expires_at_idx ON sb_sessions(expires_at);
CREATE INDEX IF NOT EXISTS sb_predictions_starts_at_idx ON sb_predictions(starts_at);
CREATE INDEX IF NOT EXISTS sb_predictions_status_idx ON sb_predictions(status);

CREATE TABLE IF NOT EXISTS sb_prediction_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_prediction_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES sb_prediction_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_prediction_analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES sb_prediction_conversations(id) ON DELETE SET NULL,
  assistant_message_id TEXT REFERENCES sb_prediction_messages(id) ON DELETE SET NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'api-football',
  fixture_id BIGINT,
  sport VARCHAR(40) NOT NULL DEFAULT 'football',
  market VARCHAR(40) NOT NULL,
  probabilities JSONB,
  fair_odds JSONB,
  market_odds JSONB,
  edge JSONB,
  confidence VARCHAR(20),
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  prediction JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version VARCHAR(80),
  model_selected_by VARCHAR(32),
  market_status VARCHAR(32),
  router_version VARCHAR(80),
  router_config_fingerprint CHAR(64),
  model_config_fingerprint CHAR(64),
  theoretical_edge JSONB,
  edge_status VARCHAR(32),
  web_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  web_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  web_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  web_conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  web_research_provider VARCHAR(80),
  web_enrichment_version VARCHAR(80),
  web_researched_at TIMESTAMPTZ,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation_fingerprint CHAR(64),
  prompt_version VARCHAR(80),
  llm_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  predicted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ
);

ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS predicted_at TIMESTAMPTZ;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS model_selected_by VARCHAR(32);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS market_status VARCHAR(32);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS router_version VARCHAR(80);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS router_config_fingerprint CHAR(64);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS model_config_fingerprint CHAR(64);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS theoretical_edge JSONB;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS edge_status VARCHAR(32);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_context JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_evidence JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_sources JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_conflicts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_research_provider VARCHAR(80);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_enrichment_version VARCHAR(80);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS web_researched_at TIMESTAMPTZ;
ALTER TABLE sb_prediction_messages ADD COLUMN IF NOT EXISTS request_id VARCHAR(180);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS explanation JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS explanation_context JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS explanation_fingerprint CHAR(64);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(80);
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS llm_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sb_prediction_analyses ADD COLUMN IF NOT EXISTS cost_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS sb_sports_cache (
  cache_key CHAR(64) PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  resource VARCHAR(120) NOT NULL,
  request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB,
  fetched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_token TEXT,
  lock_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_sports_api_usage (
  provider VARCHAR(40) NOT NULL,
  usage_date DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  minute_window_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('minute', NOW()),
  minute_request_count INTEGER NOT NULL DEFAULT 0 CHECK (minute_request_count >= 0),
  reported_daily_limit INTEGER,
  reported_daily_remaining INTEGER,
  reported_minute_limit INTEGER,
  reported_minute_remaining INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, usage_date)
);

CREATE TABLE IF NOT EXISTS sb_prediction_request_usage (
  user_id TEXT NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  minute_window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, minute_window_start)
);

CREATE TABLE IF NOT EXISTS sb_team_aliases (
  id TEXT PRIMARY KEY,
  canonical_name VARCHAR(180) NOT NULL,
  canonical_name_normalized VARCHAR(180) NOT NULL,
  alias VARCHAR(180) NOT NULL,
  alias_normalized VARCHAR(180) NOT NULL,
  competition VARCHAR(80),
  country VARCHAR(80),
  source VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_historical_matches (
  id TEXT PRIMARY KEY,
  match_key CHAR(64) NOT NULL UNIQUE,
  source VARCHAR(40) NOT NULL,
  source_match_id VARCHAR(180) NOT NULL,
  competition VARCHAR(80) NOT NULL,
  country VARCHAR(80),
  season VARCHAR(32) NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  home_team VARCHAR(180) NOT NULL,
  away_team VARCHAR(180) NOT NULL,
  home_team_normalized VARCHAR(180) NOT NULL,
  away_team_normalized VARCHAR(180) NOT NULL,
  home_goals INTEGER NOT NULL CHECK (home_goals >= 0),
  away_goals INTEGER NOT NULL CHECK (away_goals >= 0),
  home_shots INTEGER CHECK (home_shots >= 0),
  away_shots INTEGER CHECK (away_shots >= 0),
  home_shots_on_target INTEGER CHECK (home_shots_on_target >= 0),
  away_shots_on_target INTEGER CHECK (away_shots_on_target >= 0),
  home_corners INTEGER CHECK (home_corners >= 0),
  away_corners INTEGER CHECK (away_corners >= 0),
  home_cards INTEGER CHECK (home_cards >= 0),
  away_cards INTEGER CHECK (away_cards >= 0),
  home_xg NUMERIC(8, 4) CHECK (home_xg >= 0),
  away_xg NUMERIC(8, 4) CHECK (away_xg >= 0),
  odds_home NUMERIC(10, 4) CHECK (odds_home > 1),
  odds_draw NUMERIC(10, 4) CHECK (odds_draw > 1),
  odds_away NUMERIC(10, 4) CHECK (odds_away > 1),
  provider_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_match_id)
);

CREATE TABLE IF NOT EXISTS sb_model_backtest_runs (
  id TEXT PRIMARY KEY,
  model_version VARCHAR(80) NOT NULL,
  dataset_version CHAR(64) NOT NULL,
  config_hash CHAR(64) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  competitions JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_count INTEGER NOT NULL DEFAULT 0,
  prediction_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sb_historical_match_details (
  match_key CHAR(64) PRIMARY KEY REFERENCES sb_historical_matches(match_key) ON DELETE CASCADE,
  source VARCHAR(40) NOT NULL,
  events_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  lineups_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_model_backtests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES sb_model_backtest_runs(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES sb_historical_matches(id) ON DELETE CASCADE,
  model_version VARCHAR(80) NOT NULL,
  market VARCHAR(40) NOT NULL,
  selection_key VARCHAR(40) NOT NULL,
  probability DOUBLE PRECISION NOT NULL CHECK (probability >= 0 AND probability <= 1),
  fair_odds DOUBLE PRECISION,
  market_odds DOUBLE PRECISION,
  actual_result SMALLINT NOT NULL CHECK (actual_result IN (0, 1)),
  predicted_at_simulated TIMESTAMPTZ NOT NULL,
  dataset_split VARCHAR(20) NOT NULL,
  competition VARCHAR(80) NOT NULL,
  season VARCHAR(32) NOT NULL,
  edge DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, match_id, market, selection_key)
);

CREATE TABLE IF NOT EXISTS sb_model_calibration_bins (
  run_id TEXT NOT NULL REFERENCES sb_model_backtest_runs(id) ON DELETE CASCADE,
  market VARCHAR(40) NOT NULL,
  bin_start DOUBLE PRECISION NOT NULL,
  bin_end DOUBLE PRECISION NOT NULL,
  prediction_count INTEGER NOT NULL,
  mean_probability DOUBLE PRECISION,
  observed_frequency DOUBLE PRECISION,
  calibration_difference DOUBLE PRECISION,
  PRIMARY KEY (run_id, market, bin_start)
);

CREATE TABLE IF NOT EXISTS sb_model_parameters (
  id TEXT PRIMARY KEY,
  model_version VARCHAR(80) NOT NULL,
  dataset_version CHAR(64) NOT NULL,
  market VARCHAR(40),
  competition VARCHAR(80),
  parameter_type VARCHAR(40) NOT NULL,
  parameters JSONB NOT NULL,
  config_hash CHAR(64) NOT NULL,
  trained_from TIMESTAMPTZ NOT NULL,
  trained_to TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sb_model_parameters_identity_idx ON sb_model_parameters (model_version, dataset_version, COALESCE(market, ''), COALESCE(competition, ''), parameter_type, config_hash);
CREATE UNIQUE INDEX IF NOT EXISTS sb_model_backtest_runs_identity_idx ON sb_model_backtest_runs (model_version, dataset_version, config_hash);

CREATE UNIQUE INDEX IF NOT EXISTS sb_team_aliases_context_unique_idx ON sb_team_aliases (alias_normalized, COALESCE(competition, ''), COALESCE(country, ''));
CREATE INDEX IF NOT EXISTS sb_historical_matches_date_idx ON sb_historical_matches(match_date ASC);
CREATE INDEX IF NOT EXISTS sb_historical_matches_competition_season_idx ON sb_historical_matches(competition, season, match_date ASC);
CREATE INDEX IF NOT EXISTS sb_historical_matches_home_idx ON sb_historical_matches(home_team_normalized, match_date ASC);
CREATE INDEX IF NOT EXISTS sb_historical_matches_away_idx ON sb_historical_matches(away_team_normalized, match_date ASC);
CREATE INDEX IF NOT EXISTS sb_model_backtests_run_market_idx ON sb_model_backtests(run_id, market);

CREATE INDEX IF NOT EXISTS sb_prediction_conversations_user_updated_idx ON sb_prediction_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS sb_prediction_messages_conversation_created_idx ON sb_prediction_messages(conversation_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS sb_prediction_messages_request_unique_idx ON sb_prediction_messages(conversation_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sb_prediction_analyses_user_created_idx ON sb_prediction_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sb_prediction_analyses_fixture_idx ON sb_prediction_analyses(fixture_id);
CREATE INDEX IF NOT EXISTS sb_sports_cache_expiry_idx ON sb_sports_cache(expires_at);
CREATE INDEX IF NOT EXISTS sb_sports_cache_resource_idx ON sb_sports_cache(provider, resource);
