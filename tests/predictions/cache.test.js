import test from "node:test";
import assert from "node:assert/strict";
import { createCacheKey, createCacheService } from "../../services/predictions/cacheService.js";

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(key) { return rows.get(key) || null; },
    async acquireLease({ cacheKey, token }) {
      const row = rows.get(cacheKey);
      if (row?.locked) return false;
      rows.set(cacheKey, { ...(row || {}), locked: true, token, expiresAt: row?.expiresAt || new Date(0) });
      return true;
    },
    async write({ cacheKey, token, payload, ttlMs }) {
      const current = rows.get(cacheKey);
      assert.equal(current.token, token);
      const row = { payload, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttlMs), locked: false };
      rows.set(cacheKey, row);
      return row;
    },
    async release(cacheKey) {
      const row = rows.get(cacheKey);
      if (row) row.locked = false;
    },
  };
}

test("genera la misma clave para parámetros equivalentes", () => {
  assert.equal(
    createCacheKey("api-football", "teams", { search: "Madrid", page: 1 }),
    createCacheKey("api-football", "teams", { page: 1, search: "Madrid" }),
  );
});

test("sirve hits sin ejecutar el loader", async () => {
  const store = memoryStore();
  const key = createCacheKey("api-football", "teams", { search: "Madrid" });
  store.rows.set(key, { payload: { data: [1] }, fetchedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
  const cache = createCacheService({ store });
  let loads = 0;
  const result = await cache.getOrLoad({ provider: "api-football", resource: "teams", params: { search: "Madrid" }, ttlMs: 60_000, loader: async () => { loads += 1; } });
  assert.equal(loads, 0);
  assert.equal(result.meta.source, "cache");
});

test("deduplica loaders simultáneos dentro de la instancia", async () => {
  const store = memoryStore();
  const cache = createCacheService({ store });
  let loads = 0;
  const request = () => cache.getOrLoad({
    provider: "api-football",
    resource: "teams",
    params: { search: "Madrid" },
    ttlMs: 60_000,
    loader: async () => {
      loads += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { data: [1] };
    },
  });
  const [first, second] = await Promise.all([request(), request()]);
  assert.equal(loads, 1);
  assert.deepEqual(first.value, second.value);
});

test("devuelve stale y libera el lease cuando falla el refresco", async () => {
  const store = memoryStore();
  const key = createCacheKey("api-football", "teams", { search: "Madrid" });
  store.rows.set(key, { payload: { data: [1] }, fetchedAt: new Date(0), expiresAt: new Date(0), locked: false });
  const cache = createCacheService({ store });
  const result = await cache.getOrLoad({
    provider: "api-football",
    resource: "teams",
    params: { search: "Madrid" },
    ttlMs: 60_000,
    loader: async () => { throw Object.assign(new Error("down"), { code: "DOWN" }); },
  });
  assert.equal(result.meta.stale, true);
  assert.equal(result.meta.warning, "DOWN");
  assert.equal(store.rows.get(key).locked, false);
});
