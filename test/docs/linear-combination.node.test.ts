/**
 * docs/core/linear-combination.md has the three parts of the pages of the library, For
 * users, For developers and For Maintainers; it documents every public member of
 * `LinearCombination` (#50) in the section of the class, and its numbers are those of the
 * code: the rows of the table of its examples, the results its examples quote, the errors
 * it works with the arithmetic of bounded-int.ts, and the message of a combination that
 * does not fit its group.
 *
 * The class is looked up on the entry point's namespace, so that this file compiles
 * before the export exists, and fails on the behaviour.
 */
import { describe, expect, test } from "vitest";
import {
  errors,
  type Decimal,
  type Errors,
  BoundedInt as GenericBoundedInt,
} from "../../src/core/bounded-int.js";
import * as entryPoint from "../../src/core/index.js";
import { NO_ERROR_PROCESSING, RistrettoElement } from "../../src/core/index.js";
import generatorVectors from "../vectors/generator-h.json" with { type: "json" };
import { outline, part, read } from "./markdown.js";

type BoundedIntClass = typeof GenericBoundedInt;

interface Combination {
  readonly boundedInt: BoundedIntClass;
  readonly coefficients: readonly bigint[];
  combine(context: unknown, committed: readonly unknown[]): RistrettoElement;
}

interface CombinationClass {
  readonly prototype: unknown;
  new (spec: unknown): Combination;
}

interface ContextClass {
  fromEncoded(
    h: Uint8Array,
    message: Uint8Array,
    group: unknown,
  ): { readonly boundedInt: BoundedIntClass };
}

const BlindingContext = (entryPoint as Record<string, unknown>).BlindingContext as ContextClass;
const LinearCombination = (entryPoint as Record<string, unknown>).LinearCombination as
  CombinationClass | undefined;
const page = read("docs/core/linear-combination.md");

function combination(spec: unknown): Combination {
  if (LinearCombination === undefined) throw new Error("./core exports no LinearCombination");
  return new LinearCombination(spec);
}

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

const vector = generatorVectors.vectors.find((v) => v.name === "age-check");
if (vector === undefined) throw new Error("no generator vector age-check");
const h = fromHex(vector.h);
const message = fromHex(vector.messageHex);

const Scalar = BlindingContext.fromEncoded(h, message, RistrettoElement).boundedInt;
const DayCount = Scalar.define({ name: "DayCount", min: -0.5, max: 365250.5 });
const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
const Reading = Scalar.define({ name: "Reading", min: -7.99, max: 15.995, step: 0.01 });
const Sensor = Scalar.define({
  name: "Sensor",
  min: 0,
  max: 100.05,
  step: 0.1,
  error: { quadratic: 0.08 },
});
const Raw = Scalar.define({
  name: "Raw",
  min: 0,
  max: 100.05,
  step: 0.1,
  error: NO_ERROR_PROCESSING,
});
/** x in [0, 0.09995) at the step 10^-4: the integers 0 … 999, scale 4. */
const Fraction = Scalar.define({ name: "Fraction", min: 0, max: 0.09995, step: 0.0001 });

/** The text of the first section titled `title`, at any level, in `text`. */
function section(title: string, text: string = page): string {
  const found = part(text, title);
  expect(found, title).toBeDefined();
  return found ?? "";
}

/** The public members of the prototype of the class. */
function members(): string[] {
  if (LinearCombination === undefined) return [];
  return Object.getOwnPropertyNames(LinearCombination.prototype).filter(
    (name) => name !== "constructor",
  );
}

/** A decimal as the page writes it: `0.105`, `1`, `0`. */
function written(d: Decimal | undefined): string {
  if (d === undefined) return "`undefined`";
  const [n, e] = d;
  if (e >= 0) return `${String(n)}${"0".repeat(e)}`;
  const text = (n < 0n ? -n : n).toString().padStart(-e + 1, "0");
  return `${n < 0n ? "-" : ""}${text.slice(0, e)}.${text.slice(e)}`;
}

describe("docs/core/linear-combination.md: three parts, for users, for developers, and for maintainers", () => {
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

  test("For developers holds the class, its members, the errors of the result, the group at use, the examples and the errors", () => {
    const text = section("For developers");
    for (const title of [
      "LinearCombination",
      "The constructor",
      "The coefficients",
      "The class of the result",
      "The errors of the result",
      "The empty combination",
      "The group at use",
      "combine",
      "combineBlinded",
      "Each commitment once",
      "Examples",
      "Errors",
    ]) {
      expect(part(text, title), title).toBeDefined();
    }
    expect(text).toMatch(/exports the class\s+`LinearCombination`\./);
  });

  test("For Maintainers holds the module, the class of the result from the generic class, the errors computed exactly, and why the implementation is correct; For developers holds none of it", () => {
    const maintainers = section("For Maintainers");
    for (const title of [
      "The module",
      "The class of the result",
      "The errors, exactly",
      "Why the result is enough",
      "The blinding factor of the result",
      "Why each commitment once",
    ]) {
      expect(part(maintainers, title), title).toBeDefined();
    }
    expect(section("The module", maintainers)).toMatch(/`#result`/);
    expect(section("The module", maintainers)).toMatch(/`compare`, `product`\s+and `sum`/);
    const developers = section("For developers");
    for (const moved of [
      /#result/,
      /generic `BoundedInt`/,
      /`product\(/,
      /`\|a′ⱼ\| ≥ 1`/,
      /canonicalGenerator/,
      /is 0 by construction/,
    ]) {
      expect(developers).not.toMatch(moved);
    }
  });
});

describe("docs/core/linear-combination.md, section LinearCombination", () => {
  test("the class has the public members of the plan: boundedInt, coefficients, combine, combineBlinded, and no static member", () => {
    expect(typeof LinearCombination).toBe("function");
    expect(members().sort()).toEqual(
      ["boundedInt", "coefficients", "combine", "combineBlinded"].sort(),
    );
    expect(
      Object.getOwnPropertyNames(LinearCombination ?? {}).filter(
        (name) => !["length", "name", "prototype"].includes(name),
      ),
    ).toEqual([]);
  });

  test("the table of the class names its constructor and each of its members, as the class has them", () => {
    // The members are read from the class: the test fails while it does not exist.
    expect(typeof LinearCombination).toBe("function");
    const table = section("LinearCombination");
    expect(table).toContain(`\`new ${LinearCombination?.name ?? ""}({ name, terms })\``);
    for (const member of members()) {
      expect(table).toMatch(new RegExp("\\| `" + member + "[`(]"));
    }
  });
});

describe("docs/core/linear-combination.md, section Examples", () => {
  /** The terms of each row, as the page writes them, and as the code builds them. */
  const rows: [string, unknown[]][] = [
    [
      "[[1n, DayCount], [-1n, DayCount]]",
      [
        [1n, DayCount],
        [-1n, DayCount],
      ],
    ],
    [
      "[[2n, Mass], [-1n, Reading]]",
      [
        [2n, Mass],
        [-1n, Reading],
      ],
    ],
    ["[[0.5, DayCount]]", [[0.5, DayCount]]],
    [
      "[[1n, Sensor], [-1n, Mass]]",
      [
        [1n, Sensor],
        [-1n, Mass],
      ],
    ],
    [
      "[[1n, Mass], [1n, Raw]]",
      [
        [1n, Mass],
        [1n, Raw],
      ],
    ],
    ["[[0.2, Fraction]]", [[0.2, Fraction]]],
    ["[]", []],
  ];

  test.each(rows)("the row %s is what the code computes", (label, terms) => {
    const line = page.split("\n").find((l) => l.startsWith(`| \`${label}\` `));
    expect(line).toBeDefined();
    const cells = (line ?? "")
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const lc = combination({ name: "Row", terms });
    const R = lc.boundedInt;
    // The errors as stored, the quadratic error squared (bounded-int.md, Kept as decimals).
    const e = errors(R);
    expect(cells).toEqual([
      `\`${label}\``,
      String(R.scale),
      `\`[${lc.coefficients.map((c) => `${String(c)}n`).join(", ")}]\``,
      `\`${String(R.low)}n\``,
      `\`${String(R.high)}n\``,
      written(e.bound),
      written(e.quadraticSquared),
      written(e.term),
    ]);
  });

  test("the results its examples quote: Age, its further combination Later, and 2·Mass − Reading shown as 4.7", () => {
    const Age = combination({
      name: "Age",
      terms: [
        [1n, DayCount],
        [-1n, DayCount],
      ],
    });
    expect(page).toContain(`Age.boundedInt.low; // ${String(Age.boundedInt.low)}n`);
    expect(page).toContain(`Age.boundedInt.high; // ${String(Age.boundedInt.high)}n`);
    const Later = combination({
      name: "Later",
      terms: [
        [1n, Age.boundedInt],
        [1n, DayCount],
      ],
    });
    expect(page).toContain(`Later.boundedInt.low; // ${String(Later.boundedInt.low)}n`);
    expect(page).toContain(`Later.boundedInt.high; // ${String(Later.boundedInt.high)}n`);
    const lc = combination({
      name: "MassMinusReading",
      terms: [
        [2n, Mass],
        [-1n, Reading],
      ],
    });
    const integer = 20n * Mass.from(2.3).value - Reading.from(-0.125).value;
    expect(integer).toBe(472n);
    expect(lc.boundedInt.fromValue(integer).toString()).toBe("4.7");
    expect(page).toContain("`20 · 23 − (−12) = 472n`, 4.72");
    expect(page).toContain('it shows `"4.7"`');
  });
});

test("docs/core/linear-combination.md, For Maintainers, works the errors of 2·Mass − Reading and of 0.2·x as the code stores them, the quadratic error squared", () => {
  const worked = section("The errors, exactly", section("For Maintainers"));
  const stored = (terms: unknown[]): Errors =>
    errors(combination({ name: "Worked", terms }).boundedInt);
  expect(
    stored([
      [2n, Mass],
      [-1n, Reading],
    ]),
  ).toEqual({ bound: [105n, -3], quadraticSquared: [10025n, -6], term: [1n, -1] });
  expect(worked).toContain("`[105n, -3]`, 0.105");
  expect(worked).toContain("`[10025n, -6]`, 0.010025");
  expect(worked).toContain("`[1n, -1]`, 0.1");
  expect(stored([[0.2, Fraction]])).toEqual({
    bound: [1n, -5],
    quadraticSquared: [1n, -10],
    term: [1n, -5],
  });
  expect(worked).toContain("that is `[1n, -10]`");
});

test("docs/core/linear-combination.md quotes the message of a combination that does not fit its group, as the code writes it", () => {
  const group = {
    SUITE_NAME: "Small",
    GENERATOR_DST: "vc-proofs-test-small-group",
    ORDER: 65536n,
    decode: (bytes: Uint8Array) => RistrettoElement.decode(bytes),
    hashToGroup: (m: Uint8Array, dst: Uint8Array) => RistrettoElement.hashToGroup(m, dst),
    canonicalGenerator: () => RistrettoElement.canonicalGenerator(),
    randomScalar: () => 0n,
  };
  const context = BlindingContext.fromEncoded(h, message, group);
  const Age = combination({
    name: "Age",
    terms: [
      [1n, DayCount],
      [-1n, DayCount],
    ],
  });
  let text = "";
  try {
    Age.combine(context, []);
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    text = (error as RangeError).message;
  }
  expect(text).toBe(
    "LinearCombination.combine: Age holds more values than the group Small has scalars",
  );
  expect(page).toContain(`\`${text}\``);
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
