/**
 * The edge cases of the classes of `BoundedInt` (#44; docs/core/bounded-int.md): the
 * scales `±22`, `±23` and the ends of those a `number` can write, `define` beyond
 * `10^15`, negative zero, `NaN`, infinities and subnormal inputs, negative ties at every
 * scale, `defineRaw` beyond `10^15` and `valueOf()` near `±Infinity`, a class written by
 * hand checked once,
 * `toString()` with no decimals and a rounding position above 0 on negative values, and
 * the error of `from` at a negative scale. The same file runs in Node.js and in every
 * headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt, RistrettoElement } from "../src/core/index.js";
import { classes } from "./helpers/bounded-int-examples.js";

const L = RistrettoElement.ORDER;

/** A class with the scale `k`, the `ℓ` integers centered on 0, and no `integerOnly`. */
const wide = (k: number) =>
  BoundedInt.defineRaw({
    name: `Wide${String(k)}`,
    scale: k,
    min: -(L - 1n) / 2n,
    end: (L + 1n) / 2n,
  });

describe("BoundedInt.define and defineRaw: the scales ±22, ±23 and the ends of a number", () => {
  // REVIEW PLACEHOLDER (#44: no limit of ±22 on the scale)
  // a step of 10^-22, or a little coarser, gives the scale 22; a finer one is refused
  //   -> a step of 10^-22, or a little coarser, gives the scale 22; a finer one the scale 23
  // a step of 10^22, or a little finer, gives the scale -22; a coarser one is refused
  //   -> a step of 10^22, or a little finer, gives the scale -22; a coarser one the scale -23
  // test("a step of 10^-22, or a little coarser, gives the scale 22; a finer one is refused", () => {
  //   const Tiny = BoundedInt.define({ name: "Tiny", min: 0, max: 1e-8, step: 1e-22 });
  //   expect(Tiny.scale).toBe(22);
  //   expect(Tiny.end).toBe(10n ** 14n + 1n);
  //   expect(Tiny.from(1e-22).value).toBe(1n);
  //   expect(Tiny.fromValue(1n).valueOf()).toBe(1e-22);
  //   expect(BoundedInt.define({ name: "X", min: 0, max: 1e-8, step: 1.5e-22 }).scale).toBe(22);
  //   expect(() => BoundedInt.define({ name: "X", min: 0, max: 1e-8, step: 9e-23 })).toThrow(
  //     RangeError,
  //   );
  // });
  //
  // test("a step of 10^22, or a little finer, gives the scale -22; a coarser one is refused", () => {
  //   const Huge = BoundedInt.define({ name: "Huge", min: 0, max: 1e23, step: 1e22 });
  //   expect(Huge.scale).toBe(-22);
  //   expect(Huge.end).toBe(11n);
  //   expect(Huge.from(1e22).value).toBe(1n);
  //   expect(Huge.fromValue(10n).valueOf()).toBe(1e23);
  //   expect(BoundedInt.define({ name: "X", min: 0, max: 1e23, step: 5e22 }).scale).toBe(-22);
  //   expect(() => BoundedInt.define({ name: "X", min: 0, max: 1e24, step: 1e23 })).toThrow(
  //     RangeError,
  //   );
  // });
  test("a step of 10^-22, or a little coarser, gives the scale 22; a finer one the scale 23", () => {
    const Tiny = BoundedInt.define({ name: "Tiny", min: 0, max: 1e-8, step: 1e-22 });
    expect(Tiny.scale).toBe(22);
    expect(Tiny.end).toBe(10n ** 14n + 1n);
    expect(Tiny.from(1e-22).value).toBe(1n);
    expect(Tiny.fromValue(1n).valueOf()).toBe(1e-22);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1e-8, step: 1.5e-22 }).scale).toBe(22);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1e-8, step: 9e-23 }).scale).toBe(23);
  });

  test("a step of 10^22, or a little finer, gives the scale -22; a coarser one the scale -23", () => {
    const Huge = BoundedInt.define({ name: "Huge", min: 0, max: 1e23, step: 1e22 });
    expect(Huge.scale).toBe(-22);
    expect(Huge.end).toBe(11n);
    expect(Huge.from(1e22).value).toBe(1n);
    expect(Huge.fromValue(10n).valueOf()).toBe(1e23);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1e23, step: 5e22 }).scale).toBe(-22);
    expect(BoundedInt.define({ name: "X", min: 0, max: 1e24, step: 1e23 }).scale).toBe(-23);
  });

  test("the steps at the ends of a number give the scales 323 and -308", () => {
    const Finest = BoundedInt.define({ name: "Finest", min: 0, max: 1e-300, step: 1e-323 });
    expect(Finest.scale).toBe(323);
    expect(Finest.fromValue(1n).valueOf()).toBe(1e-323);
    const Coarsest = BoundedInt.define({ name: "Coarsest", min: 0, max: 1e308, step: 1e308 });
    expect(Coarsest.scale).toBe(-308);
    expect(Coarsest.from(1e308).value).toBe(1n);
  });

  test.each([22, -22])("defineRaw accepts the scale %s", (k) => {
    expect(BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n }).scale).toBe(k);
  });

  // REVIEW PLACEHOLDER (#44: no limit of ±22 on the scale)
  // defineRaw refuses the scale %s with a RangeError
  //   -> defineRaw accepts the scale %s, as every scale whose step is a number above 0
  //   -> defineRaw refuses the scale %s with a RangeError: 10^-k is 0 or Infinity
  // test.each([23, -23])("defineRaw refuses the scale %s with a RangeError", (k) => {
  //   expect(() => BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n })).toThrow(
  //     RangeError,
  //   );
  // });
  test.each([23, -23, 323, -308])(
    "defineRaw accepts the scale %s, as every scale whose step is a number above 0",
    (k) => {
      expect(BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n }).scale).toBe(k);
    },
  );

  test.each([324, -309])(
    "defineRaw refuses the scale %s with a RangeError: 10^-k is 0 or Infinity",
    (k) => {
      expect(() => BoundedInt.defineRaw({ name: "X", scale: k, min: 0n, end: 1n })).toThrow(
        RangeError,
      );
    },
  );
});

describe("BoundedInt.define: no limit of 10^15", () => {
  // REVIEW PLACEHOLDER (#44: no limit of 10^15 in define)
  // the integers 10^15 − 1 and −(10^15 − 1) are accepted, ±10^15 are refused
  //   -> the integers ±10^15 and beyond are accepted, up to ℓ integers
  // the limit is on the integer, after scaling: max 1e14 with a step of 0.1 is refused
  //   -> the integers ±10^15 and beyond are accepted, up to ℓ integers
  // test("the integers 10^15 − 1 and −(10^15 − 1) are accepted, ±10^15 are refused", () => {
  //   expect(BoundedInt.define({ name: "X", min: 0, max: 999_999_999_999_999 }).end).toBe(10n ** 15n);
  //   expect(BoundedInt.define({ name: "X", min: -999_999_999_999_999, max: 0 }).min).toBe(
  //     -(10n ** 15n) + 1n,
  //   );
  //   expect(() => BoundedInt.define({ name: "X", min: -1e15, max: 0 })).toThrow(RangeError);
  //   expect(() => BoundedInt.define({ name: "X", min: 0, max: 10n ** 15n })).toThrow(RangeError);
  // });
  //
  // test("the limit is on the integer, after scaling: max 1e14 with a step of 0.1 is refused", () => {
  //   expect(BoundedInt.define({ name: "X", min: 0, max: 99_999_999_999_999, step: 1 }).end).toBe(
  //     10n ** 14n,
  //   );
  //   expect(() => BoundedInt.define({ name: "X", min: 0, max: 1e14, step: 0.1 })).toThrow(/10\^15/);
  // });
  test("the integers ±10^15 and beyond are accepted, up to ℓ integers", () => {
    expect(BoundedInt.define({ name: "X", min: 0, max: 10n ** 15n }).end).toBe(10n ** 15n + 1n);
    expect(BoundedInt.define({ name: "X", min: -1e15, max: 0 }).min).toBe(-(10n ** 15n));
    expect(BoundedInt.define({ name: "X", min: 0, max: 1e14, step: 0.1 }).end).toBe(
      10n ** 15n + 1n,
    );
    expect(BoundedInt.define({ name: "X", min: 1e300, max: 1e300 }).min).toBe(BigInt(1e300));
    expect(() => BoundedInt.define({ name: "X", min: -(L / 2n), max: L / 2n + 1n })).toThrow(
      RangeError,
    );
  });
});

describe("BoundedInt classes: negative zero, NaN, infinities and subnormals", () => {
  test("from(-0) holds 0n on every class, and valueOf() is +0", () => {
    const { Mass, Reading, Volume } = classes();
    for (const C of [Mass, Reading, Volume, wide(22), wide(-22)]) {
      const zero = C.from(-0);
      expect(zero.value).toBe(0n);
      expect(Object.is(zero.valueOf(), 0)).toBe(true);
    }
  });

  test.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ] as const)("from(%s) throws a TypeError that names the class, at every scale", (_, x) => {
    for (const C of [classes().Reading, wide(-22), wide(0), wide(22)]) {
      expect(() => C.from(x)).toThrow(TypeError);
      expect(() => C.from(x)).toThrow(new RegExp(`^${C.name}\\.from: `));
    }
  });

  test.each([
    ["Number.MIN_VALUE", Number.MIN_VALUE],
    ["-Number.MIN_VALUE", -Number.MIN_VALUE],
    ["the largest subnormal", 2.225073858507201e-308],
    ["the smallest normal", 2.2250738585072014e-308],
  ] as const)("from(%s) rounds to 0n even at the scale 22", (_, x) => {
    expect(wide(22).from(x).value).toBe(0n);
  });

  test("a subnormal is not an integer: BoundedInt.from(Number.MIN_VALUE) is a TypeError", () => {
    expect(() => BoundedInt.from(Number.MIN_VALUE)).toThrow(TypeError);
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

describe("BoundedInt.defineRaw: beyond 10^15, and valueOf() near ±Infinity", () => {
  test("defineRaw without its bounds is refused with a TypeError, not made without a range", () => {
    const where = /^BoundedInt\.defineRaw: /;
    expect(() => BoundedInt.defineRaw({ name: "X", scale: 0 } as never)).toThrow(TypeError);
    expect(() => BoundedInt.defineRaw({ name: "X", scale: 0 } as never)).toThrow(where);
    expect(() => BoundedInt.defineRaw({ name: "X", scale: 0, min: 0n } as never)).toThrow(
      TypeError,
    );
  });

  test("a class beyond 10^15 holds its integers exactly; valueOf() is the nearest number", () => {
    const Big = BoundedInt.defineRaw({
      name: "Big",
      scale: 2,
      min: -(10n ** 20n),
      end: 10n ** 20n,
    });
    expect(Big.fromValue(10n ** 20n - 1n).value).toBe(10n ** 20n - 1n);
    expect(Big.fromValue(10n ** 20n - 1n).valueOf()).toBe(1e18);
    expect(Big.from(-1e17).value).toBe(-(10n ** 19n));
  });

  // REVIEW PLACEHOLDER (#44: every class spans at most ℓ integers, below 2^253)
  // valueOf() throws a RangeError where the number is ±Infinity, on both sides
  //   -> valueOf() and toString() throw a RangeError that names valueOf where the number is
  //      ±Infinity, at the scale −300
  // an integer beyond the numbers whose decimal is a finite number gives that number
  //   -> at the scale 300, valueOf() is the number nearest to the decimal, beyond 10^22
  // test("valueOf() throws a RangeError where the number is ±Infinity, on both sides", () => {
  //   for (const q of [2n ** 1024n, -(2n ** 1024n)]) {
  //     expect(() => wide(0).fromValue(q).valueOf()).toThrow(RangeError);
  //     expect(() => wide(0).fromValue(q).valueOf()).toThrow(/^Wide0\.valueOf: /);
  //     expect(() => `<${wide(0).fromValue(q) as unknown as string}>`).toThrow(RangeError);
  //   }
  //   expect(() =>
  //     wide(-22)
  //       .fromValue(10n ** 300n)
  //       .valueOf(),
  //   ).toThrow(RangeError);
  //   expect(() =>
  //     wide(-22)
  //       .fromValue(-(10n ** 300n))
  //       .valueOf(),
  //   ).toThrow(RangeError);
  //   expect(
  //     wide(-22)
  //       .fromValue(10n ** 200n)
  //       .valueOf(),
  //   ).toBe(1e222);
  // });
  //
  // test("an integer beyond the numbers whose decimal is a finite number gives that number", () => {
  //   expect(
  //     wide(22)
  //       .fromValue(10n ** 330n)
  //       .valueOf(),
  //   ).toBe(1e308);
  //   expect(
  //     wide(22)
  //       .fromValue(-(10n ** 330n))
  //       .valueOf(),
  //   ).toBe(-1e308);
  //   expect(() =>
  //     wide(22)
  //       .fromValue(10n ** 331n)
  //       .valueOf(),
  //   ).toThrow(RangeError);
  // });
  test("valueOf() and toString() throw a RangeError that names valueOf where the number is ±Infinity, at the scale −300", () => {
    const C = BoundedInt.defineRaw({
      name: "Coarse",
      scale: -300,
      min: -(10n ** 70n),
      end: 10n ** 70n,
    });
    expect(C.fromValue(10n ** 8n).valueOf()).toBe(1e308);
    expect(C.fromValue(-(10n ** 8n)).valueOf()).toBe(-1e308);
    for (const q of [10n ** 9n, -(10n ** 9n)]) {
      expect(() => C.fromValue(q).valueOf()).toThrow(RangeError);
      expect(() => C.fromValue(q).valueOf()).toThrow(/^Coarse\.valueOf: /);
      expect(() => C.fromValue(q).toString()).toThrow(RangeError);
      expect(() => `<${C.fromValue(q) as unknown as string}>`).toThrow(RangeError);
    }
  });

  test("at the scale 300, valueOf() is the number nearest to the decimal, beyond 10^22", () => {
    const C = BoundedInt.defineRaw({
      name: "Fine",
      scale: 300,
      min: -(10n ** 75n),
      end: 10n ** 75n,
    });
    expect(C.fromValue(10n ** 70n).valueOf()).toBe(1e-230);
    expect(C.fromValue(-(10n ** 70n)).valueOf()).toBe(-1e-230);
    expect(C.fromValue(123456789n).valueOf()).toBe(1.23456789e-292);
    expect(C.fromValue(123456789n, { bound: 0 }).toString()).toBe("1.23456789e-292");
  });
});

describe("BoundedInt classes: a class written by hand is checked once", () => {
  test("constants changed after the first use are not checked again", () => {
    class Once extends BoundedInt {
      static override min = 0n;
      static override end = 10n;
      static override integerOnly: boolean = true;
    }
    expect(Once.from(1).value).toBe(1n);
    // Invalid now, but the class was checked already: from takes 1.5 instead of throwing.
    Once.integerOnly = "no" as unknown as boolean;
    expect(Once.fromValue(2n).value).toBe(2n);
    expect(Once.from(1.5).value).toBe(2n);
  });

  test("a class that fails its check is checked again at its next use", () => {
    class Later extends BoundedInt {
      static override min = 0n;
      // Declared, but undefined: only one bound has a value.
      static override end = undefined as unknown as bigint;
    }
    expect(() => Later.from(1)).toThrow(TypeError);
    expect(() => Later.fromValue(1n)).toThrow(/^Later\.fromValue: /);
    Later.end = 10n;
    expect(Later.from(1).value).toBe(1n);
  });

  test("a subclass of a class made by define is checked on its own, and inherits its constants", () => {
    const { Mass } = classes();
    class Heavy extends Mass {}
    expect(Heavy.from(2.3).value).toBe(23n);
    expect(Heavy.from(2.3)).toBeInstanceOf(Heavy);
    expect(() => Heavy.from(100.06)).toThrow(/^Heavy\.from: /);
  });
});

describe("BoundedInt classes: toString() with no decimals, and rounding of negative values", () => {
  test.each([
    // [scale, q, bound, valueOf(), toString()]
    [0, -1234n, 50, -1200, "-1200"],
    [0, -1250n, 50, -1200, "-1200"],
    [0, -1350n, 50, -1400, "-1400"],
    [-3, -25n, 0.5, -25000, "-25000"],
    [-3, -25n, 5, -20000, "-20000"],
    [-3, -35n, 5, -40000, "-40000"],
    [1, -47n, 50, 0, "0"],
    [2, -1276n, 5, -12.8, "-12.8"],
    [2, -1275n, 5, -12.8, "-12.8"],
    [2, -1265n, 5, -12.6, "-12.6"],
    [2, -1265n, 50, -13, "-13"],
  ] as const)(
    "at the scale %s, fromValue(%s, { bound: %s }) gives %s and %s",
    (k, q, bound, number, string) => {
      const x = wide(k).fromValue(q, { bound });
      expect(x.valueOf()).toBe(number);
      expect(Object.is(x.valueOf(), -0)).toBe(false);
      expect(x.toString()).toBe(string);
      expect(`<${x as unknown as string}>`).toBe(`<${string}>`);
    },
  );
});

describe("BoundedInt.from(x, error) at a negative scale", () => {
  test("the error is divided by 10^-k, and decides the digits of valueOf()", () => {
    const { Volume } = classes();
    const a = Volume.from(12_000, 5000);
    expect([a.errorBound, a.quadraticError, a.termError]).toEqual([5, 5, 5]);
    expect(a.value).toBe(12n);
    expect(a.valueOf()).toBe(10_000);
    expect(a.toString()).toBe("10000");
    const b = Volume.from(12_000, 0);
    expect([b.errorBound, b.valueOf(), b.toString()]).toEqual([0, 12_000, "12000"]);
  });

  test("an error that scales to 0 is accepted; one that scales to Infinity is a RangeError", () => {
    expect(wide(-22).from(1e22, Number.MIN_VALUE).errorBound).toBe(0);
    expect(() => wide(22).from(1, Number.MAX_VALUE)).toThrow(RangeError);
    expect(() => wide(22).from(1, Number.MAX_VALUE)).toThrow(/^Wide22\.from: /);
  });
});

describe("BoundedInt classes: the ends of the scales and of the range", () => {
  test("beyond the scale 308, from scales its error although 10^k is not a number", () => {
    const Finest = BoundedInt.define({ name: "Finest", min: 0, max: 1e-300, step: 1e-323 });
    expect(Finest.from(1e-320, 0).errorBound).toBe(0);
    const x = Finest.from(1e-320, 1e-320);
    expect([x.errorBound, x.quadraticError, x.termError]).toEqual([1000, 1000, 1000]);
    expect(x.value).toBe(1000n);
    expect(() => Finest.from(1e-320, 1)).toThrow(RangeError);
    expect(() => Finest.from(1e-320, 1)).toThrow(/^Finest\.from: /);
  });

  test("toString() writes 100 decimals with toFixed, and 101 in exponential notation", () => {
    const At100 = BoundedInt.defineRaw({ name: "At100", scale: 100, min: 0n, end: 1000n });
    const At101 = BoundedInt.defineRaw({ name: "At101", scale: 101, min: 0n, end: 1000n });
    expect(At100.fromValue(123n).toString()).toBe(`0.${"0".repeat(97)}123`);
    expect(At101.fromValue(123n).toString()).toBe("1.23e-99");
    expect(At101.fromValue(123n).valueOf()).toBe(1.23e-99);
  });

  test("a scale of NaN or Infinity on a class written by hand is a RangeError that names it", () => {
    class NotANumber extends BoundedInt {
      static override scale = NaN;
    }
    class Endless extends BoundedInt {
      static override scale = Infinity;
    }
    expect(() => NotANumber.from(1)).toThrow(RangeError);
    expect(() => NotANumber.from(1)).toThrow(/NotANumber/);
    expect(() => Endless.fromValue(1n)).toThrow(RangeError);
    expect(() => Endless.fromValue(1n)).toThrow(/^Endless\.fromValue: /);
  });

  test("a range of exactly ℓ integers, all below 0, is valid: [−ℓ, 0)", () => {
    const Below = BoundedInt.defineRaw({ name: "Below", scale: 0, min: -L, end: 0n });
    expect(Below.fromValue(-L).value).toBe(-L);
    expect(Below.fromValue(-1n).value).toBe(-1n);
    expect(() => Below.fromValue(0n)).toThrow(RangeError);
    expect(() => Below.fromValue(-L - 1n)).toThrow(RangeError);
    expect(() => BoundedInt.defineRaw({ name: "X", scale: 0, min: -L - 1n, end: 0n })).toThrow(
      RangeError,
    );
  });

  test("a step above 1e308 gives the scale −308, the coarsest", () => {
    for (const step of [1.5e308, Number.MAX_VALUE]) {
      const C = BoundedInt.define({ name: "Huge", min: 0, max: 0, step });
      expect(C.scale).toBe(-308);
      expect([C.min, C.end]).toEqual([0n, 1n]);
    }
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the edge cases of the BoundedInt classes (#44)           |
