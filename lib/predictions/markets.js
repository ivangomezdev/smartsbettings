function market(code, family, side, line, label, extra = {}) {
  return Object.freeze({ code, family, side, line, label, ...extra });
}

export const SUPPORTED_MARKETS = Object.freeze({
  over_0_5: market("over_0_5", "totals", "over", 0.5, "Over 0.5 goles"),
  over_1_5: market("over_1_5", "totals", "over", 1.5, "Over 1.5 goles"),
  over_2_5: market("over_2_5", "totals", "over", 2.5, "Over 2.5 goles"),
  over_3_5: market("over_3_5", "totals", "over", 3.5, "Over 3.5 goles"),
  over_4_5: market("over_4_5", "totals", "over", 4.5, "Over 4.5 goles"),
  under_1_5: market("under_1_5", "totals", "under", 1.5, "Under 1.5 goles"),
  under_2_5: market("under_2_5", "totals", "under", 2.5, "Under 2.5 goles"),
  under_3_5: market("under_3_5", "totals", "under", 3.5, "Under 3.5 goles"),
  under_4_5: market("under_4_5", "totals", "under", 4.5, "Under 4.5 goles"),
  btts: market("btts", "both_teams_to_score", "yes", null, "Ambos equipos marcan: Sí"),
  btts_no: market("btts_no", "both_teams_to_score", "no", null, "Ambos equipos marcan: No"),
  one_x_two: market("one_x_two", "match_result", null, null, "1X2"),
  double_chance_1x: market("double_chance_1x", "double_chance", "1x", null, "Doble oportunidad 1X"),
  double_chance_x2: market("double_chance_x2", "double_chance", "x2", null, "Doble oportunidad X2"),
  double_chance_12: market("double_chance_12", "double_chance", "12", null, "Doble oportunidad 12"),
  draw_no_bet_home: market("draw_no_bet_home", "draw_no_bet", "home", null, "Draw No Bet: local"),
  draw_no_bet_away: market("draw_no_bet_away", "draw_no_bet", "away", null, "Draw No Bet: visitante"),

  home_over_0_5: market("home_over_0_5", "team_totals", "over", 0.5, "Local Over 0.5 goles", { teamSide: "home" }),
  home_over_1_5: market("home_over_1_5", "team_totals", "over", 1.5, "Local Over 1.5 goles", { teamSide: "home" }),
  home_over_2_5: market("home_over_2_5", "team_totals", "over", 2.5, "Local Over 2.5 goles", { teamSide: "home" }),
  home_under_0_5: market("home_under_0_5", "team_totals", "under", 0.5, "Local Under 0.5 goles", { teamSide: "home" }),
  home_under_1_5: market("home_under_1_5", "team_totals", "under", 1.5, "Local Under 1.5 goles", { teamSide: "home" }),
  home_under_2_5: market("home_under_2_5", "team_totals", "under", 2.5, "Local Under 2.5 goles", { teamSide: "home" }),
  away_over_0_5: market("away_over_0_5", "team_totals", "over", 0.5, "Visitante Over 0.5 goles", { teamSide: "away" }),
  away_over_1_5: market("away_over_1_5", "team_totals", "over", 1.5, "Visitante Over 1.5 goles", { teamSide: "away" }),
  away_over_2_5: market("away_over_2_5", "team_totals", "over", 2.5, "Visitante Over 2.5 goles", { teamSide: "away" }),
  away_under_0_5: market("away_under_0_5", "team_totals", "under", 0.5, "Visitante Under 0.5 goles", { teamSide: "away" }),
  away_under_1_5: market("away_under_1_5", "team_totals", "under", 1.5, "Visitante Under 1.5 goles", { teamSide: "away" }),
  away_under_2_5: market("away_under_2_5", "team_totals", "under", 2.5, "Visitante Under 2.5 goles", { teamSide: "away" }),

  cards_over_3_5: market("cards_over_3_5", "cards_totals", "over", 3.5, "Over 3.5 tarjetas", { statistic: "cards" }),
  cards_over_4_5: market("cards_over_4_5", "cards_totals", "over", 4.5, "Over 4.5 tarjetas", { statistic: "cards" }),
  cards_over_5_5: market("cards_over_5_5", "cards_totals", "over", 5.5, "Over 5.5 tarjetas", { statistic: "cards" }),
  cards_under_3_5: market("cards_under_3_5", "cards_totals", "under", 3.5, "Under 3.5 tarjetas", { statistic: "cards" }),
  cards_under_4_5: market("cards_under_4_5", "cards_totals", "under", 4.5, "Under 4.5 tarjetas", { statistic: "cards" }),
  cards_under_5_5: market("cards_under_5_5", "cards_totals", "under", 5.5, "Under 5.5 tarjetas", { statistic: "cards" }),
  corners_over_8_5: market("corners_over_8_5", "corners_totals", "over", 8.5, "Over 8.5 corners", { statistic: "corners" }),
  corners_over_9_5: market("corners_over_9_5", "corners_totals", "over", 9.5, "Over 9.5 corners", { statistic: "corners" }),
  corners_over_10_5: market("corners_over_10_5", "corners_totals", "over", 10.5, "Over 10.5 corners", { statistic: "corners" }),
  corners_under_8_5: market("corners_under_8_5", "corners_totals", "under", 8.5, "Under 8.5 corners", { statistic: "corners" }),
  corners_under_9_5: market("corners_under_9_5", "corners_totals", "under", 9.5, "Under 9.5 corners", { statistic: "corners" }),
  corners_under_10_5: market("corners_under_10_5", "corners_totals", "under", 10.5, "Under 10.5 corners", { statistic: "corners" }),
});

const marketPatterns = [];
const add = (code, expression) => marketPatterns.push({ code, expression });
const sideWord = { over: "(?:over|mas\\s+de)", under: "(?:under|menos\\s+de)" };
const lineText = (line) => String(line).replace(".", "[.,]");

for (const statistic of ["cards", "corners"]) {
  const noun = statistic === "cards" ? "(?:tarjetas|cards)" : "(?:corners|esquinas|tiros\\s+de\\s+esquina)";
  const lines = statistic === "cards" ? [3.5, 4.5, 5.5] : [8.5, 9.5, 10.5];
  for (const side of ["over", "under"]) {
    for (const line of lines) {
      const code = `${statistic}_${side}_${String(line).replace(".", "_")}`;
      add(code, new RegExp(`\\b(?:${sideWord[side]}\\s*${lineText(line)}\\s*${noun}|${noun}(?:\\s+totales?)?\\s*${sideWord[side]}\\s*${lineText(line)})\\b`, "i"));
    }
  }
}

for (const teamSide of ["home", "away"]) {
  const teamWord = teamSide === "home" ? "(?:(?:equipo\\s+)?local|home(?:\\s+team)?)" : "(?:(?:equipo\\s+)?visitante|away(?:\\s+team)?)";
  for (const side of ["over", "under"]) {
    for (const line of [0.5, 1.5, 2.5]) {
      const code = `${teamSide}_${side}_${String(line).replace(".", "_")}`;
      add(code, new RegExp(`\\b(?:${teamWord}\\s*${sideWord[side]}\\s*${lineText(line)}(?:\\s+goles?|\\s+goals?)?|${sideWord[side]}\\s*${lineText(line)}(?:\\s+goles?|\\s+goals?)?\\s+(?:del\\s+|de\\s+)?${teamWord})\\b`, "i"));
    }
  }
}

add("btts_no", /\b(?:btts\s*:?[\s-]*no|ambos(?:\s+equipos)?\s+no\s+marcan|both\s+teams\s+(?:to\s+)?score\s*:?[\s-]*no)\b/i);
add("double_chance_1x", /\b(?:doble\s+oportunidad|double\s+chance)\s*1\s*x\b/i);
add("double_chance_x2", /\b(?:doble\s+oportunidad|double\s+chance)\s*x\s*2\b/i);
add("double_chance_12", /\b(?:doble\s+oportunidad|double\s+chance)\s*1\s*2\b/i);
add("draw_no_bet_home", /\b(?:draw\s+no\s+bet|dnb|empate\s+no\s+apuesta)\s*(?:local|home|1)\b/i);
add("draw_no_bet_away", /\b(?:draw\s+no\s+bet|dnb|empate\s+no\s+apuesta)\s*(?:visitante|away|2)\b/i);
add("btts", /\b(?:btts(?:\s*:?[\s-]*si)?|ambos(?:\s+equipos)?\s+marcan|both\s+teams\s+(?:to\s+)?score(?:\s*:?[\s-]*yes)?)\b/i);
add("one_x_two", /\b(?:1\s*x\s*2|match\s+winner|resultado\s+final)\b/i);

for (const side of ["over", "under"]) {
  for (const line of side === "over" ? [0.5, 1.5, 2.5, 3.5, 4.5] : [1.5, 2.5, 3.5, 4.5]) {
    const code = `${side}_${String(line).replace(".", "_")}`;
    add(code, new RegExp(`\\b${sideWord[side]}\\s*${lineText(line)}(?:\\s+goles?|\\s+goals?)?\\b`, "i"));
  }
}

const unsupportedTotalsPattern = /\b(over|under|mas\s+de|menos\s+de)\s*(\d+(?:[.,]\d+)?)\b/i;
const unsupportedPeriodPattern = /\b(?:primer(?:\s+|a\s+)tiempo|primera\s+mitad|1(?:er|ro)?\s+tiempo|first\s+half|1st\s+half)\b/i;
const marketHintPattern = /\b(?:btts|ambos|both\s+teams|over|under|mas\s+de|menos\s+de|doble\s+oportunidad|double\s+chance|draw\s+no\s+bet|dnb|tarjetas|cards|corners|esquinas)\b/i;

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function findMarket(value) {
  const normalized = normalizeSearchText(value);
  const period = unsupportedPeriodPattern.exec(normalized);
  if (period && marketHintPattern.test(normalized)) {
    return {
      unsupported: true,
      reason: "UNSUPPORTED_PERIOD",
      raw: period[0],
      match: { index: period.index, length: period[0].length, text: String(value).slice(period.index, period.index + period[0].length) },
    };
  }

  for (const pattern of marketPatterns) {
    const matchResult = pattern.expression.exec(normalized);
    if (matchResult) {
      return {
        ...SUPPORTED_MARKETS[pattern.code],
        match: { index: matchResult.index, length: matchResult[0].length, text: String(value).slice(matchResult.index, matchResult.index + matchResult[0].length) },
      };
    }
  }

  const unsupported = unsupportedTotalsPattern.exec(normalized);
  if (unsupported) {
    return {
      unsupported: true,
      reason: "UNSUPPORTED_LINE",
      raw: unsupported[0],
      match: { index: unsupported.index, length: unsupported[0].length, text: String(value).slice(unsupported.index, unsupported.index + unsupported[0].length) },
    };
  }

  return null;
}
