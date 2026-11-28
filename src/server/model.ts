import { z } from "zod";

export const RULE_MATCH_LABEL =
  "规则筛选：只保留同校同专业。没有调用模型，这不是模型推荐。";
export const RULE_HINT_LABEL =
  "规则整理，不是模型输出。请核对学校、专业和阶段后再保存。";
export const MODEL_HINT_LABEL = "模型整理，请核对后再保存。";
export const DEGRADED_HINT_LABEL =
  "模型没有返回可用结果，已改用规则整理，不是模型输出。";

export type HintFields = {
  school: string | null;
  major: string | null;
  stage: "行前准备" | "在读" | "校友" | null;
};

export type HintResult = {
  source: "rules" | "model";
  label: string;
  fields: HintFields;
};

const modelJson = z.object({
  school: z.string().trim().min(1).max(80).nullable().optional(),
  major: z.string().trim().min(1).max(80).nullable().optional(),
  stage: z.enum(["行前准备", "在读", "校友"]).nullable().optional(),
});

export function modelConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.MODEL_BASE_URL?.trim() &&
      env.MODEL_NAME?.trim() &&
      env.MODEL_API_KEY?.trim(),
  );
}

export function ruleHints(text: string): HintResult {
  return {
    source: "rules",
    label: RULE_HINT_LABEL,
    fields: {
      school: labeled(text, "学校"),
      major: labeled(text, "专业"),
      stage: stageFrom(text),
    },
  };
}

export async function profileHints(
  text: string,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<HintResult> {
  const env = options.env ?? process.env;
  const rules = ruleHints(text);
  if (!modelConfigured(env)) return rules;
  try {
    const content = await callModel(env, text, options.fetchImpl ?? fetch);
    const parsed = parseModel(content);
    if (!parsed) return { ...rules, label: DEGRADED_HINT_LABEL };
    return { source: "model", label: MODEL_HINT_LABEL, fields: parsed };
  } catch {
    return { ...rules, label: DEGRADED_HINT_LABEL };
  }
}

function labeled(text: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\n)\\s*${name}\\s*[:：]\\s*(.+)$`, "m").exec(
    text,
  );
  const value = match?.[1]?.trim() ?? "";
  return value ? value.slice(0, 80) : null;
}

function stageFrom(text: string): HintFields["stage"] {
  if (text.includes("校友") || text.includes("毕业")) return "校友";
  if (text.includes("在读")) return "在读";
  if (text.includes("行前") || text.includes("准备") || text.includes("新生"))
    return "行前准备";
  return null;
}

async function callModel(
  env: NodeJS.ProcessEnv,
  text: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const base = env.MODEL_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.MODEL_API_KEY?.trim() ?? ""}`,
    },
    body: JSON.stringify({
      model: env.MODEL_NAME?.trim(),
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract school, major and stage from the student's own words. stage must be 行前准备, 在读, 校友, or null. Do not invent a school or major. Return JSON only.",
        },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("model_http");
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("model_empty");
  return content;
}

function parseModel(content: string): HintFields | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = modelJson.safeParse(value);
  if (!parsed.success) return null;
  return {
    school: parsed.data.school ?? null,
    major: parsed.data.major ?? null,
    stage: parsed.data.stage ?? null,
  };
}
