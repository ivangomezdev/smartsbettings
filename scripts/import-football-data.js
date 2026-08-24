import { resolve } from "node:path";
import { loadFootballDataUk } from "../services/predictions/historical/providers/footballDataUk.js";
import { createHistoricalDataService } from "../services/predictions/historical/historicalDataService.js";
import { createHistoricalRepository } from "../services/predictions/historical/historicalRepository.js";
import { parseCliArguments, positiveInteger } from "./historical-cli.js";

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  if (!options.league || !options.season) {
    throw new TypeError("Uso: --league E0 --season 2023-2024 [--file ruta.csv | --url URL] [--dry-run] [--limit N]");
  }
  const repository = createHistoricalRepository();
  const dryRun = options.dryRun === true;
  const aliases = process.env.DATABASE_URL ? await repository.listAliases() : [];
  const normalized = await loadFootballDataUk({
    league: options.league,
    season: options.season,
    country: options.country || null,
    file: typeof options.file === "string" ? resolve(options.file) : null,
    url: typeof options.url === "string" ? options.url : null,
    aliases,
  });
  const result = await createHistoricalDataService({ repository }).importNormalized(normalized, {
    dryRun,
    limit: options.limit === undefined ? null : positiveInteger(options.limit),
    chunkSize: positiveInteger(options.chunkSize, 100),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Importación fallida: ${error.message}\n`);
  process.exitCode = 1;
});
