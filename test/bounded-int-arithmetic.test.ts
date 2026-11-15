/**
 * The exact arithmetic of decimals that `bounded-int.ts` exports for the other modules of
 * the library (#62; docs/core/bounded-int.md, *For the other modules of the library*):
 * `compare`, `normalize`, `product` and `sum`, at any length, with no rounding. The exports
 * are read from the module namespace, so that this file compiles and runs before they
 * exist. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import * as module from "../src/core/bounded-int.js";
import type { Decimal } from "../src/core/bounded-int.js";

/** The exports of `bounded-int.ts`, by name. */
const exported = module as unknown as Record<string, unknown>;

/** A function of two decimals, or of one. */
type Binary = (a: Decimal, b: Decimal) => Decimal | number;

/** The export `name`, a function, or a failed expectation. */
function fn(name: string): Binary {
  expect(typeof exported[name], name).toBe("function");
  return exported[name] as Binary;
}

const compare = (a: Decimal, b: Decimal) => fn("compare")(a, b) as number;
const normalize = (d: Decimal) => (fn("normalize") as unknown as (d: Decimal) => Decimal)(d);
const product = (a: Decimal, b: Decimal) => fn("product")(a, b) as Decimal;
const sum = (a: Decimal, b: Decimal) => fn("sum")(a, b) as Decimal;

/** A decimal of 40 digits: 1.234…891. */
const LONG: Decimal = [1234567890123456789012345678901234567891n, -39];

describe("bounded-int.ts exports compare, normalize, product and sum", () => {
  test("the four are exported functions", () => {
    for (const name of ["compare", "normalize", "product", "sum"]) {
      expect(typeof exported[name], name).toBe("function");
    }
  });
});

describe("compare(a, b): the sign of a − b, exact", () => {
  test.each<[string, Decimal, Decimal, number]>([
    ["2.3 and 2.3 written [230n, -2]", [23n, -1], [230n, -2], 0],
    ["0.1 and 0.2", [1n, -1], [2n, -1], -1],
    ["1000 and 999.9", [1n, 3], [9999n, -1], 1],
    ["−1 and 0", [-1n, 0], [0n, 0], -1],
    ["0 and 0 written [0n, 5]", [0n, 0], [0n, 5], 0],
    ["−2 and −3", [-2n, 0], [-3n, 0], 1],
    ["10^10000 and 10^-10000", [1n, 10000], [1n, -10000], 1],
    ["a decimal of 40 digits and itself plus 10^-39", LONG, [LONG[0] + 1n, -39], -1],
  ])("%s", (_, a, b, sign) => {
    expect(compare(a, b)).toBe(sign);
    expect(compare(b, a)).toBe(-sign || 0);
  });
});

describe("normalize(d): no trailing zeros in the mantissa", () => {
  test.each<[string, Decimal, Decimal]>([
    ["[50n, -2] is [5n, -1]", [50n, -2], [5n, -1]],
    ["[-1200n, 0] is [-12n, 2]", [-1200n, 0], [-12n, 2]],
    ["[0n, 7] is [0n, 0]", [0n, 7], [0n, 0]],
    ["[7n, -3] stays", [7n, -3], [7n, -3]],
  ])("%s", (_, d, expected) => {
    expect(normalize(d)).toEqual(expected);
  });
});

describe("product(a, b): a · b, exact, normalized", () => {
  test.each<[string, Decimal, Decimal, Decimal]>([
    ["0.5 · 0.5 is 0.25", [5n, -1], [5n, -1], [25n, -2]],
    ["0.8 · 0.8 is 0.64", [8n, -1], [8n, -1], [64n, -2]],
    ["2.5 · 4 is 10, [1n, 1]", [25n, -1], [4n, 0], [1n, 1]],
    ["−3 · 0.2 is −0.6", [-3n, 0], [2n, -1], [-6n, -1]],
    ["−3 · −3 is 9", [-3n, 0], [-3n, 0], [9n, 0]],
    ["0 · 10^400 is [0n, 0]", [0n, 0], [1n, 400], [0n, 0]],
    ["a decimal of 40 digits squared keeps its 79 digits", LONG, LONG, [LONG[0] * LONG[0], -78]],
  ])("%s", (_, a, b, expected) => {
    expect(product(a, b)).toEqual(expected);
    expect(product(b, a)).toEqual(expected);
  });
});

describe("sum(a, b): a + b, exact, aligned on the smaller exponent, normalized", () => {
  test.each<[string, Decimal, Decimal, Decimal]>([
    ["0.25 + 0.39 is 0.64", [25n, -2], [39n, -2], [64n, -2]],
    ["1 + 0.001 is 1.001", [1n, 0], [1n, -3], [1001n, -3]],
    ["0.5 + 0.5 is 1, [1n, 0]", [5n, -1], [5n, -1], [1n, 0]],
    ["2.3 + −2.3 is [0n, 0]", [23n, -1], [-23n, -1], [0n, 0]],
    ["10^20 + 10^-20 keeps both", [1n, 20], [1n, -20], [10n ** 40n + 1n, -20]],
    ["a decimal of 40 digits plus 10^-39", LONG, [1n, -39], [LONG[0] + 1n, -39]],
  ])("%s", (_, a, b, expected) => {
    expect(sum(a, b)).toEqual(expected);
    expect(sum(b, a)).toEqual(expected);
  });

  test("a sum of squares stays exact: 0.3² + 0.4² is 0.25, the square of 0.5", () => {
    const q = sum(product([3n, -1], [3n, -1]), product([4n, -1], [4n, -1]));
    expect(q).toEqual([25n, -2]);
    expect(compare(q, product([5n, -1], [5n, -1]))).toBe(0);
  });
});

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #63    | new: compare, normalize, product and sum, exact (#62) |
