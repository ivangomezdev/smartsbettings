import { randomUUID } from "node:crypto";
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
      return json({ error: validationError }, 400);
    }

    const sql = await ensureSchema();
    const existing = await sql`SELECT id FROM sb_users WHERE username = ${username} LIMIT 1`;

    if (existing[0]) {
      return json({ error: "Ese nombre de usuario ya está registrado." }, 409);
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await sql`
        INSERT INTO sb_users (id, username, password_hash)
        VALUES (${userId}, ${username}, ${passwordHash})
      `;
    } catch (error) {
      if (error?.code === "23505") {
        return json({ error: "Ese nombre de usuario ya está registrado." }, 409);
      }
      throw error;
    }

    const token = await createSession(userId);
    const response = json({
      user: {
        id: userId,
        username,
        displayName: null,
        email: null,
        selectedPlan: null,
        planStatus: "inactive",
        planStartedAt: null,
        planExpiresAt: null,
      },
    }, 201);
    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
