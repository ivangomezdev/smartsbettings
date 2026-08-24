import {
  SportsApiAuthenticationError,
  SportsApiConfigurationError,
  SportsApiPlanRestrictionError,
  SportsApiQuotaError,
  SportsApiResponseError,
  SportsApiTimeoutError,
  SportsApiUnavailableError,
} from "../../lib/predictions/errors.js";

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEOUT_MS = 12_000;

function providerErrors(errors) {
  if (Array.isArray(errors)) return errors.filter(Boolean).map(String);
  if (errors && typeof errors === "object") {
    return Object.entries(errors)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}: ${value}`);
  }
  return errors ? [String(errors)] : [];
}

function safeResource(resource) {
  const value = typeof resource === "string" ? resource.trim().replace(/^\/+/, "") : "";
  if (!value || value.includes("://") || value.includes("..") || !/^[a-z0-9/_-]+$/i.test(value)) {
    throw new SportsApiResponseError({ reason: "invalid_resource" });
  }
  return value;
}

function buildUrl(baseUrl, resource, params) {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/${safeResource(resource)}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function isValidEnvelope(body) {
  return body
    && typeof body === "object"
    && body.response !== null
    && (Array.isArray(body.response) || typeof body.response === "object")
    && Number.isInteger(body.results)
    && body.paging
    && Number.isInteger(body.paging.current)
    && Number.isInteger(body.paging.total);
}

export function createApiFootballClient({
  apiKey = process.env.API_FOOTBALL_KEY,
  baseUrl = API_FOOTBALL_BASE_URL,
  fetchImpl = globalThis.fetch,
  quotaService = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  return {
    name: "api-football",
    capabilities: Object.freeze({
      teams: true,
      fixtures: true,
      recentEvents: true,
      seasonStatistics: true,
      eventStatistics: true,
      eventLineups: true,
      h2h: true,
      injuries: true,
      odds: true,
    }),
    async request(resource, params = {}) {
      if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
        throw new SportsApiConfigurationError();
      }
      if (typeof fetchImpl !== "function") throw new SportsApiUnavailableError();

      await quotaService?.reserve();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;

      try {
        response = await fetchImpl(buildUrl(baseUrl, resource, params), {
          method: "GET",
          headers: { "x-apisports-key": apiKey.trim() },
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (error) {
        if (error?.name === "AbortError") throw new SportsApiTimeoutError();
        throw new SportsApiUnavailableError();
      } finally {
        clearTimeout(timeout);
      }

      const quota = await quotaService?.recordHeaders(response.headers).catch(() => null);
      if ([401, 403].includes(response.status)) throw new SportsApiAuthenticationError();
      if (response.status === 429) throw new SportsApiQuotaError();
      if (response.status === 499) throw new SportsApiTimeoutError();
      if (response.status >= 500) throw new SportsApiUnavailableError();

      let body;
      try {
        body = JSON.parse(await response.text());
      } catch {
        throw new SportsApiResponseError({ reason: "invalid_json", status: response.status });
      }

      if (!response.ok) {
        throw new SportsApiResponseError({ reason: "http_error", status: response.status });
      }

      const errors = providerErrors(body?.errors);
      if (errors.length) {
        const normalized = errors.join(" ").toLowerCase();
        if (/key|token|auth/.test(normalized)) throw new SportsApiAuthenticationError();
        if (/limit|quota|rate/.test(normalized)) throw new SportsApiQuotaError();
        if (/\bplan\b|free plans?/.test(normalized)) throw new SportsApiPlanRestrictionError();
        throw new SportsApiResponseError({ reason: "provider_error" });
      }
      if (!isValidEnvelope(body)) throw new SportsApiResponseError({ reason: "invalid_envelope" });

      return {
        data: body.response,
        results: body.results,
        paging: body.paging,
        meta: {
          fetchedAt: now().toISOString(),
          quota: quota || null,
        },
      };
    },
  };
}
