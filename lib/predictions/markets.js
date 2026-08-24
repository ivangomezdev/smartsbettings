export const SUPPORTED_MARKETS = Object.freeze({
  over_0_5: { code: "over_0_5", family: "totals", side: "over", line: 0.5, label: "Over 0.5 goles" },
  over_1_5: { code: "over_1_5", family: "totals", side: "over", line: 1.5, label: "Over 1.5 goles" },
  over_2_5: { code: "over_2_5", family: "totals", side: "over", line: 2.5, label: "Over 2.5 goles" },
  under_1_5: { code: "under_1_5", family: "totals", side: "under", line: 1.5, label: "Under 1.5 goles" },
  under_2_5: { code: "under_2_5", family: "totals", side: "under", line: 2.5, label: "Under 2.5 goles" },
  btts: { code: "btts", family: "both_teams_to_score", side: "yes", line: null, label: "Ambos equipos marcan" },
  one_x_two: { code: "one_x_two", family: "match_result", side: null, line: null, label: "1X2" },
});

const marketPatterns = [
  { code: "btts", expression: /\b(?:btts|ambos(?:\s+equipos)?\s+marcan|both\s+teams\s+(?:to\s+)?score)\b/i },
  { code: "one_x_two", expression: /\b(?:1\s*x\s*2|match\s+winner|resultado\s+final)\b/i },
  { code: "over_0_5", expression: /\b(?:over|mas\s+de)\s*0[.,]5(?:\s+goles?|\s+goals?)?\b/i },
  { code: "over_1_5", expression: /\b(?:over|mas\s+de)\s*1[.,]5(?:\s+goles?|\s+goals?)?\b/i },
  { code: "over_2_5", expression: /\b(?:over|mas\s+de)\s*2[.,]5(?:\s+goles?|\s+goals?)?\b/i },
  { code: "under_1_5", expression: /\b(?:under|menos\s+de)\s*1[.,]5(?:\s+goles?|\s+goals?)?\b/i },
  { code: "under_2_5", expression: /\b(?:under|menos\s+de)\s*2[.,]5(?:\s+goles?|\s+goals?)?\b/i },
];

const unsupportedTotalsPattern = /\b(over|under|mas\s+de|menos\s+de)\s*(\d+(?:[.,]\d+)?)\b/i;

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function findMarket(value) {
  const normalized = normalizeSearchText(value);
  for (const pattern of marketPatterns) {
    const match = pattern.expression.exec(normalized);
    if (match) {
      return {
        ...SUPPORTED_MARKETS[pattern.code],
        match: { index: match.index, length: match[0].length, text: String(value).slice(match.index, match.index + match[0].length) },
      };
    }
  }

  const unsupported = unsupportedTotalsPattern.exec(normalized);
  if (unsupported) {
    return {
      unsupported: true,
      raw: unsupported[0],
      match: { index: unsupported.index, length: unsupported[0].length, text: String(value).slice(unsupported.index, unsupported.index + unsupported[0].length) },
    };
  }

  return null;
}
