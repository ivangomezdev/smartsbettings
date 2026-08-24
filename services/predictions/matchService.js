import { PredictionValidationError, PredictionFoundationError } from "../../lib/predictions/errors.js";
import { normalizeSearchText } from "../../lib/predictions/markets.js";
import {
  leagueCoverage,
  normalizeDetailedFixtureStatistics,
  normalizeFixture,
  normalizeInjuries,
  normalizeLineups,
  normalizeOdds,
  normalizeRecentForm,
  normalizeSeasonStatistics,
} from "../../lib/predictions/normalizers.js";
import { mergeProviderUsage } from "./providers/sportsProviderRouter.js";

const FINISHED_OR_INVALID = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);
const MAX_RECENT_DETAILS_PER_TEAM = 5;
const MAX_THESPORTSDB_DETAILS_PER_TEAM = 3;
const MIN_EXPLANATION_RECENT_MATCHES = 6;
const TEAM_SEARCH_ALIASES = Object.freeze({
  "dep la coruna": "Deportivo de A Coruña",
  "dep de la coruna": "Deportivo de A Coruña",
  "deportivo la coruna": "Deportivo de A Coruña",
  "deportivo de la coruna": "Deportivo de A Coruña",
  "deportivo a coruna": "Deportivo de A Coruña",
  "deportivo coruna": "Deportivo de A Coruña",
});

function teamOption(item, responseProvider = null) {
  return {
    id: item?.team?.id ?? null,
    name: item?.team?.name ?? null,
    country: item?.team?.country ?? null,
    logo: item?.team?.logo ?? null,
    provider: item?.team?.provider ?? responseProvider,
    providerIds: item?.team?.providerIds ?? null,
    provenance: item?.team?.provenance ?? null,
  };
}

function exactTeamMatches(items, requestedName) {
  const target = normalizeSearchText(requestedName).trim();
  return (items || []).filter((item) => normalizeSearchText(item?.team?.name).trim() === target);
}

function fixtureOption(item) {
  const fixture = normalizeFixture(item);
  return {
    id: fixture.fixtureId,
    label: `${fixture.homeTeam?.name || "Local"} vs ${fixture.awayTeam?.name || "Visitante"}`,
    date: fixture.date,
    league: fixture.league?.name ?? null,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    provider: item?.provider ?? item?.fixture?.provider ?? null,
  };
}

function fixtureInsideRange(item, dateRange) {
  const date = String(item?.fixture?.date || "").slice(0, 10);
  return date && date >= dateRange.from && date <= dateRange.to;
}

function fixtureMatchesCompetition(item, parsed) {
  const requested = parsed?.competition || parsed?.league || parsed?.resolutions?.competitionId || null;
  if (requested == null || requested === "") return true;
  if (String(item?.league?.id) === String(requested)) return true;
  return normalizeSearchText(item?.league?.name).trim() === normalizeSearchText(requested).trim();
}

function seasonCandidates(dateRange) {
  const candidates = new Set();
  for (const date of [dateRange.from, dateRange.to]) {
    const [year, month] = String(date).split("-").map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month)) continue;
    if (month <= 7) candidates.add(year - 1);
    candidates.add(year);
  }
  return [...candidates];
}

function timeUntilFixture(fixture) {
  const timestamp = Date.parse(fixture?.fixture?.date || "");
  return Number.isFinite(timestamp) ? timestamp - Date.now() : null;
}

function providerMeta(result) {
  return {
    source: result?.meta?.source ?? null,
    stale: result?.meta?.stale ?? false,
    fetchedAt: result?.meta?.cacheFetchedAt ?? result?.meta?.fetchedAt ?? null,
    warning: result?.meta?.warning ?? null,
    provider: result?.meta?.provider ?? null,
    providerCalls: Number(result?.meta?.providerCalls || 0),
    cacheHits: Number(result?.meta?.cacheHits || 0),
    providerUsage: result?.meta?.providerUsage ?? null,
  };
}

function responseIsEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createMatchService({ sportsApi } = {}) {
  if (!sportsApi) throw new Error("createMatchService requiere sportsApi.");

  async function resolveTeam(requestedName, side, forcedId = null) {
    const normalizedRequested = normalizeSearchText(requestedName).trim();
    const searchName = TEAM_SEARCH_ALIASES[normalizedRequested] || requestedName;
    const response = await sportsApi.searchTeams(searchName);
    const responseProvider = response.meta?.provider || null;
    if (forcedId != null) {
      const selected = (response.data || []).find((item) => String(item?.team?.id) === String(forcedId));
      if (selected) return { kind: "resolved", team: teamOption(selected, responseProvider), source: providerMeta(response) };
    }
    const exact = exactTeamMatches(response.data, searchName);
    if (exact.length === 1) return { kind: "resolved", team: teamOption(exact[0], responseProvider), source: providerMeta(response) };

    const candidates = (exact.length ? exact : response.data || []).slice(0, 8).map((item) => teamOption(item, responseProvider));
    return {
      kind: candidates.length ? "clarification" : "not_found",
      reason: candidates.length ? `${side}_team_ambiguous` : `${side}_team_not_found`,
      requestedName,
      options: candidates,
    };
  }

  async function resolveFixture(parsed) {
    if (!parsed?.homeTeam || !parsed?.awayTeam || !parsed?.dateRange || !parsed?.market) {
      throw new PredictionValidationError("La consulta debe incluir dos equipos, mercado y rango de fecha.");
    }

    const [home, away] = await Promise.all([
      resolveTeam(parsed.homeTeam, "home", parsed.resolutions?.homeTeamId),
      resolveTeam(parsed.awayTeam, "away", parsed.resolutions?.awayTeamId),
    ]);
    if (home.kind !== "resolved") return home;
    if (away.kind !== "resolved") return away;

    if (home.team.provider && away.team.provider && home.team.provider !== away.team.provider) {
      return {
        kind: "clarification",
        reason: "team_provider_mismatch",
        requestedName: `${parsed.homeTeam} vs ${parsed.awayTeam}`,
        options: [],
      };
    }

    const selectedProvider = home.team.provider || away.team.provider || null;

    const fixtureResponses = [];
    let firstProviderError = null;
    const seasons = selectedProvider === "thesportsdb" ? [null] : seasonCandidates(parsed.dateRange);
    for (const season of seasons) {
      try {
        fixtureResponses.push(await sportsApi.getResource("fixtures", {
          team: home.team.id,
          ...(season != null ? { season } : {}),
          from: parsed.dateRange.from,
          to: parsed.dateRange.to,
          timezone: parsed.dateRange.timeZone,
        }, selectedProvider ? { provider: selectedProvider } : {}));
      } catch (error) {
        firstProviderError ||= error;
      }
    }
    if (!fixtureResponses.length && firstProviderError) throw firstProviderError;
    const fixtureItems = fixtureResponses.flatMap((response) => Array.isArray(response.data) ? response.data : []);
    const pairings = fixtureItems.filter((item) => {
      const homeId = item?.teams?.home?.id;
      const awayId = item?.teams?.away?.id;
      const involvesBoth = [homeId, awayId].includes(home.team.id) && [homeId, awayId].includes(away.team.id);
      return involvesBoth
        && fixtureInsideRange(item, parsed.dateRange)
        && fixtureMatchesCompetition(item, parsed)
        && !FINISHED_OR_INVALID.has(item?.fixture?.status?.short);
    });
    let ordered = pairings.filter((item) => item?.teams?.home?.id === home.team.id && item?.teams?.away?.id === away.team.id);
    if (parsed.resolutions?.fixtureId != null) ordered = ordered.filter((item) => String(item?.fixture?.id) === String(parsed.resolutions.fixtureId));

    if (ordered.length !== 1) {
      const alternatives = ordered.length ? ordered : pairings;
      return {
        kind: alternatives.length ? "clarification" : "not_found",
        reason: alternatives.length
          ? ordered.length
            ? "fixture_ambiguous"
            : "fixture_order_reversed"
          : "fixture_not_found",
        options: alternatives.map(fixtureOption),
        teams: { home: home.team, away: away.team },
        code: alternatives.length ? null : selectedProvider === "thesportsdb" ? "THESPORTSDB_EVENT_NOT_FOUND" : "EVENT_NOT_FOUND",
      };
    }

    let resolvedFixture = ordered[0];
    let eventDetailsResponse = null;
    if (selectedProvider === "thesportsdb") {
      try {
        eventDetailsResponse = await sportsApi.getResource("fixtures", { id: resolvedFixture.fixture.id }, { provider: selectedProvider });
        if (asArray(eventDetailsResponse.data)[0]) resolvedFixture = asArray(eventDetailsResponse.data)[0];
      } catch (error) {
        if (!(error instanceof PredictionFoundationError)) throw error;
      }
      resolvedFixture = {
        ...resolvedFixture,
        teams: {
          home: { ...resolvedFixture.teams.home, providerIds: home.team.providerIds || resolvedFixture.teams.home.providerIds },
          away: { ...resolvedFixture.teams.away, providerIds: away.team.providerIds || resolvedFixture.teams.away.providerIds },
        },
      };
    }

    return {
      kind: "resolved",
      fixture: resolvedFixture,
      teams: { home: home.team, away: away.team },
      market: parsed.market,
      dateRange: parsed.dateRange,
      provider: selectedProvider,
      providerUsage: mergeProviderUsage(
        home.source?.providerUsage,
        away.source?.providerUsage,
        ...fixtureResponses.map((response) => response.meta?.providerUsage),
        eventDetailsResponse?.meta?.providerUsage,
      ),
      sources: {
        homeTeam: home.source,
        awayTeam: away.source,
        fixture: fixtureResponses.map(providerMeta),
        ...(eventDetailsResponse ? { eventDetails: providerMeta(eventDetailsResponse) } : {}),
      },
    };
  }

  async function collectFixtureData(resolution) {
    if (resolution?.kind !== "resolved") throw new PredictionValidationError("El fixture debe estar resuelto antes de recopilar datos.");
    const fixture = resolution.fixture;
    const fixtureId = fixture.fixture.id;
    const leagueId = fixture.league.id;
    const season = fixture.league.season;
    const homeId = fixture.teams.home.id;
    const awayId = fixture.teams.away.id;
    const eventDate = String(fixture.fixture.date || "").slice(0, 10);
    const missingData = [];
    const sources = { ...resolution.sources };
    const selectedProvider = resolution.provider || fixture.provider || fixture.fixture?.provider || resolution.teams.home?.provider || null;
    const capabilities = sportsApi.getCapabilities?.(selectedProvider) || sportsApi.capabilities || {};
    let usage = mergeProviderUsage(resolution.providerUsage);

    function addUsage(result) {
      usage = mergeProviderUsage(usage, result?.meta?.providerUsage);
    }

    async function optional(section, request, unavailableReason = "not_available") {
      try {
        const result = await request();
        addUsage(result);
        sources[section] = providerMeta(result);
        if (responseIsEmpty(result.data)) missingData.push({ section, reason: result.meta?.providerError || unavailableReason });
        return result.data ?? null;
      } catch (error) {
        if (!(error instanceof PredictionFoundationError)) throw error;
        missingData.push({ section, reason: error.code, retryable: error.retryable });
        return null;
      }
    }

    async function optionalFallback(section, request) {
      try {
        const result = await request();
        addUsage(result);
        sources[section] = providerMeta(result);
        return result.data ?? null;
      } catch (error) {
        if (!(error instanceof PredictionFoundationError)) throw error;
        sources[section] = { provider: "api-football", error: error.code, retryable: error.retryable };
        return null;
      }
    }

    const coverageItems = selectedProvider === "thesportsdb" ? [] : await optional(
      "coverage",
      () => sportsApi.getResource("leagues", { id: leagueId, season }, selectedProvider ? { provider: selectedProvider } : {}),
      "coverage_not_available",
    );
    let coverage = selectedProvider === "thesportsdb" ? null : leagueCoverage(asArray(coverageItems), leagueId, season);
    if (!coverage && selectedProvider !== "thesportsdb" && !missingData.some((item) => item.section === "coverage")) {
      missingData.push({ section: "coverage", reason: "coverage_not_available" });
    }

    const configuredApiFootballFallback = selectedProvider === "thesportsdb" && sportsApi.fallbackProviderName === "api-football";
    const mappedApiFootballEventId = fixture.providerIds?.apiFootball?.eventId
      || fixture.fixture?.providerIds?.apiFootball?.eventId
      || resolution.providerIds?.apiFootball?.eventId
      || null;
    const fallbackFixtureRaw = configuredApiFootballFallback && mappedApiFootballEventId
      ? await optionalFallback(
          "apiFootballFixtureMapping",
          () => sportsApi.getResource("fixtures", { id: mappedApiFootballEventId }, { provider: "api-football" }),
        )
      : null;
    const fallbackFixture = asArray(fallbackFixtureRaw)[0] || null;
    const fallbackIds = {
      fixture: fallbackFixture?.fixture?.id || mappedApiFootballEventId || null,
      league: fallbackFixture?.league?.id || null,
      season: fallbackFixture?.league?.season || null,
      home: fallbackFixture?.teams?.home?.id || resolution.teams.home?.providerIds?.apiFootball?.teamId || null,
      away: fallbackFixture?.teams?.away?.id || resolution.teams.away?.providerIds?.apiFootball?.teamId || null,
    };

    let [homeRecentRaw, awayRecentRaw] = await Promise.all([
      optional("homeRecentForm", () => sportsApi.getResource("fixtures", { team: homeId, last: 10, status: "FT-AET-PEN" }, { recentForm: true, ...(selectedProvider ? { provider: selectedProvider } : {}) })),
      optional("awayRecentForm", () => sportsApi.getResource("fixtures", { team: awayId, last: 10, status: "FT-AET-PEN" }, { recentForm: true, ...(selectedProvider ? { provider: selectedProvider } : {}) })),
    ]);
    const fallbackRecentIds = new Set();
    let homeRecentTeamId = homeId;
    let awayRecentTeamId = awayId;
    if (configuredApiFootballFallback && normalizeRecentForm(asArray(homeRecentRaw), homeId).sampleSize < MIN_EXPLANATION_RECENT_MATCHES && fallbackIds.home) {
      const candidate = await optionalFallback(
        "homeRecentFormFallback",
        () => sportsApi.getResource("fixtures", { team: fallbackIds.home, last: 10, status: "FT-AET-PEN" }, { recentForm: true, provider: "api-football" }),
      );
      if (normalizeRecentForm(asArray(candidate), fallbackIds.home).sampleSize > normalizeRecentForm(asArray(homeRecentRaw), homeId).sampleSize) {
        homeRecentRaw = candidate;
        homeRecentTeamId = fallbackIds.home;
        for (const item of asArray(candidate)) if (item?.fixture?.id != null) fallbackRecentIds.add(String(item.fixture.id));
      }
    }
    if (configuredApiFootballFallback && normalizeRecentForm(asArray(awayRecentRaw), awayId).sampleSize < MIN_EXPLANATION_RECENT_MATCHES && fallbackIds.away) {
      const candidate = await optionalFallback(
        "awayRecentFormFallback",
        () => sportsApi.getResource("fixtures", { team: fallbackIds.away, last: 10, status: "FT-AET-PEN" }, { recentForm: true, provider: "api-football" }),
      );
      if (normalizeRecentForm(asArray(candidate), fallbackIds.away).sampleSize > normalizeRecentForm(asArray(awayRecentRaw), awayId).sampleSize) {
        awayRecentRaw = candidate;
        awayRecentTeamId = fallbackIds.away;
        for (const item of asArray(candidate)) if (item?.fixture?.id != null) fallbackRecentIds.add(String(item.fixture.id));
      }
    }
    const canFallbackSeason = configuredApiFootballFallback && fallbackIds.league && fallbackIds.season && fallbackIds.home && fallbackIds.away;
    const [homeSeasonRaw, awaySeasonRaw] = capabilities.seasonStatistics === false && !canFallbackSeason
      ? (missingData.push(
          { section: "homeSeasonStatistics", reason: "provider_and_fallback_not_supported" },
          { section: "awaySeasonStatistics", reason: "provider_and_fallback_not_supported" },
        ), [null, null])
      : await Promise.all([
          optional("homeSeasonStatistics", () => sportsApi.getResource("teams/statistics", {
            league: canFallbackSeason ? fallbackIds.league : leagueId,
            season: canFallbackSeason ? fallbackIds.season : season,
            team: canFallbackSeason ? fallbackIds.home : homeId,
            date: eventDate,
          }, canFallbackSeason ? { provider: "api-football" } : selectedProvider ? { provider: selectedProvider } : {})),
          optional("awaySeasonStatistics", () => sportsApi.getResource("teams/statistics", {
            league: canFallbackSeason ? fallbackIds.league : leagueId,
            season: canFallbackSeason ? fallbackIds.season : season,
            team: canFallbackSeason ? fallbackIds.away : awayId,
            date: eventDate,
          }, canFallbackSeason ? { provider: "api-football" } : selectedProvider ? { provider: selectedProvider } : {})),
        ]);
    let h2hRaw = await optional(
      "h2h",
      () => sportsApi.getResource("fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last: 5 }, selectedProvider ? { provider: selectedProvider } : {}),
    );
    const apiFootballHomeId = fallbackIds.home;
    const apiFootballAwayId = fallbackIds.away;
    if (
      selectedProvider === "thesportsdb"
      && responseIsEmpty(h2hRaw)
      && sportsApi.fallbackProviderName === "api-football"
      && apiFootballHomeId
      && apiFootballAwayId
    ) {
      const fallbackH2h = await optionalFallback(
        "h2hFallback",
        () => sportsApi.getResource("fixtures/headtohead", { h2h: `${apiFootballHomeId}-${apiFootballAwayId}`, last: 5 }, { provider: "api-football" }),
      );
      if (!responseIsEmpty(fallbackH2h)) {
        h2hRaw = fallbackH2h;
        const missingIndex = missingData.findIndex((item) => item.section === "h2h" && item.reason === "not_available");
        if (missingIndex >= 0) missingData.splice(missingIndex, 1);
      }
    }

    const detailsLimit = selectedProvider === "thesportsdb" ? MAX_THESPORTSDB_DETAILS_PER_TEAM : MAX_RECENT_DETAILS_PER_TEAM;
    const recentFixtures = [
      ...asArray(homeRecentRaw).slice(0, detailsLimit),
      ...asArray(awayRecentRaw).slice(0, detailsLimit),
    ];
    const recentIds = [...new Set([
      ...recentFixtures,
    ].map((item) => item?.fixture?.id).filter(Boolean))];
    const detailedRaw = recentIds.length
      ? selectedProvider === "thesportsdb"
        ? await optional("matchStatistics", async () => {
            const results = await Promise.all(recentFixtures.filter((item, index, all) => !fallbackRecentIds.has(String(item.fixture?.id)) && all.findIndex((candidate) => candidate.fixture?.id === item.fixture?.id) === index).map(async (item) => {
              const result = await sportsApi.getResource("fixtures/statistics", {
                fixture: item.fixture.id,
                homeTeamId: item.teams.home.id,
                homeTeamName: item.teams.home.name,
                awayTeamId: item.teams.away.id,
                awayTeamName: item.teams.away.name,
              }, { provider: selectedProvider, completed: true });
              return { item, result };
            }));
            return {
              data: results.filter(({ result }) => asArray(result.data).length).map(({ item, result }) => ({ ...item, statistics: result.data })),
              meta: {
                source: results.some(({ result }) => result.meta?.source === "provider") ? "provider" : "cache",
                provider: selectedProvider,
                providerUsage: mergeProviderUsage(...results.map(({ result }) => result.meta?.providerUsage)),
              },
            };
          })
        : await optional(
            "matchStatistics",
            () => sportsApi.getResource("fixtures", { ids: recentIds.join("-") }, { completed: true, detailed: true, ...(selectedProvider ? { provider: selectedProvider } : {}) }),
          )
      : (missingData.push({ section: "matchStatistics", reason: "recent_fixtures_unavailable" }), []);

    const injuriesFallback = selectedProvider === "thesportsdb" && capabilities.injuries !== true && configuredApiFootballFallback && fallbackIds.fixture;
    const lineupsFallback = selectedProvider === "thesportsdb" && capabilities.eventLineups !== true && configuredApiFootballFallback && fallbackIds.fixture;
    const oddsFallback = selectedProvider === "thesportsdb" && capabilities.odds !== true && configuredApiFootballFallback && fallbackIds.fixture;
    const injuriesEnabled = selectedProvider === "thesportsdb" ? capabilities.injuries === true || injuriesFallback : Boolean(coverage?.injuries);
    const lineupsEnabled = selectedProvider === "thesportsdb" ? capabilities.eventLineups === true || lineupsFallback : Boolean(coverage?.fixtures?.lineups);
    const oddsEnabled = selectedProvider === "thesportsdb" ? capabilities.odds === true || oddsFallback : Boolean(coverage?.odds);
    const untilKickoff = timeUntilFixture(fixture);
    const withinDay = untilKickoff !== null && untilKickoff <= 24 * 60 * 60 * 1000;
    const nearKickoff = untilKickoff !== null && untilKickoff <= 90 * 60 * 1000;
    const withinOddsWindow = untilKickoff !== null && untilKickoff <= 7 * 24 * 60 * 60 * 1000;

    const injuriesRaw = injuriesEnabled
      ? await optional("injuries", () => sportsApi.getResource("injuries", { fixture: injuriesFallback ? fallbackIds.fixture : fixtureId }, injuriesFallback ? { provider: "api-football" } : selectedProvider ? { provider: selectedProvider } : {}))
      : (missingData.push({ section: "injuries", reason: selectedProvider === "thesportsdb" ? "provider_not_supported" : "coverage_disabled" }), []);
    const lineupsRaw = lineupsEnabled && withinDay
      ? await optional("lineups", () => sportsApi.getResource("fixtures/lineups", { fixture: lineupsFallback ? fallbackIds.fixture : fixtureId }, { nearKickoff, provider: lineupsFallback ? "api-football" : selectedProvider }))
      : (missingData.push({ section: "lineups", reason: lineupsEnabled ? "not_yet_available" : "coverage_disabled" }), []);
    const oddsRaw = oddsEnabled && withinOddsWindow
      ? await optional("odds", () => sportsApi.getResource("odds", { fixture: oddsFallback ? fallbackIds.fixture : fixtureId }, oddsFallback ? { provider: "api-football" } : selectedProvider ? { provider: selectedProvider } : {}))
      : (missingData.push({ section: "odds", reason: oddsEnabled ? "outside_provider_window" : selectedProvider === "thesportsdb" ? "provider_not_supported" : "coverage_disabled" }), []);

    if (selectedProvider === "thesportsdb" && recentIds.length && asArray(detailedRaw).length < recentIds.length) {
      missingData.push({
        section: "matchStatistics",
        reason: "partial_sample",
        observations: asArray(detailedRaw).length,
        requested: recentIds.length,
      });
    }

    const timelineRaw = selectedProvider === "thesportsdb" && withinDay
      ? await optional("timeline", () => sportsApi.getResource("fixtures/timeline", { fixture: fixtureId }, { provider: selectedProvider }))
      : [];
    if (selectedProvider === "thesportsdb") {
      coverage = {
        provider: selectedProvider,
        observedAt: new Date().toISOString(),
        fixtures: {
          statistics: asArray(detailedRaw).length > 0,
          lineups: asArray(lineupsRaw).length > 0,
          timeline: asArray(timelineRaw).length > 0,
        },
        injuries: asArray(injuriesRaw).length > 0,
        odds: asArray(oddsRaw).length > 0,
      };
    }

    const homeRecent = normalizeRecentForm(asArray(homeRecentRaw), homeRecentTeamId);
    const awayRecent = normalizeRecentForm(asArray(awayRecentRaw), awayRecentTeamId);

    return {
      event: normalizeFixture(fixture),
      homeTeam: resolution.teams.home,
      awayTeam: resolution.teams.away,
      recentForm: {
        home: homeRecent,
        away: awayRecent,
      },
      lastSix: { home: homeRecent.matches.slice(0, 6), away: awayRecent.matches.slice(0, 6) },
      seasonStatistics: {
        home: normalizeSeasonStatistics(homeSeasonRaw, homeId, eventDate),
        away: normalizeSeasonStatistics(awaySeasonRaw, awayId, eventDate),
      },
      matchStatistics: normalizeDetailedFixtureStatistics(asArray(detailedRaw)),
      h2h: asArray(h2hRaw).map(normalizeFixture),
      injuries: normalizeInjuries(asArray(injuriesRaw)),
      lineups: normalizeLineups(asArray(lineupsRaw)),
      odds: normalizeOdds(asArray(oddsRaw)),
      timeline: asArray(timelineRaw),
      coverage,
      missingData,
      sources,
      providerIds: fixture.providerIds || fixture.fixture?.providerIds || null,
      providerUsage: usage,
    };
  }

  return { resolveFixture, collectFixtureData };
}
