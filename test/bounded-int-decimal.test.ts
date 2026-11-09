/**
 * The exact decimals of `BoundedInt` (#44; docs/core/bounded-int.md): every quantity is a
 * `bigint`, a `number` or a decimal `[n, e]`, worth `n · 10^e`, converted at once to an
 * exact decimal; a value is compared exactly with the bounds `[min, max)` of its class
 * before any rounding; `toString()` and `toLocaleString()` write the exact decimal. The
 * examples are those of the maintainer's order and reviews on PR #47. The same file runs
 * in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";

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

  test("a bound and a value written as the same number are the same decimal", () => {
    const Reading = BoundedInt.define({ name: "Reading", min: -7.99, max: 15.99, step: 0.01 });
    expect(Reading.from(-7.99).value).toBe(-799n);
    expect(() => Reading.from(15.99)).toThrow(RangeError);
    expect(Reading.from(15.98).value).toBe(1598n);
    // As decimals, 15.99 is below the number 15.99: 15.9900000000000002131…
    const Exact = BoundedInt.define({ name: "Exact", min: 0n, max: 15.99, step: [1n, -2] });
    expect(Exact.from([1599n, -2]).value).toBe(1599n);
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

  test("a number is converted at once to the exact decimal of its binary value", () => {
    expect(BoundedInt.from(5).value).toBe(5n);
    expect(BoundedInt.from(2 ** 60).value).toBe(2n ** 60n);
    expect(() => BoundedInt.from(0.5)).toThrow(TypeError);
    const Reading = BoundedInt.define({ name: "R", min: -8, max: 16, step: 0.01 });
    // 0.125 is exact in binary: a tie, to even. 1.005 is 1.00499999999999989…: no tie.
    expect(Reading.from(0.125).value).toBe(12n);
    expect(Reading.from(-0.125).value).toBe(-12n);
    expect(Reading.from(1.005).value).toBe(100n);
  });

  test("on a class with integerOnly, a decimal that is not an integer is a TypeError", () => {
    expect(() => BoundedInt.from([15n, -1])).toThrow(TypeError);
    expect(BoundedInt.from([150n, -1]).value).toBe(15n);
    expect(BoundedInt.from([7n, 2]).value).toBe(700n);
    // The type comes first: −10^-400 is not an integer.
    expect(() => BoundedInt.from([-1n, -400])).toThrow(TypeError);
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
    expect(BoundedInt.from(10n ** 21n).toString()).toBe(`1${"0".repeat(21)}`);
    expect(`<${BoundedInt.from(L - 1n) as unknown as string}>`).toBe(`<${String(L - 1n)}>`);
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

// REVIEW PLACEHOLDER (#44, review of PR #47: the bounds [min, max), kept exactly;
// no defineRaw, end or per-value errors; every quantity an exact decimal)
// max 123123 kg at the step of 1000 kg: 123455 kg is a RangeError… -> (the same; 123123 kg itself is
//   now refused: the bounds are [min, max))
// max 2.9999, (29999, -4): 2.99994, (299994, -5), is a RangeError; 2.9999 is accepted
//   -> max 2.9999, (29999, -4): 2.99994 and 2.9999 are refused, 2.9998 is accepted
// min 0.5223… -> (unchanged); Mass, from 0 to 100 at the step of 0.1: 100.04 and −0.04 are refused…
//   -> test/bounded-int-scale.test.ts: a value beyond the bounds is refused, even when it would round
//      into them; a bound and a value written as the same number are the same decimal
// the exponents are compared without building huge powers of ten
//   -> test/bounded-int-scale-edge.test.ts: huge exponents are compared without building their powers of ten
// a class made by defineRaw, or written by hand, has the exact bounds of its integers;
// a class written by hand may declare exact bounds, which must scale into [min, end)
//   -> removed with defineRaw, end, lowest and highest: a class written by hand declares min and max
// BoundedInt has the exact bounds 0 and ℓ − 1 -> test/bounded-int-scale.test.ts: BoundedInt accepts 0 and ℓ − 1…
// the factories take integerOnly and the order (defineRaw makes an integerOnly class…; BoundedInt has
// no order…; define and defineRaw take an order…; a class with an order passes it on…)
//   -> test/bounded-int-scale.test.ts: the order, the number of distinct values; test/bounded-int-scale-edge.test.ts:
//      integerOnly with a step
// from(%s) is a TypeError: only a bigint, a finite number or a decimal [n, e] -> (unchanged)
// a number x is converted at once to the exact decimal of its binary value -> (unchanged, shorter)
// on a class with integerOnly, a decimal that is not an integer is a TypeError -> (unchanged)
// define takes bigints, numbers and decimals, and refuses the other types; define and defineRaw take
// numbers… -> test/bounded-int-scale.test.ts: define with %s throws…; BoundedInt states its own range
//   -> test/bounded-int-scale.test.ts: BoundedInt has … the bounds [0, ℓ) with ℓ written in the class
// the step gives the smallest scale k…; from rounds once to the step… -> (unchanged)
// %s gives %s (toString) -> (the same, with the error of the class); toLocaleString(%s)…; exact beyond
// the digits of a number; the digits of a large integer are all written -> (unchanged)
// the errors belong to the class: define sets them from its error…; defineRaw takes the errors of the
// class…; a class written by hand may declare its errors…
//   -> test/bounded-int-scale.test.ts: the errors, relative to max − min; test/bounded-int-scale-edge.test.ts:
//      the error decides the digits shown, at every scale
// any other implicit conversion is a TypeError that points to toString() and value
//   -> any other implicit conversion is a TypeError that points to valueOf() and value
//
// describe("BoundedInt stage 1: the bounds are exact decimals, checked before any rounding", () => {
//   test("max 123123 kg at the step of 1000 kg: 123455 kg is a RangeError, not rounded to 123", () => {
//     const Load = BoundedInt.define({ name: "Load", min: 0n, max: 123123n, step: 1000n });
//     expect([Load.scale, Load.min, Load.end]).toEqual([-3, 0n, 124n]);
//     expect([Load.lowest, Load.highest]).toEqual([
//       [0n, 0],
//       [123123n, 0],
//     ]);
//     expect(() => Load.from(123455n)).toThrow(RangeError);
//     expect(() => Load.from(123455n)).toThrow(/^Load\.from: /);
//     expect(() => Load.from(123124n)).toThrow(RangeError);
//     expect(Load.from(123123n).value).toBe(123n);
//     expect(Load.from(123000n).value).toBe(123n);
//   });
//
//   test("max 2.9999, (29999, -4): 2.99994, (299994, -5), is a RangeError; 2.9999 is accepted", () => {
//     const C = BoundedInt.define({ name: "C", min: 0n, max: [29999n, -4], step: 1n });
//     expect(() => C.from([299994n, -5])).toThrow(RangeError);
//     expect(C.from([29999n, -4]).value).toBe(3n);
//     expect(C.from([299990n, -5]).value).toBe(3n);
//   });
//
//   test("min 0.5223, (5223, -4): (52229, -5) is compared as 52229 < 52230, a RangeError", () => {
//     const C = BoundedInt.define({ name: "C", min: [5223n, -4], max: 1n, step: [1n, -3] });
//     expect(() => C.from([52229n, -5])).toThrow(RangeError);
//     expect(C.from([52230n, -5]).value).toBe(522n);
//     expect(C.from([5223n, -4]).value).toBe(522n);
//   });
//
//   test("Mass, from 0 to 100 at the step of 0.1: 100.04 and −0.04 are refused, not rounded into the range", () => {
//     const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
//     expect([Mass.scale, Mass.min, Mass.end]).toEqual([1, 0n, 1001n]);
//     expect(() => Mass.from([10004n, -2])).toThrow(RangeError);
//     expect(() => Mass.from([-4n, -2])).toThrow(RangeError);
//     expect(Mass.from(100n).value).toBe(1000n);
//     expect(Mass.from([23n, -1]).value).toBe(23n);
//     expect(Mass.from(5n).value).toBe(50n);
//   });
//
//   test("the exponents are compared without building huge powers of ten", () => {
//     const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
//     expect(() => Mass.from([1n, 1_000_000_000])).toThrow(RangeError);
//     expect(() => Mass.from([-1n, -1_000_000_000])).toThrow(RangeError);
//     expect(Mass.from([1n, -1_000_000_000]).value).toBe(0n);
//     expect(Mass.from([0n, 1_000_000_000]).value).toBe(0n);
//   });
//
//   test("a class made by defineRaw, or written by hand, has the exact bounds of its integers", () => {
//     const Difference = BoundedInt.defineRaw({ name: "D", scale: 1, min: -1000n, end: 1001n });
//     expect(Difference.from(100n).value).toBe(1000n);
//     expect(() => Difference.from([10001n, -2])).toThrow(RangeError);
//     expect(Difference.from([10000n, -2]).value).toBe(1000n);
//     class Days extends BoundedInt {
//       static override min = 0n;
//       static override end = 365251n;
//     }
//     expect(Days.from(365250n).value).toBe(365250n);
//     expect(() => Days.from(365251n)).toThrow(RangeError);
//   });
//
//   test("a class written by hand may declare exact bounds, which must scale into [min, end)", () => {
//     class Grams extends BoundedInt {
//       static override scale = 0;
//       static override integerOnly = false;
//       static override min = 0n;
//       static override end = 1001n;
//       static override lowest = [0n, 0] as const;
//       static override highest = [10005n, -1] as const;
//     }
//     expect(Grams.from([10004n, -1]).value).toBe(1000n);
//     expect(() => Grams.from([10006n, -1])).toThrow(RangeError);
//     class Beyond extends BoundedInt {
//       static override min = 0n;
//       static override end = 10n;
//       static override lowest = [0n, 0] as const;
//       static override highest = [10n, 0] as const;
//     }
//     expect(() => Beyond.fromValue(0n)).toThrow(RangeError);
//     expect(() => Beyond.fromValue(0n)).toThrow(/Beyond/);
//   });
//
//   test("BoundedInt has the exact bounds 0 and ℓ − 1", () => {
//     expect(BoundedInt.from(L - 1n).value).toBe(L - 1n);
//     expect(() => BoundedInt.from(L)).toThrow(RangeError);
//     expect(() => BoundedInt.from(-1n)).toThrow(RangeError);
//     expect(() => BoundedInt.from([-1n, -400])).toThrow(TypeError);
//     expect(BoundedInt.from([0n, -400]).value).toBe(0n);
//   });
// });
//
// describe("BoundedInt stage 1: the factories take integerOnly and the order", () => {
//   test("defineRaw makes an integerOnly class on request, and not otherwise", () => {
//     const Count = BoundedInt.defineRaw({
//       name: "Count",
//       scale: -3,
//       min: 0n,
//       end: 10n,
//       integerOnly: true,
//     });
//     expect(Count.integerOnly).toBe(true);
//     expect(Count.from(2000n).value).toBe(2n);
//     expect(() => Count.from([15n, -1])).toThrow(TypeError);
//     const Free = BoundedInt.defineRaw({ name: "Free", scale: 0, min: 0n, end: 10n });
//     expect(Free.integerOnly).toBe(false);
//     expect(Free.from([15n, -1]).value).toBe(2n);
//     expect(() =>
//       BoundedInt.defineRaw({ name: "X", scale: 0, min: 0n, end: 1n, integerOnly: 1 as never }),
//     ).toThrow(TypeError);
//   });
//
//   test("BoundedInt has no order: end − min has no limit", () => {
//     expect(BoundedInt.order).toBeUndefined();
//     expect(BoundedInt.end).toBe(L);
//     const Wide = BoundedInt.defineRaw({ name: "Wide", scale: 0, min: -(L ** 2n), end: L ** 2n });
//     expect(Wide.order).toBeUndefined();
//     expect(Wide.fromValue(L ** 2n - 1n).value).toBe(L ** 2n - 1n);
//   });
//
//   test("define and defineRaw take an order, a bigint or a form with ORDER: a byte holds 256 integers", () => {
//     const Byte = BoundedInt.defineRaw({ name: "Byte", scale: 0, min: 0n, end: 256n, order: 256n });
//     expect(Byte.order).toBe(256n);
//     expect(() =>
//       BoundedInt.defineRaw({ name: "Over", scale: 0, min: 0n, end: 257n, order: 256n }),
//     ).toThrow(RangeError);
//     const Signed = BoundedInt.define({ name: "Signed", min: -128n, max: 127n, order: 256n });
//     expect([Signed.min, Signed.end, Signed.order]).toEqual([-128n, 128n, 256n]);
//     expect(() => BoundedInt.define({ name: "B", min: 0n, max: 256n, order: 256n })).toThrow(
//       RangeError,
//     );
//     expect(BoundedInt.define({ name: "E", min: 0n, max: 1n, order: RistrettoElement }).order).toBe(
//       L,
//     );
//     expect(BoundedInt.define({ name: "F", min: 0n, max: 1n, order: { ORDER: 11n } }).order).toBe(
//       11n,
//     );
//     expect(() =>
//       BoundedInt.define({ name: "G", min: 0n, max: 1n, order: { ORDER: 11 } as never }),
//     ).toThrow(TypeError);
//     expect(() =>
//       BoundedInt.defineRaw({ name: "H", scale: 0, min: 0n, end: 1n, order: 0n }),
//     ).toThrow(RangeError);
//   });
//
//   test("a class with an order passes it on to the classes made from it", () => {
//     const Small = BoundedInt.defineRaw({ name: "Small", scale: 0, min: 0n, end: 5n, order: 11n });
//     const Sub = Small.defineRaw({ name: "Sub", scale: 0, min: 0n, end: 11n });
//     expect(Sub.order).toBe(11n);
//     expect(() => Small.defineRaw({ name: "Over", scale: 0, min: 0n, end: 12n })).toThrow(
//       RangeError,
//     );
//   });
// });
//
// describe("BoundedInt stage 1: the inputs", () => {
//   test.each([
//     ["NaN", NaN],
//     ["Infinity", Infinity],
//     ['"5"', "5"],
//     ["[5n]", [5n]],
//     ["[5n, 0.5]", [5n, 0.5]],
//     ["[5, 0]", [5, 0]],
//     ["null", null],
//   ] as const)(
//     "from(%s) is a TypeError: only a bigint, a finite number or a decimal [n, e]",
//     (_, x) => {
//       expect(() => BoundedInt.from(x as never)).toThrow(TypeError);
//       expect(() => BoundedInt.from(x as never)).toThrow(/^BoundedInt\.from: /);
//     },
//   );
//
//   test("a number x is converted at once to the exact decimal of its binary value", () => {
//     expect(BoundedInt.from(5).value).toBe(5n);
//     expect(BoundedInt.from(-0).value).toBe(0n);
//     expect(BoundedInt.from(2 ** 60).value).toBe(2n ** 60n);
//     expect(() => BoundedInt.from(0.5)).toThrow(TypeError);
//     expect(() => BoundedInt.from(-1)).toThrow(RangeError);
//     const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
//     expect(Mass.from(2.3).value).toBe(23n);
//     expect(Mass.from(100).value).toBe(1000n);
//     expect(() => Mass.from(100.04)).toThrow(RangeError);
//     expect(() => Mass.from(-0.04)).toThrow(RangeError);
//     const Reading = BoundedInt.define({
//       name: "Reading",
//       min: [-799n, -2],
//       max: [1600n, -2],
//       step: [1n, -2],
//     });
//     expect(Reading.from(0.125).value).toBe(12n);
//     expect(Reading.from(-0.125).value).toBe(-12n);
//     expect(Reading.from(1.005).value).toBe(100n);
//     const Exact = BoundedInt.define({ name: "Exact", min: 0n, max: [1599n, -2], step: [1n, -2] });
//     expect(() => Exact.from(15.99)).toThrow(RangeError);
//     expect(Exact.from([1599n, -2]).value).toBe(1599n);
//     expect(
//       BoundedInt.defineRaw({ name: "Tiny", scale: 323, min: 0n, end: 10n }).from(5e-323).value,
//     ).toBe(5n);
//   });
//
//   test("on a class with integerOnly, a decimal that is not an integer is a TypeError", () => {
//     expect(() => BoundedInt.from([15n, -1])).toThrow(TypeError);
//     expect(BoundedInt.from([150n, -1]).value).toBe(15n);
//     expect(BoundedInt.from([7n, 2]).value).toBe(700n);
//   });
//
//   test("define takes bigints, numbers and decimals, and refuses the other types", () => {
//     expect(() => BoundedInt.define({ name: "X", min: "0" as never, max: 1n })).toThrow(TypeError);
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: NaN })).toThrow(TypeError);
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: Infinity })).toThrow(
//       TypeError,
//     );
//     expect(() => BoundedInt.define({ name: "X", min: [5n, -1], max: 1n })).toThrow(TypeError);
//     expect(() => BoundedInt.define({ name: "X", min: 0.5, max: 1 })).toThrow(TypeError);
//     expect(() => BoundedInt.define({ name: "X", min: 2n, max: 1n })).toThrow(RangeError);
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: 0n })).toThrow(RangeError);
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: -0.1 })).toThrow(
//       RangeError,
//     );
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, step: [1n, -324] })).toThrow(
//       RangeError,
//     );
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: L, order: L })).toThrow(RangeError);
//   });
//
//   test("define and defineRaw take numbers, converted to the exact decimal of their binary value", () => {
//     const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100, step: 0.1 });
//     expect([Mass.scale, Mass.min, Mass.end]).toEqual([1, 0n, 1001n]);
//     expect(Mass.highest).toEqual([1n, 2]);
//     expect(() => Mass.from(100.04)).toThrow(RangeError);
//     const Reading = BoundedInt.define({ name: "Reading", min: -7.99, max: 15.99, step: 0.01 });
//     expect([Reading.scale, Reading.min, Reading.end]).toEqual([2, -799n, 1600n]);
//     expect(Reading.from(15.99).value).toBe(1599n);
//     expect(Reading.from(-7.99).value).toBe(-799n);
//     expect(() => Reading.from([1600n, -2])).toThrow(RangeError);
//     expect(BoundedInt.define({ name: "Fine", min: 0, max: 1, step: 0.025 }).scale).toBe(2);
//     expect(BoundedInt.define({ name: "Coarse", min: 0, max: 1e6, step: 1000 }).scale).toBe(-3);
//     const Rough = BoundedInt.define({ name: "Rough", min: 0, max: 100, step: 0.1, error: 0.5 });
//     expect(Rough.errorBound).toEqual([5n, 0]);
//     const Raw = BoundedInt.defineRaw({ name: "Raw", scale: 1, min: -1000, end: 1001 });
//     expect([Raw.min, Raw.end]).toEqual([-1000n, 1001n]);
//     expect(BoundedInt.defineRaw({ name: "Big", scale: 0, min: 0, end: 2 ** 60 }).end).toBe(
//       2n ** 60n,
//     );
//     expect(() => BoundedInt.defineRaw({ name: "X", scale: 0, min: 0.5, end: 2 })).toThrow(
//       TypeError,
//     );
//     expect(() => BoundedInt.defineRaw({ name: "X", scale: 0, min: 0, end: Infinity })).toThrow(
//       TypeError,
//     );
//   });
//
//   test("BoundedInt states its own range: its end is the order of ristretto255, checked here", () => {
//     expect([BoundedInt.min, BoundedInt.end]).toEqual([0n, RistrettoElement.ORDER]);
//   });
//
//   test("the step gives the smallest scale k with 10^-k ≤ step, compared exactly", () => {
//     const scale = (step: bigint | readonly [bigint, number]) =>
//       BoundedInt.define({ name: "X", min: 0n, max: [1n, -300], step }).scale;
//     expect(scale([25n, -3])).toBe(2);
//     expect(scale([1n, -2])).toBe(2);
//     expect(scale([99n, -4])).toBe(3);
//     expect(scale(1000n)).toBe(-3);
//     expect(scale(1999n)).toBe(-3);
//     expect(scale([1n, -323])).toBe(323);
//     expect(scale([1n, 400])).toBe(-308);
//   });
//
//   test("from rounds once to the step, ties to even, symmetrically", () => {
//     const Reading = BoundedInt.define({
//       name: "Reading",
//       min: [-799n, -2],
//       max: [1599n, -2],
//       step: [1n, -2],
//     });
//     expect(Reading.from([125n, -3]).value).toBe(12n);
//     expect(Reading.from([-125n, -3]).value).toBe(-12n);
//     expect(Reading.from([135n, -3]).value).toBe(14n);
//     expect(Reading.from([1276362n, -5]).value).toBe(1276n);
//     const Volume = BoundedInt.define({ name: "Volume", min: 0n, max: 1000000n, step: 1000n });
//     expect([1500n, 2500n, 3500n].map((x) => Volume.from(x).value)).toEqual([2n, 2n, 4n]);
//   });
// });
//
// describe("BoundedInt stage 1: toString() writes the exact decimal", () => {
//   test.each([
//     ["Mass.from([23n, -1])", 1, 23n, [5n, -1], "2.3"],
//     ["Mass.from(2n)", 1, 20n, [5n, -1], "2.0"],
//     ["a negative value below 1", 2, -5n, [5n, -1], "-0.05"],
//     ["zero at the scale 2", 2, 0n, [5n, -1], "0.00"],
//     ["a negative scale", -3, 2n, [5n, -1], "2000"],
//     ["an error of 5 steps", 1, 45n, 5n, "4"],
//     ["an error of 5 steps, negative", 1, -47n, 5n, "-5"],
//     ["an error of 50 steps at the scale 1", 1, 1234n, 50n, "120"],
//     ["an error of 4.9 steps", 1, 45n, [49n, -1], "4.5"],
//     ["a huge error", 1, 45n, [1n, 1000], "0"],
//   ] as const)("%s gives %s", (_, scale, q, bound, text) => {
//     const C = BoundedInt.defineRaw({
//       name: "C",
//       scale,
//       min: -10000n,
//       end: 10000n,
//       errors: { bound },
//     });
//     expect(C.fromValue(q).toString()).toBe(text);
//   });
//
//   test.each([
//     ["en-US", "1,234.50"],
//     ["fr-FR", "1\u202f234,50"],
//     ["de-DE", "1.234,50"],
//   ] as const)(
//     "toLocaleString(%s) writes the digits of toString() in the form of the locale",
//     (locale, text) => {
//       const C = BoundedInt.defineRaw({ name: "C", scale: 2, min: 0n, end: 1000000n });
//       const x = C.fromValue(123450n);
//       expect(x.toString()).toBe("1234.50");
//       expect(x.toLocaleString(locale)).toBe(text);
//     },
//   );
//
//   test("toLocaleString() is exact beyond the digits of a number", () => {
//     const C = BoundedInt.defineRaw({ name: "C", scale: 30, min: 0n, end: 10n ** 60n });
//     const q = 123456789012345678901234567890123456789012345678901n;
//     const x = C.fromValue(q);
//     expect(x.toString()).toBe("123456789012345678901.234567890123456789012345678901");
//     expect(x.toLocaleString("fr-FR", { useGrouping: false })).toBe(
//       "123456789012345678901,234567890123456789012345678901",
//     );
//   });
//
//   test("the digits of a large integer are all written", () => {
//     expect(BoundedInt.from(10n ** 21n).toString()).toBe(`1${"0".repeat(21)}`);
//     expect(`<${BoundedInt.from(L - 1n) as unknown as string}>`).toBe(`<${String(L - 1n)}>`);
//   });
//
//   test("the errors belong to the class: define sets them from its error, in the unit of the values", () => {
//     const Mass = BoundedInt.define({ name: "Mass", min: 0n, max: 100n, step: [1n, -1] });
//     expect([Mass.errorBound, Mass.quadraticError, Mass.termError]).toEqual([
//       [5n, -1],
//       [5n, -1],
//       [5n, -1],
//     ]);
//     const Rough = BoundedInt.define({
//       name: "Rough",
//       min: 0n,
//       max: 100n,
//       step: [1n, -1],
//       error: [5n, -1],
//     });
//     expect([Rough.errorBound, Rough.quadraticError, Rough.termError]).toEqual([
//       [5n, 0],
//       [5n, 0],
//       [5n, 0],
//     ]);
//     expect(Rough.from([23n, -1]).toString()).toBe("2");
//     expect(Rough.fromValue(23n).toString()).toBe("2");
//     expect("errorBound" in Rough.from(2n)).toBe(false);
//     expect(BoundedInt.define({ name: "E", min: 0n, max: 1n, error: 0n }).errorBound).toEqual([
//       0n,
//       0,
//     ]);
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, error: "0.5" as never })).toThrow(
//       TypeError,
//     );
//     expect(() => BoundedInt.define({ name: "X", min: 0n, max: 1n, error: -1n })).toThrow(
//       RangeError,
//     );
//   });
//
//   test("defineRaw takes the errors of the class, in steps, exact and ordered exactly", () => {
//     const C = BoundedInt.defineRaw({
//       name: "C",
//       scale: 1,
//       min: -1000n,
//       end: 1001n,
//       errors: { bound: 3n, quadratic: [25n, -1] },
//     });
//     expect([C.errorBound, C.quadraticError, C.termError]).toEqual([
//       [3n, 0],
//       [25n, -1],
//       [25n, -1],
//     ]);
//     const spec = { name: "D", scale: 1, min: -1000n, end: 1001n };
//     expect(BoundedInt.defineRaw(spec).termError).toEqual([5n, -1]);
//     expect(() => BoundedInt.defineRaw({ ...spec, errors: { bound: 1 as never } })).toThrow(
//       TypeError,
//     );
//     expect(() =>
//       BoundedInt.defineRaw({ ...spec, errors: { bound: [1n, 0], quadratic: [10001n, -4] } }),
//     ).toThrow(RangeError);
//     expect(() => BoundedInt.defineRaw({ ...spec, errors: { bound: -1n } })).toThrow(RangeError);
//   });
//
//   test("a class written by hand may declare its errors, checked at its first use", () => {
//     class Coarse extends BoundedInt {
//       static override errorBound = [5n, 0] as const;
//       static override quadraticError = [5n, 0] as const;
//       static override termError = [5n, 0] as const;
//     }
//     expect(Coarse.fromValue(47n).toString()).toBe("50");
//     class Disordered extends BoundedInt {
//       static override termError = [1n, 0] as const;
//     }
//     expect(() => Disordered.fromValue(1n)).toThrow(RangeError);
//     expect(() => Disordered.fromValue(1n)).toThrow(/Disordered/);
//   });
//
//   test("any other implicit conversion is a TypeError that points to toString() and value", () => {
//     const x = BoundedInt.from(5n);
//     expect(() => (x as unknown as bigint) + 1n).toThrow(TypeError);
//     expect(() => (x as unknown as bigint) + 1n).toThrow(/x\.toString\(\).*x\.value/);
//   });
// });

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the exact decimals: exact bounds, quantities, the exact toString() and toLocaleString() (#44) |
