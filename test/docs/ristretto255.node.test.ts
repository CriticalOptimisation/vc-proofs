/**
 * docs/core/ristretto255.md documents every public member of `RistrettoElement` (#35),
 * in the section of its class, and documents scalars as bigints, with no class of their
 * own. The members are read from the class, so a member added without its documentation
 * fails here.
 */
import { describe, expect, test } from "vitest";
import * as entryPoint from "../../src/core/index.js";
import { RistrettoElement } from "../../src/core/index.js";
import { read } from "./markdown.js";

const page = read("docs/core/ristretto255.md");

/** The text of the section `## <title>`, up to the next `## ` heading. */
function section(title: string): string {
  const start = page.indexOf(`\n## ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The public members of a class: its static members and those of its prototype. */
function members(cls: { readonly prototype: unknown }): string[] {
  const statics = Object.getOwnPropertyNames(cls).filter(
    (name) => !["length", "name", "prototype"].includes(name),
  );
  const instance = Object.getOwnPropertyNames(cls.prototype as object).filter(
    (name) => name !== "constructor",
  );
  return [...statics.map((name) => `static ${name}`), ...instance];
}

// REVIEW PLACEHOLDER (PR #40: scalars are bigints)
// docs/core/ristretto255.md, section %s: the classes RistrettoElement and RistrettoScalar
//   -> docs/core/ristretto255.md, section %s: the class RistrettoElement only; and docs/core/ristretto255.md documents scalars as bigints
// const classes = [
//   ["RistrettoElement", RistrettoElement],
//   ["RistrettoScalar", RistrettoScalar],
// ] as const;
const classes = [["RistrettoElement", RistrettoElement]] as const;

describe.each(classes)("docs/core/ristretto255.md, section %s", (title, cls) => {
  test("the class has public members", () => {
    expect(members(cls).length).toBeGreaterThan(5);
  });

  test.each(members(cls))("names `%s` in the table of its class", (member) => {
    // A member is named in backquotes, as `name(…)` or as `name` for a property.
    const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(section(title)).toMatch(new RegExp("`" + escaped + "[`(]"));
  });
});

describe("docs/core/ristretto255.md documents scalars as bigints", () => {
  test("it has a section Scalars, and none for RistrettoScalar", () => {
    expect(section("Scalars")).toMatch(/`bigint`/);
    expect(page).not.toMatch(/\n## RistrettoScalar\n/);
  });

  test("the entry point exports no RistrettoScalar, and RistrettoElement no Scalar", () => {
    expect(Object.keys(entryPoint)).not.toContain("RistrettoScalar");
    expect(members(RistrettoElement)).not.toContain("static Scalar");
    expect(members(RistrettoElement)).toContain("static randomScalar");
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #38    | new: the page names every public member (#35)                 |
// | #40    | scalars are bigints: no section RistrettoScalar (#39)         |
