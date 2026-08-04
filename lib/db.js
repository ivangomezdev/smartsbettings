import { neon } from "@neondatabase/serverless";
import { schemaStatements } from "../db/schema.js";

let database;
let schemaPromise;

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL no está configurada.");
    this.name = "DatabaseConfigurationError";
  }
}

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new DatabaseConfigurationError();
  }

  if (!database) {
    database = neon(process.env.DATABASE_URL);
  }

  return database;
}

export async function ensureSchema() {
  const sql = getDatabase();

  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const statement of schemaStatements) {
        await sql.query(statement);
      }
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }

  await schemaPromise;
  return sql;
}
