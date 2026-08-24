import { PredictionValidationError } from "./errors.js";

export const PREDICTION_MESSAGE_MAX_LENGTH = 500;
export const PREDICTION_RESPONSE_KINDS = Object.freeze({
  ANALYSIS: "analysis",
  CLARIFICATION: "clarification",
});

export const PREDICTION_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "INVALID_PREDICTION_REQUEST",
  UNSUPPORTED_SPORT: "UNSUPPORTED_SPORT",
  UNSUPPORTED_MARKET: "UNSUPPORTED_MARKET",
  INVALID_DATE: "INVALID_DATE",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  SPORTS_API_NOT_CONFIGURED: "SPORTS_API_NOT_CONFIGURED",
  SPORTS_API_QUOTA_EXCEEDED: "SPORTS_API_QUOTA_EXCEEDED",
});

const identifierPattern = /^[a-zA-Z0-9_-]{1,180}$/;
const selectionTypes = new Set(["team", "fixture", "market"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validatePredictionRequest(body) {
  if (!isPlainObject(body)) {
    throw new PredictionValidationError("La solicitud debe ser un objeto JSON.");
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!identifierPattern.test(conversationId)) {
    throw new PredictionValidationError("La conversación no es válida.", { field: "conversationId" });
  }
  if (!message || message.length > PREDICTION_MESSAGE_MAX_LENGTH || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(message)) {
    throw new PredictionValidationError(
      `El mensaje debe contener entre 1 y ${PREDICTION_MESSAGE_MAX_LENGTH} caracteres válidos.`,
      { field: "message" },
    );
  }

  let selection = null;
  if (body.selection != null) {
    if (!isPlainObject(body.selection)) {
      throw new PredictionValidationError("La selección de aclaración no es válida.", { field: "selection" });
    }
    const type = typeof body.selection.type === "string" ? body.selection.type.trim() : "";
    const id = typeof body.selection.id === "number" ? String(body.selection.id) : body.selection.id?.trim?.();
    if (!selectionTypes.has(type) || !id || !identifierPattern.test(id)) {
      throw new PredictionValidationError("La selección de aclaración no es válida.", { field: "selection" });
    }
    selection = { type, id };
  }

  return { conversationId, message, selection };
}

export function createClarificationContract({ conversationId, message, reason, options = [] }) {
  return {
    kind: PREDICTION_RESPONSE_KINDS.CLARIFICATION,
    conversationId,
    message,
    clarification: { reason, options },
  };
}

export function createAnalysisContract({ conversationId, message, analysis }) {
  return {
    kind: PREDICTION_RESPONSE_KINDS.ANALYSIS,
    conversationId,
    message,
    analysis,
  };
}
