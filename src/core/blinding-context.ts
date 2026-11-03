/**
 * The blinding context `BlindingContext` (docs/core/blinding-context.md): the constants
 * of one application, the group ristretto255 and the generator `h` with the message it
 * was derived from, and the Pedersen commitments `C = m·g + r·h` made with them.
 *
 * - The constructor copies its inputs as its first statements and validates the copies
 *   in the background; the promise of the validation is `#ready`. Every member that
 *   yields `h`, or anything computed from `h`, awaits `#ready` first, so each one
 *   rejects with the `RangeError` of the validation when it failed.
 * - Each context keeps its own queue of up to 10 pairs `(x, x·h)`, `x ≠ 0`, filled one
 *   pair per macrotask once the context is used, and taken by `blind` and `isOpeningOf`.
 *
 * The functions exported below the class are for the tests, not for the entry point.
 */
import { RistrettoElement, RistrettoScalar } from "./ristretto.js";

/** The name of the suite: the first 12 bytes of the serialization. */
const SUITE_NAME = new TextEncoder().encode("Ristretto255");
const GENERATOR_DST_BYTES = new TextEncoder().encode(RistrettoElement.GENERATOR_DST);
/** The length at which the queue of blindings stops filling. */
const QUEUE_LENGTH = 10;

/** A precomputed blinding: a random scalar `x ≠ 0` and `x·h`. */
interface Pair {
  readonly x: RistrettoScalar;
  readonly xh: RistrettoElement;
}

/** A commitment and its blinding factor, as `blind` resolves them. */
export interface Blinded {
  readonly commitment: RistrettoElement;
  readonly blinding: RistrettoScalar;
}

/** Throws a `TypeError` unless `value` is a `RistrettoScalar`, by the brand check of #35. */
function checkScalar(value: unknown, where: string): RistrettoScalar {
  try {
    RistrettoScalar.fromBigInt(0n).equals(value as RistrettoScalar);
  } catch {
    throw new TypeError(`${where} must be a RistrettoScalar`);
  }
  return value as RistrettoScalar;
}

/** Throws a `TypeError` unless `value` is a `RistrettoElement`, by the brand check of #35. */
function checkElement(value: unknown, where: string): RistrettoElement {
  try {
    RistrettoElement.identity().equals(value as RistrettoElement);
  } catch {
    throw new TypeError(`${where} must be a RistrettoElement`);
  }
  return value as RistrettoElement;
}

/** `m·g + xh`: the commitment to `m` with the blinding term `xh`. */
function commit(m: RistrettoScalar, xh: RistrettoElement): RistrettoElement {
  return RistrettoElement.canonicalGenerator().multiplyScalar(m).add(xh);
}

/** Set by `BlindingContext`: the private state the seams need, after a brand check. */
let internals: (
  context: unknown,
  where: string,
) => { readonly ready: Promise<void>; readonly h: RistrettoElement; readonly queued: number };

/**
 * The constants of one application and the Pedersen commitments made with them.
 * Immutable; instances come only from the static factory. See
 * docs/core/blinding-context.md.
 */
export class BlindingContext {
  readonly #h: RistrettoElement;
  readonly #message: Uint8Array;
  readonly #ready: Promise<void>;
  /** The queue of blindings, oldest first; it holds nothing before the first use. */
  readonly #queue: Pair[] = [];
  /** Whether a macrotask that produces a pair is scheduled. */
  #refilling = false;

  /**
   * Copies, decodes and starts the validation, in this order. Every factory goes
   * through it, so that the copies are always its first step.
   * @throws TypeError when `hBytes` is not a canonical encoding.
   */
  private constructor(hBytes: Uint8Array, message: Uint8Array) {
    // 1. The copies, synchronously, before anything else. `new Uint8Array` copies even
    //    a Node.js Buffer, whose `slice` would share the caller's memory.
    const h = new Uint8Array(hBytes);
    this.#message = new Uint8Array(message);
    // 2. Decoding the copy: a TypeError, thrown at once, for a non-canonical encoding.
    try {
      this.#h = RistrettoElement.decode(h);
    } catch {
      throw new TypeError("BlindingContext.fromEncoded: h is not a canonical encoding");
    }
    // 3. The validation, on the private copies only.
    this.#ready = BlindingContext.#validate(this.#h, this.#message);
    // An unused invalid context is no unhandled rejection. The handler is on a branch:
    // `#ready` itself still rejects, so every `await this.#ready` throws the RangeError.
    this.#ready.catch(() => undefined);
  }

  static {
    internals = (context, where) => {
      if (typeof context !== "object" || context === null || !(#ready in context)) {
        throw new TypeError(`${where} must be a BlindingContext`);
      }
      return { ready: context.#ready, h: context.#h, queued: context.#queue.length };
    };
  }

  /**
   * Whether `h` is the generator derived from `message`: `hash_to_ristretto255(message,
   * GENERATOR_DST)`. It reads only the private copies the constructor made, which no
   * caller holds.
   *
   * It is private. If it ever becomes public, it must make local copies of its
   * parameters, as the constructor does, before its first `await`.
   * @throws RangeError, as a rejection, when `h` is not the derived generator.
   */
  static async #validate(h: RistrettoElement, message: Uint8Array): Promise<void> {
    const derived = await RistrettoElement.hashToGroup(message, GENERATOR_DST_BYTES);
    if (!derived.equals(h)) {
      throw new RangeError("BlindingContext: h is not the generator derived from message");
    }
  }

  /**
   * A context from the published encoding of `h` and the message it was derived from.
   * Synchronous: the validation runs in the background.
   * @throws TypeError when `h` is not a `Uint8Array` of 32 bytes that is a canonical
   *   encoding, or `message` is not a `Uint8Array`.
   */
  static fromEncoded(h: Uint8Array, message: Uint8Array): BlindingContext {
    if (!(h instanceof Uint8Array) || h.length !== 32) {
      throw new TypeError("BlindingContext.fromEncoded: h must be a Uint8Array of 32 bytes");
    }
    if (!(message instanceof Uint8Array)) {
      throw new TypeError("BlindingContext.fromEncoded: message must be a Uint8Array");
    }
    return new BlindingContext(h, message);
  }

  /** The group of the context: the class `RistrettoElement`. */
  get group(): typeof RistrettoElement {
    return RistrettoElement;
  }

  /** The message `h` was derived from, in a new array. */
  get message(): Uint8Array {
    return this.#message.slice();
  }

  /**
   * The generator `h`, once validated.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   */
  async h(): Promise<RistrettoElement> {
    await this.#ready;
    return this.#h;
  }

  /**
   * The 44 bytes of the suite, in a new array: the ASCII bytes `Ristretto255`, then the
   * canonical encoding of `h`.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   */
  async serialize(): Promise<Uint8Array> {
    await this.#ready;
    const out = new Uint8Array(SUITE_NAME.length + 32);
    out.set(SUITE_NAME);
    out.set(this.#h.encode(), SUITE_NAME.length);
    return out;
  }

  /**
   * `C = m·g + r·h`, with a fresh random `r ≠ 0`, returned and never accepted.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   * @throws TypeError, as a rejection, when `scalar` is not a `RistrettoScalar`.
   */
  async blind(scalar: RistrettoScalar): Promise<Blinded> {
    await this.#ready;
    const m = checkScalar(scalar, "BlindingContext.blind: scalar");
    const { x: r, xh: rh } = this.#take();
    return { commitment: commit(m, rh), blinding: r };
  }

  /**
   * Whether `(scalar, blinding)` opens `commitment`: `m·g + (r + s)·h − s·h = C`, with a
   * fresh random `s`, so that `h` is never multiplied by `r` itself.
   * @throws RangeError, as a rejection, when `h` is not derived from the message.
   * @throws TypeError, as a rejection, when an argument is not of its class.
   */
  async isOpeningOf(
    scalar: RistrettoScalar,
    blinding: RistrettoScalar,
    commitment: RistrettoElement,
  ): Promise<boolean> {
    await this.#ready;
    const m = checkScalar(scalar, "BlindingContext.isOpeningOf: scalar");
    const r = checkScalar(blinding, "BlindingContext.isOpeningOf: blinding");
    const c = checkElement(commitment, "BlindingContext.isOpeningOf: commitment");
    const { x: s, xh: sh } = this.#take();
    const rh = this.#h.multiplyScalar(r.add(s)).subtract(sh);
    return commit(m, rh).equals(c);
  }

  /**
   * The oldest pair of the queue, or a pair computed on the spot when the queue is
   * empty: it never waits for the queue. Then the refill goes on. Called only after
   * `#ready` resolved, so an invalid or unused context never fills its queue.
   */
  #take(): Pair {
    const pair = this.#queue.shift() ?? BlindingContext.#pair(this.#h);
    this.#refill();
    return pair;
  }

  /** A pair `(x, x·h)` with a random `x ≠ 0`. */
  static #pair(h: RistrettoElement): Pair {
    let x = RistrettoScalar.random();
    while (x.isZero()) x = RistrettoScalar.random();
    return { x, xh: h.multiplyScalar(x) };
  }

  /** Schedules the production of one pair, unless one is scheduled or the queue is full. */
  #refill(): void {
    if (this.#refilling || this.#queue.length >= QUEUE_LENGTH) return;
    this.#refilling = true;
    setTimeout(() => {
      this.#refilling = false;
      if (this.#queue.length < QUEUE_LENGTH) {
        const x = RistrettoScalar.random();
        // A 0 is dropped at production: it would hide nothing.
        if (!x.isZero()) this.#queue.push({ x, xh: this.#h.multiplyScalar(x) });
      }
      this.#refill();
    }, 0);
  }
}

// --- For the tests, not for the entry point ---------------------------------

/**
 * `context.blind(scalar)` with the blinding factor drawn by `draw`, called until it
 * returns a non-zero scalar. It awaits the validation and bypasses the queue. Exported
 * for the tests, not by the entry point.
 * @throws TypeError, as a rejection, when `context` is not a `BlindingContext`, or
 *   `scalar` or a draw is not a `RistrettoScalar`.
 * @throws RangeError, as a rejection, when the validation of `context` failed.
 */
export async function blindWith(
  context: BlindingContext,
  scalar: RistrettoScalar,
  draw: () => RistrettoScalar,
): Promise<Blinded> {
  const { ready, h } = internals(context, "blindWith: context");
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
export function queuedBlindings(context: BlindingContext): number {
  return internals(context, "queuedBlindings: context").queued;
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: BlindingContext, its validation, queue and seams (#39)    |
