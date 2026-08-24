import { randomUUID } from "node:crypto";
import { ensureSchema } from "../../lib/db.js";
import { PredictionValidationError } from "../../lib/predictions/errors.js";

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

export function createHistoryService({ getSql = ensureSchema } = {}) {
  return {
    async saveAnalysisSnapshot({ userId, conversationId = null, assistantMessageId = null, market, snapshot }) {
      if (!userId || !market?.code || !snapshot?.event?.fixtureId) {
        throw new PredictionValidationError("El snapshot no contiene usuario, fixture o mercado válidos.");
      }
      const id = randomUUID();
      const web = snapshot.enrichment?.web || null;
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `INSERT INTO sb_prediction_analyses (
          id, user_id, conversation_id, assistant_message_id, provider, fixture_id,
          sport, market, event_data, data_used, prediction, web_context, web_evidence,
          web_sources, web_conflicts, web_research_provider, web_enrichment_version, web_researched_at
        ) VALUES (
          $1, $2, $3, $4, 'api-football', $5, 'football', $6,
          $7::jsonb, $8::jsonb, '{}'::jsonb, $9::jsonb, $10::jsonb,
          $11::jsonb, $12::jsonb, $13, $14, $15
        ) RETURNING id, fixture_id, market, created_at`,
        [
          id,
          userId,
          conversationId,
          assistantMessageId,
          snapshot.event.fixtureId,
          market.code,
          JSON.stringify(snapshot.event),
          JSON.stringify(snapshot),
          JSON.stringify(web || {}),
          JSON.stringify(web?.evidence || []),
          JSON.stringify(web?.sources || []),
          JSON.stringify(web?.conflicts || []),
          web?.researchProvider || null,
          web?.version || null,
          web?.generatedAt || null,
        ],
      ));
      return rows[0] || { id, fixture_id: snapshot.event.fixtureId, market: market.code };
    },

    async updateAnalysisPrediction({ analysisId, result }) {
      if (!analysisId || !result?.modelVersion) {
        throw new PredictionValidationError("El resultado predictivo no contiene análisis o versión válidos.");
      }
      const selections = Array.isArray(result.selections) ? result.selections : [];
      const probabilities = Object.fromEntries(selections.map((selection) => [selection.key, selection.probability]));
      const fairOdds = Object.fromEntries(selections.map((selection) => [selection.key, selection.fairOdds]));
      const marketOdds = Object.fromEntries(selections.map((selection) => [selection.key, {
        odds: selection.marketOdds,
        bookmaker: selection.bookmaker,
        timestamp: selection.oddsTimestamp,
      }]));
      const theoreticalEdges = Object.fromEntries(selections.map((selection) => [selection.key, selection.theoreticalEdge ?? selection.edge ?? null]));
      const model = result.model || {};
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `UPDATE sb_prediction_analyses SET
          model_version = $2,
          model_selected_by = $3,
          market_status = $4,
          router_version = $5,
          router_config_fingerprint = $6,
          model_config_fingerprint = $7,
          probabilities = $8::jsonb,
          fair_odds = $9::jsonb,
          market_odds = $10::jsonb,
          edge = $11::jsonb,
          theoretical_edge = $11::jsonb,
          edge_status = $12,
          confidence = $13,
          prediction = $14::jsonb,
          predicted_at = NOW()
        WHERE id = $1
        RETURNING id, model_version, predicted_at`,
        [
          analysisId,
          result.modelVersion,
          model.selectedBy || null,
          model.marketStatus || null,
          model.routerVersion || null,
          model.routerConfigFingerprint || null,
          model.calibrationConfigFingerprint || model.configFingerprint || null,
          JSON.stringify(probabilities),
          JSON.stringify(fairOdds),
          JSON.stringify(marketOdds),
          JSON.stringify(theoreticalEdges),
          result.edgePolicy?.status || "UNVALIDATED",
          result.confidence?.level || null,
          JSON.stringify(result),
        ],
      ));
      if (!rows[0]) throw new PredictionValidationError("El análisis que se intentó actualizar no existe.");
      return rows[0];
    },

    async completeAnalysis({ analysisId, assistantMessageId, explanation, explanationContext, fingerprint, llm, costMetadata }) {
      const sql = await getSql();
      const rows = rowsFrom(await sql.query(
        `UPDATE sb_prediction_analyses SET
          assistant_message_id = $2,
          explanation = $3::jsonb,
          explanation_context = $4::jsonb,
          explanation_fingerprint = $5,
          prompt_version = $6,
          llm_metadata = $7::jsonb,
          cost_metadata = $8::jsonb
        WHERE id = $1
        RETURNING id`,
        [
          analysisId,
          assistantMessageId,
          JSON.stringify(explanation || {}),
          JSON.stringify(explanationContext || {}),
          fingerprint || null,
          llm?.promptVersion || null,
          JSON.stringify(llm || {}),
          JSON.stringify(costMetadata || {}),
        ],
      ));
      if (!rows[0]) throw new PredictionValidationError("El análisis que se intentó completar no existe.");
      return rows[0];
    },
  };
}
