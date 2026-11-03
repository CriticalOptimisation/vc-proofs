/**
 * The blinding context `BlindingContext` (docs/core/blinding-context.md): the constants
 * of one application, its group and the generator `h`, checked against the message it
 * was derived from, and the Pedersen commitments `C = m·g + r·h` made with them.
 *
 * - The constructor copies its inputs as its first statements and validates the copies
 *   in the background; the promise of the validation is `#ready`. Every member that
 *   yields `h`, or anything computed from `h`, awaits `#ready` first, so each one
 *   rejects with the `RangeError` of the validation when it failed.
 * - Every piece of arithmetic goes through the group held in `#group`, ristretto255 by
 *   default (docs/core/blinding-context.md, *The group*). The type parameters exist for
 *   the type checker only.
 * - Each context keeps its own queue of up to 10 pairs `(x, x·h)`, `x ≠ 0`, filled one
 *   pair per macrotask once the context is used, and taken by `blind` and `isOpeningOf`.
 *
 * The functions exported below the class are for the tests, not for the entry point.
 */
import { RistrettoElement } from "./ristretto.js";
import type { RistrettoScalar } from "./ristretto.js";

/** The length at which the queue of blindings stops filling. */
const QUEUE_LENGTH = 10;

/** What a context needs of the scalars of its group. */
interface GroupScalar {
  add(other: this): this;
  equals(other: this): boolean;
  isZero(): boolean;
}

/**
 * What a context needs of the elements of its group. Written with `this` and with
 * `GroupScalar`, rather than with parameters for the element and scalar types, so that
 * `RistrettoElement` and `RistrettoScalar` can be the defaults of the parameters it
 * constrains. `Group<E, S>` ties the two types together.
 */
interface GroupElement {
  encode(): Uint8Array;
  equals(other: this): boolean;
  add(other: this): this;
  subtract(other: this): this;
  multiplyScalar(scalar: GroupScalar): this;
}

/**
 * A group for a blinding context, of elements `E` and scalars `S`: the members of the
 * table in docs/core/blinding-context.md, *The group*. The class `RistrettoElement` is
 * one. The context trusts its group: it checks neither its members nor its arithmetic.
 */
export interface Group<E extends GroupElement, S extends GroupScalar> {
  /** The first bytes of `serialize()`, in ASCII. */
  readonly SUITE_NAME: string;
  /** The tag of the check of `h`. */
  readonly GENERATOR_DST: string;
  /** The scalars: the random blinding factors, and the type check of a scalar. */
  readonly Scalar: { random(): S; fromBigInt(n: bigint): S };
  /** Decodes `h`; throws for bytes that are not an encoding of an element. */
  decode(bytes: Uint8Array): E;
  /** The hash to the group of the check of `h`. */
  hashToGroup(message: Uint8Array, dst: Uint8Array): Promise<E>;
  /** The generator `g` of every commitment. */
  canonicalGenerator(): E;
  /** The neutral element, for the type check of an element. */
  identity(): E;
}

/** The default group; the annotation checks that `RistrettoElement` is a group. */
const RISTRETTO255: Group<RistrettoElement, RistrettoScalar> = RistrettoElement;

/** A precomputed blinding: a random scalar `x ≠ 0` and `x·h`. */
interface Pair<E, S> {
  readonly x: S;
  readonly xh: E;
}

/** A commitment and its blinding factor, as `blind` resolves them. */
export interface Blinded<E = RistrettoElement, S = RistrettoScalar> {
  readonly commitment: E;
  readonly blinding: S;
}

/**
 * The name of what `kind` makes, for a diagnostic: `a <class name>` when `kind` is a
 * named class, such as `RistrettoScalar`, else `fallback`.
 */
function nameOf(kind: unknown, fallback: string): string {
  return typeof kind === "function" && kind.name !== "" ? `a ${kind.name}` : fallback;
}

/** Set by `BlindingContext`: the private state the seams need, after a brand check. */
let internals: <E extends GroupElement, S extends GroupScalar>(
  context: BlindingContext<E, S>,
  where: string,
) => {
  readonly ready: Promise<void>;
  readonly h: E;
  readonly queued: number;
  readonly commit: (m: S, xh: E) => E;
  readonly checkScalar: (value: unknown, where: string) => S;
};

/**
 * The constants of one application and the Pedersen commitments made with them.
 * Immutable; instances come only from the static factory. `E` and `S` are the elements
 * and scalars of its group, inferred from the group given to `fromEncoded`. See
 * docs/core/blinding-context.md.
 */
export class BlindingContext<
  E extends GroupElement = RistrettoElement,
  S extends GroupScalar = RistrettoScalar,
> {
  readonly #group: Group<E, S>;
  readonly #h: E;
  // readonly #message: Uint8Array; (the context keeps no message)
  readonly #ready: Promise<void>;
  /** The queue of blindings, oldest first; it holds nothing before the first use. */
  readonly #queue: Pair<E, S>[] = [];
  /** Whether a macrotask that produces a pair is scheduled. */
  #refilling = false;

  /**
   * Copies, decodes and starts the validation, in this order. Every factory goes
   * through it, so that the copies are always its first step.
   * @throws TypeError when `group.decode` refuses `hBytes`.
   */
  private constructor(hBytes: Uint8Array, message: Uint8Array, group: Group<E, S>) {
    // 1. The copies, synchronously, before anything else. `new Uint8Array` copies even
    //    a Node.js Buffer, whose `slice` would share the caller's memory. The copy of
    //    the message is local: it goes to the validation only.
    const h = new Uint8Array(hBytes);
    const messageCopy = new Uint8Array(message);
    this.#group = group;
    // 2. Decoding the copy: a TypeError, thrown at once, when the group refuses it.
    try {
      this.#h = group.decode(h);
    } catch (cause) {
      throw new TypeError(
        "BlindingContext.fromEncoded: h is not a canonical encoding of an element of the group",
        { cause },
      );
    }
    // 3. The validation, on the private copies only.
    this.#ready = BlindingContext.#validate(this.#h, messageCopy, group);
    // An unused invalid context is no unhandled rejection. The handler is on a branch:
    // `#ready` itself still rejects, so every `await this.#ready` throws the RangeError.
    this.#ready.catch(() => undefined);
  }

  static {
    internals = (context, where) => {
      // The type of `context` is what the caller claims; the brand check is on its value.
      const value: unknown = context;
      if (typeof value !== "object" || value === null || !(#ready in value)) {
        throw new TypeError(`${where} must be a BlindingContext`);
      }
      return {
        ready: context.#ready,
        h: context.#h,
        queued: context.#queue.length,
        commit: (m, xh) => context.#commit(m, xh),
        checkScalar: (value, at) => context.#checkScalar(value, at),
      };
    };
  }

  /**
   * Whether `h` is the generator derived from `message`: `group.hashToGroup(message,
   * group.GENERATOR_DST)`, for ristretto255 `hash_to_ristretto255(message,
   * GENERATOR_DST)`. It reads only the private copies the constructor made, which no
   * caller holds.
   *
   * It is private. If it ever becomes public, it must make local copies of its
   * parameters, as the constructor does, before its first `await`.
   * @throws RangeError, as a rejection, when `h` is not the derived generator.
   */
  static async #validate<E extends GroupElement, S extends GroupScalar>(
    h: E,
    message: Uint8Array,
    group: Group<E, S>,
  ): Promise<void> {
    const dst = new TextEncoder().encode(group.GENERATOR_DST);
    const derived = await group.hashToGroup(message, dst);
    if (!derived.equals(h)) {
      throw new RangeError("BlindingContext: h is not the generator derived from message");
    }
  }

  /**
   * A context from the published encoding of `h`, the message it was derived from, and
   * its group, `RistrettoElement` when it is left out. Synchronous: the validation runs
   * in the background.
   * @throws TypeError when `h` or `message` is not a `Uint8Array`, or when
   *   `group.decode` refuses `h`: for ristretto255, anything but 32 bytes that are a
   *   canonical encoding.
   */
  static fromEncoded(h: Uint8Array, message: Uint8Array): BlindingContext;
  static fromEncoded<E extends GroupElement, S extends GroupScalar>(
    h: Uint8Array,
    message: Uint8Array,
    group: Group<E, S>,
  ): BlindingContext<E, S>;
  static fromEncoded<E extends GroupElement, S extends GroupScalar>(
    h: Uint8Array,
    message: Uint8Array,
    group?: Group<E, S>,
  ): BlindingContext<E, S> | BlindingContext {
    if (!(h instanceof Uint8Array)) {
      throw new TypeError("BlindingContext.fromEncoded: h must be a Uint8Array");
    }
    if (!(message instanceof Uint8Array)) {
      throw new TypeError("BlindingContext.fromEncoded: message must be a Uint8Array");
    }
    return group === undefined
      ? new BlindingContext(h, message, RISTRETTO255)
      : new BlindingContext(h, message, group);
  }

  /** The group of the context, given to `fromEncoded`: `RistrettoElement` by default. */
  get group(): Group<E, S> {
    return this.#group;
  }

  /**
   * The generator `h`, once validated.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   */
  async h(): Promise<E> {
    await this.#ready;
    return this.#h;
  }

  /**
   * The suite, in a new array: the ASCII bytes of `group.SUITE_NAME`, then the encoding
   * of `h`. For ristretto255, 44 bytes: `Ristretto255` and the 32 bytes of `h`.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   */
  async serialize(): Promise<Uint8Array> {
    await this.#ready;
    const name = new TextEncoder().encode(this.#group.SUITE_NAME);
    const encoded = this.#h.encode();
    const out = new Uint8Array(name.length + encoded.length);
    out.set(name);
    out.set(encoded, name.length);
    return out;
  }

  /**
   * `C = m·g + r·h`, with a fresh random `r ≠ 0`, returned and never accepted.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   * @throws TypeError, as a rejection, when `scalar` is not a scalar of the group.
   */
  async blind(scalar: S): Promise<Blinded<E, S>> {
    await this.#ready;
    const m = this.#checkScalar(scalar, "BlindingContext.blind: scalar");
    const { x: r, xh: rh } = this.#take();
    return { commitment: this.#commit(m, rh), blinding: r };
  }

  /**
   * Whether `(scalar, blinding)` opens `commitment`: `m·g + (r + s)·h − s·h = C`, with a
   * fresh random `s`, so that `h` is never multiplied by `r` itself.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   * @throws TypeError, as a rejection, when an argument is not of its class.
   */
  async isOpeningOf(scalar: S, blinding: S, commitment: E): Promise<boolean> {
    await this.#ready;
    const m = this.#checkScalar(scalar, "BlindingContext.isOpeningOf: scalar");
    const r = this.#checkScalar(blinding, "BlindingContext.isOpeningOf: blinding");
    const c = this.#checkElement(commitment, "BlindingContext.isOpeningOf: commitment");
    const { x: s, xh: sh } = this.#take();
    const rh = this.#h.multiplyScalar(r.add(s)).subtract(sh);
    return this.#commit(m, rh).equals(c);
  }

  /**
   * `m·g + xh`: the commitment to `m` with the blinding term `xh`, `g` the canonical
   * generator of the group of the context.
   */
  #commit(m: S, xh: E): E {
    return this.#group.canonicalGenerator().multiplyScalar(m).add(xh);
  }

  /**
   * `value` itself when it is a scalar of the group, else a `TypeError`. The `equals`
   * of a scalar throws a `TypeError` for an argument that is not a scalar
   * (docs/core/ristretto255.md, *Errors*); only that check is used, the result of the
   * comparison is discarded.
   */
  #checkScalar(value: unknown, where: string): S {
    const Scalar = this.#group.Scalar;
    try {
      Scalar.fromBigInt(0n).equals(value as S);
    } catch {
      throw new TypeError(`${where} must be ${nameOf(Scalar, "a scalar of the group")}`);
    }
    return value as S;
  }

  /**
   * `value` itself when it is an element of the group, else a `TypeError`, by the
   * `equals` of the neutral element, as `#checkScalar` does.
   */
  #checkElement(value: unknown, where: string): E {
    try {
      this.#group.identity().equals(value as E);
    } catch {
      throw new TypeError(`${where} must be ${nameOf(this.#group, "an element of the group")}`);
    }
    return value as E;
  }

  /**
   * The oldest pair of the queue, or a pair computed on the spot when the queue is
   * empty: it never waits for the queue. Then the refill goes on. Called only after
   * `#ready` resolved, so an invalid or unused context never fills its queue.
   */
  #take(): Pair<E, S> {
    const pair = this.#queue.shift() ?? this.#pair();
    this.#refill();
    return pair;
  }

  /** A pair `(x, x·h)` with a random `x ≠ 0`, drawn from the scalars of the group. */
  #pair(): Pair<E, S> {
    const Scalar = this.#group.Scalar;
    let x = Scalar.random();
    while (x.isZero()) x = Scalar.random();
    return { x, xh: this.#h.multiplyScalar(x) };
  }

  /** Schedules the production of one pair, unless one is scheduled or the queue is full. */
  #refill(): void {
    if (this.#refilling || this.#queue.length >= QUEUE_LENGTH) return;
    this.#refilling = true;
    setTimeout(() => {
      this.#refilling = false;
      if (this.#queue.length < QUEUE_LENGTH) {
        const x = this.#group.Scalar.random();
        // A 0 is dropped at production: it would hide nothing.
        if (!x.isZero()) this.#queue.push({ x, xh: this.#h.multiplyScalar(x) });
      }
      this.#refill();
    }, 0);
  }

  // The context keeps no message (docs/core/blinding-context.md, *The validation*).
  // Kept as a comment until the final cleanup:
  // /** The message `h` was derived from, in a new array. */
  // get message(): Uint8Array {
  //   return this.#message.slice();
  // }
}

// --- For the tests, not for the entry point ---------------------------------

/**
 * `context.blind(scalar)` with the blinding factor drawn by `draw`, called until it
 * returns a non-zero scalar. It awaits the validation and bypasses the queue. Exported
 * for the tests, not by the entry point.
 * @throws TypeError, as a rejection, when `context` is not a `BlindingContext`, or
 *   `scalar` or a draw is not a scalar of its group.
 * @throws RangeError, as a rejection, when the validation of `context` failed.
 */
export async function blindWith<E extends GroupElement, S extends GroupScalar>(
  context: BlindingContext<E, S>,
  scalar: S,
  draw: () => S,
): Promise<Blinded<E, S>> {
  const { ready, h, commit, checkScalar } = internals(context, "blindWith: context");
  await ready;
  const m = checkScalar(scalar, "blindWith: scalar");
  let r = checkScalar(draw(), "blindWith: draw()");
  while (r.isZero()) r = checkScalar(draw(), "blindWith: draw()");
  return { commitment: commit(m, h.multiplyScalar(r)), blinding: r };
}

/**
 * The number of pairs in the queue of `context`. Exported for the tests, not by the
 * entry point.
 * @throws TypeError when `context` is not a `BlindingContext`.
 */
export function queuedBlindings<E extends GroupElement, S extends GroupScalar>(
  context: BlindingContext<E, S>,
): number {
  return internals(context, "queuedBlindings: context").queued;
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: BlindingContext, its group, validation, queue and seams (#39) |
