/**
 * Stage 1 of the decimal classes of `BoundedInt` (#44; docs/core/bounded-int.md): every
 * value is an exact decimal `[n, e]`, worth `n · 10^e`, or a `bigint`; a `number` is never
 * a value. A value is compared exactly with the bounds of its class, then scaled to the
 * step and rounded once, ties to even. The examples are those of the maintainer's order on
 * PR #47. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";

const L = RistrettoElement.ORDER;

describe("BoundedInt stage 1: the bounds are exact decimals, checked before any rounding", () => {
  test("max 123123 kg at the step of 1000 kg: 123455 kg is a RangeError, not rounded to 123", () => {
    const Load = BoundedInt.define({ name: "Load", min: 0n, max: 123123n, step: 1000n });
    expect([Load.scale, Load.min, Load.end]).toEqual([-3, 0n, 124n]);
    expect([Load.lowest, Load.highest]).toEqual([
      [0n, 0],
      [123123n, 0],
    ]);
    expect(() => Load.from(123455n)).toThrow(RangeError);
    expect(() => Load.from(123455n)).toThrow(/^Load\.from: /);
    expect(() => Load.from(123124n)).toThrow(RangeError);
    expect(Load.from(123123n).value).toBe(123n);
    expect(Load.from(123000n).value).toBe(123n);
  });

  test("max 2.9999, (29999, -4): 2.99994, (299994, -5), is a RangeError; 2.9999 is accepted", () => {
    const C = BoundedInt.define({ name: "C", min: 0n, max: [29999n, -4], step: 1n });
    expect(() => C.from([299994n, -5])).toThrow(RangeError);
    expect(C.from([29999n, -4]).value).toBe(3n);
    expect(C.from([299990n, -5]).value).toBe(3n);
  });

  test("min 0.5223, (5223, -4): (52229, -5) is compared as 52229 < 52230, a RangeError", () => {
    const C = BoundedInt.define({ name: "C", min: [5223n, -4], max: 1n, step: [1n, -3] });
    expect(() => C.from([52229n, -5])).toThrow(RangeError);
    expect(C.from([52230n, -5]).value).toBe(522n);
    expect(C.from([5223n, -4]).value).toBe(522n);
  });

  test("Mass, from 0 to 100 at the step of 0.1: 100.04 and −0.04 are refused, not rounded into the range", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
    expect([Mass.scale, Mass.min, Mass.end]).toEqual([1, 0n, 1001n]);
    expect(() => Mass.from([10004n, -2])).toThrow(RangeError);
    expect(() => Mass.from([-4n, -2])).toThrow(RangeError);
    expect(Mass.from(100n).value).toBe(1000n);
    expect(Mass.from([23n, -1]).value).toBe(23n);
    expect(Mass.from(5n).value).toBe(50n);
  });

  test("the exponents are compared without building huge powers of ten", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
    expect(() => Mass.from([1n, 1_000_000_000])).toThrow(RangeError);
    expect(() => Mass.from([-1n, -1_000_000_000])).toThrow(RangeError);
    expect(Mass.from([1n, -1_000_000_000]).value).toBe(0n);
    expect(Mass.from([0n, 1_000_000_000]).value).toBe(0n);
  });

  test("a class made by defineRaw, or written by hand, has the exact bounds of its integers", () => {
    const Difference = BoundedInt.defineRaw({ name: "D", scale: 1, min: -1000n, end: 1001n });
    expect(Difference.from(100n).value).toBe(1000n);
    expect(() => Difference.from([10001n, -2])).toThrow(RangeError);
    expect(Difference.from([10000n, -2]).value).toBe(1000n);
    class Days extends BoundedInt {
      static override min = 0n;
      static override end = 365251n;
    }
    expect(Days.from(365250n).value).toBe(365250n);
    expect(() => Days.from(365251n)).toThrow(RangeError);
  });

  test("a class written by hand may declare exact bounds, which must scale into [min, end)", () => {
    class Grams extends BoundedInt {
      static override scale = 0;
      static override integerOnly = false;
      static override min = 0n;
      static override end = 1001n;
      static override lowest = [0n, 0] as const;
      static override highest = [10005n, -1] as const;
    }
    expect(Grams.from([10004n, -1]).value).toBe(1000n);
    expect(() => Grams.from([10006n, -1])).toThrow(RangeError);
    class Beyond extends BoundedInt {
      static override min = 0n;
      static override end = 10n;
      static override lowest = [0n, 0] as const;
      static override highest = [10n, 0] as const;
    }
    expect(() => Beyond.fromValue(0n)).toThrow(RangeError);
    expect(() => Beyond.fromValue(0n)).toThrow(/Beyond/);
  });

  test("BoundedInt has the exact bounds 0 and ℓ − 1", () => {
    expect(BoundedInt.from(L - 1n).value).toBe(L - 1n);
    expect(() => BoundedInt.from(L)).toThrow(RangeError);
    expect(() => BoundedInt.from(-1n)).toThrow(RangeError);
    // The type comes first: −10^-400 is not an integer.
    expect(() => BoundedInt.from([-1n, -400])).toThrow(TypeError);
    expect(BoundedInt.from([0n, -400]).value).toBe(0n);
  });
});

describe("BoundedInt stage 1: the inputs", () => {
  test.each([
    ["5", 5],
    ["0.5", 0.5],
    ['"5"', "5"],
    ["[5n]", [5n]],
    ["[5n, 0.5]", [5n, 0.5]],
    ["[5, 0]", [5, 0]],
    ["null", null],
  ] as const)("from(%s) is a TypeError: only a bigint or a decimal [n, e]", (_, x) => {
    expect(() => BoundedInt.from(x as never)).toThrow(TypeError);
    expect(() => BoundedInt.from(x as never)).toThrow(/^BoundedInt\.from: /);
  });

  test("on a class with integerOnly, a decimal that is not an integer is a TypeError", () => {
    expect(() => BoundedInt.from([15n, -1])).toThrow(TypeError);
    expect(BoundedInt.from([150n, -1]).value).toBe(15n);
    expect(BoundedInt.from([7n, 2]).value).toBe(700n);
  });

  test("define takes bigints and decimals, never numbers", () => {
    expect(() => BoundedInt.define({ name: "X", min: 0 as never, max: 1n })).toThrow(TypeError);
    expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: 0.1 as never })).toThrow(
      TypeError,
    );
    expect(() => BoundedInt.define({ name: "X", min: [5n, -1], max: 1n })).toThrow(TypeError);
    expect(() => BoundedInt.define({ name: "X", min: 2n, max: 1n })).toThrow(RangeError);
    expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: 0n })).toThrow(RangeError);
    expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: [1n, -324] })).toThrow(
      RangeError,
    );
    expect(() => BoundedInt.define({ name: "X", min: 0n, max: L })).toThrow(RangeError);
  });

  test("the step gives the smallest scale k with 10^-k ≤ step, compared exactly", () => {
    const scale = (step: bigint | readonly [bigint, number]) =>
      BoundedInt.define({ name: "X", min: 0n, max: [1n, -300], step }).scale;
    expect(scale([25n, -3])).toBe(2);
    expect(scale([1n, -2])).toBe(2);
    expect(scale([99n, -4])).toBe(3);
    expect(scale(1000n)).toBe(-3);
    expect(scale(1999n)).toBe(-3);
    expect(scale([1n, -323])).toBe(323);
    expect(scale([1n, 400])).toBe(-308);
  });

  test("from rounds once to the step, ties to even, symmetrically", () => {
    const Reading = BoundedInt.define({
      name: "Reading",
      min: [-799n, -2],
      max: [1599n, -2],
      step: [1n, -2],
    });
    expect(Reading.from([125n, -3]).value).toBe(12n);
    expect(Reading.from([-125n, -3]).value).toBe(-12n);
    expect(Reading.from([135n, -3]).value).toBe(14n);
    expect(Reading.from([1276362n, -5]).value).toBe(1276n);
    const Volume = BoundedInt.define({ name: "Volume", min: 0n, max: 1000000n, step: 1000n });
    expect([1500n, 2500n, 3500n].map((x) => Volume.from(x).value)).toEqual([2n, 2n, 4n]);
  });
});

describe("BoundedInt stage 1: toString() writes the exact decimal", () => {
  test.each([
    ["Mass.from([23n, -1])", 1, 23n, 0.5, "2.3"],
    ["Mass.from(2n)", 1, 20n, 0.5, "2.0"],
    ["a negative value below 1", 2, -5n, 0.5, "-0.05"],
    ["zero at the scale 2", 2, 0n, 0.5, "0.00"],
    ["a negative scale", -3, 2n, 0.5, "2000"],
    ["an error of 5 steps", 1, 45n, 5, "4"],
    ["an error of 5 steps, negative", 1, -47n, 5, "-5"],
    ["an error of 50 steps at the scale 1", 1, 1234n, 50, "120"],
  ] as const)("%s gives %s", (_, scale, q, bound, text) => {
    const C = BoundedInt.defineRaw({ name: "C", scale, min: -10000n, end: 10000n });
    expect(C.fromValue(q, { bound }).toString()).toBe(text);
  });

  test("the digits of a large integer are all written", () => {
    expect(BoundedInt.from(10n ** 21n).toString()).toBe(`1${"0".repeat(21)}`);
    expect(`<${BoundedInt.from(L - 1n) as unknown as string}>`).toBe(`<${String(L - 1n)}>`);
  });

  test("the error of from is in the unit of x", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
    const m = Mass.from([23n, -1], 0.5);
    expect([m.errorBound, m.quadraticError, m.termError]).toEqual([5, 5, 5]);
    expect(m.toString()).toBe("2");
  });

  test("any other implicit conversion is a TypeError that points to toString() and value", () => {
    const x = BoundedInt.from(5n);
    expect(() => (x as unknown as bigint) + 1n).toThrow(TypeError);
    expect(() => (x as unknown as bigint) + 1n).toThrow(/x\.toString\(\).*x\.value/);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: stage 1 of the decimal classes: exact bounds, decimal inputs, the exact toString() (#44) |
