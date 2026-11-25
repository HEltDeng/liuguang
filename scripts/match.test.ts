import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const context = vm.createContext({});
for (const file of ["data", "match"])
  vm.runInContext(
    readFileSync("代码/liuguang/" + file + ".js", "utf8"),
    context,
  );
const predict = (s: string) =>
  vm.runInContext("predict(" + JSON.stringify(s) + ")?.id ?? null", context) as
    | string
    | null;
test("synthetic baseline connects a study-space question to its topic", () =>
  assert.equal(predict("我在找图书馆的借阅入口"), "study"));
test("baseline declines out-of-scope policy questions and unrelated requests", () => {
  for (const q of ["办理签证需要什么", "火星基地施工手册", ""])
    assert.equal(predict(q), null);
});
