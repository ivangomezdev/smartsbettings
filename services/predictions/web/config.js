export const FOOTBALL_WEB_ENRICHMENT_V1 = "football-web-enrichment-v1";

export const WEB_RESEARCH_CONFIG = Object.freeze({
  version: FOOTBALL_WEB_ENRICHMENT_V1,
  maxSearchesPerAnalysis: 8,
  maxResultsProcessed: 20,
  maxResultsPerSearch: 3,
  timeoutMs: 10_000,
  ttlMs: Object.freeze({
    fixture_result: 24 * 60 * 60 * 1000,
    injury: 2 * 60 * 60 * 1000,
    suspension: 8 * 60 * 60 * 1000,
    team_news: 2 * 60 * 60 * 1000,
    coach_statement: 2 * 60 * 60 * 1000,
    rotation: 2 * 60 * 60 * 1000,
    player_return: 2 * 60 * 60 * 1000,
    lineup_probable: 45 * 60 * 1000,
    lineup_confirmed: 12 * 60 * 1000,
    weather: 45 * 60 * 1000,
    venue_change: 6 * 60 * 60 * 1000,
    schedule_congestion: 6 * 60 * 60 * 1000,
  }),
  maxAgeMs: Object.freeze({
    fixture_result: 365 * 24 * 60 * 60 * 1000,
    injury: 14 * 24 * 60 * 60 * 1000,
    suspension: 30 * 24 * 60 * 60 * 1000,
    lineup_probable: 2 * 24 * 60 * 60 * 1000,
    lineup_confirmed: 24 * 60 * 60 * 1000,
    rotation: 7 * 24 * 60 * 60 * 1000,
    player_return: 14 * 24 * 60 * 60 * 1000,
    coach_statement: 7 * 24 * 60 * 60 * 1000,
    team_news: 7 * 24 * 60 * 60 * 1000,
    weather: 6 * 60 * 60 * 1000,
    venue_change: 30 * 24 * 60 * 60 * 1000,
    schedule_congestion: 14 * 24 * 60 * 60 * 1000,
  }),
});

export const CRITICAL_EVIDENCE_TYPES = Object.freeze(new Set(["injury", "suspension", "lineup_confirmed", "lineup_probable", "rotation", "player_return"]));
