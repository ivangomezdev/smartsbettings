import { createHash, randomUUID } from "node:crypto";

export function normalizeTeamName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSeason(value) {
  const clean = String(value || "").trim();
  const match = clean.match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (!match) return clean;
  const end = match[2].length === 2 ? `${match[1].slice(0, 2)}${match[2]}` : match[2];
  return `${match[1]}-${end}`;
}

export function canonicalMatchKey(match) {
  const day = new Date(match.matchDate).toISOString().slice(0, 10);
  const identity = [
    normalizeTeamName(match.competition),
    normalizeSeason(match.season).toLowerCase(),
    day,
    match.homeTeamNormalized || normalizeTeamName(match.homeTeam),
    match.awayTeamNormalized || normalizeTeamName(match.awayTeam),
  ].join("|");
  return createHash("sha256").update(identity).digest("hex");
}

function sameContext(alias, context) {
  if (alias.competition && alias.competition !== context.competition) return false;
  if (alias.country && alias.country !== context.country) return false;
  return true;
}

export function resolveTeamName(name, context = {}, aliases = []) {
  const normalized = normalizeTeamName(name);
  if (!normalized) return { kind: "unresolved", original: name, normalized, reason: "empty_name" };
  const matches = aliases.filter((alias) => alias.aliasNormalized === normalized && sameContext(alias, context));
  const canonicalNames = [...new Set(matches.map((alias) => alias.canonicalName))];
  if (canonicalNames.length > 1) {
    return { kind: "ambiguous", original: name, normalized, candidates: canonicalNames };
  }
  const canonicalName = canonicalNames[0] || String(name).trim();
  return {
    kind: "resolved",
    original: name,
    canonicalName,
    normalized: normalizeTeamName(canonicalName),
    viaAlias: Boolean(canonicalNames.length),
  };
}

export function createTeamAlias({ canonicalName, alias, competition = null, country = null, source = null }) {
  const canonicalNameNormalized = normalizeTeamName(canonicalName);
  const aliasNormalized = normalizeTeamName(alias);
  if (!canonicalNameNormalized || !aliasNormalized) throw new TypeError("Alias y nombre canónico son obligatorios.");
  return {
    id: randomUUID(),
    canonicalName: String(canonicalName).trim(),
    canonicalNameNormalized,
    alias: String(alias).trim(),
    aliasNormalized,
    competition,
    country,
    source,
  };
}
