import { parsePredictionDate } from "./date.js";
import { findMarket, normalizeSearchText } from "./markets.js";

const unsupportedSportPattern = /\b(basketball|baloncesto|nba|baseball|beisbol|tennis|tenis)\b/i;
const teamSeparatorPattern = /\s+(?:vs?\.?|versus|contra)\s+/i;

function maskRange(value, match) {
  if (!match) return value;
  return `${value.slice(0, match.index)}${" ".repeat(match.length)}${value.slice(match.index + match.length)}`;
}

function cleanTeamSegment(segment, side) {
  let value = segment
    .replace(/[,:;|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (side === "home") {
    value = value.replace(
      /^(?:(?:por\s+favor|please)\s+)?(?:quiero\s+que\s+)?(?:analiza(?:r)?|analyze|analisis\s+de|analysis\s+of|pronostico(?:\s+de)?|prediction(?:\s+for)?|dame(?:\s+un)?|el\s+partido|partido)\s+/i,
      "",
    );
  } else {
    value = value.replace(/\s+(?:para|for|en|on|el|the|goles?|goals?|por\s+favor|please)\s*$/i, "");
  }

  return value.replace(/^[\s-]+|[\s-]+$/g, "").trim();
}

function extractTeams(maskedSource) {
  const separator = teamSeparatorPattern.exec(maskedSource);
  if (!separator) return { homeTeam: null, awayTeam: null };

  const left = maskedSource.slice(0, separator.index);
  const right = maskedSource.slice(separator.index + separator[0].length);
  const homeTeam = cleanTeamSegment(left, "home");
  const awayTeam = cleanTeamSegment(right, "away");

  return {
    homeTeam: homeTeam || null,
    awayTeam: awayTeam || null,
  };
}

export function parsePredictionQuery(input, options = {}) {
  const source = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  const errors = [];
  const missingFields = [];

  if (!source) {
    return {
      sport: "football",
      homeTeam: null,
      awayTeam: null,
      market: null,
      dateRange: parsePredictionDate("", options).dateRange,
      missingFields: ["homeTeam", "awayTeam", "market"],
      errors: [],
    };
  }

  const normalized = normalizeSearchText(source);
  const unsupportedSport = unsupportedSportPattern.exec(normalized);
  if (unsupportedSport) {
    errors.push({
      code: "UNSUPPORTED_SPORT",
      message: "La primera versión de Predictions solo admite fútbol.",
      value: source.slice(unsupportedSport.index, unsupportedSport.index + unsupportedSport[0].length),
    });
  }

  const marketResult = findMarket(source);
  if (marketResult?.unsupported) {
    errors.push({
      code: "UNSUPPORTED_MARKET",
      message: "El mercado indicado todavía no está soportado.",
      value: marketResult.raw,
    });
  }

  const dateResult = parsePredictionDate(source, options);
  if (dateResult.error) errors.push(dateResult.error);

  let masked = source;
  masked = maskRange(masked, marketResult?.match);
  masked = maskRange(masked, dateResult.match);
  const { homeTeam, awayTeam } = extractTeams(masked);
  const market = marketResult && !marketResult.unsupported
    ? {
        code: marketResult.code,
        family: marketResult.family,
        side: marketResult.side,
        line: marketResult.line,
        label: marketResult.label,
      }
    : null;

  if (!homeTeam) missingFields.push("homeTeam");
  if (!awayTeam) missingFields.push("awayTeam");
  if (!market) missingFields.push("market");

  return {
    sport: unsupportedSport ? null : "football",
    homeTeam,
    awayTeam,
    market,
    dateRange: dateResult.dateRange,
    missingFields,
    errors,
  };
}
