const COMPLETED_STATUSES = new Set(["FT", "AET", "PEN"]);

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string" ? Number.parseFloat(value.replace("%", "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactTeam(team) {
  if (!team) return null;
  return {
    id: team.id ?? null,
    name: team.name ?? null,
    logo: team.logo ?? null,
    provider: team.provider ?? null,
    providerIds: team.providerIds ?? null,
  };
}

export function normalizeFixture(fixture) {
  return {
    fixtureId: fixture?.fixture?.id ?? null,
    date: fixture?.fixture?.date ?? null,
    timestamp: fixture?.fixture?.timestamp ?? null,
    timezone: fixture?.fixture?.timezone ?? null,
    venue: fixture?.fixture?.venue
      ? {
          id: fixture.fixture.venue.id ?? null,
          name: fixture.fixture.venue.name ?? null,
          city: fixture.fixture.venue.city ?? null,
        }
      : null,
    status: fixture?.fixture?.status
      ? {
          short: fixture.fixture.status.short ?? null,
          long: fixture.fixture.status.long ?? null,
          elapsed: fixture.fixture.status.elapsed ?? null,
        }
      : null,
    league: fixture?.league
      ? {
          id: fixture.league.id ?? null,
          name: fixture.league.name ?? null,
          country: fixture.league.country ?? null,
          season: fixture.league.season ?? null,
          round: fixture.league.round ?? null,
          logo: fixture.league.logo ?? null,
        }
      : null,
    homeTeam: compactTeam(fixture?.teams?.home),
    awayTeam: compactTeam(fixture?.teams?.away),
    goals: {
      home: numberOrNull(fixture?.goals?.home),
      away: numberOrNull(fixture?.goals?.away),
    },
    score: fixture?.score || null,
    provider: fixture?.provider ?? fixture?.fixture?.provider ?? null,
    providerIds: fixture?.providerIds ?? fixture?.fixture?.providerIds ?? null,
    provenance: fixture?.provenance ?? fixture?.fixture?.provenance ?? null,
  };
}

function resultForTeam(fixture, teamId) {
  const home = fixture?.teams?.home?.id === teamId;
  const away = fixture?.teams?.away?.id === teamId;
  if (!home && !away) return null;
  const scored = numberOrNull(home ? fixture?.goals?.home : fixture?.goals?.away);
  const conceded = numberOrNull(home ? fixture?.goals?.away : fixture?.goals?.home);
  if (scored === null || conceded === null) return null;
  return {
    venue: home ? "home" : "away",
    outcome: scored > conceded ? "W" : scored < conceded ? "L" : "D",
    goalsFor: scored,
    goalsAgainst: conceded,
  };
}

export function normalizeRecentForm(fixtures, teamId) {
  const matches = (fixtures || [])
    .filter((fixture) => COMPLETED_STATUSES.has(fixture?.fixture?.status?.short))
    .map((fixture) => {
      const result = resultForTeam(fixture, teamId);
      return result ? { ...normalizeFixture(fixture), result } : null;
    })
    .filter(Boolean);
  const totals = matches.reduce((summary, match) => {
    summary.goalsFor += match.result.goalsFor;
    summary.goalsAgainst += match.result.goalsAgainst;
    summary[match.result.outcome] += 1;
    return summary;
  }, { W: 0, D: 0, L: 0, goalsFor: 0, goalsAgainst: 0 });

  return {
    teamId,
    sampleSize: matches.length,
    sequence: matches.map((match) => match.result.outcome).join(""),
    totals,
    averages: {
      goalsFor: matches.length ? totals.goalsFor / matches.length : null,
      goalsAgainst: matches.length ? totals.goalsAgainst / matches.length : null,
    },
    matches,
  };
}

export function normalizeSeasonStatistics(raw, teamId, asOf = null) {
  if (!raw || typeof raw !== "object" || !raw.team) return null;
  return {
    team: compactTeam(raw.team),
    league: raw.league ? { id: raw.league.id ?? null, name: raw.league.name ?? null, season: raw.league.season ?? null } : null,
    form: raw.form ?? null,
    fixtures: raw.fixtures || null,
    goals: raw.goals || null,
    cleanSheets: raw.clean_sheet || null,
    failedToScore: raw.failed_to_score || null,
    sourceTeamId: teamId,
    asOf,
  };
}

const statisticNames = new Map([
  ["shots on goal", "shotsOnTarget"],
  ["shots off goal", "shotsOffTarget"],
  ["total shots", "totalShots"],
  ["blocked shots", "blockedShots"],
  ["shots insidebox", "shotsInsideBox"],
  ["shots outsidebox", "shotsOutsideBox"],
  ["corner kicks", "corners"],
  ["yellow cards", "yellowCards"],
  ["red cards", "redCards"],
  ["ball possession", "possession"],
  ["expected goals", "xg"],
  ["expected_goals", "xg"],
  ["fouls", "fouls"],
  ["offsides", "offsides"],
]);

function normalizeStatisticBlock(block) {
  const values = {};
  for (const statistic of block?.statistics || []) {
    const key = statisticNames.get(String(statistic.type || "").toLowerCase());
    if (key) values[key] = numberOrNull(statistic.value);
  }
  return { team: compactTeam(block?.team), values };
}

export function normalizeDetailedFixtureStatistics(fixtures) {
  return (fixtures || []).map((fixture) => ({
    fixture: normalizeFixture(fixture),
    teams: (fixture.statistics || []).map(normalizeStatisticBlock),
  }));
}

export function normalizeInjuries(items) {
  return (items || []).map((item) => ({
    player: item.player ? { id: item.player.id ?? null, name: item.player.name ?? null, photo: item.player.photo ?? null } : null,
    team: compactTeam(item.team),
    type: item.player?.type ?? item.type ?? null,
    reason: item.player?.reason ?? item.reason ?? null,
    fixtureId: item.fixture?.id ?? null,
  }));
}

function normalizePlayer(entry) {
  const player = entry?.player || entry;
  return player ? {
    id: player.id ?? null,
    name: player.name ?? null,
    number: player.number ?? null,
    position: player.pos ?? null,
    grid: player.grid ?? null,
  } : null;
}

export function normalizeLineups(items) {
  return (items || []).map((item) => ({
    team: compactTeam(item.team),
    formation: item.formation ?? null,
    coach: item.coach ? { id: item.coach.id ?? null, name: item.coach.name ?? null, photo: item.coach.photo ?? null } : null,
    startingEleven: (item.startXI || []).map(normalizePlayer).filter(Boolean),
    substitutes: (item.substitutes || []).map(normalizePlayer).filter(Boolean),
    lineupStatus: item.lineupStatus || "UNKNOWN",
    sourceTimestamp: item.sourceTimestamp ?? null,
    provenance: item.provenance ?? null,
  }));
}

export function normalizeOdds(items) {
  const snapshots = [];
  for (const item of items || []) {
    for (const bookmaker of item.bookmakers || []) {
      snapshots.push({
        fixtureId: item.fixture?.id ?? null,
        updatedAt: item.update ?? null,
        bookmaker: { id: bookmaker.id ?? null, name: bookmaker.name ?? null },
        markets: (bookmaker.bets || []).map((bet) => ({
          id: bet.id ?? null,
          name: bet.name ?? null,
          values: (bet.values || []).map((value) => ({
            label: value.value ?? null,
            odds: numberOrNull(value.odd),
          })),
        })),
      });
    }
  }
  return snapshots;
}

export function leagueCoverage(leagues, leagueId, season) {
  for (const item of leagues || []) {
    if (item?.league?.id !== leagueId) continue;
    const selected = (item.seasons || []).find((entry) => Number(entry.year) === Number(season));
    if (selected) return selected.coverage || null;
  }
  return null;
}
