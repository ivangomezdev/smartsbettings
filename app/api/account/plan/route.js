import { json, handleApiError } from "../../../../lib/api.js";
import { getSessionUser, isSameOrigin } from "../../../../lib/auth.js";
import { ensureSchema } from "../../../../lib/db.js";
import { getPlanById } from "../../../../lib/plans.js";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Origen de solicitud no permitido." }, 403);
  }

  try {
    const user = await getSessionUser(request);

    if (!user) {
      return json({ error: "Inicia sesión para elegir un plan." }, 401);
    }

    const body = await request.json();
    const plan = getPlanById(body.planId);

    if (!plan) {
      return json({ error: "El plan seleccionado no existe." }, 400);
    }

    const sql = await ensureSchema();
    await sql`
      UPDATE sb_users
      SET selected_plan = ${plan.id}, updated_at = NOW()
      WHERE id = ${user.id}
    `;

    return json({
      plan: {
        id: plan.id,
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
