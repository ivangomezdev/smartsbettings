import { createHistoryService } from "./historyService.js";
import { createWebResearchService } from "./web/webResearchService.js";

export function createAnalysisDataService({ matchService, historyService = createHistoryService(), webResearchService = createWebResearchService() } = {}) {
  if (!matchService) throw new Error("createAnalysisDataService requiere matchService.");

  return {
    async prepareSnapshot({ parsed, userId, conversationId = null, assistantMessageId = null }) {
      const resolution = await matchService.resolveFixture(parsed);
      if (resolution.kind !== "resolved") return resolution;

      const structuredSnapshot = await matchService.collectFixtureData(resolution);
      const snapshot = await webResearchService.enrichSnapshot({
        snapshot: structuredSnapshot,
        explicitDeep: parsed?.analysisDepth === "deep" || parsed?.deepAnalysis === true,
        structuredConflicts: structuredSnapshot.conflicts || [],
      });
      const saved = await historyService.saveAnalysisSnapshot({
        userId,
        conversationId,
        assistantMessageId,
        market: resolution.market,
        snapshot,
      });

      return {
        kind: "snapshot",
        analysisId: saved.id,
        fixture: snapshot.event,
        market: resolution.market,
        snapshot,
      };
    },
  };
}
