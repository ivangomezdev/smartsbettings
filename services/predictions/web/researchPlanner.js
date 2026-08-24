function cleanTerm(value) {
  return String(value || "").replace(/[^\p{L}\p{N} .'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function missing(snapshot, section) {
  return (snapshot.missingData || []).some((item) => String(item.section || item.code || "").toLowerCase().includes(section));
}

function futureOrNear(snapshot, now) {
  const startsAt = Date.parse(snapshot?.event?.date || "");
  return Number.isFinite(startsAt) && startsAt >= now.getTime() - 3 * 60 * 60 * 1000;
}

function officialDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function createResearchPlan({ snapshot, explicitDeep = false, structuredConflicts = [], now = new Date() } = {}) {
  const home = cleanTerm(snapshot?.homeTeam?.name || snapshot?.event?.homeTeam?.name);
  const away = cleanTerm(snapshot?.awayTeam?.name || snapshot?.event?.awayTeam?.name);
  if (!home || !away) return [];
  const date = String(snapshot?.event?.date || now.toISOString()).slice(0, 10);
  const versus = `${home} ${away}`;
  const officialDomains = [
    officialDomain(snapshot?.homeTeam?.officialWebsite),
    officialDomain(snapshot?.awayTeam?.officialWebsite),
  ].filter(Boolean);
  const officialQuery = (terms) => officialDomains.map((domain) => `site:${domain} ${terms}`);
  const plan = [];
  const add = (type, queries, reason) => plan.push({ type, queries: [...new Set(queries)], reason });
  if (!(snapshot.injuries || []).length || missing(snapshot, "injur")) {
    add("injury", [...officialQuery(`${versus} injuries ${date}`), `${versus} injuries ${date}`, `${home} ${away} team news injuries`], "INJURY_DATA_NOT_AVAILABLE");
    add("suspension", [`${versus} suspensions ${date}`], "SUSPENSION_DATA_NOT_AVAILABLE");
  }
  if (!(snapshot.lineups || []).length || missing(snapshot, "lineup")) {
    add("lineup_probable", [...officialQuery(`${versus} lineup ${date}`), `${versus} probable lineup ${date}`], "LINEUP_NOT_CONFIRMED");
    if (futureOrNear(snapshot, now)) add("lineup_confirmed", [...officialQuery(`${versus} confirmed lineup ${date}`), `${versus} confirmed lineup ${date}`], "LINEUP_NOT_CONFIRMED");
  }
  if (futureOrNear(snapshot, now) || explicitDeep) {
    add("team_news", [`${home} team news ${away} ${date}`, `${away} team news ${home} ${date}`], "RECENT_CONTEXT_REQUESTED");
    add("coach_statement", [`${versus} press conference rotations ${date}`], "RECENT_CONTEXT_REQUESTED");
  }
  if (explicitDeep) {
    add("rotation", [`${versus} expected rotations ${date}`], "DEEP_ANALYSIS_REQUESTED");
    add("player_return", [`${versus} player returns availability ${date}`], "DEEP_ANALYSIS_REQUESTED");
    add("schedule_congestion", [`${versus} fixture schedule congestion ${date}`], "DEEP_ANALYSIS_REQUESTED");
    if (futureOrNear(snapshot, now)) add("weather", [`${versus} match weather ${date}`], "DEEP_ANALYSIS_REQUESTED");
    add("venue_change", [`${versus} venue neutral site ${date}`], "DEEP_ANALYSIS_REQUESTED");
  }
  if (missing(snapshot, "recent") && !(snapshot.recentForm?.home?.matches?.length && snapshot.recentForm?.away?.matches?.length)) {
    add("fixture_result", [`${home} recent results`, `${away} recent results`], "RECENT_FORM_NOT_AVAILABLE");
  }
  if (structuredConflicts.length) add("team_news", [`${versus} latest official update ${date}`], "STRUCTURED_SOURCE_CONFLICT");
  return plan;
}
