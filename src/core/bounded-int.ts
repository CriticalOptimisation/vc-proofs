/**
 * `BoundedInt` (docs/core/bounded-int.md): an integer held as a `bigint`, in a class
 * that carries its scale and its range as class-level constants. A `bigint` cannot: it
 * is a primitive with no own property.
 *
 * Stage 1 (#44): every value and every error is an exact decimal, a `bigint` mantissa
 * `n` and an integer exponent `e`, worth `n · 10^e`. A `number` is only ever an exponent.
 * Nothing is rounded but the scaling of a value to the step of its class, once, ties to
 * even, after the value has been checked against the exact bounds.
 *
 * - A class is described by `scale` (`k`: the step is `10^-k`), the semi-open range
 *   `[min, end)` of its integers, `integerOnly`, and `order`, the order of its group: a
 *   class holds at most `order` integers. `define` and `defineRaw` take the group, or its
 *   order, and inherit that of their base when it is left out. A class made
 *   by `define` also keeps its physical bounds exactly, as decimals: `lowest` and
 *   `highest`, inclusive. `BoundedInt` has a scale of 0 and the range `[0, ℓ)`.
 * - `from` takes a physical value, a `bigint` or a decimal `[n, e]`, compares it exactly
 *   with the bounds of its class, then scales it to the step; `fromValue` takes the
 *   integer as it is. The integer is never reduced mod `ℓ`.
 * - `toString()` writes the decimal of the integer exactly, without the digits that the
 *   term error makes meaningless, in the locale-independent form of JavaScript;
 *   `toLocaleString()` writes the same digits for a locale. `[Symbol.toPrimitive]`
 *   converts to a string only.
 *
 * The only import is the group of `BoundedInt` itself, ristretto255, for its order: the
 * range of `BoundedInt` is `[0, ℓ)`, read from the group rather than copied.
 */
import { RistrettoElement } from "./ristretto.js";

/** The lowest and the highest scales. */
const LOWEST_SCALE = -308;
const HIGHEST_SCALE = 323;

/** An exact decimal `[n, e]`, worth `n · 10^e`: `[23n, -1]` is 2.3. */
export type Decimal = readonly [mantissa: bigint, exponent: number];

/** A group, as a class sees it: its order, the number of its scalars. */
export interface BoundedIntGroup {
  readonly ORDER: bigint;
}

/** The errors of `fromValue`, in steps of the class, exact like the integer they affect. */
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
  /** The group of the class, or its order; that of the base when left out. */
  readonly group?: BoundedIntGroup | bigint;
}

/** The specification of `defineRaw`: the class constants themselves. */
export interface BoundedIntRawSpec {
  readonly name: string;
  readonly scale: number;
  readonly min: bigint;
  readonly end: bigint;
  /** Whether `from` takes only integers; `false` when left out. */
  readonly integerOnly?: boolean;
  /** The group of the class, or its order; that of the base when left out. */
  readonly group?: BoundedIntGroup | bigint;
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

/** `x` as a decimal, or a `TypeError`: a `bigint`, or `[n, e]` with an integer `e`. */
function decimal(x: unknown, where: string, what: string): Decimal {
  if (typeof x === "bigint") return [x, 0];
  if (
    Array.isArray(x) &&
    x.length === 2 &&
    typeof x[0] === "bigint" &&
    Number.isSafeInteger(x[1])
  ) {
    return [x[0], x[1] as number];
  }
  throw new TypeError(`${where}: ${what} must be a bigint or a decimal [n, e]`);
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

/** Half a step: the error of a rounding, and the default error of an instance. */
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
 * The order of the group given to `define` or `defineRaw`, an object or a class such as
 * `RistrettoElement` with a static `ORDER`, or a `bigint`; else that of `base`.
 */
function orderOf(group: unknown, base: BoundedIntClass, where: string): bigint {
  if (group === undefined) return base.order;
  const order =
    (typeof group === "object" && group !== null) || typeof group === "function"
      ? (group as { ORDER?: unknown }).ORDER
      : group;
  if (typeof order !== "bigint") {
    throw new TypeError(`${where}: group must be a group with a bigint ORDER, or a bigint`);
  }
  return order;
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
  const { min, end, scale, order, lowest, highest } = C as {
    min?: unknown;
    end?: unknown;
    scale: unknown;
    order: unknown;
    lowest?: unknown;
    highest?: unknown;
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
  if (typeof order !== "bigint") throw new TypeError(`${where}: ${C.name}.order must be a bigint`);
  if (min >= end) throw new RangeError(`${where}: ${C.name}.min must be below ${C.name}.end`);
  if (order <= 0n) throw new RangeError(`${where}: ${C.name}.order must be above 0`);
  if (end - min > order) {
    throw new RangeError(`${where}: ${C.name} must not hold more than ${C.name}.order integers`);
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
  /** The integer just above the range: `ℓ` on `BoundedInt`, one integer per scalar. */
  static readonly end: bigint = RistrettoElement.ORDER;
  /** The order of the group of the class: it holds at most `order` integers. */
  static readonly order: bigint = RistrettoElement.ORDER;
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
  readonly #errorBound: Decimal;
  readonly #quadraticError: Decimal;
  readonly #termError: Decimal;

  /** Not public: instances come from `from` and `fromValue`, or those of a subclass. */
  protected constructor(
    value: bigint,
    bound: Decimal = HALF,
    quadratic: Decimal = bound,
    term: Decimal = quadratic,
  ) {
    this.#value = value;
    this.#errorBound = bound;
    this.#quadraticError = quadratic;
    this.#termError = term;
  }

  /**
   * Makes an instance of the class it is called on, holding the physical value `x`. `x`
   * is compared exactly with the bounds of the class, then scaled by `10^k` and rounded
   * once, ties to even.
   *
   * @param x - a `bigint`, or an exact decimal `[n, e]`, worth `n · 10^e`.
   * @param error - the accuracy of `x`, in the unit of `x`, exact like `x`: a `bigint` or
   *   a decimal; half a step when left out.
   * @throws TypeError when `x` or `error` is neither a `bigint` nor a decimal, or `x` is
   *   not an integer on a class with `integerOnly`.
   * @throws RangeError when `x` is outside the bounds of the class, `error` is negative,
   *   or the constants of the class are invalid.
   */
  static from(x: bigint | Decimal, error?: bigint | Decimal): BoundedInt {
    const where = `${this.name}.from`;
    checkClass(this, where);
    const d = decimal(x, where, "x");
    if (integerOnly(this) === true && !isInteger(d)) {
      throw new TypeError(`${where}: x must be an integer`);
    }
    const [low, high] = bounds(this);
    if (compare(d, low) < 0) throw new RangeError(`${where}: x is below ${this.name}'s lowest`);
    if (compare(d, high) > 0) throw new RangeError(`${where}: x is above ${this.name}'s highest`);
    const k = this.scale;
    const q = scaleExact(d, k);
    checkRange(this, q, where);
    if (error === undefined) return new this(q);
    const [n, e] = checkError(error, where, "error");
    return new this(q, normalize([n, e + k]));
  }

  /**
   * Makes an instance of the class it is called on, holding the integer `q` as it is.
   *
   * @param q - the integer, a `bigint`.
   * @param errors - `{ bound, quadratic, term }`, in steps: `bound` is ½ when left out,
   *   `quadratic` is `bound`, and `term` is `quadratic`.
   *   Each is a `bigint` or a decimal, exact like `q`.
   * @throws TypeError when `q` is not a `bigint`, `errors` is not an object, or an error
   *   is neither a `bigint` nor a decimal.
   * @throws RangeError when `q` is outside `[min, end)`, or an error is negative, or out
   *   of the order `term ≤ quadratic ≤ bound`.
   */
  static fromValue(q: bigint, errors?: BoundedIntErrors): BoundedInt {
    const where = `${this.name}.fromValue`;
    checkClass(this, where);
    if (typeof q !== "bigint") throw new TypeError(`${where}: q must be a bigint`);
    checkRange(this, q, where);
    if (errors === undefined) return new this(q);
    if (typeof errors !== "object" || (errors as unknown) === null) {
      throw new TypeError(`${where}: errors must be an object`);
    }
    const bound = checkError(errors.bound ?? HALF, where, "errors.bound");
    const quadratic = checkError(errors.quadratic ?? bound, where, "errors.quadratic");
    const term = checkError(errors.term ?? quadratic, where, "errors.term");
    if (compare(term, quadratic) > 0 || compare(quadratic, bound) > 0) {
      throw new RangeError(`${where}: the errors must satisfy term ≤ quadratic ≤ bound`);
    }
    return new this(q, bound, quadratic, term);
  }

  /**
   * Makes a frozen subclass of the class it is called on, from exact physical bounds.
   * The class keeps them as `lowest` and `highest`; its integers `[min, end)` are those
   * that the values within them scale to.
   *
   * @param spec - `name`; `min` and `max`, the lowest and the highest values, inclusive,
   *   `bigint`s or decimals; `step`, the accuracy, which gives the smallest scale `k`
   *   with `10^-k ≤ step`. Without `step`, the class takes integers only, with a scale of 0.
   *   `group`, the group of the class or its order, that of the base when left out.
   * @throws TypeError for a bad name, a bound or a step that is not a `bigint` or a
   *   decimal, a bound that is not an integer without `step`, or a bad `group`.
   * @throws RangeError for `min > max`, a `step` that is not above 0, a `step` finer than
   *   the highest scale, or a range of more than `order` integers.
   */
  static define(spec: BoundedIntSpec): BoundedIntClass {
    const where = `${this.name}.define`;
    if (typeof spec !== "object" || (spec as unknown) === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    const name = checkName(spec.name, where);
    const order = orderOf(spec.group, this, where);
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
    return makeClass(
      this,
      name,
      {
        scale: k,
        min: scaleExact(low, k),
        end: scaleExact(high, k) + 1n,
        integerOnly: spec.step === undefined,
        order,
        lowest: Object.freeze([...low]),
        highest: Object.freeze([...high]),
      },
      where,
    );
  }

  /**
   * Makes a frozen subclass of the class it is called on, from its constants: the scale
   * and the integer bounds `[min, end)`, anywhere, of at most `order` integers;
   * `integerOnly`, `false` when left out; and `group`, the group of the class or its order,
   * that of the base when left out. Its exact bounds are the decimals of `min` and `end − 1`.
   *
   * @throws TypeError for a bad name, bounds that are not `bigint`s, a scale that is not a
   *   `number`, an `integerOnly` that is not a boolean, or a bad `group`.
   * @throws RangeError for `min ≥ end`, more than `order` integers, or a scale that is not
   *   an integer from -308 to 323.
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
    const order = orderOf(spec.group, this, where);
    return makeClass(this, name, { scale, min, end, integerOnly, order }, where);
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /** The guaranteed bound of the error, in steps, a decimal. */
  get errorBound(): Decimal {
    return this.#errorBound;
  }

  /** The quadratic error, in steps, a decimal. */
  get quadraticError(): Decimal {
    return this.#quadraticError;
  }

  /** The error of the least accurate term, in steps, a decimal. */
  get termError(): Decimal {
    return this.#termError;
  }

  /**
   * The decimal that `toString()` and `toLocaleString()` write: `q · 10^-k`, rounded at
   * the largest power of ten `10^j` with `10^j ≤ 2 · termError`, ties to even, as `[n, e]`.
   */
  #shown(): Decimal {
    const k = (this.constructor as BoundedIntClass).scale;
    const j = position(this.#termError);
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
// | #47    | decimal classes: scale, range, from, fromValue, errors, define, defineRaw; the range [0, ℓ) on BoundedInt, at most ℓ integers per class; stage 1: exact decimals, the bounds checked exactly before rounding; exact errors; order from the group; toLocaleString (#44) |
