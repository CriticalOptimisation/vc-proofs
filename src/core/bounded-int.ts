/**
 * `BoundedInt` (docs/core/bounded-int.md): an integer held as a `bigint`, in a class that
 * carries the scale and the bounds of its values as class-level constants. A `bigint`
 * cannot: it is a primitive with no own property.
 *
 * - Every quantity, a value, a bound, a step or an error, is a `bigint`, a `number` or an
 *   exact decimal `[n, e]`, worth `n · 10^e`. It is converted at once to an exact decimal:
 *   a `number` gives the exact decimal of its binary value. All the arithmetic is on
 *   `bigint`s.
 * - A class is described by its constants: `scale` (`k`: the step is `10^-k`), the
 *   semi-open bounds `[min, max)` of its values, kept exactly, and `error`, the three
 *   errors of its values, `bound`, the square of the quadratic error `quadraticSquared`
 *   and `term`, with `term² ≤ quadraticSquared ≤ bound²`, each a decimal in the unit of
 *   the values or `undefined`, compared on squares and never rooted; half a step of its own
 *   scale when it declares none, never those of its parent. Its values round to the
 *   integers `low … high`, and it holds no more of them than its parent, unless its parent
 *   is `BoundedInt`.
 * - `from` compares a value exactly with the bounds, then scales it to the step and rounds
 *   it once, ties to even; `fromValue` takes the integer as it is.
 * - `valueOf()` is the nearest `number`; `toString()` and `toLocaleString()` write the
 *   exact decimal, without the digits that the first defined of `term`, the root of
 *   `quadraticSquared` and `bound` makes meaningless, found from its first two digits.
 *   `[Symbol.toPrimitive]` converts to a string only.
 * - For the other modules of the library, it exports `decimal`, `MANTISSA`, `EXPONENT`,
 *   the exact arithmetic `compare`, `normalize`, `product` and `sum`, `errors`,
 *   `NO_ERROR_PROCESSING` and the types of quantities and errors; `./core` exports only the
 *   types `Decimal` and `Quantity`, and `NO_ERROR_PROCESSING`.
 */

/** The upper bound of `BoundedInt`, a 15-bit integer and half a step: 0 … 32767. */
const MAX = 32767.5;

/**
 * The coarsest and the finest scales, those whose step `10^-k` a `number` can write: the
 * step `10^308`, near the largest `number`, and the step `10^-323`, near the smallest.
 */
const COARSEST_SCALE = -308;
const FINEST_SCALE = 323;

/** An exact decimal `[n, e]`, worth `n · 10^e`: `[23n, -1]` is 2.3. */
export type Decimal = readonly [mantissa: bigint, exponent: number];

/** A quantity: a `bigint`, a `number`, or an exact decimal. */
export type Quantity = bigint | number | Decimal;

/** The index of the mantissa `n` in a decimal `[n, e]`. */
export const MANTISSA = 0;
/** The index of the exponent `e` in a decimal `[n, e]`. */
export const EXPONENT = 1;

/**
 * The object form of `error`: each error given is kept, the others are `undefined` unless
 * the rules fill them in. A key left out and a key set to `undefined` mean the same thing.
 * `quadratic` is squared on input; when `quadraticSquared` is given too, it must be that
 * square, exactly.
 */
export interface ErrorSpec {
  /** A guaranteed bound of the error. */
  readonly bound?: Quantity | undefined;
  /** The quadratic error: the square root of the sum of the squares of independent errors. */
  readonly quadratic?: Quantity | undefined;
  /** The square of the quadratic error: the sum of the squares of independent errors. */
  readonly quadraticSquared?: Quantity | undefined;
  /** The error of the least accurate term. */
  readonly term?: Quantity | undefined;
}

/**
 * The three errors of a class, in the unit of its values: `bound`, the square of the
 * quadratic error `quadraticSquared`, and `term`, each a frozen decimal without trailing
 * zeros, or `undefined` when the class does not know it. No root is ever taken to keep them.
 */
export interface Errors {
  readonly bound: Decimal | undefined;
  readonly quadraticSquared: Decimal | undefined;
  readonly term: Decimal | undefined;
}

/** The specification of `define`. */
export interface BoundedIntSpec {
  readonly name: string;
  /** The lowest value, included. */
  readonly min: Quantity;
  /** The value just above the highest, excluded. */
  readonly max: Quantity;
  /** The accuracy, which gives the scale; the scale 0, a step of 1, when left out. */
  readonly step?: Quantity;
  /**
   * The errors of the values, in their unit: a quantity, the errors of a single term, or an
   * object of errors; half a step each when left out, none with `{}` or
   * `NO_ERROR_PROCESSING`.
   */
  readonly error?: Quantity | ErrorSpec;
}

// --- Exact decimals ---------------------------------------------------------

/** `10^t` as a `bigint`, for `t ≥ 0`. */
function pow10n(t: number): bigint {
  return 10n ** BigInt(t);
}

/** The number of decimal digits of `|n|`; 0 for 0. */
function digits(n: bigint): number {
  return n === 0n ? 0 : (n < 0n ? -n : n).toString().length;
}

/**
 * The same decimal without trailing zeros in its mantissa: `[50n, -2]` is `[5n, -1]`; 0 is
 * `[0n, 0]`.
 */
export function normalize([n, e]: Decimal): Decimal {
  if (n === 0n) return [0n, 0];
  while (n % 10n === 0n) {
    n /= 10n;
    e++;
  }
  return [n, e];
}

/**
 * The exact decimal of a finite `number`. A `number` is `±1.f · 2^E`, its mantissa a
 * binary fraction of 52 bits: every power of 2 is a decimal, so every `number` is one.
 * - The 53 bits of the mantissa, with its hidden bit, are an integer `m`, read as a
 *   `bigint`: `9007199254740991` when they are all ones. A subnormal has no hidden bit.
 * - The binary point moves 52 bits to the right: the exponent becomes `E − 52`.
 * - A positive exponent multiplies `m` by `2n ** (E − 52)`.
 * - A negative exponent multiplies `m` by `5n ** (52 − E)`, and is kept as the power of ten
 *   `E − 52`, since `2^-p = 5^p · 10^-p`.
 * - The product is rounded once to 15 significant digits, ties to even: the digits a
 *   `number` holds reliably. `0.1` is `[1n, -1]`, not
 *   `0.1000000000000000055511151231257827021181583404541015625`, which no `number` can tell
 *   apart from the decimals just around it.
 * - The trailing zeros move into the power of ten.
 */
function numberDecimal(x: number): Decimal {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const high = view.getUint32(0);
  const low = view.getUint32(4);
  const biased = (high >>> 20) & 0x7ff;
  let m = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  if (biased !== 0) m |= 1n << 52n;
  if (high >>> 31 === 1) m = -m;
  // E is 1 − 1023 for a subnormal, and the exponent read minus 1023 otherwise.
  const p = (biased === 0 ? -1022 : biased - 1023) - 52;
  let [n, e] = p >= 0 ? [m * 2n ** BigInt(p), 0] : [m * 5n ** BigInt(-p), p];
  // One rounding to 15 digits: dividing by 10 again and again would truncate, and give
  // 0.299999999999999 for the number written 0.3.
  const extra = digits(n) - NUMBER_DIGITS;
  if (extra > 0) {
    n = roundHalfEven(n, pow10n(extra));
    e += extra;
  }
  return normalize([n, e]);
}

/**
 * `x` as an exact decimal, or a `TypeError`: a `bigint`, a finite `number`, or `[n, e]`
 * with a `bigint` `n` and an integer `e`.
 */
export function decimal(x: unknown, where: string, what: string): Decimal {
  if (typeof x === "bigint") return [x, 0];
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new TypeError(`${where}: ${what} must be a finite number`);
    return numberDecimal(x);
  }
  if (
    Array.isArray(x) &&
    x.length === 2 &&
    typeof x[MANTISSA] === "bigint" &&
    Number.isSafeInteger(x[EXPONENT])
  ) {
    return [x[MANTISSA], x[EXPONENT] as number];
  }
  throw new TypeError(`${where}: ${what} must be a bigint, a number or a decimal [n, e]`);
}

/**
 * The sign of `a − b`, exact. The decimal with the larger exponent is multiplied by the
 * power of ten that aligns it on the other, in `bigint`s. When the orders of magnitude
 * differ, they decide alone, so that no power of ten is built for a huge exponent.
 */
export function compare([an, ae]: Decimal, [bn, be]: Decimal): -1 | 0 | 1 {
  const as = an < 0n ? -1 : an > 0n ? 1 : 0;
  const bs = bn < 0n ? -1 : bn > 0n ? 1 : 0;
  if (as !== bs) return as < bs ? -1 : 1;
  if (as === 0) return 0;
  // Same sign: |x| lies in [10^(digits + e − 1), 10^(digits + e)).
  const ao = digits(an) + ae;
  const bo = digits(bn) + be;
  if (ao !== bo) return (ao > bo ? as : -as) as -1 | 1;
  const m = Math.min(ae, be);
  const a = an * pow10n(ae - m);
  const b = bn * pow10n(be - m);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `a · b`, exact, normalized: `[an · bn, ae + be]`. */
export function product([an, ae]: Decimal, [bn, be]: Decimal): Decimal {
  return normalize([an * bn, ae + be]);
}

/** `a + b`, exact, normalized: both aligned on the smaller exponent. */
export function sum([an, ae]: Decimal, [bn, be]: Decimal): Decimal {
  const m = Math.min(ae, be);
  return normalize([an * pow10n(ae - m) + bn * pow10n(be - m), m]);
}

/** `a − b`, exact. */
function subtract(a: Decimal, [bn, be]: Decimal): Decimal {
  return sum(a, [-bn, be]);
}

/** `a / b` as the nearest `number` but for the last digits, for `b ≠ 0`. */
function ratio([an, ae]: Decimal, [bn, be]: Decimal): number {
  const p = Math.max(0, digits(bn) - digits(an) + 20);
  return Number(`${String((an * pow10n(p)) / bn)}e${String(ae - be - p)}`);
}

/** `n / d` rounded down, for `d > 0`. */
function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

/** `n / d` rounded to the nearest integer, ties to even, for `d > 0`. */
function roundHalfEven(n: bigint, d: bigint): bigint {
  let q = floorDiv(n, d);
  const twice = 2n * (n - q * d);
  if (twice > d || (twice === d && (q & 1n) === 1n)) q += 1n;
  return q;
}

/** `x · 10^k`, exact, rounded once to the nearest integer, ties to even. */
function scaleExact([n, e]: Decimal, k: number): bigint {
  const t = e + k;
  if (n === 0n) return 0n;
  if (t >= 0) return n * pow10n(t);
  // |x · 10^k| < 10^-1: it rounds to 0, with no power of ten to build.
  if (digits(n) < -t) return 0n;
  return roundHalfEven(n, pow10n(-t));
}

/**
 * The highest integer that a value below `x` rounds to at the scale `k`: `⌈x · 10^k − ½⌉`.
 * Just below a tie, a value rounds down; just below an integer, it rounds to it.
 */
function scaleBelow([n, e]: Decimal, k: number): bigint {
  const t = e + k;
  if (t >= 0) return n * pow10n(t);
  // |x · 10^k| < 10^-1: the values just below it round to 0.
  if (digits(n) < -t) return 0n;
  const d = pow10n(-t);
  return -floorDiv(d - 2n * n, 2n * d);
}

/**
 * The exact decimal string of `n · 10^e`: `"-0.05"`, `"2.0"`, `"1200"`. It is the
 * locale-independent form of JavaScript, with a point.
 */
function decimalString(n: bigint, e: number): string {
  if (e >= 0) return n === 0n ? "0" : `${String(n)}${"0".repeat(e)}`;
  const sign = n < 0n ? "-" : "";
  const text = (n < 0n ? -n : n).toString().padStart(-e + 1, "0");
  return `${sign}${text.slice(0, e)}.${text.slice(e)}`;
}

/** Half a step: the error of a rounding, and the default error of a class. */
const HALF: Decimal = [5n, -1];

/**
 * The position of the rounding of the shown value for the error `e`, in steps: the
 * largest `j ≥ 1` with `10^j ≤ 2e`, or 0 when there is none. Rounding at `10^j` adds at
 * most `½ · 10^j ≤ e`. `2e` lies in `[10^(o − 1), 10^o)`, with `o` its digits plus its
 * exponent, so `j` is `o − 1`, exactly. `#shown` gives it a rough error of two digits,
 * which gives the same `j` as the exact one.
 */
function position([n, e]: Decimal): number {
  return n === 0n ? 0 : Math.max(0, digits(2n * n) + e - 1);
}

/**
 * The decimal `[n, e]`, 0 or more, rounded down to two significant digits, `n < 100`:
 * `[⌊n / 10^(d−2)⌋, e + d − 2]` when `n` has `d > 2` digits. Never above `[n, e]`.
 */
function rough([n, e]: Decimal): Decimal {
  const d = digits(n);
  return d > 2 ? [n / pow10n(d - 2), e + d - 2] : [n, e];
}

/**
 * A rough root of the rough square `[m, f]`, `m < 100`, rounded down to two digits: `m`
 * is brought to 3 or 4 digits with an even exponent `f′`, and the root is
 * `[⌊√m⌋, f′ / 2]`, which `Math.sqrt` gives exactly for an integer below `10^4`. A square
 * of 0 has the root 0.
 */
function roughRoot([m, f]: Decimal): Decimal {
  if (m === 0n) return [0n, 0];
  let r = Number(m);
  if (r < 10) {
    r *= 10;
    f -= 1;
  }
  // An odd exponent takes one more digit, an even one two: 3 or 4 digits, f′ even.
  if (f % 2 !== 0) {
    r *= 10;
    f -= 1;
  } else {
    r *= 100;
    f -= 2;
  }
  return [BigInt(Math.floor(Math.sqrt(r))), f / 2];
}

/** The errors already normalized: those that `define` stores as `error`. */
const normalized = new WeakSet();

/**
 * The errors disabled, by name: three `undefined` errors, frozen. `define` takes it as it
 * takes `{}`, and `errors(C)` gives it back as it is.
 */
export const NO_ERROR_PROCESSING: Errors = Object.freeze({
  bound: undefined,
  quadraticSquared: undefined,
  term: undefined,
});
normalized.add(NO_ERROR_PROCESSING);

/**
 * The three errors of a class of scale `k`, checked and normalized, in the unit of its
 * values (docs/core/bounded-int.md, *The rules*), on three slots, `B = bound`,
 * `Q = quadraticSquared` and `T = term`:
 * - left out (`undefined`): `B` and `T` are half a step, `[5n, −1 − k]`, and `Q` its
 *   square, `[25n, −2 − 2k]`;
 * - a quantity `q` (an array is one, a decimal): `B = T = q` and `Q = q²`;
 * - an object `{ bound?, quadratic?, quadraticSquared?, term? }`: each error given is kept,
 *   `quadratic` squared; any other key is ignored. When `quadratic` and `quadraticSquared`
 *   are both given, the square of the one must equal the other, exactly.
 *
 * Each error is 0 or more, checked before any square, and `T ≤ B`, `T² ≤ Q` and `Q ≤ B²`
 * between those that are defined, compared exactly on squares: no root is taken. When two
 * are equal (`B² = Q`, `Q = T²` or `B = T`), the third must equal them, or takes their value
 * when it is `undefined`. Nothing else is filled in. An object already returned,
 * `NO_ERROR_PROCESSING` included, is returned as it is.
 *
 * @throws TypeError when `error` is neither a quantity nor an object of quantities.
 * @throws RangeError for an error below 0, or errors that break the rules.
 */
function normalizeErrors(error: unknown, k: number, where: string, name: string): Errors {
  if (error !== undefined && normalized.has(error as object)) return error as Errors;
  // The slots B, Q and T, in that order; Q holds a square.
  let given: (Decimal | undefined)[];
  // The labels of the slots in the messages, as given.
  let labels: string[];
  // Whether Q was given as a square, so that B and T are named as squares beside it.
  let squared = false;
  if (error === undefined) {
    const half: Decimal = [HALF[MANTISSA], HALF[EXPONENT] - k];
    given = [half, product(half, half), half];
    labels = [name, name, name];
  } else if (typeof error === "object" && error !== null && !Array.isArray(error)) {
    const spec = error as Record<string, unknown>;
    const read = (key: string): Decimal | undefined =>
      spec[key] === undefined ? undefined : decimal(spec[key], where, `${name}.${key}`);
    const [bound, quadratic, quadraticSquared, term] = [
      read("bound"),
      read("quadratic"),
      read("quadraticSquared"),
      read("term"),
    ];
    const signs: [Decimal | undefined, string][] = [
      [bound, "bound"],
      [quadratic, "quadratic"],
      [quadraticSquared, "quadraticSquared"],
      [term, "term"],
    ];
    for (const [d, key] of signs) {
      if (d !== undefined && d[MANTISSA] < 0n) {
        throw new RangeError(`${where}: ${name}.${key} must be 0 or more`);
      }
    }
    let q = quadraticSquared;
    if (quadratic !== undefined) {
      q = product(quadratic, quadratic);
      if (quadraticSquared !== undefined && compare(q, quadraticSquared) !== 0) {
        throw new RangeError(
          `${where}: ${name}.quadraticSquared must be the square of ${name}.quadratic`,
        );
      }
    }
    squared = quadratic === undefined;
    given = [bound, q, term];
    labels = [
      `${name}.bound`,
      `${name}.${squared ? "quadraticSquared" : "quadratic"}`,
      `${name}.term`,
    ];
  } else {
    const d = decimal(error, where, name);
    if (d[MANTISSA] < 0n) throw new RangeError(`${where}: ${name} must be 0 or more`);
    given = [d, product(d, d), d];
    labels = [name, name, name];
  }
  // Every comparison is on squares: B² and T² meet Q.
  const squares = given.map((d, i) => (d === undefined || i === 1 ? d : product(d, d)));
  // The label of slot i beside slot j: B and T are named as squares beside a Q given squared.
  const label = (i: number, j: number): string =>
    squared && i !== 1 && j === 1 ? `the square of ${String(labels[i])}` : String(labels[i]);
  // T ≤ B, T² ≤ Q and Q ≤ B², between any two that are defined.
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = squares[i];
      const b = squares[j];
      if (a !== undefined && b !== undefined && compare(b, a) > 0) {
        throw new RangeError(`${where}: ${label(j, i)} must not be above ${label(i, j)}`);
      }
    }
  }
  // Two equal errors are a single term: the third equals them.
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = squares[i];
      const b = squares[j];
      if (a === undefined || b === undefined || compare(a, b) !== 0) continue;
      const t = 3 - i - j;
      const c = squares[t];
      if (c === undefined) {
        // B or T, whichever of i and j is not Q, gives the third, or its square to Q.
        const single = given[i === 1 ? j : i];
        given[t] = t === 1 ? a : single;
        squares[t] = a;
      } else if (compare(c, a) !== 0) {
        throw new RangeError(
          `${where}: ${String(labels[t])} must equal ${String(labels[i])} and ${String(labels[j])}, which are equal`,
        );
      }
    }
  }
  const frozen = given.map((d) => (d === undefined ? undefined : Object.freeze(normalize(d))));
  const result: Errors = Object.freeze({
    bound: frozen[0],
    quadraticSquared: frozen[1],
    term: frozen[2],
  });
  normalized.add(result);
  return result;
}

// --- Classes ----------------------------------------------------------------

/** A class of bounded integers, as the static members see it. */
type BoundedIntClass = typeof BoundedInt;

/** The constants of a class, checked and converted: computed once per class. */
interface Constants {
  readonly scale: number;
  /** The exact bounds `[min, max)`. */
  readonly min: Decimal;
  readonly max: Decimal;
  /** The integers that the values of `[min, max)` round to, from `low` to `high`. */
  readonly low: bigint;
  readonly high: bigint;
  /** The three errors, in the unit of the values. */
  readonly errors: Errors;
  /** Whether `from` takes a `number`: the class needs at most 15 significant digits. */
  readonly numbers: boolean;
}

const known = new WeakMap<BoundedIntClass, Constants>();

/** The nearest class from `C` up that owns `key`, or `BoundedInt`. */
function owner(C: BoundedIntClass, key: string): BoundedIntClass {
  let c: object = C;
  while (c !== BoundedInt && !Object.hasOwn(c, key)) c = Object.getPrototypeOf(c) as object;
  return c as BoundedIntClass;
}

/**
 * The constants of `C`, checked at its first use; throws for an invalid set. Its parent is
 * checked first: `C` holds no more values than it, unless one of them is `BoundedInt`.
 */
function constants(C: BoundedIntClass, where: string): Constants {
  const done = known.get(C);
  if (done !== undefined) return done;
  const P = Object.getPrototypeOf(C) as BoundedIntClass;
  const parent = C === BoundedInt || P === BoundedInt ? undefined : constants(P, where);
  if (owner(C, "min") !== owner(C, "max")) {
    throw new TypeError(`${where}: ${C.name} must declare both min and max, or neither`);
  }
  const { scale } = C as { scale: unknown };
  if (typeof scale !== "number") throw new TypeError(`${where}: ${C.name}.scale must be a number`);
  if (!Number.isInteger(scale) || scale < COARSEST_SCALE || scale > FINEST_SCALE) {
    throw new RangeError(
      `${where}: ${C.name}.scale must be an integer from ${String(COARSEST_SCALE)} to ${String(FINEST_SCALE)}`,
    );
  }
  const min = decimal(C.min, where, `${C.name}.min`);
  const max = decimal(C.max, where, `${C.name}.max`);
  if (compare(min, max) >= 0) {
    throw new RangeError(`${where}: ${C.name}.min must be below ${C.name}.max`);
  }
  const low = scaleExact(min, scale);
  const high = scaleBelow(max, scale);
  if (parent !== undefined) {
    const n = high - low + 1n;
    const m = parent.high - parent.low + 1n;
    if (n > m) {
      throw new RangeError(
        `${where}: ${C.name} must not hold more values than ${P.name}: ${String(n)} > ${String(m)}`,
      );
    }
  }
  // Only an own error: the errors of the parent are not those of C, whose scale may differ.
  const own: unknown = Object.hasOwn(C, "error") ? C.error : undefined;
  // The constant labels each error: only define takes the shorthand of a quantity.
  if (own !== undefined && (typeof own !== "object" || own === null || Array.isArray(own))) {
    throw new TypeError(
      `${where}: ${C.name}.error must be an object { bound?, quadratic?, quadraticSquared?, term? }`,
    );
  }
  const errors = normalizeErrors(own, scale, where, `${C.name}.error`);
  const result: Constants = {
    scale,
    min,
    max,
    low,
    high,
    errors,
    numbers: fits(min, max, scale),
  };
  known.set(C, result);
  return result;
}

/** The digits that a `number` holds reliably. */
const NUMBER_DIGITS = 15;

/**
 * Whether the values of `[min, max)` at the scale `k` need at most 15 significant digits:
 * the larger of `|min|` and `|max|`, in steps, rounded up, is below `10^15`. A `number`
 * holds 15 digits reliably; beyond, its exact decimal carries digits it never meant:
 * `1.005` is `1.00499999999999989…`, so at the scale 16 it gives `10049999999999999`.
 */
function fits(min: Decimal, max: Decimal, k: number): boolean {
  const abs = ([n, e]: Decimal): Decimal => [n < 0n ? -n : n, e];
  const larger = compare(abs(min), abs(max)) > 0 ? abs(min) : abs(max);
  // ⌈|x| · 10^k⌉ < 10^15, that is |x| · 10^k ≤ 10^15 − 1.
  return (
    compare([larger[MANTISSA], larger[EXPONENT] + k], [10n ** BigInt(NUMBER_DIGITS) - 1n, 0]) <= 0
  );
}

/** An integer with the scale and the bounds of its class. */
export class BoundedInt {
  /** The scale `k`: the step of the class is `10^-k`. */
  static readonly scale: number = 0;
  /** The lowest value, included. */
  static readonly min: Quantity = 0n;
  /** The value just above the highest, excluded. */
  static readonly max: Quantity = MAX;
  /**
   * The errors of the values, in their unit, each labelled. `define` stores them as
   * frozen `Errors`; a class written by hand declares an `ErrorSpec`, never a bare
   * quantity. Never inherited: a class that declares none has half its own step. Read
   * them with `errors(C)`.
   */
  declare static readonly error?: ErrorSpec;

  readonly #value: bigint;

  /** Not public: instances come from `from` and `fromValue`, or those of a subclass. */
  protected constructor(value: bigint) {
    this.#value = value;
  }

  /** The lowest integer of the class, that `min` rounds to, a `bigint`. */
  static get low(): bigint {
    return constants(this, `${this.name}.low`).low;
  }

  /** The highest integer of the class, that the values just below `max` round to. */
  static get high(): bigint {
    return constants(this, `${this.name}.high`).high;
  }

  /** The guaranteed bound of the error, `bound`, relative to `max − min`, or `undefined`. */
  static get errorBound(): number | undefined {
    return relative(this, "errorBound", "bound");
  }

  /**
   * The quadratic error, the root of `quadraticSquared`, relative to `max − min`, or
   * `undefined`: `errorBound` or `termError` itself when `quadraticSquared` is the square of
   * `bound` or of `term`, else the nearest `number` to `√(Q / R²)`, from every digit of `Q`
   * and `R`, held between `termError` and `errorBound`.
   */
  static get quadraticError(): number | undefined {
    const member = "quadraticError";
    const { errors, min, max } = constants(this, `${this.name}.${member}`);
    const { bound, quadraticSquared: q, term } = errors;
    if (q === undefined) return undefined;
    if (q[MANTISSA] === 0n) return 0;
    const lowest = relative(this, member, "term");
    const highest = relative(this, member, "bound");
    if (bound !== undefined && compare(product(bound, bound), q) === 0) return highest;
    if (term !== undefined && compare(product(term, term), q) === 0) return lowest;
    const r = rootRatio(q, subtract(max, min));
    return Math.min(Math.max(r, lowest ?? r), highest ?? r);
  }

  /** The error of the least accurate term, `term`, relative to `max − min`, or `undefined`. */
  static get termError(): number | undefined {
    return relative(this, "termError", "term");
  }

  /**
   * Makes an instance of the class it is called on, holding the value `x`. `x` is compared
   * exactly with the bounds of the class, then scaled by `10^k` and rounded once, ties to
   * even.
   *
   * @param x - a `bigint`, a finite `number`, or an exact decimal `[n, e]`.
   * @throws TypeError when `x` is none of these, or a `number` on a class whose values
   *   need more than 15 significant digits.
   * @throws RangeError when `x` is not in `[min, max)`, or the constants of the class are
   *   invalid.
   */
  static from(x: Quantity): BoundedInt {
    const where = `${this.name}.from`;
    const c = constants(this, where);
    const d = decimal(x, where, "x");
    if (typeof x === "number" && !c.numbers) {
      throw new TypeError(
        `${where}: ${this.name} needs more than ${String(NUMBER_DIGITS)} digits, which a number does not hold: pass a bigint or a decimal [n, e]`,
      );
    }
    if (compare(d, c.min) < 0) throw new RangeError(`${where}: x is below ${this.name}.min`);
    if (compare(d, c.max) >= 0) throw new RangeError(`${where}: x is not below ${this.name}.max`);
    return new this(scaleExact(d, c.scale));
  }

  /**
   * Makes an instance of the class it is called on, holding the integer `q` as it is.
   *
   * @param q - the integer, a `bigint`: one that a value of `[min, max)` rounds to.
   * @throws TypeError when `q` is not a `bigint`.
   * @throws RangeError when no value of `[min, max)` rounds to `q`, or the constants of
   *   the class are invalid.
   */
  static fromValue(q: bigint): BoundedInt {
    const where = `${this.name}.fromValue`;
    const c = constants(this, where);
    if (typeof q !== "bigint") throw new TypeError(`${where}: q must be a bigint`);
    if (q < c.low || q > c.high) {
      throw new RangeError(`${where}: no value of ${this.name} rounds to ${String(q)}`);
    }
    return new this(q);
  }

  /**
   * Makes a frozen subclass of the class it is called on, its parent, typed as that class.
   *
   * @param spec - `name`; `min` and `max`, the bounds `[min, max)`, kept exactly; `step`,
   *   which gives the smallest scale `k` with `10^-k ≤ step`, `k = 1 − digits(n) − e` for
   *   `step = [n, e]`, or the scale 0 when left out; `error`, the errors of the values, a
   *   quantity or an object `{ bound?, quadratic?, quadraticSquared?, term? }`, half a step
   *   each when left out, none with `{}` or `NO_ERROR_PROCESSING`. The class always gets
   *   its own `error`, frozen `Errors`, `{ bound, quadraticSquared, term }`. Any other key
   *   is ignored.
   * @throws TypeError for a bad name, a quantity of the wrong type, or an `error` that is
   *   neither a quantity nor an object of quantities.
   * @throws RangeError for `min ≥ max`, a `step` that is not above 0, finer than
   *   `10^-323` or of `10^309` or more, an error below 0, errors that break the rules, or
   *   more values than the parent, unless the parent is `BoundedInt`.
   */
  static define<T extends BoundedIntClass>(this: T, spec: BoundedIntSpec): T {
    const where = `${this.name}.define`;
    if (typeof spec !== "object" || (spec as unknown) === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    if (typeof spec.name !== "string" || spec.name === "") {
      throw new TypeError(`${where}: name must be a non-empty string`);
    }
    let scale = 0;
    if (spec.step !== undefined) {
      const step = decimal(spec.step, where, "step");
      if (step[MANTISSA] <= 0n) throw new RangeError(`${where}: step must be above 0`);
      // 10^(digits(n) + e − 1) ≤ step < 10^(digits(n) + e): the smallest k with 10^-k ≤ step.
      // digits(n) writes n in decimal, once per call.
      scale = 1 - digits(step[MANTISSA]) - step[EXPONENT];
      if (scale > FINEST_SCALE) {
        throw new RangeError(`${where}: step must be 10^-${String(FINEST_SCALE)} or more`);
      }
      // Never brought back to the coarsest scale: it would not match the step.
      if (scale < COARSEST_SCALE) {
        throw new RangeError(`${where}: step must be below 10^${String(1 - COARSEST_SCALE)}`);
      }
    }
    // The quantities are kept as given, a decimal frozen: the class converts them once.
    const keep = (q: unknown, what: string): unknown => {
      decimal(q, where, what);
      return Array.isArray(q) ? Object.freeze([...(q as unknown[])]) : q;
    };
    const own: Record<string, unknown> = {
      scale,
      min: keep(spec.min, "min"),
      max: keep(spec.max, "max"),
      // Its own errors, always, converted once: a class never takes those of its parent.
      error: normalizeErrors(spec.error, scale, where, "error"),
    };
    const C = class extends (this as BoundedIntClass) {};
    Object.defineProperty(C, "name", { value: spec.name });
    for (const [key, value] of Object.entries(own)) {
      Object.defineProperty(C, key, { value, enumerable: true });
    }
    constants(C, where);
    return Object.freeze(C) as T;
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /**
   * The decimal that `valueOf()`, `toString()` and `toLocaleString()` give: `q · 10^-k`,
   * rounded at the largest power of ten `10^j` with `10^j ≤ 2 · error`, in steps, ties to
   * even, as `[n, e]`. The error is the first defined of `term`, the root of
   * `quadraticSquared` and `bound`; with none, `j = 0`: every digit. `j` comes from a rough
   * error of two digits, rounded down first, and for `quadraticSquared` the rough root of its
   * rough square: the same `j` as the exact error, never a value kept.
   */
  #shown(): Decimal {
    const C = this.constructor as BoundedIntClass;
    const c = constants(C, `${C.name}.toString`);
    const { bound, quadraticSquared, term } = c.errors;
    const k = c.scale;
    const error = term ?? bound;
    let j = 0;
    if (term === undefined && quadraticSquared !== undefined) {
      // A square, in steps²: rounded down to two digits, then its rough root.
      j = position(
        roughRoot(rough([quadraticSquared[MANTISSA], quadraticSquared[EXPONENT] + 2 * k])),
      );
    } else if (error !== undefined) {
      j = position(rough([error[MANTISSA], error[EXPONENT] + k]));
    }
    const q = this.#value;
    // |q| < 10^(j − 1) rounds to 0, with no power of ten to build.
    const n = j === 0 ? q : digits(q) < j ? 0n : roundHalfEven(q, pow10n(j));
    return [n, j - c.scale];
  }

  /**
   * The nearest `number` to the shown decimal, read from its exact string `n e`.
   *
   * @throws RangeError when that `number` would be `±Infinity`.
   */
  valueOf(): number {
    const [n, e] = this.#shown();
    const result = Number(`${String(n)}e${String(e)}`);
    if (!Number.isFinite(result)) {
      throw new RangeError(`${this.constructor.name}.valueOf: beyond the range of a number`);
    }
    return result;
  }

  /** The exact decimal of the integer, with its meaningful decimals and a point: `"2.3"`. */
  toString(): string {
    const [n, e] = this.#shown();
    return decimalString(n, e);
  }

  /**
   * The digits of `toString()`, exactly, in the form of a locale: its decimal separator,
   * its grouping and its digits, through `Intl.NumberFormat`. `options` may set anything
   * but the number of decimals, which is that of `toString()`.
   *
   * @throws RangeError for more than 100 decimals, which `Intl.NumberFormat` refuses.
   */
  toLocaleString(locales?: string | string[], options?: Intl.NumberFormatOptions): string {
    const [n, e] = this.#shown();
    const decimals = Math.max(0, -e);
    const format = new Intl.NumberFormat(locales, {
      ...options,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    // A string is formatted exactly, as a decimal (ECMA-402, Intl.NumberFormat v3).
    return (format as unknown as { format(value: string): string }).format(decimalString(n, e));
  }

  /** `toString()` for the hint `"string"`; any other implicit conversion throws. */
  [Symbol.toPrimitive](hint: "number" | "string" | "default"): string {
    if (hint === "string") return this.toString();
    throw new TypeError(
      `${this.constructor.name}: no implicit conversion; call x.valueOf() for the number, ` +
        "or read x.value for the bigint",
    );
  }
}

/** The error `bound` or `term` of the class `C`, relative to `max − min`, or `undefined`. */
function relative(C: BoundedIntClass, member: string, key: "bound" | "term"): number | undefined {
  const c = constants(C, `${C.name}.${member}`);
  const error = c.errors[key];
  return error === undefined ? undefined : ratio(error, subtract(c.max, c.min));
}

/** The digits of the root that `rootRatio` keeps: twice those of a `number`, and more. */
const ROOT_DIGITS = 30;

/**
 * `√(q / r²)` as the nearest `number`, for `q > 0` and `r > 0`, from every digit of both:
 * - `X = ⌊qn · 10^s / rn²⌋`, an integer of at least `2 · ROOT_DIGITS` digits, and
 *   `q / r² = (X + f) · 10^t` with `t` even and `0 ≤ f < 1`;
 * - the root of `X` by Newton's iteration on `bigint`s, `s ← (s + X / s) / 2`, from a seed
 *   that `Math.sqrt` gives with about 15 correct digits; two iterations, a fixed number,
 *   give about 30;
 * - the `number` read from `` `${s}e${t / 2}` ``, which JavaScript rounds correctly.
 */
function rootRatio([qn, qe]: Decimal, [rn, re]: Decimal): number {
  const r2 = rn * rn;
  let s = Math.max(0, digits(r2) - digits(qn) + 2 * ROOT_DIGITS + 1);
  if ((qe - 2 * re - s) % 2 !== 0) s++;
  const x = (qn * pow10n(s)) / r2;
  const t = qe - 2 * re - s;
  // The seed: the root of the leading 30 or 31 digits of X, an even number of digits dropped.
  let drop = digits(x) - ROOT_DIGITS;
  if (drop % 2 !== 0) drop--;
  let root = BigInt(Math.floor(Math.sqrt(Number(x / pow10n(drop))))) * pow10n(drop / 2);
  for (let i = 0; i < 2; i++) root = (root + x / root) / 2n;
  return Number(`${String(root)}e${String(t / 2)}`);
}

/**
 * The three errors of the class `C`, `{ bound, quadraticSquared, term }`, frozen, in the
 * unit of its values: those `define` stores, or those of a class written by hand, checked
 * under the same rules. The way for the other modules to read the errors of a class.
 *
 * @throws as the constants of `C` do, at its first use.
 */
export function errors(C: BoundedIntClass): Errors {
  return constants(C, `${C.name}.errors`).errors;
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: BoundedInt, from, valueOf, toString, toPrimitive (#41)   |
// | #47    | decimal classes: scale, the exact bounds [min, max), order, error; numbers rounded to 15 digits; from, fromValue, define; exact decimals on bigints; valueOf, toString, toLocaleString (#44) |
// | #53    | no order: a class holds no more values than its parent, checked parent first; static low and high; define<T>(this: T) (#52) |
// | #59    | three errors as frozen decimals, own and never inherited, under the rules; the constant error is an ErrorSpec, a quantity only in define; getters may be undefined; display at the first defined error; k = 1 - digits(n) - e, COARSEST_SCALE and FINEST_SCALE; exports decimal, MANTISSA, EXPONENT, errors, ErrorSpec, Errors (#58) |
