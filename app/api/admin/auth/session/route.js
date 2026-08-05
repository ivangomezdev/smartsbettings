import { hasAdminAccess, isAdminConfigured } from "../../../../../lib/admin-auth.js";
import { json } from "../../../../../lib/api.js";

export async function GET(request) {
  if (!isAdminConfigured()) return json({ authenticated: false, configured: false }, 503);
  if (!hasAdminAccess(request)) return json({ authenticated: false, configured: true }, 401);
  return json({ authenticated: true, configured: true });
}
