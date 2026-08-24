import { randomUUID } from "node:crypto";
import { ensureSchema } from "../lib/db.js";
import { toPublicPredictionError } from "../lib/predictions/errors.js";
import { createConversationService } from "../services/predictions/conversationService.js";
import { createLlmService } from "../services/predictions/llm/llmService.js";
import { createUnconfiguredLlmProvider } from "../services/predictions/llm/llmProvider.js";
import { createPredictionChatService } from "../services/predictions/predictionChatService.js";

const query = process.argv.slice(2).join(" ").trim() || "Fulham vs Chelsea Over 1.5 August 24 2026";
const sql = await ensureSchema();

const tables = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('sb_prediction_conversations', 'sb_prediction_messages', 'sb_prediction_analyses', 'sb_prediction_request_usage') ORDER BY table_name");
const columns = await sql.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sb_prediction_analyses' AND column_name IN ('explanation', 'explanation_context', 'explanation_fingerprint', 'prompt_version', 'llm_metadata', 'cost_metadata') ORDER BY column_name");
const requestedUser = String(process.env.PREDICTIONS_VERIFY_USER_ID || "").trim();
let users = requestedUser
  ? await sql.query("SELECT id FROM sb_users WHERE id = $1 LIMIT 1", [requestedUser])
  : [];
let ephemeralUserId = null;
if (!users[0]) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  ephemeralUserId = `phase3-verifier-${suffix}`;
  users = await sql.query("INSERT INTO sb_users (id, username, password_hash, selected_plan, plan_status) VALUES ($1, $2, $3, 'predicciones', 'active') RETURNING id", [ephemeralUserId, `phase3_verify_${suffix}`, "verification-only-no-login"]);
}

const report = {
  schema: { tables: tables.map((row) => row.table_name), analysisColumns: columns.map((row) => row.column_name) },
  query,
  openAiConfigured: Boolean(process.env.PREDICTIONS_LLM_PROVIDER === "openai" && process.env.OPENAI_API_KEY),
  runs: [],
};

function summarize(result, label) {
  const analysis = result.analysis || {};
  return {
    label,
    kind: result.kind,
    event: analysis.event ? `${analysis.event.homeTeam?.name} vs ${analysis.event.awayTeam?.name}` : null,
    market: analysis.market?.code || null,
    modelVersion: analysis.model?.version || null,
    probabilities: (analysis.prediction?.selections || []).map((item) => ({ key: item.key, probability: item.probability, fairOdds: item.fairOdds })),
    llm: analysis.llm || null,
    llmUsage: analysis.llmUsage || null,
    web: analysis.costMetadata?.web || null,
    sources: (analysis.sources || []).map((source) => ({ name: source.name, url: source.url, usedFor: source.usedFor })),
    missingData: analysis.missingData || [],
  };
}

if (users[0]) {
  const conversations = createConversationService();
  const conversation = await conversations.create({ userId: users[0].id, title: "Verificación Fase 3" });
  const service = createPredictionChatService();
  const fallbackService = createPredictionChatService({ llmService: createLlmService({ provider: createUnconfiguredLlmProvider() }) });
  const oneXTwoQuery = query.replace(/(?:over|under)\s*[012][.,]5|btts|ambos\s+equipos\s+marcan|1x2/i, "1X2");
  try {
    report.runs.push(summarize(await service.process({ userId: users[0].id, conversationId: conversation.id, message: query, requestId: `verify_over_${Date.now()}` }), "over-v2"));
    report.runs.push(summarize(await service.process({ userId: users[0].id, conversationId: conversation.id, message: oneXTwoQuery, requestId: `verify_1x2_${Date.now()}` }), "1x2-v1"));
    report.runs.push(summarize(await service.process({ userId: users[0].id, conversationId: conversation.id, message: query, requestId: `verify_cache_${Date.now()}` }), "repeat-cache"));
    report.runs.push(summarize(await fallbackService.process({ userId: users[0].id, conversationId: conversation.id, message: query, requestId: `verify_fallback_${Date.now()}` }), "forced-fallback"));
    const persisted = await sql.query("SELECT (SELECT COUNT(*)::int FROM sb_prediction_messages WHERE conversation_id = $1) AS messages, (SELECT COUNT(*)::int FROM sb_prediction_analyses WHERE conversation_id = $1) AS analyses", [conversation.id]);
    report.persistence = persisted[0];
  } catch (error) {
    report.error = toPublicPredictionError(error);
    process.exitCode = 1;
  }
}

if (ephemeralUserId) {
  await sql.query("DELETE FROM sb_users WHERE id = $1", [ephemeralUserId]);
  report.ephemeralVerificationDataRemoved = true;
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
