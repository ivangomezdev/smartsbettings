import test from "node:test";
import assert from "node:assert/strict";
import { createPredictionsPostHandler } from "../../app/api/predictions/route.js";

function request(body, headers = {}) {
  return new Request("https://smartbetting.test/api/predictions", { method: "POST", headers: { "content-type": "application/json", origin: "https://smartbetting.test", "idempotency-key": "req_123", ...headers }, body: JSON.stringify(body) });
}

const activeUser = { id: "u1", selectedPlan: "predicciones", planStatus: "active", planExpiresAt: null };
const plan = { id: "predicciones", includesPredictions: true };

test("POST /api/predictions aplica auth/plan, valida contrato y pasa idempotency key", async () => {
  let received;
  const handler = createPredictionsPostHandler({ chatService: { process: async (input) => { received = input; return { kind: "clarification", conversationId: input.conversationId, clarification: { options: [] } }; } }, getUser: async () => activeUser, getPlan: () => plan, userHasActivePlan: () => true });
  const response = await handler(request({ conversationId: "c1", message: "Real Madrid vs Sevilla" }));
  assert.equal(response.status, 200);
  assert.equal(received.userId, "u1");
  assert.equal(received.requestId, "req_123");
  assert.equal(received.message, "Real Madrid vs Sevilla");
});

test("POST rechaza origen, sesión, plan y cuerpo manipulados", async () => {
  const base = { chatService: { process: async () => { throw new Error("no debe ejecutarse"); } }, getPlan: () => plan, userHasActivePlan: () => true };
  const badOrigin = await createPredictionsPostHandler({ ...base, getUser: async () => activeUser })(request({ conversationId: "c1", message: "x" }, { origin: "https://evil.test" }));
  assert.equal(badOrigin.status, 403);
  const noUser = await createPredictionsPostHandler({ ...base, getUser: async () => null })(request({ conversationId: "c1", message: "x" }));
  assert.equal(noUser.status, 401);
  const noPlan = await createPredictionsPostHandler({ ...base, getUser: async () => activeUser, getPlan: () => null })(request({ conversationId: "c1", message: "x" }));
  assert.equal(noPlan.status, 402);
  const invalid = await createPredictionsPostHandler({ ...base, getUser: async () => activeUser })(request({ conversationId: "../other", message: "x" }));
  assert.equal(invalid.status, 400);
});
