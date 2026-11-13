/**
 * docs/core/bounded-int.md documents every public member of `BoundedInt` (#41) in its
 * table. The members are read from the class, so a member added without its
 * documentation fails here. The page is self-contained (#44): it names nothing that the
 * class does not define.
 */
import { describe, expect, test } from "vitest";
import * as module from "../../src/core/bounded-int.js";
import { BoundedInt, type Decimal } from "../../src/core/bounded-int.js";
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
const CONSTANTS = ["scale", "min", "max", "error"];

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
  test("the class has its public members: from, fromValue, define, low, high, the three errors, value, valueOf, toString, toLocaleString, toPrimitive", () => {
    expect(members().sort()).toEqual(
      [
        "static from",
        "static fromValue",
        "static define",
        "static low",
        "static high",
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

  test("the table names scale, min, max and error, not order, and BoundedInt has the constants it shows", () => {
    for (const name of CONSTANTS) expect(text()).toMatch(new RegExp(`\\| \`${name}\` +\\|`));
    expect(text()).not.toContain("integerOnly");
    expect(text()).not.toMatch(/\| `order` /);
    expect(text()).toMatch(/\| `scale` .*\| `0` +\|/);
    expect(text()).toMatch(/\| `min` .*\| `0n` +\|/);
    expect(text()).toMatch(/\| `max` .*\| `32767.5` +\|/);
    expect([BoundedInt.scale, BoundedInt.min, BoundedInt.max]).toEqual([0, 0n, 32767.5]);
    expect("order" in BoundedInt).toBe(false);
    expect(BoundedInt.error).toBeUndefined();
  });

  test("the subsection The range of a class makes the bounds semi-open, gives low and high, counts the values of a byte, and refuses more values than the parent", () => {
    const start = text().indexOf("\n#### The range of a class\n");
    expect(start).toBeGreaterThan(-1);
    const range = text().slice(start);
    expect(range).toContain("`min ≤ x < max`");
    expect(range).toContain("`x = max` is a `RangeError`");
    expect(range).toContain("`[−0.5, 255.5)`");
    expect(range).toMatch(/The static getters `low` and\s+`high` give them/);
    expect(range).toMatch(/`0n` and `32767n` on `BoundedInt`, `0n` and `1000n` on\s+`Mass`/);
    expect([BoundedInt.low, BoundedInt.high]).toEqual([0n, 32767n]);
    expect([classes().Mass.low, classes().Mass.high]).toEqual([0n, 1000n]);
    expect(range).toMatch(/A class holds `high − low \+ 1` distinct values/);
    expect(range).toMatch(/A class holds no more values than its parent, the class it extends/);
    expect(range).toMatch(/A class whose\s+parent is `BoundedInt` is the exception/);
    expect(range).not.toContain("order");
    expect(text()).toMatch(
      /\| more values than its parent, unless its parent is `BoundedInt` +\| `RangeError` \|/,
    );
  });

  test("the example of The range of a class gives what it says", () => {
    const range = text().slice(text().indexOf("\n#### The range of a class\n"));
    const code = range.slice(
      range.indexOf("```ts"),
      range.indexOf("```", range.indexOf("```ts") + 5),
    );
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    expect(code).toContain(
      'const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 }); // 0 to 255: 256 values',
    );
    expect([Byte.low, Byte.high]).toEqual([0n, 255n]);
    const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 });
    expect(code).toContain("// 0 to 100: 101 values");
    expect([Percent.low, Percent.high]).toEqual([0n, 100n]);
    const Code = Byte.define({ name: "Code", min: 999.5, max: 1255.5 });
    expect(code).toContain("// 1000 to 1255: 256 values");
    expect([Code.low, Code.high]).toEqual([1000n, 1255n]);
    const Cents = Byte.define({ name: "Cents", min: 0, max: 2.555, step: 0.01 });
    expect(code).toContain("// 0 to 255, k = 2: 256 values");
    expect([Cents.scale, Cents.low, Cents.high]).toEqual([2, 0n, 255n]);
    expect(code).toContain("// RangeError: 65536 values, more than Byte");
    expect(() => Byte.define({ name: "Word", min: -0.5, max: 65535.5 })).toThrow(RangeError);
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

describe("docs/core/bounded-int.md, section define", () => {
  test("define takes no order, ignores any other key, and refuses more values than the parent", () => {
    const text = page.slice(page.indexOf("\n### define\n"), page.indexOf("\n## Rounding\n"));
    expect(text).toContain("`BoundedInt.define({ name, min, max, step?, error? })`");
    expect(text).toMatch(/typed as that class/);
    expect(text).toContain("Any other key of `spec` is ignored.");
    expect(text).not.toContain("order");
    expect(text).toMatch(
      /\| more values than its parent, unless its parent is `BoundedInt` +\| `RangeError` \|/,
    );
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

/** The exports of `bounded-int.ts`, by name, read so that this file compiles before they exist. */
const exported = module as unknown as Record<string, unknown>;

/** The text of the subsection `### <title>`, up to the next `### ` or `## ` heading. */
function subsection(title: string): string {
  const start = page.indexOf(`\n### ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const next = [page.indexOf("\n### ", start + 1), page.indexOf("\n## ", start + 1)].filter(
    (i) => i !== -1,
  );
  return page.slice(start, Math.min(...next));
}

describe("docs/core/bounded-int.md, section The errors of a class", () => {
  const text = () => subsection("The errors of a class");

  test("it gives the three errors, the three forms of error, {} that disables them, and the rules", () => {
    for (const name of ["bound", "quadratic", "term"]) expect(text()).toContain(`**\`${name}\`**`);
    expect(text()).toContain("\n#### Given to define\n");
    expect(text()).toMatch(/\*\*left out\*\*: each of the three is half a step of the class/);
    expect(text()).toMatch(/\*\*a quantity\*\*, 0 or more: the three are equal to it/);
    expect(text()).toMatch(/\*\*an object\*\* `\{ bound\?, quadratic\?, term\? \}`/);
    expect(text()).toMatch(/`\{\}` leaves the three `undefined`: the class has no error/);
    expect(text()).toContain("\n#### The rules\n");
    expect(text()).toContain("- `0 ≤ term ≤ quadratic ≤ bound`, between any two that are defined.");
    expect(text()).toMatch(/If two are equal, the third is equal to them/);
    expect(text()).toMatch(/an `undefined` error stays `undefined`/);
    expect(text()).toMatch(/A class never takes the errors of its parent/);
    expect(text()).toMatch(/Each is `undefined` where its error is\./);
  });

  test("its table gives what define gives, for a class of scale 1", () => {
    const errors = exported.errors as
      ((C: typeof BoundedInt) => Record<string, unknown>) | undefined;
    expect(typeof errors).toBe("function");
    const rows = text()
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("| left out") || line.startsWith("| `{") || line.startsWith("| `0"),
      )
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim().replace(/^`|`$/g, "")),
      );
    expect(rows).toHaveLength(13);
    /** A cell as the number it shows, or `undefined`. */
    const shown = (d: unknown) =>
      d === undefined
        ? "undefined"
        : String(Number(`${String((d as Decimal)[0])}e${String((d as Decimal)[1])}`));
    for (const [error, bound, quadratic, term] of rows) {
      const spec: Record<string, unknown> = { name: "E", min: 0, max: 100.05, step: 0.1 };
      if (error !== "left out") {
        spec.error = JSON.parse((error ?? "").replace(/(\w+):/g, '"$1":')) as unknown;
      }
      if (bound === "RangeError") {
        expect(() => BoundedInt.define(spec as never), error).toThrow(RangeError);
        continue;
      }
      const got = errors?.(BoundedInt.define(spec as never));
      const expected = [bound, quadratic, term].map((cell) =>
        cell === "[5n, −1 − k]" ? "0.05" : cell,
      );
      expect([shown(got?.bound), shown(got?.quadratic), shown(got?.term)], error).toEqual(expected);
    }
  });

  test("the class constants say that error holds the three errors, never inherited", () => {
    const constants = page.slice(
      page.indexOf("\n### The class constants\n"),
      page.indexOf("\n#### The range of a class\n"),
    );
    expect(constants).toMatch(
      /\| `error` +\| the three errors of the values, `\{ bound, quadratic, term \}`/,
    );
    expect(constants).toMatch(/inherits those of its base, except `error`/);
    expect(constants).toMatch(/`−308`, `COARSEST_SCALE`, to\s+`323`, `FINEST_SCALE`/);
  });

  test("the display rounds at the first defined of term, quadratic and bound, else shows every digit", () => {
    const display = subsection("valueOf, toString and toLocaleString");
    expect(display).toMatch(/the first defined of `term`, `quadratic` and\s+`bound`, in steps/);
    expect(display).toMatch(
      /When the three errors are `undefined`, `j` is 0:\s+every digit is shown/,
    );
  });
});

describe("docs/core/bounded-int.md, section define: the direct scale and the errors", () => {
  test("the scale is k = 1 − digits(n) − e, refused outside −308 … 323, never brought back; error takes three forms", () => {
    const text = subsection("define");
    expect(text).toContain("so `k = 1 − digits(n) − e`");
    expect(text).toMatch(/`\[9461n, 12\]`, gives\s+`k = −15`/);
    expect(text).toMatch(/It is never brought\s+back to the nearest limit/);
    expect(text).toMatch(/a cost to watch where `define` runs often/);
    expect(text).toMatch(
      /\| a `step` below `10\^-323`, or of `10\^309` or more +\| `RangeError` \|/,
    );
    expect(text).toMatch(
      /\| `error` neither a quantity nor an object of quantities +\| `TypeError` +\|/,
    );
    expect(text).toMatch(
      /\| an error below 0, or errors that break \[the rules\]\(#the-rules\) +\| `RangeError` \|/,
    );
  });
});

describe("docs/core/bounded-int.md, section For the other modules of the library", () => {
  // REVIEW PLACEHOLDER (#58: the page names MANTISSA and EXPONENT in one cell, `MANTISSA`, `EXPONENT`)
  //   expect(text).toMatch(new RegExp("\\| `" + name + "[`(]"));
  test("it names each export of bounded-int.ts for the other modules, and each exists", () => {
    const text = section("For the other modules of the library");
    for (const name of ["decimal", "MANTISSA", "EXPONENT", "errors"]) {
      // In the first cell of a row, alone or after the other names of the cell.
      expect(text).toMatch(new RegExp("\\| (?:`\\w+`, )*`" + name + "[`(]"));
      expect(name in exported, name).toBe(true);
    }
    for (const type of ["Quantity", "Decimal", "ErrorSpec", "Errors"]) {
      expect(text).toContain(`| type \`${type}\``);
    }
    expect(text).toMatch(/exports only the types\s+`Quantity` and `Decimal`/);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the page names every public member of BoundedInt (#41)   |
// | #47    | the new members; the constants and the examples tables; The range of a class; a self-contained page (#44) |
// | #51    | imports the generic BoundedInt of bounded-int.ts; placeholders of #47 removed (#49) |
// | #53    | low and high; no order; The integers and The number of values; define without order (#52) |
