import bcrypt from "bcryptjs";
import { json, handleApiError } from "../../../../lib/api.js";
import {
  attachSessionCookie,
  createSession,
  isSameOrigin,
  normalizeUsername,
  validateCredentials,
} from "../../../../lib/auth.js";
import { ensureSchema } from "../../../../lib/db.js";

const DUMMY_PASSWORD_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttxz4A..JvH6U/PW/GMxPs5E.Nji";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return json({ error: "Origen de solicitud no permitido." }, 403);
  }

  try {
    const body = await request.json();
    const username = normalizeUsername(body.username);
    const password = body.password;
    const validationError = validateCredentials(username, password);

    if (validationError) {
      return json({ error: "Usuario o contraseña incorrectos." }, 401);
    }

    const sql = await ensureSchema();
    const rows = await sql`
      SELECT id, username, password_hash, selected_plan, failed_login_count, locked_until
      FROM sb_users
      WHERE username = ${username}
      LIMIT 1
    `;
    const user = rows[0];

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      return json(
        { error: "Demasiados intentos. Espera 15 minutos antes de volver a intentar." },
        429,
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user?.password_hash || DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      if (user) {
        await sql`
          UPDATE sb_users
          SET
            failed_login_count = failed_login_count + 1,
            locked_until = CASE
              WHEN failed_login_count + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
              ELSE NULL
            END,
            updated_at = NOW()
          WHERE id = ${user.id}
        `;
      }
      return json({ error: "Usuario o contraseña incorrectos." }, 401);
    }

    await sql`
      UPDATE sb_users
      SET failed_login_count = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = ${user.id}
    `;

    const token = await createSession(user.id);
    const response = json({
      user: {
        id: user.id,
        username: user.username,
        selectedPlan: user.selected_plan,
      },
    });
    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
