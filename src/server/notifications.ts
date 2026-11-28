import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./db/client.ts";
import { notifications } from "./db/schema.ts";

export async function notify(
  db: AppDatabase,
  accountId: string,
  kind: string,
  body: string,
): Promise<void> {
  await db.insert(notifications).values({
    id: randomUUID(),
    accountId,
    kind,
    body,
    createdAt: new Date(),
  });
}
