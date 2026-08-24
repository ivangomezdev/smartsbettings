import test from "node:test";
import assert from "node:assert/strict";
import { createBraveSearchProvider } from "../../services/predictions/web/braveSearchProvider.js";

const NOW = new Date("2026-08-23T12:00:00.000Z");

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("Brave normaliza respuesta de noticias y aplica frescura", async () => {
  let request;
  const provider = createBraveSearchProvider({
    apiKey: "test-secret",
    now: () => NOW,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ results: [{
        title: "<b>Team update</b>",
        url: "https://realmadrid.com/news/update?utm_source=brave",
        description: "Player A ruled out",
        page_age: "2026-08-23T10:00:00Z",
        profile: { long_name: "Real Madrid" },
      }] });
    },
  });
  const results = await provider.search({ query: "Real Madrid injuries", type: "injury", maxResults: 5 });
  const url = new URL(request.url);
  assert.equal(url.pathname, "/res/v1/news/search");
  assert.equal(url.searchParams.get("freshness"), "pm");
  assert.equal(request.options.headers["X-Subscription-Token"], "test-secret");
  assert.deepEqual(results, [{
    title: "Team update",
    url: "https://realmadrid.com/news/update",
    snippet: "Player A ruled out",
    publishedAt: "2026-08-23T10:00:00.000Z",
    sourceName: "Real Madrid",
  }]);
});

test("Brave usa búsqueda web normal para resultados históricos", async () => {
  let endpoint;
  const provider = createBraveSearchProvider({
    apiKey: "test-secret",
    fetchImpl: async (url) => {
      endpoint = new URL(url);
      return jsonResponse({ web: { results: [] } });
    },
  });
  const results = await provider.search({ query: "Arsenal recent results", type: "fixture_result" });
  assert.equal(endpoint.pathname, "/res/v1/web/search");
  assert.equal(endpoint.searchParams.has("freshness"), false);
  assert.deepEqual(results, []);
});

test("Brave acepta cero resultados y rechaza payload inválido", async () => {
  const empty = createBraveSearchProvider({ apiKey: "key", fetchImpl: async () => jsonResponse({ results: [] }) });
  assert.deepEqual(await empty.search({ query: "news", type: "team_news" }), []);
  const invalid = createBraveSearchProvider({ apiKey: "key", fetchImpl: async () => jsonResponse({ unexpected: [] }) });
  await assert.rejects(
    invalid.search({ query: "news", type: "team_news" }),
    (error) => error.code === "BRAVE_SEARCH_INVALID_RESPONSE",
  );
});

test("Brave tipa 401 y no filtra la key aunque el body la contenga", async () => {
  const secret = "super-private-brave-key";
  const provider = createBraveSearchProvider({
    apiKey: secret,
    fetchImpl: async () => new Response(`denied ${secret}`, { status: 401 }),
  });
  await assert.rejects(provider.search({ query: "test", type: "team_news" }), (error) => {
    assert.equal(error.code, "BRAVE_SEARCH_UNAUTHORIZED");
    assert.equal(error.status, 401);
    assert.doesNotMatch(`${error.message}\n${error.stack}\n${JSON.stringify(error)}`, new RegExp(secret));
    return true;
  });
});

test("Brave tipa 429 con retry-after", async () => {
  const provider = createBraveSearchProvider({
    apiKey: "key",
    fetchImpl: async () => new Response("limited", { status: 429, headers: { "retry-after": "30" } }),
  });
  await assert.rejects(provider.search({ query: "test", type: "team_news" }), (error) => {
    assert.equal(error.code, "BRAVE_SEARCH_RATE_LIMITED");
    assert.equal(error.retryAfter, "30");
    return true;
  });
});

test("Brave tipa errores 5xx sin incorporar el body", async () => {
  const provider = createBraveSearchProvider({
    apiKey: "key",
    fetchImpl: async () => new Response("upstream details", { status: 503 }),
  });
  await assert.rejects(provider.search({ query: "test", type: "fixture_result" }), (error) => {
    assert.equal(error.code, "BRAVE_SEARCH_SERVER_ERROR");
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /upstream details/);
    return true;
  });
});

test("Brave tipa timeout y JSON inválido", async () => {
  const timeout = createBraveSearchProvider({
    apiKey: "key",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });
  await assert.rejects(timeout.search({ query: "test", type: "team_news" }), (error) => error.code === "BRAVE_SEARCH_TIMEOUT");

  const invalidJson = createBraveSearchProvider({
    apiKey: "key",
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  });
  await assert.rejects(invalidJson.search({ query: "test", type: "team_news" }), (error) => error.code === "BRAVE_SEARCH_INVALID_RESPONSE");
});
