// Split a Postgres script on semicolons without breaking function bodies.
export function splitSql(source: string): string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  let dollar: string | null = null;
  let quote = false;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (dollar) {
      if (source.startsWith(dollar, index)) {
        current += dollar;
        index += dollar.length;
        dollar = null;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }
    if (quote) {
      current += char;
      if (char === "'" && source[index + 1] === "'") {
        current += "'";
        index += 2;
        continue;
      }
      if (char === "'") quote = false;
      index += 1;
      continue;
    }
    if (char === "-" && source[index + 1] === "-") {
      const next = source.indexOf("\n", index);
      index = next === -1 ? source.length : next + 1;
      continue;
    }
    if (char === "'") {
      quote = true;
      current += char;
      index += 1;
      continue;
    }
    if (char === "$") {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(source.slice(index));
      if (match?.[0]) {
        dollar = match[0];
        current += dollar;
        index += dollar.length;
        continue;
      }
    }
    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}
