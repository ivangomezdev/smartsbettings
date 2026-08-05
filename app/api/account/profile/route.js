import { json, handleApiError } from "../../../../lib/api.js";
import { getSessionUser, isSameOrigin, normalizeUsername } from "../../../../lib/auth.js";
import { ensureSchema } from "../../../../lib/db.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Origen de solicitud no permitido." }, 403);
  }

  try {
    const user = await getSessionUser(request);
    if (!user) return json({ error: "Inicia sesión para editar tu cuenta." }, 401);

    const body = await request.json();
    const username = normalizeUsername(body.username);
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return json({ error: "El usuario debe tener entre 3 y 30 caracteres válidos." }, 400);
    }
    if (displayName && (displayName.length < 2 || displayName.length > 80)) {
      return json({ error: "El nombre debe tener entre 2 y 80 caracteres." }, 400);
    }
    if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
      return json({ error: "Escribe un correo electrónico válido." }, 400);
    }

    const sql = await ensureSchema();
    const duplicate = await sql`
      SELECT username, email
      FROM sb_users
      WHERE id <> ${user.id}
        AND (username = ${username} OR (${email || null} IS NOT NULL AND LOWER(email) = ${email || null}))
      LIMIT 1
    `;

    if (duplicate[0]?.username === username) {
      return json({ error: "Ese nombre de usuario ya está ocupado." }, 409);
    }
    if (email && duplicate[0]?.email?.toLowerCase() === email) {
      return json({ error: "Ese correo ya está asociado a otra cuenta." }, 409);
    }

    await sql`
      UPDATE sb_users
      SET
        username = ${username},
        display_name = ${displayName || null},
        email = ${email || null},
        updated_at = NOW()
      WHERE id = ${user.id}
    `;

    return json({
      user: {
        ...user,
        username,
        displayName: displayName || null,
        email: email || null,
      },
    });
  } catch (error) {
    if (error?.code === "23505") {
      return json({ error: "El usuario o correo ya pertenece a otra cuenta." }, 409);
    }
    return handleApiError(error);
  }
}
