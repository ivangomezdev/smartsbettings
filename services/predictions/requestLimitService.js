import { ensureSchema } from "../../lib/db.js";
import { PredictionFoundationError } from "../../lib/predictions/errors.js";

export function createPredictionRequestLimitService({ getSql = ensureSchema, limitPerMinute = 5 } = {}) {
  return {
    async reserve(userId) {
      const sql = await getSql();
      const rows = await sql.query(`INSERT INTO sb_prediction_request_usage (user_id, minute_window_start, request_count) VALUES ($1, DATE_TRUNC('minute', NOW()), 1) ON CONFLICT (user_id, minute_window_start) DO UPDATE SET request_count = sb_prediction_request_usage.request_count + 1, updated_at = NOW() WHERE sb_prediction_request_usage.request_count < $2 RETURNING request_count`, [userId, limitPerMinute]);
      const row = Array.isArray(rows) ? rows[0] : rows?.rows?.[0];
      if (!row) throw new PredictionFoundationError("Has enviado demasiados análisis. Espera un momento.", { code: "PREDICTIONS_RATE_LIMITED", status: 429, retryable: true });
      return { count: row.request_count, limit: limitPerMinute };
    },
  };
}

