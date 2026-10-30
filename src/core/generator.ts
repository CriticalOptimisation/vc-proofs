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

/** The stubs of Task 4: each takes its arguments, so that none is unused. */
function notImplemented(name: string, ...args: unknown[]): Error {
  return new Error(`${name}: not implemented (#34, Task 5), ${String(args.length)} arguments`);
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
export function deriveGenerator(message: Uint8Array): Promise<Uint8Array> {
  return Promise.reject(notImplemented("deriveGenerator", message));
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
  return Promise.reject(notImplemented("deriveGeneratorSteps", message));
}

/**
 * Checks that a published encoding is the generator derived from a message. Decoding
 * an encoding only shows that it is canonical; this recomputes the derivation and
 * compares the bytes in constant time.
 *
 * @param message - the message the encoding is said to come from.
 * @param encoding - the published 32-byte encoding.
 * @returns `true` when `encoding` equals `deriveGenerator(message)`; `false` on any
 *   difference, on an encoding that is not 32 bytes, or when the derivation is
 *   refused.
 * @throws TypeError, as a rejection of the promise, when `message` or `encoding` is
 *   not a `Uint8Array`.
 */
export function verifyGenerator(message: Uint8Array, encoding: Uint8Array): Promise<boolean> {
  return Promise.reject(notImplemented("verifyGenerator", message, encoding));
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
export function expandMessageXmd(
  msg: Uint8Array,
  dst: Uint8Array,
  lenInBytes: number,
): Promise<Uint8Array> {
  return Promise.reject(notImplemented("expandMessageXmd", msg, dst, lenInBytes));
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
  throw notImplemented("elementDerivation", uniform);
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
  throw notImplemented("findSmallExponent", encoding, bits);
}

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #34    | new: the derivation of a generator, stubs (Task 4)            |
