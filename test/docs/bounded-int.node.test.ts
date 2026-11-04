/**
 * docs/core/bounded-int.md documents every public member of `BoundedInt` (#41) in its
 * table. The members are read from the class, so a member added without its
 * documentation fails here.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../../src/core/index.js";
import { read } from "./markdown.js";

const page = read("docs/core/bounded-int.md");

/** The text of the section `## <title>`, up to the next `## ` heading. */
function section(title: string): string {
  const start = page.indexOf(`\n## ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The public members of the class: static, prototype, and well-known symbols. */
function members(): string[] {
  const statics = Object.getOwnPropertyNames(BoundedInt).filter(
    (name) => !["length", "name", "prototype"].includes(name),
  );
  const instance = Object.getOwnPropertyNames(BoundedInt.prototype).filter(
    (name) => name !== "constructor",
  );
  const symbols = Object.getOwnPropertySymbols(BoundedInt.prototype).map(
    (symbol) => `[${symbol.description ?? ""}]`,
  );
  return [...statics.map((name) => `static ${name}`), ...instance, ...symbols];
}

describe("docs/core/bounded-int.md, section BoundedInt", () => {
  test("the class has its public members: from, value, valueOf, toString, toPrimitive", () => {
    expect(members().sort()).toEqual(
      ["static from", "value", "valueOf", "toString", "[Symbol.toPrimitive]"].sort(),
    );
  });

  test.each(members())("names `%s` in the table of the class", (member) => {
    // A member is named in backquotes, as `name(…)` or as `name` for a property.
    const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(section("BoundedInt")).toMatch(new RegExp("`" + escaped + "[`(]"));
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the page names every public member of BoundedInt (#41)   |
