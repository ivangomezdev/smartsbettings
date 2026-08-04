import { json, handleApiError } from "../../../../lib/api.js";
import {
  clearSessionCookie,
  deleteSession,
  isSameOrigin,
} from "../../../../lib/auth.js";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Origen de solicitud no permitido." }, 403);
  }

  try {
    await deleteSession(request);
    const response = json({ ok: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
