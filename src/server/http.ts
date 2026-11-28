import type { z } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  issues?: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export function json(
  status: number,
  body: unknown,
  setCookie?: string,
): Response {
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  if (setCookie) headers.set("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(error: HttpError): Response {
  return json(error.status, {
    error: error.code,
    message: error.message,
    ...(error.issues ? { issues: error.issues } : {}),
  });
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    throw new HttpError(
      400,
      "invalid_input",
      issues[0]?.message ?? "请检查填写的内容",
      issues,
    );
  }
  return result.data;
}

export function unwrapHttp(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (error && typeof error === "object" && "cause" in error)
    return unwrapHttp(error.cause);
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  const pending = [error];
  const seen = new Set<unknown>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if ("code" in current && current.code === "23505") return true;
    if ("cause" in current) pending.push(current.cause);
  }
  return false;
}

export function constraintHttp(error: unknown): HttpError | null {
  const message = errorText(error);
  if (message.includes("invitation_decision_frozen")) {
    return new HttpError(
      409,
      "invitation_decision_frozen",
      "这条邀请已经有结果，不能再改。",
    );
  }
  if (message.includes("messages_require_acceptance")) {
    return new HttpError(
      403,
      "messages_require_acceptance",
      "接受邀请之后才能发消息。",
    );
  }
  if (message.includes("message_sender_not_participant")) {
    return new HttpError(403, "forbidden", "只有邀请双方可以发消息。");
  }
  return null;
}

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const own =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const cause = "cause" in error ? errorText(error.cause) : "";
  return `${own}\n${cause}`;
}

export function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function instant(value: Date | string): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}
