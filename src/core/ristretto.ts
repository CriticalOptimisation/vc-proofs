/**
 * The group ristretto255 (RFC 9496) as two classes, `RistrettoElement` and
 * `RistrettoScalar` (docs/core/ristretto255.md), and the derivation of a Pedersen
 * generator, such as `h`, with nothing up anyone's sleeve (docs/generator-h.md).
 *
 * - The point arithmetic, the encoding and the decoding come from `@noble/curves`. Its
 *   types never leave this file: each class holds its value in a `#private` field.
 * - Every operation on field elements and scalars is a method of noble's `Fp` or `Fn`,
 *   never an operation of our own on `bigint`; the selections of RFC 9496 use
 *   `Fp.cmov` (docs/core/ristretto255.md, *Constant time*).
 * - `expand_message_xmd` runs on WebCrypto (`crypto.subtle.digest("SHA-512")`), so
 *   `hashToGroup` and `deriveGenerator` are asynchronous. `MAP` (RFC 9496, Section
 *   4.3.4) is written here, since noble does not export it.
 *
 * The functions exported below the classes are for the tests, not for the entry point.
 */
import { ed25519, ristretto255 } from "@noble/curves/ed25519.js";
import { bytesToNumberLE, equalBytes } from "@noble/curves/utils.js";

type Point = InstanceType<typeof ristretto255.Point>;

/** The field of edwards25519, `p = 2^255 − 19`, and the scalars mod `ℓ`, from noble. */
const Fp = ristretto255.Point.Fp;
const Fn = ristretto255.Point.Fn;

// --- The constants of RFC 9496, Section 4.1, as field elements ---------------

const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
const SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;
const SQRT_AD_MINUS_ONE =
  25063068953384623474111414158702152701244531502492656460079210482610430750235n;
const ONE_MINUS_D_SQ =
  1159843021668779879193775521855586647937357759715417654439879720876111806838n;
const D_MINUS_ONE_SQ =
  40440834346308536858101042469323190826248399146238708352240133220865137265952n;
/** `(p − 5) / 8`, the exponent of `SQRT_RATIO_M1`. */
const P_MINUS_5_DIV_8 =
  7237005577332262213973186563042994240829374041602535252466099000494570602493n;
/** `ℓ − 2`, the exponent of the inverse of a scalar (Fermat). */
const L_MINUS_2 = 7237005577332262213973186563042994240857116359379907606001950938285454250987n;
/** `2^251` and `−2^251`: `fromBigInt` accepts `|n| < 2^251`. */
const FROM_BIGINT_BOUND =
  3618502788666131106986593281521497120414687020801267626233049500247285301248n;
const FROM_BIGINT_NEGATIVE_BOUND =
  -3618502788666131106986593281521497120414687020801267626233049500247285301248n;

/** `CT_ABS` of RFC 9496, Section 4.1: `−e` when `IS_NEGATIVE(e)`, else `e`. */
const ctAbs = (e: bigint): bigint => Fp.cmov(e, Fp.neg(e), Fp.isOdd?.(e) ?? isOdd(e));

/** `IS_NEGATIVE` through noble's encoding, for a field that would lack `isOdd`. */
function isOdd(e: bigint): boolean {
  return ((Fp.toBytes(e)[0] ?? 0) & 1) === 1;
}

/** `SQRT_RATIO_M1(u, v)` of RFC 9496, Section 4.2. */
function sqrtRatioM1(u: bigint, v: bigint): { wasSquare: boolean; root: bigint } {
  const v3 = Fp.mul(Fp.sqr(v), v);
  const v7 = Fp.mul(Fp.sqr(v3), v);
  const r = Fp.mul(Fp.mul(u, v3), Fp.pow(Fp.mul(u, v7), P_MINUS_5_DIV_8));
  const check = Fp.mul(v, Fp.sqr(r));
  const correctSignSqrt = Fp.eql(check, u);
  const flippedSignSqrt = Fp.eql(check, Fp.neg(u));
  const flippedSignSqrtI = Fp.eql(check, Fp.neg(Fp.mul(u, SQRT_M1)));
  const rPrime = Fp.mul(SQRT_M1, r);
  const root = Fp.cmov(r, rPrime, flippedSignSqrt || flippedSignSqrtI);
  return { wasSquare: correctSignSqrt || flippedSignSqrt, root: ctAbs(root) };
}

/** `MAP` of RFC 9496, Section 4.3.4, on 32 bytes: an element of ristretto255. */
function map(bytes: Uint8Array): Point {
  const masked = bytes.slice();
  masked[31] = (masked[31] ?? 0) & 0x7f;
  const t = Fp.create(bytesToNumberLE(masked));
  const one = Fp.ONE;
  const r = Fp.mul(SQRT_M1, Fp.sqr(t));
  const u = Fp.mul(Fp.add(r, one), ONE_MINUS_D_SQ);
  const v = Fp.mul(Fp.sub(Fp.neg(one), Fp.mul(r, D)), Fp.add(r, D));
  const { wasSquare, root } = sqrtRatioM1(u, v);
  const sPrime = Fp.neg(ctAbs(Fp.mul(root, t)));
  const s = Fp.cmov(sPrime, root, wasSquare);
  const c = Fp.cmov(r, Fp.neg(one), wasSquare);
  const n = Fp.sub(Fp.mul(Fp.mul(c, Fp.sub(r, one)), D_MINUS_ONE_SQ), v);
  const w0 = Fp.mul(Fp.add(s, s), v);
  const w1 = Fp.mul(n, SQRT_AD_MINUS_ONE);
  const w2 = Fp.sub(one, Fp.sqr(s));
  const w3 = Fp.add(one, Fp.sqr(s));
  const edwards = new ed25519.Point(Fp.mul(w0, w3), Fp.mul(w2, w1), Fp.mul(w1, w3), Fp.mul(w0, w2));
  return new ristretto255.Point(edwards);
}

/** The element derivation of RFC 9496, Section 4.3.4, on exactly 64 bytes. */
function derive(uniform: Uint8Array): { p0: Point; p1: Point; sum: Point } {
  const p0 = map(uniform.subarray(0, 32));
  const p1 = map(uniform.subarray(32, 64));
  return { p0, p1, sum: p0.add(p1) };
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/** Throws a `TypeError` unless `value` is a `Uint8Array` of `length` bytes. */
function checkBytes(value: unknown, length: number, where: string): asserts value is Uint8Array {
  if (!isBytes(value) || value.length !== length) {
    throw new TypeError(`${where} must be a Uint8Array of ${String(length)} bytes`);
  }
}

/** Set by `RistrettoScalar`: the value of an instance, after its brand check. */
let scalarValue: (scalar: unknown, where: string) => bigint;

/**
 * An element of the group ristretto255 (RFC 9496). Immutable; instances come only from
 * the static factories. See docs/core/ristretto255.md.
 */
export class RistrettoElement {
  /**
   * The domain separation tag of every generator that vc-proofs derives: 60 ASCII
   * bytes, in the form of RFC 9380, Section 8.10. They name the library, its version
   * (`V01`), its ciphersuite counter (`CS01`), and the identifier that RFC 9380,
   * Appendix B, gives to `hash_to_ristretto255` with `expand_message_xmd` over SHA-512.
   */
  static readonly GENERATOR_DST = "vc-proofs-V01-CS01-with-ristretto255_XMD:SHA-512_R255MAP_RO_";

  readonly #point: Point;

  private constructor(point: Point) {
    this.#point = point;
  }

  /** The brand check: `value` itself when it is an element, else a `TypeError`. */
  static #check(value: unknown, where: string): RistrettoElement {
    if (typeof value !== "object" || value === null || !(#point in value)) {
      throw new TypeError(`${where} must be a RistrettoElement`);
    }
    return value;
  }

  /**
   * Decodes a canonical encoding (RFC 9496, Section 4.3.1). Accepts the identity, the
   * 32 zero bytes.
   * @throws TypeError when `bytes` is not 32 bytes, or not a canonical encoding.
   */
  static decode(bytes: Uint8Array): RistrettoElement {
    checkBytes(bytes, 32, "RistrettoElement.decode: bytes");
    let point: Point;
    try {
      point = ristretto255.Point.fromBytes(bytes.slice());
    } catch {
      throw new TypeError("RistrettoElement.decode: bytes are not a canonical encoding");
    }
    return new RistrettoElement(point);
  }

  /** The canonical generator `g`. */
  static canonicalGenerator(): RistrettoElement {
    return new RistrettoElement(ristretto255.Point.BASE);
  }

  /** The neutral element, encoded as 32 zero bytes. */
  static identity(): RistrettoElement {
    return new RistrettoElement(ristretto255.Point.ZERO);
  }

  /**
   * The element derivation of RFC 9496, Section 4.3.4: `MAP` of each 32-byte half, and
   * their sum. The input must be uniformly random, such as the output of a hash.
   * @throws TypeError when `bytes` is not 64 bytes.
   */
  static fromUniformBytes(bytes: Uint8Array): RistrettoElement {
    checkBytes(bytes, 64, "RistrettoElement.fromUniformBytes: bytes");
    return new RistrettoElement(derive(bytes.slice()).sum);
  }

  /**
   * `hash_to_ristretto255(message, dst)` of RFC 9380, Appendix B, with
   * `expand_message_xmd` over WebCrypto's SHA-512. Both arrays are read at the call.
   * @throws TypeError, as a rejection, when `message` or `dst` is not a `Uint8Array`.
   * @throws RangeError, as a rejection, for an empty `dst` (RFC 9380, Section 3.1), and
   *   for a `dst` over 255 bytes, whose reduction (Section 5.3.3) is not implemented.
   */
  static async hashToGroup(message: Uint8Array, dst: Uint8Array): Promise<RistrettoElement> {
    if (!isBytes(message) || !isBytes(dst)) {
      throw new TypeError("RistrettoElement.hashToGroup: message and dst must be Uint8Arrays");
    }
    if (dst.length === 0) {
      throw new RangeError("RistrettoElement.hashToGroup: dst must not be empty (RFC 9380, 3.1)");
    }
    if (dst.length > 255) {
      throw new RangeError(
        "RistrettoElement.hashToGroup: a dst over 255 bytes needs the reduction of RFC 9380, Section 5.3.3, which is not yet implemented",
      );
    }
    const uniform = await expandMessageXmd(message.slice(), dst.slice(), 64);
    return new RistrettoElement(derive(uniform).sum);
  }

  /**
   * Derives a generator with nothing up anyone's sleeve: `hashToGroup(message,
   * GENERATOR_DST)`, refused when it is `x·g` with `|x| ≤ 2^SMALL_EXPONENT_BITS`
   * (docs/generator-h.md).
   * @throws TypeError, as a rejection, when `message` is not a `Uint8Array`.
   * @throws RangeError, as a rejection, when the derived element is refused. There is
   *   no retry: the application chooses another message.
   */
  static deriveGenerator(message: Uint8Array): Promise<RistrettoElement> {
    return deriveGeneratorWith(message, (uniform) => RistrettoElement.fromUniformBytes(uniform));
  }

  /** The canonical encoding (RFC 9496, Section 4.3.2), in a new 32-byte array. */
  encode(): Uint8Array {
    return this.#point.toBytes().slice();
  }

  /** Whether both are the same element (RFC 9496, Section 4.3.3). */
  equals(other: RistrettoElement): boolean {
    return this.#point.equals(RistrettoElement.#check(other, "equals: other").#point);
  }

  /** Whether this is the neutral element. */
  isIdentity(): boolean {
    return this.#point.equals(ristretto255.Point.ZERO);
  }

  /** `this + other`. */
  add(other: RistrettoElement): RistrettoElement {
    const that = RistrettoElement.#check(other, "add: other");
    return new RistrettoElement(this.#point.add(that.#point));
  }

  /** `this − other`. */
  subtract(other: RistrettoElement): RistrettoElement {
    const that = RistrettoElement.#check(other, "subtract: other");
    return new RistrettoElement(this.#point.subtract(that.#point));
  }

  /** `−this`. */
  negate(): RistrettoElement {
    return new RistrettoElement(this.#point.negate());
  }

  /**
   * `scalar·this`, by noble's fixed-window multiplication. Noble refuses the scalar 0,
   * so a zero scalar returns the identity before the call.
   * @throws TypeError when `scalar` is not a `RistrettoScalar`.
   */
  multiplyScalar(scalar: RistrettoScalar): RistrettoElement {
    const value = scalarValue(scalar, "multiplyScalar: scalar");
    if (Fn.is0(value)) return RistrettoElement.identity();
    return new RistrettoElement(this.#point.multiply(value));
  }
}

/**
 * An integer modulo `ℓ`, the order of ristretto255. Immutable; instances come only from
 * the static factories. See docs/core/ristretto255.md.
 */
export class RistrettoScalar {
  readonly #value: bigint;

  private constructor(value: bigint) {
    this.#value = value;
  }

  static {
    scalarValue = (scalar, where) => RistrettoScalar.#check(scalar, where).#value;
  }

  /** The brand check: `value` itself when it is a scalar, else a `TypeError`. */
  static #check(value: unknown, where: string): RistrettoScalar {
    if (typeof value !== "object" || value === null || !(#value in value)) {
      throw new TypeError(`${where} must be a RistrettoScalar`);
    }
    return value;
  }

  /**
   * Decodes 32 little-endian bytes of an integer below `ℓ`.
   * @throws TypeError when `bytes` is not 32 bytes, or encodes an integer `≥ ℓ`.
   */
  static decode(bytes: Uint8Array): RistrettoScalar {
    checkBytes(bytes, 32, "RistrettoScalar.decode: bytes");
    let value: bigint;
    try {
      value = Fn.fromBytes(bytes.slice());
    } catch {
      throw new TypeError("RistrettoScalar.decode: bytes are not a canonical scalar");
    }
    return new RistrettoScalar(value);
  }

  /**
   * `n mod ℓ`, for `|n| < 2^251`.
   * @throws TypeError when `n` is not a `bigint`; RangeError when `|n| ≥ 2^251`.
   */
  static fromBigInt(n: bigint): RistrettoScalar {
    if (typeof n !== "bigint") {
      throw new TypeError("RistrettoScalar.fromBigInt: n must be a bigint");
    }
    if (n >= FROM_BIGINT_BOUND || n <= FROM_BIGINT_NEGATIVE_BOUND) {
      throw new RangeError("RistrettoScalar.fromBigInt: |n| must be below 2^251");
    }
    return new RistrettoScalar(Fn.create(n));
  }

  /**
   * 64 bytes, read little-endian, reduced mod `ℓ`.
   * @throws TypeError when `bytes` is not 64 bytes.
   */
  static fromUniformBytes(bytes: Uint8Array): RistrettoScalar {
    checkBytes(bytes, 64, "RistrettoScalar.fromUniformBytes: bytes");
    return new RistrettoScalar(Fn.create(bytesToNumberLE(bytes.slice())));
  }

  /** A uniformly random scalar: `fromUniformBytes` of 64 bytes from `crypto.getRandomValues`. */
  static random(): RistrettoScalar {
    return RistrettoScalar.fromUniformBytes(crypto.getRandomValues(new Uint8Array(64)));
  }

  /** The canonical encoding: 32 bytes, little-endian, in a new array. */
  encode(): Uint8Array {
    return Fn.toBytes(this.#value).slice();
  }

  /** Whether both are the same scalar, by a comparison of every byte. */
  equals(other: RistrettoScalar): boolean {
    const that = RistrettoScalar.#check(other, "equals: other");
    return equalBytes(Fn.toBytes(this.#value), Fn.toBytes(that.#value));
  }

  /** Whether this is 0. */
  isZero(): boolean {
    return Fn.is0(this.#value);
  }

  /** `this + other mod ℓ`. */
  add(other: RistrettoScalar): RistrettoScalar {
    return new RistrettoScalar(Fn.add(this.#value, scalarValue(other, "add: other")));
  }

  /** `this − other mod ℓ`. */
  subtract(other: RistrettoScalar): RistrettoScalar {
    return new RistrettoScalar(Fn.sub(this.#value, scalarValue(other, "subtract: other")));
  }

  /** `this · other mod ℓ`. */
  multiply(other: RistrettoScalar): RistrettoScalar {
    return new RistrettoScalar(Fn.mul(this.#value, scalarValue(other, "multiply: other")));
  }

  /** `−this mod ℓ`. */
  negate(): RistrettoScalar {
    return new RistrettoScalar(Fn.neg(this.#value));
  }

  /**
   * `this⁻¹ mod ℓ`, as `this^(ℓ − 2)`: the exponent is public, unlike the steps of an
   * extended Euclid.
   * @throws RangeError when this is 0.
   */
  invert(): RistrettoScalar {
    if (Fn.is0(this.#value)) {
      throw new RangeError("RistrettoScalar.invert: 0 has no inverse");
    }
    return new RistrettoScalar(Fn.pow(this.#value, L_MINUS_2));
  }
}

// --- For the tests, not for the entry point ---------------------------------

/**
 * A derived element is refused when it is `x·g` with `|x| ≤ 2^SMALL_EXPONENT_BITS`,
 * `g` the canonical generator of ristretto255. This covers the identity (`x = 0`),
 * `g` and `−g`.
 */
export const SMALL_EXPONENT_BITS = 16;

/** The two terms of an element derivation and their sum, as canonical encodings. */
export interface ElementDerivation {
  readonly p0: Uint8Array;
  readonly p1: Uint8Array;
  readonly h: Uint8Array;
}

/**
 * `RistrettoElement.deriveGenerator` with the element derivation as a parameter, so
 * that the tests can reach the refusal with an injected element. Exported for the
 * tests, not by the entry point.
 */
export async function deriveGeneratorWith(
  message: Uint8Array,
  derivation: (uniform: Uint8Array) => RistrettoElement,
): Promise<RistrettoElement> {
  if (!isBytes(message)) {
    throw new TypeError("deriveGenerator: message must be a Uint8Array");
  }
  const copy = message.slice();
  const dst = new TextEncoder().encode(RistrettoElement.GENERATOR_DST);
  const uniform = await expandMessageXmd(copy, dst, 64);
  const element = derivation(uniform);
  if (!(element instanceof RistrettoElement)) {
    throw new TypeError("deriveGenerator: the derivation must return a RistrettoElement");
  }
  if (findSmallExponent(element.encode(), SMALL_EXPONENT_BITS) !== null) {
    throw new RangeError(
      `deriveGenerator: the derived element is x·g with |x| ≤ 2^${String(SMALL_EXPONENT_BITS)}; choose another message`,
    );
  }
  return element;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function sha512(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-512", data));
}

/**
 * `expand_message_xmd` of RFC 9380, Section 5.3.1, with SHA-512 from WebCrypto. It
 * accepts an empty `dst`: the refusals of `hashToGroup` are its own. Exported for the
 * tests, not by the entry point.
 *
 * @param msg - any length.
 * @param dst - at most 255 bytes.
 * @param lenInBytes - at most 255 × 64 and at most 65535.
 * @returns a new array of `lenInBytes` bytes.
 * @throws TypeError, as a rejection, when `msg` or `dst` is not a `Uint8Array`.
 * @throws RangeError, as a rejection, on a parameter out of range.
 */
export async function expandMessageXmd(
  msg: Uint8Array,
  dst: Uint8Array,
  lenInBytes: number,
): Promise<Uint8Array> {
  if (!isBytes(msg) || !isBytes(dst)) {
    throw new TypeError("expandMessageXmd: msg and dst must be Uint8Arrays");
  }
  const ell = Math.ceil(lenInBytes / 64);
  if (!Number.isInteger(lenInBytes) || lenInBytes < 1 || lenInBytes > 65535 || ell > 255) {
    throw new RangeError("expandMessageXmd: lenInBytes must be an integer from 1 to 65535");
  }
  if (dst.length > 255) {
    throw new RangeError("expandMessageXmd: dst must be at most 255 bytes");
  }
  const dstPrime = concat(dst, Uint8Array.of(dst.length));
  const lenBytes = Uint8Array.of(lenInBytes >> 8, lenInBytes & 0xff);
  const b0 = await sha512(concat(new Uint8Array(128), msg, lenBytes, Uint8Array.of(0), dstPrime));
  const blocks = [await sha512(concat(b0, Uint8Array.of(1), dstPrime))];
  for (let i = 2; i <= ell; i++) {
    const previous = blocks[blocks.length - 1] ?? new Uint8Array(64);
    const mixed = b0.map((byte, k) => byte ^ (previous[k] ?? 0));
    blocks.push(await sha512(concat(mixed, Uint8Array.of(i), dstPrime)));
  }
  return concat(...blocks).slice(0, lenInBytes);
}

/**
 * The element derivation of RFC 9496, Section 4.3.4, on 64 bytes: `MAP` of each half,
 * and their sum. Exported for the tests, not by the entry point.
 *
 * @param uniform - exactly 64 bytes.
 * @returns the canonical encodings of the two terms and of their sum.
 * @throws RangeError when `uniform` is not 64 bytes.
 */
export function elementDerivation(uniform: Uint8Array): ElementDerivation {
  if (!isBytes(uniform) || uniform.length !== 64) {
    throw new RangeError("elementDerivation: uniform must be 64 bytes");
  }
  const { p0, p1, sum } = derive(uniform.slice());
  return { p0: p0.toBytes(), p1: p1.toBytes(), h: sum.toBytes() };
}

/**
 * Searches for a small discrete logarithm: the `x` with `|x| ≤ 2^bits` and
 * `encoding = x·g`, by baby-step giant-step. The search is exact: it never misses an
 * `x` in range. The counters are public, so they are plain numbers: with `bits ≤ 32`,
 * every one stays below `2^50`. Exported for the tests, not by the entry point.
 *
 * @param encoding - a canonical 32-byte ristretto255 encoding.
 * @param bits - the bound, from 0 to 32.
 * @returns `x`, or `null` when no `x` is in range.
 * @throws TypeError when `encoding` is not a valid encoding; RangeError when `bits` is
 *   out of range.
 */
export function findSmallExponent(encoding: Uint8Array, bits: number): bigint | null {
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
    throw new RangeError("findSmallExponent: bits must be an integer from 0 to 32");
  }
  let target: Point;
  try {
    target = ristretto255.Point.fromBytes(encoding);
  } catch {
    throw new TypeError("findSmallExponent: encoding is not a canonical ristretto255 encoding");
  }
  // x = i·m + j, with 0 ≤ j < m baby steps and −iMax ≤ i ≤ iMax giant steps.
  const bound = 2 ** bits;
  const m = 2 ** Math.ceil(bits / 2);
  const g = ristretto255.Point.BASE;
  const table = new Map<string, number>();
  let point = ristretto255.Point.ZERO;
  for (let j = 0; j < m; j++) {
    const key = hex(point.toBytes());
    if (!table.has(key)) table.set(key, j);
    point = point.add(g);
  }
  // point is now m·g.
  const iMax = Math.floor(bound / m) + 1;
  const step = point.negate();
  let current = target.add(point.multiply(BigInt(iMax)));
  for (let i = -iMax; i <= iMax; i++) {
    const j = table.get(hex(current.toBytes()));
    if (j !== undefined) {
      const x = i * m + j;
      if (Math.abs(x) <= bound) return BigInt(x);
    }
    current = current.add(step);
  }
  return null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
