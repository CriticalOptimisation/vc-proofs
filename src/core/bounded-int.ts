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
 *   errors of its values, `bound ≥ quadratic ≥ term`, each a decimal in the unit of the
 *   values or `undefined`; half a step of its own scale when it declares none, never those
 *   of its parent. Its values round to the integers `low … high`, and it holds no more of
 *   them than its parent, unless its parent is `BoundedInt`.
 * - `from` compares a value exactly with the bounds, then scales it to the step and rounds
 *   it once, ties to even; `fromValue` takes the integer as it is.
 * - `valueOf()` is the nearest `number`; `toString()` and `toLocaleString()` write the
 *   exact decimal, without the digits that the first defined of `term`, `quadratic` and
 *   `bound` makes meaningless. `[Symbol.toPrimitive]` converts to a string only.
 * - For the other modules of the library, it exports `decimal`, `MANTISSA`, `EXPONENT`,
 *   `errors` and the types of quantities and errors; `./core` exports only the types
 *   `Decimal` and `Quantity`.
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
 */
export interface ErrorSpec {
  /** A guaranteed bound of the error. */
  readonly bound?: Quantity | undefined;
  /** The quadratic error: the square root of the sum of the squares of independent errors. */
  readonly quadratic?: Quantity | undefined;
  /** The error of the least accurate term. */
  readonly term?: Quantity | undefined;
}

/**
 * The three errors of a class, in the unit of its values: each a frozen decimal without
 * trailing zeros, or `undefined` when the class does not know it.
 */
export interface Errors {
  readonly bound: Decimal | undefined;
  readonly quadratic: Decimal | undefined;
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
   * The errors of the values, in their unit: a quantity, the three equal, or an object of
   * errors; half a step each when left out, none with `{}`.
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

/** The same decimal without trailing zeros in its mantissa: `[50n, -2]` is `[5n, -1]`. */
function normalize([n, e]: Decimal): Decimal {
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
function compare([an, ae]: Decimal, [bn, be]: Decimal): -1 | 0 | 1 {
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

/** `a − b`, exact. */
function subtract([an, ae]: Decimal, [bn, be]: Decimal): Decimal {
  const m = Math.min(ae, be);
  return normalize([an * pow10n(ae - m) - bn * pow10n(be - m), m]);
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
 * exponent, so `j` is `o − 1`, exactly.
 */
function position([n, e]: Decimal): number {
  return n === 0n ? 0 : Math.max(0, digits(2n * n) + e - 1);
}

/** The keys of the three errors, from the largest to the smallest. */
const ERRORS = ["bound", "quadratic", "term"] as const;

/** The errors already normalized: those that `define` stores as `error`. */
const normalized = new WeakSet();

/**
 * The three errors of a class of scale `k`, checked and normalized, in the unit of its
 * values (docs/core/bounded-int.md, *The rules*):
 * - left out (`undefined`): each is half a step, `[5n, −1 − k]`;
 * - a quantity (an array is one, a decimal): the three are equal to it;
 * - an object `{ bound?, quadratic?, term? }`: each error given is kept; any other key is
 *   ignored.
 *
 * Each error is 0 or more, and `term ≤ quadratic ≤ bound` between those that are defined,
 * compared exactly. When two are equal, the third must equal them, or takes their value
 * when it is `undefined`. Nothing else is filled in.
 *
 * @throws TypeError when `error` is neither a quantity nor an object of quantities.
 * @throws RangeError for an error below 0, or errors that break the rules.
 */
function normalizeErrors(error: unknown, k: number, where: string, name: string): Errors {
  if (error !== undefined && normalized.has(error as object)) return error as Errors;
  let given: (Decimal | undefined)[];
  if (error === undefined) {
    given = [[HALF[MANTISSA], HALF[EXPONENT] - k]];
  } else if (typeof error === "object" && error !== null && !Array.isArray(error)) {
    const spec = error as Record<string, unknown>;
    given = ERRORS.map((key) =>
      spec[key] === undefined ? undefined : decimal(spec[key], where, `${name}.${key}`),
    );
  } else {
    given = [decimal(error, where, name)];
  }
  // A single quantity is the three errors; its messages name it as given.
  const single = given.length === 1;
  if (single) given = [given[0], given[0], given[0]];
  const label = (i: number): string => (single ? name : `${name}.${String(ERRORS[i])}`);
  given.forEach((d, i) => {
    if (d !== undefined && d[MANTISSA] < 0n) {
      throw new RangeError(`${where}: ${label(i)} must be 0 or more`);
    }
  });
  // term ≤ quadratic ≤ bound, between any two that are defined.
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = given[i];
      const b = given[j];
      if (a !== undefined && b !== undefined && compare(b, a) > 0) {
        throw new RangeError(`${where}: ${label(j)} must not be above ${label(i)}`);
      }
    }
  }
  // Two equal errors are a single term: the third equals them.
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = given[i];
      const b = given[j];
      if (a === undefined || b === undefined || compare(a, b) !== 0) continue;
      const t = 3 - i - j;
      const c = given[t];
      if (c === undefined) given[t] = a;
      else if (compare(c, a) !== 0) {
        throw new RangeError(
          `${where}: ${label(t)} must equal ${label(i)} and ${label(j)}, which are equal`,
        );
      }
    }
  }
  const frozen = given.map((d) => (d === undefined ? undefined : Object.freeze(normalize(d))));
  const result: Errors = Object.freeze({
    bound: frozen[0],
    quadratic: frozen[1],
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
  const own = Object.hasOwn(C, "error") ? C.error : undefined;
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
   * The errors of the values, in their unit. `define` stores them as frozen `Errors`; a
   * class written by hand may declare a quantity or an `ErrorSpec`. Never inherited: a
   * class that declares none has half its own step. Read them with `errors(C)`.
   */
  declare static readonly error?: Quantity | ErrorSpec;

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

  /** The quadratic error, `quadratic`, relative to `max − min`, or `undefined`. */
  static get quadraticError(): number | undefined {
    return relative(this, "quadraticError", "quadratic");
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
   *   quantity or an object `{ bound?, quadratic?, term? }`, half a step each when left
   *   out. The class always gets its own `error`, frozen `Errors`. Any other key is
   *   ignored.
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
   * even, as `[n, e]`. The error is the first defined of `term`, `quadratic` and `bound`;
   * with none, `j = 0`: every digit.
   */
  #shown(): Decimal {
    const C = this.constructor as BoundedIntClass;
    const c = constants(C, `${C.name}.toString`);
    const { bound, quadratic, term } = c.errors;
    const error = term ?? quadratic ?? bound;
    const j = error === undefined ? 0 : position([error[MANTISSA], error[EXPONENT] + c.scale]);
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

/** An error of the class `C`, relative to `max − min`, or `undefined`. */
function relative(C: BoundedIntClass, member: string, key: keyof Errors): number | undefined {
  const c = constants(C, `${C.name}.${member}`);
  const error = c.errors[key];
  return error === undefined ? undefined : ratio(error, subtract(c.max, c.min));
}

/**
 * The three errors of the class `C`, `{ bound, quadratic, term }`, frozen, in the unit of
 * its values: those `define` stores, or those of a class written by hand, checked under
 * the same rules. The way for the other modules to read the errors of a class.
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
// | #59    | three errors as frozen decimals, own and never inherited, under the rules; getters may be undefined; display at the first defined error; k = 1 - digits(n) - e, COARSEST_SCALE and FINEST_SCALE; exports decimal, MANTISSA, EXPONENT, errors, ErrorSpec, Errors (#58) |
