import test from "node:test";
import assert from "node:assert/strict";
import { createApiFootballClient } from "../../services/predictions/apiFootballClient.js";

function successBody(response = []) {
  return JSON.stringify({ get: "teams", parameters: {}, errors: [], results: response.length, paging: { current: 1, total: 1 }, response });
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers });
}

test("autentica por header, codifica parámetros y valida el envelope", async () => {
  let captured;
  const quotaCalls = { reserve: 0, headers: 0 };
  const client = createApiFootballClient({
    apiKey: "secret-value",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return response(successBody([{ team: { id: 1, name: "Real Madrid" } }]), 200, {
        "x-ratelimit-requests-remaining": "98",
      });
    },
    quotaService: {
      reserve: async () => { quotaCalls.reserve += 1; },
      recordHeaders: async () => { quotaCalls.headers += 1; return { dailyRemaining: 98 }; },
    },
  });

  const result = await client.request("teams", { search: "Real Madrid" });
  assert.match(captured.url, /search=Real\+Madrid/);
  assert.equal(captured.options.headers["x-apisports-key"], "secret-value");
  assert.equal(result.data[0].team.name, "Real Madrid");
  assert.deepEqual(quotaCalls, { reserve: 1, headers: 1 });
});

test("clasifica errores HTTP, errores en envelope y JSON inválido", async () => {
  const make = (fetchImpl) => createApiFootballClient({ apiKey: "secret", fetchImpl });
  await assert.rejects(make(async () => response("{}", 401)).request("teams"), { code: "SPORTS_API_AUTHENTICATION_FAILED" });
  await assert.rejects(make(async () => response("{}", 429)).request("teams"), { code: "SPORTS_API_QUOTA_EXCEEDED" });
  await assert.rejects(make(async () => response("not-json")).request("teams"), { code: "SPORTS_API_INVALID_RESPONSE" });
  await assert.rejects(make(async () => response(JSON.stringify({ errors: { token: "bad" }, response: [], results: 0, paging: { current: 1, total: 1 } }))).request("teams"), { code: "SPORTS_API_AUTHENTICATION_FAILED" });
  await assert.rejects(make(async () => response(JSON.stringify({ errors: { plan: "Free plans do not have access to this parameter." }, response: [], results: 0, paging: { current: 1, total: 1 } }))).request("fixtures"), { code: "SPORTS_API_PLAN_RESTRICTION" });
});

test("no filtra la API key mediante errores públicos", async () => {
  const key = "very-sensitive-key";
  const client = createApiFootballClient({ apiKey: key, fetchImpl: async () => { throw new Error(key); } });
  await assert.rejects(client.request("teams"), (error) => {
    assert.equal(error.code, "SPORTS_API_UNAVAILABLE");
    assert.doesNotMatch(error.message, new RegExp(key));
    return true;
  });
});

test("convierte abortos en timeout", async () => {
  const client = createApiFootballClient({
    apiKey: "secret",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });
  await assert.rejects(client.request("teams"), { code: "SPORTS_API_TIMEOUT" });
});

test("acepta endpoints cuyo response es un objeto", async () => {
  const body = JSON.stringify({
    errors: [],
    results: 1,
    paging: { current: 1, total: 1 },
    response: { team: { id: 541 }, form: "WWWWW" },
  });
  const client = createApiFootballClient({ apiKey: "secret", fetchImpl: async () => response(body) });
  const result = await client.request("teams/statistics");
  assert.equal(result.data.team.id, 541);
});
