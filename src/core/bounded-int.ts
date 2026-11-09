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
 *   semi-open bounds `[min, max)` of its values, kept exactly, `integerOnly`, `order`, the
 *   number of distinct values it allows, if any, and `error`, the accuracy of its values,
 *   half a step when it is left out.
 * - `from` compares a value exactly with the bounds, then scales it to the step and rounds
 *   it once, ties to even; `fromValue` takes the integer as it is.
 * - `valueOf()` is the nearest `number`; `toString()` and `toLocaleString()` write the
 *   exact decimal, without the digits that the error makes meaningless.
 *   `[Symbol.toPrimitive]` converts to a string only.
 */

/** The upper bound of `BoundedInt`: its values are the integers from 0 to `END − 1`. */
const END = 2n ** 252n + 27742317777372353535851937790883648493n;

/** The lowest and the highest scales: those whose step `10^-k` is a `number`. */
const LOWEST_SCALE = -308;
const HIGHEST_SCALE = 323;

/** An exact decimal `[n, e]`, worth `n · 10^e`: `[23n, -1]` is 2.3. */
export type Decimal = readonly [mantissa: bigint, exponent: number];

/** A quantity: a `bigint`, a `number`, or an exact decimal. */
export type Quantity = bigint | number | Decimal;

/** Anything that states an order as `ORDER`. */
export interface BoundedIntOrder {
  readonly ORDER: bigint;
}

/** The specification of `define`. */
export interface BoundedIntSpec {
  readonly name: string;
  /** The lowest value, included. */
  readonly min: Quantity;
  /** The value just above the highest, excluded. */
  readonly max: Quantity;
  /** The accuracy, which gives the scale; integers only when left out. */
  readonly step?: Quantity;
  /** The accuracy of the values, in their unit; half a step when left out. */
  readonly error?: Quantity;
  /** The number of distinct values allowed; that of the base when left out. */
  readonly order?: BoundedIntOrder | bigint;
  /** Whether `from` takes only integers; `true` only without a step when left out. */
  readonly integerOnly?: boolean;
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
 * - The trailing zeros of the product move into the power of ten.
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
  return normalize(p >= 0 ? [m * 2n ** BigInt(p), 0] : [m * 5n ** BigInt(-p), p]);
}

/**
 * `x` as an exact decimal, or a `TypeError`: a `bigint`, a finite `number`, or `[n, e]`
 * with a `bigint` `n` and an integer `e`.
 */
function decimal(x: unknown, where: string, what: string): Decimal {
  if (typeof x === "bigint") return [x, 0];
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new TypeError(`${where}: ${what} must be a finite number`);
    return numberDecimal(x);
  }
  if (
    Array.isArray(x) &&
    x.length === 2 &&
    typeof x[0] === "bigint" &&
    Number.isSafeInteger(x[1])
  ) {
    return [x[0], x[1] as number];
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

/** Whether a decimal is an integer. */
function isInteger([n, e]: Decimal): boolean {
  return e >= 0 || n === 0n || (digits(n) > -e && n % pow10n(-e) === 0n);
}

/** `n / d` rounded down, for `d > 0`. */
function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n ? q - 1n : q;
}

/** The smallest integer at or above a decimal. */
function ceiling([n, e]: Decimal): bigint {
  if (e >= 0) return n * pow10n(e);
  // |x| < 10^-1: the smallest integer above it is 0 or 1.
  if (digits(n) < -e) return n > 0n ? 1n : 0n;
  return -floorDiv(-n, pow10n(-e));
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
  readonly integerOnly: boolean;
  /** The error, in steps. */
  readonly error: Decimal;
}

const known = new WeakMap<BoundedIntClass, Constants>();

/** The nearest class from `C` up that owns `key`, or `BoundedInt`. */
function owner(C: BoundedIntClass, key: string): BoundedIntClass {
  let c: object = C;
  while (c !== BoundedInt && !Object.hasOwn(c, key)) c = Object.getPrototypeOf(c) as object;
  return c as BoundedIntClass;
}

/** The constants of `C`, checked at its first use; throws for an invalid set. */
function constants(C: BoundedIntClass, where: string): Constants {
  const done = known.get(C);
  if (done !== undefined) return done;
  if (owner(C, "min") !== owner(C, "max")) {
    throw new TypeError(`${where}: ${C.name} must declare both min and max, or neither`);
  }
  const { scale, order } = C as { scale: unknown; order: unknown };
  if (typeof scale !== "number") throw new TypeError(`${where}: ${C.name}.scale must be a number`);
  if (!Number.isInteger(scale) || scale < LOWEST_SCALE || scale > HIGHEST_SCALE) {
    throw new RangeError(
      `${where}: ${C.name}.scale must be an integer from ${String(LOWEST_SCALE)} to ${String(HIGHEST_SCALE)}`,
    );
  }
  const owned = owner(C, "integerOnly");
  const integerOnly = owned === BoundedInt && C !== BoundedInt ? scale === 0 : owned.integerOnly;
  if (typeof integerOnly !== "boolean") {
    throw new TypeError(`${where}: ${C.name}.integerOnly must be a boolean`);
  }
  const min = decimal(C.min, where, `${C.name}.min`);
  const max = decimal(C.max, where, `${C.name}.max`);
  if (compare(min, max) >= 0) {
    throw new RangeError(`${where}: ${C.name}.min must be below ${C.name}.max`);
  }
  // With integers only, the values are the integers from ⌈min⌉ to ⌈max⌉ − 1.
  const low = scaleExact(integerOnly ? [ceiling(min), 0] : min, scale);
  const high = integerOnly ? scaleExact([ceiling(max) - 1n, 0], scale) : scaleBelow(max, scale);
  if (order !== undefined) {
    if (typeof order !== "bigint") {
      throw new TypeError(`${where}: ${C.name}.order must be a bigint, or undefined`);
    }
    if (order <= 0n) throw new RangeError(`${where}: ${C.name}.order must be above 0`);
    if (high - low + 1n > order) {
      throw new RangeError(`${where}: ${C.name} must not hold more than ${C.name}.order values`);
    }
  }
  let error = HALF;
  if (C.error !== undefined) {
    const [n, e] = decimal(C.error, where, `${C.name}.error`);
    if (n < 0n) throw new RangeError(`${where}: ${C.name}.error must be 0 or more`);
    error = normalize([n, e + scale]);
  }
  const result: Constants = { scale, min, max, low, high, integerOnly, error };
  known.set(C, result);
  return result;
}

/** The order given to `define`: a `bigint`, or a form with a `bigint` `ORDER`. */
function orderOf(given: unknown, where: string): bigint {
  const order =
    (typeof given === "object" && given !== null) || typeof given === "function"
      ? (given as { ORDER?: unknown }).ORDER
      : given;
  if (typeof order !== "bigint") {
    throw new TypeError(`${where}: order must be a bigint, or have a bigint ORDER`);
  }
  return order;
}

/** An integer with the scale and the bounds of its class. */
export class BoundedInt {
  /** The scale `k`: the step of the class is `10^-k`. */
  static readonly scale: number = 0;
  /** The lowest value, included. */
  static readonly min: Quantity = 0n;
  /** The value just above the highest, excluded. */
  static readonly max: Quantity = END;
  /** Whether `from` takes only integers. */
  static readonly integerOnly: boolean = true;
  /** The number of distinct values allowed; no limit when it is absent. */
  declare static readonly order?: bigint;
  /** The accuracy of the values, in their unit; half a step when it is absent. */
  declare static readonly error?: Quantity;

  readonly #value: bigint;

  /** Not public: instances come from `from` and `fromValue`, or those of a subclass. */
  protected constructor(value: bigint) {
    this.#value = value;
  }

  /** The guaranteed bound of the error of a value, relative to `max − min`. */
  static get errorBound(): number {
    const c = constants(this, `${this.name}.errorBound`);
    return ratio([c.error[0], c.error[1] - c.scale], subtract(c.max, c.min));
  }

  /** The quadratic error of a value, relative to `max − min`: the bound, for one value. */
  static get quadraticError(): number {
    return this.errorBound;
  }

  /** The error of the least accurate term, relative to `max − min`: the bound, for one value. */
  static get termError(): number {
    return this.errorBound;
  }

  /**
   * Makes an instance of the class it is called on, holding the value `x`. `x` is compared
   * exactly with the bounds of the class, then scaled by `10^k` and rounded once, ties to
   * even.
   *
   * @param x - a `bigint`, a finite `number`, or an exact decimal `[n, e]`.
   * @throws TypeError when `x` is none of these, or not an integer on a class with
   *   `integerOnly`.
   * @throws RangeError when `x` is not in `[min, max)`, or the constants of the class are
   *   invalid.
   */
  static from(x: Quantity): BoundedInt {
    const where = `${this.name}.from`;
    const c = constants(this, where);
    const d = decimal(x, where, "x");
    if (c.integerOnly && !isInteger(d)) throw new TypeError(`${where}: x must be an integer`);
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
   * Makes a frozen subclass of the class it is called on.
   *
   * @param spec - `name`; `min` and `max`, the bounds `[min, max)`, kept exactly; `step`,
   *   which gives the smallest scale `k` with `10^-k ≤ step`, or the scale 0 and integers
   *   only when left out; `error`, the accuracy of the values, half a step when left out;
   *   `order`, the number of distinct values allowed; `integerOnly`.
   * @throws TypeError for a bad name, a quantity of the wrong type, or a bad `order`.
   * @throws RangeError for `min ≥ max`, a `step` that is not above 0 or finer than
   *   `10^-323`, a negative `error`, or more distinct values than `order`.
   */
  static define(spec: BoundedIntSpec): BoundedIntClass {
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
      if (step[0] <= 0n) throw new RangeError(`${where}: step must be above 0`);
      scale = LOWEST_SCALE;
      while (scale <= HIGHEST_SCALE && compare([1n, -scale], step) > 0) scale++;
      if (scale > HIGHEST_SCALE) {
        throw new RangeError(`${where}: step must be 10^-${String(HIGHEST_SCALE)} or more`);
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
      integerOnly: spec.integerOnly ?? spec.step === undefined,
    };
    if (spec.error !== undefined) own.error = keep(spec.error, "error");
    if (spec.order !== undefined) own.order = orderOf(spec.order, where);
    const C = class extends this {};
    Object.defineProperty(C, "name", { value: spec.name });
    for (const [key, value] of Object.entries(own)) {
      Object.defineProperty(C, key, { value, enumerable: true });
    }
    constants(C, where);
    return Object.freeze(C);
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /**
   * The decimal that `valueOf()`, `toString()` and `toLocaleString()` give: `q · 10^-k`,
   * rounded at the largest power of ten `10^j` with `10^j ≤ 2 · error`, in steps, ties to
   * even, as `[n, e]`.
   */
  #shown(): Decimal {
    const C = this.constructor as BoundedIntClass;
    const c = constants(C, `${C.name}.toString`);
    const j = position(c.error);
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

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: BoundedInt, from, valueOf, toString, toPrimitive (#41)   |
// | #47    | decimal classes: scale, the exact bounds [min, max), integerOnly, order, error; from, fromValue, define; exact decimals on bigints; valueOf, toString, toLocaleString (#44) |
