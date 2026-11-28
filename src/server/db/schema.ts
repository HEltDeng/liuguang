import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Query shape for the Postgres migration in ./migrations.
// Triggers and check constraints live in SQL so a missed application check
// still cannot reopen a decided invitation or insert an early message.

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

export const inviteCodes = pgTable("invite_codes", {
  id: uuid("id").primaryKey(),
  code: text("code").notNull().unique(),
  batch: text("batch").notNull(),
  maxUses: integer("max_uses").notNull(),
  usedCount: integer("used_count").notNull().default(0),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: createdAt(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  inviteCodeId: uuid("invite_code_id")
    .notNull()
    .references(() => inviteCodes.id),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  createdAt: createdAt(),
});

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  version: text("version").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true, mode: "date" }),
});

export const profiles = pgTable("profiles", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  school: text("school").notNull(),
  major: text("major").notNull(),
  stage: text("stage").notNull(),
  publicBio: text("public_bio").notNull().default(""),
  privateNote: text("private_note").notNull().default(""),
  willingToHelp: boolean("willing_to_help").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey(),
    school: text("school").notNull(),
    major: text("major").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("communities_school_major_unique").on(
      table.school,
      table.major,
    ),
  ],
);

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => accounts.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: createdAt(),
});

export const answers = pgTable("answers", {
  id: uuid("id").primaryKey(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => accounts.id),
  body: text("body").notNull(),
  helpful: boolean("helpful"),
  createdAt: createdAt(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey(),
  fromAccountId: uuid("from_account_id")
    .notNull()
    .references(() => accounts.id),
  toAccountId: uuid("to_account_id")
    .notNull()
    .references(() => accounts.id),
  note: text("note").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey(),
  invitationId: uuid("invitation_id")
    .notNull()
    .references(() => invitations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => accounts.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
});
