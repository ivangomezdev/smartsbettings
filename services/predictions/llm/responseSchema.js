const text = { type: "string" };
const factor = {
  type: "object",
  additionalProperties: false,
  properties: { title: { type: "string" }, description: text },
  required: ["title", "description"],
};

export const PREDICTION_EXPLANATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      properties: { headline: text, conclusion: text, mainReason: text, mainRisk: text },
      required: ["headline", "conclusion", "mainReason", "mainRisk"],
    },
    positiveFactors: { type: "array", items: factor },
    negativeFactors: { type: "array", items: factor },
    recentFormCommentary: {
      type: "object",
      additionalProperties: false,
      properties: { home: text, away: text },
      required: ["home", "away"],
    },
    homeAwayCommentary: text,
    statsCommentary: text,
    h2hCommentary: text,
    injuriesCommentary: text,
    lineupCommentary: text,
    newsCommentary: text,
    missingDataCommentary: text,
    finalAssessment: text,
  },
  required: [
    "summary", "positiveFactors", "negativeFactors", "recentFormCommentary", "homeAwayCommentary",
    "statsCommentary", "h2hCommentary", "injuriesCommentary", "lineupCommentary", "newsCommentary",
    "missingDataCommentary", "finalAssessment",
  ],
});

function validText(value) {
  return typeof value === "string" && value.length <= 2_000;
}

function validFactors(items) {
  return Array.isArray(items) && items.length <= 6 && items.every((item) => (
    item && exactKeys(item, ["description", "title"]) && validText(item.title) && validText(item.description)
  ));
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validatePredictionExplanation(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value)
    && exactKeys(value, [
      "finalAssessment", "h2hCommentary", "homeAwayCommentary", "injuriesCommentary", "lineupCommentary",
      "missingDataCommentary", "negativeFactors", "newsCommentary", "positiveFactors", "recentFormCommentary",
      "statsCommentary", "summary",
    ])
    && exactKeys(value.summary, ["conclusion", "headline", "mainReason", "mainRisk"])
    && ["headline", "conclusion", "mainReason", "mainRisk"].every((key) => validText(value.summary[key]))
    && validFactors(value.positiveFactors) && validFactors(value.negativeFactors)
    && exactKeys(value.recentFormCommentary, ["away", "home"])
    && validText(value.recentFormCommentary.home) && validText(value.recentFormCommentary.away)
    && ["homeAwayCommentary", "statsCommentary", "h2hCommentary", "injuriesCommentary", "lineupCommentary", "newsCommentary", "missingDataCommentary", "finalAssessment"].every((key) => validText(value[key]))
  );
}
