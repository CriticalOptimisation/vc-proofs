/**
 * docs/core/bounded-int.md documents every public member of `BoundedInt` (#41) in its
 * table. The members are read from the class, so a member added without its
 * documentation fails here. The page is self-contained (#44): it names nothing that the
 * class does not define.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../../src/core/index.js";
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

  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // the table names scale, min, max, integerOnly, order and error, and BoundedInt has the constants it shows"
  //   -> the table names scale, min, max, order and error, and BoundedInt has the constants it shows
  // test("the table names scale, min, max, integerOnly, order and error, and BoundedInt has the constants it shows", () => {
  //   for (const name of CONSTANTS) expect(text()).toMatch(new RegExp(`\\| \`${name}\` +\\|`));
  //   expect(text()).toMatch(/\| `scale` .*\| `0` +\|/);
  //   expect(text()).toMatch(/\| `min` .*\| `0n` +\|/);
  //   expect(text()).toMatch(/\| `integerOnly` .*\| `true` +\|/);
  //   expect(text()).toMatch(/\| `order` .*\| absent: no limit +\|/);
  //   expect([BoundedInt.scale, BoundedInt.min, BoundedInt.integerOnly]).toEqual([0, 0n, true]);
  //   expect(BoundedInt.order).toBeUndefined();
  //   expect(BoundedInt.error).toBeUndefined();
  // });
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

// REVIEW PLACEHOLDER (#44, review of PR #47: the bounds [min, max), kept exactly;
// no defineRaw, end or per-value errors; every quantity an exact decimal)
// the class has its public members: from, fromValue, define, defineRaw, value, valueOf, toString, toLocaleString, toPrimitive
//   -> the class has its public members: from, fromValue, define, the three errors, value, valueOf, toString, toLocaleString, toPrimitive
// names `%s` in the table of the class -> (unchanged)
// the table names scale, min, end and integerOnly, and BoundedInt has the constants it shows, its range [0n, ℓ) included
//   -> the table names scale, min, max, integerOnly, order and error, and BoundedInt has the constants it shows
// the subsection The range of a class gives [0, ℓ) to BoundedInt and an optional order to every class…
//   -> the subsection The range of a class makes the bounds semi-open, explains the order with a byte, and the
//      table of checks refuses more values than order; the page does not mention %s
// the row of %s shows what the code gives; the page has no other row… -> (the same, without the errors column)
//
// describe("docs/core/bounded-int.md, section BoundedInt", () => {
//   test("the class has its public members: from, fromValue, define, defineRaw, value, valueOf, toString, toLocaleString, toPrimitive", () => {
//     expect(members().sort()).toEqual(
//       [
//         "static from",
//         "static fromValue",
//         "static define",
//         "static defineRaw",
//         "value",
//         "valueOf",
//         "toString",
//         "toLocaleString",
//         "[Symbol.toPrimitive]",
//       ].sort(),
//     );
//   });
//
//   test.each(members())("names `%s` in the table of the class", (member) => {
//     const escaped = member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//     expect(section("BoundedInt")).toMatch(new RegExp("`" + escaped + "[`(]"));
//   });
// });
//
// describe("docs/core/bounded-int.md, section The class constants", () => {
//   test("the table names scale, min, end and integerOnly, and BoundedInt has the constants it shows, its range [0n, ℓ) included", () => {
//     const table = page.slice(
//       page.indexOf("\n### The class constants\n"),
//       page.indexOf("\n### from\n"),
//     );
//     for (const name of CONSTANTS) expect(table).toMatch(new RegExp(`\\| \`${name}\` +\\|`));
//     expect(table).toMatch(/\| `scale` .*\| `0` +\|/);
//     expect(table).toMatch(/\| `min` .*\| `0n` +\|/);
//     expect(table).toMatch(/\| `end` .*\| `ℓ` +\|/);
//     expect(table).toMatch(/\| `integerOnly` .*\| `true` +\|/);
//     expect(BoundedInt.scale).toBe(0);
//     expect(BoundedInt.min).toBe(0n);
//     expect(BoundedInt.end).toBe(RistrettoElement.ORDER);
//     expect(BoundedInt.integerOnly).toBe(true);
//   });
//
//   test("the subsection The range of a class gives [0, ℓ) to BoundedInt and an optional order to every class, and the table of checks refuses more than order integers", () => {
//     const text = page.slice(
//       page.indexOf("\n### The class constants\n"),
//       page.indexOf("\n### from\n"),
//     );
//     const start = text.indexOf("\n#### The range of a class\n");
//     expect(start).toBeGreaterThan(-1);
//     const range = text.slice(start);
//     expect(range).toContain("The range of `BoundedInt` is `[0, ℓ)`");
//     expect(range).toContain("`end − min ≤ order`");
//     expect(range).toContain("Without\nan order, `end − min` has no limit.");
//     expect(text).toMatch(/\| `end − min` above `order` +\| `RangeError` +\|/);
//     expect(text).not.toMatch(/±22|10\^15/);
//   });
// });
//
// describe("docs/core/bounded-int.md, section Examples", () => {
//   /** The cells of the row of the Examples table whose first cell is the call. */
//   function row(call: string): string[] {
//     const line = section("Examples")
//       .split("\n")
//       .find((text) => text.startsWith(`| \`${call}\``));
//     expect(line, `a row for ${call}`).toBeDefined();
//     return (line ?? "")
//       .split("|")
//       .slice(1, -1)
//       .map((cell) => cell.trim());
//   }
//
//   /** An error as the page writes it: ½ for 0.5. */
//   const error = (e: number): string => (e === 0.5 ? "½" : String(e));
//
//   test.each(examples.map((example) => [example.call, example] as const))(
//     "the row of %s shows what the code gives",
//     (call, example) => {
//       const [, value, errors, valueOf, string] = row(call);
//       const c = classes();
//       if (example.throws !== undefined) {
//         expect(value).toBe(`\`${example.throws.name}\``);
//         expect(() => example.run(c)).toThrow(example.throws);
//         return;
//       }
//       expect(value).toBe(`\`${String(example.value)}n\``);
//       expect(errors).toBe((example.errors ?? []).map(error).join(", "));
//       expect(valueOf).toBe(String(example.number));
//       expect(string).toBe(`\`"${example.string ?? ""}"\``);
//       const x = example.run(c);
//       expect(x.value).toBe(example.value);
//       expect(x.valueOf()).toBe(example.number);
//       expect(x.toString()).toBe(example.string);
//     },
//   );
//
//   test("the page has no other row than these, on the five classes of its examples", () => {
//     expect(Object.keys(classes())).toHaveLength(5);
//     const rows = section("Examples")
//       .split("\n")
//       .filter((text) => text.startsWith("| `"));
//     expect(rows).toHaveLength(examples.length);
//   });
// });

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the page names every public member of BoundedInt (#41)   |
// | #47    | the new members; the constants and the examples tables; The range of a class; a self-contained page (#44) |
