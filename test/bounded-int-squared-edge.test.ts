/**
 * The edge cases of the quadratic error kept squared (#62; docs/core/bounded-int.md, *The
 * errors of a class*, *The display position* and *The quadratic error getter*): the display
 * position found from a rough error of two digits, against an exact oracle; a
 * `quadraticSquared` of 0, errors of one digit, the coarsest and the finest scales; the
 * `quadraticError` getter against exact integer roots, over exponents from −300 to +300 and
 * near the limits of a `number`; `termError ≤ quadraticError ≤ errorBound`; `sum` and
 * `product` at the edges; errors borrowed from another class, a class written by hand with
 * `quadraticSquared`, the labels of a single quantity, ignored keys, and decimals that agree
 * only once normalized. The random sweeps use a fixed seed, so every run checks the same
 * cases. The same file runs in Node.js and in every headless browser.
 */
import { describe, expect, test } from "vitest";
import {
  BoundedInt,
  type Decimal,
  type ErrorSpec,
  errors,
  NO_ERROR_PROCESSING,
  product,
  type Quantity,
  sum,
} from "../src/core/bounded-int.js";

// --- Oracles, written independently of bounded-int.ts -----------------------

/** A pseudo-random generator in `[0, 1)`, from a fixed seed (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer from `lo` to `hi`, both included. */
const between = (r: () => number, lo: number, hi: number): number =>
  lo + Math.floor(r() * (hi - lo + 1));

/** A positive `bigint` of exactly `d` decimal digits. */
function ofDigits(r: () => number, d: number): bigint {
  let text = String(between(r, 1, 9));
  for (let i = 1; i < d; i++) text += String(between(r, 0, 9));
  return BigInt(text);
}

/** The number of decimal digits of `n ≥ 0`; 0 for 0. */
const digitsOf = (n: bigint): number => (n === 0n ? 0 : n.toString().length);

/** `⌊f · n · 10^e⌋`, for `n ≥ 0` and `f > 0`. */
function floorOf(f: bigint, [n, e]: Decimal): bigint {
  return e >= 0 ? f * n * 10n ** BigInt(e) : (f * n) / 10n ** BigInt(-e);
}

/**
 * The exact display position for an error `ε` in steps: the largest `j ≥ 1` with
 * `10^j ≤ 2ε`, else 0. For a square `Q` in steps², `ε = √Q` and `10^j ≤ 2ε` is
 * `10^(2j) ≤ 4Q`. `10^j` is an integer, so it is below the real `2ε` exactly when it is below
 * its integer part.
 */
function exactPosition(error: Decimal, squared: boolean): number {
  if (!squared) {
    const i = floorOf(2n, error);
    return i >= 10n ? digitsOf(i) - 1 : 0;
  }
  const i = floorOf(4n, error);
  return i >= 100n ? Math.floor((digitsOf(i) - 1) / 2) : 0;
}

/** `n / d` rounded to the nearest integer, ties to even, for `n ≥ 0` and `d > 0`. */
function roundEven(n: bigint, d: bigint): bigint {
  const q = n / d;
  const twice = 2n * (n - q * d);
  return twice > d || (twice === d && q % 2n === 1n) ? q + 1n : q;
}

/** The decimal string of `n · 10^e`, `n ≥ 0`, as `toString()` writes it. */
function written(n: bigint, e: number): string {
  if (e >= 0) return n === 0n ? "0" : `${String(n)}${"0".repeat(e)}`;
  const text = n.toString().padStart(-e + 1, "0");
  return `${text.slice(0, e)}.${text.slice(e)}`;
}

/** What `fromValue(q).toString()` shows at the scale `k` for an error of position `j`. */
function shown(q: bigint, j: number, k: number): string {
  return written(j === 0 ? q : roundEven(q, 10n ** BigInt(j)), j - k);
}

/** `⌊√x⌋`, exact, by Newton's iteration run to its end, for `x ≥ 0`. */
function isqrt(x: bigint): bigint {
  if (x < 2n) return x;
  let r = 1n << BigInt((x.toString(2).length >> 1) + 1);
  for (;;) {
    const y = (r + x / r) >> 1n;
    if (y >= r) return r;
    r = y;
  }
}

/**
 * `√(Q) / R` as the nearest `number`, for `Q = [qn, qe] > 0` and `R = [rn, re] > 0`: the
 * integer root of `qn · 10^s / rn²`, of at least 80 digits, read as a decimal string, which
 * JavaScript rounds correctly.
 */
function exactRootRatio([qn, qe]: Decimal, [rn, re]: Decimal): number {
  let s = Math.max(0, 2 * digitsOf(rn) - digitsOf(qn) + 160);
  if ((qe - 2 * re - s) % 2 !== 0) s++;
  const root = isqrt((qn * 10n ** BigInt(s)) / (rn * rn));
  return Number(`${String(root)}e${String((qe - 2 * re - s) / 2)}`);
}

/** The square of a decimal, normalized. */
function square([n, e]: Decimal): Decimal {
  let [m, f] = [n * n, 2 * e];
  if (m === 0n) return [0n, 0];
  while (m % 10n === 0n) {
    m /= 10n;
    f++;
  }
  return [m, f];
}

/** A class made from `BoundedInt` over `[0, max)` at the scale `k`, with `error`. */
function make(error: unknown, k = 0, max: Quantity = [1n, 40 - k]) {
  return BoundedInt.define({
    name: "E",
    min: 0,
    max,
    step: [1n, -k],
    ...(error === undefined ? {} : { error: error as ErrorSpec }),
  });
}

// --- The display position --------------------------------------------------

describe("the display position from a rough error of two digits, against the exact position", () => {
  /** The error `ε` in steps given as `slot`, converted to the unit of the values at scale `k`. */
  const spec = (slot: "bound" | "quadraticSquared" | "term", [n, e]: Decimal, k: number) => ({
    [slot]: [n, slot === "quadraticSquared" ? e - 2 * k : e - k] as Decimal,
  });

  /** Checks one error, given as `slot` in steps, on a value of 30 digits. */
  function check(
    slot: "bound" | "quadraticSquared" | "term",
    error: Decimal,
    k: number,
    q: bigint,
  ): void {
    const C = make(spec(slot, error, k), k);
    const j = exactPosition(error, slot === "quadraticSquared");
    expect(C.fromValue(q).toString(), `${slot} [${String(error[0])}n, ${String(error[1])}]`).toBe(
      shown(q, j, k),
    );
  }

  test("a random sweep of 600 errors, of 1 to 40 digits, from 10^-40 to 10^30 steps, alone in each slot, at the scales −5, 0, 3 and 7", () => {
    const r = random(62);
    const slots = ["bound", "quadraticSquared", "term"] as const;
    for (let i = 0; i < 600; i++) {
      const slot = slots[i % 3] as (typeof slots)[number];
      const k = [-5, 0, 3, 7][between(r, 0, 3)] as number;
      const d = between(r, 1, 40);
      const error: Decimal = [ofDigits(r, d), between(r, -40, 30) - d + 1];
      check(slot, error, k, ofDigits(r, 30));
    }
  });

  test("errors just below and just above every threshold, 5 · 10^(j−1) steps and its square 25 · 10^(2j−2), for j from 1 to 25", () => {
    const r = random(2062);
    const far = 10n ** 30n;
    for (let j = 1; j <= 25; j++) {
      const q = ofDigits(r, 30);
      for (const delta of [-1n, 0n, 1n]) {
        check("term", [5n * far + delta, j - 1 - 30], 0, q);
        check("bound", [5n * far + delta, j - 1 - 30], 2, q);
        check("quadraticSquared", [25n * far + delta, 2 * j - 2 - 30], 0, q);
        check("quadraticSquared", [25n * far + delta, 2 * j - 2 - 30], -3, q);
      }
    }
  });

  test("errors of one digit, and squares of one digit at even and odd exponents", () => {
    const q = 123456789012345678901234567890n;
    for (let n = 1n; n <= 9n; n++) {
      for (let e = -3; e <= 6; e++) {
        check("term", [n, e], 0, q);
        check("quadraticSquared", [n, e], 0, q);
      }
    }
    // 5 steps give 1, 4 give 0; a square of 25 gives 1, of 24 gives 0; 4000 steps² is 63.2.
    expect(make({ term: 5 }).fromValue(123n).toString()).toBe("120");
    expect(make({ term: 4 }).fromValue(123n).toString()).toBe("123");
    expect(
      make({ quadraticSquared: [25n, 0] })
        .fromValue(123n)
        .toString(),
    ).toBe("120");
    expect(
      make({ quadraticSquared: [24n, 0] })
        .fromValue(123n)
        .toString(),
    ).toBe("123");
    expect(
      make({ quadraticSquared: [4n, 3] })
        .fromValue(12345n)
        .toString(),
    ).toBe("12300");
  });

  test("a quadraticSquared of 0 shows every digit, gives a quadraticError of 0, and leaves the other errors as they are", () => {
    const Z = make({ quadraticSquared: 0 }, 3);
    expect(errors(Z)).toStrictEqual({
      bound: undefined,
      quadraticSquared: [0n, 0],
      term: undefined,
    });
    expect(Z.fromValue(123456n).toString()).toBe("123.456");
    expect(Z.quadraticError).toBe(0);
    expect([Z.errorBound, Z.termError]).toEqual([undefined, undefined]);
    // With a bound above it, nothing is filled in: 0 is not the square of 1.
    const B = make({ bound: 1, quadraticSquared: [0n, 500] }, 3);
    expect(errors(B)).toStrictEqual({ bound: [1n, 0], quadraticSquared: [0n, 0], term: undefined });
    expect(B.quadraticError).toBe(0);
    expect(B.fromValue(123456n).toString()).toBe("123.456");
    // With a term of 0, the two are equal: the bound is 0 too.
    expect(errors(make({ quadraticSquared: 0, term: 0 }))).toStrictEqual({
      bound: [0n, 0],
      quadraticSquared: [0n, 0],
      term: [0n, 0],
    });
  });

  test("the finest scale, 323: a quadraticSquared of 2500 steps² rounds at 10^2 steps, and its getter is exact", () => {
    // Q = 2500 · 10^-646, ε = 50 steps of 10^-323; R = 10^-317.
    const C = make({ quadraticSquared: [25n, -644] }, 323, [1n, -317]);
    expect(C.scale).toBe(323);
    expect(C.fromValue(123456n).toString()).toBe(written(1235n, 2 - 323));
    expect(C.quadraticError).toBe(5e-5);
    expect(C.fromValue(123456n).valueOf()).toBe(1.235e-318);
  });

  test("the coarsest scale, −308: a quadraticSquared of 2500 steps² rounds at 10^2 steps, and its getter is exact", () => {
    // Q = 2500 · 10^616, ε = 50 steps of 10^308; R = 10^311.
    const C = make({ quadraticSquared: [25n, 618] }, -308, [1n, 311]);
    expect(C.scale).toBe(-308);
    expect(C.fromValue(123n).toString()).toBe(`1${"0".repeat(310)}`);
    expect(C.quadraticError).toBe(0.05);
    expect(() => C.fromValue(123n).valueOf()).toThrow(RangeError);
    expect(C.fromValue(1n).toString()).toBe("0");
  });
});

// --- The quadratic error getter --------------------------------------------

describe("quadraticError against exact integer roots", () => {
  test("a sweep of 300 exact squares s² · 10^(2a), s of 1 to 25 digits, over ranges of a power of ten, results from 10^-300 to 10^300", () => {
    const r = random(6200);
    for (let i = 0; i < 300; i++) {
      const ds = between(r, 1, 25);
      const s = ofDigits(r, ds);
      const re = between(r, -300, 300);
      // The result s · 10^(a − re) lies in [10^E, 10^(E+1)).
      const E = between(r, -300, 299);
      const a = E - ds + 1 + re;
      const C = make({ quadraticSquared: [s * s, 2 * a] }, 0, [1n, re]);
      expect(C.quadraticError, `s ${String(s)}, a ${String(a)}, re ${String(re)}`).toBe(
        Number(`${String(s)}e${String(a - re)}`),
      );
    }
  });

  test("a sweep of 300 exact squares over ranges of any digits: the nearest number to s · 10^a / R", () => {
    const r = random(6201);
    for (let i = 0; i < 300; i++) {
      const s = ofDigits(r, between(r, 1, 25));
      const rn = ofDigits(r, between(r, 1, 25));
      const re = between(r, -100, 100);
      const a = between(r, -150, 150);
      const Q: Decimal = [s * s, 2 * a];
      const C = make({ quadraticSquared: Q }, 0, [rn, re]);
      expect(
        C.quadraticError,
        `s ${String(s)}, a ${String(a)}, R [${String(rn)}n, ${String(re)}]`,
      ).toBe(exactRootRatio(Q, [rn, re]));
    }
  });

  test("a sweep of 300 squares that are not exact, of 1 to 60 digits: the nearest number to the exact root", () => {
    const r = random(6202);
    for (let i = 0; i < 300; i++) {
      const dq = between(r, 1, 60);
      const qn = ofDigits(r, dq);
      const rn = ofDigits(r, between(r, 1, 20));
      const re = between(r, -50, 50);
      // log10 √(Q / R²) is about E.
      const E = between(r, -300, 299);
      const qe = 2 * (E + re) - dq + 2 * digitsOf(rn);
      const Q: Decimal = [qn, qe];
      const C = make({ quadraticSquared: Q }, 0, [rn, re]);
      expect(
        C.quadraticError,
        `Q [${String(qn)}n, ${String(qe)}], R [${String(rn)}n, ${String(re)}]`,
      ).toBe(exactRootRatio(Q, [rn, re]));
    }
  });

  test.each<[string, Decimal, Decimal, number]>([
    [
      "the largest number, 1.7976931348623157e308",
      [17976931348623157n ** 2n, 584],
      [1n, 0],
      Number.MAX_VALUE,
    ],
    [
      "the largest number over a range of 10^-300",
      [17976931348623157n ** 2n, -16],
      [1n, -300],
      Number.MAX_VALUE,
    ],
    ["beyond the largest number: Infinity", [18n ** 2n, 614], [1n, 0], Infinity],
    [
      "the smallest normal number, 2.2250738585072014e-308",
      [22250738585072014n ** 2n, -648],
      [1n, 0],
      2.2250738585072014e-308,
    ],
    ["the smallest number, 5e-324", [25n, -648], [1n, 0], Number.MIN_VALUE],
    ["a subnormal, 1.23e-320", [123n ** 2n, -644], [1n, 0], 1.23e-320],
    ["below half the smallest number: 0", [4n, -650], [1n, 0], 0],
    [
      "2^53 + 1, between two numbers, ties to even: 2^53",
      [9007199254740993n ** 2n, 0],
      [1n, 0],
      2 ** 53,
    ],
  ])("%s", (_, Q, R, expected) => {
    expect(make({ quadraticSquared: Q }, 0, R).quadraticError).toBe(expected);
  });
});

describe("termError ≤ quadraticError ≤ errorBound, whenever the three are defined", () => {
  test("a sweep of 400 classes of three different errors, of up to 40 digits", () => {
    const r = random(626);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const e = between(r, -60, 60);
      let T: Decimal = [ofDigits(r, between(r, 1, 20)), e];
      let B: Decimal = [ofDigits(r, between(r, 1, 20)), e + between(r, 0, 3)];
      if (
        square(T)[0] * 10n ** BigInt(square(T)[1] - 2 * e) >
        square(B)[0] * 10n ** BigInt(square(B)[1] - 2 * e)
      ) {
        [T, B] = [B, T];
      }
      const t2 = square(T);
      const b2 = square(B);
      // Q between T² and B², as a point of 40 digits on that interval.
      const f = ofDigits(r, 40);
      const scaleT = 10n ** BigInt(t2[1] - 2 * e);
      const scaleB = 10n ** BigInt(b2[1] - 2 * e);
      const lo = t2[0] * scaleT;
      const hi = b2[0] * scaleB;
      if (lo >= hi) continue;
      const Q: Decimal = [lo * 10n ** 40n + (hi - lo) * f, 2 * e - 40];
      if (Q[0] === lo * 10n ** 40n || Q[0] === hi * 10n ** 40n) continue;
      const C = make({ bound: B, quadraticSquared: Q, term: T }, 0, [
        ofDigits(r, 10),
        between(r, -30, 30),
      ]);
      const [t, q, b] = [C.termError, C.quadraticError, C.errorBound] as number[];
      expect(t, "termError ≤ quadraticError").toBeLessThanOrEqual(q as number);
      expect(q, "quadraticError ≤ errorBound").toBeLessThanOrEqual(b as number);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });

  test("a quadraticSquared within 10^-40 of bound² or of term² stays between the getters", () => {
    for (const b of [1n, 3n, 7n, 123456789n]) {
      const B: Decimal = [b, 0];
      const T: Decimal = [1n, -3];
      const below: Decimal = [b * b * 10n ** 40n - 1n, -40];
      const C = make({ bound: B, quadraticSquared: below, term: T }, 0, [3n, 0]);
      expect(C.quadraticError as number).toBeLessThanOrEqual(C.errorBound as number);
      expect(C.quadraticError as number).toBeGreaterThanOrEqual(C.termError as number);
      const above: Decimal = [10n ** 34n + 1n, -40];
      const D = make({ bound: B, quadraticSquared: above, term: T }, 0, [3n, 0]);
      expect(D.quadraticError as number).toBeGreaterThanOrEqual(D.termError as number);
      expect(D.quadraticError as number).toBeLessThanOrEqual(D.errorBound as number);
    }
  });
});

// --- The arithmetic ----------------------------------------------------------

describe("sum with far-apart exponents, product with 0 and negatives", () => {
  test.each<[string, Decimal, Decimal, Decimal]>([
    ["10^300 + 10^-300", [1n, 300], [1n, -300], [10n ** 600n + 1n, -300]],
    ["10^3000 + 1 keeps its 3001 digits", [1n, 3000], [1n, 0], [10n ** 3000n + 1n, 0]],
    ["10^50 − 10^-50", [1n, 50], [-1n, -50], [10n ** 100n - 1n, -50]],
    ["−10^50 − 10^-50", [-1n, 50], [-1n, -50], [-(10n ** 100n) - 1n, -50]],
    ["5 · 10^400 − 5 · 10^400 is [0n, 0]", [5n, 400], [-5n, 400], [0n, 0]],
    ["0 · 10^-900 + 7 · 10^900 is [7n, 900]", [0n, -900], [7n, 900], [7n, 900]],
    ["9.9 · 10^-301 + 1 · 10^-302 is 10^-300", [99n, -302], [10n, -303], [1n, -300]],
  ])("sum: %s", (_, a, b, expected) => {
    expect(sum(a, b)).toEqual(expected);
    expect(sum(b, a)).toEqual(expected);
  });

  test.each<[string, Decimal, Decimal, Decimal]>([
    ["0 · −3 · 10^2", [0n, -7], [-3n, 2], [0n, 0]],
    ["−0.0 written [0n, 5] · −1", [0n, 5], [-1n, 0], [0n, 0]],
    ["−2000 · −0.0005 is 1", [-2n, 3], [-5n, -4], [1n, 0]],
    ["−2.5 · 4 is −10, [-1n, 1]", [-25n, -1], [4n, 0], [-1n, 1]],
    ["−10^-300 · 10^-300 is −10^-600", [-1n, -300], [1n, -300], [-1n, -600]],
    ["[−120n, 0] · [50n, -1] is −600, [-6n, 2]", [-120n, 0], [50n, -1], [-6n, 2]],
  ])("product: %s", (_, a, b, expected) => {
    expect(product(a, b)).toEqual(expected);
    expect(product(b, a)).toEqual(expected);
  });
});

// --- The errors given ----------------------------------------------------------

describe("errors borrowed from another class, and a class written by hand with quadraticSquared", () => {
  test("the errors of a class of three different errors make another class with the same errors, the same object", () => {
    const A = make({ bound: 3, quadratic: 2, term: 1 });
    const B = BoundedInt.define({ name: "B", min: 0, max: 1000, step: 10, error: errors(A) });
    expect(errors(B)).toBe(errors(A));
    expect(errors(B)).toStrictEqual({ bound: [3n, 0], quadraticSquared: [4n, 0], term: [1n, 0] });
    // The getters are relative to the range of B.
    expect([B.errorBound, B.quadraticError, B.termError]).toEqual([0.003, 0.002, 0.001]);
  });

  test("a copy of those errors goes through the rules again and gives the same decimals", () => {
    const A = make({ bound: 3, quadraticSquared: 2, term: 1 });
    const copy = { ...errors(A) };
    const B = make(copy);
    expect(errors(B)).not.toBe(errors(A));
    expect(errors(B)).toStrictEqual(errors(A));
  });

  test("NO_ERROR_PROCESSING borrowed from a class is NO_ERROR_PROCESSING", () => {
    const Raw = make(NO_ERROR_PROCESSING);
    expect(errors(Raw)).toBe(NO_ERROR_PROCESSING);
    expect(errors(make(errors(Raw)))).toBe(NO_ERROR_PROCESSING);
  });

  test("a class written by hand with quadraticSquared keeps it as it is, and its getter takes its root", () => {
    class Hand extends BoundedInt {
      static override min = 0n;
      static override max = 100n;
      static override error = { bound: 3, quadraticSquared: 2, term: 1 };
    }
    expect(errors(Hand)).toStrictEqual({
      bound: [3n, 0],
      quadraticSquared: [2n, 0],
      term: [1n, 0],
    });
    expect(Hand.quadraticError).toBe(exactRootRatio([2n, 0], [100n, 0]));
    // The display is decided by term: 1 step, j = 0.
    expect(Hand.fromValue(57n).toString()).toBe("57");
  });

  test("a class written by hand with quadraticSquared alone shows at its root; with bound², it fills in term", () => {
    class Alone extends BoundedInt {
      static override min = 0n;
      static override max = 100000n;
      static override error = { quadraticSquared: [25n, 2] as Decimal };
    }
    // √2500 = 50 steps: j = 2.
    expect(Alone.fromValue(12345n).toString()).toBe("12300");
    class Single extends BoundedInt {
      static override error = { bound: 0.5, quadraticSquared: 0.25 };
    }
    expect(errors(Single)).toStrictEqual({
      bound: [5n, -1],
      quadraticSquared: [25n, -2],
      term: [5n, -1],
    });
    expect(Single.quadraticError).toBe(Single.errorBound);
  });
});

describe("the labels of a single quantity, ignored keys, decimals equal once normalized", () => {
  test.each<[string, Quantity]>([
    ["the number −0.5", -0.5],
    ["the bigint −1n", -1n],
    ["the decimal [-5n, -1]", [-5n, -1]],
    ["the decimal [-1n, 400]", [-1n, 400]],
  ])("a single quantity below 0, %s, is named error, as given", (_, error) => {
    expect(() => make(error)).toThrow(RangeError);
    expect(() => make(error)).toThrow(/^BoundedInt\.define: error must be 0 or more$/);
  });

  test("a single quantity gives three equal errors, whatever its form", () => {
    for (const error of [0.5, [5n, -1], [50n, -2], [500n, -3]] as Quantity[]) {
      expect(errors(make(error))).toStrictEqual({
        bound: [5n, -1],
        quadraticSquared: [25n, -2],
        term: [5n, -1],
      });
    }
  });

  test("keys that are not errors are ignored, whatever their value, and so is a key in the wrong case", () => {
    expect(errors(make({ bound: 1, extra: "x", quadraticsquared: -1 }))).toStrictEqual({
      bound: [1n, 0],
      quadraticSquared: undefined,
      term: undefined,
    });
    expect(errors(make({ Quadratic: 2, TERM: null }))).toStrictEqual({
      bound: undefined,
      quadraticSquared: undefined,
      term: undefined,
    });
  });

  test("quadratic [50n, -2] and quadraticSquared [25n, -2] agree once normalized: the square of 0.50 is 0.25", () => {
    expect(errors(make({ quadratic: [50n, -2], quadraticSquared: [25n, -2] }))).toStrictEqual({
      bound: undefined,
      quadraticSquared: [25n, -2],
      term: undefined,
    });
    expect(errors(make({ quadratic: [5n, -1], quadraticSquared: [2500n, -4] }))).toStrictEqual({
      bound: undefined,
      quadraticSquared: [25n, -2],
      term: undefined,
    });
    // 0.50 squared is not 0.025: they differ, normalized or not.
    expect(() => make({ quadratic: [50n, -2], quadraticSquared: [25n, -3] })).toThrow(
      /^BoundedInt\.define: error\.quadraticSquared must be the square of error\.quadratic$/,
    );
  });

  test("bound [50n, -2] and quadraticSquared [25n, -2] are equal once normalized: term is filled in, [5n, -1]", () => {
    expect(errors(make({ bound: [50n, -2], quadraticSquared: [25n, -2] }))).toStrictEqual({
      bound: [5n, -1],
      quadraticSquared: [25n, -2],
      term: [5n, -1],
    });
    // With a different term, the three cannot be equal: a RangeError.
    expect(() => make({ bound: [50n, -2], quadraticSquared: [25n, -2], term: 0.1 })).toThrow(
      /^BoundedInt\.define: error\.term must equal error\.bound and error\.quadraticSquared, which are equal$/,
    );
  });
});
