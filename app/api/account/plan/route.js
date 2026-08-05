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
      SET
        selected_plan = ${plan.id},
        plan_status = 'pending',
        plan_started_at = NULL,
        plan_expires_at = NULL,
        updated_at = NOW()
      WHERE id = ${user.id}
    `;

    return json({
      plan: {
        id: plan.id,
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        status: "pending",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Origen de solicitud no permitido." }, 403);
  }

  try {
    const user = await getSessionUser(request);

    if (!user) {
      return json({ error: "Inicia sesión para activar un plan." }, 401);
    }

    const plan = getPlanById(user.selectedPlan);

    if (!plan || user.planStatus !== "pending") {
      return json({ error: "Primero selecciona un plan y abre el checkout." }, 400);
    }

    const sql = await ensureSchema();
    const expiresAt = new Date(Date.now() + plan.accessDays * 24 * 60 * 60 * 1000);
    await sql`
      UPDATE sb_users
      SET
        plan_status = 'active',
        plan_started_at = NOW(),
        plan_expires_at = ${expiresAt.toISOString()},
        updated_at = NOW()
      WHERE id = ${user.id}
    `;

    return json({
      plan: {
        id: plan.id,
        name: plan.name,
        status: "active",
        expiresAt: expiresAt.toISOString(),
      },
      demo: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
