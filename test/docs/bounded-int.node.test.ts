/**
 * docs/core/bounded-int.md documents every public member of `BoundedInt` (#41) in its
 * table. The members are read from the class, so a member added without its
 * documentation fails here. The page is self-contained (#44): it names nothing that the
 * class does not define. It has three parts (#62): for users, what
 * `@criticaloptimisation/vc-proofs` exports; for developers, what `./core` exports; and the
 * for maintainers, the rest.
 */
import { describe, expect, test } from "vitest";
import * as module from "../../src/core/bounded-int.js";
import { BoundedInt, type Decimal } from "../../src/core/bounded-int.js";
import { classes, examples } from "../helpers/bounded-int-examples.js";
import { outline, part, read } from "./markdown.js";

const page = read("docs/core/bounded-int.md");

/** The text under the heading `title`, at any level, up to the next heading of its level or above. */
function section(title: string): string {
  const text = part(page, title);
  expect(text, title).toBeDefined();
  return text ?? "";
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

/** The exports of `bounded-int.ts`, by name, read so that this file compiles before they exist. */
const exported = module as unknown as Record<string, unknown>;

/** The errors of a class, as `errors(C)` gives them (#62). */
type Errors = Record<"bound" | "quadraticSquared" | "term", Decimal | undefined>;

/** `errors(C)`, the export of `bounded-int.ts`. */
function errorsOf(C: typeof BoundedInt): Errors {
  const errors = exported.errors;
  expect(typeof errors).toBe("function");
  return (errors as (C: typeof BoundedInt) => Errors)(C);
}

/**
 * The value that a cell of a table writes in TypeScript: an object of keys, numbers and
 * decimals `[24999n, -4]`, or a name exported by `bounded-int.ts`.
 */
function literal(cell: string): unknown {
  if (/^[A-Z_]+$/.test(cell)) return exported[cell];
  const json = cell.replace(/(\w+):/g, '"$1":').replace(/(-?\d+)n\b/g, '"$1n"');
  return JSON.parse(json, (_, value: unknown) =>
    typeof value === "string" && /^-?\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as unknown;
}

/** The cells of the rows of a table in `text` whose first cell matches `first`. */
function rows(text: string, first: RegExp): string[][] {
  return text
    .split("\n")
    .filter((line) => first.test(line))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`|`$/g, "")),
    );
}

describe("docs/core/bounded-int.md: three parts, for users, for developers, and for maintainers", () => {
  test("its parts are For users, For developers and For Maintainers, in that order, each a section of level 2", () => {
    expect(outline(page).filter((line) => line.startsWith("## "))).toEqual([
      "## For users",
      "## For developers",
      "## For Maintainers",
    ]);
  });

  test("For users says that the high-level entry point exports nothing from the page yet", () => {
    expect(section("For users")).toMatch(
      /`@criticaloptimisation\/vc-proofs`, exports nothing from this page\s+yet/,
    );
  });

  test("For developers names what ./core gives: the types Decimal and Quantity, NO_ERROR_PROCESSING, and the class context.boundedInt; it imports no BoundedInt", () => {
    const text = section("For developers");
    for (const name of ["Decimal", "Quantity", "NO_ERROR_PROCESSING", "context.boundedInt"]) {
      expect(text).toContain(`\`${name}\``);
    }
    expect(text).toMatch(/const Int = context\.boundedInt;/);
    expect(page).not.toMatch(/import \{[^}]*\bBoundedInt\b[^}]*\} from/);
  });

  test("For Maintainers documents every other export of bounded-int.ts, which For developers does not name", () => {
    const maintainers = section("For Maintainers");
    const developers = section("For developers");
    for (const name of [
      "decimal",
      "MANTISSA",
      "EXPONENT",
      "errors",
      "compare",
      "normalize",
      "product",
      "sum",
    ]) {
      expect(maintainers).toMatch(new RegExp("\\| (?:`\\w+`, )*`" + name + "[`(]"));
      expect(developers).not.toMatch(new RegExp("`" + name + "\\("));
      expect(name in exported, name).toBe(true);
    }
    for (const type of ["ErrorSpec", "Errors"]) {
      expect(maintainers).toContain(`| type \`${type}\``);
    }
  });

  test("For developers states what a caller relies on; why the implementation is exact and correct is For Maintainers", () => {
    const developers = section("For developers");
    for (const moved of [
      /private field/,
      /all the arithmetic is done/i,
      /no root is taken/,
      /would hide the\s+sign/,
      /The accuracy of the errors/,
      /first two/,
      /rounds correctly/,
      /without converting/,
      /Without this method/,
      /Why integers and powers of ten/,
    ]) {
      expect(developers).not.toMatch(moved);
    }
    const maintainers = section("For Maintainers");
    for (const title of [
      "The accuracy of the errors",
      "The conversions and the display",
      "Integers and powers of ten",
    ]) {
      expect(part(maintainers, title), title).toBeDefined();
    }
    expect(section("The conversions and the display")).toMatch(/Without it, `x \+ 1n`/);
  });
});

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
  const text = () => section("The class constants");

  // REVIEW PLACEHOLDER (#62: the constants of the generic class move to For Maintainers, The generic class)
  // the table names scale, min, max and error, not order, and BoundedInt has the constants it shows
  //   -> the table names scale, min, max and error, not order; The generic class shows the constants of BoundedInt
  //   expect(text()).toMatch(/\| `scale` .*\| `0` +\|/);
  //   expect(text()).toMatch(/\| `min` .*\| `0n` +\|/);
  //   expect(text()).toMatch(/\| `max` .*\| `32767.5` +\|/);
  test("the table names scale, min, max and error, not order; The generic class shows the constants of BoundedInt", () => {
    for (const name of CONSTANTS) expect(text()).toMatch(new RegExp(`\\| \`${name}\` +\\|`));
    expect(text()).not.toContain("integerOnly");
    expect(text()).not.toMatch(/\| `order` /);
    const generic = section("The generic class");
    expect(generic).toMatch(/\| `scale` +\| `0` +\|/);
    expect(generic).toMatch(/\| `min` +\| `0n` +\|/);
    expect(generic).toMatch(/\| `max` +\| `32767.5` +\|/);
    expect(generic).toMatch(/\| `error` +\| absent: ½ step +\|/);
    expect([BoundedInt.scale, BoundedInt.min, BoundedInt.max]).toEqual([0, 0n, 32767.5]);
    expect("order" in BoundedInt).toBe(false);
    expect(BoundedInt.error).toBeUndefined();
  });

  // REVIEW PLACEHOLDER (#62: the generic class and its exception move to For Maintainers, The generic class)
  //   expect(range).toMatch(/`0n` and `32767n` on `BoundedInt`, `0n` and `1000n` on\s+`Mass`/);
  //   expect(range).toMatch(/A class whose\s+parent is `BoundedInt` is the exception/);
  //   expect(text()).toMatch(
  //     /\| more values than its parent, unless its parent is `BoundedInt` +\| `RangeError` \|/,
  //   );
  test("the subsection The range of a class makes the bounds semi-open, gives low and high, counts the values of a byte, and refuses more values than the parent", () => {
    const range = section("The range of a class");
    expect(range).toContain("`min ≤ x < max`");
    expect(range).toContain("`x = max` is a `RangeError`");
    expect(range).toContain("`[−0.5, 255.5)`");
    expect(range).toMatch(/The static getters `low` and\s+`high` give them/);
    expect(range).toMatch(/`0n` and `1000n` on `Mass`/);
    expect([classes().Mass.low, classes().Mass.high]).toEqual([0n, 1000n]);
    expect(range).toMatch(/A class holds `high − low \+ 1` distinct values/);
    expect(range).toMatch(/A class holds no more values than its parent, the class it extends/);
    expect(range).not.toContain("order");
    expect(range).toMatch(/\| more values than its parent +\| `RangeError` \|/);
    const generic = section("The generic class");
    expect(generic).toMatch(/`0n` and `32767n`/);
    expect([BoundedInt.low, BoundedInt.high]).toEqual([0n, 32767n]);
    expect(generic).toMatch(/except a class whose parent is `BoundedInt`/);
  });

  // REVIEW PLACEHOLDER (#62: the examples of For developers make their classes from Int, context.boundedInt)
  //   'const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 }); // 0 to 255: 256 values',
  test("the example of The range of a class gives what it says", () => {
    const range = section("The range of a class");
    const code = range.slice(
      range.indexOf("```ts"),
      range.indexOf("```", range.indexOf("```ts") + 5),
    );
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    expect(code).toContain(
      'const Byte = Int.define({ name: "Byte", min: -0.5, max: 255.5 }); // 0 to 255: 256 values',
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
  // REVIEW PLACEHOLDER (#62: define is documented on Int, the class of a blinding context, whose classes hold no more values than it)
  //   expect(text).toContain("`BoundedInt.define({ name, min, max, step?, error? })`");
  //   expect(text).toMatch(
  //     /\| more values than its parent, unless its parent is `BoundedInt` +\| `RangeError` \|/,
  //   );
  test("define takes no order, ignores any other key, and refuses more values than the parent", () => {
    const text = section("define");
    expect(text).toContain("`Int.define({ name, min, max, step?, error? })`");
    expect(text).toMatch(/typed as that class/);
    expect(text).toContain("Any other key of `spec` is ignored.");
    expect(text).not.toContain("order");
    expect(text).toMatch(/\| more values than its parent +\| `RangeError` \|/);
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
    const lines = section("Examples")
      .split("\n")
      .filter((text) => text.startsWith("| `"));
    expect(lines).toHaveLength(examples.length);
  });
});

describe("docs/core/bounded-int.md, section The errors of a class", () => {
  const text = () => section("The errors of a class");

  // REVIEW PLACEHOLDER (#62: the quadratic error is kept squared, quadraticSquared; the rules are on squares)
  // it gives the three errors, the three forms of error, {} that disables them, and the rules
  //   -> it gives the three errors, the quadratic one kept squared, the three forms of error, {} and NO_ERROR_PROCESSING that disable them, and the rules on squares
  //   for (const name of ["bound", "quadratic", "term"]) expect(text()).toContain(`**\`${name}\`**`);
  //   expect(text()).toMatch(/\*\*an object\*\* `\{ bound\?, quadratic\?, term\? \}`/);
  //   expect(text()).toContain("- `0 ≤ term ≤ quadratic ≤ bound`, between any two that are defined.");
  test("it gives the three errors, the quadratic one kept squared, the three forms of error, {} and NO_ERROR_PROCESSING that disable them, and the rules on squares", () => {
    for (const name of ["bound", "quadratic", "quadraticSquared", "term"]) {
      expect(text()).toContain(`**\`${name}\`**`);
    }
    expect(section("Kept as decimals")).toMatch(/It never takes a root/);
    expect(section("Given to define")).toBeDefined();
    expect(text()).toMatch(/\*\*left out\*\*: each of the three is half a step of the class/);
    expect(text()).toMatch(/\*\*a quantity\*\*, 0 or more: the three are equal to it/);
    expect(text()).toMatch(
      /\*\*an object\*\* `\{ bound\?, quadratic\?, quadraticSquared\?, term\? \}`/,
    );
    expect(text()).toMatch(
      /the square\s+of `quadratic` must equal `quadraticSquared`, exactly, else a `RangeError`/,
    );
    expect(text()).toMatch(/`\{\}` leaves the three `undefined`: the class has no error/);
    expect(text()).toMatch(/`NO_ERROR_PROCESSING`, a frozen object of three `undefined` errors/);
    expect(section("The rules")).toBeDefined();
    expect(text()).toContain(
      "- `0 ≤ term² ≤ quadraticSquared ≤ bound²`, and `term ≤ bound`, between any two that are\n  defined.",
    );
    expect(text()).toMatch(/If two are equal, the third is equal to them/);
    expect(text()).toMatch(/an `undefined` error stays `undefined`/);
    expect(text()).toMatch(/A class never takes the errors of its parent/);
    expect(text()).toMatch(/Each is\s+`undefined` where its error is\./);
  });

  // REVIEW PLACEHOLDER (#62: the table has the column quadraticSquared, and rows for quadraticSquared and NO_ERROR_PROCESSING)
  //   expect(rows).toHaveLength(13);
  //   for (const [error, bound, quadratic, term] of rows) {
  //   const expected = [bound, quadratic, term].map((cell) => cell === "[5n, −1 − k]" ? "0.05" : cell);
  //   expect([shown(got?.bound), shown(got?.quadratic), shown(got?.term)], error).toEqual(expected);
  test("its table gives what define gives, for a class of scale 1", () => {
    const table = rows(section("The rules"), /^\| (left out|`\{|`0|`NO_ERROR_PROCESSING)/);
    expect(table).toHaveLength(21);
    expect(section("The rules")).toMatch(/\| `bound` +\| `quadraticSquared` +\| `term` +\|/);
    /** A cell as the number it shows, or `undefined`. */
    const shown = (d: Decimal | undefined) =>
      d === undefined ? "undefined" : String(Number(`${String(d[0])}e${String(d[1])}`));
    const defaults: Record<string, string> = {
      "[5n, −1 − k]": "0.05",
      "[25n, −2 − 2k]": "0.0025",
    };
    for (const [error, bound, quadraticSquared, term] of table) {
      const spec: Record<string, unknown> = { name: "E", min: 0, max: 100.05, step: 0.1 };
      if (error !== "left out") spec.error = literal(error ?? "");
      if (bound === "RangeError") {
        expect(() => BoundedInt.define(spec as never), error).toThrow(RangeError);
        continue;
      }
      const got = errorsOf(BoundedInt.define(spec as never));
      const expected = [bound, quadraticSquared, term].map((cell) => defaults[cell ?? ""] ?? cell);
      expect([shown(got.bound), shown(got.quadraticSquared), shown(got.term)], error).toEqual(
        expected,
      );
    }
  });

  test("its example of NO_ERROR_PROCESSING gives what it says", () => {
    const given = section("Given to define");
    expect(given).toContain(
      'import { NO_ERROR_PROCESSING } from "@criticaloptimisation/vc-proofs/core";',
    );
    expect(given).toContain("Raw.errorBound; // undefined, as quadraticError and termError");
    expect(given).toContain('Raw.fromValue(123n).toString(); // "12.3": every digit');
    const none = exported.NO_ERROR_PROCESSING;
    expect(none).toBeDefined();
    const Raw = BoundedInt.define({
      name: "Raw",
      min: 0,
      max: 100.05,
      step: 0.1,
      error: none as never,
    });
    expect([Raw.errorBound, Raw.quadraticError, Raw.termError]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(Raw.fromValue(123n).toString()).toBe("12.3");
    expect(given).toMatch(/It\s+does not say that the values are exact/);
  });

  // REVIEW PLACEHOLDER (#62: the constant error is { bound, quadraticSquared, term }; COARSEST_SCALE and FINEST_SCALE move to For Maintainers)
  //   /\| `error` +\| the three errors of the values, `\{ bound, quadratic, term \}`/,
  //   expect(constants).toMatch(/`−308`, `COARSEST_SCALE`, to\s+`323`, `FINEST_SCALE`/);
  test("the class constants say that error holds the three errors, never inherited", () => {
    const constants = section("The class constants");
    expect(constants).toMatch(
      /\| `error` +\| the three errors of the values, `\{ bound, quadraticSquared, term \}`/,
    );
    expect(constants).toMatch(/inherits those of its base, except `error`/);
    expect(section("The generic class")).toMatch(
      /`COARSEST_SCALE` and `FINEST_SCALE` name the limits of the scale, `−308`\s+and `323`/,
    );
  });

  // REVIEW PLACEHOLDER (#62: errors(C) gives quadraticSquared; the object form takes quadraticSquared)
  //   /\| `error` not an object `\{ bound\?, quadratic\?, term\? \}`, a quantity included +\| `TypeError` +\|/,
  //   expect(errors(Quarter)).toStrictEqual({ bound: [25n, -2], quadratic: [25n, -2], term: [25n, -2] });
  test("a class written by hand declares error as an object only, never a bare quantity, and its example gives what it says", () => {
    expect(page).toMatch(
      /\| `error` not an object `\{ bound\?, quadratic\?, quadraticSquared\?, term\? \}`, a quantity included +\| `TypeError` +\|/,
    );
    expect(page).toMatch(/A class written by hand declares `error` as an object of errors,/);
    expect(page).toMatch(/never as a bare quantity/);
    expect(page).toContain(
      "`static override error = { bound: 0.25, quadratic: 0.25 }` gives three errors of 0.25",
    );
    class Quarter extends BoundedInt {
      static override error = { bound: 0.25, quadratic: 0.25 };
    }
    expect(errorsOf(Quarter)).toStrictEqual({
      bound: [25n, -2],
      quadraticSquared: [625n, -4],
      term: [25n, -2],
    });
  });

  test("The getters: quadraticError is the root of quadraticSquared over max − min, the nearest number; the order always holds", () => {
    const getters = section("The getters");
    expect(getters).toMatch(/`√quadraticSquared \/ \(max − min\)`/);
    expect(getters).toMatch(/Each is the `number` nearest to its exact ratio, the root included/);
    expect(getters).toMatch(/`termError ≤ quadraticError ≤ errorBound` always holds/);
  });

  test("The accuracy of the errors: exact where they are kept and combined, approximate only in a number or a display", () => {
    const accuracy = section("The accuracy of the errors");
    expect(accuracy).toMatch(
      /\| kept by the class, the constant `error` +\|.*\| exact, every digit kept; no root taken +\|/,
    );
    expect(accuracy).toMatch(/\| the rules +\|.*\| exact +\|/);
    expect(accuracy).toMatch(/\| combined by the modules of the library +\|.*\| exact +\|/);
    expect(accuracy).toMatch(/\| `errorBound`, `quadraticError`, `termError` +\|/);
    expect(accuracy).toMatch(/the position that the exact error gives/);
    expect(accuracy).toMatch(/neither changes them/);
  });

  // REVIEW PLACEHOLDER (#62: quadratic is the root of quadraticSquared; the first two digits decide)
  //   expect(display).toMatch(/the first defined of `term`, `quadratic` and\s+`bound`, in steps/);
  //   expect(display).toMatch(/When the three errors are `undefined`, `j` is 0:\s+every digit is shown/);
  test("the display rounds at the first defined of term, quadratic and bound, else shows every digit; the first two digits of the error decide", () => {
    const display = section("valueOf, toString and toLocaleString");
    expect(display).toMatch(
      /the first defined of `term`, `quadratic` and\s+`bound`, in steps; `quadratic` is the root of `quadraticSquared`/,
    );
    expect(display).toMatch(
      /When the\s+three errors are `undefined`, `j` is 0: every digit is shown/,
    );
    expect(display).not.toMatch(/first two/);
    expect(section("The display position")).toMatch(
      /finds `j` from a rough error of two significant digits, never from the exact one/,
    );
  });

  test("the table of the display with Kilo shows what the code gives", () => {
    const display = section("valueOf, toString and toLocaleString");
    const table = rows(display, /^\| `\{/);
    expect(table).toHaveLength(7);
    for (const [error, , , string] of table) {
      const Kilo = BoundedInt.define({
        name: "Kilo",
        min: 0,
        max: 100.05,
        step: 0.1,
        error: literal(error ?? "") as never,
      });
      expect(Kilo.from(12.34).toString(), error).toBe(JSON.parse(string ?? "") as string);
    }
  });
});

describe("docs/core/bounded-int.md, section define: the direct scale and the errors", () => {
  test("the scale is k = 1 − digits(n) − e, refused outside −308 … 323, never brought back; error takes three forms", () => {
    const text = section("define");
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
  // REVIEW PLACEHOLDER (#62: the arithmetic is exported too, and NO_ERROR_PROCESSING)
  //   for (const name of ["decimal", "MANTISSA", "EXPONENT", "errors"]) {
  //   expect(text).toMatch(/exports only the types\s+`Quantity` and `Decimal`/);
  test("it names each export of bounded-int.ts for the other modules, and each exists", () => {
    const text = section("For the other modules of the library");
    for (const name of [
      "decimal",
      "MANTISSA",
      "EXPONENT",
      "compare",
      "normalize",
      "product",
      "sum",
      "errors",
      "NO_ERROR_PROCESSING",
    ]) {
      // In the first cell of a row, alone or after the other names of the cell.
      expect(text).toMatch(new RegExp("\\| (?:`\\w+`, )*`" + name + "[`(]"));
      expect(name in exported, name).toBe(true);
    }
    for (const type of ["Quantity", "Decimal", "ErrorSpec", "Errors"]) {
      expect(text).toContain(`| type \`${type}\``);
    }
    expect(text).toMatch(
      /exports only\s+the types `Quantity` and `Decimal`, which its signatures name, and `NO_ERROR_PROCESSING`/,
    );
    expect(text).toMatch(
      /\| `errors\(C\)` +\| the frozen errors `\{ bound, quadraticSquared, term \}`/,
    );
  });
});

describe("docs/core/bounded-int.md, For Maintainers: the display position and the quadratic error getter", () => {
  test("The display position rounds the error down to n < 100 first, takes the root of the rough square, and says why nothing is lost", () => {
    const text = section("The display position");
    expect(text).toMatch(/\*\*Rounded down to `n < 100`\*\*, as the first step/);
    expect(text).toMatch(/`r = ⌊√m⌋`/);
    expect(text).toMatch(/\*\*`j = position\(ε\)`\*\*/);
    expect(text).toMatch(/\*\*Why nothing is lost\.\*\*/);
    expect(text).toMatch(/the errors stay as they are kept/);
  });

  test("The quadratic error getter: the exact cases, the quotient, Newton's iteration for 2 iterations, the clamp; the display never reads it", () => {
    const text = section("The quadratic error getter");
    expect(text).toMatch(/\*\*The exact cases\.\*\*/);
    expect(text).toMatch(/at least 60 digits/);
    expect(text).toMatch(/\*\*Newton's iteration\*\*, `s_\{i\+1\} = \(s_i \+ X \/ s_i\) \/ 2`/);
    expect(text).toMatch(/two iterations, a\s+fixed number/);
    expect(text).toMatch(/clamped between `termError` and `errorBound`/);
    expect(text).toMatch(/The display never reads this getter\./);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the page names every public member of BoundedInt (#41)   |
// | #47    | the new members; the constants and the examples tables; The range of a class; a self-contained page (#44) |
// | #51    | imports the generic BoundedInt of bounded-int.ts; placeholders of #47 removed (#49) |
// | #53    | low and high; no order; The integers and The number of values; define without order (#52) |
// | #59    | The errors of a class, its table against define; the display; the direct scale; For the other modules of the library; a class written by hand declares error as an object only; placeholders of #53 removed (#58) |
// | #63    | three parts; quadraticSquared, the rules on squares, NO_ERROR_PROCESSING; the display position and the quadratic error getter; product and sum; For developers holds no proof of correctness (#62) |
