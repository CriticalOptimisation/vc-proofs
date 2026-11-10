/**
 * `BoundedInt` (#41; docs/core/bounded-int.md): an integer held as a `bigint`, made only
 * by `BoundedInt.from`, which takes a value within the bounds of `BoundedInt`,
 * `[0, 32767.5)` (#44), and a `number` only on a class of at most 15 digits, such as `Safe`.
 * The integers of 76 digits are cast on `Unsigned`, `[0, ℓ)`, and negative integers on
 * `Signed`, classes written by hand whose bounds hold them. Implicit
 * conversions throw, except to a string; `valueOf()` is an ordinary method that returns
 * the nearest `number`, and gives back every integer `number` that `from` took. The same
 * file runs in Node.js and in every headless browser.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BoundedInt } from "../src/core/bounded-int.js";

const L = 2n ** 252n + 27742317777372353535851937790883648493n;
/** Number.MAX_VALUE, the largest finite number, as the integer it is: 2^1024 − 2^971. */
const MAX = 2n ** 1024n - 2n ** 971n;
const x = () => BoundedInt.from(5n);

/**
 * A class of `ℓ` integers centered on 0, for the negative integers that the range of
 * `BoundedInt`, `[0, ℓ)`, does not hold (#44).
 */
class Signed extends BoundedInt {
  static override min = -(L - 1n) / 2n;
  static override max = (L + 1n) / 2n;
}

/** A class of the integers `[0, ℓ)`, which needs 76 digits and takes no `number` (#44). */
class Unsigned extends BoundedInt {
  static override min = 0n;
  static override max = L;
}

/**
 * A class of the integers of at most 15 digits, which a `number` holds reliably: the
 * classes of more digits, `BoundedInt` and `Signed` included, take no `number` (#44).
 */
class Safe extends BoundedInt {
  static override min = -(10n ** 15n - 1n);
  static override max = 10n ** 15n - 1n;
}

describe("BoundedInt.from: the casts", () => {
  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ); negative integers need a class of their own)
  // from(%s).value is the bigint of the integer
  //   -> from(%s).value is the bigint of the integer (the positive rows)
  //   -> on a class with negative integers, from(%s).value is the bigint of the integer
  // test.each([
  //   ["5n", 5n, 5n],
  //   ["5", 5, 5n],
  //   ["-7", -7, -7n],
  //   ["0", 0, 0n],
  //   ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER, 2n ** 53n - 1n],
  //   ["-Number.MAX_SAFE_INTEGER", -Number.MAX_SAFE_INTEGER, -(2n ** 53n - 1n)],
  // ] as const)("from(%s).value is the bigint of the integer", (_, input, expected) => {
  //   const value = BoundedInt.from(input).value;
  //   expect(typeof value).toBe("bigint");
  //   expect(value).toBe(expected);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(%s).value is the bigint of the integer
  //   -> on a class of 15 digits, from(%s).value is the bigint of the integer
  // test.each([
  //   ["5n", 5n, 5n],
  //   ["5", 5, 5n],
  //   ["0", 0, 0n],
  //   ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER, 2n ** 53n - 1n],
  // ] as const)("from(%s).value is the bigint of the integer", (_, input, expected) => {
  //   const value = BoundedInt.from(input).value;
  //   expect(typeof value).toBe("bigint");
  //   expect(value).toBe(expected);
  // });
  test.each([
    ["5n", 5n, 5n],
    ["5", 5, 5n],
    ["0", 0, 0n],
    ["-7", -7, -7n],
    ["999999999999998", 999999999999998, 999999999999998n],
    ["-999999999999998", -999999999999998, -999999999999998n],
  ] as const)(
    "on a class of 15 digits, from(%s).value is the bigint of the integer",
    (_, input, expected) => {
      const value = Safe.from(input).value;
      expect(typeof value).toBe("bigint");
      expect(value).toBe(expected);
    },
  );

  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // on a class with negative integers, from(%s).value is the bigint of the integer
  //   -> on a class with negative integers, from(-1n).value is -1n; its numbers are on a class of 15 digits
  // test.each([
  //   ["-7", -7, -7n],
  //   ["-1n", -1n, -1n],
  //   ["-Number.MAX_SAFE_INTEGER", -Number.MAX_SAFE_INTEGER, -(2n ** 53n - 1n)],
  // ] as const)(
  //   "on a class with negative integers, from(%s).value is the bigint of the integer",
  //   (_, input, expected) => {
  //     expect(Signed.from(input).value).toBe(expected);
  //   },
  // );
  test("on a class with negative integers, from(-1n).value is -1n; its numbers are on a class of 15 digits", () => {
    expect(Signed.from(-1n).value).toBe(-1n);
  });

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(%s) keeps the integer as it is: no reduction mod ℓ
  //   -> from(%s), within [0, ℓ), keeps the integer as it is
  //   -> "BoundedInt.from: the refusals" / from(%s), outside [0, ℓ), throws a RangeError that
  //      names from: no reduction mod ℓ
  //   -> on a class with negative integers, from(%s).value is the bigint of the integer (-1n)
  // test.each([
  //   ["-1n", -1n],
  //   ["ℓ", L],
  //   ["ℓ + 1", L + 1n],
  //   ["2^300", 2n ** 300n],
  //   ["-(2^300)", -(2n ** 300n)],
  // ] as const)("from(%s) keeps the integer as it is: no reduction mod ℓ", (_, input) => {
  //   expect(BoundedInt.from(input).value).toBe(input);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // within [0, ℓ), keeps the integer as it is"
  //   -> on a class of the integers [0, ℓ), from(%s) keeps the integer as it is
  // test.each([
  //   ["0n", 0n],
  //   ["ℓ − 1", L - 1n],
  //   ["2^252", 2n ** 252n],
  // ] as const)("from(%s), within [0, ℓ), keeps the integer as it is", (_, input) => {
  //   expect(BoundedInt.from(input).value).toBe(input);
  // });
  test.each([
    ["0n", 0n],
    ["ℓ − 1", L - 1n],
    ["2^252", 2n ** 252n],
  ] as const)(
    "on a class of the integers [0, ℓ), from(%s) keeps the integer as it is",
    (_, input) => {
      expect(Unsigned.from(input).value).toBe(input);
    },
  );

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(%s), an integer number beyond 2^53 − 1, is the exact bigint of that number
  //   -> from(%s), an integer number beyond 2^53 − 1 and below ℓ, is the exact bigint of
  //      that number
  //   -> "BoundedInt.from: the refusals" / from(%s), outside [0, ℓ), throws a RangeError that
  //      names from: no reduction mod ℓ (1e300, ±Number.MAX_VALUE)
  //   -> on a class with negative integers, from(%s), an integer number beyond 2^53 − 1, is
  //      the exact bigint of that number (-(2 ** 60))
  // test.each([
  //   ["2 ** 60", 2 ** 60, 2n ** 60n],
  //   ["-(2 ** 60)", -(2 ** 60), -(2n ** 60n)],
  //   ["Number.MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1, 2n ** 53n],
  //   ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8, 2n ** 60n + 2n ** 8n],
  //   ["1e300", 1e300, BigInt(1e300)],
  //   ["Number.MAX_VALUE", Number.MAX_VALUE, MAX],
  //   ["-Number.MAX_VALUE", -Number.MAX_VALUE, -MAX],
  // ] as const)(
  //   "from(%s), an integer number beyond 2^53 − 1, is the exact bigint of that number",
  //   (_, input, expected) => {
  //     expect(BoundedInt.from(input).value).toBe(expected);
  //   },
  // );
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(%s), an integer number beyond 2^53 − 1 and below ℓ, is the exact bigint of that number
  //   -> from(%s), a number on BoundedInt, which needs 76 digits, is a TypeError; its bigint is kept exactly
  // test.each([
  //   ["2 ** 60", 2 ** 60, 2n ** 60n],
  //   ["Number.MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1, 2n ** 53n],
  //   ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8, 2n ** 60n + 2n ** 8n],
  //   ["2 ** 252", 2 ** 252, 2n ** 252n],
  // ] as const)(
  //   "from(%s), an integer number beyond 2^53 − 1 and below ℓ, is the exact bigint of that number",
  //   (_, input, expected) => {
  //     expect(BoundedInt.from(input).value).toBe(expected);
  //   },
  // );
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // a number on BoundedInt, which needs 76 digits, is a TypeError; its bigint is kept exactly"
  //   -> from(%s), a number on a class of 76 digits, is a TypeError; its bigint is kept exactly
  // test.each([
  //   ["5", 5, 5n],
  //   ["2 ** 60", 2 ** 60, 2n ** 60n],
  //   ["Number.MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1, 2n ** 53n],
  //   ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8, 2n ** 60n + 2n ** 8n],
  //   ["2 ** 252", 2 ** 252, 2n ** 252n],
  // ] as const)(
  //   "from(%s), a number on BoundedInt, which needs 76 digits, is a TypeError; its bigint is kept exactly",
  //   (_, input, expected) => {
  //     expect(() => BoundedInt.from(input)).toThrow(TypeError);
  //     expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
  //     expect(BoundedInt.from(expected).value).toBe(expected);
  //   },
  // );
  test.each([
    ["5", 5, 5n],
    ["2 ** 60", 2 ** 60, 2n ** 60n],
    ["Number.MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1, 2n ** 53n],
    ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8, 2n ** 60n + 2n ** 8n],
    ["2 ** 252", 2 ** 252, 2n ** 252n],
  ] as const)(
    "from(%s), a number on a class of 76 digits, is a TypeError; its bigint is kept exactly",
    (_, input, expected) => {
      expect(() => Unsigned.from(input)).toThrow(TypeError);
      expect(() => Unsigned.from(input)).toThrow(/^Unsigned\.from: /);
      expect(Unsigned.from(expected).value).toBe(expected);
    },
  );

  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // on a class with negative integers, from(%s), an integer number beyond 2^53 − 1, is the exact bigint of that number
  //   -> on a class with negative integers, from(%s), a number, is a TypeError; its bigint is kept exactly
  // test.each([
  //   ["-(2 ** 60)", -(2 ** 60), -(2n ** 60n)],
  //   ["-(2 ** 251)", -(2 ** 251), -(2n ** 251n)],
  // ] as const)(
  //   "on a class with negative integers, from(%s), an integer number beyond 2^53 − 1, is the exact bigint of that number",
  //   (_, input, expected) => {
  //     expect(Signed.from(input).value).toBe(expected);
  //   },
  // );
  test.each([
    ["-(2 ** 60)", -(2 ** 60), -(2n ** 60n)],
    ["-(2 ** 251)", -(2 ** 251), -(2n ** 251n)],
  ] as const)(
    "on a class with negative integers, from(%s), a number, is a TypeError; its bigint is kept exactly",
    (_, input, expected) => {
      expect(() => Signed.from(input)).toThrow(TypeError);
      expect(Signed.from(expected).value).toBe(expected);
    },
  );
});

describe("BoundedInt.from: the refusals", () => {
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // throws a TypeError that names from"
  //   -> from(%s) throws a TypeError that names from (1.5 is no longer refused: it rounds)
  // test.each([
  //   ["1.5", 1.5],
  //   ["NaN", NaN],
  //   ["Infinity", Infinity],
  //   ["-Infinity", -Infinity],
  //   ['"5"', "5"],
  //   ["null", null],
  //   ["undefined", undefined],
  //   ["{}", {}],
  //   ["a BoundedInt", BoundedInt.from(5n)],
  // ] as const)("from(%s) throws a TypeError that names from", (_, input) => {
  //   expect(() => BoundedInt.from(input as never)).toThrow(TypeError);
  //   expect(() => BoundedInt.from(input as never)).toThrow(/from/);
  // });
  test.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ['"5"', "5"],
    ["null", null],
    ["undefined", undefined],
    ["{}", {}],
    ["a BoundedInt", BoundedInt.from(5n)],
  ] as const)("from(%s) throws a TypeError that names from", (_, input) => {
    expect(() => BoundedInt.from(input as never)).toThrow(TypeError);
    expect(() => BoundedInt.from(input as never)).toThrow(/from/);
  });

  test("from(1.5) rounds to the step, ties to even: 2n; from(0.4) is 0n", () => {
    expect(BoundedInt.from(1.5).value).toBe(2n);
    expect(BoundedInt.from(2.5).value).toBe(2n);
    expect(BoundedInt.from(0.4).value).toBe(0n);
  });

  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(%s), outside [0, ℓ), throws a RangeError that names from: no reduction mod ℓ
  //   -> from(%s), outside [0, ℓ), throws a RangeError that names from: no reduction mod ℓ (the numbers are a TypeError before)
  // test.each([
  //   ["-1n", -1n],
  //   ["-7", -7],
  //   ["ℓ", L],
  //   ["ℓ + 1", L + 1n],
  //   ["2^300", 2n ** 300n],
  //   ["-(2^300)", -(2n ** 300n)],
  //   ["2 ** 253", 2 ** 253],
  //   ["1e300", 1e300],
  //   ["Number.MAX_VALUE", Number.MAX_VALUE],
  //   ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  // ] as const)(
  //   "from(%s), outside [0, ℓ), throws a RangeError that names from: no reduction mod ℓ",
  //   (_, input) => {
  //     expect(() => BoundedInt.from(input)).toThrow(RangeError);
  //     expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
  //   },
  // );
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // outside [0, ℓ), throws a RangeError that names from: no reduction mod ℓ (the numbers are a TypeError before)"
  //   -> on a class of the integers [0, ℓ), from(%s) throws a RangeError…; BoundedInt.from(%s), outside [0, 32767.5), throws a RangeError
  // test.each([
  //   ["-1n", -1n],
  //   ["ℓ", L],
  //   ["ℓ + 1", L + 1n],
  //   ["2^300", 2n ** 300n],
  //   ["-(2^300)", -(2n ** 300n)],
  //   ["2^253", 2n ** 253n],
  // ] as const)(
  //   "from(%s), outside [0, ℓ), throws a RangeError that names from: no reduction mod ℓ (the numbers are a TypeError before)",
  //   (_, input) => {
  //     expect(() => BoundedInt.from(input)).toThrow(RangeError);
  //     expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
  //     for (const number of [-7, 2 ** 253, 1e300, Number.MAX_VALUE, -Number.MAX_VALUE]) {
  //       expect(() => BoundedInt.from(number)).toThrow(TypeError);
  //     }
  //   },
  // );
  test.each([
    ["-1n", -1n],
    ["ℓ", L],
    ["ℓ + 1", L + 1n],
    ["2^300", 2n ** 300n],
    ["-(2^300)", -(2n ** 300n)],
    ["2^253", 2n ** 253n],
  ] as const)(
    "on a class of the integers [0, ℓ), from(%s) throws a RangeError that names from: no reduction mod ℓ",
    (_, input) => {
      expect(() => Unsigned.from(input)).toThrow(RangeError);
      expect(() => Unsigned.from(input)).toThrow(/^Unsigned\.from: /);
    },
  );

  test.each([
    ["-1", -1],
    ["-0.6", -0.6],
    ["32767.5", 32767.5],
    ["2 ** 15", 2 ** 15],
    ["1e300", 1e300],
  ] as const)("BoundedInt.from(%s), outside [0, 32767.5), throws a RangeError", (_, input) => {
    expect(() => BoundedInt.from(input)).toThrow(RangeError);
    expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
  });
});

describe("BoundedInt: the instance", () => {
  test("from returns an instance of BoundedInt", () => {
    expect(x()).toBeInstanceOf(BoundedInt);
  });

  test("two instances of the same integer are distinct objects with equal values", () => {
    const a = BoundedInt.from([5n, 0]);
    const b = BoundedInt.from(5n);
    expect(a).not.toBe(b);
    expect(a.value).toBe(b.value);
  });

  test("an instance has no own enumerable property", () => {
    expect(Object.keys(x())).toEqual([]);
  });

  test("value cannot be assigned", () => {
    const a = x();
    expect(() => {
      (a as { value: bigint }).value = 1n;
    }).toThrow(TypeError);
    expect(a.value).toBe(5n);
  });

  // REVIEW PLACEHOLDER (#44: every class has a range, BoundedInt too)
  // no bounds yet: no min, max, minValue or maxValue, on the class or an instance
  //   -> the bounds are min and end, on the class: [0n, ℓ) on BoundedInt; no max, minValue or
  //      maxValue, and none on an instance
  // test("no bounds yet: no min, max, minValue or maxValue, on the class or an instance", () => {
  //   for (const name of ["min", "max", "minValue", "maxValue"]) {
  //     expect(name in BoundedInt).toBe(false);
  //     expect(name in x()).toBe(false);
  //   }
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: exact decimals; toString() does not go through valueOf(); the bounds [min, max))
  // the bounds are min and end, on the class: [0n, ℓ) on BoundedInt; no max, minValue or maxValue, and none on an instance
  //   -> the bounds are min and max, on the class: [0n, ℓ) on BoundedInt; no end, minValue or maxValue, and none on an instance
  // test("the bounds are min and end, on the class: [0n, ℓ) on BoundedInt; no max, minValue or maxValue, and none on an instance", () => {
  //   expect(BoundedInt.min).toBe(0n);
  //   expect(BoundedInt.end).toBe(L);
  //   for (const name of ["min", "end", "max", "minValue", "maxValue"]) {
  //     expect(name in x()).toBe(false);
  //   }
  //   for (const name of ["max", "minValue", "maxValue"]) {
  //     expect(name in BoundedInt).toBe(false);
  //   }
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // the bounds are min and max, on the class: [0n, ℓ) on BoundedInt
  //   -> the bounds are min and max, on the class: [0n, 32767.5) on BoundedInt; no end, minValue or maxValue, and none on an instance
  // test("the bounds are min and max, on the class: [0n, ℓ) on BoundedInt; no end, minValue or maxValue, and none on an instance", () => {
  //   expect(BoundedInt.min).toBe(0n);
  //   expect(BoundedInt.max).toBe(L);
  //   for (const name of ["min", "end", "max", "minValue", "maxValue"]) {
  //     expect(name in x()).toBe(false);
  //   }
  //   for (const name of ["end", "minValue", "maxValue"]) {
  //     expect(name in BoundedInt).toBe(false);
  //   }
  // });
  test("the bounds are min and max, on the class: [0n, 32767.5) on BoundedInt; no end, minValue or maxValue, and none on an instance", () => {
    expect(BoundedInt.min).toBe(0n);
    expect(BoundedInt.max).toBe(32767.5);
    for (const name of ["min", "end", "max", "minValue", "maxValue"]) {
      expect(name in x()).toBe(false);
    }
    for (const name of ["end", "minValue", "maxValue"]) {
      expect(name in BoundedInt).toBe(false);
    }
  });

  test("the types: value is a bigint, valueOf() a number, toString() a string", () => {
    expectTypeOf(x().value).toEqualTypeOf<bigint>();
    expectTypeOf(x().valueOf()).toEqualTypeOf<number>();
    expectTypeOf(x().toString()).toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof BoundedInt.from>[0]>().toEqualTypeOf<
      bigint | number | readonly [mantissa: bigint, exponent: number]
    >();
    expectTypeOf<BoundedInt>().not.toExtend<bigint>();
    expectTypeOf<BoundedInt>().not.toExtend<number>();
  });

  test("the constructor is not public: from is the only way in", () => {
    // Checked by the type checker (npm run typecheck); never called.
    const outside = (): unknown =>
      // @ts-expect-error: the constructor is protected
      new BoundedInt(1n);
    expect(typeof outside).toBe("function");
  });
});

describe("BoundedInt: valueOf and toString", () => {
  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(%s).valueOf() is the number %s
  //   -> from(%s).valueOf() is the number %s (−7n moves to Signed; 10^300 becomes ℓ − 1)
  //   -> on a class with negative integers, from(%s).valueOf() is the number %s
  // test.each([
  //   [5n, 5],
  //   [-7n, -7],
  //   [0n, 0],
  //   [10n ** 300n, 1e300],
  //   [2n ** 53n + 1n, 2 ** 53],
  // ] as const)("from(%s).valueOf() is the number %s", (input, expected) => {
  //   const result = BoundedInt.from(input).valueOf();
  //   expect(typeof result).toBe("number");
  //   expect(result).toBe(expected);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // .valueOf() is the number %s", (input, expected)
  //   -> on a class of the integers [0, ℓ), from(%s).valueOf() is the number %s
  // test.each([
  //   [5n, 5],
  //   [0n, 0],
  //   [L - 1n, Number(L - 1n)],
  //   [2n ** 53n + 1n, 2 ** 53],
  // ] as const)("from(%s).valueOf() is the number %s", (input, expected) => {
  //   const result = BoundedInt.from(input).valueOf();
  //   expect(typeof result).toBe("number");
  //   expect(result).toBe(expected);
  // });
  test.each([
    [5n, 5],
    [0n, 0],
    [L - 1n, Number(L - 1n)],
    [2n ** 53n + 1n, 2 ** 53],
  ] as const)(
    "on a class of the integers [0, ℓ), from(%s).valueOf() is the number %s",
    (input, expected) => {
      const result = Unsigned.from(input).valueOf();
      expect(typeof result).toBe("number");
      expect(result).toBe(expected);
    },
  );

  test.each([
    [-7n, -7],
    [-(2n ** 53n + 1n), -(2 ** 53)],
  ] as const)(
    "on a class with negative integers, from(%s).valueOf() is the number %s",
    (input, expected) => {
      expect(Signed.from(input).valueOf()).toBe(expected);
    },
  );

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ); valueOf() is finite on it)
  // valueOf() of %s, beyond the range of a number, throws a RangeError
  //   -> "BoundedInt.from: the refusals" / from(%s), outside [0, ℓ), throws a RangeError that
  //      names from: no reduction mod ℓ
  //   -> test/bounded-int-scale-edge.test.ts / valueOf() and toString() throw a RangeError
  //      that names valueOf where the number is ±Infinity, at the scale −300
  // valueOf() of ±Number.MAX_VALUE, as bigints, is ±Number.MAX_VALUE
  //   -> from(%s).valueOf() is the number %s (ℓ − 1)
  // valueOf() of %s, beyond ±Number.MAX_VALUE but rounded to it, is ±Number.MAX_VALUE
  //   -> from(%s).valueOf() is the number %s (ℓ − 1)
  // valueOf() of %s, where the number would be ±Infinity, throws a RangeError
  //   -> test/bounded-int-scale-edge.test.ts / valueOf() and toString() throw a RangeError
  //      that names valueOf where the number is ±Infinity, at the scale −300
  // test.each([
  //   ["2^1100", 2n ** 1100n],
  //   ["-(2^1100)", -(2n ** 1100n)],
  // ] as const)("valueOf() of %s, beyond the range of a number, throws a RangeError", (_, input) => {
  //   expect(() => BoundedInt.from(input).valueOf()).toThrow(RangeError);
  // });
  //
  // test("valueOf() of ±Number.MAX_VALUE, as bigints, is ±Number.MAX_VALUE", () => {
  //   expect(BoundedInt.from(MAX).valueOf()).toBe(Number.MAX_VALUE);
  //   expect(BoundedInt.from(-MAX).valueOf()).toBe(-Number.MAX_VALUE);
  // });
  //
  // test.each([
  //   ["Number.MAX_VALUE + 1", MAX + 1n, Number.MAX_VALUE],
  //   ["-Number.MAX_VALUE - 1", -MAX - 1n, -Number.MAX_VALUE],
  // ] as const)(
  //   "valueOf() of %s, beyond ±Number.MAX_VALUE but rounded to it, is ±Number.MAX_VALUE",
  //   (_, input, expected) => {
  //     expect(BoundedInt.from(input).valueOf()).toBe(expected);
  //   },
  // );
  //
  // test.each([
  //   ["2^1024 − 2^970", 2n ** 1024n - 2n ** 970n],
  //   ["-(2^1024 − 2^970)", -(2n ** 1024n - 2n ** 970n)],
  // ] as const)(
  //   "valueOf() of %s, where the number would be ±Infinity, throws a RangeError",
  //   (_, input) => {
  //     expect(() => BoundedInt.from(input).valueOf()).toThrow(RangeError);
  //   },
  // );
  test("integers beyond ±Number.MAX_VALUE are outside [0, ℓ): from refuses them before any valueOf()", () => {
    for (const input of [MAX, MAX + 1n, 2n ** 1100n, -MAX, -(2n ** 1100n)]) {
      expect(() => BoundedInt.from(input)).toThrow(RangeError);
    }
  });

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(%s).toString() is the string of valueOf(): %s
  //   -> from(%s).toString() is the string of valueOf(): %s (−7n moves to Signed)
  //   -> on a class with negative integers, toString() of -7n is "-7"
  // test.each([
  //   [5n, "5"],
  //   [-7n, "-7"],
  //   [10n ** 21n, "1e+21"],
  // ] as const)("from(%s).toString() is the string of valueOf(): %s", (input, expected) => {
  //   expect(BoundedInt.from(input).toString()).toBe(expected);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: exact decimals; toString() does not go through valueOf(); the bounds [min, max))
  // from(%s).toString() is the string of valueOf(): %s
  //   -> from(%s).toString() is the exact decimal: %s
  // test.each([
  //   [5n, "5"],
  //   [10n ** 21n, "1e+21"],
  // ] as const)("from(%s).toString() is the string of valueOf(): %s", (input, expected) => {
  //   expect(BoundedInt.from(input).toString()).toBe(expected);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // .toString() is the exact decimal: %s"
  //   -> on a class of the integers [0, ℓ), from(%s).toString() is the exact decimal: %s
  // test.each([
  //   [5n, "5"],
  //   [10n ** 21n, "1000000000000000000000"],
  //   [2n ** 53n + 1n, "9007199254740993"],
  // ] as const)("from(%s).toString() is the exact decimal: %s", (input, expected) => {
  //   expect(BoundedInt.from(input).toString()).toBe(expected);
  // });
  test.each([
    [5n, "5"],
    [10n ** 21n, "1000000000000000000000"],
    [2n ** 53n + 1n, "9007199254740993"],
  ] as const)(
    "on a class of the integers [0, ℓ), from(%s).toString() is the exact decimal: %s",
    (input, expected) => {
      expect(Unsigned.from(input).toString()).toBe(expected);
    },
  );

  test('on a class with negative integers, toString() of -7n is "-7"', () => {
    expect(Signed.from(-7n).toString()).toBe("-7");
  });
});

describe("BoundedInt: valueOf gives back every integer number that from took", () => {
  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(%s).valueOf() gives the number back
  //   -> from(%s).valueOf() gives the number back (the rows below ℓ: 2 ** 252 in place of
  //      1e300, 2 ** 1023 and Number.MAX_VALUE)
  //   -> on a class with negative integers, from(%s).valueOf() gives the number back
  // test.each([
  //   ["0", 0],
  //   ["-7", -7],
  //   ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
  //   ["2 ** 53", 2 ** 53],
  //   ["-(2 ** 53 + 2)", -(2 ** 53 + 2)],
  //   ["-(2 ** 60)", -(2 ** 60)],
  //   ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8],
  //   ["1e300", 1e300],
  //   ["2 ** 1023", 2 ** 1023],
  //   ["Number.MAX_VALUE", Number.MAX_VALUE],
  //   ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  // ] as const)("from(%s).valueOf() gives the number back", (_, n) => {
  //   expect(BoundedInt.from(n).valueOf()).toBe(n);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(%s).valueOf() gives the number back
  //   -> on a class of 15 digits, from(%s).valueOf() gives the number back
  // on a class with negative integers, from(%s).valueOf() gives the number back
  //   -> on a class of 15 digits, from(%s).valueOf() gives the number back (the numbers of
  //      more digits are a TypeError: see "from(%s), a number on BoundedInt, …")
  // test.each([
  //   ["0", 0],
  //   ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
  //   ["2 ** 53", 2 ** 53],
  //   ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8],
  //   ["2 ** 252", 2 ** 252],
  // ] as const)("from(%s).valueOf() gives the number back", (_, n) => {
  //   expect(BoundedInt.from(n).valueOf()).toBe(n);
  // });
  //
  // test.each([
  //   ["-7", -7],
  //   ["-(2 ** 53 + 2)", -(2 ** 53 + 2)],
  //   ["-(2 ** 60)", -(2 ** 60)],
  //   ["-(2 ** 251)", -(2 ** 251)],
  // ] as const)(
  //   "on a class with negative integers, from(%s).valueOf() gives the number back",
  //   (_, n) => {
  //     expect(Signed.from(n).valueOf()).toBe(n);
  //   },
  // );
  test.each([
    ["0", 0],
    ["-7", -7],
    ["2 ** 40 + 1", 2 ** 40 + 1],
    ["999999999999998", 999999999999998],
    ["-999999999999998", -999999999999998],
  ] as const)("on a class of 15 digits, from(%s).valueOf() gives the number back", (_, n) => {
    expect(Safe.from(n).valueOf()).toBe(n);
  });

  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // beyond 15 digits, a bigint gives the nearest number
  //   -> (the same, on Unsigned)
  // test("beyond 15 digits, a bigint gives the nearest number: 2n ** 60n + 2n ** 8n gives 2 ** 60 + 2 ** 8", () => {
  //   expect(BoundedInt.from(2n ** 60n + 2n ** 8n).valueOf()).toBe(2 ** 60 + 2 ** 8);
  //   expect(Signed.from(-(2n ** 251n)).valueOf()).toBe(-(2 ** 251));
  // });
  test("beyond 15 digits, a bigint gives the nearest number: 2n ** 60n + 2n ** 8n gives 2 ** 60 + 2 ** 8", () => {
    expect(Unsigned.from(2n ** 60n + 2n ** 8n).valueOf()).toBe(2 ** 60 + 2 ** 8);
    expect(Signed.from(-(2n ** 251n)).valueOf()).toBe(-(2 ** 251));
  });
});

describe("BoundedInt: implicit conversion", () => {
  test("to a string, it gives toString(): template literal and String()", () => {
    // The casts only quiet the type checker: the conversion happens at run time.
    expect(`<${x() as unknown as string}>`).toBe("<5>");
    // A negative integer needs a class whose range holds it (#44).
    expect(String(Signed.from(-7n))).toBe("-7");
  });

  test.each([
    ["x + 1n", () => (x() as unknown as bigint) + 1n],
    ['"x = " + x', () => "x = " + (x() as unknown as string)],
    ["x < 5n", () => (x() as unknown as bigint) < 5n],
    ["x * 2n", () => (x() as unknown as bigint) * 2n],
    ["Math.abs(x)", () => Math.abs(x() as unknown as number)],
    ["Number(x)", () => Number(x())],
  ] as const)("%s throws a TypeError that points to x.valueOf() and x.value", (_, use) => {
    expect(use).toThrow(TypeError);
    expect(use).toThrow(/x\.valueOf\(\)/);
    expect(use).toThrow(/x\.value\b/);
  });

  test("[Symbol.toPrimitive] gives toString() for the hint string, and throws for the others", () => {
    const a = x();
    expect(a[Symbol.toPrimitive]("string")).toBe("5");
    expect(() => a[Symbol.toPrimitive]("number")).toThrow(TypeError);
    expect(() => a[Symbol.toPrimitive]("default")).toThrow(TypeError);
  });
});

describe("BoundedInt: subclasses", () => {
  /** A subclass that scales by 256, as a bounded type of #31 might. */
  class Scaled extends BoundedInt {
    readonly unit = "1/256";
    static override from(n: bigint | number): Scaled {
      return new Scaled(Safe.from(n).value * 256n);
    }
    override valueOf(): number {
      return super.valueOf() / 256;
    }
  }

  class Plain extends BoundedInt {}

  test("a subclass may override from and valueOf, and add a field", () => {
    const s = Scaled.from(3);
    expect(s).toBeInstanceOf(Scaled);
    expect(s).toBeInstanceOf(BoundedInt);
    expect(s.value).toBe(768n);
    expect(s.valueOf()).toBe(3);
    expect(s.unit).toBe("1/256");
  });

  // REVIEW PLACEHOLDER (#44, review of PR #47: exact decimals; toString() does not go through valueOf(); the bounds [min, max))
  // toString and the string conversion follow the subclass's valueOf
  //   -> toString and the string conversion do not follow the subclass's valueOf: they write the integer's decimal
  // test("toString and the string conversion follow the subclass's valueOf", () => {
  //   expect(Scaled.from(3).toString()).toBe("3");
  //   expect(`<${Scaled.from(3) as unknown as string}>`).toBe("<3>");
  // });
  test("toString and the string conversion do not follow the subclass's valueOf: they write the integer's decimal", () => {
    expect(Scaled.from(3).toString()).toBe("768");
    expect(`<${Scaled.from(3) as unknown as string}>`).toBe("<768>");
  });

  test("a subclass that keeps from gets an instance of itself", () => {
    const p = Plain.from(3n);
    expect(p).toBeInstanceOf(Plain);
    expect(p.value).toBe(3n);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the casts, refusals and conversions of BoundedInt (#41)  |
// | #47    | the range [0, ℓ): negative casts on Signed; −1, ℓ and beyond refused by from; the bounds min and end (#44) |
// | #51    | imports the generic BoundedInt of bounded-int.ts (#49)        |
