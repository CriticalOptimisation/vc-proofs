/**
 * The exact decimals of `BoundedInt` (#44; docs/core/bounded-int.md): every quantity is a
 * `bigint`, a `number` or a decimal `[n, e]`, worth `n · 10^e`, converted at once to an
 * exact decimal; a value is compared exactly with the bounds `[min, max)` of its class
 * before any rounding; `toString()` and `toLocaleString()` write the exact decimal. The
 * examples are those of the maintainer's order and reviews on PR #47. The same file runs
 * in Node.js and in every headless browser.
 *
 * The tests run on the generic class of `src/core/bounded-int.ts`, the base of the
 * `BoundedInt` that `./core` exports (#49): its bounds, its numbers and its families of
 * orders are those of the base.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../src/core/bounded-int.js";
import { RistrettoElement } from "../src/core/index.js";

const L = RistrettoElement.ORDER;

describe("BoundedInt: the bounds are exact decimals, checked before any rounding", () => {
  test("max 123123 kg at the step of 1000 kg: 123455 kg is a RangeError, not rounded to 123", () => {
    const Load = BoundedInt.define({ name: "Load", min: 0n, max: 123123n, step: 1000n });
    expect([Load.scale, Load.min, Load.max]).toEqual([-3, 0n, 123123n]);
    expect(() => Load.from(123455n)).toThrow(RangeError);
    expect(() => Load.from(123455n)).toThrow(/^Load\.from: /);
    expect(() => Load.from(123123n)).toThrow(RangeError);
    expect(Load.from(123122n).value).toBe(123n);
  });

  test("max 2.9999, (29999, -4): 2.99994 and 2.9999 are refused, 2.9998 is accepted", () => {
    const C = BoundedInt.define({ name: "C", min: 0n, max: [29999n, -4], step: 1n });
    expect(() => C.from([299994n, -5])).toThrow(RangeError);
    expect(() => C.from([29999n, -4])).toThrow(RangeError);
    expect(C.from([29998n, -4]).value).toBe(3n);
  });

  test("min 0.5223, (5223, -4): (52229, -5) is compared as 52229 < 52230, a RangeError", () => {
    const C = BoundedInt.define({ name: "C", min: [5223n, -4], max: 1n, step: [1n, -3] });
    expect(() => C.from([52229n, -5])).toThrow(RangeError);
    expect(C.from([52230n, -5]).value).toBe(522n);
    expect(C.from([5223n, -4]).value).toBe(522n);
  });

  test("a bound and a value written as the same number are the same decimal, of 15 digits", () => {
    const Reading = BoundedInt.define({ name: "Reading", min: -7.99, max: 15.99, step: 0.01 });
    expect(Reading.from(-7.99).value).toBe(-799n);
    expect(() => Reading.from(15.99)).toThrow(RangeError);
    expect(Reading.from(15.98).value).toBe(1598n);
    // At 15 digits, the number 15.99 is the decimal 15.99: [1599n, -2] is not below it.
    const Exact = BoundedInt.define({ name: "Exact", min: 0n, max: 15.99, step: [1n, -2] });
    expect(() => Exact.from([1599n, -2])).toThrow(RangeError);
    expect(Exact.from([1598n, -2]).value).toBe(1598n);
  });
});

describe("BoundedInt: the quantities", () => {
  test.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ['"5"', "5"],
    ["[5n]", [5n]],
    ["[5n, 0.5]", [5n, 0.5]],
    ["[5, 0]", [5, 0]],
    ["null", null],
  ] as const)(
    "from(%s) is a TypeError: only a bigint, a finite number or a decimal [n, e]",
    (_, x) => {
      expect(() => BoundedInt.from(x as never)).toThrow(TypeError);
      expect(() => BoundedInt.from(x as never)).toThrow(/^BoundedInt\.from: /);
    },
  );

  test("a number is converted at once to a decimal of 15 significant digits, on a class of at most 15 digits", () => {
    const Int = BoundedInt.define({ name: "Int", min: 0, max: 1e14 });
    expect(Int.from(5).value).toBe(5n);
    expect(Int.from(2 ** 40).value).toBe(2n ** 40n);
    expect(Int.from(0.5).value).toBe(0n);
    const Reading = BoundedInt.define({ name: "R", min: -8, max: 16, step: 0.01 });
    // 0.125 and 1.005 are ties at 15 digits: they go to the even integer.
    expect(Reading.from(0.125).value).toBe(12n);
    expect(Reading.from(-0.125).value).toBe(-12n);
    expect(Reading.from(1.005).value).toBe(100n);
    expect(Reading.from(1.015).value).toBe(102n);
  });

  test("a decimal finer than the step is rounded to it, ties to even", () => {
    expect(BoundedInt.from([15n, -1]).value).toBe(2n);
    expect(BoundedInt.from([25n, -1]).value).toBe(2n);
    expect(BoundedInt.from([7n, 2]).value).toBe(700n);
    expect(BoundedInt.from([1n, -400]).value).toBe(0n);
    expect(() => BoundedInt.from([-1n, -400])).toThrow(RangeError);
  });

  test("the step gives the smallest scale k with 10^-k ≤ step, compared exactly", () => {
    const scale = (step: bigint | number | readonly [bigint, number]) =>
      BoundedInt.define({ name: "X", min: 0n, max: [1n, -300], step }).scale;
    expect(scale([25n, -3])).toBe(2);
    expect(scale(0.025)).toBe(2);
    expect(scale([1n, -2])).toBe(2);
    expect(scale([99n, -4])).toBe(3);
    expect(scale(1000n)).toBe(-3);
    expect(scale(1999)).toBe(-3);
    expect(scale([1n, -323])).toBe(323);
  });

  test("from rounds once to the step, ties to even, symmetrically", () => {
    const Reading = BoundedInt.define({
      name: "Reading",
      min: [-799n, -2],
      max: [1600n, -2],
      step: [1n, -2],
    });
    expect(Reading.from([125n, -3]).value).toBe(12n);
    expect(Reading.from([-125n, -3]).value).toBe(-12n);
    expect(Reading.from([135n, -3]).value).toBe(14n);
    expect(Reading.from([1276362n, -5]).value).toBe(1276n);
  });
});

describe("BoundedInt: toString() and toLocaleString() write the exact decimal", () => {
  test.each([
    ["2.3 at the step 0.1", 1, 23n, undefined, "2.3"],
    ["2 at the step 0.1", 1, 20n, undefined, "2.0"],
    ["a negative value below 1", 2, -5n, undefined, "-0.05"],
    ["zero at the scale 2", 2, 0n, undefined, "0.00"],
    ["a negative scale", -3, 2n, undefined, "2000"],
    ["an error of 5 steps", 1, 45n, 0.5, "4"],
    ["an error of 5 steps, negative", 1, -47n, 0.5, "-5"],
    ["an error of 50 steps at the scale 1", 1, 1234n, 5, "120"],
    ["an error of 4.9 steps", 1, 45n, [49n, -2] as const, "4.5"],
  ] as const)("%s gives %s", (_, scale, q, error, text) => {
    const C = BoundedInt.define({
      name: "C",
      min: [-1n, 6],
      max: [1n, 6],
      step: [1n, -scale],
      ...(error === undefined ? {} : { error }),
    });
    expect(C.fromValue(q).toString()).toBe(text);
  });

  test.each([
    ["en-US", "1,234.50"],
    ["fr-FR", "1 234,50"],
    ["de-DE", "1.234,50"],
  ] as const)(
    "toLocaleString(%s) writes the digits of toString() in the form of the locale",
    (locale, text) => {
      const C = BoundedInt.define({ name: "C", min: 0, max: 10000, step: 0.01 });
      const x = C.fromValue(123450n);
      expect(x.toString()).toBe("1234.50");
      expect(x.toLocaleString(locale)).toBe(text);
    },
  );

  test("toLocaleString() is exact beyond the digits of a number", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: [1n, 30], step: [1n, -30] });
    const q = 123456789012345678901234567890123456789012345678901n;
    const x = C.fromValue(q);
    expect(x.toString()).toBe("123456789012345678901.234567890123456789012345678901");
    expect(x.toLocaleString("fr-FR", { useGrouping: false })).toBe(
      "123456789012345678901,234567890123456789012345678901",
    );
  });

  test("the digits of a large integer are all written", () => {
    const Unsigned = BoundedInt.define({ name: "Unsigned", min: 0n, max: L });
    expect(Unsigned.from(10n ** 21n).toString()).toBe(`1${"0".repeat(21)}`);
    expect(`<${Unsigned.from(L - 1n) as unknown as string}>`).toBe(`<${String(L - 1n)}>`);
  });

  test("toString() does not go through valueOf(): a subclass that overrides valueOf() keeps its string", () => {
    class Shifted extends BoundedInt {
      override valueOf(): number {
        return 42;
      }
    }
    expect(Shifted.from(7n).toString()).toBe("7");
    expect(Shifted.from(7n).toLocaleString("en-US")).toBe("7");
  });

  test("any other implicit conversion is a TypeError that points to valueOf() and value", () => {
    const x = BoundedInt.from(5n);
    expect(() => (x as unknown as bigint) + 1n).toThrow(TypeError);
    expect(() => (x as unknown as bigint) + 1n).toThrow(/x\.valueOf\(\).*x\.value/);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the exact decimals: exact bounds, quantities, the exact toString() and toLocaleString() (#44) |
