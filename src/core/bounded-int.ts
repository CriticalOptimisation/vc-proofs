/**
 * `BoundedInt` (docs/core/bounded-int.md): an integer held as a `bigint`, in a class so
 * that later subclasses can carry its bounds, its scaling and its salting as class-level
 * constants. A `bigint` cannot: it is a primitive with no own property.
 *
 * - Instances come only from `BoundedInt.from`, which keeps a `bigint` as it is, casts an
 *   integer `number` at any magnitude, exactly, and refuses everything else. The integer
 *   is never reduced mod `ℓ`.
 * - `valueOf()` is an ordinary method that returns the nearest `number`.
 *   `[Symbol.toPrimitive]` converts to a string only, so JavaScript never calls
 *   `valueOf()` implicitly and `x + 1n` or `x < 5n` throws instead of giving a silent
 *   wrong answer.
 *
 * This file imports nothing: the group may import it, never the other way round.
 */

/** An integer, held as a `bigint`, with no bounds yet. */
export class BoundedInt {
  readonly #value: bigint;

  /** Not public: instances come from `from`, or from the `from` of a subclass. */
  protected constructor(value: bigint) {
    this.#value = value;
  }

  /**
   * Makes an instance of the class it is called on, holding the integer `n`.
   *
   * @param n - a `bigint`, kept as it is, or an integer `number`, at any magnitude, cast
   *   exactly to a `bigint`.
   * @throws TypeError when `n` is a `number` that is not an integer (`1.5`, `NaN`,
   *   `±Infinity`), or neither a `bigint` nor a `number`. Never a `RangeError`.
   */
  static from(n: bigint | number): BoundedInt {
    const where = `${this.name}.from`;
    if (typeof n === "bigint") return new this(n);
    if (typeof n !== "number") {
      throw new TypeError(`${where}: n must be a bigint or a number`);
    }
    if (!Number.isInteger(n)) throw new TypeError(`${where}: n must be an integer`);
    return new this(BigInt(n));
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /**
   * The integer as a `number`: exact up to `2^53`, the nearest `number` above. It gives
   * back every integer `number` that `from` took.
   *
   * @throws RangeError when the nearest `number` would be `±Infinity`.
   */
  valueOf(): number {
    const result = Number(this.#value);
    if (!Number.isFinite(result)) {
      throw new RangeError(`${this.constructor.name}.valueOf: beyond the range of a number`);
    }
    return result;
  }

  /** The string of `valueOf()`, as `String` writes a `number`. */
  toString(): string {
    return String(this.valueOf());
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
