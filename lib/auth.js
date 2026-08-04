import { createHash, randomBytes } from "node:crypto";
import { ensureSchema } from "./db.js";

export const SESSION_COOKIE = "sb_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateCredentials(username, password) {
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    return "El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.";
  }

  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return "La contraseña debe tener entre 8 y 72 caracteres.";
  }

  return null;
}

export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId) {
  const sql = await ensureSchema();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await sql`
    INSERT INTO sb_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${userId}, ${expiresAt.toISOString()})
  `;

  return token;
}

export function attachSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export async function getSessionUser(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const sql = await ensureSchema();
  const tokenHash = hashSessionToken(token);
  const rows = await sql`
    SELECT u.id, u.username, u.selected_plan
    FROM sb_sessions s
    JOIN sb_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (!rows[0]) {
    return null;
  }

  return {
    id: rows[0].id,
    username: rows[0].username,
    selectedPlan: rows[0].selected_plan,
  };
}

export async function deleteSession(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return;
  }

  const sql = await ensureSchema();
  await sql`DELETE FROM sb_sessions WHERE token_hash = ${hashSessionToken(token)}`;
}
