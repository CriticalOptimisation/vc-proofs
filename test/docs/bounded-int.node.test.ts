/**
 * docs/core/bounded-int.md documents every public member of `BoundedInt` (#41) in its
 * table. The members are read from the class, so a member added without its
 * documentation fails here. The page is self-contained (#44): it names nothing that the
 * class does not define.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../../src/core/bounded-int.js";
import { classes, examples } from "../helpers/bounded-int-examples.js";
import { read } from "./markdown.js";

const page = read("docs/core/bounded-int.md");

/** The text of the section `## <title>`, up to the next `## ` heading. */
function section(title: string): string {
  const start = page.indexOf(`\n## ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = page.indexOf("\n## ", start + 1);
  return page.slice(start, end === -1 ? undefined : end);
}

/** The class constants, which have a table of their own (#44). */
const CONSTANTS = ["scale", "min", "max", "order", "error"];

/** The public members of the class: static, prototype, and well-known symbols. */
function members(): string[] {
  const statics = Object.getOwnPropertyNames(BoundedInt).filter(
    (name) => !["length", "name", "prototype", ...CONSTANTS].includes(name),
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
  test("the class has its public members: from, fromValue, define, the three errors, value, valueOf, toString, toLocaleString, toPrimitive", () => {
    expect(members().sort()).toEqual(
      [
        "static from",
        "static fromValue",
        "static define",
        "static errorBound",
        "static quadraticError",
        "static termError",
        "value",
        "valueOf",
        "toString",
        "toLocaleString",
        "[Symbol.toPrimitive]",
      ].sort(),
    );
  });

  test.each(members())("names `%s` in the table of the class", (member) => {
    // A member is named in backquotes, as `name(…)` or as `name` for a property.
    const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(section("BoundedInt")).toMatch(new RegExp("`" + escaped + "[`(]"));
  });
});

describe("docs/core/bounded-int.md, section The class constants", () => {
  const text = () =>
    page.slice(page.indexOf("\n### The class constants\n"), page.indexOf("\n### from\n"));

  test("the table names scale, min, max, order and error, and BoundedInt has the constants it shows", () => {
    for (const name of CONSTANTS) expect(text()).toMatch(new RegExp(`\\| \`${name}\` +\\|`));
    expect(text()).not.toContain("integerOnly");
    expect(text()).toMatch(/\| `scale` .*\| `0` +\|/);
    expect(text()).toMatch(/\| `min` .*\| `0n` +\|/);
    expect(text()).toMatch(/\| `max` .*\| `32767.5` +\|/);
    expect(text()).toMatch(/\| `order` .*\| absent: no limit +\|/);
    expect([BoundedInt.scale, BoundedInt.min, BoundedInt.max]).toEqual([0, 0n, 32767.5]);
    expect(BoundedInt.order).toBeUndefined();
    expect(BoundedInt.error).toBeUndefined();
  });

  test("the subsection The range of a class makes the bounds semi-open, explains the order with a byte, and the table of checks refuses more values than order", () => {
    const start = text().indexOf("\n#### The range of a class\n");
    expect(start).toBeGreaterThan(-1);
    const range = text().slice(start);
    expect(range).toContain("`min ≤ x < max`");
    expect(range).toContain("`x = max` is a `RangeError`");
    expect(range).toContain("`[−0.5, 255.5)`");
    expect(range).toContain("order: 256n");
    expect(range).toContain("The constant `order` is a limit on that number, and it is inherited");
    expect(text()).toMatch(
      /\| `order` not above 0, or more distinct values than `order` +\| `RangeError` \|/,
    );
  });
});

describe("docs/core/bounded-int.md: a self-contained page", () => {
  test.each([
    ["ℓ", /ℓ/],
    ["Z_ℓ", /Z_/],
    ["the group", /\bgroup\b/i],
    ["ristretto255", /ristretto/i],
    ["a commitment", /commit/i],
    ["Pedersen", /pedersen/i],
    ["a salt", /\bsalt/i],
    ["an opening", /\bopening/i],
    ["a linear combination", /linear combination/i],
    ["a scalar", /\bscalar/i],
    ["the generators g and h", /`[gh]`|·g\b|·h\b/],
    ["a stage", /\bstage\b/i],
    ["Math.round", /Math\.round/],
  ] as const)("the page does not mention %s", (_, pattern) => {
    expect(page).not.toMatch(pattern);
  });
});

describe("docs/core/bounded-int.md, section Examples", () => {
  /** The cells of the row of the Examples table whose first cell is the call. */
  function row(call: string): string[] {
    const line = section("Examples")
      .split("\n")
      .find((text) => text.startsWith(`| \`${call}\``));
    expect(line, `a row for ${call}`).toBeDefined();
    return (line ?? "")
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  }

  test.each(examples.map((example) => [example.call, example] as const))(
    "the row of %s shows what the code gives",
    (call, example) => {
      const [, value, valueOf, string] = row(call);
      const c = classes();
      if (example.throws !== undefined) {
        expect(value).toBe(`\`${example.throws.name}\``);
        expect(() => example.run(c)).toThrow(example.throws);
        return;
      }
      expect(value).toBe(`\`${String(example.value)}n\``);
      expect(valueOf).toBe(String(example.number));
      expect(string).toBe(`\`"${example.string ?? ""}"\``);
      const x = example.run(c);
      expect(x.value).toBe(example.value);
      expect(x.valueOf()).toBe(example.number);
      expect(x.toString()).toBe(example.string);
    },
  );

  test("the page has no other row than these, on the five classes of its examples", () => {
    expect(Object.keys(classes())).toHaveLength(5);
    const rows = section("Examples")
      .split("\n")
      .filter((text) => text.startsWith("| `"));
    expect(rows).toHaveLength(examples.length);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the page names every public member of BoundedInt (#41)   |
// | #47    | the new members; the constants and the examples tables; The range of a class; a self-contained page (#44) |
// | #51    | imports the generic BoundedInt of bounded-int.ts; placeholders of #47 removed (#49) |
