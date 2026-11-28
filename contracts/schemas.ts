import { z } from "zod";

export const CONSENT_VERSION = "m1-2026-11-28";
export const STAGES = ["行前准备", "在读", "校友"] as const;

const email = z.string().trim().toLowerCase().email().max(120);
const password = z
  .string()
  .min(8, "密码至少 8 位")
  .max(72, "密码不要超过 72 位");

export const registerSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, "邀请码只使用字母、数字和短横线"),
  email,
  password,
  displayName: z.string().trim().min(1, "请填写怎么称呼你").max(24),
  ageConfirmed: z.literal(true, { error: "请确认已满 18 周岁" }),
  privacyConsent: z.literal(true, { error: "请先阅读并同意隐私说明" }),
  testConsent: z.literal(true, { error: "请同意参加这次封闭测试" }),
});

export const loginSchema = z.object({
  email,
  password,
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "请填写怎么称呼你").max(24),
  school: z.string().trim().min(1, "请填写学校").max(80),
  major: z.string().trim().min(1, "请填写专业").max(80),
  stage: z.enum(STAGES),
  publicBio: z.string().trim().max(280).default(""),
  privateNote: z.string().trim().max(280).default(""),
  willingToHelp: z.boolean(),
});

export const questionSchema = z.object({
  title: z.string().trim().min(1, "请填写问题标题").max(80),
  body: z.string().trim().min(1, "请写下想问的内容").max(2000),
});

export const answerSchema = z.object({
  body: z.string().trim().min(1, "请写下回答").max(2000),
});

export const helpfulSchema = z.object({
  helpful: z.boolean(),
});

export const invitationSchema = z.object({
  toAccountId: z.string().uuid(),
  note: z.string().trim().min(1, "请写一句来意").max(200),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "请填写消息").max(2000),
});

export const hintsSchema = z.object({
  text: z.string().trim().min(1, "请先写一句话").max(500),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
