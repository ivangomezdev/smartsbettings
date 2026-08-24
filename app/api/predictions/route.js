import { json, handleApiError } from "../../../lib/api.js";
import { getSessionUser, hasActivePlan } from "../../../lib/auth.js";
import { ensureSchema } from "../../../lib/db.js";
import { getPlanById } from "../../../lib/plans.js";
import { isSameOrigin } from "../../../lib/auth.js";
import { validatePredictionRequest } from "../../../lib/predictions/contracts.js";
import { toPublicPredictionError } from "../../../lib/predictions/errors.js";
import { createPredictionChatService } from "../../../services/predictions/predictionChatService.js";

export async function GET(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return json({ error: "Inicia sesión para ver los picks." }, 401);

    const plan = getPlanById(user.selectedPlan);
    if (!plan || !hasActivePlan(user) || !plan.includesPredictions) {
      return json(
        {
          error: "Necesitas un plan activo que incluya predicciones.",
          code: "PLAN_REQUIRED",
          redirectTo: "/planes?required=predictions",
        },
        402,
      );
    }

    const sql = await ensureSchema();
    const rows = await sql`
      SELECT
        id, sport, league, event_name, pick_text, bookmaker, odds, analysis,
        ticket_image_url, bet_link, starts_at, created_at
      FROM sb_predictions
      WHERE status = 'published'
        AND allowed_plans ? ${plan.id}
      ORDER BY starts_at ASC, created_at DESC
      LIMIT 100
    `;

    return json({
      predictions: rows.map((row) => ({
        id: row.id,
        sport: row.sport,
        league: row.league,
        eventName: row.event_name,
        pick: row.pick_text,
        bookmaker: row.bookmaker,
        odds: row.odds,
        analysis: row.analysis,
        ticketImageUrl: row.ticket_image_url,
        betLink: row.bet_link,
        startsAt: row.starts_at,
        publishedAt: row.created_at,
      })),
      plan: { id: plan.id, name: plan.name },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export function createPredictionsPostHandler({
  chatService = createPredictionChatService(),
  getUser = getSessionUser,
  getPlan = getPlanById,
  userHasActivePlan = hasActivePlan,
  sameOrigin = isSameOrigin,
  validateRequest = validatePredictionRequest,
} = {}) {
  return async function post(request) {
    const requestId = request.headers.get("idempotency-key") || randomUUID();
    try {
      if (!sameOrigin(request)) return json({ error: "Origen de solicitud no permitido.", code: "INVALID_ORIGIN" }, 403);
      const user = await getUser(request);
      if (!user) return json({ error: "Inicia sesión para analizar partidos.", code: "AUTH_REQUIRED" }, 401);
      const plan = getPlan(user.selectedPlan);
      if (!plan || !userHasActivePlan(user) || !plan.includesPredictions) return json({ error: "Necesitas un plan activo que incluya predicciones.", code: "PLAN_REQUIRED", redirectTo: "/planes?required=predictions" }, 402);
      if (!/^[a-zA-Z0-9_-]{1,180}$/.test(requestId)) return json({ error: "El identificador de solicitud no es válido.", code: "INVALID_REQUEST_ID" }, 400);
      let body;
      try { body = await request.json(); } catch { return json({ error: "El cuerpo JSON no es válido.", code: "INVALID_PREDICTION_REQUEST" }, 400); }
      const input = validateRequest(body);
      const result = await chatService.process({ userId: user.id, ...input, requestId });
      return json(result);
    } catch (error) {
      const publicError = toPublicPredictionError(error);
      return json({ ...publicError, requestId }, error.status || 500);
    }
  };
}

export const POST = createPredictionsPostHandler();
import { randomUUID } from "node:crypto";
