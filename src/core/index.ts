/**
 * The low-level entry point, `@criticaloptimisation/vc-proofs/core`: the primitives.
 * Each one computes or checks one value and returns plain data, never a signed object.
 * The high-level entry point (`src/index.ts`) is built on them and reaches them only
 * through this file.
 *
 * Code under `src/core/` imports nothing outside `src/core/`, except the pinned
 * `@noble/curves` for the point arithmetic of ristretto255 (docs/generator-h.md).
 */
export { requestHash } from "./request-hash.js";
export {
  GENERATOR_DST,
  deriveGenerator,
  deriveGeneratorSteps,
  verifyGenerator,
  type GeneratorSteps,
} from "./generator.js";

// --- Change History -------------------------------------------------------
// | PR     | Summary                                                       |
// |--------|---------------------------------------------------------------|
// | #32    | low-level entry point; export requestHash (#29)               |
// | #37    | export the derivation of a generator (#34)                    |
