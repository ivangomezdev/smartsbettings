function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function lastSixTeam(form, teamId) {
  const rows = (form?.matches || []).slice(0, 6).map((match) => {
    const home = match.homeTeam?.id === teamId;
    const goalsFor = Number(match.result?.goalsFor ?? (home ? match.goals?.home : match.goals?.away));
    const goalsAgainst = Number(match.result?.goalsAgainst ?? (home ? match.goals?.away : match.goals?.home));
    return {
      date: match.date,
      opponent: home ? match.awayTeam?.name : match.homeTeam?.name,
      homeAway: home ? "home" : "away",
      score: Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst) ? `${goalsFor}-${goalsAgainst}` : null,
      goalsFor, goalsAgainst,
      totalGoals: Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst) ? goalsFor + goalsAgainst : null,
    };
  }).filter((row) => Number.isFinite(row.goalsFor) && Number.isFinite(row.goalsAgainst));
  const rate = (predicate) => rows.length ? rows.filter(predicate).length / rows.length : null;
  const wins = rows.filter((row) => row.goalsFor > row.goalsAgainst).length;
  const draws = rows.filter((row) => row.goalsFor === row.goalsAgainst).length;
  const goalsFor = rows.reduce((sum, row) => sum + row.goalsFor, 0);
  const goalsAgainst = rows.reduce((sum, row) => sum + row.goalsAgainst, 0);
  return {
    matches: rows,
    summary: {
      played: rows.length, wins, draws, losses: rows.length - wins - draws, goalsFor, goalsAgainst,
      avgGoalsFor: rows.length ? goalsFor / rows.length : null,
      avgGoalsAgainst: rows.length ? goalsAgainst / rows.length : null,
      over05Rate: rate((row) => row.totalGoals > 0.5), over15Rate: rate((row) => row.totalGoals > 1.5),
      over25Rate: rate((row) => row.totalGoals > 2.5), bttsRate: rate((row) => row.goalsFor > 0 && row.goalsAgainst > 0),
    },
  };
}

function teamStats(snapshot, teamId) {
  const blocks = (snapshot.matchStatistics || []).flatMap((fixture) => (fixture.teams || []).filter((team) => team.team?.id === teamId));
  const opponentBlocks = (snapshot.matchStatistics || []).map((fixture) => (fixture.teams || []).find((team) => team.team?.id !== teamId)).filter(Boolean);
  const summary = (getter) => {
    const values = blocks.map(getter).filter(Number.isFinite);
    return { average: average(values), observations: values.length, requestedSample: 6, partial: values.length < 6 };
  };
  return {
    corners: summary((item) => item.values?.corners),
    cards: summary((item) => Number.isFinite(item.values?.yellowCards) ? item.values.yellowCards + (item.values?.redCards || 0) : null),
    shots: summary((item) => item.values?.totalShots),
    shotsOnTarget: summary((item) => item.values?.shotsOnTarget),
    possession: summary((item) => item.values?.possession),
    xg: summary((item) => item.values?.xg),
    xga: (() => {
      const values = opponentBlocks.map((item) => item.values?.xg).filter(Number.isFinite);
      return { average: average(values), observations: values.length, requestedSample: 6, partial: values.length < 6 };
    })(),
  };
}

function structuredInjury(item) {
  const provider = item.provenance?.provider || item.team?.provider || "api-football";
  return {
    ...item,
    subject: item.subject || item.player?.name || null,
    status: item.status || "UNKNOWN",
    source: item.source || { name: provider === "thesportsdb" ? "TheSportsDB" : "API-Football", publishedAt: null },
    provenance: item.provenance || { sourceType: "sports_api", provider },
  };
}

function structuredLineup(item) {
  const provider = item.provenance?.provider || item.team?.provider || "api-football";
  return {
    ...item,
    lineupStatus: item.lineupStatus || "CONFIRMED",
    starters: item.starters || (item.startingEleven || []).map((player) => player.name).filter(Boolean),
    substitutes: item.substitutes || [],
    source: item.source || { name: provider === "thesportsdb" ? "TheSportsDB" : "API-Football", publishedAt: item.sourceTimestamp || null },
    provenance: item.provenance || { sourceType: "sports_api", provider },
  };
}

function normalizedMissing(snapshot, webContext, statsSummary) {
  const normalize = (item) => {
    const value = String(item.code || item.section || item.reason || item).toLowerCase();
    if (value.includes("lineup")) return "LINEUP_NOT_CONFIRMED";
    if (value.includes("injur")) return "INJURY_DATA_NOT_AVAILABLE";
    if (value.includes("xg")) return "XG_NOT_AVAILABLE";
    if (value.includes("recent")) return "RECENT_FORM_NOT_AVAILABLE";
    return value.toUpperCase().replace(/\W+/g, "_");
  };
  const missing = new Set((snapshot.missingData || []).map(normalize));
  if (!(snapshot.lineups || []).length && !(webContext.lineups || []).length) missing.add("LINEUP_NOT_CONFIRMED");
  if (!(snapshot.injuries || []).length && !(webContext.injuries || []).length) missing.add("INJURY_DATA_NOT_AVAILABLE");
  if (statsSummary.home.corners.partial || statsSummary.away.corners.partial) missing.add("RECENT_CORNERS_PARTIAL");
  for (const warning of webContext.warnings || []) missing.add(warning.code);
  return [...missing];
}

export function buildExplanationContext({ snapshot, prediction, webContext = snapshot?.enrichment?.web || {} } = {}) {
  const homeId = snapshot.homeTeam?.id || snapshot.event?.homeTeam?.id;
  const awayId = snapshot.awayTeam?.id || snapshot.event?.awayTeam?.id;
  const statsSummary = { home: teamStats(snapshot, homeId), away: teamStats(snapshot, awayId) };
  const structuredSourceType = snapshot.sources?.historical ? "historical_dataset" : "sports_api";
  const structuredProvider = snapshot.event?.provider || snapshot.homeTeam?.provider || "api-football";
  return {
    event: snapshot.event,
    market: prediction.market,
    probability: (prediction.selections || []).map((item) => ({ key: item.key, probability: item.probability, fairOdds: item.fairOdds, marketOdds: item.marketOdds, theoreticalEdge: item.theoreticalEdge, edgeStatus: item.edgeStatus })),
    confidence: prediction.confidence,
    marketStatus: prediction.model?.marketStatus,
    model: {
      version: prediction.modelVersion,
      selectedBy: prediction.model?.selectedBy,
      routerVersion: prediction.model?.routerVersion,
    },
    conclusion: prediction.conclusion,
    warnings: prediction.warnings || [],
    lastSix: {
      home: lastSixTeam(snapshot.recentForm?.home, homeId),
      away: lastSixTeam(snapshot.recentForm?.away, awayId),
      provenance: { sourceType: structuredSourceType, provider: structuredSourceType === "sports_api" ? structuredProvider : snapshot.sources?.historical },
    },
    homeAwayStats: snapshot.seasonStatistics,
    statsSummary,
    h2h: (snapshot.h2h || []).slice(0, 5),
    injuries: [...(snapshot.injuries || []).map(structuredInjury), ...(webContext.injuries || [])],
    suspensions: webContext.suspensions || [],
    lineups: [...(snapshot.lineups || []).map(structuredLineup), ...(webContext.lineups || [])],
    rotations: webContext.rotations || [],
    playerReturns: webContext.playerReturns || [],
    news: [...(webContext.teamNews || []), ...(webContext.coachStatements || [])],
    positiveFactors: prediction.positiveFactors || [],
    negativeFactors: prediction.negativeFactors || [],
    missingData: normalizedMissing(snapshot, webContext, statsSummary),
    conflicts: webContext.conflicts || [],
    sources: webContext.sources || [],
    provenance: {
      recentMatches: { sourceType: structuredSourceType, provider: structuredProvider },
      statistics: { sourceType: structuredSourceType, provider: structuredProvider },
      webContext: { sourceType: "web", provider: webContext.researchProvider || null, version: webContext.version || null },
    },
  };
}
