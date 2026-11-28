import { createApp, type App } from "./app.ts";
import { ensureSampleInvite } from "./accounts.ts";
import { openDatabase } from "./db/client.ts";

const people = [
  {
    email: "linxiao@sample.liuguang.test",
    password: "sample-pass-lin",
    displayName: "林晓",
    school: "伦敦大学学院",
    major: "计算机科学",
    stage: "行前准备",
    publicBio: "合成样本。想问第一学期怎么准备编程作业。",
    privateNote: "合成样本：林晓的私人备注",
    willingToHelp: false,
  },
  {
    email: "zhou@sample.liuguang.test",
    password: "sample-pass-zhou",
    displayName: "周宁",
    school: "伦敦大学学院",
    major: "计算机科学",
    stage: "在读",
    publicBio: "合成样本。可以聊聊编程作业和小组合作。",
    privateNote: "合成样本：周宁的私人备注",
    willingToHelp: true,
  },
];

const runtime = await openDatabase();
const app: App = createApp(runtime);
let failed = false;
try {
  await ensureSampleInvite(runtime.db);
  for (const person of people) {
    const cookie = await sessionFor(
      person.email,
      person.password,
      person.displayName,
    );
    const saved = await call("PUT", "/api/profile", person, cookie);
    if (saved.status !== 200) {
      process.stderr.write(
        `Could not save the synthetic profile for ${person.email}\n`,
      );
      failed = true;
    }
  }
} finally {
  await runtime.close();
}
if (failed) process.exit(1);
process.stdout.write(
  "Seeded two synthetic accounts. Passwords are in docs/runbooks/m1-connection.md\n",
);

async function sessionFor(
  email: string,
  password: string,
  displayName: string,
): Promise<string> {
  const registered = await call("POST", "/api/auth/register", {
    inviteCode: "M1-SAMPLE",
    email,
    password,
    displayName,
    ageConfirmed: true,
    privacyConsent: true,
    testConsent: true,
  });
  if (registered.status === 201) return cookieHeader(registered.response);
  const logged = await call("POST", "/api/auth/login", { email, password });
  if (logged.status !== 200)
    throw new Error(`Could not sign in the synthetic account ${email}`);
  return cookieHeader(logged.response);
}

async function call(
  method: string,
  path: string,
  body: unknown,
  cookie?: string,
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  const response = await app.handle(
    new Request(`http://127.0.0.1${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, response };
}

function cookieHeader(response: Response): string {
  const cookie = response.headers.getSetCookie()[0];
  if (!cookie) throw new Error("missing session cookie");
  return cookie.split(";")[0] ?? cookie;
}
