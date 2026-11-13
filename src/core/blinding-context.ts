/**
 * The blinding context `BlindingContext` (docs/core/blinding-context.md): the constants
 * of one application, its group and the generator `h`, checked against the message it
 * was derived from, and the Pedersen commitments `C = m·g + r·h` made with them.
 *
 * - The constructor copies its inputs as its first statements and validates the copies
 *   in the background; the promise of the validation is `#ready`. Every member that
 *   yields `h`, or anything computed from `h`, awaits `#ready` first, so each one
 *   rejects with the `RangeError` of the validation when it failed.
 * - Every piece of arithmetic goes through the group held in `#group`, which the caller
 *   gives to `fromEncoded`: there is no default group, and this file imports nothing of
 *   ristretto.ts (docs/core/blinding-context.md, *The group*). The type parameter `E`,
 *   the elements of the group, has no default: it is inferred from the group given to
 *   `fromEncoded`, and exists for the type checker only.
 * - The values and the blinding factors are bounded integers (bounded-int.ts). Each group
 *   has one class of integers `0 … ORDER − 1`, `<SUITE_NAME>Scalar`, made at the first
 *   context over it and kept in a `WeakMap` (*The class of a group*). A value is checked
 *   by a read of its private integer, through the `value` getter of the generic class.
 * - Each context keeps its own queue of up to 10 pairs `(x, x·h)`, `x` random, filled one
 *   pair per macrotask once the context is used, and taken by `blind` and `isOpeningOf`.
 *
 * The functions exported below the class are for the tests, not for the entry point.
 */
import { BoundedInt as GenericBoundedInt } from "./bounded-int.js";

/** The length at which the queue of blindings stops filling. */
const QUEUE_LENGTH = 10;

/**
 * What a context needs of the elements of its group. Written with `this`, so that a class
 * whose methods take and return its own instances, such as `RistrettoElement`, satisfies
 * it. The scalars of every group are `bigint`s (docs/core/ristretto255.md, *Scalars*).
 */
interface GroupElement {
  encode(): Uint8Array;
  equals(other: this): boolean;
  add(other: this): this;
  subtract(other: this): this;
  multiplyScalar(n: bigint): this;
}

/**
 * A group for a blinding context, of elements `E`: the members of the table in
 * docs/core/blinding-context.md, *The group*. The class `RistrettoElement` is one. The
 * context trusts its group: it checks neither its members nor its arithmetic.
 */
export interface Group<E extends GroupElement> {
  /** The first bytes of `serialize()`, in ASCII. */
  readonly SUITE_NAME: string;
  /** The tag of the check of `h`. */
  readonly GENERATOR_DST: string;
  /** The order of the group, a `bigint` above 1: the class of its integers. */
  readonly ORDER: bigint;
  /** Decodes `h`; throws for bytes that are not an encoding of an element. */
  decode(bytes: Uint8Array): E;
  /** The hash to the group of the check of `h`. */
  hashToGroup(message: Uint8Array, dst: Uint8Array): Promise<E>;
  /** The generator `g` of every commitment. */
  canonicalGenerator(): E;
  /** A uniformly random scalar, which may be `0n`: the blinding factors and the masks. */
  randomScalar(): bigint;
}

/** A precomputed blinding: a random scalar `x`, `0n` included, and `x·h`. */
interface Pair<E> {
  readonly x: bigint;
  readonly xh: E;
}

/**
 * What a verifier has: a commitment, and the class of the value it commits to. A plain
 * structure (docs/core/blinding-context.md, *Committed and Blinded*).
 */
export interface Committed<E extends GroupElement> {
  readonly commitment: E;
  /** The class of the value. */
  readonly type: typeof GenericBoundedInt;
}

/**
 * What the holder of a commitment has: the commitment and its opening, a value and a
 * blinding factor of the class of the group. A plain structure, which anyone may build;
 * `blind` returns a frozen one.
 */
export interface Blinded<E extends GroupElement> {
  readonly commitment: E;
  /** The value; its class is `value.constructor`. */
  readonly value: GenericBoundedInt;
  /** The blinding factor, of the class of the group, `0 … ORDER − 1`. */
  readonly blinding: GenericBoundedInt;
}

/** What the seam `blindWith` resolves to: the commitment, and its `r` as a `bigint`. */
export interface BlindedWith<E> {
  readonly commitment: E;
  readonly blinding: bigint;
}

/** The class of the integers `0 … ORDER − 1` of each group, made once per group object. */
const classes = new WeakMap<object, typeof GenericBoundedInt>();

/**
 * The class of the integers `0 … ORDER − 1` of `group`, `<SUITE_NAME>Scalar`: from the
 * cache, or made on the generic class and checked (docs/core/blinding-context.md, *The
 * class of a group*).
 * @throws TypeError when `group` is missing, or its `ORDER` is not a `bigint` above 1.
 * @throws RangeError when the class made is not scale 0, `low` `0n`, `high` `ORDER − 1n`.
 */
function classOf(group: Group<GroupElement>, where: string): typeof GenericBoundedInt {
  const value: unknown = group;
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new TypeError(`${where}: group is required`);
  }
  const order: unknown = group.ORDER;
  if (typeof order !== "bigint" || order <= 1n) {
    throw new TypeError(`${where}: group.ORDER must be a bigint above 1`);
  }
  const known = classes.get(group);
  if (known !== undefined) return known;
  const made = GenericBoundedInt.define({
    name: `${group.SUITE_NAME}Scalar`,
    min: -0.5,
    max: [10n * order - 5n, -1],
  });
  if (made.scale !== 0 || made.low !== 0n || made.high !== order - 1n) {
    throw new RangeError(
      `${where}: the class of the group ${group.SUITE_NAME} is not the integers 0 … ORDER − 1`,
    );
  }
  classes.set(group, made);
  return made;
}

/**
 * The getter `value` of the generic class: it reads the private integer of an instance,
 * whatever a subclass overrides, and throws for anything else.
 */
const readValue = ((): ((this: unknown) => bigint) => {
  // It is called with `call`, on the value to check: unbound on purpose.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const get: unknown = Object.getOwnPropertyDescriptor(GenericBoundedInt.prototype, "value")?.get;
  if (typeof get !== "function") throw new Error("bounded-int.ts: BoundedInt has no getter value");
  return get as (this: unknown) => bigint;
})();

/**
 * The integer of `x` when it is a bounded integer, else a `TypeError`. The brand check is
 * the read of the private field, which throws for anything else, a `bigint` included.
 */
function boundedValue(x: unknown, where: string): bigint {
  try {
    return readValue.call(x);
  } catch (cause) {
    throw new TypeError(`${where} must be a bounded integer`, { cause });
  }
}

/** The class of the bounded integer `x`, `x.constructor`, checked to be one. */
function classOfValue(x: GenericBoundedInt, where: string): typeof GenericBoundedInt {
  const C: unknown = x.constructor;
  if (
    typeof C !== "function" ||
    (C !== GenericBoundedInt && !(C.prototype instanceof GenericBoundedInt))
  ) {
    throw new TypeError(`${where} must be a bounded integer of a class of bounded integers`);
  }
  return C as typeof GenericBoundedInt;
}

/**
 * `value` itself when it is a `bigint`, else a `TypeError`. A check, not a cast: a
 * `number` and a `BoundedInt` are refused (docs/core/blinding-context.md, *Values and
 * errors*).
 */
function checkScalar(value: unknown, where: string): bigint {
  if (typeof value !== "bigint") {
    throw new TypeError(`${where} must be a bigint`);
  }
  return value;
}

/** Set by `BlindingContext`: the private state the seams need, after a brand check. */
let internals: <E extends GroupElement>(
  context: BlindingContext<E>,
  where: string,
) => {
  readonly ready: Promise<void>;
  readonly h: E;
  readonly queued: number;
  readonly scalar: typeof GenericBoundedInt;
  readonly commit: (m: bigint, xh: E) => E;
  readonly checkScalar: (value: unknown, where: string) => bigint;
  readonly checkValue: (x: unknown, where: string) => bigint;
};

/**
 * The constants of one application and the Pedersen commitments made with them.
 * Immutable; instances come only from the static factory. `E` is the type of the
 * elements of its group, inferred from the group given to `fromEncoded`; the values and
 * the blinding factors are bounded integers. See docs/core/blinding-context.md.
 */
export class BlindingContext<E extends GroupElement> {
  readonly #group: Group<E>;
  /** The class of the integers of the group, shared by its contexts. */
  readonly #scalar: typeof GenericBoundedInt;
  readonly #h: E;
  // readonly #message: Uint8Array; (the context keeps no message)
  readonly #ready: Promise<void>;
  /** The queue of blindings, oldest first; it holds nothing before the first use. */
  readonly #queue: Pair<E>[] = [];
  /** Whether a macrotask that produces a pair is scheduled. */
  #refilling = false;

  /**
   * Copies, finds the class of the group, decodes and starts the validation, in this
   * order. Every factory goes through it, so that the copies are always its first step.
   * @throws TypeError when the group is missing or has no valid `ORDER`, or when
   *   `group.decode` refuses `hBytes`.
   */
  private constructor(hBytes: Uint8Array, message: Uint8Array, group: Group<E>) {
    // 1. The copies, synchronously, before anything else. `new Uint8Array` copies even
    //    a Node.js Buffer, whose `slice` would share the caller's memory. The copy of
    //    the message is local: it goes to the validation only.
    const h = new Uint8Array(hBytes);
    const messageCopy = new Uint8Array(message);
    // 2. The class of the group: a TypeError, thrown at once, for a missing group or a
    //    bad ORDER.
    this.#scalar = classOf(group, "BlindingContext.fromEncoded");
    this.#group = group;
    // 3. Decoding the copy: a TypeError, thrown at once, when the group refuses it.
    try {
      this.#h = group.decode(h);
    } catch (cause) {
      throw new TypeError(
        "BlindingContext.fromEncoded: h is not a canonical encoding of an element of the group",
        { cause },
      );
    }
    // 4. The validation, on the private copies only.
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
        scalar: context.#scalar,
        commit: (m, xh) => context.#commit(m, xh),
        checkScalar,
        checkValue: (x, where) => context.#checkValue(x, where),
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
  static async #validate<E extends GroupElement>(
    h: E,
    message: Uint8Array,
    group: Group<E>,
  ): Promise<void> {
    const dst = new TextEncoder().encode(group.GENERATOR_DST);
    const derived = await group.hashToGroup(message, dst);
    if (!derived.equals(h)) {
      throw new RangeError("BlindingContext: h is not the generator derived from message");
    }
  }

  /**
   * A context from the published encoding of `h`, the message it was derived from, and
   * its group, which is required: there is no default group. Synchronous: the
   * validation runs in the background.
   * @throws TypeError when `h` or `message` is not a `Uint8Array`, when `group` is
   *   missing, when `group.ORDER` is not a `bigint` above 1, or when `group.decode`
   *   refuses `h`: for ristretto255, anything but 32 bytes that are a canonical encoding.
   */
  static fromEncoded<E extends GroupElement>(
    h: Uint8Array,
    message: Uint8Array,
    group: Group<E>,
  ): BlindingContext<E> {
    if (!(h instanceof Uint8Array)) {
      throw new TypeError("BlindingContext.fromEncoded: h must be a Uint8Array");
    }
    if (!(message instanceof Uint8Array)) {
      throw new TypeError("BlindingContext.fromEncoded: message must be a Uint8Array");
    }
    return new BlindingContext(h, message, group);
  }

  /** The group of the context, given to `fromEncoded`. */
  get group(): Group<E> {
    return this.#group;
  }

  /**
   * The class of the integers `0 … ORDER − 1` of the group, `<SUITE_NAME>Scalar`: the
   * class of the blinding factors, and the base of the classes of the values. The same
   * object for every context over the same group. It does not await the validation.
   */
  boundedInt(): typeof GenericBoundedInt {
    return this.#scalar;
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
   * The opening of a new commitment to `x`, frozen: `C = m·g + r·h`, `m` the integer of
   * `x`, with a fresh random `r` of the class of the group, `0` included, returned and
   * never accepted.
   * @throws RangeError, as a rejection, when `h` is not derived from the message, or when
   *   the class of `x` holds more integers than the group has scalars.
   * @throws TypeError, as a rejection, when `x` is not a bounded integer.
   */
  async blind(x: GenericBoundedInt): Promise<Blinded<E>> {
    await this.#ready;
    const m = this.#checkValue(x, "BlindingContext.blind: x");
    const { x: r, xh: rh } = this.#take();
    return Object.freeze({
      commitment: this.#commit(m, rh),
      value: x,
      blinding: this.#scalar.fromValue(r),
    });
  }

  /**
   * Whether `opening` opens its commitment: `m·g + (r + s)·h − s·h = C`, with a fresh
   * random `s`, so that `h` is never multiplied by `r` itself. `r + s` is a sum of
   * `bigint`s, which the multiplication reduces mod `ORDER`.
   * @throws RangeError, as a rejection, when `h` is not derived from the message, or when
   *   the class of `opening.value` holds more integers than the group has scalars.
   * @throws TypeError, as a rejection, when `opening` is not an object, `opening.value`
   *   is not a bounded integer, `opening.blinding` is not one of exactly the class of the
   *   group, or the `equals` of the group's elements refuses `opening.commitment`.
   */
  async isOpeningOf(opening: Blinded<E>): Promise<boolean> {
    await this.#ready;
    const where = "BlindingContext.isOpeningOf";
    const value: unknown = opening;
    if (typeof value !== "object" || value === null) {
      throw new TypeError(`${where}: opening must be an object`);
    }
    boundedValue(opening.value, `${where}: opening.value`);
    const r = boundedValue(opening.blinding, `${where}: opening.blinding`);
    if (opening.blinding.constructor !== this.#scalar) {
      throw new TypeError(`${where}: opening.blinding must be a ${this.#scalar.name}`);
    }
    const m = this.#checkValue(opening.value, `${where}: opening.value`);
    const { x: s, xh: sh } = this.#take();
    const rh = this.#h.multiplyScalar(r + s).subtract(sh);
    return this.#commit(m, rh).equals(opening.commitment);
  }

  /**
   * The integer of the value `x`, after the checks of `blind`: a bounded integer
   * (`TypeError`), whose class holds at most `ORDER` integers (`RangeError`, whose message
   * prints no number).
   */
  #checkValue(x: unknown, where: string): bigint {
    const m = boundedValue(x, where);
    const C = classOfValue(x as GenericBoundedInt, where);
    if (C.high - C.low + 1n > this.#group.ORDER) {
      const prefix = where.slice(0, where.indexOf(":"));
      throw new RangeError(
        `${prefix}: ${C.name} holds more values than the group ${this.#group.SUITE_NAME} has scalars`,
      );
    }
    return m;
  }

  /**
   * `m·g + xh`: the commitment to `m` with the blinding term `xh`, `g` the canonical
   * generator of the group of the context.
   */
  #commit(m: bigint, xh: E): E {
    return this.#group.canonicalGenerator().multiplyScalar(m).add(xh);
  }

  /**
   * The oldest pair of the queue, or a pair computed on the spot when the queue is
   * empty: it never waits for the queue. Then the refill goes on. Called only after
   * `#ready` resolved, so an invalid or unused context never fills its queue.
   */
  #take(): Pair<E> {
    const pair = this.#queue.shift() ?? this.#pair();
    this.#refill();
    return pair;
  }

  /** A pair `(x, x·h)` with a random `x`, drawn once by the `randomScalar()` of the group. */
  #pair(): Pair<E> {
    const x = this.#group.randomScalar();
    return { x, xh: this.#h.multiplyScalar(x) };
  }

  /** Schedules the production of one pair, unless one is scheduled or the queue is full. */
  #refill(): void {
    if (this.#refilling || this.#queue.length >= QUEUE_LENGTH) return;
    this.#refilling = true;
    setTimeout(() => {
      this.#refilling = false;
      if (this.#queue.length < QUEUE_LENGTH) {
        const x = this.#group.randomScalar();
        this.#queue.push({ x, xh: this.#h.multiplyScalar(x) });
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
 * The commitment `m·g + r·h` to the `bigint` `scalar`, with the blinding factor drawn by
 * `draw`, called once, both as `bigint`s. It awaits the
 * validation and bypasses the queue. Exported for the tests, not by the entry point.
 * @throws TypeError, as a rejection, when `context` is not a `BlindingContext`, or
 *   `scalar` or a draw is not a `bigint`.
 * @throws RangeError, as a rejection, when the validation of `context` failed.
 */
export async function blindWith<E extends GroupElement>(
  context: BlindingContext<E>,
  scalar: bigint,
  draw: () => bigint,
): Promise<BlindedWith<E>> {
  const { ready, h, commit, checkScalar } = internals(context, "blindWith: context");
  await ready;
  const m = checkScalar(scalar, "blindWith: scalar");
  const r = checkScalar(draw(), "blindWith: draw()");
  return { commitment: commit(m, h.multiplyScalar(r)), blinding: r };
}

/**
 * `context.blind(x)` with the blinding factor drawn by `draw`, called once, then made a
 * value of the class of the group. It awaits the validation
 * and bypasses the queue. Exported for the tests, not by the entry point.
 * @throws TypeError, as a rejection, when `context` is not a `BlindingContext`, `x` is
 *   not a bounded integer, or a draw is not a `bigint`.
 * @throws RangeError, as a rejection, when the validation of `context` failed, the class
 *   of `x` holds more integers than the group has scalars, or a draw is not an integer
 *   of the class of the group.
 */
export async function blindValueWith<E extends GroupElement>(
  context: BlindingContext<E>,
  x: GenericBoundedInt,
  draw: () => bigint,
): Promise<Blinded<E>> {
  const { ready, h, scalar, commit, checkScalar, checkValue } = internals(
    context,
    "blindValueWith: context",
  );
  await ready;
  const m = checkValue(x, "blindValueWith: x");
  const r = checkScalar(draw(), "blindValueWith: draw()");
  return Object.freeze({
    commitment: commit(m, h.multiplyScalar(r)),
    value: x,
    blinding: scalar.fromValue(r),
  });
}

/**
 * The number of pairs in the queue of `context`. Exported for the tests, not by the
 * entry point.
 * @throws TypeError when `context` is not a `BlindingContext`.
 */
export function queuedBlindings<E extends GroupElement>(context: BlindingContext<E>): number {
  return internals(context, "queuedBlindings: context").queued;
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #40    | new: BlindingContext, its group, validation, queue and seams; bigint scalars (#39) |
// | #55    | ORDER; the group is required; boundedInt(); blind and isOpeningOf of bounded integers; Committed, Blinded; blindValueWith (#48) |
// | #60    | a draw of 0n is kept: #pair, #refill, blindWith and blindValueWith draw once (#56) |
