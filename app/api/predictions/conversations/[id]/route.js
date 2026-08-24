import { json } from "../../../../../lib/api.js";
import { getSessionUser, hasActivePlan } from "../../../../../lib/auth.js";
import { getPlanById } from "../../../../../lib/plans.js";
import { createConversationService } from "../../../../../services/predictions/conversationService.js";

const service = createConversationService();

export async function GET(request, { params }) {
  try {
    const user = await getSessionUser(request);
    if (!user) return json({ error: "Inicia sesión para ver esta conversación." }, 401);
    const plan = getPlanById(user.selectedPlan);
    if (!plan || !hasActivePlan(user) || !plan.includesPredictions) return json({ error: "Necesitas un plan activo.", code: "PLAN_REQUIRED" }, 402);
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{1,180}$/.test(id)) return json({ error: "Conversación no válida." }, 400);
    const conversation = await service.get({ userId: user.id, conversationId: id });
    if (!conversation) return json({ error: "Conversación no encontrada.", code: "CONVERSATION_NOT_FOUND" }, 404);
    return json({ conversation });
  } catch { return json({ error: "No pudimos cargar la conversación." }, 500); }
}
