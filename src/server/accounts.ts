import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  CONSENT_VERSION,
  type ProfileInput,
  type RegisterInput,
} from "../../contracts/schemas.ts";
import {
  accounts,
  consents,
  inviteCodes,
  profiles,
  sessions,
} from "./db/schema.ts";
import type { AppDatabase } from "./db/client.ts";
import { HttpError, instant, isUniqueViolation, unwrapHttp } from "./http.ts";
import {
  hashPassword,
  hashToken,
  newToken,
  readCookie,
  SESSION_SECONDS,
  verifyPassword,
} from "./passwords.ts";

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  isSample: boolean;
};

export type PublicProfile = {
  id: string;
  displayName: string;
  school: string;
  major: string;
  stage: string;
  publicBio: string;
  willingToHelp: boolean;
  isSample: boolean;
};

export type PrivateProfile = PublicProfile & { privateNote: string };

const SAMPLE_CODE = "M1-SAMPLE";

export async function ensureSampleInvite(db: AppDatabase): Promise<void> {
  const existing = await db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(eq(inviteCodes.code, SAMPLE_CODE));
  if (existing.length > 0) return;
  await db.insert(inviteCodes).values({
    id: randomUUID(),
    code: SAMPLE_CODE,
    batch: "m1-local",
    maxUses: 100,
    usedCount: 0,
    isSample: true,
    createdAt: new Date(),
  });
}

export async function registerAccount(
  db: AppDatabase,
  input: RegisterInput,
  production: boolean,
): Promise<{ viewer: Viewer; token: string }> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [code] = await tx
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, input.inviteCode));
      if (!code)
        throw new HttpError(400, "invalid_invite_code", "邀请码不正确。");
      if (production && code.isSample) {
        throw new HttpError(
          403,
          "sample_code_not_allowed",
          "正式环境不能使用合成样本邀请码。",
        );
      }
      const consumed = await tx
        .update(inviteCodes)
        .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
        .where(
          and(
            eq(inviteCodes.id, code.id),
            sql`${inviteCodes.usedCount} < ${inviteCodes.maxUses}`,
          ),
        )
        .returning({ id: inviteCodes.id, isSample: inviteCodes.isSample });
      const invite = consumed[0];
      if (!invite)
        throw new HttpError(400, "invite_exhausted", "这个邀请码已经用完了。");
      const id = randomUUID();
      const now = new Date();
      await tx.insert(accounts).values({
        id,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        inviteCodeId: invite.id,
        isSample: invite.isSample,
        createdAt: now,
      });
      await tx.insert(consents).values(
        (["age_18", "privacy", "test_participation"] as const).map((kind) => ({
          id: randomUUID(),
          accountId: id,
          kind,
          version: CONSENT_VERSION,
          grantedAt: now,
        })),
      );
      const token = newToken();
      await tx.insert(sessions).values({
        id: randomUUID(),
        accountId: id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
        createdAt: now,
      });
      return {
        token,
        viewer: {
          id,
          email: input.email,
          displayName: input.displayName,
          isSample: invite.isSample,
        },
      };
    });
  } catch (error) {
    const http = unwrapHttp(error);
    if (http) throw http;
    if (isUniqueViolation(error))
      throw new HttpError(409, "email_taken", "这个邮箱已经注册过了。");
    throw error;
  }
}

export async function loginAccount(
  db: AppDatabase,
  email: string,
  password: string,
): Promise<{ viewer: Viewer; token: string }> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, email));
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    throw new HttpError(401, "invalid_credentials", "邮箱或密码不正确。");
  }
  const token = newToken();
  const now = new Date();
  await db.insert(sessions).values({
    id: randomUUID(),
    accountId: account.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
    createdAt: now,
  });
  return {
    token,
    viewer: {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      isSample: account.isSample,
    },
  };
}

export async function logoutAccount(
  db: AppDatabase,
  request: Request,
): Promise<void> {
  const token = readCookie(request.headers.get("cookie"));
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function loadViewer(
  db: AppDatabase,
  request: Request,
): Promise<Viewer | null> {
  const token = readCookie(request.headers.get("cookie"));
  if (!token) return null;
  const [row] = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      displayName: accounts.displayName,
      isSample: accounts.isSample,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(eq(sessions.tokenHash, hashToken(token)));
  if (!row || instant(row.expiresAt) <= Date.now()) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    isSample: row.isSample,
  };
}

export async function requireViewer(
  db: AppDatabase,
  request: Request,
): Promise<Viewer> {
  const viewer = await loadViewer(db, request);
  if (!viewer) throw new HttpError(401, "unauthenticated", "请先登录。");
  return viewer;
}

export async function saveProfile(
  db: AppDatabase,
  viewer: Viewer,
  input: ProfileInput,
): Promise<PrivateProfile> {
  const now = new Date();
  await db
    .insert(profiles)
    .values({
      accountId: viewer.id,
      displayName: input.displayName,
      school: input.school,
      major: input.major,
      stage: input.stage,
      publicBio: input.publicBio,
      privateNote: input.privateNote,
      willingToHelp: input.willingToHelp,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.accountId,
      set: {
        displayName: input.displayName,
        school: input.school,
        major: input.major,
        stage: input.stage,
        publicBio: input.publicBio,
        privateNote: input.privateNote,
        willingToHelp: input.willingToHelp,
        updatedAt: now,
      },
    });
  await db
    .update(accounts)
    .set({ displayName: input.displayName })
    .where(eq(accounts.id, viewer.id));
  return {
    id: viewer.id,
    displayName: input.displayName,
    school: input.school,
    major: input.major,
    stage: input.stage,
    publicBio: input.publicBio,
    privateNote: input.privateNote,
    willingToHelp: input.willingToHelp,
    isSample: viewer.isSample,
  };
}

export async function ownProfile(
  db: AppDatabase,
  viewer: Viewer,
): Promise<PrivateProfile | null> {
  const [row] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.accountId, viewer.id));
  if (!row) return null;
  return {
    id: viewer.id,
    displayName: row.displayName,
    school: row.school,
    major: row.major,
    stage: row.stage,
    publicBio: row.publicBio,
    privateNote: row.privateNote,
    willingToHelp: row.willingToHelp,
    isSample: viewer.isSample,
  };
}

export async function visibleProfile(
  db: AppDatabase,
  accountId: string,
): Promise<PublicProfile | null> {
  const [row] = await db
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
    .where(eq(profiles.accountId, accountId));
  return row ?? null;
}

export async function requireOwnProfile(
  db: AppDatabase,
  viewer: Viewer,
): Promise<PrivateProfile> {
  const profile = await ownProfile(db, viewer);
  if (!profile)
    throw new HttpError(409, "profile_required", "请先保存学校和专业。");
  return profile;
}
