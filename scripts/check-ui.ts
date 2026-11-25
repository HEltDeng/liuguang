import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { typographyIssues } from "./ui-rules.ts";
let fails = 0;
function visit(root: string) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (
      entry.isDirectory() &&
      !["node_modules", ".next", "tests", "dist"].includes(entry.name)
    )
      visit(path);
    if (
      entry.isFile() &&
      /\.(?:[cm]?[jt]sx?|html|css|scss|svg)$/.test(entry.name)
    ) {
      for (const issue of typographyIssues(readFileSync(path, "utf8"))) {
        process.stderr.write(path + ": " + issue + "\n");
        fails++;
      }
    }
  }
}
for (const root of ["代码", "src", "app", "components", "public", "styles"])
  if (existsSync(root)) visit(root);
if (fails) process.exitCode = 1;
