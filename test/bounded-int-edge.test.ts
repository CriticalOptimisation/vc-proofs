/**
 * The edge cases of `BoundedInt` (#41; docs/core/bounded-int.md): negative zero, the
 * first integers beyond the safe ones on both sides (on `Unsigned` and `Signed`, classes of
 * 76 digits, #44), the integers outside their range, the rounding of BoundedInt, boxed
 * numbers and bigints, the messages of a subclass's `from`, and a subclass that overrides
 * `toString`. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../src/core/index.js";

const L = 2n ** 252n + 27742317777372353535851937790883648493n;

/** A class of `ℓ` integers centered on 0, for negative integers (#44). */
class Signed extends BoundedInt {
  static override min = -(L - 1n) / 2n;
  static override max = (L + 1n) / 2n;
}

/** A class of the integers `[0, ℓ)`, which needs 76 digits and takes no `number` (#44). */
class Unsigned extends BoundedInt {
  static override min = 0n;
  static override max = L;
}

/** A class of the integers of at most 15 digits, which takes a `number` (#44). */
class Safe extends BoundedInt {
  static override min = -(10n ** 15n - 1n);
  static override max = 10n ** 15n - 1n;
}

describe("BoundedInt.from: the edges of the casts", () => {
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(-0) holds 0n, and its valueOf() is 0
  //   -> on a class of 15 digits, from(-0) holds 0n, and its valueOf() is 0
  // test("from(-0) holds 0n, and its valueOf() is 0", () => {
  //   const zero = BoundedInt.from(-0);
  //   expect(zero.value).toBe(0n);
  //   expect(Object.is(zero.valueOf(), 0)).toBe(true);
  //   expect(zero.toString()).toBe("0");
  // });
  test("on a class of 15 digits, from(-0) holds 0n, and its valueOf() is 0", () => {
    const zero = Safe.from(-0);
    expect(zero.value).toBe(0n);
    expect(Object.is(zero.valueOf(), 0)).toBe(true);
    expect(zero.toString()).toBe("0");
  });

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(%s), just beyond the safe integers or at ±Number.MAX_VALUE, is exact
  //   -> from(%s), just beyond the safe integers, is exact
  //   -> on a class with negative integers, from(Number.MIN_SAFE_INTEGER - 1), which is
  //      -(2 ** 53), is exact
  //   -> from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf()
  // test.each([
  //   ["Number.MIN_SAFE_INTEGER - 1, which is -(2 ** 53)", Number.MIN_SAFE_INTEGER - 1, -(2n ** 53n)],
  //   // 2^53 + 1 is not a number: the addition already rounds it, ties to even, to 2^53.
  //   ["Number.MAX_SAFE_INTEGER + 2, which is 2 ** 53", Number.MAX_SAFE_INTEGER + 2, 2n ** 53n],
  //   [
  //     "Number.MAX_SAFE_INTEGER + 3, which is 2 ** 53 + 2",
  //     Number.MAX_SAFE_INTEGER + 3,
  //     2n ** 53n + 2n,
  //   ],
  //   // 2^53 + 3 is not a number either: it is a tie, and ties to even give 2^53 + 4.
  //   [
  //     "Number.MAX_SAFE_INTEGER + 4, which is 2 ** 53 + 4",
  //     Number.MAX_SAFE_INTEGER + 4,
  //     2n ** 53n + 4n,
  //   ],
  //   ["Number.MAX_VALUE", Number.MAX_VALUE, 2n ** 1024n - 2n ** 971n],
  //   ["-Number.MAX_VALUE", -Number.MAX_VALUE, -(2n ** 1024n - 2n ** 971n)],
  // ] as const)(
  //   "from(%s), just beyond the safe integers or at ±Number.MAX_VALUE, is exact",
  //   (_, input, expected) => {
  //     expect(BoundedInt.from(input).value).toBe(expected);
  //   },
  // );
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(%s), just beyond the safe integers, is exact
  //   -> from(%s), just beyond the safe integers, is a TypeError: more than 15 digits; its bigint is exact
  // test.each([
  //   // 2^53 + 1 is not a number: the addition already rounds it, ties to even, to 2^53.
  //   ["Number.MAX_SAFE_INTEGER + 2, which is 2 ** 53", Number.MAX_SAFE_INTEGER + 2, 2n ** 53n],
  //   [
  //     "Number.MAX_SAFE_INTEGER + 3, which is 2 ** 53 + 2",
  //     Number.MAX_SAFE_INTEGER + 3,
  //     2n ** 53n + 2n,
  //   ],
  //   // 2^53 + 3 is not a number either: it is a tie, and ties to even give 2^53 + 4.
  //   [
  //     "Number.MAX_SAFE_INTEGER + 4, which is 2 ** 53 + 4",
  //     Number.MAX_SAFE_INTEGER + 4,
  //     2n ** 53n + 4n,
  //   ],
  // ] as const)("from(%s), just beyond the safe integers, is exact", (_, input, expected) => {
  //   expect(BoundedInt.from(input).value).toBe(expected);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // just beyond the safe integers, is a TypeError: more than 15 digits; its bigint is exact"
  //   -> from(%s), just beyond the safe integers, on a class of 76 digits, is a TypeError; its bigint is exact
  // test.each([
  //   // 2^53 + 1 is not a number: the addition already rounds it, ties to even, to 2^53.
  //   ["Number.MAX_SAFE_INTEGER + 2, which is 2 ** 53", Number.MAX_SAFE_INTEGER + 2, 2n ** 53n],
  //   // 2^53 + 3 is not a number either: it is a tie, and ties to even give 2^53 + 4.
  //   [
  //     "Number.MAX_SAFE_INTEGER + 4, which is 2 ** 53 + 4",
  //     Number.MAX_SAFE_INTEGER + 4,
  //     2n ** 53n + 4n,
  //   ],
  //   ["Number.MIN_SAFE_INTEGER, on Signed", Number.MIN_SAFE_INTEGER, -(2n ** 53n - 1n)],
  //   ["Number.MIN_SAFE_INTEGER - 1, on Signed", Number.MIN_SAFE_INTEGER - 1, -(2n ** 53n)],
  // ] as const)(
  //   "from(%s), just beyond the safe integers, is a TypeError: more than 15 digits; its bigint is exact",
  //   (_, input, expected) => {
  //     const C = input < 0 ? Signed : BoundedInt;
  //     expect(() => C.from(input)).toThrow(TypeError);
  //     expect(C.from(expected).value).toBe(expected);
  //   },
  // );
  test.each([
    // 2^53 + 1 is not a number: the addition already rounds it, ties to even, to 2^53.
    ["Number.MAX_SAFE_INTEGER + 2, which is 2 ** 53", Number.MAX_SAFE_INTEGER + 2, 2n ** 53n],
    // 2^53 + 3 is not a number either: it is a tie, and ties to even give 2^53 + 4.
    [
      "Number.MAX_SAFE_INTEGER + 4, which is 2 ** 53 + 4",
      Number.MAX_SAFE_INTEGER + 4,
      2n ** 53n + 4n,
    ],
    ["Number.MIN_SAFE_INTEGER, on Signed", Number.MIN_SAFE_INTEGER, -(2n ** 53n - 1n)],
    ["Number.MIN_SAFE_INTEGER - 1, on Signed", Number.MIN_SAFE_INTEGER - 1, -(2n ** 53n)],
  ] as const)(
    "from(%s), just beyond the safe integers, on a class of 76 digits, is a TypeError; its bigint is exact",
    (_, input, expected) => {
      const C = input < 0 ? Signed : Unsigned;
      expect(() => C.from(input)).toThrow(TypeError);
      expect(C.from(expected).value).toBe(expected);
    },
  );

  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // on a class with negative integers, from(Number.MIN_SAFE_INTEGER - 1), which is -(2 ** 53), is exact
  //   -> from(%s), just beyond the safe integers, is a TypeError… (the row Number.MIN_SAFE_INTEGER - 1, on Signed)
  // test("on a class with negative integers, from(Number.MIN_SAFE_INTEGER - 1), which is -(2 ** 53), is exact", () => {
  //   expect(Signed.from(Number.MIN_SAFE_INTEGER - 1).value).toBe(-(2n ** 53n));
  // });

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // from(Number.MIN_SAFE_INTEGER) is exact
  //   -> on a class with negative integers, from(Number.MIN_SAFE_INTEGER) is exact
  // test("from(Number.MIN_SAFE_INTEGER) is exact", () => {
  //   expect(BoundedInt.from(Number.MIN_SAFE_INTEGER).value).toBe(-(2n ** 53n - 1n));
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // on a class with negative integers, from(Number.MIN_SAFE_INTEGER) is exact
  //   -> from(%s), just beyond the safe integers, is a TypeError… (the row Number.MIN_SAFE_INTEGER, on Signed)
  // test("on a class with negative integers, from(Number.MIN_SAFE_INTEGER) is exact", () => {
  //   expect(Signed.from(Number.MIN_SAFE_INTEGER).value).toBe(-(2n ** 53n - 1n));
  // });

  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // not an integer, throws a TypeError"
  //   -> BoundedInt.from(%s), not an integer, rounds to the step, ties to even; outside [0, 32767.5), it is a RangeError
  // test.each([
  //   ["Number.EPSILON", Number.EPSILON],
  //   ["-0.5", -0.5],
  //   ["2 ** 52 - 0.5", 2 ** 52 - 0.5],
  //   ["Number.MIN_VALUE", Number.MIN_VALUE],
  // ] as const)("from(%s), not an integer, throws a TypeError", (_, input) => {
  //   expect(() => BoundedInt.from(input)).toThrow(TypeError);
  //   expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
  // });
  test.each([
    ["Number.EPSILON", Number.EPSILON, 0n],
    ["Number.MIN_VALUE", Number.MIN_VALUE, 0n],
    ["0.5", 0.5, 0n],
    ["1.5", 1.5, 2n],
    ["32766.5", 32766.5, 32766n],
  ] as const)(
    "BoundedInt.from(%s), not an integer, rounds to the step, ties to even: %s",
    (_, input, q) => {
      expect(BoundedInt.from(input).value).toBe(q);
    },
  );

  test.each([
    ["-0.5", -0.5],
    ["2 ** 52 - 0.5", 2 ** 52 - 0.5],
  ] as const)(
    "BoundedInt.from(%s), not an integer and outside [0, 32767.5), is a RangeError",
    (_, input) => {
      expect(() => BoundedInt.from(input)).toThrow(RangeError);
      expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
    },
  );

  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(2 ** 53 + 0.5), which is 2 ** 53, an integer, is 2n ** 53n
  //   -> on a class of 15 digits, from(2 ** 49 + 0.5) is a TypeError: not an integer
  // test("from(2 ** 53 + 0.5), which is 2 ** 53, an integer, is 2n ** 53n", () => {
  //   expect(BoundedInt.from(2 ** 53 + 0.5).value).toBe(2n ** 53n);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // from(2 ** 49 + 0.5) is a TypeError: not an integer"
  //   -> on a class of 15 digits, from(2 ** 49 + 0.5) rounds, ties to even, to 2n ** 49n
  // test("on a class of 15 digits, from(2 ** 49 + 0.5) is a TypeError: not an integer", () => {
  //   expect(() => Safe.from(2 ** 49 + 0.5)).toThrow(TypeError);
  //   expect(() => Safe.from(2 ** 49 + 0.5)).toThrow(/must be an integer/);
  //   expect(Safe.from(2 ** 49).value).toBe(2n ** 49n);
  // });
  test("on a class of 15 digits, from(2 ** 49 + 0.5) rounds, ties to even, to 2n ** 49n", () => {
    expect(Safe.from(2 ** 49 + 0.5).value).toBe(2n ** 49n);
    expect(Safe.from(2 ** 49 + 1.5).value).toBe(2n ** 49n + 2n);
  });

  test.each([
    ["new Number(5)", new Number(5)],
    ["Object(5n)", Object(5n) as object],
    ["[5]", [5]],
    ["true", true],
    ["a symbol", Symbol("5")],
    ["a function", () => 5n],
  ] as const)("from(%s), not a bigint or a number primitive, throws a TypeError", (_, input) => {
    expect(() => BoundedInt.from(input as never)).toThrow(TypeError);
    expect(() => BoundedInt.from(input as never)).toThrow(/^BoundedInt\.from: /);
  });

  test("an object with a valueOf is refused, and its valueOf is never called", () => {
    let calls = 0;
    const tricky = {
      valueOf: () => {
        calls++;
        return 5;
      },
    };
    expect(() => BoundedInt.from(tricky as never)).toThrow(TypeError);
    expect(calls).toBe(0);
  });
});

describe("BoundedInt: valueOf at the edges of a number", () => {
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // valueOf() of 2^60 is exact: it is a power of two"
  //   -> (the same, on Unsigned)
  // test("valueOf() of 2^60 is exact: it is a power of two", () => {
  //   expect(BoundedInt.from(2n ** 60n).valueOf()).toBe(2 ** 60);
  // });
  test("valueOf() of 2^60 is exact: it is a power of two", () => {
    expect(Unsigned.from(2n ** 60n).valueOf()).toBe(2 ** 60);
  });

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ); valueOf() is finite on it)
  // valueOf() of the largest finite number, as a bigint, is Number.MAX_VALUE
  //   -> from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf()
  // valueOf() and toString() of %s throw a RangeError that names valueOf
  //   -> test/bounded-int-scale-edge.test.ts / valueOf() and toString() throw a RangeError
  //      that names valueOf where the number is ±Infinity, at the scale −300
  // valueOf() of the last integer that Number() rounds to Number.MAX_VALUE is
  // ±Number.MAX_VALUE, with its negation
  //   -> from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf()
  // valueOf() of the first integer that Number() rounds to Infinity throws a RangeError, and
  // so does its negation
  //   -> test/bounded-int-scale-edge.test.ts / valueOf() and toString() throw a RangeError
  //      that names valueOf where the number is ±Infinity, at the scale −300
  // test("valueOf() of the largest finite number, as a bigint, is Number.MAX_VALUE", () => {
  //   const max = BigInt(Number.MAX_VALUE);
  //   expect(BoundedInt.from(max).valueOf()).toBe(Number.MAX_VALUE);
  //   expect(BoundedInt.from(-max).valueOf()).toBe(-Number.MAX_VALUE);
  // });
  //
  // test.each([
  //   ["2^1024", 2n ** 1024n],
  //   ["-(2^1024)", -(2n ** 1024n)],
  // ] as const)("valueOf() and toString() of %s throw a RangeError that names valueOf", (_, n) => {
  //   const a = BoundedInt.from(n);
  //   expect(() => a.valueOf()).toThrow(RangeError);
  //   expect(() => a.valueOf()).toThrow(/^BoundedInt\.valueOf: /);
  //   expect(() => a.toString()).toThrow(RangeError);
  //   expect(() => `<${a as unknown as string}>`).toThrow(RangeError);
  // });
  //
  // // Number() rounds every integer below 2^1024 − 2^970 down to Number.MAX_VALUE.
  // test("valueOf() of the last integer that Number() rounds to Number.MAX_VALUE is ±Number.MAX_VALUE, with its negation", () => {
  //   const n = 2n ** 1024n - 2n ** 970n - 1n;
  //   expect(BoundedInt.from(n).valueOf()).toBe(Number.MAX_VALUE);
  //   expect(BoundedInt.from(-n).valueOf()).toBe(-Number.MAX_VALUE);
  // });
  //
  // test("valueOf() of the first integer that Number() rounds to Infinity throws a RangeError, and so does its negation", () => {
  //   const n = 2n ** 1024n - 2n ** 970n;
  //   expect(() => BoundedInt.from(n).valueOf()).toThrow(RangeError);
  //   expect(() => BoundedInt.from(-n).valueOf()).toThrow(RangeError);
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: a number only on a class of at most 15 digits)
  // from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf()
  //   -> from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf() (±Number.MAX_VALUE: a TypeError, a number)
  // test.each([
  //   ["Number.MAX_VALUE", Number.MAX_VALUE],
  //   ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  //   ["2^1024", 2n ** 1024n],
  //   ["-(2^1024)", -(2n ** 1024n)],
  //   ["2^1024 − 2^970 − 1", 2n ** 1024n - 2n ** 970n - 1n],
  //   ["2^1024 − 2^970", 2n ** 1024n - 2n ** 970n],
  //   ["ℓ", L],
  //   ["-1n", -1n],
  // ] as const)(
  //   "from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf()",
  //   (_, n) => {
  //     expect(() => BoundedInt.from(n)).toThrow(RangeError);
  //     expect(() => BoundedInt.from(n)).toThrow(/^BoundedInt\.from: /);
  //   },
  // );
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // outside [0, ℓ), throws a RangeError that names from, before any valueOf() (±Number.MAX_VALUE: a TypeError, a number)"
  //   -> (the same, on Unsigned)
  // test.each([
  //   ["2^1024", 2n ** 1024n],
  //   ["-(2^1024)", -(2n ** 1024n)],
  //   ["2^1024 − 2^970 − 1", 2n ** 1024n - 2n ** 970n - 1n],
  //   ["2^1024 − 2^970", 2n ** 1024n - 2n ** 970n],
  //   ["ℓ", L],
  //   ["-1n", -1n],
  // ] as const)(
  //   "from(%s), outside [0, ℓ), throws a RangeError that names from, before any valueOf() (±Number.MAX_VALUE: a TypeError, a number)",
  //   (_, n) => {
  //     expect(() => BoundedInt.from(n)).toThrow(RangeError);
  //     expect(() => BoundedInt.from(n)).toThrow(/^BoundedInt\.from: /);
  //     expect(() => BoundedInt.from(Number.MAX_VALUE)).toThrow(TypeError);
  //     expect(() => BoundedInt.from(-Number.MAX_VALUE)).toThrow(TypeError);
  //   },
  // );
  test.each([
    ["2^1024", 2n ** 1024n],
    ["-(2^1024)", -(2n ** 1024n)],
    ["2^1024 − 2^970 − 1", 2n ** 1024n - 2n ** 970n - 1n],
    ["2^1024 − 2^970", 2n ** 1024n - 2n ** 970n],
    ["ℓ", L],
    ["-1n", -1n],
  ] as const)(
    "on a class of the integers [0, ℓ), from(%s) throws a RangeError that names from, before any valueOf() (±Number.MAX_VALUE: a TypeError, a number)",
    (_, n) => {
      expect(() => Unsigned.from(n)).toThrow(RangeError);
      expect(() => Unsigned.from(n)).toThrow(/^Unsigned\.from: /);
      expect(() => Unsigned.from(Number.MAX_VALUE)).toThrow(TypeError);
      expect(() => Unsigned.from(-Number.MAX_VALUE)).toThrow(TypeError);
    },
  );

  // REVIEW PLACEHOLDER (#44, review of PR #47: exact decimals; toString() does not go through valueOf(); the bounds [min, max))
  // value stays exact where valueOf() is not
  //   -> value and toString() stay exact where valueOf() is not
  // test("value stays exact where valueOf() is not", () => {
  //   const a = BoundedInt.from(2n ** 53n + 1n);
  //   expect(a.value).toBe(2n ** 53n + 1n);
  //   expect(a.value.toString()).toBe("9007199254740993");
  //   expect(a.toString()).toBe("9007199254740992");
  // });
  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // value and toString() stay exact where valueOf() is not"
  //   -> (the same, on Unsigned)
  // test("value and toString() stay exact where valueOf() is not", () => {
  //   const a = BoundedInt.from(2n ** 53n + 1n);
  //   expect(a.value).toBe(2n ** 53n + 1n);
  //   expect(a.toString()).toBe("9007199254740993");
  //   expect(a.valueOf()).toBe(2 ** 53);
  // });
  test("value and toString() stay exact where valueOf() is not", () => {
    const a = Unsigned.from(2n ** 53n + 1n);
    expect(a.value).toBe(2n ** 53n + 1n);
    expect(a.toString()).toBe("9007199254740993");
    expect(a.valueOf()).toBe(2 ** 53);
  });
});

describe("BoundedInt: conversions not covered by the preliminary tests", () => {
  test.each([
    ["x == 5", () => (BoundedInt.from(5n) as unknown as number) == 5],
    ["x - 1", () => (BoundedInt.from(5n) as unknown as number) - 1],
    ["BigInt(x)", () => BigInt(BoundedInt.from(5n) as unknown as number)],
    ["x > 3", () => (BoundedInt.from(5n) as unknown as number) > 3],
  ] as const)("%s throws a TypeError", (_, use) => {
    expect(use).toThrow(TypeError);
    expect(use).toThrow(/x\.valueOf\(\)/);
  });

  test("JSON.stringify gives {}", () => {
    expect(JSON.stringify(BoundedInt.from(5n))).toBe("{}");
  });
});

describe("BoundedInt: subclasses at the edges", () => {
  class Days extends BoundedInt {}

  // REVIEW PLACEHOLDER (#44, review of PR #47: no integerOnly; BoundedInt is [0, 32767.5); numbers rounded to 15 digits)
  // the messages of a subclass's inherited from name that subclass"
  //   -> (the same, with -1 in place of 1.5, which now rounds)
  // test("the messages of a subclass's inherited from name that subclass", () => {
  //   expect(() => Days.from(1.5)).toThrow(/^Days\.from: /);
  //   expect(() => Days.from(Infinity)).toThrow(/^Days\.from: /);
  //   expect(() => Days.from("5" as never)).toThrow(/^Days\.from: /);
  // });
  test("the messages of a subclass's inherited from name that subclass", () => {
    expect(() => Days.from(-1)).toThrow(/^Days\.from: /);
    expect(() => Days.from(Infinity)).toThrow(/^Days\.from: /);
    expect(() => Days.from("5" as never)).toThrow(/^Days\.from: /);
  });

  // REVIEW PLACEHOLDER (#44: the range of BoundedInt is [0, ℓ))
  // the messages of valueOf and of an implicit conversion name the subclass
  //   -> the messages of a RangeError of from and of an implicit conversion name the subclass
  // test("the messages of valueOf and of an implicit conversion name the subclass", () => {
  //   expect(() => Days.from(2n ** 1024n).valueOf()).toThrow(/^Days\.valueOf: /);
  //   expect(() => (Days.from(1) as unknown as bigint) + 1n).toThrow(/^Days: /);
  // });
  test("the messages of a RangeError of from and of an implicit conversion name the subclass", () => {
    expect(() => Days.from(2n ** 1024n)).toThrow(RangeError);
    expect(() => Days.from(2n ** 1024n)).toThrow(/^Days\.from: /);
    expect(() => (Days.from(1n) as unknown as bigint) + 1n).toThrow(/^Days: /);
  });

  test("a subclass that overrides toString: the string conversion follows it", () => {
    class Labelled extends BoundedInt {
      override toString(): string {
        return `${String(this.valueOf())} d`;
      }
    }
    const a = Labelled.from(3n);
    expect(`<${a as unknown as string}>`).toBe("<3 d>");
    expect(String(a)).toBe("3 d");
    expect(() => (a as unknown as bigint) + 1n).toThrow(TypeError);
  });

  test("a subclass's from refuses a BoundedInt of the base class", () => {
    expect(() => Days.from(BoundedInt.from(1n) as never)).toThrow(TypeError);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the edge cases of BoundedInt (#41)                       |
// | #47    | the range [0, ℓ): negative integers on Signed, ±Number.MAX_VALUE and ℓ refused by from (#44) |
