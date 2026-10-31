/**
 * The derivation of a Pedersen generator, such as `h`, with nothing up anyone's sleeve
 * (docs/generator-h.md): `hash_to_ristretto255` of RFC 9380, Appendix B, with
 * `expand_message_xmd` over SHA-512 and the domain separation tag `GENERATOR_DST`.
 *
 * - `expand_message_xmd` runs on WebCrypto (`crypto.subtle.digest("SHA-512")`), so the
 *   derivation is asynchronous.
 * - The field arithmetic, the addition and the encoding and decoding of ristretto255
 *   come from `@noble/curves`, since WebCrypto exposes no point arithmetic. `MAP`
 *   (RFC 9496, Section 4.3.4) is written here, over the field of `@noble/curves`,
 *   which does not export it; its sum is the library's element derivation.
 *
 * The message is the application's: this module fixes none.
 */
import { ed25519, ristretto255 } from "@noble/curves/ed25519.js";

/**
 * The domain separation tag of every generator that vc-proofs derives: 60 ASCII
 * bytes, in the form of RFC 9380, Section 8.10. They name the library, its version
 * (`V01`), its ciphersuite counter (`CS01`), and the identifier that RFC 9380,
 * Appendix B, gives to `hash_to_ristretto255` with `expand_message_xmd` over SHA-512.
 */
export const GENERATOR_DST = "vc-proofs-V01-CS01-with-ristretto255_XMD:SHA-512_R255MAP_RO_";

/**
 * A derived element is refused when it is `x·g` with `|x| ≤ 2^SMALL_EXPONENT_BITS`,
 * `g` the canonical generator of ristretto255. This covers the identity (`x = 0`),
 * `g` and `−g`.
 */
export const SMALL_EXPONENT_BITS = 16;

/** Every stage of one derivation, as published in the test vectors. */
export interface GeneratorSteps {
  /** The bytes of `GENERATOR_DST`. */
  readonly dst: Uint8Array;
  /** The 64 bytes returned by `expand_message_xmd(SHA-512, message, dst, 64)`. */
  readonly uniform: Uint8Array;
  /** The canonical 32-byte encoding of `MAP(uniform[0:32])`. */
  readonly p0: Uint8Array;
  /** The canonical 32-byte encoding of `MAP(uniform[32:64])`. */
  readonly p1: Uint8Array;
  /** The canonical 32-byte encoding of the derived element, `MAP(…) + MAP(…)`. */
  readonly h: Uint8Array;
}

/** The two terms of an element derivation and their sum, as canonical encodings. */
export interface ElementDerivation {
  readonly p0: Uint8Array;
  readonly p1: Uint8Array;
  readonly h: Uint8Array;
}

// --- The field and the constants of RFC 9496, Section 4.1 ------------------

/** The field of edwards25519, `p = 2^255 − 19`, from `@noble/curves`. */
const Fp = ristretto255.Point.Fp;
const P = Fp.ORDER;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
const SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;
const SQRT_AD_MINUS_ONE =
  25063068953384623474111414158702152701244531502492656460079210482610430750235n;
const ONE_MINUS_D_SQ =
  1159843021668779879193775521855586647937357759715417654439879720876111806838n;
const D_MINUS_ONE_SQ =
  40440834346308536858101042469323190826248399146238708352240133220865137265952n;
const MASK_255 = (1n << 255n) - 1n;

/** `IS_NEGATIVE` of RFC 9496, Section 4.1: the least significant bit, mod `p`. */
const isNegative = (e: bigint): boolean => (Fp.create(e) & 1n) === 1n;
const ctAbs = (e: bigint): bigint => (isNegative(e) ? Fp.neg(e) : e);

/** `SQRT_RATIO_M1(u, v)` of RFC 9496, Section 4.2. */
function sqrtRatioM1(u: bigint, v: bigint): { wasSquare: boolean; root: bigint } {
  const v3 = Fp.mul(Fp.sqr(v), v);
  const v7 = Fp.mul(Fp.sqr(v3), v);
  let r = Fp.mul(Fp.mul(u, v3), Fp.pow(Fp.mul(u, v7), (P - 5n) / 8n));
  const check = Fp.mul(v, Fp.sqr(r));
  const correctSignSqrt = Fp.eql(check, u);
  const flippedSignSqrt = Fp.eql(check, Fp.neg(u));
  const flippedSignSqrtI = Fp.eql(check, Fp.neg(Fp.mul(u, SQRT_M1)));
  if (flippedSignSqrt || flippedSignSqrtI) r = Fp.mul(r, SQRT_M1);
  return { wasSquare: correctSignSqrt || flippedSignSqrt, root: ctAbs(r) };
}

/** Reads 32 bytes as a little-endian integer. */
function littleEndian(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i] ?? 0);
  return n;
}

/** `MAP` of RFC 9496, Section 4.3.4, on 32 bytes: an element of ristretto255. */
function map(bytes: Uint8Array) {
  const t = Fp.create(littleEndian(bytes) & MASK_255);
  const r = Fp.mul(SQRT_M1, Fp.sqr(t));
  const u = Fp.mul(Fp.add(r, 1n), ONE_MINUS_D_SQ);
  const v = Fp.mul(Fp.sub(Fp.neg(1n), Fp.mul(r, D)), Fp.add(r, D));
  const { wasSquare, root } = sqrtRatioM1(u, v);
  const sPrime = Fp.neg(ctAbs(Fp.mul(root, t)));
  const s = wasSquare ? root : sPrime;
  const c = wasSquare ? Fp.neg(1n) : r;
  const n = Fp.sub(Fp.mul(Fp.mul(c, Fp.sub(r, 1n)), D_MINUS_ONE_SQ), v);
  const w0 = Fp.mul(Fp.add(s, s), v);
  const w1 = Fp.mul(n, SQRT_AD_MINUS_ONE);
  const w2 = Fp.sub(1n, Fp.sqr(s));
  const w3 = Fp.add(1n, Fp.sqr(s));
  const edwards = new ed25519.Point(Fp.mul(w0, w3), Fp.mul(w2, w1), Fp.mul(w1, w3), Fp.mul(w0, w2));
  return new ristretto255.Point(edwards);
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
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

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Derives a generator from a message: `hash_to_ristretto255(message, GENERATOR_DST)`.
 *
 * @param message - the application's message, any length, for example the ASCII
 *   bytes of `age-check.calcool.ai/pedersen/h/v1`.
 * @returns a new 32-byte array: the canonical encoding of the derived element.
 * @throws TypeError, as a rejection of the promise, when `message` is not a
 *   `Uint8Array`.
 * @throws RangeError, as a rejection of the promise, when the derived element is
 *   `x·g` with `|x| ≤ 2^SMALL_EXPONENT_BITS`. There is no retry: the application
 *   chooses another message.
 */
export async function deriveGenerator(message: Uint8Array): Promise<Uint8Array> {
  return (await deriveGeneratorSteps(message)).h;
}

/**
 * Derives a generator as `deriveGenerator` does, and returns every stage, so that the
 * published intermediate vectors can be reproduced.
 *
 * @param message - as for `deriveGenerator`.
 * @returns new arrays for each stage.
 * @throws as `deriveGenerator`.
 */
export function deriveGeneratorSteps(message: Uint8Array): Promise<GeneratorSteps> {
  return deriveStepsWith(message, elementDerivation);
}

/**
 * Checks that a published encoding is the generator derived from a message. Decoding
 * an encoding only shows that it is canonical; this recomputes the derivation and
 * compares the bytes in constant time.
 *
 * @param message - the message the encoding is said to come from.
 * @param encoding - the published 32-byte encoding. Both arrays are read at the call:
 *   a change to them while the promise runs does not affect the result.
 * @returns `true` when `encoding` equals `deriveGenerator(message)`; `false` on any
 *   difference, on an encoding that is not 32 bytes, or when the derivation is
 *   refused.
 * @throws TypeError, as a rejection of the promise, when `message` or `encoding` is
 *   not a `Uint8Array`.
 */
export function verifyGenerator(message: Uint8Array, encoding: Uint8Array): Promise<boolean> {
  return verifyWith(message, encoding, elementDerivation);
}

/**
 * `deriveGeneratorSteps` with the element derivation as a parameter, so that the tests
 * can reach the refusal with an injected element. Exported for the tests, not by the
 * entry point.
 */
export async function deriveStepsWith(
  message: Uint8Array,
  derivation: (uniform: Uint8Array) => ElementDerivation,
): Promise<GeneratorSteps> {
  if (!isBytes(message)) {
    throw new TypeError("deriveGenerator: message must be a Uint8Array");
  }
  const dst = new TextEncoder().encode(GENERATOR_DST);
  const uniform = await expandMessageXmd(message, dst, 64);
  const { p0, p1, h } = derivation(uniform);
  if (findSmallExponent(h, SMALL_EXPONENT_BITS) !== null) {
    throw new RangeError(
      `deriveGenerator: the derived element is x·g with |x| ≤ 2^${String(SMALL_EXPONENT_BITS)}; choose another message`,
    );
  }
  return { dst, uniform, p0, p1, h };
}

/**
 * `verifyGenerator` with the element derivation as a parameter, as `deriveStepsWith`.
 * Exported for the tests, not by the entry point.
 */
export async function verifyWith(
  message: Uint8Array,
  encoding: Uint8Array,
  derivation: (uniform: Uint8Array) => ElementDerivation,
): Promise<boolean> {
  if (!isBytes(message) || !isBytes(encoding)) {
    throw new TypeError("verifyGenerator: message and encoding must be Uint8Arrays");
  }
  // The length first: copying an encoding of any length would cost time and memory
  // that grow with it. Then a copy before the first await: a caller may change its
  // array while the promise runs.
  if (encoding.length !== 32) return false;
  const expected = encoding.slice();
  let h: Uint8Array;
  try {
    h = (await deriveStepsWith(message, derivation)).h;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= (h[i] ?? 0) ^ (expected[i] ?? 0);
  return difference === 0;
}

/**
 * `expand_message_xmd` of RFC 9380, Section 5.3.1, with SHA-512 from WebCrypto.
 * Exported for the tests, not by the entry point.
 *
 * @param msg - any length.
 * @param dst - at most 255 bytes.
 * @param lenInBytes - at most 255 × 64 and at most 65535.
 * @returns a new array of `lenInBytes` bytes.
 * @throws RangeError, as a rejection of the promise, on a parameter out of range.
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
  const p0 = map(uniform.subarray(0, 32));
  const p1 = map(uniform.subarray(32, 64));
  return { p0: p0.toBytes(), p1: p1.toBytes(), h: p0.add(p1).toBytes() };
}

/**
 * Searches for a small discrete logarithm: the `x` with `|x| ≤ 2^bits` and
 * `encoding = x·g`, by baby-step giant-step. The search is exact: it never misses an
 * `x` in range. Exported for the tests, not by the entry point.
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
  let target;
  try {
    target = ristretto255.Point.fromBytes(encoding);
  } catch {
    throw new TypeError("findSmallExponent: encoding is not a canonical ristretto255 encoding");
  }
  // x = i·m + j, with 0 ≤ j < m baby steps and −iMax ≤ i ≤ iMax giant steps.
  const bound = 2n ** BigInt(bits);
  const m = 2n ** BigInt(Math.ceil(bits / 2));
  const g = ristretto255.Point.BASE;
  const table = new Map<string, bigint>();
  let point = ristretto255.Point.ZERO;
  for (let j = 0n; j < m; j++) {
    const key = hex(point.toBytes());
    if (!table.has(key)) table.set(key, j);
    point = point.add(g);
  }
  // point is now m·g.
  const iMax = bound / m + 1n;
  const step = point.negate();
  let current = target.add(point.multiply(iMax));
  for (let i = -iMax; i <= iMax; i++) {
    const j = table.get(hex(current.toBytes()));
    if (j !== undefined) {
      const x = i * m + j;
      if (x <= bound && -x <= bound) return x;
    }
    current = current.add(step);
  }
  return null;
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #37    | new: the derivation of a generator (#34)                      |
