/**
 * docs/core/blinding-context.md documents the class of ristretto255, the
 * `context.boundedInt` of a context over `RistrettoElement` (#49, #48), the integers of
 * Z_ℓ, in its section *The class
 * of a group*: its constants, its bounds, `low` and `high`, the rule that no class made
 * from it holds more than `ℓ` integers (#52), its `define`, its name, and the examples,
 * each checked against the class. docs/core/ristretto255.md keeps a short section that
 * links there. The page of the generic class, docs/core/bounded-int.md, only says, after
 * its own material, that `./core` gives a specialized subclass. The tests of that page stay
 * on the generic class (test/docs/bounded-int.node.test.ts).
 *
 * The class is looked up on a context, `context.boundedInt`.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../../src/core/bounded-int.js";
import { BlindingContext, RistrettoElement } from "../../src/core/index.js";
import vectors from "../vectors/blinding-context.json" with { type: "json" };
import { read } from "./markdown.js";

const page = read("docs/core/blinding-context.md");
const group = read("docs/core/ristretto255.md");
const generic = read("docs/core/bounded-int.md");

/** `ℓ`, the order of ristretto255. */
const L = RistrettoElement.ORDER;

function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** `context.boundedInt`, the class of ristretto255. */
const Scalar = BlindingContext.fromEncoded(
  fromHex(vectors.context.h),
  fromHex(vectors.context.messageHex),
  RistrettoElement,
).boundedInt;

/** The text of the section `## <title>` of `text`, up to the next `## ` heading. */
function section(text: string, title: string): string {
  const start = text.indexOf(`\n## ${title}\n`);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

/** The cells of the row of the table whose first cell is `` `name` ``. */
function row(text: string, name: string): string[] {
  const line = text.split("\n").find((l) => l.startsWith(`| \`${name}\``));
  expect(line).toBeDefined();
  return (line ?? "")
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

describe("docs/core/blinding-context.md, section The class of a group", () => {
  const text = section(page, "The class of a group");

  test("it names the class of ristretto255, the context.boundedInt of a context over RistrettoElement, Ristretto255Scalar, a subclass of the bounded integers, and links their page", () => {
    expect(Object.getPrototypeOf(Scalar)).toBe(GenericBoundedInt);
    expect(Scalar.name).toBe("Ristretto255Scalar");
    expect(text).toMatch(
      /it is `Ristretto255Scalar`, the `context\.boundedInt` of a context over\s+`RistrettoElement`/,
    );
    expect(text).toMatch(/subclass of the class of \[bounded integers\]\(bounded-int\.md\)/);
    expect(page).toMatch(/\[the class of a group\]\(#the-class-of-a-group\)/i);
  });

  // REVIEW PLACEHOLDER (#58: define stores the errors of every class it makes)
  // it names every own member of the class: the constants scale, min and max
  //   -> it names every own member of the class: the constants scale, min, max and error
  //   expect(own.sort()).toEqual(["max", "min", "scale"]);
  test("it names every own member of the class: the constants scale, min, max and error", () => {
    const own = Object.getOwnPropertyNames(Scalar).filter(
      (name) => !["length", "name", "prototype"].includes(name),
    );
    expect(own.sort()).toEqual(["error", "max", "min", "scale"]);
    for (const name of own) expect(text).toContain(`\`${name}\``);
  });

  // REVIEW PLACEHOLDER (#58: define stores the errors of every class it makes, half a step by default)
  // the table of constants shows the constants of the class: scale 0, [−0.5, ℓ − 0.5), no error; no order
  //   -> the table of constants shows the constants of the class: scale 0, [−0.5, ℓ − 0.5), the errors of half a step; no order
  //   expect(row(text, "error")[1]).toBe("absent: ½ step");
  //   expect(Scalar.error).toBeUndefined();
  test("the table of constants shows the constants of the class: scale 0, [−0.5, ℓ − 0.5), the errors of half a step; no order", () => {
    expect(row(text, "scale")[1]).toBe("`0`");
    expect(Scalar.scale).toBe(0);
    expect(row(text, "min")[1]).toBe("`-0.5`");
    expect(Scalar.min).toBe(-0.5);
    expect(row(text, "max")[1]).toBe("`ℓ − 0.5`, kept as `[10n * ℓ - 5n, -1]`");
    expect(Scalar.max).toEqual([10n * L - 5n, -1]);
    expect(text).not.toMatch(/\| `order` /);
    expect("order" in Scalar).toBe(false);
    expect(row(text, "error")[1]).toBe("½ step: `bound`, `quadratic` and `term` each `[5n, -1]`");
    expect(Scalar.error as unknown).toStrictEqual({
      bound: [5n, -1],
      quadratic: [5n, -1],
      term: [5n, -1],
    });
  });

  test("the bounds are ℓ buckets; { min: 0n, max: ℓ } would hold ℓ + 1 integers", () => {
    expect(text).toMatch(/`ℓ` equal buckets of width 1/);
    expect(text).toMatch(/`\{ min: 0n, max: ℓ \}` would hold `ℓ \+ 1` integers/);
    expect(Scalar.from([10n * L - 6n, -1]).value).toBe(L - 1n);
    expect(() => Scalar.from([10n * L - 1n, -1])).toThrow(RangeError);
    expect(() => Scalar.define({ name: "Full", min: 0n, max: L })).toThrow(RangeError);
  });

  test("low and high are 0n and ℓ − 1n, as many integers as the group has scalars; no class made from it, by define or by hand, holds more than ℓ integers", () => {
    expect(text).toMatch(/\*\*`low` and `high`\*\* are `0n` and `ℓ − 1n`/);
    expect(text).toMatch(/as many as the\s+group has scalars/);
    expect([Scalar.low, Scalar.high]).toEqual([0n, L - 1n]);
    expect(text).toMatch(/\*\*No class made from it holds more than `ℓ` integers\.\*\*/);
    expect(text).toMatch(/\[The range of a class\]\(bounded-int\.md#the-range-of-a-class\)/);
    expect(text).toMatch(/by `define` or by hand/);
    class Full extends Scalar {
      static override readonly min = 0n;
      static override readonly max = L;
    }
    expect(() => Full.from(5n)).toThrow(/must not hold more values than Ristretto255Scalar/);
    expect(() => Scalar.define({ name: "Full", min: 0n, max: L })).toThrow(
      /must not hold more values than Ristretto255Scalar/,
    );
  });

  test("it is the class of the blinding factors, checked by the context: scale 0, low 0n, high ℓ − 1n", () => {
    expect(text).toMatch(/\*\*The class of the blinding factors\.\*\*/);
    expect(text).toMatch(/`scale` 0, `low` `0n` and `high` `ℓ − 1n`/);
  });

  test("define is the generic define, typed as the class it is called on", () => {
    expect(text).toMatch(
      /\*\*`define`\*\* is the `define` of \[bounded integers\]\(bounded-int\.md#define\)/,
    );
    expect(text).toMatch(/`Scalar\.define\(\{ name, min, max, step\?, error\? \}\)`/);
    expect(text).not.toContain("order`");
    expect(Object.hasOwn(Scalar, "define")).toBe(false);
  });

  test("the class takes no number, and is frozen; a narrower class made from it, Mass, takes one", () => {
    expect(text).toMatch(/\*\*No `number`\.\*\*/);
    expect(text).toMatch(/\*\*Frozen\*\*/);
    expect(Object.isFrozen(Scalar)).toBe(true);
    expect(() => Scalar.from(5)).toThrow(TypeError);
    expect(Scalar.from(5n).value).toBe(5n);
  });

  test("one class per group, named <SUITE_NAME>Scalar", () => {
    expect(text).toMatch(/\*\*One class per group\.\*\*/);
    expect(text).toMatch(/the name `<SUITE_NAME>Scalar`/);
  });

  test("the examples give what they say", () => {
    const code = text.slice(text.indexOf("```ts"), text.lastIndexOf("```"));
    expect(code).toContain('from "@criticaloptimisation/vc-proofs/core"');
    expect(code).toContain(
      "const context = BlindingContext.fromEncoded(publishedH, message, RistrettoElement);",
    );
    expect(code).toContain("const Scalar = context.boundedInt; // Ristretto255Scalar");
    expect(code).toContain("Scalar.from(19_000n).value; // 19000n");
    expect(Scalar.from(19_000n).value).toBe(19000n);
    expect(code).toContain("Scalar.from([15n, -1]).value; // 2n");
    expect(Scalar.from([15n, -1]).value).toBe(2n);
    expect(code).toContain("Scalar.from([-5n, -1]).value; // 0n");
    expect(Scalar.from([-5n, -1]).value).toBe(0n);
    expect(code).toContain("Scalar.from(-1n); // RangeError: below Ristretto255Scalar.min");
    expect(() => Scalar.from(-1n)).toThrow(/below Ristretto255Scalar\.min/);
    expect(code).toContain("Scalar.from(5); // TypeError");
    expect(() => Scalar.from(5)).toThrow(TypeError);
    const Mass = Scalar.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(code).toContain("Mass.from(2.3).value; // 23n");
    expect(Mass.from(2.3).value).toBe(23n);
    expect(code).toContain("Scalar.high === ℓ - 1n; // true");
    expect(Scalar.high === L - 1n).toBe(true);
    expect(code).toMatch(/step: 0\.1 \}\); \/\/ 1001 values/);
    expect(Mass.high - Mass.low + 1n).toBe(1001n);
    const Byte = Scalar.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 });
    expect(code).toMatch(/max: 100\.5 \}\); \/\/ 101 values/);
    expect(Percent.high - Percent.low + 1n).toBe(101n);
    expect(code).toContain("// RangeError: ℓ + 1 values");
    expect(code).toContain(
      'Byte.define({ name: "Word", min: -0.5, max: 65535.5 }); // RangeError: more values than Byte',
    );
    expect(() => Byte.define({ name: "Word", min: -0.5, max: 65535.5 })).toThrow(RangeError);
    expect(code).not.toContain("order");
  });
});

describe("docs/core/ristretto255.md: the integers of Z_ℓ link to the blinding context", () => {
  test("its section The integers of Z_ℓ names context.boundedInt, for a context over RistrettoElement, and links The class of a group; it has no section BoundedInt", () => {
    const text = section(group, "The integers of Z_ℓ");
    expect(text).toMatch(/`context\.boundedInt`, for\s+a context over `RistrettoElement`/);
    expect(text).toMatch(/\(blinding-context\.md#the-class-of-a-group\)/);
    expect(group).not.toContain("\n## BoundedInt\n");
    expect(group).not.toContain("(#boundedint)");
  });
});

describe("docs/core/bounded-int.md: the notice of the BoundedInt of the entry point", () => {
  test("it comes last, after the material of the generic class, and says that ./core gives a specialized subclass, the boundedInt of a blinding context", () => {
    const notice = section(generic, "The BoundedInt of the entry point");
    expect(generic.indexOf("\n## The BoundedInt of the entry point\n")).toBeGreaterThan(
      generic.indexOf("\n## Subclasses\n"),
    );
    expect(notice).toMatch(/does not export the class of this page/);
    expect(notice).toMatch(/library: the `boundedInt` of a blinding context\./);
    expect(notice).toMatch(
      /no class\s+made\s+from\s+it, by `define` or by hand,\s+holds more values than it does/,
    );
    expect(notice.slice(0, notice.indexOf("<!--"))).not.toContain("order");
    expect(notice).toMatch(/\(\.\.\/\.\.\/README\.md#documentation\)/);
  });

  test("the README lists context.boundedInt, the integers of Z_ℓ, with the page of the blinding context", () => {
    const readme = read("README.md");
    expect(readme).toMatch(
      /\[The blinding context\]\(docs\/core\/blinding-context\.md\)[^\n]*\n[^\n]*\n\s+`context\.boundedInt`, the integers of Z_ℓ/,
    );
    expect(readme).not.toContain("BlindingContext.boundedInt");
    expect(readme).not.toMatch(/`BoundedInt`, the integer of Z_ℓ/);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #51    | new: the section BoundedInt of ristretto255.md, and the notice of bounded-int.md (#49) |
// | #53    | no order; low and high; own members min and max; the generic define (#52) |
// | #55    | the class of a group in blinding-context.md, from context.boundedInt() (#48) |
