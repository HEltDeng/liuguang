import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { ensureSampleInvite } from "./accounts.ts";
import { createApp, type App } from "./app.ts";
import { openDatabase, type Runtime } from "./db/client.ts";
import { splitSql } from "./db/sql.ts";
import { profileHints } from "./model.ts";

type Json = Record<string, any>;

describe("student connection permissions", { concurrency: 1 }, () => {
  let runtime: Runtime;
  let app: App;
  let seq = 0;

  before(async () => {
    runtime = await openDatabase({ databaseUrl: "", dataDir: "memory://" });
    await ensureSampleInvite(runtime.db);
    app = createApp(runtime);
  });

  after(async () => {
    await runtime?.close();
  });

  test("migration keeps invitation and message guards in one statement each", () => {
    const sql = readFileSync(
      new URL("./db/migrations/0001_init.sql", import.meta.url),
      "utf8",
    );
    const statements = splitSql(sql);
    assert.equal(
      statements.filter((item) => item.startsWith("CREATE TABLE")).length,
      12,
    );
    const functions = statements.filter((item) =>
      item.startsWith("CREATE OR REPLACE FUNCTION"),
    );
    assert.equal(functions.length, 2);
    assert.ok(
      functions.some(
        (item) =>
          item.includes("invitation_decision_frozen") && item.includes("END"),
      ),
    );
    assert.ok(
      functions.some(
        (item) =>
          item.includes("messages_require_acceptance") && item.includes("END"),
      ),
    );
  });

  test("rules are not labeled as model output when no model is configured", async () => {
    let called = false;
    const result = await profileHints(
      "学校：伦敦大学学院\n专业：计算机科学\n我还在行前准备",
      {
        env: {},
        fetchImpl: () => {
          called = true;
          throw new Error("network");
        },
      },
    );
    assert.equal(called, false);
    assert.equal(result.source, "rules");
    assert.equal(result.fields.school, "伦敦大学学院");
    assert.equal(result.fields.major, "计算机科学");
    assert.equal(result.fields.stage, "行前准备");
    assert.match(result.label, /不是模型输出/);
  });

  test("two accounts can ask, invite, accept once, and message only after acceptance", async () => {
    const lin = await register(
      "林晓",
      profile(
        "合成大学甲",
        "计算机科学",
        "行前准备",
        "PRIVATE-NOTE-LIN",
        false,
      ),
    );
    const zhou = await register(
      "周宁",
      profile("合成大学甲", "计算机科学", "在读", "PRIVATE-NOTE-ZHOU", true),
    );
    const chen = await register(
      "陈可",
      profile("合成大学乙", "计算机科学", "在读", "PRIVATE-NOTE-CHEN", true),
    );

    const matches = await call(
      "GET",
      "/api/matches?school=合成大学乙",
      undefined,
      lin.cookie,
    );
    assert.equal(matches.status, 200);
    assert.equal(matches.json.source, "rules");
    assert.match(String(matches.json.label), /不是模型推荐/);
    assert.equal(matches.json.community.school, "合成大学甲");
    assert.deepEqual(
      matches.json.people.map((person: Json) => person.displayName),
      ["周宁"],
    );
    const listed = JSON.stringify(matches.json);
    assert.equal(listed.includes("PRIVATE-NOTE"), false);
    assert.equal(listed.includes("privateNote"), false);
    assert.equal(listed.includes("@sample.liuguang.test"), false);

    const stranger = await call(
      "GET",
      "/api/profiles/" + zhou.id,
      undefined,
      lin.cookie,
    );
    assert.equal(stranger.status, 200);
    assert.equal(
      JSON.stringify(stranger.json).includes("PRIVATE-NOTE-ZHOU"),
      false,
    );
    assert.equal(Object.hasOwn(stranger.json.profile, "privateNote"), false);
    assert.equal(Object.hasOwn(stranger.json.profile, "email"), false);
    const own = await call("GET", "/api/me", undefined, zhou.cookie);
    assert.equal(own.json.profile.privateNote, "PRIVATE-NOTE-ZHOU");

    const asked = await call(
      "POST",
      "/api/questions",
      { title: "作业怎么开始", body: "第一份编程作业要先读什么？" },
      lin.cookie,
    );
    assert.equal(asked.status, 201);
    const answered = await call(
      "POST",
      "/api/questions/" + asked.json.question.id + "/answers",
      { body: "先把作业说明读完。" },
      zhou.cookie,
    );
    assert.equal(answered.status, 201);
    const otherSchool = await call(
      "GET",
      "/api/questions",
      undefined,
      chen.cookie,
    );
    assert.equal(otherSchool.json.questions.length, 0);

    const cross = await call(
      "POST",
      "/api/invitations",
      { toAccountId: chen.id, note: "跨校试试" },
      lin.cookie,
    );
    assert.equal(cross.status, 403);
    assert.equal(cross.json.error, "different_community");

    const invite = await call(
      "POST",
      "/api/invitations",
      { toAccountId: zhou.id, note: "想问作业" },
      lin.cookie,
    );
    assert.equal(invite.status, 201);
    const invitationId = invite.json.invitation.id as string;
    const tooEarly = await call(
      "POST",
      "/api/invitations/" + invitationId + "/messages",
      { body: "你好" },
      lin.cookie,
    );
    assert.equal(tooEarly.status, 403);
    assert.equal(tooEarly.json.error, "messages_require_acceptance");
    const senderAccepts = await call(
      "POST",
      "/api/invitations/" + invitationId + "/accept",
      {},
      lin.cookie,
    );
    assert.equal(senderAccepts.status, 403);

    assert.equal(
      (
        await call(
          "POST",
          "/api/invitations/" + invitationId + "/reject",
          {},
          zhou.cookie,
        )
      ).status,
      200,
    );
    const rejectedAgain = await call(
      "POST",
      "/api/invitations/" + invitationId + "/accept",
      {},
      zhou.cookie,
    );
    assert.equal(rejectedAgain.status, 409);
    assert.equal(rejectedAgain.json.error, "invitation_rejected");
    const stillBlocked = await call(
      "POST",
      "/api/invitations/" + invitationId + "/messages",
      { body: "拒绝后还想聊" },
      lin.cookie,
    );
    assert.equal(stillBlocked.status, 403);

    const second = await call(
      "POST",
      "/api/invitations",
      { toAccountId: zhou.id, note: "再约一次" },
      lin.cookie,
    );
    const secondId = second.json.invitation.id as string;
    assert.equal(
      (
        await call(
          "POST",
          "/api/invitations/" + secondId + "/accept",
          {},
          zhou.cookie,
        )
      ).status,
      200,
    );
    const duplicate = await call(
      "POST",
      "/api/invitations/" + secondId + "/accept",
      {},
      zhou.cookie,
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json.error, "invitation_already_accepted");
    assert.equal(
      (
        await call(
          "POST",
          "/api/invitations/" + secondId + "/messages",
          { body: "现在可以聊了" },
          lin.cookie,
        )
      ).status,
      201,
    );
    const thread = await call(
      "GET",
      "/api/invitations/" + secondId + "/messages",
      undefined,
      zhou.cookie,
    );
    assert.equal(thread.json.canPost, true);
    assert.equal(thread.json.messages[0].body, "现在可以聊了");
    const outsider = await call(
      "POST",
      "/api/invitations/" + secondId + "/messages",
      { body: "偷看" },
      chen.cookie,
    );
    assert.equal(outsider.status, 404);

    const reserved = await call(
      "POST",
      "/api/experience-cards",
      { title: "还没做" },
      lin.cookie,
    );
    assert.equal(reserved.status, 501);
    assert.equal(reserved.json.error, "reserved");
  });

  test("database rejects a reopened invitation and a message before acceptance", async () => {
    const from = await register(
      "甲",
      profile("合成大学丙", "建筑", "行前准备", "PRIVATE-A", false),
    );
    const to = await register(
      "乙",
      profile("合成大学丙", "建筑", "校友", "PRIVATE-B", true),
    );
    const invite = await call(
      "POST",
      "/api/invitations",
      { toAccountId: to.id, note: "看看" },
      from.cookie,
    );
    const invitationId = invite.json.invitation.id as string;
    await assert.rejects(
      runtime.query(
        "INSERT INTO messages (id, invitation_id, sender_id, body) VALUES ($1, $2, $3, $4)",
        [crypto.randomUUID(), invitationId, from.id, "太早"],
      ),
      /messages_require_acceptance/,
    );
    assert.equal(
      (
        await call(
          "POST",
          "/api/invitations/" + invitationId + "/reject",
          {},
          to.cookie,
        )
      ).status,
      200,
    );
    await assert.rejects(
      runtime.query(
        "UPDATE invitations SET status = 'accepted' WHERE id = $1",
        [invitationId],
      ),
      /invitation_decision_frozen/,
    );
  });

  test("production refuses the synthetic invite code", async () => {
    const prod = createApp(runtime, { production: true });
    const response = await prod.handle(
      new Request("http://127.0.0.1/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inviteCode: "M1-SAMPLE",
          email: "prod@sample.liuguang.test",
          password: "sample-pass-1",
          displayName: "正式",
          ageConfirmed: true,
          privacyConsent: true,
          testConsent: true,
        }),
      }),
    );
    const body = (await response.json()) as Json;
    assert.equal(response.status, 403, JSON.stringify(body));
    assert.equal(body.error, "sample_code_not_allowed");
  });

  async function register(name: string, next?: Json) {
    seq += 1;
    const result = await call("POST", "/api/auth/register", {
      inviteCode: "M1-SAMPLE",
      email: "person-" + seq + "@sample.liuguang.test",
      password: "sample-pass-1",
      displayName: name,
      ageConfirmed: true,
      privacyConsent: true,
      testConsent: true,
    });
    assert.equal(result.status, 201, JSON.stringify(result.json));
    assert.equal(result.json.account.isSample, true);
    if (next) {
      const saved = await call(
        "PUT",
        "/api/profile",
        { ...next, displayName: name },
        result.cookie,
      );
      assert.equal(saved.status, 200, JSON.stringify(saved.json));
    }
    return { id: result.json.account.id as string, cookie: result.cookie };
  }

  async function call(
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
  ) {
    const headers = new Headers();
    if (cookie) headers.set("cookie", cookie);
    let payload: string | undefined;
    if (body !== undefined) {
      headers.set("content-type", "application/json");
      payload = JSON.stringify(body);
    }
    const response = await app.handle(
      new Request("http://127.0.0.1" + path, {
        method,
        headers,
        body: payload,
      }),
    );
    const text = await response.text();
    const session = response.headers.getSetCookie()[0]?.split(";")[0];
    return {
      status: response.status,
      json: text ? (JSON.parse(text) as Json) : {},
      cookie: session,
    };
  }
});

function profile(
  school: string,
  major: string,
  stage: string,
  privateNote: string,
  willingToHelp: boolean,
) {
  return {
    school,
    major,
    stage,
    publicBio: "公开介绍",
    privateNote,
    willingToHelp,
  };
}
