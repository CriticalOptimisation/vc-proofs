/**
 * The edge cases of the classes of `BoundedInt` (#44; docs/core/bounded-int.md): the ends
 * of the scales, the exact decimal of a `number`, negative zero, `NaN`, infinities and
 * subnormal inputs, negative ties at every scale, `valueOf()` near `±Infinity`, more than
 * 100 decimals, huge exponents, a class written by hand checked once, and the error of a
 * class at every scale. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../src/core/index.js";

/** A class with the scale `k`, the bounds `±10^60`, and no `integerOnly`. */
const wide = (k: number) =>
  BoundedInt.define({ name: `Wide${String(k)}`, min: [-1n, 60], max: [1n, 60], step: [1n, -k] });

describe("BoundedInt.define: the ends of the scales", () => {
  test("the step 10^-323 gives the scale 323, and a finer one is refused", () => {
    expect(wide(323).scale).toBe(323);
    expect(() => wide(324)).toThrow(RangeError);
    expect(() => BoundedInt.define({ name: "X", min: 0, max: 1, step: 5e-324 })).toThrow(
      RangeError,
    );
  });

  test("the step 10^308 gives the scale −308, and a coarser one too: it is the coarsest", () => {
    expect(wide(-308).scale).toBe(-308);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1, step: [1n, 400] }).scale).toBe(-308);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1, step: 1e308 }).scale).toBe(-308);
  });

  test("the scales ±22 and ±23 have no special meaning", () => {
    for (const k of [-23, -22, 22, 23]) expect(wide(k).scale).toBe(k);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1, step: 9e-23 }).scale).toBe(23);
  });
});

describe("BoundedInt: the exact decimal of a number", () => {
  test("0.1 is 0.1000000000000000055511151231257827021181583404541015625, exactly", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: 1, step: [1n, -55] });
    expect(C.from(0.1).toString()).toBe(
      "0.1000000000000000055511151231257827021181583404541015625",
    );
    expect(C.from(0.1).valueOf()).toBe(0.1);
  });

  test("Number.MAX_VALUE and 2^1023 are their exact integers", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: [1n, 400] });
    expect(C.from(Number.MAX_VALUE).value).toBe(BigInt(Number.MAX_VALUE));
    expect(C.from(2 ** 1023).value).toBe(2n ** 1023n);
  });

  test("a mantissa of 53 ones: 2^53 − 1, and (2^53 − 1) · 2^-60, exactly", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: 1, step: [1n, -60] });
    const x = (2 ** 53 - 1) * 2 ** -60;
    expect(C.from(x).value).toBe((2n ** 53n - 1n) * 5n ** 60n);
    expect(BoundedInt.from(2 ** 53 - 1).value).toBe(9007199254740991n);
  });
});

describe("BoundedInt classes: negative zero, NaN, infinities and subnormals", () => {
  test("from(-0) holds 0n on every class, and valueOf() is +0", () => {
    for (const C of [BoundedInt, wide(2), wide(-3)]) {
      const x = C.from(-0);
      expect(x.value).toBe(0n);
      expect(Object.is(x.valueOf(), 0)).toBe(true);
    }
  });

  test.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("from(%s) throws a TypeError that names the class, at every scale", (_, x) => {
    for (const C of [BoundedInt, wide(2), wide(-3)]) {
      expect(() => C.from(x)).toThrow(TypeError);
      expect(() => C.from(x)).toThrow(new RegExp(`^${C.name}\\.from: `));
    }
  });

  test("a subnormal is not an integer: BoundedInt.from(Number.MIN_VALUE) is a TypeError", () => {
    expect(() => BoundedInt.from(Number.MIN_VALUE)).toThrow(TypeError);
  });

  test("at the scale 323, the smallest subnormal rounds to 0n and the largest to its integer", () => {
    const C = wide(323);
    expect(C.from(Number.MIN_VALUE).value).toBe(0n);
    expect(C.from(2.225073858507201e-308).value).toBe(2225073858507201n);
  });
});

describe("BoundedInt classes: negative ties go to the even integer, at every scale", () => {
  /** The even one of the two integers around the tie `-a/2`, for an odd `a`. */
  const even = (a: bigint) => {
    const below = -(a + 1n) / 2n;
    return below % 2n === 0n ? below : below + 1n;
  };

  const scales = Array.from({ length: 45 }, (_, i) => i - 22);

  test.each(scales)("at the scale %s, the ties -a/2 round to even, as their opposites", (k) => {
    const C = wide(k);
    // c · 5^22 stays below 2^53 for c ≤ 3, so every x below is an exact number.
    for (const c of [1, 3]) {
      // x · 10^k is the tie -(c · 5^k) / 2 for k ≥ 0, and -c / 2 for k < 0.
      const x = k >= 0 ? -c * 2 ** -(k + 1) : -c * 5 * Number(`1e${String(-k - 1)}`);
      const a = k >= 0 ? BigInt(c) * 5n ** BigInt(k) : BigInt(c);
      expect(C.from(x).value).toBe(even(a));
      expect(C.from(-x).value).toBe(-even(a));
      if (k < 0) expect(C.from(-BigInt(c) * 5n * 10n ** BigInt(-k - 1)).value).toBe(even(a));
    }
  });
});

describe("BoundedInt classes: valueOf(), toString() and toLocaleString() at the ends", () => {
  test("valueOf() throws a RangeError that names valueOf where the number is ±Infinity; toString() writes every digit", () => {
    const Coarse = BoundedInt.define({
      name: "Coarse",
      min: [-1n, 400],
      max: [1n, 400],
      step: [1n, 308],
    });
    const x = Coarse.from([1n, 309]);
    expect(x.value).toBe(10n);
    expect(() => x.valueOf()).toThrow(RangeError);
    expect(() => x.valueOf()).toThrow(/^Coarse\.valueOf: /);
    expect(x.toString()).toBe(`1${"0".repeat(309)}`);
    expect(() => Coarse.from([-1n, 309]).valueOf()).toThrow(RangeError);
    expect(Coarse.from([1n, 308]).valueOf()).toBe(1e308);
  });

  test("at the scale 300, valueOf() is the number nearest to the decimal", () => {
    const Fine = BoundedInt.define({ name: "Fine", min: 0, max: 1, step: [1n, -300] });
    expect(Fine.fromValue(10n ** 70n).valueOf()).toBe(1e-230);
    expect(Fine.fromValue(123n).valueOf()).toBe(1.23e-298);
  });

  test("toLocaleString() refuses more than 100 decimals with a RangeError; toString() writes them", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: 1, step: [1n, -101] });
    expect(C.fromValue(1n).toString()).toBe(`0.${"0".repeat(100)}1`);
    expect(() => C.fromValue(1n).toLocaleString("en-US")).toThrow(RangeError);
    const D = BoundedInt.define({ name: "D", min: 0, max: 1, step: [1n, -100] });
    expect(D.fromValue(1n).toLocaleString("en-US")).toBe(`0.${"0".repeat(99)}1`);
  });

  test("huge exponents are compared without building their powers of ten", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    expect(() => Mass.from([1n, 1_000_000_000])).toThrow(RangeError);
    expect(() => Mass.from([-1n, -1_000_000_000])).toThrow(RangeError);
    expect(Mass.from([1n, -1_000_000_000]).value).toBe(0n);
    expect(Mass.from([0n, 1_000_000_000]).value).toBe(0n);
  });
});

describe("BoundedInt classes: a class written by hand is checked once", () => {
  test("constants changed after the first use are not read again", () => {
    class Later extends BoundedInt {
      static override min = 0n;
      static override max = 10n;
    }
    expect(Later.from(7).value).toBe(7n);
    Object.defineProperty(Later, "max", { value: 5n });
    expect(Later.from(7).value).toBe(7n);
  });

  test("a class that fails its check is checked again at its next use", () => {
    class Fixed extends BoundedInt {
      static override min = 5n;
      static override max = 5n;
    }
    expect(() => Fixed.from(5)).toThrow(RangeError);
    Object.defineProperty(Fixed, "max", { value: 10n });
    expect(Fixed.from(5).value).toBe(5n);
  });

  test("a subclass of a class made by define is checked on its own, and inherits its constants", () => {
    const Mass = BoundedInt.define({ name: "Mass", min: 0, max: 100.05, step: 0.1 });
    class Whole extends Mass {
      static override integerOnly = true;
    }
    expect(Whole.scale).toBe(1);
    expect(Whole.from(2).value).toBe(20n);
    expect(() => Whole.from(2.3)).toThrow(TypeError);
    expect(Mass.from(2.3).value).toBe(23n);
  });
});

describe("BoundedInt classes: the error decides the digits shown, at every scale", () => {
  test.each([
    [0, 50, -1234n, -1200, "-1200"],
    [0, 50, -1250n, -1200, "-1200"],
    [0, 50, -1350n, -1400, "-1400"],
    [-3, 500, -25n, -25000, "-25000"],
    [-3, 5000, -25n, -20000, "-20000"],
    [-3, 5000, -35n, -40000, "-40000"],
    [1, 5, -47n, 0, "0"],
    [2, 0.05, -1276n, -12.8, "-12.8"],
    [2, 0.05, -1275n, -12.8, "-12.8"],
    [2, 0.05, -1265n, -12.6, "-12.6"],
    [2, 0.5, -1265n, -13, "-13"],
  ] as const)(
    "at the scale %s, with the error %s, fromValue(%s) gives %s and %s",
    (k, error, q, number, text) => {
      const C = BoundedInt.define({
        name: "C",
        min: [-1n, 10],
        max: [1n, 10],
        step: [1n, -k],
        error,
      });
      expect(C.fromValue(q).valueOf()).toBe(number);
      expect(C.fromValue(q).toString()).toBe(text);
    },
  );

  test("an error that is 0, or tiny, keeps every digit", () => {
    for (const error of [0, [1n, -400] as const]) {
      const C = BoundedInt.define({ name: "C", min: 0, max: 10, step: 0.1, error });
      expect(C.fromValue(23n).toString()).toBe("2.3");
    }
  });

  test("a huge error shows 0", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: 10, step: 0.1, error: [1n, 1000] });
    expect(C.fromValue(45n).toString()).toBe("0");
  });
});

describe("BoundedInt.define: integerOnly with a step", () => {
  test("a class of integers counted in thousands", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: 10500, step: 1000, integerOnly: true });
    expect(C.integerOnly).toBe(true);
    expect(C.from(1500).value).toBe(2n);
    expect(() => C.from(1.5)).toThrow(TypeError);
    const D = BoundedInt.define({ name: "D", min: 0, max: 10, integerOnly: false });
    expect(D.from(1.5).value).toBe(2n);
  });
});

// REVIEW PLACEHOLDER (#44, review of PR #47: the bounds [min, max), kept exactly;
// no defineRaw, end or per-value errors; every quantity an exact decimal)
// the scales ±22, ±23 and the ends of a number (define's steps, defineRaw's scales)
//   -> the step 10^-323 gives the scale 323, and a finer one is refused; the step 10^308 gives
//      the scale −308, and a coarser one too; the scales ±22 and ±23 have no special meaning
// the integers ±10^15 and beyond are accepted, up to ℓ integers
//   -> test/bounded-int-scale.test.ts: define has no limit on the bounds (no limit of ℓ either)
// from(-0) holds 0n on every class…; from(%s) throws a TypeError that names the class, at every
// scale; a subnormal is not an integer… -> (unchanged); from(%s) rounds to 0n even at the scale 22
//   -> at the scale 323, the smallest subnormal rounds to 0n and the largest to its integer
// at the scale %s, the ties -a/2 round to even, as their opposites -> (unchanged)
// defineRaw without its bounds is refused… -> removed: defineRaw is gone
// a class beyond 10^15 holds its integers exactly; valueOf() is the nearest number
//   -> Number.MAX_VALUE and 2^1023 are their exact integers; 0.1 is 0.1000…625, exactly
// valueOf() and toString() throw a RangeError that names valueOf where the number is ±Infinity…
//   -> valueOf() throws a RangeError that names valueOf where the number is ±Infinity; toString()
//      writes every digit (toString() no longer goes through valueOf())
// at the scale 300, valueOf() is the number nearest to the decimal, beyond 10^22 -> (unchanged)
// constants changed after the first use are not checked again -> … are not read again
// a class that fails its check…; a subclass of a class made by define… -> (unchanged)
// at the scale %s, fromValue(%s, { bound: %s }) gives %s and %s
//   -> at the scale %s, with the error %s, fromValue(%s) gives %s and %s (the error of the class)
// the error is divided by 10^-k, and decides the digits of valueOf(); an error that scales to 0 is
// accepted; one that scales to Infinity is a RangeError; beyond the scale 308, from scales its error
//   -> an error that is 0, or tiny, keeps every digit; a huge error shows 0 (no number arithmetic
//      on errors: nothing scales to Infinity)
// toString() writes 100 decimals with toFixed, and 101 in exponential notation
//   -> toLocaleString() refuses more than 100 decimals with a RangeError; toString() writes them
// a scale of NaN or Infinity on a class written by hand is a RangeError that names it
//   -> test/bounded-int-scale.test.ts: a scale beyond −308 … 323 is refused
// a range of exactly ℓ integers, all below 0, is valid: [−ℓ, 0) -> removed: no limit of ℓ
// a step above 1e308 gives the scale −308, the coarsest -> (unchanged, in "the step 10^308 …")
//
// describe("BoundedInt.define and defineRaw: the scales ±22, ±23 and the ends of a number", () => {
//   test("a step of 10^-22, or a little coarser, gives the scale 22; a finer one the scale 23", () => {
//     const Tiny = BoundedInt.define({ name: "Tiny", min: 0, max: 1e-8, step: 1e-22 });
//     expect(Tiny.scale).toBe(22);
//     expect(Tiny.end).toBe(10n ** 14n + 1n);
//     expect(Tiny.from(1e-22).value).toBe(1n);
//     expect(Tiny.fromValue(1n).valueOf()).toBe(1e-22);
//     expect(BoundedInt.define({ name: "X", min: 0, max: 1e-8, step: 1.5e-22 }).scale).toBe(22);
//     expect(BoundedInt.define({ name: "X", min: 0, max: 1e-8, step: 9e-23 }).scale).toBe(23);
//   });
//
//   test("a step of 10^22, or a little finer, gives the scale -22; a coarser one the scale -23", () => {
//     const Huge = BoundedInt.define({ name: "Huge", min: 0, max: 1e23, step: 1e22 });
//     expect(Huge.scale).toBe(-22);
//     expect(Huge.end).toBe(11n);
//     expect(Huge.from(1e22).value).toBe(1n);
//     expect(Huge.fromValue(10n).valueOf()).toBe(1e23);
//     expect(BoundedInt.define({ name: "X", min: 0, max: 1e23, step: 5e22 }).scale).toBe(-22);
//     expect(BoundedInt.define({ name: "X", min: 0, max: 1e24, step: 1e23 }).scale).toBe(-23);
//   });
//
//   test("the steps at the ends of a number give the scales 323 and -308", () => {
//     const Finest = BoundedInt.define({ name: "Finest", min: 0, max: 1e-300, step: 1e-323 });
//     expect(Finest.scale).toBe(323);
//     expect(Finest.fromValue(1n).valueOf()).toBe(1e-323);
//     const Coarsest = BoundedInt.define({ name: "Coarsest", min: 0, max: 1e308, step: 1e308 });
//     expect(Coarsest.scale).toBe(-308);
//     expect(Coarsest.from(1e308).value).toBe(1n);
//   });
//
//   test.each([22, -22])("defineRaw accepts the scale %s", (k) => {
//     expect(BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n }).scale).toBe(k);
//   });
//
//   test.each([23, -23, 323, -308])(
//     "defineRaw accepts the scale %s, as every scale whose step is a number above 0",
//     (k) => {
//       expect(BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n }).scale).toBe(k);
//     },
//   );
//
//   test.each([324, -309])(
//     "defineRaw refuses the scale %s with a RangeError: 10^-k is 0 or Infinity",
//     (k) => {
//       expect(() => BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n })).toThrow(
//         RangeError,
//       );
//     },
//   );
// });
//
// describe("BoundedInt.define: no limit of 10^15", () => {
//   test("the integers ±10^15 and beyond are accepted, up to ℓ integers", () => {
//     expect(BoundedInt.define({ name: "X", min: 0, max: 10n ** 15n }).end).toBe(10n ** 15n + 1n);
//     expect(BoundedInt.define({ name: "X", min: -1e15, max: 0 }).min).toBe(-(10n ** 15n));
//     expect(BoundedInt.define({ name: "X", min: 0, max: 1e14, step: 0.1 }).end).toBe(
//       10n ** 15n + 1n,
//     );
//     expect(BoundedInt.define({ name: "X", min: 1e300, max: 1e300 }).min).toBe(BigInt(1e300));
//     expect(() => BoundedInt.define({ name: "X", min: -(L / 2n), max: L / 2n + 1n })).toThrow(
//       RangeError,
//     );
//   });
// });
//
// describe("BoundedInt classes: negative zero, NaN, infinities and subnormals", () => {
//   test("from(-0) holds 0n on every class, and valueOf() is +0", () => {
//     const { Mass, Reading, Volume } = classes();
//     for (const C of [Mass, Reading, Volume, wide(22), wide(-22)]) {
//       const zero = C.from(-0);
//       expect(zero.value).toBe(0n);
//       expect(Object.is(zero.valueOf(), 0)).toBe(true);
//     }
//   });
//
//   test.each([
//     ["NaN", NaN],
//     ["Infinity", Infinity],
//     ["-Infinity", -Infinity],
//   ] as const)("from(%s) throws a TypeError that names the class, at every scale", (_, x) => {
//     for (const C of [classes().Reading, wide(-22), wide(0), wide(22)]) {
//       expect(() => C.from(x)).toThrow(TypeError);
//       expect(() => C.from(x)).toThrow(new RegExp(`^${C.name}\\.from: `));
//     }
//   });
//
//   test.each([
//     ["Number.MIN_VALUE", Number.MIN_VALUE],
//     ["-Number.MIN_VALUE", -Number.MIN_VALUE],
//     ["the largest subnormal", 2.225073858507201e-308],
//     ["the smallest normal", 2.2250738585072014e-308],
//   ] as const)("from(%s) rounds to 0n even at the scale 22", (_, x) => {
//     expect(wide(22).from(x).value).toBe(0n);
//   });
//
//   test("a subnormal is not an integer: BoundedInt.from(Number.MIN_VALUE) is a TypeError", () => {
//     expect(() => BoundedInt.from(Number.MIN_VALUE)).toThrow(TypeError);
//   });
// });
//
// describe("BoundedInt classes: negative ties go to the even integer, at every scale", () => {
//   /** The even one of the two integers around the tie `-a/2`, for an odd `a`. */
//   const even = (a: bigint) => {
//     const below = -(a + 1n) / 2n;
//     return below % 2n === 0n ? below : below + 1n;
//   };
//
//   const scales = Array.from({ length: 45 }, (_, i) => i - 22);
//
//   test.each(scales)("at the scale %s, the ties -a/2 round to even, as their opposites", (k) => {
//     const C = wide(k);
//     for (const c of [1, 3]) {
//       const x = k >= 0 ? -c * 2 ** -(k + 1) : -c * 5 * Number(`1e${String(-k - 1)}`);
//       const a = k >= 0 ? BigInt(c) * 5n ** BigInt(k) : BigInt(c);
//       expect(C.from(x).value).toBe(even(a));
//       expect(C.from(-x).value).toBe(-even(a));
//       if (k < 0) expect(C.from(-BigInt(c) * 5n * 10n ** BigInt(-k - 1)).value).toBe(even(a));
//     }
//   });
// });
//
// describe("BoundedInt.defineRaw: beyond 10^15, and valueOf() near ±Infinity", () => {
//   test("defineRaw without its bounds is refused with a TypeError, not made without a range", () => {
//     const where = /^BoundedInt\.defineRaw: /;
//     expect(() => BoundedInt.defineRaw({ name: "X", scale: 0 } as never)).toThrow(TypeError);
//     expect(() => BoundedInt.defineRaw({ name: "X", scale: 0 } as never)).toThrow(where);
//     expect(() => BoundedInt.defineRaw({ name: "X", scale: 0, min: 0n } as never)).toThrow(
//       TypeError,
//     );
//   });
//
//   test("a class beyond 10^15 holds its integers exactly; valueOf() is the nearest number", () => {
//     const Big = BoundedInt.defineRaw({
//       name: "Big",
//       scale: 2,
//       min: -(10n ** 20n),
//       end: 10n ** 20n,
//     });
//     expect(Big.fromValue(10n ** 20n - 1n).value).toBe(10n ** 20n - 1n);
//     expect(Big.fromValue(10n ** 20n - 1n).valueOf()).toBe(1e18);
//     expect(Big.from(-1e17).value).toBe(-(10n ** 19n));
//   });
//
//   test("valueOf() and toString() throw a RangeError that names valueOf where the number is ±Infinity, at the scale −300", () => {
//     const C = BoundedInt.defineRaw({
//       name: "Coarse",
//       scale: -300,
//       min: -(10n ** 70n),
//       end: 10n ** 70n,
//     });
//     expect(C.fromValue(10n ** 8n).valueOf()).toBe(1e308);
//     expect(C.fromValue(-(10n ** 8n)).valueOf()).toBe(-1e308);
//     for (const q of [10n ** 9n, -(10n ** 9n)]) {
//       expect(() => C.fromValue(q).valueOf()).toThrow(RangeError);
//       expect(() => C.fromValue(q).valueOf()).toThrow(/^Coarse\.valueOf: /);
//       expect(() => C.fromValue(q).toString()).toThrow(RangeError);
//       expect(() => `<${C.fromValue(q) as unknown as string}>`).toThrow(RangeError);
//     }
//   });
//
//   test("at the scale 300, valueOf() is the number nearest to the decimal, beyond 10^22", () => {
//     const C = BoundedInt.defineRaw({
//       name: "Fine",
//       scale: 300,
//       min: -(10n ** 75n),
//       end: 10n ** 75n,
//     });
//     expect(C.fromValue(10n ** 70n).valueOf()).toBe(1e-230);
//     expect(C.fromValue(-(10n ** 70n)).valueOf()).toBe(-1e-230);
//     expect(C.fromValue(123456789n).valueOf()).toBe(1.23456789e-292);
//     expect(C.fromValue(123456789n, { bound: 0 }).toString()).toBe("1.23456789e-292");
//   });
// });
//
// describe("BoundedInt classes: a class written by hand is checked once", () => {
//   test("constants changed after the first use are not checked again", () => {
//     class Once extends BoundedInt {
//       static override min = 0n;
//       static override end = 10n;
//       static override integerOnly: boolean = true;
//     }
//     expect(Once.from(1).value).toBe(1n);
//     Once.integerOnly = "no" as unknown as boolean;
//     expect(Once.fromValue(2n).value).toBe(2n);
//     expect(Once.from(1.5).value).toBe(2n);
//   });
//
//   test("a class that fails its check is checked again at its next use", () => {
//     class Later extends BoundedInt {
//       static override min = 0n;
//       static override end = undefined as unknown as bigint;
//     }
//     expect(() => Later.from(1)).toThrow(TypeError);
//     expect(() => Later.fromValue(1n)).toThrow(/^Later\.fromValue: /);
//     Later.end = 10n;
//     expect(Later.from(1).value).toBe(1n);
//   });
//
//   test("a subclass of a class made by define is checked on its own, and inherits its constants", () => {
//     const { Mass } = classes();
//     class Heavy extends Mass {}
//     expect(Heavy.from(2.3).value).toBe(23n);
//     expect(Heavy.from(2.3)).toBeInstanceOf(Heavy);
//     expect(() => Heavy.from(100.06)).toThrow(/^Heavy\.from: /);
//   });
// });
//
// describe("BoundedInt classes: toString() with no decimals, and rounding of negative values", () => {
//   test.each([
//     [0, -1234n, 50, -1200, "-1200"],
//     [0, -1250n, 50, -1200, "-1200"],
//     [0, -1350n, 50, -1400, "-1400"],
//     [-3, -25n, 0.5, -25000, "-25000"],
//     [-3, -25n, 5, -20000, "-20000"],
//     [-3, -35n, 5, -40000, "-40000"],
//     [1, -47n, 50, 0, "0"],
//     [2, -1276n, 5, -12.8, "-12.8"],
//     [2, -1275n, 5, -12.8, "-12.8"],
//     [2, -1265n, 5, -12.6, "-12.6"],
//     [2, -1265n, 50, -13, "-13"],
//   ] as const)(
//     "at the scale %s, fromValue(%s, { bound: %s }) gives %s and %s",
//     (k, q, bound, number, string) => {
//       const x = wide(k).fromValue(q, { bound });
//       expect(x.valueOf()).toBe(number);
//       expect(Object.is(x.valueOf(), -0)).toBe(false);
//       expect(x.toString()).toBe(string);
//       expect(`<${x as unknown as string}>`).toBe(`<${string}>`);
//     },
//   );
// });
//
// describe("BoundedInt.from(x, error) at a negative scale", () => {
//   test("the error is divided by 10^-k, and decides the digits of valueOf()", () => {
//     const { Volume } = classes();
//     const a = Volume.from(12_000, 5000);
//     expect([a.errorBound, a.quadraticError, a.termError]).toEqual([5, 5, 5]);
//     expect(a.value).toBe(12n);
//     expect(a.valueOf()).toBe(10_000);
//     expect(a.toString()).toBe("10000");
//     const b = Volume.from(12_000, 0);
//     expect([b.errorBound, b.valueOf(), b.toString()]).toEqual([0, 12_000, "12000"]);
//   });
//
//   test("an error that scales to 0 is accepted; one that scales to Infinity is a RangeError", () => {
//     expect(wide(-22).from(1e22, Number.MIN_VALUE).errorBound).toBe(0);
//     expect(() => wide(22).from(1, Number.MAX_VALUE)).toThrow(RangeError);
//     expect(() => wide(22).from(1, Number.MAX_VALUE)).toThrow(/^Wide22\.from: /);
//   });
// });
//
// describe("BoundedInt classes: the ends of the scales and of the range", () => {
//   test("beyond the scale 308, from scales its error although 10^k is not a number", () => {
//     const Finest = BoundedInt.define({ name: "Finest", min: 0, max: 1e-300, step: 1e-323 });
//     expect(Finest.from(1e-320, 0).errorBound).toBe(0);
//     const x = Finest.from(1e-320, 1e-320);
//     expect([x.errorBound, x.quadraticError, x.termError]).toEqual([1000, 1000, 1000]);
//     expect(x.value).toBe(1000n);
//     expect(() => Finest.from(1e-320, 1)).toThrow(RangeError);
//     expect(() => Finest.from(1e-320, 1)).toThrow(/^Finest\.from: /);
//   });
//
//   test("toString() writes 100 decimals with toFixed, and 101 in exponential notation", () => {
//     const At100 = BoundedInt.defineRaw({ name: "At100", scale: 100, min: 0n, end: 1000n });
//     const At101 = BoundedInt.defineRaw({ name: "At101", scale: 101, min: 0n, end: 1000n });
//     expect(At100.fromValue(123n).toString()).toBe(`0.${"0".repeat(97)}123`);
//     expect(At101.fromValue(123n).toString()).toBe("1.23e-99");
//     expect(At101.fromValue(123n).valueOf()).toBe(1.23e-99);
//   });
//
//   test("a scale of NaN or Infinity on a class written by hand is a RangeError that names it", () => {
//     class NotANumber extends BoundedInt {
//       static override scale = NaN;
//     }
//     class Endless extends BoundedInt {
//       static override scale = Infinity;
//     }
//     expect(() => NotANumber.from(1)).toThrow(RangeError);
//     expect(() => NotANumber.from(1)).toThrow(/NotANumber/);
//     expect(() => Endless.fromValue(1n)).toThrow(RangeError);
//     expect(() => Endless.fromValue(1n)).toThrow(/^Endless\.fromValue: /);
//   });
//
//   test("a range of exactly ℓ integers, all below 0, is valid: [−ℓ, 0)", () => {
//     const Below = BoundedInt.defineRaw({ name: "Below", scale: 0, min: -L, end: 0n });
//     expect(Below.fromValue(-L).value).toBe(-L);
//     expect(Below.fromValue(-1n).value).toBe(-1n);
//     expect(() => Below.fromValue(0n)).toThrow(RangeError);
//     expect(() => Below.fromValue(-L - 1n)).toThrow(RangeError);
//     expect(() => BoundedInt.defineRaw({ name: "X", scale: 0, min: -L - 1n, end: 0n })).toThrow(
//       RangeError,
//     );
//   });
//
//   test("a step above 1e308 gives the scale −308, the coarsest", () => {
//     for (const step of [1.5e308, Number.MAX_VALUE]) {
//       const C = BoundedInt.define({ name: "Huge", min: 0, max: 0, step });
//       expect(C.scale).toBe(-308);
//       expect([C.min, C.end]).toEqual([0n, 1n]);
//     }
//   });
// });

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the edge cases of the decimal classes; the exact decimal of a number, the ends of the scales, the error of a class (#44) |
