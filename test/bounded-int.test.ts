/**
 * `BoundedInt` (#41; docs/core/bounded-int.md): an integer held as a `bigint`, made only
 * by `BoundedInt.from`, which casts an integer `number` within the range of `BoundedInt`,
 * the `ℓ` integers centered on 0 (#44), and refuses everything else that is not a
 * `bigint`. Implicit conversions throw, except to a string; `valueOf()` is an ordinary
 * method that returns the nearest `number`, and gives back every integer `number` that
 * `from` took. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, expectTypeOf, test } from "vitest";
import { BoundedInt } from "../src/core/index.js";

const L = 2n ** 252n + 27742317777372353535851937790883648493n;
/** (ℓ − 1) / 2: the range of BoundedInt is [−HALF, HALF + 1) (#44). */
const HALF = (L - 1n) / 2n;
/** Number.MAX_VALUE, the largest finite number, as the integer it is: 2^1024 − 2^971. */
const MAX = 2n ** 1024n - 2n ** 971n;
const x = () => BoundedInt.from(5);

describe("BoundedInt.from: the casts", () => {
  test.each([
    ["5n", 5n, 5n],
    ["5", 5, 5n],
    ["-7", -7, -7n],
    ["0", 0, 0n],
    ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER, 2n ** 53n - 1n],
    ["-Number.MAX_SAFE_INTEGER", -Number.MAX_SAFE_INTEGER, -(2n ** 53n - 1n)],
  ] as const)("from(%s).value is the bigint of the integer", (_, input, expected) => {
    const value = BoundedInt.from(input).value;
    expect(typeof value).toBe("bigint");
    expect(value).toBe(expected);
  });

  // REVIEW PLACEHOLDER (#44, return to Task 4: BoundedInt has the range of Z_ℓ, centered on 0)
  // from(%s) keeps the integer as it is: no reduction mod ℓ
  //   -> from(%s), within the range of BoundedInt, keeps the integer as it is
  //   -> "BoundedInt.from: the refusals" / from(%s), beyond the range of BoundedInt, throws a
  //      RangeError that names from: no reduction mod ℓ
  // test.each([
  //   ["-1n", -1n],
  //   ["ℓ", L],
  //   ["ℓ + 1", L + 1n],
  //   ["2^300", 2n ** 300n],
  //   ["-(2^300)", -(2n ** 300n)],
  // ] as const)("from(%s) keeps the integer as it is: no reduction mod ℓ", (_, input) => {
  //   expect(BoundedInt.from(input).value).toBe(input);
  // });
  test.each([
    ["-1n", -1n],
    ["(ℓ − 1) / 2, the highest integer", HALF],
    ["-(ℓ − 1) / 2, BoundedInt.min", -HALF],
    ["2^251", 2n ** 251n],
    ["-(2^251)", -(2n ** 251n)],
  ] as const)(
    "from(%s), within the range of BoundedInt, keeps the integer as it is",
    (_, input) => {
      expect(BoundedInt.from(input).value).toBe(input);
    },
  );

  // REVIEW PLACEHOLDER (#44, return to Task 4: BoundedInt has the range of Z_ℓ, centered on 0)
  // from(%s), an integer number beyond 2^53 − 1, is the exact bigint of that number
  //   -> from(%s), an integer number beyond 2^53 − 1 and within the range, is the exact
  //      bigint of that number
  //   -> "BoundedInt.from: the refusals" / from(%s), beyond the range of BoundedInt, throws a
  //      RangeError that names from: no reduction mod ℓ (1e300, ±Number.MAX_VALUE)
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
  test.each([
    ["2 ** 60", 2 ** 60, 2n ** 60n],
    ["-(2 ** 60)", -(2 ** 60), -(2n ** 60n)],
    ["Number.MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1, 2n ** 53n],
    ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8, 2n ** 60n + 2n ** 8n],
    ["2 ** 251", 2 ** 251, 2n ** 251n],
    ["-(2 ** 251)", -(2 ** 251), -(2n ** 251n)],
  ] as const)(
    "from(%s), an integer number beyond 2^53 − 1 and within the range, is the exact bigint of that number",
    (_, input, expected) => {
      expect(BoundedInt.from(input).value).toBe(expected);
    },
  );
});

describe("BoundedInt.from: the refusals", () => {
  test.each([
    ["1.5", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ['"5"', "5"],
    ["null", null],
    ["undefined", undefined],
    ["{}", {}],
    ["a BoundedInt", BoundedInt.from(5)],
  ] as const)("from(%s) throws a TypeError that names from", (_, input) => {
    expect(() => BoundedInt.from(input as never)).toThrow(TypeError);
    expect(() => BoundedInt.from(input as never)).toThrow(/from/);
  });

  test.each([
    ["ℓ", L],
    ["ℓ + 1", L + 1n],
    ["2^300", 2n ** 300n],
    ["-(2^300)", -(2n ** 300n)],
    ["(ℓ + 1) / 2, BoundedInt.end", HALF + 1n],
    ["-(ℓ + 1) / 2, one below BoundedInt.min", -HALF - 1n],
    ["2 ** 252", 2 ** 252],
    ["1e300", 1e300],
    ["Number.MAX_VALUE", Number.MAX_VALUE],
    ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  ] as const)(
    "from(%s), beyond the range of BoundedInt, throws a RangeError that names from: no reduction mod ℓ",
    (_, input) => {
      expect(() => BoundedInt.from(input)).toThrow(RangeError);
      expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
    },
  );
});

describe("BoundedInt: the instance", () => {
  test("from returns an instance of BoundedInt", () => {
    expect(x()).toBeInstanceOf(BoundedInt);
  });

  test("two instances of the same integer are distinct objects with equal values", () => {
    const a = BoundedInt.from(5);
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

  // REVIEW PLACEHOLDER (#44, return to Task 4: BoundedInt has the range of Z_ℓ, centered on 0)
  // no bounds yet: no min, max, minValue or maxValue, on the class or an instance
  //   -> the bounds are min and end, on the class: no max, minValue or maxValue, and none on
  //      an instance
  // test("no bounds yet: no min, max, minValue or maxValue, on the class or an instance", () => {
  //   for (const name of ["min", "max", "minValue", "maxValue"]) {
  //     expect(name in BoundedInt).toBe(false);
  //     expect(name in x()).toBe(false);
  //   }
  // });
  test("the bounds are min and end, on the class: no max, minValue or maxValue, and none on an instance", () => {
    expect(BoundedInt.min).toBe(-HALF);
    expect(BoundedInt.end).toBe(HALF + 1n);
    for (const name of ["min", "end", "max", "minValue", "maxValue"]) {
      expect(name in x()).toBe(false);
    }
    for (const name of ["max", "minValue", "maxValue"]) {
      expect(name in BoundedInt).toBe(false);
    }
  });

  test("the types: value is a bigint, valueOf() a number, toString() a string", () => {
    expectTypeOf(x().value).toEqualTypeOf<bigint>();
    expectTypeOf(x().valueOf()).toEqualTypeOf<number>();
    expectTypeOf(x().toString()).toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof BoundedInt.from>[0]>().toEqualTypeOf<bigint | number>();
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
  // REVIEW PLACEHOLDER (#44, return to Task 4: BoundedInt has the range of Z_ℓ, centered on 0)
  // from(%s).valueOf() is the number %s
  //   -> from(%s).valueOf() is the number %s (10^300 replaced by 2^200)
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
  test.each([
    [5n, 5],
    [-7n, -7],
    [0n, 0],
    [2n ** 200n, 2 ** 200],
    [2n ** 53n + 1n, 2 ** 53],
  ] as const)("from(%s).valueOf() is the number %s", (input, expected) => {
    const result = BoundedInt.from(input).valueOf();
    expect(typeof result).toBe("number");
    expect(result).toBe(expected);
  });

  // REVIEW PLACEHOLDER (#44, return to Task 4: BoundedInt has the range of Z_ℓ, centered on 0)
  // valueOf() of %s, beyond the range of a number, throws a RangeError
  //   -> "BoundedInt.from: the refusals" / from(%s), beyond the range of BoundedInt, throws a
  //      RangeError that names from: no reduction mod ℓ
  //   -> valueOf() of the ends of the range of BoundedInt is the nearest number, and finite
  // valueOf() of ±Number.MAX_VALUE, as bigints, is ±Number.MAX_VALUE
  //   -> valueOf() of the ends of the range of BoundedInt is the nearest number, and finite
  // valueOf() of %s, beyond ±Number.MAX_VALUE but rounded to it, is ±Number.MAX_VALUE
  //   -> valueOf() of the ends of the range of BoundedInt is the nearest number, and finite
  // valueOf() of %s, where the number would be ±Infinity, throws a RangeError
  //   -> "BoundedInt.from: the refusals" / from(%s), beyond the range of BoundedInt, throws a
  //      RangeError that names from: no reduction mod ℓ
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
  test("valueOf() of the ends of the range of BoundedInt is the nearest number, and finite", () => {
    expect(BoundedInt.from(HALF).valueOf()).toBe(Number(HALF));
    expect(BoundedInt.from(-HALF).valueOf()).toBe(-Number(HALF));
    expect(Number.isFinite(BoundedInt.from(HALF).valueOf())).toBe(true);
    for (const [input, name] of [
      [MAX, "Number.MAX_VALUE"],
      [2n ** 1100n, "2^1100"],
    ] as const) {
      expect(() => BoundedInt.from(input), name).toThrow(RangeError);
      expect(() => BoundedInt.from(-input), name).toThrow(RangeError);
    }
  });

  test.each([
    [5n, "5"],
    [-7n, "-7"],
    [10n ** 21n, "1e+21"],
  ] as const)("from(%s).toString() is the string of valueOf(): %s", (input, expected) => {
    expect(BoundedInt.from(input).toString()).toBe(expected);
  });
});

describe("BoundedInt: valueOf gives back every integer number that from took", () => {
  // REVIEW PLACEHOLDER (#44, return to Task 4: BoundedInt has the range of Z_ℓ, centered on 0)
  // from(%s).valueOf() gives the number back
  //   -> from(%s), within the range of BoundedInt, .valueOf() gives the number back (1e300,
  //      2 ** 1023 and ±Number.MAX_VALUE replaced by ±2 ** 251)
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
  test.each([
    ["0", 0],
    ["-7", -7],
    ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
    ["2 ** 53", 2 ** 53],
    ["-(2 ** 53 + 2)", -(2 ** 53 + 2)],
    ["-(2 ** 60)", -(2 ** 60)],
    ["2 ** 60 + 2 ** 8", 2 ** 60 + 2 ** 8],
    ["2 ** 251", 2 ** 251],
    ["-(2 ** 251)", -(2 ** 251)],
  ] as const)(
    "from(%s), within the range of BoundedInt, .valueOf() gives the number back",
    (_, n) => {
      expect(BoundedInt.from(n).valueOf()).toBe(n);
    },
  );
});

describe("BoundedInt: implicit conversion", () => {
  test("to a string, it gives toString(): template literal and String()", () => {
    // The casts only quiet the type checker: the conversion happens at run time.
    expect(`<${x() as unknown as string}>`).toBe("<5>");
    expect(String(BoundedInt.from(-7))).toBe("-7");
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
      return new Scaled(BoundedInt.from(n).value * 256n);
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

  test("toString and the string conversion follow the subclass's valueOf", () => {
    expect(Scaled.from(3).toString()).toBe("3");
    expect(`<${Scaled.from(3) as unknown as string}>`).toBe("<3>");
  });

  test("a subclass that keeps from gets an instance of itself", () => {
    const p = Plain.from(3);
    expect(p).toBeInstanceOf(Plain);
    expect(p.value).toBe(3n);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the casts, refusals and conversions of BoundedInt (#41)  |
