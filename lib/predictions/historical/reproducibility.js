import { createHash } from "node:crypto";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function configurationHash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function datasetVersion(matches) {
  const identities = matches.map((match) => ({
    matchKey: match.matchKey,
    source: match.source,
    goals: [match.homeGoals, match.awayGoals],
    shots: [match.homeShots, match.awayShots, match.homeShotsOnTarget, match.awayShotsOnTarget],
    corners: [match.homeCorners, match.awayCorners],
    cards: [match.homeCards, match.awayCards],
    xg: [match.homeXg, match.awayXg],
    odds: [match.oddsHome, match.oddsDraw, match.oddsAway],
    providerData: match.providerData || {},
  })).sort((left, right) => String(left.matchKey).localeCompare(String(right.matchKey)));
  return configurationHash({ schema: "historical-dataset-v1", matches: identities });
}
