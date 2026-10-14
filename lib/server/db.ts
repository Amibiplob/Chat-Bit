import "server-only";
import { Pool } from "pg";
import { databaseConfig } from "./database-config.mjs";
import { transaction } from "./transaction.mjs";

const globalDatabase = globalThis as typeof globalThis & { chatbitPool?: Pool };

// Lazy initialization lets public pages build without database credentials.
export function getDatabase(): Pool {
  if (!globalDatabase.chatbitPool) {
    const pool = new Pool(databaseConfig());
    // Never log the error object: it can contain connection details or SQL.
    pool.on("error", () => console.error("Idle database connection failed"));
    globalDatabase.chatbitPool = pool;
  }
  return globalDatabase.chatbitPool;
}

export function withTransaction<T>(operation: Parameters<typeof transaction<T>>[1]) {
  return transaction(getDatabase(), operation);
}
