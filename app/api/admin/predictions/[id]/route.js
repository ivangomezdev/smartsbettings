import { del } from "@vercel/blob";
import { hasAdminAccess, isAdminConfigured } from "../../../../../lib/admin-auth.js";
import { json, handleApiError } from "../../../../../lib/api.js";
import { isSameOrigin } from "../../../../../lib/auth.js";
import { ensureSchema } from "../../../../../lib/db.js";

export async function DELETE(request, { params }) {
  if (!isSameOrigin(request)) return json({ error: "Origen de solicitud no permitido." }, 403);
  if (!isAdminConfigured()) return json({ error: "ADMIN_API_KEY no está configurada." }, 503);
  if (!hasAdminAccess(request)) return json({ error: "Sesión de administrador no válida." }, 401);

  try {
    const { id } = await params;
    const sql = await ensureSchema();
    const rows = await sql`DELETE FROM sb_predictions WHERE id = ${id} RETURNING ticket_image_url`;
    if (!rows[0]) return json({ error: "El pick no existe." }, 404);

    if (rows[0].ticket_image_url && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(rows[0].ticket_image_url).catch(() => null);
    }
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
