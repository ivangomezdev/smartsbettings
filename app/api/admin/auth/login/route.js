import { attachAdminCookie, isAdminConfigured, verifyAdminPassword } from "../../../../../lib/admin-auth.js";
import { json } from "../../../../../lib/api.js";
import { isSameOrigin } from "../../../../../lib/auth.js";

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "Origen de solicitud no permitido." }, 403);
  if (!isAdminConfigured()) return json({ error: "ADMIN_API_KEY no está configurada." }, 503);

  const body = await request.json().catch(() => ({}));
  if (!verifyAdminPassword(body.password)) {
    return json({ error: "Clave de administrador incorrecta." }, 401);
  }

  const response = json({ authenticated: true });
  attachAdminCookie(response);
  return response;
}
