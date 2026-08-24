import { sanitizeWebText } from "./evidenceExtractor.js";
import { canonicalUrl } from "./sourceEvaluator.js";

const BRAVE_WEB_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_NEWS_ENDPOINT = "https://api.search.brave.com/res/v1/news/search";
const NEWS_RESEARCH_TYPES = new Set([
  "injury",
  "suspension",
  "lineup_confirmed",
  "lineup_probable",
  "rotation",
  "player_return",
  "coach_statement",
  "team_news",
]);

const FRESHNESS_BY_TYPE = Object.freeze({
  lineup_confirmed: "pd",
  lineup_probable: "pw",
  rotation: "pw",
  coach_statement: "pw",
  team_news: "pw",
  injury: "pm",
  suspension: "pm",
  player_return: "pm",
});

export class BraveSearchError extends Error {
  constructor(message, { code = "BRAVE_SEARCH_ERROR", status = null, retryAfter = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "BraveSearchError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function typedHttpError(status, retryAfter) {
  if (status === 401 || status === 403) {
    return new BraveSearchError("Brave Search rechazó las credenciales del servidor.", {
      code: "BRAVE_SEARCH_UNAUTHORIZED",
      status,
    });
  }
  if (status === 429) {
    return new BraveSearchError("Brave Search alcanzó su límite de solicitudes.", {
      code: "BRAVE_SEARCH_RATE_LIMITED",
      status,
      retryAfter: retryAfter || null,
    });
  }
  if (status >= 500) {
    return new BraveSearchError("Brave Search no está disponible temporalmente.", {
      code: "BRAVE_SEARCH_SERVER_ERROR",
      status,
    });
  }
  return new BraveSearchError("Brave Search devolvió una respuesta HTTP no válida.", {
    code: "BRAVE_SEARCH_HTTP_ERROR",
    status,
  });
}

function normalizedQuery(value) {
  const words = sanitizeWebText(value).split(/\s+/).filter(Boolean).slice(0, 50);
  return words.join(" ").slice(0, 400).trim();
}

function relativeDate(value, now) {
  const match = String(value || "").toLowerCase().match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/);
  if (!match) return null;
  const multipliers = {
    minute: 60_000,
    hour: 60 * 60_000,
    day: 24 * 60 * 60_000,
    week: 7 * 24 * 60 * 60_000,
    month: 30 * 24 * 60 * 60_000,
  };
  return new Date(now.getTime() - Number(match[1]) * multipliers[match[2]]).toISOString();
}

function normalizedPublishedAt(item, now) {
  const candidate = item.page_age || item.published_at || item.publishedAt || item.date || null;
  const timestamp = Date.parse(candidate || "");
  if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  return relativeDate(item.age, now);
}

function normalizedSourceName(item, url) {
  const explicit = item.profile?.long_name || item.meta_url?.hostname || item.source || item.publisher || null;
  if (explicit) return sanitizeWebText(explicit).slice(0, 200);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeResult(item, now) {
  const url = canonicalUrl(item?.url);
  if (!url) return null;
  const title = sanitizeWebText(item.title).slice(0, 500);
  const snippet = sanitizeWebText(item.description || item.snippet).slice(0, 1200);
  if (!title && !snippet) return null;
  return {
    title: title || null,
    url,
    snippet: snippet || null,
    publishedAt: normalizedPublishedAt(item, now),
    sourceName: normalizedSourceName(item, url),
  };
}

function payloadResults(payload, isNews) {
  const results = isNews ? payload?.results : payload?.web?.results;
  if (!Array.isArray(results)) {
    throw new BraveSearchError("Brave Search devolvió un payload inválido.", {
      code: "BRAVE_SEARCH_INVALID_RESPONSE",
    });
  }
  return results;
}

export function createBraveSearchProvider({
  apiKey = process.env.BRAVE_SEARCH_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
  now = () => new Date(),
} = {}) {
  const secret = String(apiKey || "").trim();
  const configured = Boolean(secret);

  return {
    name: "brave",
    configured,
    async search({ query, type, maxResults = 10 } = {}) {
      if (!configured) {
        throw new BraveSearchError("Brave Search no está configurado en el servidor.", {
          code: "BRAVE_SEARCH_NOT_CONFIGURED",
        });
      }
      if (typeof fetchImpl !== "function") {
        throw new BraveSearchError("El runtime no dispone de fetch para Brave Search.", {
          code: "BRAVE_SEARCH_FETCH_UNAVAILABLE",
        });
      }
      const safeQuery = normalizedQuery(query);
      if (!safeQuery) {
        throw new BraveSearchError("La consulta de Brave Search está vacía.", {
          code: "BRAVE_SEARCH_INVALID_QUERY",
        });
      }

      const isNews = NEWS_RESEARCH_TYPES.has(type);
      const url = new URL(isNews ? BRAVE_NEWS_ENDPOINT : BRAVE_WEB_ENDPOINT);
      url.searchParams.set("q", safeQuery);
      url.searchParams.set("count", String(Math.max(1, Math.min(Number(maxResults) || 10, 20))));
      url.searchParams.set("spellcheck", "1");
      if (isNews && FRESHNESS_BY_TYPE[type]) url.searchParams.set("freshness", FRESHNESS_BY_TYPE[type]);

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": secret,
          },
          signal: controller.signal,
        });
        if (!response || typeof response.status !== "number" || typeof response.text !== "function") {
          throw new BraveSearchError("Brave Search devolvió una respuesta inválida.", {
            code: "BRAVE_SEARCH_INVALID_RESPONSE",
          });
        }
        if (!response.ok) throw typedHttpError(response.status, response.headers?.get?.("retry-after"));
        let payload;
        try {
          payload = JSON.parse(await response.text());
        } catch (error) {
          throw new BraveSearchError("Brave Search devolvió JSON inválido.", {
            code: "BRAVE_SEARCH_INVALID_RESPONSE",
            cause: error,
          });
        }
        return payloadResults(payload, isNews)
          .map((item) => normalizeResult(item, now()))
          .filter(Boolean)
          .slice(0, Math.max(1, Math.min(Number(maxResults) || 10, 20)));
      } catch (error) {
        if (error instanceof BraveSearchError) throw error;
        if (timedOut || error?.name === "AbortError") {
          throw new BraveSearchError("Brave Search excedió el tiempo de espera.", {
            code: "BRAVE_SEARCH_TIMEOUT",
          });
        }
        throw new BraveSearchError("No fue posible consultar Brave Search.", {
          code: "BRAVE_SEARCH_REQUEST_FAILED",
          cause: error,
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
