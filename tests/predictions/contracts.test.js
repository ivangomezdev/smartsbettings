import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnalysisContract,
  createClarificationContract,
  validatePredictionRequest,
} from "../../lib/predictions/contracts.js";

test("normaliza una solicitud interna válida", () => {
  assert.deepEqual(validatePredictionRequest({
    conversationId: "conversation_123",
    message: " Real Madrid vs Sevilla Over 1.5 ",
    selection: { type: "fixture", id: 12345 },
  }), {
    conversationId: "conversation_123",
    message: "Real Madrid vs Sevilla Over 1.5",
    selection: { type: "fixture", id: "12345" },
  });
});

test("rechaza solicitudes y selecciones manipuladas", () => {
  assert.throws(() => validatePredictionRequest(null), { code: "INVALID_PREDICTION_REQUEST" });
  assert.throws(() => validatePredictionRequest({ conversationId: "../x", message: "hola" }), { code: "INVALID_PREDICTION_REQUEST" });
  assert.throws(() => validatePredictionRequest({ conversationId: "ok", message: "x".repeat(501) }), { code: "INVALID_PREDICTION_REQUEST" });
  assert.throws(() => validatePredictionRequest({ conversationId: "ok", message: "hola", selection: { type: "admin", id: "1" } }), { code: "INVALID_PREDICTION_REQUEST" });
});

test("construye contratos estables para la futura ruta POST", () => {
  assert.equal(createClarificationContract({ conversationId: "c", message: {}, reason: "team", options: [] }).kind, "clarification");
  assert.equal(createAnalysisContract({ conversationId: "c", message: {}, analysis: {} }).kind, "analysis");
});
