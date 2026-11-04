/**
 * The edge cases of `BoundedInt` (#41; docs/core/bounded-int.md): negative zero, the
 * first unsafe integers on both sides, `valueOf()` at the edges of a `number`, boxed
 * numbers and bigints, the messages of a subclass's `from`, and a subclass that
 * overrides `toString`. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import { BoundedInt } from "../src/core/index.js";

describe("BoundedInt.from: the edges of the casts", () => {
  test("from(-0) holds 0n, and its valueOf() is 0", () => {
    const zero = BoundedInt.from(-0);
    expect(zero.value).toBe(0n);
    expect(Object.is(zero.valueOf(), 0)).toBe(true);
    expect(zero.toString()).toBe("0");
  });

  test.each([
    ["Number.MIN_SAFE_INTEGER - 1", Number.MIN_SAFE_INTEGER - 1],
    ["Number.MAX_SAFE_INTEGER + 2", Number.MAX_SAFE_INTEGER + 2],
    ["Number.MAX_VALUE", Number.MAX_VALUE],
    ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  ] as const)("from(%s) throws a RangeError, not a TypeError", (_, input) => {
    expect(() => BoundedInt.from(input)).toThrow(RangeError);
    expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
  });

  test("from(Number.MIN_SAFE_INTEGER) is exact", () => {
    expect(BoundedInt.from(Number.MIN_SAFE_INTEGER).value).toBe(-(2n ** 53n - 1n));
  });

  test.each([
    ["Number.EPSILON", Number.EPSILON],
    ["-0.5", -0.5],
    ["2 ** 53 + 0.5, which is 2 ** 53", 2 ** 53 + 0.5],
  ] as const)("from(%s) is refused", (_, input) => {
    expect(() => BoundedInt.from(input)).toThrow(/^BoundedInt\.from: /);
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
  test("valueOf() of 2^60 is exact: it is a power of two", () => {
    expect(BoundedInt.from(2n ** 60n).valueOf()).toBe(2 ** 60);
  });

  test("valueOf() of the largest finite number, as a bigint, is Number.MAX_VALUE", () => {
    const max = BigInt(Number.MAX_VALUE);
    expect(BoundedInt.from(max).valueOf()).toBe(Number.MAX_VALUE);
    expect(BoundedInt.from(-max).valueOf()).toBe(-Number.MAX_VALUE);
  });

  test.each([
    ["2^1024", 2n ** 1024n],
    ["-(2^1024)", -(2n ** 1024n)],
  ] as const)("valueOf() and toString() of %s throw a RangeError that names valueOf", (_, n) => {
    const a = BoundedInt.from(n);
    expect(() => a.valueOf()).toThrow(RangeError);
    expect(() => a.valueOf()).toThrow(/^BoundedInt\.valueOf: /);
    expect(() => a.toString()).toThrow(RangeError);
    expect(() => `<${a as unknown as string}>`).toThrow(RangeError);
  });

  test("value stays exact where valueOf() is not", () => {
    const a = BoundedInt.from(2n ** 53n + 1n);
    expect(a.value).toBe(2n ** 53n + 1n);
    expect(a.value.toString()).toBe("9007199254740993");
    expect(a.toString()).toBe("9007199254740992");
  });
});

describe("BoundedInt: conversions not covered by the preliminary tests", () => {
  test.each([
    ["x == 5", () => (BoundedInt.from(5) as unknown as number) == 5],
    ["x - 1", () => (BoundedInt.from(5) as unknown as number) - 1],
    ["BigInt(x)", () => BigInt(BoundedInt.from(5) as unknown as number)],
    ["x > 3", () => (BoundedInt.from(5) as unknown as number) > 3],
  ] as const)("%s throws a TypeError", (_, use) => {
    expect(use).toThrow(TypeError);
    expect(use).toThrow(/x\.valueOf\(\)/);
  });

  test("JSON.stringify gives {}", () => {
    expect(JSON.stringify(BoundedInt.from(5))).toBe("{}");
  });
});

describe("BoundedInt: subclasses at the edges", () => {
  class Days extends BoundedInt {}

  test("the messages of a subclass's inherited from name that subclass", () => {
    expect(() => Days.from(1.5)).toThrow(/^Days\.from: /);
    expect(() => Days.from(2 ** 60)).toThrow(/^Days\.from: /);
    expect(() => Days.from("5" as never)).toThrow(/^Days\.from: /);
  });

  test("the messages of valueOf and of an implicit conversion name the subclass", () => {
    expect(() => Days.from(2n ** 1024n).valueOf()).toThrow(/^Days\.valueOf: /);
    expect(() => (Days.from(1) as unknown as bigint) + 1n).toThrow(/^Days: /);
  });

  test("a subclass that overrides toString: the string conversion follows it", () => {
    class Labelled extends BoundedInt {
      override toString(): string {
        return `${String(this.valueOf())} d`;
      }
    }
    const a = Labelled.from(3);
    expect(`<${a as unknown as string}>`).toBe("<3 d>");
    expect(String(a)).toBe("3 d");
    expect(() => (a as unknown as bigint) + 1n).toThrow(TypeError);
  });

  test("a subclass's from refuses a BoundedInt of the base class", () => {
    expect(() => Days.from(BoundedInt.from(1) as never)).toThrow(TypeError);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: the edge cases of BoundedInt (#41)                       |
