import { CRITICAL_EVIDENCE_TYPES } from "./config.js";

function key(item) {
  return [item.type, item.team, item.subject].map((value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim()).join("|");
}

export function deduplicateEvidence(items) {
  const seenUrls = new Set();
  const seenClaims = new Set();
  return items.filter((item) => {
    const claimKey = `${key(item)}|${item.status}|${item.claim.toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (seenUrls.has(item.source.url) || seenClaims.has(claimKey)) return false;
    seenUrls.add(item.source.url);
    seenClaims.add(claimKey);
    return true;
  });
}

export function resolveEvidence(items) {
  const deduplicated = deduplicateEvidence(items);
  const bySubject = new Map();
  for (const item of deduplicated) bySubject.set(key(item), [...(bySubject.get(key(item)) || []), item]);
  const conflicts = [];
  const accepted = [];
  const warnings = [];
  for (const group of bySubject.values()) {
    const statuses = new Set(group.map((item) => item.status));
    if (statuses.size > 1) conflicts.push({ type: "CONFLICTING_SOURCES", subject: group[0].subject, team: group[0].team, claims: group });
    const critical = CRITICAL_EVIDENCE_TYPES.has(group[0].type);
    const trusted = group.filter((item) => item.source.tier <= 2);
    const credibleSecondary = group.filter((item) => item.source.tier === 3);
    const corroboratedTierThree = new Set(credibleSecondary.map((item) => item.source.url)).size >= 2;
    if (critical && !trusted.length && !corroboratedTierThree) {
      warnings.push({ code: "INSUFFICIENT_SOURCE_QUALITY", subject: group[0].subject, type: group[0].type });
      continue;
    }
    accepted.push(...group);
  }
  return { evidence: accepted, conflicts, warnings };
}
