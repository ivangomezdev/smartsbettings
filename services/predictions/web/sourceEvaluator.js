const TIER_ONE_DOMAINS = Object.freeze([
  "uefa.com", "fifa.com", "premierleague.com", "laliga.com", "bundesliga.com", "legaseriea.it", "ligue1.com",
  "realmadrid.com", "sevillafc.es", "fcbarcelona.com", "atleticodemadrid.com", "athletic-club.eus",
  "arsenal.com", "chelseafc.com", "fulhamfc.com", "liverpoolfc.com", "mancity.com", "manutd.com", "tottenhamhotspur.com",
  "fcbayern.com", "bvb.de", "inter.it", "acmilan.com", "juventus.com", "psg.fr", "ol.fr",
]);
const TIER_TWO_DOMAINS = Object.freeze([
  "bbc.com", "bbc.co.uk", "reuters.com", "espn.com", "theathletic.com", "skysports.com",
]);

function matchesDomain(host, domains) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(ref|source|key|api_?key|token|auth|signature)$/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function evaluateSource(result) {
  const url = canonicalUrl(result?.url);
  if (!url) return { accepted: false, reason: "EVIDENCE_URL_REQUIRED", tier: null };
  if ([1, 2, 3, 4].includes(Number(result.sourceTier))) return { accepted: true, tier: Number(result.sourceTier), url };
  const host = new URL(url).hostname.replace(/^www\./, "");
  const tier = matchesDomain(host, TIER_ONE_DOMAINS) ? 1 : matchesDomain(host, TIER_TWO_DOMAINS) ? 2 : 4;
  return { accepted: true, tier, url };
}
