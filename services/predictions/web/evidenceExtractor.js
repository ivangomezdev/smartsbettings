import { randomUUID } from "node:crypto";
import { CRITICAL_EVIDENCE_TYPES, WEB_RESEARCH_CONFIG } from "./config.js";
import { evaluateSource } from "./sourceEvaluator.js";

const VALID_STATUSES = new Set(["OUT", "DOUBTFUL", "QUESTIONABLE", "SUSPENDED", "AVAILABLE", "UNKNOWN", "CONFIRMED", "PROBABLE", "PROJECTED"]);
const INJECTION_PATTERNS = [
  /ignore (all|previous) instructions/gi,
  /reveal (the )?(secret|api key|prompt)/gi,
  /execute (this )?(code|command)/gi,
  /database[_ ]url/gi,
  /api[_ -]?key/gi,
  /\bsk-[a-z0-9_-]{8,}\b/gi,
  /postgres(?:ql)?:\/\/\S+/gi,
];

export function sanitizeWebText(value) {
  let text = String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
  for (const pattern of INJECTION_PATTERNS) text = text.replace(pattern, "[UNTRUSTED_CONTENT_REMOVED]");
  return text;
}

function normalizedStatus(value, type) {
  const upper = String(value || "UNKNOWN").toUpperCase();
  if (type === "lineup_confirmed") return upper === "CONFIRMED" ? "CONFIRMED" : "UNKNOWN";
  if (type === "lineup_probable") return upper === "CONFIRMED" ? "PROBABLE" : VALID_STATUSES.has(upper) ? upper : "PROBABLE";
  return VALID_STATUSES.has(upper) ? upper : "UNKNOWN";
}

function inferredStatus(claim, type) {
  const text = String(claim || "").toLowerCase();
  if (type === "lineup_confirmed") return /confirmed|official (lineup|starting)|starting (xi|lineup)|alineaci[oó]n confirmada/.test(text) ? "CONFIRMED" : "UNKNOWN";
  if (type === "lineup_probable") return "PROBABLE";
  if (type === "suspension" && /suspend|sancionad|ban(?:ned)?/.test(text)) return "SUSPENDED";
  if (type === "player_return" || /has return(?:ed)?|back in training|fit again|is available|regres[oó] al equipo|alta m[eé]dica/.test(text)) return "AVAILABLE";
  if (/doubtful|fitness doubt|questionable|duda|dudoso/.test(text)) return "DOUBTFUL";
  if (/ruled out|will miss|unavailable|not available|side-lined|sidelined|descartad|ser[aá] baja|no estar[aá] disponible/.test(text)) return "OUT";
  return "UNKNOWN";
}

function supportsCriticalClaim({ type, status, result, input }) {
  if (input.status || input.subject || input.starters?.length) return true;
  const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
  if (type === "injury" || type === "suspension" || type === "player_return") return status !== "UNKNOWN";
  if (type === "lineup_confirmed") return status === "CONFIRMED";
  if (type === "lineup_probable") return /lineup|line-up|starting xi|alineaci[oó]n|possible xi|predicted xi/.test(text);
  if (type === "rotation") return /rotat|rest(?:ed|ing)?|squad changes|cambios en el once/.test(text);
  return true;
}

export function extractEvidence({ result, type, team = null, now = new Date(), config = WEB_RESEARCH_CONFIG } = {}) {
  const source = evaluateSource(result);
  if (!source.accepted) return { evidence: null, warning: source.reason };
  const publishedAt = Date.parse(result.publishedAt || "");
  const maximumAge = config.maxAgeMs[type] ?? 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(publishedAt) || now.getTime() - publishedAt > maximumAge || publishedAt > now.getTime() + 5 * 60 * 1000) {
    return { evidence: null, warning: "STALE_OR_INVALID_EVIDENCE" };
  }
  const input = result.evidence || {};
  const claim = sanitizeWebText(input.claim || result.snippet || result.title);
  if (!claim) return { evidence: null, warning: "EMPTY_EVIDENCE" };
  const status = normalizedStatus(input.status || inferredStatus(claim, type), type);
  const critical = CRITICAL_EVIDENCE_TYPES.has(type);
  if (critical && !supportsCriticalClaim({ type, status, result, input })) {
    return { evidence: null, warning: "UNSUPPORTED_CRITICAL_CLAIM" };
  }
  const confidence = source.tier === 1 ? "high" : source.tier === 2 ? "medium" : "low";
  return {
    evidence: {
      id: input.id || randomUUID(),
      type,
      subjectType: input.subjectType || (input.subject ? "player" : "team"),
      subject: sanitizeWebText(input.subject || team || "unknown"),
      team: sanitizeWebText(input.team || team),
      status,
      claim,
      source: {
        name: sanitizeWebText(result.sourceName || new URL(source.url).hostname),
        url: source.url,
        tier: source.tier,
        publishedAt: new Date(publishedAt).toISOString(),
        retrievedAt: now.toISOString(),
      },
      confidence,
      evidenceSummary: sanitizeWebText(input.evidenceSummary || claim),
      eventRelevance: input.eventRelevance || "medium",
      playerImportance: input.playerImportance?.available === true ? input.playerImportance : { available: false },
      ...(type.startsWith("lineup_") ? {
        starters: Array.isArray(input.starters) ? input.starters.map(sanitizeWebText).filter(Boolean) : [],
        substitutes: Array.isArray(input.substitutes) ? input.substitutes.map(sanitizeWebText).filter(Boolean) : [],
        formation: sanitizeWebText(input.formation) || null,
        lineupStatus: status,
      } : {}),
      provenance: { sourceType: "web", sourceName: sanitizeWebText(result.sourceName), sourceUrl: source.url },
    },
  };
}
