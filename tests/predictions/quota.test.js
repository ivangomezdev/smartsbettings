import test from "node:test";
import assert from "node:assert/strict";
import { createQuotaService, getQuotaBudgets, parseQuotaHeaders } from "../../services/predictions/quotaService.js";

test("limita presupuestos configurados a los topes del proveedor", () => {
  assert.deepEqual(getQuotaBudgets({ API_FOOTBALL_DAILY_BUDGET: "500", API_FOOTBALL_MINUTE_BUDGET: "30" }), { daily: 100, minute: 10 });
  assert.deepEqual(getQuotaBudgets({}), { daily: 90, minute: 9 });
});

test("interpreta headers de cuota sin aceptar valores inválidos", () => {
  const headers = new Headers({
    "x-ratelimit-requests-limit": "100",
    "x-ratelimit-requests-remaining": "88",
    "x-ratelimit-limit": "10",
    "x-ratelimit-remaining": "8",
  });
  assert.deepEqual(parseQuotaHeaders(headers), { dailyLimit: 100, dailyRemaining: 88, minuteLimit: 10, minuteRemaining: 8 });
});

test("reserva antes de llamar y registra headers", async () => {
  const calls = [];
  const store = {
    reserve: async (input) => { calls.push(["reserve", input]); return { allowed: true, status: { request_count: 1 } }; },
    recordHeaders: async (input) => { calls.push(["headers", input]); },
    getStatus: async () => ({ request_count: 1 }),
  };
  const quota = createQuotaService({ store, budgets: { daily: 90, minute: 9 } });
  await quota.reserve();
  await quota.recordHeaders(new Headers({ "x-ratelimit-requests-remaining": "99" }));
  assert.equal(calls[0][0], "reserve");
  assert.equal(calls[1][1].quota.dailyRemaining, 99);
});

test("bloquea y tipa límites diarios o por minuto", async () => {
  for (const reason of ["daily", "minute"]) {
    const quota = createQuotaService({
      store: {
        reserve: async () => ({ allowed: false, reason, retryAfterSeconds: 30 }),
        recordHeaders: async () => {},
        getStatus: async () => null,
      },
    });
    await assert.rejects(quota.reserve(), { code: "SPORTS_API_QUOTA_EXCEEDED", status: 429 });
  }
});
