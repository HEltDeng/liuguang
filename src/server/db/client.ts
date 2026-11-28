import { PGlite } from "@electric-sql/pglite";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { migrate, type SqlAdapter } from "./migrate.ts";
import * as schema from "./schema.ts";

export type AppDatabase = PgliteDatabase<typeof schema>;

export type Runtime = {
  kind: "pglite" | "postgres";
  db: AppDatabase;
  query(
    statement: string,
    params?: unknown[],
  ): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
};

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

export async function openDatabase(options?: {
  databaseUrl?: string;
  dataDir?: string;
}): Promise<Runtime> {
  const databaseUrl =
    options?.databaseUrl ?? process.env.DATABASE_URL?.trim() ?? "";
  if (
    databaseUrl.startsWith("postgres://") ||
    databaseUrl.startsWith("postgresql://")
  ) {
    return openPostgres(databaseUrl);
  }
  const dataDir =
    options?.dataDir ??
    process.env.PGLITE_DIR?.trim() ??
    join(repoRoot, ".data", "pglite");
  return openPglite(dataDir);
}

async function openPglite(dataDir: string): Promise<Runtime> {
  if (!dataDir.startsWith("memory:")) mkdirSync(dataDir, { recursive: true });
  const client = await PGlite.create(dataDir);
  const adapter: SqlAdapter = {
    query: async (statement, params = []) => {
      const result = await client.query(statement, params);
      return result.rows as Record<string, unknown>[];
    },
    exec: async (statement) => {
      await client.exec(statement);
    },
  };
  await migrate(adapter);
  return {
    kind: "pglite",
    db: drizzlePglite(client, { schema }),
    query: (statement, params) => adapter.query(statement, params),
    close: () => client.close(),
  };
}

async function openPostgres(databaseUrl: string): Promise<Runtime> {
  const sql = postgres(databaseUrl, { max: 4, onnotice() {} });
  const adapter: SqlAdapter = {
    query: async (statement, params = []) => {
      const rows = await sql.unsafe(statement, params as never[]);
      return rows as unknown as Record<string, unknown>[];
    },
    exec: async (statement) => {
      await sql.unsafe(statement);
    },
  };
  await migrate(adapter);
  return {
    kind: "postgres",
    // Both drivers expose the same pg-core query builder. The schema is Postgres.
    db: drizzlePostgres(sql, { schema }) as unknown as AppDatabase,
    query: (statement, params) => adapter.query(statement, params),
    close: () => sql.end({ timeout: 5 }),
  };
}
