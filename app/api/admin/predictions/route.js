import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { hasAdminAccess, isAdminConfigured } from "../../../../lib/admin-auth.js";
import { json, handleApiError } from "../../../../lib/api.js";
import { isSameOrigin } from "../../../../lib/auth.js";
import { ensureSchema } from "../../../../lib/db.js";
import { plans } from "../../../../lib/plans.js";

const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxTicketSize = 5 * 1024 * 1024;

async function hasValidImageSignature(file, mimeType) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (mimeType === "image/webp") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function adminGuard(request) {
  if (!isAdminConfigured()) return json({ error: "ADMIN_API_KEY no está configurada." }, 503);
  if (!hasAdminAccess(request)) return json({ error: "Sesión de administrador no válida." }, 401);
  return null;
}

function optionalHttpUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return ["http:", "https:"].includes(parsed.protocol) && text.length <= 2048 ? parsed.toString() : false;
  } catch {
    return false;
  }
}

export async function GET(request) {
  const denied = adminGuard(request);
  if (denied) return denied;

  try {
    const sql = await ensureSchema();
    const rows = await sql`
      SELECT
        id, sport, league, event_name, pick_text, bookmaker, odds, analysis,
        ticket_image_url, bet_link, starts_at, status, allowed_plans, created_at
      FROM sb_predictions
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return json({
      predictions: rows.map((row) => ({
        id: row.id,
        sport: row.sport,
        league: row.league,
        eventName: row.event_name,
        pick: row.pick_text,
        bookmaker: row.bookmaker,
        odds: row.odds,
        analysis: row.analysis,
        ticketImageUrl: row.ticket_image_url,
        betLink: row.bet_link,
        startsAt: row.starts_at,
        status: row.status,
        allowedPlans: row.allowed_plans,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) return json({ error: "Origen de solicitud no permitido." }, 403);
  const denied = adminGuard(request);
  if (denied) return denied;

  let uploadedTicketUrl = null;

  try {
    const contentType = request.headers.get("content-type") || "";
    const multipart = contentType.includes("multipart/form-data");
    const body = multipart ? await request.formData() : await request.json();
    const value = (key) => multipart ? body.get(key) : body[key];

    const sport = typeof value("sport") === "string" ? value("sport").trim() : "";
    const league = typeof value("league") === "string" ? value("league").trim() : "";
    const eventName = typeof value("eventName") === "string" ? value("eventName").trim() : "";
    const pick = typeof value("pick") === "string" ? value("pick").trim() : "";
    const bookmaker = typeof value("bookmaker") === "string" ? value("bookmaker").trim() : "";
    const analysis = typeof value("analysis") === "string" ? value("analysis").trim() : "";
    const startsAt = new Date(value("startsAt"));
    const rawOdds = value("odds");
    const odds = rawOdds === "" || rawOdds == null ? null : Number(rawOdds);
    const betLink = optionalHttpUrl(value("betLink"));
    const rawPlans = multipart ? body.getAll("allowedPlans") : body.allowedPlans;
    const allowedPlanIds = Array.isArray(rawPlans) && rawPlans.length
      ? [...new Set(rawPlans)]
      : ["starter", "predicciones"];
    const predictionPlanIds = new Set(plans.filter((plan) => plan.includesPredictions).map((plan) => plan.id));
    const ticket = multipart ? body.get("ticket") : null;

    if (!sport || sport.length > 60 || !eventName || eventName.length > 180 || !pick || pick.length > 220) {
      return json({ error: "Completa deporte, evento y apuesta con longitudes válidas." }, 400);
    }
    if (league.length > 100 || bookmaker.length > 100 || analysis.length > 5000 || Number.isNaN(startsAt.getTime())) {
      return json({ error: "Casa de apuesta, liga, análisis o fecha no son válidos." }, 400);
    }
    if (odds !== null && (!Number.isFinite(odds) || odds < 1 || odds > 1000)) {
      return json({ error: "La cuota debe ser un número entre 1 y 1000." }, 400);
    }
    if (betLink === false) {
      return json({ error: "El enlace directo debe comenzar con http:// o https://." }, 400);
    }
    if (!allowedPlanIds.length || allowedPlanIds.some((planId) => !predictionPlanIds.has(planId))) {
      return json({ error: "Los planes permitidos no son válidos para predicciones." }, 400);
    }

    if (ticket && typeof ticket.arrayBuffer === "function" && ticket.size > 0) {
      const extension = allowedImageTypes.get(ticket.type);
      if (!extension) return json({ error: "La captura debe ser JPG, PNG o WEBP." }, 400);
      if (ticket.size > maxTicketSize) return json({ error: "La captura no puede superar 5 MB." }, 400);
      if (!(await hasValidImageSignature(ticket, ticket.type))) {
        return json({ error: "El archivo no contiene una imagen válida." }, 400);
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return json({ error: "Falta conectar Vercel Blob para guardar la captura." }, 503);
      }

      const blob = await put(`tickets/${randomUUID()}.${extension}`, ticket, {
        access: "public",
        addRandomSuffix: true,
        contentType: ticket.type,
      });
      uploadedTicketUrl = blob.url;
    }

    const id = randomUUID();
    const sql = await ensureSchema();
    await sql`
      INSERT INTO sb_predictions (
        id, sport, league, event_name, pick_text, bookmaker, odds, analysis,
        ticket_image_url, bet_link, starts_at, status, allowed_plans
      ) VALUES (
        ${id}, ${sport}, ${league || null}, ${eventName}, ${pick}, ${bookmaker || null},
        ${odds}, ${analysis || null}, ${uploadedTicketUrl}, ${betLink || null},
        ${startsAt.toISOString()}, 'published', ${JSON.stringify(allowedPlanIds)}::jsonb
      )
    `;

    return json({
      prediction: {
        id, sport, league, eventName, pick, bookmaker, odds, analysis,
        ticketImageUrl: uploadedTicketUrl, betLink, startsAt, status: "published",
        allowedPlans: allowedPlanIds,
      },
    }, 201);
  } catch (error) {
    if (uploadedTicketUrl) await del(uploadedTicketUrl).catch(() => null);
    return handleApiError(error);
  }
}
