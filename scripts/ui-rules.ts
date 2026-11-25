const dimensions = /(-?(?:\d+(?:\.\d*)?|\.\d+))(px|rem|em|pt|%|vw|vh)/gi;
export function typographyIssues(source: string): string[] {
  const issues: string[] = [];
  if (/(?:^|[^\w-])text-(?:xs|\[(?:\d*\.)?\d+(?:px|rem|em)\])/.test(source)) {
    for (const token of source.match(/\btext-(?:xs|\[[^\]]+\])/g) ?? []) {
      if (token === "text-xs" || !sizePasses(token.slice(6, -1)))
        issues.push(token);
    }
  }
  for (const match of source.matchAll(
    /(?:\bfont-size\s*(?::|=)|\bfontSize\s*:)\s*["'{ ]*([^;}"'<>\n]+)/gi,
  )) {
    if (!sizePasses(match[1].trim())) issues.push(match[0]);
  }
  for (const match of source.matchAll(/\bfont\s*:\s*([^;}]+)/gi)) {
    const size = match[1].match(/(?:\d*\.)?\d+(?:px|rem|em|pt|%)/i);
    if (size && !sizePasses(size[0])) issues.push(match[0]);
  }
  return issues;
}
function sizePasses(raw: string): boolean {
  const s = raw.trim().replace(/\s*!important$/i, "");
  if (s === "inherit") return true;
  const lower = s.startsWith("clamp(") ? s.slice(6).split(",")[0] : s;
  const dim = Array.from(lower.matchAll(dimensions))[0];
  if (!dim || lower.trim() !== dim[0]) return false;
  const n = Number(dim[1]);
  return dim[2] === "px"
    ? n >= 14
    : dim[2] === "pt"
      ? (n * 4) / 3 >= 14
      : dim[2] === "rem"
        ? n * 16 >= 14
        : dim[2] === "em"
          ? n >= 1
          : dim[2] === "%" && n >= 100;
}
