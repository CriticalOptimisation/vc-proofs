/**
 * The API of the former src/core/generator.ts (#34), rebuilt on `RistrettoElement` (#35),
 * so that the tests of #34 still run unchanged against the code that replaced it. The
 * names, signatures and behaviour are those of #34; only `RistrettoElement` and the
 * internal functions of src/core/ristretto.ts do the work. The refusal of a small
 * multiple of `g` goes through `deriveGeneratorWith`, the seam of the shipped factory,
 * so the refusal under test is the shipped one.
 */
import { RistrettoElement } from "../../src/core/index.js";
import {
  SMALL_EXPONENT_BITS,
  deriveGeneratorWith,
  elementDerivation,
  expandMessageXmd,
  findSmallExponent,
} from "../../src/core/ristretto.js";

export { SMALL_EXPONENT_BITS, elementDerivation, expandMessageXmd, findSmallExponent };

/** The tag of every generator: `RistrettoElement.GENERATOR_DST`. */
export const GENERATOR_DST: string = RistrettoElement.GENERATOR_DST;

/** Every stage of one derivation, as published in the test vectors. */
export interface GeneratorSteps {
  readonly dst: Uint8Array;
  readonly uniform: Uint8Array;
  readonly p0: Uint8Array;
  readonly p1: Uint8Array;
  readonly h: Uint8Array;
}

/** The two terms of an element derivation and their sum, as canonical encodings. */
export interface ElementDerivation {
  readonly p0: Uint8Array;
  readonly p1: Uint8Array;
  readonly h: Uint8Array;
}

/** `deriveGenerator` of #34: the 32 bytes of `RistrettoElement.deriveGenerator(message)`. */
export async function deriveGenerator(message: Uint8Array): Promise<Uint8Array> {
  return (await RistrettoElement.deriveGenerator(message)).encode();
}

/** `deriveGeneratorSteps` of #34. */
export function deriveGeneratorSteps(message: Uint8Array): Promise<GeneratorSteps> {
  return deriveStepsWith(message, elementDerivation);
}

/** `verifyGenerator` of #34. */
export function verifyGenerator(message: Uint8Array, encoding: Uint8Array): Promise<boolean> {
  return verifyWith(message, encoding, elementDerivation);
}

/**
 * `deriveStepsWith` of #34: the derivation of `message`, with an injected element
 * derivation, through the seam of `RistrettoElement.deriveGenerator`.
 */
export async function deriveStepsWith(
  message: Uint8Array,
  derivation: (uniform: Uint8Array) => ElementDerivation,
): Promise<GeneratorSteps> {
  let stages: { uniform: Uint8Array; p0: Uint8Array; p1: Uint8Array } | undefined;
  const element = await deriveGeneratorWith(message, (uniform) => {
    const derived = derivation(uniform);
    stages = { uniform: uniform.slice(), p0: derived.p0.slice(), p1: derived.p1.slice() };
    return RistrettoElement.decode(derived.h);
  });
  if (stages === undefined) throw new Error("the element derivation was not called");
  const dst = new TextEncoder().encode(GENERATOR_DST);
  return { dst, ...stages, h: element.encode() };
}

/**
 * `verifyWith` of #34: the length first, a copy before the first `await`, and a
 * comparison that does not stop at the first difference.
 */
export async function verifyWith(
  message: Uint8Array,
  encoding: Uint8Array,
  derivation: (uniform: Uint8Array) => ElementDerivation,
): Promise<boolean> {
  if (!(message instanceof Uint8Array) || !(encoding instanceof Uint8Array)) {
    throw new TypeError("verifyGenerator: message and encoding must be Uint8Arrays");
  }
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

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #38    | new: the API of #34, rebuilt on RistrettoElement (#35)        |
