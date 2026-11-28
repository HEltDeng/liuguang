import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  answerSchema,
  helpfulSchema,
  hintsSchema,
  invitationSchema,
  loginSchema,
  messageSchema,
  profileSchema,
  questionSchema,
  registerSchema,
} from "../../contracts/schemas.ts";
import {
  loginAccount,
  logoutAccount,
  ownProfile,
  registerAccount,
  requireOwnProfile,
  requireViewer,
  saveProfile,
  visibleProfile,
} from "./accounts.ts";
import {
  answerQuestion,
  askQuestion,
  listMatches,
  listQuestions,
  markHelpful,
} from "./community.ts";
import {
  createInvitation,
  decideInvitation,
  listInvitations,
  listMessages,
  listNotifications,
  markNotificationsRead,
  sendMessage,
} from "./conversation.ts";
import type { Runtime } from "./db/client.ts";
import {
  constraintHttp,
  errorResponse,
  HttpError,
  json,
  parse,
  unwrapHttp,
} from "./http.ts";
import { modelConfigured, profileHints } from "./model.ts";
import { clearSessionCookie, sessionCookie } from "./passwords.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const staticRoot = realpathSync(join(repoRoot, "代码", "liuguang"));
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const RESERVED = {
  error: "reserved",
  message: "经验卡片的审核和发布还没有开放。",
  designNote:
    "先完成问答、邀请和对话。之后把双方同意的问答整理成经验卡片，作者确认后才进入检索。检索会同时保留规则筛选和模型重排，并标明各自的来源。",
};

export type App = {
  handle(request: Request): Promise<Response>;
  close(): Promise<void>;
};

export function createApp(
  runtime: Runtime,
  options: { production?: boolean; modelEnv?: NodeJS.ProcessEnv } = {},
): App {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const modelEnv = options.modelEnv ?? process.env;
  return {
    handle: (request) => handle(runtime, request, production, modelEnv),
    close: () => runtime.close(),
  };
}

async function handle(
  runtime: Runtime,
  request: Request,
  production: boolean,
  modelEnv: NodeJS.ProcessEnv,
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/"))
      return await handleApi(runtime, request, url, production, modelEnv);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    return serveStatic(url.pathname, request.method === "HEAD");
  } catch (error) {
    const http = unwrapHttp(error) ?? constraintHttp(error);
    if (http) return errorResponse(http);
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      process.stderr.write(`${error.name}: ${error.message}\n`);
    }
    return json(500, {
      error: "server_error",
      message: "服务暂时没有完成这次请求。",
    });
  }
}

async function handleApi(
  runtime: Runtime,
  request: Request,
  url: URL,
  production: boolean,
  modelEnv: NodeJS.ProcessEnv,
): Promise<Response> {
  const { db } = runtime;
  const path = url.pathname;
  const method = request.method;
  const body = await readBody(request);
  if (method === "GET" && path === "/api/health") {
    return json(200, {
      ok: true,
      database: runtime.kind,
      model: modelConfigured(modelEnv) ? "configured" : "rules",
    });
  }
  if (method === "GET" && path === "/api/assistant/status") {
    const configured = modelConfigured(modelEnv);
    return json(200, {
      configured,
      mode: configured ? "model" : "rules",
      label: configured
        ? "模型接口已配置。整理结果会标明来源；失败时改用规则，并写明不是模型输出。"
        : "没有配置模型。整理和同校筛选使用规则，不会标成模型输出。",
    });
  }
  if (method === "POST" && path === "/api/auth/register") {
    const input = parse(registerSchema, body);
    const result = await registerAccount(db, input, production);
    return json(
      201,
      { account: result.viewer, profile: null },
      sessionCookie(result.token),
    );
  }
  if (method === "POST" && path === "/api/auth/login") {
    const input = parse(loginSchema, body);
    const result = await loginAccount(db, input.email, input.password);
    const profile = await ownProfile(db, result.viewer);
    return json(
      200,
      { account: result.viewer, profile },
      sessionCookie(result.token),
    );
  }
  if (method === "POST" && path === "/api/auth/logout") {
    await logoutAccount(db, request);
    return json(200, { ok: true }, clearSessionCookie());
  }
  if (
    method === "GET" &&
    (path === "/api/experience-cards" ||
      path === "/api/experience-cards/review")
  ) {
    await requireViewer(db, request);
    return json(501, RESERVED);
  }
  if (
    method === "POST" &&
    (path === "/api/experience-cards" ||
      path === "/api/experience-cards/review")
  ) {
    await requireViewer(db, request);
    return json(501, RESERVED);
  }

  const viewer = await requireViewer(db, request);
  if (method === "GET" && path === "/api/me") {
    return json(200, {
      account: viewer,
      profile: await ownProfile(db, viewer),
    });
  }
  if (method === "PUT" && path === "/api/profile") {
    const saved = await saveProfile(db, viewer, parse(profileSchema, body));
    return json(200, { profile: saved });
  }
  const profileMatch = /^\/api\/profiles\/([0-9a-f-]{36})$/.exec(path);
  if (method === "GET" && profileMatch?.[1]) {
    const profile = await visibleProfile(db, profileMatch[1]);
    if (!profile)
      throw new HttpError(404, "not_found", "没有找到这位同学的公开资料。");
    return json(200, { profile });
  }
  if (method === "GET" && (path === "/api/people" || path === "/api/matches")) {
    return json(
      200,
      await listMatches(db, await requireOwnProfile(db, viewer), modelEnv),
    );
  }
  if (method === "GET" && path === "/api/questions") {
    return json(
      200,
      await listQuestions(db, await requireOwnProfile(db, viewer)),
    );
  }
  if (method === "POST" && path === "/api/questions") {
    const created = await askQuestion(
      db,
      viewer,
      await requireOwnProfile(db, viewer),
      parse(questionSchema, body),
    );
    return json(201, { question: created });
  }
  const answerMatch = /^\/api\/questions\/([0-9a-f-]{36})\/answers$/.exec(path);
  if (method === "POST" && answerMatch?.[1]) {
    const created = await answerQuestion(
      db,
      viewer,
      await requireOwnProfile(db, viewer),
      answerMatch[1],
      parse(answerSchema, body).body,
    );
    return json(201, { answer: created });
  }
  const helpfulMatch = /^\/api\/answers\/([0-9a-f-]{36})\/helpful$/.exec(path);
  if (method === "POST" && helpfulMatch?.[1]) {
    const result = await markHelpful(
      db,
      viewer,
      await requireOwnProfile(db, viewer),
      helpfulMatch[1],
      parse(helpfulSchema, body).helpful,
    );
    return json(200, result);
  }
  if (method === "GET" && path === "/api/invitations")
    return json(200, await listInvitations(db, viewer));
  if (method === "POST" && path === "/api/invitations") {
    const created = await createInvitation(
      db,
      viewer,
      await requireOwnProfile(db, viewer),
      parse(invitationSchema, body),
    );
    return json(201, { invitation: created });
  }
  const invitationMatch =
    /^\/api\/invitations\/([0-9a-f-]{36})\/(accept|reject|messages)$/.exec(
      path,
    );
  if (
    invitationMatch?.[1] &&
    invitationMatch[2] === "accept" &&
    method === "POST"
  ) {
    return json(200, {
      invitation: await decideInvitation(
        db,
        viewer,
        invitationMatch[1],
        "accepted",
      ),
    });
  }
  if (
    invitationMatch?.[1] &&
    invitationMatch[2] === "reject" &&
    method === "POST"
  ) {
    return json(200, {
      invitation: await decideInvitation(
        db,
        viewer,
        invitationMatch[1],
        "rejected",
      ),
    });
  }
  if (
    invitationMatch?.[1] &&
    invitationMatch[2] === "messages" &&
    method === "GET"
  ) {
    return json(200, await listMessages(db, viewer, invitationMatch[1]));
  }
  if (
    invitationMatch?.[1] &&
    invitationMatch[2] === "messages" &&
    method === "POST"
  ) {
    const created = await sendMessage(
      db,
      viewer,
      invitationMatch[1],
      parse(messageSchema, body).body,
    );
    return json(201, { message: created });
  }
  if (method === "GET" && path === "/api/notifications")
    return json(200, await listNotifications(db, viewer));
  if (method === "POST" && path === "/api/notifications/read") {
    return json(200, await markNotificationsRead(db, viewer));
  }
  if (method === "POST" && path === "/api/assistant/profile-hints") {
    const hints = await profileHints(parse(hintsSchema, body).text, {
      env: modelEnv,
    });
    return json(200, hints);
  }
  throw new HttpError(404, "not_found", "没有这个接口。");
}

async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const text = await request.text();
  if (text.length === 0) return {};
  if (text.length > 100_000)
    throw new HttpError(413, "body_too_large", "内容太长了。");
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json"))
    throw new HttpError(415, "unsupported_media", "请用 JSON 提交。");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "JSON 无法解析。");
  }
}

function serveStatic(pathname: string, head: boolean): Response {
  let relative = decodeURIComponent(pathname);
  if (relative.includes("\0"))
    return new Response("Bad request", { status: 400 });
  if (relative.endsWith("/")) relative += "index.html";
  if (relative === "/") relative = "/index.html";
  const full = resolve(staticRoot, `.${relative}`);
  if (full !== staticRoot && !full.startsWith(staticRoot + sep))
    return new Response("Forbidden", { status: 403 });
  if (existsSync(full) && statSync(full).isDirectory()) {
    return serveStatic(
      relative.endsWith("/")
        ? `${relative}index.html`
        : `${relative}/index.html`,
      head,
    );
  }
  if (!existsSync(full) || !statSync(full).isFile())
    return new Response("Not found", { status: 404 });
  const real = realpathSync(full);
  if (!real.startsWith(staticRoot + sep))
    return new Response("Forbidden", { status: 403 });
  const contentType = types[extname(real)];
  if (!contentType) return new Response("Not found", { status: 404 });
  return new Response(head ? null : readFileSync(real), {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
