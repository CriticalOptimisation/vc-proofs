/**
 * `BoundedInt` (docs/core/bounded-int.md): an integer held as a `bigint`, in a class
 * that carries its scale and its range as class-level constants. A `bigint` cannot: it
 * is a primitive with no own property.
 *
 * - A class is described by `scale` (`k`: the step is `10^-k`), the semi-open range
 *   `[min, end)` of its integers, and `integerOnly`. `BoundedInt` has a scale of 0, no
 *   range, and takes integers only; `define` and `defineRaw` make subclasses.
 * - `from` takes a physical value, scales it exactly with `bigint`s and rounds it once,
 *   ties to even; `fromValue` takes the integer as it is. The integer is never reduced
 *   mod `ℓ`. Each instance carries three errors, in steps, which only decide the digits
 *   that `valueOf()` and `toString()` keep.
 * - `valueOf()` is an ordinary method that returns the nearest `number`, without the
 *   digits that the term error makes meaningless.
 *   `[Symbol.toPrimitive]` converts to a string only, so JavaScript never calls
 *   `valueOf()` implicitly and `x + 1n` or `x < 5n` throws instead of giving a silent
 *   wrong answer.
 *
 * This file imports nothing: the group may import it, never the other way round.
 */

/** The largest scale, in absolute value: `10^22` is the largest exact power of ten. */
const MAX_SCALE = 22;

/** The bound of the integers of a class made by `define`: 15 significant digits. */
const DEFINE_LIMIT = 10n ** 15n;

/** The errors of `fromValue`, in steps of the class. */
export interface BoundedIntErrors {
  readonly bound?: number;
  readonly quadratic?: number;
  readonly term?: number;
}

/** The specification of `define`: physical bounds, inclusive, and an optional step. */
export interface BoundedIntSpec {
  readonly name: string;
  readonly min: bigint | number;
  readonly max: bigint | number;
  readonly step?: number;
}

/** The specification of `defineRaw`: the class constants themselves. */
export interface BoundedIntRawSpec {
  readonly name: string;
  readonly scale: number;
  readonly min: bigint;
  readonly end: bigint;
}

/** `10^t` as a `number`, written as a literal: exact for `|t| ≤ 22`. */
function pow10(t: number): number {
  return Number(`1e${String(t)}`);
}

/** `10^t` as a `bigint`, for `t ≥ 0`. */
function pow10n(t: number): bigint {
  return 10n ** BigInt(t);
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

/** `n / d` rounded to the nearest integer, ties to even, for `d > 0`. */
function roundHalfEven(n: bigint, d: bigint): bigint {
  let q = n / d;
  if (n % d !== 0n && n < 0n) q -= 1n; // the floor
  const twice = 2n * (n - q * d);
  if (twice > d || (twice === d && (q & 1n) === 1n)) q += 1n;
  return q;
}

/** `x · 10^k`, exact, rounded once to the nearest integer, ties to even. */
function scaleExact(x: bigint | number, k: number): bigint {
  let n: bigint;
  let d = 1n;
  if (typeof x === "bigint") {
    n = x;
  } else {
    const [m, e] = split(x);
    n = e >= 0 ? m << BigInt(e) : m;
    if (e < 0) d = 1n << BigInt(-e);
  }
  if (k >= 0) n *= pow10n(k);
  else d *= pow10n(-k);
  return roundHalfEven(n, d);
}

/**
 * The position of the rounding of `valueOf()` for the error `e`, in steps: the largest
 * `j ≥ 1` with `10^j ≤ 2e`, or 0 when there is none. Rounding at `10^j` adds at most
 * `½ · 10^j ≤ e`. Halving a power of ten is exact, and `2e` might overflow.
 */
function position(e: number): number {
  let j = 0;
  while (pow10(j + 1) / 2 <= e) j++;
  return j;
}

/** Whether `e` is a valid error: a finite `number`, 0 or more. */
function checkError(e: unknown, where: string, what: string): number {
  if (typeof e !== "number") throw new TypeError(`${where}: ${what} must be a number`);
  if (!Number.isFinite(e) || !(e >= 0)) {
    throw new RangeError(`${where}: ${what} must be finite, and 0 or more`);
  }
  return e;
}

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

/** Checks the constants of `C` once, and throws for an invalid set. */
function checkClass(C: BoundedIntClass, where: string): void {
  if (checked.has(C)) return;
  const { min, end, scale } = C as { min?: unknown; end?: unknown; scale: unknown };
  if (
    (min === undefined) !== (end === undefined) ||
    Object.hasOwn(C, "min") !== Object.hasOwn(C, "end")
  ) {
    throw new TypeError(`${where}: ${C.name} must declare both min and end, or neither`);
  }
  if (min !== undefined && (typeof min !== "bigint" || typeof end !== "bigint")) {
    throw new TypeError(`${where}: ${C.name}.min and ${C.name}.end must be bigints`);
  }
  if (typeof scale !== "number") throw new TypeError(`${where}: ${C.name}.scale must be a number`);
  if (typeof integerOnly(C) !== "boolean") {
    throw new TypeError(`${where}: ${C.name}.integerOnly must be a boolean`);
  }
  if (typeof min === "bigint" && typeof end === "bigint" && min >= end) {
    throw new RangeError(`${where}: ${C.name}.min must be below ${C.name}.end`);
  }
  if (!Number.isInteger(scale) || Math.abs(scale) > MAX_SCALE) {
    throw new RangeError(`${where}: ${C.name}.scale must be an integer from -22 to 22`);
  }
  checked.add(C);
}

/** Checks that `q` is in the range of `C`. */
function checkRange(C: BoundedIntClass, q: bigint, where: string): void {
  const { min, end } = C;
  if (min === undefined || end === undefined) return;
  if (q < min) throw new RangeError(`${where}: ${String(q)} is below ${C.name}.min`);
  if (q >= end) throw new RangeError(`${where}: ${String(q)} is not below ${C.name}.end`);
}

/** Checks the name of a class to be made. */
function checkName(name: unknown, where: string): string {
  if (typeof name !== "string" || name === "") {
    throw new TypeError(`${where}: name must be a non-empty string`);
  }
  return name;
}

/** A frozen subclass of `base`, named `name`, with the four constants as given. */
function makeClass(
  base: BoundedIntClass,
  name: string,
  constants: { scale: number; min: bigint; end: bigint; integerOnly: boolean },
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
  /** The lowest integer of the range; absent on a class with no range. */
  declare static readonly min?: bigint;
  /** The integer just above the range; absent on a class with no range. */
  declare static readonly end?: bigint;
  /**
   * Whether `from` takes only integers. A class that does not declare it takes integers
   * only when its scale is 0.
   */
  static readonly integerOnly: boolean = true;

  readonly #value: bigint;
  readonly #errorBound: number;
  readonly #quadraticError: number;
  readonly #termError: number;

  /** Not public: instances come from `from` and `fromValue`, or those of a subclass. */
  protected constructor(value: bigint, bound = 0.5, quadratic = bound, term = quadratic) {
    this.#value = value;
    this.#errorBound = bound;
    this.#quadraticError = quadratic;
    this.#termError = term;
  }

  /**
   * Makes an instance of the class it is called on, holding the physical value `x`,
   * scaled by `10^k` exactly and rounded once, ties to even.
   *
   * @param x - a `bigint`, or a finite `number`, taken at its exact binary value.
   * @param error - the accuracy of `x`, in the unit of `x`; half a step when left out.
   * @throws TypeError when `x` is neither a `bigint` nor a finite `number`, or not an
   *   integer on a class with `integerOnly`, or when `error` is not a `number`.
   * @throws RangeError when the integer is outside `[min, end)`, or `error` is negative
   *   or not finite, or the constants of the class are invalid.
   */
  static from(x: bigint | number, error?: number): BoundedInt {
    const where = `${this.name}.from`;
    checkClass(this, where);
    if (typeof x !== "bigint") {
      if (typeof x !== "number") throw new TypeError(`${where}: x must be a bigint or a number`);
      if (!Number.isFinite(x)) throw new TypeError(`${where}: x must be a finite number`);
      if (integerOnly(this) === true && !Number.isInteger(x)) {
        throw new TypeError(`${where}: x must be an integer`);
      }
    }
    const k = this.scale;
    const q = scaleExact(x, k);
    checkRange(this, q, where);
    if (error === undefined) return new this(q);
    const e = checkError(error, where, "error");
    const scaled = checkError(k >= 0 ? e * pow10(k) : e / pow10(-k), where, "the scaled error");
    return new this(q, scaled);
  }

  /**
   * Makes an instance of the class it is called on, holding the integer `q` as it is.
   *
   * @param q - the integer, a `bigint`.
   * @param errors - `{ bound, quadratic, term }`, in steps: `bound` is ½ when left out,
   *   `quadratic` is `bound`, and `term` is `quadratic`.
   * @throws TypeError when `q` is not a `bigint`, `errors` is not an object, or an error
   *   is not a `number`.
   * @throws RangeError when `q` is outside `[min, end)`, or an error is negative, not
   *   finite, or out of the order `term ≤ quadratic ≤ bound`.
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
    const bound = checkError(errors.bound ?? 0.5, where, "errors.bound");
    const quadratic = checkError(errors.quadratic ?? bound, where, "errors.quadratic");
    const term = checkError(errors.term ?? quadratic, where, "errors.term");
    if (!(term <= quadratic && quadratic <= bound)) {
      throw new RangeError(`${where}: the errors must satisfy term ≤ quadratic ≤ bound`);
    }
    return new this(q, bound, quadratic, term);
  }

  /**
   * Makes a frozen subclass of the class it is called on, from physical bounds.
   *
   * @param spec - `name`; `min` and `max`, the lowest and the highest values, inclusive;
   *   `step`, the accuracy, which gives the smallest scale `k` with `10^-k ≤ step`.
   *   Without `step`, the class takes integers only, with a scale of 0.
   * @throws TypeError for a bad name, a bound that is not finite, or not an integer
   *   without `step`, or a member of the wrong type.
   * @throws RangeError for `min > max`, a `step` that is not above 0 and finite, a scale
   *   beyond ±22, or an integer of the range at `10^15` or more in absolute value.
   */
  static define(spec: BoundedIntSpec): BoundedIntClass {
    const where = `${this.name}.define`;
    if (typeof spec !== "object" || (spec as unknown) === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    const name = checkName(spec.name, where);
    const { min, max, step } = spec as { min: unknown; max: unknown; step?: unknown };
    for (const [what, bound] of [
      ["min", min],
      ["max", max],
    ] as const) {
      if (typeof bound === "bigint") continue;
      if (typeof bound !== "number" || !Number.isFinite(bound)) {
        throw new TypeError(`${where}: ${what} must be a bigint or a finite number`);
      }
      if (step === undefined && !Number.isInteger(bound)) {
        throw new TypeError(`${where}: ${what} must be an integer when there is no step`);
      }
    }
    const lowest = min as bigint | number;
    const highest = max as bigint | number;
    if (lowest > highest) throw new RangeError(`${where}: min must not be above max`);
    let k = 0;
    if (step !== undefined) {
      if (typeof step !== "number") throw new TypeError(`${where}: step must be a number`);
      if (!Number.isFinite(step) || !(step > 0)) {
        throw new RangeError(`${where}: step must be finite and above 0`);
      }
      k = -(MAX_SCALE + 1);
      while (k <= MAX_SCALE && pow10(-k) > step) k++;
      if (Math.abs(k) > MAX_SCALE) {
        throw new RangeError(`${where}: the scale of the step must be from -22 to 22`);
      }
    }
    const qmin = scaleExact(lowest, k);
    const qmax = scaleExact(highest, k);
    for (const q of [qmin, qmax]) {
      if (q >= DEFINE_LIMIT || -q >= DEFINE_LIMIT) {
        throw new RangeError(`${where}: the integer ${String(q)} is not below 10^15`);
      }
    }
    return makeClass(
      this,
      name,
      { scale: k, min: qmin, end: qmax + 1n, integerOnly: step === undefined },
      where,
    );
  }

  /**
   * Makes a frozen subclass of the class it is called on, from its constants: the scale
   * and the integer bounds `[min, end)`. It has no limit of `10^15`, and is not
   * `integerOnly`.
   *
   * @throws TypeError for a bad name, bounds that are not `bigint`s, or a scale that is
   *   not a `number`.
   * @throws RangeError for `min ≥ end`, or a scale that is not an integer from -22 to 22.
   */
  static defineRaw(spec: BoundedIntRawSpec): BoundedIntClass {
    const where = `${this.name}.defineRaw`;
    if (typeof spec !== "object" || (spec as unknown) === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    const name = checkName(spec.name, where);
    const { scale, min, end } = spec as { scale: number; min: unknown; end: unknown };
    // Left out, both bounds would make a class with no range: defineRaw requires them.
    if (typeof min !== "bigint" || typeof end !== "bigint") {
      throw new TypeError(`${where}: min and end must be bigints`);
    }
    return makeClass(this, name, { scale, min, end, integerOnly: false }, where);
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /** The guaranteed bound of the error, in steps. */
  get errorBound(): number {
    return this.#errorBound;
  }

  /** The quadratic error, in steps. */
  get quadraticError(): number {
    return this.#quadraticError;
  }

  /** The error of the least accurate term, in steps. */
  get termError(): number {
    return this.#termError;
  }

  /**
   * The physical value as a `number`, rounded at the largest power of ten `10^j` with
   * `10^j ≤ 2 · termError`: with an error of ½, the nearest `number` to the decimal.
   *
   * @throws RangeError when the `number` would be `±Infinity`.
   */
  valueOf(): number {
    const k = (this.constructor as BoundedIntClass).scale;
    const j = position(this.#termError);
    const n = j === 0 ? this.#value : roundHalfEven(this.#value, pow10n(j));
    let result: number;
    if (n === 0n) result = 0;
    else if (j === k) result = Number(n);
    else if (j > k) result = Number(n) * pow10(j - k);
    else {
      result = Number(n) / pow10(k - j);
      // `n` beyond the numbers, its decimal maybe not: at that magnitude, the integer
      // part of the decimal holds every digit a `number` can keep.
      if (!Number.isFinite(result)) result = Number(roundHalfEven(n, pow10n(k - j)));
    }
    if (!Number.isFinite(result)) {
      throw new RangeError(`${this.constructor.name}.valueOf: beyond the range of a number`);
    }
    return result;
  }

  /** The digits of `valueOf()` that carry meaning: `k − j` decimals when above 0. */
  toString(): string {
    const k = (this.constructor as BoundedIntClass).scale;
    const decimals = k - position(this.#termError);
    const x = this.valueOf();
    return decimals > 0 ? x.toFixed(decimals) : String(x);
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

checked.add(BoundedInt);

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #42    | new: BoundedInt, from, valueOf, toString, toPrimitive (#41)   |
// | #47    | decimal classes: scale, range, from, fromValue, errors, define, defineRaw (#44) |
