/**
 * `BoundedInt` (docs/core/bounded-int.md): an integer held as a `bigint`, in a class
 * that carries its scale and its range as class-level constants. A `bigint` cannot: it
 * is a primitive with no own property.
 *
 * Stage 1 (#44): every bound, step and error is an exact decimal, a `bigint` mantissa
 * `n` and an integer exponent `e`, worth `n · 10^e`. A value given to `from` may also be a
 * `number`, converted at once to the exact decimal of its binary value. Nothing is
 * rounded but the scaling of a value to the step of its class, once, ties to even, after
 * the value has been checked against the exact bounds.
 *
 * - A class is described by its constants: `scale` (`k`: the step is `10^-k`), the
 *   semi-open range `[min, end)` of its integers, `integerOnly`, and the three errors of
 *   its values, in steps, set when the class is made. A class made by `define` also keeps
 *   its physical bounds exactly, as decimals: `lowest` and `highest`, inclusive.
 * - `order`, when a class has one, models the integers of a fixed size, such as bytes,
 *   which have a limited number of distinct values: the class then holds at most `order`
 *   integers. Without it, `end − min` has no limit.
 * - `from` takes a physical value, compares it exactly with the bounds of its class, then
 *   scales it to the step; `fromValue` takes the integer as it is. The integer is never
 *   reduced modulo anything.
 * - `toString()` writes the decimal of the integer exactly, without the digits that the
 *   term error of the class makes meaningless, in the locale-independent form of
 *   JavaScript; `toLocaleString()` writes the same digits for a locale.
 *   `[Symbol.toPrimitive]` converts to a string only.
 */
import { RistrettoElement } from "./ristretto.js";

/** The lowest and the highest scales. */
const LOWEST_SCALE = -308;
const HIGHEST_SCALE = 323;

/** An exact decimal `[n, e]`, worth `n · 10^e`: `[23n, -1]` is 2.3. */
export type Decimal = readonly [mantissa: bigint, exponent: number];

/** Anything that states an order as `ORDER`, such as a class with a static `ORDER`. */
export interface BoundedIntOrder {
  readonly ORDER: bigint;
}

/** The errors of the values of a class, in steps, exact like the integers they affect. */
export interface BoundedIntErrors {
  readonly bound?: bigint | Decimal;
  readonly quadratic?: bigint | Decimal;
  readonly term?: bigint | Decimal;
}

/** The specification of `define`: exact physical bounds, inclusive, and an optional step. */
export interface BoundedIntSpec {
  readonly name: string;
  readonly min: bigint | Decimal;
  readonly max: bigint | Decimal;
  readonly step?: bigint | Decimal;
  /** The accuracy of the values, in their unit, exact; half a step when left out. */
  readonly error?: bigint | Decimal;
  /** The number of distinct integers allowed, or a form that states it; that of the base when left out. */
  readonly order?: BoundedIntOrder | bigint;
}

/** The specification of `defineRaw`: the class constants themselves. */
export interface BoundedIntRawSpec {
  readonly name: string;
  readonly scale: number;
  readonly min: bigint;
  readonly end: bigint;
  /** Whether `from` takes only integers; `false` when left out. */
  readonly integerOnly?: boolean;
  /** The errors of the values, in steps; half a step when left out. */
  readonly errors?: BoundedIntErrors;
  /** The number of distinct integers allowed, or a form that states it; that of the base when left out. */
  readonly order?: BoundedIntOrder | bigint;
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

/** A finite `number` split exactly into `[m, e]` with `x = m · 2^e`, `m` a `bigint`. */
function split(x: number): [bigint, number] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const high = view.getUint32(0);
  const low = view.getUint32(4);
  const exponent = (high >>> 20) & 0x7ff;
  let mantissa = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  // A subnormal has no hidden bit, and the exponent of the smallest normal.
  if (exponent !== 0) mantissa |= 1n << 52n;
  const e = exponent === 0 ? -1074 : exponent - 1075;
  return [high >>> 31 === 1 ? -mantissa : mantissa, e];
}

/**
 * The exact decimal of a finite `number`, its binary value: `m · 2^e` is `m · 5^-e · 10^e`
 * when `e < 0`. `0.1` is `[1000000000000000055511151231257827021181583404541015625n, -55]`.
 */
function numberDecimal(x: number): Decimal {
  const [m, e] = split(x);
  return normalize(e >= 0 ? [m << BigInt(e), 0] : [m * 5n ** BigInt(-e), e]);
}

/**
 * `x` as a decimal, or a `TypeError`: a `bigint`, or `[n, e]` with an integer `e`, or,
 * with `numbers`, a finite `number`, converted exactly.
 */
function decimal(x: unknown, where: string, what: string, numbers = false): Decimal {
  if (typeof x === "bigint") return [x, 0];
  if (numbers && typeof x === "number") {
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
  throw new TypeError(
    `${where}: ${what} must be a bigint${numbers ? ", a number" : ""} or a decimal [n, e]`,
  );
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

/** The same decimal without trailing zeros in its mantissa: `[50n, -2]` is `[5n, -1]`. */
function normalize([n, e]: Decimal): Decimal {
  if (n === 0n) return [0n, 0];
  while (n % 10n === 0n) {
    n /= 10n;
    e++;
  }
  return [n, e];
}

/** Whether a decimal is an integer. */
function isInteger([n, e]: Decimal): boolean {
  return e >= 0 || n === 0n || (digits(n) > -e && n % pow10n(-e) === 0n);
}

/** `n / d` rounded to the nearest integer, ties to even, for `d > 0`. */
function roundHalfEven(n: bigint, d: bigint): bigint {
  let q = n / d;
  if (n % d !== 0n && n < 0n) q -= 1n; // the floor
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
 * The exact decimal string of `n · 10^e`: `"-0.05"`, `"2.0"`, `"1200"`. It is the
 * locale-independent form of JavaScript, as `Number.prototype.toString` writes it, with a
 * point: `toLocaleString()` writes the form of a locale.
 */
function decimalString(n: bigint, e: number): string {
  if (e >= 0) return n === 0n ? "0" : `${String(n)}${"0".repeat(e)}`;
  const sign = n < 0n ? "-" : "";
  const text = (n < 0n ? -n : n).toString().padStart(-e + 1, "0");
  return `${sign}${text.slice(0, e)}.${text.slice(e)}`;
}

// --- Errors -----------------------------------------------------------------

/** Half a step: the error of a rounding, and the default error of a class. */
const HALF: Decimal = [5n, -1];

/**
 * The position of the rounding of `toString()` for the error `e`, in steps: the largest
 * `j ≥ 1` with `10^j ≤ 2e`, or 0 when there is none. Rounding at `10^j` adds at most
 * `½ · 10^j ≤ e`. `2e` lies in `[10^(o − 1), 10^o)`, with `o` its digits plus its
 * exponent, so `j` is `o − 1`, exactly.
 */
function position([n, e]: Decimal): number {
  return n === 0n ? 0 : Math.max(0, digits(2n * n) + e - 1);
}

/** A valid error: a `bigint` or a decimal, 0 or more, normalized. */
function checkError(e: unknown, where: string, what: string): Decimal {
  const d = decimal(e, where, what);
  if (d[0] < 0n) throw new RangeError(`${where}: ${what} must be 0 or more`);
  return normalize(d);
}

/**
 * The `order` given to `define` or `defineRaw`: a `bigint`, or a form with a `bigint`
 * `ORDER`, such as a class with a static `ORDER`; that of `base` when left out.
 */
function orderOf(given: unknown, base: BoundedIntClass, where: string): bigint | undefined {
  if (given === undefined) return base.order;
  const order =
    (typeof given === "object" && given !== null) || typeof given === "function"
      ? (given as { ORDER?: unknown }).ORDER
      : given;
  if (typeof order !== "bigint") {
    throw new TypeError(`${where}: order must be a bigint, or have a bigint ORDER`);
  }
  return order;
}

/** The three errors of `errors`, in steps: `bound` ½, `quadratic` `bound`, `term` `quadratic`. */
function checkErrors(errors: unknown, where: string): [Decimal, Decimal, Decimal] {
  if (errors === undefined) return [HALF, HALF, HALF];
  if (typeof errors !== "object" || errors === null) {
    throw new TypeError(`${where}: errors must be an object`);
  }
  const given = errors as BoundedIntErrors;
  const bound = checkError(given.bound ?? HALF, where, "errors.bound");
  const quadratic = checkError(given.quadratic ?? bound, where, "errors.quadratic");
  const term = checkError(given.term ?? quadratic, where, "errors.term");
  return [bound, quadratic, term];
}

// --- Classes ----------------------------------------------------------------

/** A class of bounded integers, as the static members see it. */
type BoundedIntClass = typeof BoundedInt;

/** The classes whose constants have been checked: each one is checked once. */
const checked = new WeakSet<BoundedIntClass>();

/**
 * `integerOnly` as it applies to `C`: the value of the nearest class that declares it,
 * below `BoundedInt`, or else whether the scale is 0.
 */
function integerOnly(C: BoundedIntClass): unknown {
  for (let c: object = C; c !== BoundedInt; c = Object.getPrototypeOf(c) as object) {
    if (Object.hasOwn(c, "integerOnly")) return (c as BoundedIntClass).integerOnly;
  }
  return C.scale === 0;
}

/**
 * The exact bounds of `C`, inclusive: those that the nearest class declaring `min`
 * declares as `lowest` and `highest`, or else the decimals of `min` and `end − 1`.
 */
function bounds(C: BoundedIntClass): [Decimal, Decimal] {
  let c: object = C;
  while (c !== BoundedInt && !Object.hasOwn(c, "min")) c = Object.getPrototypeOf(c) as object;
  const D = c as BoundedIntClass;
  if (Object.hasOwn(D, "lowest")) return [D.lowest as Decimal, D.highest as Decimal];
  return [
    [C.min, -C.scale],
    [C.end - 1n, -C.scale],
  ];
}

/** Checks the constants of `C` once, and throws for an invalid set. */
function checkClass(C: BoundedIntClass, where: string): void {
  if (checked.has(C)) return;
  const { min, end, scale, order, lowest, highest, errorBound, quadraticError, termError } = C as {
    min?: unknown;
    end?: unknown;
    scale: unknown;
    order: unknown;
    lowest?: unknown;
    highest?: unknown;
    errorBound: unknown;
    quadraticError: unknown;
    termError: unknown;
  };
  if (
    (min === undefined) !== (end === undefined) ||
    Object.hasOwn(C, "min") !== Object.hasOwn(C, "end")
  ) {
    throw new TypeError(`${where}: ${C.name} must declare both min and end, or neither`);
  }
  if (typeof min !== "bigint" || typeof end !== "bigint") {
    throw new TypeError(`${where}: ${C.name}.min and ${C.name}.end must be bigints`);
  }
  if (typeof scale !== "number") throw new TypeError(`${where}: ${C.name}.scale must be a number`);
  if (typeof integerOnly(C) !== "boolean") {
    throw new TypeError(`${where}: ${C.name}.integerOnly must be a boolean`);
  }
  if (order !== undefined && typeof order !== "bigint") {
    throw new TypeError(`${where}: ${C.name}.order must be a bigint, or undefined`);
  }
  if (min >= end) throw new RangeError(`${where}: ${C.name}.min must be below ${C.name}.end`);
  if (order !== undefined) {
    if (order <= 0n) throw new RangeError(`${where}: ${C.name}.order must be above 0`);
    if (end - min > order) {
      throw new RangeError(`${where}: ${C.name} must not hold more than ${C.name}.order integers`);
    }
  }
  const bound = checkError(errorBound, where, `${C.name}.errorBound`);
  const quadratic = checkError(quadraticError, where, `${C.name}.quadraticError`);
  const term = checkError(termError, where, `${C.name}.termError`);
  if (compare(term, quadratic) > 0 || compare(quadratic, bound) > 0) {
    throw new RangeError(
      `${where}: ${C.name} must satisfy termError ≤ quadraticError ≤ errorBound`,
    );
  }
  if (!Number.isInteger(scale) || scale < LOWEST_SCALE || scale > HIGHEST_SCALE) {
    throw new RangeError(
      `${where}: ${C.name}.scale must be an integer from ${String(LOWEST_SCALE)} to ${String(HIGHEST_SCALE)}`,
    );
  }
  if (Object.hasOwn(C, "lowest") !== Object.hasOwn(C, "highest")) {
    throw new TypeError(`${where}: ${C.name} must declare both lowest and highest, or neither`);
  }
  if (Object.hasOwn(C, "lowest")) {
    if (!Object.hasOwn(C, "min")) {
      throw new TypeError(`${where}: ${C.name} declares lowest and highest without min and end`);
    }
    const low = decimal(lowest, where, `${C.name}.lowest`);
    const high = decimal(highest, where, `${C.name}.highest`);
    // Every value within the bounds must scale to an integer of the range.
    if (compare(low, high) > 0 || scaleExact(low, scale) < min || scaleExact(high, scale) >= end) {
      throw new RangeError(
        `${where}: ${C.name}.lowest and ${C.name}.highest must scale into [min, end)`,
      );
    }
  }
  checked.add(C);
}

/** Checks that `q` is in the range of `C`. */
function checkRange(C: BoundedIntClass, q: bigint, where: string): void {
  if (q < C.min) throw new RangeError(`${where}: ${String(q)} is below ${C.name}.min`);
  if (q >= C.end) throw new RangeError(`${where}: ${String(q)} is not below ${C.name}.end`);
}

/** Checks the name of a class to be made. */
function checkName(name: unknown, where: string): string {
  if (typeof name !== "string" || name === "") {
    throw new TypeError(`${where}: name must be a non-empty string`);
  }
  return name;
}

/** A frozen subclass of `base`, named `name`, with the constants as given. */
function makeClass(
  base: BoundedIntClass,
  name: string,
  constants: Record<string, unknown>,
  where: string,
): BoundedIntClass {
  const C = class extends base {};
  Object.defineProperty(C, "name", { value: name });
  for (const [key, value] of Object.entries(constants)) {
    Object.defineProperty(C, key, { value, enumerable: true });
  }
  checkClass(C, where);
  return Object.freeze(C);
}

/** An integer with the scale and the range of its class. */
export class BoundedInt {
  /** The scale `k`: the step of the class is `10^-k`. */
  static readonly scale: number = 0;
  /** The lowest integer of the range: `0n` on `BoundedInt`. */
  static readonly min: bigint = 0n;
  /** The integer just above the range; on `BoundedInt`, the scalars of ristretto255. */
  static readonly end: bigint = RistrettoElement.ORDER;
  /**
   * The number of distinct integers a class may hold, as for integers of a fixed size;
   * `undefined`, no limit, on `BoundedInt`.
   */
  declare static readonly order?: bigint;
  /** The guaranteed bound of the error of a value, in steps: ½ on `BoundedInt`. */
  static readonly errorBound: Decimal = HALF;
  /** The quadratic error of a value, in steps: ½ on `BoundedInt`. */
  static readonly quadraticError: Decimal = HALF;
  /** The error of the least accurate term of a value, in steps: ½ on `BoundedInt`. */
  static readonly termError: Decimal = HALF;
  /**
   * Whether `from` takes only integers. A class that does not declare it takes integers
   * only when its scale is 0.
   */
  static readonly integerOnly: boolean = true;
  /** The lowest physical value, exact and inclusive, on a class made by `define`. */
  declare static readonly lowest?: Decimal;
  /** The highest physical value, exact and inclusive, on a class made by `define`. */
  declare static readonly highest?: Decimal;

  readonly #value: bigint;

  /** Not public: instances come from `from` and `fromValue`, or those of a subclass. */
  protected constructor(value: bigint) {
    this.#value = value;
  }

  /**
   * Makes an instance of the class it is called on, holding the physical value `x`. `x`
   * is compared exactly with the bounds of the class, then scaled by `10^k` and rounded
   * once, ties to even.
   *
   * @param x - a `bigint`, an exact decimal `[n, e]`, worth `n · 10^e`, or a finite
   *   `number`, taken at once as the exact decimal of its binary value.
   * @throws TypeError when `x` is none of these, or not an integer on a class with
   *   `integerOnly`.
   * @throws RangeError when `x` is outside the bounds of the class, or the constants of
   *   the class are invalid.
   */
  static from(x: bigint | number | Decimal): BoundedInt {
    const where = `${this.name}.from`;
    checkClass(this, where);
    const d = decimal(x, where, "x", true);
    if (integerOnly(this) === true && !isInteger(d)) {
      throw new TypeError(`${where}: x must be an integer`);
    }
    const [low, high] = bounds(this);
    if (compare(d, low) < 0) throw new RangeError(`${where}: x is below ${this.name}'s lowest`);
    if (compare(d, high) > 0) throw new RangeError(`${where}: x is above ${this.name}'s highest`);
    const q = scaleExact(d, this.scale);
    checkRange(this, q, where);
    return new this(q);
  }

  /**
   * Makes an instance of the class it is called on, holding the integer `q` as it is.
   *
   * @param q - the integer, a `bigint`.
   * @throws TypeError when `q` is not a `bigint`.
   * @throws RangeError when `q` is outside `[min, end)`, or the constants of the class
   *   are invalid.
   */
  static fromValue(q: bigint): BoundedInt {
    const where = `${this.name}.fromValue`;
    checkClass(this, where);
    if (typeof q !== "bigint") throw new TypeError(`${where}: q must be a bigint`);
    checkRange(this, q, where);
    return new this(q);
  }

  /**
   * Makes a frozen subclass of the class it is called on, from exact physical bounds.
   * The class keeps them as `lowest` and `highest`; its integers `[min, end)` are those
   * that the values within them scale to.
   *
   * @param spec - `name`; `min` and `max`, the lowest and the highest values, inclusive,
   *   `bigint`s or decimals; `step`, the accuracy, which gives the smallest scale `k`
   *   with `10^-k ≤ step`. Without `step`, the class takes integers only, with a scale of 0.
   *   `error`, the accuracy of the values, in their unit, which sets the three errors of
   *   the class, in steps; half a step when left out. `order`, the number of distinct
   *   integers allowed, that of the base when left out.
   * @throws TypeError for a bad name, a bound, a step or an error that is not a `bigint`
   *   or a decimal, a bound that is not an integer without `step`, or a bad `order`.
   * @throws RangeError for `min > max`, a `step` that is not above 0, a `step` finer than
   *   the highest scale, a negative `error`, or a range of more than `order` integers.
   */
  static define(spec: BoundedIntSpec): BoundedIntClass {
    const where = `${this.name}.define`;
    if (typeof spec !== "object" || (spec as unknown) === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    const name = checkName(spec.name, where);
    const order = orderOf(spec.order, this, where);
    const low = decimal(spec.min, where, "min");
    const high = decimal(spec.max, where, "max");
    let k = 0;
    if (spec.step === undefined) {
      if (!isInteger(low) || !isInteger(high)) {
        throw new TypeError(`${where}: min and max must be integers when there is no step`);
      }
    } else {
      const step = decimal(spec.step, where, "step");
      if (step[0] <= 0n) throw new RangeError(`${where}: step must be above 0`);
      k = LOWEST_SCALE;
      while (k <= HIGHEST_SCALE && compare([1n, -k], step) > 0) k++;
      if (k > HIGHEST_SCALE) {
        throw new RangeError(`${where}: step must be 10^-${String(HIGHEST_SCALE)} or more`);
      }
    }
    if (compare(low, high) > 0) throw new RangeError(`${where}: min must not be above max`);
    let error = HALF;
    if (spec.error !== undefined) {
      const [n, e] = checkError(spec.error, where, "error");
      error = normalize([n, e + k]);
    }
    return makeClass(
      this,
      name,
      {
        scale: k,
        min: scaleExact(low, k),
        end: scaleExact(high, k) + 1n,
        integerOnly: spec.step === undefined,
        order,
        errorBound: error,
        quadraticError: error,
        termError: error,
        lowest: Object.freeze([...low]),
        highest: Object.freeze([...high]),
      },
      where,
    );
  }

  /**
   * Makes a frozen subclass of the class it is called on, from its constants: the scale
   * and the integer bounds `[min, end)`, anywhere, of at most `order` integers;
   * `integerOnly`, `false` when left out; `errors`, `{ bound, quadratic, term }` in steps,
   * with `bound` ½, `quadratic` `bound` and `term` `quadratic` when left out; and `order`,
   * that of the base when left out. Its exact bounds are the decimals of `min` and `end − 1`.
   *
   * @throws TypeError for a bad name, bounds that are not `bigint`s, a scale that is not a
   *   `number`, an `integerOnly` that is not a boolean, errors that are not `bigint`s or
   *   decimals, or a bad `order`.
   * @throws RangeError for `min ≥ end`, more than `order` integers, a scale that is not
   *   an integer from -308 to 323, or errors negative or out of the order
   *   `term ≤ quadratic ≤ bound`.
   */
  static defineRaw(spec: BoundedIntRawSpec): BoundedIntClass {
    const where = `${this.name}.defineRaw`;
    if (typeof spec !== "object" || (spec as unknown) === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    const name = checkName(spec.name, where);
    const { scale, min, end } = spec as { scale: number; min: unknown; end: unknown };
    // Left out, both bounds would give the class the range of its base: defineRaw requires them.
    if (typeof min !== "bigint" || typeof end !== "bigint") {
      throw new TypeError(`${where}: min and end must be bigints`);
    }
    const integerOnly = spec.integerOnly ?? false;
    const order = orderOf(spec.order, this, where);
    const [errorBound, quadraticError, termError] = checkErrors(spec.errors, where);
    return makeClass(
      this,
      name,
      { scale, min, end, integerOnly, order, errorBound, quadraticError, termError },
      where,
    );
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /**
   * The decimal that `toString()` and `toLocaleString()` write: `q · 10^-k`, rounded at
   * the largest power of ten `10^j` with `10^j ≤ 2 · termError` of the class, ties to
   * even, as `[n, e]`.
   */
  #shown(): Decimal {
    const C = this.constructor as BoundedIntClass;
    const k = C.scale;
    const j = position(C.termError);
    const q = this.#value;
    // |q| < 10^(j − 1) rounds to 0, with no power of ten to build.
    const n = j === 0 ? q : digits(q) < j ? 0n : roundHalfEven(q, pow10n(j));
    return [n, j - k];
  }

  /** The exact decimal of the integer, with `k − j` decimals and a point: `"2.3"`. */
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
      `${this.constructor.name}: no implicit conversion; call x.toString() for the decimal, ` +
        "or read x.value for the bigint",
    );
  }
}

checked.add(BoundedInt);

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: BoundedInt, from, valueOf, toString, toPrimitive (#41)   |
// | #47    | decimal classes: scale, range, from, fromValue, errors, define, defineRaw; the range [0, ℓ) on BoundedInt, at most ℓ integers per class; stage 1: exact decimals, the bounds checked exactly before rounding; errors and order on the class, order optional; toLocaleString; a number x in from (#44) |
