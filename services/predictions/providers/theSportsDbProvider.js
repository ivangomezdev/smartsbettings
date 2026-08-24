import {
  SportsApiQuotaError,
  TheSportsDbAuthenticationError,
  TheSportsDbConfigurationError,
  TheSportsDbRateLimitError,
  TheSportsDbResponseError,
  TheSportsDbTimeoutError,
} from "../../../lib/predictions/errors.js";
import { normalizeSearchText } from "../../../lib/predictions/markets.js";

export const THESPORTSDB_V2_BASE_URL = "https://www.thesportsdb.com/api/v2/json";
export const THESPORTSDB_PROVIDER = "thesportsdb";
const DEFAULT_TIMEOUT_MS = 12_000;
const COMPLETED_STATUSES = new Set(["FT", "AET", "PEN"]);

function safeId(value, field) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) throw new TheSportsDbResponseError({ reason: "invalid_identifier", field });
  return text;
}

function searchSegment(value) {
  const text = String(value ?? "").trim();
  if (text.length < 2 || text.length > 140) throw new TheSportsDbResponseError({ reason: "invalid_search" });
  return encodeURIComponent(text.replace(/\s+/g, "_"));
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return !text || text.toUpperCase() === "NULL" ? null : text;
}

function integerOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function isoTimestamp(event) {
  const raw = cleanText(event?.strTimestamp);
  if (raw) {
    const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
    const parsed = new Date(withZone);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const date = cleanText(event?.dateEvent);
  if (!date) return null;
  const time = cleanText(event?.strTime) || "00:00:00";
  const parsed = new Date(`${date}T${time.replace(/Z$/i, "")}Z`);
  return Number.isNaN(parsed.getTime()) ? `${date}T${time}` : parsed.toISOString();
}

function providerIds({ teamId = null, eventId = null, leagueId = null, apiFootballTeamId = null, apiFootballEventId = null } = {}) {
  const ids = {
    theSportsDb: {
      ...(teamId != null ? { teamId: String(teamId) } : {}),
      ...(eventId != null ? { eventId: String(eventId) } : {}),
      ...(leagueId != null ? { leagueId: String(leagueId) } : {}),
    },
  };
  if (apiFootballTeamId != null || apiFootballEventId != null) {
    ids.apiFootball = {
      ...(apiFootballTeamId != null ? { teamId: String(apiFootballTeamId) } : {}),
      ...(apiFootballEventId != null ? { eventId: String(apiFootballEventId) } : {}),
    };
  }
  return ids;
}

function provenance(resource) {
  return { sourceType: "sports_api", provider: THESPORTSDB_PROVIDER, resource };
}

export function normalizeTheSportsDbTeam(item) {
  const id = item?.idTeam != null ? String(item.idTeam) : null;
  return {
    team: {
      id,
      name: cleanText(item?.strTeam),
      code: cleanText(item?.strTeamShort),
      country: cleanText(item?.strCountry),
      logo: cleanText(item?.strBadge),
      provider: THESPORTSDB_PROVIDER,
      providerIds: providerIds({ teamId: id, leagueId: item?.idLeague, apiFootballTeamId: item?.idAPIfootball }),
      provenance: provenance("team"),
    },
    venue: item?.idVenue || item?.strStadium ? {
      id: item.idVenue != null ? String(item.idVenue) : null,
      name: cleanText(item.strStadium),
      city: cleanText(item.strLocation),
      capacity: integerOrNull(item.intStadiumCapacity),
    } : null,
  };
}

function eventStatus(item) {
  const short = cleanText(item?.strStatus) || "UNKNOWN";
  return {
    short,
    long: short,
    elapsed: integerOrNull(item?.intTime),
  };
}

export function normalizeTheSportsDbEvent(item) {
  const date = isoTimestamp(item);
  const eventId = item?.idEvent != null ? String(item.idEvent) : null;
  const homeId = item?.idHomeTeam != null ? String(item.idHomeTeam) : null;
  const awayId = item?.idAwayTeam != null ? String(item.idAwayTeam) : null;
  const leagueId = item?.idLeague != null ? String(item.idLeague) : null;
  const homeScore = integerOrNull(item?.intHomeScore);
  const awayScore = integerOrNull(item?.intAwayScore);
  return {
    fixture: {
      id: eventId,
      date,
      timestamp: date ? Math.floor(Date.parse(date) / 1000) : null,
      timezone: "UTC",
      status: eventStatus(item),
      venue: item?.idVenue || item?.strVenue ? {
        id: item.idVenue != null ? String(item.idVenue) : null,
        name: cleanText(item.strVenue),
        city: cleanText(item.strCity),
      } : null,
      provider: THESPORTSDB_PROVIDER,
      providerIds: providerIds({ eventId, leagueId, apiFootballEventId: item?.idAPIfootball }),
      provenance: provenance("event"),
    },
    league: {
      id: leagueId,
      name: cleanText(item?.strLeague),
      country: cleanText(item?.strCountry),
      season: cleanText(item?.strSeason),
      round: cleanText(item?.intRound),
      logo: cleanText(item?.strLeagueBadge),
      providerIds: providerIds({ leagueId }),
    },
    teams: {
      home: {
        id: homeId,
        name: cleanText(item?.strHomeTeam),
        logo: cleanText(item?.strHomeTeamBadge),
        provider: THESPORTSDB_PROVIDER,
        providerIds: providerIds({ teamId: homeId }),
      },
      away: {
        id: awayId,
        name: cleanText(item?.strAwayTeam),
        logo: cleanText(item?.strAwayTeamBadge),
        provider: THESPORTSDB_PROVIDER,
        providerIds: providerIds({ teamId: awayId }),
      },
    },
    goals: { home: homeScore, away: awayScore },
    score: { fulltime: { home: homeScore, away: awayScore } },
    provider: THESPORTSDB_PROVIDER,
    providerIds: providerIds({ eventId, leagueId, apiFootballEventId: item?.idAPIfootball }),
    provenance: provenance("event"),
  };
}

function normalizeStatistics(rows, params) {
  if (!rows.length) return [];
  const eventId = String(rows[0]?.idEvent ?? params.fixture ?? "") || null;
  const eventName = cleanText(rows[0]?.strEvent) || "";
  const [homeName = null, awayName = null] = eventName.split(/\s+vs\s+/i);
  const blocks = [
    { team: { id: params.homeTeamId ?? null, name: params.homeTeamName || homeName }, field: "intHome" },
    { team: { id: params.awayTeamId ?? null, name: params.awayTeamName || awayName }, field: "intAway" },
  ];
  return blocks.map(({ team, field }) => ({
    team: { ...team, provider: THESPORTSDB_PROVIDER },
    statistics: rows.map((row) => ({ type: cleanText(row.strStat), value: cleanText(row[field]) })),
    fixtureId: eventId,
    provenance: provenance("event_stats"),
  }));
}

function normalizeLineups(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const teamId = String(row.idTeam ?? "");
    if (!grouped.has(teamId)) {
      grouped.set(teamId, {
        team: { id: teamId || null, name: cleanText(row.strTeam), provider: THESPORTSDB_PROVIDER },
        formation: cleanText(row.strFormation),
        startXI: [],
        substitutes: [],
        lineupStatus: "UNKNOWN",
        sourceTimestamp: null,
        provenance: provenance("event_lineup"),
      });
    }
    const player = {
      player: {
        id: row.idPlayer != null ? String(row.idPlayer) : null,
        name: cleanText(row.strPlayer),
        number: integerOrNull(row.intSquadNumber),
        pos: cleanText(row.strPositionShort) || cleanText(row.strPosition),
        grid: null,
      },
    };
    if (String(row.strSubstitute).toLowerCase() === "yes") grouped.get(teamId).substitutes.push(player);
    else grouped.get(teamId).startXI.push(player);
  }
  return [...grouped.values()];
}

function normalizeTimeline(rows) {
  return rows.map((row) => ({
    id: row.idTimeline != null ? String(row.idTimeline) : null,
    fixtureId: row.idEvent != null ? String(row.idEvent) : null,
    type: cleanText(row.strTimeline)?.toUpperCase() || "UNKNOWN",
    detail: cleanText(row.strTimelineDetail),
    minute: integerOrNull(row.intTime),
    period: cleanText(row.strPeriod),
    side: String(row.strHome).toLowerCase() === "yes" ? "home" : String(row.strHome).toLowerCase() === "no" ? "away" : null,
    team: { id: row.idTeam != null ? String(row.idTeam) : null, name: cleanText(row.strTeam) },
    player: row.idPlayer || row.strPlayer ? { id: row.idPlayer != null ? String(row.idPlayer) : null, name: cleanText(row.strPlayer) } : null,
    assist: row.idAssist || row.strAssist ? { id: row.idAssist != null ? String(row.idAssist) : null, name: cleanText(row.strAssist) } : null,
    comment: cleanText(row.strComment),
    provenance: provenance("event_timeline"),
  }));
}

function normalizePlayers(rows) {
  return rows.map((row) => ({
    id: row.idPlayer != null ? String(row.idPlayer) : null,
    name: cleanText(row.strPlayer),
    position: cleanText(row.strPosition),
    dateOfBirth: cleanText(row.dateBorn),
    photo: cleanText(row.strCutout) || cleanText(row.strThumb),
    team: { id: row.idTeam != null ? String(row.idTeam) : null, name: cleanText(row.strTeam) },
    provenance: provenance("team_players"),
  }));
}

function arrayEnvelope(body, expectedKey) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TheSportsDbResponseError({ reason: "invalid_envelope" });
  }
  if (Array.isArray(body[expectedKey])) return body[expectedKey];
  if (typeof body.Message === "string" && /no data found/i.test(body.Message)) return [];
  throw new TheSportsDbResponseError({ reason: "invalid_envelope", expectedKey });
}

function response(data, calls, now) {
  return {
    data,
    results: Array.isArray(data) ? data.length : data && typeof data === "object" ? 1 : 0,
    paging: { current: 1, total: 1 },
    meta: { fetchedAt: now().toISOString(), provider: THESPORTSDB_PROVIDER, providerCalls: calls },
  };
}

export function createTheSportsDbProvider({
  apiKey = process.env.THESPORTSDB_API_KEY,
  baseUrl = THESPORTSDB_V2_BASE_URL,
  fetchImpl = globalThis.fetch,
  quotaService = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date(),
} = {}) {
  async function request(resource, params = {}) {
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) throw new TheSportsDbConfigurationError();
    if (typeof fetchImpl !== "function") throw new TheSportsDbResponseError({ reason: "fetch_unavailable" });
    let calls = 0;

    async function fetchRows(path, key) {
      try {
        await quotaService?.reserve();
      } catch (error) {
        if (error instanceof SportsApiQuotaError) throw new TheSportsDbRateLimitError(error.details);
        throw error;
      }
      calls += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let httpResponse;
      try {
        httpResponse = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
          method: "GET",
          headers: { "X-API-KEY": apiKey.trim(), Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (error) {
        if (error?.name === "AbortError") throw new TheSportsDbTimeoutError();
        throw new TheSportsDbResponseError({ reason: "network_error" });
      } finally {
        clearTimeout(timeout);
      }
      if ([401, 403].includes(httpResponse.status)) throw new TheSportsDbAuthenticationError();
      if (httpResponse.status === 429) throw new TheSportsDbRateLimitError();
      if (httpResponse.status === 499) throw new TheSportsDbTimeoutError();
      if (httpResponse.status >= 500) throw new TheSportsDbResponseError({ reason: "provider_unavailable", status: httpResponse.status });
      let body;
      try {
        body = JSON.parse(await httpResponse.text());
      } catch {
        throw new TheSportsDbResponseError({ reason: "invalid_json", status: httpResponse.status });
      }
      if (!httpResponse.ok) throw new TheSportsDbResponseError({ reason: "http_error", status: httpResponse.status });
      return arrayEnvelope(body, key);
    }

    let data;
    if (resource === "teams" && params.search) {
      const rows = (await fetchRows(`/search/team/${searchSegment(params.search)}`, "search"))
        .filter((item) => String(item.strSport).toLowerCase() === "soccer");
      const target = normalizeSearchText(params.search).trim();
      const enriched = await Promise.all(rows.map(async (item) => {
        if (normalizeSearchText(item.strTeam).trim() !== target || !item.idTeam) return item;
        const details = await fetchRows(`/lookup/team/${safeId(item.idTeam, "team")}`, "lookup");
        return { ...item, ...(details[0] || {}) };
      }));
      data = enriched.map(normalizeTheSportsDbTeam);
    } else if (resource === "teams" && params.id) {
      data = (await fetchRows(`/lookup/team/${safeId(params.id, "team")}`, "lookup")).map(normalizeTheSportsDbTeam);
    } else if (resource === "fixtures" && params.id) {
      data = (await fetchRows(`/lookup/event/${safeId(params.id, "event")}`, "lookup")).map(normalizeTheSportsDbEvent);
    } else if (resource === "fixtures" && params.ids) {
      const ids = String(params.ids).split("-").filter(Boolean).slice(0, 10);
      const rows = (await Promise.all(ids.map((id) => fetchRows(`/lookup/event/${safeId(id, "event")}`, "lookup")))).flat();
      data = rows.map(normalizeTheSportsDbEvent);
    } else if (resource === "fixtures" && params.team) {
      const endpoint = params.last ? "previous" : params.next ? "next" : "full";
      const rows = await fetchRows(`/schedule/${endpoint}/team/${safeId(params.team, "team")}`, "schedule");
      data = rows.map(normalizeTheSportsDbEvent)
        .filter((item) => !params.from || String(item.fixture.date).slice(0, 10) >= params.from)
        .filter((item) => !params.to || String(item.fixture.date).slice(0, 10) <= params.to)
        .filter((item) => !params.status || COMPLETED_STATUSES.has(item.fixture.status.short))
        .slice(0, params.last ? Number(params.last) : undefined);
    } else if (resource === "fixtures" && params.league && params.season) {
      data = (await fetchRows(`/schedule/league/${safeId(params.league, "league")}/${searchSegment(params.season)}`, "schedule"))
        .map(normalizeTheSportsDbEvent);
    } else if (resource === "fixtures" && params.search) {
      data = (await fetchRows(`/search/event/${searchSegment(params.search)}`, "search")).map(normalizeTheSportsDbEvent);
    } else if (resource === "fixtures/statistics" && params.fixture) {
      data = normalizeStatistics(await fetchRows(`/lookup/event_stats/${safeId(params.fixture, "event")}`, "lookup"), params);
    } else if (resource === "fixtures/lineups" && params.fixture) {
      data = normalizeLineups(await fetchRows(`/lookup/event_lineup/${safeId(params.fixture, "event")}`, "lookup"));
    } else if (resource === "fixtures/timeline" && params.fixture) {
      data = normalizeTimeline(await fetchRows(`/lookup/event_timeline/${safeId(params.fixture, "event")}`, "lookup"));
    } else if (resource === "players" && params.team) {
      data = normalizePlayers(await fetchRows(`/list/players/${safeId(params.team, "team")}`, "list"));
    } else if (resource === "fixtures/headtohead" && params.h2h) {
      const [homeId, awayId] = String(params.h2h).split("-");
      const rows = await fetchRows(`/schedule/full/team/${safeId(homeId, "team")}`, "schedule");
      data = rows.map(normalizeTheSportsDbEvent).filter((item) => {
        const ids = [String(item.teams.home.id), String(item.teams.away.id)];
        return ids.includes(String(homeId)) && ids.includes(String(awayId)) && COMPLETED_STATUSES.has(item.fixture.status.short);
      }).slice(0, Number(params.last) || 5);
    } else if (resource === "livescore") {
      const suffix = params.league ? `/league/${safeId(params.league, "league")}` : "/soccer";
      data = (await fetchRows(`/livescore${suffix}`, "livescore")).map(normalizeTheSportsDbEvent);
    } else if (["leagues", "teams/statistics", "injuries", "odds"].includes(resource)) {
      data = [];
    } else {
      throw new TheSportsDbResponseError({ reason: "unsupported_resource", resource });
    }
    return response(data, calls, now);
  }

  return {
    name: THESPORTSDB_PROVIDER,
    capabilities: Object.freeze({
      teams: true,
      fixtures: true,
      recentEvents: true,
      eventStatistics: true,
      eventLineups: true,
      eventTimeline: true,
      teamPlayers: true,
      h2hReconstruction: true,
      injuries: false,
      odds: false,
      seasonStatistics: false,
    }),
    request,
  };
}
