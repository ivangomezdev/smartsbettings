import bcrypt from "bcryptjs";
import { json, handleApiError } from "../../../../lib/api.js";
import {
  getSessionUser,
  hashSessionToken,
  isSameOrigin,
  SESSION_COOKIE,
} from "../../../../lib/auth.js";
import { ensureSchema } from "../../../../lib/db.js";

export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Origen de solicitud no permitido." }, 403);
  }

  try {
    const user = await getSessionUser(request);
    if (!user) return json({ error: "Inicia sesión para cambiar la contraseña." }, 401);

    const body = await request.json();
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return json({ error: "Completa ambas contraseñas." }, 400);
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      return json({ error: "La nueva contraseña debe tener entre 8 y 72 caracteres." }, 400);
    }
    if (currentPassword === newPassword) {
      return json({ error: "La nueva contraseña debe ser diferente a la actual." }, 400);
    }

    const sql = await ensureSchema();
    const rows = await sql`SELECT password_hash FROM sb_users WHERE id = ${user.id} LIMIT 1`;
    const matches = rows[0] && await bcrypt.compare(currentPassword, rows[0].password_hash);

    if (!matches) {
      return json({ error: "La contraseña actual no es correcta." }, 401);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await sql`
      UPDATE sb_users
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE id = ${user.id}
    `;

    const currentToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (currentToken) {
      await sql`
        DELETE FROM sb_sessions
        WHERE user_id = ${user.id}
          AND token_hash <> ${hashSessionToken(currentToken)}
      `;
    }

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
