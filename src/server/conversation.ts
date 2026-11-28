import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PrivateProfile, PublicProfile, Viewer } from "./accounts.ts";
import { visibleProfile } from "./accounts.ts";
import type { AppDatabase } from "./db/client.ts";
import { invitations, messages, notifications } from "./db/schema.ts";
import { HttpError, iso } from "./http.ts";
import { notify } from "./notifications.ts";

type Peer = Pick<
  PublicProfile,
  "id" | "displayName" | "school" | "major" | "isSample"
>;

export async function createInvitation(
  db: AppDatabase,
  viewer: Viewer,
  profile: PrivateProfile,
  input: { toAccountId: string; note: string },
) {
  if (input.toAccountId === viewer.id)
    throw new HttpError(400, "cannot_invite_self", "不能邀请自己。");
  const peer = await visibleProfile(db, input.toAccountId);
  if (!peer) throw new HttpError(404, "not_found", "没有找到这位同学。");
  if (peer.school !== profile.school || peer.major !== profile.major) {
    throw new HttpError(
      403,
      "different_community",
      "只能邀请同校同专业的同学。",
    );
  }
  const pending = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.fromAccountId, viewer.id),
        eq(invitations.toAccountId, peer.id),
        eq(invitations.status, "pending"),
      ),
    );
  if (pending.length > 0)
    throw new HttpError(
      409,
      "invitation_already_pending",
      "你已经发过一条还在等待的邀请。",
    );
  const now = new Date();
  const [row] = await db
    .insert(invitations)
    .values({
      id: randomUUID(),
      fromAccountId: viewer.id,
      toAccountId: peer.id,
      note: input.note,
      status: "pending",
      createdAt: now,
    })
    .returning();
  if (!row) throw new HttpError(500, "server_error", "邀请没有保存。");
  await notify(
    db,
    peer.id,
    "invitation_received",
    "有同学向你发送了交流邀请。",
  );
  return presentInvitation(row, "outgoing", peer);
}

export async function listInvitations(db: AppDatabase, viewer: Viewer) {
  const rows = await db
    .select()
    .from(invitations)
    .where(
      or(
        eq(invitations.fromAccountId, viewer.id),
        eq(invitations.toAccountId, viewer.id),
      ),
    )
    .orderBy(desc(invitations.createdAt));
  const presented = [];
  for (const row of rows) {
    const peerId =
      row.fromAccountId === viewer.id ? row.toAccountId : row.fromAccountId;
    const peer = await visibleProfile(db, peerId);
    if (!peer) continue;
    presented.push(
      presentInvitation(
        row,
        row.fromAccountId === viewer.id ? "outgoing" : "incoming",
        peer,
      ),
    );
  }
  return { invitations: presented };
}

export async function decideInvitation(
  db: AppDatabase,
  viewer: Viewer,
  invitationId: string,
  status: "accepted" | "rejected",
) {
  const [current] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId));
  if (!current) throw new HttpError(404, "not_found", "没有找到这条邀请。");
  if (current.toAccountId !== viewer.id)
    throw new HttpError(403, "forbidden", "只有收到邀请的人可以回复。");
  if (current.status === "rejected") {
    throw new HttpError(
      409,
      "invitation_rejected",
      status === "accepted"
        ? "这条邀请已经拒绝，不能再接受。"
        : "这条邀请已经拒绝。",
    );
  }
  if (current.status === "accepted") {
    throw new HttpError(
      409,
      "invitation_already_accepted",
      "这条邀请已经接受过了。",
    );
  }
  const decidedAt = new Date();
  const updated = await db
    .update(invitations)
    .set({ status, decidedAt })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.status, "pending"),
        eq(invitations.toAccountId, viewer.id),
      ),
    )
    .returning();
  const row = updated[0];
  if (!row) {
    const [again] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId));
    if (again?.status === "rejected") {
      throw new HttpError(
        409,
        "invitation_rejected",
        "这条邀请已经拒绝，不能再接受。",
      );
    }
    throw new HttpError(
      409,
      "invitation_already_accepted",
      "这条邀请已经接受过了。",
    );
  }
  await notify(
    db,
    row.fromAccountId,
    status === "accepted" ? "invitation_accepted" : "invitation_rejected",
    status === "accepted"
      ? "对方接受了交流邀请，现在可以发消息。"
      : "对方拒绝了这次交流邀请。",
  );
  const peer = await visibleProfile(db, row.fromAccountId);
  return presentInvitation(row, "incoming", peer);
}

export async function listMessages(
  db: AppDatabase,
  viewer: Viewer,
  invitationId: string,
) {
  const invitation = await loadParticipantInvitation(db, viewer, invitationId);
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.invitationId, invitationId))
    .orderBy(asc(messages.createdAt));
  return {
    invitation: invitation.view,
    canPost: invitation.row.status === "accepted",
    messages: rows.map((row) => ({
      id: row.id,
      senderId: row.senderId,
      body: row.body,
      createdAt: iso(row.createdAt),
      mine: row.senderId === viewer.id,
    })),
  };
}

export async function sendMessage(
  db: AppDatabase,
  viewer: Viewer,
  invitationId: string,
  body: string,
) {
  const invitation = await loadParticipantInvitation(db, viewer, invitationId);
  if (invitation.row.status !== "accepted") {
    throw new HttpError(
      403,
      "messages_require_acceptance",
      "接受邀请之后才能发消息。",
    );
  }
  const [row] = await db
    .insert(messages)
    .values({
      id: randomUUID(),
      invitationId,
      senderId: viewer.id,
      body,
      createdAt: new Date(),
    })
    .returning();
  if (!row) throw new HttpError(500, "server_error", "消息没有保存。");
  const peerId =
    invitation.row.fromAccountId === viewer.id
      ? invitation.row.toAccountId
      : invitation.row.fromAccountId;
  await notify(db, peerId, "message_received", "你有一条新消息。");
  return {
    id: row.id,
    body: row.body,
    createdAt: iso(row.createdAt),
    mine: true,
  };
}

export async function listNotifications(db: AppDatabase, viewer: Viewer) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.accountId, viewer.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return {
    unread: rows.filter((row) => row.readAt == null).length,
    notifications: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      createdAt: iso(row.createdAt),
      readAt: iso(row.readAt),
    })),
  };
}

export async function markNotificationsRead(
  db: AppDatabase,
  viewer: Viewer,
): Promise<{ unread: number }> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.accountId, viewer.id), isNull(notifications.readAt)),
    );
  return { unread: 0 };
}

async function loadParticipantInvitation(
  db: AppDatabase,
  viewer: Viewer,
  invitationId: string,
) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.id, invitationId));
  if (
    !row ||
    (row.fromAccountId !== viewer.id && row.toAccountId !== viewer.id)
  ) {
    throw new HttpError(404, "not_found", "没有找到这次交流。");
  }
  const peerId =
    row.fromAccountId === viewer.id ? row.toAccountId : row.fromAccountId;
  const peer = await visibleProfile(db, peerId);
  return {
    row,
    view: presentInvitation(
      row,
      row.fromAccountId === viewer.id ? "outgoing" : "incoming",
      peer,
    ),
  };
}

function presentInvitation(
  row: typeof invitations.$inferSelect,
  direction: "incoming" | "outgoing",
  peer: Peer | null,
) {
  return {
    id: row.id,
    status: row.status,
    note: row.note,
    direction,
    createdAt: iso(row.createdAt),
    decidedAt: iso(row.decidedAt),
    peer,
  };
}
