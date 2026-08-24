import test from "node:test";
import assert from "node:assert/strict";
import { createConversationService } from "../../services/predictions/conversationService.js";
import { createPredictionRequestLimitService } from "../../services/predictions/requestLimitService.js";

test("conversation get exige ownership y limita mensajes a 100", async () => {
  const calls = [];
  const service = createConversationService({ getSql: async () => ({ query: async (query, params) => { calls.push({ query, params }); if (query.startsWith("SELECT id, title")) return []; throw new Error("no debe consultar mensajes sin ownership"); } }) });
  const result = await service.get({ userId: "intruder", conversationId: "private", messageLimit: 500 });
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /user_id = \$2/);
});

test("lookup idempotente une conversación y usuario propietario", async () => {
  let captured;
  const service = createConversationService({ getSql: async () => ({ query: async (query, params) => { captured = { query, params }; return []; } }) });
  await service.findAssistantByRequest({ userId: "owner", conversationId: "c1", requestId: "r1" });
  assert.match(captured.query, /JOIN sb_prediction_conversations/);
  assert.match(captured.query, /c\.user_id = \$2/);
  assert.deepEqual(captured.params, ["c1", "owner", "r1"]);
});

test("rate limit por usuario reserva atómicamente y tipa el exceso", async () => {
  let allow = true;
  let captured;
  const service = createPredictionRequestLimitService({ limitPerMinute: 5, getSql: async () => ({ query: async (query, params) => { captured = { query, params }; return allow ? [{ request_count: 5 }] : []; } }) });
  assert.deepEqual(await service.reserve("u1"), { count: 5, limit: 5 });
  assert.match(captured.query, /ON CONFLICT/);
  assert.deepEqual(captured.params, ["u1", 5]);
  allow = false;
  await assert.rejects(() => service.reserve("u1"), (error) => error.code === "PREDICTIONS_RATE_LIMITED" && error.status === 429);
});
