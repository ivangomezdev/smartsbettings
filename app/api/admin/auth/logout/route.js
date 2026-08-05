import { clearAdminCookie } from "../../../../../lib/admin-auth.js";
import { json } from "../../../../../lib/api.js";
import { isSameOrigin } from "../../../../../lib/auth.js";

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "Origen de solicitud no permitido." }, 403);
  const response = json({ ok: true });
  clearAdminCookie(response);
  return response;
}
