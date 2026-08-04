CREATE TABLE IF NOT EXISTS sb_users (
  id TEXT PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  selected_plan VARCHAR(32),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sb_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sb_sessions_user_id_idx ON sb_sessions(user_id);
CREATE INDEX IF NOT EXISTS sb_sessions_expires_at_idx ON sb_sessions(expires_at);
