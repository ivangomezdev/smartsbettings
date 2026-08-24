import { ensureSchema } from "../../lib/db.js";
import { SportsApiQuotaError } from "../../lib/predictions/errors.js";

const DEFAULT_DAILY_BUDGET = 90;
const DEFAULT_MINUTE_BUDGET = 9;
const DAILY_REMAINING_RESERVE = 10;

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function getQuotaBudgets(environment = process.env) {
  return {
    daily: positiveInteger(environment.API_FOOTBALL_DAILY_BUDGET, DEFAULT_DAILY_BUDGET, 100),
    minute: positiveInteger(environment.API_FOOTBALL_MINUTE_BUDGET, DEFAULT_MINUTE_BUDGET, 10),
  };
}

function integerHeader(headers, name) {
  const raw = headers?.get?.(name);
  if (raw == null || raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseQuotaHeaders(headers) {
  return {
    dailyLimit: integerHeader(headers, "x-ratelimit-requests-limit"),
    dailyRemaining: integerHeader(headers, "x-ratelimit-requests-remaining"),
    minuteLimit: integerHeader(headers, "x-ratelimit-limit"),
    minuteRemaining: integerHeader(headers, "x-ratelimit-remaining"),
  };
}

export function createPostgresQuotaStore({ getSql = ensureSchema } = {}) {
  return {
    async reserve({ provider, dailyBudget, minuteBudget, remainingReserve }) {
      const sql = await getSql();
      const result = await sql.query(
        `INSERT INTO sb_sports_api_usage (
          provider, usage_date, request_count, minute_window_start, minute_request_count, updated_at
        ) VALUES (
          $1, (NOW() AT TIME ZONE 'UTC')::date, 1, DATE_TRUNC('minute', NOW()), 1, NOW()
        )
        ON CONFLICT (provider, usage_date) DO UPDATE SET
          request_count = sb_sports_api_usage.request_count + 1,
          minute_request_count = CASE
            WHEN sb_sports_api_usage.minute_window_start = DATE_TRUNC('minute', NOW())
              THEN sb_sports_api_usage.minute_request_count + 1
            ELSE 1
          END,
          minute_window_start = DATE_TRUNC('minute', NOW()),
          reported_minute_remaining = CASE
            WHEN sb_sports_api_usage.minute_window_start = DATE_TRUNC('minute', NOW())
              THEN sb_sports_api_usage.reported_minute_remaining
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE sb_sports_api_usage.request_count < $2
          AND (
            sb_sports_api_usage.reported_daily_remaining IS NULL
            OR sb_sports_api_usage.reported_daily_remaining > $4
          )
          AND (
            sb_sports_api_usage.minute_window_start <> DATE_TRUNC('minute', NOW())
            OR (
              sb_sports_api_usage.minute_request_count < $3
              AND (
                sb_sports_api_usage.reported_minute_remaining IS NULL
                OR sb_sports_api_usage.reported_minute_remaining > 0
              )
            )
          )
        RETURNING *`,
        [provider, dailyBudget, minuteBudget, remainingReserve],
      );
      const row = rowsFrom(result)[0];
      if (row) return { allowed: true, status: row };

      const current = rowsFrom(await sql.query(
        `SELECT * FROM sb_sports_api_usage
         WHERE provider = $1 AND usage_date = (NOW() AT TIME ZONE 'UTC')::date
         LIMIT 1`,
        [provider],
      ))[0];
      const sameMinute = current
        && new Date(current.minute_window_start).getTime() === Math.floor(Date.now() / 60000) * 60000;
      const minuteBlocked = sameMinute && (
        Number(current.minute_request_count) >= minuteBudget
        || (current.reported_minute_remaining != null && Number(current.reported_minute_remaining) === 0)
      );

      return {
        allowed: false,
        reason: minuteBlocked ? "minute" : "daily",
        retryAfterSeconds: minuteBlocked ? 60 - new Date().getUTCSeconds() : null,
        status: current || null,
      };
    },

    async recordHeaders({ provider, quota }) {
      if (!Object.values(quota).some((value) => value !== null)) return;
      const sql = await getSql();
      await sql.query(
        `UPDATE sb_sports_api_usage SET
          reported_daily_limit = COALESCE($2, reported_daily_limit),
          reported_daily_remaining = CASE
            WHEN $3::INTEGER IS NULL THEN reported_daily_remaining
            WHEN reported_daily_remaining IS NULL THEN $3
            ELSE LEAST(reported_daily_remaining, $3)
          END,
          reported_minute_limit = COALESCE($4, reported_minute_limit),
          reported_minute_remaining = CASE
            WHEN $5::INTEGER IS NULL THEN reported_minute_remaining
            WHEN reported_minute_remaining IS NULL THEN $5
            ELSE LEAST(reported_minute_remaining, $5)
          END,
          updated_at = NOW()
        WHERE provider = $1 AND usage_date = (NOW() AT TIME ZONE 'UTC')::date`,
        [provider, quota.dailyLimit, quota.dailyRemaining, quota.minuteLimit, quota.minuteRemaining],
      );
    },

    async getStatus(provider) {
      const sql = await getSql();
      return rowsFrom(await sql.query(
        `SELECT * FROM sb_sports_api_usage
         WHERE provider = $1 AND usage_date = (NOW() AT TIME ZONE 'UTC')::date
         LIMIT 1`,
        [provider],
      ))[0] || null;
    },
  };
}

export function createQuotaService({
  store = createPostgresQuotaStore(),
  provider = "api-football",
  budgets = getQuotaBudgets(),
  remainingReserve = DAILY_REMAINING_RESERVE,
} = {}) {
  return {
    async reserve() {
      const reservation = await store.reserve({
        provider,
        dailyBudget: budgets.daily,
        minuteBudget: budgets.minute,
        remainingReserve,
      });
      if (!reservation.allowed) {
        const message = reservation.reason === "minute"
          ? "Se alcanzó el límite por minuto de la fuente deportiva."
          : "Se alcanzó el presupuesto diario reservado para datos deportivos.";
        throw new SportsApiQuotaError(message, {
          reason: reservation.reason,
          retryAfterSeconds: reservation.retryAfterSeconds,
        });
      }
      return reservation.status;
    },

    async recordHeaders(headers) {
      const quota = parseQuotaHeaders(headers);
      await store.recordHeaders({ provider, quota });
      return quota;
    },

    async getStatus() {
      const status = await store.getStatus(provider);
      return {
        provider,
        budgets,
        usage: status,
      };
    },
  };
}
