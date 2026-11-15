/**
 * `LinearCombination` (docs/core/linear-combination.md): the commitment to a linear
 * combination `Σ aᵢ·Tᵢ` of committed values, which a verifier computes from the
 * commitments, `combine`, and a holder with its opening, `combineBlinded`.
 *
 * - The constructor reads the classes of the terms only, never a group: it aligns the
 *   coefficients on one scale `k` and makes, once, the class of the result, `#result`, with
 *   the `define` of the generic class, which is exempt from the count of values of its
 *   parent. Its errors come from those of the terms by the formulas of propagation, the
 *   quadratic error kept squared: no root is taken.
 * - Both methods first check that the class of the result holds no more integers than the
 *   class of the group of their context; a result that fits implies terms that fit.
 * - Neither method uses `h`: they add and multiply the commitments they are given, so they
 *   are synchronous.
 */
import {
  BoundedInt,
  compare,
  decimal,
  errors,
  product,
  sum,
  type Decimal,
  type Quantity,
} from "./bounded-int.js";
import type { Blinded, BlindingContext, Committed } from "./blinding-context.js";
// The operations of an abelian group: `add`, `multiplyScalar` by integers, `equals`.
import type { GroupElement } from "./interfaces.js";

/** The specification of a combination: the name of the class of the result, the terms. */
export interface LinearCombinationSpec {
  readonly name: string;
  /** The pairs `[a, T]`, in order: a coefficient, a quantity, and a class of bounded integers. */
  readonly terms: readonly (readonly [Quantity, typeof BoundedInt])[];
}

/**
 * The getter `value` of the generic class: it reads the private integer of an instance,
 * whatever a subclass overrides, and throws for anything else.
 */
const readValue = ((): ((this: unknown) => bigint) => {
  // It is called with `call`, on the value to check: unbound on purpose.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const get: unknown = Object.getOwnPropertyDescriptor(BoundedInt.prototype, "value")?.get;
  if (typeof get !== "function") throw new Error("bounded-int.ts: BoundedInt has no getter value");
  return get as (this: unknown) => bigint;
})();

/** Whether `T` is a class of bounded integers: the generic class or one of its subclasses. */
function isClass(T: unknown): T is typeof BoundedInt {
  return typeof T === "function" && (T === BoundedInt || T.prototype instanceof BoundedInt);
}

/** `|a|`, for a decimal `a`. */
function abs([n, e]: Decimal): Decimal {
  return [n < 0n ? -n : n, e];
}

/** `Σ f(i)` over the terms, from `[0n, 0]`, or `undefined` as soon as one is `undefined`. */
function total(count: number, f: (i: number) => Decimal | undefined): Decimal | undefined {
  let result: Decimal = [0n, 0];
  for (let i = 0; i < count; i++) {
    const d = f(i);
    if (d === undefined) return undefined;
    result = sum(result, d);
  }
  return result;
}

/** The largest `f(i)` over the terms, from `[0n, 0]`, or `undefined` as soon as one is. */
function largest(count: number, f: (i: number) => Decimal | undefined): Decimal | undefined {
  let result: Decimal = [0n, 0];
  for (let i = 0; i < count; i++) {
    const d = f(i);
    if (d === undefined) return undefined;
    if (compare(d, result) > 0) result = d;
  }
  return result;
}

/**
 * The commitment to a linear combination of committed values, built once from the classes
 * of its terms, and used with a blinding context. Immutable. See
 * docs/core/linear-combination.md.
 */
export class LinearCombination {
  /** The class of the result, made once by the constructor. */
  readonly #result: typeof BoundedInt;
  /** The integer coefficients `a′ᵢ`, aligned on the scale of the result; frozen. */
  readonly #coefficients: readonly bigint[];
  /** The classes of the terms, in order; frozen. */
  readonly #terms: readonly (typeof BoundedInt)[];

  /**
   * A combination of the terms `[a, T]` of `spec`, read from the classes only.
   * @throws TypeError when `spec` is not an object, `name` is not a non-empty string,
   *   `terms` is not an array, a term is not a pair `[a, T]`, `a` is not a quantity, or `T`
   *   is not a class of bounded integers.
   * @throws RangeError as `define` does: the constants of a term class invalid, or a scale
   *   of the result beyond its limits.
   */
  constructor(spec: LinearCombinationSpec) {
    const where = "LinearCombination";
    const value: unknown = spec;
    if (typeof value !== "object" || value === null) {
      throw new TypeError(`${where}: spec must be an object`);
    }
    const { name, terms } = spec as { name: unknown; terms: unknown };
    if (typeof name !== "string" || name === "") {
      throw new TypeError(`${where}: name must be a non-empty string`);
    }
    if (!Array.isArray(terms)) throw new TypeError(`${where}: terms must be an array`);
    // The copies first: a later change to the caller's array changes nothing.
    const pairs: unknown[] = [...(terms as unknown[])];
    const classes: (typeof BoundedInt)[] = [];
    const decimals: Decimal[] = [];
    for (const [i, pair] of pairs.entries()) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new TypeError(`${where}: terms[${String(i)}] must be a pair [a, T]`);
      }
      const [a, T] = pair as [unknown, unknown];
      const [n, e] = decimal(a, where, `terms[${String(i)}][0]`);
      if (!isClass(T)) {
        throw new TypeError(`${where}: terms[${String(i)}][1] must be a class of bounded integers`);
      }
      // Without trailing zeros: the exponent of a coefficient is that of its last digit.
      decimals.push(product([n, e], [1n, 0]));
      classes.push(T);
    }
    // The constants of each class, checked at their first use, as define checks them.
    const termErrors = classes.map((T) => errors(T));

    let resultSpec: Parameters<typeof BoundedInt.define>[0];
    let coefficients: bigint[] = [];
    if (classes.length === 0) {
      // The constant 0, exact, with no alignment.
      resultSpec = { name, min: -0.5, max: 0.5, error: 0 };
    } else {
      const k = Math.max(...classes.map((T, i) => T.scale - (decimals[i] as Decimal)[1]));
      // define refuses a scale beyond its limits before any power of ten is built here.
      BoundedInt.define({ name, min: 0, max: 1, step: [1n, -k] });
      coefficients = decimals.map(
        ([n, e], i) => n * 10n ** BigInt(k - (classes[i] as typeof BoundedInt).scale + e),
      );
      let low = 0n;
      let high = 0n;
      for (const [i, c] of coefficients.entries()) {
        const T = classes[i] as typeof BoundedInt;
        low += c * (c > 0n ? T.low : T.high);
        high += c * (c > 0n ? T.high : T.low);
      }
      const size = (i: number) => abs(decimals[i] as Decimal);
      const count = classes.length;
      const error = {
        bound: total(count, (i) => {
          const b = termErrors[i]?.bound;
          return b === undefined ? undefined : product(size(i), b);
        }),
        quadraticSquared: total(count, (i) => {
          const q = termErrors[i]?.quadraticSquared;
          return q === undefined ? undefined : product(product(size(i), size(i)), q);
        }),
        term: largest(count, (i) => {
          const t = termErrors[i]?.term;
          return t === undefined ? undefined : product(size(i), t);
        }),
      };
      resultSpec = {
        name,
        step: [1n, -k],
        min: [low, -k],
        max: [10n * high + 5n, -(k + 1)],
        error,
      };
    }
    this.#result = BoundedInt.define(resultSpec);
    this.#coefficients = Object.freeze(coefficients);
    this.#terms = Object.freeze(classes);
  }

  /**
   * The class of the result: its scale, its range and its errors. Made once, on the generic
   * class, and the same object on every read.
   */
  get boundedInt(): typeof BoundedInt {
    return this.#result;
  }

  /** The integer coefficients `a′ᵢ`, aligned on the scale of the result: a frozen array. */
  get coefficients(): readonly bigint[] {
    return this.#coefficients;
  }

  /**
   * `Σ a′ᵢ·Cᵢ`, the commitment to the combination, for the verifier: one `Committed` per
   * term, in order, whose `type` is the class of its term.
   * @throws RangeError when the class of the result holds more integers than the class of
   *   the group of `context`, before any other check; for a count of inputs other than the
   *   count of terms; for the same commitment given twice.
   * @throws TypeError when `committed` is not an array, an input is not an object, or its
   *   `type` is not the class of its term.
   */
  combine<E extends GroupElement>(
    context: BlindingContext<E>,
    committed: readonly Committed<E>[],
  ): E {
    const where = "LinearCombination.combine";
    const group = this.#fit(context, where);
    const inputs = this.#inputs(committed, where);
    for (const [i, input] of inputs.entries()) {
      if (input.type !== this.#terms[i]) {
        throw new TypeError(
          `${where}: committed[${String(i)}].type must be ${String(this.#terms[i]?.name)}`,
        );
      }
    }
    const commitments = inputs.map((input) => input.commitment);
    this.#once(commitments, where);
    return this.#sum(group.canonicalGenerator(), commitments);
  }

  /**
   * The commitment to the combination with its opening, for the holder, frozen: one
   * `Blinded` per term, in order, whose value is of the class of its term and whose blinding
   * factor is of the class of the group. The inputs are not checked to open their
   * commitments: `isOpeningOf` checks the result.
   * @throws as `combine`, with `value.constructor` and `blinding.constructor` in place of
   *   `type`; a `TypeError` for a value or a blinding factor that is no bounded integer.
   */
  combineBlinded<E extends GroupElement>(
    context: BlindingContext<E>,
    openings: readonly Blinded<E>[],
  ): Blinded<E> {
    const where = "LinearCombination.combineBlinded";
    const group = this.#fit(context, where);
    const inputs = this.#inputs(openings, where);
    const scalar = context.boundedInt;
    let m = 0n;
    let r = 0n;
    for (const [i, input] of inputs.entries()) {
      const at = `${where}: openings[${String(i)}]`;
      const q = this.#read(input.value, this.#terms[i] as typeof BoundedInt, `${at}.value`);
      const s = this.#read(input.blinding, scalar, `${at}.blinding`);
      const c = this.#coefficients[i] as bigint;
      m += c * q;
      r += c * s;
    }
    const commitments = inputs.map((input) => input.commitment);
    this.#once(commitments, where);
    const order = group.ORDER;
    return Object.freeze({
      commitment: this.#sum(group.canonicalGenerator(), commitments),
      value: this.#result.fromValue(m),
      blinding: scalar.fromValue(((r % order) + order) % order),
    });
  }

  /**
   * The group of `context`, once the class of the result is found to fit it: no more
   * integers than the class of the group, `context.boundedInt`.
   */
  #fit<E extends GroupElement>(context: BlindingContext<E>, where: string) {
    const group = context.group;
    const S = context.boundedInt;
    const R = this.#result;
    if (R.high - R.low > S.high - S.low) {
      throw new RangeError(
        `${where}: ${R.name} holds more values than the group ${group.SUITE_NAME} has scalars`,
      );
    }
    return group;
  }

  /** The inputs, an array of objects, one per term. */
  #inputs<T>(inputs: readonly T[], where: string): readonly T[] {
    const value: unknown = inputs;
    if (!Array.isArray(value)) throw new TypeError(`${where}: the inputs must be an array`);
    const copy = [...(value as T[])];
    if (copy.length !== this.#terms.length) {
      throw new RangeError(
        `${where}: ${String(copy.length)} inputs for ${String(this.#terms.length)} terms`,
      );
    }
    for (const [i, input] of copy.entries()) {
      if (typeof input !== "object" || input === null) {
        throw new TypeError(`${where}: input ${String(i)} must be an object`);
      }
    }
    return copy;
  }

  /** The integer of the bounded integer `x`, of exactly the class `C`, else a `TypeError`. */
  #read(x: unknown, C: typeof BoundedInt, where: string): bigint {
    let q: bigint;
    try {
      q = readValue.call(x);
    } catch (cause) {
      throw new TypeError(`${where} must be a bounded integer`, { cause });
    }
    if ((x as BoundedInt).constructor !== C) {
      throw new TypeError(`${where} must be a ${C.name}`);
    }
    return q;
  }

  /** A `RangeError` when two of the commitments are equal, by the `equals` of the group. */
  #once(commitments: readonly GroupElement[], where: string): void {
    for (let i = 0; i < commitments.length; i++) {
      for (let j = i + 1; j < commitments.length; j++) {
        if ((commitments[i] as GroupElement).equals(commitments[j] as GroupElement)) {
          throw new RangeError(
            `${where}: the same commitment for the terms ${String(i)} and ${String(j)}; factor them`,
          );
        }
      }
    }
  }

  /** `Σ a′ᵢ·Cᵢ`; the identity, `g` times 0, for no term: `h` is never used. */
  #sum<E extends GroupElement>(g: E, commitments: readonly E[]): E {
    let result = g.multiplyScalar(0n);
    for (const [i, C] of commitments.entries()) {
      result = result.add(C.multiplyScalar(this.#coefficients[i] as bigint));
    }
    return result;
  }
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
