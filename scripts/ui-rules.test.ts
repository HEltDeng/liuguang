import test from "node:test";
import assert from "node:assert/strict";
import { typographyIssues } from "./ui-rules.ts";
test("rejects tiny labels in CSS, utility classes, inline SVG and JS", () => {
  for (const s of [
    "font:700 11px/1.5 sans-serif",
    "font-size:13.9px;",
    'class="sm:text-xs"',
    'class="text-[12px]"',
    'font-size="10"',
    'fontSize: "0.75rem"',
    "font-size:clamp(12px,4vw,20px);",
  ])
    assert.ok(typographyIssues(s).length, s);
});
test("accepts accessible text without confusing spacing with type", () =>
  assert.deepEqual(
    typographyIssues(
      "padding:8px;font-size:14px;font:700 24px/1.5 serif;font-size:clamp(29px,4.5vw,50px);",
    ),
    [],
  ));
