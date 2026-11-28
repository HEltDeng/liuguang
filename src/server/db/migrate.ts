import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSql } from "./sql.ts";

export type SqlAdapter = {
  query(
    statement: string,
    params?: unknown[],
  ): Promise<Record<string, unknown>[]>;
  exec(statement: string): Promise<void>;
};

const migrationDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function migrate(adapter: SqlAdapter): Promise<string[]> {
  let applied = new Set<string>();
  try {
    const rows = await adapter.query("SELECT id FROM schema_migrations");
    applied = new Set(rows.map((row) => String(row.id)));
  } catch {
    applied = new Set();
  }
  const ran: string[] = [];
  for (const name of readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const id = name.slice(0, -4);
    if (!/^[0-9]{4}_[a-z0-9_]+$/.test(id))
      throw new Error("Unexpected migration id");
    if (applied.has(id)) continue;
    const sql = readFileSync(join(migrationDir, name), "utf8");
    for (const statement of splitSql(sql)) await adapter.exec(statement);
    await adapter.exec(`INSERT INTO schema_migrations (id) VALUES ('${id}')`);
    ran.push(id);
  }
  return ran;
}
