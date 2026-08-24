import { randomUUID } from "node:crypto";
import { ensureSchema } from "../../lib/db.js";
import { PredictionValidationError } from "../../lib/predictions/errors.js";

function rowsFrom(result) { return Array.isArray(result) ? result : result?.rows || []; }
function jsonValue(value, fallback) { if (value == null) return fallback; if (typeof value !== "string") return value; try { return JSON.parse(value); } catch { return fallback; } }
function conversation(row) { return row ? { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at } : null; }
function message(row) { return row ? { id: row.id, role: row.role, type: row.message_type, content: row.content, payload: jsonValue(row.payload, {}), requestId: row.request_id || null, createdAt: row.created_at } : null; }

export function createConversationService({ getSql = ensureSchema } = {}) {
  return {
    async create({ userId, title = "Nueva conversación" }) {
      const id = randomUUID();
      const sql = await getSql();
      const row = rowsFrom(await sql.query("INSERT INTO sb_prediction_conversations (id, user_id, title) VALUES ($1, $2, $3) RETURNING *", [id, userId, title]))[0];
      return conversation(row || { id, title, created_at: new Date(), updated_at: new Date() });
    },
    async list({ userId, limit = 20 }) {
      const sql = await getSql();
      return rowsFrom(await sql.query("SELECT id, title, created_at, updated_at FROM sb_prediction_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2", [userId, Math.min(limit, 20)])).map(conversation);
    },
    async get({ userId, conversationId, messageLimit = 100 }) {
      const sql = await getSql();
      const row = rowsFrom(await sql.query("SELECT id, title, created_at, updated_at FROM sb_prediction_conversations WHERE id = $1 AND user_id = $2 LIMIT 1", [conversationId, userId]))[0];
      if (!row) return null;
      const messages = rowsFrom(await sql.query(`SELECT * FROM (SELECT id, role, message_type, content, payload, request_id, created_at FROM sb_prediction_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2) recent ORDER BY created_at ASC`, [conversationId, Math.min(messageLimit, 100)])).map(message);
      return { ...conversation(row), messages };
    },
    async reserveUserMessage({ userId, conversationId, content, requestId }) {
      const sql = await getSql();
      const owned = rowsFrom(await sql.query("SELECT id FROM sb_prediction_conversations WHERE id = $1 AND user_id = $2 LIMIT 1", [conversationId, userId]))[0];
      if (!owned) throw new PredictionValidationError("La conversación no existe o no pertenece al usuario.", { code: "CONVERSATION_NOT_FOUND" });
      const id = randomUUID();
      const row = rowsFrom(await sql.query(`INSERT INTO sb_prediction_messages (id, conversation_id, role, message_type, content, payload, request_id) VALUES ($1, $2, 'user', 'text', $3, '{}'::jsonb, $4) ON CONFLICT (conversation_id, request_id) WHERE request_id IS NOT NULL DO NOTHING RETURNING *`, [id, conversationId, content, requestId]))[0];
      if (!row) return { duplicate: true, message: null };
      await sql.query("UPDATE sb_prediction_conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
      return { duplicate: false, message: message(row) };
    },
    async addMessage({ conversationId, role, type = "text", content, payload = {}, requestId = null }) {
      const id = randomUUID();
      const sql = await getSql();
      const row = rowsFrom(await sql.query("INSERT INTO sb_prediction_messages (id, conversation_id, role, message_type, content, payload, request_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *", [id, conversationId, role, type, content, JSON.stringify(payload), requestId]))[0];
      await sql.query("UPDATE sb_prediction_conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
      return message(row || { id, role, message_type: type, content, payload, request_id: requestId, created_at: new Date() });
    },
    async findAssistantByRequest({ userId, conversationId, requestId }) {
      const sql = await getSql();
      const row = rowsFrom(await sql.query("SELECT m.id, m.role, m.message_type, m.content, m.payload, m.request_id, m.created_at FROM sb_prediction_messages m JOIN sb_prediction_conversations c ON c.id = m.conversation_id WHERE m.conversation_id = $1 AND c.user_id = $2 AND m.role = 'assistant' AND m.payload->>'requestId' = $3 ORDER BY m.created_at DESC LIMIT 1", [conversationId, userId, requestId]))[0];
      return message(row);
    },
    async lastClarification({ conversationId }) {
      const sql = await getSql();
      const row = rowsFrom(await sql.query("SELECT id, role, message_type, content, payload, request_id, created_at FROM sb_prediction_messages WHERE conversation_id = $1 AND role = 'assistant' AND message_type = 'clarification' ORDER BY created_at DESC LIMIT 1", [conversationId]))[0];
      return message(row);
    },
    async updateTitle({ userId, conversationId, title }) {
      const sql = await getSql();
      const row = rowsFrom(await sql.query("UPDATE sb_prediction_conversations SET title = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND title = 'Nueva conversación' RETURNING *", [conversationId, userId, String(title).slice(0, 180)]))[0];
      return conversation(row);
    },
  };
}
