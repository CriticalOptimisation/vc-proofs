/**
 * The edge cases of the classes of `BoundedInt` (#44; docs/core/bounded-int.md): the ends
 * of the scales, the exact decimal of a `number`, negative zero, `NaN`, infinities and
 * subnormal inputs, negative ties at every scale, `valueOf()` near `±Infinity`, more than
 * 100 decimals, huge exponents, a class written by hand checked once, and the error of a
 * class at every scale. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../src/core/bounded-int.js";

/**
 * A class with the scale `k`, the bounds `±(10^15 − 1)` steps, the most that takes a
 * `number`, and no `integerOnly`.
 */
const wide = (k: number) =>
  BoundedInt.define({
    name: `Wide${String(k)}`,
    min: [-(10n ** 15n - 1n), -k],
    max: [10n ** 15n - 1n, -k],
    step: [1n, -k],
  });

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
  test("the bound 0.1 is the decimal 0.1: a number is rounded to 15 significant digits", () => {
    const C = BoundedInt.define({ name: "C", min: 0, max: 0.1, step: [1n, -55] });
    // The values just below 0.1 round, at the scale 55, to 10^54: no value of the gap above.
    expect(C.fromValue(10n ** 54n).toString()).toBe(`0.1${"0".repeat(54)}`);
    expect(() => C.fromValue(10n ** 54n + 1n)).toThrow(RangeError);
    // The decimal in the gap between 0.1 and the binary value of the number 0.1 is refused.
    expect(() => C.from([1000000000000000055511151231257827021181583404541015625n, -55])).toThrow(
      RangeError,
    );
    expect(() => C.from(0.05)).toThrow(TypeError);
  });

  test("the bounds Number.MAX_VALUE and 2^1023 are rounded to 15 significant digits", () => {
    for (const [max, q] of [
      [Number.MAX_VALUE, 179769313486232n * 10n ** 294n],
      [2 ** 1023, 898846567431158n * 10n ** 293n],
    ] as const) {
      const C = BoundedInt.define({ name: "C", min: 0, max });
      expect(C.fromValue(q).value).toBe(q);
      expect(() => C.fromValue(q + 1n)).toThrow(RangeError);
    }
  });

  test("a mantissa of 53 ones: the bound (2^53 − 1) · 2^-60, 0.00781249999999999913…, is 0.0078125 at 15 digits", () => {
    const C = BoundedInt.define({
      name: "C",
      min: 0,
      max: (2 ** 53 - 1) * 2 ** -60,
      step: [1n, -60],
    });
    const q = 78125n * 10n ** 53n;
    expect(C.fromValue(q).value).toBe(q);
    expect(() => C.fromValue(q + 1n)).toThrow(RangeError);
  });
});

describe("BoundedInt classes: negative zero, NaN, infinities and subnormals", () => {
  test("from(-0) holds 0n on every class that takes a number, and valueOf() is +0", () => {
    for (const C of [wide(0), wide(2), wide(-3)]) {
      const x = C.from(-0);
      expect(x.value).toBe(0n);
      expect(Object.is(x.valueOf(), 0)).toBe(true);
    }
    expect(BoundedInt.from([0n, 0]).value).toBe(0n);
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

  test("BoundedInt rounds a subnormal: from(Number.MIN_VALUE) is 0n", () => {
    expect(BoundedInt.from(Number.MIN_VALUE).value).toBe(0n);
  });

  test("at the scale 323, the smallest subnormal rounds to 0n, and 1e-310 to 10^13", () => {
    const C = wide(323);
    expect(C.from(Number.MIN_VALUE).value).toBe(0n);
    expect(C.from(1e-310).value).toBe(10n ** 13n);
  });
});

describe("BoundedInt classes: negative ties go to the even integer, at every scale", () => {
  /** The even one of the two integers around the tie `-a/2`, for an odd `a`. */
  const even = (a: bigint) => {
    const below = -(a + 1n) / 2n;
    return below % 2n === 0n ? below : below + 1n;
  };

  // From the scale 22, the tie 3 · 5^22 / 2 needs 16 digits, more than a number holds.
  const scales = Array.from({ length: 44 }, (_, i) => i - 22);

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
    class Kilograms extends Mass {
      static override scale = 0;
    }
    expect([Kilograms.min, Kilograms.max]).toEqual([0, 100.05]);
    expect(Kilograms.from(2.3).value).toBe(2n);
    expect(() => Kilograms.from(100.05)).toThrow(RangeError);
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

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #47    | new: the edge cases of the decimal classes; the exact decimal of a number, the ends of the scales, the error of a class (#44) |
// | #51    | imports the generic BoundedInt of bounded-int.ts; placeholders of #47 removed (#49) |
