import { createHistoricalRepository } from "./historicalRepository.js";

function uniqueByMatchKey(matches) {
  const unique = new Map();
  for (const match of matches) if (!unique.has(match.matchKey)) unique.set(match.matchKey, match);
  return [...unique.values()];
}

export function createHistoricalDataService({ repository = createHistoricalRepository() } = {}) {
  return {
    async importNormalized(result, { dryRun = false, limit = null, chunkSize = 100 } = {}) {
      const selected = Number.isInteger(limit) && limit >= 0 ? result.matches.slice(0, limit) : result.matches;
      const unique = uniqueByMatchKey(selected);
      const localDuplicates = selected.length - unique.length;
      if (dryRun) {
        return {
          source: result.source,
          origin: result.origin || null,
          totalRows: result.totalRows,
          valid: unique.length,
          rejected: result.rejected.length,
          inserted: 0,
          duplicates: localDuplicates,
          dryRun: true,
          rejectionDetails: result.rejected.slice(0, 20),
        };
      }
      const saved = await repository.insertMatches(unique, { chunkSize });
      const details = (result.details || []).filter((detail) => unique.some((match) => match.matchKey === detail.matchKey));
      const detailResult = repository.saveMatchDetails ? await repository.saveMatchDetails(details) : { saved: 0 };
      return {
        source: result.source,
        origin: result.origin || null,
        totalRows: result.totalRows,
        valid: unique.length,
        rejected: result.rejected.length,
        inserted: saved.inserted,
        duplicates: saved.duplicates + localDuplicates,
        detailsSaved: detailResult.saved,
        dryRun: false,
        rejectionDetails: result.rejected.slice(0, 20),
      };
    },
  };
}
