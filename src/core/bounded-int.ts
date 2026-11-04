/**
 * `BoundedInt` (docs/core/bounded-int.md): an integer held as a `bigint`, in a class so
 * that later subclasses can carry its bounds, its scaling and its salting as class-level
 * constants. A `bigint` cannot: it is a primitive with no own property.
 *
 * - Instances come only from `BoundedInt.from`, which keeps a `bigint` as it is, casts a
 *   safe integer `number`, and refuses everything else. The integer is never reduced
 *   mod `ℓ`.
 * - `valueOf()` is an ordinary method that returns a `number`. `[Symbol.toPrimitive]`
 *   converts to a string only, so JavaScript never calls `valueOf()` implicitly and
 *   `x + 1n` or `x < 5n` throws instead of giving a silent wrong answer.
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
   * @param n - a `bigint`, kept as it is, or a safe integer `number`, cast to a `bigint`.
   * @throws TypeError when `n` is a `number` that is not an integer, or neither a
   *   `bigint` nor a `number`.
   * @throws RangeError when `n` is an integer `number` beyond `±(2^53 − 1)`: it has
   *   already lost its precision.
   */
  static from(n: bigint | number): BoundedInt {
    const where = `${this.name}.from`;
    if (typeof n === "bigint") return new this(n);
    if (typeof n !== "number") {
      throw new TypeError(`${where}: n must be a bigint or a number`);
    }
    if (!Number.isInteger(n)) throw new TypeError(`${where}: n must be an integer`);
    if (!Number.isSafeInteger(n)) {
      throw new RangeError(`${where}: n is beyond ±(2^53 − 1) and has lost its precision`);
    }
    return new this(BigInt(n));
  }

  /** The integer, a `bigint`. */
  get value(): bigint {
    return this.#value;
  }

  /**
   * The integer as a `number`: exact up to `2^53`, the nearest `number` above.
   *
   * @throws RangeError when the integer is beyond the range of a `number`.
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
// | #41    | new: BoundedInt, its from, valueOf, toString, toPrimitive     |
