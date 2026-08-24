import { createOpenAiProvider } from "../services/predictions/llm/openaiProvider.js";
import { buildPredictionPrompt } from "../services/predictions/llm/promptBuilder.js";
import { validatePredictionExplanation } from "../services/predictions/llm/responseSchema.js";

const provider = createOpenAiProvider();
if (!provider.configured) throw new Error("OPENAI_API_KEY no está configurada en el servidor.");

const prediction = {
  modelVersion: "football-poisson-v2",
  model: { marketStatus: "SUPPORTED" },
  confidence: { level: "medium", score: 0.68, reasons: ["Muestra reciente suficiente."] },
  selections: [{ key: "over_1_5", probability: 0.7142, fairOdds: 1.400168, marketOdds: 1.62 }],
};
const protectedBefore = {
  probability: prediction.selections[0].probability,
  fairOdds: prediction.selections[0].fairOdds,
  modelVersion: prediction.modelVersion,
  marketStatus: prediction.model.marketStatus,
  confidence: structuredClone(prediction.confidence),
};
const explanationContext = {
  event: { homeTeam: "Real Madrid", awayTeam: "Sevilla", date: "2026-08-30T19:00:00.000Z" },
  market: { code: "over_1_5", label: "Over 1.5 goles" },
  probability: prediction.selections,
  confidence: prediction.confidence,
  marketStatus: prediction.model.marketStatus,
  conclusion: "El modelo estadístico produce una señal favorable, sujeta a incertidumbre.",
  lastSix: {
    home: { matches: [], summary: { played: 0 } },
    away: { matches: [], summary: { played: 0 } },
  },
  homeAwayStats: null,
  statsSummary: {},
  h2h: [],
  injuries: [],
  suspensions: [],
  lineups: [],
  rotations: [],
  news: [],
  positiveFactors: [{ code: "MODEL_SIGNAL", description: "Probabilidad estadística por encima del umbral interno." }],
  negativeFactors: [{ code: "MISSING_LINEUPS", description: "No hay alineaciones confirmadas." }],
  missingData: ["LINEUP_NOT_CONFIRMED", "INJURY_DATA_NOT_AVAILABLE"],
  sources: [],
};
const prompt = buildPredictionPrompt({ explanationContext, language: "es" });
const result = await provider.generate({ instructions: prompt.instructions, input: prompt.input, fingerprint: "structured-output-live-check-v1" });

const protectedAfter = {
  probability: prediction.selections[0].probability,
  fairOdds: prediction.selections[0].fairOdds,
  modelVersion: prediction.modelVersion,
  marketStatus: prediction.model.marketStatus,
  confidence: structuredClone(prediction.confidence),
};
const forbiddenOutputFields = ["probability", "fairOdds", "modelVersion", "marketStatus", "confidence"]
  .filter((field) => Object.hasOwn(result.explanation, field));
const protectedFieldsUnchanged = JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter);
const report = {
  provider: provider.name,
  model: provider.model,
  structuredOutputValid: validatePredictionExplanation(result.explanation),
  protectedFieldsUnchanged,
  forbiddenOutputFields,
  usage: result.usage,
  responseId: result.responseId,
};

if (!report.structuredOutputValid || !protectedFieldsUnchanged || forbiddenOutputFields.length) {
  process.exitCode = 1;
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
