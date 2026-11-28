import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { ensureSampleInvite } from "./accounts.ts";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/client.ts";

const runtime = await openDatabase();
if (process.env.NODE_ENV !== "production") await ensureSampleInvite(runtime.db);
const app = createApp(runtime);
const port = Number(process.env.PORT ?? 8765);
const host = process.env.HOST ?? "127.0.0.1";
const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(port, host, () => {
  const address = server.address();
  const actual = address && typeof address === "object" ? address.port : port;
  process.stderr.write(`liuguang listening on http://${host}:${actual}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void runtime.close().then(() => process.exit(0));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  try {
    const response = await app.handle(await toRequest(req));
    await writeResponse(res, response);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error: "server_error",
          message: "服务暂时没有完成这次请求。",
        }),
      );
    }
  }
}

function toRequest(req: IncomingMessage): Promise<Request> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 100_000) {
        req.destroy();
        reject(new Error("body_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value))
          for (const item of value) headers.append(key, item);
      }
      const method = req.method ?? "GET";
      const body = Buffer.concat(chunks);
      resolve(
        new Request(
          `http://${req.headers.host ?? "127.0.0.1"}${req.url ?? "/"}`,
          {
            method,
            headers,
            body:
              body.length > 0 && method !== "GET" && method !== "HEAD"
                ? body
                : undefined,
          },
        ),
      );
    });
    req.on("error", reject);
  });
}

async function writeResponse(res: ServerResponse, response: Response) {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") headers[key] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}
