import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "sb_admin_session";
const ADMIN_MAX_AGE = 60 * 60 * 8;
const ADMIN_SESSION_MESSAGE = "smartbetting-admin-session-v1";

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionSignature(issuedAt) {
  if (!process.env.ADMIN_API_KEY) return "";
  return createHmac("sha256", process.env.ADMIN_API_KEY)
    .update(`${ADMIN_SESSION_MESSAGE}:${issuedAt}`)
    .digest("base64url");
}

export function isAdminConfigured() {
  return Boolean(process.env.ADMIN_API_KEY);
}

export function verifyAdminPassword(password) {
  return isAdminConfigured() && safeCompare(password, process.env.ADMIN_API_KEY);
}

export function hasAdminAccess(request) {
  if (!isAdminConfigured()) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && safeCompare(bearer, process.env.ADMIN_API_KEY)) return true;

  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!cookie) return false;
  const [issuedAtText, signature] = cookie.split(".");
  const issuedAt = Number(issuedAtText);
  const age = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || age < 0 || age > ADMIN_MAX_AGE * 1000) return false;
  return safeCompare(signature, sessionSignature(issuedAtText));
}

export function attachAdminCookie(response) {
  const issuedAt = Date.now().toString();
  response.cookies.set(ADMIN_COOKIE, `${issuedAt}.${sessionSignature(issuedAt)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_MAX_AGE,
    path: "/",
  });
}

export function clearAdminCookie(response) {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}
