import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./db/client.ts";
import { answers, communities, profiles, questions } from "./db/schema.ts";
import { accounts } from "./db/schema.ts";
import type { PrivateProfile, PublicProfile, Viewer } from "./accounts.ts";
import { HttpError, iso } from "./http.ts";
import { RULE_MATCH_LABEL, modelConfigured } from "./model.ts";
import { notify } from "./notifications.ts";

export type Author = { id: string; displayName: string; isSample: boolean };

export async function ensureCommunity(
  db: AppDatabase,
  school: string,
  major: string,
): Promise<string> {
  const id = randomUUID();
  await db
    .insert(communities)
    .values({ id, school, major, createdAt: new Date() })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.school, school), eq(communities.major, major)));
  if (!row)
    throw new HttpError(500, "server_error", "学校和专业社区没有建成。");
  return row.id;
}

export async function listMatches(
  db: AppDatabase,
  profile: PrivateProfile,
  env: NodeJS.ProcessEnv,
) {
  await ensureCommunity(db, profile.school, profile.major);
  const people = await db
    .select({
      id: accounts.id,
      displayName: profiles.displayName,
      school: profiles.school,
      major: profiles.major,
      stage: profiles.stage,
      publicBio: profiles.publicBio,
      willingToHelp: profiles.willingToHelp,
      isSample: accounts.isSample,
    })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.accountId))
    .where(
      and(
        eq(profiles.school, profile.school),
        eq(profiles.major, profile.major),
        ne(profiles.accountId, profile.id),
      ),
    );
  return {
    source: "rules" as const,
    label: RULE_MATCH_LABEL,
    modelConfigured: modelConfigured(env),
    community: { school: profile.school, major: profile.major },
    people: people satisfies PublicProfile[],
  };
}

export async function listQuestions(db: AppDatabase, profile: PrivateProfile) {
  const communityId = await ensureCommunity(db, profile.school, profile.major);
  const rows = await db
    .select({
      id: questions.id,
      title: questions.title,
      body: questions.body,
      createdAt: questions.createdAt,
      isSample: questions.isSample,
      authorId: accounts.id,
      authorName: profiles.displayName,
      authorSample: accounts.isSample,
    })
    .from(questions)
    .innerJoin(accounts, eq(accounts.id, questions.authorId))
    .innerJoin(profiles, eq(profiles.accountId, questions.authorId))
    .where(eq(questions.communityId, communityId))
    .orderBy(desc(questions.createdAt));
  const ids = rows.map((row) => row.id);
  const allAnswers =
    ids.length === 0
      ? []
      : await db
          .select({
            id: answers.id,
            questionId: answers.questionId,
            body: answers.body,
            helpful: answers.helpful,
            createdAt: answers.createdAt,
            authorId: accounts.id,
            authorName: profiles.displayName,
            authorSample: accounts.isSample,
          })
          .from(answers)
          .innerJoin(accounts, eq(accounts.id, answers.authorId))
          .innerJoin(profiles, eq(profiles.accountId, answers.authorId))
          .where(inArray(answers.questionId, ids))
          .orderBy(asc(answers.createdAt));
  const grouped = new Map<string, typeof allAnswers>();
  for (const answer of allAnswers) {
    const list = grouped.get(answer.questionId) ?? [];
    list.push(answer);
    grouped.set(answer.questionId, list);
  }
  return {
    community: { school: profile.school, major: profile.major },
    questions: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: iso(row.createdAt),
      isSample: row.isSample,
      author: {
        id: row.authorId,
        displayName: row.authorName,
        isSample: row.authorSample,
      },
      answers: (grouped.get(row.id) ?? []).map(presentAnswer),
    })),
  };
}

function presentAnswer(row: {
  id: string;
  body: string;
  helpful: boolean | null;
  createdAt: Date | string;
  authorId: string;
  authorName: string;
  authorSample: boolean;
}) {
  return {
    id: row.id,
    body: row.body,
    helpful: row.helpful,
    createdAt: iso(row.createdAt),
    author: {
      id: row.authorId,
      displayName: row.authorName,
      isSample: row.authorSample,
    } satisfies Author,
  };
}

export async function askQuestion(
  db: AppDatabase,
  viewer: Viewer,
  profile: PrivateProfile,
  input: { title: string; body: string },
) {
  const communityId = await ensureCommunity(db, profile.school, profile.major);
  const [row] = await db
    .insert(questions)
    .values({
      id: randomUUID(),
      communityId,
      authorId: viewer.id,
      title: input.title,
      body: input.body,
      isSample: viewer.isSample,
      createdAt: new Date(),
    })
    .returning();
  if (!row) throw new HttpError(500, "server_error", "问题没有保存。");
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: iso(row.createdAt),
    isSample: row.isSample,
  };
}

export async function answerQuestion(
  db: AppDatabase,
  viewer: Viewer,
  profile: PrivateProfile,
  questionId: string,
  body: string,
) {
  const communityId = await ensureCommunity(db, profile.school, profile.major);
  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, questionId));
  if (!question || question.communityId !== communityId) {
    throw new HttpError(404, "not_found", "没有找到这个问题。");
  }
  const [row] = await db
    .insert(answers)
    .values({
      id: randomUUID(),
      questionId,
      authorId: viewer.id,
      body,
      createdAt: new Date(),
    })
    .returning();
  if (!row) throw new HttpError(500, "server_error", "回答没有保存。");
  if (question.authorId !== viewer.id) {
    await notify(
      db,
      question.authorId,
      "answer_received",
      "你的问题有了新回答。",
    );
  }
  return { id: row.id, body: row.body, createdAt: iso(row.createdAt) };
}

export async function markHelpful(
  db: AppDatabase,
  viewer: Viewer,
  profile: PrivateProfile,
  answerId: string,
  helpful: boolean,
) {
  const communityId = await ensureCommunity(db, profile.school, profile.major);
  const [row] = await db
    .select({ answer: answers, question: questions })
    .from(answers)
    .innerJoin(questions, eq(questions.id, answers.questionId))
    .where(eq(answers.id, answerId));
  if (!row || row.question.communityId !== communityId)
    throw new HttpError(404, "not_found", "没有找到这条回答。");
  if (row.question.authorId !== viewer.id)
    throw new HttpError(403, "forbidden", "只有提问的人可以标记有帮助。");
  await db.update(answers).set({ helpful }).where(eq(answers.id, answerId));
  return { id: answerId, helpful };
}
