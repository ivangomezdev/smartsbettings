import { createHash, randomUUID } from "node:crypto";
import { ensureSchema } from "../../lib/db.js";
import { SportsCacheBusyError } from "../../lib/predictions/errors.js";

const DEFAULT_LEASE_MS = 15_000;
const DEFAULT_WAIT_MS = 5_000;
const DEFAULT_POLL_MS = 250;

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function createCacheKey(provider, resource, params = {}) {
  return createHash("sha256")
    .update(stableStringify({ provider, resource, params }))
    .digest("hex");
}

function parsePayload(payload) {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parsePayload(row.payload),
    fetchedAt: row.fetched_at ? new Date(row.fetched_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

export function createPostgresCacheStore({ getSql = ensureSchema } = {}) {
  return {
    async get(cacheKey) {
      const sql = await getSql();
      const row = rowsFrom(await sql.query(
        "SELECT * FROM sb_sports_cache WHERE cache_key = $1 LIMIT 1",
        [cacheKey],
      ))[0];
      return normalizeRow(row);
    },

    async acquireLease({ cacheKey, provider, resource, params, token, leaseMs }) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `INSERT INTO sb_sports_cache (
          cache_key, provider, resource, request_params, payload, expires_at,
          lock_token, lock_expires_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4::jsonb, NULL, NOW(), $5,
          NOW() + ($6 * INTERVAL '1 millisecond'), NOW(), NOW()
        )
        ON CONFLICT (cache_key) DO UPDATE SET
          lock_token = EXCLUDED.lock_token,
          lock_expires_at = EXCLUDED.lock_expires_at,
          updated_at = NOW()
        WHERE sb_sports_cache.lock_expires_at IS NULL
          OR sb_sports_cache.lock_expires_at <= NOW()
        RETURNING cache_key`,
        [cacheKey, provider, resource, JSON.stringify(stableValue(params)), token, leaseMs],
      ));
      return Boolean(rows[0]);
    },

    async write({ cacheKey, token, payload, ttlMs }) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `UPDATE sb_sports_cache SET
          payload = $3::jsonb,
          fetched_at = NOW(),
          expires_at = NOW() + ($4 * INTERVAL '1 millisecond'),
          lock_token = NULL,
          lock_expires_at = NULL,
          updated_at = NOW()
        WHERE cache_key = $1 AND lock_token = $2
        RETURNING *`,
        [cacheKey, token, JSON.stringify(payload), ttlMs],
      ));
      return normalizeRow(rows[0]);
    },

    async release(cacheKey, token) {
      const sql = await getSql();
      await sql.query(
        `UPDATE sb_sports_cache SET lock_token = NULL, lock_expires_at = NULL, updated_at = NOW()
         WHERE cache_key = $1 AND lock_token = $2`,
        [cacheKey, token],
      );
    },
  };
}

function isEmptyPayload(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (Array.isArray(value.data)) return value.data.length === 0;
  return false;
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createCacheService({
  store = createPostgresCacheStore(),
  now = () => new Date(),
  sleep = defaultSleep,
  leaseMs = DEFAULT_LEASE_MS,
  waitMs = DEFAULT_WAIT_MS,
  pollMs = DEFAULT_POLL_MS,
} = {}) {
  const inFlight = new Map();

  async function waitForOwner(cacheKey, staleEntry) {
    const deadline = now().getTime() + waitMs;
    while (now().getTime() < deadline) {
      await sleep(pollMs);
      const entry = await store.get(cacheKey);
      if (entry?.payload != null && entry.expiresAt?.getTime() > now().getTime()) {
        return { value: entry.payload, meta: { source: "cache", stale: false, fetchedAt: entry.fetchedAt } };
      }
    }
    if (staleEntry?.payload != null) {
      return { value: staleEntry.payload, meta: { source: "cache", stale: true, fetchedAt: staleEntry.fetchedAt } };
    }
    throw new SportsCacheBusyError();
  }

  async function load({ cacheKey, provider, resource, params, ttlMs, emptyTtlMs, loader, allowStale }) {
    const staleEntry = await store.get(cacheKey);
    const token = randomUUID();
    const ownsLease = await store.acquireLease({ cacheKey, provider, resource, params, token, leaseMs });
    if (!ownsLease) return waitForOwner(cacheKey, allowStale ? staleEntry : null);

    try {
      const value = await loader();
      const effectiveTtl = isEmptyPayload(value) ? emptyTtlMs : ttlMs;
      const written = await store.write({ cacheKey, token, payload: value, ttlMs: effectiveTtl });
      return {
        value,
        meta: { source: "provider", stale: false, fetchedAt: written?.fetchedAt || now() },
      };
    } catch (error) {
      await store.release(cacheKey, token).catch(() => null);
      if (allowStale && staleEntry?.payload != null) {
        return {
          value: staleEntry.payload,
          meta: { source: "cache", stale: true, fetchedAt: staleEntry.fetchedAt, warning: error.code || "REFRESH_FAILED" },
        };
      }
      throw error;
    }
  }

  return {
    async getOrLoad({
      provider,
      resource,
      params = {},
      ttlMs,
      emptyTtlMs = Math.min(ttlMs, 15 * 60 * 1000),
      loader,
      allowStale = true,
    }) {
      const cacheKey = createCacheKey(provider, resource, params);
      const existing = await store.get(cacheKey);
      if (existing?.payload != null && existing.expiresAt?.getTime() > now().getTime()) {
        return { value: existing.payload, meta: { source: "cache", stale: false, fetchedAt: existing.fetchedAt } };
      }

      if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
      const promise = load({ cacheKey, provider, resource, params, ttlMs, emptyTtlMs, loader, allowStale })
        .finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, promise);
      return promise;
    },
  };
}
