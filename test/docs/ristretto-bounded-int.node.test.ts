/**
 * docs/core/ristretto255.md documents the `BoundedInt` of `./core` (#49), the integer of
 * Z_ℓ, in its section *BoundedInt*: its constants, its bounds, its order, its `define`
 * without `order`, and the examples, each checked against the class. The page of the
 * generic class, docs/core/bounded-int.md, only says, after its own material, that
 * `./core` exports a specialized subclass. The tests of that page stay on the generic
 * class (test/docs/bounded-int.node.test.ts).
 */
import { describe, expect, test } from "vitest";
import { BoundedInt as GenericBoundedInt } from "../../src/core/bounded-int.js";
import { BoundedInt, RistrettoElement } from "../../src/core/index.js";
import { read } from "./markdown.js";

const page = read("docs/core/ristretto255.md");
const generic = read("docs/core/bounded-int.md");

/** `ℓ`, the order of ristretto255. */
const L = RistrettoElement.ORDER;

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

describe("docs/core/ristretto255.md, section BoundedInt", () => {
  const text = section(page, "BoundedInt");

  test("it names the class of ./core, the integer of Z_ℓ, a subclass of the bounded integers, and links their page", () => {
    expect(Object.getPrototypeOf(BoundedInt)).toBe(GenericBoundedInt);
    expect(text).toMatch(/the integer of Z_ℓ/);
    expect(text).toMatch(/subclass of the class of \[bounded integers\]\(bounded-int\.md\)/);
    expect(page).toMatch(/\[BoundedInt\]\(#boundedint\)/);
  });

  test("it names every own member of the class: the constants min, max, order, and define", () => {
    const own = Object.getOwnPropertyNames(BoundedInt).filter(
      (name) => !["length", "name", "prototype"].includes(name),
    );
    expect(own.sort()).toEqual(["define", "max", "min", "order"]);
    for (const name of own) expect(text).toContain(`\`${name}\``);
  });

  test("the table of constants shows the constants of the class: scale 0, [−0.5, ℓ − 0.5), order ℓ, no error", () => {
    expect(row(text, "scale")[1]).toBe("`0`");
    expect(BoundedInt.scale).toBe(0);
    expect(row(text, "min")[1]).toBe("`-0.5`");
    expect(BoundedInt.min).toBe(-0.5);
    expect(row(text, "max")[1]).toBe("`ℓ − 0.5`, kept as `[10n * ℓ - 5n, -1]`");
    expect(BoundedInt.max).toEqual([10n * L - 5n, -1]);
    expect(row(text, "order")[1]).toBe("`ℓ`, `RistrettoElement.ORDER`");
    expect(BoundedInt.order).toBe(L);
    expect(row(text, "error")[1]).toBe("absent: ½ step");
    expect(BoundedInt.error).toBeUndefined();
  });

  test("the bounds are ℓ buckets; { min: 0n, max: ℓ } would hold ℓ + 1 integers", () => {
    expect(text).toMatch(/`ℓ` equal buckets of width 1/);
    expect(text).toMatch(/`\{ min: 0n, max: ℓ \}` would hold `ℓ \+ 1` integers/);
    expect(BoundedInt.from([10n * L - 6n, -1]).value).toBe(L - 1n);
    expect(() => BoundedInt.from([10n * L - 1n, -1])).toThrow(RangeError);
    expect(() => BoundedInt.define({ name: "Full", min: 0n, max: L })).toThrow(RangeError);
  });

  test("define takes no order: a TypeError, inherited by the classes it makes; a class written by hand may declare one", () => {
    expect(text).toMatch(/`BoundedInt\.define\(\{ name, min, max, step\?, error\? \}\)`/);
    expect(text).toMatch(/`order` in `spec` is a `TypeError`/);
    expect(text).toMatch(/\[bounded integers\]\(bounded-int\.md#define\)/);
    expect(text).toMatch(/`static override order = 256n`\. Nothing prevents it/);
    const spec = { name: "Word", min: -0.5, max: 65535.5, order: 65536n };
    expect(() => BoundedInt.define(spec as never)).toThrow(/^BoundedInt\.define: /);
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    expect(() => Byte.define({ ...spec, name: "W" } as never)).toThrow(/^Byte\.define: /);
  });

  test("the class takes no number, and is frozen; a narrower class made from it, Mass, takes one", () => {
    expect(text).toMatch(/\*\*No `number`\.\*\*/);
    expect(text).toMatch(/\*\*Frozen\*\*/);
    expect(Object.isFrozen(BoundedInt)).toBe(true);
    expect(() => BoundedInt.from(5)).toThrow(TypeError);
    expect(BoundedInt.from(5n).value).toBe(5n);
  });

  test("the examples give what they say", () => {
    const code = text.slice(text.indexOf("```ts"), text.lastIndexOf("```"));
    expect(code).toContain('from "@criticaloptimisation/vc-proofs/core"');
    expect(code).toContain("BoundedInt.from(19_000n).value; // 19000n");
    expect(BoundedInt.from(19_000n).value).toBe(19000n);
    expect(code).toContain("BoundedInt.from([15n, -1]).value; // 2n");
    expect(BoundedInt.from([15n, -1]).value).toBe(2n);
    expect(code).toContain("BoundedInt.from([-5n, -1]).value; // 0n");
    expect(BoundedInt.from([-5n, -1]).value).toBe(0n);
    expect(code).toContain("BoundedInt.from(-1n); // RangeError");
    expect(() => BoundedInt.from(-1n)).toThrow(RangeError);
    expect(code).toContain("BoundedInt.from(5); // TypeError");
    expect(() => BoundedInt.from(5)).toThrow(TypeError);
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(code).toContain("Mass.from(2.3).value; // 23n");
    expect(Mass.from(2.3).value).toBe(23n);
    expect(Mass.order).toBe(L);
    const Byte = BoundedInt.define({ name: "Byte", min: -0.5, max: 255.5 });
    const Percent = Byte.define({ name: "Percent", min: -0.5, max: 100.5 });
    expect(Percent.order).toBe(L);
    expect(code).toContain("// RangeError: ℓ + 1 values");
    expect(code).toMatch(/order: 65536n \}\); \/\/ TypeError/);
  });
});

describe("docs/core/bounded-int.md: the notice of the BoundedInt of the entry point", () => {
  test("it comes last, after the material of the generic class, and says the exported class is a specialized subclass", () => {
    const notice = section(generic, "The BoundedInt of the entry point");
    expect(generic.indexOf("\n## The BoundedInt of the entry point\n")).toBeGreaterThan(
      generic.indexOf("\n## Subclasses\n"),
    );
    expect(notice).toMatch(/is not the class of\s+this page, but a subclass of it/);
    expect(notice).toMatch(/its `define` takes no `order`/);
    expect(notice).toMatch(/\(\.\.\/\.\.\/README\.md#documentation\)/);
  });

  test("the README lists BoundedInt, the integer of Z_ℓ, with the page of the group", () => {
    const readme = read("README.md");
    expect(readme).toMatch(
      /\[The group ristretto255\]\(docs\/core\/ristretto255\.md\)[^\n]*\n[^\n]*\n\s+`BoundedInt`, the integer of Z_ℓ/,
    );
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #51    | new: the section BoundedInt of ristretto255.md, and the notice of bounded-int.md (#49) |
