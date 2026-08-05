import { json, handleApiError } from "../../../lib/api.js";
import { getSessionUser, hasActivePlan } from "../../../lib/auth.js";
import { ensureSchema } from "../../../lib/db.js";
import { getPlanById } from "../../../lib/plans.js";

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
