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

/** The text of the subsection `### <title>`, up to the next heading. */
function subsection(title: string): string {
  const start = page.indexOf(`\n### ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = page.slice(start + 1).search(/\n##+ /);
  return page.slice(start, end === -1 ? undefined : start + 1 + end);
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

  test("RistrettoElement has ORDER, encodeScalar, decodeScalar and invertScalar, and the page names them", () => {
    for (const name of ["ORDER", "encodeScalar", "decodeScalar", "invertScalar"]) {
      expect(members(RistrettoElement)).toContain(`static ${name}`);
      expect(section("RistrettoElement")).toMatch(new RegExp("`static " + name + "[`(]"));
    }
  });

  test("randomScalar is named among the scalar operations that need ℓ, as a member of the group of a context too", () => {
    const text = subsection("ORDER, encodeScalar, decodeScalar and invertScalar");
    expect(text).toMatch(/with `randomScalar`/);
    expect(text).toMatch(/need\s+the order `ℓ`/);
    expect(subsection("SUITE_NAME and randomScalar")).toMatch(/needs the order\s+`ℓ`/);
  });

  test("multiplyScalar documents that it multiplies for a scalar that reduces to 0 too", () => {
    const text = subsection("multiplyScalar");
    expect(text).toMatch(/still calls\s+it, with the scalar 1 in place of 0/);
    expect(text).toMatch(/runs for every scalar/);
    expect(text).not.toMatch(/returns the identity before/);
  });

  test("Scalars sends a number of the application through BoundedInt, whose value the group takes", () => {
    expect(members(RistrettoElement)).toContain("static encodeScalar");
    expect(section("Scalars")).toMatch(/\(bounded-int\.md\)/);
    expect(section("Scalars")).toMatch(/`P\.multiplyScalar\(BoundedInt\.from\(5\)\.value\)`/);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #38    | new: the page names every public member (#35)                 |
// | #40    | scalars are bigints: no section RistrettoScalar; ORDER, encodeScalar, decodeScalar, invertScalar; BoundedInt; randomScalar needs ℓ; multiplyScalar of 0 (#39) |
