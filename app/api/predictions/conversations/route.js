import { json } from "../../../../lib/api.js";
import { getSessionUser, hasActivePlan, isSameOrigin } from "../../../../lib/auth.js";
import { getPlanById } from "../../../../lib/plans.js";
import { createConversationService } from "../../../../services/predictions/conversationService.js";

const service = createConversationService();

async function access(request) {
  const user = await getSessionUser(request);
  if (!user) return { response: json({ error: "Inicia sesión para ver tus conversaciones." }, 401) };
  const plan = getPlanById(user.selectedPlan);
  if (!plan || !hasActivePlan(user) || !plan.includesPredictions) return { response: json({ error: "Necesitas un plan activo.", code: "PLAN_REQUIRED" }, 402) };
  return { user };
}

export async function GET(request) {
  try {
    const auth = await access(request);
    if (auth.response) return auth.response;
    return json({ conversations: await service.list({ userId: auth.user.id }) });
  } catch { return json({ error: "No pudimos cargar las conversaciones." }, 500); }
}

export async function POST(request) {
  try {
    if (!isSameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
    const auth = await access(request);
    if (auth.response) return auth.response;
    return json({ conversation: await service.create({ userId: auth.user.id }) }, 201);
  } catch { return json({ error: "No pudimos crear la conversación." }, 500); }
}
